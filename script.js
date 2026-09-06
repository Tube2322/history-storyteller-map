const CAM_LABELS = {
  "establishing": "ภาพเปิดกว้าง",
  "fly-to": "กล้องบินเดินทาง",
  "push-in": "ซูมเข้าถึงจุดหมาย",
  "zoom-out": "ซูมออกเผยภาพรวม",
  "orbit": "กล้องหมุนรอบจุดสนใจ",
  "cut-to-insert": "ตัดเข้าภาพเต็มจอ",
  "insert-overlay": "แทรกภาพลอย (PiP)",
  "battle-map": "แผนที่สนามรบ (RTS)",
};
const CAM_DOT_VAR = {
  "establishing": "var(--cam-establishing)",
  "fly-to": "var(--cam-flyto)",
  "push-in": "var(--cam-pushin)",
  "zoom-out": "var(--cam-zoomout)",
  "orbit": "var(--cam-orbit)",
  "cut-to-insert": "var(--cam-cutinsert)",
  "insert-overlay": "var(--cam-insertoverlay)",
  "battle-map": "var(--cam-battlemap)",
};
const CAM_STAGE_CLASS = {
  "cut-to-insert": "mapstage-cutinsert",
  "insert-overlay": "mapstage-insertoverlay",
};
const DEFAULT_DURATION = 5;
const FALLBACK_COORD = { lat: 13.7563, lng: 100.5018 }; // กรุงเทพฯ (ใช้เมื่อไม่ระบุ lat,lng)
const DEFAULT_VOICE = "th-TH-PremwadeeNeural";
const AUTOSAVE_KEY = "hsm_last_script_v1";
const SEGMENT_DELIM = ";;";

const ICON_GLYPHS = {
  city: "🏙️",
  castle: "🏯",
  ship: "⛵",
  battle: "⚔️",
  flag: "🚩",
  mountain: "⛰️",
  camp: "⛺",
  default: "📍",
};
const EFFECT_GLYPHS = {
  storm: "⛈️",
  fire: "🔥",
  battle: "⚔️",
};
const TRANSPORT_GLYPHS = {
  plane: "✈️",
  car: "🚗",
  ship: "⛴️",
  train: "🚂",
  walk: "🚶",
};

const el = {
  insertLayerContent: document.getElementById("insertLayerContent"),
  insertFloatContent: document.getElementById("insertFloatContent"),
  brandChip: document.getElementById("brandChip"),
  brandText: document.getElementById("brandText"),
  brandInput: document.getElementById("brandInput"),
  brandCorner: document.getElementById("brandCorner"),
  epTitle: document.getElementById("epTitle"),
  sceneCounter: document.getElementById("sceneCounter"),
  camBadge: document.getElementById("camBadge"),
  camLabel: document.getElementById("camLabel"),
  subtitleText: document.getElementById("subtitleText"),
  timelineTrack: document.getElementById("timelineTrack"),
  btnPrev: document.getElementById("btnPrev"),
  btnPlay: document.getElementById("btnPlay"),
  btnNext: document.getElementById("btnNext"),
  btnImport: document.getElementById("btnImport"),
  importPanel: document.getElementById("importPanel"),
  btnCloseImport: document.getElementById("btnCloseImport"),
  importText: document.getElementById("importText"),
  btnParse: document.getElementById("btnParse"),
  btnClear: document.getElementById("btnClear"),
  importPreview: document.getElementById("importPreview"),
  btnDownloadTemplate: document.getElementById("btnDownloadTemplate"),
  fileImportXlsx: document.getElementById("fileImportXlsx"),
  mapStage: document.getElementById("mapStage"),
  ttsPlayer: document.getElementById("ttsPlayer"),
  btnExport: document.getElementById("btnExport"),
  stageEl: document.getElementById("stageEl"),
  exportMenu: document.getElementById("exportMenu"),
  regionLabel: document.getElementById("regionLabel"),
  captionOverlay: document.getElementById("captionOverlay"),
  shadeOverlay: document.getElementById("shadeOverlay"),
  topbar: document.querySelector(".topbar"),
  timeline: document.getElementById("timeline"),
  btnSaveProject: document.getElementById("btnSaveProject"),
  fileLoadProject: document.getElementById("fileLoadProject"),
  autosaveHint: document.getElementById("autosaveHint"),
  fileUploadImage: document.getElementById("fileUploadImage"),
  uploadList: document.getElementById("uploadList"),
  searchPlaceInput: document.getElementById("searchPlaceInput"),
  btnSearchPlace: document.getElementById("btnSearchPlace"),
  searchResultList: document.getElementById("searchResultList"),
  bgmPlayer: document.getElementById("bgmPlayer"),
  subtitleWrap: document.getElementById("subtitleWrap"),
  voiceSelect: document.getElementById("voiceSelect"),
  voiceRate: document.getElementById("voiceRate"),
  voiceRateOut: document.getElementById("voiceRateOut"),
  voicePitch: document.getElementById("voicePitch"),
  voicePitchOut: document.getElementById("voicePitchOut"),
  fileUploadBgm: document.getElementById("fileUploadBgm"),
  btnClearBgm: document.getElementById("btnClearBgm"),
  bgmFileName: document.getElementById("bgmFileName"),
  bgmVolume: document.getElementById("bgmVolume"),
  bgmVolumeOut: document.getElementById("bgmVolumeOut"),
  sceneGap: document.getElementById("sceneGap"),
  sceneGapOut: document.getElementById("sceneGapOut"),
  subtitlePos: document.getElementById("subtitlePos"),
  subtitleColor: document.getElementById("subtitleColor"),
  subtitleSize: document.getElementById("subtitleSize"),
  subtitleWeight: document.getElementById("subtitleWeight"),
  landClipToggle: document.getElementById("landClipToggle"),
  calloutLine: document.getElementById("calloutLine"),
  calloutLineEl: document.getElementById("calloutLineEl"),
  calloutBox: document.getElementById("calloutBox"),
  calloutImg: document.getElementById("calloutImg"),
  calloutLabel: document.getElementById("calloutLabel"),
};

let scenes = [];
let activeIndex = -1;
let isPlaying = false;
let highlightPersistLeft = 0; // persist=N — จำนวนฉากถัดไปที่ยังคงให้เขตแดนที่ไฮไลต์ค้างอยู่ ไม่เคลียร์ทันที
let playToken = 0;
let isExporting = false;

// ---------- ตั้งค่าการอัด: เสียงพากย์ / เพลงพื้นหลัง / จังหวะฉาก / สไตล์ซับไตเติล ----------
let voiceSettings = { voice: DEFAULT_VOICE, rate: "+0%", pitch: "+0Hz" };
let bgmUrl = "";
let bgmVolumeLevel = 0.25;
let landClipEnabled = true; // ตัดเส้นไฮไลต์ให้อยู่แค่บนแผ่นดิน (ปิดได้ถ้าอยากได้เขตทางทะเลตามข้อมูล OSM จริง)
let sceneGapSec = 0;
let subtitleStyle = { pos: "bottom", color: "", size: 0, weight: "" };

function applySubtitleStyle() {
  el.subtitleWrap.classList.toggle("pos-top", subtitleStyle.pos === "top");
  el.subtitleText.style.color = subtitleStyle.color || "";
  el.subtitleText.style.fontSize = subtitleStyle.size ? `${subtitleStyle.size}px` : "";
  el.subtitleText.style.fontWeight = subtitleStyle.weight || "";
}
let recorder = null;
let recordedChunks = [];
let map; // ประกาศไว้ก่อน เพราะ fitStage() ต้องเรียกได้ตั้งแต่ก่อนสร้างแผนที่จริง (เพื่อเซ็ตขนาด container ก่อน)
let isRenderMode = false;
let renderDurations = null; // [[seg1,seg2,...], ...] ต่อฉาก ใส่มาจาก render.py ผ่าน URL ให้จังหวะภาพตรงกับเสียงที่เรนเดอร์แยกไว้เป๊ะๆ

// ---------- สัดส่วนเวที ----------
// แก้ไข/ดูตัวอย่างบนคอม: เต็มจอเสมอ ("free") รองรับทุกขนาดหน้าจอ
// พอจะ "บันทึกวิดีโอ" ค่อยเลือกสัดส่วนปลายทาง (9:16 TikTok/Shorts/Reels หรือ 16:9 YouTube)
// ตอนนั้นเวทีจะย่อเป็นกรอบนั้นชั่วคราวระหว่างอัด แล้วคืนเป็นเต็มจอให้อัตโนมัติหลังอัดเสร็จ
// (render.py ฝั่งเซิร์ฟเวอร์เลือกสัดส่วนแยกผ่าน --aspect โดยไม่เกี่ยวกับตัวเอดิเตอร์เลย)

let currentAspect = "free";
let lastExportAspect = "916";

function fitStage() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (currentAspect === "free") {
    el.stageEl.style.width = "100%";
    el.stageEl.style.height = "100%";
  } else {
    const ratio = currentAspect === "169" ? 16 / 9 : 9 / 16;
    let w = vh * ratio;
    let h = vh;
    if (w > vw) { w = vw; h = vw / ratio; }
    el.stageEl.style.width = `${Math.round(w)}px`;
    el.stageEl.style.height = `${Math.round(h)}px`;
  }
  if (map) map.resize();
}
window.addEventListener("resize", fitStage);
fitStage(); // เซ็ตขนาดเวทีก่อนสร้างแผนที่ ให้ container มีขนาดถูกต้องตั้งแต่แรก

// ---------- แผนที่จริง (MapLibre GL + ภาพถ่ายดาวเทียม Esri) ----------

map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      esri: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "Esri, Maxar, Earthstar Geographics, USDA, USGS, AEX, GIS User Community",
      },
    },
    layers: [{ id: "esri", type: "raster", source: "esri" }],
  },
  center: [FALLBACK_COORD.lng, FALLBACK_COORD.lat],
  zoom: 4.3,
  dragRotate: false,
  pitchWithRotate: false,
  attributionControl: { compact: true },
});

