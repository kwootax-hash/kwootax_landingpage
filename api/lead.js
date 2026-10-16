const nodemailer = require('nodemailer');

const MAX_LEN = 500;
const safe = (v) => String(v || '').replace(/[\r\n]/g, ' ').trim().slice(0, MAX_LEN);

// 네이버 자동추적의 n_query는 한글이 퍼센트 인코딩된 채, 때로는 두 번 인코딩된 채 들어온다.
const decodeMaybe = (v) => {
  let out = String(v || '');
  for (let i = 0; i < 2 && /%[0-9A-Fa-f]{2}/.test(out); i += 1) {
    try {
      const next = decodeURIComponent(out.replace(/\+/g, ' '));
      if (next === out) break;
      out = next;
    } catch (e) {
      break;
    }
  }
  return out;
};

const refHost = (ref) => {
  try {
    return new URL(String(ref)).hostname.toLowerCase();
  } catch (e) {
    return '';
  }
};

// 유입 경로를 한 줄로 요약한다. 메일 제목에 붙여 한눈에 구분하기 위한 값.
const describeSource = (src) => {
  const p = (k) => safe(src[k]);

  // 1) 네이버 검색광고 — 관리시스템에서 자동 추적(Auto Tracking)을 켜면 n_* 파라미터가 붙는다.
  if (p('n_ad') || p('n_keyword') || p('n_keyword_id') || p('n_query') || p('NaPm')) {
    const bits = ['네이버 검색광고'];
    if (p('n_keyword')) bits.push(`키워드: ${decodeMaybe(p('n_keyword'))}`);
    else if (p('n_keyword_id')) bits.push(`키워드ID: ${p('n_keyword_id')}`);
    if (p('n_query')) bits.push(`검색어: ${decodeMaybe(p('n_query'))}`);
    if (p('n_rank')) bits.push(`순위: ${p('n_rank')}`);
    return bits.join(' · ');
  }

  // 2) 광고 URL에 직접 붙인 utm 태깅.
  if (p('utm_source') || p('utm_campaign') || p('utm_term')) {
    const bits = [`${p('utm_source') || '출처미상'} ${p('utm_medium') || ''}`.trim()];
    if (p('utm_campaign')) bits.push(`캠페인: ${p('utm_campaign')}`);
    if (p('utm_term')) bits.push(`키워드: ${decodeMaybe(p('utm_term'))}`);
    if (p('utm_content')) bits.push(`소재: ${p('utm_content')}`);
    return bits.join(' · ');
  }

  if (p('fbclid')) return '인스타/페이스북 광고';
  if (p('gclid')) return '구글 광고';

  // 3) 파라미터가 없으면 referrer로 대분류한다. 키워드까지는 알 수 없다.
  const host = refHost(p('referrer'));
  if (host) {
    if (/(^|\.)blog\.naver\.com$/.test(host)) return '네이버 블로그';
    if (/(^|\.)cafe\.naver\.com$/.test(host)) return '네이버 카페';
    if (/(^|\.)(place|map|m\.place)\.naver\.com$/.test(host)) return '네이버 플레이스·지도';
    if (/(^|\.)adcr\.naver\.com$/.test(host)) return '네이버 광고 클릭 (자동 추적 미설정 — 키워드 확인 불가)';
    if (/(^|\.)search\.naver\.com$/.test(host)) return '네이버 검색 (자연 유입 또는 자동 추적 미설정)';
    if (/(^|\.)naver\.com$/.test(host)) return `네이버 (${host})`;
    if (/(^|\.)instagram\.com$/.test(host)) return '인스타그램';
    if (/(^|\.)(facebook|fb)\.com$/.test(host)) return '페이스북';
    if (/(^|\.)google\./.test(host)) return '구글 검색';
    if (/(^|\.)(daum\.net|kakao\.com)$/.test(host)) return '다음·카카오';
    return `외부 링크 (${host})`;
  }

  return '직접 유입 (주소 입력·북마크·메신저·앱 내 브라우저 등)';
};

// 클라이언트가 보낸 키를 그대로 메일에 찍지 않고 형식을 검사한다.
const KEY_OK = /^[A-Za-z0-9_]{1,40}$/;
const KEY_ORDER = [
  'n_query', 'n_keyword', 'n_keyword_id', 'n_rank', 'n_ad', 'n_ad_group',
  'n_campaign_type', 'n_ad_group_type', 'n_media', 'n_contract', 'NaPm',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'referrer', 'landing', 'landed_at',
];

const dumpSource = (src, indent = '  ') => {
  const keys = Object.keys(src)
    .filter((k) => KEY_OK.test(k) && typeof src[k] !== 'object' && safe(src[k]))
    .sort((a, b) => {
      const ia = KEY_ORDER.indexOf(a);
      const ib = KEY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    })
    .slice(0, 30);
  if (!keys.length) return `${indent}(파라미터 없음)`;
  return keys.map((k) => `${indent}${k}: ${decodeMaybe(safe(src[k]))}`).join('\n');
};

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

  // 광고 유입 경로 — 네이버 자동추적(n_*), utm 태깅, 클릭 ID, referrer를 요약 + 원본으로 남긴다.
  const src = (body.source && typeof body.source === 'object') ? body.source : {};
  const first = (src.first_touch && typeof src.first_touch === 'object') ? src.first_touch : null;
  const sourceSummary = describeSource(src);
  const sourceBlock = [
    `요약: ${sourceSummary}`,
    first ? `최초 유입: ${describeSource(first)} (${safe(first.landed_at)})` : '',
    '',
    '[이번 방문 원본 파라미터]',
    dumpSource(src),
    first ? '' : null,
    first ? '[최초 유입 원본 파라미터]' : null,
    first ? dumpSource(first) : null,
  ].filter((line) => line !== null && line !== '').join('\n');

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
      subject: `[상담신청] ${name || type || '문의'} / ${phone || email} · ${sourceSummary}`,
      text: [
        `이름/상호: ${name || '(미기재 — 상단 체크리스트 폼)'}`,
        `연락처: ${phone || '(미기재)'}`,
        `이메일: ${email || '(미기재)'}`,
        `현재 상태: ${status || '-'}`,
        `문의 유형: ${type || '-'}`,
        `문의 내용: ${memo || '-'}`,
        '',
        '── 유입 경로 ──',
        sourceBlock,
      ].join('\n'),
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: '메일 전송 중 오류가 발생했습니다.' });
  }
};
