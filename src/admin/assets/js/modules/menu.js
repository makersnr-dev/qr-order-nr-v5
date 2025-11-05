
import {get, patch} from './store.js';
export function renderMenu(){
  const menu=get(['admin','menu'])||[]; const body=document.getElementById('m-body'); body.innerHTML="";
  menu.forEach((m,idx)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${m.id}</td><td><input class="input" value="${m.name}" data-k="name"></td>
      <td style="width:160px"><input class="input" type="number" value="${m.price}" data-k="price"></td>
      <td style="width:90px"><input type="checkbox" ${m.active?'checked':''} data-k="active"></td>
      <td class="right"><button class="btn" data-act="save">저장</button> <button class="btn" data-act="del">삭제</button></td>`;
    body.appendChild(tr);
    tr.querySelector('[data-act="save"]').onclick=()=>{
      const name=tr.querySelector('[data-k="name"]').value.trim();
      const price=Number(tr.querySelector('[data-k="price"]').value||0);
      const active=tr.querySelector('[data-k="active"]').checked;
      const arr=[...menu]; arr[idx]={...arr[idx], name, price, active}; patch(['admin','menu'], _=>arr); renderMenu();
    };
    tr.querySelector('[data-act="del"]').onclick=()=>{
      if(confirm('삭제할까요?')){ const arr=[...menu]; arr.splice(idx,1); patch(['admin','menu'], _=>arr); renderMenu(); }
    };
  });
}
export function bindMenu(){
  document.getElementById('m-add').onclick=()=>{
    const id=document.getElementById('m-id').value.trim();
    const name=document.getElementById('m-name').value.trim();
    const price=Number(document.getElementById('m-price').value||0);
    if(!id||!name){ alert('id/이름'); return; }
    const arr=get(['admin','menu'])||[]; const k=arr.findIndex(x=>x.id===id);
    if(k>=0) arr[k]={...arr[k], name, price, active:true}; else arr.push({id,name,price,active:true});
    patch(['admin','menu'], _=>arr); ['m-id','m-name','m-price'].forEach(i=>document.getElementById(i).value=''); renderMenu();
  };
}
