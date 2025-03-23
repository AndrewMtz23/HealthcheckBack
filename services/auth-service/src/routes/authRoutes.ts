import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { validate, registerValidationRules, loginValidationRules } from '../middleware/validation';
import passport from 'passport';

const router = Router();

// Rutas públicas
router.post('/register', registerValidationRules, validate, authController.register);
router.post('/login', loginValidationRules, validate, authController.login);

// Rutas de autenticación con Google
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { 
    session: false,
    failureRedirect: '/api/auth/google/failure'
  }),
  authController.googleCallback
);

router.get('/google/failure', (req, res) => {
  res.status(401).json({
    status: 'error',
    message: 'Error en la autenticación con Google',
  });
});

// Rutas protegidas
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.post('/logout', authenticate, authController.logout);

export default router;