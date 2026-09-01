// ===== เฟส 1-2: Game Shell + แผนที่จริง =====
// เฟส 1: นาฬิกาไทยจริง (Asia/Bangkok) + สลับแผงขวาตามหมวดที่เลือก
// เฟส 2: แผนที่ประเทศ/จังหวัดจากขอบเขตภูมิศาสตร์จริง (GeoJSON) — ระดับอำเภอยังเป็นไอโซเมตริกจำลอง (หมวด 05)
// state ตอนนี้เป็น mock ล้วน ยังไม่ต่อ backend — โครงสร้างอิงคอนเซปต์ UX/UI หมวด 02–14

const $ = (id) => document.getElementById(id);
const fmtMoney = (n) => `฿${new Intl.NumberFormat("th-TH").format(Math.round(n))}`;
const fmtNum = (n) => new Intl.NumberFormat("th-TH").format(Math.round(n));

const state = {
  netWorth: 12480900,
  cash: 840200,
  debt: 3100000,
  energy: 68,
  reputation: 34,
  activePanel: "map",
  news: [
    "ราคาหมูขึ้น 6% ผลจากต้นทุนอาหารสัตว์",
    "ธปท. คงอัตราดอกเบี้ยนโยบายที่ 2.25%",
    "สงกรานต์เหลืออีก 30 วัน — เตรียมสต๊อกสายท่องเที่ยว",
    "เงินเดือนออกสิ้นเดือนนี้ กำลังซื้อคาดขยับขึ้น 18%",
  ],
};

// ---------- นาฬิกาไทยจริง ----------
const dateFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short", year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false });

function bangkokNow() {
  return new Date();
}

function isDaytime(now) {
  const h = parseInt(hourFmt.format(now), 10);
  return h >= 6 && h < 18;
}

function tickClock() {
  const now = bangkokNow();
  $("clockDate").textContent = dateFmt.format(now).replace(" พ.ศ.", "");
  $("clockTime").textContent = timeFmt.format(now);

  const day = isDaytime(now);
  $("vpDayPhase").textContent = day ? "กลางวัน" : "กลางคืน";
  const dayFilter = day ? "brightness(1) saturate(1)" : "brightness(0.62) saturate(0.85) hue-rotate(-6deg)";
  document.querySelectorAll(".geo-map, .diorama").forEach((el) => { el.style.filter = dayFilter; });

  // tick จำลองทุก 15 นาทีจริง — คำนวณเวลานับถอยหลังไปยัง tick ถัดไป
  const min = now.getMinutes();
  const nextQuarter = (Math.floor(min / 15) + 1) * 15;
  const next = new Date(now);
  if (nextQuarter === 60) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  } else {
    next.setMinutes(nextQuarter, 0, 0);
  }
  $("nextTick").textContent = `tick ถัดไป ${timeFmt.format(next).slice(0, 5)} น.`;
}

// ---------- แถบบน ----------
function renderTopbar() {
  $("netWorth").textContent = fmtMoney(state.netWorth);
  $("cash").textContent = fmtMoney(state.cash);
  $("debt").textContent = fmtMoney(state.debt);
  $("energyBar").style.width = `${state.energy}%`;
  $("repBar").style.width = `${state.reputation}%`;
}

