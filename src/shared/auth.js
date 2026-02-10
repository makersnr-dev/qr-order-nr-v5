import { verifyJWT } from './jwt.js';

export async function getAuthFromReq(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;

  const token = auth.slice(7);
  try {
    const payload = await verifyJWT(
      token,
      process.env.JWT_SECRET
    );
    return payload || null;
  } catch {
    return null;
  }
}
