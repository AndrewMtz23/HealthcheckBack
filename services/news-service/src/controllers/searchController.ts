import { Request, Response } from 'express';
import { Op } from 'sequelize';
import News from '../models/News';
import ClasificacionNoticia from '../models/ClasificacionNoticia';
import Tema from '../models/Tema';
import Fuente from '../models/Fuente';
import ModeloML from '../models/ModeloML';

/**
 * Endpoint unificado de búsqueda que soporta tanto búsqueda simple como avanzada
 */
export const searchNews = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const isAdmin = req.user?.rol === 'admin';
    
    // Obtener parámetros de búsqueda
    // Desde query params (GET) o body (POST)
    const isAdvanced = req.method === 'POST';
    const searchParams = isAdvanced ? req.body : req.query;
    
    // Texto de búsqueda
    const query = searchParams.q || searchParams.query;
    
    // Parámetros adicionales para búsqueda avanzada
    const clasificacion = searchParams.clasificacion;
    const temaId = parseInt(searchParams.temaId) || null;
    const fuenteId = parseInt(searchParams.fuenteId) || null;
    const fechaInicio = searchParams.fechaInicio ? new Date(searchParams.fechaInicio) : null;
    const fechaFin = searchParams.fechaFin ? new Date(searchParams.fechaFin) : null;
    
    // Validar que exista al menos un parámetro de búsqueda
    if (!query && !clasificacion && !temaId && !fuenteId && !fechaInicio && !fechaFin) {
      res.status(400).json({
        status: 'error',
        message: 'Se requiere al menos un criterio de búsqueda'
      });
      return;
    }
    
    // Construir condiciones WHERE
    const whereConditions: any = {};
    
    // Añadir condición de texto
    if (query && query.trim() !== '') {
      whereConditions[Op.or] = [
        { titulo: { [Op.iLike]: `%${query}%` } },
        { contenido: { [Op.iLike]: `%${query}%` } }
      ];
    }
    
    // Añadir condiciones de tema y fuente
    if (temaId) whereConditions.tema_id = temaId;
    if (fuenteId) whereConditions.fuente_id = fuenteId;
    
    // Añadir condiciones de fecha
    if (fechaInicio || fechaFin) {
      whereConditions.fecha_publicacion = {};
      if (fechaInicio) whereConditions.fecha_publicacion[Op.gte] = fechaInicio;
      if (fechaFin) whereConditions.fecha_publicacion[Op.lte] = fechaFin;
    }
    
    // Solo filtrar por URL y fecha válidas si no es admin
    if (!isAdmin) {
      whereConditions.url = {
        [Op.and]: [
          { [Op.ne]: null },
          { [Op.ne]: '' }
        ]
      };
      
      // Solo agregar validación de fecha_publicacion si no se especificó un rango
      if (!fechaInicio && !fechaFin) {
        whereConditions.fecha_publicacion = {
          ...(whereConditions.fecha_publicacion || {}),
          [Op.ne]: null
        };
      }
    }
    
    // Configurar opciones de inclusión
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
    
    // Incluir clasificación con condición adicional si se especifica
    if (clasificacion) {
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
        ]
      });
    } else {
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
        ]
      });
    }
    
    // Ejecutar búsqueda
    const { count, rows } = await News.findAndCountAll({
      where: whereConditions,
      include: includeOptions,
      limit,
      offset,
      order: [['fecha_publicacion', 'DESC']],
      distinct: true // Importante para contar correctamente con relaciones
    });
    
    // Devolver resultados
    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        query,
        results: rows
      }
    });
  } catch (error) {
    console.error('Error en búsqueda de noticias:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al realizar la búsqueda'
    });
  }
};

export default {
  searchNews
};