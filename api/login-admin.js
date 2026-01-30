import { signJWT } from "./_lib/jwt.server.js";
import { getAdminStores } from './_lib/db.stores.js';

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "method not allowed" });
  }

  const { id, pw } = req.body;

  if (!id || !pw) {
    return res.status(400).json({ ok: false, message: "missing fields" });
  }

  // 환경변수에서 관리자 목록 읽기
  let admins = [];
  try {
    admins = JSON.parse(process.env.ADMIN_USERS_JSON || "[]");
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "ADMIN_USERS_JSON env parse error",
    });
  }

  // 관리자 인증
  const admin = admins.find(a => a.id === id && a.pw === pw);

  if (!admin) {
    return res.status(401).json({
      ok: false,
      message: "invalid admin credentials",
    });
  }

  // DB에서 매장 매핑 조회
  let stores = [];
  try {
    stores = await getAdminStores(admin.id);
  } catch (e) {
    console.error('[login-admin] DB error:', e);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch store mapping",
    });
  }

  if (!stores.length) {
    return res.status(403).json({
      ok: false,
      message: "Admin is not mapped to any store",
    });
  }

  // 첫 번째 매장 기본값
  const storeId = stores[0].store_id;

  const secret = process.env.JWT_SECRET || "defaultSecret";

  // JWT 생성
  const token = await signJWT({
    role: "admin",
    realm: "admin",
    adminKey: admin.id,
    uid: admin.id,
    storeId,
    name: admin.name || admin.id,
    iat: Math.floor(Date.now() / 1000),
  }, secret);

  res.setHeader(
    "Set-Cookie",
    `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax`
  );

  return res.status(200).json({ ok: true, storeId });
}
