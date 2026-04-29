# Codex Notes

This repository contains a local VS Code extension named Stream Masker.

## Project Shape

- Extension entrypoint: `src/extension.ts`
- Compiled output: `dist/extension.js`
- Extension manifest: `package.json`
- User-facing docs: `README.md`
- Packaged VSIX files are ignored and should not be committed.

## Core Commands

```bash
npm install
npm run compile
npx --yes @vscode/vsce package --out stream-masker-local.vsix
code --install-extension stream-masker-local.vsix --force
```

After installing a new VSIX, reload VS Code with:

```text
Developer: Reload Window
```

## Design Notes

- The decoration-based masking mode is convenient but cannot guarantee zero-frame secrecy while editing in the default text editor.
- The Secure Editor is the safer editing path. It should not send original values to the Webview unless the user explicitly clicks the reveal button.
- The Secure Editor edits values by replacing the detected value range. It intentionally does not prefill inputs with existing secrets.
- Empty key-value entries such as `KEY=` must still produce an editable Secure Editor row.
- Files containing `.example` should remain outside default automatic masking behavior unless explicitly opened or masked by the user.

## Safety Checks Before Commit

```bash
npm run compile
git diff --check
```

Also run a targeted `rg` scan for local absolute paths, usernames, private-key headers, and realistic secret-looking sample values.

Only commit source, docs, manifest, and project config changes. Do not commit `node_modules`, `dist`, `.vsix` packages, or local agent files.
