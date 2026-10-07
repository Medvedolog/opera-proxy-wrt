package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Alexey71/opera-proxy/dialer"
	clog "github.com/Alexey71/opera-proxy/log"
	se "github.com/Alexey71/opera-proxy/seclient"
)

// Community-maintained public proxy lists used only as an automatic fallback
// when direct SurfEasy API access is unavailable. No vendor/device gate is used.
var builtinAPIProxyListURLs = []string{
	"https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
	"https://raw.githubusercontent.com/proxyscrape/free-proxy-list/main/proxies/protocols/https/data.txt",
	"https://raw.githubusercontent.com/proxyscrape/free-proxy-list/main/proxies/protocols/http/data.txt",
	"https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/http_elite.txt",
	"https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/http.txt",
	"https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=json&protocol=http&anonymity=elite&ssl=yes&timeout=2000",
}

type flexJSONString string

func (f *flexJSONString) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if len(b) == 0 || bytes.Equal(b, []byte("null")) {
		*f = ""
		return nil
	}
	if b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		*f = flexJSONString(s)
		return nil
	}
	*f = flexJSONString(string(b))
	return nil
}

type jsonProxyEntry struct {
	Proxy     string         `json:"proxy"`
	IP        string         `json:"ip"`
	Host      string         `json:"host"`
	Port      flexJSONString `json:"port"`
	Protocol  string         `json:"protocol"`
	Protocols []string       `json:"protocols"`
}

func (e jsonProxyEntry) proxyString() string {
	if s := strings.TrimSpace(e.Proxy); s != "" {
		return s
	}
	host := strings.TrimSpace(e.IP)
	if host == "" {
		host = strings.TrimSpace(e.Host)
	}
	port := strings.TrimSpace(string(e.Port))
	if host == "" || port == "" {
		return ""
	}
	proto := strings.TrimSpace(e.Protocol)
	if proto == "" && len(e.Protocols) > 0 {
		proto = strings.TrimSpace(e.Protocols[0])
	}
	if proto != "" {
		return proto + "://" + net.JoinHostPort(host, port)
	}
	return net.JoinHostPort(host, port)
}

func extractProxiesFromJSON(data []byte) ([]string, error) {
	data = bytes.TrimSpace(data)
	if len(data) == 0 {
		return nil, errors.New("empty JSON proxy list")
	}
	var arr []json.RawMessage
	if data[0] == '[' {
		if err := json.Unmarshal(data, &arr); err != nil {
			return nil, err
		}
	} else {
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(data, &obj); err != nil {
			return nil, err
		}
		for _, key := range []string{"proxies", "data", "result", "results", "list", "items"} {
			if v, ok := obj[key]; ok && json.Unmarshal(v, &arr) == nil {
				break
			}
			arr = nil
		}
		if arr == nil {
			return nil, errors.New("no proxy array field found in JSON object")
		}
	}

	out := make([]string, 0, len(arr))
	for _, el := range arr {
		var s string
		if json.Unmarshal(el, &s) == nil {
			out = append(out, s)
			continue
		}
		var entry jsonProxyEntry
		if json.Unmarshal(el, &entry) == nil {
			if p := entry.proxyString(); p != "" {
				out = append(out, p)
			}
		}
	}
	return out, nil
}

func normalizeProxyCandidates(entries []string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(entries))
	for _, raw := range entries {
		for _, token := range strings.Fields(stripComment(raw)) {
			p, err := normalizeAPIProxy(token)
			if err != nil || p == "" {
				continue
			}
			if _, ok := seen[p]; ok {
				continue
			}
			seen[p] = struct{}{}
			out = append(out, p)
		}
	}
	return out
}

func loadBuiltinProxyURL(rawURL string, transport http.RoundTripper, timeout time.Duration) ([]string, error) {
	client := &http.Client{Transport: transport, Timeout: timeout}
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "opera-proxy community-fallback/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected HTTP status %s", resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	trimmed := bytes.TrimSpace(body)
	var raw []string
	if len(trimmed) > 0 && (trimmed[0] == '[' || trimmed[0] == '{') {
		raw, err = extractProxiesFromJSON(trimmed)
		if err != nil {
			return nil, err
		}
	} else {
		raw = strings.Split(string(body), "\n")
	}
	out := normalizeProxyCandidates(raw)
	if len(out) == 0 {
		return nil, errors.New("proxy list contained no usable entries")
	}
	return out, nil
}

