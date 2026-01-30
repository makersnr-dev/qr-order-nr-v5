// /api/login-admin.js
import { signJWT } from "./_lib/jwt.server.js";  // 정상적으로 import

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "method not allowed" });
  }

  const { id, pw } = req.body;

  if (!id || !pw) {
    return res.status(400).json({ ok: false, message: "missing fields" });
  }

  let admins = [];

  try {
    // ADMIN_USERS_JSON 환경변수에서 관리자 목록 가져오기
    admins = JSON.parse(process.env.ADMIN_USERS_JSON || "[]");
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "ADMIN_USERS_JSON env parse error",
    });
  }

  const admin = admins.find(
    (a) => a.id === id && a.pw === pw // 관리자 정보 확인
  );

  if (!admin) {
    return res.status(401).json({
      ok: false,
      message: "invalid admin credentials",  // 잘못된 관리자 정보
    });
  }

  // JWT_SECRET 환경변수에서 가져온 secret을 사용
  const secret = process.env.JWT_SECRET || "defaultSecret";  // 환경변수에서 JWT secret 가져오기
  
  // admin_stores 테이블에서 매장 ID 조회
  let storeId = null;
  try {
    const storeResult = await query(
      "SELECT store_id FROM admin_stores WHERE admin_key = ?",
      [admin.id]  // admin.id로 매장 조회
    );
    storeId = storeResult[0]?.store_id;  // 매장 ID 가져오기
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch store mapping",  // 매장 매핑 실패
    });
  }

  if (!storeId) {
    return res.status(403).json({
      ok: false,
      message: "Admin is not mapped to any store",  // 매장과 연결되지 않은 관리자
    });
  }

  // JWT 토큰 생성
  const token = await signJWT({
    role: "admin",
    adminKey: admin.id,  // 관리자 ID
    storeId: storeId,    // 매장 ID
  }, secret);  // JWT_SECRET을 사용하여 토큰 생성

  res.setHeader(
    "Set-Cookie",
    `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax`
  );

  return res.status(200).json({ ok: true });
}
