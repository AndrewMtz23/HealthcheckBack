package checker

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"time"
)

type CheckResult struct {
	Status        string    `json:"status"`
	HTTPStatus    *int      `json:"http_status"`
	FinalURL      string    `json:"final_url"`
	RedirectCount int       `json:"redirect_count"`
	CheckedAt     time.Time `json:"checked_at"`
	DurationMS    int64     `json:"duration_ms"`
	ErrorCode     string    `json:"error_code,omitempty"`
}
type Checker struct {
	transport http.RoundTripper
	timeout   time.Duration
	gate      *hostGate
}

func New(opts Options) *Checker {
	if opts.Timeout <= 0 {
		opts.Timeout = 15 * time.Second
	}
	return &Checker{transport: safeTransport(opts), timeout: opts.Timeout, gate: newHostGate(time.Second)}
}
func (c *Checker) Check(parent context.Context, raw string) (out CheckResult) {
	start := time.Now()
	out.Status = "uncheckable"
	defer func() { out.CheckedAt = time.Now().UTC(); out.DurationMS = time.Since(start).Milliseconds() }()
	current, e := Normalize(raw)
	if e != nil {
		out.ErrorCode = "INVALID_URL"
		return
	}
	ctx, cancel := context.WithTimeout(parent, c.timeout)
	defer cancel()
	seen := map[string]bool{}
	for {
		out.FinalURL = current
		if seen[current] {
			out.ErrorCode = "REDIRECT_LOOP"
			return
		}
		seen[current] = true
		req, e := http.NewRequestWithContext(ctx, http.MethodGet, current, nil)
		if e != nil {
			out.ErrorCode = "INVALID_URL"
			return
		}
		req.Header.Set("User-Agent", "HealthCheck-LinkMonitor/1.0")
		release, gateErr := c.gate.acquire(ctx, req.URL.Hostname())
		if gateErr != nil {
			out.Status = "connection_failed"
			out.ErrorCode = "TIMEOUT"
			return
		}
		resp, e := c.transport.RoundTrip(req)
		if e != nil {
			release()
			out.Status = "connection_failed"
			out.ErrorCode = "CONNECTION_FAILED"
			if errors.Is(e, errUnsafe) {
				out.Status = "uncheckable"
				out.ErrorCode = "UNSAFE_DESTINATION"
			} else if ctx.Err() != nil {
				out.ErrorCode = "TIMEOUT"
			}
			return
		}
		code := resp.StatusCode
		out.HTTPStatus = &code
		_, readErr := io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))
		resp.Body.Close()
		release()
		if readErr != nil {
			out.Status = "connection_failed"
			out.ErrorCode = "READ_FAILED"
			if ctx.Err() != nil {
				out.ErrorCode = "TIMEOUT"
			}
			return
		}
		if code == 301 || code == 302 || code == 303 || code == 307 || code == 308 {
			if out.RedirectCount >= 5 {
				out.ErrorCode = "REDIRECT_LIMIT"
				return
			}
			location := resp.Header.Get("Location")
			if location == "" {
				out.ErrorCode = "INVALID_REDIRECT"
				return
			}
			base, _ := url.Parse(current)
			next, e := base.Parse(location)
			if e != nil {
				out.ErrorCode = "INVALID_REDIRECT"
				return
			}
			current, e = Normalize(next.String())
			if e != nil {
				out.ErrorCode = "UNSAFE_DESTINATION"
				return
			}
			out.RedirectCount++
			continue
		}
		switch {
		case code >= 200 && code < 300:
			out.Status = "available"
		case code == 404 || code == 410:
			out.Status = "not_found"
		case code == 401 || code == 403:
			out.Status = "restricted"
		case code == 429:
			out.Status = "rate_limited"
		case code >= 500 && code < 600:
			out.Status = "site_error"
		default:
			out.ErrorCode = "HTTP_OTHER"
		}
		return
	}
}
