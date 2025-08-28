
This document is to give a visual guide to the UI of crumble; to specify which parts we want to replicate (or more precisely, vendor from crumble); and then what we want to add and change.

# Crumble UI

Crumble has four essential UI elements, the panel, circuit view (+ summary), the instruction palette, and the various buttons dotted around. In Shatter, multiple panel canvases appear on the left, and a single global timeline (circuit view + summary) sits to the right of all panels.
You should look at the corresponding javascript and html code in conjunction with this document. I want you to produce a document that lists how every UI element and interaction in implemented in the crumble source, ordered by the ordering in this document.

A1: Panel
The two main ones are a large panel showing a single timeslice of the circuit in a 2D layout, including:

1. Faint grey boxes every integer lattice point and (integer lattice point) + (0.5, 0.5) point. These are used to select the qubits.
2. Qubits reside at these locations. In fact, you can provide any non-integer coordinates for the qubits, but the resulting display and interaction is undefined.
3. If a qubit exists in the stim circuit, a white box with a black outline is displayed instead of the faint grey one. This is then selectable (more later). 
4. Gates that are performed at the current timestep (or more precisely, at the current timestep - 0.5, as crumble displays the n + 0.5 pauli frames between the gate layers) are displayed in these boxes. Image 1 shows 3 CNOT gates (with the typical control and target symbol), and a RESET (meaning reset in Z basis to |0>) instruction. The symbols that describe other gates you can see in the instruction palette (idk if that's what it's called in the source) above - more on the instruction palette later. The gates are rendered above the boxes.
5. Also shown in the active white boxes are little coloured squares in the corners of the boxes. These come in two sizes, small and big, and three colours (red: X, blue: Z, green: Y). The small ones denote detectors, and the large ones denote observables (mathematically, these are the same object, a pauli string which has terminations forward in time on measurements in the correct basis and terminations backwards in time on appropriate reset gates). These sit above the gates and the boxes.
6. Coloured polygons are rendered in the background, behind the boxes.
7. There is also a coordinate grid around the top and left edges of the panel.
8. Selection mode indicator: each panel header shows four boxes [Gate] [Qubit] [Connection] [Polygon]. The right three are grouped by a continuous under‑brace with the label "Alt" centered beneath the group (see debugging_pictures/1.png); this indicates Alt toggles selection among these while excluding gates.

A2: Pauli mark selection

This behaviour of the panel is rich enough to deserve its own section. Everything that follows is occurs inside a single timeslice.

1. You can select a single qubit by clicking it. Squares go transparent red when moused over, and gain a slightly oversized transparnet blue overlay when selected. see pictures 3 and 4 in the folder.
2. Multiple qubits are selected by holding shift and clicking to add to the selection. see 5 and 6
3. A mark is a pauli string. If you hold a pauli letter (x, y, z) and press a number 0-9 on the keyboard, the selected qubit(s) are added to the corresponding pauli string with the corresponding pauli (or, if they are already present, ie non-identity, in the current pauli string, the pauli element is updated). 
4. the current state of pauli marks is shown as blue (z), red(x), green(y) or black(mixed) shapes that each show the value of one mark. image 7 shows two pauli marks, each consisting of a single qubit, one x type and one z type. these are shown as circles around the qubits for the avoidance of doubt, the first pauli string is II...IXI...III with the X on the highlighted qubit, and similarly for the second z mark. 
5. The id of the mark (0-9) is shown via a complicated notation. termination points of a mark declared with ids 1-4 are indicated by coloured triangles pointing into the centre of the square, with an increasing 90 degree clockwise rotation for each mark, starting at the top. shown in image 7 are marks 1 and 3. then termination point of a mark with ids 5-0 (think of 0 as 10) are denoted by a coloured square outside the box which starts in the top-right for 5 and gains an additional 36 degree rotation clockwise with inreasing id, ending up at the bottom-left for 0. a mark outside of these termination points is shown as a thick bar (like the base of the triangle) for ids 1-4, and a smaller square outside the box in the same position as the termination box for ids 5-0. see images 7-12.
6. marks which consist of more than one qubit are shown as polygons whose vertices are the qubits in the mark. these polygons have straight edges, for example in images 8 and 9 (note how in 8 mark 3 has four non-identity qubits but in 9 it now has five, as the centre of the diamond has been added). see also image 10 for a multi-qubit z type mark consisting of 8 qubits. a still more complicated example is shown in 11, where the pauli string with id 1 is consists of 7 qubits with pauli element Z, one with X and one with Y, resulting in an overall black polygon.
7. crossings are displayed as coloured highlights of a controlled gate edge, with the colour of the highlight corresponding to the pauli type of the crossing. see image 13 for a pauli X propagating due to a CNOT. this image also shows the special 'sharp oval' used to show a mark with only two qubits.
8. non-deterministic events (where qubits are measured or reset in a basis that implies a non-deterministic measurement) are shown as pink outlines around the troublesome dissipative events. see 15 for a case where an X mark is subjected to two rest-X instructions.


