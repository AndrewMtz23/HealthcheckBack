const express = require('express');
const router = express.Router();
const notificationRoutes = require('./notification.routes');
const preferenceRoutes = require('./preference.routes');

// Configurar rutas
router.use('/notifications/notifications', notificationRoutes);
router.use('/notifications/preferences', preferenceRoutes);

module.exports = router;