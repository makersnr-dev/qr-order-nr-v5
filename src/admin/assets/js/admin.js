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
import { renderNotifyLogs } from './modules/notify-logs.js';
import {
  initNotify,
  bindNotifyControls,
  initDesktopNotify,
  notifyEvent,
} from './modules/notify.js';

// 단축 select
const $ = (s, r = document) => r.querySelector(s);

// 폭탄 방지: 렌더링 여러 번 눌러도 직전 작업 끝난 뒤에만 실행
function makeSafeRefresher(realFn) {
  let running = false;
  return async function safeRefresher(...args) {
    if (running) return;
    running = true;
    try {
      await realFn(...args);
    } finally {
      running = false;
    }
  };
}

// 안전 래퍼 적용된 렌더러들
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

// ===== admin 진입 시 초기 렌더링 =====

function bindLogout() {
  const btn = document.getElementById('btn-logout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const ok = confirm('로그아웃 하시겠습니까?');
    if (!ok) return;
    await clearToken('admin');
    location.href = '/admin/login';
  });
}

// 공통 토스트
function showToast(message, type = 'info') {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.style.position = 'fixed';
    wrap.style.right = '16px';
    wrap.style.bottom = '16px';
    wrap.style.zIndex = '9999';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';
    document.body.appendChild(wrap);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.minWidth = '240px';
  toast.style.padding = '8px 12px';
  toast.style.borderRadius = '8px';
  toast.style.fontSize = '13px';
  toast.style.background =
    type === 'error'
      ? '#fee2e2'
      : type === 'success'
      ? '#dcfce7'
      : '#e5e7eb';
  toast.style.color =
    type === 'error'
      ? '#991b1b'
      : type === 'success'
      ? '#166534'
      : '#111827';
  toast.style.boxShadow =
    '0 4px 10px rgba(0,0,0,0.15)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.justifyContent = 'space-between';
  toast.style.gap = '12px';

  const span = document.createElement('span');
  span.textContent = message;
  toast.appendChild(span);

  const close = document.createElement('button');
  close.textContent = '×';
  close.style.border = 'none';
  close.style.background = 'transparent';
  close.style.cursor = 'pointer';
  close.style.fontSize = '16px';
  close.style.lineHeight = '1';
  close.style.marginLeft = '4px';
  close.onclick = () => toast.remove();
  toast.appendChild(close);

  wrap.appendChild(toast);

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

  // 2) 최종 storeId 결정 (매핑 / localStorage)
  const sid = resolveStoreId(adminId);
  window.qrnrStoreId = sid;
  localStorage.setItem('qrnr.storeId', sid);
  console.log('[admin] final storeId =', sid);

  // 3) 주소창의 ?store= 값을 현재 매장으로 강제 동기화
  try {
    const u = new URL(location.href);
    u.searchParams.set('store', sid);
    history.replaceState(null, '', u.toString());
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
      } else if (tab === 'deliv') {
        safeRenderDeliv();
      } else if (tab === 'qr') {
        initQR();
      } else if (tab === 'menu') {
        renderMenu();
      } else if (tab === 'code') {
        renderCode();
      } else if (tab === 'mybank') {
        renderMyBank();
      } else if (tab === 'policy') {
        renderPolicy();
      } else if (tab === 'notifyLogs') {
        safeRenderNotifyLogs();
      }
    });
  });

  // 최초 진입시 매장 주문 탭 렌더
  safeRenderStore();

  // 각 모듈 바인딩
  bindFilters();
  bindMenu();
  bindCode();
  bindMyBank();
  bindPolicy();
  bindNotifyControls();
  attachGlobalHandlers();

  // 알림 초기화
  initNotify();
  initDesktopNotify();

  bindLogout();

  // "주문 내역 내보내기" 버튼
  const btnExport = document.getElementById('btn-export');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      exportOrders();
    });
  }

  // SSE 등에서 들어오는 이벤트와 연결 (예: 새 주문/상태변경 시 알림)
  if (window.EventSource) {
    try {
      const es = new EventSource('/api/orders-stream');
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data || '{}');
          console.log('[admin] SSE message:', msg);
          if (msg.type === 'notify') {
            notifyEvent(msg);
          }
          if (msg.type === 'refresh-orders') {
            safeRenderStore();
            safeRenderDeliv();
            safeRenderNotifyLogs();
          }
        } catch (e) {
          console.error('[admin] SSE message parse error', e);
        }
      };
      es.onerror = (e) => {
        console.warn('[admin] SSE error', e);
      };
    } catch (e) {
      console.warn('[admin] SSE init error', e);
    }
  }

  // 예시: 결제 성공 알림 전용 채널 (WebSocket 또는 SSE)
  if (window.EventSource) {
    try {
      const payEs = new EventSource('/api/pay-stream');
      payEs.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data || '{}');
          console.log('[admin] pay-stream message:', msg);
          if (msg.type === 'payment-success') {
            showToast(
              `주문 결제 완료 - 주문번호 ${msg.orderId || ''}`,
              'success'
            );
            notifyEvent(msg);
            safeRenderStore();
            safeRenderDeliv();
          }
        } catch (e) {
          console.error('[admin] pay-stream message parse error', e);
        }
      };
      payEs.onerror = (e) => {
        console.warn('[admin] pay-stream SSE error', e);
      };
    } catch (e) {
      console.warn('[admin] pay-stream SSE init error', e);
    }
  }
}

main();
