-- Candidate migration for the system announcement center. Apply only through the reviewed DB migration process.
CREATE TABLE IF NOT EXISTS system_announcements (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  kind TEXT NOT NULL CHECK (kind IN ('informativo','advertencia','mantenimiento')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','withdrawn','expired')),
  publish_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  maintenance_start_at TIMESTAMPTZ,
  maintenance_end_at TIMESTAMPTZ,
  created_by INTEGER NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  audience_count INTEGER NOT NULL DEFAULT 0 CHECK (audience_count >= 0),
  CHECK (expires_at IS NULL OR publish_at IS NULL OR expires_at > publish_at),
  CHECK ((maintenance_start_at IS NULL) = (maintenance_end_at IS NULL)),
  CHECK (maintenance_end_at IS NULL OR maintenance_end_at > maintenance_start_at),
  CHECK (kind = 'mantenimiento' OR maintenance_start_at IS NULL)
);
CREATE INDEX IF NOT EXISTS system_announcements_active_idx ON system_announcements(status,publish_at,expires_at);

CREATE TABLE IF NOT EXISTS system_announcement_audience (
  announcement_id BIGINT NOT NULL REFERENCES system_announcements(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  email_eligible BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (announcement_id,usuario_id)
);
CREATE INDEX IF NOT EXISTS system_announcement_audience_user_idx ON system_announcement_audience(usuario_id,announcement_id);

CREATE TABLE IF NOT EXISTS system_announcement_reads (
  announcement_id BIGINT NOT NULL REFERENCES system_announcements(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id,usuario_id)
);
CREATE INDEX IF NOT EXISTS system_announcement_reads_user_idx ON system_announcement_reads(usuario_id,read_at DESC);

CREATE TABLE IF NOT EXISTS system_announcement_emails (
  announcement_id BIGINT NOT NULL REFERENCES system_announcements(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','retry','sending','sent','failed','uncertain','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  error_code VARCHAR(80),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id,usuario_id)
);
CREATE INDEX IF NOT EXISTS system_announcement_emails_queue_idx ON system_announcement_emails(state,available_at);

CREATE TABLE IF NOT EXISTS system_announcement_email_totals (
  announcement_id BIGINT NOT NULL REFERENCES system_announcements(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('queued','retry','sending','sent','failed','uncertain','cancelled')),
  total BIGINT NOT NULL DEFAULT 0 CHECK (total >= 0),
  PRIMARY KEY (announcement_id,state)
);

CREATE OR REPLACE FUNCTION track_system_announcement_email_totals() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO system_announcement_email_totals(announcement_id,state,total) VALUES(NEW.announcement_id,NEW.state,1)
      ON CONFLICT(announcement_id,state) DO UPDATE SET total=system_announcement_email_totals.total+1;
    RETURN NEW;
  ELSIF TG_OP='UPDATE' AND OLD.state<>NEW.state THEN
    UPDATE system_announcement_email_totals SET total=GREATEST(0,total-1) WHERE announcement_id=OLD.announcement_id AND state=OLD.state;
    INSERT INTO system_announcement_email_totals(announcement_id,state,total) VALUES(NEW.announcement_id,NEW.state,1)
      ON CONFLICT(announcement_id,state) DO UPDATE SET total=system_announcement_email_totals.total+1;
    RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM system_announcements WHERE id=OLD.announcement_id AND published_at<=now()-interval '12 months') THEN
      UPDATE system_announcement_email_totals SET total=GREATEST(0,total-1) WHERE announcement_id=OLD.announcement_id AND state=OLD.state;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS system_announcement_email_totals_trigger ON system_announcement_emails;
CREATE TRIGGER system_announcement_email_totals_trigger AFTER INSERT OR UPDATE OR DELETE ON system_announcement_emails
FOR EACH ROW EXECUTE FUNCTION track_system_announcement_email_totals();
