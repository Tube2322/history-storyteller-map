// ===== เฟส 1-3: Game Shell + แผนที่จริง + ธุรกิจสายอาหารบนนาฬิกาจริง =====
// เฟส 1: นาฬิกาไทยจริง (Asia/Bangkok) + สลับแผงขวาตามหมวดที่เลือก
// เฟส 2: แผนที่ประเทศ/จังหวัดจากขอบเขตภูมิศาสตร์จริง (GeoJSON) — ระดับอำเภอยังเป็นไอโซเมตริกจำลอง (หมวด 05)
// เฟส 3: ร้านหมูปิ้งครบลูป — สั่งของ/ตั้งราคา/จ้างคน ขายจริงทุก tick 15 นาที แม้ปิดแท็บ (หมวด 02, 06)
// ยังไม่มี backend — เซฟลง localStorage เครื่องเดียว, คำนวณย้อนหลังสูงสุด 72 ชม.ตอนกลับมา (หมวด 02)

const $ = (id) => document.getElementById(id);
const fmtMoney = (n) => `฿${new Intl.NumberFormat("th-TH").format(Math.round(n))}`;
const fmtNum = (n) => new Intl.NumberFormat("th-TH").format(Math.round(n));

const SAVE_KEY = "thailand-sim-save-v1";
const TICK_MS = 15 * 60 * 1000;
const MAX_CATCHUP_MS = 72 * 60 * 60 * 1000; // เพดานคำนวณย้อนหลัง 72 ชม. (หมวด 02)
const SS_RATE = 0.05; // ประกันสังคมฝั่งนายจ้าง 5%
const SS_CAP_PER_STAFF = 750; // เพดานเงินสมทบต่อคนต่อเดือน
const LAND_TAX_FLAT = 800; // ภาษีที่ดิน+ป้ายรายปี (ร้านเล็กในที่เช่า)
const VAT_THRESHOLD = 1_800_000; // รายได้สะสมต่อปีที่ต้องจดทะเบียน VAT
const ZONE_BASE_DEMAND = 90; // ลูกค้าศักยภาพทั้งโซนต่อ tick ที่ demandMultiplier=1 — ผู้เล่นกับคู่แข่งแย่งกันจากพูลนี้

// อัตราภาษีเงินได้บุคคลธรรมดาแบบขั้นบันได (โครงสร้างจริงของไทย)
const PIT_BRACKETS = [
  [150000, 0],
  [300000, 0.05],
  [500000, 0.1],
  [750000, 0.15],
  [1000000, 0.2],
  [2000000, 0.25],
  [5000000, 0.3],
  [Infinity, 0.35],
];
function personalIncomeTax(annualProfit) {
  if (annualProfit <= 0) return 0;
  let tax = 0;
  let prevCap = 0;
  for (const [cap, rate] of PIT_BRACKETS) {
    if (annualProfit <= prevCap) break;
    tax += (Math.min(annualProfit, cap) - prevCap) * rate;
    prevCap = cap;
  }
  return tax;
}

// ---------- นาฬิกาไทยจริง (ต้องมาก่อน state เพราะ defaultState() เรียก bangkokDateKey) ----------
const dateFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short", year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });
const dateKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });

function bangkokNow() {
  return new Date();
}

function bangkokHourFraction(d) {
  const [h, m] = hourFmt.format(d).split(":").map(Number);
  return h + m / 60;
}

function bangkokDateKey(d) {
  return dateKeyFmt.format(d);
}

function isDaytime(now) {
  return bangkokHourFraction(now) >= 6 && bangkokHourFraction(now) < 18;
}

