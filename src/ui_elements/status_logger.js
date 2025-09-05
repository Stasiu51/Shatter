import {downloadText} from '../io/import_export.js';

export function createStatusLogger({
  statusBarEl,
  statusTextEl,
  statusDotEl,
  statusRightEl,
  statusTextRightEl,
  statusDotRightEl,
  nameProvider,
}) {
  const statusLog = [];
  const colors = { info: '#8b949e', warning: '#c69026', error: '#d1242f' };

  function pushStatus(message, level = 'info') {
    const ts = new Date().toISOString();
    const entry = `${ts} [${level.toUpperCase()}] ${message}`;
    statusLog.push(entry);
    if (statusLog.length > 1000) statusLog.shift();

    if (statusTextEl) statusTextEl.textContent = message;
    if (statusDotEl) statusDotEl.style.background = colors[level] || colors.info;

    if (statusRightEl && statusTextRightEl && statusDotRightEl) {
      if (level === 'warning' || level === 'error') {
        statusTextRightEl.textContent = '';
        statusDotRightEl.style.background = colors.info;
      } else {
        let warnEntry = null;
        for (let i = statusLog.length - 1; i >= 0; i--) {
          const line = statusLog[i];
          if (line.includes('[WARNING]') || line.includes('[ERROR]')) { warnEntry = line; break; }
        }
        if (warnEntry) {
          const isErr = warnEntry.includes('[ERROR]');
          const msg = warnEntry.replace(/^.*\]\s*/, '');
          statusTextRightEl.textContent = msg;
          statusDotRightEl.style.background = isErr ? colors.error : colors.warning;
        } else {
          statusTextRightEl.textContent = '';
          statusDotRightEl.style.background = colors.info;
        }
      }
    }
  }

  statusBarEl?.addEventListener('click', () => {
    const content = statusLog.join('\n') + (statusLog.length ? '\n' : '');
    const name = (nameProvider?.() || 'circuit') + '-status-log.txt';
    downloadText(name, content);
  });

  return { pushStatus, getLog: () => [...statusLog] };
}

