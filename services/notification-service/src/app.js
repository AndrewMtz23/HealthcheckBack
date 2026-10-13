require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const { emailConfig } = require('./config');
const routes = require('./routes');
const schedulerService = require('./services/scheduler.service');
const logger = require('./utils/logger');

// Inicializar la aplicación Express
const app = express();
const diagnostic = process.env.HEALTHCHECK_DIAGNOSTIC === '1';
// Explicit allowlist: GET preferences can create records in the legacy controller.
if (diagnostic) app.use((req, res, next) => {
  const read = req.path === '/' || req.path === '/api/notifications/preferences/topics/all' ||
    /^\/api\/notifications\/notifications\/\d+$/.test(req.path);
  if (!['GET', 'HEAD'].includes(req.method) || !read) {
    return res.status(503).json({ error: 'Operation disabled in diagnostic mode' });
  }
  next();
});

// Configurar CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Permitir origen de tu frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// SMTP is never contacted just to start the HTTP service.

// Registrar rutas
app.use('/api', routes);

// Endpoint de estado
app.get('/', (req, res) => {
  res.json({status:'ok',delivery:schedulerService.status});
});

// Iniciar el servidor
const PORT = process.env.PORT || 3004;
app.listen(PORT, async () => {
  if (diagnostic) { logger.info(`Service listening on ${PORT}; diagnostic mode disables jobs and delivery`); return; }
  logger.info(`Servicio iniciado en puerto ${PORT}`);
  
  // Ejecutar inmediatamente al iniciar el servicio
  logger.info('Ejecutando verificación inicial de notificaciones...');
  try {
    await schedulerService.runOnce();
    logger.info('Verificación inicial completada');
  } catch (error) {
    logger.error('Error en verificación inicial:', error);
  }
});

// Scheduled in-app announcements continue while SMTP is disabled; delivery remains opt-in.
if (!diagnostic) schedulerService.startScheduler();

module.exports = app;