map.on("load", () => {
  map.addSource("scene-line", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "scene-line-layer",
    type: "line",
    source: "scene-line",
    paint: {
      "line-color": "#f2b544",
      "line-width": 2,
      "line-dasharray": [2, 1.4],
      "line-opacity": 0.9,
    },
  });

  // ไฮไลต์ขอบเขตพื้นที่ (จังหวัด/ประเทศ) — ข้อมูลจริงจาก OpenStreetMap ต่อพิกัดฉาก
  map.addSource("region-boundary", { type: "geojson", data: emptyFC() }); // เก็บวงรอบเต็มไว้ให้เส้นขอบ/trace อ้างอิงเสมอ
  map.addSource("region-fill-mask", { type: "geojson", data: emptyFC() }); // ส่วนที่ "เผยแล้ว" ของพื้นที่ (โตขึ้นเรื่อยๆ ตาม reveal mode)
  map.addLayer({
    id: "region-fill",
    type: "fill",
    source: "region-fill-mask",
    paint: { "fill-color": "#f2b544", "fill-opacity": 0.18 },
  });
  map.addLayer({
    id: "region-line",
    type: "line",
    source: "region-boundary",
    paint: { "line-color": "#f2b544", "line-width": 1.5, "line-opacity": 0, "line-dasharray": [1, 1.5] },
  });
  // เรืองแสงใต้เส้นลาก (border glow)
  map.addSource("region-line-trace", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "region-line-glow",
    type: "line",
    source: "region-line-trace",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#f2b544", "line-width": 10, "line-blur": 6, "line-opacity": 0.55 },
  });
  // เส้นลากแบบปากกาวาด (border trace) — ทับบนเส้นจางด้านบน ค่อยๆยาวขึ้นตามเวลาจริง
  map.addLayer({
    id: "region-line-trace-layer",
    type: "line",
    source: "region-line-trace",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#f2b544", "line-width": 3, "line-opacity": 0.95 },
  });

  // War morph: พื้นที่ที่ถูกยึด ค่อยๆเปลี่ยนสีจากฝ่ายแพ้เป็นฝ่ายชนะ + เส้นขอบใหม่
  map.addSource("warmorph-captured", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "warmorph-captured-fill",
    type: "fill",
    source: "warmorph-captured",
    paint: { "fill-color": "#f2b544", "fill-opacity": 0 },
  });
  map.addLayer({
    id: "warmorph-captured-line",
    type: "line",
    source: "warmorph-captured",
    paint: { "line-color": "#f2b544", "line-width": 2, "line-opacity": 0 },
  });

  // แผนที่สนามรบ (RTS): ลูกศรเดินทัพหลายเส้นพร้อมกัน แยกสีตามฝ่าย
  map.addSource("battle-arrows", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "battle-arrows-layer",
    type: "line",
    source: "battle-arrows",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 3.5,
      "line-opacity": 0.92,
    },
  });

  // draw= — เส้นวาดอิสระตามพิกัดที่พิมพ์เอง (เทียบเท่า "Pen" ของ AnimateMyMap แบบพิมพ์พิกัดแทนลากเมาส์)
  map.addSource("freeform-draw", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "freeform-draw-layer",
    type: "line",
    source: "freeform-draw",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 3, "line-opacity": 0 },
  });
});

function emptyFC() {
  return { type: "FeatureCollection", features: [] };
}

// ---------- ไฮไลต์ขอบเขตพื้นที่ ----------

const boundaryCache = new Map();
let boundaryFillRAF = null;
let boundaryTraceRAF = null;
let boundaryRequestSeq = 0;
const loadedFlagImages = new Set();

async function fetchBoundary(lat, lng, level) {
  const clip = landClipEnabled ? 1 : 0;
  const key = `${level}:${lat.toFixed(3)},${lng.toFixed(3)}:${clip}`; // แยกแคชตามโหมดตัดชายฝั่ง เพราะได้รูปคนละแบบ
  if (boundaryCache.has(key)) return boundaryCache.get(key);
  const res = await fetch(`/api/boundary?lat=${lat}&lng=${lng}&level=${level}&landclip=${clip}`);
  if (!res.ok) throw new Error(`โหลดขอบเขตพื้นที่ไม่สำเร็จ (${res.status})`);
  const data = await res.json();
  boundaryCache.set(key, data);
  return data;
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]);
  const la2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ดึงวงรอบนอกที่ยาวที่สุดมาใช้ "ลากเส้น" (ถ้าเป็น MultiPolygon เลือกวงที่มีจุดเยอะสุดเป็นตัวแทน)
function outerRingOf(geojson) {
  const polygons = geojson.type === "MultiPolygon" ? geojson.coordinates : [geojson.coordinates];
  let best = null;
  for (const poly of polygons) {
    const ring = poly[0];
    if (!best || ring.length > best.length) best = ring;
  }
  return best;
}

// ขอบเขตจริงจาก OSM มีจุดได้เป็นพัน — ตัด/คลิปทุกเฟรมจะกระตุก จึงลดจุดลงเฉพาะตอนอนิเมชัน
// (ค่าที่นิ่งสุดท้ายยังคงใช้ region-boundary ความละเอียดเต็มเสมอ ไม่กระทบความแม่นยำที่ตาเห็น)
function simplifyRing(ring, maxPoints) {
  if (ring.length <= maxPoints) return ring;
  const step = ring.length / maxPoints;
  const out = [];
  for (let i = 0; i < maxPoints; i++) out.push(ring[Math.floor(i * step)]);
  out.push(ring[0]);
  return out;
}

function easeInOutCubic(t) {
  const v = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return Math.min(1, Math.max(0, v)); // กันพลาดจุดลอยตัวเกิน [0,1] เล็กน้อยตอน t≈1
}

function sliceRing(ring, fraction) {
  if (fraction >= 1) return ring;
  let total = 0;
  for (let i = 1; i < ring.length; i++) total += haversine(ring[i - 1], ring[i]);
  const target = total * fraction;
  let acc = 0;
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const d = haversine(ring[i - 1], ring[i]);
    if (acc + d >= target) {
      const t = d > 0 ? (target - acc) / d : 0;
      out.push([
        ring[i - 1][0] + (ring[i][0] - ring[i - 1][0]) * t,
        ring[i - 1][1] + (ring[i][1] - ring[i - 1][1]) * t,
      ]);
      break;
    }
    acc += d;
    out.push(ring[i]);
  }
  return out;
}

// เริ่มลากเส้นจาก N จุดกระจายเท่าๆกันรอบวงพร้อมกัน (สำหรับ trace=two/four)
// แต่ละจุดลากไปทิศเดียวกัน (ตามลำดับวง) คนละ 1/N ส่วน — ดูเหมือนหลายปากกาวาดพร้อมกัน
function sliceRingFromPoints(ring, fraction, startCount) {
  const n = ring.length;
  const segFraction = fraction / startCount;
  const out = [];
  for (let k = 0; k < startCount; k++) {
    const startIdx = Math.floor((k / startCount) * n);
    const rotated = ring.slice(startIdx).concat(ring.slice(0, startIdx + 1));
    out.push(sliceRing(rotated, Math.min(1, segFraction)));
  }
  return out;
}

// ลากเส้นขอบเขตทีละนิดเหมือนปากกาวาด (border trace) — trace: one/two/tworeverse/four
function animateBorderTrace(ring, durationMs, mode) {
  if (boundaryTraceRAF) cancelAnimationFrame(boundaryTraceRAF);
  const start = performance.now();
  const startCount = mode === "four" ? 4 : mode === "two" || mode === "tworeverse" ? 2 : 1;
  function step(now) {
    const raw = Math.min(1, (now - start) / durationMs);
    const t = easeInOutCubic(raw);
    const src = map.getSource("region-line-trace");
    if (src) {
      const lines = startCount === 1
        ? [sliceRing(ring, t)]
        : sliceRingFromPoints(mode === "tworeverse" ? ring.slice().reverse() : ring, t, startCount);
      src.setData({
        type: "FeatureCollection",
        features: lines.map((coords) => ({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} })),
      });
    }
    if (raw < 1) boundaryTraceRAF = requestAnimationFrame(step);
  }
  step(start);
  map.setPaintProperty("region-line-glow", "line-opacity", 0.55);
  boundaryTraceRAF = requestAnimationFrame(step);
}

// ---------- Fill reveal: fade / wipe / split / circular / diamond ----------
// ใช้เทคนิค Sutherland-Hodgman ตัด polygon จริงด้วย "หน้ากาก" นูนที่โตขึ้นตามเวลา
// (wipe/split/diamond = ตัดด้วยเส้นตรง/สี่เหลี่ยมขยาย, circular = ตัดด้วยหลายเหลี่ยมจำลองวงกลม)

function clipByHalfPlane(ring, p1, p2, keepSign) {
  function side(pt) { return (p2[0] - p1[0]) * (pt[1] - p1[1]) - (p2[1] - p1[1]) * (pt[0] - p1[0]); }
  function intersect(a, b) {
    const d1 = side(a), d2 = side(b);
    const t = d1 / (d1 - d2);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const curr = ring[i];
    const prev = ring[(i - 1 + ring.length) % ring.length];
    const cs = side(curr) * keepSign;
    const ps = side(prev) * keepSign;
    if (cs >= 0) {
      if (ps < 0) out.push(intersect(prev, curr));
      out.push(curr);
    } else if (ps >= 0) {
      out.push(intersect(prev, curr));
    }
  }
  return out;
}

// ตัด ring ด้วยหลายเหลี่ยมนูน (mask) ต่อกันทีละด้าน — ได้ผลลัพธ์เป็นส่วนที่อยู่ "ใน" mask เท่านั้น
function clipByConvexMask(ring, maskPts) {
  let result = ring;
  for (let i = 0; i < maskPts.length && result.length; i++) {
    const a = maskPts[i];
    const b = maskPts[(i + 1) % maskPts.length];
    result = clipByHalfPlane(result, a, b, 1);
  }
  return result;
}

function regularPolygonMask(center, radiusLng, radiusLat, sides) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    pts.push([center[0] + Math.cos(a) * radiusLng, center[1] + Math.sin(a) * radiusLat]);
  }
  return pts;
}

function revealMask(mode, t, bounds) {
  const { minLng, minLat, maxLng, maxLat } = bounds;
  const w = maxLng - minLng || 0.0001;
  const h = maxLat - minLat || 0.0001;
  const cx = (minLng + maxLng) / 2, cy = (minLat + maxLat) / 2;
  const pad = Math.max(w, h) * 0.15; // เผื่อขอบกันหน้ากากคมเกินไป
  if (mode === "wipe") {
    const x = minLng - pad + (w + pad * 2) * t;
    return [[minLng - pad, minLat - pad], [x, minLat - pad], [x, maxLat + pad], [minLng - pad, maxLat + pad]];
  }
  if (mode === "split") {
    const half = (w / 2 + pad) * t;
    return [[cx - half, minLat - pad], [cx + half, minLat - pad], [cx + half, maxLat + pad], [cx - half, maxLat + pad]];
  }
  if (mode === "diamond") {
    const r = (Math.max(w, h) / 2 + pad) * 1.4142 * t;
    return [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
  }
  // circular / iris — จำลองวงกลมด้วย 28 เหลี่ยม
  const r = (Math.max(w, h) / 2 + pad) * 1.2 * t;
  return regularPolygonMask([cx, cy], r, r, 28);
}

let fillRevealRAF = null;
function animateFillReveal(geojson, mode, durationMs) {
  if (fillRevealRAF) cancelAnimationFrame(fillRevealRAF);
  const maskSrc = map.getSource("region-fill-mask");
  if (!maskSrc) return;
  if (mode === "fade" || mode === "none") {
    maskSrc.setData({ type: "Feature", geometry: geojson, properties: {} });
    return;
  }
  const bounds = boundsFromGeojson(geojson);
  if (!bounds) { maskSrc.setData({ type: "Feature", geometry: geojson, properties: {} }); return; }
  const b = { minLng: bounds.getWest(), minLat: bounds.getSouth(), maxLng: bounds.getEast(), maxLat: bounds.getNorth() };
  const rawPolygons = geojson.type === "MultiPolygon" ? geojson.coordinates.map((p) => p[0]) : [geojson.coordinates[0]];
  const polygons = rawPolygons.map((ring) => simplifyRing(ring, 220));
  const start = performance.now();
  function step(now) {
    const raw = Math.min(1, (now - start) / durationMs);
    const t = easeInOutCubic(raw);
    const mask = revealMask(mode, t, b);
    const clipped = polygons.map((ring) => clipByConvexMask(ring, mask)).filter((r) => r.length >= 3);
    maskSrc.setData({
      type: "FeatureCollection",
      features: clipped.map((ring) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} })),
    });
    if (raw < 1) fillRevealRAF = requestAnimationFrame(step);
    else maskSrc.setData({ type: "Feature", geometry: geojson, properties: {} }); // เฟรมสุดท้ายสลับกลับความละเอียดเต็มให้แม่นยำ
  }
  fillRevealRAF = requestAnimationFrame(step);
}

