// /api/login-admin.js
import { signJWT } from "./_lib/jwt.server.js";
import { query } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "method not allowed" });
  }

  const { id, pw } = req.body;

  if (!id || !pw) {
    return res.status(400).json({ ok: false, message: "missing fields" });
  }

  // 1️⃣ 환경변수에서 관리자 인증
  let admins = [];
  try {
    admins = JSON.parse(process.env.ADMIN_USERS_JSON || "[]");
  } catch (e) {
    console.error('[login-admin] ADMIN_USERS_JSON parse error:', e);
    return res.status(500).json({
      ok: false,
      message: "ADMIN_USERS_JSON env parse error",
    });
  }

  const admin = admins.find(a => a.id === id && a.pw === pw);

  if (!admin) {
    return res.status(401).json({
      ok: false,
      message: "invalid admin credentials",
    });
  }

  // 2️⃣ DB에서 매장 매핑 조회
  let stores = [];
  try {
    const result = await query(`
      SELECT s.store_id, s.name, s.code, a.note
      FROM admin_stores a
      JOIN stores s ON a.store_id = s.store_id
      WHERE a.admin_key = $1
    `, [admin.id]);

    stores = result.rows;
  } catch (e) {
    console.error('[login-admin] DB query error:', e);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch store mapping",
    });
  }

  // 3️⃣ 매핑 없으면 거부
  if (!stores.length) {
    console.log('[login-admin] No store mapping for:', admin.id);
    return res.status(403).json({
      ok: false,
      message: "Admin is not mapped to any store",
    });
  }

  // 4️⃣ 첫 번째 매장을 기본으로 설정
  const storeId = stores[0].store_id;
  const secret = process.env.JWT_SECRET || "defaultSecret";

  // 5️⃣ JWT 생성
  const token = await signJWT({
    role: "admin",
    realm: "admin",
    adminKey: admin.id,
    uid: admin.id,
    storeId,
    name: admin.name || admin.id,
    iat: Math.floor(Date.now() / 1000),
  }, secret);

  // 6️⃣ 쿠키 설정
  res.setHeader(
    "Set-Cookie",
    `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
  );

  // 7️⃣ 성공 응답 (storeId 포함)
  return res.status(200).json({ 
    ok: true, 
    storeId,
    storeName: stores[0].name
  });
}
