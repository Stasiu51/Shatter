#!/usr/bin/env python3

"""
Convert a Stim/overlay text into a Shatter URL hash (or full URL).

This replicates the browser-side encoding used by Shatter (src/io/url_sync.js):
  - Abbreviate tokens to keep URLs short:
      QUBIT_COORDS -> Q
      DETECTOR -> DT
      OBSERVABLE_INCLUDE -> OI
  - Remove trivial comma-space: ", " -> ","
  - Replace spaces with '_' and newlines with ';'
  - Percent-encode only when necessary (when '%' or '&' present)

Usage:
  - From a file:    python stim_to_shatter_url.py -i circuit.stim --base https://your.host/index.html
  - From stdin:     python stim_to_shatter_url.py --url --base https://your.host/index.html < circuit.stim
  - Hash only:      python stim_to_shatter_url.py -i circuit.stim   # prints "#circuit=..."

No external dependencies.
"""

import argparse
import sys
from urllib.parse import quote


def encode_circuit_to_hash(text: str) -> str:
    s = text or ""
    # Abbreviations for shorter URLs.
    s = s.replace('QUBIT_COORDS', 'Q')
    s = s.replace('DETECTOR', 'DT')
    s = s.replace('OBSERVABLE_INCLUDE', 'OI')
    # Compact commas.
    s = s.replace(', ', ',')
    # Replace spaces and newlines with URL-friendly separators.
    s = s.replace(' ', '_')
    s = s.replace('\r\n', '\n')
    s = s.replace('\r', '\n')
    s = s.replace('\n', ';')
    # Percent-encode only when necessary.
    if ('%' in s) or ('&' in s):
        # Use encodeURIComponent-like behavior: encode everything non-alphanumeric.
        # urllib.parse.quote with safe='' approximates this well.
        s = quote(s, safe='')
    return '#circuit=' + s


def main():
    p = argparse.ArgumentParser(description='Encode Stim text into a Shatter URL hash or full URL.')
    p.add_argument('-i', '--input', type=str, help='Path to a .stim file. If omitted, reads stdin.')
    p.add_argument('--base', type=str, default='', help='Base URL (e.g., https://host/index.html). When provided, outputs full URL.')
    p.add_argument('--hash-only', action='store_true', help='Force printing only the #circuit=... hash (default when --base is not provided).')
    p.add_argument('--url', action='store_true', help='Force printing full URL (requires --base).')
    args = p.parse_args()

    # Read input text.
    if args.input:
        with open(args.input, 'r', encoding='utf-8') as f:
            text = f.read()
    else:
        text = sys.stdin.read()

    h = encode_circuit_to_hash(text)

    # Decide output mode.
    want_url = bool(args.base) if not (args.hash_only or args.url) else args.url
    if want_url:
        base = args.base or ''
        if not base:
            print(h)
            return 0
        # Ensure base has no existing hash.
        if '#' in base:
            base = base.split('#', 1)[0]
        # Join with hash.
        sys.stdout.write(f"{base}{h}\n")
    else:
        sys.stdout.write(h + "\n")
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BrokenPipeError:
        # Allow piping into head, etc.
        pass