// ---------- แผงขวา: เนื้อหาต่อหมวด ----------
const panels = {
  map: () => `
    <div>
      <h2>แปลง A-14 · ศรีราชา</h2>
      <p class="sub">48 ตร.ว. · ค่าเช่า ${fmtMoney(22000)}/เดือน · คนผ่าน 4,200/วัน</p>
    </div>
    <div class="kpi-row">
      <div class="kpi"><span>เหมาะกับ</span><b style="font-size:13px">อาหาร/ค้าปลีก</b></div>
      <div class="kpi"><span>คู่แข่งใกล้</span><b>3</b></div>
      <div class="kpi"><span>ซื้อขาด</span><b style="font-size:13px">${fmtMoney(1200000)}</b></div>
    </div>
    <div class="action-grid">
      <button class="action-btn primary">เช่าแปลงนี้</button>
      <button class="action-btn">ปักหมุดไว้เทียบ</button>
    </div>
    <p class="placeholder">คลิกอาคารบนแผนที่เพื่อดูรายละเอียดทำเลอื่น — เฟสถัดไปจะเชื่อมกับข้อมูลจริงต่อแปลง</p>
  `,
  business: () => `
    <div>
      <h2>ร้านหมูปิ้งศรีราชา</h2>
      <p class="sub">SME · เปิดมา 148 วัน · พนักงาน 3</p>
    </div>
    <div class="kpi-row">
      <div class="kpi"><span>กำไรวันนี้</span><b>฿4,120</b></div>
      <div class="kpi"><span>ลูกค้า</span><b>312</b></div>
      <div class="kpi"><span>สต๊อก</span><b>2.1 วัน</b></div>
    </div>
    <div class="action-grid">
      <button class="action-btn primary">สั่งวัตถุดิบเพิ่ม</button>
      <button class="action-btn">ปรับราคาขาย</button>
      <button class="action-btn">จ้างพนักงาน</button>
      <button class="action-btn">โฆษณาท้องถิ่น</button>
    </div>
    <div class="warn-box">เตือน · ใบอนุญาตจำหน่ายอาหารหมดอายุใน 12 วัน · ต่ออายุ ฿1,500</div>
  `,
  finance: () => `
    <div>
      <h2>การเงิน · มีนาคม 2569</h2>
      <p class="sub">กำไรสุทธิเดือนนี้ ฿538,800 · อัตรากำไร 21.7%</p>
    </div>
    <div class="kpi-row">
      <div class="kpi"><span>รายได้รวม</span><b style="font-size:13px">฿2.48M</b></div>
      <div class="kpi"><span>ภาษี+ค่าธรรมเนียม</span><b style="font-size:13px">฿221,800</b></div>
      <div class="kpi"><span>เงินสดต่ำสุด</span><b style="font-size:13px">฿184,000</b></div>
    </div>
    <div class="warn-box">ภ.พ.30 · VAT 7% ฿173,600 ครบกำหนด 15 เม.ย.</div>
    <div class="action-grid">
      <button class="action-btn primary">ยื่นภาษี</button>
      <button class="action-btn">ขอสินเชื่อเพิ่ม</button>
    </div>
  `,
  market: () => `
    <div>
      <h2>ส่วนแบ่งตลาด · ศรีราชา</h2>
      <p class="sub">อันดับ 2 จาก 14 ร้านในโซนเดียวกัน</p>
    </div>
    <p class="placeholder">
      1. เชนทุนใหญ่ — 31%<br>
      2. <strong>ร้านคุณ — 22%</strong><br>
      3. เจ้าถิ่นเก่าแก่ — 18%<br>
      4. สตาร์ทอัพเผาเงิน — 9%
    </p>
    <div class="action-grid">
      <button class="action-btn">ดูโปรไฟล์คู่แข่ง</button>
      <button class="action-btn">วิเคราะห์ราคา</button>
    </div>
  `,
  people: () => `
    <div>
      <h2>ผู้คน</h2>
      <p class="sub">พนักงาน 3 · ความสัมพันธ์ 5 ราย</p>
    </div>
    <p class="placeholder">
      น้องมิ้ว — พนักงานประจำ · ความพอใจ 82%<br>
      พี่กิตติ — นักลงทุนท้องถิ่น · สนใจธุรกิจอาหารเช้า<br>
      คุณนิดา — ซัพพลายเออร์วัตถุดิบ · ความน่าเชื่อถือสูง
    </p>
    <div class="action-grid">
      <button class="action-btn primary">จ้างงานเพิ่ม</button>
      <button class="action-btn">สร้างเครือข่าย</button>
    </div>
  `,
  gov: () => `
    <div>
      <h2>ราชการ</h2>
      <p class="sub">ใบอนุญาต 2 รายการ · กำหนดยื่นภาษี 1 รายการ</p>
    </div>
    <div class="warn-box">ใบอนุญาตจำหน่ายอาหารหมดอายุใน 12 วัน</div>
    <div class="warn-box">ภ.ง.ด.1 ครบกำหนด 7 เม.ย.</div>
    <div class="action-grid">
      <button class="action-btn primary">ต่อใบอนุญาต</button>
      <button class="action-btn">ยื่นแบบภาษี</button>
    </div>
  `,
  life: () => `
    <div>
      <h2>ชีวิตส่วนตัว</h2>
      <p class="sub">พลังงาน ${state.energy}/100 · ชื่อเสียง ${state.reputation}/100</p>
    </div>
    <p class="placeholder">จัดสรรเวลา 16 ชั่วโมงของวันนี้ — ทำงาน / ดูแลธุรกิจ / เรียน / พักผ่อน / ครอบครัว</p>
    <div class="action-grid">
      <button class="action-btn primary">จัดตารางวันนี้</button>
      <button class="action-btn">พักผ่อน</button>
    </div>
  `,
};

