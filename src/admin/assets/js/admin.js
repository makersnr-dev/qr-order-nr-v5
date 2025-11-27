// /src/admin/assets/js/admin.js
// 관리자 메인 페이지 스크립트
// - JWT 기반 requireAuth('admin')로 로그인 확인
// - 로그인한 관리자 ID → system.storeAdmins 매핑으로 storeId 결정
// - URL ?store= 파라미터는 "보기용"으로만 맞춰주고, 보안에는 사용하지 않음

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

// ✅ 관리자용 설정 저장소에서 매장 매핑을 읽어옴
//    (store-admin 페이지도 이 모듈을 씀)
import { get } from './modules/store.js';

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

// ===== storeId 결정 (보안용) =====
// 🔒 URL ?store= 값은 "보안 기준"으로 쓰지 않고,
//     로그인한 관리자 ID → system.storeAdmins 매핑 결과를 우선 사용한다.
function resolveAdminStoreId(authInfo) {
  let sid = null;

  // 1) 로그인한 관리자 ID 가져오기 (토큰 payload 기준)
  let adminId = null;
  try {
    adminId = authInfo?.uid || authInfo?.sub || null;
  } catch (e) {
    console.error('[admin] resolveAdminStoreId: authInfo read error', e);
  }

  // 2) system.storeAdmins[adminId] 매핑 사용
  if (adminId && typeof get === 'function') {
    try {
      const map = get(['system', 'storeAdmins']) || {};
      if (map[adminId]) {
        sid = map[adminId];
        console.log('[admin] storeAdmins mapping:', adminId, '→', sid);
      }
    } catch (e) {
      console.error('[admin] resolveAdminStoreId: storeAdmins map error', e);
    }
  }

  // 3) 매핑이 없으면 마지막 사용 storeId or 기본값
  if (!sid) {
    try {
      sid = localStorage.getItem('qrnr.storeId') || 'store1';
    } catch (e) {
      sid = 'store1';
    }
    console.log('[admin] fallback storeId =', sid);
  }

  // 4) URL ?store= 은 "보기 편하게"만 sid 로 맞춰준다 (보안 X)
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('store') !== sid) {
      u.searchParams.set('store', sid);
      history.replaceState(null, '', u.toString());
    }
  } catch (e) {
    // URL 파싱 실패해도 치명적이지 않으므로 무시
  }

  return sid;
}

// ===== 토스트 UI + 브로드캐스트 채널 =====
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
  // 1) 관리자 로그인 필수
  const authInfo = await requireAuth('admin');
  if (!authInfo) return; // requireAuth 안에서 이미 로그인 페이지로 보냄

  // 2) 로그인한 관리자 ID → 본인 매장(storeId) 결정
  const sid = resolveAdminStoreId(authInfo);
  window.qrnrStoreId = sid;
  try {
    localStorage.setItem('qrnr.storeId', sid);
  } catch (e) {}

  // adminInfo 도 참고용으로 저장
  try {
    const adminId = authInfo?.uid || authInfo?.sub || null;
    if (adminId) {
      localStorage.setItem(
        'qrnr.adminInfo',
        JSON.stringify({ id: adminId, storeId: sid })
      );
    }
  } catch (e) {
    console.warn('[admin] adminInfo save error', e);
  }

  console.log('[admin] active storeId =', sid);

  // 3) 서버와 매장 설정 동기화 후 탭 초기화
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

  // 로그아웃
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearToken();
      location.href = '/admin';
    };
  }

  // 기본 필터/이벤트 바인딩
  bindFilters();

  // 초회 로딩도 안전 래퍼로 (한 번만 실행됨)
  safeRenderStore();
  safeRenderDeliv();
  attachGlobalHandlers();

  // 탭별 새로고침 버튼 연결 (안전 래퍼 사용)
  const storeRefresh = document.getElementById('store-refresh');
  if (storeRefresh) {
    storeRefresh.onclick = () => {
      safeRenderStore();
    };
  }

  const delivRefresh = document.getElementById('deliv-refresh');
  if (delivRefresh) {
    delivRefresh.onclick = () => {
      safeRenderDeliv();
    };
  }

  // 엑셀 export
  const storeExport = document.getElementById('store-export');
  if (storeExport) {
    storeExport.onclick = () => exportOrders('ordersStore');
  }
  const delivExport = document.getElementById('deliv-export');
  if (delivExport) {
    delivExport.onclick = () => exportOrders('ordersDelivery');
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

  // 🔹 개인정보 처리방침 (관리자 설정 탭)
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

    // 🔒 매장 불일치 메시지는 무시 (본인 매장 아닌 알림/소리 막기)
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

main().catch((e) => {
  console.error('[admin] main error', e);
});
