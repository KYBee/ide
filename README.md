# Session Control

<img width="3552" height="1442" alt="image" src="https://github.com/user-attachments/assets/764b5f2c-5af7-41b8-9377-b4db0cbd11d8" />

Session Control은 터미널 기반 AI 작업 세션을 관리하기 위한 로컬 데스크톱/웹 앱입니다.

Codex, Claude Code, Gemini, shell, 개발 서버, 빌드, 테스트, 로그처럼 오래 살아 있는 터미널 작업을 한곳에서 보고 다루는 관제실을 목표로 합니다. 세션의 지속성은 `tmux`가 담당하고, Session Control은 그 위에 대시보드 UI와 내장 터미널을 얹습니다.

이 프로젝트는 macOS와 Linux를 우선 지원합니다.

현재 앱은 MVP/개발 빌드 단계입니다. macOS에서는 개발 스택을 켜는 로컬 Dock 런처를 제공합니다. 완전히 패키징된 `Session Control.app`은 이후 목표이며, 지금 단계의 사용성 테스트에는 필수는 아닙니다.

## 왜 만들었나

AI 코딩 에이전트는 보통 CLI 도구로 터미널 안에서 실행됩니다. Codex, Claude, Gemini, shell, 개발 서버, 로그 세션이 여러 개 떠 있으면 금방 이런 질문들이 생깁니다.

- 어떤 세션이 살아 있나?
- 각 에이전트가 어느 프로젝트 경로에서 작업 중인가?
- 어떤 에이전트가 입력을 기다리고 있나?
- 작업을 죽이지 않고 다시 붙을 수 있나?
- Codex, Claude, Gemini, shell 작업을 한 화면에서 볼 수 있나?

Session Control은 `tmux` 위에서 이 문제를 풀려고 합니다.

```text
Electron desktop app
  -> React dashboard
  -> local Node backend
  -> tmux sessions
  -> Codex / Claude / Gemini / shell / build commands
```

iTerm2, Terminal.app, Terminator, Ghostty, Tabby, Hyper 같은 터미널 에뮬레이터를 대체하려는 앱은 아닙니다. 그런 앱들은 터미널이고, Session Control은 세션 관제실입니다.

## 주요 기능

- 기존 로컬 `tmux` 세션 목록 보기
- 새로운 tmux 기반 작업 세션 시작
- 세션 시작 전에 작업 디렉터리 선택
- Codex, Claude, Gemini, Shell 세션 실행
- 선택한 세션을 xterm.js 내장 터미널로 attach
- Electron 앱이 닫혀도 tmux 세션 유지
- tmux 세션 rename/kill
- 세션 생성 후 메타데이터 수정
- 프로젝트 경로 또는 AI 에이전트 타입 기준으로 세션 그룹화
- 앱에서 tmux window 관리
- 선택한 에이전트 명령으로 tmux split 생성
- pane snapshot 캡처
- 오른쪽 패널에 Codex skill/tool 메타데이터 표시
- web, API, tmux 파싱, tmux window 생성 흐름을 확인하는 smoke test 제공

## 현재 UI

앱은 세 개의 패널로 구성됩니다.

```text
왼쪽 사이드바       가운데 작업 영역              오른쪽 패널
----------------    -------------------------     --------------------
세션 목록            xterm.js 터미널 attach        세션 메타데이터
경로/AI 그룹          tmux window controls          액션 버튼
새 세션 생성          tmux split controls           agent tools
작업 경로 선택        reconnect                     snapshot
```

가운데 작업 영역에는 실제 attach된 터미널 세션이 표시됩니다. Codex, Claude, Gemini 세션이라면 실행 중인 에이전트 대화창이 이 영역에 보입니다.

## 세션 모델

### tmux 세션

`tmux`는 오래 유지되어야 하는 작업의 source of truth입니다.

Session Control이 종료되어도 tmux 세션은 계속 살아 있습니다. 앱을 다시 켜면 기존 tmux 세션을 다시 목록으로 가져오고 attach할 수 있습니다.

예시:

```bash
tmux new-session -s codex-linktrip
tmux attach-session -t codex-linktrip
tmux list-sessions
```

iTerm2, Terminal.app, Terminator, 원격 shell에서 만든 세션도 같은 머신의 tmux 세션이라면 Session Control에서 발견할 수 있습니다.

### pty 세션

