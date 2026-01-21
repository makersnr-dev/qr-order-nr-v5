// /src/admin/assets/js/modules/orders.js
import { get, patch, fmt } from './store.js';
//import { showModal } from './ui.js';
import {
  STATUS_FLOW,
  STATUS_LIST
} from '/src/shared/constants/status.js';


// ===============================
// 관리자 고유 ID (탭 단위)
// ===============================
const ADMIN_ID =
  sessionStorage.getItem('qrnr.adminId.real') || 'admin';

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



async function changeOrderStatus({ id, status, type }) {

  // 🔒 0-4-1: id 유효성 1차 차단
  if (!id || typeof id !== 'string') {
    console.warn('[BLOCKED] invalid order id:', id);
    showToast('유효하지 않은 주문입니다.');
    return;
  }

  if (!id || !status) return;

  // ✅ 공식 상태 목록 기준
const allowedStatuses = STATUS_LIST[type] || [];

if (!allowedStatuses.includes(status)) {

  // 🔒 결제 완료된 주문은 주문취소 불가 (기존 로직 유지)
  if (status === '주문취소') {
    const storeId = window.qrnrStoreId || 'store1';
    const cached = loadStoreCache(storeId);
    const order = cached.find(o => (o.id || o.orderId) === id);

    if (order?.meta?.payment?.paid) {
      showToast('결제 완료된 주문은 주문취소할 수 없습니다.');
      return;
    }
  }

  console.warn('[BLOCKED] invalid status change attempt:', status);
  return;
}

  // ✅ storeId는 여기서 한 번만 선언 (핵심 수정)
  const storeId = window.qrnrStoreId || 'store1';

  // 🔒 0-4-2: UI 안전 차단용 (서버 기준 아님)
  if (type === 'store') {
    const cachedOrders = loadStoreCache(storeId);

    const existsInCache = cachedOrders.some(
      o => (o.id || o.orderId) === id
    );

    if (!existsInCache) {
      console.warn('[UI BLOCK] order not in cache:', id);
      showToast('화면이 최신 상태가 아닙니다. 새로고침 후 다시 시도하세요.');
      return;
    }
  }

  const historyItem = {
    at: new Date().toISOString(),
    type: 'ORDER',
    action: 'STATUS_CHANGE',
    value: status,
    by: ADMIN_ID,
    note: '상태 변경'
  };

  const res = await fetch('/api/orders', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id,
      status,
      metaAppend: {
        history: historyItem
      }
    })
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'STATUS_CHANGE_FAILED');
  }

  // 🔔 다른 관리자에게 상태 변경 알림
  try {
    const channel = new BroadcastChannel('qrnr-admin');
    channel.postMessage({
      type: 'STATUS_CHANGED',
      storeId,
      orderId: id,
      status,
      senderId: ADMIN_ID
    });
  } catch {}


  // ✅ 이제 storeId 정상 참조
  updateStatusInCache(type, storeId, id, status);

  if (type === 'store') await renderStore();
  if (type === 'delivery') await renderDeliv();
}


// ===============================
// 💳 결제 상태 변경 전용 함수 (공통)
// ===============================
async function applyPaymentUpdate({ id, payment, history }) {
  if (!id) return;

  const storeId = window.qrnrStoreId || 'store1';

  // 서버 반영
  await fetch('/api/orders', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id,
      meta: {
        payment
      },
      metaAppend: {
        history
      }
    })
  });

  

  await renderStore();
}



// ─────────────────────────────
// 공통: 주문 시간 포맷
// ─────────────────────────────
function fmtDateTimeFromOrder(o) {
  // API가 저장해둔 문자열이 있으면 그대로 사용
  if (o.dateTime) return o.dateTime; // "YYYY-MM-DD HH:MM"
  if (o.date && o.time) return `${o.date} ${o.time}`;
  // 없으면 ts로 생성
  const d = new Date(o.ts || Date.now());
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const HH   = String(d.getHours()).padStart(2, '0');
  const MM   = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
}
//-------------문자열 변환 함수-----------------------
function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];

  return options.map(opt => {
    // 문자열 옵션 (구버전 호환)
    if (typeof opt === 'string') return opt;

    // 객체 옵션 (신버전)
    const name = opt.name || opt.group || '옵션';
    const value = opt.value || opt.label || '';

    return value ? `${name}:${value}` : name;
  });
}

