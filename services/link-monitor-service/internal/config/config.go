package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Port, Concurrency, TimeoutSeconds int
	Token                             string
	Diagnostic                        bool
	Host                              string
}

func Load() (Config, error) {
	c := Config{Token: os.Getenv("LINK_MONITOR_INTERNAL_TOKEN"), Diagnostic: os.Getenv("HEALTHCHECK_DIAGNOSTIC") == "1", Host: "127.0.0.1"}
	if host := os.Getenv("LINK_MONITOR_HOST"); host != "" {
		c.Host = host
	}
	for _, v := range []struct {
		name          string
		fallback, max int
		target        *int
	}{{"PORT", 3005, 65535, &c.Port}, {"LINK_MONITOR_CONCURRENCY", 5, 32, &c.Concurrency}, {"LINK_MONITOR_TIMEOUT_SECONDS", 15, 60, &c.TimeoutSeconds}} {
		*v.target = v.fallback
		if raw := os.Getenv(v.name); raw != "" {
			n, e := strconv.Atoi(raw)
			if e != nil || n < 1 || n > v.max {
				return c, fmt.Errorf("invalid %s", v.name)
			}
			*v.target = n
		}
	}
	return c, nil
}
