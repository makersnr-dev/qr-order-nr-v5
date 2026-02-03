// /src/admin/assets/js/modules/orders.js
/**
 * =====================================================
 * [DB 기반 주문 관리]
 * - 모든 주문 데이터는 /api/orders (DB) 기준
 * - localStorage는 완전히 제거
 * =====================================================
 */
import { showToast } from '../admin.js';
import { fmt } from './store.js';
import {
  STATUS_FLOW,
  STATUS_LIST,
  ORDER_STATUS,
  PAYMENT_STATUS
} from '/src/shared/constants/status.js';
import { ADMIN_EVENTS } from '/src/shared/constants/adminEvents.js';

let __isRendering = false;
let __renderQueued = false;

// 인자값으로 type을 받도록 수정 (기본값은 'all'로 설정)
async function safeRenderAll(type = 'all') {
  if (__isRendering) {
    __renderQueued = type; // 어떤 타입을 렌더링하려 했는지 저장
    return;
  }

  __isRendering = true;
  try {
    if (type === 'store') {
      await renderStore();
    } else if (type === 'reserve') {
      await renderDeliv();
    } else {
      // type이 'all'이거나 없을 경우 둘 다 실행
      await renderStore();
      await renderDeliv();
    }
  } finally {
    __isRendering = false;

    if (__renderQueued) {
      const nextType = __renderQueued;
      __renderQueued = false;
      await safeRenderAll(nextType);
    }
  }
}

function currentStoreId() {
  if (!window.qrnrStoreId) {
    showToast('매장 정보 오류! 관리자 페이지를 새로고침 해주세요.', 'error');
    throw new Error('STORE_ID_NOT_INITIALIZED');
  }
  return window.qrnrStoreId;
}

// ===============================
// 요청 중 잠금 (주문 단위)
// ===============================
const pendingOrders = new Set();

function isPending(id) {
  return pendingOrders.has(id);
}

function lockOrder(id) {
  pendingOrders.add(id);
}

function unlockOrder(id) {
  pendingOrders.delete(id);
}

// ===============================
// 관리자 고유 ID (탭 단위)
// ===============================
const ADMIN_ID = sessionStorage.getItem('qrnr.adminId.real') || 'admin';

const isMobile = () => window.innerWidth <= 768;

const UI_TEXT = {
  ORDER_CANCEL: '주문취소',
  PAYMENT_CANCEL: '결제취소',
  POS_PAID: 'POS 결제 확인',
  PAID_DONE: '결제 완료',
  CANCEL_REASON_REQUIRED: '취소 사유를 입력하세요.'
};

// ===============================
// 주문 상태 변경
// ===============================
async function changeOrderStatus({ id, status, type }) {
  if (!id || typeof id !== 'string') {
    console.warn('[BLOCKED] invalid order id:', id);
    showToast('유효하지 않은 주문입니다.', 'error');
    return;
  }
  
  if (!id || !status) return;

  const allowedStatuses =
    type === 'store'
      ? STATUS_LIST.store
      : STATUS_LIST.reserve;

  if (
    status === PAYMENT_STATUS.PAID ||
    status === PAYMENT_STATUS.CANCELLED
  ) {
    console.warn('[BLOCKED] payment status passed to changeOrderStatus:', status);
    return;
  }
  
  if (!allowedStatuses.includes(status)) {
    console.warn('[BLOCKED] invalid status change attempt:', status);
    return;
  }

  const storeId = currentStoreId();

  const historyItem = {
    at: new Date().toISOString(),
    type: 'ORDER',
    action: 'STATUS_CHANGE',
    value: status,
    by: ADMIN_ID,
    note: '상태 변경'
  };

  const payload = {
    orderId: id,
    status,
    type: type
  };

  if (isPending(id)) {
    showToast('이미 처리 중인 주문입니다.', 'info');
    return;
  }
  
  lockOrder(id);

  try {
    const res = await fetch('/api/orders', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        metaAppend: {
          history: historyItem
        }
      })
    });

    const data = await res.json();
    if (!data.ok) {
      await safeRenderAll(type);
      throw new Error(data.error || 'STATUS_CHANGE_FAILED');
    }

    // 관리자 간 이벤트 전파
    try {
      const channel = new BroadcastChannel('qrnr-admin');
      channel.postMessage({
        type: ADMIN_EVENTS.ORDER_STATUS_CHANGED,
        storeId,
        orderId: id,
        senderId: ADMIN_ID,
        at: Date.now(),
        orderType: type
      });
    } catch {}
  } catch (err) {
    console.error(err);
    showToast('상태 변경에 실패했습니다.', 'error');
    throw err;
  } finally {
    unlockOrder(id);
  }

  await safeRenderAll(type);
}

