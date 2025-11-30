// Convert Crumble-specific marker ops in a Stim-like text into pragma lines
// so the result is valid Stim with Crumble pragmas.
//
// Supported conversions at start-of-line:
//   - POLYGON(...) -> #!pragma POLYGON(...)
//   - ERR ...      -> #!pragma ERR ...
//   - MARK..., MARKX..., MARKY..., MARKZ... -> #!pragma MARK...
//
// Accepts either an object with toStimCircuit() or a raw string.

export function toPragmaStim(input) {
  const text = (input && typeof input.toStimCircuit === 'function') ? input.toStimCircuit() : String(input || '');
  // Insert '#!pragma ' before known pseudo-ops at the start of a line.
  return text
    .replace(/(^|\n)(POLYGON)/g, '$1#!pragma $2')
    .replace(/(^|\n)(ERR)/g, '$1#!pragma $2')
    .replace(/(^|\n)(MARK)/g, '$1#!pragma $2');
}
