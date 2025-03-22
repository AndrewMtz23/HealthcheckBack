const cron = require('node-cron');
const { notificationFactory } = require('./notification');
const notificationModel = require('../models/notification.model');
const preferenceModel = require('../models/preference.model');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Servicio para manejar tareas programadas
 */
class SchedulerService {
  /**
   * Inicia el programador de tareas
   */
  startScheduler() {
    // Programar tarea para ejecutarse cada 15 minutos
    cron.schedule('*/15 * * * *', async () => {
      logger.info('Ejecutando verificación programada de notificaciones');
      try {
        await this.processUnsentNotifications();
        await this.generateFalseNewsNotifications();
      } catch (error) {
        logger.error('Error en la tarea programada de notificaciones:', error);
      }
    });
    
    logger.info('Programador de tareas iniciado');
  }
  
  /**
   * Procesa notificaciones pendientes de envío
   */
  async processUnsentNotifications() {
    try {
      // Obtener notificaciones pendientes
      const pendingNotifications = await notificationModel.getPending();
      
      if (pendingNotifications.length === 0) {
        logger.info('No hay notificaciones pendientes para procesar');
        return;
      }
      
      // Separar notificaciones por tipo
      const notificationsByType = this._groupNotificationsByType(pendingNotifications);
      
      // Procesar cada tipo de notificación
      for (const type in notificationsByType) {
        const notifier = notificationFactory.createNotifier(type);
        const notifications = notificationsByType[type];
        
        // Enviar notificaciones en grupo
        const sentIds = await notifier.sendBulk(notifications);
        
        // Marcar como enviadas las notificaciones exitosas
        if (sentIds.length > 0) {
          await notificationModel.markMultipleAsSent(sentIds);
          logger.info(`${sentIds.length} notificaciones de tipo ${type} marcadas como enviadas`);
        }
      }
    } catch (error) {
      logger.error('Error al procesar notificaciones pendientes:', error);
      throw error;
    }
  }
  
  /**
   * Genera notificaciones automáticas para noticias falsas
   */
  async generateFalseNewsNotifications() {
    const client = await pool.connect();
    
    try {
      // Obtener usuarios con notificaciones activas y sus temas
      const usersWithPreferences = await preferenceModel.getUsersWithActiveNotifications();
      
      if (usersWithPreferences.length === 0) {
        logger.info('No hay usuarios con notificaciones activas');
        return;
      }
      
      // Para almacenar notificaciones agrupadas por tipo antes de enviarlas
      const pendingNotifications = [];
      
      for (const user of usersWithPreferences) {
        // Verificar si el usuario tiene temas de interés
        if (!user.topics || user.topics.length === 0) {
          continue;
        }
        
        const topicIds = user.topics.map(topic => topic.id);
        
        // Determinar el intervalo de tiempo según frecuencia
        const timeRange = this._getTimeRangeByFrequency(user.frecuencia_notificaciones);
        
        // Buscar noticias falsas recientes
        const noticiasResult = await client.query(
          `SELECT n.id, n.titulo, t.nombre as tema_nombre, cn.resultado, cn.confianza
           FROM noticias n
           JOIN clasificacion_noticias cn ON n.id = cn.noticia_id
           JOIN temas t ON n.tema_id = t.id
           WHERE n.tema_id = ANY($1)
             AND n.created_at > NOW() - INTERVAL '${timeRange}'
             AND cn.resultado = 'falsa'
             AND NOT EXISTS (
               SELECT 1 FROM notificaciones
               WHERE usuario_id = $2 AND noticia_id = n.id
             )
           ORDER BY cn.confianza DESC, n.created_at DESC
           LIMIT 5`,
          [topicIds, user.id]
        );
        
        // Si no hay noticias falsas para este usuario, continuar con el siguiente
        if (noticiasResult.rows.length === 0) {
          continue;
        }
        
        // Preparar datos para crear notificaciones
        for (const noticia of noticiasResult.rows) {
          const titulo = `Alerta: ${noticia.tema_nombre}`;
          const mensaje = `HealthCheck ha detectado información falsa: "${noticia.titulo}" (${noticia.confianza}% de probabilidad)`;
          
          // Determinar tipo de notificación
          let tipo = user.tipo_notificacion || 'email';
          if ((tipo === 'email' && !user.email) || (tipo === 'sms' && !user.telefono)) {
            if (tipo === 'email' && user.telefono) tipo = 'sms';
            else if (tipo === 'sms' && user.email) tipo = 'email';
            else continue;
          }
          
          pendingNotifications.push({
            usuario_id: user.id,
            noticia_id: noticia.id,
            titulo,
            mensaje,
            tipo,
            tema_nombre: noticia.tema_nombre,
            noticia_titulo: noticia.titulo,
            confianza: noticia.confianza,
            email: user.email,
            telefono: user.telefono,
            nombre: user.nombre
          });
        }
      }
      
      // Crear notificaciones en la base de datos
      if (pendingNotifications.length > 0) {
        const createdNotifications = await notificationModel.createBulkForFalseNews(pendingNotifications);
        
        // Agrupar notificaciones por tipo
        const notificationsByType = this._groupNotificationsByType(createdNotifications);
        
        // Enviar notificaciones inmediatamente
        for (const type in notificationsByType) {
          const notifier = notificationFactory.createNotifier(type);
          const notifications = notificationsByType[type];
          
          // Enviar notificaciones en grupo
          const sentIds = await notifier.sendBulk(notifications);
          
          // Marcar como enviadas las notificaciones exitosas
          if (sentIds.length > 0) {
            await notificationModel.markMultipleAsSent(sentIds);
            logger.info(`${sentIds.length} nuevas notificaciones de tipo ${type} enviadas`);
          }
        }
      } else {
        logger.info('No se generaron nuevas notificaciones');
      }
    } catch (error) {
      logger.error('Error al generar notificaciones automáticas:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Agrupa notificaciones por tipo
   * @private
   * @param {Array} notifications - Lista de notificaciones
   * @returns {Object} - Notificaciones agrupadas por tipo
   */
  _groupNotificationsByType(notifications) {
    const result = {};
    
    for (const notification of notifications) {
      const type = notification.tipo;
      
      if (!result[type]) {
        result[type] = [];
      }
      
      result[type].push(notification);
    }
    
    return result;
  }
  
  /**
   * Obtiene el intervalo de tiempo en formato PostgreSQL según la frecuencia
   * @private
   * @param {string} frequency - Frecuencia de notificaciones
   * @returns {string} - Intervalo de tiempo
   */
  _getTimeRangeByFrequency(frequency) {
    switch (frequency) {
      case 'inmediata': return '1 hour';
      case 'diaria': return '24 hours';
      case 'semanal': return '7 days';
      default: return '24 hours';
    }
  }
}

module.exports = new SchedulerService();