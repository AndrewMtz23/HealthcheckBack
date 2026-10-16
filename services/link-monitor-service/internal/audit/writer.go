package audit

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5"
	"os"
	"time"
)

type Event map[string]any

func RunEvent(id string, actor *int64, at time.Time, outcome string, count int, code string) Event {
	hash := sha256.Sum256([]byte("healthcheck-audit-link-monitor:" + id + ":" + outcome))
	hash[6] = (hash[6] & 0x0f) | 0x50
	hash[8] = (hash[8] & 0x3f) | 0x80
	key := fmt.Sprintf("%x-%x-%x-%x-%x", hash[0:4], hash[4:6], hash[6:8], hash[8:10], hash[10:16])
	var user, role any
	kind := "system"
	if actor != nil {
		user = *actor
		role = "admin"
		kind = "user"
	}
	metadata := map[string]any{"count": count}
	if code != "" {
		metadata["reason_code"] = code
	}
	return Event{"event_key": key, "occurred_at": at.UTC().Format(time.RFC3339Nano), "request_id": id, "user_id": user, "actor_type": kind, "actor_role": role, "action": "LINK_MONITOR_RUN", "entity": "link_monitor", "entity_id": id, "service": "link-monitor", "outcome": outcome, "description": "Revisión de enlaces", "ip_address": nil, "user_agent": nil, "metadata": metadata, "origin": "live", "source_reference": "link_monitor_runs:" + id + ":" + outcome}
}

func WriteAudit(ctx context.Context, tx pgx.Tx, event Event) (string, error) {
	if os.Getenv("AUDIT_ENABLED") != "true" {
		return "", nil
	}
	data, err := json.Marshal(event)
	if err != nil {
		return "", err
	}
	var id string
	err = tx.QueryRow(ctx, "SELECT record_system_log($1::jsonb)::text", string(data)).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("AUDIT_WRITE_FAILED")
	}
	return id, nil
}
