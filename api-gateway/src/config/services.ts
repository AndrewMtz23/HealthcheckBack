import config from './index';

interface ServiceDefinition {
  name: string;
  url: string;
  routes: {
    path: string;
    auth: boolean;
    rateLimit?: {
      windowMs: number;
      max: number;
    };
  }[];
}

const services: ServiceDefinition[] = [
  {
    name: 'auth',
    url: config.services.auth,
    routes: [
      // Rutas públicas que no requieren autenticación
      { path: '/register', auth: false },
      { path: '/login', auth: false },
      { path: '/google', auth: false },
      { path: '/google/callback', auth: false },
      { path: '/google/failure', auth: false },
      // Rutas protegidas que requieren autenticación
      { path: '/profile', auth: true },
      { path: '/logout', auth: true },
    ],
  },
  {
    name: 'ml',
    url: config.services.ml,
    routes: [
      // Ruta para clasificar noticias - requiere autenticación
      {
        path: '/classify/predict',
        auth: true,
        // Implementar rate limiting más estricto para este endpoint
        rateLimit: {
          windowMs: 60 * 1000, // 1 minuto
          max: 10, // 10 peticiones por minuto
        },
      },
      // Ruta para el chatbot - requiere autenticación
      {
        path: '/chatbot/chat',
        auth: true,
        rateLimit: {
          windowMs: 60 * 1000, // 1 minuto
          max: 15, // 15 mensajes por minuto
        },
      },
      // Ruta para obtener estadísticas - requiere autenticación
      { path: '/classify/stats', auth: true },
    ],
  },
  {
    name: 'notifications',
    url: config.services.notifications,
    routes: [
      // Rutas para gestionar preferencias de notificaciones - requieren autenticación
      { path: '/preferences', auth: true },
      { path: '/history', auth: true },
      // Ruta para enviar notificaciones manuales - requiere autenticación
      { 
        path: '/send', 
        auth: true,
        rateLimit: {
          windowMs: 60 * 1000, // 1 minuto
          max: 5, // 5 peticiones por minuto
        }
      },
    ],
  },
];

export default services;