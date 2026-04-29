import * as vscode from 'vscode';

const manualMaskUris = new Set<string>();
const manualUnmaskUris = new Set<string>();
const dotEnvName = `.${'env'}`;
const previewScheme = 'stream-masker-preview';
const secureEditorViewType = 'streamMasker.secureEditor';

let decorationType: vscode.TextEditorDecorationType;
let statusBarItem: vscode.StatusBarItem;
let previewProvider: MaskedPreviewProvider;
let secureEditorProvider: SecureEditorProvider;

export function activate(context: vscode.ExtensionContext) {
  previewProvider = new MaskedPreviewProvider();
  secureEditorProvider = new SecureEditorProvider(context.extensionUri);
  decorationType = vscode.window.createTextEditorDecorationType({
    color: 'transparent',
    backgroundColor: new vscode.ThemeColor('editor.background'),
    textDecoration: 'none; border-radius: 2px;',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBarItem.text = '$(eye-closed) Masked';
  statusBarItem.tooltip = 'Stream Masker is visually masking this editor. Copy and save still use real values.';
  statusBarItem.command = 'streamMasker.toggleCurrentFile';
  context.subscriptions.push(decorationType, statusBarItem);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(previewScheme, previewProvider),
    vscode.window.registerCustomEditorProvider(secureEditorViewType, secureEditorProvider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
    vscode.commands.registerCommand('streamMasker.toggleCurrentFile', toggleCurrentFile),
    vscode.commands.registerCommand('streamMasker.maskCurrentFile', (uri?: vscode.Uri) => setManualMask(uri, true)),
    vscode.commands.registerCommand('streamMasker.unmaskCurrentFile', (uri?: vscode.Uri) => setManualMask(uri, false)),
    vscode.commands.registerCommand('streamMasker.openMaskedPreview', openMaskedPreview),
    vscode.commands.registerCommand('streamMasker.openSecureEditor', openSecureEditor),
    vscode.window.onDidChangeActiveTextEditor(updateAllEditors),
    vscode.workspace.onDidChangeTextDocument((event) => {
      updateEditorForDocument(event.document);
      previewProvider.refresh(event.document);
    }),
    vscode.workspace.onDidOpenTextDocument((document) => updateEditorForDocument(document)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('streamMasker')) {
        updateAllEditors();
        previewProvider.refreshAll();
      }
    }),
  );

  updateAllEditors();
}

export function deactivate() {
  statusBarItem?.dispose();
  decorationType?.dispose();
}

function toggleCurrentFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const key = editor.document.uri.toString();
  if (isMasked(editor.document)) {
    manualUnmaskUris.add(key);
    manualMaskUris.delete(key);
  } else {
    manualMaskUris.add(key);
    manualUnmaskUris.delete(key);
  }
  updateAllEditors();
}

function setManualMask(uri: vscode.Uri | undefined, masked: boolean) {
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri) return;

  const key = targetUri.toString();
  if (masked) {
    manualMaskUris.add(key);
    manualUnmaskUris.delete(key);
  } else {
    manualUnmaskUris.add(key);
    manualMaskUris.delete(key);
  }
  updateAllEditors();
}

async function openMaskedPreview(uri?: vscode.Uri) {
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri || targetUri.scheme === previewScheme) return;

  const sourceDocument = await vscode.workspace.openTextDocument(targetUri);
  const previewUri = previewProvider.getPreviewUri(sourceDocument.uri);
  const previewDocument = await vscode.workspace.openTextDocument(previewUri);
  await vscode.window.showTextDocument(previewDocument, {
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
  });
}

async function openSecureEditor(uri?: vscode.Uri) {
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri || targetUri.scheme === previewScheme) return;
  await vscode.commands.executeCommand('vscode.openWith', targetUri, secureEditorViewType);
}

function updateAllEditors() {
  for (const editor of vscode.window.visibleTextEditors) {
    updateEditor(editor);
  }
  updateStatusBar();
}

function updateEditorForDocument(document: vscode.TextDocument) {
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.uri.toString() === document.uri.toString()) updateEditor(editor);
  }
  updateStatusBar();
}

function updateEditor(editor: vscode.TextEditor) {
  if (!isMasked(editor.document)) {
    editor.setDecorations(decorationType, []);
    return;
  }

  const mask = vscode.workspace.getConfiguration('streamMasker').get<string>('mask', '********');
  const decorations = findSensitiveRanges(editor.document).map((range) => ({
    range,
    renderOptions: {
      after: {
        contentText: mask,
        color: new vscode.ThemeColor('editor.foreground'),
        margin: `0 0 0 -${rangeLength(editor.document, range)}ch`,
      },
    },
  }));

  editor.setDecorations(decorationType, decorations);
}

