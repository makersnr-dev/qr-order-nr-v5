// api/toss-confirm.js
// Vercel Node.js Serverless Function (무료 플랜에서도 사용 가능)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { paymentKey, orderId, amount } = req.body || {};

    // 기본 파라미터 검증
    if (!paymentKey || !orderId || typeof amount !== 'number') {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_PARAMS',
        detail: { paymentKey, orderId, amount },
      });
    }

    const secretKey = process.env.TOSS_SECRET_KEY;

    // 시크릿 키 없으면 "테스트/로컬 전용" 스텁 모드
    if (!secretKey) {
      return res.status(200).json({
        ok: true,
        stub: true,
        message: 'TOSS_SECRET_KEY is not set. Skipping real confirm (stub mode).',
        paymentKey,
        orderId,
        amount,
      });
    }

    const authHeader =
      'Basic ' + Buffer.from(secretKey + ':', 'utf8').toString('base64');

    const tossRes = await fetch(
      'https://api.tosspayments.com/v1/payments/confirm',
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      }
    );

    const data = await tossRes.json();

    if (!tossRes.ok) {
      // Toss 에서 에러를 준 경우 그대로 감싸서 전달
      return res.status(tossRes.status).json({
        ok: false,
        error: 'TOSS_CONFIRM_FAILED',
        tossError: data,
      });
    }

    // 성공
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (err) {
    console.error('[toss-confirm] error', err);
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      detail: err?.message || String(err),
    });
  }
}
