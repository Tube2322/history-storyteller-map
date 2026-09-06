const CAM_LABELS = {
  "establishing": "ภาพเปิดกว้าง",
  "fly-to": "กล้องบินเดินทาง",
  "push-in": "ซูมเข้าถึงจุดหมาย",
  "zoom-out": "ซูมออกเผยภาพรวม",
  "orbit": "กล้องหมุนรอบจุดสนใจ",
  "cut-to-insert": "ตัดเข้าภาพเต็มจอ",
};
const CAM_CLASS = {
  "establishing": "cam-establishing",
  "fly-to": "cam-flyto",
  "push-in": "cam-pushin",
  "zoom-out": "cam-zoomout",
  "orbit": "cam-orbit",
  "cut-to-insert": "cam-cutinsert",
};
const CAM_DOT_VAR = {
  "establishing": "var(--cam-establishing)",
  "fly-to": "var(--cam-flyto)",
  "push-in": "var(--cam-pushin)",
  "zoom-out": "var(--cam-zoomout)",
  "orbit": "var(--cam-orbit)",
  "cut-to-insert": "var(--cam-cutinsert)",
};
const DEFAULT_DURATION = 5;

const el = {
  mapStage: document.getElementById("mapStage"),
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

function parseRow(line) {
  const parts = line.includes("|") ? line.split("|") : line.split("\t");
  const [place, cam, script, dur] = parts.map((p) => (p || "").trim());
  if (!place || !cam || !script) return null;
  const camKey = CAM_LABELS[cam] ? cam : "establishing";
  return {
    place,
    cam: camKey,
    script,
    duration: Number(dur) > 0 ? Number(dur) : DEFAULT_DURATION,
  };
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

  el.timelineTrack.querySelectorAll(".scene-chip").forEach((btn, i) => {
    btn.classList.toggle("is-active", i === activeIndex);
  });
  const activeChip = el.timelineTrack.children[activeIndex];
  if (activeChip) activeChip.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });

  if (isPlaying) scheduleNext();
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