B1: Circuit display (global timeline at right)

This is a single shared timeline panel displayed to the right of all 2D timeslice panels and displays the circuit through time. We will vendor this element as‑is initially (no new functionality), wiring a single canvas/DOM container that is independent of the number of left‑hand panels.

1. Horizontal lines represent qubits. These are labelled in the UI by their stim coordinates, but ordered by their qubit id (note: this is the only thing that will be changed: I'd like to show the qubit id as well).
2. The gate display is mostly standard circuit notation: timeslices proceed left-to-right, with the current timestep (the one displayed in the panel) denoted by a transparent grey bar overlay.
3. Gates are displayed a little differently to standard circuit notation to avoid the difficultly of simultaneous controlled gates overlapping and being hard to discern. The control lines are curved slightly. The single qubit gates are also shifted slightly to the left or right (although I don't know the point of this). Again, the symbols for the gates are all shown in the instruction palette.
4. The interaction of the circuit view is very limited: the only mouse interaction is that when you mouse over a horizontal line in the circuit, the line and the corresponding square are highlighted with a grey box and connected by a line. See 2-mouse-over-circuit.png. It would be nice to add slightly richer interaction: perhaps if you click, it should jump to that timeslice. 
5. pauli propagation: marks are shown as coloured lines, with termination points shown as in the panel view with triangles or whatnot, and crossings also shown as highlights on the controlled gates.
6. detectors and observables are shown as little and big squares on the spacetime locations as in the panel view
7. non-deterministic events (where qubits are measured or reset in a basis that implies a non-deterministic measurement) are shown as pink outlines around the troublesome dissipative events. see 16 for the circuit picture equivalent of the situation in 15.

B2: circuit summary

This displays a highly condensed summary of the contents of each of the timeslices in the circuit. See figure 21 for the summary of the circuit shown in figure 14. I don't actually know how this information is displayed: some things are obvious like the pink highlights showing slices with non-deterministic events, or the yellow box showing the presence of an s-type gate. perhaps you could explain the rest using the source.

all these elements are visible in image 14.

C: instruction palette
(again, idk if it's called this in the source)
the instruction palette are a guide to how how gates, marks and polygons are added using the keyboard. see image 17 for the default view
1. when x, z, or y (or x and z at the same time instead of y) are held on the keyboard, the corresponding row of the palette lights up in yellow (see image 18).
2. then, additionally holding one of the keys written along the top of the palette selects a particular gate type. in image 19, a Y-type S gate is selected.
3. if some qubits are selected, the corresponding gate is added to the current timeslice at those qubits. if they do not exist, they are created. 
4. red, green or blue polygons are added in the same way

D: UI buttons
1. see image 20. these should be self-explanatory. I still want you to describe their functionality and implementation

E: not UI, but keyboard interaction

2. There are lots of keyboard shortcuts (perhaps controls is a better word than shortcuts as they are required to use the full functionality of crumble). You can see these in stim_crumble/readme.md. explain how these are hooked up too