function defaultState() {
  const now = Date.now();
  return {
    cash: 45000,
    debt: 0,
    energy: 68,
    reputation: 34,
    lastRestDay: null,
    lastNetworkDay: null,
    activePanel: "map",
    news: [
      "ราคาหมูขึ้น 6% ผลจากต้นทุนอาหารสัตว์",
      "ธปท. คงอัตราดอกเบี้ยนโยบายที่ 2.25%",
      "สงกรานต์เหลืออีก 30 วัน — เตรียมสต๊อกสายท่องเที่ยว",
      "เงินเดือนออกสิ้นเดือนนี้ กำลังซื้อคาดขยับขึ้น 18%",
    ],
    business: {
      name: "ร้านหมูปิ้งศรีราชา",
      openedAt: now,
      price: 15, // บาท/ไม้
      costPerUnit: 7, // ต้นทุนวัตถุดิบ/ไม้
      stock: 60, // ไม้พร้อมขาย
      staff: 1,
      staffWage: 350, // บาท/คน/วัน
      reputation: 62,
      adBoostUntil: 0,
      permitExpiresAt: now + 14 * 24 * 60 * 60 * 1000,
      currentDay: bangkokDateKey(new Date(now)),
      dailyRevenue: 0,
      dailyCost: 0,
      customersToday: 0,
      salesHistory: [], // { t, profit } ล่าสุด 30 tick
      lastTickAt: now,
      // ---- เฟส 4: การเงินและภาษี ----
      currentMonth: bangkokDateKey(new Date(now)).slice(0, 7),
      currentYear: bangkokDateKey(new Date(now)).slice(0, 4),
      monthRevenue: 0,
      monthCost: 0,
      monthWage: 0,
      annualRevenue: 0,
      annualProfit: 0,
      taxPaidThisYear: 0,
      vatRegistered: false,
      lastMonthSummary: null, // { revenue, cost, wage, ss, netProfit }
      lastYearSummary: null, // { profit, tax, landTax }
      salesEma: 0, // ยอดขาย/tick เฉลี่ยแบบเรียบ ใช้คำนวณส่วนแบ่งตลาด
    },
    npcs: [
      {
        id: "chain",
        name: "เชนสะดวกซื้อหมูปิ้ง",
        style: "chain",
        price: 14,
        reputation: 70,
        capacity: 18, // ใหญ่กว่าร้านผู้เล่นมาก มีหลายจุดขาย
        costPerUnit: 6,
        cash: 500000,
        dailyOverhead: 900,
        closed: false,
        closedAt: null,
        salesEma: 0,
      },
      {
        id: "legacy",
        name: "ป้าติ๋มหมูปิ้งเจ้าเก่า",
        style: "legacy",
        price: 18,
        reputation: 80,
        capacity: 7,
        costPerUnit: 7,
        cash: 60000,
        dailyOverhead: 250,
        closed: false,
        closedAt: null,
        salesEma: 0,
      },
      {
        id: "startup",
        name: "หมูปิ้งฟิวชั่นสตาร์ทอัพ",
        style: "startup",
        price: 11,
        reputation: 35,
        capacity: 10,
        costPerUnit: 8,
        cash: 150000,
        dailyOverhead: 1200, // เผาเงินกับการตลาด
        closed: false,
        closedAt: null,
        salesEma: 0,
      },
    ],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const saved = JSON.parse(raw);
    const base = defaultState();
    return { ...base, ...saved, business: { ...base.business, ...saved.business } };
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage ใช้ไม่ได้ (private mode ฯลฯ) — เล่นต่อได้แค่ไม่เซฟ */
  }
}

const state = loadState();

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

  // ข้าม tick 15 นาทีจริงเมื่อไหร่ ให้ธุรกิจขายจริงตาม hourFmt.format(now) เทียบกับ tick ล่าสุด
  const bucket = Math.floor(now.getTime() / TICK_MS);
  const lastBucket = Math.floor(state.business.lastTickAt / TICK_MS);
  if (bucket > lastBucket) runBusinessTicks(now.getTime());
}

// ---------- เครื่องยนต์ธุรกิจ: ขายจริงทุก tick 15 นาที ----------
// ช่วงพีคอิงตารางหมวด 02 ของคอนเซปต์ (ตลาดเช้า/พีคเช้า/เที่ยง/เย็น/กลางคืนแทบปิด)
function demandMultiplier(hourFraction) {
  if (hourFraction >= 6 && hourFraction < 9) return 1.5; // พีคเช้า
  if (hourFraction >= 11 && hourFraction < 13.5) return 1.8; // พีคเที่ยง
  if (hourFraction >= 17 && hourFraction < 20) return 2.0; // พีคเย็น
  if (hourFraction >= 20 && hourFraction < 24) return 0.6; // กลางคืนต้น
  if (hourFraction >= 0 && hourFraction < 4) return 0; // ปิดร้าน
  return 0.9; // ช่วงเบา (สาย/บ่าย)
}

// พลังงานต่ำกว่า 30 = ประสิทธิภาพลด (หมวด 09) — ต่ำสุดเหลือ 55%
function energyEfficiency() {
  return state.energy >= 30 ? 1 : clamp(0.55 + (state.energy / 30) * 0.45, 0.55, 1);
}

function priceElasticity(price) {
  // ราคายิ่งสูง ดีมานด์ยิ่งลด เป็นเส้นตรงหยาบๆ ครอบ 8–30 บาท
  return clamp(1.7 - price / 22, 0.25, 1.7);
}

