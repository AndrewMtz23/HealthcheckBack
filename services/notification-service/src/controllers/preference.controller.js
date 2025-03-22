const preferenceService = require('../services/preference.service');

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
      
      res.json(preferences);
    } catch (error) {
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
      
      res.json(result);
    } catch (error) {
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
      
      const result = await preferenceService.addTopic(userId, tema_id);
      
      res.json(result);
    } catch (error) {
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
      
      const result = await preferenceService.removeTopic(userId, topicId);
      
      res.json(result);
    } catch (error) {
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
      res.status(500).json({ error: error.message || 'Error al obtener temas' });
    }
  }
}

module.exports = new PreferenceController();