function animateFillOpacity(toFill) {
  if (boundaryFillRAF) cancelAnimationFrame(boundaryFillRAF);
  const toLine = toFill > 0 ? Math.min(0.9, toFill + 0.15) : 0; // เส้นขอบเข้มขึ้นตามฟิลด์ (focus=on ฟิลด์ทึบกว่า เส้นก็ควรชัดกว่า)
  const fromFill = map.getPaintProperty("region-fill", "fill-opacity") ?? 0;
  const fromLine = map.getPaintProperty("region-line", "line-opacity") ?? 0;
  const start = performance.now();
  const dur = 500;
  function step(now) {
    const raw = Math.min(1, (now - start) / dur);
    const t = easeInOutCubic(raw);
    map.setPaintProperty("region-fill", "fill-opacity", fromFill + (toFill - fromFill) * t);
    map.setPaintProperty("region-line", "line-opacity", fromLine + (toLine - fromLine) * t);
    if (raw < 1) boundaryFillRAF = requestAnimationFrame(step);
  }
  boundaryFillRAF = requestAnimationFrame(step);
}

function ensureFlagImage(countryCode, onReady) {
  const imgId = `flag-${countryCode}`;
  if (loadedFlagImages.has(imgId) || map.hasImage(imgId)) { onReady(imgId); return; }
  // maplibre-gl v4: loadImage() คืน Promise (ไม่ใช่ callback แบบ v2/v3)
  map
    .loadImage(`/api/flag?code=${countryCode}`)
    .then(({ data }) => {
      if (!map.hasImage(imgId)) map.addImage(imgId, data);
      loadedFlagImages.add(imgId);
      onReady(imgId);
    })
    .catch((e) => { console.warn("โหลดธงไม่สำเร็จ", e); onReady(null); });
}

// ---------- War morph: พื้นที่ที่ถูกยึดค่อยๆเปลี่ยนสีจากฝ่ายแพ้เป็นฝ่ายชนะ ----------

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}
function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
}

let warmorphRAF = null;
function animateWarmorph(ring, warmorph, loserColor, durationMs) {
  if (warmorphRAF) cancelAnimationFrame(warmorphRAF);
  const captured = clipByHalfPlane(simplifyRing(ring, 220), warmorph.p1, warmorph.p2, 1).filter((r) => r);
  const capturedSrc = map.getSource("warmorph-captured");
  if (!capturedSrc || captured.length < 3) { if (capturedSrc) capturedSrc.setData(emptyFC()); return; }
  capturedSrc.setData({ type: "Feature", geometry: { type: "Polygon", coordinates: [captured] }, properties: {} });
  map.setPaintProperty("warmorph-captured-fill", "fill-opacity", 0.32);
  map.setPaintProperty("warmorph-captured-line", "line-opacity", 0.9);
  const start = performance.now();
  function step(now) {
    const raw = Math.min(1, (now - start) / durationMs);
    const t = easeInOutCubic(raw);
    const color = lerpColor(loserColor, warmorph.color, t);
    map.setPaintProperty("warmorph-captured-fill", "fill-color", color);
    map.setPaintProperty("warmorph-captured-line", "line-color", color);
    if (raw < 1) warmorphRAF = requestAnimationFrame(step);
  }
  warmorphRAF = requestAnimationFrame(step);
}

function clearWarmorph() {
  if (warmorphRAF) cancelAnimationFrame(warmorphRAF);
  const src = map.getSource("warmorph-captured");
  if (src) src.setData(emptyFC());
  map.setPaintProperty("warmorph-captured-fill", "fill-opacity", 0);
  map.setPaintProperty("warmorph-captured-line", "line-opacity", 0);
}

function clearBoundary() {
  animateFillOpacity(0);
  if (boundaryTraceRAF) cancelAnimationFrame(boundaryTraceRAF);
  if (fillRevealRAF) cancelAnimationFrame(fillRevealRAF);
  const traceSrc = map.getSource("region-line-trace");
  if (traceSrc) traceSrc.setData(emptyFC());
  map.setPaintProperty("region-line-glow", "line-opacity", 0);
  const maskSrc = map.getSource("region-fill-mask");
  if (maskSrc) maskSrc.setData(emptyFC());
  clearWarmorph();
  el.regionLabel.classList.remove("is-visible");
  map.setPaintProperty("esri", "raster-saturation", 0); // เลิกไฮไลต์ = คืนสีจอปกติ (เผื่อฉากก่อนหน้าตั้ง focus=on ไว้)
}

// คำนวณกรอบพิกัด (bounds) ของ polygon/multipolygon จริง ใช้ปรับ zoom ให้พอดีขนาดพื้นที่
// (ประเทศ = ซูมออกเห็นทั่วประเทศ, ตำบล = ซูมเข้าเห็นทั่วตำบล — ไม่ใช่ zoom ตายตัวอีกต่อไป)
// mainlandOnly=true: ตัดชิ้นส่วนเล็กๆที่ไกลออกไป (เกาะ/ดินแดนโพ้นทะเล) ออกจากการคำนวณกรอบ
function boundsFromGeojson(geojson, mainlandOnly) {
  let polygons = geojson.type === "MultiPolygon" ? geojson.coordinates.map((p) => p[0]) : [geojson.coordinates[0]];
  if (mainlandOnly && polygons.length > 1) {
    let bestIdx = 0, bestSpan = -1;
    polygons.forEach((ring, i) => {
      let mnLng = Infinity, mxLng = -Infinity, mnLat = Infinity, mxLat = -Infinity;
      ring.forEach(([lng, lat]) => { if (lng < mnLng) mnLng = lng; if (lng > mxLng) mxLng = lng; if (lat < mnLat) mnLat = lat; if (lat > mxLat) mxLat = lat; });
      const span = (mxLng - mnLng) * (mxLat - mnLat);
      if (span > bestSpan) { bestSpan = span; bestIdx = i; }
    });
    polygons = [polygons[bestIdx]];
  }
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  polygons.forEach((ring) => ring.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }));
  if (!Number.isFinite(minLng)) return null;
  return new maplibregl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
}

// ช็อตที่ตั้งใจให้ "เข้าใกล้จุดสนใจ" (orbit/cut-to-insert/insert-overlay) จะไม่ปรับ zoom ตามขอบเขต
// เพราะจุดประสงค์ของช็อตพวกนี้คือโฟกัสจุดเดียวใกล้ๆ ไม่ใช่เผยพื้นที่กว้าง
const AUTO_FRAME_CAMS = new Set(["establishing", "fly-to", "push-in", "zoom-out"]);

function showBoundary(scene) {
  const mySeq = ++boundaryRequestSeq;
  el.regionLabel.classList.remove("is-visible");
  fetchBoundary(scene.lat, scene.lng, scene.highlight)
    .then((data) => {
      if (mySeq !== boundaryRequestSeq || !data.geojson) return; // กันฉากเปลี่ยนไปแล้วแต่ผลลัพธ์เก่ามาช้า
      map.getSource("region-boundary").setData({ type: "Feature", geometry: data.geojson, properties: {} });

      // highlightcolor= กำหนดสีไฮไลต์เอง (ดีฟอลต์เหลืองทอง), focus=on จอทั้งจอเป็นขาวดำยกเว้นเขตที่ไฮไลต์ (สไตล์ Whyhistory)
      const hColor = scene.highlightColor || "#f2b544";
      map.setPaintProperty("region-fill", "fill-color", hColor);
      map.setPaintProperty("region-line", "line-color", hColor);
      map.setPaintProperty("region-line-glow", "line-color", hColor);
      map.setPaintProperty("region-line-trace-layer", "line-color", hColor);
      map.setPaintProperty("esri", "raster-saturation", scene.focus ? -1 : 0);

      animateFillOpacity(scene.focus ? 0.78 : 0.18);
      animateFillReveal(data.geojson, scene.reveal, 1100);
      el.regionLabel.textContent = data.name || scene.place;
      el.regionLabel.classList.add("is-visible");

      const ring = outerRingOf(data.geojson);
      const animRing = ring ? simplifyRing(ring, 240) : null;
      if (animRing) animateBorderTrace(animRing, 1400, scene.trace);

      if (scene.landfill === "flag" && data.countryCode) {
        ensureFlagImage(data.countryCode, (imgId) => {
          if (mySeq !== boundaryRequestSeq) return;
          map.setPaintProperty("region-fill", "fill-pattern", imgId || undefined);
        });
      } else {
        map.setPaintProperty("region-fill", "fill-pattern", undefined);
      }

      if (scene.warmorph && animRing) {
        animateWarmorph(animRing, scene.warmorph, "#f2b544", 1600);
      } else {
        clearWarmorph();
      }

      if (!AUTO_FRAME_CAMS.has(scene.cam)) return;
      const bounds = boundsFromGeojson(data.geojson, scene.mainlandOnly);
      if (!bounds) return;
      const cam = map.cameraForBounds(bounds, { padding: 60 });
      // จุดเดียวที่ขยับกล้องให้ฉากไฮไลต์แบบ auto-frame — กัน moveCamera() ชนกันกลางอากาศ (สาเหตุอนิเมชันกระตุก)
      if (cam) {
        map.easeTo({ center: cam.center, zoom: cam.zoom, bearing: scene.bearing || 0, pitch: scene.tilt || 0, duration: 1100 });
      }
    })
    .catch((e) => console.warn(e));
}

// วาดลูกศรเดินทัพหลายเส้นพร้อมกัน (แผนที่สนามรบ) แล้วคืนกรอบกล้องที่ครอบทุกจุดพอดี
function renderBattleArrows(scene) {
  const features = scene.arrows.map((a) => ({
    type: "Feature",
    properties: { color: a.color },
    geometry: { type: "LineString", coordinates: [a.from, a.to] },
  }));
  const src = map.getSource("battle-arrows");
  if (src) src.setData({ type: "FeatureCollection", features });

  scene.arrows.forEach((a, i) => {
    const arrowMarker = getBattleArrowMarker(i);
    const bearing = compassBearing(a.from, a.to);
    const el2 = arrowMarker.getElement().querySelector(".battle-arrow-head");
    el2.style.color = a.color;
    arrowMarker.setRotation(bearing - 90).setLngLat(a.to).addTo(map);

    const labelMarker = getBattleLabelMarker(i);
    const labelEl = labelMarker.getElement();
    labelEl.innerHTML = `<span style="background:${a.color}">${escapeHtml(a.label)}</span>`;
    labelMarker.setLngLat(a.from).addTo(map);
  });
  clearBattleMarkers(scene.arrows.length);

  const points = scene.arrows.flatMap((a) => [a.from, a.to]);
  points.push([scene.lng, scene.lat]);
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  points.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  const bounds = new maplibregl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
  const cam = map.cameraForBounds(bounds, { padding: 70 });
  return cam ? { center: cam.center, zoom: cam.zoom } : null;
}

function clearBattleArrows() {
  const src = map.getSource("battle-arrows");
  if (src) src.setData(emptyFC());
  clearBattleMarkers(0);
}

function makeMarkerEl(className, innerHTML) {
  const div = document.createElement("div");
  div.className = className;
  div.innerHTML = innerHTML;
  return div;
}

