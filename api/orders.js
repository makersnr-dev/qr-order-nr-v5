
// api/orders.js - ephemeral JSON store in /tmp (testing only)
import fs from 'fs';
import path from 'path';

const FILE = '/tmp/qrnr_orders.json';

function readAll(){
  try{
    const s = fs.readFileSync(FILE,'utf8');
    return JSON.parse(s);
  }catch(e){
    return { orders: [] };
  }
}
function writeAll(db){
  try{
    fs.writeFileSync(FILE, JSON.stringify(db));
    return true;
  }catch(e){
    return false;
  }
}
function json(res, code, body){
  res.status(code).setHeader('content-type','application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res){
  const url = new URL(req.url, 'http://x');
  const db = readAll();

  if(req.method==='GET'){
    const type = url.searchParams.get('type'); // store|delivery|reserve
    const from = url.searchParams.get('from'); // iso
    const to   = url.searchParams.get('to');   // iso
    let data = db.orders;
    if(type) data = data.filter(o=>o.type===type);
    if(from){ const t = Date.parse(from); data = data.filter(o=>o.ts>=t); }
    if(to){ const t = Date.parse(to); data = data.filter(o=>o.ts<=t); }
    data = data.sort((a,b)=>b.ts-a.ts);
    return json(res, 200, { ok:true, orders: data });
  }

  if(req.method==='POST'){
    let body='';
    await new Promise(r=>req.on('data',c=>body+=c).on('end',r));
    let p={};
    try{ p=JSON.parse(body||'{}'); }catch{}
    if(!p.orderId) p.orderId = 'ORD-'+Date.now();
    const now = Date.now();
    const item = {
      id: p.orderId, type: p.type||'store',
      amount: Number(p.amount||0),
      orderName: p.orderName||'주문',
      cart: p.cart||[],
      customer: p.customer||{},
      table: p.table||null,
      status: p.status||'paid',
      ts: now, meta: p.meta||{}
    };
    db.orders.push(item);
    writeAll(db);
    return json(res, 200, { ok:true, order: item });
  }

  if(req.method==='PUT'){
    let body='';
    await new Promise(r=>req.on('data',c=>body+=c).on('end',r));
    let p={};
    try{ p=JSON.parse(body||'{}'); }catch{}
    const id = p.id;
    if(!id) return json(res,400,{ok:false,error:'missing id'});
    const o = db.orders.find(x=>x.id===id);
    if(!o) return json(res,404,{ok:false,error:'not found'});
    if(p.status) o.status = p.status;
    if(p.meta) o.meta = {...(o.meta||{}), ...p.meta};
    writeAll(db);
    return json(res,200,{ok:true, order:o});
  }

  return json(res, 405, { ok:false, error:'method not allowed' });
}
