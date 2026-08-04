const nodemailer = require('nodemailer');

const MAX_LEN = 500;
const safe = (v) => String(v || '').replace(/[\r\n]/g, ' ').trim().slice(0, MAX_LEN);

module.exports = async (req, res) => {
  // 임시 진단용: 환경변수가 "설정되었는지 여부"만 반환합니다. 값은 노출하지 않습니다.
  if (req.method === 'GET' && req.query && req.query.diag === '1') {
    res.status(200).json({
      GMAIL_USER: Boolean(process.env.GMAIL_USER),
      GMAIL_APP_PASSWORD: Boolean(process.env.GMAIL_APP_PASSWORD),
      LEAD_TO_EMAIL: Boolean(process.env.LEAD_TO_EMAIL),
      deployedAt: process.env.VERCEL_DEPLOYMENT_ID ? 'ok' : 'unknown',
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};

  // Honeypot: bots tend to fill every field, real users never see or fill this one.
  if (safe(body.website)) {
    res.status(200).json({ ok: true });
    return;
  }

  const name = safe(body.name);
  const phone = safe(body.phone);
  const status = safe(body.status);
  const type = safe(body.type);
  const memo = safe(body.memo);

  if (!name || !phone) {
    res.status(400).json({ ok: false, error: '이름과 연락처를 입력해 주세요.' });
    return;
  }

  const { GMAIL_USER, GMAIL_APP_PASSWORD, LEAD_TO_EMAIL } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    res.status(500).json({ ok: false, error: '메일 전송 설정이 완료되지 않았습니다.' });
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  try {
    await transporter.sendMail({
      from: `"세무회계 경우 랜딩페이지" <${GMAIL_USER}>`,
      to: LEAD_TO_EMAIL || GMAIL_USER,
      subject: `[상담신청] ${name} / ${phone}`,
      text: [
        `이름/상호: ${name}`,
        `연락처: ${phone}`,
        `현재 상태: ${status || '-'}`,
        `문의 유형: ${type || '-'}`,
        `문의 내용: ${memo || '-'}`,
      ].join('\n'),
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: '메일 전송 중 오류가 발생했습니다.' });
  }
};