class MaskedPreviewProvider implements vscode.TextDocumentContentProvider {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly previewUrisBySource = new Map<string, vscode.Uri>();

  readonly onDidChange = this.changeEmitter.event;

  getPreviewUri(sourceUri: vscode.Uri) {
    const key = sourceUri.toString();
    const existingUri = this.previewUrisBySource.get(key);
    if (existingUri) return existingUri;

    const basename = sourceUri.path.split('/').at(-1) || 'masked';
    const previewUri = vscode.Uri.from({
      scheme: previewScheme,
      authority: 'preview',
      path: `/${basename}.masked`,
      query: encodeURIComponent(key),
    });
    this.previewUrisBySource.set(key, previewUri);
    return previewUri;
  }

  async provideTextDocumentContent(uri: vscode.Uri) {
    const sourceUri = vscode.Uri.parse(decodeURIComponent(uri.query));
    const sourceDocument = await vscode.workspace.openTextDocument(sourceUri);
    return getMaskedDocumentText(sourceDocument);
  }

  refresh(document: vscode.TextDocument) {
    const previewUri = this.previewUrisBySource.get(document.uri.toString());
    if (previewUri) this.changeEmitter.fire(previewUri);
  }

  refreshAll() {
    for (const previewUri of this.previewUrisBySource.values()) {
      this.changeEmitter.fire(previewUri);
    }
  }
}

function getMaskedDocumentText(document: vscode.TextDocument) {
  const mask = vscode.workspace.getConfiguration('streamMasker').get<string>('mask', '********');
  const ranges = findSensitiveRanges(document).sort((first, second) => document.offsetAt(second.start) - document.offsetAt(first.start));
  let text = document.getText();

  for (const range of ranges) {
    const start = document.offsetAt(range.start);
    const end = document.offsetAt(range.end);
    text = `${text.slice(0, start)}${mask}${text.slice(end)}`;
  }

  return text;
}

class SecureEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel) {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    const render = () => {
      webviewPanel.webview.html = getSecureEditorHtml(document, webviewPanel.webview);
    };

    const documentChangeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) render();
    });

    webviewPanel.onDidDispose(() => documentChangeSubscription.dispose());
    webviewPanel.webview.onDidReceiveMessage(async (message: { type: string; id?: string; value?: string }) => {
      if (message.type !== 'replaceValue' || typeof message.id !== 'string' || typeof message.value !== 'string') return;

      const entry = getSensitiveEntries(document).find((candidate) => candidate.id === message.id);
      if (!entry) {
        await webviewPanel.webview.postMessage({ type: 'status', text: 'Value range changed. Try again.' });
        render();
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(entry.line, entry.start, entry.line, entry.end),
        formatReplacementValue(message.value, entry.quoteStyle),
      );

      const applied = await vscode.workspace.applyEdit(edit);
      await webviewPanel.webview.postMessage({
        type: 'status',
        text: applied ? 'Updated. Save the file to persist changes.' : 'Update failed.',
      });
    });

    render();
  }
}

type QuoteStyle = 'none' | 'single' | 'double' | 'json-string';

type SensitiveEntry = {
  id: string;
  line: number;
  start: number;
  end: number;
  label: string;
  quoteStyle: QuoteStyle;
};