function renderPanel() {
  const build = panels[state.activePanel] || panels.map;
  $("panel").innerHTML = build();
}

document.querySelectorAll(".rail-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(".rail-btn.is-active")?.classList.remove("is-active");
    btn.classList.add("is-active");
    state.activePanel = btn.dataset.panel;
    renderPanel();
    document.querySelector(".panel").classList.add("is-open");
  });
});

// ---------- แผนที่จริง: ประเทศ → จังหวัด (GeoJSON) → อำเภอ (ไอโซเมตริก) ----------
// ระดับ 1-2 ใช้ขอบเขตจริงจาก OpenGISData-Thailand (chingchai/OpenGISData-Thailand)
// เดโมนี้เปิดใช้งานเต็มเฉพาะจังหวัดชลบุรี → อำเภอศรีราชา ตามคอนเซปต์หมวด 05

const PLAYABLE_PROVINCE = "20"; // pro_code ของชลบุรี
const PLAYABLE_DISTRICT = "2007"; // amp_code ของศรีราชา
const map = { level: "country", provinceData: null };

function flattenCoords(coords, out) {
  if (typeof coords[0] === "number") out.push(coords);
  else coords.forEach((c) => flattenCoords(c, out));
  return out;
}

function makeProjection(featureCollection, viewW, viewH, pad) {
  const pts = [];
  featureCollection.features.forEach((f) => flattenCoords(f.geometry.coordinates, pts));
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const cosLat = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanX = (maxLon - minLon) * cosLat;
  const spanY = maxLat - minLat;
  const scale = Math.min((viewW - pad * 2) / spanX, (viewH - pad * 2) / spanY);
  const offX = pad + ((viewW - pad * 2) - spanX * scale) / 2;
  const offY = pad + ((viewH - pad * 2) - spanY * scale) / 2;
  return ([lon, lat]) => [
    offX + (lon - minLon) * cosLat * scale,
    offY + (maxLat - lat) * scale,
  ];
}

function ringPath(ring, project) {
  return ring.map((pt, i) => `${i === 0 ? "M" : "L"}${project(pt).map((n) => n.toFixed(1)).join(",")}`).join(" ") + "Z";
}

function geometryPath(geom, project) {
  if (geom.type === "Polygon") return geom.coordinates.map((r) => ringPath(r, project)).join(" ");
  if (geom.type === "MultiPolygon") return geom.coordinates.map((poly) => poly.map((r) => ringPath(r, project)).join(" ")).join(" ");
  return "";
}

function ringCentroid(ring, project) {
  const pts = ring.map(project);
  const x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [x, y];
}

async function loadGeoJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`โหลดข้อมูลแผนที่ไม่สำเร็จ: ${path}`);
  return res.json();
}

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

