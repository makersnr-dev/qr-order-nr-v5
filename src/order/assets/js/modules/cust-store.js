
const KEY="qrnr.store.v8";
export const get = (path)=> path.reduce((o,k)=>o&&o[k], load());
export function load(){ try{return JSON.parse(localStorage.getItem(KEY))||{};}catch(_){return {};} }
export function save(d){ localStorage.setItem(KEY, JSON.stringify(d)); }
export function patch(path, updater){
  const d=load(); let ref=d;
  for(let i=0;i<path.length-1;i++){ ref = ref[path[i]] = ref[path[i]] ?? {}; }
  const k=path[path.length-1];
  ref[k]=updater(ref[k], d);
  save(d); return d;
}
export const fmt = (n)=> Number(n||0).toLocaleString();
