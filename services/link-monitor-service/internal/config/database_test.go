package config

import "testing"

func TestDatabaseHostAndTLSUseApplicationSettings(t *testing.T) {
	t.Setenv("PGHOST", "unrelated.example")
	t.Setenv("PGSSLMODE", "require")
	t.Setenv("DB_HOST", "db.example.com")
	t.Setenv("DB_PORT", "5548")
	t.Setenv("DB_NAME", "monitor")
	t.Setenv("DB_USER", "monitor")
	t.Setenv("DB_PASSWORD", "special ' password\\")
	cfg, e := DatabaseConfig(5)
	if e != nil {
		t.Fatal(e)
	}
	if cfg.ConnConfig.Host != "db.example.com" || cfg.ConnConfig.Port != 5548 || cfg.ConnConfig.TLSConfig.ServerName != "db.example.com" || cfg.ConnConfig.Password != "special ' password\\" {
		t.Fatalf("host=%s port=%d tlsHost=%s passwordMatch=%v", cfg.ConnConfig.Host, cfg.ConnConfig.Port, cfg.ConnConfig.TLSConfig.ServerName, cfg.ConnConfig.Password == "special ' password\\")
	}
	t.Setenv("PGSSLMODE", "prefer")
	cfg, e = DatabaseConfig(5)
	if e != nil || len(cfg.ConnConfig.Fallbacks) == 0 {
		t.Fatal("expected TLS/plaintext fallback for prefer", e)
	}
	for _, fallback := range cfg.ConnConfig.Fallbacks {
		if fallback.Host != "db.example.com" || fallback.Port != 5548 {
			t.Fatal("fallback bypasses configured target")
		}
	}
	t.Setenv("DB_PORT", "-1")
	if _, e = DatabaseConfig(5); e == nil {
		t.Fatal("invalid port accepted")
	}
}
