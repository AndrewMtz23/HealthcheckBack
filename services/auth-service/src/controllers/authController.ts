import { Request, Response } from 'express';
import User from '../models/User';
import { generateToken } from '../utils/jwt';
import env from '../config/env';
import { Op } from 'sequelize';

/**
 * Registrar un nuevo usuario
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, nombre, contrasena, telefono } = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({
        status: 'error',
        message: 'El correo electrónico ya está registrado',
      });
      return;
    }

    // Crear nuevo usuario
    const user = await User.create({
      email,
      nombre,
      contrasena,
      telefono,
      rol: 'usuario',
      fecha_registro: new Date(),
      ultima_conexion: new Date(),
      activo: true,
    });

    // Generar token JWT
    const token = generateToken(user);

    // Responder con el usuario y token
    res.status(201).json({
      status: 'success',
      message: 'Usuario registrado correctamente',
      data: {
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          rol: user.rol,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al registrar usuario',
    });
  }
};

/**
 * Iniciar sesión con correo y contraseña
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, contrasena } = req.body;

    // Buscar usuario por email
    const user = await User.findOne({
      where: { email },
    });

    // Verificar si el usuario existe y la contraseña es correcta
    if (!user || !(await user.isValidPassword(contrasena))) {
      res.status(401).json({
        status: 'error',
        message: 'Credenciales incorrectas',
      });
      return;
    }

    // Verificar si el usuario está activo
    if (!user.activo) {
      res.status(401).json({
        status: 'error',
        message: 'Este usuario ha sido desactivado',
      });
      return;
    }

    // Actualizar última conexión
    user.ultima_conexion = new Date();
    await user.save();

    // Generar token JWT
    const token = generateToken(user);

    // Responder con el usuario y token
    res.status(200).json({
      status: 'success',
      message: 'Inicio de sesión exitoso',
      data: {
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          rol: user.rol,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al iniciar sesión',
    });
  }
};

/**
 * Callback después de autenticación con Google
 */
export const googleCallback = (req: Request, res: Response): void => {
  try {
    // El usuario ya debe estar autenticado por passport en este punto
    if (!req.user) {
      res.redirect(`${env.frontendUrl}/login?error=autenticacion-fallida`);
      return;
    }

    const user = req.user as User;
    
    // Generar token JWT
    const token = generateToken(user);

    // Redireccionar al frontend con el token
    res.redirect(`${env.frontendUrl}/login/callback?token=${token}`);
  } catch (error) {
    console.error('Error en callback de Google:', error);
    res.redirect(`${env.frontendUrl}/login?error=error-interno`);
  }
};

/**
 * Obtener datos del usuario autenticado
 */
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user as User;

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          telefono: user.telefono,
          rol: user.rol,
          fecha_registro: user.fecha_registro,
          ultima_conexion: user.ultima_conexion,
        },
      },
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener perfil de usuario',
    });
  }
};

/**
 * Actualizar datos del usuario
 */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user as User;
    const { nombre, telefono } = req.body;

    // Actualizar datos
    user.nombre = nombre || user.nombre;
    user.telefono = telefono !== undefined ? telefono : user.telefono;
    
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Perfil actualizado correctamente',
      data: {
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          telefono: user.telefono,
          rol: user.rol,
        },
      },
    });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al actualizar perfil de usuario',
    });
  }
};

/**
 * Cerrar sesión (solo para propósitos de registro en el backend)
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    // No necesitamos invalidar JWT ya que son stateless
    // Pero podemos actualizar la última conexión del usuario
    if (req.user) {
      const user = req.user as User;
      user.ultima_conexion = new Date();
      await user.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Sesión cerrada correctamente',
    });
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al cerrar sesión',
    });
  }
};