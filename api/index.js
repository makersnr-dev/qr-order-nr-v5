import { query, queryOne, transaction } from './_lib/db.js';
import { verifyJWT, signJWT } from '../src/shared/jwt.js';

export const config = { runtime: 'nodejs' };

// --- 헬퍼 함수: 응답/시간/토큰 추출 ---
const json = (res, data, status = 200) => res.status(status).json(data);

const getKSTDate = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();

async function getAuth(req) {
    let token = null;
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) token = auth.substring(7);
    if (!token) {
        const cookie = req.headers.cookie || "";
        const match = cookie.match(/(admin_token|super_token)=([^;]+)/);
        if (match) token = match[2];
    }
    if (!token && req.body?.token) token = req.body.token;
    if (!token) return null;
    return await verifyJWT(token, process.env.JWT_SECRET || "dev-secret");
}

export default async function handler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace('/api', '');
    const method = req.method;
    const payload = await getAuth(req);
    
    // 권한 변수
    const isSuper = payload?.realm === 'super' || payload?.role === 'super';
    const contextStoreId = payload?.storeId;

    try {
        switch (path) {
                
            // 1. [인증] 로그인 및 상태 확인 (login-admin, login-cust, super-login, me)
                // --- [슈퍼 로그인 추가] ---
            case '/super-login':
                if (method !== 'POST') return json(res, { ok: false }, 405);
                const { uid: sUid, pwd: sPwd } = req.body;
                const superAdmins = JSON.parse(process.env.SUPER_ADMINS_JSON || "[]");
                const sFound = superAdmins.find(a => a.id === sUid && a.pw === sPwd);
                if (!sFound) return json(res, { ok: false }, 401);
                
                // 24시간(86400초) 유효한 토큰 생성
                const sToken = await signJWT({ role: "super", realm: "super", uid: sUid, name: sFound.name }, process.env.JWT_SECRET, 86400);
                res.setHeader("Set-Cookie", `super_token=${sToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
                return json(res, { ok: true });
            // --- [매핑 관리 추가] ---
            case '/admin-mappings':
                if (!isSuper) return json(res, { ok: false }, 403);
                if (method === 'GET') {
                    const r = await query('SELECT * FROM admin_stores ORDER BY created_at DESC');
                    return json(res, { ok: true, mappings: r.rows });
                }
                if (method === 'POST') {
                    const { adminKey, storeId, note } = req.body;
                    await query('INSERT INTO admin_stores (admin_key, store_id, note) VALUES ($1, $2, $3) ON CONFLICT (admin_key, store_id) DO UPDATE SET note=$3', [adminKey, storeId, note]);
                    return json(res, { ok: true });
                }
                if (method === 'DELETE') {
                    await query('DELETE FROM admin_stores WHERE admin_key = $1 AND store_id = $2', [req.body.adminKey, req.body.storeId]);
                    return json(res, { ok: true });
                }
                break;
            case '/login-admin':
                if (method !== 'POST') return json(res, { ok: false }, 405);
                const { id, pw } = req.body;
                const admins = JSON.parse(process.env.ADMIN_USERS_JSON || "[]");
                const admin = admins.find(a => a.id === id && a.pw === pw);
                if (!admin) return json(res, { ok: false, message: "Invalid credentials" }, 401);
                
                const mapping = await queryOne('SELECT store_id FROM admin_stores WHERE admin_key = $1', [id]);
                if (!mapping) return json(res, { ok: false, message: "매장 연결 정보 없음" }, 403);
                
                const token = await signJWT({ role: "admin", realm: "admin", uid: id, storeId: mapping.store_id }, process.env.JWT_SECRET, 86400);
                res.setHeader("Set-Cookie", `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
                return json(res, { ok: true, storeId: mapping.store_id });

            case '/me':
                if (!payload) return json(res, { ok: false, error: "NO_TOKEN" });
                return json(res, { 
                    ok: true, 
                    realm: payload.realm === 'super' ? 'admin' : payload.realm, 
                    storeId: contextStoreId, 
                    uid: payload.uid, 
                    name: payload.name || payload.uid,
                    isSuper: isSuper 
                });

            case '/logout-admin':
            case '/super-logout':
                res.setHeader("Set-Cookie", `${path.includes('super') ? 'super_token' : 'admin_token'}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
                return json(res, { ok: true });

            // 2. [매장 관리] (stores.js) - Super 전용
            case '/stores':
                if (!isSuper) return json(res, { ok: false, error: "FORBIDDEN" }, 403);
                if (method === 'GET') {
                    const result = await query('SELECT * FROM stores ORDER BY created_at DESC');
                    return json(res, { ok: true, stores: result.rows.reduce((acc, row) => ({ ...acc, [row.store_id]: { name: row.name, code: row.code } }), {}) });
                }
                if (method === 'POST') {
                    const { storeId, code, name } = req.body;
                    await query('INSERT INTO stores (store_id, name, code) VALUES ($1, $2, $3)', [storeId, name, code.toUpperCase()]);
                    return json(res, { ok: true });
                }
                break;

            // 3. [메뉴] (menus.js)
            case '/menus':
                const mSid = req.query.storeId || contextStoreId;
                if (method === 'GET') {
                    const result = await query('SELECT menu_id as id, * FROM menus WHERE store_id = $1 ORDER BY display_order ASC', [mSid]);
                    return json(res, { ok: true, menus: result.rows });
                }
                if (method === 'PUT') {
                    const items = Array.isArray(req.body) ? req.body : [req.body];
                    await transaction(async (client) => {
                        for (const item of items) {
                            await client.query(`
                                INSERT INTO menus (store_id, menu_id, name, price, category, active, sold_out, img, description, options)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                                ON CONFLICT (store_id, menu_id) DO UPDATE SET name=$3, price=$4, category=$5, active=$6, sold_out=$7, img=$8, description=$9, options=$10, updated_at=NOW()
                            `, [mSid, item.id, item.name, item.price, item.category, item.active, item.soldOut, item.img, item.desc, JSON.stringify(item.options || [])]);
                        }
                    });
                    return json(res, { ok: true });
                }
                if (method === 'DELETE') {
                    await query('DELETE FROM menus WHERE store_id = $1 AND menu_id = $2', [mSid, req.query.menuId]);
                    return json(res, { ok: true });
                }
                break;

            // 4. [주문] (orders.js)
            case '/orders':
                const oSid = contextStoreId || req.query.storeId;
                if (method === 'GET') {
                    const { type, from, to } = req.query;
                    let sql = 'SELECT * FROM orders WHERE store_id = $1';
                    const params = [oSid];
                    if (type) { sql += ' AND meta->>\'type\' = $2'; params.push(type); }
                    sql += ' ORDER BY created_at DESC LIMIT 100';
                    const result = await query(sql, params);
                    return json(res, { ok: true, orders: result.rows });
                }
                if (method === 'POST') {
                    const { amount, items, table, type, customer, reserve } = req.body;
                    const orderNo = `${oSid}-${type || 'order'}-${Date.now()}`;
                    await query('INSERT INTO orders (store_id, order_no, amount, table_no, status, meta) VALUES ($1, $2, $3, $4, $5, $6)', 
                                [oSid, orderNo, amount, table, '주문접수', JSON.stringify({ items, customer, reserve, type, ts: Date.now() })]);
                    return json(res, { ok: true, orderId: orderNo, status: '주문접수' });
                }
                if (method === 'PUT') {
                    const { orderId, status, meta } = req.body;
                    await query('UPDATE orders SET status = $1, meta = COALESCE($2, meta), updated_at = NOW() WHERE store_id = $3 AND order_no = $4', [status, meta ? JSON.stringify(meta) : null, oSid, orderId]);
                    return json(res, { ok: true });
                }
                break;

            // 5. [QR 코드] (qrcodes.js)
            case '/qrcodes':
                const qSid = req.query.storeId || contextStoreId;
                if (method === 'GET') {
                    const result = await query('SELECT id, kind, table_no as "table", label, url, data_url as "dataUrl" FROM qr_codes WHERE store_id = $1 ORDER BY table_no ASC', [qSid]);
                    return json(res, { ok: true, list: result.rows });
                }
                if (method === 'PUT') {
                    const { id, kind, table, label, url: qUrl, dataUrl } = req.body;
                    const storeInfo = await queryOne('SELECT qr_limit FROM stores WHERE store_id = $1', [qSid]);
                    const currentCount = await queryOne('SELECT count(*) as cnt FROM qr_codes WHERE store_id = $1', [qSid]);
                    const exists = await queryOne('SELECT id FROM qr_codes WHERE id = $1', [id]);
                    if (!exists && parseInt(currentCount.cnt) >= (storeInfo?.qr_limit || 10)) {
                        return json(res, { ok: false, error: "LIMIT_EXCEEDED", message: `최대 ${storeInfo?.qr_limit || 10}개까지만 가능합니다.` }, 403);
                    }
                    await query(`INSERT INTO qr_codes (id, store_id, kind, table_no, label, url, data_url) VALUES ($1, $2, $3, $4, $5, $6, $7)
                                 ON CONFLICT (id) DO UPDATE SET label=$5, data_url=$7, updated_at=NOW()`, [id, qSid, kind, table, label, qUrl, dataUrl]);
                    return json(res, { ok: true });
                }
                break;

            // 6. [직원 호출] (call.js)
            case '/call':
                const cSid = req.query.storeId || contextStoreId;
                if (method === 'GET') {
                    const result = await query('SELECT id, table_no as table, message, status, created_at as ts FROM call_logs WHERE store_id = $1 ORDER BY created_at DESC LIMIT 100', [cSid]);
                    return json(res, { ok: true, logs: result.rows });
                }
                if (method === 'POST') {
                    const { table, note } = req.body;
                    await query('INSERT INTO call_logs (store_id, table_no, message, status) VALUES ($1, $2, $3, $4)', [cSid, table, note || '직원 호출', '대기']);
                    return json(res, { ok: true });
                }
                if (method === 'PUT') {
                    await query('UPDATE call_logs SET status = $1 WHERE id = $2', [req.body.status, req.body.id]);
                    return json(res, { ok: true });
                }
                break;

            // 7. [기타 설정] (payment-code, store-settings, policy, privacy)
            case '/payment-code':
                const pSid = req.query.storeId || contextStoreId;
                const today = getKSTDate().slice(0, 10);
                if (method === 'GET') {
                    let data = await queryOne('SELECT code FROM payment_codes WHERE store_id = $1 AND date = $2', [pSid, today]);
                    if (!data) {
                        const newCode = String(Math.floor(1000 + Math.random() * 9000));
                        await query('INSERT INTO payment_codes (store_id, date, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [pSid, today, newCode]);
                        data = { code: newCode };
                    }
                    return json(res, { ok: true, code: data.code, date: today });
                }
                if (method === 'POST') {
                    const newCode = String(Math.floor(1000 + Math.random() * 9000));
                    await query('INSERT INTO payment_codes (store_id, date, code) VALUES ($1, $2, $3) ON CONFLICT (store_id, date) DO UPDATE SET code = EXCLUDED.code', [pSid, today, newCode]);
                    return json(res, { ok: true, code: newCode, date: today });
                }
                break;

            case '/store-settings':
                const sSid = req.query.storeId || contextStoreId;
                if (method === 'GET') {
                    const result = await queryOne('SELECT owner_bank, privacy_policy, notify_config, call_options FROM store_settings WHERE store_id = $1', [sSid]);
                    
                    // 1. 데이터가 없으면 빈 그릇이라도 만듭니다.
                    const settings = result || {};
            
                    // 2. 글자 뭉치로 저장된 데이터를 '진짜 객체'로 풀어주는 함수입니다.
                    const parse = (val) => {
                        if(!val) return null;
                        return typeof val === 'string' ? JSON.parse(val) : val;
                    };
            
                    // 3. 풀어서 정리한 데이터를 화면에 보내줍니다.
                    return json(res, { 
                        ok: true, 
                        settings: {
                            ...settings,
                            owner_bank: parse(settings.owner_bank),   // 글자를 객체로 변환
                            notify_config: parse(settings.notify_config), // 글자를 객체로 변환
                            call_options: parse(settings.call_options)   // 글자를 배열로 변환
                        } 
                    });
                }
                if (method === 'PUT') {
                    const { ownerBank, notifyConfig, callOptions } = req.body;
                    await query(`INSERT INTO store_settings (store_id, owner_bank, notify_config, call_options) VALUES ($1, $2, $3, $4)
                                 ON CONFLICT (store_id) DO UPDATE SET owner_bank=COALESCE($2, store_settings.owner_bank), notify_config=COALESCE($3, store_settings.notify_config), call_options=COALESCE($4, store_settings.call_options), updated_at=NOW()`,
                                [sSid, JSON.stringify(ownerBank), JSON.stringify(notifyConfig), JSON.stringify(callOptions)]);
                    return json(res, { ok: true });
                }
                break;

            default:
                return json(res, { ok: false, error: "NOT_FOUND", path }, 404);
        }
    } catch (e) {
        console.error(`[Error at ${path}]`, e);
        return json(res, { ok: false, error: "SERVER_ERROR", message: e.message }, 500);
    }
}