// ===============================
// 결제 상태 변경 전용 함수
// ===============================
async function applyPaymentUpdate({ id, payment, history }) {
  if (!id) return;

  const storeId = currentStoreId();

  await fetch('/api/orders', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      orderId: id,
      type: 'store',
      meta: {
        payment
      },
      metaAppend: {
        history
      }
    })
  });

  await safeRenderAll('store');
}

// ===============================
// 주문 시간 포맷
// ===============================
function fmtDateTimeFromOrder(o) {
  if (o.dateTime) return o.dateTime;
  if (o.date && o.time) return `${o.date} ${o.time}`;
  
  const d = new Date(o.ts || Date.now());
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const HH   = String(d.getHours()).padStart(2, '0');
  const MM   = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
}

// ===============================
// 옵션 정규화
// ===============================
function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];

  return options.map(opt => {
    if (typeof opt === 'string') return opt;

    const name = opt.name || opt.group || '옵션';
    const value = opt.value || opt.label || '';

    return value ? `${name}:${value}` : name;
  });
}

// ===============================
// UI 표시용 유틸
// ===============================
function summarizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) return '-';
  if (items.length === 1) return items[0];

  const first = items[0];
  const restCount = items.length - 1;
  return `${first} 외 ${restCount}개`;
}

function limitLines(text, maxLines = 20) {
  if (!text) return text;
  const lines = String(text).split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + '\n…';
}

function truncateName(name, maxLen = 4) {
  if (!name) return '-';
  return name.length > maxLen ? name.slice(0, maxLen) + '…' : name;
}

function truncateText(text, maxLen = 15) {
  if (!text) return '-';
  const str = String(text);
  return str.length > maxLen
    ? str.slice(0, maxLen) + '…'
    : str;
}

function formatPhone(phone) {
  if (!phone) return '-';
  const n = String(phone).replace(/\D/g, '');

  if (n.length === 11) {
    return n.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  }
  if (n.length === 10) {
    return n.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }
  return phone;
}

function truncateReserveName(name, maxLen = 3) {
  if (!name) return '-';
  return name.length > maxLen
    ? name.slice(0, maxLen) + '...'
    : name;
}

const $ = (s, r = document) => r.querySelector(s);
const EMPTY_ROW = '<tr><td colspan="8" class="small">주문 없음</td></tr>';

const filters = {
  store: { from: '', to: '', status: '', search: '' },
  deliv: { from: '', to: '', status: '', search: '' }
};

function matchOrder(o, from, to, status, search) {
  const t = o.time ? new Date(o.time) : null;
  if (from && (!t || t < new Date(from))) return false;
  if (to && (!t || t > new Date(to))) return false;
  if (status && o.status !== status) return false;

  const s = (search || '').toLowerCase();
  const fields = [
    o.fullAddr || o.address,
    o.customer_name,
    o.customer_phone,
    o.items?.map(i => i.name).join(' ')
  ].join(' ').toLowerCase();

  if (s && !fields.includes(s)) return false;
  return true;
}

