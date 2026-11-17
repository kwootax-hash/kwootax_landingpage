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
  var CLARITY_ID = 'CLARITY_PLACEHOLDER'; // Microsoft Clarity 프로젝트 ID

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
})();
