#!/usr/bin/env python3
"""
Tiny static dev server WITH HTTP Range support.

Why this exists: `python3 -m http.server` does not answer Range requests, so a browser
reports `video.seekable` as empty and every seek silently does nothing - the video looks
frozen on frame 0 while the rest of the effect (opacity, progress) works fine. Any real
static host (nginx, Caddy, Vercel, S3/CloudFront, ...) supports Range out of the box.

    python3 tools/serve.py [port]        # default 8000
"""

import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class RangeRequestHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        header = self.headers.get("Range")
        if not header:
            return super().send_head()

        m = RANGE_RE.match(header.strip())
        if not m:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        size = os.fstat(f.fileno()).st_size
        first, last = m.group(1), m.group(2)

        if first == "":                       # suffix range: bytes=-500
            length = int(last or 0)
            start = max(0, size - length)
            end = size - 1
        else:
            start = int(first)
            end = int(last) if last else size - 1

        if start >= size:
            f.close()
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % size)
            self.end_headers()
            return None

        end = min(end, size - 1)
        f.seek(start)
        self._remaining = end - start + 1

        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Length", str(self._remaining))
        self.end_headers()
        return _Limited(f, self._remaining)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        SimpleHTTPRequestHandler.end_headers(self)


class _Limited:
    """File wrapper that stops after `remaining` bytes, for copyfile()."""

    def __init__(self, fp, remaining):
        self.fp = fp
        self.remaining = remaining

    def read(self, n=-1):
        if self.remaining <= 0:
            return b""
        if n < 0 or n > self.remaining:
            n = self.remaining
        data = self.fp.read(n)
        self.remaining -= len(data)
        return data

    def close(self):
        self.fp.close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = partial(RangeRequestHandler, directory=root)
    print("serving %s on http://localhost:%d/demo/" % (root, port))
    ThreadingHTTPServer(("", port), handler).serve_forever()
