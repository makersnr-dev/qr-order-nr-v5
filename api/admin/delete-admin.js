// api/admin/delete-admin.js
// 슈퍼 관리자 전용: 관리자 삭제 API (매핑된 스토어가 있으면 삭제 불가)

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
    if (req.method !== 'POST') {
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

    let body;
    try { body = await req.json(); } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'BAD_JSON' }), { status: 400 });
    }

    const { adminId } = body;
    if (!adminId) {
        return new Response(JSON.stringify({ ok: false, error: 'REQUIRED', message: 'adminId가 필요합니다' }), { status: 400 });
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // 1) 매핑 테이블 확인 (admin_store_mapping)
        const mappingCheck = await pool.query('SELECT 1 FROM admin_store_mapping WHERE admin_id = $1 LIMIT 1', [adminId]);
        if (mappingCheck.rows.length > 0) {
            return new Response(JSON.stringify({
                ok: false,
                error: 'MAPPING_EXISTS',
                message: '이 관리자는 하나 이상의 매장과 매핑되어 있어 삭제할 수 없습니다. 먼저 매핑을 삭제해 주세요.'
            }), { status: 400 });
        }

        // 2) 매장 테이블 확인 (admin_stores - primary owner)
        const storeCheck = await pool.query('SELECT 1 FROM admin_stores WHERE admin_key = $1 LIMIT 1', [adminId]);
        if (storeCheck.rows.length > 0) {
            return new Response(JSON.stringify({
                ok: false,
                error: 'STORE_EXISTS',
                message: '이 관리자가 생성한 매장이 존재하여 삭제할 수 없습니다.'
            }), { status: 400 });
        }

        // 3) 계정 삭제
        const delRes = await pool.query('DELETE FROM admins WHERE id = $1', [adminId]);

        if (delRes.rowCount === 0) {
            return new Response(JSON.stringify({ ok: false, error: 'NOT_FOUND', message: '삭제할 관리자를 찾을 수 없습니다' }), { status: 404 });
        }

        return new Response(JSON.stringify({ ok: true, message: '관리자가 삭제되었습니다' }), { status: 200 });

    } catch (error) {
        console.error('Delete Admin Error:', error);
        return new Response(JSON.stringify({ ok: false, error: 'DB_ERROR', message: error.message }), { status: 500 });
    } finally {
        await pool.end();
    }
}
