// /src/admin/assets/js/modules/orders.js
import { get, patch, fmt } from './store.js';
import { showModal } from './ui.js';

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
      return { ...o, status: nextStatus };
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
    // 원본 주문 배열을 캐시에 그대로 저장
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
          status: o.status || '대기'
        };
      }

      const items = (o.cart || []).map(i => ({
        name: i.name ?? i.menuName ?? '메뉴',
        qty: i.qty ?? i.quantity ?? 1
      }));

      // 서버 status → 화면 status 매핑
      let status = '대기';
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
    patch(['admin', 'ordersStore'], () => rows);
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
      saveStoreCache(storeId, serverRows);
      rows = serverRows;
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
    const items  = (o.cart || []).map(i => `${i.name}x${i.qty}`).join(', ');
    const table  = o.table || '-';
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
        <button
          class="btn small"
          data-action="pos-done"
          data-id="${o.id || o.orderId || ''}"
        >
  POS 완료
</button>

      </td>
    `;
    tbody.appendChild(tr);
  });

  // admin.ordersStore 에도 최신값 저장 (엑셀용)
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

// ─────────────────────────────
// 배달/예약 주문 렌더링 (서버 + 로컬 캐시)
// ─────────────────────────────
export async function renderDeliv() {
  const tbody = $('#tbody-deliv');
  if (!tbody) return;

  const storeId = window.qrnrStoreId || 'store1';
  let rows = [];

  try {
    // 1) 배달 주문
    const r1 = await fetch(
      `/api/orders?type=delivery&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const d1 = await r1.json().catch(() => ({ orders: [] }));

    // 2) 예약 주문
    const r2 = await fetch(
      `/api/orders?type=reserve&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const d2 = await r2.json().catch(() => ({ orders: [] }));

    let serverRows = [...(d1.orders || []), ...(d2.orders || [])];

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
    const kind = o.type === 'reserve' ? '예약' : '배달';

    // 주문자 / 연락처
    const customer = o.customer || {};
    const name  = customer.name  || o.name  || '-';
    const phone = customer.phone || o.phone || '-';

    // 주소
    const addr =
      customer.addr ||
      customer.address ||
      o.addr ||
      '-';

    // 🔹 예약일자 / 예약시간
    //   - 예약 주문(type === 'reserve')에만 의미 있음
    //   - 배달(type === 'delivery')이면 화면에는 '-' 표시
    const reserveDate =
      kind === '예약'
        ? (o.reserveDate || (o.meta && o.meta.reserveDate) || '-')
        : '-';

    const reserveTime =
      kind === '예약'
        ? (o.reserveTime ||
           o.time ||
           (o.meta && o.meta.reserveTime) ||
           '-')
        : '-';

    // 요청사항
    const req =
      customer.req ||
      o.memo ||
      (o.meta && o.meta.req) ||
      '-';

    // 구매내역
    const items = (o.cart || [])
      .map(i => `${i.name}x${i.qty}`)
      .join(', ');

    // 합계금액
    const amount = Number(o.amount || 0);

    // 상태
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
  // 상태 변경
  document.body.addEventListener('change', async (e) => {
    const sel = e.target;
    if (!sel || sel.tagName !== 'SELECT') return;

    const id   = sel.dataset.id;
    const type = sel.dataset.type; // "store" | "delivery"
    if (!id || !type) return;

    const nextStatus = sel.value;
    const storeId = window.qrnrStoreId || 'store1';

    try {
      await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus })
      });

      // 로컬 캐시 상태도 같이 업데이트
      updateStatusInCache(type, storeId, id, nextStatus);

      if (type === 'store') {
        await renderStore();
      } else if (type === 'delivery') {
        await renderDeliv();
      }
    } catch (err) {
      console.error('status change err', err);
      alert('상태 변경에 실패했습니다.');
    }
  });

  // 상세보기 (원하면 추후 구현)
  document.body.addEventListener('click', (e) => {
    const btn = e.target;
    if (!btn || !btn.dataset || !btn.dataset.detail) return;
    // data-detail="${idx},store" / "${idx},delivery" 로 모달 띄우는 기능 구현 가능
    // POS 처리 버튼 클릭
if (e.target.matches('[data-action="pos-done"]')) {
  const id = e.target.dataset.id;
  if (!id) return;

  showModal({
    title: 'POS 결제 완료',
    message: '해당 주문을 결제 완료로 처리할까요?',
    confirmText: '완료 처리',
    cancelText: '취소',
    onConfirm: async () => {
      try {
        await fetch('/api/orders', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, status: '완료' })
        });

        const storeId = window.qrnrStoreId || 'store1';
        updateStatusInCache('store', storeId, id, '완료');

        await renderStore();
      } catch (e) {
        alert('POS 처리에 실패했습니다.');
      }
    }
  });
}

  });
}
