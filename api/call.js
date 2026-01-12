// /api/call.js
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const { storeId, table, note } = req.body || {};

  if (!storeId) {
    return res.status(400).json({
      ok: false,
      error: 'NO_STORE_ID'
    });
  }

  // 🔔 관리자에게 호출 이벤트 전파
  try {
    const channel = new BroadcastChannel('qrnr-admin');
    channel.postMessage({
      type: 'CALL',
      storeId,
      table: table || null,
      note: note || '',
      at: new Date().toISOString()
    });
  } catch (e) {
    console.error('[CALL] broadcast failed', e);
  }

  return res.json({ ok: true });
}
