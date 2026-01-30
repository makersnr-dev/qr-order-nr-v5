// /api/menus.js
import { query } from './_lib/db.js';

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const { storeId } = req.query;
  if (!storeId) return res.status(400).json({ ok: false, error: "MISSING_STORE_ID" });

  try {
    // 1. 메뉴 불러오기
    if (req.method === 'GET') {
      const result = await query(`
        SELECT menu_id as id, name, price, category, active, sold_out as "soldOut", img, description as desc, options
        FROM menus WHERE store_id = $1 ORDER BY display_order ASC`, [storeId]);
      return res.json({ ok: true, menus: result.rows });
    }

    // 2. 메뉴 수정/추가 (단건 또는 배열 전체 저장 대응)
    if (req.method === 'PUT') {
      const items = Array.isArray(req.body) ? req.body : [req.body];
      
      for (const item of items) {
        await query(`
          INSERT INTO menus (store_id, menu_id, name, price, category, active, sold_out, img, description, options)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (store_id, menu_id) 
          DO UPDATE SET name=$3, price=$4, category=$5, active=$6, sold_out=$7, img=$8, description=$9, options=$10, updated_at=NOW()
        `, [storeId, item.id, item.name, item.price, item.category, item.active, item.soldOut, item.img, item.desc, JSON.stringify(item.options || [])]);
      }
      return res.json({ ok: true });
    }

    // 3. 메뉴 삭제
    if (req.method === 'DELETE') {
      const { menuId } = req.query;
      await query(`DELETE FROM menus WHERE store_id = $1 AND menu_id = $2`, [storeId, menuId]);
      return res.json({ ok: true });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "DB_ERROR" });
  }
}
