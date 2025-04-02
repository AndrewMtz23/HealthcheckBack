import { Request, Response } from 'express';
import { Op } from 'sequelize';
import News from '../models/News';
import ClasificacionNoticia from '../models/ClasificacionNoticia';
import Tema from '../models/Tema';
import Fuente from '../models/Fuente';
import ModeloML from '../models/ModeloML';

/**
 * Endpoint unificado de búsqueda que soporta múltiples filtros
 */
export const searchNews = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const isAdmin = req.user?.rol === 'admin';
    
    // Obtener parámetros de búsqueda
    const query = req.query.q as string || '';  // Consulta opcional
    const clasificacion = req.query.clasificacion as string || ''; // Clasificación opcional
    const temaId = req.query.temaId ? parseInt(req.query.temaId as string) : null; // ID de tema
    const fuenteId = req.query.fuenteId ? parseInt(req.query.fuenteId as string) : null; // ID de fuente
    
    // Parsear fechas
    const fechaInicio = req.query.fechaInicio ? new Date(req.query.fechaInicio as string) : null;
    const fechaFin = req.query.fechaFin ? new Date(req.query.fechaFin as string) : null;
    
    console.log('Búsqueda con parámetros:', { 
      query, 
      clasificacion, 
      temaId, 
      fuenteId, 
      fechaInicio, 
      fechaFin, 
      page, 
      limit, 
      isAdmin 
    });
    
    // Construir condiciones WHERE
    const whereConditions: any = {};
    
    // Añadir condición de texto si hay consulta
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
        attributes: ['id', 'nombre']
      },
      {
        model: Fuente,
        as: 'fuente',
        attributes: ['id', 'nombre', 'url', 'confiabilidad']
      }
    ];
    
    // Incluir clasificación con condición si se especifica
    if (clasificacion && ['verdadera', 'falsa', 'dudosa'].includes(clasificacion)) {
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
        required: true // IMPORTANTE: Esto hace un INNER JOIN en lugar de LEFT JOIN
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
        ],
        required: false
      });
    }
    
    console.log('Condiciones de búsqueda:', JSON.stringify(whereConditions, null, 2));
    
    // Ejecutar búsqueda
    const { count, rows } = await News.findAndCountAll({
      where: whereConditions,
      include: includeOptions,
      limit,
      offset,
      order: [['fecha_publicacion', 'DESC']],
      distinct: true // Importante para contar correctamente con relaciones
    });
    
    console.log(`Búsqueda completada: ${rows.length} resultados de ${count} total`);
    
    // Devolver resultados
    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        query,
        clasificacion,
        temaId,
        fuenteId,
        fechaInicio: fechaInicio?.toISOString(),
        fechaFin: fechaFin?.toISOString(),
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