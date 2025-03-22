const twilio = require('twilio');

// Configuración del cliente de Twilio
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

module.exports = {
  client,
  phoneNumber
};