// Hosted circuits: load a circuit by short id instead of by URL hash payload.
//
// `#circuit=...` carries the whole circuit in the URL, which is fine for toy
// examples and hopeless for a real one -- a surgery circuit is megabytes, far
// past what a browser or a PDF link will carry. A hosted circuit is a file
// checked into `circuits/` and served by the same static site, named by a
// short id, so a paper can print
//
//     https://<user>.github.io/Shatter/#id=bb144-bb2zz-v7
//
// and have it open. `circuits/index.json` lists what is available.

const DIR = 'circuits';

/** Fetch `circuits/<id>.stim`. Throws with a readable message. */
export async function fetchHostedCircuit(id) {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error(`circuit id ${JSON.stringify(id)} has unexpected characters`);
  }
  const url = new URL(`${DIR}/${id}.stim`, document.baseURI).href;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`no hosted circuit "${id}" (${res.status} from ${DIR}/${id}.stim)`);
  }
  return await res.text();
}

/** The manifest, or an empty catalogue when there is none. */
export async function fetchCircuitIndex() {
  try {
    const url = new URL(`${DIR}/index.json`, document.baseURI).href;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return { circuits: [] };
    return await res.json();
  } catch {
    return { circuits: [] };
  }
}
