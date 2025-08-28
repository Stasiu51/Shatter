import {createSelectionWidget} from './selection_widget.js';

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

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = `Panel ${index+1}`;

    const sel = createSelectionWidget();
    header.append(title, sel);

    const body = document.createElement('div');
    body.className = 'panel-body';
    const placeholder = document.createElement('div');
    placeholder.style.color = '#6e7781';
    placeholder.style.fontSize = '12px';
    placeholder.textContent = 'Canvas placeholder';
    body.appendChild(placeholder);

    panel.append(header, body);
    this.container.appendChild(panel);
    return {panel, header, body, sel};
  }
}

