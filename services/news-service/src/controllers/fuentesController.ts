import { Request, Response } from 'express';
import Fuente from '../models/Fuente';

/**
 * Obtiene todas las fuentes
 */
export const getFuentes = async (req: Request, res: Response): Promise<void> => {
  try {
    const fuentes = await Fuente.findAll({
      attributes: ['id', 'nombre', 'url', 'confiabilidad'],
      order: [['confiabilidad', 'DESC'], ['nombre', 'ASC']]
    });

    res.status(200).json({
      status: 'success',
      data: fuentes
    });
  } catch (error) {
    console.error('Error al obtener fuentes:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener fuentes'
    });
  }
};

/**
 * Crear una nueva fuente (solo para administradores)
 */
export const createFuente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, url, descripcion, confiabilidad } = req.body;

    // Validar campos requeridos
    if (!nombre) {
      res.status(400).json({
        status: 'error',
        message: 'El nombre de la fuente es obligatorio'
      });
      return;
    }

    // Crear fuente
    const nuevaFuente = await Fuente.create({
      nombre,
      url: url || null,
      descripcion: descripcion || null,
      confiabilidad: confiabilidad || 0.5,
      verificada: false,
      noticias_verdaderas: 0,
      noticias_falsas: 0
    });

    res.status(201).json({
      status: 'success',
      message: 'Fuente creada correctamente',
      data: nuevaFuente
    });
  } catch (error) {
    console.error('Error al crear fuente:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al crear fuente'
    });
  }
};

/**
 * Actualizar una fuente existente (solo para administradores)
 */
export const updateFuente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre, url, descripcion, confiabilidad, verificada } = req.body;

    // Buscar la fuente
    const fuente = await Fuente.findByPk(id);

    if (!fuente) {
      res.status(404).json({
        status: 'error',
        message: 'Fuente no encontrada'
      });
      return;
    }

    // Actualizar fuente
    await fuente.update({
      nombre: nombre || fuente.nombre,
      url: url ?? fuente.url,
      descripcion: descripcion ?? fuente.descripcion,
      confiabilidad: confiabilidad ?? fuente.confiabilidad,
      verificada: verificada !== undefined ? verificada : fuente.verificada
    });

    res.status(200).json({
      status: 'success',
      message: 'Fuente actualizada correctamente',
      data: fuente
    });
  } catch (error) {
    console.error('Error al actualizar fuente:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al actualizar fuente'
    });
  }
};

export default {
  getFuentes,
  createFuente,
  updateFuente
};