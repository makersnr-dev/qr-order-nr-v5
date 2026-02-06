// api/admin/list-admins.js
// 슈퍼 관리자 전용: 관리자 목록 조회 API

import { Pool } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

// JWT 검증 함수
function verifyJWT(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

export default async function handler(req) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }), { status: 405 });
    }

    // 슈퍼 관리자 권한 확인
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }), { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = verifyJWT(token, process.env.SUPER_JWT_SECRET || 'super-secret-dev');

    if (!payload || payload.realm !== 'super') {
        return new Response(JSON.stringify({ ok: false, error: 'FORBIDDEN' }), { status: 403 });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const search = url.searchParams.get('search') || '';

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        const offset = (page - 1) * limit;
        let whereClause = '';
        const params = [];

        if (search) {
            whereClause = `WHERE id ILIKE $1 OR name ILIKE $1`;
            params.push(`%${search}%`);
        }

        // 1) Total Count
        const countSql = `SELECT COUNT(*) FROM admins ${whereClause}`;
        const countRes = await pool.query(countSql, params);
        const total = parseInt(countRes.rows[0].count, 10);

        // 2) Data
        const dataSql = `
      SELECT id, name, email, phone, role, is_active, created_at 
      FROM admins 
      ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
        const dataParams = [...params, limit, offset];
        const result = await pool.query(dataSql, dataParams);

        return new Response(JSON.stringify({
            ok: true,
            admins: result.rows,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('List Admins Error:', error);
        return new Response(JSON.stringify({ ok: false, error: 'DB_ERROR', message: error.message }), { status: 500 });
    } finally {
        await pool.end();
    }
}
