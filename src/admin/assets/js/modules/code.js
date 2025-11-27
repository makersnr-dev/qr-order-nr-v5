
import {get, patch} from './store.js';
let leftTimer;
function tickLeft(){
  function left(){
    const now=new Date(); const end=new Date(now); end.setHours(23,59,59,999);
    const ms=end-now; const h=String(Math.floor(ms/3600000)).padStart(2,'0'); const m=String(Math.floor(ms%3600000/60000)).padStart(2,'0');
    document.getElementById('code-left').textContent=`(자정까지 ${h}시간 ${m}분)`;
  }
  left(); leftTimer=setInterval(left,30000);
}
export function renderCode(){
  const pc = get(['admin','paymentCode']); document.getElementById('code-date').textContent=pc.date; document.getElementById('code-input').value=pc.code;
  if(leftTimer) clearInterval(leftTimer); tickLeft();
}
export function bindCode(){
  document.getElementById('code-copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('code-input').value);
  document.getElementById('code-new').onclick=()=>{ const n=String(Math.floor(1000+Math.random()*9000)); patch(['admin','paymentCode'], _=>({date:new Date().toISOString().slice(0,10), code:n})); renderCode(); };
  document.getElementById('code-reset').onclick=()=>{ patch(['admin','paymentCode'], _=>({date:new Date().toISOString().slice(0,10), code:'7111'})); renderCode(); };
}
