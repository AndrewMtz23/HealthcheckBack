const express = require('express');
const router = express.Router();
const notificationRoutes = require('./notification.routes');
const preferenceRoutes = require('./preference.routes');

// Configurar rutas
router.use('/notifications', notificationRoutes);
router.use('/preferences', preferenceRoutes);

module.exports = router;