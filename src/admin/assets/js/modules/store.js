
const KEY="qrnr.store.v8";
const def=()=> ({
  admin:{
    ordersStore:[],
    ordersDelivery:[],
    qrList:[],
    menu:[{id:"A1",name:"아메리카노",price:3000,active:true},{id:"A2",name:"라떼",price:4000,active:true},{id:"B1",name:"크로와상",price:3500,active:true}],
    paymentCode:{date:new Date().toISOString().slice(0,10), code:"7111"},
    notify:{useBeep:true, beepVolume:0.7, desktop:true, webhookUrl:""},
    ownerBank:{bank:"우리", number:"1002-123-456789", holder:"홍길동"}
  }
});
export function load(){ try{return JSON.parse(localStorage.getItem(KEY))||def();}catch(_){return def();} }
export function save(d){ localStorage.setItem(KEY, JSON.stringify(d)); }
export function patch(path, updater){
  const d=load(); let ref=d;
  for(let i=0;i<path.length-1;i++){ ref = ref[path[i]]; }
  const k=path[path.length-1];
  ref[k]=updater(ref[k], d);
  save(d); return d;
}
export const get = (path)=> path.reduce((o,k)=>o&&o[k], load());
export const fmt = (n)=> Number(n||0).toLocaleString();
