# kwootax_landingpage

세무회계 경우 · 미용실 창업 상담 랜딩페이지 (다크 네이비 + 골드)
인스타그램 광고를 통해 유입되는 예비 미용실 원장님을 타겟으로 합니다.

## 구조
- `index.html` - 메인 페이지 (정적)
- `api/lead.js` - 상담 신청 폼 제출 시 이메일 발송 (Vercel Serverless Function)
- `support.js`, `image-slot.js` - 런타임 스크립트
- `assets/hero-calculator.png` - 히어로 이미지

## 상담 폼 → 이메일 발송 설정 (배포 전 필수)

`api/lead.js`는 Gmail SMTP로 메일을 보냅니다. Vercel 프로젝트의
**Settings → Environment Variables**에 아래 값을 등록해야 폼이 정상 동작합니다.

| 변수명 | 값 | 설명 |
|---|---|---|
| `GMAIL_USER` | `kwoo.tax@gmail.com` | 발신 계정 |
| `GMAIL_APP_PASSWORD` | (앱 비밀번호 16자리) | 아래 방법으로 발급 |
| `LEAD_TO_EMAIL` | `kwoo.tax@gmail.com` | 수신 이메일 (생략 시 GMAIL_USER로 발송) |

### 앱 비밀번호 발급 방법
1. `kwoo.tax@gmail.com` 계정에 2단계 인증(2-Step Verification)이 켜져 있어야 합니다.
2. https://myaccount.google.com/apppasswords 접속 → 로그인
3. 앱 이름을 입력하고(예: "경우 랜딩페이지") 생성 → 16자리 비밀번호 발급
4. 이 비밀번호를 Vercel 환경변수 `GMAIL_APP_PASSWORD`에 등록 (공백 없이)

환경변수 등록 후에는 Vercel에서 재배포(Redeploy)해야 반영됩니다.

## 유입 경로 추적 (광고인지 블로그인지, 어떤 키워드인지)

상담 신청 메일 제목 뒤에 유입 경로 요약이 붙고, 본문 아래에 원본 파라미터가 남습니다.
예: `[상담신청] 홍길동 / 010-... · 네이버 검색광고 · 키워드: 미용실세무 · 검색어: 미용실 세무사 · 순위: 2`

구분 기준은 순서대로 이렇습니다.

1. `n_*` 파라미터 → 네이버 검색광고 (키워드·실제 검색어·노출순위까지 확인 가능)
2. `utm_*` → 광고 URL에 직접 붙인 태깅
3. `fbclid` / `gclid` → 메타(인스타·페북) / 구글 광고
4. 파라미터가 없으면 referrer 도메인으로 대분류 (네이버 블로그 / 플레이스 / 자연검색 / 인스타 등)
5. 아무것도 없으면 '직접 유입'

### 네이버 검색광고 키워드를 보려면 (필수 설정)

네이버는 UTM을 자동으로 붙여주지 않습니다. **네이버 검색광고 관리시스템의
자동 추적(Auto Tracking) 기능을 켜야** 광고 클릭 시 랜딩 URL에 `n_query`(실제 검색어),
`n_keyword`(구매 키워드), `n_rank`(노출 순위), `n_ad_group`, `n_ad` 등이 붙습니다.
관리시스템의 '도구' 메뉴에서 설정하며, 메뉴 명칭은 개편될 수 있으니 '자동 추적' 또는
'로그 분석' 항목을 찾아 켜주세요.

이 기능을 켜기 전까지는 광고 유입이 `네이버 광고 클릭 (자동 추적 미설정)` 또는
`네이버 검색 (자연 유입 또는 자동 추적 미설정)`으로만 표기됩니다.

자동 추적을 못 켜는 경우, 광고그룹별 랜딩 URL에 직접 붙여도 같은 효과가 납니다.
`https://도메인/?utm_source=naver&utm_medium=cpc&utm_campaign=<그룹명>&utm_term=<키워드>`

### 최초 유입 기록

광고로 처음 들어왔다가 며칠 뒤 직접 방문해 문의하는 경우가 많아,
브라우저 `localStorage`에 최초 유입 경로를 남겨 메일에 `최초 유입:` 줄로 함께 보냅니다.
광고 성과가 '직접 유입'으로 사라지지 않게 하기 위한 장치입니다.

## 배포
정적 파일 + 서버리스 함수 구조라 별도 빌드 과정 없이 Vercel에 그대로 배포됩니다.
`package.json`의 `nodemailer` 의존성은 Vercel이 배포 시 자동으로 설치합니다.
