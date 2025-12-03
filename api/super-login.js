// /api/super-login.js
import { signJWT } from "../src/shared/jwt.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "METHOD" }), {
        status: 405,
      });
    }

    const { uid, pwd } = await req.json().catch(() => ({}));

    if (!uid || !pwd) {
      return new Response(
        JSON.stringify({ ok: false, error: "ID_AND_PASSWORD_REQUIRED" }),
        { status: 400 }
      );
    }

    // SUPER 계정은 환경변수 SUPER_ADMINS_JSON에서 읽음
    const raw = process.env.SUPER_ADMINS_JSON || "{}";
    let admins = {};

    try {
      admins = JSON.parse(raw);
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: "BAD_SUPER_ADMINS_JSON" }),
        { status: 500 }
      );
    }

    const savedPw = admins[uid];

    if (!savedPw || savedPw !== pwd) {
      return new Response(
        JSON.stringify({ ok: false, error: "INVALID_CREDENTIALS" }),
        { status: 401 }
      );
    }

    // JWT payload
    const payload = {
      role: "super",
      superId: uid,
      iat: Math.floor(Date.now() / 1000),
    };

    // SUPER 전용 비밀키 사용
    const secret = process.env.SUPER_JWT_SECRET || "super-secret-dev";
    const token = await signJWT(payload, secret);

    return new Response(JSON.stringify({ ok: true, token }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
    });
  }
}
