// Placeholder for our overlay adapters. For now this is a no-op passthrough.

/**
 * @param {string} text
 * @returns {{ text: string }}
 */
export function parseOverlayFromStim(text) {
  return { text };
}

/**
 * @param {string} baseText
 * @param {{ text?: string }} overlay
 * @param {{ ensurePragmas?: boolean }} opts
 * @returns {string}
 */
export function toStimCircuit(baseText, overlay, opts = {}) {
  return overlay?.text ?? baseText;
}

