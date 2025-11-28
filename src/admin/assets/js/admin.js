// /src/admin/assets/js/admin.js
import { renderPolicy, bindPolicy } from './modules/policy.js';
import { requireAuth, clearToken } from './modules/auth.js';
import { initTabs } from './modules/ui.js';
import {
  renderStore,
  renderDeliv,
  bindFilters,
  exportOrders,
  attachGlobalHandlers,
  syncStoreFromServer,
} from './modules/orders.js';
import { initQR } from './modules/qr.js';
import { renderMenu, bindMenu } from './modules/menu.js';
import { renderCode, bindCode } from './modules/code.js';
import { renderMyBank, bindMyBank } from './modules/mybank.js';
import { renderNotify, bindNotify, notifyEvent } from './modules/notify.js';
import { renderNotifyLogs, bindNotifyLogs } from './modules/notify-logs.js';
import { get } from './modules/store.js'; // ✅ 매장 관리자 매핑용

// ===== 데스크탑 알림 권한 (브라우저에 한 번 요청) =====
if (typeof window !== 'undefined' && 'Notification' in window) {
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

// ===== 새로고침 폭탄 방지용 공통 유틸 =====
const REFRESH_COOLDOWN_MS = 5000; // 5초 안에 여러 번 호출돼도 실제 실행은 1번만

function makeSafeRefresher(realFn) {
  let last = 0;
  return async function safeRefresher(...args) {
    const now = Date.now();
    if (now - last < REFRESH_COOLDOWN_MS) {
      console.log('[safeRefresh] skip (cooldown):', realFn.name || 'fn');
      return;
    }
    last = now;
    try {
      return await realFn(...args);
    } catch (e) {
      console.error('[safeRefresh] error in', realFn.name || 'fn', e);
    }
  };
}

// 탭 3종(매장 / 배달·예약 / 호출로그)에 대한 안전 새로고침 래퍼
const safeRenderStore      = makeSafeRefresher(renderStore);
const safeRenderDeliv      = makeSafeRefresher(renderDeliv);
const safeRenderNotifyLogs = makeSafeRefresher(renderNotifyLogs);

// ===== storeId 결정 함수 =====
// 1) 매장 관리자 매핑에서 adminId → storeId
// 2) localStorage에 남아 있던 storeId
// 3) 마지막 fallback: 'store1'
function resolveStoreId(adminId) {
  // 1) 매장 관리자 매핑에서 adminId → storeId 찾기
  if (adminId && typeof get === 'function') {
    try {
      const map = get(['system', 'storeAdmins']) || {};
      const mapped = map[adminId];
      console.log('[admin] storeAdmins map for', adminId, ':', mapped);

      let sid = null;

      if (typeof mapped === 'string') {
        // 예: storeAdmins["admin1"] = "korea"
        sid = mapped;
      } else if (mapped && typeof mapped === 'object') {
        // 예: storeAdmins["admin1"] = { storeId:"korea", ... } 형태
        // ⚠️ 매장 ID로 쓸만한 필드만 본다.
        sid =
          mapped.storeId ||
          mapped.store ||
          mapped.storeCode ||
          mapped.store_id ||
          null;
      }

      if (sid) {
        localStorage.setItem('qrnr.storeId', sid);
        console.log('[admin] storeId from mapping:', adminId, '->', sid);
        return sid;
      } else {
        console.log('[admin] no usable storeId in mapping for', adminId);
      }
    } catch (e) {
      console.error('[admin] resolveStoreId mapping error', e);
    }
  }

  // 2) 로컬스토리지에 기억된 storeId
  try {
    const stored = localStorage.getItem('qrnr.storeId');
    if (stored) {
      console.log('[admin] storeId from localStorage:', stored);
      return stored;
    }
  } catch (e) {
    console.error('[admin] resolveStoreId localStorage error', e);
  }

  // 3) 아무것도 없으면 기본값
  console.log('[admin] storeId fallback: store1');
  return 'store1';
}

const adminChannel = new BroadcastChannel('qrnr-admin');

function ensureToastContainer() {
  let box = document.getElementById('admin-toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'admin-toast-box';
    box.style.position = 'fixed';
    box.style.top = '16px';
    box.style.right = '16px';
    box.style.zIndex = '9999';
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.gap = '8px';
    document.body.appendChild(box);
  }
  return box;
}

function showToast(message, variant = 'info') {
  const box = ensureToastContainer();
  const toast = document.createElement('div');

  toast.textContent = message;
  toast.style.padding = '10px 14px';
  toast.style.borderRadius = '6px';
  toast.style.fontSize = '13px';
  toast.style.boxShadow = '0 6px 18px rgba(0,0,0,0.25)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.justifyContent = 'space-between';
  toast.style.gap = '10px';
  toast.style.minWidth = '220px';

  if (variant === 'error') {
    toast.style.background = '#fee2e2';
    toast.style.color = '#991b1b';
  } else if (variant === 'success') {
    toast.style.background = '#dcfce7';
    toast.style.color = '#166534';
  } else {
    toast.style.background = '#e5e7eb';
    toast.style.color = '#111827';
  }

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.border = 'none';
  closeBtn.style.background = 'transparent';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '16px';
  closeBtn.style.lineHeight = '1';
  closeBtn.s
