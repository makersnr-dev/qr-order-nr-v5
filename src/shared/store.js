// /src/shared/store.js

export function ensureStoreInitialized() {
  const url = new URL(location.href);
  const sidFromUrl = url.searchParams.get('store');

  // 1. URL에 storeId가 있다면 최우선으로 사용하고 세션에 박제 (탭 고립)
  if (sidFromUrl && sidFromUrl !== "[object Object]") {
    sessionStorage.setItem('qrnr_active_storeId', sidFromUrl);
    localStorage.setItem('qrnr.lastStoreId', sidFromUrl); // 마지막 방문 기억용
    return sidFromUrl;
  }

  // 2. URL에 없다면 현재 탭의 세션 저장소 확인
  const sidFromSession = sessionStorage.getItem('qrnr_active_storeId');
  if (sidFromSession && sidFromSession !== "[object Object]") {
    return sidFromSession;
  }

  // 3. 둘 다 없다면 마지막 방문 기록이나 기본값
  const lastId = localStorage.getItem('qrnr.lastStoreId') || 'store1';
  return lastId;
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
