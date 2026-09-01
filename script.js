// ===== เฟส 1: Game Shell — นาฬิกาไทยจริง (Asia/Bangkok) + สลับแผงขวาตามหมวดที่เลือก =====
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
  document.querySelector(".diorama").style.filter = day
    ? "brightness(1) saturate(1)"
    : "brightness(0.62) saturate(0.85) hue-rotate(-6deg)";

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

$("reportBtn").addEventListener("click", () => {
  alert(
    `รายงานสด\n\nทรัพย์สินสุทธิ ${fmtMoney(state.netWorth)}\nเงินสด ${fmtMoney(state.cash)}\nพลังงาน ${state.energy}/100 · ชื่อเสียง ${state.reputation}/100\n\n(mock — เฟสถัดไปจะดึงจากสถานะจริง)`
  );
});
$("clockChip").addEventListener("click", () => $("reportBtn").click());
