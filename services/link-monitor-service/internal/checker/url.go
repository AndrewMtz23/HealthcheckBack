package checker

import (
	"errors"
	"net"
	"net/netip"
	"net/url"
	"strings"
)

var errUnsafe = errors.New("UNSAFE_DESTINATION")

func Normalize(raw string) (string, error) {
	u, e := url.Parse(strings.TrimSpace(raw))
	if e != nil {
		return "", errUnsafe
	}
	u.Scheme = strings.ToLower(u.Scheme)
	if (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || u.Opaque != "" {
		return "", errUnsafe
	}
	port := u.Port()
	if port != "" && port != "80" && port != "443" {
		return "", errUnsafe
	}
	host := strings.ToLower(u.Hostname())
	if strings.Contains(host, "%") {
		return "", errUnsafe
	}
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	if (u.Scheme == "http" && port == "80") || (u.Scheme == "https" && port == "443") {
		port = ""
	}
	u.Host = host
	if port != "" {
		u.Host += ":" + port
	}
	u.Fragment = ""
	u.RawFragment = ""
	if u.Path == "" {
		u.Path = "/"
	}
	return u.String(), nil
}

// Conservative exclusion of non-public/special-purpose address ranges.
var denied = func() []netip.Prefix {
	var out []netip.Prefix
	for _, s := range []string{"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "::/96", "64:ff9b::/96", "64:ff9b:1::/48", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20", "fc00::/7", "fe80::/10", "ff00::/8"} {
		out = append(out, netip.MustParsePrefix(s))
	}
	return out
}()

func isPublic(ip net.IP) bool {
	a, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	a = a.Unmap()
	if !a.IsGlobalUnicast() || a.IsPrivate() || a.IsLoopback() || a.IsLinkLocalUnicast() {
		return false
	}
	// Only currently assigned global IPv6 unicast space is eligible.
	if a.Is6() && !netip.MustParsePrefix("2000::/3").Contains(a) {
		return false
	}
	for _, p := range denied {
		if p.Contains(a) {
			return false
		}
	}
	return true
}
