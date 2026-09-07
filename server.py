"""Static file server + edge-tts proxy สำหรับเอนจิ้นแผนที่เล่าเรื่อง

ทำไมต้องมีไฟล์นี้: edge-tts เป็นไลบรารี Python (เรียก websocket ของ
Microsoft Edge) เบราว์เซอร์เรียกตรงไม่ได้ ต้องมี backend มาเป็นตัวกลาง
รันคำสั่ง: python server.py [port]  (ดีฟอลต์ 5173)
"""

import asyncio
import base64
import hashlib
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
# แคชเสียงพากย์ลงดิสก์ — คนทำคอนเทนต์แก้สคริปต์แล้วกดเล่นซ้ำหลายรอบ ประโยคที่ไม่ได้แก้ไม่ควรต้องรอ edge-tts ใหม่ทุกครั้ง
# (แคชในหน่วยความจำฝั่งเว็บหายทุกครั้งที่รีเฟรชหน้า ส่วนอันนี้อยู่ข้ามรอบ/ข้ามวันได้)
TTS_CACHE_DIR = Path(__file__).parent / ".tts-cache"

# ---------- ตัดเส้นไฮไลต์ให้อยู่แค่บนแผ่นดิน (ไม่ลากผ่านทะเล) ----------
# เขตแดนจริงจาก Nominatim บางประเทศ/บางเขตลากเส้นตรงคร่อมทะเล (ไม่แนบชายฝั่งจริง)
# จึงตัด (intersect) กับข้อมูลแผ่นดินจริง Natural Earth 1:10m ก่อนส่งให้หน้าเว็บ (ปิดได้จากหน้าเว็บ)
_LAND_MASK_PATH = Path(__file__).parent / "data" / "land_mask_10m.geojson"
_land_polys = None
_land_lock = threading.Lock()


def _load_land_mask():
    # ไฟล์ 10m เก็บทวีปเป็น MultiPolygon ก้อนใหญ่ไม่กี่ก้อน — ต้องแตกเป็นรูปหลายเหลี่ยมเดี่ยวๆก่อน
    # ไม่งั้นการกรองด้วยกรอบสี่เหลี่ยม (bbox) ไม่ช่วยอะไรเลย เพราะ bbox ของทั้งทวีปกว้างเกินไป
    global _land_polys
    if _land_polys is not None:
        return
    with _land_lock:
        if _land_polys is not None:
            return
        with open(_LAND_MASK_PATH, encoding="utf-8") as f:
            fc = json.load(f)
        polys = []
        for feat in fc["features"]:
            geom = shape(feat["geometry"]).buffer(0)
            if geom.geom_type == "MultiPolygon":
                polys.extend(list(geom.geoms))
            elif not geom.is_empty:
                polys.append(geom)
        _land_polys = polys


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
# ลำดับ zoom ที่จะลองยิงต่อระดับ (ลองตัวแรกก่อน ถ้าได้ชนิดพื้นที่ไม่ตรงค่อยไล่ตัวถัดไป)
# ที่ต้องมีหลายค่าเพราะลำดับชั้นการปกครองแต่ละประเทศไม่เหมือนกัน — zoom เดียวใช้ได้ทั่วโลกไม่ได้จริง
BOUNDARY_ZOOM_LADDER = {
    "country": [3, 4, 2, 5],
    "province": [5, 6, 7, 8, 4],
    "place": [10, 12, 9, 13, 8, 14],
}
# ชนิดพื้นที่ (addresstype ของ Nominatim) ต่อระดับ แยกเป็น 2 ชั้น:
# PRIMARY = ชนิดที่ตรงความหมายที่สุด เจอเมื่อไหร่ใช้ทันที
# SECONDARY = ชนิดที่พอใช้แทนได้ เก็บไว้ก่อน ใช้ต่อเมื่อไล่ zoom จนหมดแล้วไม่เจอ primary เลย
# (จำเป็นเพราะบางเมืองใหญ่ เช่น ปารีส ยิง zoom ปกติแล้วได้ "suburb" ซึ่งเป็นเขตย่อย ไม่ใช่ตัวเมืองจริง)
BOUNDARY_PRIMARY_TYPES = {
    "country": {"country"},
    "province": {"state", "province", "region", "territory"},
    "place": {"city", "town", "municipality", "village"},
}
BOUNDARY_SECONDARY_TYPES = {
    "country": set(),
    "province": {"state_district", "county", "administrative"},
    "place": {"county", "district", "city_district", "borough", "suburb", "subdistrict", "hamlet", "administrative"},
}


