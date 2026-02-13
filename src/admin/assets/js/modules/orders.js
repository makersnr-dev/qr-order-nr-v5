// /src/admin/assets/js/modules/orders.js

import { showToast } from '../admin.js';
import { fmt } from './store.js';
import {
  STATUS_FLOW,
  STATUS_LIST,
  ORDER_STATUS,
  PAYMENT_STATUS
} from '/src/shared/constants/status.js';
import { ADMIN_EVENTS } from '/src/shared/constants/adminEvents.js';

//  주문 상세 공통 수정 로직
      const formatOptionsCombined = (optionTextArray) => {
        if (!Array.isArray(optionTextArray) || optionTextArray.length === 0) return "";
        
        const groups = {};
        optionTextArray.forEach(text => {
            const [group, value] = text.split(':');
            if (!groups[group]) groups[group] = [];
            groups[group].push(value);
        });
        
        // "토핑:생크림,초콜릿", "소스:꿀" 형태로 합침
        return Object.entries(groups)
            .map(([group, values]) => `    └ ${group}:${values.join(',')}`)
            .join('\n');
    };

let __isRendering = false;
let __renderQueued = false;

// 인자값으로 type을 받도록 수정 (기본값은 'all'로 설정)
async function safeRenderAll(type = 'all', storeId) {
  if (__isRendering) {
    __renderQueued = type; // 어떤 타입을 렌더링하려 했는지 저장
    return;
  }

  __isRendering = true;
  try {
    if (type === 'store') {
      await renderStore(storeId);
    } else if (type === 'reserve') {
      await renderDeliv(storeId);
    } else {
      // type이 'all'이거나 없을 경우 둘 다 실행
      await renderStore(storeId);
      await renderDeliv(storeId);
    }
  } finally {
    __isRendering = false;

    if (__renderQueued) {
      const nextType = __renderQueued;
      __renderQueued = false;
      await safeRenderAll(nextType,storeId);
    }
  }
}

// orders.js 내부의 currentStoreId
function currentStoreId() {
  // 1순위: 주소창 (?store=...) -> 새로고침 시 가장 정확함
  const urlSid = new URLSearchParams(location.search).get('store');
  
  // 2순위: admin.js가 넣어준 전역 변수
  const globalSid = window.qrnrStoreId;
  
  // 3순위: 로컬스토리지 백업본
  const localSid = localStorage.getItem('qrnr.storeId');

  const finalSid = urlSid || globalSid || localSid;

  if (!finalSid || finalSid === "[object Object]") {
     // 정말 없을 때만 에러
     throw new Error('STORE_ID_NOT_INITIALIZED');
  }
  
  // 찾았다면 전역 변수에 다시 한번 복사 (보정)
  window.qrnrStoreId = finalSid;
  return finalSid;
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
async function changeOrderStatus({ id, status, type, storeId }) {
  if (!id || typeof id !== 'string') {
    console.warn('[BLOCKED] invalid order id:', id);
    showToast('유효하지 않은 주문입니다.', 'error');
    return;
  }
  
  if (!id || !status) return;
  // [중복 클릭 방지] 이미 해당 ID의 주문이 처리 중인지 확인
  if (isPending(id)) {
    showToast('이미 처리 중인 주문입니다.', 'info');
    return;
  }
  // [UI 로딩 상태 적용] 해당 주문 행의 select 박스나 버튼을 찾아 비활성화 및 스피너 효과 부여
  const targetEl = document.querySelector(`select[data-id="${id}"], button[data-id="${id}"]`);
  if (targetEl) {
    targetEl.disabled = true;
    targetEl.classList.add('btn-loading'); // CSS 스피너 클래스 추가
  }

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

  //const storeId = currentStoreId();

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
    type: type,
    storeId: storeId
  };
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
      await safeRenderAll(type, storeId); 
      throw new Error(data.error || 'STATUS_CHANGE_FAILED');
    }
    showToast(`상태가 [${status}]로 변경되었습니다.`, 'success');
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
    if (targetEl) {
      targetEl.disabled = false;
      targetEl.classList.remove('btn-loading');
    }
  }

  await safeRenderAll(type, storeId);
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
  await renderStore(storeId);
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
     const sid = currentStoreId(); // 🚀 ID 확보
      f.from   = $('#' + prefix + '-from').value;
      f.to     = $('#' + prefix + '-to').value;
      f.status = $('#' + prefix + '-status').value;
      f.search = $('#' + prefix + '-search').value;
      key === 'store' ? renderStore(sid) : renderDeliv(sid);
    };
    $('#' + prefix + '-reset').onclick = () => {
     const sid = currentStoreId(); // 🚀 ID 확보
      f.from = f.to = f.status = f.search = '';
      ['from', 'to', 'status', 'search'].forEach(
        x => $('#' + prefix + '-' + x).value = ''
      );
      key === 'store' ? renderStore(sid) : renderDeliv(sid);
    };
  }
  bind('store', 'store');
  bind('deliv', 'deliv');
}