// จำลอง 1 tick (15 นาที) ที่เวลา `atMs` — ใช้ทั้ง live tick และ catch-up ย้อนหลัง
function simulateOneTick(atMs) {
  const biz = state.business;
  const d = new Date(atMs);
  const dayKey = bangkokDateKey(d);

  if (dayKey !== biz.currentDay) {
    // ข้ามวัน: หักค่าแรงพนักงานของวันก่อน พับยอดวันเข้าเดือน แล้วรีเซ็ตยอดวันใหม่
    const wageCost = biz.staff * biz.staffWage;
    state.cash -= wageCost;
    biz.monthRevenue += biz.dailyRevenue;
    biz.monthCost += biz.dailyCost;
    biz.monthWage += wageCost;
    biz.dailyRevenue = 0;
    biz.dailyCost = 0;
    biz.customersToday = 0;
    biz.currentDay = dayKey;

    runNpcDailyUpkeep(biz, atMs);

    // ชีวิตส่วนตัว: บริหารร้านเองกินพลังงานทุกวัน จ้างคนช่วยได้เยอะยิ่งเหนื่อยน้อยลง (หมวด 09)
    state.energy = clamp(state.energy - Math.max(4, 14 - biz.staff * 3), 0, 100);
    // ชื่อเสียงผู้เล่นโตช้าๆ ตามชื่อเสียงร้าน แต่ตกถ้าปล่อยให้ของหมดทั้งวัน
    state.reputation = clamp(state.reputation + (biz.stock > 0 ? 0.4 : -1.5), 0, 100);
    // ใบอนุญาตหมดอายุ = ชื่อเสียงร้านตกจนกว่าจะต่ออายุ
    if (atMs > biz.permitExpiresAt) biz.reputation = clamp(biz.reputation - 1.5, 10, 100);

    const monthKey = dayKey.slice(0, 7);
    if (monthKey !== biz.currentMonth) {
      // ข้ามเดือน: หักประกันสังคมฝั่งนายจ้าง (5% ของค่าแรงเดือนนี้ เพดานคนละ 750) พับกำไรเข้ายอดปี
      const ssCost = biz.staff > 0 ? Math.min(biz.monthWage * SS_RATE, biz.staff * SS_CAP_PER_STAFF) : 0;
      state.cash -= ssCost;
      const netProfit = biz.monthRevenue - biz.monthCost - biz.monthWage - ssCost;
      biz.lastMonthSummary = { revenue: biz.monthRevenue, cost: biz.monthCost, wage: biz.monthWage, ss: ssCost, netProfit };
      biz.annualProfit += netProfit;
      biz.annualRevenue += biz.monthRevenue;
      if (!biz.vatRegistered && biz.annualRevenue > VAT_THRESHOLD) {
        biz.vatRegistered = true;
        state.news.unshift(`${biz.name} มีรายได้เกิน ฿1.8 ล้าน/ปี — ต้องจดทะเบียน VAT แล้ว`);
      }
      biz.monthRevenue = 0;
      biz.monthCost = 0;
      biz.monthWage = 0;
      biz.currentMonth = monthKey;

      const yearKey = dayKey.slice(0, 4);
      if (yearKey !== biz.currentYear) {
        // ข้ามปี: ยื่นภาษีเงินได้บุคคลธรรมดาจริงจากกำไรสะสมทั้งปี หักส่วนที่จ่ายล่วงหน้าไปแล้ว + ภาษีที่ดิน/ป้าย
        const taxOwed = Math.max(0, personalIncomeTax(biz.annualProfit) - biz.taxPaidThisYear);
        state.cash -= taxOwed + LAND_TAX_FLAT;
        biz.lastYearSummary = { profit: biz.annualProfit, tax: taxOwed, landTax: LAND_TAX_FLAT };
        biz.annualProfit = 0;
        biz.annualRevenue = 0;
        biz.taxPaidThisYear = 0;
        biz.currentYear = yearKey;
      }
    }
  }

  const hourFraction = bangkokHourFraction(d);
  const adBoost = atMs < biz.adBoostUntil ? 1.4 : 1;

  // ---- ตลาดรวมของโซน: ผู้เล่นกับคู่แข่งแย่งลูกค้ากลุ่มเดียวกันตามความน่าดึงดูด (ราคา×ชื่อเสียง×ขนาดร้าน) ----
  const activeNpcs = state.npcs.filter((n) => !n.closed);
  const entities = [
    { ref: biz, isPlayer: true, price: biz.price, reputation: biz.reputation, capacity: 6 * biz.staff * adBoost * energyEfficiency(), stock: biz.stock, costPerUnit: biz.costPerUnit },
    ...activeNpcs.map((n) => ({ ref: n, isPlayer: false, price: n.price, reputation: n.reputation, capacity: n.capacity, stock: Infinity, costPerUnit: n.costPerUnit })),
  ];
  const weights = entities.map((e) => priceElasticity(e.price) * (e.reputation / 100) * e.capacity);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const totalDemand = ZONE_BASE_DEMAND * demandMultiplier(hourFraction);

  entities.forEach((e, i) => {
    const share = totalDemand * (weights[i] / totalWeight);
    const sold = Math.max(0, Math.min(Math.round(share), e.capacity, e.stock));
    e.ref.salesEma = e.ref.salesEma * 0.98 + sold * 0.02; // ใช้แสดงส่วนแบ่งตลาดแบบเรียบ

    if (sold <= 0) return;
    const revenue = sold * e.price;
    const cost = sold * e.costPerUnit;
    if (e.isPlayer) {
      biz.stock -= sold;
      state.cash += revenue - cost;
      biz.dailyRevenue += revenue;
      biz.dailyCost += cost;
      biz.customersToday += sold;
      biz.salesHistory.push({ t: atMs, profit: revenue - cost });
      if (biz.salesHistory.length > 30) biz.salesHistory.shift();
    } else {
      e.ref.cash += revenue - cost;
    }
  });

  biz.lastTickAt = atMs;
}

