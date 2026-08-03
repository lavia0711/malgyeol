# 말결

> 마음에 오래 남는 단어의 결을 찾으세요.

뜻과 분위기로 아름다운 한국어 단어를 발견하는 웹사이트입니다.
창작자와 이름을 짓는 사용자가 정확한 사전 검색과 감성적인 단어 큐레이션을
한 화면에서 이용할 수 있도록 만들었습니다.

[말결 사용해 보기](https://malgyeol.geonwoomoon.chatgpt.site)

![말결 소셜 미리보기](./public/og.png)

## 주요 기능

- 맑음·포근함·설렘·고요·빛남·그리움·굳셈·신비의 8가지 분위기
- 분위기별 15개, 총 120개의 엄선된 한국어 단어
- 단어·뜻·편집자 해설·분위기·창작 용도를 아우르는 통합 검색
- 정확 일치, 접두어 일치, 오타 유사도 순으로 정렬하는 MiniSearch 검색
- 검색을 시작할 때만 8개 사전 청크를 Web Worker에서 점진 색인하는 지연 로딩
- 날짜가 같으면 동일하게 유지되는 오늘의 단어
- 전체 사전 단어도 새로고침 뒤 복원되는 로그인 없는 찜 목록
- 주소·브라우저 기록과 동기화되는 Radix 기반 접근 가능한 단어 상세 패널
- `Ctrl/⌘ + K` 검색 단축키와 axe 기반 접근성 회귀 검사
- 운영체제 공유 기능과 링크 복사 대체 동작
- 360px 모바일부터 데스크톱까지 대응하는 반응형 화면
- 키보드 탐색, 초점 이동, 상태 알림 등 기본 접근성 지원
- Open Graph 및 X 대형 카드 메타데이터

## 기술 스택

| 구분 | 기술 |
| --- | --- |
| UI | React 19, TypeScript, Next.js |
| 빌드·런타임 | [vinext](https://github.com/cloudflare/vinext), Vite |
| 검색 | [MiniSearch](https://github.com/lucaong/minisearch) |
| 아이콘 | [Lucide](https://github.com/lucide-icons/lucide) |
| 글꼴 | 시스템 산세리프, [Fontsource](https://github.com/fontsource/fontsource)의 Gowun Batang |
| 데이터 | 국립국어원 한국어기초사전 파생 데이터 |
| 배포 | OpenAI Sites |

## 시작하기

Node.js 22.13 이상이 필요합니다.

```bash
git clone <repository-url>
cd malgyeol
npm install
npm run dev
```

개발 서버가 안내하는 로컬 주소를 브라우저에서 열면 됩니다.

## 명령어

```bash
# 개발 서버
npm run dev

# 프로덕션 빌드
npm run build

# 빌드와 자동 테스트
npm test

# lint, TypeScript, 빌드, 단위·E2E·접근성 전체 검사
npm run check

# Chromium E2E·접근성 검사
npm run test:e2e

# ESLint 검사
npm run lint

# 한국어기초사전 검색 데이터 재생성
npm run build:data
```

## 사전 데이터 만들기

검색 데이터는
[korean-dict-nikl](https://github.com/spellcheck-ko/korean-dict-nikl)의
한국어기초사전 XML을 기반으로 만듭니다. 원본을
`work/korean-dict-nikl/krdict`에 준비한 뒤 다음 명령을 실행합니다.

```bash
npm run build:data
```

변환 스크립트는 표제어, 품사, 발음 텍스트, 첫 번째 뜻풀이만 추출해
compact tuple 형식의 청크와 manifest를 만듭니다.
재배포가 제한될 수 있는 예문·음성·이미지·동영상은 결과에 포함하지 않습니다.
사용한 원본 커밋과 생성 정보는 `public/data/dictionary-meta.json`에 기록됩니다.

## 프로젝트 구조

```text
app/
├─ data/words.ts          # 120개 선별 단어와 공용 데이터 타입
├─ globals.css            # 디자인 토큰과 반응형 스타일
├─ dictionary.worker.ts   # 전체 사전 점진 색인·검색 워커
├─ layout.tsx             # 사이트 메타데이터와 OG 연결
└─ page.tsx               # 검색, 필터, 찜, 공유, 상세 다이얼로그
docs/
├─ PRD.md
├─ FEATURE_SPEC.md
├─ USER_FLOW.md
└─ WIREFRAME.md
public/
├─ data/                  # 빌드된 사전 검색 데이터
└─ og.png                 # 1200×630 소셜 미리보기
scripts/
├─ build-dictionary.mjs   # 한국어기초사전 XML 변환
└─ serve-built.mjs        # 교차 플랫폼 프로덕션 서버
tests/
├─ e2e/                   # Chromium 기능·접근성 회귀 테스트
└─ rendered-html.test.mjs # 렌더링·데이터·OG 회귀 테스트
```

## 제품 문서

- [PRD](./docs/PRD.md)
- [기능 명세서](./docs/FEATURE_SPEC.md)
- [유저 플로우](./docs/USER_FLOW.md)
- [와이어프레임](./docs/WIREFRAME.md)

## 데이터와 라이선스

- 애플리케이션 코드: [MIT](./LICENSE)
- 사전 파생 데이터와 편집 데이터:
  [CC BY-SA 2.0 KR](./DATA_LICENSE.md)
- 사전 원본 제공자: 국립국어원

코드와 데이터의 라이선스 범위가 다르므로 재사용하거나 재배포할 때 각각의
조건을 확인해 주세요.

## 배포

현재 프로덕션 버전은 다음 주소에서 확인할 수 있습니다.

<https://malgyeol.geonwoomoon.chatgpt.site>
