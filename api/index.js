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
        const cookieHeader = req.headers.cookie || '';
        const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=')));
    
        // 현재 요청이 슈퍼 관리자 API인지 확인
        const isSuperPath = pathname.startsWith('/api/super-') || pathname === '/api/admin-mappings';
        
        // 경로에 맞는 토큰을 먼저 선택하고, 없으면 다른 토큰을 시도
        let token;
        if (isSuperPath) {
            token = cookies['super_token'];
        } else {
            token = cookies['admin_token'] || cookies['super_token']; // 일반 API는 슈퍼관리자도 접근 가능하게
        }
    
        if (!token) return null;
    
        try {
            return await verifyJWT(token, process.env.JWT_SECRET || 'dev-secret');
        } catch (e) {
            console.error('JWT 검증 실패:', e.message);
            return null; 
        }
    };

    try {
        if (pathname === '/api/test') return json({ ok: true, message: "연결 성공!" });
        if (pathname === '/api/check-time') return json({ ok: true, serverTime: new Date(Date.now() + 9 * 60 * 60 * 1000) });
        if (pathname === '/api/config') return json({ tossClientKey: process.env.TOSS_CLIENT_KEY || "" });
        
        // --- 1. 슈퍼 관리자 전용 로직 (원문 그대로 복구) ---
        if (pathname === '/api/super-login') {
            const { uid, pwd } = req.body;
            const superAdmins = JSON.parse(process.env.SUPER_ADMINS_JSON || '[]');
            const found = superAdmins.find(a => a.id === uid && a.pw === pwd);
            if (found) {
                const token = await signJWT({ realm: 'super', uid, isSuper: true }, process.env.JWT_SECRET || 'dev-secret');
                res.setHeader('Set-Cookie', `super_token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);
                return json({ ok: true });
            }
            return json({ ok: false }, 401);
        }

        if (pathname === '/api/super-me') {
            const auth = await getAuth();
            return auth?.realm === 'super' ? json({ ok: true, isSuper: true, superId: auth.uid }) : json({ ok: false }, 401);
        }

        if (pathname === '/api/super-logout') {
            res.setHeader('Set-Cookie', `super_token=; Path=/; Max-Age=0; HttpOnly; Path=/`);
            return json({ ok: true });
        }

        if (pathname === '/api/stores' || pathname === '/api/admin-mappings') {
            const auth = await getAuth();
            if (pathname === '/api/stores' && method === 'GET') {
                const r = await query('SELECT store_id, code FROM admin_stores ORDER BY created_at DESC');
                const stores = {};
                r.rows.forEach(s => { stores[s.store_id] = { name: s.store_id + " 매장", code: s.code }; });
                return json({ ok: true, stores });
            }
            if (auth?.realm !== 'super') return json({ ok: false }, 403);
            if (method === 'GET') {
                const r = await query('SELECT admin_key, store_id, code, note FROM admin_stores ORDER BY created_at DESC');
                return json({ ok: true, mappings: r.rows || [] });
            }
            if (method === 'DELETE') {
                await query('DELETE FROM admin_stores WHERE admin_key = $1 AND store_id = $2', [req.body.adminKey, req.body.storeId]);
                return json({ ok: true });
            }
            const { adminKey, storeId, code, note } = req.body;
            await query(`INSERT INTO admin_stores (admin_key, store_id, code, note) VALUES ($1, $2, $3, $4) ON CONFLICT (admin_key, store_id) DO UPDATE SET code = EXCLUDED.code, note = EXCLUDED.note`, [adminKey, storeId, code, note]);
            return json({ ok: true });
        }

        // --- 2. 매장 설정 (기존의 복잡한 COALESCE 필터링 유지) ---
        if (pathname === '/api/store-settings') {
            if (method === 'GET') {
                const r = await queryOne('SELECT owner_bank, privacy_policy, notify_config, call_options FROM store_settings WHERE store_id = $1', [storeId]);
                const settings = r || {};
                // 기존의 안전한 JSON 파싱 로직 복구
                if (typeof settings.owner_bank === 'string') try { settings.owner_bank = JSON.parse(settings.owner_bank); } catch (e) { }
                if (typeof settings.notify_config === 'string') try { settings.notify_config = JSON.parse(settings.notify_config); } catch (e) { }
                if (typeof settings.call_options === 'string') try { settings.call_options = JSON.parse(settings.call_options); } catch (e) { }
                return json({ ok: true, settings });
            }
            if (method === 'PUT') {
                const { ownerBank, privacyPolicy, notifyConfig, callOptions } = req.body;
                const b = ownerBank ? JSON.stringify(ownerBank) : null;
                const n = notifyConfig ? JSON.stringify(notifyConfig) : null;
                const c = callOptions ? JSON.stringify(callOptions) : null;
                await query(`INSERT INTO store_settings (store_id, owner_bank, privacy_policy, notify_config, call_options) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (store_id) DO UPDATE SET owner_bank=COALESCE($2, store_settings.owner_bank), privacy_policy=COALESCE($3, store_settings.privacy_policy), notify_config=COALESCE($4, store_settings.notify_config), call_options=COALESCE($5, store_settings.call_options)`, [storeId, b, privacyPolicy, n, c]);
                return json({ ok: true });
            }
        }

        // --- 3. 메뉴 관리 (ON CONFLICT 및 상세 옵션 유지) ---
        if (pathname === '/api/menus') {
            if (method === 'GET') {
                const r = await query('SELECT menu_id as id, name, price, category, active, sold_out as "soldOut", img, description as desc, options FROM menus WHERE store_id = $1 ORDER BY display_order ASC', [storeId]);
                return json({ ok: true, menus: r.rows || [] });
            }
            if (method === 'PUT') {
                const items = Array.isArray(req.body) ? req.body : [req.body];
                for (const m of items) {
                    await query(`INSERT INTO menus (store_id, menu_id, name, price, category, active, sold_out, img, description, options) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (store_id, menu_id) DO UPDATE SET name=$3, price=$4, category=$5, active=$6, sold_out=$7, img=$8, description=$9, options=$10`, [storeId, m.id, m.name, m.price, m.category, m.active, m.soldOut, m.img, m.desc, JSON.stringify(m.options || [])]);
                }
                return json({ ok: true });
            }
        }

        // --- 4. 주문 관리 (핵심 교정부: 기존 필터링 기능 유지) ---
        if (pathname === '/api/orders') {
            const auth = await getAuth();
            if (!auth) return json({ ok: false }, 401);
            // --- api/index.js 내 GET /api/orders 부분 ---
            if (method === 'GET') {
                const type = params.get('type');
                const r = (type === 'store') 
                    ? await query('SELECT * FROM orders WHERE store_id = $1 ORDER BY created_at DESC', [storeId])
                    : await query('SELECT * FROM orderss WHERE store_id = $1 ORDER BY created_at DESC', [storeId]);
            
                const orders = r.rows.map(row => {
                    // meta가 문자열이면 파싱, 아니면 그대로 사용
                    const meta = typeof row.meta === 'string' ? JSON.parse(row.meta || '{}') : (row.meta || {});
                    if (type === 'store') {
                        return {
                            ...row,
                            orderId: row.order_no,
                            cart: row.meta?.cart || [],
                            ts: new Date(row.created_at).getTime()
                        };
                    } else {
                        return {
                            ...row,
                            orderId: row.order_no,      // 화면 표시용
                            amount: row.total_amount,   // UI 공통 필드
                            cart: row.items || [],      // UI 공통 필드 (jsonb에서 바로 가져옴)
                            customer: {
                                name: row.customer_name,
                                phone: row.customer_phone,
                                addr: row.address
                            },
                            reserve: row.meta?.reserve || {},
                            requestMsg: meta.reserve?.note || meta.reserve?.message || meta.memo || '-' ,
                            ts: new Date(row.created_at).getTime()
                        };
                    }
                });
                return json({ ok: true, orders });
            }
            // --- api/index.js 내 POST /api/orders 부분 ---
            if (method === 'POST') {
                const { type, table, cart, amount, customer, reserve, agreePrivacy, lookupPw, memberId } = req.body;
                
                // DB 스키마에 맞춘 integer ID 생성 (9자리)
                const newNumericId = parseInt(String(Date.now()).slice(-9)); 
                const newOrderNo = `${storeId}-${type === 'store' ? 'S' : 'R'}-${Date.now()}`;
            
                if (type === 'store') {
                    // 매장 주문: orders 테이블
                    await query(
                        `INSERT INTO orders (store_id, order_no, status, table_no, amount, meta) 
                         VALUES ($1, $2, '주문접수', $3, $4, $5)`, 
                        [storeId, newOrderNo, table, amount, JSON.stringify({ cart, ts: Date.now() })]
                    );
                } else {
                    // 예약 주문: orderss 테이블 (제공해주신 스키마 컬럼명에 100% 매칭)
                    await query(
                        `INSERT INTO orderss (
                            order_id, store_id, type, status, 
                            customer_name, customer_phone, address, 
                            items, total_amount, lookup_pw, order_no, meta
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, 
                        [
                            newNumericId,           // order_id (integer)
                            storeId,                // store_id
                            'reserve',              // type
                            '입금 미확인',           // status
                            customer.name,          // customer_name
                            customer.phone,         // customer_phone
                            customer.fullAddr,          // address (주소 저장)
                            JSON.stringify(cart),   // items (jsonb, 필수값! null이면 에러남)
                            amount,                 // total_amount
                            lookupPw,               // lookup_pw
                            newOrderNo,             // order_no
                            JSON.stringify({ reserve, agreePrivacy, memberId, memo: customer.memo }) // meta
                        ]
                    );
                }
                return json({ ok: true, orderId: newOrderNo });
            }
            // --- 4. 주문 관리 내부에 추가 ---
            if (method === 'PUT') {
                const { orderId, type, status, meta, metaAppend } = req.body;
                
                // 1. 테이블 결정 (orders 또는 orderss)
                const tableName = type === 'store' ? 'orders' : 'orderss';
                const idColumn = type === 'store' ? 'order_no' : 'order_id';
            
                // 2. 기존 데이터 가져오기 (meta 업데이트용)
                const existing = await queryOne(`SELECT meta FROM ${tableName} WHERE ${idColumn} = $1`, [orderId]);
                if (!existing) return json({ ok: false, error: 'ORDER_NOT_FOUND' }, 404);
            
                let newMeta = { ...existing.meta, ...meta };
                
                // history 기록 추가 로직
                if (metaAppend?.history) {
                    const history = existing.meta?.history || [];
                    history.push(metaAppend.history);
                    newMeta.history = history;
                }
            
                // 3. DB 업데이트
                if (status) {
                    await query(`UPDATE ${tableName} SET status = $1, meta = $2 WHERE ${idColumn} = $3`, [status, JSON.stringify(newMeta), orderId]);
                } else {
                    await query(`UPDATE ${tableName} SET meta = $1 WHERE ${idColumn} = $2`, [JSON.stringify(newMeta), orderId]);
                }
            
                return json({ ok: true });
            }
        }

        // --- 5. 호출 관리 (기존 상태변경 로직 포함) ---
        if (pathname === '/api/call') {
            if (method === 'GET') {
                const r = await query('SELECT id, table_no, message, status, created_at as ts FROM call_logs WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50', [storeId]);
                return json({ ok: true, logs: r.rows });
            }
            if (method === 'POST') {
                await query('INSERT INTO call_logs (store_id, table_no, message, status) VALUES ($1, $2, $3, \'대기\')', [storeId, req.body.table, req.body.note]);
                return json({ ok: true });
            }
            if (method === 'PUT') {
                await query('UPDATE call_logs SET status = $1 WHERE id = $2', [req.body.status, req.body.id]);
                return json({ ok: true });
            }
        }

        // --- 6. 결제코드 및 QR (기존 한도 체크 로직 복구) ---
        if (pathname === '/api/payment-code') {
            const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
        
            // 1. GET 요청: 코드 조회 및 오래된 코드 삭제
            if (method === 'GET') {
                // [추가] 오늘 이전 날짜의 코드는 보안을 위해 삭제
                await query('DELETE FROM payment_codes WHERE store_id = $1 AND date < $2', [storeId, today]);
        
                let codeRow = await queryOne('SELECT code FROM payment_codes WHERE store_id = $1 AND date = $2', [storeId, today]);
                
                if (!codeRow) {
                    const newCode = String(Math.floor(1000 + Math.random() * 9000));
                    // 중복 생성 방지
                    await query('INSERT INTO payment_codes (store_id, date, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [storeId, today, newCode]);
                    
                    // 방금 생성된 코드를 다시 조회
                    codeRow = await queryOne('SELECT code FROM payment_codes WHERE store_id = $1 AND date = $2', [storeId, today]);
                    if (!codeRow) codeRow = { code: newCode };
                }
                return json({ ok: true, code: codeRow.code, date: today });
            }
        
            // 2. POST 요청: 새 코드 강제 발급 (갱신)
            if (method === 'POST') {
                const newCode = String(Math.floor(1000 + Math.random() * 9000));
                await query(`
                    INSERT INTO payment_codes (store_id, date, code)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (store_id, date) 
                    DO UPDATE SET code = EXCLUDED.code
                `, [storeId, today, newCode]);
        
                return json({ ok: true, code: newCode, date: today });
            }
        
            return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
        }

        if (pathname === '/api/qrcodes') {
            if (method === 'GET') {
                const r = await query('SELECT id, kind, table_no as "table", label, url, data_url as "dataUrl" FROM qr_codes WHERE store_id = $1 ORDER BY created_at DESC', [storeId]);
                return json({ ok: true, list: r.rows || [] });
            }
            if (method === 'PUT') {
                const { id, kind, table, label, url, dataUrl } = req.body;
                const row = await queryOne('SELECT qr_limit FROM admin_stores WHERE store_id = $1 LIMIT 1', [storeId]); 
                const limit = row?.qr_limit || 20;
                const current = await queryOne('SELECT COUNT(*) as count FROM qr_codes WHERE store_id = $1', [storeId]);
                const exists = await queryOne('SELECT id FROM qr_codes WHERE id = $1', [id]);
                if (!exists && parseInt(current.count) >= limit) return json({ ok: false, message: `QR 한도 초과` }, 403);
                await query(`INSERT INTO qr_codes (id, store_id, kind, table_no, label, url, data_url, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) ON CONFLICT (id) DO UPDATE SET label=$5, data_url=$7, updated_at=NOW()`, [id, storeId, kind, table, label, url, dataUrl]);
                return json({ ok: true });
            }
            if (method === 'DELETE') {
                await query('DELETE FROM qr_codes WHERE id = $1 AND store_id = $2', [params.get('id'), storeId]);
                return json({ ok: true });
            }
        }

        // --- 7. 관리자 인증 및 정보 조회 ---
        if (pathname === '/api/login-admin') {
            const { id, pw } = req.body;
            const admins = JSON.parse(process.env.ADMIN_USERS_JSON || '[]');
            const found = admins.find(a => a.id === id && a.pw === pw);
            if (!found) return json({ ok: false, message: '로그인 정보가 틀렸습니다.' }, 401);
            const map = await queryOne('SELECT store_id FROM admin_stores WHERE admin_key = $1', [id]);
            const sid = map?.store_id || 'store1';
            const token = await signJWT({ realm: 'admin', uid: id, storeId: sid }, process.env.JWT_SECRET || 'dev-secret', 86400);
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);
            return json({ ok: true, storeId: sid });
        }

        if (pathname === '/api/me' || pathname === '/api/verify') {
            const auth = await getAuth();
            if (!auth) return json({ ok: false, message: 'Unauthorized' }, 401);
            return json({ ok: true, ...auth });
        }

        return json({ error: 'NOT_FOUND', path: pathname }, 404);
    } catch (e) {
        console.error(e);
        return json({ ok: false, error: e.message }, 500);
    }
}
