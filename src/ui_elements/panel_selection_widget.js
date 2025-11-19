export function createSelectionWidget() {
  const root = document.createElement('div');
  root.className = 'sel-widget';

  const row = document.createElement('div');
  row.className = 'sel-row';

  const gate = box('gate', 'Gate');
  const group = document.createElement('div');
  group.className = 'sel-group';
  const qubit = box('qubit', 'Qubit');
  const conn = box('conn', 'Conn');
  const poly = box('poly', 'Poly');
  const alt = document.createElement('div');
  alt.className = 'sel-alt';
  alt.textContent = 'Alt';
  const svgNS = 'http://www.w3.org/2000/svg';
  const brace = document.createElementNS(svgNS, 'svg');
  brace.setAttribute('class', 'sel-brace');
  brace.setAttribute('viewBox', '0 0 100 12');
  brace.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(svgNS, 'path');
  // Curly under-brace shape: down-left hook, horizontal (shortened), up-right hook.
  path.setAttribute('d', 'M2,0 v6 c0,2 2,2 6,2 h40 c4,0 6,0 6,-2 v-6');
  brace.appendChild(path);

  // Default mode is Gate.
  gate.classList.add('active');

  group.append(qubit, conn, poly, alt, brace);
  row.append(gate, group);
  root.append(row);

  // Expose minimal API for flashing red on invalid multi-select later.
  root.flashError = () => {
    root.classList.add('flash');
    setTimeout(() => root.classList.remove('flash'), 500);
  };
  root.setActive = (kind) => {
    for (const child of [gate, qubit, conn, poly]) child.classList.remove('active');
    if (kind === 'gate') gate.classList.add('active');
    else if (kind === 'qubit') qubit.classList.add('active');
    else if (kind === 'connection') conn.classList.add('active');
    else if (kind === 'polygon') poly.classList.add('active');
  };

  root.setAltActive = (active) => {
    if (active) root.classList.add('alt-active');
    else root.classList.remove('alt-active');
  };

  return root;
}

function box(cls, title) {
  const el = document.createElement('div');
  el.className = `sel-box ${cls}`;
  el.title = title;
  return el;
}
