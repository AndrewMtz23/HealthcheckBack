import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface Config {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  services: {
    auth: string;
    ml: string;
    notifications: string;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  cors: {
    allowedOrigins: string[];
  };
}

const config: Config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'default_secret_key',
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001/api',
    ml: process.env.ML_SERVICE_URL || 'http://localhost:5000/api',
    notifications: process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3004/api',
  },
  rateLimit: {
    // 15 minutos
    windowMs: eval(process.env.RATE_LIMIT_WINDOW_MS || '15 * 60 * 1000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  },
};

// Validación de configuración
if (config.nodeEnv === 'production') {
  if (config.jwtSecret === 'default_secret_key') {
    console.warn('⚠️ ADVERTENCIA: Se está utilizando un secreto JWT predeterminado en producción!');
  }
}

export default config;