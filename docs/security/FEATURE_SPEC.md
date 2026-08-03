# 보안 강화 기능 명세

## SEC-01 고정 Canonical Origin

- 운영 기준 URL은 `https://malgyeol.geonwoomoon.chatgpt.site`로 고정한다.
- 요청의 `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`는 메타데이터 URL 생성에 사용하지 않는다.
- Open Graph와 X 카드 이미지는 고정 기준 URL에서 생성한다.

## SEC-02 응답 보안 헤더

- `Content-Security-Policy`: 동일 출처 리소스를 기본으로 허용하고 객체·프레임·외부 form 제출을 제한한다.
- `Strict-Transport-Security`: HTTPS 재접속을 강제한다.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`: 카메라, 마이크, 위치, 결제, USB를 비활성화한다.
- 개발 중 Vite 연결을 위해 개발 환경에서만 WebSocket 연결과 eval을 허용한다.

## SEC-03 공급망 보호

- checkout, Node 설정, CodeQL Action을 공식 저장소의 전체 커밋 SHA에 고정한다.
- Dependabot이 npm과 GitHub Actions 업데이트를 매주 확인한다.
- CodeQL이 JavaScript/TypeScript를 push, pull request, 주간 일정으로 분석한다.
- CI에서 운영 의존성의 high 이상 알려진 취약점을 검사한다.

## SEC-04 보안 신고

- `SECURITY.md`에 지원 범위, 비공개 신고 원칙, 포함해야 할 재현 정보를 기록한다.
