// /api/qrcodes.js
import { query } from './_lib/db.js';

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
    const { storeId, id } = req.query;
    if (!storeId) return res.status(400).json({ ok: false, error: "MISSING_STORE_ID" });

    try {
        // 1. QR 목록 불러오기 (GET)
        if (req.method === 'GET') {
            const result = await query(`
                SELECT id, kind, table_no as "table", label, url, data_url as "dataUrl"
                FROM qr_codes WHERE store_id = $1 ORDER BY created_at DESC
            `, [storeId]);
            return res.json({ ok: true, list: result.rows });
        }

        // 2. QR 저장/수정 (PUT)
        if (req.method === 'PUT') {
            const { id, kind, table, label, url, dataUrl } = req.body;
            await query(`
                INSERT INTO qr_codes (id, store_id, kind, table_no, label, url, data_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) 
                DO UPDATE SET label=$5, data_url=$7, updated_at=NOW()
            `, [id, storeId, kind, table, label, url, dataUrl]);
            return res.json({ ok: true });
        }

        // 3. QR 삭제 (DELETE)
        if (req.method === 'DELETE') {
            if (id) {
                // 특정 QR 삭제
                await query(`DELETE FROM qr_codes WHERE store_id = $1 AND id = $2`, [storeId, id]);
            } else {
                // 특정 매장의 특정 종류(kind) QR 전체 삭제
                const { kind } = req.query;
                await query(`DELETE FROM qr_codes WHERE store_id = $1 AND kind = $2`, [storeId, kind]);
            }
            return res.json({ ok: true });
        }
    } catch (e) {
        console.error(e);
        return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
}
