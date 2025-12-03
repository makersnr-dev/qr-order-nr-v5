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
// 1) URL ?store= 우선
// 2) 매장 관리자 매핑에서 adminId → storeId
// 3) localStorage에 남아 있던 storeId
// 4) 마지막 fallback: 'store1'
function resolveStoreId(adminId) {
  // 1) URL ?store= 우선
  try {
    const u = new URL(location.href);
    const fromUrl = u.searchParams.get('store');
    if (fromUrl) {
      localStorage.setItem('qrnr.storeId', fromUrl);
      console.log('[admin] storeId from URL:', fromUrl);
      return fromUrl;
    }
  } catch (e) {
    console.error('[admin] resolveStoreId URL parse error', e);
  }

  // 2) 매장 관리자 매핑에서 adminId → storeId 찾기
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
        // ⚠️ 매장 ID로 쓸만한 필드만 본다. (id/이름 같은 건 절대 안 씀)
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

  // 3) 로컬스토리지에 기억된 storeId
  const stored = localStorage.getItem('qrnr.storeId');
  if (stored) {
    console.log('[admin] storeId from localStorage:', stored);
    return stored;
  }

  // 4) 아무것도 없으면 기본값
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
  }, 2500);
}

async function main() {
  // 1) 관리자 인증 (토큰 검증)
  const session = await requireAuth('admin');
  if (!session) return;

  // verify 응답에서 adminId 추출 (여러 케이스 방어적으로 처리)
  const adminId =
    session.uid ||
    session.sub ||
    (session.user && (session.user.uid || session.user.id)) ||
    (session.payload &&
      (session.payload.uid || session.payload.sub)) ||
    null;

  console.log('[admin] session from verify:', session);
  console.log('[admin] resolved adminId:', adminId);

  // 2) 최종 storeId 결정 (URL / 매핑 / localStorage)
  const sid = resolveStoreId(adminId);
  window.qrnrStoreId = sid;
  localStorage.setItem('qrnr.storeId', sid);
  console.log('[admin] final storeId =', sid);

  // 3) 주소창에 ?store= 없으면 한 번 넣어주기
  try {
    const u = new URL(location.href);
    if (!u.searchParams.get('store')) {
      u.searchParams.set('store', sid);
      history.replaceState(null, '', u.toString());
    }
  } catch (e) {
    console.error('[admin] URL store param set error', e);
  }

  // 4) 서버에서 매장 관련 설정/데이터 동기화
  await syncStoreFromServer();
  initTabs();

  // 🔹 탭 클릭 시: 해당 탭 내용 새로고침 (폭탄 방지 래퍼 사용)
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'store') {
        safeRenderStore();
      } else if (tab === 'delivery') {
        safeRenderDeliv();
      } else if (tab === 'notify-log') {
        safeRenderNotifyLogs();
      }
    });
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearToken();
      location.href = '/admin';
    };
  }

  // 기본 세팅
  bindFilters();
  // 초회 로딩도 안전 래퍼로 (한 번만 실행됨)
  safeRenderStore();
  safeRenderDeliv();
  attachGlobalHandlers();

  // 🔹 탭별 새로고침 버튼 연결 (안전 래퍼 사용)
  const storeRefresh = document.getElementById('store-refresh');
  if (storeRefresh) {
    storeRefresh.onclick = () => {
      safeRenderStore(); // 매장 주문 테이블 새로고침
    };
  }

  const delivRefresh = document.getElementById('deliv-refresh');
  if (delivRefresh) {
    delivRefresh.onclick = () => {
      safeRenderDeliv(); // 배달/예약 주문 테이블 새로고침
    };
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

  // 나머지 설정들
  renderMenu();
  bindMenu();
  renderCode();
  bindCode();
  renderMyBank();
  bindMyBank();
  renderNotify();
  bindNotify();
  initQR();

  // 호출 로그: 초기 렌더 + 바인딩
  safeRenderNotifyLogs();
  bindNotifyLogs();

  // 🔹 개인정보 처리방침
  renderPolicy();
  bindPolicy();

  // 호출 로그 새로고침 버튼도 안전 래퍼로 덮어쓰기
  const notifyRefresh = document.getElementById('notify-log-refresh');
  if (notifyRefresh) {
    notifyRefresh.onclick = () => {
      safeRenderNotifyLogs();
    };
  }

  // 🔔 실시간 알림 (주문/호출 들어올 때도 안전 새로고침 + 사운드/데스크탑 알림)
  adminChannel.onmessage = async (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  // 현재 관리자 페이지가 바라보는 매장 ID
  const currentStoreId =
    window.qrnrStoreId ||
    localStorage.getItem('qrnr.storeId') ||
    'store1';

  // 👉 메시지 안에서 매장 ID 후보를 최대한 뽑아서 통일
  const msgStoreId =
    msg.storeId ||
    msg.store ||
    msg.store_id ||
    msg.sid ||
    null;

  // 🔒 매장별 필터: "내 매장"이 아닌 것은 아예 무시
  if (msgStoreId && currentStoreId && msgStoreId !== currentStoreId) {
    console.log('[admin] ignore message for other store', {
      msgStoreId,
      currentStoreId,
      msg,
    });
    return;
  }

  console.log('[admin] accepted message', {
    msgStoreId,
    currentStoreId,
    msg,
  });

  if (msg.type === 'CALL') {
    // 화면 상단 토스트
    showToast(
      `테이블 ${msg.table || '-'} 직원 호출${
        msg.note ? ' - ' + msg.note : ''
      }`,
      'info'
    );

    // 🔔 소리 + 데스크탑 알림 (notify.js 쪽에서 실행)
    notifyEvent(msg);

    // 호출 로그 새로고침
    safeRenderNotifyLogs();
  }

  if (msg.type === 'NEW_ORDER_PAID') {
    showToast(
      `주문 결제 완료 - 주문번호 ${msg.orderId || ''}`,
      'success'
    );

    notifyEvent(msg);

    // 매장/배달 주문 목록 새로고침
    safeRenderStore();
    safeRenderDeliv();
  }
};
}

main();