const pinToEl = makeMarkerEl(
  "map-pin-content",
  `<span class="pin-dot"><i class="pin-icon"></i><i class="pin-ring"></i></span><em class="pin-label"></em>`
);
const pinFromEl = makeMarkerEl("map-pin-content is-from", `<span class="pin-dot"></span>`);
// หมายเหตุ: element ที่ส่งให้ maplibregl.Marker ถูกคุม transform โดย maplibre เอง (ตำแหน่ง/หมุน)
// ห้ามใส่ CSS animation หรือ style.transform เพิ่มบน element นี้ตรงๆ — ให้ครอบ span ชั้นในแทน
const arrowWrapEl = makeMarkerEl("arrow-marker-wrap", `<span class="arrow-marker">➤</span>`);
const effectWrapEl = makeMarkerEl("effect-marker-wrap", "");
const geoPhotoWrapEl = makeMarkerEl("geo-photo-wrap", `<span class="geo-photo-card"></span>`);
const badgeWrapEl = makeMarkerEl("badge-wrap", `<span class="badge-circle"></span><span class="badge-pill"></span>`);
const calloutRingWrapEl = makeMarkerEl("callout-ring-wrap", `<span class="callout-ring"></span>`);

const markerTo = new maplibregl.Marker({ element: pinToEl, anchor: "center" });
const markerFrom = new maplibregl.Marker({ element: pinFromEl, anchor: "center" });
const markerArrow = new maplibregl.Marker({ element: arrowWrapEl, anchor: "center", rotationAlignment: "map" });
const markerEffect = new maplibregl.Marker({ element: effectWrapEl, anchor: "bottom" });
const markerGeoPhoto = new maplibregl.Marker({ element: geoPhotoWrapEl, anchor: "bottom" });
const markerBadge = new maplibregl.Marker({ element: badgeWrapEl, anchor: "bottom" });
const markerCallout = new maplibregl.Marker({ element: calloutRingWrapEl, anchor: "center" });

// pool ลูกศรหัวธง + ป้ายชื่อฝ่ายต้นทาง สำหรับแผนที่สนามรบ (จำนวนไม่แน่นอนต่อฉาก จึงสร้าง/รียูสตามจำนวนจริง)
let battleArrowMarkers = [];
let battleLabelMarkers = [];

function getBattleArrowMarker(i) {
  if (!battleArrowMarkers[i]) {
    const wrap = makeMarkerEl("arrow-marker-wrap", `<span class="arrow-marker battle-arrow-head">➤</span>`);
    battleArrowMarkers[i] = new maplibregl.Marker({ element: wrap, anchor: "center", rotationAlignment: "map" });
  }
  return battleArrowMarkers[i];
}
function getBattleLabelMarker(i) {
  if (!battleLabelMarkers[i]) {
    const wrap = makeMarkerEl("battle-label", "");
    battleLabelMarkers[i] = new maplibregl.Marker({ element: wrap, anchor: "bottom" });
  }
  return battleLabelMarkers[i];
}
function clearBattleMarkers(fromIndex) {
  for (let i = fromIndex; i < battleArrowMarkers.length; i++) {
    if (battleArrowMarkers[i]) battleArrowMarkers[i].remove();
    if (battleLabelMarkers[i]) battleLabelMarkers[i].remove();
  }
}

let orbitRAF = null;
function stopOrbit() {
  if (orbitRAF) cancelAnimationFrame(orbitRAF);
  orbitRAF = null;
}
function startOrbit(durationSec, startBearing = map.getBearing()) {
  stopOrbit();
  const start = performance.now();
  const totalMs = Math.max(durationSec, 1) * 1000;
  function step(now) {
    const t = Math.min(1, (now - start) / totalMs);
    map.setBearing(startBearing + t * 90);
    if (t < 1) orbitRAF = requestAnimationFrame(step);
  }
  orbitRAF = requestAnimationFrame(step);
}

function compassBearing(a, b) {
  // ประมาณแบบเรขาคณิตระนาบ (มุมเข็มทิศ 0=เหนือ, 90=ตะวันออก) พอสำหรับระยะทางในภูมิภาคเดียว
  const dLng = b[0] - a[0];
  const dLat = b[1] - a[1];
  return ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
}

function curvedLine(a, b) {
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const bow = [mid[0] - dy * 0.18, mid[1] + dx * 0.18];
  return [a, bow, b];
}

// ---------- ไอคอนพาหนะวิ่งไปตามเส้นทาง (route + moving icon) ----------

const transportWrapEl = makeMarkerEl("transport-marker-wrap", `<span class="transport-icon"></span>`);
const markerTransport = new maplibregl.Marker({ element: transportWrapEl, anchor: "center" });
let pathIconRAF = null;

function quadBezierPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  ];
}

function startPathIcon(coords, durationMs, glyph) {
  stopPathIcon();
  transportWrapEl.querySelector(".transport-icon").textContent = glyph;
  markerTransport.setLngLat(coords[0]).addTo(map);
  const start = performance.now();
  function step(now) {
    const raw = Math.min(1, (now - start) / durationMs);
    const t = easeInOutCubic(raw);
    markerTransport.setLngLat(quadBezierPoint(coords[0], coords[1], coords[2], t));
    if (raw < 1) pathIconRAF = requestAnimationFrame(step);
    else markerTransport.remove();
  }
  pathIconRAF = requestAnimationFrame(step);
}

function stopPathIcon() {
  if (pathIconRAF) cancelAnimationFrame(pathIconRAF);
  pathIconRAF = null;
  markerTransport.remove();
}

// ---------- shade / spotlight: มืดรอบข้าง เหลือจุดสนใจสว่าง ----------

let shadeActive = false;
let shadeScene = null;

function updateShade() {
  if (!shadeActive || !shadeScene) return;
  const p = map.project([shadeScene.lng, shadeScene.lat]);
  el.shadeOverlay.style.setProperty("--shade-x", `${p.x}px`);
  el.shadeOverlay.style.setProperty("--shade-y", `${p.y}px`);
}
map.on("render", updateShade);

function setShade(scene) {
  if (scene.shade > 0) {
    shadeActive = true;
    shadeScene = scene;
    el.shadeOverlay.style.setProperty("--shade-r", `${scene.shade}px`);
    el.shadeOverlay.classList.add("is-visible");
    updateShade();
  } else {
    shadeActive = false;
    el.shadeOverlay.classList.remove("is-visible");
  }
}

// caption= — ข้อความลอยกลางจอ ไม่ผูกกับหมุด (เทียบเท่า "Add Text" ของ AnimateMyMap)
function setCaption(scene) {
  el.captionOverlay.classList.remove("pos-top", "pos-center", "pos-bottom");
  if (scene.caption) {
    el.captionOverlay.textContent = scene.caption;
    el.captionOverlay.classList.add(`pos-${scene.captionPos}`);
    el.captionOverlay.classList.add("is-visible");
  } else {
    el.captionOverlay.classList.remove("is-visible");
  }
}

// geophoto=url:lat,lng — รูปจริงปักหมุดตามพิกัด (เทียบเท่า "Add Image" ของ AnimateMyMap)
function setGeoPhoto(scene) {
  if (scene.geophoto) {
    geoPhotoWrapEl.querySelector(".geo-photo-card").style.backgroundImage = `url("${scene.geophoto.url}")`;
    markerGeoPhoto.setLngLat([scene.geophoto.lng, scene.geophoto.lat]).addTo(map);
  } else {
    markerGeoPhoto.remove();
  }
}

// badge=flag:xx:lat,lng:ป้าย หรือ badge=icon:🏛️:lat,lng:ป้าย — ไอคอนวงกลม+ป้ายชื่อปักตามพิกัด (สไตล์ Whyhistory)
function setBadge(scene) {
  if (scene.badge) {
    const circle = badgeWrapEl.querySelector(".badge-circle");
    if (scene.badge.type === "flag") {
      circle.style.backgroundImage = `url("/api/flag?code=${encodeURIComponent(scene.badge.value)}")`;
      circle.textContent = "";
    } else {
      circle.style.backgroundImage = "";
      circle.textContent = scene.badge.value;
    }
    badgeWrapEl.querySelector(".badge-pill").textContent = scene.badge.label;
    markerBadge.setLngLat([scene.badge.lng, scene.badge.lat]).addTo(map);
  } else {
    markerBadge.remove();
  }
}

// callout=url:lat,lng:ป้าย — วงแหวนชี้จุด + เส้นโยงไปกล่องรูป/วิดีโอแทรก (สไตล์ Whyhistory)
let calloutScene = null;
function updateCalloutLine() {
  if (!calloutScene) return;
  const p = map.project([calloutScene.lng, calloutScene.lat]);
  const boxRect = el.calloutBox.getBoundingClientRect();
  const stageRect = el.mapStage.getBoundingClientRect();
  const boxX = boxRect.left - stageRect.left;
  const boxY = boxRect.top - stageRect.top + boxRect.height / 2;
  el.calloutLineEl.setAttribute("x1", p.x);
  el.calloutLineEl.setAttribute("y1", p.y);
  el.calloutLineEl.setAttribute("x2", boxX);
  el.calloutLineEl.setAttribute("y2", boxY);
}
map.on("render", updateCalloutLine);

function setCallout(scene) {
  if (scene.callout) {
    calloutScene = scene.callout;
    el.calloutImg.src = scene.callout.url;
    el.calloutLabel.textContent = scene.callout.label;
    el.calloutBox.classList.add("is-visible");
    el.calloutLine.classList.add("is-visible");
    markerCallout.setLngLat([scene.callout.lng, scene.callout.lat]).addTo(map);
    updateCalloutLine();
  } else {
    calloutScene = null;
    el.calloutBox.classList.remove("is-visible");
    el.calloutLine.classList.remove("is-visible");
    markerCallout.remove();
  }
}

// draw= — เส้นวาดอิสระตามพิกัดที่พิมพ์เอง (เทียบเท่า "Pen" ของ AnimateMyMap แบบพิมพ์พิกัดแทนลากเมาส์)
function setFreeformDraw(scene) {
  const src = map.getSource("freeform-draw");
  if (!src) return;
  if (scene.draw && scene.draw.length >= 2) {
    src.setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: scene.draw },
      properties: { color: scene.drawColor },
    });
    map.setPaintProperty("freeform-draw-layer", "line-opacity", 0.85);
  } else {
    map.setPaintProperty("freeform-draw-layer", "line-opacity", 0);
  }
}

function moveCamera(scene, durationSecOverride, frameOverride) {
  const center = frameOverride ? frameOverride.center : [scene.lng, scene.lat];
  const durationSec = durationSecOverride || scene.duration;
  const pitch = scene.tilt || 0; // tilt=องศา ในสคริปต์ (0-60) ให้มุมกล้อง 3D
  const bearing = scene.bearing || 0; // bearing=องศา ในสคริปต์ ตั้งทิศเริ่มต้นของช็อต (ไม่หมุนต่อเนื่อง ยกเว้น orbit)

  if (scene.cam === "cut-to-insert" || scene.cam === "insert-overlay") {
    stopOrbit();
    map.easeTo({ center, duration: 600, bearing: map.getBearing() });
    return;
  }
  if (scene.cam === "orbit") {
    map.easeTo({ center, zoom: 8, duration: 800, pitch: pitch || 45, bearing });
    setTimeout(() => startOrbit(durationSec, bearing), 800);
    return;
  }
  stopOrbit();
  // ถ้าฉากนี้ไฮไลต์เขตแดนแบบ auto-frame ให้ showBoundary() เป็นเจ้าของการขยับกล้องเพียงจุดเดียว
  // (กันสองอนิเมชันชนกันกลางอากาศตอนขอบเขตโหลดมาช้ากว่ากล้อง ทำให้ดูกระตุก)
  if (scene.highlight !== "none" && AUTO_FRAME_CAMS.has(scene.cam)) return;
  if (scene.cam === "battle-map") {
    // มุมมองแบบเกม RTS: เอียงเล็กน้อยพอเห็นมิติ ไม่หมุน (เว้นแต่ผู้ใช้ตั้ง bearing เอง)
    const zoom = frameOverride ? frameOverride.zoom : 6;
    map.easeTo({ center, zoom, duration: 1000, bearing, pitch: pitch || 35 });
  } else if (scene.cam === "fly-to") {
    const zoom = frameOverride ? frameOverride.zoom : 6.2;
    map.flyTo({ center, zoom, duration: durationSec * 1000, curve: 1.4, bearing, pitch });
  } else if (scene.cam === "push-in") {
    map.easeTo({ center, zoom: 10, duration: 1200, bearing, pitch });
  } else if (scene.cam === "zoom-out") {
    map.easeTo({ center, zoom: 4.2, duration: 1200, bearing, pitch });
  } else {
    map.easeTo({ center, zoom: 4.3, duration: 1200, bearing, pitch });
  }
}

