// admin QR tab logic
(function(){
  const KEY = "qrnr.qrSaved";
  function loadSaved(){ try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch(e){ return []; } }
  function saveAll(list){ localStorage.setItem(KEY, JSON.stringify(list)); }
  function baseUrl(){ return location.origin.replace(/\/$/,'') + "/order/store"; }
  function makeUrl(t){ return baseUrl() + "?table=" + encodeURIComponent(t); }

  function ensureQRLib(){
    if (window.QRCode) return Promise.resolve();
    return new Promise((resolve, reject)=>{
      const s=document.createElement("script");
      s.src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js";
      s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
    });
  }
  async function drawQR(canvas, text){
    await ensureQRLib();
    return new Promise((res, rej)=>{
      QRCode.toCanvas(canvas, text, { width: 240, margin: 1 }, (err)=> err?rej(err):res());
    });
  }
  async function render(){
    const grid=document.getElementById("qr-grid"); if(!grid) return;
    const list=loadSaved().sort((a,b)=>a.table-b.table);
    grid.innerHTML="";
    for(const item of list){
      const card=document.createElement("div");
      card.style="background:#0f1117;border:1px solid #1f2430;border-radius:14px;padding:12px";
      card.innerHTML=`
        <div style="background:#fff;border-radius:12px;display:flex;align-items:center;justify-content:center;aspect-ratio:1/1">
          <canvas width="240" height="240"></canvas>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#c2c9d6;margin-top:8px">
          <span>테이블 ${item.table}</span>
          <span>${new Date(item.createdAt).toLocaleDateString()}</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-dl">다운받기</button>
          <button class="btn-del">삭제하기</button>
        </div>`;
      grid.appendChild(card);
      const cv=card.querySelector("canvas");
      await drawQR(cv, item.url);
      card.querySelector(".btn-dl").onclick=()=>{
        const a=document.createElement("a"); a.href=cv.toDataURL("image/png"); a.download=`table-${item.table}.png`; a.click();
      };
      card.querySelector(".btn-del").onclick=()=>{
        const after=loadSaved().filter(x=>x.table!==item.table); saveAll(after); render();
      };
    }
  }
  function addOne(v){
    const n=parseInt(v,10); if(!n || n<1){ alert("테이블 번호를 올바르게 입력하세요."); return; }
    const list=loadSaved(); const idx=list.findIndex(x=>x.table===n);
    const item={table:n, url:makeUrl(n), createdAt:Date.now()};
    if(idx>=0) list[idx]=item; else list.push(item);
    saveAll(list); render();
  }
  window.addEventListener("load", ()=>{
    const btn=document.getElementById("qr-generate-btn");
    const inp=document.getElementById("qr-table-input");
    if(btn) btn.addEventListener("click", ()=>{ addOne(inp && inp.value); if(inp) inp.value=""; });
    if(inp) inp.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ addOne(inp.value); inp.value=""; } });
    render();
  });
})();