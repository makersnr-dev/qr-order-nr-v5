
import {get, patch, fmt} from './store.js';
import {showModal} from './ui.js';
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
  rows.forEach((o,idx)=>{
    const items=(o.items||[]).map(i=>i.name+'x'+i.qty).join(', ');
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${o.time||'-'}</td><td>${o.table||'-'}</td><td>${items}</td><td>${fmt(o.total)}</td>
      <td><span class="badge-dot ${o.status==='완료'?'badge-done':(o.status==='조리중'?'badge-cook':'badge-wait')}"></span>
      <select data-idx="${idx}" data-type="store" class="input" style="width:100px"><option ${o.status==='대기'?'selected':''}>대기</option><option ${o.status==='조리중'?'selected':''}>조리중</option><option ${o.status==='완료'?'selected':''}>완료</option></select>
      <button class="btn small" data-detail="${idx},store">보기</button></td>`;
    tbody.appendChild(tr);
  });
}
export function renderDeliv(){
  const all=get(['admin','ordersDelivery']); const f=filters.deliv; const rows=(all||[]).filter(o=>matchOrder(o,f.from,f.to,f.status,f.search));
  const tbody=$('#tbody-deliv'); tbody.innerHTML=""; if(!rows.length){ tbody.innerHTML=EMPTY_ROW; return; }
  rows.forEach((o,idx)=>{
    const items=(o.items||[]).map(i=>i.name+'x'+i.qty).join(', ');
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${o.time||'-'}</td><td>${o.customer||'-'}</td><td>${o.phone||'-'}</td><td>${o.addr||'-'}</td><td>${o.reserve||'-'}</td><td>${fmt(o.total)}</td>
      <td><span class="badge-dot ${o.status==='완료'?'badge-done':(o.status==='조리중'?'badge-cook':'badge-wait')}"></span>
      <select data-idx="${idx}" data-type="deliv" class="input" style="width:100px"><option ${o.status==='대기'?'selected':''}>대기</option><option ${o.status==='조리중'?'selected':''}>조리중</option><option ${o.status==='완료'?'selected':''}>완료</option></select>
      <button class="btn small" data-detail="${idx},deliv">보기</button></td><td>${items}</td>`;
    tbody.appendChild(tr);
  });
}
export function attachGlobalHandlers(){
  document.body.addEventListener('click',e=>{
    if(e.target && e.target.id==='modal-close') document.getElementById('order-modal').style.display='none';
    if(e.target && e.target.id==='order-modal') document.getElementById('order-modal').style.display='none';
    if(e.target && e.target.dataset && e.target.dataset.detail){
      const [i,t]=e.target.dataset.detail.split(','); const arr=get(['admin', t==='store'?'ordersStore':'ordersDelivery']); const o=arr[Number(i)]||{};
      showModal(JSON.stringify(o,null,2));
    }
  });
  document.body.addEventListener('change',e=>{
    if(e.target && e.target.tagName==='SELECT' && e.target.dataset.idx!==undefined){
      const idx=Number(e.target.dataset.idx); const t=e.target.dataset.type;
      const key=t==='store'?'ordersStore':'ordersDelivery';
      const arr=get(['admin',key])||[]; if(!arr[idx]) return;
      arr[idx]={...arr[idx], status:e.target.value}; // local update
      import('./store.js').then(m=>m.save({admin:{...get(['admin']), [key]:arr}})); // ensure save
      t==='store'?renderStore():renderDeliv();
    }
  });
}