// ===============================
// 필터 바인딩
// ===============================
export function bindFilters() {
  function bind(prefix, key) {
    const f = filters[key];
    $('#' + prefix + '-filter').onclick = () => {
      f.from   = $('#' + prefix + '-from').value;
      f.to     = $('#' + prefix + '-to').value;
      f.status = $('#' + prefix + '-status').value;
      f.search = $('#' + prefix + '-search').value;
      key === 'store' ? renderStore() : renderDeliv();
    };
    $('#' + prefix + '-reset').onclick = () => {
      f.from = f.to = f.status = f.search = '';
      ['from', 'to', 'status', 'search'].forEach(
        x => $('#' + prefix + '-' + x).value = ''
      );
      key === 'store' ? renderStore() : renderDeliv();
    };
  }
  bind('store', 'store');
  bind('deliv', 'deliv');
}

// ===============================
// 엑셀 내보내기
// ===============================
export function exportOrders(type) {
  const key = type === 'ordersStore' ? 'lastStoreOrders' : 'lastDelivOrders';
  const rows = window[key] || [];

  if (!rows || !rows.length) {
    showToast('다운로드할 주문 데이터가 없습니다.', 'error'); 
    return; 
  }

  const cols = type === 'ordersStore'
    ? ['시간', '테이블', '내역', '금액', '상태','취소사유']
    : ['시간', '주문자', '연락처', '주소', '예약', '금액', '상태', '내역'];

  const data = [cols];

  rows.forEach(o => {
    const t = fmtDateTimeFromOrder(o);
    if (type === 'ordersStore') {
      data.push([
        t,
        o.table_no || '',
        (o.cart || []).map(i => {
          let line = `${i.name} x${i.qty}`;
          if (Array.isArray(i.options) && i.options.length) {
            const opts = normalizeOptions(i.options);
            line += ' (' + opts.join(', ') + ')';
          }
          return line;
        }).join('; '),
        o.amount || '',
        o.status || '',
        o.meta?.cancel?.reason || ''
      ]);
    } else {
      data.push([
        t,
        o.customer_name || '',
        o.customer_phone || '',
        o.address || '', // 예약은 주소저장
        o.meta?.reserve?.date && o.meta?.reserve?.time ? `${o.meta.reserve.date} ${o.meta.reserve.time}` : '',
        o.total_amount || '',
        o.status || '',
        (o.items || []).map(i => i.name + 'x' + i.qty).join('; ')
      ]);
    }
  });

  const csv = data
    .map(r => r.map(
      v => ('"' + String(v).replaceAll('"','""') + '"')
    ).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "application/vnd.ms-excel;charset=utf-8"
  });

  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0,10);
  a.href = URL.createObjectURL(blob);
  a.download = (type === 'ordersStore'
    ? `store_${today}.xlsx`
    : `delivery_${today}.xlsx`);
  a.click();
  URL.revokeObjectURL(a.href);
}

// ===============================
// 매장 주문 렌더링 (DB 조회)
// ===============================
export async function renderStore() {
  return renderStoreTable();
}

