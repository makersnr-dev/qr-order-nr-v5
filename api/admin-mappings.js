// /api/admin-mappings.js
import { query } from './_lib/db.js';
import { verifyJWT } from '../src/shared/jwt.js';

export const config = { runtime: 'nodejs' };

function json(res, body, status = 200) {
  res.status(status).setHeader('content-type', 'application/json');
  return res.send(JSON.stringify(body));
}

async function assertSuper(req) {
  const auth = req.headers.authorization || '';
  let token = null;

  if (auth.startsWith('Bearer ')) {
    token = auth.slice(7);
  } else {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/super_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) {
    const e = new Error('NO_TOKEN');
    e.status = 401;
    throw e;
  }

  const secret = process.env.SUPER_JWT_SECRET || process.env.JWT_SECRET || 'super-secret-dev';
  const payload = await verifyJWT(token, secret);

  if (!payload || payload.realm !== 'super') {
    const e = new Error('NOT_SUPER');
    e.status = 403;
    throw e;
  }

  return payload;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handlePost(req, res);
    if (req.method === 'DELETE') return handleDelete(req, res);

    res.setHeader('Allow', 'GET,POST,DELETE');
    return json(res, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  } catch (err) {
    console.error('[admin-mappings] error:', err);
    return json(res, {
      ok: false,
      error: err.message || 'INTERNAL_ERROR'
    }, err.status || 500);
  }
}

// GET - 전체 매핑 조회
async function handleGet(req, res) {
  await assertSuper(req);

  try {
    const result = await query(`
      SELECT admin_key, store_id, note, created_at
      FROM admin_stores
      ORDER BY created_at DESC
    `);

    return json(res, { ok: true, mappings: result.rows });
  } catch (e) {
    console.error('[admin-mappings GET] error:', e);
    return json(res, { ok: false, error: 'DB_ERROR' }, 500);
  }
}

// POST - 매핑 추가/수정
async function handlePost(req, res) {
  await assertSuper(req);

  const { adminKey, storeId, note } = req.body || {};

  if (!adminKey || !storeId) {
    return json(res, { ok: false, error: 'INVALID_PARAMS' }, 400);
  }

  try {
    await query(`
      INSERT INTO admin_stores (admin_key, store_id, note)
      VALUES ($1, $2, $3)
      ON CONFLICT (admin_key, store_id)
      DO UPDATE SET note = EXCLUDED.note
    `, [adminKey, storeId, note || null]);

    return json(res, { ok: true });
  } catch (e) {
    console.error('[admin-mappings POST] error:', e);
    return json(res, { ok: false, error: 'DB_ERROR' }, 500);
  }
}

// DELETE - 매핑 삭제
async function handleDelete(req, res) {
  await assertSuper(req);

  const { adminKey, storeId } = req.body || {};

  if (!adminKey || !storeId) {
    return json(res, { ok: false, error: 'INVALID_PARAMS' }, 400);
  }

  try {
    await query(`
      DELETE FROM admin_stores
      WHERE admin_key = $1 AND store_id = $2
    `, [adminKey, storeId]);

    return json(res, { ok: true });
  } catch (e) {
    console.error('[admin-mappings DELETE] error:', e);
    return json(res, { ok: false, error: 'DB_ERROR' }, 500);
  }
}
