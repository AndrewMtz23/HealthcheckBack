import { Request, Response } from 'express';
import { Op } from 'sequelize';
import News from '../models/News';
import ClasificacionNoticia from '../models/ClasificacionNoticia';
import Tema from '../models/Tema';
import Fuente from '../models/Fuente';
import ModeloML from '../models/ModeloML';

/**
 * Obtiene un feed de noticias recientes, filtradas por URL y fecha válidas
 */
export const getNewsFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const isAdmin = req.user?.rol === 'admin';

    // Construir condiciones de filtrado
    const whereConditions: any = {};
    
    // Solo filtrar por URL y fecha válidas si no es admin
    if (!isAdmin) {
      whereConditions.url = {
        [Op.and]: {
          [Op.and]: [
            { [Op.ne]: null },
            { [Op.ne]: '' }
          ]
        }
      };
      whereConditions.fecha_publicacion = {
        [Op.ne]: null
      };
    }

    // Incluir relaciones
    const includeOptions = [
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
    ];

    // Ejecutar consulta
    const { count, rows } = await News.findAndCountAll({
      where: whereConditions,
      limit,
      offset,
      order: [['fecha_publicacion', 'DESC']],
      include: includeOptions
    });

    // Devolver resultados
    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        news: rows
      }
    });
  } catch (error) {
    console.error('Error al obtener feed de noticias:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener noticias recientes'
    });
  }
};

/**
 * Obtiene una noticia específica por su ID
 */
export const getNewsById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    // Incluir relaciones
    const includeOptions = [
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
    ];

    // Buscar la noticia
    const news = await News.findByPk(id, {
      include: includeOptions
    });

    // Verificar si la noticia existe
    if (!news) {
      res.status(404).json({
        status: 'error',
        message: 'Noticia no encontrada'
      });
      return;
    }

    // Devolver la noticia
    res.status(200).json({
      status: 'success',
      data: {
        news
      }
    });
  } catch (error) {
    console.error('Error al obtener noticia por ID:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener noticia'
    });
  }
};

export default {
  getNewsFeed,
  getNewsById
};