// /src/shared/store.js

// src/shared/store.js

export function ensureStoreInitialized() {
  const url = new URL(location.href);
  const sidFromUrl = url.searchParams.get('store');

  // 🛡️ [문서 핵심 해결] 무결성 검증 함수: null, undefined, [object Object] 방어
  const isValid = (id) => id && typeof id === 'string' && id !== "[object Object]" && id !== "null" && id !== "undefined";

  // 1. URL 파라미터가 유효하다면 최우선으로 사용 (세션 및 로컬 업데이트)
  if (isValid(sidFromUrl)) {
    sessionStorage.setItem('qrnr_active_storeId', sidFromUrl);
    localStorage.setItem('qrnr.lastStoreId', sidFromUrl);
    return sidFromUrl;
  }

  // 2. URL에 없다면 현재 탭의 세션 저장소(sessionStorage) 확인
  const sidFromSession = sessionStorage.getItem('qrnr_active_storeId');
  if (isValid(sidFromSession)) {
    return sidFromSession;
  }

  // 3. 마지막 방문 기록(localStorage) 확인
  const lastId = localStorage.getItem('qrnr.lastStoreId');
  if (isValid(lastId)) {
    // 탭을 새로 열었을 때를 대비해 세션에 다시 복사
    sessionStorage.setItem('qrnr_active_storeId', lastId);
    return lastId;
  }

  // 4. 모든 데이터가 오염되었거나 없다면 기본값 반환
  const defaultId = 'store1';
  sessionStorage.setItem('qrnr_active_storeId', defaultId);
  return defaultId;
}

/**
 * 매장 ID 변경 시 URL 파라미터를 유지하며 이동시켜 무결성을 유지합니다.
 */
export function setGlobalStoreId(sid) {
  if (!sid) return;
  sessionStorage.setItem('qrnr_active_storeId', sid);
  localStorage.setItem('qrnr.lastStoreId', sid);
  
  const url = new URL(location.href);
  if (url.searchParams.get('store') !== sid) {
    url.searchParams.set('store', sid);
    history.replaceState(null, '', url.toString());
  }
}
