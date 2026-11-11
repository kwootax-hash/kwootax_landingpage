# -*- coding: utf-8 -*-
"""미용실 창업 세무 가이드 원고를 blog/ 아래 정적 페이지로 만든다.

원고는 startup-blog 저장소의 마크다운이다. 글을 고칠 일이 생기면 마크다운을
고치고 저장소 루트에서 `python tools/build_blog.py`를 돌리면 된다.
원고 위치가 다르면 BLOG_SRC 환경변수로 넘긴다.
"""
import html
import io
import json
import os
import re
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SRC = os.environ.get("BLOG_SRC") or os.path.expanduser(
    os.path.join("~", "startup-blog", "01_미용실창업")
)
OUT = os.path.join(ROOT, "blog")

SITE = "https://kwootax.co.kr"
PUBLISHED = "2026-09-14"
MODIFIED = "2026-10-30"
SERIES = "미용실 창업 세무 가이드"

POSTS = [
    dict(
        n="01", file="01_미용실-창업-세금.md", slug="hair-salon-startup-tax",
        desc="미용실 창업하면 내야 하는 세금은 부가세·종합소득세·직원 세금 세 가지입니다. 처음 샵을 여는 디자이너가 알아야 할 기본만 쉽게 정리했습니다.",
        card="부가세·종합소득세·직원 세금. 창업 전에 알아야 할 세 가지만 먼저.",
    ),
    dict(
        n="02", file="02_미용실-사업자등록.md", slug="business-registration",
        desc="미용실 사업자등록은 면허·위생교육, 구청 영업신고, 세무서 등록 순서입니다. 단계별 준비 서류와 시기를 정리했습니다.",
        card="면허·위생교육 → 구청 영업신고 → 세무서. 순서와 준비 서류.",
    ),
    dict(
        n="03", file="03_미용실-간이과세자.md", slug="simplified-vs-general-taxpayer",
        desc="미용실 창업할 때 간이과세자와 일반과세자 중 무엇을 고를지, 인테리어 비용과 예상 매출을 기준으로 비교했습니다.",
        card="인테리어에 돈이 많이 들어가면 답이 달라집니다. 기준을 짚어봅니다.",
    ),
    dict(
        n="04", file="04_미용실-인테리어-부가세.md", slug="interior-vat-refund",
        desc="미용실 인테리어·샴푸대·의자·기계를 살 때 낸 부가세를 돌려받으려면 어떤 영수증이 필요한지 정리했습니다.",
        card="영수증 한 장 차이로 돌려받느냐가 갈립니다. 챙길 증빙 세 가지.",
    ),
    dict(
        n="05", file="05_미용실-현금영수증.md", slug="cash-receipt",
        desc="미용실 오픈 첫 달 결제받을 때 알아둘 것. 카드·현금·계좌이체 처리와 현금영수증 의무 발급을 정리했습니다.",
        card="계좌이체도 현금입니다. 미용실은 현금영수증 의무 발급 업종이에요.",
    ),
    dict(
        n="06", file="06_미용실-직원-4대보험.md", slug="employee-insurance",
        desc="미용실 첫 직원을 뽑을 때 4대보험과 3.3% 프리랜서는 무엇이 다른지, 계약 전에 확인할 점을 정리했습니다.",
        card="이름보다 실제로 어떻게 일하는지가 기준입니다. 계약 전에 확인할 것.",
    ),
    dict(
        n="07", file="07_미용실-세금-신고-기간.md", slug="tax-calendar",
        desc="미용실 원장님이 기억할 1년 세금 달력. 1월·5월·7월 신고와 고지서가 오는 달을 한 장으로 정리했습니다.",
        card="1월·5월·7월. 달력에 한 번만 적어두면 되는 날짜들.",
    ),
    dict(
        n="08", file="08_1인-미용실-세무사.md", slug="solo-salon-accountant",
        desc="1인 미용실도 세무사가 필요할까요? 혼자 신고할 때와 맡길 때를 비용과 시간을 기준으로 비교했습니다.",
        card="필수는 아닙니다. 혼자 할 때와 맡길 때를 솔직하게 비교했습니다.",
    ),
]

