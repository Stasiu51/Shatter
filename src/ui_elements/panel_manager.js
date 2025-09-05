import {createSelectionWidget} from './panel_selection_widget.js';

export class PanelManager {
  constructor(container) {
    this.container = container;
    this.layout = 1;
    this.panels = [];
    this.build();
  }

  setLayout(n) {
    n = Math.max(1, Math.min(4, Number(n)||1));
    if (this.layout === n) return;
    this.layout = n;
    this.build();
  }

  build() {
    this.container.className = this.container.className.replace(/layout-\d/, '').trim();
    this.container.classList.add(`layout-${this.layout}`);
    this.container.innerHTML = '';
    this.panels = [];
    for (let i = 0; i < this.layout; i++) {
      this.panels.push(this._createPanel(i));
    }
  }

  _createPanel(index) {
    const panel = document.createElement('div');
    panel.className = 'panel';

    const header = document.createElement('div');
    header.className = 'panel-header';

    // Left and right containers for header content
    const headerLeft = document.createElement('div');
    headerLeft.style.display = 'flex';
    headerLeft.style.alignItems = 'center';
    headerLeft.style.gap = '8px';
    headerLeft.style.flex = '1';

    const headerRight = document.createElement('div');
    headerRight.style.display = 'flex';
    headerRight.style.alignItems = 'center';
    headerRight.style.gap = '8px';

    // Only show the selection widget on the rightmost/top-right panel:
    // layout 1 → index 0; layout 2 → index 1; layout 3 → index 2; layout 4 → index 1 (top-right)
    let selIndex;
    if (this.layout === 1) selIndex = 0;
    else if (this.layout === 2) selIndex = 1;
    else if (this.layout === 3) selIndex = 2;
    else if (this.layout === 4) selIndex = 1;
    else selIndex = Math.max(0, this.layout - 1);

    let sel = undefined;
    if (index === selIndex) {
      sel = createSelectionWidget();
      headerRight.append(sel);
    }
    header.append(headerLeft, headerRight);

    const body = document.createElement('div');
    body.className = 'panel-body';
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    body.appendChild(canvas);

    panel.append(header, body);
    this.container.appendChild(panel);
    return {panel, header, headerLeft, headerRight, body, canvas, sel};
  }
}
