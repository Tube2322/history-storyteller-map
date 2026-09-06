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
import threading
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import edge_tts
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
DEFAULT_VOICE = "th-TH-PremwadeeNeural"
ASSETS_DIR = Path("assets")
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")

# ---------- ตัดเส้นไฮไลต์ให้อยู่แค่บนแผ่นดิน (ไม่ลากผ่านทะเล) ----------
# เขตแดนจริงจาก Nominatim บางประเทศ/บางเขตลากเส้นตรงคร่อมทะเล (ไม่แนบชายฝั่งจริง)
# จึงตัด (intersect) กับข้อมูลแผ่นดินจริง Natural Earth 1:50m ก่อนส่งให้หน้าเว็บเสมอ
_LAND_MASK_PATH = Path(__file__).parent / "data" / "land_mask_50m.geojson"
_land_polys = None


def _load_land_mask():
    global _land_polys
    if _land_polys is not None:
        return
    with open(_LAND_MASK_PATH, encoding="utf-8") as f:
        fc = json.load(f)
    _land_polys = [shape(feat["geometry"]).buffer(0) for feat in fc["features"]]


def clip_to_land(geojson_dict):
    try:
        _load_land_mask()
        geom = shape(geojson_dict).buffer(0)
        if geom.is_empty:
            return geojson_dict
        minx, miny, maxx, maxy = geom.bounds
        pad = 0.5  # กันคลาดขอบพอดี ไม่ตัดชายฝั่งขาดที่รอยต่อ tile
        candidates = [
            p for p in _land_polys
            if not (p.bounds[2] < minx - pad or p.bounds[0] > maxx + pad
                    or p.bounds[3] < miny - pad or p.bounds[1] > maxy + pad)
        ]
        if not candidates:
            return geojson_dict
        land_near = unary_union(candidates)
        clipped = geom.intersection(land_near)
        if clipped.is_empty:
            return geojson_dict  # เกาะ/พื้นที่นอก mask (ไม่ค่อยพบ) — ใช้ของเดิมดีกว่าไม่มีอะไรเลย
        return mapping(clipped)
    except Exception as exc:  # ตัดไม่สำเร็จ (ข้อมูลแปลก) — ใช้ขอบเขตดิบแทน ดีกว่าฉากพัง
        sys.stderr.write(f"clip_to_land ล้มเหลว: {exc}\n")
        return geojson_dict

# ---------- ไฮไลต์ขอบเขตพื้นที่ (จังหวัด/ประเทศ) จาก OpenStreetMap Nominatim ----------
# ใช้ reverse geocoding จากพิกัดจริงของฉาก (ไม่ใช่ค้นหาจากชื่อ) เพื่อความแม่นยำ
# Nominatim usage policy: ต้องมี User-Agent ระบุตัวตน และไม่ยิงเกิน ~1 req/sec
_boundary_cache = {}
_nominatim_lock = threading.Lock()
_last_nominatim_call = [0.0]
BOUNDARY_ZOOM = {"country": 4, "province": 6, "place": 10}  # ปรับคาลิเบรตจาก Nominatim จริง (addresstype: country/province/municipality)


def fetch_boundary(lat: float, lng: float, level: str) -> dict:
    key = (round(lat, 3), round(lng, 3), level)
    if key in _boundary_cache:
        return _boundary_cache[key]
    zoom = BOUNDARY_ZOOM.get(level, 10)
    with _nominatim_lock:
        wait = 1.1 - (time.time() - _last_nominatim_call[0])
        if wait > 0:
            time.sleep(wait)
        qs = urllib.parse.urlencode({
            "lat": lat, "lon": lng, "format": "jsonv2",
            "zoom": zoom, "polygon_geojson": 1,
        })
        req = urllib.request.Request(
            f"https://nominatim.openstreetmap.org/reverse?{qs}",
            headers={"User-Agent": "history-storyteller-map/1.0 (local dev tool; contact via github)"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        _last_nominatim_call[0] = time.time()
    name = data.get("name") or (data.get("display_name") or "").split(",")[0]
    country_code = (data.get("address") or {}).get("country_code")  # เช่น "th" — ใช้ดึงธงชาติ
    geojson = data.get("geojson")
    if geojson and geojson.get("type") in ("Polygon", "MultiPolygon"):
        geojson = clip_to_land(geojson)
    result = {"name": name, "geojson": geojson, "countryCode": country_code}
    _boundary_cache[key] = result
    return result


_geocode_cache = {}


def fetch_geocode(query: str) -> list:
    key = query.strip().lower()
    if key in _geocode_cache:
        return _geocode_cache[key]
    with _nominatim_lock:
        wait = 1.1 - (time.time() - _last_nominatim_call[0])
        if wait > 0:
            time.sleep(wait)
        qs = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 5})
        req = urllib.request.Request(
            f"https://nominatim.openstreetmap.org/search?{qs}",
            headers={"User-Agent": "history-storyteller-map/1.0 (local dev tool; contact via github)"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        _last_nominatim_call[0] = time.time()
    result = [
        {"name": item.get("display_name"), "lat": float(item["lat"]), "lng": float(item["lon"])}
        for item in data
    ]
    _geocode_cache[key] = result
    return result


async def synthesize(text: str, voice: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice)
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    return bytes(audio)


_flag_cache = {}


def fetch_flag(country_code: str) -> bytes:
    code = re.sub(r"[^a-z]", "", country_code.lower())[:2]
    if code in _flag_cache:
        return _flag_cache[code]
    req = urllib.request.Request(
        f"https://flagcdn.com/160x120/{code}.png",
        headers={"User-Agent": "history-storyteller-map/1.0 (local dev tool)"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = resp.read()
    _flag_cache[code] = data
    return data


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/boundary"):
            self.handle_boundary()
            return
        if self.path.startswith("/api/flag"):
            self.handle_flag()
            return
        if self.path.startswith("/api/geocode"):
            self.handle_geocode()
            return
        super().do_GET()

    def handle_geocode(self):
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            query = (qs.get("q", [""])[0] or "").strip()
            if not query:
                self.send_error(400, "missing q")
                return
            results = fetch_geocode(query)
            body = json.dumps({"results": results}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            message = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)

    def handle_flag(self):
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            code = (qs.get("code", [""])[0] or "").strip()
            if not code:
                self.send_error(400, "missing code")
                return
            png_bytes = fetch_flag(code)
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(png_bytes)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(png_bytes)
        except Exception as exc:
            self.send_error(500, str(exc))

    def handle_boundary(self):
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            lat = float(qs.get("lat", [""])[0])
            lng = float(qs.get("lng", [""])[0])
            level = (qs.get("level", ["place"])[0] or "place").strip()
            result = fetch_boundary(lat, lng, level)
            body = json.dumps(result).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            message = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)

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
        print(f"serving on http://localhost:{PORT} (static + /api/tts + /api/upload + /api/boundary)")
        httpd.serve_forever()
