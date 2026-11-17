// Centred layer-navigation control for a panel header.
//
// Two triangular buttons that do exactly what the layer.prev / layer.next
// keybindings do, plus a hint line naming the modifiers. Holding a modifier
// restyles the control so it is obvious what a click will do before you make
// it: Shift (jump five layers) draws a double triangle, Ctrl (hop to the
// neighbouring bookmark) a triple one, and the matching word in the hint goes
// bold.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Width of one triangle, and the step between stacked triangles. */
const TRI_W = 9;
const TRI_STEP = 6;
const TRI_H = 14;

/**
 * Build an svg holding `count` nested triangles pointing left or right.
 * @param {'left'|'right'} dir
 * @param {number} count 1, 2 or 3
 * @returns {SVGElement}
 */
function trianglesSvg(dir, count) {
  const n = Math.max(1, Math.min(3, count | 0));
  const w = TRI_W + (n - 1) * TRI_STEP;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${TRI_H}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(TRI_H));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'block';
  for (let i = 0; i < n; i++) {
    const path = document.createElementNS(SVG_NS, 'path');
    // A triangle in a TRI_W x TRI_H cell, nudged along by TRI_STEP per copy.
    const d = dir === 'left'
      ? `M ${TRI_W - 1},1 L 1,${TRI_H / 2} L ${TRI_W - 1},${TRI_H - 1} Z`
      : `M 1,1 L ${TRI_W - 1},${TRI_H / 2} L 1,${TRI_H - 1} Z`;
    path.setAttribute('d', d);
    // Left-pointing stacks grow leftwards, right-pointing grow rightwards, so
    // the arrowhead nearest the middle stays put as copies are added.
    const shift = dir === 'left' ? (n - 1 - i) * TRI_STEP : i * TRI_STEP;
    path.setAttribute('transform', `translate(${shift},0)`);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
  }
  return svg;
}

/** Which modifier a mouse or keyboard event is asking for. */
function modifierOf(ev) {
  if (!ev) return 'none';
  if (ev.ctrlKey) return 'ctrl';   // bookmark hop wins when both are held
  if (ev.shiftKey) return 'shift';
  return 'none';
}

/**
 * @param {{
 *   onStep: function(dir: number, modifier: 'none'|'shift'|'ctrl'): void,
 *   getKeyLabels: function(): {prev:string, next:string, fastMod:string, bookmarkMod:string},
 * }} opts
 */
export function createPanelNavWidget({ onStep, getKeyLabels }) {
  const el = document.createElement('div');
  el.className = 'panel-nav';

  const row = document.createElement('div');
  row.className = 'pn-row';

  const mkButton = (dir, step) => {
    const b = document.createElement('button');
    b.className = `pn-btn pn-${dir}`;
    b.type = 'button';
    const tri = document.createElement('span');
    tri.className = 'pn-tri';
    const key = document.createElement('span');
    key.className = 'pn-key';
    // Keep the key label on the outside so the triangles stay adjacent to the
    // middle and the pair reads as one control.
    if (dir === 'left') b.append(tri, key); else b.append(key, tri);
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      try { onStep(step, modifierOf(ev)); } finally {
        // Drop focus so a later Space/Enter does not silently repeat the step.
        try { b.blur(); } catch {}
      }
    });
    return { b, tri, key };
  };

  const prev = mkButton('left', -1);
  const next = mkButton('right', +1);
  row.append(prev.b, next.b);

  const hint = document.createElement('div');
  hint.className = 'pn-hint';
  // One span per whole phrase, so holding a modifier emboldens all of
  // "shift: jump 5" rather than just the word.
  const shiftPhrase = document.createElement('span');
  shiftPhrase.className = 'pn-mod pn-mod-shift';
  const ctrlPhrase = document.createElement('span');
  ctrlPhrase.className = 'pn-mod pn-mod-ctrl';

  el.append(row, hint);

  /** @type {'none'|'shift'|'ctrl'} */
  let modifier = 'none';

  function paint() {
    const labels = (() => {
      try { return getKeyLabels() || {}; } catch { return {}; }
    })();
    const prevKey = labels.prev || 'Q';
    const nextKey = labels.next || 'E';
    const fastMod = labels.fastMod || 'shift';
    const bookmarkMod = labels.bookmarkMod || 'ctrl';

    const count = modifier === 'ctrl' ? 3 : modifier === 'shift' ? 2 : 1;
    prev.tri.replaceChildren(trianglesSvg('left', count));
    next.tri.replaceChildren(trianglesSvg('right', count));
    prev.key.textContent = prevKey;
    next.key.textContent = nextKey;

    const what = modifier === 'ctrl' ? 'to the previous bookmark'
      : modifier === 'shift' ? 'back 5 layers'
      : 'back one layer';
    const whatFwd = modifier === 'ctrl' ? 'to the next bookmark'
      : modifier === 'shift' ? 'forward 5 layers'
      : 'forward one layer';
    prev.b.title = `Step ${what} (${prevKey})`;
    next.b.title = `Step ${whatFwd} (${nextKey})`;

    shiftPhrase.textContent = `${fastMod}: jump 5`;
    ctrlPhrase.textContent = `${bookmarkMod}: next bookmark`;
    shiftPhrase.classList.toggle('active', modifier === 'shift');
    ctrlPhrase.classList.toggle('active', modifier === 'ctrl');
    hint.replaceChildren(shiftPhrase, document.createTextNode('; '), ctrlPhrase);

    el.classList.toggle('mod-shift', modifier === 'shift');
    el.classList.toggle('mod-ctrl', modifier === 'ctrl');
  }

  /** @param {'none'|'shift'|'ctrl'} next */
  function setModifier(m) {
    if (m === modifier) return;
    modifier = m;
    paint();
  }

  paint();
  return { el, render: paint, setModifier, getModifier: () => modifier };
}

/**
 * Track Shift/Ctrl globally and report changes. Also resets on blur, so a
 * modifier released while the window was unfocused cannot stick.
 * @param {function(mod: 'none'|'shift'|'ctrl'): void} onChange
 * @returns {function(): void} teardown
 */
export function watchModifiers(onChange) {
  const emit = (ev) => { try { onChange(modifierOf(ev)); } catch {} };
  const clear = () => { try { onChange('none'); } catch {} };
  window.addEventListener('keydown', emit, true);
  window.addEventListener('keyup', emit, true);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);
  return () => {
    window.removeEventListener('keydown', emit, true);
    window.removeEventListener('keyup', emit, true);
    window.removeEventListener('blur', clear);
    document.removeEventListener('visibilitychange', clear);
  };
}
