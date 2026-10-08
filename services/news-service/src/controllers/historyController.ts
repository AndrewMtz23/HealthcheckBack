import { Request, Response } from 'express';
import { Op, literal } from 'sequelize';
import {parseQuery,AdminError} from '../admin/query';
import HistorialConsulta from '../models/HistorialConsulta';
import News from '../models/News';
import Tema from '../models/Tema';
import Fuente from '../models/Fuente';
import ClasificacionNoticia from '../models/ClasificacionNoticia';

/**
 * Registra una consulta de noticia por parte de un usuario (De esto se encarga otro servicio ya)
 */

/**
 * Obtiene el historial de consultas de un usuario
 */
export const getUserHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar autenticación
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado'
      });
      return;
    }

    const usuario_id = req.user.id;
    const {page,limit,offset,startDate,endDate}=parseQuery({...req.query,limit:req.query.limit||10});

    // Filtrar por fecha si se proporciona

    const dateCondition: any = {};
    if (startDate || endDate) {
      dateCondition.fecha_consulta = {};
      // parseQuery strictly validates calendar dates before SQL interpolation.
      // Stored timestamps have no timezone: preserve their calendar dates.
      if (startDate) dateCondition.fecha_consulta[Op.gte] = literal(`'${startDate}'::timestamp`);
      if (endDate) dateCondition.fecha_consulta[Op.lt] = literal(`'${endDate}'::timestamp + interval '1 day'`);
    }

    // Buscar el historial de consultas con detalles de las noticias
    const { count, rows } = await HistorialConsulta.findAndCountAll({
      distinct: true,
      where: {
        usuario_id,
        ...dateCondition
      },
      include: [
        {
          model: News,
          as: 'noticia',
          attributes: ['id', 'titulo', 'contenido', 'url', 'fecha_publicacion'],
          include: [
            {
              model: Tema,
              as: 'tema',
              attributes: ['nombre']
            },
            {
              model: Fuente,
              as: 'fuente',
              attributes: ['nombre', 'confiabilidad']
            },
            {
              model: ClasificacionNoticia,
              as: 'clasificaciones',
              attributes: ['resultado', 'confianza', 'fecha_clasificacion'],
              separate: true,
              limit: 1,
              order: [['fecha_clasificacion','DESC'],['id','DESC']],
              required: false
            }
          ]
        }
      ],
      order: [['fecha_consulta', 'DESC'],['id','DESC']],
      limit,
      offset
    });

    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        history: rows
      }
    });
  } catch (error) {
    if(error instanceof AdminError){res.status(error.status).json({status:'error',message:error.message});return;}
    console.error('Error al obtener historial de consultas:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener historial de consultas'
    });
  }
};

/**
 * Elimina una entrada específica del historial de consultas
 */
export const deleteHistoryEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar autenticación
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado'
      });
      return;
    }

    const usuario_id = req.user.id;
    const historyId = parseInt(req.params.id);

    // Verificar que la entrada exista y pertenezca al usuario
    const historyEntry = await HistorialConsulta.findOne({
      where: {
        id: historyId,
        usuario_id
      }
    });

    if (!historyEntry) {
      res.status(404).json({
        status: 'error',
        message: 'Entrada de historial no encontrada o no pertenece al usuario'
      });
      return;
    }

    // Eliminar la entrada
    await historyEntry.destroy();

    res.status(200).json({
      status: 'success',
      message: 'Entrada de historial eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar entrada de historial:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al eliminar entrada de historial'
    });
  }
};

/**
 * Elimina todo el historial de consultas de un usuario
 */
export const clearUserHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar autenticación
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado'
      });
      return;
    }

    const usuario_id = req.user.id;

    // Eliminar todas las entradas del usuario
    await HistorialConsulta.destroy({
      where: { usuario_id }
    });

    res.status(200).json({
      status: 'success',
      message: 'Historial de consultas eliminado correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar historial de consultas:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al eliminar historial de consultas'
    });
  }
};

export default {
  getUserHistory,
  deleteHistoryEntry,
  clearUserHistory
};
