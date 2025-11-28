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
import { get, ensureStoreInitialized } from './modules/store.js'; // ★ ensureStoreInitialized 불러옴

// ===== 데스크탑 알림 권한 (브라우저에 한 번 요청) =====
if (typeof window !== 'undefined' && 'Notification' in window) {
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

// ===== 새로고침 폭탄 방지 =====
const REFRESH_COOLDOWN_MS = 5000;

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

const safeRenderStore      = makeSafeRefresher(renderStore);
const safeRenderDeliv      = makeSafeRefresher(renderDeliv);
const safeRenderNotifyLogs = makeSafeRefresher(renderNotifyLogs);

// ===== storeId 결정 함수 =====
function resolveStoreId(adminId) {
  if (adminId && typeof get === 'function') {
    try {
      const map = get(['system', 'storeAdmins']) || {};
      const mapped = map[adminId];
      console.log('[admin] storeAdmins map for', adminId, ':', mapped);

      let sid = null;

      if (typeof mapped === 'string') {
        sid = mapped;
      } else if (mapped && typeof mapped === 'object') {
        sid =
          mapped.storeId ||
          mapped.store ||
          mapped.storeCode ||
          mapped.store_id ||
          null;
      }

      if (sid) {
        console.log('[admin] storeId from mapping:', adminId, '->', sid);
        return sid;
      } else {
        console.log('[admin] no usable storeId in mapping for', adminId);
      }
    } catch (e) {
      console.error('[admin] resolveStoreId mapping error', e);
    }
  }

  try {
    const stored = localStorage.getItem('qrnr.storeId');
    if (stored) {
      console.log('[admin] storeId from localStorage:', stored);
      return stored;
    }
  } catch (e) {
    console.error('[admin] resolveStoreId localStorage read error', e);
  }

  console.log('[admin] storeId fallback: store1');
  return 'store1';
}

const adminChannel = new BroadcastChannel('qrnr-admin');

// 토스트 UI
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
  closeBtn.style.marginLeft = '8px';
  closeBtn.onclick = () => toast.remove();

  toast.appendChild(closeBtn);
  box.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2500);
}

// ===== 메인 진입 =====
async function main() {
  // 1) 관리자 인증
  const session = await requireAuth('admin');
  if (!session) return;

  const adminId =
    session.uid ||
    session.sub ||
    (session.user && (session.user.uid || session.user.id)) ||
    (session.payload &&
      (session.payload.uid || session.payload.sub)) ||
    null;

  console.log('[admin] session from verify:', session);
  console.log('[admin] resolved adminId:', adminId);

  // 2) storeId 결정
  const sid = resolveStoreId(adminId);
  window.qrnrStoreId = sid;
  localStorage.setItem('qrnr.storeId', sid);
  console.log('[admin] final storeId =', sid);

  // ★★★ 즉시 해결 핵심: 매장 메뉴/QR 저장 구조 자동 생성
  try {
    ensureStoreInitialized(sid);   // ★ 추가
    console.log('[admin] ensureStoreInitialized applied for', sid);
  } catch (e) {
    console.error('[admin] ensureStoreInitialized error', e);
  }

  // 3) URL 파라미터 통일
  try {
    const u = new URL(location.href);
    u.searchParams.set('store', sid);
    history.replaceState(null, '', u.toString());
  } catch (e) {
    console.error('[admin] URL store param set error', e);
  }

  // 4) 서버와 동기화
  await syncStoreFromServer();
  initTabs();

  // 탭 이벤트
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'store') safeRenderStore();
      else if (tab === 'delivery') safeRenderDeliv();
      else if (tab === 'notify-log') safeRenderNotifyLogs();
    });
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearToken();
      location.href = '/admin';
    };
  }

  // 필터/초기 렌더
  bindFilters();
  safeRenderStore();
  safeRenderDeliv();
  attachGlobalHandlers();

  // 새로고침 버튼
  const storeRefresh = document.getElementById('store-refresh');
  if (storeRefresh) storeRefresh.onclick = () => safeRenderStore();

  const delivRefresh = document.getElementById('deliv-refresh');
  if (delivRefresh) delivRefresh.onclick = () => safeRenderDeliv();

  // 엑셀 export
  const storeExportBtn = document.getElementById('store-export');
  if (storeExportBtn) storeExportBtn.onclick = () => exportOrders('store');

  const delivExportBtn = document.getElementById('deliv-export');
  if (delivExportBtn) delivExportBtn.onclick = () => exportOrders('delivery');

  // 메뉴/QR/코드/계좌/알림
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
  renderNotifyLogs();
  bindNotifyLogs();

  // 개인정보 처리방침
  renderPolicy();
  bindPolicy();

  // 실시간 메시지 채널
  adminChannel.onmessage = (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    const currentStoreId = window.qrnrStoreId || 'store1';

    const msgStoreId =
      msg.storeId ||
      msg.store ||
      msg.store_id ||
      msg.sid ||
      null;

    if (msgStoreId && msgStoreId !== currentStoreId) {
      console.log('[admin] ignore message for other store', {
        msgStoreId,
        currentStoreId,
      });
      return;
    }

    console.log('[admin] accepted message', { msgStoreId, currentStoreId, msg });

    if (msg.type === 'CALL') {
      showToast(
        `테이블 ${msg.table || '-'} 직원 호출${msg.note ? ' - ' + msg.note : ''}`,
        'info'
      );
      notifyEvent({ ...msg, kind: 'call' });
      safeRenderNotifyLogs();
      return;
    }

    if (msg.type === 'NEW_ORDER') {
      showToast('새 주문이 도착했습니다.', 'success');
      notifyEvent({ ...msg, kind: 'order' });
      safeRenderStore();
      safeRenderDeliv();
      return;
    }

    if (msg.type === 'NEW_ORDER_PAID') {
      showToast(`주문 결제 완료 - 주문번호 ${msg.orderId || ''}`, 'success');
      notifyEvent(msg);
      safeRenderStore();
      safeRenderDeliv();
    }
  };
}

main();
