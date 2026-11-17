/* 방문 한 건을 서버에서 기록한다.
 *
 * 왜 따로 만드는가. GA4와 Clarity는 방문자 IP를 주지 않는다 (둘 다 개인정보라
 * 수집 단계에서 지운다). 그런데 네이버 "무효클릭 문의하기"가 요구하는 항목이
 * 클릭 일시 · 유입 IP · 키워드 · 광고주 URL 네 가지다. IP가 빠지면 접수가 안 된다.
 * 그래서 우리 서버가 직접 받아 적는다.
 *
 * 남기는 값은 두 갈래다.
 *   서버가 본 것   IP, User-Agent, 접속 국가·도시, 서버 시각  — 위조가 어렵다
 *   브라우저가 말한 것  체류 시간, 클릭·마우스 움직임 수, 광고 파라미터 — 참고용
 * 증거로서 무게가 다르므로 섞지 않고 나눠 기록한다.
 *
 * 저장은 세 단계로 떨어진다.
 *   1) 무조건  한 줄 JSON을 표준출력에 찍는다 (Vercel 함수 로그)
 *   2) Upstash Redis 환경변수가 있으면 그쪽에 쌓는다 (오래 보관 + 같은 IP 반복 집계)
 *   3) 봇 점수가 높고 광고로 들어온 방문이면 메일로 알린다
 */
const nodemailer = require('nodemailer');

const MAX = 300;
const safe = (v) => String(v == null ? '' : v).replace(/[\r\n\t]/g, ' ').trim().slice(0, MAX);
const num = (v, cap) => {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), cap);
};

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

/* 광고 유입인지, 어느 광고인지. api/lead.js의 판정과 같은 기준을 쓴다. */
function adInfo(q) {
  const p = (k) => safe(q[k]);
  if (p('n_ad') || p('n_keyword') || p('n_keyword_id') || p('n_query') || p('NaPm')) {
    return {
      ad: true,
      channel: '네이버 검색광고',
      keyword: decodeMaybe(p('n_keyword')) || p('n_keyword_id'),
      query: decodeMaybe(p('n_query')),
      rank: p('n_rank'),
      media: p('n_media'),
      adGroup: p('n_ad_group'),
    };
  }
  if (p('utm_source') || p('utm_campaign') || p('utm_term')) {
    return {
      ad: true,
      channel: `${p('utm_source') || '출처미상'} ${p('utm_medium') || ''}`.trim(),
      keyword: decodeMaybe(p('utm_term')),
      query: '',
      rank: '',
      media: '',
      adGroup: p('utm_campaign'),
    };
  }
  if (p('gclid')) return { ad: true, channel: '구글 광고', keyword: '', query: '', rank: '', media: '', adGroup: '' };
  if (p('fbclid')) return { ad: true, channel: '인스타/페이스북 광고', keyword: '', query: '', rank: '', media: '', adGroup: '' };

  const host = refHost(p('referrer'));
  // adcr.naver.com은 네이버 광고 클릭 중계 주소다. 자동추적을 안 켰을 때 여기만 남는다.
  if (/(^|\.)adcr\.naver\.com$/.test(host)) {
    return { ad: true, channel: '네이버 광고 (자동추적 미설정)', keyword: '', query: '', rank: '', media: '', adGroup: '' };
  }
  return { ad: false, channel: host ? `외부 링크 (${host})` : '직접 유입', keyword: '', query: '', rank: '', media: '', adGroup: '' };
}

/* 사람으로 보기 어려운 신호를 모은다.
 *
 * 한 가지만으로 봇이라 단정하지 않는다. 느린 회선에서 바로 뒤로 가기를 눌러도
 * 체류가 짧고, 사생활 보호 브라우저는 화면 크기를 숨긴다. 그래서 점수를 쌓고
 * 근거를 그대로 남겨, 나중에 사람이 보고 판단할 수 있게 한다.
 */
