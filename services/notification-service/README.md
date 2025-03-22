# Servicio de Notificaciones HealthCheck

Este servicio gestiona las notificaciones para la plataforma HealthCheck, permitiendo a los usuarios recibir alertas sobre noticias falsas relacionadas con temas de salud que les interesan.

## Características

- ✅ Envío de notificaciones por email y SMS
- ✅ Preferencias de notificación personalizables por usuario
- ✅ Suscripción a temas de interés específicos
- ✅ Notificaciones automáticas sobre noticias falsas detectadas
- ✅ Agrupación inteligente de notificaciones por email

## Arquitectura

El proyecto sigue una arquitectura modular y utiliza el patrón de diseño Factory Method para implementar diferentes tipos de notificaciones:

- **Config**: Configuración de componentes externos (base de datos, email, SMS)
- **Controllers**: Manejo de peticiones HTTP y respuestas
- **Models**: Interacción con la base de datos
- **Services**: Lógica de negocio
- **Routes**: Definición de endpoints de la API
- **Utils**: Utilidades compartidas

### Patrón Factory Method

El servicio implementa el patrón Factory Method para manejar diferentes tipos de notificaciones:

1. **NotificationInterface**: Define la interfaz que deben implementar todos los notificadores
2. **EmailNotifier/SMSNotifier**: Implementaciones concretas para cada tipo de notificación
3. **NotificationFactory**: Fábrica que crea el notificador adecuado según el tipo solicitado

Este patrón proporciona flexibilidad para añadir nuevos tipos de notificación en el futuro (como notificaciones push) sin modificar el código existente.

## Requisitos

- Node.js 14+
- PostgreSQL 12+
- Cuenta de correo en Hostinger (o otro proveedor SMTP)
- Cuenta de Twilio para SMS

## Instalación

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/your-organization/healthcheck-notification-service.git
   cd healthcheck-notification-service
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Configurar variables de entorno en un archivo `.env`:
   ```
   # Configuración del servidor
   PORT=3001

   # Configuración de la base de datos
   DB_USER=postgres
   DB_HOST=localhost
   DB_NAME=healthcheck
   DB_PASSWORD=postgres
   DB_PORT=5432

   # Configuración de correo electrónico corporativo
   EMAIL_HOST=smtp.hostinger.com
   EMAIL_PORT=465
   EMAIL_USER=notifications@healthcheck.news
   EMAIL_PASS=your_password
   EMAIL_SECURE=true

   # Configuración de Twilio
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=your_phone_number
   ```

4. Iniciar el servicio:
   ```bash
   npm run dev   # Modo desarrollo
   npm start     # Modo producción
   ```

## API Endpoints

### Notificaciones

- **POST /api/notifications/send**
  - Envía una notificación a un usuario
  - Body: `{ usuario_id, noticia_id, titulo, mensaje }`

- **GET /api/notifications/:userId**
  - Obtiene las notificaciones de un usuario
  - Query params: `limit`, `page`

- **POST /api/notifications/check**
  - Ejecuta manualmente la verificación de notificaciones (para pruebas)

### Preferencias

- **GET /api/preferences/:userId**
  - Obtiene las preferencias de notificación de un usuario

- **PUT /api/preferences/:userId**
  - Actualiza las preferencias generales de un usuario
  - Body: `{ recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion }`

- **POST /api/preferences/:userId/topics**
  - Añade un tema de interés para un usuario
  - Body: `{ tema_id }`

- **DELETE /api/preferences/:userId/topics/:topicId**
  - Elimina un tema de interés de un usuario

- **GET /api/preferences/topics/all**
  - Obtiene todos los temas disponibles

## Extensión para Nuevos Tipos de Notificación

Para añadir un nuevo tipo de notificación (ejemplo: notificaciones push):

1. Crear una nueva clase que implemente `NotificationInterface`:
   ```javascript
   // src/services/notification/push.notifier.js
   const NotificationInterface = require('./notification.interface');

   class PushNotifier extends NotificationInterface {
     async send(recipient, content) {
       // Implementación para enviar notificación push
     }

     async sendBulk(notifications) {
       // Implementación para enviar múltiples notificaciones push
     }
   }

   module.exports = PushNotifier;
   ```

2. Modificar la fábrica para soportar el nuevo tipo:
   ```javascript
   // src/services/notification/notification.factory.js
   // Añadir esta línea:
   const PushNotifier = require('./push.notifier');

   // Y modificar el método createNotifier:
   createNotifier(type) {
     switch (type.toLowerCase()) {
       case 'email':
         return new EmailNotifier();
       case 'sms':
         return new SMSNotifier();
       case 'push':
         return new PushNotifier();
       default:
         return new EmailNotifier();
     }
   }
   ```

3. Actualizar el esquema de la base de datos para soportar el nuevo tipo.

## Contacto

Para cualquier consulta o problema, contactar a:
- Email: notifications@healthcheck.news