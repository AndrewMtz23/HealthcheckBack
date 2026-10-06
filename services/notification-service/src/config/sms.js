const twilio = require('twilio');

// Configuración del cliente de Twilio
const client = process.env.HEALTHCHECK_DIAGNOSTIC === '1' ? {
  messages: { async create() { throw new Error('SMS delivery disabled in diagnostic mode'); } }
} : twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

module.exports = {
  client,
  phoneNumber
};