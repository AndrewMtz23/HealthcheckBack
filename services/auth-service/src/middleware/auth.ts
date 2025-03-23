import { Request, Response, NextFunction } from 'express';
import passport from 'passport';

/**
 * Middleware para autenticar usuarios con JWT
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  passport.authenticate('jwt', { session: false }, (err: Error, user: any) => {
    if (err) {
      return next(err);
    }
    
    if (!user) {
      res.status(401).json({
        status: 'error',
        message: 'No autorizado. Token inválido o expirado.',
      });
      return;
    }
    
    // Si el usuario es válido, lo adjuntamos a la solicitud
    req.user = user;
    next();
  })(req, res, next);
};

/**
 * Middleware para verificar roles de usuario
 * @param roles Array de roles permitidos
 */
export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Verificamos que el usuario esté autenticado
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'No autorizado. Debe iniciar sesión primero.',
      });
      return;
    }

    // Verificamos que el usuario tenga el rol adecuado
    const userRole = (req.user as any).rol;
    if (!roles.includes(userRole)) {
      res.status(403).json({
        status: 'error',
        message: 'Prohibido. No tiene los permisos necesarios.',
      });
      return;
    }

    // Si todo está correcto, continuamos
    next();
  };
};

export default {
  authenticate,
  authorize,
};