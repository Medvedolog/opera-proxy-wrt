package handler

import (
    "bytes"
    "log"
    "net"
    "strings"
    "testing"
)

func TestIdentifyProtocol(t *testing.T) {
    cases := []struct{ data []byte; want string }{
        {[]byte{0x04,0x01}, "SOCKS4"},
        {[]byte("GET / HTTP/1.1"), "HTTP GET"},
        {[]byte("POST /api"), "HTTP POST"},
        {[]byte("CONNECT example.com:443"), "HTTP CONNECT"},
        {[]byte{0x16,0x03,0x01}, "possible TLS handshake"},
    }
    for _, tc := range cases {
        if got := identifyProtocol(tc.data); got != tc.want {
            t.Errorf("identifyProtocol(%v) = %q, want %q",tc.data,got,tc.want)
        }
    }
}

func TestSocksDiagnosticConnDoesNotConsumeGreeting(t *testing.T) {
    client, peer := net.Pipe()
    defer client.Close()
    defer peer.Close()
    var output bytes.Buffer
    conn := &socksDiagnosticConn{Conn:peer,logger:log.New(&output,"",0)}
    done := make(chan []byte,1)
    go func() {
        b:=make([]byte,16)
        n,_:=conn.Read(b)
        done<-b[:n]
    }()
    _,_ = client.Write([]byte("GET / HTTP/1.1"))
    got := <-done
    if string(got)!="GET / HTTP/1.1" { t.Fatalf("lost greeting: %q",got) }
    if !strings.Contains(output.String(),"first_byte=0x47") { t.Fatalf("missing offending byte: %s",output.String()) }
    if !strings.Contains(output.String(),"HTTP GET") { t.Fatalf("missing protocol hint: %s",output.String()) }
}
