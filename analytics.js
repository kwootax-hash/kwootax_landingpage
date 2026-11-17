/* 방문·클릭 기록 — 모든 페이지 공통.
 *
 * 세 가지를 한 파일에서 올린다.
 *   1) GA4            숫자. 유입경로별 방문, 이벤트 건수
 *   2) Clarity        클릭 히트맵과 세션 녹화
 *   3) 자체 클릭 수집  전화·카톡·CTA 버튼처럼 "눌렀는지"가 중요한 곳
 *
 * 아이디를 바꿀 일이 생기면 아래 두 줄만 고친다. 페이지 HTML은 건드릴 필요 없다.
 * 메타 픽셀과 네이버 로그분석은 index.html에 따로 들어가 있다 (네이버 쪽은
 * 광고 검수 대상이라 발급본을 그대로 둬야 해서 옮기지 않았다).
 */
(function () {
  'use strict';

  var GA4_ID = 'G-QDW6G1MEEV';           // Google Analytics 측정 ID (속성: 세무회계 경우)
  var CLARITY_ID = 'zex3dhmofi';         // Microsoft Clarity 프로젝트 ID

  var ON = function (id, mark) {
    return id && id.indexOf(mark) === -1;
  };

  /* ---------- GA4 ---------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  if (ON(GA4_ID, 'PLACEHOLDER')) {
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(g);
    gtag('js', new Date());
    // 개인정보가 주소줄을 타고 넘어가지 않게 한다. 폼은 주소줄을 안 쓰지만
    // 나중에 쿼리스트링을 붙일 일이 생겨도 안전하게.
    gtag('config', GA4_ID, { anonymize_ip: true });
  }

  /* ---------- Microsoft Clarity ---------- */
  if (ON(CLARITY_ID, 'PLACEHOLDER')) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1;
      t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  /* ---------- 공통 기록 창구 ----------
   * 페이지 어디서든 kwLog('이름', {키:값}) 한 줄로 세 곳에 같이 보낸다.
   * 측정 도구가 안 붙어 있어도 조용히 넘어간다.
   */
  var seen = {};
  window.kwLog = function (name, params, once) {
    if (once) {
      if (seen[name]) return;
      seen[name] = true;
    }
    try { if (window.gtag) gtag('event', name, params || {}); } catch (e) {}
    try { if (window.clarity) clarity('event', name); } catch (e) {}
    try { if (window.fbq) fbq('trackCustom', name, params || {}); } catch (e) {}
  };

  /* ---------- 클릭 수집 ----------
   * 전화·카톡·메일은 눌린 순간이 사실상 문의다. 폼 제출만 보면 놓친다.
   */
  function label(el) {
    var t = (el.getAttribute('aria-label') || el.textContent || '').trim();
    return t.replace(/\s+/g, ' ').slice(0, 60);
  }

  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a,button') : null;
    if (!a) return;

    var href = (a.getAttribute('href') || '').trim();
    var where = a.closest('[data-area]');
    var area = where ? where.getAttribute('data-area') : (a.closest('header') ? 'header' : 'body');

    if (/^tel:/i.test(href)) {
      kwLog('click_tel', { area: area });
      return;
    }
    if (/^mailto:/i.test(href)) {
      kwLog('click_email', { area: area });
      return;
    }
    if (/(kakao|pf\.kakao|open\.kakao)/i.test(href)) {
      kwLog('click_kakao', { area: area });
      return;
    }
    if (a.hasAttribute('data-track')) {
      kwLog(a.getAttribute('data-track'), { area: area, label: label(a) });
      return;
    }
    // 폼으로 내려보내는 내부 앵커 = 상담 신청 버튼.
    // 맨 위로 올리는 로고 링크는 상담 의사와 무관해 빼둔다.
    if (href.charAt(0) === '#' && href.length > 1 && href !== '#top') {
      kwLog('click_cta', { target: href.slice(0, 40), label: label(a) });
      return;
    }
    // 사이트 안 다른 페이지로 넘어가는 링크
    if (href && href.charAt(0) === '/') {
      kwLog('click_internal', { to: href.slice(0, 60) });
    }
  }, true);

  /* ---------- 읽은 깊이 ----------
   * 광고로 들어온 사람이 첫 화면만 보고 나갔는지, 끝까지 읽었는지 가린다.
   */
  var marks = [25, 50, 75, 100];
  function depth() {
    var doc = document.documentElement;
    var total = doc.scrollHeight - window.innerHeight;
    if (total <= 0) return;
    var pct = Math.round((window.scrollY || doc.scrollTop) / total * 100);
    for (var i = 0; i < marks.length; i++) {
      if (pct >= marks[i]) kwLog('scroll_' + marks[i], null, true);
    }
  }
  var waiting = false;
  window.addEventListener('scroll', function () {
    if (waiting) return;
    waiting = true;
    requestAnimationFrame(function () { waiting = false; depth(); });
  }, { passive: true });

  /* ---------- 머문 시간 ----------
   * 15초를 넘기면 최소한 읽을 생각은 있었던 방문이다. 오클릭과 가르는 선.
   */
  setTimeout(function () { kwLog('engaged_15s', null, true); }, 15000);
  setTimeout(function () { kwLog('engaged_60s', null, true); }, 60000);

  /* ---------- 서버 방문 기록 (/api/t) ----------
   * GA4도 Clarity도 방문자 IP는 주지 않는다. 그런데 네이버 무효클릭 문의는
   * IP를 요구한다. 그래서 우리 서버에 한 건씩 따로 적는다.
   *
   * 여기서 보내는 건 "브라우저가 하는 말"일 뿐이고, IP·User-Agent 같은
   * 위조하기 어려운 값은 서버가 직접 읽는다. api/t.js 참고.
   */
  var started = Date.now();
  var act = { clicks: 0, moves: 0, scrollMax: 0 };

  document.addEventListener('click', function () { act.clicks += 1; }, true);
  document.addEventListener('mousemove', function () { act.moves += 1; }, { passive: true, capture: true });
  document.addEventListener('touchstart', function () { act.moves += 1; }, { passive: true, capture: true });
  window.addEventListener('scroll', function () {
    var doc = document.documentElement;
    var total = doc.scrollHeight - window.innerHeight;
    if (total <= 0) return;
    var pct = Math.round((window.scrollY || doc.scrollTop) / total * 100);
    if (pct > act.scrollMax) act.scrollMax = Math.min(pct, 100);
  }, { passive: true });

  function params() {
    var out = { referrer: document.referrer || '' };
    try {
      var sp = new URLSearchParams(location.search);
      sp.forEach(function (val, key) {
        // 광고가 붙이는 파라미터만 추린다. 엉뚱한 값까지 서버로 보내지 않게.
        if (/^(n_[a-z_]+|NaPm|utm_[a-z]+|gclid|fbclid)$/i.test(key)) out[key] = String(val).slice(0, 300);
      });
    } catch (e) {}
    return out;
  }

  var reported = false;
  function report() {
    if (reported) return;
    reported = true;
    var payload = {
      landing: location.origin + location.pathname,
      q: params(),
      dwell_ms: Date.now() - started,
      clicks: act.clicks,
      moves: act.moves,
      scroll_max: act.scrollMax,
      screen_w: (window.screen && screen.width) || 0,
      screen_h: (window.screen && screen.height) || 0,
      hw: navigator.hardwareConcurrency || 0,
      langs: (navigator.languages && navigator.languages.length) || 0,
      touch_points: navigator.maxTouchPoints || 0,
      webdriver: navigator.webdriver === true,
      tz: ''
    };
    try { payload.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}

    var body = JSON.stringify(payload);
    // 페이지를 떠나는 중에도 확실히 나가야 해서 sendBeacon을 먼저 쓴다.
    try {
      if (navigator.sendBeacon &&
          navigator.sendBeacon('/api/t', new Blob([body], { type: 'application/json' }))) return;
    } catch (e) {}
    try {
      fetch('/api/t', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: body, keepalive: true });
    } catch (e) {}
  }

  // 떠날 때 보낸다. 체류 시간과 행동이 다 쌓인 뒤라야 봇인지 가릴 수 있다.
  window.addEventListener('pagehide', report);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') report();
  });
  // 탭을 닫지 않고 오래 열어두는 경우를 위해 90초에 한 번은 보낸다.
  setTimeout(report, 90000);
})();
