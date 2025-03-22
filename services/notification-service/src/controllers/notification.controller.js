const { notificationFactory } = require('../services/notification');
const notificationModel = require('../models/notification.model');
const logger = require('../utils/logger');

/**
 * Controlador para gestionar notificaciones
 */
class NotificationController {
  /**
   * Envía una notificación
   * @param {Object} req - Objeto de solicitud Express
   * @param {Object} res - Objeto de respuesta Express
   */
  async sendNotification(req, res) {
    try {
      const { usuario_id, noticia_id, titulo, mensaje } = req.body;
      
      // Validar datos requeridos
      if (!usuario_id || !titulo || !mensaje) {
        return res.status(400).json({ 
          error: 'Datos incompletos. Se requiere usuario_id, titulo y mensaje' 
        });
      }
      
      // Obtener información del usuario y sus preferencias
      const userResult = await notificationModel.getUserWithPreferences(usuario_id);
      
      if (!userResult) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      
      const { email, telefono, nombre, tipo_notificacion } = userResult;
      
      // Determinar el tipo de notificación basado en las preferencias y datos disponibles
      let tipo = tipo_notificacion || 'email';
      if ((tipo === 'email' && !email) || (tipo === 'sms' && !telefono)) {
        tipo = (tipo === 'email' && telefono) ? 'sms' : (tipo === 'sms' && email) ? 'email' : 'email';
      }
      
      // Crear la notificación en la base de datos
      const notification = await notificationModel.create({
        usuario_id,
        noticia_id,
        titulo,
        mensaje,
        tipo
      });
      
      // Enviar la notificación inmediatamente
      let success = false;
      
      // Usar el Factory Method para obtener el notificador correspondiente
      const notifier = notificationFactory.createNotifier(tipo);
      
      if (tipo === 'email' && email) {
        success = await notifier.send(
          { email, nombre },
          { titulo, mensaje }
        );
      } else if (tipo === 'sms' && telefono) {
        success = await notifier.send(
          { telefono },
          { titulo, mensaje }
        );
      }
      
      // Actualizar el estado de la notificación
      if (success) {
        await notificationModel.markAsSent(notification.id);
      }
      
      res.json({ 
        success, 
        notification_id: notification.id,
        message: success ? 'Notificación enviada correctamente' : 'No se pudo enviar la notificación'
      });
    } catch (error) {
      logger.error('Error al enviar notificación:', error);
      res.status(500).json({ error: 'Error al enviar notificación' });
    }
  }
  
  /**
   * Obtiene notificaciones de un usuario
   * @param {Object} req - Objeto de solicitud Express
   * @param {Object} res - Objeto de respuesta Express
   */
  async getUserNotifications(req, res) {
    try {
      const { userId } = req.params;
      const { limit, page } = req.query;
      
      const result = await notificationModel.getByUser({
        userId,
        limit: parseInt(limit) || 10,
        page: parseInt(page) || 1
      });
      
      res.json(result);
    } catch (error) {
      logger.error('Error al obtener notificaciones:', error);
      res.status(500).json({ error: 'Error al obtener notificaciones' });
    }
  }
  
  /**
   * Ejecuta manualmente la verificación de notificaciones (para pruebas)
   * @param {Object} req - Objeto de solicitud Express
   * @param {Object} res - Objeto de respuesta Express
   */
  async runManualCheck(req, res) {
    try {
      const schedulerService = require('../services/scheduler.service');
      
      await schedulerService.processUnsentNotifications();
      await schedulerService.generateFalseNewsNotifications();
      
      res.json({ message: 'Verificación de notificaciones completada' });
    } catch (error) {
      logger.error('Error en verificación manual:', error);
      res.status(500).json({ error: 'Error en la verificación de notificaciones' });
    }
  }
}

module.exports = new NotificationController();