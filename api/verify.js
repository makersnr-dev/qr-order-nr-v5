export const config = {
  runtime: "nodejs"
};

import { verifyJwt } from './_common.js';

export default async function handler(req, res) {
  try {
    let token =
      req.headers['x-auth-token'] ||
      req.headers['X-Auth-Token'] ||
      '';

    // 🔥 body 에 token이 실려오면 그걸 우선 사용
    if (!token) {
      try {
        const body = await req.json();
        if (body && body.token) {
          token = body.token;
        }
      } catch (_) {
        // body 없는 요청일 수 있기에 무시해도 됨
      }
    }

    if (!token) {
      return res.status(401).json({ ok: false, error: 'NO_TOKEN' });
    }

    const payload = await verifyJwt(token);

    if (!payload) {
      return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
    }

    return res.status(200).json(payload);

  } catch (err) {
    console.error("[verify]", err);
    return res.status(500).json({
      ok: false,
      error: "VERIFY_FAILED",
      detail: err.toString()
    });
  }
}
