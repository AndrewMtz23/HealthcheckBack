import sequelize from '../config/db';
import {writeAudit} from '../audit/writer';
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
    const nuevoTema = await sequelize.transaction(async transaction=>{
    const created=await Tema.create({
      nombre,
      descripcion: descripcion || null,
      palabras_clave: palabras_clave || null,
      activo: true
    },{transaction});
    await writeAudit(req,req.user!,'TOPIC_CREATE',created.id,{fields:Object.keys(req.body).filter(k=>['nombre','url','descripcion','confiabilidad','palabras_clave'].includes(k))},transaction);
    return created;
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
    await sequelize.transaction(async transaction=>{
    await tema.update({
      nombre: nombre || tema.nombre,
      descripcion: descripcion || tema.descripcion,
      palabras_clave: palabras_clave ?? tema.palabras_clave,
      activo: activo !== undefined ? activo : tema.activo
    },{transaction});
    await writeAudit(req,req.user!,'TOPIC_UPDATE',tema.id,{fields:Object.keys(req.body).filter(k=>['nombre','url','descripcion','confiabilidad','verificada','palabras_clave','activo'].includes(k))},transaction);
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