function suspicion(v) {
  const hits = [];
  const add = (w, why) => hits.push({ w, why });

  const ua = v.ua || '';
  if (!ua) add(3, 'User-Agent 없음');
  if (/(headless|phantomjs|puppeteer|playwright|selenium|webdriver|python-requests|curl|wget|scrapy|axios|okhttp|go-http-client|java\/)/i.test(ua)) {
    add(4, `자동화 도구 User-Agent: ${ua.slice(0, 80)}`);
  }
  if (/(bot|crawler|spider|slurp)/i.test(ua) && !/(googlebot|bingbot|yeti|daumoa)/i.test(ua)) {
    add(3, `봇으로 표기된 User-Agent: ${ua.slice(0, 80)}`);
  }
  if (v.webdriver) add(4, 'navigator.webdriver = true (자동 조종 중인 브라우저)');

  // 광고를 눌렀다면 referrer가 남아야 정상이다. 없는 채로 광고 파라미터만 있으면
  // 주소를 직접 만들어 때린 흔적일 수 있다.
  if (v.ad && !v.referrer) add(2, '광고 파라미터는 있는데 referrer가 없음');

  if (v.dwell_ms > 0 && v.dwell_ms < 1500) add(2, `체류 ${v.dwell_ms}ms`);
  if (v.clicks === 0 && v.moves === 0 && v.scroll_max === 0 && v.dwell_ms > 0) {
    add(3, '클릭·마우스 이동·스크롤이 전혀 없음');
  }
  if (v.touch_points === 0 && v.moves === 0 && /mobile|android|iphone/i.test(ua)) {
    add(2, '모바일 User-Agent인데 터치 지원이 0');
  }
  if (v.screen_w === 0 || v.screen_h === 0) add(1, '화면 크기를 읽을 수 없음');
  if (v.hw === 0) add(1, 'hardwareConcurrency = 0');
  if (v.langs === 0) add(2, 'navigator.languages 가 비어 있음');
  if (v.tz && v.country && v.tz.indexOf('Seoul') === -1 && v.country === 'KR') {
    add(1, `국내 IP인데 브라우저 시간대가 ${v.tz}`);
  }

  const score = hits.reduce((s, h) => s + h.w, 0);
  return { score, reasons: hits.map((h) => h.why) };
}

/* ---- Upstash Redis (있을 때만) ----
 * REST 방식이라 패키지를 깔 필요가 없다. 환경변수가 없으면 통째로 건너뛴다.
 */
const R_URL = process.env.UPSTASH_REDIS_REST_URL;
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const redisOn = !!(R_URL && R_TOKEN);

async function redis(cmd) {
  if (!redisOn) return null;
  try {
    const r = await fetch(R_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${R_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.result !== undefined ? j.result : null;
  } catch (e) {
    return null;
  }
}

// 메일 폭주 방지. Redis가 있으면 정확히, 없으면 인스턴스가 살아있는 동안만 막는다.
let lastMailAt = 0;
async function mayMail(ip) {
  const now = Date.now();
  if (redisOn) {
    const key = `botmail:${ip}`;
    const n = await redis(['INCR', key]);
    if (n === 1) await redis(['EXPIRE', key, '3600']);
    return n === 1;
  }
  if (now - lastMailAt < 10 * 60 * 1000) return false;
  lastMailAt = now;
  return true;
}

async function alert(record, repeats) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, LEAD_TO_EMAIL } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return;
  const t = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  const lines = [
    '네이버 "무효클릭 문의하기"에 그대로 넣을 수 있는 형식입니다.',
    '',
    `클릭 일시(KST): ${record.at_kst}`,
    `유입 IP:        ${record.ip}`,
    `키워드:         ${record.keyword || '(자동추적 미설정 — 확인 불가)'}`,
    `검색어:         ${record.query || '-'}`,
    `광고주 URL:     ${record.landing}`,
    '',
    '── 서버가 확인한 값 ──',
    `채널:        ${record.channel}`,
    `국가/도시:   ${record.country || '-'} / ${record.city || '-'}`,
    `User-Agent:  ${record.ua || '(없음)'}`,
    `referrer:    ${record.referrer || '(없음)'}`,
    repeats ? `같은 IP 최근 1시간 방문: ${repeats}회` : '',
    '',
    '── 브라우저가 보고한 값 (참고) ──',
    `체류:        ${record.dwell_ms}ms`,
    `클릭 ${record.clicks}회 · 마우스이동 ${record.moves}회 · 최대 스크롤 ${record.scroll_max}%`,
    '',
    `── 의심 근거 (점수 ${record.score}) ──`,
    record.reasons.map((r) => `· ${r}`).join('\n'),
    '',
    '이 메일은 증거 보관용입니다. 지우지 말고 라벨로 모아두세요.',
  ].filter((l) => l !== '').join('\n');

  try {
    await t.sendMail({
      from: `"세무회계 경우 방문기록" <${GMAIL_USER}>`,
      to: LEAD_TO_EMAIL || GMAIL_USER,
      subject: `[의심클릭 ${record.score}점] ${record.ip} · ${record.channel}${record.keyword ? ` · ${record.keyword}` : ''}`,
      text: lines,
    });
  } catch (e) {
    /* 메일이 실패해도 기록 자체는 이미 남았다 */
  }
}

