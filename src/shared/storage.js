// /src/shared/storage.js
// ---------------------------------------------------------------------
// Unified Storage Layer
// 현재는 localStorage 기반
// 나중에 DB 붙이면 이 파일만 수정하면 전체 프로젝트가 서버 기반으로 전환됨
// ---------------------------------------------------------------------

import { ensureStoreInitialized } from "./store.js";

// 공통 prefix
const PREFIX = "qrnr";

// key 생성기
function makeKey(storeId, key) {
  return `${PREFIX}:${storeId}:${key}`;
}

// ==========================
//  Public API
// ==========================

export const Storage = {
  // GET
  get(storeId, key) {
    try {
      const v = localStorage.getItem(makeKey(storeId, key));
      return v ? JSON.parse(v) : null;
    } catch (_) {
      return null;
    }
  },

  // SET
  set(storeId, key, value) {
    try {
      localStorage.setItem(makeKey(storeId, key), JSON.stringify(value));
      return true;
    } catch (_) {
      console.warn("Storage.set 실패:", key);
      return false;
    }
  },

  // REMOVE
  remove(storeId, key) {
    try {
      localStorage.removeItem(makeKey(storeId, key));
    } catch (_) {}
  },

  // CLEAR (특정 storeId의 모든 데이터 제거)
  clearStore(storeId) {
    try {
      const prefix = `${PREFIX}:${storeId}:`;
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(prefix)) localStorage.removeItem(k);
      });
    } catch (_) {}
  }
};
