# Servicio de Notificaciones - HealthCheck

Este servicio es parte del proyecto HealthCheck y se encarga de gestionar las notificaciones para los usuarios sobre noticias falsas y desinformación en temas de salud.

## Funcionalidades

- Gestión de preferencias de notificación por usuario y tema
- Envío de notificaciones por email y SMS
- Verificación periódica de noticias falsas según preferencias de usuarios
- Generación automática de notificaciones para alertar sobre desinformación

## Requisitos previos

- Node.js (v14 o superior)
- PostgreSQL (v12 o superior)
- Una cuenta de Gmail (para enviar correos)
- Una cuenta de Twilio (para enviar SMS)

## Configuración

1. Crea una copia del archivo `.env.example` como `.env`
2. Actualiza las variables de entorno con tus configuraciones:
   - Variables de la base de datos
   - Credenciales de correo electrónico
   - Credenciales de Twilio

## Instalación

```bash
# Instalar dependencias
npm install

# Iniciar en modo desarrollo
npm run dev

# Iniciar en modo producción
npm start
```

## Endpoints API

### Preferencias de notificación

- `GET /api/preferences/:userId` - Obtener preferencias del usuario
- `PUT /api/preferences/:userId` - Actualizar preferencias del usuario

### Notificaciones

- `GET /api/notifications/:userId` - Obtener notificaciones del usuario
- `POST /api/send` - Enviar una notificación
- `PUT /api/notifications/:notificationId/read` - Marcar notificación como leída

## Tareas programadas

El servicio ejecuta una verificación automática cada 15 minutos para:

1. Enviar notificaciones pendientes
2. Buscar noticias falsas recientes sobre temas de interés de los usuarios
3. Generar notificaciones automáticas sobre desinformación

## Estructura de la base de datos

El servicio interactúa con las siguientes tablas:

- `usuarios`: Información de los usuarios (email, teléfono)
- `preferencias_usuario`: Preferencias de notificación por usuario y tema
- `temas`: Categorías temáticas para las noticias
- `noticias`: Artículos analizados por el sistema
- `clasificacion_noticias`: Resultados de clasificación de noticias
- `notificaciones`: Registro de notificaciones enviadas