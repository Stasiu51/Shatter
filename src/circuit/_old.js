    /** Parse a crumble instruction line into an Operation or a side-effect (coords), or TICK. */
    // function parseCrumble(line, lineNo) {
    //   const s = line.replace(/\s+#.*$/, '').trim(); // strip trailing # comment
    //   if (s.length === 0) return;

    //   if (/^TICK\b/.test(s)) {
    //     // Before switching layers, anchored polygon header missing body error.
    //     if (pendingPolyHdr) {
    //       diag(pendingPolyHdr.line, 'POLY001', 'error', '##! POLY must be immediately followed by "#! pragma POLYGON".');
    //       pendingPolyHdr = null;
    //     }
    //     // Attach any pending anchored ann to *this* (but TICK isn't a gate, so skip)
    //     pendingAnchor = null;
    //     startNewLayer();
    //     return;
    //   }

    //   // POLYGON(r,g,b,a) t1 t2 ...
    //   const re = /^\s*POLYGON\(([^)]+)\)\s*(.*)$/;
    //   const m = line.match(re);
    //   if (m) {
    //     const color = m[1].split(/\s*,\s*/).map(Number);   // [r,g,b,a]
    //     if (color.length === 4) {
    //       const targets = m[2].trim() ? m[2].trim().split(/\s+/).map(Number) : [];
    //       if (targets.length !== 0) {
    //         let { h, hdrLineNo, bdyLineNo } = [null, null, null];
    //         if (!pendingPolyHdr) {
    //           h = { sheet: 'DEFAULT', stroke: 'none', fill: String(color) }
    //           hdrLineNo = lineNo + insertList.length;
    //           insertList.push({ lineNo: lineNo, line: `##! POLY sheet=${h.sheet} stroke=${h.stroke} fill=(${h.fill})` });
    //           bdyLineNo = lineNo + insertList.length;
    //         }
    //         else {
    //           h = pendingPolyHdr.header;
    //           hdrLineNo = pendingPolyHdr.line + insertList.length;
    //           bdyLineNo = lineNo + insertList.length;
    //         }
    //         currentLayer.annotations.push({ kind: 'Polygon', headerLine: hdrLineNo, bodyLine: bdyLineNo, sheet: h.sheet, stroke: h.stroke, fill: h.fill, targets });
    //         pendingPolyHdr = null;
    //       }
    //       return
    //     }
    //     diag(lineNo, 'POLY002', 'error', 'Invalid POLYGON body.');
    //   }

    //   // The instruction isn't a polygon body
    //   if (pendingPolyHdr) {
    //     diag(pendingPolyHdr.line, 'POLY001', 'error', '##! POLY must be immediately followed by "#! pragma POLYGON".');
    //   }

    //   // QUBIT_COORDS(x,y) q
    //   const mQC = s.match(/^QUBIT_COORDS\s*\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)\s+(-?\d+)\s*$/i);
    //   if (mQC) {
    //     const x = parseFloat(mQC[1]);
    //     const y = parseFloat(mQC[2]);
    //     const q = parseInt(mQC[3]);
    //     if ([...circuit.qubit_coords.values()].includes([x, y])) {
    //       diag(lineNo, 'COORD001', 'error', `Attempted to reuse coordinates ${[x, y]}`)
    //     }
    //     circuit.qubit_coords.set(q, [x, y]);
    //     // QUBIT_COORDS does not create an Operation.
    //     // Pending anchor is cleared by a crumble instruction line that is not a gate? The rule says it must attach to next crumble instruction; coords shouldn't count.
    //     // Treat coords as a barrier (safer).
    //     pendingAnchor = null;
    //     return;
    //   }

    //   // Generic gate line: NAME(args?) targets...
    //   const gateMatch = s.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*\(([^)]*)\))?\s*(.*)$/);
    //   if (!gateMatch) {
    //     // Unknown crumble syntax.
    //     diag(lineNo, 'PAR003', 'error', 'Unrecognized instruction.');
    //     pendingAnchor = null;
    //     return;
    //   }
    //   let name = gateMatch[1].toUpperCase();
    //   if (GATE_ALIAS_MAP.has(name)) {
    //     name = GATE_ALIAS_MAP.get(name);
    //   }
    //   const argsStr = (gateMatch[2] || '').trim();
    //   const targetsStr = (gateMatch[3] || '').trim();

    //   const gate = GATE_MAP.get(name);
    //   if (!gate) {
    //     diag(lineNo, 'PAR004', 'error', `Unknown gate: ${name}`);
    //     pendingAnchor = null;
    //   }

    //   // Parse args as comma-separated floats.
    //   let args = [];
    //   if (argsStr.length) {
    //     for (const part of argsStr.split(',')) {
    //       const t = part.trim();
    //       if (t.length === 0) continue;
    //       const v = Number(t);
    //       if (!Number.isFinite(v)) {
    //         diag(lineNo, 'PAR005', 'error', `Bad gate argument: ${t}`);
    //         return;
    //       }
    //       args.push(v);
    //     }
    //   }
    //   // Parse targets as space/comma separated integers. (No rec[...] or ^ yet.)
    //   let targets = [];
    //   if (targetsStr.length) {
    //     for (const part of targetsStr.split(/[,\s]+/)) {
    //       const t = part.trim();
    //       if (!t) continue;
    //       if (!/^-?\d+$/.test(t)) {
    //         diag(lineNo, 'PAR006', 'error', `Bad target: ${t}`);
    //         return;
    //       }
    //       targets.push(parseInt(t));
    //     }
    //   }

    //   // Attach anchored annotation now (expects a gate).
    //   if (pendingAnchor) {
    //     if (pendingAnchor.anchorKind === 'GATE') {
    //       // okay; we'll add annotation with opIndex = cur.operations.length (before push)
    //       const opIndex = currentLayer.id_ops.length;
    //       currentLayer.annotations.push(pendingAnchor.build(opIndex, circuit.layers.length - 1));
    //     }
    //     pendingAnchor = null;
    //   }
    //   if (pendingPolyHdr) {
    //     diag(pendingPolyHdr.line, 'POLY001', 'error', '##! POLY must be immediately followed by "#! pragma POLYGON".');
    //     pendingPolyHdr = null;
    //   }

    //   const op = new Operation(gate, '', new Float32Array(args), new Uint32Array(targets), lineNo);
    //   // tack on line number (not part of original class but JS allows it)
    //   try {
    //     currentLayer.put(op, false);
    //   } catch (_) {
    //     circuit.layers.push(new AnnotatedLayer());
    //     currentLayer = circuit.layers[circuit.layers.length - 1];
    //     currentLayer.put(op, false);
    //   }
    //   seenNonSheetContent = true;
    // }