# Stream Masker

Stream Masker는 VS Code 에디터에서 민감해 보이는 설정값을 화면상으로만 가려 주는 로컬 확장 프로그램입니다.

파일 내용 자체는 바꾸지 않습니다. 편집, 복사, 붙여넣기, 저장은 모두 원본 값 기준으로 동작하고, 에디터에 보이는 값만 `********` 같은 문자열로 덮어 보여 줍니다.

## 언제 쓰나요?

- 방송이나 화면 공유 중 로컬 설정 파일을 열어야 할 때
- API 키, 토큰, 비밀번호처럼 보이는 값을 실수로 노출하고 싶지 않을 때
- 실제 파일 내용은 그대로 유지하면서 화면에만 값을 숨기고 싶을 때

## 실제로 사용하려면

디버깅 모드로 `F5`를 누르는 방식은 개발 테스트용입니다.

내 VS Code에서 계속 사용하려면 이 확장을 `.vsix` 파일로 만든 뒤 VS Code에 설치해야 합니다.

## 설치 순서

### 1. 이 프로젝트 폴더로 이동

터미널에서 이 저장소 폴더로 이동합니다.

```bash
cd vs-code-sensitive-masking
```

### 2. 필요한 패키지 설치

처음 한 번만 실행하면 됩니다.

```bash
npm install
```

### 3. 확장 빌드

TypeScript 코드를 VS Code가 실행할 수 있는 JavaScript 파일로 컴파일합니다.

```bash
npm run compile
```

성공하면 별도 에러 없이 종료됩니다.

### 4. VSIX 파일 만들기

VS Code 확장은 `.vsix` 파일로 설치할 수 있습니다.

```bash
npx @vscode/vsce package
```

처음 실행하면 `@vscode/vsce`를 설치할지 물어볼 수 있습니다. 물어보면 `y`를 입력하면 됩니다.

성공하면 현재 폴더에 아래와 비슷한 파일이 생깁니다.

```text
vscode-stream-masker-0.0.1.vsix
```

### 5. VS Code에 설치

터미널에서 설치하려면 다음 명령을 실행합니다.

```bash
code --install-extension vscode-stream-masker-0.0.1.vsix
```

이미 설치된 확장을 새 버전으로 다시 설치하려면 `--force`를 붙입니다.

```bash
code --install-extension vscode-stream-masker-0.0.1.vsix --force
```

설치 후 VS Code 창을 한 번 다시 로드하면 됩니다.

Command Palette를 열고 아래 명령을 실행해도 됩니다.

```text
Developer: Reload Window
```

## 화면에서 설치하는 방법

터미널 명령 대신 VS Code 화면에서도 설치할 수 있습니다.

1. VS Code를 엽니다.
2. 왼쪽 Extensions 아이콘을 누릅니다.
3. Extensions 패널 오른쪽 위의 `...` 메뉴를 누릅니다.
4. `Install from VSIX...`를 선택합니다.
5. 생성된 `.vsix` 파일을 선택합니다.
6. 설치가 끝나면 VS Code 창을 다시 로드합니다.

## 설치 확인

설치 후 Command Palette에서 아래 명령을 검색해 봅니다.

```text
Stream Masker: Toggle Current File Masking
```

명령이 보이면 확장이 설치된 것입니다.

## 사용 방법

### 자동 마스킹

마스킹 대상 파일을 열면 값이 자동으로 가려집니다.

기본 자동 마스킹 대상은 다음과 같습니다.

- dot-env 형식의 로컬 환경 파일
- 경로에 `secret`이 들어간 파일
- 경로에 `credential`이 들어간 파일
- 경로에 `token`이 들어간 파일
- 경로에 `apikey`가 들어간 파일
- 경로에 `api-key`가 들어간 파일
- 경로에 `config`가 들어간 파일
- 사용자가 `streamMasker.extraAutoMaskGlobs` 설정에 추가한 파일

파일명에 `.example`이 들어간 샘플 파일은 기본 자동 마스킹에서 제외됩니다.

### 수동 마스킹 켜기/끄기

