// /src/admin/assets/js/modules/orders.js
import { get, patch, fmt } from './store.js';
//import { showModal } from './ui.js';
const isMobile = () => window.innerWidth <= 768;
// ✅ 상태 흐름 기준표 (UI용)
const STATUS_FLOW = {
  store: {
    주문접수: ['준비중', '주문취소'],
    준비중: ['주문완료', '주문취소','결제취소'],
    주문완료: ['주문취소','결제취소'],
    주문취소: [],
    결제취소: []
  },

  delivery: {
    '입금 미확인': ['주문접수', '주문취소'],
    주문접수: ['준비중', '주문취소'],
    준비중: ['주문완료', '주문취소'],
    주문완료: [],
    주문취소: []
  }
};
const UI_TEXT = {
  ORDER_CANCEL: '주문취소',
  PAYMENT_CANCEL: '결제취소',
  POS_PAID: 'POS 결제 확인',
  PAID_DONE: '결제 완료',
  CANCEL_REASON_REQUIRED: '취소 사유를 입력하세요.'
};


async function changeOrderStatus({ id, status, type }) {
  if (!id || !status) return;
  
   // 🚨 안전 가드: 취소/상태 변경만 허용
  if (!['주문접수','준비중','주문완료','주문취소','결제취소'].includes(status)) {
    console.warn('[BLOCKED] invalid status change attempt:', status);
    return;
  }

  const storeId = window.qrnrStoreId || 'store1';

  const res = await fetch('/api/orders', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, status })
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'STATUS_CHANGE_FAILED');
  }

  updateStatusInCache(type, storeId, id, status);

  if (type === 'store') await renderStore();
  if (type === 'delivery') await renderDeliv();
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

// 주문자 이름 말줄임 (한글 5글자 기준)
function truncateName(name, maxLen = 5) {
  if (!name) return '-';
  return name.length > maxLen ? name.slice(0, maxLen) + '…' : name;
}

