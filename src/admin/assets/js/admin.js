
import {requireAuth, clearToken} from './modules/auth.js';
import {initTabs} from './modules/ui.js';
import {renderStore, renderDeliv, bindFilters, exportOrders, attachGlobalHandlers,syncStoreFromServer} from './modules/orders.js';
import {initQR} from './modules/qr.js';
import {renderMenu, bindMenu} from './modules/menu.js';
import {renderCode, bindCode} from './modules/code.js';
import {renderMyBank, bindMyBank} from './modules/mybank.js';
import {renderNotify, bindNotify} from './modules/notify.js';
import { renderNotifyLogs, bindNotifyLogs } from './modules/notify-logs.js';


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
  await syncStoreFromServer();
  initTabs();
  document.getElementById('logoutBtn').onclick=()=>{ clearToken(); location.href='/admin'; };
  bindFilters(); renderStore(); renderDeliv(); attachGlobalHandlers();
  document.getElementById('store-export').onclick=()=>exportOrders('ordersStore');
  document.getElementById('deliv-export').onclick=()=>exportOrders('ordersDelivery');
  renderMenu(); bindMenu(); renderCode(); bindCode(); renderMyBank(); bindMyBank(); 
  renderNotify(); bindNotify();initQR();renderNotifyLogs();bindNotifyLogs();

    // 🔔 실시간(브라우저 내부) 알림 수신
  adminChannel.onmessage = async (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    if (msg.type === 'CALL') {
      // 직원 호출 알림 토스트
      showToast(
        `테이블 ${msg.table || '-'} 직원 호출${msg.note ? ' - ' + msg.note : ''}`,
        'info'
      );

      // 나중에 서버 CALL 저장도 쓰고 있으면, 여기서 목록 새로고침
      // await syncStoreFromServer();
      // renderStore();
    }

    if (msg.type === 'NEW_ORDER_PENDING') {
      showToast(
        `테이블 ${msg.table || '-'} 주문 진행 중`,
        'info'
      );
    }

    if (msg.type === 'NEW_ORDER_PAID') {
      showToast(
        `주문 결제 완료 - 주문번호 ${msg.orderId || ''}`,
        'success'
      );

      // 여기서도 서버에 저장하는 구조가 있다면:
      // await syncStoreFromServer();
      // renderStore();
    }
  };

}
main();
