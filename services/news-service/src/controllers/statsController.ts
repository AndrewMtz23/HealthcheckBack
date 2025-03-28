import { Request, Response } from 'express';
import sequelize from '../config/db';
import News from '../models/News';
import { authenticate, authorize } from '../middleware/auth';
import { QueryTypes } from 'sequelize';

// Obtener estadísticas generales
export const getGeneralStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar autenticación
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado',
      });
      return;
    }

    // Obtener conteo de noticias por clasificación
    const classificationStats = await sequelize.query(`
      SELECT 
        cn.resultado as clasificacion, 
        COUNT(*) as total 
      FROM 
        noticias n 
      JOIN 
        clasificacion_noticias cn ON n.id = cn.noticia_id 
      GROUP BY 
        cn.resultado
    `, { type: QueryTypes.SELECT });

    // Obtener conteo de noticias por tema
    const topicStats = await sequelize.query(`
      SELECT 
        t.nombre as tema, 
        COUNT(*) as total 
      FROM 
        noticias n 
      JOIN 
        temas t ON n.tema_id = t.id 
      GROUP BY 
        t.nombre 
      ORDER BY 
        total DESC
    `, { type: QueryTypes.SELECT });

    // Obtener conteo de noticias por fuente (top 10)
    const sourceStats = await sequelize.query(`
      SELECT 
        f.nombre as fuente, 
        COUNT(*) as total 
      FROM 
        noticias n 
      JOIN 
        fuentes f ON n.fuente_id = f.id 
      GROUP BY 
        f.nombre 
      ORDER BY 
        total DESC 
      LIMIT 10
    `, { type: QueryTypes.SELECT });

    // Obtener tendencia mensual de noticias
    const monthlyTrend = await sequelize.query(`
      SELECT 
        TO_CHAR(fecha_publicacion, 'YYYY-MM') as mes,
        COUNT(*) as total
      FROM 
        noticias
      WHERE 
        fecha_publicacion IS NOT NULL
      GROUP BY 
        TO_CHAR(fecha_publicacion, 'YYYY-MM')
      ORDER BY 
        mes DESC
      LIMIT 12
    `, { type: QueryTypes.SELECT });

    res.status(200).json({
      status: 'success',
      data: {
        classificationStats,
        topicStats,
        sourceStats,
        monthlyTrend,
      },
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener estadísticas',
    });
  }
};

// Obtener estadísticas de usuario
export const getUserStats = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado',
      });
      return;
    }

    const usuario_id = req.user.id;

    // Obtener conteo de interacciones por tipo
    const interactionStats = await sequelize.query(`
      SELECT 
        tipo_interaccion, 
        COUNT(*) as total 
      FROM 
        interacciones_noticia 
      WHERE 
        usuario_id = :usuario_id 
      GROUP BY 
        tipo_interaccion
    `, { 
      replacements: { usuario_id },
      type: QueryTypes.SELECT 
    });

    // Obtener conteo de búsquedas realizadas
    const searchCount = await sequelize.query(`
      SELECT 
        COUNT(*) as total 
      FROM 
        historial_consultas 
      WHERE 
        usuario_id = :usuario_id
    `, { 
      replacements: { usuario_id },
      type: QueryTypes.SELECT 
    });

    // Obtener noticias más interactuadas por el usuario
    const topInteractedNews = await sequelize.query(`
      SELECT 
        n.id, 
        n.titulo, 
        COUNT(*) as interacciones 
      FROM 
        interacciones_noticia i 
      JOIN 
        noticias n ON i.noticia_id = n.id 
      WHERE 
        i.usuario_id = :usuario_id 
      GROUP BY 
        n.id, n.titulo 
      ORDER BY 
        interacciones DESC 
      LIMIT 5
    `, { 
      replacements: { usuario_id },
      type: QueryTypes.SELECT 
    });

    res.status(200).json({
      status: 'success',
      data: {
        interactionStats,
        searchCount: searchCount[0],
        topInteractedNews,
      },
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de usuario:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener estadísticas de usuario',
    });
  }
};

export default {
  getGeneralStats,
  getUserStats,
};