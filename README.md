## Shatter Visualiser (Work in Progress)

> *"All this chitter-chatter, chitter-chatter, chitter-chatter 'bout
> shmatta, shmatta, shmatta."*

Shatter is a visualiser for quantum circuits that is based on [Crumble](https://algassert.com/crumble). 

It expands on the rendering capabilities of Crumble by adding multiple panels and the ability to render different components of the quantum circuit to `sheets' which can be toggled per-panel. It also adds the ability to render edges between qubits, and additional styling options for gates and qubits. It inherits the ability to render Pauli marks from Crumble. In the future, I may develop Shatter into a full-blown editor.

*Attribution:* the source code of Shatter is inextricable from that of Crumble. I have variously vendored and modified the files available under an Apache license [here](https://github.com/quantumlib/Stim/blob/main/glue/crumble/).
