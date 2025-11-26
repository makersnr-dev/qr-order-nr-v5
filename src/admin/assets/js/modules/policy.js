// /src/admin/assets/js/modules/policy.js

const $ = (s, r = document) => r.querySelector(s);

export async function renderPolicy() {
  const area = $('#policy-text');
  const info = $('#policy-updated');
  if (!area) return;

  try {
    const res = await fetch('/api/policy', { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error('load failed');

    const text = data.policy?.text || '';
    const updatedAt = data.policy?.updatedAt || null;

    area.value = text;
    if (info) {
      info.textContent = updatedAt
        ? `마지막 수정: ${new Date(updatedAt).toLocaleString()}`
        : '아직 저장된 기록이 없습니다.';
    }
  } catch (e) {
    console.error('renderPolicy error', e);
    if (area && !area.value) {
      area.value = '개인정보 처리방침을 불러오지 못했습니다.';
    }
    if (info) info.textContent = '불러오기 오류';
  }
}

export function bindPolicy() {
  const btn = document.getElementById('policy-save');
  const area = document.getElementById('policy-text');
  const info = document.getElementById('policy-updated');
  if (!btn || !area) return;

  btn.onclick = async () => {
    const text = area.value.trim();
    if (!text) {
      alert('내용이 비어 있습니다.');
      area.focus();
      return;
    }
    try {
      const res = await fetch('/api/policy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error('save failed');

      alert('저장되었습니다.');

      if (info && data.policy?.updatedAt) {
        info.textContent = `마지막 수정: ${new Date(
          data.policy.updatedAt
        ).toLocaleString()}`;
      }
    } catch (e) {
      console.error('save policy error', e);
      alert('저장 중 오류가 발생했습니다.');
    }
  };
}
