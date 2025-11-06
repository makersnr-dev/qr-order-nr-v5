
import {get, patch, fmt} from './cust-store.js';
export function loadMenu(){
  const menu = (get(['admin','menu']) || []).filter(m=>m.active!==false);
  return menu.length?menu:[{id:'A1',name:'아메리카노',price:3000,active:true},{id:'A2',name:'라떼',price:4000,active:true},{id:'B1',name:'크로와상',price:3500,active:true}];
}
export function renderMenu(gridId, cart){
  const list=loadMenu(); const g=document.getElementById(gridId); g.innerHTML="";
  list.forEach(item=>{
    const btn=document.createElement('button');
    btn.className='btn'; btn.style.cssText='width:180px;height:110px;border-radius:14px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;background:#0b1620;border:1px solid #263241';
    btn.innerHTML=`<div style="font-weight:600">${item.name}</div><div class="small">${fmt(item.price)}원</div>`;
    btn.onclick=()=>{ const k=cart.items.findIndex(x=>x.id===item.id); if(k>=0) cart.items[k].qty+=1; else cart.items.push({id:item.id,name:item.name,price:item.price,qty:1}); cart.render(); };
    g.appendChild(btn);
  });
}
export function makeCart(containerId, totalId){
  const cart={items:[], total(){return this.items.reduce((s,it)=>s+it.price*it.qty,0);}, render(){
    const box=document.getElementById(containerId); box.innerHTML="";
    if(!this.items.length){ box.innerHTML='<div class="small">담긴 항목이 없습니다. 메뉴를 눌러 추가해주세요.</div>'; }
    this.items.forEach((it,idx)=>{
      const row=document.createElement('div'); row.className='hstack'; row.style.gap='8px'; row.style.justifyContent='space-between'; row.style.padding='6px 0';
      row.innerHTML=`<div>${it.name} x ${it.qty}</div><div>${fmt(it.price*it.qty)}원</div><div class="hstack" style="gap:6px"><button class="btn" data-a="minus">-</button><button class="btn" data-a="plus">+</button><button class="btn" data-a="del">삭제</button></div>`;
      row.querySelector('[data-a="minus"]').onclick=()=>{ if(it.qty>1) it.qty--; else this.items.splice(idx,1); this.render(); };
      row.querySelector('[data-a="plus"]').onclick=()=>{ it.qty++; this.render(); };
      row.querySelector('[data-a="del"]').onclick=()=>{ this.items.splice(idx,1); this.render(); };
      box.appendChild(row);
    });
    document.getElementById(totalId).textContent = fmt(this.total());
  }}; return cart;
}
