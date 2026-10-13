# Servicio de notificaciones HealthCheck

Actualizado: 2026-10-07.

Worker de correo electrónico y endpoint de salud `GET /` en puerto 3004. Twilio y la entrega SMS fueron retirados. No se necesitan sus credenciales.

Las rutas heredadas `/api/notifications/*` devuelven 410: ya no permiten consultar cuentas arbitrarias, borrar registros ni iniciar entregas. El perfil y el dashboard usan `/api/auth/profile/preferences`, `/topics` y `/notifications`, con autenticación y comprobación de propietario en Auth. En diagnóstico, algunas rutas retiradas son bloqueadas antes con 503.

## Ejecución local

Usar el launcher protegido de la raíz del proyecto. `HEALTHCHECK_DIAGNOSTIC=1` desactiva SMTP, envíos y scheduler. No arrancar el worker en modo normal para hacer pruebas: el arranque normal ejecuta trabajos y puede enviar correo si existe configuración SMTP válida.

## Preferencias e históricos

- Nuevas preferencias: únicamente `email`; SMS devuelve 400 en Auth.
- Registros SMS históricos se conservan en PostgreSQL y se muestran como canal retirado.
- El worker excluye pendientes SMS y usuarios sin una suscripción activa de correo. No convierte SMS a correo.
- Una preferencia SMS antigua requiere una nueva elección explícita del usuario para suscribirse por correo.
- Mantiene `pg` y SQL existentes. Sin Prisma ni cambios de esquema.

## Comprobación

Desde HealthcheckBack: `node --test tests/retired-notifications.test.cjs tests/diagnostic-safety.test.cjs`. Las pruebas bloquean proveedores externos; no certifican entrega real de correo. El detalle de integración y límites está en `../Docs/User/verificacion.md` desde la raíz del backend (documentación local, no publicada).


## Avisos operativos del sitio

El Auth API expone la administracion en `/api/auth/admin/announcements` y la bandeja autenticada en `/api/auth/inbox`. Las tablas candidatas estan en `sql/system-announcements.sql`; el arranque no las ejecuta. Primero aplicalas en una base aislada, verifica publicacion, programacion, lectura y restauracion, y documenta el destino antes de cualquier migracion compartida.

El worker registra la audiencia al publicar y crea entregas por cuenta con correo guardado. Consulta el correo vigente y el estado activo inmediatamente antes de cada envio. SMTP continua opt-in con `NOTIFICATION_DELIVERY_ENABLED=false`; con el flag apagado, el worker puede publicar avisos programados y mantener la bandeja, pero no abre conexiones SMTP. Para activar envios reales configura y autoriza explicitamente el entorno SMTP y la audiencia antes de cambiar el flag.

Los resultados de correo se muestran como contadores y no exponen direcciones. La aceptacion SMTP no confirma entrega en bandeja ni lectura. La vista de cada cuenta se conserva hasta 90 dias despues del vencimiento; los registros individuales de correo se purgan tras 12 meses y sus totales agregados permanecen.
