import {createHmac, timingSafeEqual} from 'crypto';
import {isIP} from 'net';
import {Request} from 'express';

export function recoveryClient(req: Request, secret: string, now = Date.now()): string {
  const ip = req.headers['x-auth-client-ip'], time = req.headers['x-auth-client-time'], proof = req.headers['x-auth-client-proof'];
  if (secret.length >= 16 && secret !== 'default_secret_key' && typeof ip === 'string' && isIP(ip) && typeof time === 'string' && /^\d{13}$/.test(time)
      && Math.abs(now - Number(time)) <= 30000 && typeof proof === 'string' && /^[a-f0-9]{64}$/.test(proof)) {
    const expected = createHmac('sha256', secret).update(`healthcheck-recovery-client\n${time}\n${ip}`).digest('hex');
    if (timingSafeEqual(Buffer.from(proof), Buffer.from(expected))) return ip;
  }
  return req.ip || 'unknown';
}
