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
      { path: '/classify/predict', auth: true },
      { path: '/classify/scrape/google', auth: true },
      { path: '/classify/scrape/twitter', auth: true },
      { path: '/train/train', auth: true },
      { path: '/train/models', auth: true },
      { path: '/train/models/:model_id/activate', auth: true },
      { path: '/train/models/:model_id', auth: true },
      { path: '/chatbot/chat', auth: true },
    ],
  },
  {
    name: 'notifications',
    url: config.services.notifications,
    routes: [
      // Rutas de preferencias - todas requieren autenticación
      { path: '/preferences/:userId', auth: true },
      { path: '/preferences/:userId/topics', auth: true },
      { path: '/preferences/:userId/topics/:topicId', auth: true },
      { path: '/preferences/topics/all', auth: true },
      
      // Rutas de notificaciones - todas requieren autenticación
      { path: '/notifications/:userId', auth: true },
    ],
  },
];

export default services;