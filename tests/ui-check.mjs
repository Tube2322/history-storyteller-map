// ตรวจ UI อัตโนมัติ: ไล่ทุกฉากของทุกสคริปต์ตัวอย่าง ในทุกกรอบ (9:16 / 16:9 / เดสก์ท็อป / มือถือ)
// แล้วเช็กว่าตัวหนังสือ/ป้าย "ล้น" "ขาด" "ออกนอกกรอบหรือ safe zone" "ทับกัน" หรือ "กลืนกับแผนที่" หรือเปล่า
//
//   cd tests && npm install && npm test                  ← ตรวจทุกไฟล์ใน examples/
//   node ui-check.mjs ../examples/egypt-1min.txt         ← ตรวจเฉพาะไฟล์ที่ระบุ
//
// ไม่ต้องต่อเน็ต: ไลบรารีแผนที่โหลดจาก node_modules, ภาพดาวเทียม/รูปภายนอกแทนด้วยภาพตาราง — ผลตรวจจึงเหมือนเดิมทุกครั้ง
// ภาพหน้าจอของฉากที่มีปัญหาเก็บไว้ที่ tests/output/

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(HERE, "output");
const PORT = 5299;
const SETTLE_MS = 2900; // ฉากที่ไกลจากฉากก่อนบินโค้งได้ถึง 2.4 วิ — ต้องวัดตอนกล้องถึงที่แล้ว ไม่ใช่กลางทาง

const VIEWS = [
  { name: "9x16", viewport: { width: 1280, height: 800 }, aspect: "916" },
  { name: "16x9", viewport: { width: 1280, height: 800 }, aspect: "169" },
  { name: "desktop", viewport: { width: 1440, height: 900 }, aspect: "free" },
  { name: "mobile", viewport: { width: 390, height: 844 }, aspect: "free" },
];

