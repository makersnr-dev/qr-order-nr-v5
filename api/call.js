// /api/call.js
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const { storeId, table, note, senderId } = req.body || {};

  if (!storeId) {
    return res.status(400).json({
      ok: false,
      error: 'NO_STORE_ID'
    });
  }

  const ts = Date.now();



  return res.json({ ok: true });
}
