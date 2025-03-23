import winston from 'winston';
import morgan from 'morgan';
import { Request, Response, NextFunction } from 'express';
import config from '../config';

// Configuración de Winston
export const logger = winston.createLogger({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta) : ''
      }`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Formato de Morgan para desarrollo
const morganDev = morgan('dev', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
});

// Formato de Morgan para producción
const morganProd = morgan(
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms',
  {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  }
);

// Middleware para registrar solicitudes HTTP
export const httpLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (config.nodeEnv === 'production') {
    morganProd(req, res, next);
  } else {
    morganDev(req, res, next);
  }
};

// Middleware para registrar errores
export const errorLogger = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  logger.error(`${err.message}`, {
    error: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });
  next(err);
};

export default {
  logger,
  httpLogger,
  errorLogger,
};