현재 열린 파일에서 마스킹을 켜거나 끄려면 Command Palette를 열고 다음 명령을 실행합니다.

```text
Stream Masker: Toggle Current File Masking
```

또는 에디터 우클릭 메뉴에서 `Stream Masker: Toggle Current File Masking`을 선택할 수 있습니다.

### 탐색기에서 마스킹 제어

VS Code 왼쪽 파일 탐색기에서 파일을 우클릭하면 다음 명령을 사용할 수 있습니다.

```text
Stream Masker: Mask Current File
Stream Masker: Unmask Current File
```

## 어떻게 보이나요?

예를 들어 파일에 이런 값이 있을 때:

```text
API_TOKEN=sample-value
```

에디터에서는 값 부분이 아래처럼 가려져 보입니다.

```text
API_TOKEN=********
```

하지만 실제 파일 내용은 바뀌지 않습니다.

## 설정 변경

VS Code 설정 파일에서 확장 설정을 바꿀 수 있습니다.

### 사용자 전체 설정

모든 프로젝트에 적용하려면 Command Palette에서 아래 명령을 실행합니다.

```text
Preferences: Open User Settings (JSON)
```

그리고 설정을 추가합니다.

```json
{
  "streamMasker.mask": "********",
  "streamMasker.extraAutoMaskGlobs": [
    "**/local.settings.json",
    "**/*.private.json"
  ]
}
```

### 현재 프로젝트에만 적용

현재 프로젝트에만 적용하려면 프로젝트 안의 아래 파일에 설정합니다.

```text
.vscode/settings.json
```

예시:

```json
{
  "streamMasker.extraAutoMaskGlobs": [
    "**/my-secret-file.json"
  ]
}
```

## 설정 항목

### `streamMasker.mask`

화면에 표시할 마스킹 문자열입니다.

기본값:

```json
"streamMasker.mask": "********"
```

예시:

```json
"streamMasker.mask": "[hidden]"
```

### `streamMasker.extraAutoMaskGlobs`

자동 마스킹할 파일 경로 패턴을 추가합니다.

기본값:

```json
"streamMasker.extraAutoMaskGlobs": []
```

예시:

```json
"streamMasker.extraAutoMaskGlobs": [
  "**/local.settings.json",
  "**/*.private.json",
  "**/service-account.json"
]
```

## 업데이트 방법

코드를 수정한 뒤 실제 설치된 확장에 반영하려면 다시 패키징하고 재설치해야 합니다.

```bash
npm run compile
npx @vscode/vsce package
code --install-extension vscode-stream-masker-0.0.1.vsix --force
```

그 다음 VS Code 창을 다시 로드합니다.

## 삭제 방법

터미널에서 삭제하려면 다음 명령을 실행합니다.

```bash
code --uninstall-extension local.vscode-stream-masker
```

VS Code 화면에서는 Extensions 패널에서 `Stream Masker`를 검색한 뒤 `Uninstall`을 누르면 됩니다.

## 개발 모드로 실행

확장을 설치하지 않고 테스트하려면 이 폴더를 VS Code에서 연 뒤 `F5`를 누릅니다.

그러면 Extension Development Host 창이 열리고, 그 창에서 Stream Masker를 테스트할 수 있습니다.

만약 VS Code가 디버거 종류를 묻는다면 `Node.js`가 아니라 `VS Code Extension Development` 또는 `Extension Host` 계열을 선택해야 합니다. 이 저장소에는 `.vscode/launch.json`이 포함되어 있으므로 보통은 `Run Extension` 설정이 자동으로 선택됩니다.

## 프로젝트 명령어

```bash
npm install
npm run compile
npm run watch
```

## 주의 사항

- 이 확장은 화면 표시만 가립니다. 파일 내용 자체를 암호화하거나 삭제하지 않습니다.
- 복사, 저장, Git 커밋, 터미널 출력 등은 원본 값을 그대로 사용할 수 있습니다.
- 방송이나 화면 공유 전에 실제로 대상 파일이 마스킹되어 보이는지 확인하세요.
- 샘플 파일이라도 수동으로 `Mask Current File`을 실행하면 마스킹할 수 있습니다.
