const EmailNotifier = require('./email.notifier');

/**
 * Factory para crear notificadores según el tipo
 * Implementación del patrón Factory Method
 */
class NotificationFactory {
  /**
   * Crea y devuelve el notificador adecuado según el tipo
   * @param {string} type - Canal admitido: email
   * @returns {Object} - Instancia del notificador apropiado
   */
  createNotifier(type) {
    switch (type.toLowerCase()) {
      case 'email':
        return new EmailNotifier();
      default:
        throw new Error('Canal de notificaciones retirado o no compatible');
    }
  }
}

module.exports = new NotificationFactory();
