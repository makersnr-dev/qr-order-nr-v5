// /api/me.js
import { verifyJWT } from "../src/shared/jwt.js";

export const config = { runtime:"edge" };

export default async function handler(req){
  try {
    const cookie = req.headers.get("cookie") || "";
    const token = cookie.match(/auth_token=([^;]+)/)?.[1];

    if (!token) {
      return new Response(JSON.stringify({ ok:false }), { status:200 });
    }

    const payload = await verifyJWT(token, process.env.JWT_SECRET);

    if (!payload) {
      return new Response(JSON.stringify({ ok:false }), { status:200 });
    }

    return new Response(JSON.stringify({
      ok: true,
      role: payload.role,
      id: payload.id,
      storeId: payload.storeId || null
    }), {
      status:200
    });

  } catch (e){
    return new Response(JSON.stringify({ ok:false }), { status:200 });
  }
}
