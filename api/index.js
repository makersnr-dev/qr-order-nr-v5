import { query, queryOne } from './_lib/db.js';
import { verifyJWT, signJWT } from '../src/shared/jwt.js';

export default async function handler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;
    const params = url.searchParams;
    const storeId = params.get('storeId') || req.body?.storeId;

    const json = (body, status = 200) => {
        res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.send(JSON.stringify(body));
    };

    const getAuth = async () => {
        const cookie = req.headers.cookie || '';
        const token = cookie.match(/(admin_token|super_token)=([^;]+)/)?.[2];
        if (!token) return null;
        try { return await verifyJWT(token, process.env.JWT_SECRET || 'dev-secret'); } 
        catch { return null; }
    };

    try {
        // --- 0. 공통 (테스트 및 서버시간) ---
        if (pathname === '/api/test') return json({ ok: true, message: "연결 성공!" });
        if (pathname === '/api/check-time') return json({ ok: true, serverTime: new Date(Date.now() + 9*60*60*1000) });

        // --- 1. 슈퍼 관리자 전용 ---
        if (pathname === '/api/super-login') {
            const { uid, pwd } = req.body;
            const superAdmins = JSON.parse(process.env.SUPER_ADMINS_JSON || '[]');
            const found = superAdmins.find(a => a.id === uid && a.pw === pwd);
            if (found) {
                const token = await signJWT({ realm: 'super', uid, isSuper: true }, process.env.JWT_SECRET || 'dev-secret');
                res.setHeader('Set-Cookie', `super_token=${token}; Path=/; HttpOnly; Max-Age=86400`);
                return json({ ok: true });
            }
            return json({ ok: false }, 401);
        }
        if (pathname === '/api/super-me') {
            const auth = await getAuth();
            return auth?.realm === 'super' ? json({ ok: true, isSuper: true, superId: auth.uid }) : json({ ok: false }, 401);
        }

        // --- 2. 매장 설정 (계좌, 방침, 알림설정) ---
        if (pathname === '/api/store-settings') {
            if (method === 'GET') {
                const r = await queryOne('SELECT owner_bank, privacy_policy, notify_config, call_options FROM store_settings WHERE store_id = $1', [storeId]);
                return json({ ok: true, settings: r || {} });
            }
            if (method === 'PUT') {
                const { ownerBank, privacyPolicy, notifyConfig, callOptions } = req.body;
                await query(`INSERT INTO store_settings (store_id, owner_bank, privacy_policy, notify_config, call_options) VALUES ($1, $2, $3, $4, $5) 
                             ON CONFLICT (store_id) DO UPDATE SET owner_bank=COALESCE($2, store_settings.owner_bank), privacy_policy=COALESCE($3, store_settings.privacy_policy), notify_config=COALESCE($4, store_settings.notify_config), call_options=COALESCE($5, store_settings.call_options)`, 
                             [storeId, JSON.stringify(ownerBank), privacyPolicy, JSON.stringify(notifyConfig), JSON.stringify(callOptions)]);
                return json({ ok: true });
            }
        }

        // --- 3. 메뉴 관리 (menus) ---
        if (pathname === '/api/menus') {
            if (method === 'GET') {
                const r = await query('SELECT menu_id as id, name, price, category, active, sold_out as "soldOut", img, description as desc, options FROM menus WHERE store_id = $1 ORDER BY display_order ASC', [storeId]);
                return json({ ok: true, menus: r.rows });
            }
            if (method === 'PUT') {
                const items = Array.isArray(req.body) ? req.body : [req.body];
                for (const m of items) {
                    await query(`INSERT INTO menus (store_id, menu_id, name, price, category, active, sold_out, img, description, options)
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                                 ON CONFLICT (store_id, menu_id) DO UPDATE SET name=$3, price=$4, category=$5, active=$6, sold_out=$7, img=$8, description=$9, options=$10`, 
                                 [storeId, m.id, m.name, m.price, m.category, m.active, m.soldOut, m.img, m.desc, JSON.stringify(m.options || [])]);
                }
                return json({ ok: true });
            }
        }

        // --- 4. 결제 코드 (자동 생성 로직 포함) ---
        if (pathname === '/api/payment-code') {
            const today = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0, 10);
            let codeRow = await queryOne('SELECT code FROM payment_codes WHERE store_id = $1 AND date = $2', [storeId, today]);
            if (!codeRow) {
                const newCode = String(Math.floor(1000 + Math.random() * 9000));
                await query('INSERT INTO payment_codes (store_id, date, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [storeId, today, newCode]);
                codeRow = { code: newCode };
            }
            return json({ ok: true, code: codeRow.code, date: today });
        }

        // --- 5. 호출 알림 (call) ---
        if (pathname === '/api/call') {
            if (method === 'GET') {
                const r = await query('SELECT id, table_no as "table", message, status, created_at as ts FROM call_logs WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50', [storeId]);
                return json({ ok: true, logs: r.rows });
            }
            if (method === 'PUT') {
                await query('UPDATE call_logs SET status = $1 WHERE id = $2', [req.body.status, req.body.id]);
                return json({ ok: true });
            }
        }

        // --- 6. QR 관리 (개수 제한 로직 포함) ---
        if (pathname === '/api/qrcodes') {
            if (method === 'GET') {
                const r = await query('SELECT id, kind, table_no as "table", label, url, data_url as "dataUrl" FROM qr_codes WHERE store_id = $1 ORDER BY created_at DESC', [storeId]);
                return json({ ok: true, list: r.rows });
            }
            if (method === 'PUT') {
                const { id, kind, table, label, url, dataUrl } = req.body;
                const storeInfo = await queryOne('SELECT qr_limit FROM stores WHERE store_id = $1', [storeId]);
                const currentCount = await queryOne('SELECT COUNT(*) as count FROM qr_codes WHERE store_id = $1', [storeId]);
                const exists = await queryOne('SELECT id FROM qr_codes WHERE id = $1', [id]);
                if (!exists && parseInt(currentCount.count) >= (storeInfo?.qr_limit || 10)) {
                    return json({ ok: false, message: `QR 한도 초과` }, 403);
                }
                await query(`INSERT INTO qr_codes (id, store_id, kind, table_no, label, url, data_url, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) ON CONFLICT (id) DO UPDATE SET label=$5, data_url=$7, updated_at=NOW()`, [id, storeId, kind, table, label, url, dataUrl]);
                return json({ ok: true });
            }
            if (method === 'DELETE') {
                await query('DELETE FROM qr_codes WHERE id = $1 AND store_id = $2', [params.get('id'), storeId]);
                return json({ ok: true });
            }
        }

        // --- 7. 주문 및 기타 (원본 기능) ---
        if (pathname === '/api/orders') {
            if (method === 'GET') {
                const type = params.get('type');
                const r = await query('SELECT * FROM orders WHERE store_id = $1 AND (meta->>\'type\') = $2 ORDER BY created_at DESC LIMIT 100', [storeId, type]);
                return json({ ok: true, orders: r.rows.map(row => ({ ...row, orderId: row.order_no, cart: row.meta?.cart, customer: row.meta?.customer, reserve: row.meta?.reserve })) });
            }
            // POST/PUT 로직...
        }

        // --- 8. 일반 관리자 로그인 ---
        if (pathname === '/api/login-admin') {
            const { id, pw } = req.body;
            const admins = JSON.parse(process.env.ADMIN_USERS_JSON || '[]');
            const found = admins.find(a => a.id === id && a.pw === pw);
            if (!found) return json({ ok: false }, 401);
            const map = await queryOne('SELECT store_id FROM admin_stores WHERE admin_key = $1', [id]);
            const token = await signJWT({ realm: 'admin', uid: id, storeId: map?.store_id || 'store1' }, process.env.JWT_SECRET || 'dev-secret');
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; Max-Age=86400`);
            return json({ ok: true, storeId: map?.store_id || 'store1' });
        }

        return json({ error: 'NOT_FOUND', path: pathname }, 404);
    } catch (e) {
        console.error(e);
        return json({ ok: false, error: e.message }, 500);
    }
}
