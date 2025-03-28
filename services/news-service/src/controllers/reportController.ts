import { Request, Response } from 'express';
import Report from '../models/Report';
import { getPaginationOptions, getPaginationData } from '../utils/pagination';

// Crear un reporte de fuente
export const createReport = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado',
      });
      return;
    }

    const { fuente_id, motivo } = req.body;
    const usuario_id = req.user.id;

    if (!fuente_id || !motivo) {
      res.status(400).json({
        status: 'error',
        message: 'Se requiere fuente_id y motivo',
      });
      return;
    }

    // Verificar si el usuario ya ha reportado esta fuente
    const existingReport = await Report.findOne({
      where: { 
        usuario_id,
        fuente_id,
        estado: 'pendiente',
      },
    });

    if (existingReport) {
      res.status(400).json({
        status: 'error',
        message: 'Ya has reportado esta fuente y el reporte está pendiente de revisión',
      });
      return;
    }

    // Crear nuevo reporte
    const report = await Report.create({
      fuente_id,
      usuario_id,
      motivo,
    });

    res.status(201).json({
      status: 'success',
      message: 'Reporte enviado correctamente',
      data: {
        report,
      },
    });
  } catch (error) {
    console.error('Error al crear reporte:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al enviar reporte',
    });
  }
};

// Listar reportes (solo admin)
export const getReports = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.rol !== 'admin') {
      res.status(403).json({
        status: 'error',
        message: 'Acceso denegado',
      });
      return;
    }

    const { page, limit, offset } = getPaginationOptions(req);
    const estado = req.query.estado as string;
    
    // Filtrar por estado si se proporciona
    const whereCondition = estado ? { estado } : {};

    const { count, rows } = await Report.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [['fecha_reporte', 'DESC']],
      include: [
        // Incluir modelo de fuente y usuario
      ],
    });

    res.status(200).json({
      status: 'success',
      data: {
        ...getPaginationData(count, page, limit),
        reports: rows,
      },
    });
  } catch (error) {
    console.error('Error al obtener reportes:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener reportes',
    });
  }
};

// Actualizar estado de un reporte (solo admin)
export const updateReportStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.rol !== 'admin') {
      res.status(403).json({
        status: 'error',
        message: 'Acceso denegado',
      });
      return;
    }

    const { id } = req.params;
    const { estado } = req.body;

    if (!['revisado', 'desestimado'].includes(estado)) {
      res.status(400).json({
        status: 'error',
        message: 'Estado no válido',
      });
      return;
    }

    const report = await Report.findByPk(id);

    if (!report) {
      res.status(404).json({
        status: 'error',
        message: 'Reporte no encontrado',
      });
      return;
    }

    // Actualizar estado y fecha de revisión
    report.estado = estado as any;
    report.fecha_revision = new Date();
    await report.save();

    res.status(200).json({
      status: 'success',
      message: 'Estado del reporte actualizado correctamente',
      data: {
        report,
      },
    });
  } catch (error) {
    console.error('Error al actualizar estado del reporte:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al actualizar estado del reporte',
    });
  }
};

export default {
  createReport,
  getReports,
  updateReportStatus,
};