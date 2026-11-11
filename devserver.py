#!/usr/bin/env python3
"""Static dev server for Shatter.

Plain `python3 -m http.server` lets the browser cache ES modules, so edits to
files under src/ silently don't show up on reload. This sends no-store.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    handler = partial(NoCacheHandler, directory=".")
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Shatter dev server on http://localhost:{port} (no-store)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
