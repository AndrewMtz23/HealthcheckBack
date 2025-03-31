import { Request, Response } from 'express';
import { QueryTypes } from 'sequelize';
import News from '../models/News';
import ClasificacionNoticia from '../models/ClasificacionNoticia';
import Tema from '../models/Tema';
import Fuente from '../models/Fuente';
import ModeloML from '../models/ModeloML';
import sequelize from '../config/db';

// Obtener noticias recientes con paginación
export const getRecentNews = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const { count, rows } = await News.findAndCountAll({
      limit,
      offset,
      order: [['fecha_publicacion', 'DESC']],
      include: [
        {
          model: ClasificacionNoticia,
          as: 'clasificaciones',
          attributes: ['resultado', 'confianza', 'explicacion', 'fecha_clasificacion'],
          include: [
            {
              model: ModeloML,
              as: 'modelo',
              attributes: ['nombre', 'version', 'precision', 'recall', 'f1_score']
            }
          ]
        },
        {
          model: Tema,
          as: 'tema',
          attributes: ['nombre']
        },
        {
          model: Fuente,
          as: 'fuente',
          attributes: ['nombre', 'url', 'confiabilidad']
        }
      ],
    });

    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        news: rows,
      },
    });
  } catch (error) {
    console.error('Error al obtener noticias recientes:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener noticias recientes',
    });
  }
};

// Obtener noticia por ID
export const getNewsById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    const news = await News.findByPk(id, {
      include: [
        {
          model: ClasificacionNoticia,
          as: 'clasificaciones',
          attributes: ['resultado', 'confianza', 'explicacion']
        },
        {
          model: Tema,
          as: 'tema',
          attributes: ['nombre']
        },
        {
          model: Fuente,
          as: 'fuente',
          attributes: ['nombre', 'url', 'confiabilidad']
        }
      ],
    });

    if (!news) {
      res.status(404).json({
        status: 'error',
        message: 'Noticia no encontrada',
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      data: {
        news,
      },
    });
  } catch (error) {
    console.error('Error al obtener noticia por ID:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener noticia',
    });
  }
};

// Obtener noticias por tema
export const getNewsByTopic = async (req: Request, res: Response): Promise<void> => {
  try {
    const temaId = parseInt(req.params.temaId);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const { count, rows } = await News.findAndCountAll({
      where: { tema_id: temaId },
      limit,
      offset,
      order: [['fecha_publicacion', 'DESC']],
      include: [
        {
          model: ClasificacionNoticia,
          as: 'clasificaciones',
          attributes: ['resultado', 'confianza', 'explicacion']
        },
        {
          model: Tema,
          as: 'tema',
          attributes: ['nombre']
        },
        {
          model: Fuente,
          as: 'fuente',
          attributes: ['nombre', 'url', 'confiabilidad']
        }
      ],
    });

    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        news: rows,
      },
    });
  } catch (error) {
    console.error('Error al obtener noticias por tema:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener noticias por tema',
    });
  }
};

// Obtener estadísticas de noticias
export const getNewsStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Contar noticias por clasificación
    const stats = await sequelize.query(`
      SELECT 
        cn.resultado, 
        COUNT(*) as count 
      FROM 
        noticias n 
      JOIN 
        clasificacion_noticias cn ON n.id = cn.noticia_id 
      GROUP BY 
        cn.resultado
    `, { type: QueryTypes.SELECT });

    // Obtener distribución por tema
    const topicDistribution = await sequelize.query(`
      SELECT 
        t.nombre as tema, 
        COUNT(*) as count 
      FROM 
        noticias n 
      JOIN 
        temas t ON n.tema_id = t.id 
      GROUP BY 
        t.nombre 
      ORDER BY 
        count DESC 
      LIMIT 10
    `, { type: QueryTypes.SELECT });

    res.status(200).json({
      status: 'success',
      data: {
        classificationStats: stats,
        topicDistribution,
      },
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de noticias:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener estadísticas',
    });
  }
};

export default {
  getRecentNews,
  getNewsById,
  getNewsByTopic,
  getNewsStats,
};