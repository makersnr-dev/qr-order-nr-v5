// /api/call.js
import fs from 'fs/promises';

export const config = { runtime: 'nodejs' };

const STORES_FILE = '/tmp/qrnr_stores.json';

async function loadStores() {
  try {
    const txt = await fs.readFile(STORES_FILE, 'utf8');
    return JSON.parse(txt) || {};
  } catch {
    return {};
  }
}

// 🔒 storeId 실존 매장 검증
async function assertValidStoreId(storeId) {
  if (!storeId) {
    return { ok: false, error: 'MISSING_STORE_ID' };
  }

  const stores = await loadStores();

  if (!stores || !stores[storeId]) {
    return { ok: false, error: 'INVALID_STORE_ID' };
  }

  return { ok: true };
}


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const { storeId, table, note, senderId } = req.body || {};

// 🔒 storeId 실존 매장 검증
const check = await assertValidStoreId(storeId);
if (!check.ok) {
  return res.status(403).json(check);
}


  const ts = Date.now();



  return res.json({ ok: true });
}
