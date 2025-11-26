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

// ===== 데스크탑 알림 권한 (브라우저에 한 번 요청) =====
if (typeof window !== 'undefined' && 'Notification' in window) {
  if (Notification.permission === 'default') {
    // 사용자가 이미 허용/차단한 상태가 아니면 한 번만 물어봄
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

// ===== storeId 결정 =====
function resolveStoreId() {
  let sid = null;

  // 1) URL ?store= 우선
  try {
    const u = new URL(location.href);
    const fromUrl = u.searchParams.get('store');
    if (fromUrl) {
      localStorage.setItem('qrnr.storeId', fromUrl);
      return fromUrl;
    }
  } catch (e) {}

  // 2) 로그인한 관리자 ID 기반 매핑 (추후 DB 연동 가능)
  let adminId = null;
  try {
    const info = JSON.parse(localStorage.getItem('qrnr.adminInfo') || '{}');
    adminId = info.id || info.email || null;
  } catch (e) {}

  if (adminId) {
    // 주: get([...])는 바깥에서 전역으로 제공된다고 가정 (기존 코드 유지)
    const map = get(['system', 'storeAdmins']) || {};
    if (map[adminId]) {
      sid = map[adminId];
      localStorage.setItem('qrnr.storeId', sid);
      return sid;
    }
  }

  // 3) 마지막으로 로컬에 기억된 storeId 또는 기본값
  sid = localStorage.getItem('qrnr.storeId') || 'store1';
  return sid;
}

// 초기 storeId (URL 우선)
const url = new URL(location.href);
const storeId =
  url.searchParams.get('store') ||
  localStorage.getItem('qrnr.storeId') ||
  'store1';

window.qrnrStoreId = storeId;
localStorage.setItem('qrnr.storeId', storeId);

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
  await requireAuth('admin');

  // ✅ 최종 storeId 결정
  const sid = resolveStoreId();
  window.qrnrStoreId = sid;
  console.log('[admin] storeId =', sid);

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

  document.getElementById('logoutBtn').onclick = () => {
    clearToken();
    location.href = '/admin';
  };

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
  document.getElementById('store-export').onclick = () =>
    exportOrders('ordersStore');
  document.getElementById('deliv-export').onclick = () =>
    exportOrders('ordersDelivery');

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

    const currentStoreId = window.qrnrStoreId || 'store1';

    // 매장 불일치 메시지는 무시
    if (msg.storeId && msg.storeId !== currentStoreId) {
      return;
    }

    if (msg.type === 'CALL') {
      showToast(
        `테이블 ${msg.table || '-'} 직원 호출${
          msg.note ? ' - ' + msg.note : ''
        }`,
        'info'
      );

      // 🔔 소리 + 데스크탑 알림 트리거 (매장별 설정 반영)
      notifyEvent(msg);

      // 호출 로그 새로고침 (쿨타임 내 중복 호출 차단)
      safeRenderNotifyLogs();
    }

    if (msg.type === 'NEW_ORDER_PAID') {
      showToast(
        `주문 결제 완료 - 주문번호 ${msg.orderId || ''}`,
        'success'
      );

      // 🔔 소리 + 데스크탑 알림 트리거
      notifyEvent(msg);

      // 매장/배달 주문 목록 새로고침 (각각 쿨타임 처리)
      safeRenderStore();
      safeRenderDeliv();
    }
  };
}

main();
