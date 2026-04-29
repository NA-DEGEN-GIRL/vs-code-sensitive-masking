# Stream Masker

VS Code extension for stream-safe editing of local settings and configuration files.

It visually masks sensitive-looking values in the editor while leaving the real
document unchanged. Copy, paste, editing, and save behavior continue to use the
real value.

## Behavior

- Auto masks common local key-value files and config JSON.
- Masks key-value lines after `=`.
- Masks JSON scalar values after `:`.
- Adds editor title, editor context, and explorer context commands to toggle
  masking for a file.
- Shows a status bar item when the active file is masked.

## Development

```bash
npm install
npm run compile
```

Open this folder in VS Code, press `F5`, and test the extension in the Extension
Development Host window.
