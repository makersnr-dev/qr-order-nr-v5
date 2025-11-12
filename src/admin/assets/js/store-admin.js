import { get, patch } from './modules/store.js';
// 같은 store.js 이미 쓰고 있으니까 경로만 맞춰줘

const $ = (s, r=document) => r.querySelector(s);

// 매핑 저장 위치: ['system','storeAdmins']
// (나중에 DB 붙일 때 여기만 교체하면 됨)
const PATH = ['system', 'storeAdmins'];

function loadMap() {
  return get(PATH) || {};
}
function saveMap(next) {
  patch(PATH, () => next);
}

function render() {
  const body = $('#map-body');
  const map = loadMap();

  body.innerHTML = '';

  const entries = Object.entries(map);
  if (!entries.length) {
    body.innerHTML =
      '<tr><td colspan="3" class="small">등록된 매핑 없음</td></tr>';
    return;
  }

  entries.forEach(([adminId, storeId]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${adminId}</td>
      <td>${storeId}</td>
      <td class="right">
        <button class="btn small" data-del="${adminId}">삭제</button>
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-del');
      const map = loadMap();
      delete map[id];
      saveMap(map);
      render();
    };
  });
}

function bind() {
  $('#map-add').onclick = () => {
    const adminId = ($('#map-admin').value || '').trim();
    const storeId = ($('#map-store').value || '').trim();

    if (!adminId || !storeId) {
      alert('관리자 ID와 storeId를 모두 입력하세요.');
      return;
    }

    const map = loadMap();
    map[adminId] = storeId;
    saveMap(map);
    render();
  };
}

render();
bind();
