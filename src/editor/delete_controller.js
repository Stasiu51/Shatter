import { selectionStore } from '../editor/selection_store.js';

/**
 * Deletes the current selection (gates, connections, polygons, qubits if safe) and commits.
 * @param {import('./editor_state.js').EditorState} editorState
 * @param {number} currentLayer
 * @param {(msg:string, sev?:'info'|'warning'|'error')=>void} pushStatus
 */
export function deleteSelection(editorState, currentLayer, pushStatus = ()=>{}) {
  if (!editorState) return false;
  const snap = selectionStore.snapshot();
  if (!snap || !snap.kind || snap.selected.size === 0) return false;
  const c = editorState.copyOfCurAnnotatedCircuit();
  let changed = false;

  const removeGate = (layerIdx, firstQid) => {
    try {
      const layer = c.layers[layerIdx];
      if (!layer) return;
      if (layer.id_pop_at) layer.id_pop_at(parseInt(firstQid)); else layer.id_ops.delete(parseInt(firstQid));
      changed = true;
    } catch {}
  };
  const removeConnection = (sheetName, a, b) => {
    const q1 = Math.min(a,b), q2 = Math.max(a,b);
    for (let r = Math.min(currentLayer, c.layers.length-1); r >= 0; r--) {
      const anns = c.layers[r].annotations || [];
      for (let i=0;i<anns.length;i++) {
        const aobj = anns[i];
        if (!aobj || aobj.kind !== 'ConnSet') continue;
        const s = aobj.sheet?.name || aobj.sheet || 'DEFAULT';
        if (String(s) !== String(sheetName)) continue;
        const edges = Array.isArray(aobj.edges) ? aobj.edges : [];
        const next = edges.filter(e => !(Array.isArray(e) && e.length===2 && (Math.min(e[0],e[1])===q1 && Math.max(e[0],e[1])===q2)));
        if (next.length !== edges.length) {
          aobj.edges = next;
          changed = true;
          if (aobj.edges.length === 0) anns.splice(i,1);
          return;
        }
      }
    }
  };
  const removePolygon = (layerIdx, polyIndex) => {
    try {
      const anns = c.layers[layerIdx].annotations || [];
      const k = anns.findIndex(a => a && a.kind==='Polygon' && (a.polyIndex===parseInt(polyIndex)));
      if (k >= 0) { anns.splice(k,1); changed = true; }
    } catch {}
  };
  const qubitIsReferenced = (qid) => {
    const q = parseInt(qid);
    try {
      for (const layer of c.layers) {
        for (const op of layer.iter_gates_and_markers()) {
          if (op.id_targets && op.id_targets.includes(q)) return true;
        }
        const anns = layer.annotations || [];
        for (const a of anns) {
          if (!a) continue;
          if (a.kind === 'Polygon') {
            const ids = Array.isArray(a.targets) ? a.targets : [];
            if (ids.some(v=>parseInt(v)===q)) return true;
          } else if (a.kind === 'ConnSet') {
            const edges = Array.isArray(a.edges) ? a.edges : [];
            for (const e of edges) {
              if (Array.isArray(e) && e.length===2 && (parseInt(e[0])===q || parseInt(e[1])===q)) return true;
            }
          }
        }
      }
    } catch {}
    return false;
  };
  const removeQubitIfUnused = (qid) => {
    const q = parseInt(qid);
    if (qubitIsReferenced(q)) return;
    try { if (c.qubit_coords) c.qubit_coords.delete(q); } catch {}
    try { if (c.qubits) c.qubits.delete(q); } catch {}
    changed = true;
  };

  const kind = snap.kind;
  for (const id of snap.selected) {
    const parts = String(id).split(':');
    if (kind === 'gate') {
      const layerIdx = parseInt(parts[1]);
      const first = parseInt(parts[2]);
      removeGate(layerIdx, first);
    } else if (kind === 'connection') {
      const sheet = parts[1];
      const [a,b] = parts[2].split('-').map(v=>parseInt(v));
      removeConnection(sheet, a, b);
    } else if (kind === 'polygon') {
      const layerIdx = parseInt(parts[1]);
      const polyIndex = parseInt(parts[2]);
      removePolygon(layerIdx, polyIndex);
    } else if (kind === 'qubit') {
      removeQubitIfUnused(parts[1]);
    }
  }

  if (changed) {
    editorState._pendingDesc = 'Delete selection';
    editorState.commit(c);
    // Clear selection for deleted items so the inspector doesn't reference stale ids.
    try { selectionStore.clear(); } catch {}
    pushStatus('Deleted selection.', 'info');
    return true;
  } else {
    pushStatus('Nothing to delete.', 'warning');
    return false;
  }
}
