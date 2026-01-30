import { query, queryOne } from './db.js';

// 전체 매장 목록 조회
export async function listStores() {
  const result = await query(`
    SELECT store_id, name, code, created_at, updated_at
    FROM stores
    ORDER BY created_at DESC
  `);
  
  return result.rows;
}

// 특정 매장 조회
export async function getStore(storeId) {
  return await queryOne(
    'SELECT * FROM stores WHERE store_id = $1',
    [storeId]
  );
}

// 매장 생성
export async function createStore({ storeId, name, code }) {
  const result = await queryOne(`
    INSERT INTO stores (store_id, name, code)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [storeId, name, code]);
  
  return result;
}

// 매장 수정
export async function updateStore({ storeId, name, code }) {
  const result = await queryOne(`
    UPDATE stores
    SET name = COALESCE($2, name),
        code = COALESCE($3, code),
        updated_at = NOW()
    WHERE store_id = $1
    RETURNING *
  `, [storeId, name, code]);
  
  return result;
}

// 매장 삭제
export async function deleteStore(storeId) {
  await query('DELETE FROM stores WHERE store_id = $1', [storeId]);
}

// =====================================================
// 관리자-매장 매핑
// =====================================================

// 관리자의 매장 목록 조회
export async function getAdminStores(adminKey) {
  const result = await query(`
    SELECT s.store_id, s.name, s.code, a.note
    FROM admin_stores a
    JOIN stores s ON a.store_id = s.store_id
    WHERE a.admin_key = $1
  `, [adminKey]);
  
  return result.rows;
}

// 매핑 추가
export async function addAdminStore({ adminKey, storeId, note }) {
  await query(`
    INSERT INTO admin_stores (admin_key, store_id, note)
    VALUES ($1, $2, $3)
    ON CONFLICT (admin_key, store_id)
    DO UPDATE SET note = EXCLUDED.note
  `, [adminKey, storeId, note || null]);
}

// 매핑 삭제
export async function removeAdminStore({ adminKey, storeId }) {
  await query(`
    DELETE FROM admin_stores
    WHERE admin_key = $1 AND store_id = $2
  `, [adminKey, storeId]);
}

// 전체 매핑 목록 (SUPER 관리자용)
export async function listAllMappings() {
  const result = await query(`
    SELECT admin_key, store_id, note, created_at
    FROM admin_stores
    ORDER BY created_at DESC
  `);
  
  return result.rows;
}

// 매장별 메뉴 목록 조회 (DB 버전)
export async function getStoreMenus(storeId) {
  const result = await query(`
    SELECT menu_id as id, name, price, category, active, sold_out as "soldOut", img, description as desc, options
    FROM menus
    WHERE store_id = $1 AND active = TRUE
    ORDER BY display_order ASC, name ASC
  `, [storeId]);
  
  return result.rows;
}

// api/_lib/db.stores.js

export async function getOrGeneratePaymentCode(storeId) {
  // 1. 한국 시간 기준으로 오늘 날짜 구하기 (YYYY-MM-DD)
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 2. DB에서 오늘 코드가 이미 있는지 확인
  const existing = await queryOne(`
    SELECT code FROM payment_codes 
    WHERE store_id = $1 AND date = $2
  `, [storeId, today]);

  if (existing) {
    return existing.code; // 이미 있으면 그대로 반환
  }

  // 3. 없으면 서버(Node.js)에서 4자리 랜덤 숫자 생성
  const newCode = String(Math.floor(1000 + Math.random() * 9000));

  // 4. 생성한 코드를 DB에 저장
  try {
    await query(`
      INSERT INTO payment_codes (store_id, date, code)
      VALUES ($1, $2, $3)
      ON CONFLICT (store_id, date) DO NOTHING
    `, [storeId, today, newCode]);
    
    return newCode;
  } catch (e) {
    // 동시에 여러 명이 요청했을 경우를 대비한 안전장치
    const retry = await queryOne(`SELECT code FROM payment_codes WHERE store_id = $1 AND date = $2`, [storeId, today]);
    return retry ? retry.code : newCode;
  }
}


export async function getStoreSettings(storeId) {
  return await queryOne(`
    SELECT owner_bank, privacy_policy, notify_config, call_options
    FROM store_settings
    WHERE store_id = $1
  `, [storeId]);
}