// พฤติกรรมคู่แข่งแต่ละบุคลิก ปรับวันละครั้งตอนข้ามวัน — เช่นเดียวกับผู้เล่น NPC หักค่าใช้จ่ายจริงและล้มละลายได้จริง (หมวด 08)
function runNpcDailyUpkeep(biz, atMs) {
  state.npcs.forEach((n) => {
    if (n.closed) return;
    n.cash -= n.dailyOverhead;

    if (n.style === "chain") {
      // เชนทุนใหญ่ตัดราคาตามผู้เล่นเสมอ กดราคาต่ำกว่า 1 บาท
      n.price = clamp(biz.price - 1, 8, 16);
    } else if (n.style === "legacy") {
      // เจ้าถิ่นเก่าแก่ไม่ลดราคา ชื่อเสียงค่อยๆ ฟื้นกลับ
      n.reputation = clamp(n.reputation + 0.1, 0, 85);
    } else if (n.style === "startup") {
      // สตาร์ทอัพเผาเงินแลกส่วนแบ่ง ลดราคาเรื่อยๆ ชื่อเสียงขึ้นเร็วจากการตลาด
      n.price = clamp(n.price - 0.3, 8, 20);
      n.reputation = clamp(n.reputation + 0.5, 0, 60);
    }

    if (n.cash <= 0 && !n.closed) {
      n.closed = true;
      n.closedAt = atMs;
      state.news.unshift(`${n.name} ปิดกิจการแล้ว — เงินทุนหมด`);
    }
  });
}

// รัน tick ทั้งหมดตั้งแต่ lastTickAt จนถึง untilMs (ใช้ทั้ง live และคำนวณย้อนหลังตอนกลับมา)
function runBusinessTicks(untilMs) {
  const biz = state.business;
  const startMs = Math.max(biz.lastTickAt, untilMs - MAX_CATCHUP_MS); // เพดานย้อนหลัง 72 ชม.
  let cursor = Math.floor(startMs / TICK_MS) * TICK_MS + TICK_MS;
  let ticksRun = 0;
  const before = { cash: state.cash, customers: biz.customersToday };
  while (cursor <= untilMs && ticksRun < 288) {
    simulateOneTick(cursor);
    cursor += TICK_MS;
    ticksRun++;
  }
  biz.lastTickAt = untilMs;
  saveState();
  if (state.activePanel === "business") renderPanel();
  renderTopbar();
  return { ticksRun, cashDelta: state.cash - before.cash, unitsDelta: biz.customersToday - before.customers };
}

function computeNetWorth() {
  return state.cash - state.debt + state.business.stock * state.business.costPerUnit;
}

