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
};

let scenes = [];
let activeIndex = -1;
let isPlaying = false;
let playToken = 0;
let isExporting = false;
let recorder = null;
let recordedChunks = [];

// ---------- แผนที่จริง (MapLibre GL + ภาพถ่ายดาวเทียม Esri) ----------

const map = new maplibregl.Map({
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
});

function emptyFC() {
  return { type: "FeatureCollection", features: [] };
}

function makeMarkerEl(className, innerHTML) {
  const div = document.createElement("div");
  div.className = className;
  div.innerHTML = innerHTML;
  return div;
}

const pinToEl = makeMarkerEl(
  "map-pin-content",
  `<span class="pin-dot"><i class="pin-icon"></i></span><em class="pin-label"></em>`
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
function startOrbit(durationSec) {
  stopOrbit();
  const startBearing = map.getBearing();
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
  if (scene.cam === "cut-to-insert" || scene.cam === "insert-overlay") {
    stopOrbit();
    map.easeTo({ center, duration: 600, bearing: map.getBearing() });
    return;
  }
  if (scene.cam === "orbit") {
    map.easeTo({ center, zoom: 8, duration: 800, pitch: 0 });
    startOrbit(durationSec);
    return;
  }
  stopOrbit();
  if (scene.cam === "fly-to") {
    map.flyTo({ center, zoom: 6.2, duration: durationSec * 1000, curve: 1.4, bearing: 0, pitch: 0 });
  } else if (scene.cam === "push-in") {
    map.easeTo({ center, zoom: 10, duration: 1200, bearing: 0, pitch: 0 });
  } else if (scene.cam === "zoom-out") {
    map.easeTo({ center, zoom: 4.2, duration: 1200, bearing: 0, pitch: 0 });
  } else {
    map.easeTo({ center, zoom: 4.3, duration: 1200, bearing: 0, pitch: 0 });
  }
}

// ---------- แปลงข้อมูลดิบ → ฉาก ----------

function parseFields(f, index) {
  const [place, latlngRaw, cam, script, dur, iconRaw, effectRaw, insertRaw] = f;
  if (!place || !cam || !script) return null;
  const camKey = CAM_LABELS[cam] ? cam : "establishing";
  const icon = ICON_GLYPHS[iconRaw] ? iconRaw : "default";
  const effect = EFFECT_GLYPHS[effectRaw] ? effectRaw : "none";

  let lat, lng;
  if (latlngRaw && latlngRaw.includes(",")) {
    const [la, ln] = latlngRaw.split(",").map((n) => Number(n.trim()));
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
    insert: (insertRaw || "").trim(),
    lat,
    lng,
  };
}

function parseRow(line, index) {
  const parts = line.includes("|") ? line.split("|") : line.split("\t");
  return parseFields(parts.map((p) => (p || "").trim()), index);
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

    el.subtitleText.textContent = "กำลังสร้างเสียง…";
    const clips = [];
    for (const seg of segments) {
      if (myToken !== playToken) return;
      try {
        clips.push({ text: seg, ...(await fetchTts(seg)) });
      } catch (e) {
        console.warn(e);
        clips.push({ text: seg, url: null, duration: scene.duration / segments.length });
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
      .map((row, i) => parseFields(row.map((c) => (c === undefined || c === null ? "" : String(c).trim())), i))
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

async function startExport() {
  if (!scenes.length) { alert("ยังไม่มีฉาก นำเข้าสคริปต์ก่อน"); return; }
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
  }
}

function stopExport() {
  isExporting = false;
  el.btnExport.textContent = "บันทึกวิดีโอ";
  if (recorder && recorder.state !== "inactive") recorder.stop();
}

el.btnExport.addEventListener("click", () => {
  if (isExporting) { setPlaying(false); } else { startExport(); }
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
