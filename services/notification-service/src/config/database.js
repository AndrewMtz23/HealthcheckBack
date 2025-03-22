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

// Verificar conexión
pool.query('SELECT NOW()', (err) => {
  if (err) {
    logger.error('Error al conectar a la base de datos:', err);
  } else {
    logger.info('Conexión a la base de datos establecida correctamente');
  }
});

module.exports = {
  pool
};