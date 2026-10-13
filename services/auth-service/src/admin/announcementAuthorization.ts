import { Request, Response, NextFunction } from 'express';
import { AnnouncementError } from './announcementValidation';

type AdminUser = { id: number; rol: string; activo: boolean } | null;
type FindAdmin = (id: number | undefined) => Promise<AdminUser>;

export const createAnnouncementAdminAuthorization = (findAdmin: FindAdmin) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await findAdmin((req.user as any)?.id);
      if (!user?.activo || user.rol !== 'admin') {
        throw new AnnouncementError(403, 'Se requiere administrador activo');
      }
      res.locals.adminId = user.id;
      res.locals.adminChecked = true;
      next();
    } catch (error) {
      next(error);
    }
  };
