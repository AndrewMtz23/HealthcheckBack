package config

import (
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/url"
	"os"
	"strconv"
	"strings"
)

func DatabaseConfig(concurrency int) (*pgxpool.Config, error) {
	values := url.Values{}
	for key, param := range map[string]string{"DB_HOST": "host", "DB_PORT": "port", "DB_NAME": "dbname", "DB_USER": "user", "DB_PASSWORD": "password"} {
		if value, ok := os.LookupEnv(key); ok {
			values.Set(param, value)
		}
	}
	if port := values.Get("port"); port != "" {
		n, e := strconv.ParseUint(port, 10, 16)
		if e != nil || n == 0 {
			return nil, fmt.Errorf("invalid DB_PORT")
		}
	}
	// Parsing after applying overrides binds TLS SNI and all fallback targets to the same host.
	cfg, e := pgxpool.ParseConfig("postgres:///?" + strings.ReplaceAll(values.Encode(), "+", "%20"))
	if e != nil {
		return nil, e
	}
	cfg.MaxConns = int32(concurrency + 4)
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "10000"
	return cfg, nil
}
