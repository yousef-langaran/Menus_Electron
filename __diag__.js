/**
 * Diagnostic — shows ALL changes from device (no filtering)
 * Run: node __diag__.js   (while app is CLOSED so device is free)
 * Then call immediately!
 */
const usb = require("usb");

const device = usb.findByIds(0x16C0, 0x05DA);
if (!device) { console.log("ERROR: device not found"); process.exit(1); }
device.open();
const iface = device.interface(0);
try { iface.claim(); } catch(e) { console.log("WARN:", e.message); }

const toAscii = (b) => Array.from(b).map(x => x >= 32 && x < 127 ? String.fromCharCode(x) : (x===10?'↵':(x===0?'·':'░'))).join('');

let lastHex0100 = '', lastHex0300 = '';
let tick = 0;

console.log("════════════════════════════════════════");
console.log("🔔  آماده — همین الان زنگ بزن!");
console.log("    (هر 100ms هر دو وضعیت نشان داده میشه)");
console.log("════════════════════════════════════════");

const poll = setInterval(() => {
  tick++;

  // Poll wValue=0x0100 (Input, ID=0) — RingsCount live
  device.controlTransfer(0xA1, 0x01, 0x0100, 0, 80, (e1, d1) => {
    if (!e1 && d1 && d1.length > 0) {
      const hex = d1.toString("hex");
      if (hex !== lastHex0100) {
        const ascii = toAscii(d1).slice(0, 60);
        console.log(`[${tick}] 0x0100 CHANGE: ${ascii}`);
        lastHex0100 = hex;
      }
    }

    // Poll wValue=0x0300 (Feature, ID=0) — Missed Call / status
    device.controlTransfer(0xA1, 0x01, 0x0300, 0, 80, (e2, d2) => {
      if (!e2 && d2 && d2.length > 0) {
        const hex = d2.toString("hex");
        if (hex !== lastHex0300) {
          const ascii = toAscii(d2).slice(0, 60);
          console.log(`[${tick}] 0x0300 CHANGE: ${ascii}`);
          lastHex0300 = hex;
        }
      }
    });
  });
}, 100);

// Every 30s — heartbeat
setInterval(() => console.log(`  ⏱  هنوز در حال پایش... (tick=${tick})`), 30000);

setTimeout(() => {
  clearInterval(poll);
  console.log("════ DONE ════");
  iface.release(true, () => device.close());
  setTimeout(() => process.exit(0), 500);
}, 180000); // 3 minutes
