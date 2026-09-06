const CAM_LABELS = {
  "establishing": "ภาพเปิดกว้าง",
  "fly-to": "กล้องบินเดินทาง",
  "push-in": "ซูมเข้าถึงจุดหมาย",
  "zoom-out": "ซูมออกเผยภาพรวม",
  "orbit": "กล้องหมุนรอบจุดสนใจ",
  "cut-to-insert": "ตัดเข้าภาพเต็มจอ",
  "insert-overlay": "แทรกภาพลอย (PiP)",
};
const CAM_DOT_VAR = {
  "establishing": "var(--cam-establishing)",
  "fly-to": "var(--cam-flyto)",
  "push-in": "var(--cam-pushin)",
  "zoom-out": "var(--cam-zoomout)",
  "orbit": "var(--cam-orbit)",
  "cut-to-insert": "var(--cam-cutinsert)",
  "insert-overlay": "var(--cam-insertoverlay)",
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
  btnSaveProject: document.getElementById("btnSaveProject"),
  fileLoadProject: document.getElementById("fileLoadProject"),
  autosaveHint: document.getElementById("autosaveHint"),
  fileUploadImage: document.getElementById("fileUploadImage"),
  uploadList: document.getElementById("uploadList"),
};

let scenes = [];
let activeIndex = -1;
let isPlaying = false;
let playToken = 0;
let isExporting = false;
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
  map.addSource("region-boundary", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "region-fill",
    type: "fill",
    source: "region-boundary",
    paint: { "fill-color": "#f2b544", "fill-opacity": 0 },
  });
  map.addLayer({
    id: "region-line",
    type: "line",
    source: "region-boundary",
    paint: { "line-color": "#f2b544", "line-width": 2.5, "line-opacity": 0 },
  });
});

function emptyFC() {
  return { type: "FeatureCollection", features: [] };
}

// ---------- ไฮไลต์ขอบเขตพื้นที่ ----------

const boundaryCache = new Map();
let boundaryRAF = null;
let boundaryRequestSeq = 0;

