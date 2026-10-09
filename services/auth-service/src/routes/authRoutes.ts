import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { validate, registerValidationRules, loginValidationRules } from '../middleware/validation';
import passport from 'passport';
import adminUsers from '../admin/users';
import profileRoutes from '../profile/routes';
import {createRecoveryRouter} from '../account/routes';
import env from '../config/env';

const router = Router();
router.use('/password', createRecoveryRouter());
router.use('/admin/users', adminUsers);
router.use('/profile', profileRoutes);

// Rutas públicas
router.post('/register', registerValidationRules, validate, authController.register);
router.post('/login', loginValidationRules, validate, authController.login);

// Rutas de autenticación con Google
router.get(
  '/google',
  (_req, res, next) => {
    if (!env.google.clientId || !env.google.clientSecret) {res.redirect(`${env.frontendUrl}/login?error=google-no-disponible`);return;}
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  (req, res, next) => {
    if (!env.google.clientId || !env.google.clientSecret) {res.redirect(`${env.frontendUrl}/login?error=google-no-disponible`);return;}
    passport.authenticate('google', {session:false}, (err: unknown, user: Express.User | false, info: {message?: string}) => {
      if (err || !user) {
        const reason = req.query.error === 'access_denied' ? 'google-cancelado' : info?.message === 'identity-conflict' ? 'metodo-original' : 'autenticacion-fallida';
        res.redirect(`${env.frontendUrl}/login?error=${reason}`);return;
      }
      req.user = user;
      authController.googleCallback(req, res);
    })(req, res, next);
  }
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
