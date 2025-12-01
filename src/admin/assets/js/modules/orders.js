// /src/admin/assets/js/modules/orders.js
import { get, patch, fmt } from './store.js';

// ======================================================================
// storeId 결정 (admin.js와 동일한 보안 규칙)
// ======================================================================
function resolveStoreId() {
  // 1) admin.js에서 설정한 전역 값
  if (window.qrnrStoreId) return window.qrnrStoreId;

  // 2) URL ?store=
  try {
    const u = new URL(location.href);
    const s = u.searchParams.get('store');
    if (s) {
      localStorage.setItem('qrnr.storeId', s);
      return s;
    }
  } catch (e) {}

  // 3) localStorage
  const saved = localStorage.getItem('qrnr.storeId');
  if (saved) return saved;

  // 4) 기본값
  return 'store1';
}

// ======================================================================
// 공통: 주문 시간 포맷
// ======================================================================
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

// ======================================================================
// 로컬 캐시 (store / delivery)
// ======================================================================
const STORE_CACHE_KEY = 'qrnr.cache.ordersStore.v1';
const DELIV_CACHE_KEY = 'qrnr.cache.ordersDeliv.v1';

function safeLoad(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function safeSave(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj || {}));
  } catch {}
}

function loadStoreCache(storeId) {
  const all = safeLoad(STORE_CACHE_KEY);
  return Array.isArray(all[storeId]) ? all[storeId] : [];
}

function saveStoreCache(storeId, list) {
  const all = safeLoad(STORE_CACHE_KEY);
  all[storeId] = Array.isArray(list) ? list : [];
  safeSave(STORE_CACHE_KEY, all);
}

function loadDelivCache(storeId) {
  const all = safeLoad(DELIV_CACHE_KEY);
  return Array.isArray(all[storeId]) ? all[storeId] : [];
}

function saveDelivCache(storeId, list) {
  const all = safeLoad(DELIV_CACHE_KEY);
  all[storeId] = Array.isArray(list) ? list : [];
  safeSave(DELIV_CACHE_KEY, all);
}

// 캐시 상태 변경
function updateStatusInCache(kind, storeId, id, nextStatus) {
  const key = kind === 'store' ? STORE_CACHE_KEY : DELIV_CACHE_KEY;
  const all = safeLoad(key);
  const arr = Array.isArray(all[storeId]) ? all[storeId] : [];

  let touched = false;
  const nextArr = arr.map(o => {
    const oid = o.id || o.orderId;
    if (oid === id) {
      touched = true;
      return { ...o, status: nextStatus };
    }
    return o;
  });

  if (touched) {
    all[storeId] = nextArr;
    safeSave(key, all);
  }
}