# 원고에 남아 있는 내부 메모. 공개 페이지에는 싣지 않는다.
NOTE_RE = re.compile(r"^\[확인 필요:.*\]$")
IMG_RE = re.compile(r"^!\[(.*?)\]\(images/(.+?)\)$")


def inline(text):
    """escape한 뒤 굵은 글씨만 되살린다."""
    out = html.escape(text, quote=False)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)


def read_post(meta):
    path = os.path.join(SRC, meta["file"])
    lines = io.open(path, encoding="utf-8").read().splitlines()

    title = lines[0].lstrip("# ").strip()

    # 본문은 서명 블록 전까지. 서명과 안내 문구는 우리 쪽 컴포넌트로 다시 만든다.
    end = len(lines)
    for i, line in enumerate(lines):
        if line.startswith("**세무회계 경우"):
            end = i
            break
    body = [l for l in lines[1:end] if not NOTE_RE.match(l.strip())]

    blocks, buf = [], []
    for line in body:
        if line.strip():
            buf.append(line)
        elif buf:
            blocks.append(buf)
            buf = []
    if buf:
        blocks.append(buf)

    cover = None
    parts, faqs = [], []
    for block in blocks:
        first = block[0].strip()

        m = IMG_RE.match(first)
        if m:
            alt, fname = m.group(1), m.group(2)
            if cover is None:
                cover = (alt, fname)
                continue
            parts.append(
                '<figure class="shot">'
                '<img src="../images/%s" alt="%s" width="1080" height="1080" loading="lazy" decoding="async">'
                "</figure>" % (fname, html.escape(alt, quote=True))
            )
            continue

        if first.startswith("## "):
            parts.append("<h2>%s</h2>" % inline(first[3:].strip()))
            continue

        if first.startswith("- "):
            items = "".join("<li>%s</li>" % inline(l.strip()[2:]) for l in block)
            parts.append("<ul>%s</ul>" % items)
            continue

        if first.startswith("**Q."):
            q = re.sub(r"^\*\*Q\.\s*|\*\*$", "", first).strip()
            a = " ".join(l.strip() for l in block[1:])
            a = re.sub(r"^A\.\s*", "", a).strip()
            faqs.append((q, a))
            parts.append(
                '<div class="faq"><p class="q">%s</p><p class="a">%s</p></div>'
                % (inline(q), inline(a))
            )
            continue

        parts.append("<p>%s</p>" % "<br>".join(inline(l.strip()) for l in block))

    return dict(meta, title=title, cover=cover, body="\n      ".join(parts), faqs=faqs)


HEAD = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} | 세무회계 경우</title>
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" href="/icon-512.png" sizes="512x512">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index, follow">

<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="세무회계 경우">
<meta property="og:locale" content="ko_KR">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{image}">

<link rel="preconnect" href="https://fastly.jsdelivr.net" crossorigin="">
<link rel="stylesheet" href="https://fastly.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<link rel="stylesheet" href="/site.css">
{jsonld}
</head>
<body>
<header class="bar">
  <div class="bar-in">
    <a class="brand" href="/">
      <span class="mark">경우</span>
      <span class="name">세무회계 경우</span>
    </a>
    <nav class="bar-nav">
      <a href="/hair-salon-tax/">미용실 세무</a>
      <a href="{blog_home}">세무 가이드</a>
      <a class="btn-sm" href="/#contact">무료 상담 신청</a>
    </nav>
  </div>
