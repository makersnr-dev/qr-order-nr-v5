export const config = {
  runtime: "nodejs"
};

import { verifyJwt } from './_common.js';

export default async function handler(req, res) {
  try {
    // 반드시 body를 JSON으로 읽어야 한다!
    let body = {};
    try {
      body = req.body || {};
    } catch (e) {
      console.error("[verify] body read error", e);
      return res.status(400).json({ ok: false, error: "BAD_JSON" });
    }

    const token = body.token;

    if (!token) {
      return res.status(401).json({ ok: false, error: "NO_TOKEN" });
    }

    const payload = await verifyJwt(token);

    if (!payload) {
      return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
    }

    return res.status(200).json({ ok: true, ...payload });

  } catch (err) {
    console.error("[verify] unexpected error:", err);
    return res.status(500).json({
      ok: false,
      error: "VERIFY_FAILED",
      detail: err.message
    });
  }
}
