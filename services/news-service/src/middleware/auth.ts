import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';

interface JwtPayload {
  id: number;
  email: string;
  rol: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  // Obtener el token del encabezado de autorización
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({
      status: 'error',
      message: 'No autorizado. Token no proporcionado.',
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

// Middleware para verificar roles
export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'No autorizado. Usuario no autenticado.',
      });
      return;
    }

    if (!roles.includes(req.user.rol)) {
      res.status(403).json({
        status: 'error',
        message: 'Prohibido. No tiene los permisos necesarios.',
      });
      return;
    }

    next();
  };
};

export default {
  authenticate,
  authorize,
};