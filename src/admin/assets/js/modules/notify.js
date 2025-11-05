
import {get, patch} from './store.js';
export function renderNotify(){
  const n=get(['admin','notify'])||{};
  document.getElementById('n-beep').checked=!!n.useBeep; document.getElementById('n-vol').value=n.beepVolume ?? 0.7; document.getElementById('n-desktop').checked=!!n.desktop; document.getElementById('n-webhook').value=n.webhookUrl||"";
}
export function bindNotify(){
  document.getElementById('n-save').onclick=()=>{
    patch(['admin','notify'], _=>({useBeep:document.getElementById('n-beep').checked,beepVolume:Number(document.getElementById('n-vol').value||0.7),desktop:document.getElementById('n-desktop').checked,webhookUrl:document.getElementById('n-webhook').value.trim()}));
    alert('저장되었습니다.');
  };
}