// ===============================
// 엑셀 내보내기
// ===============================
// /src/admin/assets/js/modules/orders.js 내 exportOrders 함수 수정

export function exportOrders(type) {
    const key = type === 'ordersStore' ? 'lastStoreOrders' : 'lastDelivOrders';
    const rows = window[key] || [];

    if (!rows || !rows.length) {
        showToast('다운로드할 주문 데이터가 없습니다.', 'error');
        return;
    }

    // 1. 헤더 설정 (히스토리 컬럼 추가)
    const cols = type === 'ordersStore'
        ? ['시간', '테이블', '전체 주문 내역', '금액', '상태', '취소사유', '변경 이력']
        : ['시간', '주문자', '연락처', '주소', '예약일시', '요청사항', '금액', '상태', '전체 주문 내역', '변경 이력'];

    // 2. 데이터 구성 로직
    const data = rows.map(o => {
        const t = fmtDateTimeFromOrder(o);
        
        // [A] 전체 메뉴 내역 상세화 (상세 모달 로직 이식)
        const menuData = (type === 'ordersStore') ? (o.cart || []) : (o.cart || o.items || []);
        const fullMenuDetail = menuData.map(i => {
            let line = `• ${i.name} x${i.qty}`;
            // 옵션 처리 (예약/매장 통합 대응)
            const rawOpts = i.optionText || i.options || [];
            const opts = Array.isArray(rawOpts) ? rawOpts : (typeof rawOpts === 'string' ? JSON.parse(rawOpts) : []);
            
            if (opts.length > 0) {
                const optLines = opts.map(opt => {
                    const text = typeof opt === 'string' ? opt : (opt.label || opt.name || '');
                    return `  └ ${text}`;
                }).join('\n');
                line += `\n${optLines}`;
            }
            return line;
        }).join('\n\n');

        // [B] 히스토리 정리 (시간 역순 또는 정순)
        const historyLines = (o.meta?.history || [])
            .sort((a, b) => new Date(a.at) - new Date(b.at))
            .map(h => `[${new Date(h.at).toLocaleString()}] ${h.value || h.payment || ''}${h.by ? ` (by ${h.by})` : ''}${h.note ? ` - ${h.note}` : ''}`)
            .join('\n');

        if (type === 'ordersStore') {
            return [
                t,
                o.table_no || '',
                fullMenuDetail,
                o.amount || 0,
                o.status || '',
                o.meta?.cancel?.reason || '',
                historyLines
            ];
        } else {
            return [
                t,
                o.customer_name || '',
                o.customer_phone || '',
                o.address || '',
                (o.meta?.reserve?.date || '') + ' ' + (o.meta?.reserve?.time || ''),
                o.meta?.memo || '',
                o.total_amount || 0,
                o.status || '',
                fullMenuDetail,
                historyLines
            ];
        }
    });

    // 3. XLSX 생성 및 다운로드
    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([cols, ...data]);

        // 셀 내 줄바꿈(Wrap Text) 적용을 위한 설정
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_address = { c: C, r: R };
                const cell_ref = XLSX.utils.encode_cell(cell_address);
                if (!ws[cell_ref]) continue;
                ws[cell_ref].s = { alignment: { wrapText: true, vertical: 'top' } };
            }
        }

        // 열 너비 자동 조절 (내용이 길어지므로)
        ws['!cols'] = type === 'ordersStore' 
            ? [{wch: 20}, {wch: 10}, {wch: 40}, {wch: 12}, {wch: 12}, {wch: 20}, {wch: 50}]
            : [{wch: 20}, {wch: 15}, {wch: 15}, {wch: 30}, {wch: 20}, {wch: 30}, {wch: 12}, {wch: 12}, {wch: 40}, {wch: 50}];

        XLSX.utils.book_append_sheet(wb, ws, "주문상세내역");
        const today = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `${type === 'ordersStore' ? '매장' : '예약'}상세_${today}.xlsx`);
        showToast('상세 내역 엑셀 다운로드 완료', 'success');
    } catch (e) {
        console.error('Excel Export Error:', e);
        showToast('엑셀 생성 중 오류 발생', 'error');
    }
}