// ---------- แปลงข้อมูลดิบ → ฉาก ----------

// รับ raw fields (จาก tag-mode หรือ column-mode ก็ได้) มาตรวจ/เติมค่า default ให้เป็นฉากที่ใช้งานได้จริง
// arrows=ไทย:ff4d4d:14.0,102.0:13.5,103.0;กัมพูชา:ffd23f:12.5,104.5:13.5,103.0
// แต่ละลูกศรคั่นด้วย ; ภายในลูกศรคั่นด้วย : เป็น label:สีฮ็กซ์:lat,lng ต้นทาง:lat,lng ปลายทาง
function parseArrows(str) {
  if (!str) return [];
  return str
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(":").map((p) => p.trim());
      if (parts.length !== 4) return null;
      const [label, colorRaw, fromRaw, toRaw] = parts;
      const color = /^[0-9a-fA-F]{6}$/.test(colorRaw) ? `#${colorRaw}` : "#f2b544";
      const from = fromRaw.split(",").map((n) => Number(n.trim()));
      const to = toRaw.split(",").map((n) => Number(n.trim()));
      if (from.length !== 2 || to.length !== 2 || from.some(Number.isNaN) || to.some(Number.isNaN)) return null;
      return { label, color, from: [from[1], from[0]], to: [to[1], to[0]] }; // เก็บเป็น [lng,lat] ให้ตรงกับ MapLibre
    })
    .filter(Boolean);
}

// warmorph=RRGGBB:lat1,lng1:lat2,lng2 — สีฝ่ายชนะ + เส้นตัดแบ่งเขตยึดครอง (ยืนที่จุดที่1 หันไปจุดที่2 พื้นที่ด้านขวามือคือส่วนที่ถูกยึด)
function parseWarmorph(str) {
  if (!str) return null;
  const parts = str.split(":").map((s) => s.trim());
  if (parts.length !== 3) return null;
  const [colorRaw, p1raw, p2raw] = parts;
  if (!/^[0-9a-fA-F]{6}$/.test(colorRaw)) return null;
  const p1 = p1raw.split(",").map(Number);
  const p2 = p2raw.split(",").map(Number);
  if (p1.length !== 2 || p2.length !== 2 || p1.some(Number.isNaN) || p2.some(Number.isNaN)) return null;
  return { color: `#${colorRaw}`, p1: [p1[1], p1[0]], p2: [p2[1], p2[0]] };
}

// geophoto=url:lat,lng — ปักรูปจริงตามพิกัด
function parseGeophoto(str) {
  if (!str) return null;
  const idx = str.lastIndexOf(":");
  if (idx < 0) return null;
  const url = str.slice(0, idx).trim();
  const latlng = str.slice(idx + 1).split(",").map((n) => Number(n.trim()));
  if (!url || latlng.length !== 2 || latlng.some(Number.isNaN)) return null;
  return { url, lat: latlng[0], lng: latlng[1] };
}

// draw=lat,lng;lat,lng;... — เส้นวาดอิสระตามพิกัดที่พิมพ์เอง (ตรง/โค้ง/วงกลม แล้วแต่จำนวนจุด)
function parseDraw(str) {
  if (!str) return [];
  return str
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(",").map((n) => Number(n.trim())))
    .filter((pair) => pair.length === 2 && !pair.some(Number.isNaN))
    .map(([lat, lng]) => [lng, lat]);
}

// badge=flag:us:lat,lng:ป้ายชื่อ  หรือ  badge=icon:🏛️:lat,lng:ป้ายชื่อ — ไอคอนวงกลม+ป้ายชื่อปักตามพิกัด (สไตล์ Whyhistory)
function parseBadge(str) {
  if (!str) return null;
  const parts = str.split(":").map((s) => s.trim());
  if (parts.length !== 4) return null;
  const [type, value, latlngRaw, label] = parts;
  if (type !== "flag" && type !== "icon") return null;
  const latlng = latlngRaw.split(",").map((n) => Number(n.trim()));
  if (latlng.length !== 2 || latlng.some(Number.isNaN)) return null;
  return { type, value, lat: latlng[0], lng: latlng[1], label };
}

// callout=url:lat,lng:ป้ายชื่อ — วงกลมชี้จุดพร้อมเส้นโยงไปกล่องรูป/วิดีโอแทรก (สไตล์ Whyhistory)
// แยกจากท้ายเข้าหาหัว (label ท้ายสุด, lat,lng ก่อนหน้า, ที่เหลือคือ url) กัน url ที่มี ":" ปนเอง (เช่น http:// หรือ data:) แตกผิดจุด
function parseCallout(str) {
  if (!str) return null;
  const parts = str.split(":");
  if (parts.length < 3) return null;
  const label = parts[parts.length - 1].trim();
  const latlngRaw = parts[parts.length - 2].trim();
  const url = parts.slice(0, parts.length - 2).join(":").trim();
  const latlng = latlngRaw.split(",").map((n) => Number(n.trim()));
  if (!url || latlng.length !== 2 || latlng.some(Number.isNaN)) return null;
  return { url, lat: latlng[0], lng: latlng[1], label };
}

function finalizeScene(raw) {
  const {
    place, latlng, cam, script, dur, icon: iconRaw, effect: effectRaw, insert,
    tilt, bearing, highlight, arrows, transport: transportRaw, shade, hide, landfill,
    reveal, trace, warmorph, mainland,
    labelfont, labelsize, labelweight,
    caption, captionpos, geophoto, draw, drawcolor, persist,
    focus, highlightcolor, badge, callout,
  } = raw;
  if (!place || !cam || !script) return null;
  const camKey = CAM_LABELS[cam] ? cam : "establishing";
  const icon = ICON_GLYPHS[iconRaw] ? iconRaw : "default";
  const effect = EFFECT_GLYPHS[effectRaw] ? effectRaw : "none";
  const highlightKey = ["country", "province", "place"].includes(highlight) ? highlight : "none";
  // ไม่ดีฟอลต์เป็น plane เพราะฉากประวัติศาสตร์ก่อนยุคเครื่องบินจะโชว์ไอคอนผิดยุค — ไม่ระบุ = ไม่มีไอคอนวิ่ง
  const transport = TRANSPORT_GLYPHS[transportRaw] ? transportRaw : "none";
  const revealKey = ["fade", "wipe", "split", "circular", "iris", "diamond"].includes(reveal) ? (reveal === "iris" ? "circular" : reveal) : "fade";
  const traceKey = ["one", "two", "tworeverse", "four"].includes(trace) ? trace : "one";
  const captionPosKey = ["top", "center", "bottom"].includes(captionpos) ? captionpos : "top";
  const drawColorKey = /^[0-9a-fA-F]{6}$/.test(drawcolor || "") ? `#${drawcolor}` : "#f2b544";

  let lat, lng;
  if (latlng && latlng.includes(",")) {
    const [la, ln] = latlng.split(",").map((n) => Number(n.trim()));
    if (!Number.isNaN(la) && !Number.isNaN(ln)) { lat = la; lng = ln; }
  }
  if (lat === undefined) { lat = FALLBACK_COORD.lat; lng = FALLBACK_COORD.lng; }

  return {
    place,
    cam: camKey,
    script,
    duration: Number(dur) > 0 ? Number(dur) : DEFAULT_DURATION,
    icon,
    effect,
    insert: (insert || "").trim(),
    lat,
    lng,
    tilt: Number(tilt) >= 0 && Number(tilt) <= 60 ? Number(tilt) : 0,
    bearing: Number.isFinite(Number(bearing)) ? ((Number(bearing) % 360) + 360) % 360 : 0,
    highlight: highlightKey,
    arrows: parseArrows(arrows),
    transport,
    shade: shade === "on" || (Number(shade) > 0 ? Number(shade) : 0) ? (Number(shade) > 0 ? Number(shade) : 200) : 0,
    hide: (hide || "").split(",").map((s) => s.trim()).filter(Boolean),
    landfill: landfill === "flag" ? "flag" : "color",
    reveal: revealKey,
    trace: traceKey,
    warmorph: parseWarmorph(warmorph),
    mainlandOnly: mainland === "on" || mainland === "true",
    labelFont: (labelfont || "").trim(),
    labelSize: Number(labelsize) > 0 ? Number(labelsize) : 0,
    labelWeight: (labelweight || "").trim(),
    caption: (caption || "").trim(),
    captionPos: captionPosKey,
    geophoto: parseGeophoto(geophoto),
    draw: parseDraw(draw),
    drawColor: drawColorKey,
    persist: Number(persist) > 0 ? Math.floor(Number(persist)) : 0,
    focus: focus === "on" || focus === "true",
    highlightColor: /^[0-9a-fA-F]{6}$/.test(highlightcolor || "") ? `#${highlightcolor}` : "",
    badge: parseBadge(badge),
    callout: parseCallout(callout),
  };
}

const TAG_KEY_ALIASES = {
  place: "place", loc: "place", ที่: "place",
  latlng: "latlng", lat: "latlng", พิกัด: "latlng",
  cam: "cam", camera: "cam", กล้อง: "cam",
  script: "script", text: "script", สคริปต์: "script",
  sec: "dur", duration: "dur", วินาที: "dur",
  icon: "icon", ไอคอน: "icon",
  effect: "effect", fx: "effect", เอฟเฟกต์: "effect",
  insert: "insert",
  tilt: "tilt", pitch: "tilt", เอียง: "tilt",
  bearing: "bearing", หมุน: "bearing",
  highlight: "highlight", ไฮไลต์: "highlight",
  arrows: "arrows", ลูกศรทัพ: "arrows",
  transport: "transport", vehicle: "transport", พาหนะ: "transport",
  shade: "shade", spotlight: "shade",
  hide: "hide", ซ่อน: "hide",
  landfill: "landfill", fill: "landfill",
  reveal: "reveal", ลูกเล่นเติม: "reveal",
  trace: "trace", ลากเส้น: "trace",
  warmorph: "warmorph", ยึดครอง: "warmorph",
  mainland: "mainland", แผ่นดินใหญ่: "mainland",
  labelfont: "labelfont", labelsize: "labelsize", labelweight: "labelweight",
  caption: "caption", ข้อความ: "caption", captionpos: "captionpos",
  geophoto: "geophoto", รูปพิกัด: "geophoto",
  draw: "draw", วาด: "draw", drawcolor: "drawcolor",
  persist: "persist", คงอยู่: "persist",
  focus: "focus", ขาวดำ: "focus",
  highlightcolor: "highlightcolor", สีไฮไลต์: "highlightcolor",
  badge: "badge", ป้ายกลม: "badge",
  callout: "callout", กล่องแทรก: "callout",
};

