import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';

interface JwtPayload {
  id: number;
  email: string;
  rol: string;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware para verificar token JWT
 */
export const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
  // Obtener el token del encabezado de autorización
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({
      status: 'error',
      message: 'Acceso no autorizado. Token no proporcionado.',
    });
    return;
  }

  try {
    // Verificar el token
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    
    // Adjuntar el usuario decodificado a la solicitud
    req.user = decoded;
    
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        status: 'error',
        message: 'Token expirado. Por favor, inicie sesión nuevamente.',
      });
    } else {
      res.status(401).json({
        status: 'error',
        message: 'Token inválido. Acceso denegado.',
      });
    }
  }
};

/**
 * Middleware para verificar roles
 * @param roles Array de roles permitidos
 */
export const checkRoles = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Verificar que existe un usuario (token ya verificado)
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Acceso no autorizado. Token no verificado.',
      });
      return;
    }

    // Verificar que el rol del usuario está entre los permitidos
    if (!roles.includes(req.user.rol)) {
      res.status(403).json({
        status: 'error',
        message: 'Acceso prohibido. No tiene los permisos necesarios.',
      });
      return;
    }

    next();
  };
};

export default {
  verifyToken,
  checkRoles,
};