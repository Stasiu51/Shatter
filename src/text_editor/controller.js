import { setupResizablePane } from '../util/ui_utils.js';

/**
 * Sets up the right-hand text editor pane's collapse and resizer behaviour.
 * Persists width/collapsed in localStorage and updates toggle labels.
 */
export function setupTextEditorUI({
  editorEl,
  resizerEl,
  toggleGlobalEl,   // header toolbar button (Show/Hide editor)
  toggleLocalEl,    // inside editor header (Hide)
  textareaEl,
  rootStyle,
  onResizing,       // optional: re-render panels/timeline during drag
  onResized,        // optional: re-render panels/timeline after drag
}) {
  // Initialize label according to state.
  const updateToggleText = (collapsed) => {
    if (toggleGlobalEl) toggleGlobalEl.textContent = collapsed ? 'Show editor' : 'Hide editor';
    if (toggleLocalEl) toggleLocalEl.textContent = collapsed ? 'Show' : 'Hide';
  };

  const paneCtl = setupResizablePane({
    paneEl: editorEl,
    resizerEl,
    rootStyle,
    cssVar: '--editor-width',
    lsWidthKey: 'editorWidth',
    lsCollapsedKey: 'editorCollapsed',
    defaultWidthPx: 360,
    toggleEls: [toggleGlobalEl, toggleLocalEl],
    onCollapsedChanged: (c) => {
      updateToggleText(c);
    },
    onResizing,
    onResized,
    updateToggleText,
  });

  // Optional: basic textarea sizing to avoid accidental page scroll glitches.
  function syncTextareaRows() {
    if (!textareaEl) return;
    // Ensure the textarea fits its container; rely on CSS for width/height.
  }
  window.addEventListener('resize', syncTextareaRows);

  // Public controls
  return {
    setCollapsed: paneCtl.setCollapsed,
    getCollapsed: paneCtl.getCollapsed,
    setWidthPx: paneCtl.setWidthPx,
    getWidthPx: paneCtl.getWidthPx,
  };
}

