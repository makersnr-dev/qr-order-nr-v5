// src/shared/store.js

export const isValidStoreId = (id) => {
  return (
    id && 
    typeof id === 'string' && 
    id.trim() !== "" &&
    id !== "[object Object]" && 
    id !== "null" && 
    id !== "undefined" &&
    !id.includes("{") // JSON 객체가 문자열화 된 경우 방어
  );
};

export function ensureStoreInitialized() {
  const url = new URL(location.href);
  const sidFromUrl = url.searchParams.get('store');

  // 1. URL 파라미터 체크 및 정화
  if (isValidStoreId(sidFromUrl)) {
    const cleanId = sidFromUrl.trim();
    sessionStorage.setItem('qrnr_active_storeId', cleanId);
    localStorage.setItem('qrnr.lastStoreId', cleanId);
    return cleanId;
  } else if (sidFromUrl) {
    // 유효하지 않은 파라미터가 떠 있다면 제거하여 무한 루프 방지
    url.searchParams.delete('store');
    history.replaceState(null, '', url.toString());
  }

  // 2. 세션/로컬 스토리지 확인
  const sidFromSession = sessionStorage.getItem('qrnr_active_storeId');
  if (isValidStoreId(sidFromSession)) return sidFromSession;

  const lastId = localStorage.getItem('qrnr.lastStoreId');
  if (isValidStoreId(lastId)) {
    sessionStorage.setItem('qrnr_active_storeId', lastId);
    return lastId;
  }

  // 3. 오염된 데이터 강제 삭제 (Clean up)
  localStorage.removeItem('qrnr.lastStoreId');
  sessionStorage.removeItem('qrnr_active_storeId');

  // 4. 기본값 반환
  const defaultId = 'store1';
  sessionStorage.setItem('qrnr_active_storeId', defaultId);
  return defaultId;
}

/**
 * 저장 시점에서도 오염을 방지하는 안전한 저장 함수
 */
export function setGlobalStoreId(sid) {
  if (!isValidStoreId(sid)) {
    console.error(`[Store] Invalid storeId attempt:`, sid);
    return;
  }
  
  const cleanId = sid.trim();
  sessionStorage.setItem('qrnr_active_storeId', cleanId);
  localStorage.setItem('qrnr.lastStoreId', cleanId);
  
  const url = new URL(location.href);
  if (url.searchParams.get('store') !== cleanId) {
    url.searchParams.set('store', cleanId);
    history.replaceState(null, '', url.toString());
  }
}