function getSecureEditorHtml(document: vscode.TextDocument, webview: vscode.Webview) {
  const nonce = getNonce();
  const entries = getSensitiveEntries(document);
  const entriesByLine = groupEntriesByLine(entries);
  const filename = escapeHtml(document.uri.path.split('/').at(-1) || document.fileName);
  const rows: string[] = [];

  for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
    const lineEntries = entriesByLine.get(lineIndex) ?? [];
    const maskedLine = getMaskedLineText(document.lineAt(lineIndex).text, lineEntries);
    const editors = lineEntries.map((entry) => getEntryEditorHtml(entry)).join('');

    rows.push(`
      <section class="line">
        <div class="line-number">${lineIndex + 1}</div>
        <pre class="line-text">${escapeHtml(maskedLine) || ' '}</pre>
        ${editors ? `<div class="line-editors">${editors}</div>` : ''}
      </section>
    `);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
  >
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Secure Editor</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    body {
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }

    header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-height: 42px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editor-background);
    }

    .title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    #status {
      flex: 0 0 auto;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    main {
      padding: 8px 0 24px;
    }

    .line {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr);
      gap: 0;
      padding: 0 14px;
    }

    .line-number {
      padding: 3px 12px 3px 0;
      color: var(--vscode-editorLineNumber-foreground);
      font-family: var(--vscode-editor-font-family);
      text-align: right;
      user-select: none;
    }

    .line-text {
      min-width: 0;
      margin: 0;
      padding: 3px 0;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family);
      white-space: pre;
    }

    .line-editors {
      grid-column: 2;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 4px 0 8px;
    }

    form {
      display: grid;
      grid-template-columns: minmax(120px, 220px) minmax(160px, 280px) auto;
      align-items: center;
      gap: 8px;
      max-width: 720px;
    }

    label {
      overflow: hidden;
      color: var(--vscode-descriptionForeground);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    input {
      min-width: 0;
      height: 26px;
      padding: 2px 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font: inherit;
    }

    button {
      height: 28px;
      padding: 0 10px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font: inherit;
      cursor: pointer;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <header>
    <div class="title">${filename}</div>
    <div id="status">${entries.length} masked value${entries.length === 1 ? '' : 's'}</div>
  </header>
  <main>${rows.join('')}</main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const status = document.getElementById('status');

    document.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.target;
      const input = form.querySelector('input');
      vscode.postMessage({
        type: 'replaceValue',
        id: form.dataset.id,
        value: input.value,
      });
      input.value = '';
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'status') status.textContent = event.data.text;
    });
  </script>