// ─────────────────────────────
// 관리자 UI 표시용 유틸 (🔥 추가)
// ─────────────────────────────

// 구매내역 요약: 메뉴 2개 이상이면 "외 n개"
function summarizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) return '-';
  if (items.length === 1) return items[0];

  const first = items[0];
  const restCount = items.length - 1;
  return `${first} 외 ${restCount}개`;
}

// 텍스트 줄 수 제한 (목록용)
function limitLines(text, maxLines = 20) {
  if (!text) return text;
  const lines = String(text).split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + '\n…';
}

// 주문자 이름 말줄임 (한글 4글자 기준)
function truncateName(name, maxLen = 4) {
  if (!name) return '-';
  return name.length > maxLen ? name.slice(0, maxLen) + '…' : name;
}

// 요청사항 글자 수 제한 (목록용)
function truncateText(text, maxLen = 15) {
  if (!text) return '-';
  const str = String(text);
  return str.length > maxLen
    ? str.slice(0, maxLen) + '…'
    : str;
}

// 📞 연락처 포맷 (010-1234-5678)
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

// 🙍‍♂️ 예약 주문자 이름 말줄임 (3글자 기준)
function truncateReserveName(name, maxLen = 3) {
  if (!name) return '-';
  return name.length > maxLen
    ? name.slice(0, maxLen) + '...'
    : name;
}


// ─────────────────────────────
// 로컬 캐시 (localStorage)
//  - 브라우저/점포별 주문 캐시
//  - 나중에 DB 붙이면 이 부분을 API 호출로 교체 가능
// ─────────────────────────────
const STORE_CACHE_KEY = 'qrnr.cache.ordersStore.v1';
const DELIV_CACHE_KEY = 'qrnr.cache.ordersDeliv.v1';

function safeLoad(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.error('[orders] cache parse error', key, e);
    return {};
  }
}

function safeSave(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj || {}));
  } catch (e) {
    console.error('[orders] cache save error', key, e);
  }
}

function loadStoreCache(storeId) {
  const all = safeLoad(STORE_CACHE_KEY);
  return Array.isArray(all[storeId]) ? all[storeId] : [];
}

function saveStoreCache(storeId, orders) {
  const all = safeLoad(STORE_CACHE_KEY);
  all[storeId] = Array.isArray(orders) ? orders : [];
  safeSave(STORE_CACHE_KEY, all);
}

function loadDelivCache(storeId) {
  const all = safeLoad(DELIV_CACHE_KEY);
  return Array.isArray(all[storeId]) ? all[storeId] : [];
}

function saveDelivCache(storeId, orders) {
  const all = safeLoad(DELIV_CACHE_KEY);
  all[storeId] = Array.isArray(orders) ? orders : [];
  safeSave(DELIV_CACHE_KEY, all);
}

// 상태 변경 시 캐시에도 반영
function updateStatusInCache(kind, storeId, id, nextStatus) {
  if (!id) return;

  const key = kind === 'store' ? STORE_CACHE_KEY : DELIV_CACHE_KEY;
  const all = safeLoad(key);
  const arr = Array.isArray(all[storeId]) ? all[storeId] : [];

  let touched = false;
  const nextArr = arr.map(o => {
    const oid = o.id || o.orderId;
    if (oid === id) {
      touched = true;
    
      const prevHistory = Array.isArray(o.meta?.history)
        ? o.meta.history
        : [];
    return {
  ...o,
  status: nextStatus,
  meta: {
    ...o.meta,

    // 🔥 핵심: 결제취소면 결제완료 상태를 무효화
    payment: o.meta?.payment,

    history: [
      ...prevHistory,
      {
        at: new Date().toISOString(),
        type: 'ORDER',
        action: 'STATUS_CHANGE',
        value: nextStatus,
        by: ADMIN_ID,
        note: '상태 변경'
      }
    ]
  }
};

}

    return o;
  });

  if (touched) {
    all[storeId] = nextArr;
    safeSave(key, all);
  }
}

