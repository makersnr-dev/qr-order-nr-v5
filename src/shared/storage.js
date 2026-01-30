// /src/shared/storage.js

export const Storage = {
  /**
   * 데이터를 저장합니다. (매장별로 구분하여 저장)
   * 예: Storage.set('store1', 'cart', [{id:1, qty:2}])
   */
  set(storeId, key, value) {
    try {
      const storageKey = `qrnr.${storeId}.${key}`;
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (e) {
      console.error('[Storage] 저장 실패:', e);
    }
  },

  /**
   * 데이터를 가져옵니다.
   */
  get(storeId, key) {
    try {
      const storageKey = `qrnr.${storeId}.${key}`;
      const val = localStorage.getItem(storageKey);
      return val ? JSON.parse(val) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * 특정 매장의 특정 데이터를 삭제합니다.
   */
  remove(storeId, key) {
    const storageKey = `qrnr.${storeId}.${key}`;
    localStorage.removeItem(storageKey);
  },

  /**
   * 특정 매장의 모든 임시 데이터를 비웁니다.
   */
  clearStore(storeId) {
    const prefix = `qrnr.${storeId}.`;
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    });
  }
};
