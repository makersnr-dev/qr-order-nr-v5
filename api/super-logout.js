// /api/super-logout.js
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const session = await getIronSession(req, res, sessionOptions);
    session.isSuper = false;
    session.superId = null;
    await session.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[super-logout] error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'INTERNAL_ERROR' });
  }
}
