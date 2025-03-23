import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import apiRouter from './routes'; // Cambiado el nombre para evitar colisiones
import config from './config';
import corsOptions from './config/cors';
import { httpLogger, errorLogger } from './middleware/logger';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { defaultRateLimit } from './middleware/rateLimit';

// Crear la aplicación Express
const app = express();

// Middlewares de seguridad y optimización
app.use(helmet()); // Protección de cabeceras HTTP
app.use(cors(corsOptions)); // CORS
app.use(compression()); // Compresión de respuestas
app.use(express.json()); // Parseo de body JSON
app.use(express.urlencoded({ extended: true })); // Parseo de formularios

// Logging de solicitudes HTTP
app.use(httpLogger);

// Rate limiting global por defecto
app.use(defaultRateLimit);

// Rutas - usando apiRouter explícitamente para evitar ambigüedades
app.use(apiRouter);

// Manejo de rutas no encontradas
app.use(notFoundHandler);

// Manejo de errores
app.use(errorLogger);
app.use(errorHandler);

// Iniciar el servidor
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`✅ API Gateway ejecutándose en el puerto ${PORT} (${config.nodeEnv})`);
});

export default app;