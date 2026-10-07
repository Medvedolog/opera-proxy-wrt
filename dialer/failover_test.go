package dialer

import (
	"context"
	"errors"
	"io"
	"net"
	"sync/atomic"
	"testing"
	"time"
)

type stubConn struct{}

func (stubConn) Read([]byte) (int, error)         { return 0, io.EOF }
func (stubConn) Write(b []byte) (int, error)      { return len(b), nil }
func (stubConn) Close() error                     { return nil }
func (stubConn) LocalAddr() net.Addr              { return nil }
func (stubConn) RemoteAddr() net.Addr             { return nil }
func (stubConn) SetDeadline(time.Time) error       { return nil }
func (stubConn) SetReadDeadline(time.Time) error   { return nil }
func (stubConn) SetWriteDeadline(time.Time) error  { return nil }

type mockDialer struct {
	name  string
	fail  bool
	calls int32
}

func (m *mockDialer) DialContext(_ context.Context, _, _ string) (net.Conn, error) {
	atomic.AddInt32(&m.calls, 1)
	if m.fail {
		return nil, errors.New(m.name + " down")
	}
	return stubConn{}, nil
}

func (m *mockDialer) Dial(network, address string) (net.Conn, error) {
	return m.DialContext(context.Background(), network, address)
}

func TestFailoverDialerRotatesAndSticks(t *testing.T) {
	bad := &mockDialer{name: "bad", fail: true}
	good := &mockDialer{name: "good"}
	fo := NewFailoverDialer([]ContextDialer{bad, good})

	c, err := fo.DialContext(context.Background(), "tcp", "x:443")
	if err != nil {
		t.Fatalf("expected failover to succeed, got %v", err)
	}
	c.Close()
	if got := atomic.LoadInt32(&bad.calls); got != 1 {
		t.Fatalf("bad dialer calls = %d, want 1", got)
	}
	if got := atomic.LoadInt32(&good.calls); got != 1 {
		t.Fatalf("good dialer calls = %d, want 1", got)
	}

	c2, err := fo.DialContext(context.Background(), "tcp", "x:443")
	if err != nil {
		t.Fatalf("second dial: %v", err)
	}
	c2.Close()
	if got := atomic.LoadInt32(&bad.calls); got != 1 {
		t.Fatalf("expected to stick to good; bad called again (%d)", got)
	}
	if got := atomic.LoadInt32(&good.calls); got != 2 {
		t.Fatalf("good dialer calls = %d, want 2", got)
	}
}

func TestFailoverDialerAllFailedTriggersRefresh(t *testing.T) {
	bad1 := &mockDialer{name: "b1", fail: true}
	bad2 := &mockDialer{name: "b2", fail: true}
	good := &mockDialer{name: "good"}
	fo := NewFailoverDialer([]ContextDialer{bad1, bad2})

	done := make(chan struct{}, 1)
	fo.SetOnAllFailed(func() {
		fo.Set([]ContextDialer{good})
		done <- struct{}{}
	})

	if _, err := fo.DialContext(context.Background(), "tcp", "x:443"); err == nil {
		t.Fatal("expected error when all endpoints fail")
	}
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("onAllFailed was not invoked")
	}

	c, err := fo.DialContext(context.Background(), "tcp", "x:443")
	if err != nil {
		t.Fatalf("dial after refresh: %v", err)
	}
	c.Close()
}

func TestFailoverDialerEmpty(t *testing.T) {
	fo := NewFailoverDialer(nil)
	if _, err := fo.DialContext(context.Background(), "tcp", "x:443"); err == nil {
		t.Fatal("expected error with no endpoints")
	}
	fo.Set(nil)
	if fo.Len() != 0 {
		t.Fatalf("Len = %d after empty Set, want 0", fo.Len())
	}
	fo.Set([]ContextDialer{&mockDialer{name: "g"}})
	if _, err := fo.DialContext(context.Background(), "tcp", "x:443"); err != nil {
		t.Fatalf("dial after Set: %v", err)
	}
}
