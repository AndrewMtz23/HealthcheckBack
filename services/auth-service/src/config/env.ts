import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno del archivo .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface Environment {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  jwtExpiration: number;
  db: {
    user: string;
    host: string;
    database: string;
    password: string;
    port: number;
  };
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  frontendUrl: string;
}

const env: Environment = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'default_secret_key',
  jwtExpiration: parseInt(process.env.JWT_EXPIRATION || '86400', 10),
  db: {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'healthcheck',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '5432', 10),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};

// Validación básica de configuración
if (env.nodeEnv === 'production') {
  if (env.jwtSecret === 'default_secret_key') {
    console.warn('¡ADVERTENCIA! Usando una clave JWT predeterminada en producción.');
  }
  if (!env.google.clientId || !env.google.clientSecret) {
    console.warn('¡ADVERTENCIA! Falta configuración de Google OAuth en producción.');
  }
}

export default env;