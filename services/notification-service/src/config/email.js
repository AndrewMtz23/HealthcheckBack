const nodemailer = require('nodemailer');

const env = process.env;
const port = Number(env.EMAIL_PORT || 587);
const enabled = env.NOTIFICATION_DELIVERY_ENABLED === 'true'
  && env.HEALTHCHECK_DIAGNOSTIC !== '1' && env.NODE_ENV !== 'test'
  && !!env.EMAIL_HOST && !!env.EMAIL_USER && !!env.EMAIL_PASS && [465,587].includes(port);
// Configuration never connects/verifies SMTP. Actual delivery is opt-in.
const transporter = enabled ? nodemailer.createTransport({
  host:env.EMAIL_HOST, port, secure:port === 465, requireTLS:true,
  auth:{user:env.EMAIL_USER, pass:env.EMAIL_PASS}, tls:{rejectUnauthorized:true},
  connectionTimeout:5000, greetingTimeout:5000, socketTimeout:10000,
  disableFileAccess:true, disableUrlAccess:true, logger:false, debug:false,
}) : {async sendMail() {throw new Error('Notification delivery disabled');}};

// Configuración común para los emails
const emailDefaults = {
  from: {
    name: 'HealthCheck',
    address: process.env.EMAIL_USER || 'notifications@healthcheck.news'
  }
};

module.exports = {
  enabled,
  transporter,
  emailDefaults
};