function gridTilePng() {
  const W = 256;
  const rows = [];
  for (let y = 0; y < W; y++) {
    const row = Buffer.alloc(1 + W * 3);
    for (let x = 0; x < W; x++) {
      const line = x % 32 === 0 || y % 32 === 0;
      // พื้นสว่างสลับมืด — จำลองภาพดาวเทียมทั้งทะเลทราย/ทะเล ให้ตรวจเรื่องตัวหนังสือกลืนได้จริง
      const bright = ((x >> 6) + (y >> 6)) % 2 === 0;
      row.set(line ? [200, 200, 120] : bright ? [215, 200, 160] : [30, 50, 70], 1 + x * 3);
    }
    rows.push(row);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// วัดทุกอย่างในหน้าเว็บ — คืนรายการปัญหาของฉากปัจจุบัน
function inspectScene() {
  const stage = document.getElementById("stageEl");
  const st = stage.getBoundingClientRect();
  const cs = getComputedStyle(stage);
  const px = (v) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;width:${v};height:0`;
    stage.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  };
  const safe = {
    left: st.left + px(cs.getPropertyValue("--safe-left") || "0px"),
    right: st.right - px(cs.getPropertyValue("--safe-right") || "0px"),
    top: st.top + px(cs.getPropertyValue("--safe-top") || "0px"),
    bottom: st.bottom - px(cs.getPropertyValue("--safe-bottom") || "0px"),
  };
  const hasSafeZone = stage.dataset.aspect !== "free";

  const isShown = (e) => {
    if (!e || !e.isConnected) return false;
    for (let n = e; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.3) return false;
    }
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (e.textContent.trim() || e.querySelector("img,video"));
  };

  const OVERLAYS = {
    "ซับไตเติล": ".subtitle-wrap",
    "ข้อความ caption": ".caption-overlay",
    "ชื่อภูมิภาค": ".region-label",
    "กล่อง callout": ".callout-box",
    "ภาพลอย insert": ".insert-float",
    "โลโก้แบรนด์": ".brand-chip",
  };
  const LABELS = {
    "ป้ายหมุด": ".pin-label",
    "ป้ายรูปปักพิกัด": ".geo-photo-label",
    "ป้ายไอคอน": ".badge-pill",
    "ป้ายรบ": ".battle-label span",
    "ป้าย callout": ".callout-label",
  };

  const issues = [];
  const add = (level, msg) => issues.push({ level, msg });
  const inside = (r, box, tol = 1) => r.left >= box.left - tol && r.right <= box.right + tol && r.top >= box.top - tol && r.bottom <= box.bottom + tol;

  const shownOverlays = [];
  for (const [name, sel] of Object.entries(OVERLAYS)) {
    const e = document.querySelector(sel);
    if (!isShown(e)) continue;
    const r = e.getBoundingClientRect();
    shownOverlays.push({ name, r });
    if (!inside(r, st)) add("error", `${name} ล้นออกนอกกรอบวิดีโอ`);
    else if (hasSafeZone && name !== "ภาพลอย insert" && !inside(r, safe, 2)) add("error", `${name} ออกนอก safe zone (โดน UI ของแพลตฟอร์มบัง)`);
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible") add("error", `${name} ข้อความล้นกล่อง`);
  }

  for (const [name, sel] of Object.entries(LABELS)) {
    document.querySelectorAll(sel).forEach((e) => {
      if (!isShown(e)) return;
      const r = e.getBoundingClientRect();
      if (e.scrollHeight > e.clientHeight + 2) add("warn", `${name} "${e.textContent.trim().slice(0, 30)}" ยาวเกิน 2 บรรทัด ถูกตัดท้าย`);
      if (e.scrollWidth > e.clientWidth + 1) add("error", `${name} "${e.textContent.trim().slice(0, 30)}" ข้อความล้นกล่อง`);
      // ป้ายของหมุดหลักอยู่กลางจอเสมอ ถ้าหลุดขอบ = ขาดจริง (มาร์กเกอร์อื่นอยู่นอกจอได้ตามการเลื่อนแผนที่)
      if (sel === ".pin-label" && !inside(r, st)) add("error", `${name} "${e.textContent.trim().slice(0, 30)}" โดนขอบจอตัด`);
      if (sel === ".pin-label") {
        // มาร์กเกอร์อื่นมาทับชื่อสถานที่ (ไอคอนยานพาหนะที่วิ่งตามเส้นทางผ่านได้ชั่วคราว ไม่นับ)
        document.querySelectorAll(".maplibregl-marker").forEach((m) => {
          if (m.contains(e) || m.classList.contains("transport-marker-wrap") || !isShown(m)) return;
          const mr = m.getBoundingClientRect();
          const w = Math.min(mr.right, r.right) - Math.max(mr.left, r.left);
          const h = Math.min(mr.bottom, r.bottom) - Math.max(mr.top, r.top);
          if (w > 4 && h > 4) add("error", `มาร์กเกอร์ "${m.className.split(" ")[0]}" ทับ${name} "${e.textContent.trim().slice(0, 30)}"`);
        });
      }
    });
  }

  for (let i = 0; i < shownOverlays.length; i++) {
    for (let j = i + 1; j < shownOverlays.length; j++) {
      const a = shownOverlays[i].r, b = shownOverlays[j].r;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w <= 0 || h <= 0) continue;
      const ratio = (w * h) / Math.min(a.width * a.height, b.width * b.height);
      if (ratio > 0.15) add("error", `${shownOverlays[i].name} ทับ ${shownOverlays[j].name} (${Math.round(ratio * 100)}%)`);
    }
  }

  // กลืน: ตัวหนังสือบนแผนที่ต้องมีเงา หรือพื้นหลังทึบพอ (ตัวมันเองหรือกล่องแม่ไม่เกิน 2 ชั้น) — ภาพดาวเทียมสว่าง/มืดได้ทุกแบบ
  const legible = (e) => {
    for (let n = e, depth = 0; n && depth < 3; n = n.parentElement, depth++) {
      const s = getComputedStyle(n);
      if (s.textShadow && s.textShadow !== "none") return true;
      const m = s.backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(",").map(Number);
        if ((parts[3] ?? 1) >= 0.5) return true;
      }
    }
    return false;
  };
  for (const [name, sel] of Object.entries({ ...OVERLAYS, ...LABELS })) {
    document.querySelectorAll(sel).forEach((e) => {
      if (isShown(e) && e.textContent.trim() && !legible(e)) add("error", `${name} ไม่มีเงา/พื้นหลัง ตัวหนังสืออาจกลืนกับภาพแผนที่`);
    });
  }
  return issues;
}

async function main() {
  const files = process.argv.slice(2).length
    ? process.argv.slice(2).map((f) => path.resolve(f))
    : fs.readdirSync(path.join(ROOT, "examples")).filter((f) => f.endsWith(".txt")).map((f) => path.join(ROOT, "examples", f));
  fs.mkdirSync(OUT, { recursive: true });

  const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const tile = gridTilePng();
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });

  let errorCount = 0;
  let warnCount = 0;
  try {
    for (const file of files) {
      const script = fs.readFileSync(file, "utf8");
      for (const view of VIEWS) {
        const ctx = await browser.newContext({ viewport: view.viewport });
        // Playwright เช็ก route ที่ลงทะเบียน "ทีหลัง" ก่อน — ตัวกรองกว้างต้องมาก่อนตัวเฉพาะ
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) =>
          r.request().resourceType() === "image" ? r.fulfill({ body: tile, contentType: "image/png" }) : r.abort());
        await ctx.route(/arcgisonline\.com/, (r) => r.fulfill({ body: tile, contentType: "image/png" }));
        await ctx.route(/unpkg\.com\/(maplibre-gl|xlsx)@[^/]+\/(.*)/, (r) => {
          const [, pkg, rest] = r.request().url().match(/unpkg\.com\/(maplibre-gl|xlsx)@[^/]+\/(.*)/);
          r.fulfill({ path: path.join(HERE, "node_modules", pkg, rest) });
        });
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(e.message));
        await page.goto(`http://127.0.0.1:${PORT}/`);
        await page.waitForFunction(() => typeof map !== "undefined" && !!map.getLayer("region-fill"), null, { timeout: 20000 });
        const sceneCount = await page.evaluate(([text, aspect]) => {
          document.getElementById("importText").value = text;
          parseImportText();
          currentAspect = aspect;
          fitStage();
          return scenes.length;
        }, [script, view.aspect]);

        for (let i = 0; i < sceneCount; i++) {
          // fly-to บินตลอดทั้งฉาก — วัดตอนใกล้จบฉาก (ภาพที่คนดูเห็นค้างนานที่สุด) ไม่ใช่ตอนกำลังบินกลางทาง
          const waitMs = await page.evaluate((idx) => { goToScene(idx); const s = scenes[idx]; return s.cam === "fly-to" ? s.duration * 1000 * 0.9 : 0; }, i);
          await page.waitForTimeout(Math.max(SETTLE_MS, waitMs));
          const issues = await page.evaluate(inspectScene);
          if (!issues.length) continue;
          const tag = `${path.basename(file, ".txt")} [${view.name}] ฉาก ${i + 1}`;
          const shot = path.join(OUT, `${path.basename(file, ".txt")}-${view.name}-scene${i + 1}.png`);
          await page.screenshot({ path: shot });
          for (const it of issues) {
            if (it.level === "error") errorCount++; else warnCount++;
            console.log(`${it.level === "error" ? "✗" : "!"} ${tag}: ${it.msg}`);
          }
        }
        for (const msg of pageErrors) { errorCount++; console.log(`✗ ${path.basename(file)} [${view.name}]: JavaScript error — ${msg}`); }
        await ctx.close();
      }
      console.log(`— ตรวจ ${path.basename(file)} เสร็จ`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\nสรุป: ${errorCount} ปัญหา, ${warnCount} คำเตือน${errorCount + warnCount ? " — ภาพหน้าจอที่ tests/output/" : ""}`);
  process.exit(errorCount ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
