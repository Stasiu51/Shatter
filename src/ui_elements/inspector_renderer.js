import { selectionStore } from '../editor/selection_store.js';

function ensureListContainer(root) {
  let list = root.querySelector('#inspector-list');
  if (!list) {
    list = document.createElement('div');
    list.id = 'inspector-list';
    list.style.cssText = 'display:flex; flex-direction:column; gap:6px; width:100%; padding:8px; box-sizing:border-box;';
    root.innerHTML = '';
    root.appendChild(list);
  }
  return list;
}

function swatch(color) {
  const el = document.createElement('span');
  el.style.cssText = `display:inline-block; width:12px; height:12px; border-radius:2px; background:${color}; margin-right:8px;`;
  return el;
}

function makeRow({ color, name, line }) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex; align-items:center; font-size:12px; color:#24292f;';
  row.appendChild(swatch(color));
  const text = document.createElement('span');
  const lineTxt = (typeof line === 'number' && line >= 0) ? ` (line ${line+1})` : '';
  text.textContent = `${name}${lineTxt}`;
  row.appendChild(text);
  return row;
}

function resolveNameAndLine(id, kind, circuit, curLayer) {
  try {
    const tokens = id.split(':');
    if (kind === 'qubit' || tokens[0] === 'q') {
      const q = parseInt(tokens[1]);
      const qq = circuit.qubits?.get?.(q);
      const name = qq ? `Qubit ${q} (${qq.stimX},${qq.stimY})` : `Qubit ${q}`;
      const line = qq?.coordsLine;
      return { name, line };
    }
    if (kind === 'gate' || tokens[0] === 'g') {
      const layerIdx = parseInt(tokens[1]);
      const first = parseInt(tokens[2]);
      const op = circuit.layers?.[layerIdx]?.id_ops?.get?.(first);
      if (op) {
        const name = `${op.gate.name} [${[...op.id_targets].join(',')}]`;
        const line = op.line;
        return { name, line };
      }
    }
    if (kind === 'connection' || tokens[0] === 'c') {
      const sheet = tokens[1];
      const [a,b] = tokens[2].split('-').map(s=>parseInt(s));
      // Find latest ConnSet up to curLayer including this edge.
      let best = null;
      for (let r = 0; r <= curLayer && r < circuit.layers.length; r++) {
        const anns = circuit.layers[r].annotations || [];
        for (const aobj of anns) {
          if (!aobj || aobj.kind !== 'ConnSet') continue;
          const sname = aobj.sheet?.name || aobj.sheet || 'DEFAULT';
          if (sname !== sheet) continue;
          const edges = Array.isArray(aobj.edges) ? aobj.edges : [];
          for (const e of edges) {
            const [x,y] = e.map(v=>parseInt(v));
            const m1=Math.min(x,y), m2=Math.max(x,y);
            if (m1===Math.min(a,b) && m2===Math.max(a,b)) best = aobj;
          }
        }
      }
      const name = `Conn ${a}-${b} [${sheet}]`;
      const line = best?.line;
      return { name, line };
    }
    if (kind === 'polygon' || tokens[0] === 'p') {
      const layerIdx = parseInt(tokens[1]);
      const lineNum = parseInt(tokens[2]);
      const anns = circuit.layers?.[layerIdx]?.annotations || [];
      const poly = anns.find(a => a && a.kind === 'Polygon' && a.line === lineNum);
      const count = Array.isArray(poly?.targets) ? poly.targets.length : 0;
      const name = `Polygon [${poly?.sheet || 'DEFAULT'}] (${count} vertices)`;
      const line = poly?.line;
      return { name, line };
    }
  } catch {}
  return { name: id, line: undefined };
}

export function renderInspector({ containerEl, circuit, curLayer }) {
  if (!containerEl) return;
  const list = ensureListContainer(containerEl);
  // Clear list without touching outer container to avoid extension interference.
  while (list.firstChild) list.removeChild(list.firstChild);
  const entries = selectionStore.orderedEntries();
  if (!entries.length) {
    const p = document.createElement('div');
    p.style.cssText = 'padding:8px; color:#6e7781; font-size:12px;';
    p.textContent = 'Nothing selected';
    list.appendChild(p);
    return;
  }
  for (const e of entries) {
    const { name, line } = resolveNameAndLine(e.id, e.kind, circuit, curLayer);
    list.appendChild(makeRow({ color: e.color, name, line }));
  }
}
