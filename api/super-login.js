// /api/super-login.js
import { signJWT } from "../src/shared/jwt.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const { id, password } = await req.json().catch(() => ({}));

    const raw = process.env.SUPER_ADMINS_JSON || "{}";
    const map = JSON.parse(raw);
    const correctPw = map[id];

    if (!correctPw || correctPw !== password) {
      return new Response(JSON.stringify({ ok:false, error:"INVALID" }), { status:401 });
    }

    const secret = process.env.JWT_SECRET;

    // ⭐ 여기서 role="super" 로 로그인 역할 지정
    const token = await signJWT({ role: "super", id }, secret, 7200);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "set-cookie": `auth_token=${token}; Path=/; Max-Age=7200; HttpOnly; Secure; SameSite=Lax`,
        "content-type": "application/json"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false }), { status:500 });
  }
}
