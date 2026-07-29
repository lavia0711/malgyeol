# 말결

뜻과 분위기로 아름다운 한국어 단어를 발견하는 웹사이트입니다. 창작자와
이름을 짓는 사용자가 사전 검색과 편집된 단어 컬렉션을 한 화면에서 사용할
수 있습니다.

## 주요 기능

- 8개 분위기, 120개 선별 단어
- MiniSearch 기반 정확·접두·유사 검색
- 한국어기초사전 전체 검색 데이터 지연 로딩
- 오늘의 단어, 브라우저 찜, 공유 주소
- 반응형 화면과 키보드 접근성

## 개발

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run dev
npm run build
npm test
```

한국어기초사전 XML을 `work/korean-dict-nikl/krdict`에 준비한 뒤 검색 데이터를
다시 만들 수 있습니다.

```bash
npm run build:data
```

제품 문서는 `docs/`에서 확인할 수 있습니다.

## 오픈소스 기반

- [vinext](https://github.com/cloudflare/vinext)
- [MiniSearch](https://github.com/lucaong/minisearch)
- [Lucide](https://github.com/lucide-icons/lucide)
- [Pretendard](https://github.com/orioncactus/pretendard)
- [korean-dict-nikl](https://github.com/spellcheck-ko/korean-dict-nikl)

애플리케이션 코드는 MIT 라이선스입니다. 사전 파생 데이터와 편집 데이터는
`DATA_LICENSE.md`의 CC BY-SA 2.0 KR 조건을 따릅니다.

