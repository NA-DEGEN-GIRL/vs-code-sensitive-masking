import * as vscode from 'vscode';

const manualMaskUris = new Set<string>();
const manualUnmaskUris = new Set<string>();
const dotEnvName = `.${'env'}`;
const previewScheme = 'stream-masker-preview';

let decorationType: vscode.TextEditorDecorationType;
let statusBarItem: vscode.StatusBarItem;
let previewProvider: MaskedPreviewProvider;

export function activate(context: vscode.ExtensionContext) {
  previewProvider = new MaskedPreviewProvider();
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
    vscode.commands.registerCommand('streamMasker.toggleCurrentFile', toggleCurrentFile),
    vscode.commands.registerCommand('streamMasker.maskCurrentFile', (uri?: vscode.Uri) => setManualMask(uri, true)),
    vscode.commands.registerCommand('streamMasker.unmaskCurrentFile', (uri?: vscode.Uri) => setManualMask(uri, false)),
    vscode.commands.registerCommand('streamMasker.openMaskedPreview', openMaskedPreview),
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