// ===============================
// 매장 주문 렌더링 (DB 조회)
// ===============================
export async function renderStore(storeId) {
  const tbody = $('#tbody-store');
  if (!tbody) return;

  //const storeId = currentStoreId();
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

  // 🚀 bindFilters에서 저장한 값 응용
  const f = filters.store;
  rows = rows.filter(o => {
    // 1. 상태 필터 (전체 선택이 아닐 때)
    if (f.status && o.status !== f.status) return false;

    // 2. 검색어 필터 (테이블 번호나 메뉴 요약에 포함되는지)
    if (f.search) {
      const s = f.search.toLowerCase();
      const match = String(o.table_no).includes(s) || (o.displaySummary && o.displaySummary.toLowerCase().includes(s));
      if (!match) return false;
    }

    // 3. 날짜 필터 (생성 시각 기준)
    if (f.from || f.to) {
      // 서버에서 온 시간(o.ts 또는 o.created_at)을 Date 객체로 변환
      const dateVal = o.ts || o.created_at;
      if (!dateVal) return true; // 시간 정보 없으면 일단 노출

      const d = new Date(dateVal);
      // ISO 포맷(YYYY-MM-DD)으로 변환하여 문자열 비교
      const orderDate = d.toISOString().split('T')[0]; 
      
      if (f.from && orderDate < f.from) return false;
      if (f.to && orderDate > f.to) return false;
    }
    return true;
  });

  window.lastStoreOrders = rows;
  rows = rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="small">매장 주문이 없습니다.</td></tr>`;
    return;
  }

  rows.forEach(o => {
    const time = fmtDateTimeFromOrder(o);
    const items = o.displaySummary || '-';
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
           </div> <div class="order-action-line">
            ${(() => {
              // 1. 주문 자체가 취소된 경우 (회색 뱃지)
              if (status === ORDER_STATUS.CANCELLED) {
                return `<span class="btn-sm-badge badge-cancelled-final">주문취소완료</span>`;
              }

              // 2. 결제가 이미 취소된 경우 (회색 뱃지)
              if (o.meta?.payment?.cancelled) {
                return `<span class="btn-sm-badge badge-cancelled-final">결제취소완료</span>`;
              }

              // 3. 아직 미결제 상태 (파란 버튼)
              if (!o.meta?.payment?.paid) {
                return `<button class="btn-sm-badge btn-pos-confirm" data-action="confirm-pos-paid" data-id="${o.order_no}">POS 확인</button>`;
              }

              // 4. 결제 완료 상태 (초록 뱃지 + 빨간 테두리 버튼)
              return `
                <span class="btn-sm-badge badge-paid-sm">결제완료</span>
                <button class="btn-sm-badge btn-cancel-sm" data-action="cancel-payment" data-id="${o.order_no}">결제취소</button>
              `;
            })()}
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
export async function renderDeliv(storeId) {
  const tbody = $('#tbody-deliv');
  if (!tbody) return;

  //const storeId = currentStoreId();
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

  // 🚀 bindFilters에서 저장한 값 응용
  const f = filters.deliv;
  rows = rows.filter(o => {
    if (f.status && o.status !== f.status) return false;
    if (f.search) {
      const s = f.search.toLowerCase();
      const match = o.customer_name?.toLowerCase().includes(s) || 
                    o.address?.toLowerCase().includes(s) || 
                    o.displaySummary?.toLowerCase().includes(s);
      if (!match) return false;
    }
    if (f.from || f.to) {
      const orderDate = new Date(o.ts).toISOString().split('T')[0];
      if (f.from && orderDate < f.from) return false;
      if (f.to && orderDate > f.to) return false;
    }
    return true;
  });

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

    const items = o.displaySummary || '-';
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
let isGlobalHandlerAttached = false;
export function attachGlobalHandlers() {
  // 🚩 [추가] 1. 물리적 중복 방지 (DOM 플래그 체크)
  // 변수(isGlobalHandlerAttached)는 메모리 초기화 시 위험할 수 있어 DOM에 직접 기록합니다.
  if (document.body.dataset.ordersEventBound === 'true') return;
  
  // 1. 상태 변경 (SELECT) 핸들러
  document.body.addEventListener('change', async (e) => {
    const sel = e.target;
    if (sel.tagName !== 'SELECT') return;

    const id = sel.dataset.id;
    const type = sel.dataset.type;
    const nextStatus = sel.value;

    if (!id || !type || !nextStatus) return;

    // 🚩 [추가] 상태 변경 시도 전 중복 요청 잠금 확인
    if (isPending(id)) {
      showToast('이미 처리 중인 주문입니다.', 'info');
      return;
    }

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
    const sid = currentStoreId(); 
    try {
     await changeOrderStatus({ id, status: nextStatus, type, storeId: sid });
     showToast(`상태가 "${nextStatus}"(으)로 변경되었습니다.`, 'success');
    } catch (err) {
      if (err.message === 'ORDER_NOT_FOUND') {
        showToast('이미 삭제되었거나 처리된 주문입니다.', 'warning');
        await safeRenderAll(type,sid);
        return;
      }
      showToast('상태 변경에 실패했습니다. 네트워크를 확인하세요.', 'error');
      console.error(err);
    }
  });

  // 2. 클릭 이벤트 핸들러 (상세보기, POS 결제 확인 등)
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
        paymentInfo = ['💳 결제 상태: 결제완료', 
                       //`결제 수단: ${payment.method || 'POS'}`, 
                       //payment.paidAt ? `결제 시각: ${new Date(payment.paidAt).toLocaleString()}` : ''
                       ].filter(Boolean).join('\n');
      }
      if (order.meta?.payment?.cancelled) {
        paymentInfo = ['💳 결제 상태: 결제취소', 
                       payment?.method ? `결제 수단: ${payment.method}` : '', 
                       //payment?.paidAt ? `결제 시각: ${new Date(payment.paidAt).toLocaleString()}` : '', 
                       //order.meta?.cancel?.at ? `취소 시각: ${new Date(order.meta.cancel.at).toLocaleString()}` : ''
                       ].filter(Boolean).join('\n');
      }
 
      const header = [`테이블: ${order.table_no || '-'}`, `주문시간: ${fmtDateTimeFromOrder(order)}`, `금액: ${fmt(order.amount || 0)}원`, paymentInfo, cancelReason].filter(Boolean).join('\n');
      const historyLines = (order.meta?.history || []).sort((a, b) => new Date(a.at) - new Date(b.at)).map(h => {
        // value, status, payment 중 값이 있는 것을 선택
        const statusText = h.value || h.status || h.payment || '';
        const adminText = h.by ? ` (by ${h.by})` : '';
        return `- ${new Date(h.at).toLocaleString()} ${statusText}${adminText}`;
      }).join('\n');


      // 매장 상세 적용 부분
      const menuData = order.cart || (order.meta && order.meta.cart) || [];
      const body = '📦 주문 메뉴\n\n' + menuData.map(i => {
        let line = `• ${i.name} x${i.qty}`;
        const combinedOptions = formatOptionsCombined(i.optionText);
        if (combinedOptions) line += `\n${combinedOptions}`;
        return line;
      }).join('\n\n');
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
      // 🚀 [추가] 배달비 및 메뉴 합계 계산 로직
      const meta = order.meta || {};
      const deliveryFee = Number(meta.delivery_fee || 0);
      const totalAmount = Number(order.total_amount || 0);
      const menuTotal = totalAmount - deliveryFee;

      // 상단 정보 블록 생성
      const infoBlock = [
        `주문시간: ${fmtDateTimeFromOrder(order)}`,
        `주문자: ${order.customer_name || '-'}`,
        `연락처: ${formatPhone(order.customer_phone || '-')}`,
        `주소: ${order.address || '-'}`,
        `예약일시: ${(order.meta?.reserve?.date || '-') + ' ' + (order.meta?.reserve?.time || '')}`,
        `요청사항: ${order.meta?.memo || '-'}`,
        `--------------------------`,
        `🍱 메뉴 합계: ${fmt(menuTotal)}원`,
        deliveryFee > 0 ? `🛵 배달비: ${fmt(deliveryFee)}원` : `🛍️ 픽업 (배달비 없음)`,
        `💰 최종 결제액: ${fmt(totalAmount)}원`,
        `--------------------------`
      ].join('\n');

      // 상태 변경 이력 생성
      const historyLines = (order.meta?.history || [])
        .sort((a, b) => new Date(a.at) - new Date(b.at))
        .map(h => `- ${new Date(h.at).toLocaleString()} ${h.value || ''}${h.by ? ` (by ${h.by})` : ''}`)
        .join('\n');

      // 📦 구매 내역 및 옵션 그룹화 생성
      let menuItems = [];
      try {
          menuItems = (typeof order.items === 'string') ? JSON.parse(order.items) : (order.items || []);
      } catch(e) { menuItems = []; }
      const itemsBlock = '📦 구매 내역\n\n' + menuItems.map(i => {
      let line = `• ${i.name} x${i.qty}`;
      
      // 🚩 예약 주문의 옵션 데이터 (optionText) 안전하게 가져오기
      let rawOptions = i.optionText || i.options || [];
      
      // 만약 옵션이 문자열로 뭉쳐서 들어왔다면 배열로 변환 시도
      if (typeof rawOptions === 'string') {
          try { rawOptions = JSON.parse(rawOptions); } catch(e) { rawOptions = [rawOptions]; }
      }
  
      if (Array.isArray(rawOptions) && rawOptions.length > 0) {
          const groups = {};
          
          rawOptions.forEach(opt => {
              // "토핑:초콜릿" 형태인지 확인
              if (typeof opt === 'string' && opt.includes(':')) {
                  const parts = opt.split(':');
                  const groupName = parts[0].trim();
                  const valueName = parts.slice(1).join(':').trim(); // 콜론이 여러개일 경우 대비
                  
                  if (!groups[groupName]) groups[groupName] = [];
                  groups[groupName].push(valueName);
              } 
              // 만약 객체 형태 {group: "토핑", label: "초콜릿"} 일 경우 대응
              else if (typeof opt === 'object' && opt !== null) {
                  const groupName = opt.group || opt.name || "옵션";
                  const valueName = opt.label || opt.value || "";
                  if (!groups[groupName]) groups[groupName] = [];
                  groups[groupName].push(valueName);
              }
          });
  
          // "토핑: 초콜릿, 꿀" 형태로 합치기
          const optionLines = Object.entries(groups)
              .map(([g, vList]) => `    └ ${g}: ${vList.join(', ')}`)
              .join('\n');
              
          if (optionLines) line += `\n${optionLines}`;
      }
      return line;
  }).join('\n\n');
        
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
      const sid = currentStoreId();
      unlockOrder(id);
      await safeRenderAll('store',sid);
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
  document.body.dataset.ordersEventBound = 'true';
  isGlobalHandlerAttached = true;
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
    const sid = currentStoreId(); // 🚀 전역에 저장된 sid 사용
    if (msg.storeId !== sid) return;
    console.log('[ADMIN EVENT] order changed → reload');
    await safeRenderAll(msg.orderType || 'all',sid);
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
    const sid = currentStoreId();
    unlockOrder(id);
    await safeRenderAll(type,sid);
  }
});

export async function syncStoreFromServer() {
  console.log('[syncStoreFromServer] deprecated - using direct DB queries');
}
