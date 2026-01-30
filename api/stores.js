// /api/stores.js
import { query } from './_lib/db.js';
import { verifyJWT } from '../src/shared/jwt.js';

export const config = { runtime: "nodejs" };

function json(res, body, status = 200) {
  res.status(status).setHeader("content-type", "application/json");
  return res.send(JSON.stringify(body));
}

// SUPER 관리자 확인
async function assertSuper(req) {
  const auth = req.headers.authorization || "";
  
  if (!auth.startsWith("Bearer ")) {
    // 쿠키에서도 확인
    const cookie = req.headers.cookie || "";
    const match = cookie.match(/super_token=([^;]+)/);
    if (!match) {
      const e = new Error("NO_TOKEN");
      e.status = 401;
      throw e;
    }
    
    const token = match[1];
    const secret = process.env.SUPER_JWT_SECRET || process.env.JWT_SECRET || "super-secret-dev";
    const payload = await verifyJWT(token, secret);
    
    if (!payload || payload.realm !== "super") {
      const e = new Error("NOT_SUPER");
      e.status = 403;
      throw e;
    }
    
    return payload;
  }

  const token = auth.slice(7);
  const secret = process.env.SUPER_JWT_SECRET || process.env.JWT_SECRET || "super-secret-dev";
  const payload = await verifyJWT(token, secret);

  if (!payload || payload.realm !== "super") {
    const e = new Error("NOT_SUPER");
    e.status = 403;
    throw e;
  }

  return payload;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") return handleGet(req, res);
    if (req.method === "POST") return handlePost(req, res);
    if (req.method === "PUT") return handlePut(req, res);
    if (req.method === "DELETE") return handleDelete(req, res);
    
    res.setHeader("Allow", "GET,POST,PUT,DELETE");
    return json(res, { ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  } catch (err) {
    console.error("[stores] error", err);
    return json(res, {
      ok: false,
      error: err.message || "INTERNAL_ERROR"
    }, err.status || 500);
  }
}

// GET - 매장 목록 조회
async function handleGet(req, res) {
  try {
    const result = await query(`
      SELECT store_id, name, code, created_at, updated_at
      FROM stores
      ORDER BY created_at DESC
    `);

    const stores = {};
    result.rows.forEach(row => {
      stores[row.store_id] = {
        name: row.name,
        code: row.code,
      };
    });

    return json(res, { ok: true, stores });
  } catch (e) {
    console.error('[stores GET] error:', e);
    return json(res, { ok: false, error: 'DB_ERROR' }, 500);
  }
}

// POST - 매장 생성
async function handlePost(req, res) {
  await assertSuper(req);
  
  const { storeId, code, name } = req.body || {};

  if (!storeId || !code) {
    return json(res, {
      ok: false,
      error: "INVALID_PARAMS"
    }, 400);
  }

  try {
    // 중복 확인
    const existing = await query(
      'SELECT store_id FROM stores WHERE store_id = $1',
      [storeId]
    );

    if (existing.rows.length > 0) {
      return json(res, {
        ok: false,
        error: "STORE_ALREADY_EXISTS"
      }, 400);
    }

    // 생성
    await query(`
      INSERT INTO stores (store_id, name, code)
      VALUES ($1, $2, $3)
    `, [storeId, name || '', code.toUpperCase()]);

    return json(res, { 
      ok: true, 
      store: { name: name || '', code: code.toUpperCase() }
    });
  } catch (e) {
    console.error('[stores POST] error:', e);
    return json(res, { ok: false, error: 'DB_ERROR' }, 500);
  }
}

// PUT - 매장 수정
async function handlePut(req, res) {
  await assertSuper(req);
  
  const { storeId, code, name } = req.body || {};

  if (!storeId) {
    return json(res, {
      ok: false,
      error: "MISSING_STORE_ID"
    }, 400);
  }

  try {
    const sets = [];
    const values = [];
    let idx = 1;

    if (code !== undefined) {
      sets.push(`code = $${idx++}`);
      values.push(code.toUpperCase());
    }
    
    if (name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(name);
    }

    if (sets.length === 0) {
      return json(res, { ok: false, error: "NO_FIELDS_TO_UPDATE" }, 400);
    }

    sets.push(`updated_at = NOW()`);
    values.push(storeId);

    const result = await query(`
      UPDATE stores
      SET ${sets.join(', ')}
      WHERE store_id = $${idx}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return json(res, {
        ok: false,
        error: "STORE_NOT_FOUND"
      }, 404);
    }

    const updated = result.rows[0];
    return json(res, { 
      ok: true, 
      store: { name: updated.name, code: updated.code }
    });
  } catch (e) {
    console.error('[stores PUT] error:', e);
    return json(res, { ok: false, error: 'DB_ERROR' }, 500);
  }
}

// DELETE - 매장 삭제
async function handleDelete(req, res) {
  await assertSuper(req);
  
  const { storeId } = req.body || {};

  if (!storeId) {
    return json(res, {
      ok: false,
      error: "MISSING_STORE_ID"
    }, 400);
  }

  try {
    const result = await query(
      'DELETE FROM stores WHERE store_id = $1 RETURNING store_id',
      [storeId]
    );

    if (result.rows.length === 0) {
      return json(res, {
        ok: false,
        error: "STORE_NOT_FOUND"
      }, 404);
    }

    return json(res, { ok: true });
  } catch (e) {
    console.error('[stores DELETE] error:', e);
    return json(res, { ok: false, error: 'DB_ERROR' }, 500);
  }
}