// 요청사항 글자 수 제한 (목록용)
function truncateText(text, maxLen = 20) {
  if (!text) return '-';
  const str = String(text);
  return str.length > maxLen
    ? str.slice(0, maxLen) + '…'
    : str;
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


/*function renderStoreMobile() {
  const wrap = document.getElementById('mobile-store-list');
  if (!wrap) return;

  const storeId = window.qrnrStoreId || 'store1';
  const rows = loadStoreCache(storeId);

  wrap.innerHTML = '';

  rows.forEach(o => {
    const div = document.createElement('div');
    div.className = 'order-card';

    // ✅ 1. 현재 상태
    const current = o.status || '주문접수';

    // ✅ 2. 다음 가능 상태 목록
    const nextList = STATUS_FLOW.store[current] || [];

    // ✅ 3. 버튼 HTML 생성
    const buttons = nextList.length
      ?nextList.map(s => {
        if (s === '결제취소' || s === '주문취소') {
          return `
            <button
              data-action="${s === '결제취소' ? 'cancel-payment' : 'cancel-order'}"
              data-id="${o.id}">
              ${s}
            </button>
          `;
        }
        return `<button data-id="${o.id}" data-status="${s}">${s}</button>`;
      }).join('')

      : `<span class="small">상태 변경 불가</span>`;

    // ✅ 4. HTML에 결과만 삽입
    div.innerHTML = `
      <div class="order-card-header">
        <strong>${fmtDateTimeFromOrder(o)}</strong>
        <span>${fmt(o.amount)}원</span>
      </div>

      <div class="small">
        테이블 ${o.table || '-'}
      </div>

      <div class="order-items">
        ${(o.cart || []).map(i => i.name).join(', ')}
      </div>

      <div class="order-actions">
        ${buttons}
      </div>
    `;

    wrap.appendChild(div);
  });
}*/



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
      <td data-label="주문시간">${time}</td>
    
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

    <!-- 현재 상태 표시 -->
    <div class="order-status-line">
      <span class="badge-dot ${
        status === '주문완료'
          ? 'badge-done'
          : status === '준비중'
          ? 'badge-cook'
          : 'badge-wait'
      }"></span>
      <strong>${status}</strong>
    </div>

    <!-- 상태 변경 -->
    <div class="order-select-line">
      ${(() => {
        const current = status;
        const nextList = STATUS_FLOW.store[current] || [];

        if (!nextList.length) return '';

        const options = [
          `<option selected disabled>상태 변경</option>`,
          ...nextList.map(s => `<option>${s}</option>`)
        ].join('');

        return `
          <select
            class="input"
            data-type="store"
            data-id="${o.id || o.orderId || ''}"
          >
            ${options}
          </select>
        `;
      })()}
    </div>

    <!-- POS 결제 확인 -->
    ${status === '주문접수' && !o.meta?.payment?.paid ? `
      <div class="order-action-line">
        <button
          class="btn primary"
          data-action="confirm-pos-paid"
          data-id="${o.id || o.orderId || ''}">
          POS 결제 확인
        </button>
      </div>
    ` : ''}

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
    status: o.status || '대기'
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
    const name = truncateName(customer.name || o.name || '-');
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
    o.reserve?.date || '-';
  
    const reserveTime =
      o.reserve?.time || '-';
    
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
      <td data-label="예약일">${reserveDate}</td>
      <td data-label="예약시간">${reserveTime}</td>
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
    
      <td data-label="상태">
        <div style="display:flex;align-items:center;gap:6px;justify-content:flex-start">
          
          <span class="badge-dot ${
            status === '주문완료'
              ? 'badge-done'
              : status === '준비중'
              ? 'badge-cook'
              : 'badge-wait'
          }"></span>
    
          ${(() => {
            const current = status;
            const nextList = STATUS_FLOW.delivery[current] || [];
          
            const options = [
              `<option selected>${current}</option>`,
              ...nextList.map(s => `<option>${s}</option>`)
            ].join('');
          
            return `
              <select
                class="input"
                style="width:90px"
                data-type="delivery"
                data-id="${o.id || o.orderId || ''}"
              >
                ${options}
              </select>
            `;
          })()}
    
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

  // 1️⃣ 결제 완료 버튼 클릭 → 확인 모달 열기
/*document.body.addEventListener('click', (e) => {
  const btn = e.target;
  if (!btn || btn.dataset.action !== 'mark-paid') return;

  const modal = document.getElementById('pay-confirm-modal');
  if (!modal) {
    console.error('pay-confirm-modal not found');
    return;
  }

  // 어떤 주문인지 기억 (확인 버튼에서 사용)
  modal.dataset.orderId = btn.dataset.id;

  modal.style.display = 'flex';
});
*/


  // 2️⃣ 상태 변경
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
    modal.style.display = 'flex';

    // select 값 원래대로 되돌리기 (확정은 모달에서)
    sel.value = sel.options[0].value;
    return;
  }

  // 🟢 일반 상태 변경만 즉시 처리
  try {
    await changeOrderStatus({ id, status: nextStatus, type });
  } catch (err) {
    alert('상태 변경 실패');
    console.error(err);
  }
});




  // 3️⃣ 상세보기 (아직 비워둠 – 구조만 유지)
  /*document.body.addEventListener('click', (e) => {
    const btn = e.target;
    if (!btn?.dataset?.detail) return;

    // 👉 나중에 showModal로 상세 주문 표시
  });*/

    // 4️⃣ 결제 완료 모달 - 확인 / 취소 버튼 처리
 /* document.body.addEventListener('click', async (e) => {

    // ❌ 취소 버튼
    if (e.target.id === 'pay-cancel') {
      const modal = document.getElementById('pay-confirm-modal');
      if (modal) modal.style.display = 'none';
      return;
    }

    // ✅ 확인 버튼
    if (e.target.id === 'pay-confirm') {
      const modal = document.getElementById('pay-confirm-modal');
      if (!modal) return;

      const id = modal.dataset.orderId;
      if (!id) {
        alert('주문 정보를 찾을 수 없습니다.');
        modal.style.display = 'none';
        return;
      }

      const storeId = window.qrnrStoreId || 'store1';

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
            }
          })
        });

        
        modal.style.display = 'none';
        //await renderStore(); // 버튼만 사라짐

      } catch (err) {
        console.error(err);
        alert('결제 완료 처리 실패');
      }
    }
  });*/

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
    ? `취소 사유: ${order.meta.cancel.reason}`
    : '';

