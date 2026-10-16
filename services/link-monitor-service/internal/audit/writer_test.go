package audit

import (
	"testing"
	"time"
)

func TestRunEventsStableAndCorrelated(t *testing.T) {
	actor := int64(1)
	at := time.Date(2026, 10, 16, 10, 0, 0, 0, time.UTC)
	start := RunEvent("12345678-1234-4234-8234-123456789012", &actor, at, "started", 2, "")
	end := RunEvent("12345678-1234-4234-8234-123456789012", &actor, at, "failure", 1, "WORKER_INTERRUPTED")
	retry := RunEvent("12345678-1234-4234-8234-123456789012", &actor, at, "failure", 1, "WORKER_INTERRUPTED")
	if start["request_id"] != end["request_id"] || start["event_key"] == end["event_key"] || retry["event_key"] != end["event_key"] {
		t.Fatal("unstable run identity")
	}
	if end["outcome"] != "failure" || end["user_id"] != actor {
		t.Fatal("incorrect outcome or actor")
	}
}