// ─────────────────────────────
// (기존) 서버 → admin.ordersStore 동기화
//   - 여기서는 로컬 캐시에도 한 번 더 저장
// ─────────────────────────────
export async function syncStoreFromServer() {
  try {
    const storeId = window.qrnrStoreId || 'store1';
    const res = await fetch(
      `/api/orders?type=store&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const data = await res.json();
    if (!data.ok) return;

    const rawOrders = data.orders || [];
    // 원본 주문 배열을 캐시에 그대로 저장(중요)
    saveStoreCache(storeId, rawOrders);

    const rows = rawOrders.map(o => {
      const time = fmtDateTimeFromOrder(o);

      const isCall =
        o.meta?.kind === 'CALL' ||
        o.orderName === '직원 호출';

      if (isCall) {
        // ✅ 직원 호출 행 포맷
        return {
          id: o.id,
          time,
          table: o.table || '-',
          items: [{ name: `직원 호출: ${o.meta?.note || ''}`, qty: '' }],
          total: 0,
          status: o.status || '주문접수'
        };
      }

      const items = (o.cart || []).map(i => ({
        name: i.name ?? i.menuName ?? '메뉴',
        qty: i.qty ?? i.quantity ?? 1
      }));

      // 서버 status → 화면 status 매핑
      let status = '주문접수';
      if (o.status === '조리중' || o.status === 'cook') status = '조리중';
      else if (o.status === '완료' || o.status === 'done') status = '완료';

      return {
        id: o.id,
        time,                  // 주문시간
        table: o.table || '-', // 테이블
        items,                 // 내역
        total: o.amount || 0,  // 금액
        status                 // 상태
      };
    });

    // admin.ordersStore 에 덮어쓰기 (엑셀용)
    //patch(['admin', 'ordersStore'], () => rows);
  } catch (e) {
    console.error('syncStoreFromServer error', e);
  }
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

// ─────────────────────────────
// 필터 바인딩
// ─────────────────────────────
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

// ─────────────────────────────
// 엑셀 내보내기 (기존 로직 유지)
// ─────────────────────────────
export function exportOrders(type) {
  const rows = get(['admin', type]);
  if (!rows || !rows.length) {
    alert('데이터가 없습니다.');
    return;
  }

  const cols = type === 'ordersStore'
    ? ['시간', '테이블', '내역', '금액', '상태','취소사유']
    : ['시간', '주문자', '연락처', '주소', '예약', '금액', '상태', '내역'];

  const data = [cols];

  rows.forEach(o => {
    const t = o.time || fmtDateTimeFromOrder(o);
    if (type === 'ordersStore') {
      data.push([
        t,
        o.table || '',
        (o.items || []).map(i => {
          let line = `${i.name} x${i.qty}`;
        
          if (Array.isArray(i.options) && i.options.length) {
            const opts = normalizeOptions(i.options);
            line += ' (' + opts.join(', ') + ')';
          }
        
          return line;
        }).join('; '),
        o.total || '',
        o.status || '',
        o.meta?.cancel?.reason || ''
      ]);
    } else {
      data.push([
        t,
        o.customer || '',
        o.phone || '',
        o.addr || '',
        o.reserve || '',
        o.total || '',
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

// ─────────────────────────────
// 매장 주문 렌더링 (서버 + 로컬 캐시)
// ─────────────────────────────
export async function renderStore() {
  return renderStoreTable();
}

async function renderStoreTable() {
  const tbody = $('#tbody-store');
  if (!tbody) return;

  const storeId = window.qrnrStoreId || 'store1';
  let rows = [];

  try {
    const res = await fetch(
      `/api/orders?type=store&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const data = await res.json().catch(() => ({ orders: [] }));
    let serverRows = (data.orders || []);

    if (serverRows.length) {
      // 서버 데이터 있으면 그걸 우선 사용하고 캐시에 저장
      const cached = loadStoreCache(storeId);

      const mergedRows = serverRows.map(o => {
        const cachedOne = cached.find(c => (c.id || c.orderId) === (o.id || o.orderId));
      
        return {
          ...o,
          meta: {
            ...o.meta,
            history:
              Array.isArray(o.meta?.history) && o.meta.history.length
                ? o.meta.history
                : cachedOne?.meta?.history || []
          }
        };
      });
      
      saveStoreCache(storeId, mergedRows);
      rows = mergedRows;

    } else {
      // 서버가 비어 있으면 캐시에서 복구 시도
      const cached = loadStoreCache(storeId);
      if (cached.length) {
        rows = cached;
      } else {
        rows = [];
      }
    }
  } catch (e) {
    console.error('renderStore err (server)', e);
    // 서버 에러 시 캐시 fallback
    const cached = loadStoreCache(storeId);
    rows = cached.length ? cached : [];
  }

  // 최신순 정렬
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

    <!-- 상태 변경 -->
<div class="order-status-line">

  <!-- ● 상태 점 -->
  <span class="badge-dot ${
  o.meta?.payment?.cancelled
    ? 'badge-cancel'
    : status === '주문완료'
    ? 'badge-done'
    : status === '준비중'
    ? 'badge-cook'
    : 'badge-wait'
}"></span>


  <!-- 상태 SELECT -->
  ${(() => {
    const current = status;
    let nextList = STATUS_FLOW.store?.[current] || [];


    // 🔒 결제 완료 상태면 '주문취소' 제거
    if (o.meta?.payment?.paid) {
      nextList = nextList.filter(s => s !== '주문취소');
    }
    
    const orderId = o.id || null;

    //// ❌ 결제취소만 SELECT 제거
    if (o.meta?.payment?.cancelled) {
      return '';
    }

    
    const disabled = current === '주문취소' ? 'disabled' : '';

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

  <!-- 결제 완료 뱃지 (있을 때만) -->
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


   <!-- 결제 관련 버튼 -->
<div class="order-action-line">
  ${
    // ❌ 주문취소 or 결제취소면 버튼 없음
    status === '주문취소' || o.meta?.payment?.cancelled
      ? ''
      : (
        // 1️⃣ 아직 결제 안 됐을 때
        !o.meta?.payment?.paid
          ? `
            <button
              class="btn primary"
              data-action="confirm-pos-paid"
              data-id="${o.id || o.orderId || ''}">
              POS 결제 확인
            </button>
          `
          // 2️⃣ 결제 완료 상태 → 결제취소 가능
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

  patch(['admin', 'ordersStore'], () => {
  const storeId = window.qrnrStoreId || 'store1';
  const orders = loadStoreCache(storeId); // ✅ 원본 기준

  return orders.map(o => ({
    id: o.id || o.orderId,
    time: fmtDateTimeFromOrder(o),
    table: o.table || '-',
    items: (o.cart || []).map(i => ({
      name: i.name ?? '메뉴',
      qty: i.qty ?? 1,
      options: i.options || [] // ✅ 문자열화는 여기서 한 번만
    })),
    total: o.amount || 0,
    status: o.status || '대기',
    meta: o.meta || {}
  }));
});


}

// ─────────────────────────────
// 배달/예약 주문 렌더링 (서버 + 로컬 캐시)
// ─────────────────────────────
export async function renderDeliv() {
  const tbody = $('#tbody-deliv');
  if (!tbody) return;

  const storeId = window.qrnrStoreId || 'store1';
  let rows = [];

  try {
   // ✅ 예약 주문만 가져오기
    const r = await fetch(
      `/api/orders?type=reserve&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const d = await r.json().catch(() => ({ orders: [] }));
    
    let serverRows = d.orders || [];


    if (serverRows.length) {
      saveDelivCache(storeId, serverRows);
      rows = serverRows;
    } else {
      const cached = loadDelivCache(storeId);
      rows = cached.length ? cached : [];
    }
  } catch (e) {
    console.error('renderDeliv err (server)', e);
    const cached = loadDelivCache(storeId);
    rows = cached.length ? cached : [];
  }

  // 최신순 정렬
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

    // 🔹 주문 유형 (배달 / 예약 구분)
    const kind = '예약';

    // 주문자 / 연락처
    const customer = o.customer || {};
    
    const rawName = customer.name || o.name || '-';
    const name = truncateReserveName(rawName, 3);
    
    const rawPhone = customer.phone || o.phone || '-';
    const phone = formatPhone(rawPhone);


    // 주소
    const addr =
      customer.addr ||
      customer.address ||
      o.addr ||
      '-';

    // 🔹 예약일자 / 예약시간
    //   - 예약 주문(type === 'reserve')에만 의미 있음
    // 🔹 예약일시 (합쳐서 표시)
    const reserveDateTime =
      o.reserve?.date && o.reserve?.time
        ? `${o.reserve.date}\n${o.reserve.time}`
        : '-';

    
    const req = truncateText(
      customer.memo || '-',
      20
    );




    // 구매내역
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



    // 합계금액
    const amount = Number(o.amount || 0);

    // 상태
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
    
        <!-- 합계금액 -->
        <div style="font-weight:600">
          ${fmt(amount)}원
        </div>
    
        <!-- 상태 -->
        <div style="display:flex;align-items:center;gap:6px">
          <span class="badge-dot ${
            status === '주문완료'
              ? 'badge-done'
              : status === '준비중'
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
            ${(STATUS_FLOW.reserve?.[status] || []).map(s => `<option>${s}</option>`).join('')}
          </select>
        </div>
    
      </div>
    </td>

    `;
    tbody.appendChild(tr);
  });

// ✅ 실제 화면에 사용한 rows 기준으로 캐시 갱신 (상세 모달 안정화)
//saveStoreCache(storeId, rows);

  
  // admin.ordersDelivery 에도 최신값 저장 (엑셀용)
  patch(['admin', 'ordersDelivery'], () => {
    return rows.map(o => {
      const customer = o.customer || {};
      const items = (o.cart || []).map(i => ({
        name: i.name ?? '메뉴',
        qty: i.qty ?? 1
      }));
      return {
        id: o.id || o.orderId,
        time: fmtDateTimeFromOrder(o),
        customer: customer.name || o.name || '-',
        phone: customer.phone || o.phone || '-',
        addr:
          customer.addr ||
          customer.address ||
          o.addr ||
          '-',
        reserve:
          o.type === 'reserve'
            ? (o.reserveDate || '') + ' ' + (o.reserveTime || '')
            : '',
        items,
        total: o.amount || 0,
        status: o.status || '대기'
      };
    });
  });
}

// ─────────────────────────────
// 상태 변경 핸들러
// ─────────────────────────────
export function attachGlobalHandlers() {

  //  상태 변경
  document.body.addEventListener('change', async (e) => {
  const sel = e.target;
  if (sel.tagName !== 'SELECT') return;

  const id = sel.dataset.id;
  const type = sel.dataset.type;
  const nextStatus = sel.value;

  if (!id || !type || !nextStatus) return;

  // 🔴 취소 계열은 바로 처리하지 않음
  if (nextStatus === '주문취소' || nextStatus === '결제취소') {
    const modal = document.getElementById('cancel-reason-modal');
    if (!modal) {
      alert('취소 사유 모달이 없습니다.');
      sel.value = sel.options[0].value; // 원래 상태로 되돌림
      return;
    }

    modal.dataset.orderId = id;
    modal.dataset.cancelStatus = nextStatus;
    modal.dataset.orderType = type;
    modal.style.display = 'flex';

    // select 값 원래대로 되돌리기 (확정은 모달에서)
    sel.value = sel.options[0].value;
    return;
  }

  // 🟢 일반 상태 변경만 즉시 처리
   try {
    await changeOrderStatus({ id, status: nextStatus, type });
    showToast(`상태가 "${nextStatus}"(으)로 변경되었습니다.`);
  } catch (err) {
  if (err.message === 'ORDER_NOT_FOUND') {
    showToast('이미 삭제되었거나 처리된 주문입니다.');
    await renderStore();
    return;
  }
  alert('상태 변경 실패');
  console.error(err);
}
  
  });

  // 주문 상세 모달 열기
document.body.addEventListener('click', (e) => {
  if (e.target.dataset.action !== 'order-detail') return;

  const id = e.target.dataset.id;
  if (!id) return;

  const storeId = window.qrnrStoreId || 'store1';
  const orders = loadStoreCache(storeId);
  const order = orders.find(o => (o.id || o.orderId) === id);
  if (!order) return alert('주문을 찾을 수 없습니다.');

  // 🔥 옵션 줄바꿈 핵심
 const cancelReason =
  order.meta?.cancel?.reason
    ? `❌ 취소 사유: ${order.meta.cancel.reason}`
    : '';

  // 💳 결제 정보 표시
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

    // 🔁 구버전 호환
    const value = h.value || h.status || '';
    const actionText =
      h.action === 'PAYMENT_CONFIRMED'
        ? '결제 완료'
        : h.action === 'PAYMENT_CANCELLED'
        ? '결제 취소'
        : '상태 변경';
    const by = h.by? ` (by ${h.by})` : '';
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

});

// 닫기 버튼
document.getElementById('order-detail-close')?.addEventListener('click', () => {
  document.getElementById('order-detail-modal').style.display = 'none';
});

 // 예약 주문 상세 모달 열기
document.body.addEventListener('click', (e) => {
  if (e.target.dataset.action !== 'order-detail-deliv') return;

  const id = e.target.dataset.id;
  if (!id) return;

  const storeId = window.qrnrStoreId || 'store1';
  const orders = loadDelivCache(storeId);
  const order = orders.find(o => (o.id || o.orderId) === id);
  if (!order) return alert('예약 주문을 찾을 수 없습니다.');

  const customer = order.customer || {};

  /* =========================
     1️⃣ 상단 정보 블록
  ========================= */
  const infoBlock = [
    `주문시간: ${fmtDateTimeFromOrder(order)}`,
    `주문자: ${customer.name || '-'}`,
    `연락처: ${formatPhone(customer.phone || '-')}`,
    `주소: ${customer.addr || '-'}`,
    `예약일시: ${(order.reserve?.date || '-') + ' ' + (order.reserve?.time || '')}`,
    `요청사항: ${customer.memo || '-'}`,
    `합계금액: ${fmt(order.amount || 0)}원`
  ].join('\n');

  /* =========================
     2️⃣ 상태 변경 이력
  ========================= */
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

  /* =========================
     3️⃣ 구매 내역 블록
  ========================= */
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

  /* =========================
     4️⃣ 모달 출력
  ========================= */
  document.getElementById('order-detail-body').textContent =
    infoBlock + historyBlock + '\n\n' + itemsBlock;

  document.getElementById('order-detail-modal').style.display = 'flex';
});


// 🟢 POS 결제 확인 버튼
document.body.addEventListener('click', async (e) => {
  if (e.target.dataset.action !== 'confirm-pos-paid') return;

  const id = e.target.dataset.id;
  if (!id) {
    showToast('유효하지 않은 주문입니다.');
    return;
  }

  // UI 보호용 안내만 하고 서버 판단에 맡김
  const storeId = window.qrnrStoreId || 'store1';
  const cached = loadStoreCache(storeId);
  if (!cached.some(o => (o.id || o.orderId) === id)) {
    showToast('화면이 최신 상태가 아닙니다. 새로고침 후 다시 시도하세요.');
    return;
  }

  try {
    await fetch('/api/orders', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
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
            value: '결제완료',
            by: ADMIN_ID,
            note: 'POS 결제 확인'
          }
        }
      })
    });
    // 🔔 결제 완료 이벤트 전파
    try {
      const channel = new BroadcastChannel('qrnr-admin');
      channel.postMessage({
        type: 'STATUS_CHANGED',
        storeId: window.qrnrStoreId || 'store1',
        orderId: id,
        status: '결제완료',
        senderId: ADMIN_ID
      });
    } catch {}
    updateStatusInCache(
      'store',
      window.qrnrStoreId || 'store1',
      id,
      '결제완료'
    );
    await renderStore();
    
  } catch (err) {
    console.error(err);
    alert('결제 완료 처리 실패');
  }
});


  // 🔴 결제취소 버튼 → 사유 입력 모달 열기
document.body.addEventListener('click', (e) => {
  if (e.target.dataset.action !== 'cancel-payment') return;

  const id = e.target.dataset.id;
  if (!id) return;

  const storeId = window.qrnrStoreId || 'store1';
  const orders = loadStoreCache(storeId);
  if (!orders.length) {
    showToast('주문 정보를 찾을 수 없습니다.');
    return;
  }
  const order = orders.find(o => (o.id || o.orderId) === id);

  if (
    !order ||
    !order.meta?.payment?.paid ||
    !['주문접수','준비중', '주문완료'].includes(order.status)
  ) {
    alert('결제 완료된 주문만 결제취소할 수 있습니다.');
    return;
  }



  const modal = document.getElementById('cancel-reason-modal');
  modal.dataset.orderId = id;
  modal.dataset.cancelStatus = '결제취소'; // 🔥 여기서 명확히
  modal.style.display = 'flex';
});




// 📱 모바일 카드 상태 버튼 처리
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


  // 📱 모바일 주문 카드 버튼 처리
/*document.body.addEventListener('click', async (e) => {
  const btn = e.target;

  // 모바일 카드 버튼 아니면 무시
  if (!btn || !btn.dataset || !btn.dataset.status) return;

  const id = btn.dataset.id;
  const nextStatus = btn.dataset.status;

  if (!id || !nextStatus) return;

  try {
    await fetch('/api/orders', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        status: nextStatus
      })
    });

    // 상태 변경 후 다시 렌더링
    await renderStore();

  } catch (err) {
    console.error(err);
    alert('상태 변경 실패');
  }
});*/

  
document.body.addEventListener('click', (e) => {
  if (e.target.dataset.action !== 'cancel-order') return;

  const id = e.target.dataset.id;
  if (!id) return;

  const modal = document.getElementById('cancel-reason-modal');
  modal.dataset.orderId = id;
  modal.dataset.cancelStatus = '주문취소';
  modal.style.display = 'flex';
});


}

