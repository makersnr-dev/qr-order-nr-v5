// /src/shared/orderStatus.js

/**
 * ======================================
 * [1] 매장 주문 상태 (관리자 select로 변경)
 * ======================================
 */
export const STORE_ORDER_STATUS = {
  RECEIVED: '주문접수',
  PREPARING: '준비중',
  COMPLETED: '주문완료',
  CANCELLED: '주문취소',

  // ⚠️ 결제 취소로 인한 강제 종료 상태
  PAYMENT_CANCELLED: '결제취소'
};

/**
 * ======================================
 * [2] 예약 주문 상태 (기존 유지, 변경 안 함)
 * ======================================
 */
export const RESERVE_ORDER_STATUS = [
  '입금 미확인',
  '주문접수',
  '준비중',
  '주문완료',
  '주문취소'
];

/**
 * ======================================
 * [3] 결제 상태 (버튼으로만 변경)
 * ======================================
 */
export const PAYMENT_STATUS = {
  UNPAID: '미결제',
  PAID: '결제완료',
  CANCELLED: '결제취소'
};

/**
 * ======================================
 * [4] 주문 타입별 기본 상태
 * ======================================
 */
export function getDefaultOrderStatus(type) {
  if (type === 'reserve') return '입금 미확인';
  return STORE_ORDER_STATUS.RECEIVED;
}

export function getDefaultPaymentStatus() {
  return PAYMENT_STATUS.UNPAID;
}

/**
 * ======================================
 * [5] 주문 상태 유효성 검사
 * ======================================
 */
export function isValidOrderStatus(type, status) {
  if (type === 'reserve') {
    return RESERVE_ORDER_STATUS.includes(status);
  }

  return Object.values(STORE_ORDER_STATUS).includes(status);
}

/**
 * ======================================
 * [6] 결제 상태 유효성 검사
 * ======================================
 */
export function isValidPaymentStatus(status) {
  return Object.values(PAYMENT_STATUS).includes(status);
}
