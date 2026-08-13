const nodemailer = require('nodemailer');

const MAX_LEN = 500;
const safe = (v) => String(v || '').replace(/[\r\n]/g, ' ').trim().slice(0, MAX_LEN);

module.exports = async (req, res) => {
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
  const email = safe(body.email);
  const status = safe(body.status);
  const type = safe(body.type);
  const memo = safe(body.memo);

  // 광고 유입 경로 (utm_*, fbclid, referrer). 값이 없으면 '직접 유입'으로 표기.
  const SOURCE_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'referrer'];
  const src = (body.source && typeof body.source === 'object') ? body.source : {};
  const sourceLines = SOURCE_KEYS
    .filter((k) => src[k])
    .map((k) => `  ${k}: ${safe(src[k])}`);
  const sourceText = sourceLines.length ? sourceLines.join('\n') : '  직접 유입 (광고 파라미터 없음)';

  // 연락처와 이메일 중 하나만 있으면 접수한다.
  // 전화번호를 남기기 부담스러워하는 사람에게 다른 길을 열어두기 위함.
  if (!phone && !email) {
    res.status(400).json({ ok: false, error: '연락처나 이메일 중 하나는 적어주세요.' });
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
      subject: `[상담신청] ${name || type || '문의'} / ${phone || email}`,
      text: [
        `이름/상호: ${name || '(미기재 — 상단 체크리스트 폼)'}`,
        `연락처: ${phone || '(미기재)'}`,
        `이메일: ${email || '(미기재)'}`,
        `현재 상태: ${status || '-'}`,
        `문의 유형: ${type || '-'}`,
        `문의 내용: ${memo || '-'}`,
        '',
        '유입 경로',
        sourceText,
      ].join('\n'),
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: '메일 전송 중 오류가 발생했습니다.' });
  }
};
