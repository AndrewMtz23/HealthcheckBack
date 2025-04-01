import { Request, Response } from 'express';
import Report from '../models/Report';
import Fuente from '../models/Fuente';

/**
 * Crea un reporte de fuente
 */
export const createReport = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar autenticación
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { fuente_id, motivo } = req.body;
    const usuario_id = req.user.id;

    // Validar datos
    if (!fuente_id || !motivo) {
      res.status(400).json({
        status: 'error',
        message: 'Se requiere fuente_id y motivo'
      });
      return;
    }

    // Verificar que la fuente exista
    const fuente = await Fuente.findByPk(fuente_id);
    if (!fuente) {
      res.status(404).json({
        status: 'error',
        message: 'Fuente no encontrada'
      });
      return;
    }

    // Verificar si el usuario ya ha reportado esta fuente y tiene un reporte pendiente
    const existingReport = await Report.findOne({
      where: { 
        usuario_id,
        fuente_id,
        estado: 'pendiente',
      }
    });

    if (existingReport) {
      res.status(400).json({
        status: 'error',
        message: 'Ya has reportado esta fuente y el reporte está pendiente de revisión'
      });
      return;
    }

    // Crear nuevo reporte
    const report = await Report.create({
      fuente_id,
      usuario_id,
      motivo,
      estado: 'pendiente',
      fecha_reporte: new Date()
    });

    res.status(201).json({
      status: 'success',
      message: 'Reporte enviado correctamente',
      data: {
        report
      }
    });
  } catch (error) {
    console.error('Error al crear reporte:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al enviar reporte'
    });
  }
};

/**
 * Obtiene los reportes (solo accesible para administradores)
 */
export const getReports = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar que sea administrador
    if (!req.user || req.user.rol !== 'admin') {
      res.status(403).json({
        status: 'error',
        message: 'Acceso denegado'
      });
      return;
    }

    // Configurar paginación
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    
    // Filtrar por estado si se proporciona
    const estado = req.query.estado as string;
    const whereCondition = estado ? { estado } : {};

    // Obtener reportes con información de fuente
    const { count, rows } = await Report.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [['fecha_reporte', 'DESC']],
      include: [
        {
          model: Fuente,
          as: 'fuente',
          attributes: ['id', 'nombre', 'url', 'confiabilidad']
        }
      ]
    });

    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        reports: rows
      }
    });
  } catch (error) {
    console.error('Error al obtener reportes:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener reportes'
    });
  }
};

/**
 * Actualiza el estado de un reporte (solo administradores)
 */
export const updateReportStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar que sea administrador
    if (!req.user || req.user.rol !== 'admin') {
      res.status(403).json({
        status: 'error',
        message: 'Acceso denegado'
      });
      return;
    }

    const { id } = req.params;
    const { estado, comentario } = req.body;

    // Validar estado
    if (!['revisado', 'desestimado'].includes(estado)) {
      res.status(400).json({
        status: 'error',
        message: 'Estado no válido'
      });
      return;
    }

    // Buscar el reporte
    const report = await Report.findByPk(id);
    if (!report) {
      res.status(404).json({
        status: 'error',
        message: 'Reporte no encontrado'
      });
      return;
    }

    // Actualizar estado y fecha de revisión
    const updateData: any = {
      estado,
      fecha_revision: new Date()
    };
    
    // Añadir comentario si existe
    if (comentario) {
      updateData.comentario_admin = comentario;
    }
    
    await Report.update(updateData, {
      where: { id }
    });
    
    // Recargar reporte con datos actualizados
    const updatedReport = await Report.findByPk(id);

    // Si el reporte fue revisado y validado, actualizar la confiabilidad de la fuente
    if (estado === 'revisado') {
      const fuente = await Fuente.findByPk(report.fuente_id);
      if (fuente) {
        // Reducir la confiabilidad de la fuente (ejemplo: reducir en un 10%)
        const nuevaConfiabilidad = Math.max(0, Number(fuente.confiabilidad) - 0.1);
        await Fuente.update(
          { confiabilidad: nuevaConfiabilidad },
          { where: { id: fuente.id } }
        );
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Estado del reporte actualizado correctamente',
      data: {
        report: updatedReport
      }
    });
  } catch (error) {
    console.error('Error al actualizar estado del reporte:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al actualizar estado del reporte'
    });
  }
};

export default {
  createReport,
  getReports,
  updateReportStatus
};