const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');

// Enviar una notificación
router.post('/send', notificationController.sendNotification);

// Obtener notificaciones de un usuario
router.get('/:userId', notificationController.getUserNotifications);

// Eliminar una notificación específica
router.delete('/:notificationId', notificationController.deleteNotification);

// Ejecutar verificación manual (solo para desarrollo/pruebas)
router.post('/check', notificationController.runManualCheck);

module.exports = router;