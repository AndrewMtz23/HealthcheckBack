import { Request, Response, NextFunction } from 'express';
import '../config';

interface CurrentUser { id: number; email: string; rol: string; }
declare global { namespace Express { interface Request { user?: CurrentUser; } } }

// Auth owns revocation and reads the current account on every request.
// Never authorize from the role embedded in a previously issued JWT.
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authorization = req.headers.authorization;
  if (!authorization || !/^Bearer [^\s]+$/i.test(authorization)) {
    res.status(401).json({status:'error', message:'Se requiere una sesión válida.'});
    return;
  }
  try {
    const base = (process.env.AUTH_SERVICE_URL || 'http://localhost:3001');
    const url = base.replace(/\/$/, '').replace(/\/api$/, '') + '/api/auth/profile';
    const response = await fetch(url, {headers:{Authorization:authorization},
      signal:AbortSignal.timeout(3000), redirect:'error', cache:'no-store'});
    if (response.status === 401) {
      res.status(401).json({status:'error', message:'Tu sesión terminó. Vuelve a iniciar sesión.'});
      return;
    }
    if (!response.ok) throw new Error('Auth unavailable');
    const payload = await response.json() as {data?: {user?: CurrentUser}};
    const user = payload.data?.user;
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || !['admin','usuario'].includes(user.rol))
      throw new Error('Invalid Auth response');
    req.user = {id:user.id, email:user.email, rol:user.rol};
    next();
  } catch {
    res.status(503).json({status:'error', message:'No se pudo validar la sesión. Intenta de nuevo.'});
  }
};

export const authorize = (roles: string[]) => (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) { res.status(401).json({status:'error', message:'Se requiere una sesión válida.'}); return; }
  if (!roles.includes(req.user.rol)) { res.status(403).json({status:'error', message:'No tienes permisos para esta operación.'}); return; }
  next();
};
export default {authenticate, authorize};
