package handler

import (
    "fmt"
    "io"
    "log"
    "net"
    "sync"
)

// WrapSocksListener records the peer and the opening protocol byte when a
// client sends something other than the SOCKS5 greeting. Read bytes are not
// consumed or changed: the SOCKS5 library still handles protocol validation.
func WrapSocksListener(ln net.Listener, logger *log.Logger) net.Listener {
    return &socksDiagnosticListener{Listener: ln, logger: logger}
}

type socksDiagnosticListener struct {
    net.Listener
    logger *log.Logger
}
func (l *socksDiagnosticListener) Accept() (net.Conn, error) {
    c, err := l.Listener.Accept()
    if err != nil { return nil, err }
    return &socksDiagnosticConn{Conn: c, logger: l.logger}, nil
}

type socksDiagnosticConn struct {
    net.Conn
    once sync.Once
    logger *log.Logger
}
func (c *socksDiagnosticConn) Read(b []byte) (int, error) {
    n, err := c.Conn.Read(b)
    if n > 0 {
        c.once.Do(func() {
            if b[0] != 0x05 && c.logger != nil {
                c.logger.Printf("unsupported SOCKS version: peer=%s first_byte=0x%02x (%s)", c.RemoteAddr(), b[0], identifyProtocol(b[:n]))
            }
        })
    }
    return n, err
}
func identifyProtocol(b []byte) string {
    if len(b) == 0 { return "unknown" }
    switch b[0] {
    case 0x04: return "SOCKS4"
    case 0x16: return "possible TLS handshake"
    }
    if len(b) >= 3 && string(b[:3]) == "GET" { return "HTTP GET" }
    if len(b) >= 4 && string(b[:4]) == "POST" { return "HTTP POST" }
    if len(b) >= 4 && string(b[:4]) == "HEAD" { return "HTTP HEAD" }
    if len(b) >= 7 && string(b[:7]) == "CONNECT" { return "HTTP CONNECT" }
    return fmt.Sprintf("non-SOCKS5 byte 0x%02x", b[0])
}

var _ io.Reader = (*socksDiagnosticConn)(nil)