async function renderCountryMap() {
  const svg = $("mapCountry");
  svg.innerHTML = "";
  let data;
  try {
    data = await loadGeoJSON("geo/provinces.geojson");
  } catch (err) {
    svg.appendChild(svgEl("text", { x: 20, y: 30, class: "geo-label" })).textContent = "โหลดแผนที่ไม่สำเร็จ — ต้องรันผ่านเว็บเซิร์ฟเวอร์ (ไม่ใช่เปิดไฟล์ตรงๆ)";
    return;
  }
  const project = makeProjection(data, 900, 520, 24);
  data.features.forEach((f) => {
    const isPlayable = f.properties.pro_code === PLAYABLE_PROVINCE;
    const path = svgEl("path", {
      d: geometryPath(f.geometry, project),
      class: `geo-shape ${isPlayable ? "is-playable" : "is-locked"}`,
    });
    const title = svgEl("title", {});
    title.textContent = `${f.properties.pro_th} (${f.properties.pro_en})${isPlayable ? " — เปิดเล่นได้" : " — ยังไม่มีข้อมูล"}`;
    path.appendChild(title);
    path.addEventListener("click", () => {
      if (isPlayable) zoomToProvince();
      else alert(`${f.properties.pro_th}\n\nเดโมนี้เปิดใช้งานเต็มเฉพาะจังหวัดชลบุรี จังหวัดอื่นจะทยอยเพิ่มข้อมูลตามเฟส 6 ของคอนเซปต์`);
    });
    svg.appendChild(path);
  });
}

async function renderProvinceMap() {
  const svg = $("mapProvince");
  svg.innerHTML = "";
  if (!map.provinceData) map.provinceData = await loadGeoJSON("geo/chonburi-districts.geojson");
  const data = map.provinceData;
  const project = makeProjection(data, 900, 520, 24);
  data.features.forEach((f) => {
    const isPlayable = f.properties.amp_code === PLAYABLE_DISTRICT;
    const path = svgEl("path", {
      d: geometryPath(f.geometry, project),
      class: `geo-shape ${isPlayable ? "is-playable" : "is-locked"}`,
    });
    const title = svgEl("title", {});
    title.textContent = `${f.properties.amp_th} (${f.properties.amp_en})${isPlayable ? " — เปิดเล่นได้" : " — ยังไม่มีข้อมูล"}`;
    path.appendChild(title);
    path.addEventListener("click", () => {
      if (isPlayable) zoomToDistrict();
      else alert(`อ.${f.properties.amp_th}\n\nเดโมนี้เปิดใช้งานเต็มเฉพาะอำเภอศรีราชา อำเภออื่นในชลบุรีจะทยอยเพิ่มทีหลัง`);
    });
    svg.appendChild(path);

    const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const [cx, cy] = ringCentroid(ring, project);
    const label = svgEl("text", { x: cx.toFixed(1), y: cy.toFixed(1), class: `geo-label ${isPlayable ? "is-playable" : ""}` });
    label.textContent = f.properties.amp_th;
    svg.appendChild(label);
  });
}

function showLayer(el, show) {
  // <svg> ไม่รองรับ IDL property `.hidden` แบบ HTMLElement — ต้องสั่ง attribute ตรงๆ ให้ตรงกับ CSS [hidden]
  if (show) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
}

