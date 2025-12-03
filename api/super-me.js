// /api/super-me.js
import { verifyJWT } from "../src/shared/jwt.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const token = cookie.match(/super_token=([^;]+)/)?.[1];

    if (!token) {
      return new Response(
        JSON.stringify({ ok: true, isSuper: false }),
        { status: 200 }
      );
    }

    const secret = process.env.JWT_SUPER_SECRET || "super-secret";
    const payload = await verifyJWT(token, secret);

    if (!payload || payload.role !== "super") {
      return new Response(
        JSON.stringify({ ok: true, isSuper: false }),
        { status: 200 }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        isSuper: true,
        superId: payload.superId,
      }),
      { status: 200 }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: true, isSuper: false }), {
      status: 200,
    });
  }
}
