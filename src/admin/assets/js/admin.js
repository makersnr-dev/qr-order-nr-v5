// /src/admin/assets/js/admin.js
//------------------------------------------------------------
// 관리자 페이지 메인 스크립트 (storeId 안정화 + SUPER/ADMIN 통합 대응)
//------------------------------------------------------------

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

import { get } from './modules/store.js';

// ⚠️ 고객 페이지용 ensureStoreInitialized는 관리자 페이지에서 사용 금지
// import { ensureStoreInitialized } from "/src/shared/store.js";

//------------------------------------------------------------
// 0. 데스크탑 알림 권한
//------------------------------------------------------------
if (typeof window !== 'undefined' && 'Notification' in window) {
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

//------------------------------------------------------------
// 1. 새로고침 폭탄 방지용 유틸
//------------------------------------------------------------
const REFRESH_COOLDOWN_MS = 5000;

function makeSafeRefresher(realFn) {
  let last = 0;
  return async function safeFn(...args) {
    const now = Date.now();
    if (now - last < REFRESH_COOLDOWN_MS) {
      console.log('[safeRefresh] skip:', realFn.name || 'fn');
      return;
    }
    last = now;
    try {
      return await realFn(...args);
    } catch (e) {
      console.error('[safeRefresh] error in', realFn.name, e);
    }
  };
}

const safeRenderStore      = makeSafeRefresher(renderStore);
const safeRenderDeliv      = makeSafeRefresher(renderDeliv);
const safeRenderNotifyLogs = makeSafeRefresher(renderNotifyLogs);

//------------------------------------------------------------
// 2. 관리자 전용 storeId 결정 규칙
//------------------------------------------------------------
/*
  storeId 우선순위:

  1) URL ?store= 파라미터
  2) storeAdmins 매핑: storeAdmins[adminId]
  3) localStorage.qrnr.storeId
  4) fallback "store1"
*/
function resolveStoreId(adminId) {
  // 1) URL
  try {
    const u = new URL(location.href);
    const urlStore = u.searchParams.get('store');
    if (urlStore) {
      localStorage.setItem('qrnr.storeId', urlStore);
      console.log('[admin] storeId from ?store=', urlStore);
      return urlStore;
    }
  } catch (e) {
    console.error('[admin] URL parse error:', e);
  }

  // 2) 매장 관리자 매핑
  try {
    const map = get(['system', 'storeAdmins']) || {};
    const mapped = map[adminId];

    if (typeof mapped === 'string') {
      console.log('[admin] storeId from mapping:', mapped);
      localStorage.setItem('qrnr.storeId', mapped);
      return mapped;
    }

    if (mapped && typeof mapped === 'object') {
      const sid =
        mapped.storeId ||
        mapped.store ||
        mapped.storeCode ||
        mapped.store_id ||
        null;

      if (sid) {
        console.log('[admin] storeId from mapping-object:', sid);
        localStorage.setItem('qrnr.storeId', sid);
        return sid;
      }
    }
  } catch (e) {
    console.error('[admin] mapping read error:', e);
  }

  // 3) localStorage
  try {
    const stored = localStorage.getItem('qrnr.storeId');
    if (stored) {
      console.log('[admin] storeId from localStorage:', stored);
      return stored;
    }
  } catch (e) {
    console.error('[admin] localStorage error:', e);
  }

  // 4) fallback
  console.log('[admin] fallback storeId = store1');
  return 'store1';
}

//------------------------------------------------------------
// 3. 토스트 UI
//------------------------------------------------------------
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
  toast.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
  toast.style.background =
    variant === 'error'
      ? '#ff4d4f'
      : variant === 'success'
        ? '#52c41a'
        : '#333';
  toast.style.color = '#fff';
  toast.style.opacity = '0.95';
  toast.style.transition = 'opacity 0.3s ease';

  box.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

//------------------------------------------------------------
// 4. adminChannel 메시지 수신
//------------------------------------------------------------
const adminChannel = new BroadcastChannel('qrnr-admin');

//------------------------------------------------------------
// 5. main()
//------------------------------------------------------------
async function main() {
  //--------------------------------------------------------
  // A. 관리자 인증
  //--------------------------------------------------------
  const session = await requireAuth('admin');
  if (!session) return;

  // adminId(관리자 아이디) 추출
  const adminId =
    session.uid ||
    session.sub ||
    (session.user && (session.user.uid || session.user.id)) ||
    (session.payload && (session.payload.uid || session.payload.sub)) ||
    null;

  console.log('[admin] verified session:', session);
  console.log('[admin] resolved adminId:', adminId);

  //--------------------------------------------------------
  // B. storeId 결정 (ensureStoreInitialized 사용 X)
  //--------------------------------------------------------
  const sid = resolveStoreId(adminId);
  window.qrnrStoreId = sid;
  localStorage.setItem('qrnr.storeId', sid);

  // 주소창에 ?store= 없으면 자동 추가
  try {
    const u = new URL(location.href);
    if (!u.searchParams.get('store')) {
      u.searchParams.set('store', sid);
      history.replaceState(null, '', u.toString());
    }
  } catch (e) {
    console.error('[admin] URL update error:', e);
  }

  //--------------------------------------------------------
  // C. 서버와 매장 데이터 동기화
  //--------------------------------------------------------
  await syncStoreFromServer();
  initTabs();

  //--------------------------------------------------------
  // D. 탭 전환 시 안전한 새로고침
  //--------------------------------------------------------
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'store') safeRenderStore();
      else if (tab === 'delivery') safeRenderDeliv();
      else if (tab === 'notify-log') safeRenderNotifyLogs();
    });
  });

  //--------------------------------------------------------
  // E. 로그아웃
  //--------------------------------------------------------
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearToken();
      location.href = '/admin';
    };
  }

  //--------------------------------------------------------
  // F. 주문 필터, 엑셀, 세팅
  //--------------------------------------------------------
  bindFilters();
  safeRenderStore();
  safeRenderDeliv();
  attachGlobalHandlers();

  const storeExportBtn = document.getElementById('store-export');
  if (storeExportBtn) storeExportBtn.onclick = () => exportOrders('ordersStore');

  const delivExportBtn = document.getElementById('deliv-export');
  if (delivExportBtn) delivExportBtn.onclick = () => exportOrders('ordersDelivery');

  //--------------------------------------------------------
  // G. 메뉴 / 코드 / 계좌 / 알림 / QR
  //--------------------------------------------------------
  renderMenu();
  bindMenu();
  renderCode();
  bindCode();
  renderMyBank();
  bindMyBank();
  renderNotify();
  bindNotify();
  initQR();

  //--------------------------------------------------------
  // H. 호출 로그
  //--------------------------------------------------------
  safeRenderNotifyLogs();
  bindNotifyLogs();

  //--------------------------------------------------------
  // I. 개인정보 처리방침
  //--------------------------------------------------------
  renderPolicy();
  bindPolicy();

  //--------------------------------------------------------
  // J. 실시간 메시지 처리
  //--------------------------------------------------------
  adminChannel.onmessage = async (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    const currentStoreId =
      window.qrnrStoreId ||
      localStorage.getItem('qrnr.storeId') ||
      'store1';

    const msgStoreId =
      msg.storeId ||
      msg.store ||
      msg.store_id ||
      msg.sid ||
      null;

    // 다른 매장 메시지 무시
    if (msgStoreId && currentStoreId && msgStoreId !== currentStoreId) {
      console.log('[admin] ignore message for other store:', msgStoreId);
      return;
    }

    // 메시지 처리
    if (msg.type === 'CALL') {
      showToast(
        `테이블 ${msg.table || '-'} 호출${msg.note ? ' - ' + msg.note : ''}`,
        'info'
      );
      notifyEvent(msg);
      safeRenderNotifyLogs();
    }

    if (msg.type === 'NEW_ORDER_PAID') {
      showToast(`주문 결제 완료 - ${msg.orderId || ''}`, 'success');
      notifyEvent(msg);
      safeRenderStore();
      safeRenderDeliv();
    }
  };
}

main();
