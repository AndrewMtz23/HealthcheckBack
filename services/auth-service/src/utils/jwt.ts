import jwt from 'jsonwebtoken';
import env from '../config/env';
import { Request } from 'express';
import User from '../models/User';

// Payload del token JWT
interface JwtPayload {
  id: number;
  email: string;
  rol: string;
}

/**
 * Genera un token JWT para un usuario
 * @param user Usuario para el que se genera el token
 * @returns Token JWT generado
 */
export const generateToken = (user: User): string => {
  const payload: JwtPayload = {
    id: user.id,
    email: user.email,
    rol: user.rol,
  };

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiration,
  });
};

/**
 * Verifica y decodifica un token JWT
 * @param token Token JWT a verificar
 * @returns Payload decodificado o null si es inválido
 */
export const verifyToken = (token: string): JwtPayload | null => {
  try {
    return jwt.verify(token, env.jwtSecret) as JwtPayload;
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
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    return req.headers.authorization.split(' ')[1];
  }

  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
};

export default {
  generateToken,
  verifyToken,
  extractTokenFromRequest,
};