// /src/admin/assets/js/modules/ui.js

/**
 * 관리자 페이지 상단 탭 전환 로직
 */
export function initTabs(){
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('[data-panel]');
  
  tabs.forEach(t => t.addEventListener('click', () => {
    // 1. 모든 탭에서 active 클래스 제거 후 클릭한 것만 추가
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    
    // 2. 클릭한 탭의 ID와 일치하는 패널만 보여주기
    const id = t.dataset.tab;
    panels.forEach(p => {
      p.style.display = (p.dataset.panel === id ? 'block' : 'none');
    });
  }));

  // 첫 번째 탭 자동 클릭 (초기화)
  const first = document.querySelector('.tab');
  if (first) first.click();
}

// ⚠️ showModal, hideModal은 더 이상 쓰지 않으므로 삭제했습니다.
