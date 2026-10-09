import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import env from '../config/env';
import type User from '../models/User';
import { recoveryTokens } from '../account/security';

// Deliberately process-local: a restart expires every session, never revives one.
// All validators must use this Auth instance. No replica-local JWT fallback.
const sessions = new Map<string, { userId: number; expires: number; credential: string }>();
const fingerprint = (user: User) => createHmac('sha256', env.jwtSecret)
  .update(JSON.stringify([user.id, user.contrasena || null, user.google_id || null])).digest('hex');
function prune() {
  const now = Date.now();
  for (const [id, session] of sessions) if (session.expires <= now) sessions.delete(id);
}
export function issueSession(user: User, seconds: number): string {
  prune();
  if (!user.activo || !['admin', 'usuario'].includes(user.rol)) throw new Error('Cuenta no disponible');
  if (sessions.size >= 10000) throw new Error('Capacidad de sesiones agotada');
  const id = randomUUID();
  sessions.set(id, {userId:user.id, expires:Date.now() + seconds * 1000, credential:fingerprint(user)});
  return id;
}
export function validSession(id: unknown, user: User): boolean {
  prune();
  if (typeof id !== 'string') return false;
  const session = sessions.get(id);
  if (!session || session.userId !== user.id) return false;
  if (!user.activo) {
    revokeUserSessions(user.id);
    return false;
  }
  const currentCredential = fingerprint(user);
  if (!timingSafeEqual(Buffer.from(session.credential), Buffer.from(currentCredential))) {
    // A request from an old password/OAuth identity must never revoke sessions
    // that have already authenticated with the new credentials.
    for (const [key, previous] of sessions) {
      if (previous.userId === user.id && previous.credential !== currentCredential) sessions.delete(key);
    }
    return false;
  }
  return ['admin', 'usuario'].includes(user.rol);
}
export function revokeSession(id: string) { sessions.delete(id); }
export function revokeUserSessions(userId: number) {
  recoveryTokens.revoke(userId);
  for (const [id, session] of sessions) if (session.userId === userId) sessions.delete(id);
}
