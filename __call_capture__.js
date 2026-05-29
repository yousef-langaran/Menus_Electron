/**
 * TK-202UH Caller ID Capture Test — 80-byte Feature Report
 *
 * This test requests the FULL 80-byte record (not truncated 32).
 *
 * Known record types (idle state):
 *   ~OK TILDA KISH\nHP...   — rotating status counter (noise, ignored)
 *   L1:On-hook ...          — line idle
 *   L2:Off-hook ...         — line off-hook
 *
 * What we're looking for during a call:
 *   L1:RingsCount:XX        — ringing! (XX = ring count)
 *   L1:ID:XXXXXXXXXX        — caller number (expected)
 *   L1:Missed Call!         — missed call event
 */

const usb = require("usb");
const fs  = require("fs");

const LOG = "d:\\Project\\MyProject\\Menus\\Menus_Electron\\call_capture.log";
fs.writeFileSync(LOG, "=== CALL CAPTURE START ===\n");

const log = (msg) => {
  const line = new Date().toISOString().slice(11,19) + " " + msg;
  fs.appendFileSync(LOG, line + "\n");
  process.stdout.write(line + "\n");
};

const toAscii = (buf) =>
  Array.from(buf).map(x => x >= 32 && x < 127 ? String.fromCharCode(x) : (x === 10 ? "↵" : (x === 0 ? "·" : "░"))).join("");

// ─── open device ─────────────────────────────────────────────────────────────
const device = usb.findByIds(0x16C0, 0x05DA);
if (!device) { log("ERROR: دستگاه T-LINE یافت نشد (VID=16C0 PID=05DA)"); process.exit(1); }
device.open();
const iface = device.interface(0);
try { iface.claim(); } catch(e) { log("WARN claim: " + e.message); }
log("✅ دستگاه باز شد — " + (device.deviceDescriptor ? "OK" : "?"));

// ─── GET_REPORT helper ────────────────────────────────────────────────────────
// bmRequestType=0xA1 (Host→Device, Class, Interface)
// bRequest=0x01 (GET_REPORT)
// wValue high byte: 1=Input, 2=Output, 3=Feature
// wValue low byte:  report ID (0 = first/only)
const getFeatureReport = (wValue, len) => new Promise(res => {
  device.controlTransfer(0xA1, 0x01, wValue, 0, len, (err, data) => {
    if (err) { res({ err: err.message, data: null }); }
    else     { res({ err: null, data: Buffer.from(data) }); }
  });
});

// ─── record categoriser ──────────────────────────────────────────────────────
const KNOWN_NOISE = ["~OK TILDA KISH", "L1:On-hook", "L2:Off-hook"];
const seen = new Set();   // set of first-line strings already printed

function categorise(buf) {
  const ascii = buf.toString("ascii");
  const firstLine = ascii.split("\n")[0].trim();
  return { ascii, firstLine };
}

function isNoise(firstLine) {
  return KNOWN_NOISE.some(n => firstLine.startsWith(n));
}

// ─── main polling loop ────────────────────────────────────────────────────────
let pollCount = 0;
let interestingCount = 0;
let lastInterestingHex = "";

log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
log("🔔  آماده — همین الان زنگ بزن و منتظر بمان تا جواب ندی");
log("    اسکریپت ۵ دقیقه اجرا میشه (300 ثانیه)");
log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// Try both wValue=0x0300 (Feature, ID=0) AND wValue=0x0100 (Input, ID=0)
// since the device returns data on both — use the same wValue combos
// that worked in __hid_class__.js tests
const WVALUES = [
  { wv: 0x0100, label: "Input/0" },
  { wv: 0x0300, label: "Feat/0"  },
  { wv: 0x0101, label: "Input/1" },
  { wv: 0x0301, label: "Feat/1"  },
];

const timer = setInterval(async () => {
  pollCount++;

  for (const { wv, label } of WVALUES) {
    const { err, data } = await getFeatureReport(wv, 80);
    if (err || !data || data.length === 0) continue;

    const { ascii, firstLine } = categorise(data);
    const hexKey = data.toString("hex");

    if (isNoise(firstLine)) continue; // skip known idle records

    // NEW interesting record ─ show it loud
    if (hexKey !== lastInterestingHex) {
      lastInterestingHex = hexKey;
      interestingCount++;

      log("┌─────────────────────────────────────────────────────────");
      log(`│ 🚨 NEW RECORD #${interestingCount}  [${label}]  poll=${pollCount}`);
      log(`│ firstLine : ${firstLine}`);
      log(`│ ascii(80) : ${toAscii(data)}`);
      log(`│ hex(80)   : ${data.toString("hex")}`);

      // Try to extract a phone number pattern
      const phoneMatch = ascii.match(/\b(0\d{9,10})\b/);
      if (phoneMatch) {
        log(`│ 📞 PHONE   : ${phoneMatch[1]}`);
      }
      // Also check for Iranian landline / mobile patterns without leading 0
      const numMatch = ascii.match(/\b(\d{10,11})\b/);
      if (numMatch && !phoneMatch) {
        log(`│ 🔢 NUMBER  : ${numMatch[1]}`);
      }

      log("└─────────────────────────────────────────────────────────");
    }
  }

  // Every 30s print a heartbeat
  if (pollCount % 150 === 0) {
    log(`⏱  هنوز در حال پایش... (${pollCount} poll, ${interestingCount} رکورد جدید)`);
  }
}, 200); // poll every 200ms

// ─── also listen to interrupt endpoint ───────────────────────────────────────
const ep = iface.endpoints.find(e => e.direction === "in");
if (ep) {
  ep.startPoll(4, 8);
  ep.on("data", d => {
    if (d.every(b => b === 0)) return;
    log(`⚡ INTERRUPT: hex=${Buffer.from(d).toString("hex")}  dec=[${Array.from(d).join(",")}]`);
  });
  ep.on("error", e => log("EP_ERR: " + e.message));
}

// ─── stop after 5 min ────────────────────────────────────────────────────────
setTimeout(() => {
  clearInterval(timer);
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log(`✅ پایان — ${interestingCount} رکورد جدید در ${pollCount} بار پول`);
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (ep) ep.stopPoll(() => {
    try { iface.release(true, () => device.close()); } catch{}
    process.exit(0);
  });
  else {
    try { iface.release(true, () => device.close()); } catch{}
    setTimeout(() => process.exit(0), 1000);
  }
}, 300_000);
