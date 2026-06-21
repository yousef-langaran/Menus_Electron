/**
 * Diagnostic v2 — shows RAW data for ALL combinations
 * Shows EVERY change, no filtering
 * Close the Electron app first, then: node __diag2__.js
 * Then CALL immediately!
 */
const usb = require("usb");

const device = usb.findByIds(0x16C0, 0x05DA);
if (!device) { console.log("ERROR: device not found — is the app still running?"); process.exit(1); }
device.open();
const iface = device.interface(0);
try { iface.claim(); } catch(e) { console.log("WARN:", e.message); }

const toAscii = (b) =>
  Array.from(b).map(x =>
    x >= 32 && x < 127 ? String.fromCharCode(x) : (x===10?'↵':(x===0?'·':'░'))
  ).join('');

// Track last seen per combination
const last = {};

const combos = [
  { wv: 0x0100, label: "In/0" },
  { wv: 0x0300, label: "Ft/0" },
  { wv: 0x0101, label: "In/1" },
  { wv: 0x0301, label: "Ft/1" },
];

let tick = 0;

function doPoll() {
  tick++;
  for (const {wv, label} of combos) {
    device.controlTransfer(0xA1, 0x01, wv, 0, 80, (err, data) => {
      if (err || !data || data.length === 0) return;
      const hexKey = `${wv}:${data.toString("hex")}`;
      if (hexKey === last[wv]) return; // unchanged
      last[wv] = hexKey;

      const ascii = toAscii(data);
      // First line only for short display
      const firstLine = ascii.split('↵')[0];
      const ts = new Date().toISOString().slice(11, 19);

      // Is this interesting?
      const interesting = !firstLine.startsWith('~OK TILDA KISH');
      const prefix = interesting ? "🚨" : "  ";
    });
  }
}

const poll = setInterval(doPoll, 200);


process.on("SIGINT", () => {
  clearInterval(poll);
  iface.release(true, () => device.close());
  process.exit(0);
});

// Auto-stop after 5 minutes
setTimeout(() => {
  clearInterval(poll);
  iface.release(true, () => device.close());
  setTimeout(() => process.exit(0), 500);
}, 300_000);
