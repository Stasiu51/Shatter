export function setupLayerKeyboard({isEditing, getLayer, setLayer, getMaxLayer}) {
  function onKey(e) {
    if (isEditing?.()) return;
    const k = e.key?.toLowerCase();
    if (k === 'q' || k === 'e') {
      e.preventDefault();
      const delta = (e.shiftKey ? 5 : 1) * (k === 'q' ? -1 : 1);
      setLayer(getLayer() + delta);
    } else if (k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault();
      const delta = (e.shiftKey ? 5 : 1) * (k === 'arrowleft' ? -1 : 1);
      setLayer(getLayer() + delta);
    }
  }
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