async function fetchBoundary(lat, lng, level) {
  const key = `${level}:${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (boundaryCache.has(key)) return boundaryCache.get(key);
  const res = await fetch(`/api/boundary?lat=${lat}&lng=${lng}&level=${level}`);
  if (!res.ok) throw new Error(`โหลดขอบเขตพื้นที่ไม่สำเร็จ (${res.status})`);
  const data = await res.json();
  boundaryCache.set(key, data);
  return data;
}

function animateBoundaryOpacity(toFill, toLine) {
  if (boundaryRAF) cancelAnimationFrame(boundaryRAF);
  const fromFill = map.getPaintProperty("region-fill", "fill-opacity") || 0;
  const fromLine = map.getPaintProperty("region-line", "line-opacity") || 0;
  const start = performance.now();
  const dur = 700;
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    map.setPaintProperty("region-fill", "fill-opacity", fromFill + (toFill - fromFill) * t);
    map.setPaintProperty("region-line", "line-opacity", fromLine + (toLine - fromLine) * t);
    if (t < 1) boundaryRAF = requestAnimationFrame(step);
  }
  boundaryRAF = requestAnimationFrame(step);
}

function clearBoundary() {
  animateBoundaryOpacity(0, 0);
  el.regionLabel.classList.remove("is-visible");
}

function showBoundary(scene) {
  const mySeq = ++boundaryRequestSeq;
  el.regionLabel.classList.remove("is-visible");
  fetchBoundary(scene.lat, scene.lng, scene.highlight)
    .then((data) => {
      if (mySeq !== boundaryRequestSeq || !data.geojson) return; // กันฉากเปลี่ยนไปแล้วแต่ผลลัพธ์เก่ามาช้า
      map.getSource("region-boundary").setData({ type: "Feature", geometry: data.geojson, properties: {} });
      animateBoundaryOpacity(0.18, 0.85);
      el.regionLabel.textContent = data.name || scene.place;
      el.regionLabel.classList.add("is-visible");
    })
    .catch((e) => console.warn(e));
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

const markerTo = new maplibregl.Marker({ element: pinToEl, anchor: "center" });
const markerFrom = new maplibregl.Marker({ element: pinFromEl, anchor: "center" });
const markerArrow = new maplibregl.Marker({ element: arrowWrapEl, anchor: "center", rotationAlignment: "map" });
const markerEffect = new maplibregl.Marker({ element: effectWrapEl, anchor: "bottom" });

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

function moveCamera(scene, durationSecOverride) {
  const center = [scene.lng, scene.lat];
  const durationSec = durationSecOverride || scene.duration;
  const pitch = scene.tilt || 0; // tilt=องศา ในสคริปต์ (0-60) ให้มุมกล้อง 3D
  const bearing = scene.bearing || 0; // bearing=องศา ในสคริปต์ ตั้งทิศเริ่มต้นของช็อต

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
  if (scene.cam === "fly-to") {
    map.flyTo({ center, zoom: 6.2, duration: durationSec * 1000, curve: 1.4, bearing, pitch });
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
function finalizeScene(raw) {
  const { place, latlng, cam, script, dur, icon: iconRaw, effect: effectRaw, insert, tilt, bearing, highlight } = raw;
  if (!place || !cam || !script) return null;
  const camKey = CAM_LABELS[cam] ? cam : "establishing";
  const icon = ICON_GLYPHS[iconRaw] ? iconRaw : "default";
  const effect = EFFECT_GLYPHS[effectRaw] ? effectRaw : "none";
  const highlightKey = ["country", "province", "place"].includes(highlight) ? highlight : "none";

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
  pinToEl.querySelector(".pin-label").textContent = scene.place;
  markerTo.setLngLat([scene.lng, scene.lat]).addTo(map);

  // เอฟเฟกต์เหตุการณ์
  if (scene.effect !== "none") {
    effectWrapEl.innerHTML = `<span class="effect-marker">${EFFECT_GLYPHS[scene.effect]}</span>`;
    markerEffect.setLngLat([scene.lng, scene.lat]).addTo(map);
  } else {
    markerEffect.remove();
  }

  // ไฮไลต์เขตแดน (จังหวัด/ประเทศ) จากพิกัดจริง
  if (scene.highlight !== "none") showBoundary(scene);
  else clearBoundary();

  // pulse ring ตอนหมุดมาถึง
  pinToEl.classList.remove("pin-arrived");
  void pinToEl.offsetWidth; // บังคับ reflow ให้ retrigger อนิเมชันได้ทุกครั้ง
  pinToEl.classList.add("pin-arrived");

  // หมุดต้นทาง + เส้นทางโค้ง + ลูกศร
  const prevScene = scenes[activeIndex - 1];
  const lineSource = map.getSource("scene-line");
  if (prevScene) {
    const a = [prevScene.lng, prevScene.lat];
    const b = [scene.lng, scene.lat];
    markerFrom.setLngLat(a).addTo(map);
    const coords = curvedLine(a, b);
    if (lineSource) lineSource.setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
    const bearing = compassBearing(coords[1], coords[2]);
    markerArrow.setRotation(bearing - 90).setLngLat(coords[1]).addTo(map);
  } else {
    markerFrom.remove();
    markerArrow.remove();
    if (lineSource) lineSource.setData(emptyFC());
  }

  moveCamera(scene, durationOverride);

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
  const key = `${DEFAULT_VOICE}::${text}`;
  if (ttsCache.has(key)) return ttsCache.get(key);
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: DEFAULT_VOICE }),
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
      activeIndex = idx + 1;
    } else {
      setPlaying(false);
      if (isRenderMode) window.__renderComplete = true; // สัญญาณให้ render.py รู้ว่าอัดจบแล้ว
      return;
    }
  }
}

function setPlaying(next) {
  if (next) {
    narrationLoop();
    return;
  }
  isPlaying = false;
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

el.btnImport.addEventListener("click", () => {
  el.importPanel.classList.add("is-open");
  el.importPanel.setAttribute("aria-hidden", "false");
});
el.btnCloseImport.addEventListener("click", () => {
  el.importPanel.classList.remove("is-open");
  el.importPanel.setAttribute("aria-hidden", "true");
});
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

// ---------- บันทึก/โหลดโปรเจกต์เป็นไฟล์ .json ----------

function saveProject() {
  const data = {
    version: 1,
    script: el.importText.value,
    brand: { text: el.brandInput.value, corner: el.brandCorner.value },
    lastExportAspect,
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

  parseImportText();
  setTimeout(() => setPlaying(true), 300); // เผื่อแผนที่/ไทล์เริ่มโหลด
})();
