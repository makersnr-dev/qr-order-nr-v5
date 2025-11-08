
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
export function renderStore(){
  const all=get(['admin','ordersStore']); const f=filters.store; const rows=(all||[]).filter(o=>matchOrder(o,f.from,f.to,f.status,f.search));
  const tbody=$('#tbody-store'); tbody.innerHTML=""; if(!rows.length){ tbody.innerHTML=EMPTY_ROW.replace('8','5'); return; }
  rows.forEach((o)=>{
    const items=(o.items||[]).map(i=>i.name+'x'+i.qty).join(', ');
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${o.time||'-'}</td><td>${o.table||'-'}</td><td>${items}</td><td>${fmt(o.total)}</td>
      <td><span class="badge-dot ${o.status==='완료'?'badge-done':(o.status==='조리중'?'badge-cook':'badge-wait')}"></span>
      <select data-id="${o.id}" data-type="store" class="input" style="width:100px"><option ${o.status==='대기'?'selected':''}>대기</option><option ${o.status==='조리중'?'selected':''}>조리중</option><option ${o.status==='완료'?'selected':''}>완료</option></select>
      <button class="btn small" data-detail="${o.id},store">보기</button></td>`;
    tbody.appendChild(tr);
  });
}

export function renderDeliv(){
  const all = get(['admin','ordersDelivery']);
  const f = filters.deliv;
  const rows = (all||[]).filter(o=>matchOrder(o, f.from, f.to, f.status, f.search));
  const tbody = $('#tbody-deliv');
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = EMPTY_ROW;
    return;
  }

  rows.forEach((o) => {
    const items = (o.items || []).map(i => i.name + 'x' + i.qty).join(', ');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${o.time || '-'}</td>
      <td>${o.name || '-'}</td>
      <td>${o.addr || '-'}</td>
      <td>${items}</td>
      <td>${fmt(o.total)}</td>
      <td>
        <span class="badge-dot ${
          o.status === '완료'
            ? 'badge-done'
            : (o.status === '조리중'
              ? 'badge-cook'
              : 'badge-wait')
        }"></span>
        <select
          data-id="${o.id}"
          data-type="deliv"
          class="input"
          style="width:100px"
        >
          <option ${o.status === '대기' ? 'selected' : ''}>대기</option>
          <option ${o.status === '조리중' ? 'selected' : ''}>조리중</option>
          <option ${o.status === '완료' ? 'selected' : ''}>완료</option>
        </select>
        <button class="btn small" data-detail="${o.id},deliv">보기</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

export function attachGlobalHandlers() {
  // ── 주문 상세 모달 / 닫기 ─────────────────────
  document.body.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;

    // 모달 닫기 (X 버튼 또는 배경 클릭)
    if (target.id === 'modal-close' || target.id === 'order-modal') {
      const modal = document.getElementById('order-modal');
      if (modal) modal.style.display = 'none';
      return;
    }

    // "보기" 버튼: data-detail="주문ID,store" 또는 "주문ID,deliv"
    const detailBtn = target.closest('[data-detail]');
    if (!detailBtn) return;

    const [id, type] = (detailBtn.dataset.detail || '').split(',');
    const key = type === 'store' ? 'ordersStore' : 'ordersDelivery';
    const list = get(['admin', key]) || [];
    const order = list.find(o => String(o.id) === String(id)) || {};

    showModal(JSON.stringify(order, null, 2));
  });

  // ── 상태 드롭다운 변경 ────────────────────────
  document.body.addEventListener('change', async (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'SELECT') return;

    const id = target.dataset.id;
    const type = target.dataset.type; // 'store' or 'deliv'
    if (!id || !type) return;

    const key = type === 'store' ? 'ordersStore' : 'ordersDelivery';
    const list = get(['admin', key]) || [];
    const idx = list.findIndex(o => String(o.id) === String(id));
    if (idx === -1) return;

    const uiStatus = target.value; // '대기' | '조리중' | '완료'

    // 1) 로컬(admin 스토어) 상태 업데이트 - 항상 UI용 한글 상태로 저장
    const updated = [...list];
    updated[idx] = { ...updated[idx], status: uiStatus }
const adminState = get(['admin']) || {};
    adminState[key] = updated;

    try {
      const m = await import('./store.js');
      if (typeof m.save === 'function') {
        m.save({ admin: adminState });
      }
    } catch (err) {
      console.error('save admin orders failed', err);
    }

    // 화면 다시 렌더링
    if (type === 'store') {
      renderStore();
    } else {
      renderDeliv();
    }

    // (필요하면 여기서 /api/orders PUT으로 서버 상태도 동기화)
  });
}
