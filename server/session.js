import crypto from 'node:crypto';

const COOKIE = 'sid';
const MAX_AGE_S = 7 * 24 * 60 * 60;

/**
 * Stateless signed session: cookie value is "<userId>.<issuedAt>.<HMAC-SHA256(userId.issuedAt)>".
 * It can't be forged or edited, and the server enforces the 7-day expiry itself (a copied cookie stops working).
 */
export function sessions(secret, { secure }) {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  const mac = (v) => crypto.createHmac('sha256', secret).update(v).digest('base64url');
  const attrs = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  const nowS = () => Math.floor(Date.now() / 1000);

  return {
    /** @returns {number|null} the verified user id, or null for a missing, malformed, tampered or expired cookie */
    read(req) {
      const raw = (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
      const [id, iat, sig] = raw?.split('.') ?? [];
      if (!/^\d+$/.test(id ?? '') || !/^\d+$/.test(iat ?? '') || !sig) return null;
      if (nowS() - Number(iat) > MAX_AGE_S) return null;
      const expected = Buffer.from(mac(`${id}.${iat}`));
      const given = Buffer.from(sig);
      return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? Number(id) : null;
    },
    set(res, userId) {
      const value = `${userId}.${nowS()}`;
      res.append('Set-Cookie', `${COOKIE}=${value}.${mac(value)}; Max-Age=${MAX_AGE_S}; ${attrs}`);
    },
    clear(res) {
      res.append('Set-Cookie', `${COOKIE}=; Max-Age=0; ${attrs}`);
    },
  };
}
