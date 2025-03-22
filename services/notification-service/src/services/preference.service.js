const preferenceModel = require('../models/preference.model');
const logger = require('../utils/logger');

/**
 * Servicio para gestionar preferencias de notificación
 */
class PreferenceService {
  /**
   * Obtiene las preferencias de notificación de un usuario
   * @param {number} userId - ID del usuario
   * @returns {Promise<Object>} - Preferencias y temas
   */
  async getUserPreferences(userId) {
    try {
      return await preferenceModel.getByUserId(userId);
    } catch (error) {
      logger.error(`Error al obtener preferencias para usuario ${userId}:`, error);
      throw new Error('No se pudieron obtener las preferencias');
    }
  }
  
  /**
   * Actualiza las preferencias generales de un usuario
   * @param {number} userId - ID del usuario
   * @param {Object} data - Nuevas preferencias
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async updatePreferences(userId, data) {
    try {
      // Validar los datos
      if (data.recibir_notificaciones === undefined || 
          !data.frecuencia_notificaciones || 
          !data.tipo_notificacion) {
        throw new Error('Faltan datos requeridos');
      }
      
      // Validar que frecuencia_notificaciones tenga un valor válido
      const validFrequencies = ['inmediata', 'diaria', 'semanal'];
      if (!validFrequencies.includes(data.frecuencia_notificaciones)) {
        throw new Error('Frecuencia de notificaciones inválida');
      }
      
      // Validar que tipo_notificacion tenga un valor válido
      const validTypes = ['email', 'sms'];
      if (!validTypes.includes(data.tipo_notificacion)) {
        throw new Error('Tipo de notificación inválido');
      }
      
      await preferenceModel.updatePreferences(userId, data);
      
      return { success: true };
    } catch (error) {
      logger.error(`Error al actualizar preferencias para usuario ${userId}:`, error);
      throw new Error(error.message || 'No se pudieron actualizar las preferencias');
    }
  }
  
  /**
   * Añade un tema de interés para un usuario
   * @param {number} userId - ID del usuario
   * @param {number} topicId - ID del tema
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async addTopic(userId, topicId) {
    try {
      if (!topicId) {
        throw new Error('Se requiere especificar el tema_id');
      }
      
      await preferenceModel.addTopic(userId, topicId);
      
      return { success: true };
    } catch (error) {
      logger.error(`Error al agregar tema ${topicId} para usuario ${userId}:`, error);
      throw new Error(error.message || 'No se pudo agregar el tema de interés');
    }
  }
  
  /**
   * Elimina un tema de interés de un usuario
   * @param {number} userId - ID del usuario
   * @param {number} topicId - ID del tema
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async removeTopic(userId, topicId) {
    try {
      await preferenceModel.removeTopic(userId, topicId);
      
      return { success: true };
    } catch (error) {
      logger.error(`Error al eliminar tema ${topicId} para usuario ${userId}:`, error);
      throw new Error('No se pudo eliminar el tema de interés');
    }
  }
  
  /**
   * Obtiene todos los temas disponibles
   * @returns {Promise<Array>} - Lista de temas
   */
  async getAllTopics() {
    try {
      return await preferenceModel.getAllTopics();
    } catch (error) {
      logger.error('Error al obtener temas:', error);
      throw new Error('No se pudieron obtener los temas');
    }
  }
}

module.exports = new PreferenceService();