
import {requireAuth, clearToken} from './modules/auth.js';
import {initTabs} from './modules/ui.js';
import {renderStore, renderDeliv, bindFilters, exportOrders, attachGlobalHandlers,syncStoreFromServer} from './modules/orders.js';
import {initQR} from './modules/qr.js';
import {renderMenu, bindMenu} from './modules/menu.js';
import {renderCode, bindCode} from './modules/code.js';
import {renderMyBank, bindMyBank} from './modules/mybank.js';
import {renderNotify, bindNotify} from './modules/notify.js';
import { renderNotifyLogs, bindNotifyLogs } from './modules/notify-logs.js';


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

  // 2) 로그인한 관리자 ID 기반 매핑
  // requireAuth('admin')에서 사용자 정보를 어딘가에 저장해뒀다는 가정 (예: localStorage)
  // 지금 당장은 임시로 localStorage에 qrnr.adminId 같은 값 두고 써도 되고,
  // 나중에 DB 연동 시 여기만 진짜 값으로 교체하면 됨.
  let adminId = null;
  try {
    const info = JSON.parse(localStorage.getItem('qrnr.adminInfo') || '{}');
    adminId = info.id || info.email || null;
  } catch (e) {}

  if (adminId) {
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

async function main(){
  await requireAuth('admin');

  // ✅ 여기서 최종 storeId 결정
  const sid = resolveStoreId();
  window.qrnrStoreId = sid;
  console.log('[admin] storeId =', sid);

  
  await syncStoreFromServer();
  initTabs();

  document.getElementById('logoutBtn').onclick = () => {
    clearToken();
    location.href = '/admin';
  };

  // 기본 세팅
  bindFilters();
  renderStore();
  renderDeliv();
  attachGlobalHandlers();

  // 🔹 탭별 새로고침 버튼 연결
  const storeRefresh = document.getElementById('store-refresh');
  if (storeRefresh) {
    storeRefresh.onclick = () => {
      renderStore();        // 매장 주문 테이블만 다시 불러오기
    };
  }

  const delivRefresh = document.getElementById('deliv-refresh');
  if (delivRefresh) {
    delivRefresh.onclick = () => {
      renderDeliv();        // 배달/예약 주문 테이블만 다시 불러오기
    };
  }

  // 엑셀 export
  document.getElementById('store-export').onclick = () => exportOrders('ordersStore');
  document.getElementById('deliv-export').onclick = () => exportOrders('ordersDelivery');

  // 나머지 설정들
  renderMenu(); bindMenu();
  renderCode(); bindCode();
  renderMyBank(); bindMyBank();
  renderNotify(); bindNotify();
  initQR();
  renderNotifyLogs(); bindNotifyLogs();

  // 🔔 실시간 알림
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
      `테이블 ${msg.table || '-'} 직원 호출${msg.note ? ' - ' + msg.note : ''}`,
      'info'
    );
  }

  if (msg.type === 'NEW_ORDER_PAID') {
    showToast(
      `주문 결제 완료 - 주문번호 ${msg.orderId || ''}`,
      'success'
    );
  }
};

}

main();

