package config

import "testing"

func TestConfiguration(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("LINK_MONITOR_INTERNAL_TOKEN", "test-token")
	t.Setenv("LINK_MONITOR_CONCURRENCY", "")
	t.Setenv("LINK_MONITOR_TIMEOUT_SECONDS", "")
	c, e := Load()
	if e != nil || c.Port != 3005 || c.Concurrency != 5 || c.TimeoutSeconds != 15 {
		t.Fatalf("%+v %v", c, e)
	}
	t.Setenv("LINK_MONITOR_CONCURRENCY", "0")
	if _, e = Load(); e == nil {
		t.Fatal("zero concurrency accepted")
	}
	t.Setenv("LINK_MONITOR_CONCURRENCY", "5")
	t.Setenv("HEALTHCHECK_DIAGNOSTIC", "1")
	c, e = Load()
	if e != nil || !c.Diagnostic {
		t.Fatal("diagnostic not respected")
	}
}
