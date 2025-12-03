// /api/super-login.js
import { signJWT } from "../src/shared/jwt.js";

export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}

function loadSuperAdmins() {
  try {
    const raw = process.env.SUPER_ADMINS_JSON || '[]';
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }

  const uid = (body?.uid || "").trim();
  const pw  = (body?.pwd || "").trim();

  if (!uid || !pw) {
    return json({ ok: false, error: "REQUIRED" }, 400);
  }

  const admins = loadSuperAdmins();
  const found = admins.find(a => a.id === uid && a.pw === pw);

  if (!found) {
    return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);
  }

  const payload = {
    role: "super",
    superId: uid,
    iat: Math.floor(Date.now() / 1000),
  };

  const secret = process.env.SUPER_JWT_SECRET || "super-secret";
  const token = await signHS256(payload, secret);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `super_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
    },
  });
}
