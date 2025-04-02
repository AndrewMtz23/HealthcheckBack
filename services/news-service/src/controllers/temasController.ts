import { Request, Response } from 'express';
import Tema from '../models/Tema';

/**
 * Obtiene todos los temas activos
 */
export const getTemas = async (req: Request, res: Response): Promise<void> => {
  try {
    const temas = await Tema.findAll({
      where: { activo: true },
      attributes: ['id', 'nombre'],
      order: [['nombre', 'ASC']]
    });

    res.status(200).json({
      status: 'success',
      data: temas
    });
  } catch (error) {
    console.error('Error al obtener temas:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener temas'
    });
  }
};

/**
 * Crear un nuevo tema (solo para administradores)
 */
export const createTema = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, descripcion, palabras_clave } = req.body;

    // Validar campos requeridos
    if (!nombre) {
      res.status(400).json({
        status: 'error',
        message: 'El nombre del tema es obligatorio'
      });
      return;
    }

    // Crear tema
    const nuevoTema = await Tema.create({
      nombre,
      descripcion: descripcion || null,
      palabras_clave: palabras_clave || null,
      activo: true
    });

    res.status(201).json({
      status: 'success',
      message: 'Tema creado correctamente',
      data: nuevoTema
    });
  } catch (error) {
    console.error('Error al crear tema:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al crear tema'
    });
  }
};

/**
 * Actualizar un tema existente (solo para administradores)
 */
export const updateTema = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, palabras_clave, activo } = req.body;

    // Buscar el tema
    const tema = await Tema.findByPk(id);

    if (!tema) {
      res.status(404).json({
        status: 'error',
        message: 'Tema no encontrado'
      });
      return;
    }

    // Actualizar tema
    await tema.update({
      nombre: nombre || tema.nombre,
      descripcion: descripcion || tema.descripcion,
      palabras_clave: palabras_clave ?? tema.palabras_clave,
      activo: activo !== undefined ? activo : tema.activo
    });

    res.status(200).json({
      status: 'success',
      message: 'Tema actualizado correctamente',
      data: tema
    });
  } catch (error) {
    console.error('Error al actualizar tema:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al actualizar tema'
    });
  }
};

export default {
  getTemas,
  createTema,
  updateTema
};