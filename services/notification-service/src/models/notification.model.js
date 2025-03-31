const { pool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Modelo para operaciones relacionadas con notificaciones
 */
class NotificationModel {
  /**
   * Crea una nueva notificación en la base de datos
   * @param {Object} notificationData - Datos de la notificación
   * @returns {Promise<Object>} - Notificación creada
   */
  async create(notificationData) {
    const { usuario_id, noticia_id, titulo, mensaje, tipo } = notificationData;
    
    try {
      const result = await pool.query(
        'INSERT INTO notificaciones (usuario_id, noticia_id, titulo, mensaje, tipo, enviada, fecha_creacion) VALUES ($1, $2, $3, $4, $5, FALSE, NOW()) RETURNING id',
        [usuario_id, noticia_id || null, titulo, mensaje, tipo]
      );
      
      return { id: result.rows[0].id };
    } catch (error) {
      logger.error('Error al crear notificación:', error);
      throw error;
    }
  }
  
  /**
   * Actualiza el estado de una notificación a enviada
   * @param {number} id - ID de la notificación
   * @returns {Promise<boolean>} - Éxito de la operación
   */
  async markAsSent(id) {
    try {
      await pool.query(
        'UPDATE notificaciones SET enviada = TRUE, fecha_envio = NOW() WHERE id = $1',
        [id]
      );
      return true;
    } catch (error) {
      logger.error(`Error al marcar notificación ${id} como enviada:`, error);
      return false;
    }
  }
  
  /**
   * Actualiza el estado de múltiples notificaciones a enviadas
   * @param {Array} ids - Lista de IDs de notificaciones
   * @returns {Promise<boolean>} - Éxito de la operación
   */
  async markMultipleAsSent(ids) {
    if (!ids.length) return true;
    
    try {
      await pool.query(
        'UPDATE notificaciones SET enviada = TRUE, fecha_envio = NOW() WHERE id = ANY($1)',
        [ids]
      );
      return true;
    } catch (error) {
      logger.error(`Error al marcar múltiples notificaciones como enviadas:`, error);
      return false;
    }
  }
  
  /**
   * Obtiene notificaciones de un usuario
   * @param {Object} params - Parámetros de búsqueda
   * @returns {Promise<Object>} - Resultado paginado
   */
  async getByUser(params) {
    const { userId, limit = 10, page = 1 } = params;
    const offset = (page - 1) * limit;
    
    try {
      const [notificationsResult, countResult] = await Promise.all([
        pool.query(
          `SELECT n.id, n.titulo, n.mensaje, n.tipo, n.enviada, n.fecha_creacion, n.fecha_envio,
                  n.noticia_id, no.titulo as noticia_titulo
           FROM notificaciones n
           LEFT JOIN noticias no ON n.noticia_id = no.id
           WHERE n.usuario_id = $1
           ORDER BY n.fecha_creacion DESC LIMIT $2 OFFSET $3`,
          [userId, limit, offset]
        ),
        pool.query('SELECT COUNT(*) FROM notificaciones WHERE usuario_id = $1', [userId])
      ]);
      
      const total = parseInt(countResult.rows[0].count);
      
      return {
        data: notificationsResult.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Error al obtener notificaciones del usuario:', error);
      throw error;
    }
  }
  
  /**
   * Obtiene notificaciones pendientes de envío
   * @returns {Promise<Array>} - Lista de notificaciones
   */
  async getPending() {
    try {
      const result = await pool.query(
        `SELECT n.id, n.usuario_id, n.titulo, n.mensaje, n.tipo, n.noticia_id, 
                u.email, u.telefono, u.nombre,
                no.titulo as noticia_titulo, t.nombre as tema_nombre
         FROM notificaciones n
         JOIN usuarios u ON n.usuario_id = u.id
         LEFT JOIN noticias no ON n.noticia_id = no.id
         LEFT JOIN temas t ON no.tema_id = t.id
         WHERE n.enviada = FALSE
         ORDER BY u.id, n.tipo, n.fecha_creacion ASC`
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Error al obtener notificaciones pendientes:', error);
      throw error;
    }
  }

  /**
   * Elimina una notificación específica
   * @param {number} notificationId - ID de la notificación a eliminar
   * @returns {Promise<boolean>} - True si se eliminó correctamente
   */
  async delete(notificationId) {
    try {
      const result = await pool.query(
        'DELETE FROM notificaciones WHERE id = $1 RETURNING id',
        [notificationId]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      logger.error(`Error al eliminar notificación ${notificationId}:`, error);
      throw error;
    }
  }
  
  /**
   * Verifica si una noticia ya generó notificación para un usuario
   * @param {number} userId - ID del usuario
   * @param {number} noticiaId - ID de la noticia
   * @returns {Promise<boolean>} - True si ya existe notificación
   */
  async existsForNewsAndUser(userId, noticiaId) {
    try {
      const result = await pool.query(
        `SELECT id FROM notificaciones 
         WHERE usuario_id = $1 AND noticia_id = $2`,
        [userId, noticiaId]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error al verificar existencia de notificación:', error);
      return false;
    }
  }
  
  /**
   * Crea múltiples notificaciones para noticias falsas
   * @param {Array} notifications - Datos de notificaciones a crear
   * @returns {Promise<Array>} - IDs de notificaciones creadas
   */
  async createBulkForFalseNews(notifications) {
    const client = await pool.connect();
    const createdIds = [];
    
    try {
      await client.query('BEGIN');
      
      for (const notification of notifications) {
        const { usuario_id, noticia_id, titulo, mensaje, tipo } = notification;
        
        // Verificar si ya existe notificación para esta noticia y usuario
        const exists = await this.existsForNewsAndUser(usuario_id, noticia_id);
        if (exists) continue;
        
        // Crear la notificación
        const result = await client.query(
          `INSERT INTO notificaciones
           (usuario_id, noticia_id, titulo, mensaje, tipo, enviada, fecha_creacion)
           VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
           RETURNING id`,
          [usuario_id, noticia_id, titulo, mensaje, tipo]
        );
        
        createdIds.push({
          id: result.rows[0].id,
          ...notification
        });
      }
      
      await client.query('COMMIT');
      return createdIds;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error al crear notificaciones en masa:', error);
      return [];
    } finally {
      client.release();
    }
  }

  /**
  * Obtiene un usuario con sus preferencias de notificación
  * @param {number} userId - ID del usuario
  * @returns {Promise<Object>} - Usuario con preferencias
  */
  async getUserWithPreferences(userId) {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.telefono, u.nombre, pu.tipo_notificacion
         FROM usuarios u
         LEFT JOIN preferencias_usuario pu ON u.id = pu.usuario_id
         WHERE u.id = $1`,
        [userId]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error al obtener usuario ${userId} con preferencias:`, error);
      return null;
    }
  }  
}

module.exports = new NotificationModel();