def _nominatim_reverse(lat: float, lng: float, zoom: int) -> dict:
    with _nominatim_lock:
        wait = 1.1 - (time.time() - _last_nominatim_call[0])
        if wait > 0:
            time.sleep(wait)
        qs = urllib.parse.urlencode({
            "lat": lat, "lon": lng, "format": "jsonv2",
            "zoom": zoom, "polygon_geojson": 1, "addressdetails": 1,
        })
        req = urllib.request.Request(
            f"https://nominatim.openstreetmap.org/reverse?{qs}",
            headers={"User-Agent": "history-storyteller-map/1.0 (local dev tool; contact via github)"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        _last_nominatim_call[0] = time.time()
    return data


def fetch_boundary(lat: float, lng: float, level: str, land_clip: bool = True) -> dict:
    key = (round(lat, 3), round(lng, 3), level, land_clip)
    if key in _boundary_cache:
        return _boundary_cache[key]

    primary = BOUNDARY_PRIMARY_TYPES.get(level, set())
    secondary = BOUNDARY_SECONDARY_TYPES.get(level, set())
    ladder = BOUNDARY_ZOOM_LADDER.get(level, [10])
    data = None
    secondary_hit = None
    fallback = None
    for zoom in ladder:
        candidate = _nominatim_reverse(lat, lng, zoom)
        geo = candidate.get("geojson")
        if not geo or geo.get("type") not in ("Polygon", "MultiPolygon"):
            continue
        if fallback is None:
            fallback = candidate  # เก็บอันแรกที่มีรูปพื้นที่จริงไว้เผื่อไม่เจอชนิดที่ตรงเลย
        addr_type = candidate.get("addresstype")
        if addr_type in primary:
            data = candidate
            break
        if secondary_hit is None and addr_type in secondary:
            secondary_hit = candidate
    if data is None:
        data = secondary_hit or fallback or {}

    name = data.get("name") or (data.get("display_name") or "").split(",")[0]
    country_code = (data.get("address") or {}).get("country_code")  # เช่น "th" — ใช้ดึงธงชาติ
    geojson = data.get("geojson")
    if land_clip and geojson and geojson.get("type") in ("Polygon", "MultiPolygon"):
        geojson = clip_to_land(geojson)
    result = {"name": name, "geojson": geojson, "countryCode": country_code, "addressType": data.get("addresstype")}
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


# ---------- เส้นทางจริงตามถนน (route=road) ----------
# OSRM demo server สาธารณะ ฟรี ไม่ต้องมีคีย์ (เหมาะกับเครื่องมือส่วนตัว/dev — ปริมาณเยอะจริงจังควรเปลี่ยนไปโฮสต์เอง)
_route_cache = {}


def fetch_route(lat1: float, lng1: float, lat2: float, lng2: float) -> list:
    key = (round(lat1, 4), round(lng1, 4), round(lat2, 4), round(lng2, 4))
    if key in _route_cache:
        return _route_cache[key]
    qs = urllib.parse.urlencode({"geometries": "geojson", "overview": "full"})
    url = f"https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "history-storyteller-map/1.0 (local dev tool)"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    routes = data.get("routes") or []
    coords = routes[0]["geometry"]["coordinates"] if routes else []  # [[lng,lat], ...]
    _route_cache[key] = coords
    return coords


# ---------- ค้นภาพประกอบอัตโนมัติจาก Wikimedia Commons (ฟรี ไม่ต้องมีคีย์) ----------
_imagesearch_cache = {}


def fetch_image_search(query: str, limit: int = 5) -> list:
    key = (query.lower(), limit)
    if key in _imagesearch_cache:
        return _imagesearch_cache[key]
    qs = urllib.parse.urlencode({
        "action": "query",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": 6,  # namespace 6 = File:
        "gsrlimit": limit,
        "prop": "imageinfo",
        "iiprop": "url",
        "iiurlwidth": 800,
        "format": "json",
    })
    url = f"https://commons.wikimedia.org/w/api.php?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "history-storyteller-map/1.0 (local dev tool)"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    pages = (data.get("query") or {}).get("pages") or {}
    results = []
    for page in pages.values():
        infos = page.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        img_url = info.get("thumburl") or info.get("url")
        if img_url:
            results.append({"title": page.get("title", ""), "url": img_url})
    _imagesearch_cache[key] = results
    return results


# ---------- ค้นเสียงประกอบ/SFX จาก Wikimedia Commons (endpoint เดิม แค่กรอง filetype:audio — ไฟล์เสียงก็อยู่ namespace 6 เหมือนรูป) ----------
_audiosearch_cache = {}


def fetch_audio_search(query: str, limit: int = 5) -> list:
    key = (query.lower(), limit)
    if key in _audiosearch_cache:
        return _audiosearch_cache[key]
    qs = urllib.parse.urlencode({
        "action": "query",
        "generator": "search",
        "gsrsearch": f"filetype:audio {query}",
        "gsrnamespace": 6,
        "gsrlimit": limit,
        "prop": "imageinfo",
        "iiprop": "url|mime",
        "format": "json",
    })
    url = f"https://commons.wikimedia.org/w/api.php?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "history-storyteller-map/1.0 (local dev tool)"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    pages = (data.get("query") or {}).get("pages") or {}
    results = []
    for page in pages.values():
        infos = page.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        audio_url = info.get("url")
        if audio_url:
            results.append({"title": page.get("title", ""), "url": audio_url, "mime": info.get("mime", "")})
    _audiosearch_cache[key] = results
    return results


# ---------- Internet Archive (archive.org) — คลังฟิล์ม/newsreel สาธารณสมบัติ ฟรี ไม่ต้องมีคีย์ ----------
# ค้นแล้วต้องเรียก metadata อีกรอบต่อ identifier เพื่อหาไฟล์ mp4 จริงที่เล่นได้ (2 ขั้นตอนเหมือน Wikidata)
_archivesearch_cache = {}
_archivefile_cache = {}


def fetch_archive_search(query: str, limit: int = 6) -> list:
    key = (query.lower(), limit)
    if key in _archivesearch_cache:
        return _archivesearch_cache[key]
    # fl[] ต้องส่งซ้ำได้หลายค่า — ใช้ list of tuples แทน dict ให้ urlencode ส่งคีย์ซ้ำได้
    qs = urllib.parse.urlencode([
        ("q", f"({query}) AND mediatype:(movies)"),
        ("fl[]", "identifier"),
        ("fl[]", "title"),
        ("fl[]", "description"),
        ("rows", limit),
        ("output", "json"),
    ])
    url = f"https://archive.org/advancedsearch.php?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "history-storyteller-map/1.0 (local dev tool)"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    docs = ((data.get("response") or {}).get("docs")) or []
    results = []
    for d in docs:
        desc = d.get("description")
        if isinstance(desc, list):
            desc = desc[0] if desc else ""
        results.append({
            "identifier": d.get("identifier", ""),
            "title": d.get("title", ""),
            "description": (desc or "")[:200],
        })
    _archivesearch_cache[key] = results
    return results


def fetch_archive_file(identifier: str):
    if identifier in _archivefile_cache:
        return _archivefile_cache[identifier]
    req = urllib.request.Request(
        f"https://archive.org/metadata/{urllib.parse.quote(identifier)}",
        headers={"User-Agent": "history-storyteller-map/1.0 (local dev tool)"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    files = data.get("files") or []
    # เลือกไฟล์ .mp4 ที่ไม่ใช่ "Preservation Master" (มักใหญ่มากเป็น GB ไม่เหมาะฝัง <video> ตรงๆ) เอาไฟล์เล็กสุดที่พอเล่นได้
    mp4_files = [f for f in files if f.get("name", "").lower().endswith(".mp4") and "preservation" not in f.get("name", "").lower()]
    if not mp4_files:
        mp4_files = [f for f in files if f.get("name", "").lower().endswith(".mp4")]
    if not mp4_files:
        _archivefile_cache[identifier] = None
        return None
    mp4_files.sort(key=lambda f: int(f.get("size") or 0))
    chosen = mp4_files[0]
    result = {
        "url": f"https://archive.org/download/{identifier}/{urllib.parse.quote(chosen['name'])}",
        "sizeMb": round(int(chosen.get("size") or 0) / 1024 / 1024, 1),
        "duration": float(chosen.get("length")) if chosen.get("length") else None,
    }
    _archivefile_cache[identifier] = result
    return result


# ---------- Wikidata (ฟรี ไม่ต้องมีคีย์) — ชื่อภาษาอังกฤษ/พิกัด/ปี ของสถานที่หรือเหตุการณ์ประวัติศาสตร์ จากฐานข้อมูลที่มีอ้างอิงจริง ----------
# ใช้แก้ปัญหา 2 อย่าง: (1) ค้นภาพ Wikimedia Commons ด้วยชื่อไทยมักไม่เจอ/ได้รูปผิดยุค — ได้ชื่ออังกฤษ+ปีจริงมาค้นแทน
# (2) year= ที่เดาจากบทพากย์ (พาท 33) ไม่มีก็ได้ปีจริงจาก Wikidata แทนได้ ไม่ใช่การเดา
_wikidata_cache = {}


def fetch_wikidata(query: str):
    key = query.strip().lower()
    if key in _wikidata_cache:
        return _wikidata_cache[key]
    headers = {"User-Agent": "history-storyteller-map/1.0 (local dev tool; contact via github)"}

    def search(lang: str):
        qs = urllib.parse.urlencode({
            "action": "wbsearchentities", "search": query, "language": lang, "uselang": lang,
            "type": "item", "limit": 1, "format": "json",
        })
        req = urllib.request.Request(f"https://www.wikidata.org/w/api.php?{qs}", headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read()).get("search") or []

    # ค้นภาษาไทยก่อน (ตรงกับที่ผู้ใช้พิมพ์) หลาย entity ไม่มี label ไทยจึงลองอังกฤษต่อถ้าไม่เจอ
    hits = search("th") or search("en")
    if not hits:
        _wikidata_cache[key] = None
        return None
    entity_id = hits[0]["id"]

    entity_qs = urllib.parse.urlencode({
        "action": "wbgetentities", "ids": entity_id, "props": "labels|descriptions|claims",
        "languages": "en|th", "format": "json",
    })
    req2 = urllib.request.Request(f"https://www.wikidata.org/w/api.php?{entity_qs}", headers=headers)
    with urllib.request.urlopen(req2, timeout=15) as resp2:
        entity_data = json.loads(resp2.read())
    entity = (entity_data.get("entities") or {}).get(entity_id) or {}
    labels = entity.get("labels") or {}
    label_en = (labels.get("en") or {}).get("value")
    descriptions = entity.get("descriptions") or {}
    desc = (descriptions.get("th") or {}).get("value") or (descriptions.get("en") or {}).get("value")
    claims = entity.get("claims") or {}

    lat = lng = None
    for coord_claim in claims.get("P625") or []:
        try:
            coord_value = coord_claim["mainsnak"]["datavalue"]["value"]
            lat, lng = coord_value.get("latitude"), coord_value.get("longitude")
            break
        except (KeyError, TypeError):
            continue

    year = None
    for prop in ("P585", "P580", "P571"):  # point in time / start time / inception — เอาตัวแรกที่เจอ
        for date_claim in claims.get(prop) or []:
            try:
                time_str = date_claim["mainsnak"]["datavalue"]["value"]["time"]  # เช่น "+1941-12-07T00:00:00Z"
                year = time_str[1:5]
                break
            except (KeyError, TypeError):
                continue
        if year:
            break

    result = {"entityId": entity_id, "labelEn": label_en, "description": desc, "lat": lat, "lng": lng, "year": year}
    _wikidata_cache[key] = result
    return result


_RATE_RE = re.compile(r"^[+-]\d{1,3}%$")
_PITCH_RE = re.compile(r"^[+-]\d{1,3}Hz$")


def _tts_cache_path(text: str, voice: str, rate: str, pitch: str) -> Path:
    key = hashlib.sha1(f"{voice}::{rate}::{pitch}::{text}".encode("utf-8")).hexdigest()
    return TTS_CACHE_DIR / f"{key}.mp3"


async def synthesize(text: str, voice: str, rate: str = "+0%", pitch: str = "+0Hz") -> bytes:
    # ตรวจรูปแบบก่อนส่งต่อให้ edge-tts เสมอ (รับค่าจากฝั่งเว็บ ป้องกันค่าผิดรูปแบบหลุดเข้า Communicate)
    rate = rate if _RATE_RE.match(rate or "") else "+0%"
    pitch = pitch if _PITCH_RE.match(pitch or "") else "+0Hz"
    cache_path = _tts_cache_path(text, voice, rate, pitch)
    if cache_path.exists():
        return cache_path.read_bytes()
    # edge-tts เป็นบริการฟรีของ Microsoft ที่ปฏิเสธ/ตัดการเชื่อมต่อเป็นระยะเมื่อยิงคำขอถี่ๆติดกัน (เจอจากเทสสคริปต์ 31 ฉาก:
    # ล้มเหลวราวครึ่งหนึ่งของคำขอตอน preload ทำให้ฉากนั้นไม่มีเสียงในแคช แล้วไปค้างกลางคลิปตอนเล่นจริง)
    # ลองใหม่ถึง 3 ครั้งพร้อมหน่วงเพิ่มขึ้นเรื่อยๆ ก่อนยอมแพ้ — ฝั่งเว็บยัง fallback ได้เหมือนเดิมถ้าล้มเหลวครบ 3 ครั้ง
    last_exc = None
    for attempt in range(3):
        try:
            communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
            audio = bytearray()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio.extend(chunk["data"])
            if audio:
                try:
                    TTS_CACHE_DIR.mkdir(exist_ok=True)
                    cache_path.write_bytes(bytes(audio))
                except OSError as exc:  # เขียนแคชไม่ได้ (ดิสก์เต็ม/สิทธิ์) ไม่ควรทำให้พากย์เสียงล้มเหลวไปด้วย
                    print(f"เขียนแคชเสียงไม่สำเร็จ: {exc}", file=sys.stderr)
                return bytes(audio)
            last_exc = RuntimeError("edge-tts ส่งเสียงกลับมาว่างเปล่า")
        except Exception as exc:
            last_exc = exc
        if attempt < 2:
            await asyncio.sleep(0.8 * (attempt + 1))
    raise last_exc or RuntimeError("edge-tts ล้มเหลวโดยไม่ทราบสาเหตุ")


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
    def end_headers(self):
        # เซิร์ฟเวอร์เดฟสำหรับแก้โค้ดสด — ปิด browser cache ทุกไฟล์เสมอ กัน script.js/index.html/styles.css
        # ค้างเวอร์ชันเก่าในแคชแล้วดูเหมือนโค้ดที่เพิ่งแก้ไม่มีผล (ไม่งั้นต้อง hard-refresh/เคลียร์แคชเองทุกครั้ง)
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

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
        if self.path.startswith("/api/route"):
            self.handle_route()
            return
        if self.path.startswith("/api/imagesearch"):
            self.handle_imagesearch()
            return
        if self.path.startswith("/api/wikidata"):
            self.handle_wikidata()
            return
        if self.path.startswith("/api/audiosearch"):
            self.handle_audiosearch()
            return
        if self.path.startswith("/api/archivesearch"):
            self.handle_archivesearch()
            return
        if self.path.startswith("/api/archivefile"):
            self.handle_archivefile()
            return
        path_only = self.path.split("?", 1)[0]
        if path_only in ("/", "/index.html"):
            self.handle_index()
            return
        super().do_GET()

    def handle_index(self):
        # เสิร์ฟ index.html เองพร้อมแปะ mtime ของ script.js/styles.css ต่อท้าย query string เสมอ
        # กัน browser cache เก็บโค้ดเก่าค้างไว้ตอนแก้ไขสด (no-store header อย่างเดียวไม่พอ ถ้า cache เดิมมีอยู่แล้วก่อนหน้านี้)
        try:
            html = (Path(__file__).parent / "index.html").read_text(encoding="utf-8")
            script_v = int((Path(__file__).parent / "script.js").stat().st_mtime)
            style_v = int((Path(__file__).parent / "styles.css").stat().st_mtime)
            html = html.replace('src="script.js"', f'src="script.js?v={script_v}"')
            html = html.replace('href="styles.css"', f'href="styles.css?v={style_v}"')
            body = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self.send_error(500, str(exc))

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

    def handle_imagesearch(self):
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            query = (qs.get("q", [""])[0] or "").strip()
            if not query:
                self.send_error(400, "missing q")
                return
            results = fetch_image_search(query)
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

    def handle_audiosearch(self):
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            query = (qs.get("q", [""])[0] or "").strip()
            if not query:
                self.send_error(400, "missing q")
                return
            results = fetch_audio_search(query)
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

    def handle_archivesearch(self):
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            query = (qs.get("q", [""])[0] or "").strip()
            if not query:
                self.send_error(400, "missing q")
                return
            results = fetch_archive_search(query)
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

    def handle_archivefile(self):
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            identifier = (qs.get("id", [""])[0] or "").strip()
            if not identifier:
                self.send_error(400, "missing id")
                return
            result = fetch_archive_file(identifier)
            body = json.dumps({"result": result}).encode("utf-8")
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

    def handle_wikidata(self):
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            query = (qs.get("q", [""])[0] or "").strip()
            if not query:
                self.send_error(400, "missing q")
                return
            result = fetch_wikidata(query)
            body = json.dumps({"result": result}).encode("utf-8")
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

    def handle_route(self):
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            lat1 = float(qs.get("lat1", [""])[0])
            lng1 = float(qs.get("lng1", [""])[0])
            lat2 = float(qs.get("lat2", [""])[0])
            lng2 = float(qs.get("lng2", [""])[0])
            coords = fetch_route(lat1, lng1, lat2, lng2)
            body = json.dumps({"coords": coords}).encode("utf-8")
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
            land_clip = (qs.get("landclip", ["1"])[0] or "1").strip() != "0"  # ปิดได้จากหน้าเว็บถ้าอยากได้เขตทางทะเลจริงด้วย
            result = fetch_boundary(lat, lng, level, land_clip)
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
            rate = (body.get("rate") or "+0%").strip()
            pitch = (body.get("pitch") or "+0Hz").strip()
            if not text:
                self.send_error(400, "missing text")
                return
            audio_bytes = asyncio.run(synthesize(text, voice, rate, pitch))
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
