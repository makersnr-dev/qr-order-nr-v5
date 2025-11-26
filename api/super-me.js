// /api/super-me.js
import { getIronSession } from 'iron-session';

const sessionOptions = {
  cookieName: 'qrnr_sess',
  password:
    process.env.SESSION_PASSWORD ||
    'change-me-32-characters-min-secret!!!!',
  cookieOptions: {
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
  },
};

export default async function handler(req, res) {
  try {
    const session = await getIronSession(req, res, sessionOptions);
    const isSuper = !!session.isSuper;
    return res.json({
      ok: true,
      isSuper,
      superId: isSuper ? session.superId : null,
    });
  } catch (err) {
    console.error('[super-me] error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'INTERNAL_ERROR' });
  }
}
