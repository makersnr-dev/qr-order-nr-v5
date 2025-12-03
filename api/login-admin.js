// /api/login-admin.js
import { signJWT } from "../src/shared/jwt.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const { uid, pwd } = await req.json().catch(() => ({}));

    const raw = process.env.ADMIN_ACCOUNTS_JSON || "{}";
    const admins = JSON.parse(raw);
    const correctPw = admins[uid];

    if (!correctPw || correctPw !== pwd) {
      return new Response(JSON.stringify({ ok:false }), { status:401 });
    }

    // ⭐ storeId 매핑 가져오기(super-admin UI에서 저장한 값)
    const mapRaw = process.env.STORE_ADMIN_MAP_JSON || "{}";
    const map = JSON.parse(mapRaw);
    const storeId = map[uid] || null;

    // ⭐ role="admin" + storeId 포함
    const token = await signJWT(
      { role: "admin", id: uid, storeId },
      process.env.JWT_SECRET,
      7200
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "set-cookie": `auth_token=${token}; Path=/; Max-Age=7200; HttpOnly; Secure; SameSite=Lax`,
        "content-type": "application/json"
      }
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok:false }), { status:500 });
  }
}
