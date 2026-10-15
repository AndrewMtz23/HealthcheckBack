package checker

import (
	"context"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestNormalize(t *testing.T) {
	got, err := Normalize("HTTPS://Example.COM:443/a?q=1#part")
	if err != nil || got != "https://example.com/a?q=1" {
		t.Fatalf("%q %v", got, err)
	}
	for _, raw := range []string{"file:///a", "http://a:9000", "http://u:p@a", "http://a/%zz", "javascript:alert(1)"} {
		if _, err := Normalize(raw); err == nil {
			t.Errorf("accepted %s", raw)
		}
	}
}

func TestPublicAddresses(t *testing.T) {
	for _, s := range []string{"127.0.0.1", "::1", "::ffff:127.0.0.1", "10.1.2.3", "172.16.1.2", "192.168.1.1", "169.254.169.254", "100.64.1.1", "224.0.0.1", "0.0.0.0", "192.0.2.1", "2001:db8::1", "fc00::1", "fe80::1"} {
		if isPublic(net.ParseIP(s)) {
			t.Errorf("unsafe IP %s", s)
		}
	}
	if !isPublic(net.ParseIP("8.8.8.8")) {
		t.Fatal("public IP rejected")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestHTTPClassification(t *testing.T) {
	for code, want := range map[int]string{200: "available", 204: "available", 404: "not_found", 410: "not_found", 401: "restricted", 403: "restricted", 429: "rate_limited", 500: "site_error", 301: "uncheckable", 418: "uncheckable"} {
		c := New(Options{})
		c.transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: code, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("body")), Request: r}, nil
		})
		got := c.Check(context.Background(), "https://example.com/a")
		if got.Status != want {
			t.Errorf("%d: got %s want %s", code, got.Status, want)
		}
	}
}

func TestRejectMixedDNSBeforeDial(t *testing.T) {
	calls := 0
	c := New(Options{Lookup: func(context.Context, string) ([]net.IPAddr, error) {
		return []net.IPAddr{{IP: net.ParseIP("8.8.8.8")}, {IP: net.ParseIP("127.0.0.1")}}, nil
	}, Dial: func(context.Context, string, string) (net.Conn, error) { calls++; return nil, io.EOF }})
	got := c.Check(context.Background(), "http://example.com")
	if got.Status != "uncheckable" || calls != 0 {
		t.Fatalf("%+v dials=%d", got, calls)
	}
}

func TestPinnedDNS(t *testing.T) {
	lookups := 0
	address := ""
	c := New(Options{Lookup: func(context.Context, string) ([]net.IPAddr, error) {
		lookups++
		return []net.IPAddr{{IP: net.ParseIP("8.8.8.8")}}, nil
	}, Dial: func(_ context.Context, _ string, a string) (net.Conn, error) { address = a; return nil, io.EOF }})
	c.Check(context.Background(), "http://example.com")
	if lookups != 1 || address != "8.8.8.8:80" {
		t.Fatalf("lookup=%d address=%s", lookups, address)
	}
}

func TestRedirectFailureAndLimit(t *testing.T) {
	c := New(Options{})
	c.transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		code := 302
		h := make(http.Header)
		h.Set("Location", "/missing")
		if r.URL.Path == "/missing" {
			code = 404
		}
		return &http.Response{StatusCode: code, Header: h, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})
	got := c.Check(context.Background(), "http://example.com/start")
	if got.Status != "not_found" || got.RedirectCount != 1 || got.FinalURL != "http://example.com/missing" {
		t.Fatalf("%+v", got)
	}
	c.transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{r.URL.String() + "x"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})
	got = c.Check(context.Background(), "http://example.com/a")
	if got.Status != "uncheckable" || got.RedirectCount != 5 {
		t.Fatalf("%+v", got)
	}
}

func TestTimeout(t *testing.T) {
	c := New(Options{Timeout: 10 * time.Millisecond, Lookup: func(ctx context.Context, _ string) ([]net.IPAddr, error) { <-ctx.Done(); return nil, ctx.Err() }})
	got := c.Check(context.Background(), "https://example.com")
	if got.Status != "connection_failed" || got.ErrorCode != "TIMEOUT" {
		t.Fatalf("%+v", got)
	}
}

type countingBody struct {
	read   int
	closed bool
}

func (b *countingBody) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 'x'
	}
	b.read += len(p)
	return len(p), nil
}
func (b *countingBody) Close() error { b.closed = true; return nil }
func TestBodyIsBoundedAndClosed(t *testing.T) {
	body := &countingBody{}
	c := New(Options{})
	c.transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: body, Header: make(http.Header), Request: r}, nil
	})
	result := c.Check(context.Background(), "http://example.com")
	if result.Status != "available" || body.read != 65536 || !body.closed {
		t.Fatalf("%+v read=%d closed=%v", result, body.read, body.closed)
	}
}

func TestRedirectToPrivateNeverDialsPrivateAddress(t *testing.T) {
	// A public-origin response redirects to a private address; only the first
	// connection is made. The dialer is the sole injected network boundary.
	var dials int
	c := New(Options{Lookup: func(_ context.Context, host string) ([]net.IPAddr, error) {
		if ip := net.ParseIP(host); ip != nil {
			return []net.IPAddr{{IP: ip}}, nil
		}
		return []net.IPAddr{{IP: net.ParseIP("8.8.8.8")}}, nil
	}, Dial: func(_ context.Context, _ string, _ string) (net.Conn, error) {
		dials++
		client, server := net.Pipe()
		go func() {
			defer server.Close()
			buf := make([]byte, 4096)
			server.Read(buf)
			io.WriteString(server, "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/private\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
		}()
		return client, nil
	}})
	result := c.Check(context.Background(), "http://public.example")
	if dials != 1 || result.Status != "uncheckable" || result.ErrorCode != "UNSAFE_DESTINATION" {
		t.Fatalf("%+v dials=%d", result, dials)
	}
}
