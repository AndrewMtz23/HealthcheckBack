const { pool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Modelo para operaciones relacionadas con preferencias de usuario
 */
class PreferenceModel {
  /**
   * Obtiene las preferencias de notificación de un usuario
   * @param {number} userId - ID del usuario
   * @returns {Promise<Object>} - Preferencias y temas de interés
   */
  async getByUserId(userId) {
    try {
      // Obtener preferencias y temas de interés en dos consultas paralelas
      const [preferencesResult, topicsResult] = await Promise.all([
        pool.query(
          'SELECT id, recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion FROM preferencias_usuario WHERE usuario_id = $1',
          [userId]
        ),
        pool.query(
          'SELECT put.id, t.id as tema_id, t.nombre as tema_nombre FROM preferencias_usuario_temas put JOIN temas t ON put.tema_id = t.id WHERE put.usuario_id = $1',
          [userId]
        )
      ]);
      
      return {
        preferences: preferencesResult.rows[0] || null,
        topics: topicsResult.rows
      };
    } catch (error) {
      logger.error('Error al obtener preferencias del usuario:', error);
      throw error;
    }
  }
  
  /**
   * Actualiza o crea las preferencias generales de un usuario
   * @param {number} userId - ID del usuario
   * @param {Object} data - Nuevas preferencias
   * @returns {Promise<boolean>} - Éxito de la operación
   */
  async updatePreferences(userId, data) {
    const { recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion } = data;
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verificar si existen preferencias para este usuario
      const checkResult = await client.query(
        'SELECT id FROM preferencias_usuario WHERE usuario_id = $1',
        [userId]
      );
      
      if (checkResult.rows.length > 0) {
        // Actualizar preferencias existentes
        await client.query(
          `UPDATE preferencias_usuario 
           SET recibir_notificaciones = $1, 
               frecuencia_notificaciones = $2, 
               tipo_notificacion = $3, 
               updated_at = NOW() 
           WHERE usuario_id = $4`,
          [recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion, userId]
        );
      } else {
        // Crear nuevas preferencias
        await client.query(
          `INSERT INTO preferencias_usuario 
           (usuario_id, recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [userId, recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion]
        );
      }
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error al actualizar preferencias:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Añade un tema de interés para un usuario
   * @param {number} userId - ID del usuario
   * @param {number} topicId - ID del tema
   * @returns {Promise<boolean>} - Éxito de la operación
   */
  async addTopic(userId, topicId) {
    try {
      await pool.query(
        'INSERT INTO preferencias_usuario_temas (usuario_id, tema_id) VALUES ($1, $2) ON CONFLICT (usuario_id, tema_id) DO NOTHING',
        [userId, topicId]
      );
      return true;
    } catch (error) {
      logger.error('Error al agregar tema de interés:', error);
      throw error;
    }
  }
  
  /**
   * Elimina un tema de interés de un usuario
   * @param {number} userId - ID del usuario
   * @param {number} topicId - ID del tema
   * @returns {Promise<boolean>} - Éxito de la operación
   */
  async removeTopic(userId, topicId) {
    try {
      await pool.query(
        'DELETE FROM preferencias_usuario_temas WHERE usuario_id = $1 AND tema_id = $2',
        [userId, topicId]
      );
      return true;
    } catch (error) {
      logger.error('Error al eliminar tema de interés:', error);
      throw error;
    }
  }
  
  /**
   * Obtiene todos los temas disponibles
   * @returns {Promise<Array>} - Lista de temas
   */
  async getAllTopics() {
    try {
      const result = await pool.query(
        'SELECT id, nombre, descripcion FROM temas WHERE activo = TRUE ORDER BY nombre'
      );
      return result.rows;
    } catch (error) {
      logger.error('Error al obtener temas:', error);
      throw error;
    }
  }
  
  /**
   * Obtiene usuarios con notificaciones activas y sus temas de interés
   * @returns {Promise<Array>} - Lista de usuarios con preferencias
   */
  async getUsersWithActiveNotifications() {
    const client = await pool.connect();
    
    try {
      // Obtener usuarios con notificaciones activas
      const usersResult = await client.query(
        `SELECT DISTINCT u.id, u.email, u.telefono, u.nombre, pu.tipo_notificacion, pu.frecuencia_notificaciones
         FROM usuarios u
         JOIN preferencias_usuario pu ON u.id = pu.usuario_id
         WHERE u.activo = TRUE AND pu.recibir_notificaciones = TRUE`
      );
      
      const users = [];
      
      // Para cada usuario, obtener sus temas de interés
      for (const user of usersResult.rows) {
        const topicsResult = await client.query(
          `SELECT t.id, t.nombre
           FROM preferencias_usuario_temas put
           JOIN temas t ON put.tema_id = t.id
           WHERE put.usuario_id = $1 AND t.activo = TRUE`,
          [user.id]
        );
        
        users.push({
          ...user,
          topics: topicsResult.rows
        });
      }
      
      return users;
    } catch (error) {
      logger.error('Error al obtener usuarios con notificaciones activas:', error);
      return [];
    } finally {
      client.release();
    }
  }
}

module.exports = new PreferenceModel();