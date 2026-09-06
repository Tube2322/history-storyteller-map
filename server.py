"""Static file server + edge-tts proxy สำหรับเอนจิ้นแผนที่เล่าเรื่อง

ทำไมต้องมีไฟล์นี้: edge-tts เป็นไลบรารี Python (เรียก websocket ของ
Microsoft Edge) เบราว์เซอร์เรียกตรงไม่ได้ ต้องมี backend มาเป็นตัวกลาง
รันคำสั่ง: python server.py [port]  (ดีฟอลต์ 5173)
"""

import asyncio
import base64
import http.server
import json
import re
import socketserver
import sys
import uuid
from pathlib import Path

import edge_tts

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
DEFAULT_VOICE = "th-TH-PremwadeeNeural"
ASSETS_DIR = Path("assets")
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


async def synthesize(text: str, voice: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice)
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    return bytes(audio)


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/api/upload":
            self.handle_upload()
            return
        if self.path != "/api/tts":
            self.send_error(404, "not found")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            text = (body.get("text") or "").strip()
            voice = (body.get("voice") or DEFAULT_VOICE).strip()
            if not text:
                self.send_error(400, "missing text")
                return
            audio_bytes = asyncio.run(synthesize(text, voice))
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(len(audio_bytes)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(audio_bytes)
        except Exception as exc:  # ส่ง error กลับเป็นข้อความ ให้ฝั่งเว็บ fallback ได้
            message = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)

    def handle_upload(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            filename = (body.get("filename") or "image").strip()
            data_url = body.get("data") or ""
            if "," in data_url:
                data_url = data_url.split(",", 1)[1]  # ตัด "data:image/png;base64," ทิ้ง
            raw = base64.b64decode(data_url)

            ASSETS_DIR.mkdir(exist_ok=True)
            stem = Path(filename).stem or "image"
            ext = Path(filename).suffix or ".png"
            safe_stem = SAFE_NAME_RE.sub("-", stem)[:60] or "image"
            safe_name = f"{safe_stem}-{uuid.uuid4().hex[:8]}{ext}"
            (ASSETS_DIR / safe_name).write_bytes(raw)

            result = json.dumps({"url": f"assets/{safe_name}"}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(result)))
            self.end_headers()
            self.wfile.write(result)
        except Exception as exc:
            message = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    with ThreadingServer(("", PORT), Handler) as httpd:
        print(f"serving on http://localhost:{PORT} (static + /api/tts)")
        httpd.serve_forever()