백엔드는 tmux 없이 직접 pty 세션도 실행할 수 있습니다. 다만 이 방식은 persistent하지 않습니다. 백엔드가 종료되면 해당 프로세스도 같이 종료될 수 있습니다.

중요하거나 오래 실행할 작업은 tmux를 사용하는 것이 좋습니다.

## 지원 에이전트

현재 실행 컨트롤은 다음 명령을 지원합니다.

- Codex: `codex`
- Claude: `claude`
- Gemini: `agy`
- Shell: 시작 명령 없이 기본 shell 실행

이 에이전트 매핑은 왼쪽 사이드바의 세션 시작, tmux window 생성, tmux pane split에서 공통으로 사용됩니다. 그래서 같은 에이전트 선택은 항상 같은 명령으로 실행됩니다.

## 기술 스택

- Desktop: Electron
- Frontend: React, Vite, xterm.js
- Backend: Node.js, Express, WebSocket
- Terminal bridge: `@homebridge/node-pty-prebuilt-multiarch`
- Session runtime: `tmux`
- Config: YAML
- Tests: Node 내장 `node:test`, smoke test script
- macOS launcher: 작은 네이티브 런처 바이너리를 포함한 로컬 `.app` wrapper

처음 제품 방향을 잡을 때는 Go 백엔드도 고려했습니다. 현재 저장소는 Electron/Vite 워크스페이스와 MVP 구현에 잘 맞는 Node 기반으로 구성되어 있습니다.

## 요구사항

- macOS 또는 Linux
- Node.js 20+
- npm
- tmux

## 설치

```bash
npm install
```

## 실행

데스크톱 개발 앱:

```bash
npm run dev:desktop
```

이 명령은 다음 프로세스를 실행합니다.

- Electron desktop shell
- React/Vite renderer: `http://127.0.0.1:3634`
- Local backend: `http://127.0.0.1:3635`

아직 개발용 Electron 런타임을 사용하기 때문에 macOS에서는 실제 창 프로세스나 아이콘이 `Electron`으로 보일 수 있습니다. 아래 macOS 런처는 편의용 런처이며, 완전히 패키징된 앱은 아닙니다.

브라우저 전용 개발 실행:

```bash
npm run dev
```

이후 브라우저에서 엽니다.

```text
http://127.0.0.1:3634
```

## macOS 런처

저장소에는 Dock에서 실행하기 편한 로컬 런처를 설치할 수 있는 스크립트가 있습니다.

```bash
npm run install:launcher
open "Session Control Launcher.app"
```

런처는 다음 흐름으로 동작합니다.

```text
Session Control Launcher.app
  -> native launcher binary
  -> scripts/session-control-launcher.zsh
  -> isolated tmux runtime socket
  -> server, web, and Electron desktop processes
```

내부 런타임 세션은 `session-control-runtime`이라는 별도의 tmux socket을 사용합니다. 그래서 사용자가 관리하는 일반 Session Control 세션 목록에는 내부 server/web/desktop 세션이 보이지 않습니다.

현재 한계:

- 이 런처는 macOS 전용입니다.
- 실제 창은 여전히 개발용 Electron 런타임을 사용합니다.
- 이후 정식 패키징 단계에서는 이 구조를 실제 `Session Control.app`으로 대체해서 Dock과 메뉴바 정체성을 앱이 직접 가지도록 만드는 것이 목표입니다.

## Linux 사용

핵심 앱은 이미 Linux에서 로컬 웹 대시보드 방식으로 사용할 수 있습니다. 같은 의존성을 설치한 뒤 브라우저 UI 또는 개발용 Electron shell로 실행하면 됩니다.

```bash
npm install
npm run dev
```

이후 브라우저에서 엽니다.

```text
http://127.0.0.1:3634
```

Linux에서 Electron shell을 쓰려면 다음 명령을 사용할 수 있습니다.

```bash
npm run dev:desktop
```

Linux 요구사항:

- `tmux`
- Node.js와 npm
- `bash` 또는 `zsh` 같은 shell
- 선택 사항: `codex`, `claude`, `agy` 같은 agent CLI

macOS `.app` 런처는 Linux에 적용되지 않습니다. 이후 Linux 패키징은 AppImage, `.deb`, 또는 다른 데스크톱 네이티브 포맷으로 추가하는 방향이 좋습니다.
