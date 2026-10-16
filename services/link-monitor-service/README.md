# Link Monitor — Go

Microservicio de comprobación manual de las URLs originales de noticias. News autoriza al administrador y solicita el trabajo; Go guarda progreso y resultados en PostgreSQL. Puerto local predeterminado: `3005`.

## Integración

```text
Frontend /admin/link-monitor
  → News :3003/api/admin/link-monitor/* (sesión de administrador activo)
    → Go :3005/internal/link-monitor/* (token interno)
      → PostgreSQL y URLs públicas
```

News comprueba la sesión con Auth. El navegador no llama a Go ni recibe el token interno. Las noticias sin URL se omiten; las repetidas comparten comprobación. Los resultados no modifican publicación, clasificación ni confiabilidad.

## Configuración

Requiere Go 1.25 o posterior y PostgreSQL. Copiar `.env.example` a `.env` y configurar DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD para la base de aplicación. El launcher Node carga `.env`; el binario por sí solo lee variables de entorno.

En News:

```dotenv
LINK_MONITOR_URL=http://127.0.0.1:3005
LINK_MONITOR_INTERNAL_TOKEN=replace-with-a-private-random-token
```

En Go usar el mismo `LINK_MONITOR_INTERNAL_TOKEN`, `LINK_MONITOR_HOST=127.0.0.1` y `PORT=3005`. Nunca utilizar el token de ejemplo ni compartirlo como NEXT_PUBLIC_*. La conexión PostgreSQL admite las opciones PGSSLMODE del driver; configurar TLS según el despliegue.

Aplicar `sql/001_link_monitor.sql` explícitamente a una base confirmada y respaldada, incluida una instalación nueva creada con el `db.sql` del backend. La migración crea tres tablas; no se ejecuta al arrancar y no es un script de reinicialización.

## Ejecución

Desde esta carpeta:

```powershell
go mod download
go build -o bin/link-monitor.exe ./cmd/link-monitor
node ../../scripts/link-monitor-run.cjs
```

En Windows, el BAT raíz del espacio de trabajo también lo compila e inicia junto con los otros seis procesos. `iniciar-healthcheck.bat --preview` muestra las conexiones y `--check` comprueba requisitos sin arrancar.

El BAT inicia en modo local con un token privado compartido persistido en `.env.local-runtime`; permite revisiones manuales. La opción `--diagnostic` usa token sintético local y conexión de solo lectura. `HEALTHCHECK_DIAGNOSTIC=1` permite consultas, pero bloquea nuevas ejecuciones y no recupera trabajos mediante escrituras. Para revisiones reales, News y Go requieren el esquema instalado. No hay cron ni revisión automática al arrancar.

## API y recuperación

| Endpoint interno | Operación |
| --- | --- |
| `GET /health` | 200 listo; 503 si falta token, esquema o conexión |
| `POST /internal/link-monitor/runs` | `{ "requested_by": 1 }`; 202 nuevo, 200 si ya existe uno activo |
| `GET /internal/link-monitor/runs/current` | Ejecución activa o última, o null |
| `GET /internal/link-monitor/results` | `page`, `limit` (máximo 100), `status` |

Los endpoints internos requieren `Authorization: Bearer <token>`. El cliente público usa las rutas equivalentes en News, que obtiene el actor de la sesión; nunca debe enviar URLs arbitrarias al monitor.

Concurrencia predeterminada de cinco, una consulta por host, intervalo mínimo de un segundo, timeout total de 15 segundos, máximo cinco redirecciones y lectura de 64 KiB. Se bloquean destinos privados y locales, también tras DNS y redirecciones. Los bloqueos de acceso o timeouts no prueban que un artículo haya sido eliminado.

Solo una ejecución puede estar activa. Al reiniciar después de una interrupción, el trabajo anterior se marca interrupted y se conservan los resultados completos; otra revisión requiere acción manual. Una URL cambiada no recibe el resultado vigente de una URL distinta.

## Pruebas

```powershell
go test ./...
go vet ./...
```

Las pruebas PostgreSQL requieren `LINK_MONITOR_TEST_DSN` hacia el cluster sintético validado; sin esa variable se omiten. `go test -race ./...` requiere compilador C en Windows. Desde la raíz del backend, `node --test tests/link-monitor-process-integration.cjs` comprueba el ciclo real del binario usando el cluster sintético en 5548; nunca debe apuntar a la base de aplicación.