// โหมด tag: "place=... | cam=fly-to | sec=6 | tilt=45" — พิมพ์ลำดับไหนก็ได้ ไม่ใส่คีย์ไหนก็ default ให้
function parseTagRow(line) {
  const segments = line.split("|").map((s) => s.trim()).filter(Boolean);
  const raw = {};
  let matched = 0;
  for (const seg of segments) {
    const m = seg.match(/^([a-zA-Zก-๙]+)\s*=\s*([\s\S]*)$/);
    if (!m) continue;
    const key = TAG_KEY_ALIASES[m[1].toLowerCase()] || TAG_KEY_ALIASES[m[1]];
    if (!key) continue;
    raw[key] = m[2].trim();
    matched++;
  }
  if (matched === 0) return null; // ไม่ใช่ tag-mode ปล่อยให้ column-mode ลองต่อ
  return finalizeScene(raw);
}

// โหมด column เดิม: "สถานที่ | lat,lng | แผนกล้อง | สคริปต์ | วินาที | ไอคอน | เอฟเฟกต์ | insert"
function parseColumnRow(parts) {
  const [place, latlng, cam, script, dur, icon, effect, insert] = parts;
  return finalizeScene({ place, latlng, cam, script, dur, icon, effect, insert });
}

function parseRow(line) {
  const tagged = parseTagRow(line);
  if (tagged) return tagged;
  const parts = line.includes("|") ? line.split("|") : line.split("\t");
  return parseColumnRow(parts.map((p) => (p || "").trim()));
}

function isImageUrl(str) {
  return /^https?:\/\//.test(str) || /\.(png|jpe?g|gif|webp|svg)$/i.test(str);
}

function renderInsertContent(container, text) {
  if (!text) { container.innerHTML = ""; return; }
  if (isImageUrl(text)) {
    container.innerHTML = `<img src="${escapeHtml(text)}" alt="" />`;
  } else {
    container.innerHTML = `<span>${escapeHtml(text)}</span>`;
  }
}

function parseImportText() {
  const raw = el.importText.value.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed = raw.map(parseRow).filter(Boolean);
  if (!parsed.length) return;
  scenes = parsed;
  renderTimeline();
  renderPreview();
  goToScene(0);
  try { localStorage.setItem(AUTOSAVE_KEY, el.importText.value); } catch (e) { /* ไม่มี localStorage ก็ข้ามไป */ }
}

function renderPreview() {
  el.importPreview.innerHTML = scenes
    .map(
      (s, i) => `
      <div class="preview-row" style="border-left-color:${CAM_DOT_VAR[s.cam]}">
        <div class="pr-place">${i + 1}. ${escapeHtml(s.place)}</div>
        <div class="pr-script">${escapeHtml(s.script)}</div>
        <div class="pr-meta">${CAM_LABELS[s.cam]} · ${s.duration}s · ${s.lat.toFixed(3)},${s.lng.toFixed(3)}</div>
      </div>`
    )
    .join("");
}

function renderTimeline() {
  el.timelineTrack.innerHTML = scenes
    .map(
      (s, i) => `
      <button class="scene-chip" data-index="${i}" data-cam="${s.cam}">
        <span class="chip-place">${i + 1}. ${escapeHtml(s.place)}</span>
        <span class="chip-cam">${CAM_LABELS[s.cam]}</span>
      </button>`
    )
    .join("");
  el.timelineTrack.querySelectorAll(".scene-chip").forEach((btn) => {
    btn.addEventListener("click", () => goToSceneManual(Number(btn.dataset.index)));
  });
}

function splitSegments(script) {
  const parts = script.split(SEGMENT_DELIM).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [script.trim()];
}

function goToScene(index, durationOverride) {
  if (!scenes.length) return;
  activeIndex = Math.max(0, Math.min(scenes.length - 1, index));
  const scene = scenes[activeIndex];

  el.epTitle.textContent = scene.place;
  el.sceneCounter.textContent = `ฉาก ${activeIndex + 1}/${scenes.length}`;
  el.camLabel.textContent = CAM_LABELS[scene.cam];
  el.camBadge.querySelector(".cam-dot").style.background = CAM_DOT_VAR[scene.cam];
  el.subtitleText.textContent = splitSegments(scene.script).join(" ");

  el.mapStage.className = `map-stage ${CAM_STAGE_CLASS[scene.cam] || ""}`.trim();

  renderInsertContent(el.insertLayerContent, scene.insert);
  renderInsertContent(el.insertFloatContent, scene.insert);

  // หมุดปลายทาง
  pinToEl.querySelector(".pin-icon").setAttribute("data-glyph", ICON_GLYPHS[scene.icon]);
  const pinLabelEl = pinToEl.querySelector(".pin-label");
  pinLabelEl.textContent = scene.place;
  pinLabelEl.style.fontFamily = scene.labelFont ? `"${scene.labelFont}", var(--thai)` : "";
  pinLabelEl.style.fontSize = scene.labelSize ? `${scene.labelSize}px` : "";
  pinLabelEl.style.fontWeight = scene.labelWeight || "";
  markerTo.setLngLat([scene.lng, scene.lat]).addTo(map);

  // เอฟเฟกต์เหตุการณ์
  if (scene.effect !== "none") {
    effectWrapEl.innerHTML = `<span class="effect-marker">${EFFECT_GLYPHS[scene.effect]}</span>`;
    markerEffect.setLngLat([scene.lng, scene.lat]).addTo(map);
  } else {
    markerEffect.remove();
  }

  // ไฮไลต์เขตแดน (จังหวัด/ประเทศ) จากพิกัดจริง
  // persist=N — ให้เขตแดนที่ไฮไลต์ไว้ค้างข้ามฉากถัดไปอีก N ฉาก (เทียบเท่า "Keep visible" ของ AnimateMyMap)
  if (scene.highlight !== "none") {
    showBoundary(scene);
    highlightPersistLeft = scene.persist;
  } else if (highlightPersistLeft > 0) {
    highlightPersistLeft--;
  } else {
    clearBoundary();
  }

  setCaption(scene);
  setGeoPhoto(scene);
  setFreeformDraw(scene);
  setBadge(scene);
  setCallout(scene);

  // pulse ring ตอนหมุดมาถึง
  pinToEl.classList.remove("pin-arrived");
  void pinToEl.offsetWidth; // บังคับ reflow ให้ retrigger อนิเมชันได้ทุกครั้ง
  pinToEl.classList.add("pin-arrived");

  // หมุดต้นทาง + เส้นทางโค้ง + ลูกศร (ข้ามระบบนี้ถ้าเป็นแผนที่สนามรบ — ใช้ระบบลูกศรหลายเส้นแทน)
  const prevScene = scenes[activeIndex - 1];
  const lineSource = map.getSource("scene-line");
  let flyFrame = null; // fly-to: ซูมให้พอดีระยะทางจริงระหว่างจุดเดิม-จุดใหม่ (คำนวณด้านล่างถ้ามี prevScene)
  if (scene.cam === "battle-map") {
    markerFrom.remove();
    markerArrow.remove();
    if (lineSource) lineSource.setData(emptyFC());
  } else if (prevScene) {
    const a = [prevScene.lng, prevScene.lat];
    const b = [scene.lng, scene.lat];
    markerFrom.setLngLat(a).addTo(map);
    const coords = curvedLine(a, b);
    if (lineSource) lineSource.setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
    const bearing = compassBearing(coords[1], coords[2]);
    markerArrow.setRotation(bearing - 90).setLngLat(coords[1]).addTo(map);
    if (scene.cam === "fly-to" && scene.transport !== "none") {
      startPathIcon(coords, (durationOverride || scene.duration) * 1000, TRANSPORT_GLYPHS[scene.transport]);
    } else {
      stopPathIcon();
    }
    // fly-to ไม่มี highlight: ซูมให้พอดีระยะทางจริงระหว่าง 2 จุด ไม่ใช่ค่าคงที่ตายตัว
    // (เดิม zoom 6.2 เสมอ ทำให้จุดใกล้กันมากๆ กล้องยังถอยไกลเกินพื้นที่จริง)
    if (scene.cam === "fly-to" && scene.highlight === "none") {
      const routeBounds = new maplibregl.LngLatBounds(a, a).extend(b);
      const cam = map.cameraForBounds(routeBounds, { padding: 90 });
      if (cam) flyFrame = { center: cam.center, zoom: Math.min(Math.max(cam.zoom, 3), 10) };
    }
  } else {
    markerFrom.remove();
    markerArrow.remove();
    if (lineSource) lineSource.setData(emptyFC());
    stopPathIcon();
  }

  // แผนที่สนามรบ: ลูกศรเดินทัพหลายเส้นพร้อมกัน แยกสีตามฝ่าย
  let battleFrame = null;
  if (scene.cam === "battle-map" && scene.arrows.length) {
    battleFrame = renderBattleArrows(scene);
  } else {
    clearBattleArrows();
  }

  // shade/spotlight
  setShade(scene);

  // ซ่อนเลเยอร์เฉพาะฉาก (hide=pin,boundary,arrow,timeline,topbar,brand)
  const hideSet = new Set(scene.hide);
  if (hideSet.has("pin")) markerTo.remove();
  if (hideSet.has("boundary")) clearBoundary();
  if (hideSet.has("arrow")) { markerArrow.remove(); markerFrom.remove(); stopPathIcon(); if (lineSource) lineSource.setData(emptyFC()); }
  // topbar/timeline คุมปุ่มเล่น/เลื่อนฉากเพียงจุดเดียว — ซ่อนจริงเฉพาะตอนอัด/เรนเดอร์จริงเท่านั้น
  // ไม่งั้นตอนแก้ไข ถ้าฉากแรกตั้ง hide=topbar จะกดเล่นไม่ได้อีกเลยเพราะปุ่มหายไปหมด
  const isCapturing = isExporting || isRenderMode;
  el.topbar.classList.toggle("hs-hidden", isCapturing && hideSet.has("topbar"));
  el.timeline.classList.toggle("hs-hidden", isCapturing && hideSet.has("timeline"));
  el.brandChip.classList.toggle("hs-hidden", hideSet.has("brand"));

  moveCamera(scene, durationOverride, battleFrame || flyFrame);

  el.timelineTrack.querySelectorAll(".scene-chip").forEach((btn, i) => {
    btn.classList.toggle("is-active", i === activeIndex);
  });
  const activeChip = el.timelineTrack.children[activeIndex];
  if (activeChip) activeChip.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
}

function goToSceneManual(index) {
  setPlaying(false);
  goToScene(index);
}

function updateChipDuration(idx) {
  const chip = el.timelineTrack.children[idx];
  if (chip) chip.querySelector(".chip-cam").textContent = `${CAM_LABELS[scenes[idx].cam]} · ${scenes[idx].duration}s`;
}

// ---------- พากย์เสียงจริงด้วย edge-tts (ผ่าน server.py /api/tts) ----------

const ttsCache = new Map();

async function fetchTts(text) {
  const key = `${voiceSettings.voice}::${voiceSettings.rate}::${voiceSettings.pitch}::${text}`;
  if (ttsCache.has(key)) return ttsCache.get(key);
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: voiceSettings.voice, rate: voiceSettings.rate, pitch: voiceSettings.pitch }),
  });
  if (!res.ok) throw new Error(`TTS server error (${res.status}) — ต้องรัน server.py ไม่ใช่ http.server เฉยๆ`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const duration = await new Promise((resolve) => {
    const probe = new Audio(url);
    probe.addEventListener("loadedmetadata", () => resolve(probe.duration || DEFAULT_DURATION));
    probe.addEventListener("error", () => resolve(DEFAULT_DURATION));
  });
  const result = { url, duration };
  ttsCache.set(key, result);
  return result;
}

