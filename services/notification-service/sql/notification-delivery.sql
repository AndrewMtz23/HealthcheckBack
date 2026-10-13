-- Candidate only. Apply exclusively to an isolated database until backup and
-- production rollout are explicitly approved. Startup never runs this file.
BEGIN;
CREATE TABLE notification_delivery_cursors (
 usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 frequency TEXT NOT NULL CHECK(frequency IN ('inmediata','diaria','semanal')),
 last_slot TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(usuario_id,frequency)
);
CREATE TABLE notification_deliveries (
 id BIGSERIAL PRIMARY KEY,
 usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 frequency TEXT NOT NULL CHECK(frequency IN ('inmediata','diaria','semanal')),
 slot TIMESTAMPTZ NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','retry','sending','sent','failed','cancelled','uncertain')),
 attempts INT NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 available_at TIMESTAMPTZ NOT NULL,
 error_code TEXT,
 sent_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(usuario_id,frequency,slot)
);
CREATE TABLE notification_delivery_items (
 id BIGSERIAL PRIMARY KEY,
 delivery_id BIGINT NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
 usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 noticia_id INT NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
 notification_id INT REFERENCES notificaciones(id) ON DELETE SET NULL,
 excluded BOOLEAN NOT NULL DEFAULT false,
 UNIQUE(usuario_id,noticia_id),
 UNIQUE(notification_id)
);
CREATE INDEX notification_deliveries_due ON notification_deliveries(available_at,id) WHERE state IN ('pending','retry');
COMMIT;
