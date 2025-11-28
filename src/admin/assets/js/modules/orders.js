// /src/admin/assets/js/modules/orders.js
import { get, patch, fmt } from './store.js';
import { showModal } from './ui.js';

// ─────────────────────────────
// 공통: 주문 시간 포맷
// ─────────────────────────────
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

// ─────────────────────────────
// 공통: 현재 admin의 storeId
// ─────────────────────────────
function adminStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;
  try {
    const saved = localStorage.getItem('qrnr.storeId');
    if (saved) return saved;
  } catch (e) {
    console.error('[orders] adminStoreId localStorage error', e);
  }
  return 'store1';
}

// ─────────────────────────────
// 로컬 캐시 (localStorage)
// ─────────────────────────────
const STORE_CACHE_KEY = 'qrnr.admin.storeOrders';
const DELIV_CACHE_KEY = 'qrnr.admin.delivOrders';

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

function safeSave(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
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

function updateStatusInCache(kind, storeId, id, nextStatus) {
  if (!id) return;

  if (kind === 'store') {
    const all = safeLoad(STORE_CACHE_KEY);
    const arr = Array.isArray(all[storeId]) ? all[storeId] : [];
    all[storeId] = arr.map((o) =>
      o.id === id ? { ...o, status: nextStatus } : o
    );
    safeSave(STORE_CACHE_KEY, all);
  } else if (kind === 'delivery') {
    const all = safeLoad(DELIV_CACHE_KEY);
    const arr = Array.isArray(all[storeId]) ? all[storeId] : [];
    all[storeId] = arr.map((o) =>
      o.id === id ? { ...o, status: nextStatus } : o
    );
    safeSave(DELIV_CACHE_KEY, all);
  }
}

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

// 서버에서 매장 주문/배달 주문을 동기화해 localStorage에 저장
export async function syncStoreFromServer() {
  try {
    const storeId = adminStoreId();
    const res = await fetch(
      `/api/orders?type=store&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const data = await res.json();
    if (Array.isArray(data.orders)) {
      saveStoreCache(storeId, data.orders);
    }
  } catch (e) {
    console.error('[orders] syncStoreFromServer store error', e);
  }

  try {
    const storeId = adminStoreId();
    const res = await fetch(
      `/api/orders?type=delivery&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const data = await res.json();
    if (Array.isArray(data.orders)) {
      saveDelivCache(storeId, data.orders);
    }
  } catch (e) {
    console.error('[orders] syncStoreFromServer delivery error', e);
  }
}

// 매장 주문 목록 렌더
export async function renderStore() {
  const tbody = $('#tbody-store');
  if (!tbody) return;

  const storeId = adminStoreId();
  let rows = [];

  try {
    const res = await fetch(
      `/api/orders?type=store&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const data = await res.json();
    if (Array.isArray(data.orders)) {
      rows = data.orders;
      saveStoreCache(storeId, rows);
    } else {
      rows = loadStoreCache(storeId);
    }
  } catch (e) {
    console.error('[orders] renderStore fetch error', e);
    rows = loadStoreCache(storeId);
  }

  tbody.innerHTML = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.className = 'text-center text-muted';
    td.textContent = '주문 내역 없음';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((o) => {
    const tr = document.createElement('tr');
    tr.dataset.id = o.id;

    const tdId = document.createElement('td');
    tdId.textContent = o.id || '';
    tdId.className = 'text-center';

    const tdTime = document.createElement('td');
    tdTime.textContent = fmtDateTimeFromOrder(o);

    const tdTable = document.createElement('td');
    tdTable.textContent = o.tableNo || '-';

    const tdItems = document.createElement('td');
    tdItems.textContent =
      (o.items || [])
        .map((i) => `${i.name || i.menuId || ''} x${i.qty || 1}`)
        .join(', ') || '-';

    const tdAmt = document.createElement('td');
    tdAmt.textContent = fmt.number(o.total || 0) + '원';
    tdAmt.className = 'text-end';

    const tdStatus = document.createElement('td');
    const sel = document.createElement('select');
    sel.className = 'form-select form-select-sm order-status-select';
    sel.dataset.id = o.id || '';
    sel.dataset.type = 'store';

    ['접수', '준비중', '완료', '취소'].forEach((st) => {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      if (o.status === st) opt.selected = true;
      sel.appendChild(opt);
    });

    tdStatus.appendChild(sel);

    const tdMemo = document.createElement('td');
    tdMemo.textContent = o.memo || '';

    const tdPhone = document.createElement('td');
    tdPhone.textContent = o.phone || '';

    tr.appendChild(tdId);
    tr.appendChild(tdTime);
    tr.appendChild(tdTable);
    tr.appendChild(tdItems);
    tr.appendChild(tdAmt);
    tr.appendChild(tdStatus);
    tr.appendChild(tdMemo);
    tr.appendChild(tdPhone);

    tbody.appendChild(tr);
  });

  bindStatusSelects();
}

// 배달/예약 주문 목록 렌더
export async function renderDeliv() {
  const tbody = $('#tbody-deliv');
  if (!tbody) return;

  const storeId = adminStoreId();
  let rows = [];

  try {
    const r1 = await fetch(
      `/api/orders?type=delivery&storeId=${encodeURIComponent(storeId)}`,
      { cache: 'no-store' }
    );
    const data1 = await r1.json();
    if (Array.isArray(data1.orders)) {
      rows = data1.orders;
      saveDelivCache(storeId, rows);
    } else {
      rows = loadDelivCache(storeId);
    }
  } catch (e) {
    console.error('[orders] renderDeliv fetch error', e);
    rows = loadDelivCache(storeId);
  }

  tbody.innerHTML = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 10;
    td.className = 'text-center text-muted';
    td.textContent = '배달/예약 주문 없음';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((o) => {
    const tr = document.createElement('tr');
    tr.dataset.id = o.id;

    const tdId = document.createElement('td');
    tdId.textContent = o.id || '';
    tdId.className = 'text-center';

    const tdTime = document.createElement('td');
    tdTime.textContent = fmtDateTimeFromOrder(o);

    const tdType = document.createElement('td');
    tdType.textContent = o.orderType === 'reserve' ? '예약' : '배달';

    const tdName = document.createElement('td');
    tdName.textContent = o.name || '';

    const tdPhone = document.createElement('td');
    tdPhone.textContent = o.phone || '';

    const tdAddr = document.createElement('td');
    tdAddr.textContent = o.addr || '';

    const tdItems = document.createElement('td');
    tdItems.textContent =
      (o.items || [])
        .map((i) => `${i.name || i.menuId || ''} x${i.qty || 1}`)
        .join(', ') || '-';

    const tdAmt = document.createElement('td');
    tdAmt.textContent = fmt.number(o.total || 0) + '원';
    tdAmt.className = 'text-end';

    const tdStatus = document.createElement('td');
    const sel = document.createElement('select');
    sel.className = 'form-select form-select-sm order-status-select';
    sel.dataset.id = o.id || '';
    sel.dataset.type = 'delivery';

    ['접수', '준비중', '배달중', '완료', '취소'].forEach((st) => {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      if (o.status === st) opt.selected = true;
      sel.appendChild(opt);
    });

    tdStatus.appendChild(sel);

    const tdMemo = document.createElement('td');
    tdMemo.textContent = o.memo || '';

    tr.appendChild(tdId);
    tr.appendChild(tdTime);
    tr.appendChild(tdType);
    tr.appendChild(tdName);
    tr.appendChild(tdPhone);
    tr.appendChild(tdAddr);
    tr.appendChild(tdItems);
    tr.appendChild(tdAmt);
    tr.appendChild(tdStatus);
    tr.appendChild(tdMemo);

    tbody.appendChild(tr);
  });

  bindStatusSelects();
}

function bindStatusSelects() {
  $$('.order-status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const id   = sel.dataset.id;
      const type = sel.dataset.type;
      if (!id || !type) return;

      const nextStatus = sel.value;
      const storeId = adminStoreId();

      try {
        await fetch('/api/orders', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id,
            type,
            status: nextStatus,
            storeId,
          }),
        });
        updateStatusInCache(
          type === 'store' ? 'store' : 'delivery',
          storeId,
          id,
          nextStatus
        );
      } catch (e) {
        console.error('[orders] status update error', e);
        alert('상태 변경 실패');
      }
    });
  });
}

// 필터 바인딩
export function bindFilters() {
  const selKind = document.getElementById('filter-kind');
  const selStatus = document.getElementById('filter-status');

  if (selKind) {
    selKind.addEventListener('change', () => {
      const tab = selKind.value;
      if (tab === 'store') {
        renderStore();
      } else if (tab === 'deliv') {
        renderDeliv();
      }
    });
  }

  if (selStatus) {
    selStatus.addEventListener('change', () => {
      const status = selStatus.value;
      if (status === 'all') {
        renderStore();
        renderDeliv();
      } else {
        renderStore();
        renderDeliv();
      }
    });
  }
}

// 주문 내보내기
export function exportOrders() {
  const storeRows = loadStoreCache(adminStoreId());
  const delivRows = loadDelivCache(adminStoreId());

  const lines = [];

  lines.push('=== 매장 주문 ===');
  storeRows.forEach((o) => {
    lines.push(
      [
        o.id,
        fmtDateTimeFromOrder(o),
        o.tableNo || '',
        (o.items || [])
          .map((i) => `${i.name || i.menuId || ''} x${i.qty || 1}`)
          .join(', '),
        (o.total || 0),
        o.status || '',
        o.memo || '',
      ].join('\t')
    );
  });

  lines.push('');
  lines.push('=== 배달/예약 주문 ===');
  delivRows.forEach((o) => {
    lines.push(
      [
        o.id,
        fmtDateTimeFromOrder(o),
        o.orderType === 'reserve' ? '예약' : '배달',
        o.name || '',
        o.phone || '',
        o.addr || '',
        (o.items || [])
          .map((i) => `${i.name || i.menuId || ''} x${i.qty || 1}`)
          .join(', '),
        (o.total || 0),
        o.status || '',
        o.memo || '',
      ].join('\t')
    );
  });

  const blob = new Blob([lines.join('\n')], {
    type: 'text/plain;charset=utf-8',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');
  a.download = `orders_${adminStoreId()}_${ts}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 기타 글로벌 핸들러
export function attachGlobalHandlers() {
  const btnRefreshStore = document.getElementById('btn-refresh-store');
  if (btnRefreshStore) {
    btnRefreshStore.addEventListener('click', () => {
      renderStore();
    });
  }

  const btnRefreshDeliv = document.getElementById('btn-refresh-deliv');
  if (btnRefreshDeliv) {
    btnRefreshDeliv.addEventListener('click', () => {
      renderDeliv();
    });
  }
}
