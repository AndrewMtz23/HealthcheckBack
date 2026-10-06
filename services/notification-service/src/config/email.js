const nodemailer = require('nodemailer');

// Configuración del cliente de correo electrónico con Hostinger
const transporter = process.env.HEALTHCHECK_DIAGNOSTIC === '1' ? {
  async sendMail() { throw new Error('Email delivery disabled in diagnostic mode'); },
  verify(callback) { callback(new Error('SMTP verification disabled in diagnostic mode')); }
} : nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE, // true para el puerto 465, false para otros puertos
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Configuración común para los emails
const emailDefaults = {
  from: {
    name: 'HealthCheck',
    address: process.env.EMAIL_USER || 'notifications@healthcheck.news'
  }
};

module.exports = {
  transporter,
  emailDefaults
};