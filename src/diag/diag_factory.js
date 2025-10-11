// Lightweight diagnostic factories.
// Usage: import { sheet_not_at_top, gate_unrecognized, ... } from './diag/diag_factory.js'
// Return shape matches existing diagnostics: { line, severity: 'error'|'warning', code, message }
// Note: Call sites decide the line number. For warnings that should account for
// synthesized lines (e.g., inserted POLY headers), pass an adjusted line value.

/**
 * @param {number} line
 * @param {'error'|'warning'} severity
 * @param {string} code
 * @param {string} message
 */
function make(line, severity, code, message) {
  return { line, severity, code, message };
}

// SHEET ---
export const sheet_not_at_top = (line) => make(line, 'error', 'SHEET001', '##! SHEET must appear at the top of the file before any other content.');
export const sheet_declared_twice = (line, name) => make(line, 'error', 'SHEET002', `Sheet ${name} declared twice (note DEFAULT exists by default).`);
export const sheet_missing = (line, name) => make(line, 'error', 'SHEET003', `No such sheet ${name}.`);

// QUBIT ---
// Note: Both functions currently use QU001 to match existing usage.
export const qubit_requires_next_coords = (line) => make(line, 'error', 'QU001', 'QUBIT without Q= must attach to next QUBIT_COORDS.');
export const qubit_expected_single_target = (line) => make(line, 'error', 'QU001', 'QUBIT anchor expected exactly one QUBIT_COORDS target.');

// HIGHLIGHT ---
export const highlight_no_gate_anchor = (line) => make(line, 'error', 'HL001', 'HIGHLIGHT GATE had no gate to attach to.');

// POLY/POLYGON ---
export const poly_missing_body = (line) => make(line, 'error', 'POLY001', '##! POLY must be immediately followed by "#! pragma POLYGON".');
export const poly_invalid_body = (line) => make(line, 'error', 'POLY002', 'Invalid POLYGON body.');

// ANNOTATION ---
export const annotation_unknown_command = (line, body) => make(line, 'error', 'ANNOTATION001', `Unknown annotation command ${body}`);

// COORD ---
export const coord_single_target_required = (line, rawLine) => make(line, 'error', 'COORD003', `QUBIT_COORDS command should take exactly one target: ${rawLine}`);
export const coord_reuse = (line, x, y) => make(line, 'error', 'COORD002', `Attempted to reuse coordinates ${[x, y]}`);

// FEEDBACK ---
export const feedback_unsupported = (line, detail) => make(line, 'warning', 'FEED001', `Feedback isn't supported yet. Ignoring ${detail}`);

// GATE ---
export const gate_unrecognized = (line, rawLine) => make(line, 'warning', 'GATE001', `Ignoring unrecognized instruction: ${rawLine}`);

// REPEAT ---
export const repeat_unmatched_close = (line) => make(line, 'error', 'REP001', 'Unmatched }');
export const repeat_unclosed_block = (line) => make(line, 'error', 'REP002', 'Unclosed REPEAT block');

// Aggregate (optional): convenient object export if preferred by callers.
export const Diag = {
  sheet_not_at_top,
  sheet_declared_twice,
  sheet_missing,
  qubit_requires_next_coords,
  qubit_expected_single_target,
  highlight_no_gate_anchor,
  poly_missing_body,
  poly_invalid_body,
  annotation_unknown_command,
  coord_single_target_required,
  coord_reuse,
  feedback_unsupported,
  gate_unrecognized,
  repeat_unmatched_close,
  repeat_unclosed_block,
};

// --- Embedding (EMB) ---
export const embedding_must_be_at_top = (line) => make(line, 'error', 'EMB001', '##! EMBEDDING must appear at the top of the file before any other content.');
export const embedding_invalid = (line, msg) => make(line, 'error', 'EMB002', `Invalid EMBEDDING directive: ${msg}`);

// Add to aggregate convenience export
Diag.embedding_must_be_at_top = embedding_must_be_at_top;
Diag.embedding_invalid = embedding_invalid;

export default Diag;
