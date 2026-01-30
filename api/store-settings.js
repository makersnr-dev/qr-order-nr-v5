// /api/store-settings.js
import { query } from './_lib/db.js';

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
    const { storeId } = req.query;
    if (!storeId) return res.status(400).json({ ok: false, error: "MISSING_STORE_ID" });

    try {
        if (req.method === 'GET') {
            const result = await query(`
                SELECT owner_bank, notify_config, call_options 
                FROM store_settings WHERE store_id = $1`, [storeId]);
            return res.json({ ok: true, settings: result.rows[0] || {} });
        }

        if (req.method === 'PUT') {
            const { ownerBank, notifyConfig, callOptions } = req.body;
            // 보내온 데이터만 골라서 업데이트 (나머지는 기존값 유지)
            await query(`
                INSERT INTO store_settings (store_id, owner_bank, notify_config, call_options)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (store_id) 
                DO UPDATE SET 
                    owner_bank = COALESCE($2, store_settings.owner_bank),
                    notify_config = COALESCE($3, store_settings.notify_config),
                    call_options = COALESCE($4, store_settings.call_options),
                    updated_at = NOW()
            `, [
                storeId, 
                ownerBank ? JSON.stringify(ownerBank) : null,
                notifyConfig ? JSON.stringify(notifyConfig) : null,
                callOptions ? JSON.stringify(callOptions) : null
            ]);
            return res.json({ ok: true });
        }
    } catch (e) {
        console.error(e);
        return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
}
