// /api/qrcodes.js
import { query, queryOne } from './_lib/db.js';

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
    const { storeId, id } = req.query;
    if (!storeId) return res.status(400).json({ ok: false, error: "MISSING_STORE_ID" });

    try {
        // 1. 목록 조회
        if (req.method === 'GET') {
            const result = await query(`
                SELECT id, kind, table_no as "table", label, url, data_url as "dataUrl"
                FROM qr_codes WHERE store_id = $1 ORDER BY table_no ASC`, [storeId]);
            return res.json({ ok: true, list: result.rows });
        }

        // 2. 생성 및 수정 (제한 로직 포함)
        if (req.method === 'PUT') {
            const { id, kind, table, label, url, dataUrl } = req.body;

            // [제한 체크] 현재 매장의 제한 수치와 생성된 개수 비교
            const storeInfo = await queryOne(`SELECT qr_limit FROM stores WHERE store_id = $1`, [storeId]);
            const currentCount = await queryOne(`SELECT count(*) as cnt FROM qr_codes WHERE store_id = $1`, [storeId]);
            
            const limit = storeInfo?.qr_limit || 10;
            const count = parseInt(currentCount?.cnt || 0);

            // 신규 생성일 때만 개수 제한 체크 (기존 수정은 허용)
            const exists = await queryOne(`SELECT id FROM qr_codes WHERE id = $1`, [id]);
            if (!exists && count >= limit) {
                return res.status(403).json({ 
                    ok: false, 
                    error: "LIMIT_EXCEEDED", 
                    message: `최대 ${limit}개까지만 생성할 수 있습니다. 관리자에게 문의하세요.` 
                });
            }

            await query(`
                INSERT INTO qr_codes (id, store_id, kind, table_no, label, url, data_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO UPDATE SET label=$5, data_url=$7, updated_at=NOW()
            `, [id, storeId, kind, table, label, url, dataUrl]);
            
            return res.json({ ok: true });
        }

        // 3. 삭제
        if (req.method === 'DELETE') {
            if (id) {
                await query(`DELETE FROM qr_codes WHERE id = $1`, [id]);
            } else {
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
