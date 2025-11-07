
import {get, patch} from './store.js';
function drawQRCanvas(text,size=512){
  const c=document.createElement('canvas'); c.width=size; c.height=size;
  const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,size,size);
  g.fillStyle='#000'; g.fillRect(20,20,size-40,size-40);
  g.fillStyle='#fff'; g.fillRect(40,40,size-80,size-80);
  g.fillStyle='#000'; g.font='bold 28px sans-serif'; g.textAlign='center'; g.textBaseline='middle';
  g.fillText('QR', size/2, size/2-20); g.font='16px sans-serif'; g.fillText(text.slice(0,18), size/2, size/2+20);
  return c.toDataURL('image/png');
}
export function renderQR(){
  const list = (get(['admin','qrList'])||[]);
  const grid = document.getElementById('qr-grid'); grid.innerHTML="";
  if(!list.length){ grid.innerHTML='<div class="small">저장된 QR 없음</div>'; return; }
  list.forEach((q,idx)=>{
    const box=document.createElement('div'); box.className='qrbox vstack';
    box.innerHTML=`<img src="${q.dataUrl}" alt="qr" style="width:100%;border-radius:8px">
      <div class="hstack"><div class="small">${q.label||'-'} · ${new Date(q.createdAt).toLocaleDateString()}</div><button class="btn right" data-k="${idx}">다운로드</button></div>`;
    grid.appendChild(box);
    box.querySelector('button').onclick=()=>{ const a=document.createElement('a'); a.href=q.dataUrl; a.download=(q.label||'qr')+'.png'; a.click(); };
  });
}
export function bindQR(){
  document.getElementById('qr-generate').onclick=()=>{
    const label=document.getElementById('qr-label').value.trim()||'QR';
    const dataUrl = drawQRCanvas(label);
    patch(['admin','qrList'], (arr)=>{ arr=[...(arr||[])]; arr.push({label,dataUrl,createdAt:Date.now()}); return arr; });
    document.getElementById('qr-label').value=""; renderQR();
  };
  document.getElementById('qr-clear').onclick=()=>{ if(confirm('모든 QR 삭제?')){ patch(['admin','qrList'], _=>[]); renderQR(); } };
}
