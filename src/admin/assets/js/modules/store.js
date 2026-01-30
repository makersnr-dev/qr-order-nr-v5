// /src/admin/assets/js/modules/store.js
// ✅ PHASE 2: DB 전환 완료로 인해 유틸리티 함수만 남김

import { ensureStoreInitialized } from '/src/shared/store.js';

// 숫자를 가격 포맷(3,000)으로 바꿔주는 도구 (여전히 많이 쓰임)
export const fmt = (n) => Number(n || 0).toLocaleString();

/**
 * ⚠️ 주의: 
 * 기존의 get(), patch(), load() 등 localStorage 관련 함수들은 
 * 이제 각 모듈(menu.js, orders.js 등)에서 직접 API(fetch)를 호출하므로 사용하지 않습니다.
 */

// 매장 ID 확인용 유틸만 유지
export function requireStoreId() {
  const storeId = ensureStoreInitialized();
  if (!storeId) {
    console.warn('[STORE] storeId not initialized');
    return null;
  }
  return storeId;
}

// 혹시 모를 하위 호환성을 위해 빈 함수들만 정의 (에러 방지용)
export const get = (path) => { console.warn("DEPRECATED: Use API fetch instead of get()"); return null; };
export const patch = (path, updater) => { console.warn("DEPRECATED: Use API fetch instead of patch()"); return null; };