document.getElementById('cancel-reason-close')
  ?.addEventListener('click', async () => {
    const modal = document.getElementById('cancel-reason-modal');

    // 1️⃣ 모달 닫기
    modal.style.display = 'none';

    // 2️⃣ 혹시 남아있을 데이터 제거
    delete modal.dataset.orderId;
    delete modal.dataset.cancelStatus;

    // 3️⃣ 서버 기준으로 화면 완전 초기화
    await renderStore();
  });



document.getElementById('cancel-reason-confirm')
  ?.addEventListener('click', async () => {

  const modal = document.getElementById('cancel-reason-modal');
  const id = modal.dataset.orderId;
  const status = modal.dataset.cancelStatus;
  const type = modal.dataset.orderType || 'store';
  const reason = document.getElementById('cancel-reason-input').value.trim();

  if (!reason) {
    alert(UI_TEXT.CANCEL_REASON_REQUIRED);
    return;
  }

  try {
    const isPaymentCancel = status === '결제취소';
    
    await fetch('/api/orders', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        type,
        // ✅ 결제취소면 status 자체를 보내지 않음
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

      
      if (status !== '결제취소') {
      updateStatusInCache('store', window.qrnrStoreId || 'store1', id, status);
    }


    document.getElementById('cancel-reason-input').value = '';
    modal.style.display = 'none';

    await renderStore();
  showToast(`${status} 처리되었습니다.`);

  } catch (err) {
    console.error(err);
    alert('취소 처리 실패');
  }
});

