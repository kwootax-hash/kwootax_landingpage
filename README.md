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

## 배포
정적 파일 + 서버리스 함수 구조라 별도 빌드 과정 없이 Vercel에 그대로 배포됩니다.
`package.json`의 `nodemailer` 의존성은 Vercel이 배포 시 자동으로 설치합니다.
