import { Request, Response } from 'express';
import { Op } from 'sequelize';
import News from '../models/News';
import ClasificacionNoticia from '../models/ClasificacionNoticia';
import Tema from '../models/Tema';
import Fuente from '../models/Fuente';
import ModeloML from '../models/ModeloML';

/**
 * Obtiene un feed de noticias recientes, filtradas por URL y fecha válidas
 * También soporta filtrado opcional por clasificación
 */
export const getNewsFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const isAdmin = req.user?.rol === 'admin';
    
    // Obtener parámetro de clasificación
    const clasificacion = req.query.clasificacion as string;
    
    console.log('Obteniendo noticias con parámetros:', { page, limit, clasificacion, isAdmin });

    // Construir condiciones de filtrado
    const whereConditions: any = {};
    
    // Solo filtrar por URL y fecha válidas si no es admin
    if (!isAdmin) {
      whereConditions.url = {
        [Op.ne]: null,
      };
      whereConditions.url = {
        [Op.ne]: '',
      };
      whereConditions.fecha_publicacion = {
        [Op.ne]: null
      };
    }

    // Incluir relaciones
    const includeOptions: any[] = [
      {
        model: Tema,
        as: 'tema',
        attributes: ['nombre']
      },
      {
        model: Fuente,
        as: 'fuente',
        attributes: ['id', 'nombre', 'url', 'confiabilidad']
      }
    ];
    
    // Si hay filtro de clasificación, incluir con condición
    if (clasificacion && ['verdadera', 'falsa', 'dudosa'].includes(clasificacion)) {
      console.log(`Aplicando filtro de clasificación: ${clasificacion}`);
      includeOptions.push({
        model: ClasificacionNoticia,
        as: 'clasificaciones',
        where: { resultado: clasificacion },
        attributes: ['resultado', 'confianza', 'explicacion', 'fecha_clasificacion'],
        include: [
          {
            model: ModeloML,
            as: 'modelo',
            attributes: ['nombre', 'version', 'precision', 'recall', 'f1_score']
          }
        ],
        required: true  // Esto es importante para que el filtro funcione correctamente
      });
    } else {
      // Incluir clasificaciones sin filtro
      includeOptions.push({
        model: ClasificacionNoticia,
        as: 'clasificaciones',
        attributes: ['resultado', 'confianza', 'explicacion', 'fecha_clasificacion'],
        include: [
          {
            model: ModeloML,
            as: 'modelo',
            attributes: ['nombre', 'version', 'precision', 'recall', 'f1_score']
          }
        ],
        required: false
      });
    }

    // Ejecutar consulta
    const { count, rows } = await News.findAndCountAll({
      where: whereConditions,
      limit,
      offset,
      order: [['fecha_publicacion', 'DESC']],
      include: includeOptions,
      distinct: true  // Necesario para contar correctamente con JOINs
    });
    
    console.log(`Consulta completada. Encontradas ${rows.length} noticias de ${count} total`);

    // Devolver resultados
    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        clasificacion: clasificacion || null,
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
    
    console.log(`Buscando noticia con ID: ${id}`);

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
        attributes: ['id', 'nombre', 'url', 'confiabilidad']
      }
    ];

    // Buscar la noticia
    const news = await News.findByPk(id, {
      include: includeOptions
    });

    // Verificar si la noticia existe
    if (!news) {
      console.log(`Noticia con ID ${id} no encontrada`);
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