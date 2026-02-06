import { query, transaction } from './db.js';

// 주문 생성
// 1. 주문 생성 (기존 order_items JOIN 방식 제거 -> 단일 테이블 입력)
export async function insertOrder({
  storeId,
  orderNo,
  type,          // [추가] 주문 유형 (store/reserve)
  status,
  tableNo,
  amount,
  customerName,  // [변경] meta 내부가 아닌 컬럼 직접 입력
  customerPhone, // [변경] meta 내부가 아닌 컬럼 직접 입력
  address,       // [변경] meta 내부가 아닌 컬럼 직접 입력
  items,         // [변경] order_items 테이블 대신 JSON으로 저장
  lookupPw,      // [추가] 조회 비밀번호 컬럼
  meta,
}) {
  // SQL: 새 테이블 정의서에 맞춘 12개 컬럼 매칭
  const sql = `
    INSERT INTO orders 
    (store_id, order_no, type, status, table_no, amount, customer_name, customer_phone, address, items, lookup_pw, meta)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id`;
  
  const values = [
    storeId, 
    orderNo, 
    type, 
    status, 
    tableNo || null, 
    amount, 
    customerName || null, 
    customerPhone || null, 
    address || null, 
    JSON.stringify(items || []), // [변경] 배열을 JSON 문자열로 변환
    lookupPw || null, 
    JSON.stringify(meta || {})   // [변경] 객체를 JSON 문자열로 변환
  ];

  const res = await query(sql, values);
  return { ok: true, id: res.rows[0].id };
}

// 주문 목록 조회
// 2. 주문 목록 조회 (JOIN 없이 단일 테이블 SELECT)
export async function listOrders({ storeId, type, from, to }) {
  const where = [];
  const values = [];
  let idx = 1;

  if (storeId) { where.push(`store_id = $${idx++}`); values.push(storeId); }
  if (type) { where.push(`type = $${idx++}`); values.push(type); } // [변경] meta->>'type' 대신 컬럼 직접 비교
  if (from) { where.push(`created_at >= $${idx++}`); values.push(from); }
  if (to) { where.push(`created_at <= $${idx++}`); values.push(to); }

  const sql = `
    SELECT * FROM orders 
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC LIMIT 500
  `;

  const result = await query(sql, values);

  return {
    ok: true,
    orders: result.rows.map(row => ({
      ...row,              // 모든 컬럼 포함 (customer_name, address 등)
      orderId: row.order_no, // [유지] 프론트엔드 호환용 필드명
      ts: new Date(row.created_at).getTime(),
      // [중요] DB에서 꺼낼 때 JSON 형태가 문자열이면 파싱 처리
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
      meta: typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta,
    })),
  };
}

// 3. 주문 업데이트 (기존 로직 유지하되 JSONB 업데이트 방식 최적화)
export async function updateOrder({ storeId, orderNo, status, meta, history }) {
  const sets = [];
  const values = [];
  let idx = 1;

  if (status) {
    sets.push(`status = $${idx++}`);
    values.push(status);
  }

  if (meta) {
    // [변경] 기존 meta와 병합하는 PostgreSQL 전용 연산자(||) 사용
    sets.push(`meta = COALESCE(meta, '{}'::jsonb) || $${idx++}::jsonb`);
    values.push(typeof meta === 'string' ? meta : JSON.stringify(meta));
  }

  if (history) {
    // [유지] meta 내부의 history 배열에 새 기록 추가 (jsonb_set)
    sets.push(`
      meta = jsonb_set(
        COALESCE(meta, '{}'::jsonb),
        '{history}',
        COALESCE(meta->'history', '[]'::jsonb) || $${idx++}::jsonb
      )
    `);
    values.push(JSON.stringify(Array.isArray(history) ? history : [history]));
  }

  if (!sets.length) return { ok: true };

  sets.push(`updated_at = NOW()`);
  
  // WHERE 절을 위한 파라미터 추가
  const orderNoIdx = idx++;
  const storeIdIdx = idx;
  values.push(orderNo);
  values.push(storeId);

  const sql = `
    UPDATE orders SET ${sets.join(', ')}
    WHERE order_no = $${orderNoIdx} AND store_id = $${storeIdIdx}
  `;

  await query(sql, values);
  return { ok: true };
}
