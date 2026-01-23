// /src/shared/store.js
// 🔒 PHASE 0-2.5: storeId는 인증 결과 기준으로만 사용

export function ensureStoreInitialized() {
  const storeId =
    window.qrnrStoreId ||
    new URL(location.href).searchParams.get('store');

  if (!storeId) {
    console.warn('[STORE] not initialized yet');
    return null; // 🔥 throw 하지 않음
  }

  window.qrnrStoreId = storeId;
  return storeId;
}
