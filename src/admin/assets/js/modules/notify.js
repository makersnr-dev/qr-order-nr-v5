import { get, patch } from './store.js';

function currentStoreId() {
  return window.qrnrStoreId || 'store1';
}

// 매장별 알림 설정: ['admin', 'notify', storeId]
const PATH = () => ['admin', 'notify', currentStoreId()];

export function renderNotify() {
  const n = get(PATH()) || {};

  const beepEl    = document.getElementById('n-beep');
  const volEl     = document.getElementById('n-vol');
  const desktopEl = document.getElementById('n-desktop');
  const hookEl    = document.getElementById('n-webhook');

  if (beepEl)    beepEl.checked       = !!n.useBeep;
  if (volEl)     volEl.value          = n.beepVolume ?? 0.7;
  if (desktopEl) desktopEl.checked    = !!n.desktop;
  if (hookEl)    hookEl.value         = n.webhookUrl || "";
}

export function bindNotify() {
  const saveBtn = document.getElementById('n-save');
  if (!saveBtn) return;

  saveBtn.onclick = () => {
    const useBeep = document.getElementById('n-beep')?.checked || false;
    const volRaw  = document.getElementById('n-vol')?.value;
    const vol     = isNaN(Number(volRaw)) ? 0.7 : Number(volRaw);
    const desktop = document.getElementById('n-desktop')?.checked || false;
    const webhook = (document.getElementById('n-webhook')?.value || '').trim();

    patch(PATH(), () => ({
      useBeep,
      beepVolume: vol,
      desktop,
      webhookUrl: webhook,
    }));

    alert('저장되었습니다.');
  };
}
