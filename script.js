const CAM_LABELS = {
  "establishing": "ภาพเปิดกว้าง",
  "fly-to": "กล้องบินเดินทาง",
  "push-in": "ซูมเข้าถึงจุดหมาย",
  "zoom-out": "ซูมออกเผยภาพรวม",
  "orbit": "กล้องหมุนรอบจุดสนใจ",
  "cut-to-insert": "ตัดเข้าภาพเต็มจอ",
  "insert-overlay": "แทรกภาพลอย (PiP)",
};
const CAM_CLASS = {
  "establishing": "cam-establishing",
  "fly-to": "cam-flyto",
  "push-in": "cam-pushin",
  "zoom-out": "cam-zoomout",
  "orbit": "cam-orbit",
  "cut-to-insert": "cam-cutinsert",
  "insert-overlay": "cam-insertoverlay",
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
const DEFAULT_DURATION = 5;

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

// จุดสำรองเมื่อไม่ระบุ x,y — กระจายจากซ้ายล่างไปขวาบนเป็นขั้นบันได
const FALLBACK_POINTS = [
  [18, 78], [38, 60], [58, 45], [78, 30], [30, 25], [65, 68], [50, 15],
];

const el = {
  mapStage: document.getElementById("mapStage"),
  pathLine: document.getElementById("pathLine"),
  pinFrom: document.getElementById("pinFrom"),
  pinTo: document.getElementById("pinTo"),
  pinIcon: document.getElementById("pinIcon"),
  pinLabel: document.getElementById("pinLabel"),
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
};

let scenes = [];
let activeIndex = -1;
let isPlaying = false;
let playTimer = null;

function parseRow(line, index) {
  const parts = line.includes("|") ? line.split("|") : line.split("\t");
  const [place, cam, script, dur, iconRaw, xyRaw, insertRaw] = parts.map((p) => (p || "").trim());
  if (!place || !cam || !script) return null;
  const camKey = CAM_LABELS[cam] ? cam : "establishing";
  const icon = ICON_GLYPHS[iconRaw] ? iconRaw : "default";

  let x, y;
  if (xyRaw && xyRaw.includes(",")) {
    const [xr, yr] = xyRaw.split(",").map((n) => Number(n.trim()));
    if (!Number.isNaN(xr) && !Number.isNaN(yr)) { x = xr; y = yr; }
  }
  if (x === undefined) {
    const fp = FALLBACK_POINTS[index % FALLBACK_POINTS.length];
    [x, y] = fp;
  }

  return {
    place,
    cam: camKey,
    script,
    duration: Number(dur) > 0 ? Number(dur) : DEFAULT_DURATION,
    icon,
    x,
    y,
    insert: insertRaw || "",
  };
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
        <div class="pr-meta">${CAM_LABELS[s.cam]} · ${s.duration}s</div>
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
    btn.addEventListener("click", () => goToScene(Number(btn.dataset.index)));
  });
}

function goToScene(index) {
  if (!scenes.length) return;
  activeIndex = Math.max(0, Math.min(scenes.length - 1, index));
  const scene = scenes[activeIndex];

  el.epTitle.textContent = scene.place;
  el.sceneCounter.textContent = `ฉาก ${activeIndex + 1}/${scenes.length}`;
  el.camLabel.textContent = CAM_LABELS[scene.cam];
  el.camBadge.querySelector(".cam-dot").style.background = CAM_DOT_VAR[scene.cam];
  el.subtitleText.textContent = scene.script;

  el.mapStage.className = `map-stage ${CAM_CLASS[scene.cam]}`;

  el.pinTo.style.left = `${scene.x}%`;
  el.pinTo.style.top = `${scene.y}%`;
  el.pinIcon.setAttribute("data-glyph", ICON_GLYPHS[scene.icon]);
  el.pinLabel.textContent = scene.place;
  el.pinTo.classList.remove("is-hidden");

  renderInsertContent(el.insertLayerContent, scene.insert);
  renderInsertContent(el.insertFloatContent, scene.insert);

  const prevScene = scenes[activeIndex - 1];
  if (prevScene) {
    el.pinFrom.style.left = `${prevScene.x}%`;
    el.pinFrom.style.top = `${prevScene.y}%`;
    el.pinFrom.classList.remove("is-hidden");
    const d = `M${prevScene.x},${prevScene.y} Q${(prevScene.x + scene.x) / 2},${Math.min(prevScene.y, scene.y) - 15} ${scene.x},${scene.y}`;
    animatePath(d);
  } else {
    el.pinFrom.classList.add("is-hidden");
    el.pathLine.classList.remove("is-visible");
  }

  el.timelineTrack.querySelectorAll(".scene-chip").forEach((btn, i) => {
    btn.classList.toggle("is-active", i === activeIndex);
  });
  const activeChip = el.timelineTrack.children[activeIndex];
  if (activeChip) activeChip.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });

  if (isPlaying) scheduleNext();
}

function animatePath(d) {
  el.pathLine.classList.remove("is-visible");
  el.pathLine.setAttribute("d", d);
  const length = el.pathLine.getTotalLength();
  el.pathLine.style.transition = "none";
  el.pathLine.style.strokeDasharray = `${length}`;
  el.pathLine.style.strokeDashoffset = `${length}`;
  // บังคับ reflow ก่อนเริ่มอนิเมชันลากเส้น
  el.pathLine.getBoundingClientRect();
  el.pathLine.style.transition = "stroke-dashoffset 1.1s cubic-bezier(.22,.8,.3,1)";
  el.pathLine.style.strokeDashoffset = "0";
  el.pathLine.classList.add("is-visible");
}

function scheduleNext() {
  clearTimeout(playTimer);
  const scene = scenes[activeIndex];
  playTimer = setTimeout(() => {
    if (activeIndex < scenes.length - 1) {
      goToScene(activeIndex + 1);
    } else {
      setPlaying(false);
    }
  }, scene.duration * 1000);
}

function setPlaying(next) {
  isPlaying = next;
  el.btnPlay.textContent = isPlaying ? "⏸" : "▶";
  if (isPlaying) {
    if (activeIndex === -1) goToScene(0);
    else scheduleNext();
  } else {
    clearTimeout(playTimer);
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

el.btnPrev.addEventListener("click", () => goToScene(activeIndex - 1));
el.btnNext.addEventListener("click", () => goToScene(activeIndex + 1));
el.btnPlay.addEventListener("click", () => setPlaying(!isPlaying));

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

el.brandInput.addEventListener("input", () => {
  el.brandText.textContent = el.brandInput.value.trim().slice(0, 4) || "HS";
});
el.brandCorner.addEventListener("change", () => {
  el.brandChip.className = `brand-chip brand-${el.brandCorner.value}`;
});
