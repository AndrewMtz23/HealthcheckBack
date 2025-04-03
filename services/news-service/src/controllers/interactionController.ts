import { Request, Response } from 'express';
import Interaction from '../models/Interaction';
import News from '../models/News';

/**
 * Crea o actualiza una interacción de usuario con una noticia
 */
export const createOrUpdateInteraction = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar autenticación
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { noticia_id, tipo_interaccion } = req.body;
    const usuario_id = req.user.id;

    // Validar parámetros
    if (!noticia_id || !tipo_interaccion) {
      res.status(400).json({
        status: 'error',
        message: 'Se requiere noticia_id y tipo_interaccion'
      });
      return;
    }

    // Validar que la noticia exista
    const noticia = await News.findByPk(noticia_id);
    if (!noticia) {
      res.status(404).json({
        status: 'error',
        message: 'Noticia no encontrada'
      });
      return;
    }

    // Validar tipo de interacción
    if (!['marcar_confiable', 'marcar_dudosa', 'compartir'].includes(tipo_interaccion)) {
      res.status(400).json({
        status: 'error',
        message: 'Tipo de interacción no válido'
      });
      return;
    }

    // Para compartir, verificar si ya existe una interacción previa
    if (tipo_interaccion === 'compartir') {
      const existingInteraction = await Interaction.findOne({
        where: {
          usuario_id,
          noticia_id,
          tipo_interaccion: 'compartir'
        }
      });

      // Si ya existe una interacción de compartir, no hacer nada
      if (existingInteraction) {
        res.status(200).json({
          status: 'success',
          message: 'Compartido previamente',
          action: 'already_shared'
        });
        return;
      }
    }

    // Resto del código para otras interacciones (marcar_confiable, marcar_dudosa)
    const existingInteraction = await Interaction.findOne({
      where: {
        usuario_id,
        noticia_id,
        tipo_interaccion
      }
    });

    // Si ya existe esta interacción exacta y no es "compartir", eliminarla (toggle)
    if (existingInteraction && tipo_interaccion !== 'compartir') {
      await existingInteraction.destroy();
      
      res.status(200).json({
        status: 'success',
        message: 'Interacción eliminada correctamente',
        action: 'removed'
      });
      return;
    }

    // Si es una interacción de valoración (confiable/dudosa), eliminar la opuesta si existe
    if (tipo_interaccion === 'marcar_confiable' || tipo_interaccion === 'marcar_dudosa') {
      const oppositeType = tipo_interaccion === 'marcar_confiable' ? 'marcar_dudosa' : 'marcar_confiable';
      
      await Interaction.destroy({
        where: {
          usuario_id,
          noticia_id,
          tipo_interaccion: oppositeType
        }
      });
    }

    // Crear nueva interacción
    const interaction = await Interaction.create({
      usuario_id,
      noticia_id,
      tipo_interaccion
    });

    res.status(201).json({
      status: 'success',
      message: 'Interacción registrada correctamente',
      data: { interaction },
      action: 'created'
    });
  } catch (error) {
    console.error('Error al gestionar interacción:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al procesar la interacción'
    });
  }
};

/**
 * Obtiene las interacciones de un usuario
 */
export const getUserInteractions = async (req: Request, res: Response): Promise<void> => {
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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Obtener interacciones del usuario con información básica de las noticias
    const { count, rows } = await Interaction.findAndCountAll({
      where: { usuario_id },
      limit,
      offset,
      order: [['fecha_interaccion', 'DESC']],
      include: [
        {
          model: News,
          as: 'noticia',
          attributes: ['id', 'titulo', 'url', 'fecha_publicacion']
        }
      ]
    });

    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        interactions: rows
      }
    });
  } catch (error) {
    console.error('Error al obtener interacciones del usuario:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener interacciones'
    });
  }
};

/**
 * Obtiene el estado de interacción de un usuario con una noticia específica
 */
export const getInteractionStatus = async (req: Request, res: Response): Promise<void> => {
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
    const noticia_id = parseInt(req.params.noticiaId);

    // Obtener todas las interacciones del usuario con esta noticia
    const interactions = await Interaction.findAll({
      where: {
        usuario_id,
        noticia_id
      },
      attributes: ['tipo_interaccion']
    });

    // Crear un objeto con el estado de cada tipo de interacción
    const interactionTypes = ['marcar_confiable', 'marcar_dudosa', 'compartir'];
    const status = interactionTypes.reduce((acc: Record<string, boolean>, type) => {
      acc[type] = interactions.some(i => i.tipo_interaccion === type);
      return acc;
    }, {});

    res.status(200).json({
      status: 'success',
      data: {
        noticia_id,
        interactions: status
      }
    });
  } catch (error) {
    console.error('Error al obtener estado de interacción:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener estado de interacción'
    });
  }
};

// Actualización para getInteractionCounts en interactionController.ts

export const getInteractionCounts = async (req: Request, res: Response): Promise<void> => {
  try {
    const noticiaId = parseInt(req.params.noticiaId);

    // Contar likes, dislikes y shares
    const [likesCount, dislikesCount, sharesCount] = await Promise.all([
      Interaction.count({
        where: {
          noticia_id: noticiaId,
          tipo_interaccion: 'marcar_confiable'
        }
      }),
      Interaction.count({
        where: {
          noticia_id: noticiaId,
          tipo_interaccion: 'marcar_dudosa'
        }
      }),
      Interaction.count({
        where: {
          noticia_id: noticiaId,
          tipo_interaccion: 'compartir'
        }
      })
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        likes: likesCount,
        dislikes: dislikesCount,
        shares: sharesCount
      }
    });
  } catch (error) {
    console.error('Error al obtener conteo de interacciones:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener conteo de interacciones'
    });
  }
};

export default {
  createOrUpdateInteraction,
  getUserInteractions,
  getInteractionStatus,
  getInteractionCounts
};