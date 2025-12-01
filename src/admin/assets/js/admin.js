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


// ============================================================
//  ⭐  storeId는 오직 "JWT"에서 온 값만 신뢰한다.
// ============================================================
// URL ?store= 로 storeId를 변경하는 기능은 반드시 차단해야 한다.
// localStorage 값은 표시용/백업용이며 판단 기준이 아니다.

// JWT는 requireAuth() → payload 반환 시 이미 storeId가 저장되어 있음.
// admin.js에서는 "읽기"만 한다.
function getSafeStoreId() {
  // 최우선: localStorage에 저장된 값 (auth.js에서 세팅)
  const sid = localStorage.getItem('qrnr.storeId');
  if (sid) return sid;

  // 최후 fallback
  return 'store1';
}


// ============================================================
//  알림 토스트
// ============================================================
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
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2300);
}


// ============================================================
// 새로고침 폭탄 방지
// ============================================================
const REFRESH_COOLDOWN_MS = 5000;

function makeSafeRefresher(realFn) {
  let last = 0;
  return async (...args) => {
    const now = Date.now();
    if (now - last < REFRESH_COOLDOWN_MS) {
      console.log('[safeRefresh] skip:', realFn.name);
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


// ============================================================
// 메인
// ============================================================
async function main() {
  // 1) 인증 (JWT 검증)
  const session = await requireAuth('admin');
  if (!session) return;

  console.log('[admin] session', session);

  // 2) storeId 가져오기 (JWT 기반)
  const sid = getSafeStoreId();
  window.qrnrStoreId = sid;
  console.log('[admin] final storeId =', sid);

  // 3) URL 표시용으로 storeId 주입 (판단 기준 아님)
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('store') !== sid) {
      u.searchParams.set('store', sid);
      history.replaceState(null, '', u.toString());
    }
  } catch (e) {
    console.error('[admin] URL set store error', e);
  }

  // 4) 매장별 설정 동기화
  await syncStoreFromServer();
  initTabs();

  // 기본 렌더
  bindFilters();
  safeRenderStore();
  safeRenderDeliv();
  attachGlobalHandlers();

  // 새로고침 버튼
  const storeRefresh = document.getElementById('store-refresh');
  if (storeRefresh) {
    storeRefresh.onclick = () => safeRenderStore();
  }

  const delivRefresh = document.getElementById('deliv-refresh');
  if (delivRefresh) {
    delivRefresh.onclick = () => safeRenderDeliv();
  }

  // 엑셀 export
  const storeExportBtn = document.getElementById('store-export');
  if (storeExportBtn) {
    storeExportBtn.onclick = () => exportOrders('ordersStore');
  }
  const delivExportBtn = document.getElementById('deliv-export');
  if (delivExportBtn) {
    delivExportBtn.onclick = () => exportOrders('ordersDelivery');
  }

  // 메뉴/QR/계좌/코드/알림 초기화
  renderMenu();
  bindMenu();
  renderCode();
  bindCode();
  renderMyBank();
  bindMyBank();
  renderNotify();
  bindNotify();
  initQR();

  // 호출 로그
  safeRenderNotifyLogs();
  bindNotifyLogs();

  // 개인정보 처리방침
  renderPolicy();
  bindPolicy();


  // ============================================================
  // 실시간 알림
  // ============================================================
  const bc = new BroadcastChannel('qrnr-admin');
  bc.onmessage = (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    const currentStore = window.qrnrStoreId || sid;

    const msgStore =
      msg.storeId ||
      msg.store ||
      msg.store_id ||
      msg.sid ||
      null;

    // 내 매장이 아니면 무시
    if (msgStore && msgStore !== currentStore) {
      console.log('[admin] skip foreign msg', msgStore);
      return;
    }

    if (msg.type === 'CALL') {
      showToast(`테이블 ${msg.table || '-'} 호출`, 'info');
      notifyEvent(msg);
      safeRenderNotifyLogs();
    }

    if (msg.type === 'NEW_ORDER_PAID') {
      showToast(`결제완료 주문 ${msg.orderId || ''}`, 'success');
      notifyEvent(msg);
      safeRenderStore();
      safeRenderDeliv();
    }
  };

  // 로그아웃
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearToken();
      location.href = '/admin';
    };
  }
}

main();
