import jwt from 'jsonwebtoken';
import env from '../config/env';
import { Request } from 'express';
import User from '../models/User';
import { issueSession } from './sessions';
import { ExtractJwt } from 'passport-jwt';

// Payload del token JWT
interface JwtPayload {
  id: number;
  email: string;
  rol: string;
  jti: string;
}

/**
 * Genera un token JWT para un usuario
 * @param user Usuario para el que se genera el token
 * @returns Token JWT generado
 */
export const generateToken = (user: User): string => {
  if (!env.jwtSecret || env.jwtSecret === 'default_secret_key') throw new Error('JWT no configurado');
  const expiresIn = Number.isSafeInteger(env.jwtExpiration) && env.jwtExpiration > 0
    ? Math.min(env.jwtExpiration, 86400) : 3600;
  const payload: JwtPayload = {
    id: user.id,
    email: user.email,
    rol: user.rol,
    jti: issueSession(user, expiresIn),
  };

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn,
    algorithm: 'HS256',
  });
};

/**
 * Verifica y decodifica un token JWT
 * @param token Token JWT a verificar
 * @returns Payload decodificado o null si es inválido
 */
export const verifyToken = (token: string): JwtPayload | null => {
  try {
    return jwt.verify(token, env.jwtSecret, {algorithms:['HS256']}) as JwtPayload;
  } catch (error) {
    return null;
  }
};

/**
 * Extrae el token JWT de la solicitud
 * @param req Objeto Request de Express
 * @returns Token JWT o null si no se encuentra
 */
export const extractTokenFromRequest = (req: Request): string | null => {
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
};

export default {
  generateToken,
  verifyToken,
  extractTokenFromRequest,
};
