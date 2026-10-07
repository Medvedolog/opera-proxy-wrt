package dialer

import (
	"context"
	"errors"
	"net"
	"sync"
	"time"
)

const failoverRefreshCooldown = 30 * time.Second

type FailoverDialer struct {
	mu          sync.Mutex
	dialers     []ContextDialer
	idx         int
	gen         uint64
	onAllFailed func()
	refreshing  bool
	lastRefresh time.Time
}

func NewFailoverDialer(dialers []ContextDialer) *FailoverDialer {
	return &FailoverDialer{dialers: dialers}
}

func (f *FailoverDialer) Set(dialers []ContextDialer) {
	if len(dialers) == 0 {
		return
	}
	f.mu.Lock()
	f.dialers = dialers
	f.idx = 0
	f.gen++
	f.mu.Unlock()
}

func (f *FailoverDialer) SetOnAllFailed(fn func()) {
	f.mu.Lock()
	f.onAllFailed = fn
	f.mu.Unlock()
}

func (f *FailoverDialer) Len() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.dialers)
}

func (f *FailoverDialer) Dial(network, address string) (net.Conn, error) {
	return f.DialContext(context.Background(), network, address)
}

func (f *FailoverDialer) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	f.mu.Lock()
	dialers := append([]ContextDialer(nil), f.dialers...)
	start := f.idx
	gen := f.gen
	f.mu.Unlock()

	if len(dialers) == 0 {
		return nil, errors.New("no upstream endpoints available")
	}

	var lastErr error
	for i := 0; i < len(dialers); i++ {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		j := (start + i) % len(dialers)
		conn, err := dialers[j].DialContext(ctx, network, address)
		if err == nil {
			if j != start {
				f.mu.Lock()
				if f.gen == gen {
					f.idx = j
				}
				f.mu.Unlock()
			}
			return conn, nil
		}
		lastErr = err
	}

	f.triggerRefresh()
	return nil, lastErr
}

func (f *FailoverDialer) triggerRefresh() {
	f.mu.Lock()
	now := time.Now()
	if f.onAllFailed == nil || f.refreshing ||
		(!f.lastRefresh.IsZero() && now.Sub(f.lastRefresh) < failoverRefreshCooldown) {
		f.mu.Unlock()
		return
	}
	fn := f.onAllFailed
	f.refreshing = true
	f.lastRefresh = now
	f.mu.Unlock()

	go func() {
		defer func() {
			f.mu.Lock()
			f.refreshing = false
			f.mu.Unlock()
		}()
		fn()
	}()
}
