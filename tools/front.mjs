import { writeFileSync } from "node:fs";
import { join } from "node:path";
let nextId = 1; const pending = new Map();
const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const t = targets.filter(x => x.type === "page").find(x => x.url.includes("localhost:5173"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener("open", r, {once:true}); ws.addEventListener("error", j, {once:true}); });
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const {resolve, reject} = pending.get(m.id); pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result); } });
const send = (method, params={}) => { const id = nextId++; ws.send(JSON.stringify({id, method, params}));
  return new Promise((res, rej) => pending.set(id, {resolve: res, reject: rej})); };
const ev = async (x) => (await send("Runtime.evaluate", {expression: x, returnByValue: true, awaitPromise: true})).result?.value;
await send("Page.enable"); await send("Runtime.enable");

const barHeights = `(() => [...document.querySelectorAll(".recharts-bar-rectangle path")].map(p => Math.round(p.getBoundingClientRect().height)))()`;
console.log("visibility:", await ev("document.visibilityState"), "| hasFocus:", await ev("document.hasFocus()"));
console.log("bar heights BEFORE bringToFront:", JSON.stringify(await ev(barHeights)));

await send("Page.bringToFront");
await new Promise(r => setTimeout(r, 2500));
console.log("visibility:", await ev("document.visibilityState"), "| hasFocus:", await ev("document.hasFocus()"));
console.log("bar heights AFTER  bringToFront:", JSON.stringify(await ev(barHeights)));
const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(join(process.cwd(), "tools", "screenshots", "live-03-front.png"), Buffer.from(data, "base64"));
ws.close();