const header = [
  `테이블: ${order.table || '-'}`,
  `주문시간: ${fmtDateTimeFromOrder(order)}`,
  `금액: ${fmt(order.amount || 0)}원`,
  cancelReason
].filter(Boolean).join('\n');


const body = (order.cart || []).map(i => {
  let line = `${i.name} x${i.qty}`;
  if (Array.isArray(i.options) && i.options.length) {
    const opts = normalizeOptions(i.options);
    if (opts.length) {
      line += '\n' + opts.map(opt => ` └ ${opt}`).join('\n');
    }
    

  }
  return line;
}).join('\n\n');

document.getElementById('order-detail-body').textContent =
  header + '\n\n' + body;

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

  const header = [
    `주문시간: ${fmtDateTimeFromOrder(order)}`,
    `주문자: ${customer.name || '-'}`,
    `연락처: ${customer.phone || '-'}`,
    `주소: ${customer.addr || '-'}`,
    `예약일시: ${(order.reserve?.date || '-') + ' ' + (order.reserve?.time || '')}`,
    `요청사항: ${customer.memo || '-'}`,
    `금액: ${fmt(order.amount || 0)}원`
  ].join('\n');


  const body = (order.cart || []).map(i => {
    let line = `${i.name} x${i.qty}`;
    if (Array.isArray(i.options) && i.options.length) {
      const opts = normalizeOptions(i.options);
      if (opts.length) {
        line += '\n' + opts.map(opt => ` └ ${opt}`).join('\n');
      }
    }
    return line;
  }).join('\n\n');

  document.getElementById('order-detail-body').textContent =
    header + '\n\n' + body;

  document.getElementById('order-detail-modal').style.display = 'flex';
});


  // 🟢 POS 결제 확인 버튼
document.body.addEventListener('click', async (e) => {
  if (e.target.dataset.action !== 'confirm-pos-paid') return;

  const id = e.target.dataset.id;
  if (!id) return;

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
        }
      })
    });

    await renderStore(); // 버튼만 사라짐

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
  const order = orders.find(o => (o.id || o.orderId) === id);

  if (
    !order ||
    !order.meta?.payment?.paid ||
    !['준비중', '주문완료'].includes(order.status)
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
  ?.addEventListener('click', () => {
    document.getElementById('cancel-reason-modal').style.display = 'none';
  });


document.getElementById('cancel-reason-confirm')
  ?.addEventListener('click', async () => {

  const modal = document.getElementById('cancel-reason-modal');
  const id = modal.dataset.orderId;
  const status = modal.dataset.cancelStatus;
  const reason = document.getElementById('cancel-reason-input').value.trim();

  if (!reason) {
    alert(UI_TEXT.CANCEL_REASON_REQUIRED);
    return;
  }

  try {
    await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          status,
          meta: {
            cancel: {
              reason,
              at: new Date().toISOString()
            }
          }
        })
      });
      
      updateStatusInCache('store', window.qrnrStoreId || 'store1', id, status);

    document.getElementById('cancel-reason-input').value = '';
    modal.style.display = 'none';

    await renderStore();

  } catch (err) {
    console.error(err);
    alert('취소 처리 실패');
  }
});

