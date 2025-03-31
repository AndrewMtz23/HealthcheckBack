const preferenceService = require('../services/preference.service');
const logger = require('../utils/logger');

/**
 * Controlador para gestionar preferencias de notificación
 */
class PreferenceController {
  /**
   * Obtiene las preferencias de notificación de un usuario
   * @param {Object} req - Objeto de solicitud Express
   * @param {Object} res - Objeto de respuesta Express
   */
  async getUserPreferences(req, res) {
    try {
      const { userId } = req.params;
      
      const preferences = await preferenceService.getUserPreferences(userId);
      
      // Si no hay preferencias configuradas, crear unas por defecto
      if (!preferences.preferences) {
        // Configurar preferencias por defecto
        const defaultPreferences = {
          recibir_notificaciones: false,
          frecuencia_notificaciones: 'diaria',
          tipo_notificacion: 'email'
        };
        
        // Guardar las preferencias por defecto en la base de datos
        await preferenceService.updatePreferences(userId, defaultPreferences);
        
        // Obtener las preferencias recién creadas
        const newPreferences = await preferenceService.getUserPreferences(userId);
        
        // Responder con las nuevas preferencias
        return res.json(newPreferences);
      }
      
      // Responder con las preferencias existentes
      res.json(preferences);
    } catch (error) {
      logger.error(`Error al obtener preferencias para usuario ${req.params.userId}:`, error);
      res.status(500).json({ error: error.message || 'Error al obtener preferencias' });
    }
  }
  
  /**
   * Actualiza las preferencias generales de un usuario
   * @param {Object} req - Objeto de solicitud Express
   * @param {Object} res - Objeto de respuesta Express
   */
  async updatePreferences(req, res) {
    try {
      const { userId } = req.params;
      const { recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion } = req.body;
      
      const result = await preferenceService.updatePreferences(userId, {
        recibir_notificaciones,
        frecuencia_notificaciones,
        tipo_notificacion
      });
      
      // Obtener las preferencias actualizadas para devolver al cliente
      const updatedPreferences = await preferenceService.getUserPreferences(userId);
      
      res.json(updatedPreferences);
    } catch (error) {
      logger.error(`Error al actualizar preferencias para usuario ${req.params.userId}:`, error);
      res.status(400).json({ error: error.message || 'Error al actualizar preferencias' });
    }
  }
  
  /**
   * Añade un tema de interés para un usuario
   * @param {Object} req - Objeto de solicitud Express
   * @param {Object} res - Objeto de respuesta Express
   */
  async addTopic(req, res) {
    try {
      const { userId } = req.params;
      const { tema_id } = req.body;
      
      await preferenceService.addTopic(userId, tema_id);
      
      // Obtener las preferencias actualizadas para devolver al cliente
      const updatedPreferences = await preferenceService.getUserPreferences(userId);
      
      res.json(updatedPreferences);
    } catch (error) {
      logger.error(`Error al agregar tema de interés para usuario ${req.params.userId}:`, error);
      res.status(400).json({ error: error.message || 'Error al agregar tema de interés' });
    }
  }
  
  /**
   * Elimina un tema de interés de un usuario
   * @param {Object} req - Objeto de solicitud Express
   * @param {Object} res - Objeto de respuesta Express
   */
  async removeTopic(req, res) {
    try {
      const { userId, topicId } = req.params;
      
      await preferenceService.removeTopic(userId, topicId);
      
      // Obtener las preferencias actualizadas para devolver al cliente
      const updatedPreferences = await preferenceService.getUserPreferences(userId);
      
      res.json(updatedPreferences);
    } catch (error) {
      logger.error(`Error al eliminar tema de interés para usuario ${req.params.userId}:`, error);
      res.status(400).json({ error: error.message || 'Error al eliminar tema de interés' });
    }
  }
  
  /**
   * Obtiene todos los temas disponibles
   * @param {Object} req - Objeto de solicitud Express
   * @param {Object} res - Objeto de respuesta Express
   */
  async getAllTopics(req, res) {
    try {
      const topics = await preferenceService.getAllTopics();
      
      res.json({ topics });
    } catch (error) {
      logger.error('Error al obtener todos los temas:', error);
      res.status(500).json({ error: error.message || 'Error al obtener temas' });
    }
  }
}

module.exports = new PreferenceController();