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

  // 🔔 관리자에게 호출 이벤트 전파
  try {
    const channel = new BroadcastChannel('qrnr-admin');
    channel.postMessage({
      type: 'CALL',
      storeId,
      table,
      note,
      ts,                       // ✅ 기준 시간 (숫자)
      at: new Date(ts).toISOString(), // (보조용)
      senderId : 'server'
    });
  } catch (e) {
    console.error('[CALL] broadcast failed', e);
  }

  return res.json({ ok: true });
}
