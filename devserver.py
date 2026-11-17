#!/usr/bin/env python3
"""Static dev server for Shatter.

Plain `python3 -m http.server` lets the browser cache ES modules, so edits to
files under src/ silently don't show up on reload. This sends no-store.

It also raises the listen backlog and speaks HTTP/1.1. Shatter is ~70 ES
modules, and the browser asks for them all at once; with the stdlib defaults
(backlog 5, HTTP/1.0 so one connection per file) that burst overflows the
accept queue and the browser reports ERR_CONNECTION_RESET on a random subset,
which looks exactly like a broken app.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    # Keep-alive, so one connection serves many modules instead of one each.
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class DevServer(ThreadingHTTPServer):
    # The stdlib default of 5 is far too small for a module graph this wide.
    request_queue_size = 128
    daemon_threads = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    handler = partial(NoCacheHandler, directory=".")
    with DevServer(("127.0.0.1", port), handler) as httpd:
        print(f"Shatter dev server on http://localhost:{port} (no-store)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
