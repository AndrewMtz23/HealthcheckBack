import {Router} from 'express';
import {body, validationResult} from 'express-validator';
import User from '../models/User';
import sequelize from '../config/db';
import {authenticate} from '../middleware/auth';
import {revokeUserSessions} from '../utils/sessions';
import {createRecoveryMail, RecoveryMail} from './mail';
import {digest, recoveryTokens, RecoveryTokens, RequestLimits, validPassword} from './security';
import env from '../config/env';
import {recoveryClient} from './clientIdentity';

const credential = (user: User) => digest(JSON.stringify([user.contrasena, user.email, user.google_id]));
const accepted = {status: 'success', message: 'Si la cuenta permite recuperar la contraseña, recibirás un enlace por correo. Revisa también spam. Si usas Google, recupera el acceso desde Google.'};
const invalid = {status: 'error', message: 'El enlace no es válido o ha vencido. Solicita uno nuevo.'};

export function createRecoveryRouter(mail: RecoveryMail = createRecoveryMail(), tokens: RecoveryTokens = recoveryTokens) {
  const router = Router(), addresses = new RequestLimits(3, 15 * 60 * 1000), ips = new RequestLimits(40, 15 * 60 * 1000);
  const changes = new RequestLimits(5, 15 * 60 * 1000);
  let pending = 0;
  router.use((_req, res, next) => {res.setHeader('Cache-Control', 'no-store'); next();});
  router.use((req, res, next) => {
    if (req.method !== 'POST' || !['/forgot','/reset','/change'].includes(req.path)) {next();return;}
    // Only a current gateway signature can supply a client identity. Raw
    // forwarded headers never bypass the direct-service address limit.
    if (!ips.allow(recoveryClient(req, env.jwtSecret))) {res.status(429).json({status:'error', message:'Demasiados intentos. Vuelve a intentarlo en 15 minutos.'}); return;}
    next();
  });
  router.post('/forgot', body('email').isString().isLength({max:254}).isEmail(), (req, res) => {
    if (!validationResult(req).isEmpty()) {res.status(400).json({status:'error',message:'Escribe un correo válido.'});return;}
    if (!mail.available || pending >= 20) {res.status(503).json({status:'error',message:'La recuperación no está disponible temporalmente. Intenta más tarde.'});return;}
    const email = req.body.email.trim();
    // Reply before account lookup or SMTP. Delivery latency/errors never reveal
    // account existence, and a bounded queue prevents unbounded background work.
    res.status(202).json(accepted);
    if (!addresses.allow(email.toLowerCase())) return;
    pending++;
    setImmediate(async () => {
      let token: string | undefined;
      try {
        const user = await User.findOne({where:{email}});
        if (!user?.activo || !user.contrasena) return;
        token = tokens.issue(user.id, credential(user));
        await mail.send(user.email, token);
      } catch {
        if (token) tokens.discard(token);
        console.error('Recovery delivery failed'); // Never log SMTP errors, addresses or tokens.
      } finally {pending--;}
    });
  });
  router.post('/reset', async (req, res) => {
    if (!validPassword(req.body.contrasena)) {res.status(400).json({status:'error',message:'La contraseña debe tener al menos 8 caracteres y como máximo 72 bytes.'});return;}
    const ticket = tokens.take(req.body.token);
    if (!ticket) {res.status(400).json(invalid);return;}
    try {
      const changed = await sequelize.transaction(async transaction => {
        const user = await User.findByPk(ticket.userId, {transaction, lock:transaction.LOCK.UPDATE});
        if (!user?.activo || !user.contrasena || credential(user) !== ticket.credential || ticket.expires <= Date.now()) return false;
        user.contrasena = req.body.contrasena;
        await user.save({transaction});
        transaction.afterCommit(() => {revokeUserSessions(user.id);tokens.revoke(user.id);});
        return true;
      });
      res.status(changed ? 200 : 400).json(changed ? {status:'success',message:'Contraseña actualizada. Inicia sesión de nuevo en tus dispositivos.'} : invalid);
    } catch {res.status(503).json({status:'error',message:'No se pudo actualizar la contraseña. Solicita un nuevo enlace e inténtalo más tarde.'});}
  });
  router.post('/change', authenticate, async (req, res) => {
    const id = (req.user as User).id;
    if (!changes.allow(String(id))) {res.status(429).json({status:'error',message:'Demasiados intentos. Vuelve a intentarlo en 15 minutos.'});return;}
    if (!validPassword(req.body.contrasena) || typeof req.body.actual !== 'string' || Buffer.byteLength(req.body.actual) > 72) {
      res.status(400).json({status:'error',message:'Introduce tu contraseña actual y una nueva de al menos 8 caracteres y como máximo 72 bytes.'});return;
    }
    try {
      const changed = await sequelize.transaction(async transaction => {
        const user = await User.findByPk(id, {transaction, lock:transaction.LOCK.UPDATE});
        if (!user?.activo || !user.contrasena || !(await user.isValidPassword(req.body.actual))) return false;
        user.contrasena = req.body.contrasena;
        await user.save({transaction});
        transaction.afterCommit(() => {revokeUserSessions(id);tokens.revoke(id);});
        return true;
      });
      res.status(changed ? 200 : 400).json(changed ? {status:'success',message:'Contraseña actualizada. Inicia sesión de nuevo en tus dispositivos.'} : {status:'error',message:'No se pudo cambiar la contraseña. Comprueba tu contraseña actual. Las cuentas Google se administran desde Google.'});
    } catch {res.status(503).json({status:'error',message:'No se pudo cambiar la contraseña. Intenta más tarde.'});}
  });
  return router;
}
