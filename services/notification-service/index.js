// notification-service/index.js
const express = require('express');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const cron = require('node-cron');
require('dotenv').config();

// Inicializar la aplicación Express
const app = express();
app.use(express.json());

// Configuración de la conexión a la base de datos
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Configuración del cliente de Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Configuración del cliente de correo electrónico
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Endpoint de estado
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// Endpoint para obtener las preferencias de notificación de un usuario
app.get('/api/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Obtener preferencias y temas de interés en dos consultas paralelas
    const [preferencesResult, topicsResult] = await Promise.all([
      pool.query('SELECT id, recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion FROM preferencias_usuario WHERE usuario_id = $1', [userId]),
      pool.query('SELECT put.id, t.id as tema_id, t.nombre as tema_nombre FROM preferencias_usuario_temas put JOIN temas t ON put.tema_id = t.id WHERE put.usuario_id = $1', [userId])
    ]);
    
    res.json({
      preferences: preferencesResult.rows[0] || null,
      topics: topicsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener preferencias' });
  }
});

// Endpoint para actualizar preferencias generales de notificación
app.put('/api/preferences/:userId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId } = req.params;
    const { recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion } = req.body;
    
    await client.query('BEGIN');
    
    // Verificar si existen preferencias y actualizarlas o crearlas
    const checkResult = await client.query('SELECT id FROM preferencias_usuario WHERE usuario_id = $1', [userId]);
    
    if (checkResult.rows.length > 0) {
      await client.query(
        'UPDATE preferencias_usuario SET recibir_notificaciones = $1, frecuencia_notificaciones = $2, tipo_notificacion = $3, updated_at = NOW() WHERE usuario_id = $4',
        [recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion, userId]
      );
    } else {
      await client.query(
        'INSERT INTO preferencias_usuario (usuario_id, recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
        [userId, recibir_notificaciones, frecuencia_notificaciones, tipo_notificacion]
      );
    }
    
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al actualizar preferencias' });
  } finally {
    client.release();
  }
});

