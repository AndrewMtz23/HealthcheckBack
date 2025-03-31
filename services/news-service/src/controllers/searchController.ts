import { Request, Response } from 'express';
import { Op, Model, ModelCtor } from 'sequelize';
import News from '../models/News';
import ClasificacionNoticia from '../models/ClasificacionNoticia';
import Tema from '../models/Tema';
import Fuente from '../models/Fuente';
import ModeloML from '../models/ModeloML';

// Buscar noticias por texto
export const searchNews = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    
    if (!query || query.trim() === '') {
      res.status(400).json({
        status: 'error',
        message: 'Se requiere un término de búsqueda',
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Buscar en título y contenido
    const { count, rows } = await News.findAndCountAll({
      where: {
        [Op.or]: [
          { titulo: { [Op.iLike]: `%${query}%` } },
          { contenido: { [Op.iLike]: `%${query}%` } },
        ],
      },
      limit,
      offset,
      order: [['fecha_publicacion', 'DESC']],
      include: [
        {
          model: ClasificacionNoticia,
          as: 'clasificaciones',
          attributes: ['resultado', 'confianza', 'explicacion'],
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
        query,
        results: rows,
      },
    });
  } catch (error) {
    console.error('Error en búsqueda de noticias:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al realizar la búsqueda',
    });
  }
};

// Búsqueda avanzada con filtros
export const advancedSearch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      query, 
      clasificacion, 
      temaId, 
      fuenteId, 
      fechaInicio, 
      fechaFin 
    } = req.body;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Construir condiciones de búsqueda
    const whereConditions: any = {};
    
    if (query) {
      whereConditions[Op.or] = [
        { titulo: { [Op.iLike]: `%${query}%` } },
        { contenido: { [Op.iLike]: `%${query}%` } },
      ];
    }
    
    if (temaId) {
      whereConditions.tema_id = temaId;
    }
    
    if (fuenteId) {
      whereConditions.fuente_id = fuenteId;
    }
    
    if (fechaInicio || fechaFin) {
      whereConditions.fecha_publicacion = {};
      if (fechaInicio) {
        whereConditions.fecha_publicacion[Op.gte] = new Date(fechaInicio);
      }
      if (fechaFin) {
        whereConditions.fecha_publicacion[Op.lte] = new Date(fechaFin);
      }
    }

    // Configurar opciones de inclusión con tipo any[]
    const includeOptions: any[] = [
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

    // Incluir clasificación si se especifica
    if (clasificacion) {
      includeOptions.push({
        model: ClasificacionNoticia,
        as: 'clasificaciones',
        where: { resultado: clasificacion },
        attributes: ['resultado', 'confianza', 'explicacion'],
        include: [
          {
            model: ModeloML,
            as: 'modelo',
            attributes: ['nombre', 'version', 'precision', 'recall', 'f1_score']
          }
        ]
      });
    } else {
      // Si no se especifica clasificación, igual incluimos las clasificaciones pero sin filtrar
      includeOptions.push({
        model: ClasificacionNoticia,
        as: 'clasificaciones',
        attributes: ['resultado', 'confianza', 'explicacion'],
        required: false,
        include: [
          {
            model: ModeloML,
            as: 'modelo',
            attributes: ['nombre', 'version', 'precision', 'recall', 'f1_score']
          }
        ]
      });
    }

    const { count, rows } = await News.findAndCountAll({
      where: whereConditions,
      include: includeOptions,
      limit,
      offset,
      order: [['fecha_publicacion', 'DESC']],
    });

    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        results: rows,
      },
    });
  } catch (error) {
    console.error('Error en búsqueda avanzada:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al realizar la búsqueda avanzada',
    });
  }
};

export default {
  searchNews,
  advancedSearch,
};