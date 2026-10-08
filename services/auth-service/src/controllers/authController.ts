import { Request, Response } from 'express';
import User from '../models/User';
import sequelize from '../config/db';
import { generateToken, extractTokenFromRequest, verifyToken } from '../utils/jwt';
import { revokeSession } from '../utils/sessions';
import env from '../config/env';
import { Op } from 'sequelize';
import {ProfileError,validateProfile} from '../profile/validation';
const profilePayload=(user:User)=>({id:user.id,email:user.email,nombre:user.nombre,telefono:user.telefono,imagen_url:user.imagen_url,rol:user.rol,fecha_registro:user.fecha_registro,ultima_conexion:user.ultima_conexion});

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
        user: profilePayload(user),
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
  let issuedToken: string | undefined;
  try {
    const { email, contrasena } = req.body;
    const session = await sequelize.transaction(async transaction => {
      // Serialize issuance with account/password changes. Do not issue a token
      // from a snapshot read before a concurrent deactivation committed.
      const user = await User.findOne({where:{email}, transaction, lock:transaction.LOCK.UPDATE});
      if (!user || !user.activo || !(await user.isValidPassword(contrasena))) return null;
      user.ultima_conexion = new Date();
      await user.save({transaction});
      issuedToken = generateToken(user);
      return {user:profilePayload(user), token:issuedToken};
    });
    if (!session) {
      res.status(401).json({status:'error', message:'Credenciales incorrectas o cuenta inactiva.'});
      return;
    }
    res.status(200).json({status:'success', message:'Inicio de sesión exitoso', data:session});
  } catch (error) {
    // A failed commit must not leave a usable registered session.
    const payload = issuedToken && verifyToken(issuedToken);
    if (payload) revokeSession(payload.jti);
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({status:'error', message:'Error al iniciar sesión'});
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
    if (!user.activo) {
      res.redirect(`${env.frontendUrl}/login?error=cuenta-inactiva`);
      return;
    }
    
    // Generar token JWT
    const token = generateToken(user);

    // Redireccionar al frontend con el token
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(`${env.frontendUrl}/login/callback#token=${encodeURIComponent(token)}`);
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
        user: profilePayload(user),
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
    user.set(validateProfile(req.body));
    
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Perfil actualizado correctamente',
      data: {
        user: profilePayload(user),
      },
    });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(error instanceof ProfileError ? error.status : 500).json({
      status: 'error',
      message: error instanceof ProfileError ? error.message : 'Error al actualizar perfil de usuario',
    });
  }
};

/**
 * Revocar solo esta sesión; otros dispositivos siguen conectados.
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = extractTokenFromRequest(req);
    const payload = token && verifyToken(token);
    if (payload) revokeSession(payload.jti);

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
