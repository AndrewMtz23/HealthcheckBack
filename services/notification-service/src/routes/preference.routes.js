const express = require('express');
const router = express.Router();
const preferenceController = require('../controllers/preference.controller');

// Obtener preferencias de un usuario
router.get('/:userId', preferenceController.getUserPreferences);

// Actualizar preferencias generales
router.put('/:userId', preferenceController.updatePreferences);

// Añadir un tema de interés
router.post('/:userId/topics', preferenceController.addTopic);

// Eliminar un tema de interés
router.delete('/:userId/topics/:topicId', preferenceController.removeTopic);

// Obtener todos los temas disponibles
router.get('/topics/all', preferenceController.getAllTopics);

module.exports = router;