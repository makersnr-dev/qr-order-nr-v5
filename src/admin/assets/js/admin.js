
import {requireAuth, clearToken} from './modules/auth.js';
import {initTabs} from './modules/ui.js';
import {renderStore, renderDeliv, bindFilters, exportOrders, attachGlobalHandlers} from './modules/orders.js';
import {initQR} from './modules/qr.js';
import {renderMenu, bindMenu} from './modules/menu.js';
import {renderCode, bindCode} from './modules/code.js';
import {renderMyBank, bindMyBank} from './modules/mybank.js';
import {renderNotify, bindNotify} from './modules/notify.js';

async function main(){
  await requireAuth('admin');
  initTabs();
  document.getElementById('logoutBtn').onclick=()=>{ clearToken(); location.href='/admin'; };
  bindFilters(); renderStore(); renderDeliv(); attachGlobalHandlers();
  document.getElementById('store-export').onclick=()=>exportOrders('ordersStore');
  document.getElementById('deliv-export').onclick=()=>exportOrders('ordersDelivery');
  renderMenu(); bindMenu(); renderCode(); bindCode(); renderMyBank(); bindMyBank(); renderNotify(); bindNotify();
}
main();
