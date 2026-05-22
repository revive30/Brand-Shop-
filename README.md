# AI 디자인 사전 검수 에이전트 v3 clean

완전 리셋용 패키지입니다.

## Vercel 환경변수
필수 1개만 넣어도 동작합니다.

- `ANTHROPIC_API_KEY` = `sk-ant-api03-...`

선택:

- `ANTHROPIC_MODEL` = `claude-sonnet-4-0`

`ANTHROPIC_MODEL`을 넣지 않으면 서버가 자동으로 `claude-sonnet-4-0`을 사용합니다.

## 중요
- 프론트에서 넘어오는 model 값은 서버가 무조건 무시합니다.
- 오래된 `claude-sonnet-4-20250514`가 호출되지 않도록 서버에서 강제 지정합니다.
- GitHub에는 ZIP 파일이 아니라 압축을 푼 내부 파일을 올립니다.
