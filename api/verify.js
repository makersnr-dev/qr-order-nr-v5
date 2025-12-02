export const config = {
  runtime: "nodejs"
};

import { verifyJwt } from './_common.js';

export default async function handler(req, res) {
  try {
    const token =
      req.headers['x-auth-token'] ||
      req.headers['X-Auth-Token'] ||
      '';

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
    return res.status(500).json({ ok: false, error: "VERIFY_FAILED", detail: err.toString() });
  }
}
