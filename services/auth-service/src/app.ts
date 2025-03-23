import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { connectDB } from './config/db';
import authRoutes from './routes/authRoutes';
import passport from './config/passport';
import env from './config/env';

// Crear aplicación Express
const app = express();

// Conectar a la base de datos
connectDB();

// Middleware
app.use(helmet()); // Seguridad HTTP
app.use(cors({
  origin: env.frontendUrl,
  credentials: true
})); // Configuración de CORS
app.use(express.json()); // Parseo de JSON
app.use(express.urlencoded({ extended: true })); // Parseo de formularios

// Inicializar Passport
app.use(passport.initialize());

// Rutas
app.use('/api/auth', authRoutes);

// Ruta de estado de la API
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API de autenticación funcionando correctamente',
    timestamp: new Date(),
    environment: env.nodeEnv,
  });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Ruta no encontrada',
  });
});

// Manejo de errores
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error no controlado:', err);
  res.status(500).json({
    status: 'error',
    message: 'Error interno del servidor',
  });
});

// Iniciar servidor
const PORT = env.port;
app.listen(PORT, () => {
  console.log(`✅ Servidor de autenticación ejecutándose en el puerto ${PORT} (${env.nodeEnv})`);
});

export default app;