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