</body>
</html>`;
}

function getSensitiveEntries(document: vscode.TextDocument): SensitiveEntry[] {
  return findSensitiveRanges(document).map((range, index) => {
    const rawValue = document.getText(range).trim();
    return {
      id: `${range.start.line}:${range.start.character}:${range.end.character}:${index}`,
      line: range.start.line,
      start: range.start.character,
      end: range.end.character,
      label: getSensitiveEntryLabel(document.lineAt(range.start.line).text, range.start.character),
      quoteStyle: getQuoteStyle(document, range, rawValue),
    };
  });
}

function groupEntriesByLine(entries: SensitiveEntry[]) {
  const grouped = new Map<number, SensitiveEntry[]>();
  for (const entry of entries) {
    const lineEntries = grouped.get(entry.line) ?? [];
    lineEntries.push(entry);
    grouped.set(entry.line, lineEntries);
  }
  for (const lineEntries of grouped.values()) {
    lineEntries.sort((first, second) => first.start - second.start);
  }
  return grouped;
}

function getMaskedLineText(line: string, entries: SensitiveEntry[]) {
  if (!entries.length) return line;

  const mask = vscode.workspace.getConfiguration('streamMasker').get<string>('mask', '********');
  let cursor = 0;
  let maskedLine = '';

  for (const entry of entries) {
    maskedLine += line.slice(cursor, entry.start);
    maskedLine += mask;
    cursor = entry.end;
  }

  return `${maskedLine}${line.slice(cursor)}`;
}

function getEntryEditorHtml(entry: SensitiveEntry) {
  const label = escapeHtml(entry.label);
  return `
    <form data-id="${escapeHtml(entry.id)}">
      <label title="${label}">${label}</label>
      <input type="password" autocomplete="off" spellcheck="false" placeholder="New value">
      <button type="submit">Apply</button>
    </form>
  `;
}

function getSensitiveEntryLabel(line: string, valueStart: number) {
  const beforeValue = line.slice(0, valueStart);
  const keyValueMatch = beforeValue.match(/^\s*([^=\s]+)\s*=\s*$/);
  if (keyValueMatch) return keyValueMatch[1];

  const jsonKeyMatch = beforeValue.match(/"((?:\\"|[^"])*)"\s*:\s*$/);
  if (jsonKeyMatch) return jsonKeyMatch[1].replace(/\\"/g, '"');

  return `Line value at column ${valueStart + 1}`;
}

function getQuoteStyle(document: vscode.TextDocument, range: vscode.Range, rawValue: string): QuoteStyle {
  if ((document.languageId === 'json' || document.fileName.toLowerCase().endsWith('.json')) && rawValue.startsWith('"')) {
    return 'json-string';
  }
  if (rawValue.startsWith('"')) return 'double';
  if (rawValue.startsWith("'")) return 'single';
  return 'none';
}

function formatReplacementValue(value: string, quoteStyle: QuoteStyle) {
  if (quoteStyle === 'json-string' || quoteStyle === 'double') return JSON.stringify(value);
  if (quoteStyle === 'single') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getNonce() {
  const source = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) {
    nonce += source[Math.floor(Math.random() * source.length)];
  }
  return nonce;
}

function updateStatusBar() {
  const editor = vscode.window.activeTextEditor;
  if (editor && isMasked(editor.document)) statusBarItem.show();
  else statusBarItem.hide();
}

function isMasked(document: vscode.TextDocument) {
  const key = document.uri.toString();
  if (manualUnmaskUris.has(key)) return false;
  if (manualMaskUris.has(key)) return true;
  return shouldAutoMask(document);
}

function shouldAutoMask(document: vscode.TextDocument) {
  if (document.uri.scheme !== 'file') return false;

  const filename = document.fileName.replace(/\\/g, '/');
  const basename = filename.split('/').at(-1) ?? '';
  if (isExampleFile(basename)) return false;
  if (basename === dotEnvName || basename.startsWith(`${dotEnvName}.`)) return true;
  if (/(secret|credential|token|apikey|api-key|config)/i.test(filename)) return true;

  const extraGlobs = vscode.workspace.getConfiguration('streamMasker').get<string[]>('extraAutoMaskGlobs', []);
  return extraGlobs.some((glob) => globMatches(filename, glob));
}

function isExampleFile(basename: string) {
  return /\.example(?:\.|$)/i.test(basename);
}

function globMatches(filename: string, glob: string) {
  const normalized = glob.replace(/\\/g, '/');
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(filename);
}

function findSensitiveRanges(document: vscode.TextDocument) {
  const ranges: vscode.Range[] = [];
  const isJson = document.languageId === 'json' || document.fileName.toLowerCase().endsWith('.json');

  for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
    const line = document.lineAt(lineIndex).text;
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    if (isJson) {
      ranges.push(...findJsonValueRanges(line, lineIndex));
    } else {
      const range = findKeyValueRange(line, lineIndex);
      if (range) ranges.push(range);
    }
  }

  return ranges;
}

function findKeyValueRange(line: string, lineIndex: number) {
  const equalsIndex = line.indexOf('=');
  if (equalsIndex < 1) return undefined;

  const valueStart = equalsIndex + 1;
  const commentStart = findUnquotedComment(line, valueStart);
  const valueEnd = trimRightIndex(line, commentStart >= 0 ? commentStart : line.length);
  if (valueEnd <= valueStart) return undefined;

  return new vscode.Range(lineIndex, valueStart, lineIndex, valueEnd);
}

function findJsonValueRanges(line: string, lineIndex: number) {
  const ranges: vscode.Range[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    const colonIndex = line.indexOf(':', cursor);
    if (colonIndex < 0) break;

    let valueStart = colonIndex + 1;
    while (line[valueStart] === ' ' || line[valueStart] === '\t') valueStart += 1;
    if (valueStart >= line.length || line[valueStart] === '{' || line[valueStart] === '[') {
      cursor = valueStart + 1;
      continue;
    }

    const valueEnd = findJsonValueEnd(line, valueStart);
    if (valueEnd > valueStart) ranges.push(new vscode.Range(lineIndex, valueStart, lineIndex, valueEnd));
    cursor = Math.max(valueEnd, valueStart + 1);
  }

  return ranges;
}

function findJsonValueEnd(line: string, valueStart: number) {
  if (line[valueStart] === '"') {
    let escaped = false;
    for (let i = valueStart + 1; i < line.length; i += 1) {
      if (escaped) {
        escaped = false;
      } else if (line[i] === '\\') {
        escaped = true;
      } else if (line[i] === '"') {
        return i + 1;
      }
    }
    return line.length;
  }

  let end = valueStart;
  while (end < line.length && line[end] !== ',' && line[end] !== '}') end += 1;
  return trimRightIndex(line, end);
}

function findUnquotedComment(line: string, start: number) {
  let quote: string | undefined;
  for (let i = start; i < line.length; i += 1) {
    const character = line[i];
    if ((character === '"' || character === "'") && line[i - 1] !== '\\') {
      quote = quote === character ? undefined : character;
    }
    if (!quote && character === '#') return i;
  }
  return -1;
}

function trimRightIndex(line: string, end: number) {
  let cursor = end;
  while (cursor > 0 && /\s/.test(line[cursor - 1])) cursor -= 1;
  return cursor;
}

function rangeLength(document: vscode.TextDocument, range: vscode.Range) {
  return document.getText(range).length;
}
