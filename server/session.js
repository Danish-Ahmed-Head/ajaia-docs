import crypto from 'node:crypto';

const COOKIE = 'sid';
const MAX_AGE_S = 7 * 24 * 60 * 60;

/** Stateless signed session: cookie value is "<userId>.<HMAC-SHA256(userId)>", so it can't be forged or edited. */
export function sessions(secret, { secure }) {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  const mac = (v) => crypto.createHmac('sha256', secret).update(v).digest('base64url');
  const attrs = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

  return {
    /** @returns {number|null} the verified user id, or null for a missing, malformed or tampered cookie */
    read(req) {
      const raw = (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
      const [id, sig] = raw?.split('.') ?? [];
      if (!/^\d+$/.test(id ?? '') || !sig) return null;
      const expected = Buffer.from(mac(id));
      const given = Buffer.from(sig);
      return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? Number(id) : null;
    },
    set(res, userId) {
      res.append('Set-Cookie', `${COOKIE}=${userId}.${mac(String(userId))}; Max-Age=${MAX_AGE_S}; ${attrs}`);
    },
    clear(res) {
      res.append('Set-Cookie', `${COOKIE}=; Max-Age=0; ${attrs}`);
    },
  };
}