function playAudioClip(url, myToken) {
  return new Promise((resolve) => {
    const player = el.ttsPlayer;
    const cleanup = () => {
      player.removeEventListener("ended", onEnded);
      player.removeEventListener("error", onEnded);
    };
    const onEnded = () => { cleanup(); resolve(); };
    player.addEventListener("ended", onEnded);
    player.addEventListener("error", onEnded);
    player.src = url;
    player.play().catch(onEnded);
    const poll = setInterval(() => {
      if (myToken !== playToken) { clearInterval(poll); cleanup(); resolve(); }
    }, 200);
    player.addEventListener("ended", () => clearInterval(poll), { once: true });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// เตรียมเสียงพากย์ "ทั้งคลิป" ให้เสร็จก่อนเริ่มเล่น กันเสียงมาสะดุดกลางคันตอนเล่นจริง
// (คืน false ถ้าโดนยกเลิกระหว่างเตรียม เช่นกดหยุดหรือกดเล่นซ้ำ)
async function preloadNarration(myToken) {
  const startIdx = activeIndex === -1 ? 0 : activeIndex;
  for (let i = startIdx; i < scenes.length; i++) {
    if (myToken !== playToken) return false;
    const segments = splitSegments(scenes[i].script);
    for (const seg of segments) {
      if (myToken !== playToken) return false;
      el.subtitleText.textContent = `กำลังเตรียมเสียงพากย์ทั้งคลิป... (ฉาก ${i + 1}/${scenes.length})`;
      try { await fetchTts(seg); } catch (e) { console.warn(e); }
    }
  }
  return myToken === playToken;
}

async function narrationLoop() {
  const myToken = ++playToken;
  isPlaying = true;
  el.btnPlay.textContent = "⏸";
  if (activeIndex === -1) activeIndex = 0;

  while (isPlaying && myToken === playToken && activeIndex < scenes.length) {
    const idx = activeIndex;
    const scene = scenes[idx];
    const segments = splitSegments(scene.script);

    const clips = [];
    if (isRenderMode && renderDurations && renderDurations[idx]) {
      // โหมดเรนเดอร์: ใช้ความยาวที่ render.py วัดจากเสียงจริงมาแล้ว ไม่ต้องพากย์ซ้ำในเบราว์เซอร์
      segments.forEach((seg, i) => clips.push({ text: seg, url: null, duration: renderDurations[idx][i] || DEFAULT_DURATION }));
    } else {
      el.subtitleText.textContent = "กำลังสร้างเสียง…";
      for (const seg of segments) {
        if (myToken !== playToken) return;
        try {
          clips.push({ text: seg, ...(await fetchTts(seg)) });
        } catch (e) {
          console.warn(e);
          clips.push({ text: seg, url: null, duration: scene.duration / segments.length });
        }
      }
    }
    if (myToken !== playToken) return;

    const totalDuration = clips.reduce((a, c) => a + c.duration, 0);
    if (totalDuration > 0) {
      scene.duration = Math.round(totalDuration * 10) / 10;
      updateChipDuration(idx);
    }
    goToScene(idx, scene.duration);

    for (const clip of clips) {
      if (myToken !== playToken) return;
      el.subtitleText.textContent = clip.text;
      if (clip.url) await playAudioClip(clip.url, myToken);
      else await wait(clip.duration * 1000);
    }
    if (myToken !== playToken) return;

    if (idx < scenes.length - 1) {
      if (sceneGapSec > 0) await wait(sceneGapSec * 1000); // จังหวะฉาก — พักเงียบก่อนตัดไปฉากถัดไป
      if (myToken !== playToken) return;
      activeIndex = idx + 1;
    } else {
      setPlaying(false);
      if (isRenderMode) window.__renderComplete = true; // สัญญาณให้ render.py รู้ว่าอัดจบแล้ว
      return;
    }
  }
}

function startBgm() {
  if (!bgmUrl) return;
  if (el.bgmPlayer.src !== bgmUrl) el.bgmPlayer.src = bgmUrl;
  el.bgmPlayer.volume = bgmVolumeLevel;
  el.bgmPlayer.currentTime = 0;
  el.bgmPlayer.play().catch(() => {});
}

function setPlaying(next) {
  if (next) {
    if (isRenderMode) {
      // โหมดเรนเดอร์มีความยาวเสียงมาแล้วจาก render.py ไม่ต้องเตรียมเสียงเอง เล่นได้เลยทันที
      startBgm();
      narrationLoop();
      return;
    }
    // เตรียมเสียงพากย์ทั้งคลิปให้เสร็จก่อน แล้วค่อยเริ่มเล่น+เพลงพร้อมกันทีเดียว กันเสียงสะดุดกลางคัน
    const myToken = ++playToken;
    isPlaying = true;
    el.btnPlay.textContent = "⏸";
    preloadNarration(myToken).then((completed) => {
      if (!completed || myToken !== playToken) return;
      startBgm();
      narrationLoop();
    });
    return;
  }
  isPlaying = false;
  el.bgmPlayer.pause();
  playToken++; // ตัดลูปพากย์เสียงปัจจุบันทิ้ง
  el.ttsPlayer.pause();
  el.btnPlay.textContent = "▶";
  if (isExporting) stopExport();
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- นำเข้า/ส่งออก Excel (SheetJS) ----------

const XLSX_HEADERS = ["สถานที่", "lat,lng", "แผนกล้อง", "สคริปต์เสียง", "วินาที", "ไอคอน", "เอฟเฟกต์", "insert"];

function downloadTemplate() {
  const rows = [
    XLSX_HEADERS,
    ["สุโขทัย", "17.0175,99.7016", "establishing", "ในปี พ.ศ. 1800 อาณาจักรใหม่กำลังก่อร่างขึ้นกลางลุ่มน้ำยม", 5, "castle", "none", ""],
    ["สุโขทัย → ศรีสัชนาลัย", "17.4270,99.8210", "fly-to", "จากนั้นกองคาราวานเดินทางขึ้นเหนือสู่เมืองพันธมิตร", 6, "flag", "none", ""],
    ["ศรีสัชนาลัย", "17.4270,99.8210", "push-in", "ที่นี่คือจุดที่สงครามกำลังจะเริ่มต้น", 4, "battle", "storm", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "scenes");
  XLSX.writeFile(wb, "scene-script-template.xlsx");
}

function importXlsxFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const body = rows.slice(1); // ข้ามแถวหัวตาราง
    const parsed = body
      .map((row) => parseColumnRow(row.map((c) => (c === undefined || c === null ? "" : String(c).trim()))))
      .filter(Boolean);
    if (!parsed.length) return;
    scenes = parsed;
    renderTimeline();
    renderPreview();
    goToScene(0);
  };
  reader.readAsArrayBuffer(file);
}

el.btnPrev.addEventListener("click", () => goToSceneManual(activeIndex - 1));
el.btnNext.addEventListener("click", () => goToSceneManual(activeIndex + 1));
el.btnPlay.addEventListener("click", () => setPlaying(!isPlaying));

// ---------- บันทึกเป็นวิดีโอ (อัดหน้าจอผ่าน getDisplayMedia — ต้องเลือก "แท็บนี้" ตอนเบราว์เซอร์ถาม) ----------
// เลือกสัดส่วนตอนกดอัดเท่านั้น เอดิเตอร์เต็มจอปกติตลอดตอนแก้ไข

async function startExport(aspect) {
  if (!scenes.length) { alert("ยังไม่มีฉาก นำเข้าสคริปต์ก่อน"); return; }
  currentAspect = aspect;
  lastExportAspect = aspect;
  fitStage(); // ย่อเวทีเป็นสัดส่วนที่เลือกชั่วคราว เพื่อให้สิ่งที่อัดตรงตามฟอร์แมตปลายทาง
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser" },
      audio: true,
      preferCurrentTab: true,
    });
    recordedChunks = [];
    recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
    recorder.ondataavailable = (e) => { if (e.data.size) recordedChunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "history-map-export.webm";
      a.click();
      stream.getTracks().forEach((t) => t.stop());
    };
    isExporting = true;
    el.btnExport.textContent = "กำลังอัด… (หยุด)";
    recorder.start();
    goToSceneManual(0);
    setPlaying(true);
  } catch (e) {
    console.warn(e);
    alert("เปิดการอัดหน้าจอไม่สำเร็จ — ต้องอนุญาตแชร์แท็บนี้ตอนเบราว์เซอร์ถาม");
    currentAspect = "free";
    fitStage();
  }
}

function stopExport() {
  isExporting = false;
  el.btnExport.textContent = "บันทึกวิดีโอ";
  if (recorder && recorder.state !== "inactive") recorder.stop();
  currentAspect = "free";
  fitStage(); // คืนเป็นเต็มจอให้แก้ไขต่อ
}

el.btnExport.addEventListener("click", () => {
  if (isExporting) { setPlaying(false); return; }
  el.exportMenu.hidden = !el.exportMenu.hidden;
});
el.exportMenu.querySelectorAll(".export-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    el.exportMenu.hidden = true;
    startExport(btn.dataset.aspect);
  });
});
document.addEventListener("click", (e) => {
  if (!el.exportMenu.hidden && !e.target.closest(".export-wrap")) el.exportMenu.hidden = true;
});

// กดปุ่มเดิมซ้ำ = สลับปิด/เปิด (ไม่ใช่แค่เปิดอย่างเดียวเหมือนเดิม) — กดครั้งแรกยื่นเต็มจอ กดซ้ำหดกลับ
function setImportPanelOpen(open) {
  el.importPanel.classList.toggle("is-open", open);
  el.importPanel.setAttribute("aria-hidden", open ? "false" : "true");
}
el.btnImport.addEventListener("click", () => {
  setImportPanelOpen(!el.importPanel.classList.contains("is-open"));
});
el.btnCloseImport.addEventListener("click", () => setImportPanelOpen(false));
el.btnParse.addEventListener("click", parseImportText);
el.btnClear.addEventListener("click", () => {
  el.importText.value = "";
  el.importPreview.innerHTML = "";
});
el.btnDownloadTemplate.addEventListener("click", downloadTemplate);
el.fileImportXlsx.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importXlsxFile(file);
  e.target.value = "";
});

el.brandInput.addEventListener("input", () => {
  el.brandText.textContent = el.brandInput.value.trim().slice(0, 4) || "HS";
});
el.brandCorner.addEventListener("change", () => {
  el.brandChip.className = `brand-chip brand-${el.brandCorner.value}`;
});

// ---------- เสียงพากย์ / เพลงพื้นหลัง / จังหวะฉาก / สไตล์ซับไตเติล ----------

el.voiceSelect.addEventListener("change", () => { voiceSettings.voice = el.voiceSelect.value; });
el.voiceRate.addEventListener("input", () => {
  const n = Number(el.voiceRate.value);
  voiceSettings.rate = `${n >= 0 ? "+" : ""}${n}%`;
  el.voiceRateOut.textContent = voiceSettings.rate;
});
el.voicePitch.addEventListener("input", () => {
  const n = Number(el.voicePitch.value);
  voiceSettings.pitch = `${n >= 0 ? "+" : ""}${n}Hz`;
  el.voicePitchOut.textContent = voiceSettings.pitch;
});