</header>
"""

FOOT = """<footer class="foot">
  <div class="foot-in">
    <div class="foot-brand">
      <span class="mark">경우</span>
      <span class="name">세무회계 경우</span>
    </div>
    <div class="foot-info">
      <div class="foot-label">사무소 정보</div>
      <div>경기도 용인시 기흥구 흥덕2로 117번길 19, 201호</div>
      <div>대표전화 <a href="tel:010-4572-7449">010-4572-7449</a></div>
      <div>사업자등록번호 119-35-01663</div>
    </div>
  </div>
  <div class="foot-end">© 2026 세무회계 경우. All rights reserved.</div>
</footer>
</body>
</html>
"""

CTA = """<aside class="cta">
        <p class="cta-label">세무회계 경우 · 장근준 대표세무사</p>
        <p class="cta-line">경찰 출신 세무사, 이제는 시민이 아니라 대표님의 세금을 지킵니다.</p>
        <a class="btn" href="/#contact">무료 상담 신청하기</a>
        <p class="cta-sub"><a href="/hair-salon-tax/">미용실 세무, 무엇을 맡길 수 있는지 보기 →</a></p>
      </aside>
      <p class="note">개인 상황에 따라 달라질 수 있으니 자세한 내용은 상담으로 확인하세요.</p>"""


def jsonld(obj):
    return '<script type="application/ld+json">\n%s\n</script>' % json.dumps(
        obj, ensure_ascii=False, indent=2
    )


def build_post(p, prev_post, next_post):
    url = "%s/blog/%s/" % (SITE, p["slug"])
    cover_alt, cover_file = p["cover"]
    image = "%s/blog/images/%s" % (SITE, cover_file)

    graph = [{
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": p["title"],
        "description": p["desc"],
        "image": image,
        "url": url,
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "datePublished": PUBLISHED,
        "dateModified": MODIFIED,
        "inLanguage": "ko-KR",
        "isPartOf": {"@type": "Blog", "name": SERIES, "url": SITE + "/blog/"},
        "author": {"@type": "Person", "name": "장근준", "jobTitle": "세무사"},
        "publisher": {
            "@type": "AccountingService",
            "name": "세무회계 경우",
            "url": SITE + "/",
            "telephone": "+82-10-4572-7449",
        },
    }]
    if p["faqs"]:
        graph.append({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": q,
                    "acceptedAnswer": {"@type": "Answer", "text": a},
                }
                for q, a in p["faqs"]
            ],
        })
    blocks = "\n".join(jsonld(g) for g in graph)

    nav = []
    if prev_post:
        nav.append(
            '<a class="seq prev" href="../%s/"><span>이전 글</span><strong>%s</strong></a>'
            % (prev_post["slug"], html.escape(prev_post["title"], quote=False))
        )
    if next_post:
        nav.append(
            '<a class="seq next" href="../%s/"><span>다음 글</span><strong>%s</strong></a>'
            % (next_post["slug"], html.escape(next_post["title"], quote=False))
        )

    head = HEAD.format(
        title=html.escape(p["title"], quote=True),
        desc=html.escape(p["desc"], quote=True),
        url=url, image=image, blog_home="../",
        og_type="article", jsonld=blocks,
    )

    page = """%s<main class="wrap">
  <article class="post">
    <p class="crumb"><a href="/">홈</a> <span>/</span> <a href="../">%s</a></p>
    <p class="kicker">%s · %s번째 글</p>
    <h1>%s</h1>
    <figure class="cover">
      <img src="../images/%s" alt="%s" width="1080" height="1080" fetchpriority="high" decoding="async">
    </figure>
    <div class="body">
      %s
      %s
    </div>
    <nav class="seqs">%s</nav>
  </article>
