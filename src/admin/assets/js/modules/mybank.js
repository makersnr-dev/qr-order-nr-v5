
import {get, patch} from './store.js';
export function renderMyBank(){
  const b=get(['admin','ownerBank'])||{};
  document.getElementById('mb-bank').value=b.bank||''; document.getElementById('mb-acct').value=b.number||''; document.getElementById('mb-holder').value=b.holder||'';
  document.getElementById('mb-current').textContent=(b.bank&&b.number&&b.holder)? `${b.bank} ${b.number} (${b.holder})`:'(저장된 정보 없음)';
}
export function bindMyBank(){
  document.getElementById('mb-save').onclick=()=>{
    const bank=document.getElementById('mb-bank').value.trim(); const number=document.getElementById('mb-acct').value.trim(); const holder=document.getElementById('mb-holder').value.trim();
    if(!bank||!number||!holder){ alert('은행/계좌/예금주'); return; }
    patch(['admin','ownerBank'], ()=>({bank, number, holder})); renderMyBank();
  };
  document.getElementById('mb-copy').onclick=()=>{ navigator.clipboard.writeText(document.getElementById('mb-current').textContent||''); };
}
