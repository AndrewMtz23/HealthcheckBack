const { Pool } = require('pg');
const logger = require('../utils/logger');

// Configuración de la conexión a la base de datos
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Connections are opened by explicit worker operations, never on import.

module.exports = {
  pool
};