func loadBuiltinAPIProxyCandidates(baseDialer dialer.ContextDialer, caPool *x509.CertPool, timeout time.Duration, maxCandidates int, logger *clog.CondLogger) []string {
	transport := buildSETransport(baseDialer.DialContext, nil)
	transport.TLSClientConfig = &tls.Config{RootCAs: caPool}
	defer transport.CloseIdleConnections()

	type result struct {
		list []string
		err  error
	}
	results := make([]result, len(builtinAPIProxyListURLs))
	var wg sync.WaitGroup
	for i, u := range builtinAPIProxyListURLs {
		wg.Add(1)
		go func(i int, u string) {
			defer wg.Done()
			list, err := loadBuiltinProxyURL(u, transport, timeout)
			results[i] = result{list: list, err: err}
		}(i, u)
	}
	wg.Wait()

	seen := make(map[string]struct{})
	all := make([]string, 0)
	for i, r := range results {
		if r.err != nil {
			logger.Warning("Community proxy list %q failed: %v", builtinAPIProxyListURLs[i], r.err)
			continue
		}
		added := 0
		for _, p := range r.list {
			if _, ok := seen[p]; ok {
				continue
			}
			seen[p] = struct{}{}
			all = append(all, p)
			added++
		}
		logger.Info("Community proxy list %q yielded %d proxies (%d new).", builtinAPIProxyListURLs[i], len(r.list), added)
	}
	if maxCandidates > 0 && len(all) > maxCandidates {
		all = all[:maxCandidates]
	}
	return all
}

func selectBuiltinAPIProxyCandidate(parent context.Context, args *CLIArgs, baseDialer dialer.ContextDialer, caPool *x509.CertPool, logger *clog.CondLogger, needDiscover bool) (apiProxyCandidateResult, error) {
	candidates := loadBuiltinAPIProxyCandidates(baseDialer, caPool, args.timeout, args.apiProxyMax, logger)
	if len(candidates) == 0 {
		return apiProxyCandidateResult{}, errors.New("community proxy sources yielded no candidates")
	}
	logger.Info("Testing %d community API proxy candidates (up to %d in parallel).", len(candidates), args.apiProxyParallel)
	return selectAPIProxyCandidate(parent, args, baseDialer, caPool, logger, candidates, needDiscover, false)
}

type endpointCandidateResult struct {
	apiProxyCandidateResult
	dialer dialer.ContextDialer
}

func selectBuiltinAPIProxyWithEndpoint(
	parent context.Context,
	args *CLIArgs,
	baseDialer dialer.ContextDialer,
	caPool *x509.CertPool,
	logger *clog.CondLogger,
	selectEndpoint func(context.Context, *se.SEClient, []se.SEIPEntry) (dialer.ContextDialer, error),
) (endpointCandidateResult, error) {
	candidates := loadBuiltinAPIProxyCandidates(baseDialer, caPool, args.timeout, args.apiProxyMax, logger)
	if len(candidates) == 0 {
		return endpointCandidateResult{}, errors.New("community proxy sources yielded no candidates")
	}

	parallelism := args.apiProxyParallel
	if parallelism < 1 {
		parallelism = 1
	}
	if parallelism > len(candidates) {
		parallelism = len(candidates)
	}

	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	jobs := make(chan string)
	results := make(chan endpointCandidateResult, len(candidates))
	var wg sync.WaitGroup

	worker := func() {
		defer wg.Done()
		for candidate := range jobs {
			if ctx.Err() != nil {
				return
			}
			base := testAPIProxyCandidate(ctx, args, baseDialer, caPool, candidate, true, false)
			r := endpointCandidateResult{apiProxyCandidateResult: base}
			if base.err == nil {
				r.dialer, r.err = selectEndpoint(ctx, base.client, base.ips)
			}
			select {
			case results <- r:
			case <-ctx.Done():
				return
			}
		}
	}
	wg.Add(parallelism)
	for i := 0; i < parallelism; i++ {
		go worker()
	}
	go func() {
		defer close(jobs)
		for _, c := range candidates {
			select {
			case jobs <- c:
			case <-ctx.Done():
				return
			}
		}
	}()

	var lastErr error
	for i := 0; i < len(candidates); i++ {
		r := <-results
		if r.err == nil && r.client != nil && r.dialer != nil {
			cancel()
			wg.Wait()
			logger.Info("Community proxy %s produced reachable Opera endpoints.", r.candidate)
			return r, nil
		}
		if r.err != nil {
			lastErr = r.err
		}
	}
	cancel()
	wg.Wait()
	if lastErr == nil {
		lastErr = errors.New("no community proxy produced a reachable Opera endpoint")
	}
	return endpointCandidateResult{}, lastErr
}

func filterRoutableEndpoints(entries []se.SEIPEntry, logger *clog.CondLogger) []se.SEIPEntry {
	out := make([]se.SEIPEntry, 0, len(entries))
	for _, e := range entries {
		ip, err := net.ParseIP(strings.TrimSpace(e.IP)), error(nil)
		_ = err
		if ip == nil || ip.IsLoopback() || ip.IsUnspecified() || ip.IsMulticast() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			if logger != nil {
				logger.Warning("Ignoring non-routable discovered endpoint %q.", e.IP)
			}
			continue
		}
		out = append(out, e)
	}
	return out
}
