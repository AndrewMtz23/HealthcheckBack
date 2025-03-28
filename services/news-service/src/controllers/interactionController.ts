import { Request, Response } from 'express';
import Interaction from '../models/Interaction';

// Registrar una interacción con una noticia
export const createInteraction = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado',
      });
      return;
    }

    const { noticia_id, tipo_interaccion } = req.body;
    const usuario_id = req.user.id;

    // Validar tipo de interacción
    if (!['marcar_confiable', 'marcar_dudosa', 'compartir'].includes(tipo_interaccion)) {
      res.status(400).json({
        status: 'error',
        message: 'Tipo de interacción no válido',
      });
      return;
    }

    // Verificar si ya existe una interacción similar
    const existingInteraction = await Interaction.findOne({
      where: {
        usuario_id,
        noticia_id,
        tipo_interaccion,
      },
    });

    if (existingInteraction) {
      res.status(400).json({
        status: 'error',
        message: 'Ya existe una interacción similar para esta noticia',
      });
      return;
    }

    // Crear nueva interacción
    const interaction = await Interaction.create({
      usuario_id,
      noticia_id,
      tipo_interaccion,
    });

    res.status(201).json({
      status: 'success',
      message: 'Interacción registrada correctamente',
      data: {
        interaction,
      },
    });
  } catch (error) {
    console.error('Error al crear interacción:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al registrar interacción',
    });
  }
};

// Obtener interacciones de un usuario
export const getUserInteractions = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado',
      });
      return;
    }

    const usuario_id = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const { count, rows } = await Interaction.findAndCountAll({
      where: { usuario_id },
      limit,
      offset,
      order: [['fecha_interaccion', 'DESC']],
      include: [
        // Incluir la noticia relacionada
      ],
    });

    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        interactions: rows,
      },
    });
  } catch (error) {
    console.error('Error al obtener interacciones del usuario:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener interacciones',
    });
  }
};

export default {
  createInteraction,
  getUserInteractions,
};