// Endpoint para gestionar temas de interés del usuario
app.post('/api/preferences/:userId/topics', async (req, res) => {
  try {
    const { userId } = req.params;
    const { tema_id } = req.body;
    
    await pool.query(
      'INSERT INTO preferencias_usuario_temas (usuario_id, tema_id) VALUES ($1, $2) ON CONFLICT (usuario_id, tema_id) DO NOTHING',
      [userId, tema_id]
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al agregar tema de interés' });
  }
});

// Endpoint para eliminar un tema de interés del usuario
app.delete('/api/preferences/:userId/topics/:topicId', async (req, res) => {
  try {
    const { userId, topicId } = req.params;
    
    await pool.query(
      'DELETE FROM preferencias_usuario_temas WHERE usuario_id = $1 AND tema_id = $2',
      [userId, topicId]
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar tema de interés' });
  }
});

// Endpoint para enviar una notificación
app.post('/api/send', async (req, res) => {
  try {
    const { usuario_id, noticia_id, titulo, mensaje } = req.body;
    
    // Obtener preferencias del usuario
    const userResult = await pool.query(
      'SELECT u.email, u.telefono, pu.tipo_notificacion FROM usuarios u LEFT JOIN preferencias_usuario pu ON u.id = pu.usuario_id WHERE u.id = $1',
      [usuario_id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const { email, telefono, tipo_notificacion } = userResult.rows[0];
    
    // Determinar el tipo de notificación
    let tipo = tipo_notificacion || 'email';
    if ((tipo === 'email' && !email) || (tipo === 'sms' && !telefono)) {
      tipo = (tipo === 'email' && telefono) ? 'sms' : (tipo === 'sms' && email) ? 'email' : 'email';
    }
    
    // Registrar la notificación en la base de datos
    const notificationResult = await pool.query(
      'INSERT INTO notificaciones (usuario_id, noticia_id, titulo, mensaje, tipo, enviada, fecha_creacion) VALUES ($1, $2, $3, $4, $5, FALSE, NOW()) RETURNING id',
      [usuario_id, noticia_id || null, titulo, mensaje, tipo]
    );
    
    const notificationId = notificationResult.rows[0].id;
    
    // Enviar la notificación inmediatamente
    let success = false;
    
    if (tipo === 'email' && email) {
      await sendEmail(email, titulo, mensaje);
      success = true;
    } else if (tipo === 'sms' && telefono) {
      const smsMessage = formatSMSMessage(titulo, mensaje);
      await sendSMS(telefono, smsMessage);
      success = true;
    }
    
    // Actualizar el estado de la notificación
    if (success) {
      await pool.query(
        'UPDATE notificaciones SET enviada = TRUE, fecha_envio = NOW() WHERE id = $1',
        [notificationId]
      );
    }
    
    res.json({ success, notification_id: notificationId });
  } catch (error) {
    res.status(500).json({ error: 'Error al enviar notificación' });
  }
});

// Endpoint para obtener notificaciones de un usuario
app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, page = 1 } = req.query;
    
    const offset = (page - 1) * limit;
    
    const [notificationsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT n.id, n.titulo, n.mensaje, n.tipo, n.enviada, n.fecha_creacion, n.fecha_envio,
                n.noticia_id, no.titulo as noticia_titulo
         FROM notificaciones n
         LEFT JOIN noticias no ON n.noticia_id = no.id
         WHERE n.usuario_id = $1
         ORDER BY n.fecha_creacion DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      pool.query('SELECT COUNT(*) FROM notificaciones WHERE usuario_id = $1', [userId])
    ]);
    
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      data: notificationsResult.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

// Función para formatear mensaje SMS para que no exceda 160 caracteres
function formatSMSMessage(titulo, mensaje) {
  const fullMessage = `${titulo}: ${mensaje}`;
  // Limitar a 157 caracteres para dejar espacio para puntos suspensivos si es necesario
  return fullMessage.length <= 157 ? fullMessage : `${fullMessage.substring(0, 157)}...`;
}

// Función para enviar correo electrónico
async function sendEmail(to, subject, body) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333;">${subject}</h2>
        <div style="color: #555; line-height: 1.5;">
          ${body}
        </div>
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #777; font-size: 12px;">
          Este es un mensaje automático de HealthCheck. Por favor, no responda a este correo.
        </div>
      </div>
    `
  };
  
  await emailTransporter.sendMail(mailOptions);
  return true;
}

// Función para enviar SMS
async function sendSMS(to, message) {
  let formattedNumber = to;
  if (!to.startsWith('+')) {
    formattedNumber = `+${to}`;
  }
  
  await twilioClient.messages.create({
    body: message,
    from: twilioPhoneNumber,
    to: formattedNumber
  });
  
  return true;
}

// Función para verificar y enviar notificaciones pendientes
async function processUnsentNotifications() {
  const client = await pool.connect();
  
  try {
    // Obtener notificaciones pendientes
    const pendingResult = await client.query(
      `SELECT n.id, n.usuario_id, n.titulo, n.mensaje, n.tipo, u.email, u.telefono
       FROM notificaciones n
       JOIN usuarios u ON n.usuario_id = u.id
       WHERE n.enviada = FALSE
       ORDER BY n.fecha_creacion ASC
       LIMIT 50`
    );
    
    for (const notification of pendingResult.rows) {
      const { id, tipo, email, telefono, titulo, mensaje } = notification;
      let success = false;
      
      try {
        if (tipo === 'email' && email) {
          await sendEmail(email, titulo, mensaje);
          success = true;
        } else if (tipo === 'sms' && telefono) {
          const smsMessage = formatSMSMessage(titulo, mensaje);
          await sendSMS(telefono, smsMessage);
          success = true;
        }
        
        if (success) {
          await client.query(
            'UPDATE notificaciones SET enviada = TRUE, fecha_envio = NOW() WHERE id = $1',
            [id]
          );
        }
      } catch (error) {
        // Continuar con la siguiente notificación en caso de error
      }
    }
  } finally {
    client.release();
  }
}

// Función para generar notificaciones automáticas sobre noticias falsas
async function generateFalseNewsNotifications() {
  const client = await pool.connect();
  
  try {
    // Obtener usuarios con notificaciones activas
    const usersResult = await client.query(
      `SELECT u.id, u.email, u.telefono, pu.tipo_notificacion, pu.frecuencia_notificaciones
       FROM usuarios u
       JOIN preferencias_usuario pu ON u.id = pu.usuario_id
       WHERE u.activo = TRUE AND pu.recibir_notificaciones = TRUE`
    );
    
    for (const user of usersResult.rows) {
      // Obtener temas de interés del usuario
      const userTopicsResult = await client.query(
        `SELECT t.id FROM preferencias_usuario_temas put
         JOIN temas t ON put.tema_id = t.id
         WHERE put.usuario_id = $1 AND t.activo = TRUE`,
        [user.id]
      );
      
      if (userTopicsResult.rows.length === 0) continue;
      
      const topicIds = userTopicsResult.rows.map(topic => topic.id);
      
      // Determinar el intervalo de tiempo según frecuencia
      let timeRange;
      switch (user.frecuencia_notificaciones) {
        case 'inmediata': timeRange = '1 hour'; break;
        case 'diaria': timeRange = '24 hours'; break;
        case 'semanal': timeRange = '7 days'; break;
        default: timeRange = '24 hours';
      }
      
      // Buscar noticias falsas recientes
      const noticiasResult = await client.query(
        `SELECT n.id, n.titulo, t.nombre as tema_nombre, cn.confianza
         FROM noticias n
         JOIN clasificacion_noticias cn ON n.id = cn.noticia_id
         JOIN temas t ON n.tema_id = t.id
         WHERE n.tema_id = ANY($1)
           AND n.created_at > NOW() - INTERVAL '${timeRange}'
           AND cn.resultado = 'falsa'
           AND n.id NOT IN (
             SELECT noticia_id FROM notificaciones
             WHERE usuario_id = $2 AND noticia_id IS NOT NULL
           )
         ORDER BY cn.confianza DESC, n.created_at DESC
         LIMIT 3`,
        [topicIds, user.id]
      );
      
      // Crear y enviar notificaciones
      for (const noticia of noticiasResult.rows) {
        const titulo = `Alerta: ${noticia.tema_nombre}`;
        const mensaje = `HealthCheck ha detectado información falsa: "${noticia.titulo}" (${noticia.confianza}% de probabilidad)`;
        
        // Determinar tipo de notificación
        let tipo = user.tipo_notificacion || 'email';
        if ((tipo === 'email' && !user.email) || (tipo === 'sms' && !user.telefono)) {
          if (tipo === 'email' && user.telefono) tipo = 'sms';
          else if (tipo === 'sms' && user.email) tipo = 'email';
          else continue;
        }
        
        // Crear notificación
        const notifResult = await client.query(
          `INSERT INTO notificaciones
           (usuario_id, noticia_id, titulo, mensaje, tipo, enviada, fecha_creacion)
           VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
           RETURNING id`,
          [user.id, noticia.id, titulo, mensaje, tipo]
        );
        
        // Enviar inmediatamente
        const notificationId = notifResult.rows[0].id;
        let success = false;
        
        try {
          if (tipo === 'email' && user.email) {
            await sendEmail(user.email, titulo, mensaje);
            success = true;
          } else if (tipo === 'sms' && user.telefono) {
            const smsMessage = formatSMSMessage(titulo, mensaje);
            await sendSMS(user.telefono, smsMessage);
            success = true;
          }
          
          if (success) {
            await client.query(
              'UPDATE notificaciones SET enviada = TRUE, fecha_envio = NOW() WHERE id = $1',
              [notificationId]
            );
          }
        } catch (error) {
          // Continuar con la siguiente notificación en caso de error
        }
      }
    }
  } finally {
    client.release();
  }
}

// Configurar la tarea programada para procesar notificaciones pendientes y generar nuevas
cron.schedule('*/15 * * * *', async () => {
  try {
    await processUnsentNotifications();
    await generateFalseNewsNotifications();
  } catch (error) {
    // Continuar en caso de error
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Servicio iniciado en puerto ${PORT}`);
  
  // Ejecutar inmediatamente al iniciar el servicio
  console.log('Ejecutando verificación inicial de notificaciones...');
  try {
    await processUnsentNotifications();
    await generateFalseNewsNotifications();
    console.log('Verificación inicial completada');
  } catch (error) {
    console.error('Error en verificación inicial:', error);
  }
});