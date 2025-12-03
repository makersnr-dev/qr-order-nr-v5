
export function fillTimeSelectors(prefix){
  const ap=document.getElementById(prefix+'-ap'); const hh=document.getElementById(prefix+'-hh'); const mm=document.getElementById(prefix+'-mm');
  ap.innerHTML=['오전/오후','오전','오후'].map(x=>`<option>${x}</option>`).join('');
  hh.innerHTML=['시',...Array.from({length:12},(_,i)=>i+1)].map(x=>`<option>${x}</option>`).join('');
  const mins=['분']; for(let i=0;i<60;i+=5) mins.push(String(i).padStart(2,'0')); mm.innerHTML=mins.map(x=>`<option>${x}</option>`).join('');
}
export function getTimeValue(prefix){ return {ap:document.getElementById(prefix+'-ap').value, hh:document.getElementById(prefix+'-hh').value, mm:document.getElementById(prefix+'-mm').value}; }