// ---------- แถบบน ----------
function renderTopbar() {
  $("netWorth").textContent = fmtMoney(computeNetWorth());
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
  business: () => {
    const biz = state.business;
    const daysOpen = Math.max(0, Math.floor((Date.now() - biz.openedAt) / 86400000));
    const daysLeft = Math.ceil((biz.permitExpiresAt - Date.now()) / 86400000);
    const profitToday = biz.dailyRevenue - biz.dailyCost;
    const profitCls = profitToday >= 0 ? "" : `style="color:var(--red)"`;
    const orderQty = 40;
    const orderCost = orderQty * biz.costPerUnit;
    const hireCost = 2000 + biz.staff * 1500;
    const adCost = 300;
    const adActive = Date.now() < biz.adBoostUntil;
    return `
    <div>
      <h2>${biz.name}</h2>
      <p class="sub">เปิดมา ${fmtNum(daysOpen)} วัน · พนักงาน ${biz.staff} คน · ราคาไม้ละ ${fmtMoney(biz.price)}</p>
    </div>
    <div class="kpi-row">
      <div class="kpi"><span>กำไรวันนี้</span><b ${profitCls}>${profitToday >= 0 ? "" : "-"}${fmtMoney(Math.abs(profitToday))}</b></div>
      <div class="kpi"><span>ลูกค้าวันนี้</span><b>${fmtNum(biz.customersToday)}</b></div>
      <div class="kpi"><span>สต๊อก</span><b>${fmtNum(biz.stock)} ไม้</b></div>
    </div>
    <div class="action-grid">
      <button class="action-btn" data-biz="priceDown">ลดราคา −1 (฿${biz.price - 1})</button>
      <button class="action-btn" data-biz="priceUp">ขึ้นราคา +1 (฿${biz.price + 1})</button>
      <button class="action-btn primary" data-biz="order" ${state.cash < orderCost ? "disabled" : ""}>สั่งวัตถุดิบ +${orderQty} ไม้ · ${fmtMoney(orderCost)}</button>
      <button class="action-btn" data-biz="hire" ${state.cash < hireCost ? "disabled" : ""}>จ้างพนักงาน +1 · ${fmtMoney(hireCost)}</button>
      <button class="action-btn" data-biz="ad" ${adActive || state.cash < adCost ? "disabled" : ""}>${adActive ? "โฆษณากำลังทำงาน" : `โฆษณาท้องถิ่น 3 ชม. · ${fmtMoney(adCost)}`}</button>
    </div>
    <div class="warn-box">${daysLeft > 0 ? `ใบอนุญาตจำหน่ายอาหาร เหลือ ${daysLeft} วัน` : "ใบอนุญาตหมดอายุแล้ว — ต้องต่ออายุก่อนขายต่อ"}</div>
    <p class="placeholder">รายรับวันนี้ ${fmtMoney(biz.dailyRevenue)} · ต้นทุน ${fmtMoney(biz.dailyCost)} · ค่าแรงพนักงาน ${fmtMoney(biz.staff * biz.staffWage)}/วัน หักตอนขึ้นวันใหม่</p>
  `;
  },
  finance: () => {
    const biz = state.business;
    const runningProfit = biz.monthRevenue - biz.monthCost - biz.monthWage;
    const margin = biz.monthRevenue > 0 ? ((runningProfit / biz.monthRevenue) * 100).toFixed(1) : "0.0";
    const lm = biz.lastMonthSummary;
    const accruedTax = Math.max(0, personalIncomeTax(biz.annualProfit) - biz.taxPaidThisYear);
    const ssEstimate = biz.staff > 0 ? Math.min(biz.monthWage * SS_RATE, biz.staff * SS_CAP_PER_STAFF) : 0;
    return `
    <div>
      <h2>การเงิน · เดือนนี้ (${biz.currentMonth})</h2>
      <p class="sub">กำไรสะสมเดือนนี้ ${fmtMoney(runningProfit)} · อัตรากำไร ${margin}%</p>
    </div>
    <div class="kpi-row">
      <div class="kpi"><span>รายได้เดือนนี้</span><b style="font-size:13px">${fmtMoney(biz.monthRevenue)}</b></div>
      <div class="kpi"><span>ต้นทุน+ค่าแรง</span><b style="font-size:13px">${fmtMoney(biz.monthCost + biz.monthWage)}</b></div>
      <div class="kpi"><span>เงินสด</span><b style="font-size:13px">${fmtMoney(state.cash)}</b></div>
    </div>
    ${lm ? `<p class="placeholder">เดือนที่แล้ว: รายได้ ${fmtMoney(lm.revenue)} · กำไรสุทธิ ${fmtMoney(lm.netProfit)} (หลังหักประกันสังคม ${fmtMoney(lm.ss)})</p>`
         : `<p class="placeholder">ยังไม่ครบเดือนแรก — ยอดจะสรุปตอนขึ้นเดือนใหม่</p>`}
    <div class="warn-box">ภาษีเงินได้บุคคลธรรมดา (ขั้นบันได) สะสมปีนี้ราว ${fmtMoney(accruedTax)} · หักอัตโนมัติสิ้นปี</div>
    ${biz.staff > 0 ? `<div class="warn-box">ประกันสังคม (นายจ้าง 5%) ประมาณ ${fmtMoney(ssEstimate)} · หักตอนขึ้นเดือนใหม่</div>` : ""}
    <div class="warn-box">ภาษีที่ดิน+ป้าย ${fmtMoney(LAND_TAX_FLAT)}/ปี · หักพร้อมภาษีสิ้นปี</div>
    <p class="placeholder">${biz.vatRegistered ? "จดทะเบียน VAT แล้ว (รายได้เกิน ฿1.8M/ปี)" : `ยังไม่ต้องจด VAT · รายได้สะสมปีนี้ ${fmtMoney(biz.annualRevenue + biz.monthRevenue)} จากเกณฑ์ ${fmtMoney(VAT_THRESHOLD)}`}</p>
    <div class="action-grid">
      <button class="action-btn primary" data-biz="prepayTax" ${accruedTax <= 0 || state.cash < accruedTax ? "disabled" : ""}>จ่ายภาษีล่วงหน้า ${fmtMoney(accruedTax)}</button>
    </div>
  `;
  },
  market: () => {
    const biz = state.business;
    const rows = [
      { name: `${biz.name} (คุณ)`, ema: biz.salesEma, price: biz.price, reputation: biz.reputation, you: true, closed: false },
      ...state.npcs.map((n) => ({ name: n.name, ema: n.salesEma, price: n.price, reputation: Math.round(n.reputation), you: false, closed: n.closed })),
    ];
    const totalEma = rows.reduce((s, r) => s + (r.closed ? 0 : r.ema), 0) || 1;
    const ranked = rows
      .map((r) => ({ ...r, share: r.closed ? 0 : (r.ema / totalEma) * 100 }))
      .sort((a, b) => b.share - a.share);
    const rank = ranked.findIndex((r) => r.you) + 1;
    const rowsHtml = ranked
      .map(
        (r, i) => `
      <div class="kpi" style="grid-column:span 3;display:flex;justify-content:space-between;align-items:center;text-align:left;${r.you ? "border-color:var(--amber)" : ""}">
        <span>${i + 1}. ${r.name}${r.closed ? " · ปิดกิจการแล้ว" : ""}</span>
        <b style="font-size:14px;${r.you ? "color:var(--amber)" : ""}">${r.closed ? "—" : r.share.toFixed(1) + "%"}</b>
      </div>`
      )
      .join("");
    return `
    <div>
      <h2>ส่วนแบ่งตลาด · ศรีราชา</h2>
      <p class="sub">อันดับ ${rank} จาก ${ranked.length} ร้านในโซนเดียวกัน (คำนวณจากยอดขายเฉลี่ยล่าสุด)</p>
    </div>
    <div class="kpi-row" style="grid-template-columns:1fr;gap:8px">${rowsHtml}</div>
    <p class="placeholder">ราคาไม้ละ: คุณ ${fmtMoney(biz.price)} · ${state.npcs.filter((n) => !n.closed).map((n) => `${n.name} ${fmtMoney(n.price)}`).join(" · ")}</p>
  `;
  },
  people: () => {
    const biz = state.business;
    const hireCost = 2000 + biz.staff * 1500;
    const dailyWage = biz.staff * biz.staffWage;
    const netDrain = biz.staff > 0 ? Math.max(4, 14 - biz.staff * 3) : 14;
    const canFire = biz.staff > 0;
    return `
    <div>
      <h2>ผู้คน</h2>
      <p class="sub">พนักงาน ${biz.staff} คน · ค่าแรงรวม ${fmtMoney(dailyWage)}/วัน</p>
    </div>
    <div class="kpi-row">
      <div class="kpi"><span>กำลังผลิต</span><b>${fmtNum(6 * biz.staff)} ไม้/tick</b></div>
      <div class="kpi"><span>ค่าแรง/คน</span><b style="font-size:13px">${fmtMoney(biz.staffWage)}</b></div>
      <div class="kpi"><span>พลังงานที่เสีย</span><b>−${netDrain}/วัน</b></div>
    </div>
    <p class="placeholder">ยิ่งมีพนักงานมาก ยิ่งแบ่งเบาแรงคุณ (พลังงานลดน้อยลง) และเพิ่มกำลังขายต่อ tick แต่ค่าแรงกับประกันสังคมก็สูงตาม</p>
    <div class="action-grid">
      <button class="action-btn primary" data-biz="hire" ${state.cash < hireCost ? "disabled" : ""}>จ้างเพิ่ม +1 · ${fmtMoney(hireCost)}</button>
      <button class="action-btn" data-biz="fire" ${canFire ? "" : "disabled"}>ให้ออก 1 คน</button>
    </div>
  `;
  },
  gov: () => {
    const biz = state.business;
    const daysLeft = Math.ceil((biz.permitExpiresAt - Date.now()) / 86400000);
    const expired = daysLeft <= 0;
    const renewCost = 1500;
    const accruedTax = Math.max(0, personalIncomeTax(biz.annualProfit) - biz.taxPaidThisYear);
    return `
    <div>
      <h2>ราชการ</h2>
      <p class="sub">ใบอนุญาต 1 รายการ · ภาษีค้างประเมิน ${fmtMoney(accruedTax)}</p>
    </div>
    <div class="warn-box">${expired
      ? `ใบอนุญาตจำหน่ายอาหาร <strong>หมดอายุแล้ว</strong> — ชื่อเสียงร้านลดลงทุกวันจนกว่าจะต่ออายุ`
      : `ใบอนุญาตจำหน่ายอาหาร เหลือ ${daysLeft} วัน`}</div>
    <div class="warn-box">${biz.vatRegistered
      ? "จดทะเบียน VAT แล้ว · ต้องยื่น ภ.พ.30 ทุกเดือน"
      : `ยังไม่ถึงเกณฑ์ VAT (รายได้ปีนี้ ${fmtMoney(biz.annualRevenue + biz.monthRevenue)} / ${fmtMoney(VAT_THRESHOLD)})`}</div>
    ${biz.staff > 0 ? `<div class="warn-box">ขึ้นทะเบียนประกันสังคมพนักงาน ${biz.staff} คน · นายจ้างสมทบ 5%</div>` : ""}
    <div class="action-grid">
      <button class="action-btn primary" data-biz="renewPermit" ${state.cash < renewCost ? "disabled" : ""}>ต่อใบอนุญาต 1 ปี · ${fmtMoney(renewCost)}</button>
      <button class="action-btn" data-biz="prepayTax" ${accruedTax <= 0 || state.cash < accruedTax ? "disabled" : ""}>ยื่นภาษีล่วงหน้า</button>
    </div>
  `;
  },
  life: () => {
    const today = bangkokDateKey(new Date());
    const restedToday = state.lastRestDay === today;
    const networkedToday = state.lastNetworkDay === today;
    const lowEnergy = state.energy < 30;
    const eff = Math.round(energyEfficiency() * 100);
    return `
    <div>
      <h2>ชีวิตส่วนตัว</h2>
      <p class="sub">พลังงาน ${Math.round(state.energy)}/100 · ชื่อเสียง ${Math.round(state.reputation)}/100</p>
    </div>
    <div class="kpi-row">
      <div class="kpi"><span>ประสิทธิภาพ</span><b style="${lowEnergy ? "color:var(--red)" : ""}">${eff}%</b></div>
      <div class="kpi"><span>พักผ่อนวันนี้</span><b style="font-size:13px">${restedToday ? "แล้ว" : "ยัง"}</b></div>
      <div class="kpi"><span>เข้าสังคมวันนี้</span><b style="font-size:13px">${networkedToday ? "แล้ว" : "ยัง"}</b></div>
    </div>
    ${lowEnergy ? `<div class="warn-box">พลังงานต่ำกว่า 30 — กำลังขายเหลือ ${eff}% ควรพักผ่อน</div>` : ""}
    <p class="placeholder">พลังงานลดทุกวันจากการบริหารร้านเอง จ้างพนักงานเพิ่มช่วยลดภาระได้ · ชื่อเสียงเพิ่มเมื่อของไม่ขาด และตกเมื่อปล่อยให้ของหมด</p>
    <div class="action-grid">
      <button class="action-btn primary" data-biz="rest" ${restedToday ? "disabled" : ""}>${restedToday ? "พักผ่อนแล้ววันนี้" : "พักผ่อน +25 พลังงาน"}</button>
      <button class="action-btn" data-biz="network" ${networkedToday || state.cash < 500 ? "disabled" : ""}>${networkedToday ? "เข้าสังคมแล้ววันนี้" : "เลี้ยงรับรอง ฿500 · +3 ชื่อเสียง"}</button>
    </div>
  `;
  },
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

// ---------- ปุ่มสั่งการในแผงธุรกิจ (event delegation เพราะ innerHTML ถูกวาดใหม่ทุกครั้ง) ----------
const bizActions = {
  order() {
    const biz = state.business;
    const qty = 40;
    const cost = qty * biz.costPerUnit;
    if (state.cash < cost) return;
    state.cash -= cost;
    biz.stock += qty;
    afterBizAction();
  },
  hire() {
    const biz = state.business;
    const cost = 2000 + biz.staff * 1500;
    if (state.cash < cost) return;
    state.cash -= cost;
    biz.staff += 1;
    afterBizAction();
  },
  ad() {
    const biz = state.business;
    const cost = 300;
    if (state.cash < cost || Date.now() < biz.adBoostUntil) return;
    state.cash -= cost;
    biz.adBoostUntil = Date.now() + 3 * 60 * 60 * 1000;
    afterBizAction();
  },
  priceUp() {
    state.business.price = clamp(state.business.price + 1, 8, 30);
    afterBizAction();
  },
  priceDown() {
    state.business.price = clamp(state.business.price - 1, 8, 30);
    afterBizAction();
  },
  prepayTax() {
    const biz = state.business;
    const owed = Math.max(0, personalIncomeTax(biz.annualProfit) - biz.taxPaidThisYear);
    const pay = Math.min(owed, state.cash);
    if (pay <= 0) return;
    state.cash -= pay;
    biz.taxPaidThisYear += pay;
    afterBizAction();
  },
  fire() {
    const biz = state.business;
    if (biz.staff <= 0) return;
    biz.staff -= 1;
    state.cash -= biz.staffWage * 3; // ชดเชยเลิกจ้าง 3 วัน
    afterBizAction();
  },
  renewPermit() {
    const biz = state.business;
    const cost = 1500;
    if (state.cash < cost) return;
    state.cash -= cost;
    // ต่อจากวันหมดอายุเดิมถ้ายังไม่หมด ไม่งั้นนับจากวันนี้
    const base = Math.max(Date.now(), biz.permitExpiresAt);
    biz.permitExpiresAt = base + 365 * 24 * 60 * 60 * 1000;
    afterBizAction();
  },
  rest() {
    const today = bangkokDateKey(new Date());
    if (state.lastRestDay === today) return;
    state.energy = clamp(state.energy + 25, 0, 100);
    state.lastRestDay = today;
    afterBizAction();
  },
  network() {
    const today = bangkokDateKey(new Date());
    if (state.lastNetworkDay === today || state.cash < 500) return;
    state.cash -= 500;
    state.reputation = clamp(state.reputation + 3, 0, 100);
    state.business.reputation = clamp(state.business.reputation + 1, 0, 100);
    state.lastNetworkDay = today;
    afterBizAction();
  },
};

function afterBizAction() {
  saveState();
  renderTopbar();
  renderPanel();
}

$("panel").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-biz]");
  if (!btn || btn.disabled) return;
  bizActions[btn.dataset.biz]?.();
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
// คำนวณย้อนหลังตั้งแต่ครั้งก่อนที่ปิดแอปไป ก่อนวาดหน้าจอครั้งแรก (หมวด 02 · สรุปตอนคุณไม่อยู่)
const awayMs = Date.now() - state.business.lastTickAt;
const catchUp = runBusinessTicks(Date.now());

