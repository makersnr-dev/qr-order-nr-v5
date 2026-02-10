// /api/admin/get-mapping.js
// 관리자의 매장 매핑 조회 API

import { verifyJWT } from "../../src/shared/jwt.js";
import { Pool } from '@neondatabase/serverless';

export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // ─────────────────────────────
  // 1) JWT 토큰 검증
  // ─────────────────────────────
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  
  if (!token) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const secret = process.env.JWT_SECRET;
  let payload;
  try {
    payload = await verifyJWT(token, secret);
  } catch {
    return json({ ok: false, error: "INVALID_TOKEN" }, 401);
  }

  // ─────────────────────────────
  // 2) body에서 adminId 읽기
  // ─────────────────────────────
  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }

  const adminId = (body.adminId || "").trim();
  if (!adminId) {
    return json({ ok: false, error: "ADMIN_ID_REQUIRED" }, 400);
  }

  // ─────────────────────────────
  // 3) DB에서 매핑 조회
  // ─────────────────────────────
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return json({ ok: false, error: "NO_DATABASE" }, 500);
  }

  let pool;
  try {
    pool = new Pool({ connectionString: dbUrl });
    
    const result = await pool.query(
      `SELECT store_id, is_default 
       FROM admin_store_mapping 
       WHERE admin_id = $1 
       ORDER BY is_default DESC, created_at ASC 
       LIMIT 1`,
      [adminId]
    );

    if (result.rows.length === 0) {
      return json({ 
        ok: true, 
        storeId: null,
        message: "매핑 없음" 
      });
    }

    const mapping = result.rows[0];
    
    return json({
      ok: true,
      storeId: mapping.store_id,
      isDefault: mapping.is_default
    });

  } catch (error) {
    console.error('Mapping Query Error:', error);
    return json({ 
      ok: false, 
      error: "DB_ERROR",
      message: error.message 
    }, 500);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}
