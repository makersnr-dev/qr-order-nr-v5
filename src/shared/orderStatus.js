// /src/shared/orderStatus.js

// ✅ 매장 주문 상태 (QR 주문, 테이블 주문)
export const STORE_ORDER_STATUS = [
  '주문접수',
  '준비중',
  '주문완료',
  '주문취소',
  '결제취소'
];

// ✅ 예약 주문 상태
export const RESERVE_ORDER_STATUS = [
  '입금 미확인',
  '주문접수',
  '준비중',
  '주문완료',
  '주문취소'
];

// ✅ 새 주문이 처음 만들어질 때 기본 상태
export function getDefaultStatus(type) {
  if (type === 'reserve') return '입금 미확인';
  return '주문접수';
}

// ✅ 상태가 올바른지 검사 (나중에 서버에서 사용)
export function isValidStatus(type, status) {
  const list =
    type === 'reserve'
      ? RESERVE_ORDER_STATUS
      : STORE_ORDER_STATUS;

  return list.includes(status);
}
