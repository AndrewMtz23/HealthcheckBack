const NotificationInterface = require('./notification.interface');
const emailConfig = require('../../config/email');
const logger = require('../../utils/logger');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const accepted = result => !!result?.accepted?.length && !result?.rejected?.length;

/**
 * Implementación de notificación por email
 */
class EmailNotifier extends NotificationInterface {
  async sendDelivery(recipient, notifications, messageId) {
    // Durable worker owns retries and records sanitized outcome codes.
    return emailConfig.transporter.sendMail({...emailConfig.emailDefaults,
      to:recipient.email, messageId,
      subject:`HealthCheck: Alertas de desinformación (${notifications.length})`,
      html:this._generateBulkEmailTemplate(recipient.nombre,notifications)});
  }
  async sendAnnouncement(recipient, announcement, messageId) {
    const title=escapeHtml(announcement.title);
    const body=escapeHtml(announcement.body).replace(/\r?\n/g,'<br>');
    const configured=process.env.FRONTEND_URL||'http://localhost:3000';
    const link=`${configured.replace(/\/$/,'')}/notifications`;
    return emailConfig.transporter.sendMail({...emailConfig.emailDefaults,
      to:recipient.email, messageId,
      subject:`HealthCheck: ${announcement.title}`,
      text:`${announcement.title}\n\n${announcement.body}\n\nConsulta tus avisos: ${link}`,
      html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px"><h1>HealthCheck</h1><h2>${title}</h2><p style="line-height:1.6">${body}</p><p><a href="${link}">Consultar mis avisos</a></p><small>Este aviso se envió a las cuentas activas de HealthCheck.</small></div>`});
  }
  /**
   * Envía un email individual
   * @param {Object} recipient - Destinatario {email, nombre}
   * @param {Object} content - Contenido {titulo, mensaje}
   * @returns {Promise<boolean>} - Éxito del envío
   */
  async send(recipient, content) {
    try {
      const { email, nombre } = recipient;
      const { titulo, mensaje } = content;
      
      const mailOptions = {
        ...emailConfig.emailDefaults,
        to: email,
        subject: titulo,
        html: this._generateIndividualEmailTemplate(nombre, titulo, mensaje)
      };
      
      return accepted(await emailConfig.transporter.sendMail(mailOptions));
    } catch (error) {
      logger.error('Error al enviar email');
      return false;
    }
  }
  
  /**
   * Envía múltiples notificaciones agrupadas por usuario
   * @param {Array} notifications - Lista de notificaciones
   * @returns {Promise<Array>} - IDs de notificaciones enviadas
   */
  async sendBulk(notifications) {
    try {
      // Agrupar por usuario (email)
      const emailGroups = Object.create(null);
      
      for (const notification of notifications) {
        const { email, nombre } = notification;
        if (!email) continue;
        
        if (!emailGroups[email]) {
          emailGroups[email] = {
            nombre,
            notifications: []
          };
        }
        
        emailGroups[email].notifications.push({
          id: notification.id,
          titulo: notification.titulo,
          mensaje: notification.mensaje,
          tema: notification.tema_nombre,
          noticia_id: notification.noticia_id,
          noticia_titulo: notification.noticia_titulo,
          confianza: notification.confianza
        });
      }
      
      const sentNotificationIds = [];
      
      // Enviar un email para cada usuario con todas sus notificaciones
      for (const email in emailGroups) {
        const { nombre, notifications } = emailGroups[email];
        
        const mailOptions = {
          ...emailConfig.emailDefaults,
          to: email,
          subject: `HealthCheck: Alertas de desinformación (${notifications.length})`,
          html: this._generateBulkEmailTemplate(nombre, notifications)
        };
        
        try {
          if (accepted(await emailConfig.transporter.sendMail(mailOptions))) {
            notifications.forEach(n => sentNotificationIds.push(n.id));
          }
        } catch {
          // A later recipient failing must not erase earlier SMTP acceptances.
          logger.error('Error al enviar un grupo de notificaciones');
        }
      }
      
      return sentNotificationIds;
    } catch (error) {
      logger.error('Error al preparar emails agrupados');
      return [];
    }
  }
  
  /**
   * Genera el HTML para un correo individual
   * @private
   */
  _generateIndividualEmailTemplate(nombre, subject, body) {
    nombre = escapeHtml(nombre); subject = escapeHtml(subject); body = escapeHtml(body);
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #e74c3c; margin: 0;">HealthCheck</h1>
          <p style="color: #777; font-size: 14px; margin-top: 5px;">Verificación de información en salud</p>
        </div>
        <h2 style="color: #333;">Hola${nombre ? ` ${nombre}` : ''}!</h2>
        <h3 style="color: #444;">${subject}</h3>
        <div style="color: #555; line-height: 1.5;">
          ${body}
        </div>
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #777; font-size: 12px;">
          <p>Este es un mensaje automático de HealthCheck. Por favor, no responda a este correo.</p>
          <p>© ${new Date().getFullYear()} HealthCheck - Todos los derechos reservados.</p>
        </div>
      </div>
    `;
  }
  
  /**
   * Genera el HTML para un correo con múltiples notificaciones
   * @private
   */
  _generateBulkEmailTemplate(nombre, notifications) {
    // Agrupar por tema
    const temaGroups = Object.create(null);
    notifications.forEach(notif => {
      const tema = notif.tema || notif.tema_nombre || 'General';
      if (!temaGroups[tema]) {
        temaGroups[tema] = [];
      }
      temaGroups[tema].push(notif);
    });
    
    // Generar HTML para cada grupo de tema
    let notificationsHtml = '';
    for (const tema in temaGroups) {
      notificationsHtml += `
        <div style="margin-bottom: 25px;">
          <h3 style="color: #444; border-bottom: 1px solid #ddd; padding-bottom: 10px;">${escapeHtml(tema)}</h3>
          <div>
      `;
      
      temaGroups[tema].forEach(notif => {
        notificationsHtml += `
          <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f8f8; border-left: 4px solid #e74c3c; border-radius: 4px;">
            <h4 style="margin-top: 0; color: #e74c3c;">${escapeHtml(notif.titulo)}</h4>
            <p style="color: #555;">${escapeHtml(notif.mensaje)}</p>
            ${notif.noticia_titulo ? `<p style="font-style: italic; color: #777;">Noticia: "${escapeHtml(notif.noticia_titulo)}"</p>` : ''}
            ${notif.confianza ? `<p style="font-weight: bold;">Confianza: ${escapeHtml(notif.confianza)}%</p>` : ''}
          </div>
        `;
      });
      
      notificationsHtml += `
          </div>
        </div>
      `;
    }
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #e74c3c; margin: 0;">HealthCheck</h1>
          <p style="color: #777; font-size: 14px; margin-top: 5px;">Verificación de información en salud</p>
        </div>
        
        <h2 style="color: #333;">Hola${nombre ? ` ${escapeHtml(nombre)}` : ''}!</h2>
        <p style="color: #555;">HealthCheck ha detectado ${notifications.length} posible${notifications.length !== 1 ? 's' : ''} caso${notifications.length !== 1 ? 's' : ''} de desinformación sobre temas que te interesan:</p>
        
        ${notificationsHtml}
        
        <div style="margin-top: 20px; background-color: #f5f5f5; padding: 15px; border-radius: 4px;">
          <p style="margin: 0; color: #555;">Estas alertas se generan automáticamente cuando nuestro sistema detecta noticias potencialmente falsas sobre los temas que sigues.</p>
        </div>
        
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #777; font-size: 12px;">
          <p>Este es un mensaje automático de HealthCheck. Por favor, no responda a este correo.</p>
          <p>Para administrar tus preferencias de notificación, inicia sesión en tu cuenta de HealthCheck.</p>
          <p>© ${new Date().getFullYear()} HealthCheck - Todos los derechos reservados.</p>
        </div>
      </div>
    `;
  }
}

module.exports = EmailNotifier;
