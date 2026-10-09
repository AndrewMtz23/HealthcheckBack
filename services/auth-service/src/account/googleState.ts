import {randomBytes} from 'crypto';
import {Request} from 'express';
import {digest} from './security';

// Passport OAuth2 store API; arity is significant (store=2, verify=3).
export class GoogleStateStore {
  private entries = new Map<string, {binding: string; expires: number}>();
  constructor(private secure: boolean, private now = Date.now) {}
  private options() {return {httpOnly:true, sameSite:'lax' as const, secure:this.secure, path:'/api/auth/google'};}
  private prune() {for (const [key, entry] of this.entries) if (entry.expires <= this.now()) this.entries.delete(key);}
  store(req: Request, callback: (error: Error | null, state?: string) => void) {
    this.prune();
    if (this.entries.size >= 10000 || !req.res) return callback(new Error('OAuth temporarily unavailable'));
    const state = randomBytes(32).toString('hex'), binding = randomBytes(32).toString('hex');
    this.entries.set(digest(state), {binding:digest(binding), expires:this.now() + 600000});
    req.res.cookie('hc_google_state', binding, {...this.options(), maxAge:600000});
    callback(null, state);
  }
  verify(req: Request, state: unknown, callback: (error: Error | null, valid: boolean) => void) {
    this.prune();
    const cookie = req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('hc_google_state='))?.slice('hc_google_state='.length);
    if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state) || !cookie) return callback(null, false);
    const key = digest(state), entry = this.entries.get(key);
    if (!entry || entry.binding !== digest(cookie)) return callback(null, false);
    this.entries.delete(key);
    req.res?.clearCookie('hc_google_state', this.options());
    callback(null, true);
  }
}
