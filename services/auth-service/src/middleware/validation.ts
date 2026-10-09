import { Request, Response, NextFunction } from 'express';
import { validationResult, body, ValidationChain } from 'express-validator';
import {validPassword} from '../account/security';

/**
 * Middleware para validar resultados de express-validator
 */
export const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      status: 'error',
      message: 'Error de validación',
      errors: errors.array().map(error => ({message:error.msg})),
    });
    return;
  }
  next();
};

/**
 * Validación para registro de usuario
 */
export const registerValidationRules = [
  body('email')
    .isEmail()
    .withMessage('Debe proporcionar un correo electrónico válido'),
  body('nombre')
    .notEmpty()
    .withMessage('El nombre es obligatorio'),
  body('contrasena')
    .custom(validPassword)
    .withMessage('La contraseña debe tener al menos 8 caracteres y como máximo 72 bytes'),
];

/**
 * Validación para inicio de sesión con correo/contraseña
 */
export const loginValidationRules = [
  body('email')
    .isEmail()
    .withMessage('Debe proporcionar un correo electrónico válido'),
  body('contrasena')
    .notEmpty()
    .withMessage('La contraseña es obligatoria'),
];

export default {
  validate,
  registerValidationRules,
  loginValidationRules
};
