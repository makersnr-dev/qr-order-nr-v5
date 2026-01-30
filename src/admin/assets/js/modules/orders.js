// /src/admin/assets/js/modules/orders.js
/**
 * =====================================================
 * [DB 기반 주문 관리]
 * - 모든 주문 데이터는 /api/orders (DB) 기준
 * - localStorage는 완전히 제거
 * =====================================================
 */

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

async function safeRenderAll() {
  if (__isRendering) {
    __renderQueued = true;
    return;
  }

  __isRendering = true;
  try {
    await renderStore();
    await renderDeliv();
  } finally {
    __isRendering = false;

    if (__renderQueued) {
      __renderQueued = false;
      await safeRenderAll();
    }
  }
}

function currentStoreId() {
  if (!window.qrnrStoreId) {
    alert('매장 정보가 초기화되지 않았습니다.\n관리자 콘솔로 다시 진입해주세요.');
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

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);

  requestAnimationFrame(() => t.classList.add('show'));

  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 200);
  }, 3000);
}

// ===============================
// 주문 상태 변경
// ===============================
async function changeOrderStatus({ id, status, type }) {
  if (!id || typeof id !== 'string') {
    console.warn('[BLOCKED] invalid order id:', id);
    showToast('유효하지 않은 주문입니다.');
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
    status
  };

  if (isPending(id)) {
    showToast('이미 처리 중인 주문입니다.');
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
      await safeRenderAll();
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
        at: Date.now()
      });
    } catch {}
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    unlockOrder(id);
  }

  await safeRenderAll();
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
      meta: {
        payment
      },
      metaAppend: {
        history
      }
    })
  });

  await safeRenderAll();
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
    o.table,
    o.customer,
    o.phone,
    o.addr,
    o.reserve,
    (o.items || []).map(i => i.name).join(' ')
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
  // DB에서 가져온 최신 데이터 사용
  const key = type === 'ordersStore' ? 'lastStoreOrders' : 'lastDelivOrders';
  const rows = window[key] || [];

  if (!rows || !rows.length) {
    alert('데이터가 없습니다.');
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
        o.table || '',
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
        o.customer?.name || '',
        o.customer?.phone || '',
        o.customer?.addr || '',
        o.reserve?.date && o.reserve?.time ? `${o.reserve.date} ${o.reserve.time}` : '',
        o.amount || '',
        o.status || '',
        (o.cart || []).map(i => i.name + 'x' + i.qty).join('; ')
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

    // ✅ 추가: HTTP 에러 검증
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
  }

  // 엑셀용 전역 저장
  window.lastStoreOrders = rows;

  rows = rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="small">매장 주문이 없습니다.</td>
      </tr>`;
    return;
  }

  rows.forEach(o => {
    const time   = fmtDateTimeFromOrder(o);
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
    
    const items = limitLines(
      summarizeItems(itemTexts),
      20
    );

    const table  = o.table || '-';
    const amount = Number(o.amount || 0);
    const status = o.status || '주문접수';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="주문시간">
        <div>${time}</div>
        <div class="small">
          주문번호 : ${o.orderNo || o.orderId || o.id}
        </div>
      </td>
    
      <td data-label="테이블">${table}</td>
    
      <td data-label="주문내역">
        <span
          class="order-detail-link"
          data-action="order-detail"
          data-id="${o.id || o.orderId || ''}"
          style="cursor:pointer;text-decoration:underline"
        >
          ${items || '-'}
        </span>
      </td>
    
      <td data-label="금액">${fmt(amount)}</td>
    
      <td data-label="상태">
        <div class="order-status-box">
          <div class="order-status-line">
            <span class="badge-dot ${
              o.meta?.payment?.cancelled
                ? 'badge-cancel'
                : status === ORDER_STATUS.DONE
                ? 'badge-done'
                : status === ORDER_STATUS.PREPARING
                ? 'badge-cook'
                : 'badge-wait'
            }"></span>

            ${(() => {
              const current = status;
              let nextList = STATUS_FLOW.store[current] || [];

              if (o.meta?.payment?.paid) {
                nextList = nextList.filter(s => s !== ORDER_STATUS.CANCELLED);
              }
              
              const orderId = o.id || null;

              if (o.meta?.payment?.cancelled) {
                return '';
              }
              
              const disabled = current === ORDER_STATUS.CANCELLED ? 'disabled' : '';

              return `
                <select
                  class="input"
                  data-type="store"
                  data-id="${orderId}"
                  ${disabled}
                >
                  <option selected>${current}</option>
                  ${nextList.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
              `;
            })()}

            ${o.meta?.payment?.cancelled ? `
              <span class="badge-cancel" style="margin-left:6px">
                결제취소
              </span>
            ` : o.meta?.payment?.paid ? `
              <span class="badge-paid" style="margin-left:6px">
                결제완료
              </span>
            ` : ''}
          </div>

          <div class="order-action-line">
            ${
              status === ORDER_STATUS.CANCELLED || o.meta?.payment?.cancelled
                ? ''
                : (
                  !o.meta?.payment?.paid
                    ? `
                      <button
                        class="btn primary"
                        data-action="confirm-pos-paid"
                        data-id="${o.id || o.orderId || ''}">
                        POS 결제 확인
                      </button>
                    `
                    : `
                      <button
                        class="btn danger"
                        data-action="cancel-payment"
                        data-id="${o.id || o.orderId || ''}">
                        결제 취소
                      </button>
                    `
                )
            }
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
    const r = await fetch(
      `/api/orders?type=reserve&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );

    // ✅ 추가: HTTP 에러 검증
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
  }

  // 엑셀용 전역 저장
  window.lastDelivOrders = rows;

  rows = rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="small">배달/예약 주문이 없습니다.</td>
      </tr>`;
    return;
  }

  rows.forEach(o => {
    const time = fmtDateTimeFromOrder(o);
    const kind = '예약';

    const customer = o.customer || {};
    const rawName = customer.name || o.name || '-';
    const name = truncateReserveName(rawName, 3);
    const rawPhone = customer.phone || o.phone || '-';
    const phone = formatPhone(rawPhone);

    const addr =
      customer.addr ||
      customer.address ||
      o.addr ||
      '-';

    const reserveDateTime =
      o.reserve?.date && o.reserve?.time
        ? `${o.reserve.date}\n${o.reserve.time}`
        : '-';
    
    const req = truncateText(
      customer.memo || '-',
      20
    );

    const itemTexts = (o.cart || []).map(i => {
      let line = `${i.name} x${i.qty}`;
    
      if (Array.isArray(i.options) && i.options.length) {
        const opts = normalizeOptions(i.options);
        if (opts.length) {
          line += ` (${opts[0]}${opts.length > 1 ? ` 외 ${opts.length - 1}개` : ''})`;
        }
      }
    
      return line;
    });
    
    const items = limitLines(
      summarizeItems(itemTexts),
      20
    );

    const amount = Number(o.amount || 0);
    const status = o.status || '대기';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="주문시간">${time}</td>
      <td data-label="주문자">${name}</td>
      <td data-label="연락처">${phone}</td>
      <td data-label="주소" class="td-addr">${addr}</td>
      <td data-label="예약일시" class="td-reserve-dt">
        ${reserveDateTime}
      </td>
      <td data-label="요청사항" class="td-req">${req}</td>
    
      <td data-label="주문내역">
        <span
          class="order-detail-link"
          data-action="order-detail-deliv"
          data-id="${o.id || o.orderId || ''}"
          style="cursor:pointer;text-decoration:underline"
        >
          ${items || '-'}
        </span>
      </td>
    
      <td data-label="합계 / 상태">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-weight:600">
            ${fmt(amount)}원
          </div>
    
          <div style="display:flex;align-items:center;gap:6px">
            <span class="badge-dot ${
              status === ORDER_STATUS.DONE
                ? 'badge-done'
                : status === ORDER_STATUS.PREPARING
                ? 'badge-cook'
                : 'badge-wait'
            }"></span>
    
            <select
              class="input"
              style="min-width:120px"
              data-type="reserve"
              data-id="${o.id || o.orderId || ''}"
            >
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
  // 상태 변경
  document.body.addEventListener('change', async (e) => {
    const sel = e.target;
    if (sel.tagName !== 'SELECT') return;

    const id = sel.dataset.id;
    const type = sel.dataset.type;
    const nextStatus = sel.value;

    if (!id || !type || !nextStatus) return;

    if (
      nextStatus === ORDER_STATUS.CANCELLED ||
      nextStatus === PAYMENT_STATUS.CANCELLED
    ) {
      const modal = document.getElementById('cancel-reason-modal');
      if (!modal) {
        alert('취소 사유 모달이 없습니다.');
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
      showToast(`상태가 "${nextStatus}"(으)로 변경되었습니다.`);
    } catch (err) {
      if (err.message === 'ORDER_NOT_FOUND') {
        showToast('이미 삭제되었거나 처리된 주문입니다.');
        await safeRenderAll();
        return;
      }
      alert('상태 변경 실패');
      console.error(err);
    }
  });

  // 주문 상세 모달 (매장)
  document.body.addEventListener('click', async (e) => {
    if (e.target.dataset.action !== 'order-detail') return;

    const id = e.target.dataset.id;
    if (!id) return;

    const storeId = currentStoreId();
    
    // DB에서 최신 데이터 조회
    try {
      const res = await fetch(
        `/api/orders?type=store&storeId=${encodeURIComponent(storeId)}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      const orders = data.orders || [];
      const order = orders.find(o => (o.id || o.orderId) === id);

      if (!order) {
        alert('주문을 찾을 수 없습니다.');
        return;
      }

      const cancelReason =
        order.meta?.cancel?.reason
          ? `❌ 취소 사유: ${order.meta.cancel.reason}`
          : '';

      const payment = order.meta?.payment;
      let paymentInfo = '💳 결제 상태: 미결제';

      if (payment?.paid) {
        paymentInfo = [
          '💳 결제 상태: 결제완료',
          `결제 수단: ${payment.method || 'POS'}`,
          payment.paidAt ? `결제 시각: ${new Date(payment.paidAt).toLocaleString()}` : ''
        ].filter(Boolean).join('\n');
      }

      if (order.meta?.payment?.cancelled) {
        paymentInfo = [
          '💳 결제 상태: 결제취소',
          payment?.method ? `결제 수단: ${payment.method}` : '',
          payment?.paidAt ? `결제 시각: ${new Date(payment.paidAt).toLocaleString()}` : '',
          order.meta?.cancel?.at
            ? `취소 시각: ${new Date(order.meta.cancel.at).toLocaleString()}`
            : ''
        ].filter(Boolean).join('\n');
      }

      const header = [
        `테이블: ${order.table || '-'}`,
        `주문시간: ${fmtDateTimeFromOrder(order)}`,
        `금액: ${fmt(order.amount || 0)}원`,
        paymentInfo,
        cancelReason
      ].filter(Boolean).join('\n');

      const historyLines = (order.meta?.history || [])
        .sort((a, b) => new Date(a.at) - new Date(b.at))
        .map(h => {
          const t = new Date(h.at).toLocaleString();
          const value = h.value || h.status || '';
          const by = h.by ? ` (by ${h.by})` : '';
          return `- ${t} ${value}${by}`;
        })
        .join('\n');

      const historyBlock = historyLines
        ? `\n\n상태 변경 이력:\n${historyLines}`
        : '';

      const body =
        '📦 주문 메뉴\n\n' +
        (order.cart || []).map(i => {
          let line = `• ${i.name} x${i.qty}`;
          if (Array.isArray(i.options) && i.options.length) {
            const opts = normalizeOptions(i.options);
            line += '\n' + opts.map(opt => `   └ ${opt}`).join('\n');
          }
          return line;
        }).join('\n\n');

      document.getElementById('order-detail-body').textContent =
        header + historyBlock + '\n\n' + body;

      document.getElementById('order-detail-modal').style.display = 'flex';
    } catch (e) {
      console.error('Failed to fetch order detail:', e);
      alert('주문 정보를 불러올 수 없습니다.');
    }
  });

  // 닫기 버튼
  document.getElementById('order-detail-close')?.addEventListener('click', () => {
    document.getElementById('order-detail-modal').style.display = 'none';
  });

  // 예약 주문 상세 모달
  document.body.addEventListener('click', async (e) => {
    if (e.target.dataset.action !== 'order-detail-deliv') return;

    const id = e.target.dataset.id;
    if (!id) return;

    const storeId = currentStoreId();

    try {
      const res = await fetch(
        `/api/orders?type=reserve&storeId=${encodeURIComponent(storeId)}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      const orders = data.orders || [];
      const order = orders.find(o => (o.id || o.orderId) === id);

      if (!order) {
        alert('예약 주문을 찾을 수 없습니다.');
        return;
      }

      const customer = order.customer || {};

      const infoBlock = [
        `주문시간: ${fmtDateTimeFromOrder(order)}`,
        `주문자: ${customer.name || '-'}`,
        `연락처: ${formatPhone(customer.phone || '-')}`,
        `주소: ${customer.addr || '-'}`,
        `예약일시: ${(order.reserve?.date || '-') + ' ' + (order.reserve?.time || '')}`,
        `요청사항: ${customer.memo || '-'}`,
        `합계금액: ${fmt(order.amount || 0)}원`
      ].join('\n');

      const historyLines = (order.meta?.history || [])
        .sort((a, b) => new Date(a.at) - new Date(b.at))
        .map(h => {
          const t = new Date(h.at).toLocaleString();
          const value = h.value || '';
          const by = h.by ? ` (by ${h.by})` : '';
          return `- ${t} ${value}${by}`;
        })
        .join('\n');

      const historyBlock = historyLines
        ? `\n\n상태 변경 이력:\n${historyLines}`
        : '';

      const itemsBlock =
        '구매내역\n\n' +
        (order.cart || []).map(i => {
          let line = `• ${i.name} x${i.qty}`;
          if (Array.isArray(i.options) && i.options.length) {
            const opts = normalizeOptions(i.options);
            line += '\n' + opts.map(opt => `   └ ${opt}`).join('\n');
          }
          return line;
        }).join('\n\n');

      document.getElementById('order-detail-body').textContent =
        infoBlock + historyBlock + '\n\n' + itemsBlock;

      document.getElementById('order-detail-modal').style.display = 'flex';
    } catch (e) {
      console.error('Failed to fetch reserve order detail:', e);
      alert('예약 정보를 불러올 수 없습니다.');
    }
  });

  // POS 결제 확인
  document.body.addEventListener('click', async (e) => {
    if (e.target.dataset.action !== 'confirm-pos-paid') return;

    const id = e.target.dataset.id;
    if (!id) {
      showToast('유효하지 않은 주문입니다.');
      return;
    }

    if (isPending(id)) {
      showToast('이미 결제 처리 중입니다.');
      return;
    }
    
    lockOrder(id);

    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderId: id,
          meta: {
            payment: {
              paid: true,
              paidAt: new Date().toISOString(),
              method: 'POS'
            }
          },
          metaAppend: {
            history: {
              at: new Date().toISOString(),
              type: 'PAYMENT',
              action: 'PAYMENT_CONFIRMED',
              payment: PAYMENT_STATUS.PAID,
              by: ADMIN_ID,
              note: 'POS 결제 확인'
            }
          }
        })
      });

      const data = await res.json();
      if (!data.ok) {
        await safeRenderAll();
        throw new Error(data.error || 'PAYMENT_FAILED');
      }

      try {
        const channel = new BroadcastChannel('qrnr-admin');
        channel.postMessage({
          type: ADMIN_EVENTS.ORDER_STATUS_CHANGED,
          storeId: currentStoreId(),
          orderId: id,
          senderId: ADMIN_ID,
          at: Date.now()
        });
      } catch {}
    } catch (err) {
      console.error(err);
      alert('결제 완료 처리 실패');
    } finally {
      unlockOrder(id);
    }
  });

  // 결제취소 버튼
  document.body.addEventListener('click', (e) => {
    if (e.target.dataset.action !== 'cancel-payment') return;

    const id = e.target.dataset.id;
    if (!id) return;

    const modal = document.getElementById('cancel-reason-modal');
    modal.dataset.orderId = id;
    modal.dataset.cancelStatus = PAYMENT_STATUS.CANCELLED;
    modal.style.display = 'flex';
  });

  // 모바일 카드 상태 버튼
  document.body.addEventListener('click', async (e) => {
    const btn = e.target;
    if (!btn.dataset?.status || !btn.dataset?.id) return;

    try {
      await changeOrderStatus({
        id: btn.dataset.id,
        status: btn.dataset.status,
        type: 'store'
      });
    } catch (err) {
      alert('상태 변경 실패');
      console.error(err);
    }
  });

  document.body.addEventListener('click', (e) => {
    if (e.target.dataset.action !== 'cancel-order') return;

    const id = e.target.dataset.id;
    if (!id) return;

    const modal = document.getElementById('cancel-reason-modal');
    modal.dataset.orderId = id;
    modal.dataset.cancelStatus = ORDER_STATUS.CANCELLED;
    modal.style.display = 'flex';
  });
}

// ===============================
// 관리자 이벤트 수신
// ===============================
(() => {
  let channel;
  try {
    channel = new BroadcastChannel('qrnr-admin');
  } catch {
    return;
  }

  channel.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type !== ADMIN_EVENTS.ORDER_STATUS_CHANGED) return;

    if (msg.senderId === ADMIN_ID) return;

    if (msg.storeId !== window.qrnrStoreId) return;

    console.log('[ADMIN EVENT] order changed → reload from server');

    await safeRenderAll();
  };
})();

// 취소 사유 모달
document.getElementById('cancel-reason-close')
  ?.addEventListener('click', async () => {
    const modal = document.getElementById('cancel-reason-modal');
    modal.style.display = 'none';
    delete modal.dataset.orderId;
    delete modal.dataset.cancelStatus;
    await safeRenderAll();
  });

document.getElementById('cancel-reason-confirm')
  ?.addEventListener('click', async () => {
    const modal = document.getElementById('cancel-reason-modal');
    const id = modal.dataset.orderId;
    const status = modal.dataset.cancelStatus;
    const type = modal.dataset.orderType || 'store';
    const reason = document.getElementById('cancel-reason-input').value.trim();

    if (!id) return;

    if (isPending(id)) {
      showToast('이미 처리 중인 주문입니다.');
      return;
    }
    
    if (!reason) {
      alert(UI_TEXT.CANCEL_REASON_REQUIRED);
      return;
    }

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
      
          meta: {
            cancel: {
              reason,
              at: new Date().toISOString()
            },
            ...(isPaymentCancel ? {
              payment: {
                paid: false,
                cancelled: true,
                cancelledAt: new Date().toISOString()
              }
            } : {})
          },
      
          metaAppend: {
            history: {
              at: new Date().toISOString(),
              type: isPaymentCancel ? 'PAYMENT' : 'ORDER',
              action: isPaymentCancel
                ? 'PAYMENT_CANCELLED'
                : 'STATUS_CHANGE',
              value: status,
              by: ADMIN_ID,
              note: reason
            }
          }
        })
      });

      const data = await res.json();
      if (!data.ok) {
        await safeRenderAll();
        throw new Error(data.error || 'CANCEL_FAILED');
      }

      document.getElementById('cancel-reason-input').value = '';
      modal.style.display = 'none';
    
      showToast(`${status} 처리되었습니다.`);
    } catch (err) {
      console.error(err);
      alert('취소 처리 실패');
    } finally {
      unlockOrder(id);
    }
  });

// ===============================
// 서버 동기화 (초기 로드용)
// ===============================
export async function syncStoreFromServer() {
  // 이제 필요 없음 - renderStore에서 직접 DB 조회
  console.log('[syncStoreFromServer] deprecated - using direct DB queries');
}
