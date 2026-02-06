// /api/admin/list-mappings.js
// 관리자-매장 매핑 목록 조회 (DB - admin_stores)

import { Pool } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const search = url.searchParams.get('search') || '';

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        const offset = (page - 1) * limit;
        const params = [];
        let whereClause = '';

        if (search) {
            whereClause = `WHERE m.admin_id ILIKE $1 OR m.store_id ILIKE $1 OR a.name ILIKE $1`;
            params.push(`%${search}%`);
        }

        // 1) Total Count
        const countSql = `
          SELECT COUNT(*) 
          FROM admin_store_mapping m
          LEFT JOIN admins a ON m.admin_id = a.id
          ${whereClause}
        `;
        const countRes = await pool.query(countSql, params);
        const total = parseInt(countRes.rows[0].count, 10);

        // 2) Data
        const dataSql = `
          SELECT 
            m.admin_id,
            m.store_id,
            m.note,
            false as is_default, 
            m.created_at,
            a.name as admin_name,
            s.name as store_name, 
            s.code as store_code
          FROM admin_store_mapping m
          LEFT JOIN admins a ON m.admin_id = a.id
          LEFT JOIN admin_stores s ON m.store_id = s.store_id
          ${whereClause}
          ORDER BY m.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        const dataParams = [...params, limit, offset];
        const result = await pool.query(dataSql, dataParams);

        return new Response(JSON.stringify({
            ok: true,
            mappings: result.rows,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[list-mappings] error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    } finally {
        await pool.end();
    }
}
