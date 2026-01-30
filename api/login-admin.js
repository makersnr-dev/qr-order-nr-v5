// /api/login-admin.js
import { signJWT } from "./_lib/jwt.server.js";
import { query } from './_lib/db.js'; // ✅ DB 연결 도구 추가

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "method not allowed" });
  }

  const { id, pw } = req.body;

  if (!id || !pw) {
    return res.status(400).json({ ok: false, message: "missing fields" });
  }

  // 1️⃣ [기존 유지] 환경변수에서 관리자 아이디/비번 인증
  let admins = [];
  try {
    admins = JSON.parse(process.env.ADMIN_USERS_JSON || "[]");
  } catch (e) {
    return res.status(500).json({ ok: false, message: "env parse error" });
  }

  const admin = admins.find(a => a.id === id && a.pw === pw);

  if (!admin) {
    return res.status(401).json({ ok: false, message: "invalid credentials" });
  }

  // 2️⃣ [DB 연동] DB의 admin_stores 테이블에서 이 관리자가 맡은 매장 찾기
  try {
    const result = await query(`
      SELECT store_id FROM admin_stores 
      WHERE admin_key = $1
      LIMIT 1
    `, [id]);

    if (result.rows.length === 0) {
      // 아이디/비번은 맞지만 DB에 매장 연결 정보가 없는 경우
      return res.status(403).json({ 
        ok: false, 
        message: "이 계정에 연결된 매장이 DB에 없습니다. Neon DB를 확인해주세요." 
      });
    }

    const storeId = result.rows[0].store_id;

    // 3️⃣ JWT 생성 (인증된 storeId 포함)
    const secret = process.env.JWT_SECRET || "defaultSecret";
    const token = await signJWT({
      role: "admin",
      realm: "admin",
      uid: id,
      storeId: storeId, // ✅ 이제 DB에서 가져온 진짜 storeId가 들어감
      iat: Math.floor(Date.now() / 1000),
    }, secret);

    // 4️⃣ 쿠키 설정
    res.setHeader(
      "Set-Cookie",
      `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
    );

    return res.status(200).json({ ok: true, storeId });

  } catch (e) {
    console.error('[LOGIN DB ERROR]', e);
    return res.status(500).json({ ok: false, message: "database error" });
  }
}
