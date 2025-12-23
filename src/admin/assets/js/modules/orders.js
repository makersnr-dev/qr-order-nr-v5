// /src/admin/assets/js/modules/orders.js
import { get, patch, fmt } from './store.js';
import { showModal } from './ui.js';

/* ─────────────────────────────
 * 공통: 주문 시간 포맷
 * ───────────────────────────── */
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

/* ─────────────────────────────
 * 로컬 캐시
 * ───────────────────────────── */
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

/* ─────────────────────────────
 * 매장 주문 렌더링
 * ───────────────────────────── */
export async function renderStore() {
  const tbody = document.querySelector('#tbody-store');
  if (!tbody) return;

  const storeId = window.qrnrStoreId || 'store1';
  let rows = [];

  try {
    const res = await fetch(`/api/orders?type=store&storeId=${storeId}`, { cache:'no-store' });
    const data = await res.json();
    if (data.orders?.length) {
      rows = data.orders;
      saveStoreCache(storeId, rows);
    } else {
      rows = loadStoreCache(storeId);
    }
  } catch {
    rows = loadStoreCache(storeId);
  }

  rows = rows.sort((a,b)=>(b.ts||0)-(a.ts||0));
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="small">매장 주문이 없습니다.</td></tr>`;
    return;
  }

  rows.forEach(o => {
    const time   = fmtDateTimeFromOrder(o);
    const items  = (o.cart || []).map(i => `${i.name}x${i.qty}`).join(', ');
    const table  = o.table || '-';
    const amount = Number(o.amount || 0);
    const status = o.status || 'WAIT_PAY';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${time}</td>
      <td>${table}</td>
      <td>${items || '-'}</td>
      <td>${fmt(amount)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="badge-dot ${
            status === 'PAID'
              ? 'badge-done'
              : status === '조리중'
              ? 'badge-cook'
              : 'badge-wait'
          }"></span>

          ${
            status === 'WAIT_PAY'
              ? `<button
                   class="btn small primary"
                   data-action="mark-paid"
                   data-id="${o.id || o.orderId}">
                   결제 완료
                 </button>`
              : ''
          }

          <select
            class="input"
            style="width:100px"
            data-type="store"
            data-id="${o.id || o.orderId}">
            <option ${status==='대기'?'selected':''}>대기</option>
            <option ${status==='조리중'?'selected':''}>조리중</option>
            <option ${status==='완료'?'selected':''}>완료</option>
          </select>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ─────────────────────────────
 * 상태 변경 + 결제 완료 버튼 핸들러
 * ───────────────────────────── */
export function attachGlobalHandlers() {

  /* 상태 select 변경 */
  document.body.addEventListener('change', async (e) => {
    const sel = e.target;
    if (sel.tagName !== 'SELECT') return;

    const id   = sel.dataset.id;
    const type = sel.dataset.type;
    if (!id || !type) return;

    const nextStatus = sel.value;
    const storeId = window.qrnrStoreId || 'store1';

    await fetch('/api/orders', {
      method:'PUT',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ id, status: nextStatus })
    });

    updateStatusInCache(type, storeId, id, nextStatus);
    await renderStore();
  });

  /* 결제 완료 버튼 */
  document.body.addEventListener('click', async (e) => {
    const btn = e.target;
    if (btn.dataset.action !== 'mark-paid') return;

    const id = btn.dataset.id;
    const storeId = window.qrnrStoreId || 'store1';

    showModal('결제 완료 처리하시겠습니까?');

    document.body.addEventListener('click', async function once(ev){
      if (!ev.target.matches('[data-modal-ok]')) return;
      document.body.removeEventListener('click', once);

      await fetch('/api/orders', {
        method:'PUT',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({ id, status:'PAID', paidAt:Date.now() })
      });

      updateStatusInCache('store', storeId, id, 'PAID');
      await renderStore();
    }, { once:true });
  });
}
