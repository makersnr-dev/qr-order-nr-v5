// PHASE 2-5
// orders DB 인터페이스 (아직 DB 사용 안 함)

export async function listOrders(/* { storeId } */) {
  throw new Error('DB_NOT_IMPLEMENTED');
}

export async function getOrder(/* { orderId } */) {
  throw new Error('DB_NOT_IMPLEMENTED');
}

export async function createOrder(/* payload */) {
  throw new Error('DB_NOT_IMPLEMENTED');
}

export async function updateOrderStatus(/* { orderId, status } */) {
  throw new Error('DB_NOT_IMPLEMENTED');
}