// ---------- ซูมเข้าออก + เลื่อนแผนที่ (viewBox pan/zoom) ----------
const MIN_ZOOM = 1; // ซูมออกสุด = viewBox เดิม
const MAX_ZOOM = 8;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function clampViewBox(svg) {
  const vb = svg._vb, base = svg._base;
  vb.x = clamp(vb.x, base.x, base.x + base.w - vb.w);
  vb.y = clamp(vb.y, base.y, base.y + base.h - vb.h);
}
function applyViewBox(svg) {
  const v = svg._vb;
  svg.setAttribute("viewBox", `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
}
function resetViewBox(svg) {
  if (!svg._base) return;
  svg._vb = { ...svg._base };
  applyViewBox(svg);
}

function attachPanZoom(svg) {
  const [x, y, w, h] = svg.getAttribute("viewBox").split(" ").map(Number);
  svg._base = { x, y, w, h };
  svg._vb = { x, y, w, h };

  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      const vb = svg._vb;
      const anchorX = vb.x + fx * vb.w;
      const anchorY = vb.y + fy * vb.h;
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;
      let newW = clamp(vb.w * factor, svg._base.w / MAX_ZOOM, svg._base.w / MIN_ZOOM);
      let newH = (newW / vb.w) * vb.h;
      vb.x = anchorX - fx * newW;
      vb.y = anchorY - fy * newH;
      vb.w = newW;
      vb.h = newH;
      clampViewBox(svg);
      applyViewBox(svg);
    },
    { passive: false }
  );

  let dragging = false;
  let dragMoved = false;
  let lastX = 0;
  let lastY = 0;
  svg.addEventListener("pointerdown", (e) => {
    dragging = true;
    dragMoved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    // ไม่ใช้ setPointerCapture — มันทำให้ event `click` ที่ตามมาชี้ไปที่ svg แทน <path> ข้างใต้เสมอ
    svg.classList.add("is-dragging");
  });
  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    lastX = e.clientX;
    lastY = e.clientY;
    const rect = svg.getBoundingClientRect();
    const vb = svg._vb;
    vb.x -= dx * (vb.w / rect.width);
    vb.y -= dy * (vb.h / rect.height);
    clampViewBox(svg);
    applyViewBox(svg);
  });
  const endDrag = () => {
    dragging = false;
    svg.classList.remove("is-dragging");
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointerleave", endDrag);
  svg.addEventListener(
    "click",
    (e) => {
      if (dragMoved) { e.stopPropagation(); dragMoved = false; }
    },
    true
  );
  svg.addEventListener("dblclick", () => resetViewBox(svg));
}

function setMapLevel(level) {
  map.level = level;
  [
    [$("mapCountry"), "country"],
    [$("mapProvince"), "province"],
    [$("mapDistrict"), "district"],
  ].forEach(([el, name]) => {
    const show = level === name;
    showLayer(el, show);
    if (show) resetViewBox(el); // เข้าเลเวลใหม่ทุกครั้ง เริ่มมุมมองใหม่เสมอ
  });
  $("mapBack").hidden = level === "country";
  if (level === "country") $("vpArea").textContent = "ประเทศไทย";
  if (level === "province") $("vpArea").textContent = "จ.ชลบุรี";
  if (level === "district") $("vpArea").textContent = "อ.ศรีราชา · โซนย่านการค้า";
}

async function zoomToProvince() {
  await renderProvinceMap();
  setMapLevel("province");
}
function zoomToDistrict() {
  setMapLevel("district");
}
function mapBack() {
  if (map.level === "district") setMapLevel("province");
  else if (map.level === "province") setMapLevel("country");
}
$("mapBack").addEventListener("click", mapBack);

// ---------- ticker ข่าว ----------
let newsIndex = 0;
function renderNews() {
  $("newsText").textContent = state.news[newsIndex % state.news.length];
  newsIndex++;
}

// ---------- init ----------
renderTopbar();
renderPanel();
renderNews();
tickClock();
setInterval(tickClock, 1000);
setInterval(renderNews, 6000);
[$("mapCountry"), $("mapProvince"), $("mapDistrict")].forEach(attachPanZoom);
setMapLevel("country");
renderCountryMap();

$("reportBtn").addEventListener("click", () => {
  alert(
    `รายงานสด\n\nทรัพย์สินสุทธิ ${fmtMoney(state.netWorth)}\nเงินสด ${fmtMoney(state.cash)}\nพลังงาน ${state.energy}/100 · ชื่อเสียง ${state.reputation}/100\n\n(mock — เฟสถัดไปจะดึงจากสถานะจริง)`
  );
});
$("clockChip").addEventListener("click", () => $("reportBtn").click());
