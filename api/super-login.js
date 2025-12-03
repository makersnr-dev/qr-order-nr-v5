// /api/super-login.js
import { signJWT } from "../src/shared/jwt.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, password } = body;

    if (!id || !password) {
      return new Response(JSON.stringify({ ok: false, error: "EMPTY" }), {
        status: 400,
      });
    }

    // 환경변수에서 SUPER 계정 읽기
    const raw = process.env.SUPER_ADMINS_JSON || "{}";
    let admins = {};
    try {
      admins = JSON.parse(raw);
    } catch (_) {}

    const correctPw = admins[id];

    if (!correctPw || correctPw !== password) {
      return new Response(JSON.stringify({ ok: false, error: "INVALID" }), {
        status: 401,
      });
    }

    const secret = process.env.JWT_SUPER_SECRET || "super-secret";
    const token = await signJWT(
      {
        role: "super",
        superId: id,
      },
      secret,
      2 * 3600 // 2시간 유효
    );

    return new Response(JSON.stringify({ ok: true, token }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": `super_token=${token}; Max-Age=${
          2 * 3600
        }; Path=/; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
}