el.fileUploadBgm.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const dataUrl = await fileToDataUrl(file);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, data: dataUrl }),
    });
    if (!res.ok) throw new Error(`อัพโหลดไม่สำเร็จ (${res.status})`);
    const { url } = await res.json();
    bgmUrl = url;
    el.bgmFileName.textContent = `เพลง: ${file.name}`;
  } catch (err) {
    alert(`อัพโหลดเพลงไม่สำเร็จ: ${err.message} — ต้องรัน server.py ไม่ใช่ http.server เฉยๆ`);
  }
});
el.btnClearBgm.addEventListener("click", () => {
  bgmUrl = "";
  el.bgmPlayer.pause();
  el.bgmPlayer.removeAttribute("src");
  el.bgmFileName.textContent = "ยังไม่ได้เลือกเพลง";
});
el.bgmVolume.addEventListener("input", () => {
  bgmVolumeLevel = Number(el.bgmVolume.value) / 100;
  el.bgmVolumeOut.textContent = `${el.bgmVolume.value}%`;
  el.bgmPlayer.volume = bgmVolumeLevel;
});

el.sceneGap.addEventListener("input", () => {
  sceneGapSec = Number(el.sceneGap.value) / 10;
  el.sceneGapOut.textContent = `${sceneGapSec.toFixed(1)} วิ`;
});

el.landClipToggle.addEventListener("change", () => {
  landClipEnabled = el.landClipToggle.checked;
  boundaryCache.clear(); // ขอบเขตที่แคชไว้เป็นของโหมดเดิม ต้องดึงใหม่ให้ตรงกับที่เลือก
  if (scenes.length) goToScene(activeIndex === -1 ? 0 : activeIndex);
});

el.subtitlePos.addEventListener("change", () => { subtitleStyle.pos = el.subtitlePos.value; applySubtitleStyle(); });
el.subtitleColor.addEventListener("input", () => { subtitleStyle.color = el.subtitleColor.value; applySubtitleStyle(); });
el.subtitleSize.addEventListener("input", () => { subtitleStyle.size = Number(el.subtitleSize.value) || 0; applySubtitleStyle(); });
el.subtitleWeight.addEventListener("change", () => { subtitleStyle.weight = el.subtitleWeight.value; applySubtitleStyle(); });

// ---------- บันทึก/โหลดโปรเจกต์เป็นไฟล์ .json ----------

function saveProject() {
  const data = {
    version: 1,
    script: el.importText.value,
    brand: { text: el.brandInput.value, corner: el.brandCorner.value },
    lastExportAspect,
    voice: voiceSettings,
    bgm: { url: bgmUrl, volume: bgmVolumeLevel },
    sceneGapSec,
    subtitleStyle,
    landClipEnabled,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "history-map-project.json";
  a.click();
  URL.revokeObjectURL(url);
}

function applyProjectData(data) {
  if (!data || typeof data.script !== "string") { alert("ไฟล์โปรเจกต์ไม่ถูกต้อง"); return; }
  el.importText.value = data.script;
  if (data.brand) {
    el.brandInput.value = data.brand.text || "HS";
    el.brandText.textContent = (data.brand.text || "HS").slice(0, 4);
    el.brandCorner.value = data.brand.corner || "tl";
    el.brandChip.className = `brand-chip brand-${el.brandCorner.value}`;
  }
  if (data.lastExportAspect === "169" || data.lastExportAspect === "916") {
    lastExportAspect = data.lastExportAspect; // แค่จำไว้เป็นค่าที่เคยเลือกส่งออกล่าสุด ไม่ยุ่งกับหน้าจอแก้ไข
  }
  if (data.voice) {
    voiceSettings = { voice: data.voice.voice || DEFAULT_VOICE, rate: data.voice.rate || "+0%", pitch: data.voice.pitch || "+0Hz" };
    el.voiceSelect.value = voiceSettings.voice;
    el.voiceRate.value = parseInt(voiceSettings.rate, 10) || 0;
    el.voiceRateOut.textContent = voiceSettings.rate;
    el.voicePitch.value = parseInt(voiceSettings.pitch, 10) || 0;
    el.voicePitchOut.textContent = voiceSettings.pitch;
  }
  if (data.bgm && data.bgm.url) {
    bgmUrl = data.bgm.url;
    bgmVolumeLevel = Number(data.bgm.volume) || 0.25;
    el.bgmFileName.textContent = "เพลง: (โหลดจากโปรเจกต์)";
    el.bgmVolume.value = Math.round(bgmVolumeLevel * 100);
    el.bgmVolumeOut.textContent = `${el.bgmVolume.value}%`;
  }
  if (Number(data.sceneGapSec) >= 0) {
    sceneGapSec = Number(data.sceneGapSec);
    el.sceneGap.value = Math.round(sceneGapSec * 10);
    el.sceneGapOut.textContent = `${sceneGapSec.toFixed(1)} วิ`;
  }
  if (typeof data.landClipEnabled === "boolean") {
    landClipEnabled = data.landClipEnabled;
    el.landClipToggle.checked = landClipEnabled;
    boundaryCache.clear();
  }
  if (data.subtitleStyle) {
    subtitleStyle = { pos: "bottom", color: "", size: 0, weight: "", ...data.subtitleStyle };
    el.subtitlePos.value = subtitleStyle.pos;
    el.subtitleColor.value = subtitleStyle.color || "#ffffff";
    el.subtitleSize.value = subtitleStyle.size || "";
    el.subtitleWeight.value = subtitleStyle.weight || "";
    applySubtitleStyle();
  }
  parseImportText();
}

function loadProjectFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try { applyProjectData(JSON.parse(e.target.result)); }
    catch (err) { alert("อ่านไฟล์โปรเจกต์ไม่สำเร็จ: " + err.message); }
  };
  reader.readAsText(file, "utf-8");
}

el.btnSaveProject.addEventListener("click", saveProject);
el.fileLoadProject.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) loadProjectFile(file);
  e.target.value = "";
});

// ---------- อัพโหลดภาพของตัวเองไว้ใช้ในคอลัมน์ insert ----------

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function addUploadListItem(url, previewSrc) {
  const item = document.createElement("div");
  item.className = "upload-item";
  item.innerHTML = `<img src="${previewSrc}" alt="" /><span class="up-path">${url}</span>`;
  item.addEventListener("click", () => {
    navigator.clipboard.writeText(url).catch(() => {});
    const old = item.innerHTML;
    item.innerHTML += `<span class="up-copied">คัดลอกแล้ว</span>`;
    setTimeout(() => { item.innerHTML = old; }, 1200);
  });
  el.uploadList.prepend(item);
}

el.fileUploadImage.addEventListener("change", async (e) => {
  const files = [...e.target.files];
  for (const file of files) {
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, data: dataUrl }),
      });
      if (!res.ok) throw new Error(`อัพโหลดไม่สำเร็จ (${res.status})`);
      const { url } = await res.json();
      addUploadListItem(url, dataUrl);
    } catch (err) {
      alert(`อัพโหลด ${file.name} ไม่สำเร็จ: ${err.message} — ต้องรัน server.py ไม่ใช่ http.server เฉยๆ`);
    }
  }
  e.target.value = "";
});

// ---------- ค้นหาสถานที่ (Nominatim forward geocode) แล้วแทรกแถวตัวอย่างลงสคริปต์ ----------

async function searchPlace() {
  const q = el.searchPlaceInput.value.trim();
  if (!q) return;
  el.searchResultList.innerHTML = `<div class="upload-item">กำลังค้นหา...</div>`;
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`ค้นหาไม่สำเร็จ (${res.status})`);
    const { results } = await res.json();
    if (!results.length) { el.searchResultList.innerHTML = `<div class="upload-item">ไม่พบสถานที่นี้</div>`; return; }
    el.searchResultList.innerHTML = "";
    results.forEach((r) => {
      const item = document.createElement("div");
      item.className = "upload-item";
      item.innerHTML = `<span class="up-path">${escapeHtml(r.name)} (${r.lat.toFixed(4)},${r.lng.toFixed(4)})</span>`;
      item.addEventListener("click", () => {
        const row = `place=${q} | latlng=${r.lat.toFixed(4)},${r.lng.toFixed(4)} | cam=establishing | script=... | sec=5`;
        el.importText.value = (el.importText.value ? el.importText.value.replace(/\n?$/, "\n") : "") + row + "\n";
        el.importText.scrollTop = el.importText.scrollHeight;
        el.searchResultList.innerHTML = "";
        el.searchPlaceInput.value = "";
      });
      el.searchResultList.appendChild(item);
    });
  } catch (err) {
    el.searchResultList.innerHTML = `<div class="upload-item">ผิดพลาด: ${escapeHtml(err.message)} — ต้องรัน server.py</div>`;
  }
}

el.btnSearchPlace.addEventListener("click", searchPlace);
el.searchPlaceInput.addEventListener("keydown", (e) => { if (e.key === "Enter") searchPlace(); });

// กู้สคริปต์ล่าสุดจาก localStorage อัตโนมัติ (ถ้ามีและยังไม่ได้มาจากโหมดเรนเดอร์)
try {
  const saved = localStorage.getItem(AUTOSAVE_KEY);
  if (saved && !new URLSearchParams(location.search).get("autoplay")) {
    el.importText.value = saved;
    el.autosaveHint.hidden = false;
  }
} catch (e) { /* ไม่มี localStorage ก็ข้ามไป */ }

// ---------- โหมดเรนเดอร์: รับสคริปต์+ความยาวเสียงจาก render.py ผ่าน URL แล้วเล่นอัตโนมัติ ----------

function b64UrlDecode(str) {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

(function initRenderMode() {
  const params = new URLSearchParams(location.search);
  if (!params.get("autoplay")) return;
  isRenderMode = true;
  document.body.classList.add("is-render-mode");

  const aspectParam = params.get("aspect");
  if (aspectParam === "169" || aspectParam === "916") {
    currentAspect = aspectParam;
    fitStage();
  }

  const scriptParam = params.get("script");
  if (scriptParam) el.importText.value = b64UrlDecode(scriptParam);

  const durationsParam = params.get("durations");
  if (durationsParam) {
    try { renderDurations = JSON.parse(b64UrlDecode(durationsParam)); } catch (e) { console.warn("อ่าน durations ไม่ได้", e); }
  }

  const gapParam = params.get("gap");
  if (gapParam) sceneGapSec = Number(gapParam) || 0;

  if (params.get("landclip") === "0") {
    landClipEnabled = false;
    el.landClipToggle.checked = false;
  }

  subtitleStyle = {
    pos: params.get("subpos") === "top" ? "top" : "bottom",
    color: params.get("subcolor") ? `#${params.get("subcolor")}` : "",
    size: Number(params.get("subsize")) || 0,
    weight: params.get("subweight") || "",
  };
  applySubtitleStyle();

  // ต้องรอ map style โหลดเสร็จจริงก่อนแปลง/เล่นสคริปต์ (parseImportText เรียก goToScene ทันที
  // ซึ่งอ่าน map.getPaintProperty) — ดีเลย์คงที่แบบเดิมพลาดได้เวลาโหลดช้ากว่าที่คาด ทำให้ map ยังไม่พร้อมแล้วพัง
  function startWhenMapReady() {
    parseImportText();
    setTimeout(() => setPlaying(true), 100);
  }
  if (map.loaded()) startWhenMapReady();
  else map.once("load", startWhenMapReady);
})();
