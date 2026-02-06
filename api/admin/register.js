// api/admin/register.js
// 슈퍼 관리자 전용: 신규 관리자 등록 API

import { Pool } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

// 비밀번호 해시 함수 (Web Crypto API 사용)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// JWT 검증 함수
function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    // 간단한 만료 검증
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

export default async function handler(req) {
  // POST만 허용
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 1) 슈퍼 관리자 권한 확인
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

  // 2) 요청 데이터 파싱
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'BAD_JSON', message: '잘못된 요청 형식입니다' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { id: rawId, password, name: rawName, role = 'admin', storeId: rawStoreId, email: rawEmail, phone: rawPhone } = body;

  const id = rawId ? rawId.trim() : "";
  const name = rawName ? rawName.trim() : "";
  const storeId = rawStoreId ? rawStoreId.trim() : "";
  const email = rawEmail ? rawEmail.trim() : "";
  const phone = rawPhone ? rawPhone.trim() : "";

  // 3) 필수 필드 검증
  if (!id || !password || !name) {
    return new Response(
      JSON.stringify({ ok: false, error: 'REQUIRED', message: 'ID, 비밀번호, 이름은 필수 항목입니다' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 비밀번호 강도 검증
  if (password.length < 4) {
    return new Response(
      JSON.stringify({ ok: false, error: 'WEAK_PASSWORD', message: '비밀번호는 최소 4자 이상이어야 합니다' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 이메일 형식 검증 (입력된 경우만)
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'INVALID_EMAIL', message: '이메일 형식이 올바르지 않습니다' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 전화번호 형식 검증 (입력된 경우만)
  if (phone) {
    const phoneRegex = /^\d{2,3}-?\d{3,4}-?\d{4}$/;
    if (!phoneRegex.test(phone)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'INVALID_PHONE', message: '전화번호 형식이 올바르지 않습니다' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // DB 연결
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 4) ID 중복 체크
    const existCheck = await pool.query('SELECT id FROM admins WHERE id = $1', [id]);

    if (existCheck.rows.length > 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'DUPLICATE_ID', message: '이미 사용 중인 ID입니다' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5) storeId 유효성 검증 (admin_stores 테이블에 존재하는지 확인)
    if (storeId) {
      const storeRes = await pool.query('SELECT store_id FROM admin_stores WHERE store_id = $1 LIMIT 1', [storeId]);
      if (storeRes.rows.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: 'INVALID_STORE_ID', message: '존재하지 않는 매장 ID입니다' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 6) 비밀번호 해시 생성 (Web Crypto API)
    const pw_hash = await hashPassword(password);

    // 7) DB에 관리자 추가
    const insertAdminResult = await pool.query(
      `INSERT INTO admins (id, pw_hash, name, email, phone, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
       RETURNING id, name, role`,
      [id, pw_hash, name, email || null, phone || null, role]
    );

    const newAdmin = insertAdminResult.rows[0];

    // 8) storeId가 있으면 매핑 추가 (admin_store_mapping)
    if (storeId) {
      await pool.query(
        `INSERT INTO admin_store_mapping (admin_id, store_id, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (admin_id, store_id) DO NOTHING`,
        [id, storeId]
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: '관리자가 성공적으로 등록되었습니다',
        admin: {
          id: newAdmin.id,
          name: newAdmin.name,
          role: newAdmin.role,
          storeId: storeId || null
        }
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('DB Error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'DB_ERROR',
        message: '데이터베이스 오류가 발생했습니다: ' + error.message
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}