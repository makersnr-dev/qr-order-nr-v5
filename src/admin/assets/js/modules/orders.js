
import {get, patch, fmt} from './store.js';
import {showModal} from './ui.js';

export async function syncStoreFromServer() {
  try {
    const res = await fetch('/api/orders?type=store', { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) return;

    const rows = (data.orders || []).map(o => {
      const d = o.ts ? new Date(o.ts) : new Date();

      // 표시용 시간 문자열: MM/DD HH:MM
      const time =
        String(d.getMonth() + 1).padStart(2, '0') + '/' +
        String(d.getDate()).padStart(2, '0') + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0');

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
        time,                         // 주문시간
        table: o.table || '-',        // 테이블
        items,                        // 내역
        total: o.amount || 0,         // 금액
        status: o.status || 'paid'    // 상태
      };
    });

    // admin.ordersStore 에 덮어쓰기
    patch(['admin', 'ordersStore'], () => rows);
  } catch (e) {
    console.error('syncStoreFromServer error', e);
  }
}


const $=(s,r=document)=>r.querySelector(s);
const EMPTY_ROW = '<tr><td colspan="8" class="small">주문 없음</td></tr>';
const filters = { store:{from:'',to:'',status:'',search:''}, deliv:{from:'',to:'',status:'',search:''} };
function matchOrder(o, from, to, status, search){
  const t = o.time? new Date(o.time) : null;
  if(from && (!t || t < new Date(from))) return false;
  if(to && (!t || t > new Date(to))) return false;
  if(status && o.status!==status) return false;
  const s = (search||'').toLowerCase();
  const fields = [o.table,o.customer,o.phone,o.addr,o.reserve,(o.items||[]).map(i=>i.name).join(' ')].join(' ').toLowerCase();
  if(s && !fields.includes(s)) return false;
  return true;
}
export function bindFilters(){
  function bind(prefix,key){
    const f = filters[key];
    $('#'+prefix+'-filter').onclick=()=>{
      f.from=$('#'+prefix+'-from').value; f.to=$('#'+prefix+'-to').value; f.status=$('#'+prefix+'-status').value; f.search=$('#'+prefix+'-search').value;
      key==='store'?renderStore():renderDeliv();
    };
    $('#'+prefix+'-reset').onclick=()=>{
      f.from=f.to=f.status=f.search=''; ['from','to','status','search'].forEach(x=>$('#'+prefix+'-'+x).value=''); key==='store'?renderStore():renderDeliv();
    };
  } bind('store','store'); bind('deliv','deliv');
}
export function exportOrders(type){
  const rows = get(['admin', type]); if(!rows || !rows.length){ alert('데이터가 없습니다.'); return; }
  const cols = type==='ordersStore'? ['시간','테이블','내역','금액','상태'] : ['시간','주문자','연락처','주소','예약','금액','상태','내역'];
  const data=[cols];
  rows.forEach(o=>{
    if(type==='ordersStore') data.push([o.time||'',o.table||'',(o.items||[]).map(i=>i.name+'x'+i.qty).join('; '),o.total||'',o.status||'']);
    else data.push([o.time||'',o.customer||'',o.phone||'',o.addr||'',o.reserve||'',o.total||'',o.status||'',(o.items||[]).map(i=>i.name+'x'+i.qty).join('; ')]);
  });
  const csv=data.map(r=>r.map(v=>('"'+String(v).replaceAll('"','""')+'"')).join(",")).join("\n");
  const blob=new Blob([csv],{type:"application/vnd.ms-excel;charset=utf-8"});
  const a=document.createElement('a'); const today=new Date().toISOString().slice(0,10);
  a.href=URL.createObjectURL(blob); a.download=(type==='ordersStore'?`store_${today}.xlsx`:`delivery_${today}.xlsx`); a.click(); URL.revokeObjectURL(a.href);
}
export async function renderStore() {
  const tbody = $('#tbody-store');
  if (!tbody) return;

  try {
    const storeId = window.qrnrStoreId || 'store1';
const res = await fetch(`/api/orders?type=store&storeId=${encodeURIComponent(storeId)}`, {
  cache: 'no-store'
});
    const data = await res.json().catch(() => ({ orders: [] }));
    const rows = (data.orders || []).sort((a, b) => (b.ts || 0) - (a.ts || 0));

    tbody.innerHTML = '';

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="small">매장 주문이 없습니다.</td>
        </tr>`;
      return;
    }

    rows.forEach(o => {
      const d = o.ts ? new Date(o.ts) : null;
      const time = d
        ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        : '-';

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
  } catch (e) {
    console.error('renderStore err', e);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="small">매장 주문을 불러오지 못했습니다.</td>
      </tr>`;
  }
}

export async function renderDeliv() {
  const tbody = $('#tbody-deliv');
  if (!tbody) return;

  try {
    const storeId = window.qrnrStoreId || 'store1';
    // 1) 배달 주문
   const r1 = await fetch(`/api/orders?type=delivery&storeId=${encodeURIComponent(storeId)}`, {
  cache: 'no-store'
});
    const d1 = await r1.json().catch(() => ({ orders: [] }));

    // 2) 예약 주문
    const r2 = await fetch(`/api/orders?type=reserve&storeId=${encodeURIComponent(storeId)}`, {
  cache: 'no-store'
});
    const d2 = await r2.json().catch(() => ({ orders: [] }));

    // 합치고 최신순 정렬
    const rows = [...(d1.orders || []), ...(d2.orders || [])]
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));

    tbody.innerHTML = '';

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="small">배달/예약 주문이 없습니다.</td>
        </tr>`;
      return;
    }

    rows.forEach((o, idx) => {
      const ts = o.ts || o.time; // ts 없으면 time fallback
      const d = ts ? new Date(ts) : null;
      const time = d
        ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        : '-';

      // 주문자 / 연락처
      const customer = o.customer || {};
      const name = customer.name || o.name || '-';
      const phone = customer.phone || o.phone || '-';

      // 주소 (payload에서 customer.addr 로 보냈던 값)
      const addr =
        customer.addr ||
        customer.address ||
        o.addr ||
        '-';

      // 예약일자 / 예약시간
      // delivery.html 에서 reserveDate, time(예약시간) 넣어줬다고 가정
      const reserveDate = o.reserveDate || (o.meta && o.meta.reserveDate) || '-';
      const reserveTime =
  o.reserveTime ||        // ✅ 우리가 저장한 필드
  o.time ||               // 혹시 과거 데이터에서 time에 넣은 경우
  (o.meta && o.meta.reserveTime) ||
  '-';

      // 요청사항
      const req =
        customer.req ||
        o.memo ||
        (o.meta && o.meta.req) ||
        '-';

      // 구매내역
      const items = (o.cart || []).map(i => `${i.name}x${i.qty}`).join(', ');

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
  } catch (e) {
    console.error('renderDeliv err', e);
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="small">배달/예약 주문을 불러오지 못했습니다.</td>
      </tr>`;
  }
}

export function attachGlobalHandlers() {
  // 상태 변경
  document.body.addEventListener('change', async (e) => {
    const sel = e.target;
    if (!sel || sel.tagName !== 'SELECT') return;

    const id = sel.dataset.id;
    const type = sel.dataset.type; // "store" | "delivery"
    if (!id || !type) return;

    const nextStatus = sel.value;

    try {
      await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus })
      });

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
  });
}

