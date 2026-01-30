// /api/store-settings.js
import { query } from './_lib/db.js';

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
    const { storeId } = req.query;
    if (!storeId) return res.status(400).json({ ok: false, error: "MISSING_STORE_ID" });

    try {
        // 1. 설정 불러오기 (GET)
        if (req.method === 'GET') {
            const result = await query(`SELECT owner_bank FROM store_settings WHERE store_id = $1`, [storeId]);
            return res.json({ ok: true, settings: result.rows[0] || {} });
        }

        // 2. 계좌 정보 저장하기 (PUT)
        if (req.method === 'PUT') {
            const { ownerBank } = req.body;
            await query(`
                INSERT INTO store_settings (store_id, owner_bank)
                VALUES ($1, $2)
                ON CONFLICT (store_id) 
                DO UPDATE SET owner_bank = $2, updated_at = NOW()
            `, [storeId, JSON.stringify(ownerBank)]);
            return res.json({ ok: true });
        }
    } catch (e) {
        console.error(e);
        return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
}
