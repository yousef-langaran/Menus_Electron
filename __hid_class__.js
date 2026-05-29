const usb = require("usb");
const fs = require("fs");
const logFile = "d:\\Project\\MyProject\\Menus\\Menus_Electron\\hid_class.log";
const log = (msg) => { fs.appendFileSync(logFile, new Date().toISOString().slice(11,19)+" "+msg+"\n"); process.stdout.write(msg+"\n"); };
const device = usb.findByIds(0x16C0, 0x05DA);
device.open();
const iface = device.interface(0);
iface.claim();
log("READY — زنگ بزن!");

// V-USB HID: GET_REPORT (bmRequestType=0xA1, bRequest=0x01)
// wValue high byte = report type (1=input, 3=feature), low byte = report ID
const getReport = (type, id) => new Promise(res => {
  const wValue = (type << 8) | id;
  device.controlTransfer(0xA1, 0x01, wValue, 0, 32, (err, data) => {
    if(err) { log("GET_REPORT type="+type+" id="+id+" ERR: "+err.message); res(null); }
    else {
      const hex = data.length ? Buffer.from(data).toString("hex") : "(empty)";
      const ascii = Array.from(data).map(x=>x>=32&&x<127?String.fromCharCode(x):".").join("");
      if(data.length > 0) log("*** GOT DATA! type="+type+" id="+id+" hex="+hex+" ascii="+ascii);
      res(data);
    }
  });
});

// Poll every 300ms with both input and feature report types
let tick = 0;
const poll = setInterval(async () => {
  tick++;
  for(const [type, id] of [[1,0],[3,0],[1,1],[3,1]]) {
    const d = await getReport(type, id);
    if(d && d.length > 0) log("TICK="+tick+" type="+type+" id="+id+" bytes=["+Array.from(d).join(",")+"]");
  }
}, 300);

// Also poll interrupt endpoint
const ep = iface.endpoints.find(e => e.direction === "in");
ep.startPoll(4, 8);
ep.on("data", d => {
  if(d.every(b=>b===0)) return;
  log("INTERRUPT: ["+Array.from(d).join(",")+"] hex="+Buffer.from(d).toString("hex"));
});
ep.on("error", e => log("EP_ERR: "+e.message));

setTimeout(() => {
  clearInterval(poll);
  ep.stopPoll(() => { try{iface.release(true,()=>device.close());}catch{} log("DONE"); process.exit(0); });
}, 90000);
