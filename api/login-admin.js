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
    admins = JSON.parse(process.env.ADMIN_LIST || "[]");
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "ADMIN_LIST env parse error",
    });
  }

  const admin = admins.find(
    (a) => a.id === id && a.pw === pw
  );

  if (!admin) {
    return res.status(401).json({
      ok: false,
      message: "invalid admin credentials",
    });
  }

  // signJWT 호출 시 await 사용 (비동기 처리)
  const token = await signJWT({
    role: "admin",
    adminKey: admin.id, // 핵심
  });

  res.setHeader(
    "Set-Cookie",
    `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax`
  );

  return res.status(200).json({ ok: true });
}