module.exports = async (req, res) => {
  // 측정이 사이트를 느리게 만들면 안 된다. 어떤 경우에도 빨리 끊는다.
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const q = (b.q && typeof b.q === 'object') ? b.q : {};
  const h = req.headers || {};

  // x-forwarded-for의 맨 앞이 실제 접속자다. 뒤쪽은 거쳐온 프록시 주소.
  const ip = safe(String(h['x-forwarded-for'] || '').split(',')[0]) || safe(h['x-real-ip']);
  const now = new Date();
  const info = adInfo(q);

  const v = {
    ua: safe(h['user-agent']),
    referrer: safe(q.referrer),
    ad: info.ad,
    country: safe(h['x-vercel-ip-country']),
    city: safe(h['x-vercel-ip-city']),
    dwell_ms: num(b.dwell_ms, 3600000),
    clicks: num(b.clicks, 9999),
    moves: num(b.moves, 99999),
    scroll_max: num(b.scroll_max, 100),
    screen_w: num(b.screen_w, 20000),
    screen_h: num(b.screen_h, 20000),
    hw: num(b.hw, 512),
    langs: num(b.langs, 50),
    touch_points: num(b.touch_points, 20),
    webdriver: b.webdriver === true,
    tz: safe(b.tz),
  };

  const s = suspicion(v);

  const record = {
    at_utc: now.toISOString(),
    at_kst: new Date(now.getTime() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' KST',
    ip,
    ua: v.ua,
    country: v.country,
    city: v.city,
    landing: safe(b.landing),
    referrer: v.referrer,
    channel: info.channel,
    is_ad: info.ad,
    keyword: info.keyword,
    query: info.query,
    rank: info.rank,
    media: info.media,
    ad_group: info.adGroup,
    dwell_ms: v.dwell_ms,
    clicks: v.clicks,
    moves: v.moves,
    scroll_max: v.scroll_max,
    tz: v.tz,
    score: s.score,
    reasons: s.reasons,
  };

  // 1) 함수 로그. Vercel 대시보드에서 "HITLOG"으로 검색하면 전부 나온다.
  console.log('HITLOG ' + JSON.stringify(record));

  // 저장을 끝낸 뒤에 응답한다. 응답을 먼저 보내면 서버리스 인스턴스가 그 자리에서
  // 얼어붙어 뒤따르는 저장과 메일이 사라진다. 방문자는 sendBeacon으로 보내고
  // 기다리지 않으므로 여기서 시간을 써도 페이지가 느려지지 않는다.
  let repeats = 0;
  if (redisOn) {
    const day = record.at_utc.slice(0, 10);
    await redis(['LPUSH', `hits:${day}`, JSON.stringify(record)]);
    await redis(['EXPIRE', `hits:${day}`, String(60 * 60 * 24 * 400)]);  // 400일 보관
    if (ip) {
      const c = await redis(['INCR', `ipcnt:${ip}`]);
      if (c === 1) await redis(['EXPIRE', `ipcnt:${ip}`, '3600']);
      repeats = Number(c) || 0;
      if (record.is_ad && repeats > 1) {
        await redis(['ZADD', `repeat:${day}`, String(repeats), ip]);
        await redis(['EXPIRE', `repeat:${day}`, String(60 * 60 * 24 * 400)]);
      }
    }
  }

  // 3) 광고로 들어온 의심 방문만 알린다. 자연 유입까지 메일이 오면 안 본다.
  if (record.is_ad && (record.score >= 5 || repeats >= 5)) {
    if (await mayMail(ip || 'unknown')) await alert(record, repeats);
  }

  res.status(204).end();
};
