import nodemailer from 'nodemailer';

export interface RecoveryMail {available: boolean; send(email: string, token: string): Promise<void>}
export function createRecoveryMail(config: NodeJS.ProcessEnv = process.env, factory = nodemailer.createTransport): RecoveryMail {
  const disabled: RecoveryMail = {available: false, send: async () => {throw new Error('Recovery mail unavailable');}};
  if (config.RECOVERY_MAIL_ENABLED !== 'true' || config.HEALTHCHECK_DIAGNOSTIC === '1' || config.NODE_ENV === 'test') return disabled;
  const host = config.RECOVERY_SMTP_HOST, user = config.RECOVERY_SMTP_USER, pass = config.RECOVERY_SMTP_PASSWORD, from = config.RECOVERY_SMTP_FROM;
  const port = Number(config.RECOVERY_SMTP_PORT || 587);
  if (!host || !user || !pass || !from || ![465,587].includes(port)) return disabled;
  let origin: URL;
  try { origin = new URL(config.FRONTEND_URL || ''); } catch { return disabled; }
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') return disabled;
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost','127.0.0.1'].includes(origin.hostname))) return disabled;
  const transport = factory({host, port, secure: port === 465, requireTLS: true,
    auth: {user, pass}, tls: {rejectUnauthorized: true}, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false});
  return {available: true, async send(email, token) {
    const link = new URL('/reset-password', origin); link.hash = `token=${token}`;
    const result = await transport.sendMail({from, to: email, subject: 'Recupera tu acceso a HealthCheck',
      text: `Solicitaste cambiar tu contraseña en HealthCheck.\n\n${link.href}\n\nEl enlace vence en 15 minutos y solo puede usarse una vez. Se cerrarán las sesiones de todos tus dispositivos. Si no lo solicitaste, ignora este correo.`});
    if (!result.accepted?.length || result.rejected?.length) throw new Error('Recovery message not accepted');
  }};
}
