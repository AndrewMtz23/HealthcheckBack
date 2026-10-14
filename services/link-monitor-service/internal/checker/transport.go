package checker

import (
	"context"
	"net"
	"net/http"
	"time"
)

type Options struct {
	Timeout time.Duration
	Lookup  func(context.Context, string) ([]net.IPAddr, error)
	Dial    func(context.Context, string, string) (net.Conn, error)
}

func safeTransport(opts Options) *http.Transport {
	lookup := opts.Lookup
	if lookup == nil {
		lookup = net.DefaultResolver.LookupIPAddr
	}
	dial := opts.Dial
	if dial == nil {
		dial = (&net.Dialer{Timeout: 10 * time.Second}).DialContext
	}
	return &http.Transport{Proxy: nil, DisableKeepAlives: true, DisableCompression: true, MaxResponseHeaderBytes: 64 * 1024, TLSHandshakeTimeout: 10 * time.Second,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, e := net.SplitHostPort(address)
			if e != nil {
				return nil, errUnsafe
			}
			ips, e := lookup(ctx, host)
			if e != nil {
				return nil, e
			}
			if len(ips) == 0 {
				return nil, errUnsafe
			}
			for _, ip := range ips {
				if !isPublic(ip.IP) {
					return nil, errUnsafe
				}
			}
			return dial(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		}}
}
