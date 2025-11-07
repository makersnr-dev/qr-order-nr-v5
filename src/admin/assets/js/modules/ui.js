
export function initTabs(){
  const tabs=document.querySelectorAll('.tab');
  const panels=document.querySelectorAll('[data-panel]');
  tabs.forEach(t=>t.addEventListener('click',()=>{
    tabs.forEach(x=>x.classList.remove('active')); t.classList.add('active');
    const id=t.dataset.tab; panels.forEach(p=>p.style.display=(p.dataset.panel===id?'block':'none'));
  }));
  const first=document.querySelector('.tab'); if(first) first.click();
}
export function showModal(text){ const m=document.getElementById('order-modal'); document.getElementById('modal-body').textContent=text; m.style.display='flex';}
export function hideModal(){ document.getElementById('order-modal').style.display='none'; }
