// api/admin/add-mapping.js
// 슈퍼 관리자 전용: 관리자-매장 매핑 추가 API

import { Pool } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

// JWT 검증 함수
function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 슈퍼 관리자 권한 확인
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ ok: false, error: 'UNAUTHORIZED', message: '로그인이 필요합니다' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.substring(7);
  const payload = verifyJWT(token, process.env.SUPER_JWT_SECRET || 'super-secret-dev');

  if (!payload || payload.realm !== 'super') {
    return new Response(
      JSON.stringify({ ok: false, error: 'FORBIDDEN', message: '슈퍼 관리자 권한이 필요합니다' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 요청 데이터 파싱
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'BAD_JSON', message: '잘못된 요청 형식입니다' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { adminId, storeId, note } = body;

  if (!adminId || !storeId) {
    return new Response(
      JSON.stringify({ ok: false, error: 'REQUIRED', message: 'adminId와 storeId는 필수입니다' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1) 관리자 존재 확인
    const adminCheck = await pool.query('SELECT id FROM admins WHERE id = $1', [adminId]);
    if (adminCheck.rows.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'ADMIN_NOT_FOUND', message: '존재하지 않는 관리자 ID입니다' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2) 매장 존재 확인 (Store Table이 없으므로 admin_stores에 이미 있는지 확인하거나, 그냥 진행)
    // admin_stores 자체가 매장 정의이기도 함. 
    // 여기서는 "새 매핑 추가" = "admin_stores에 레코드 추가"

    // 3) 매핑 추가 (admin_store_mapping)
    await pool.query(`
      INSERT INTO admin_store_mapping (admin_id, store_id, note, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (admin_id, store_id) 
      DO UPDATE SET note = EXCLUDED.note
    `, [adminId, storeId, note || null]);

    return new Response(
      JSON.stringify({
        ok: true,
        message: '매핑이 성공적으로 저장되었습니다',
        mapping: { adminId, storeId }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Mapping Error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'DB_ERROR',
        message: '데이터베이스 오류: ' + error.message
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}