renderTopbar();
renderPanel();
renderNews();
tickClock();
setInterval(tickClock, 1000);
setInterval(renderNews, 6000);
[$("mapCountry"), $("mapProvince"), $("mapDistrict")].forEach(attachPanZoom);
setMapLevel("country");
renderCountryMap();

if (awayMs > 30 * 60 * 1000 && catchUp.ticksRun > 0) {
  const hrs = (awayMs / 3600000).toFixed(1);
  const sign = catchUp.cashDelta >= 0 ? "+" : "-";
  state.news.unshift(
    `ระหว่างที่คุณไม่อยู่ ${hrs} ชม. — ร้านขายได้ ${fmtNum(catchUp.unitsDelta)} ไม้ กำไรสะสม ${sign}${fmtMoney(Math.abs(catchUp.cashDelta))}`
  );
  newsIndex = 0; // โชว์แบนเนอร์นี้ทันทีเป็นอันแรก ไม่ใช่รอคิวเดิม
  renderNews();
}

$("reportBtn").addEventListener("click", () => {
  const biz = state.business;
  const profitToday = biz.dailyRevenue - biz.dailyCost;
  alert(
    `รายงานสด\n\nทรัพย์สินสุทธิ ${fmtMoney(computeNetWorth())}\nเงินสด ${fmtMoney(state.cash)}\nพลังงาน ${state.energy}/100 · ชื่อเสียง ${state.reputation}/100\n\nร้าน: กำไรวันนี้ ${fmtMoney(profitToday)} · สต๊อก ${fmtNum(biz.stock)} ไม้ · ลูกค้า ${fmtNum(biz.customersToday)}`
  );
});
$("clockChip").addEventListener("click", () => $("reportBtn").click());
