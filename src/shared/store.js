// /src/shared/store.js

/**
 * 현재 접속한 매장 ID(storeId)를 초기화하고 반환합니다.
 * URL 파라미터(?store=...)를 최우선으로 하며, 없을 경우 localStorage를 확인합니다.
 */
export function ensureStoreInitialized() {
  const url = new URL(location.href);
  let sid = url.searchParams.get('store');

  // 1. URL에 storeId가 있는 경우 (가장 정확함)
  if (sid && sid !== "[object Object]") {
    localStorage.setItem('qrnr.storeId', sid);
    return sid;
  }

  // 2. localStorage에 저장된 값이 있는 경우
  sid = localStorage.getItem('qrnr.storeId');
  if (sid && sid !== "[object Object]") {
    return sid;
  }

  // 3. 둘 다 없는 경우 (기본값)
  const defaultSid = 'store1';
  localStorage.setItem('qrnr.storeId', defaultSid);
  return defaultSid;
}

/**
 * 매장 ID를 강제로 변경해야 할 때 사용합니다.
 */
export function setGlobalStoreId(sid) {
  if (!sid) return;
  localStorage.setItem('qrnr.storeId', sid);
  
  // URL도 함께 업데이트 (페이지 새로고침 없이)
  const url = new URL(location.href);
  if (url.searchParams.get('store') !== sid) {
    url.searchParams.set('store', sid);
    history.replaceState(null, '', url.toString());
  }
}
