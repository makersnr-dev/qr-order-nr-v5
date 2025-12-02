// /api/verify.js
export const config = {
  runtime: "nodejs"       // ★ Edge → Node 로 강제 변경 필요
};

import { verifyJwt } from './_common';

export default async function handler(req, res) {
  try {
    const token = await req.text(); // body 전체를 문자로 받음
    if (!token) {
      return res.status(401).json({ ok: false, error: "NO_TOKEN" });
    }

    const payload = await verifyJwt(token);
    if (!payload) {
      return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
    }

    return res.status(200).json(payload);

  } catch (err) {
    console.error("[verify] error", err);
    return res.status(500).json({ ok: false, error: "VERIFY_FAILED" });
  }
}
