package log

import (
    "io"
    "log/syslog"
    "os"
    "strings"
)

// SyslogDestination dispatches logs to /dev/log using per-line severity.
// The fallback is stderr when syslog is unavailable (desktop CLI).
type SyslogDestination struct {
    sink *syslog.Writer
    fallback io.Writer
}
func NewSyslogDestination() io.Writer {
    s, err := syslog.New(syslog.LOG_INFO|syslog.LOG_DAEMON, "opera-proxy")
    if err != nil { return os.Stderr }
    return &SyslogDestination{sink:s, fallback:os.Stderr}
}
func (s *SyslogDestination) Write(p []byte) (int,error) {
    line := strings.TrimSpace(string(p))
    if line == "" { return len(p),nil }
    var err error
    switch {
    case strings.Contains(line, "CRITICAL "):
        err=s.sink.Crit(line)
    case strings.Contains(line, "ERROR    "), strings.Contains(line, "SOCKS   :") && strings.Contains(line, "[E]"), strings.Contains(line, "unsupported SOCKS version"):
        err=s.sink.Err(line)
    case strings.Contains(line, "WARNING  "):
        err=s.sink.Warning(line)
    case strings.Contains(line, "DEBUG    "):
        err=s.sink.Debug(line)
    default:
        err=s.sink.Info(line)
    }
    if err != nil { _,_ = s.fallback.Write(p) }
    return len(p),nil
}
