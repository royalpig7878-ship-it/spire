"""A tiny web server for testing SPIRE on your phone.

Same as `python -m http.server 8000`, but it tells the browser never to keep
old copies of the game's files, so a refresh always shows your latest changes.

Run it from the project folder with:   python tools/serve.py
"""
import http.server
import os


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    http.server.test(HandlerClass=NoCacheHandler, port=8000, bind="0.0.0.0")