// ======================================================================
// 서버 동기화 (매장)
// ======================================================================
export async function syncStoreFromServer() {
  try {
    const storeId = resolveStoreId();
    const res = await fetch(
      `/api/orders?type=store&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const data = await res.json().catch(() => ({ orders: [] }));

    const rawOrders = data.orders || [];
    saveStoreCache(storeId, rawOrders);

    const rows = rawOrders.map(o => {
      const time = fmtDateTimeFromOrder(o);

      // 직원 호출
      const isCall =
        o.meta?.kind === 'CALL' ||
        o.orderName === '직원 호출';

      if (isCall) {
        return {
          id: o.id,
          time,
          table: o.table || '-',
          items: [{ name: `직원 호출: ${o.meta?.note || ''}`, qty: '' }],
          total: 0,
          status: o.status || '대기'
        };
      }

      const items = (o.cart || []).map(i => ({
        name: i.name ?? '메뉴',
        qty: i.qty ?? 1
      }));

      let status = '대기';
      if (o.status === '조리중' || o.status === 'cook') status = '조리중';
      else if (o.status === '완료' || o.status === 'done') status = '완료';

      return {
        id: o.id,
        time,
        table: o.table || '-',
        items,
        total: o.amount || 0,
        status
      };
    });

    patch(['admin', 'ordersStore'], () => rows);
  } catch (e) {
    console.error('syncStoreFromServer error', e);
  }
}

// ======================================================================
// 필터
// ======================================================================
const $ = (s, r = document) => r.querySelector(s);

const filters = {
  store:  { from: '', to: '', status: '', search: '' },
  deliv:  { from: '', to: '', status: '', search: '' }
};

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

// ======================================================================
// 엑셀 export
// ======================================================================
export function exportOrders(type) {
  const rows = get(['admin', type]);
  if (!rows?.length) {
    alert('데이터가 없습니다.');
    return;
  }

  const cols = type === 'ordersStore'
    ? ['시간', '테이블', '내역', '금액', '상태']
    : ['시간', '주문자', '연락처', '주소', '예약', '금액', '상태', '내역'];

  const data = [cols];

  rows.forEach(o => {
    const t = o.time || fmtDateTimeFromOrder(o);
    if (type === 'ordersStore') {
      data.push([
        t,
        o.table || '',
        (o.items || []).map(i => i.name + 'x' + i.qty).join('; '),
        o.total || '',
        o.status || ''
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
    .map(r => r.map(v =>
      '"' + String(v).replaceAll('"','""') + '"'
    ).join(','))
    .join('\n');

  const blob = new Blob([csv], {
    type: 'application/vnd.ms-excel;charset=utf-8'
  });

  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = type === 'ordersStore'
    ? `store_${today}.xlsx`
    : `delivery_${today}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ======================================================================
// 매장 주문 렌더링
// ======================================================================
export async function renderStore() {
  const tbody = $('#tbody-store');
  if (!tbody) return;

  const storeId = resolveStoreId();
  let rows = [];

  try {
    const res = await fetch(
      `/api/orders?type=store&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const data = await res.json().catch(() => ({ orders: [] }));
    const serverRows = data.orders || [];

    if (serverRows.length) {
      saveStoreCache(storeId, serverRows);
      rows = serverRows;
    } else {
      rows = loadStoreCache(storeId);
    }
  } catch (e) {
    console.error('renderStore error', e);
    rows = loadStoreCache(storeId);
  }

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
    const time  = fmtDateTimeFromOrder(o);
    const items = (o.cart || []).map(i => `${i.name}x${i.qty}`).join(', ');
    const table = o.table || '-';
    const amount = Number(o.amount || 0);
    const status = o.status || '대기';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${time}</td>
      <td>${table}</td>
      <td>${items || '-'}</td>
      <td>${fmt(amount)}</td>
      <td>
        <span class="badge-dot ${
          status === '완료'
            ? 'badge-done'
            : status === '조리중'
            ? 'badge-cook'
            : 'badge-wait'
        }"></span>
        <select
          class="input"
          style="width:100px"
          data-type="store"
          data-id="${o.id || o.orderId || ''}"
        >
          <option ${status === '대기' ? 'selected' : ''}>대기</option>
          <option ${status === '조리중' ? 'selected' : ''}>조리중</option>
          <option ${status === '완료' ? 'selected' : ''}>완료</option>
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });

  patch(['admin', 'ordersStore'], () => {
    return rows.map(o => {
      const items = (o.cart || []).map(i => ({
        name: i.name ?? '메뉴',
        qty: i.qty ?? 1
      }));
      return {
        id: o.id || o.orderId,
        time: fmtDateTimeFromOrder(o),
        table: o.table || '-',
        items,
        total: o.amount || 0,
        status: o.status || '대기'
      };
    });
  });
}

// ======================================================================
// 배달/예약 주문 렌더링
// ======================================================================
export async function renderDeliv() {
  const tbody = $('#tbody-deliv');
  if (!tbody) return;

  const storeId = resolveStoreId();
  let rows = [];

  try {
    const r1 = await fetch(
      `/api/orders?type=delivery&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const d1 = await r1.json().catch(() => ({ orders: [] }));

    const r2 = await fetch(
      `/api/orders?type=reserve&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const d2 = await r2.json().catch(() => ({ orders: [] }));

    const serverRows = [...(d1.orders || []), ...(d2.orders || [])];

    if (serverRows.length) {
      saveDelivCache(storeId, serverRows);
      rows = serverRows;
    } else {
      rows = loadDelivCache(storeId);
    }
  } catch (e) {
    console.error('renderDeliv error', e);
    rows = loadDelivCache(storeId);
  }

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

    const kind = o.type === 'reserve' ? '예약' : '배달';

    const customer = o.customer || {};
    const name  = customer.name  || o.name  || '-';
    const phone = customer.phone || o.phone || '-';

    const addr =
      customer.addr ||
      customer.address ||
      o.addr ||
      '-';

    const reserveDate =
      kind === '예약'
        ? (o.reserveDate || o.meta?.reserveDate || '-')
        : '-';

    const reserveTime =
      kind === '예약'
        ? (o.reserveTime || o.time || o.meta?.reserveTime || '-')
        : '-';

    const req =
      customer.req ||
      o.memo ||
      o.meta?.req ||
      '-';

    const items =
      (o.cart || [])
        .map(i => `${i.name}x${i.qty}`)
        .join(', ');

    const amount = Number(o.amount || 0);
    const status = o.status || '대기';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${time}</td>
      <td>${name}</td>
      <td>${phone}</td>
      <td>${addr}</td>
      <td>${reserveDate}</td>
      <td>${reserveTime}</td>
      <td>${req}</td>
      <td>${items || '-'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;justify-content:flex-start">
          <span class="badge small">${kind}</span>
          <span>${fmt(amount)}</span>
          <span class="badge-dot ${
            status === '완료'
              ? 'badge-done'
              : status === '조리중'
              ? 'badge-cook'
              : 'badge-wait'
          }"></span>
          <select
            class="input"
            style="width:90px"
            data-type="delivery"
            data-id="${o.id || o.orderId || ''}"
          >
            <option ${status === '대기' ? 'selected' : ''}>대기</option>
            <option ${status === '조리중' ? 'selected' : ''}>조리중</option>
            <option ${status === '완료' ? 'selected' : ''}>완료</option>
          </select>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

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

// ======================================================================
// 상태 변경
// ======================================================================
export function attachGlobalHandlers() {
  document.body.addEventListener('change', async (e) => {
    const sel = e.target;
    if (!sel || sel.tagName !== 'SELECT') return;

    const id   = sel.dataset.id;
    const kind = sel.dataset.type; // store | delivery
    const nextStatus = sel.value;

    if (!id || !kind) return;

    const storeId = resolveStoreId();

    try {
      await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          status: nextStatus,
          storeId // 🔒 매장 검증 위한 파라미터 추가
        })
      });

      updateStatusInCache(kind, storeId, id, nextStatus);

      if (kind === 'store') await renderStore();
      else await renderDeliv();

    } catch (err) {
      console.error('status change err', err);
      alert('상태 변경에 실패했습니다.');
    }
  });
}