</main>
%s""" % (
        head, SERIES, SERIES, int(p["n"]),
        html.escape(p["title"], quote=False),
        cover_file, html.escape(cover_alt, quote=True),
        p["body"], CTA, "".join(nav), FOOT,
    )
    folder = os.path.join(OUT, p["slug"])
    os.makedirs(folder, exist_ok=True)
    io.open(os.path.join(folder, "index.html"), "w", encoding="utf-8").write(page)
    return url


def build_index(posts):
    url = SITE + "/blog/"
    desc = "미용실을 처음 여는 디자이너를 위한 세무 가이드 8편. 사업자등록부터 부가세, 직원 4대보험, 1년 세금 달력까지 순서대로 정리했습니다."
    image = "%s/blog/images/%s" % (SITE, posts[0]["cover"][1])

    graph = [
        {
            "@context": "https://schema.org",
            "@type": "Blog",
            "name": SERIES,
            "description": desc,
            "url": url,
            "inLanguage": "ko-KR",
            "publisher": {"@type": "AccountingService", "name": "세무회계 경우", "url": SITE + "/"},
        },
        {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": i + 1,
                    "url": "%s/blog/%s/" % (SITE, p["slug"]),
                    "name": p["title"],
                }
                for i, p in enumerate(posts)
            ],
        },
    ]
    blocks = "\n".join(jsonld(g) for g in graph)

    head = HEAD.format(
        title="미용실 창업 세무 가이드", desc=html.escape(desc, quote=True),
        url=url, image=image, blog_home="./",
        og_type="website", jsonld=blocks,
    )

    cards = []
    for i, p in enumerate(posts):
        cards.append(
            """<a class="card" href="%s/">
        <div class="thumb"><img src="images/%s" alt="%s" width="1080" height="1080" loading="%s" decoding="async"></div>
        <div class="card-txt">
          <span class="num">%02d</span>
          <h2>%s</h2>
          <p>%s</p>
        </div>
      </a>"""
            % (
                p["slug"], p["cover"][1], html.escape(p["title"], quote=True),
                "eager" if i < 2 else "lazy", i + 1,
                html.escape(p["title"], quote=False), html.escape(p["card"], quote=False),
            )
        )

    page = """%s<main class="wrap">
  <section class="lead">
    <p class="crumb"><a href="/">홈</a> <span>/</span> 세무 가이드</p>
    <p class="kicker">%s</p>
    <h1>미용실 열기 전에<br><span class="thin">한 번씩 읽어두면 좋은 글</span></h1>
    <p class="lead-txt">사업자등록부터 부가세, 첫 직원 4대보험, 1년 세금 달력까지.<br>처음 샵을 여는 디자이너가 자주 묻는 순서 그대로 8편으로 정리했습니다.</p>
    <p class="lead-txt"><a class="inline-link" href="/hair-salon-tax/">읽기 전에 미용실 세무를 무엇까지 맡길 수 있는지 보기 →</a></p>
  </section>
  <section class="cards">
    %s
  </section>
  <aside class="cta wide">
    <p class="cta-label">읽다가 내 샵은 어떤지 궁금해지면</p>
    <p class="cta-line">창업 단계에 맞춰 무엇부터 챙기면 되는지 알려드립니다. 상담은 무료입니다.</p>
    <a class="btn" href="/#contact">무료 상담 신청하기</a>
  </aside>
</main>
%s""" % (head, SERIES, "\n    ".join(cards), FOOT)

    io.open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)
    return url


def main():
    os.makedirs(OUT, exist_ok=True)

    img_out = os.path.join(OUT, "images")
    os.makedirs(img_out, exist_ok=True)
    for name in sorted(os.listdir(os.path.join(SRC, "images"))):
        if name.lower().endswith(".png"):
            shutil.copyfile(os.path.join(SRC, "images", name), os.path.join(img_out, name))

    posts = [read_post(m) for m in POSTS]
    urls = [build_index(posts)]
    for i, p in enumerate(posts):
        urls.append(build_post(p, posts[i - 1] if i else None, posts[i + 1] if i + 1 < len(posts) else None))

    print("생성한 주소 %d개" % len(urls))
    for u in urls:
        print(" ", u)


if __name__ == "__main__":
    main()
