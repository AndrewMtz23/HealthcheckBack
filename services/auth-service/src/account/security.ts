import {createHash, randomBytes} from 'crypto';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const validPassword = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;

type Ticket = {userId: number; credential: string; expires: number};
export class RecoveryTokens {
  private entries = new Map<string, Ticket>();
  constructor(private now = Date.now) {}
  private prune() { for (const [key, entry] of this.entries) if (entry.expires <= this.now()) this.entries.delete(key); }
  issue(userId: number, credential: string) {
    this.prune(); this.revoke(userId);
    if (this.entries.size >= 10000) throw new Error('Recovery capacity exceeded');
    const token = randomBytes(32).toString('hex');
    this.entries.set(digest(token), {userId, credential, expires: this.now() + 15 * 60 * 1000});
    return token;
  }
  take(token: unknown) {
    this.prune();
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return;
    const key = digest(token), entry = this.entries.get(key);
    this.entries.delete(key); // Atomic claim before any asynchronous database operation.
    return entry;
  }
  discard(token: string) { this.entries.delete(digest(token)); }
  revoke(userId: number) { for (const [key, entry] of this.entries) if (entry.userId === userId) this.entries.delete(key); }
}

export class RequestLimits {
  private entries = new Map<string, {count: number; expires: number}>();
  constructor(private maximum: number, private window: number, private capacity = 10000, private now = Date.now) {}
  allow(identity: string) {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expires <= now) this.entries.delete(key);
    const key = digest(identity), entry = this.entries.get(key);
    if (entry) return ++entry.count <= this.maximum;
    if (this.entries.size >= this.capacity) return false;
    this.entries.set(key, {count: 1, expires: now + this.window}); return true;
  }
}
export const recoveryTokens = new RecoveryTokens();