async function renderStoreTable() {
  const tbody = $('#tbody-store');
  if (!tbody) return;

  const storeId = currentStoreId();
  let rows = [];

  try {
    const res = await fetch(
      `/api/orders?type=store&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      console.error('[renderStore] HTTP error:', res.status);
      rows = [];
    } else {
      const data = await res.json().catch(() => ({ orders: [] }));
      rows = data.orders || [];
    }
  } catch (e) {
    console.error('renderStore err (server)', e);
    rows = [];
    showToast('매장 주문을 불러오는 중 오류가 발생했습니다.', 'error');
  }

  window.lastStoreOrders = rows;
  rows = rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="small">매장 주문이 없습니다.</td></tr>`;
    return;
  }

  rows.forEach(o => {
    const time = fmtDateTimeFromOrder(o);
    const itemTexts = (o.cart || []).map(i => {
      let line = `${i.name}x${i.qty}`;
      if (Array.isArray(i.options) && i.options.length) {
        const opts = normalizeOptions(i.options);
        if (opts.length) {
          line += ` (${opts[0]}${opts.length > 1 ? ` 외 ${opts.length - 1}개` : ''})`;
        }
      }
      return line;
    });
    
    const items = limitLines(summarizeItems(itemTexts), 20);
    const status = o.status || '주문접수';
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td data-label="주문시간">
        <div>${time}</div>
        <div class="small">주문번호 : ${o.order_no}</div>
      </td>
      <td data-label="테이블">${o.table_no || '-'}</td>
      <td data-label="주문내역">
        <span class="order-detail-link" data-action="order-detail" data-id="${o.order_no}" style="cursor:pointer;text-decoration:underline">
          ${items || '-'}
        </span>
      </td>
      <td data-label="금액">${fmt(o.amount)}</td>
      <td data-label="상태">
        <div class="order-status-box">
          <div class="order-status-line">
            <span class="badge-dot ${
              o.meta?.payment?.cancelled ? 'badge-cancel' : status === ORDER_STATUS.DONE ? 'badge-done' : status === ORDER_STATUS.PREPARING ? 'badge-cook' : 'badge-wait'
            }"></span>
            ${(() => {
              const current = status;
              let nextList = STATUS_FLOW.store[current] || [];
              if (o.meta?.payment?.paid) {
                nextList = nextList.filter(s => s !== ORDER_STATUS.CANCELLED);
              }
              if (o.meta?.payment?.cancelled) return '';
              const disabled = current === ORDER_STATUS.CANCELLED ? 'disabled' : '';
              return `
                <select class="input" data-type="store" data-id="${o.order_no}" ${disabled}>
                  <option selected>${current}</option>
                  ${nextList.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
              `;
            })()}
            ${o.meta?.payment?.cancelled ? `<span class="badge-cancel" style="margin-left:6px">결제취소</span>` : o.meta?.payment?.paid ? `<span class="badge-paid" style="margin-left:6px">결제완료</span>` : ''}
          </div>
          <div class="order-action-line">
            ${status === ORDER_STATUS.CANCELLED || o.meta?.payment?.cancelled ? '' : (!o.meta?.payment?.paid ? `<button class="btn primary" data-action="confirm-pos-paid" data-id="${o.order_no}">POS 결제 확인</button>` : `<button class="btn danger" data-action="cancel-payment" data-id="${o.order_no}">결제 취소</button>`)}
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ===============================
// 예약 주문 렌더링 (DB 조회)
// ===============================
export async function renderDeliv() {
  const tbody = $('#tbody-deliv');
  if (!tbody) return;

  const storeId = currentStoreId();
  let rows = [];

  try {
    const r = await fetch(`/api/orders?type=reserve&storeId=${encodeURIComponent(storeId)}`, { cache: 'no-store' });
    if (!r.ok) {
      console.error('[renderDeliv] HTTP error:', r.status);
      rows = [];
    } else {
      const d = await r.json().catch(() => ({ orders: [] }));
      rows = d.orders || [];
    }
  } catch (e) {
    console.error('renderDeliv err (server)', e);
    rows = [];
    showToast('예약 주문을 불러오는 중 오류가 발생했습니다.', 'error');
  }

  window.lastDelivOrders = rows;
  rows = rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="small">배달/예약 주문이 없습니다.</td></tr>`;
    return;
  }

  rows.forEach(o => {
    const time = fmtDateTimeFromOrder(o);
    const reserveDateTime = o.meta?.reserve?.date && o.meta?.reserve?.time ? `${o.meta.reserve.date}\n${o.meta.reserve.time}` : '-';
    const rawReq = o.meta?.memo || '-';
    const req = truncateText(rawReq, 15);

    const itemTexts = (o.items || []).map(i => {
      let line = `${i.name} x${i.qty}`;
      if (Array.isArray(i.options) && i.options.length) {
        const opts = normalizeOptions(i.options);
        if (opts.length) {
          line += ` (${opts[0]}${opts.length > 1 ? ` 외 ${opts.length - 1}개` : ''})`;
        }
      }
      return line;
    });
    
    const items = limitLines(summarizeItems(itemTexts), 20);
    const displayName = truncateReserveName(o.customer_name, 3);
    const status = o.status || '대기';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="주문시간">${time}</td>
      <td data-label="주문자">${displayName || '-'}</td>
      <td data-label="연락처">${formatPhone(o.customer_phone)}</td>
      <td data-label="주소" class="td-addr">${o.address || '-'}</td>
      <td data-label="예약일시" class="td-reserve-dt">${reserveDateTime}</td>
      <td data-label="요청사항" class="td-req">${req}</td>
      <td data-label="주문내역">
        <span class="order-detail-link" data-action="order-detail-deliv" data-id="${o.order_id}" style="cursor:pointer;text-decoration:underline">${items || '-'}</span>
      </td>
      <td data-label="합계 / 상태">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-weight:600">${fmt(o.total_amount)}원</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="badge-dot ${status === ORDER_STATUS.DONE ? 'badge-done' : status === ORDER_STATUS.PREPARING ? 'badge-cook' : 'badge-wait'}"></span>
            <select class="input" style="min-width:120px" data-type="reserve" data-id="${o.order_id}">
              <option selected>${status}</option>
              ${(STATUS_FLOW.reserve[status] || []).map(s => `<option>${s}</option>`).join('')}
            </select>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ===============================
// 글로벌 이벤트 핸들러
// ===============================
export function attachGlobalHandlers() {
  document.body.addEventListener('change', async (e) => {
    const sel = e.target;
    if (sel.tagName !== 'SELECT') return;

    const id = sel.dataset.id;
    const type = sel.dataset.type;
    const nextStatus = sel.value;

    if (!id || !type || !nextStatus) return;

    if (nextStatus === ORDER_STATUS.CANCELLED || nextStatus === PAYMENT_STATUS.CANCELLED) {
      const modal = document.getElementById('cancel-reason-modal');
      if (!modal) {
        showToast('시스템 오류: 취소 모달을 찾을 수 없습니다.', 'error');
        sel.value = sel.options[0].value;
        return;
      }
      modal.dataset.orderId = id;
      modal.dataset.cancelStatus = nextStatus;
      modal.dataset.orderType = type;
      modal.style.display = 'flex';
      sel.value = sel.options[0].value;
      return;
    }

    try {
      await changeOrderStatus({ id, status: nextStatus, type });
      showToast(`상태가 "${nextStatus}"(으)로 변경되었습니다.`, 'success');
    } catch (err) {
      if (err.message === 'ORDER_NOT_FOUND') {
        showToast('이미 삭제되었거나 처리된 주문입니다.', 'warning');
        await safeRenderAll(type);
        return;
      }
      showToast('상태 변경에 실패했습니다. 네트워크를 확인하세요.', 'error');
      console.error(err);
    }
  });

  document.body.addEventListener('click', async (e) => {
    if (e.target.dataset.action !== 'order-detail') return;
    const id = e.target.dataset.id;
    if (!id) return;
    const storeId = currentStoreId();
    try {
      const res = await fetch(`/api/orders?type=store&storeId=${encodeURIComponent(storeId)}`, { cache: 'no-store' });
      const data = await res.json();
      const order = (data.orders || []).find(o => String(o.order_no) === String(id));
      if (!order) { showToast('해당 주문 정보를 찾을 수 없습니다.', 'error'); return; }
      
      const cancelReason = order.meta?.cancel?.reason ? `❌ 취소 사유: ${order.meta.cancel.reason}` : '';
      const payment = order.meta?.payment;
      let paymentInfo = '💳 결제 상태: 미결제';
      if (payment?.paid) {
        paymentInfo = ['💳 결제 상태: 결제완료', `결제 수단: ${payment.method || 'POS'}`, payment.paidAt ? `결제 시각: ${new Date(payment.paidAt).toLocaleString()}` : ''].filter(Boolean).join('\n');
      }
      if (order.meta?.payment?.cancelled) {
        paymentInfo = ['💳 결제 상태: 결제취소', payment?.method ? `결제 수단: ${payment.method}` : '', payment?.paidAt ? `결제 시각: ${new Date(payment.paidAt).toLocaleString()}` : '', order.meta?.cancel?.at ? `취소 시각: ${new Date(order.meta.cancel.at).toLocaleString()}` : ''].filter(Boolean).join('\n');
      }

      const header = [`테이블: ${order.table_no || '-'}`, `주문시간: ${fmtDateTimeFromOrder(order)}`, `금액: ${fmt(order.amount || 0)}원`, paymentInfo, cancelReason].filter(Boolean).join('\n');
      const historyLines = (order.meta?.history || []).sort((a, b) => new Date(a.at) - new Date(b.at)).map(h => {
          // value, status, payment 중 값이 있는 것을 선택
          const statusText = h.value || h.status || h.payment || ''; 
          const adminText = h.by ? ` (by ${h.by})` : '';
          return `- ${new Date(h.at).toLocaleString()} ${statusText}${adminText}`;}).join('\n');
      const body = '📦 주문 메뉴\n\n' + (order.cart || []).map(i => `• ${i.name} x${i.qty}${Array.isArray(i.options) ? '\n' + normalizeOptions(i.options).map(opt => `    └ ${opt}`).join('\n') : ''}`).join('\n\n');
      document.getElementById('order-detail-body').textContent = header + (historyLines ? `\n\n상태 변경 이력:\n${historyLines}` : '') + '\n\n' + body;
      document.getElementById('order-detail-modal').style.display = 'flex';
    } catch (e) {
      showToast('데이터를 불러오지 못했습니다.', 'error');
    }
  });

  document.getElementById('order-detail-close')?.addEventListener('click', () => {
    document.getElementById('order-detail-modal').style.display = 'none';
  });

  document.body.addEventListener('click', async (e) => {
    if (e.target.dataset.action !== 'order-detail-deliv') return;
    const id = e.target.dataset.id;
    if (!id) return;
    const storeId = currentStoreId();
    try {
      const res = await fetch(`/api/orders?type=reserve&storeId=${encodeURIComponent(storeId)}`, { cache: 'no-store' });
      const data = await res.json();
      const order = (data.orders || []).find(o => String(o.order_id) === String(id));
      if (!order) { showToast('예약 주문을 찾을 수 없습니다.', 'error'); return; }

      const infoBlock = [`주문시간: ${fmtDateTimeFromOrder(order)}`, `주문자: ${order.customer_name || '-'}`, `연락처: ${formatPhone(order.customer_phone || '-')}`, `주소: ${order.address || '-'}`, `예약일시: ${(order.meta?.reserve?.date || '-') + ' ' + (order.meta?.reserve?.time || '')}`, `요청사항: ${order.meta?.memo || '-'}`, `합계금액: ${fmt(order.total_amount || 0)}원`].join('\n');
      const historyLines = (order.meta?.history || []).sort((a, b) => new Date(a.at) - new Date(b.at)).map(h => `- ${new Date(h.at).toLocaleString()} ${h.value || ''}${h.by ? ` (by ${h.by})` : ''}`).join('\n');
      const itemsBlock = '구매내역\n\n' + (order.items || []).map(i => `• ${i.name} x${i.qty}${Array.isArray(i.options) ? '\n' + normalizeOptions(i.options).map(opt => `    └ ${opt}`).join('\n') : ''}`).join('\n\n');
      document.getElementById('order-detail-body').textContent = infoBlock + (historyLines ? `\n\n상태 변경 이력:\n${historyLines}` : '') + '\n\n' + itemsBlock;
      document.getElementById('order-detail-modal').style.display = 'flex';
    } catch (e) {
      showToast('예약 정보를 불러올 수 없습니다.', 'error');
    }
  });

  document.body.addEventListener('click', async (e) => {
    if (e.target.dataset.action !== 'confirm-pos-paid') return;
    const id = e.target.dataset.id;
    if (!id) { showToast('유효하지 않은 주문입니다.', 'error'); return; }
    if (isPending(id)) { showToast('이미 결제 처리 중입니다.', 'info'); return; }
    lockOrder(id);
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderId: id,
          type: 'store',
          meta: { payment: { paid: true, paidAt: new Date().toISOString(), method: 'POS' } },
          metaAppend: { history: { at: new Date().toISOString(), type: 'PAYMENT', action: 'PAYMENT_CONFIRMED',value:'결제완료', payment: PAYMENT_STATUS.PAID, by: ADMIN_ID, note: 'POS 결제 확인' } }
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'PAYMENT_FAILED');
      showToast('결제 확인이 완료되었습니다.', 'success');
      const channel = new BroadcastChannel('qrnr-admin');
      channel.postMessage({ type: ADMIN_EVENTS.ORDER_STATUS_CHANGED, storeId: currentStoreId(), orderId: id, senderId: ADMIN_ID, at: Date.now(), orderType: 'store' });
    } catch (err) {
      showToast('결제 완료 처리 실패', 'error');
    } finally {
      unlockOrder(id);
      await safeRenderAll('store');
    }
  });

  document.body.addEventListener('click', (e) => {
    if (e.target.dataset.action !== 'cancel-payment') return;
    const id = e.target.dataset.id;
    if (!id) return;
    const modal = document.getElementById('cancel-reason-modal');
    modal.dataset.orderId = id;
    modal.dataset.cancelStatus = PAYMENT_STATUS.CANCELLED;
    modal.dataset.orderType = 'store';
    modal.style.display = 'flex';
  });

  document.body.addEventListener('click', (e) => {
    if (e.target.dataset.action !== 'cancel-order') return;
    const id = e.target.dataset.id;
    if (!id) return;
    const modal = document.getElementById('cancel-reason-modal');
    modal.dataset.orderId = id;
    modal.dataset.cancelStatus = ORDER_STATUS.CANCELLED;
    modal.dataset.orderType = e.target.dataset.type || 'store';
    modal.style.display = 'flex';
  });
}

// ===============================
// 관리자 이벤트 수신
// ===============================
(() => {
  let channel;
  try { channel = new BroadcastChannel('qrnr-admin'); } catch { return; }
  channel.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type !== ADMIN_EVENTS.ORDER_STATUS_CHANGED) return;
    if (msg.senderId === ADMIN_ID) return;
    if (msg.storeId !== window.qrnrStoreId) return;
    console.log('[ADMIN EVENT] order changed → reload');
    await safeRenderAll(msg.orderType || 'all');
  };
})();

// 취소 사유 모달 처리
document.getElementById('cancel-reason-close')?.addEventListener('click', () => {
  const modal = document.getElementById('cancel-reason-modal');
  modal.style.display = 'none';
});

document.getElementById('cancel-reason-confirm')?.addEventListener('click', async () => {
  const modal = document.getElementById('cancel-reason-modal');
  const id = modal.dataset.orderId;
  const status = modal.dataset.cancelStatus;
  const type = modal.dataset.orderType || 'store';
  const reason = document.getElementById('cancel-reason-input').value.trim();

  if (!id) return;
  if (isPending(id)) { showToast('이미 처리 중인 주문입니다.', 'info'); return; }
  if (!reason) { showToast('취소 사유를 반드시 입력해야 합니다.', 'warning'); return; }

  lockOrder(id);
  try {
    const isPaymentCancel = status === PAYMENT_STATUS.CANCELLED;
    const res = await fetch('/api/orders', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId: id,
        type,
        ...(isPaymentCancel ? {} : { status }),
        meta: { cancel: { reason, at: new Date().toISOString() }, ...(isPaymentCancel ? { payment: { paid: false, cancelled: true, cancelledAt: new Date().toISOString() } } : {}) },
        metaAppend: { history: { at: new Date().toISOString(), type: isPaymentCancel ? 'PAYMENT' : 'ORDER', action: isPaymentCancel ? 'PAYMENT_CANCELLED' : 'STATUS_CHANGE', value: status, by: ADMIN_ID, note: reason } }
      })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'CANCEL_FAILED');
    document.getElementById('cancel-reason-input').value = '';
    modal.style.display = 'none';
    showToast(`${status} 처리되었습니다.`, 'success');
  } catch (err) {
    console.error(err);
    showToast('취소 처리에 실패했습니다.', 'error');
  } finally {
    unlockOrder(id);
    await safeRenderAll(type);
  }
});

export async function syncStoreFromServer() {
  console.log('[syncStoreFromServer] deprecated - using direct DB queries');
}
