/** Click something by its visible text in the live Chrome, then screenshot. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const SHOTS = join(process.cwd(), "tools", "screenshots");
mkdirSync(SHOTS, { recursive: true });
const [text, name] = [process.argv[2], process.argv[3] ?? "live"];
let nextId = 1; const pending = new Map();
const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const t = targets.filter(x => x.type === "page").find(x => x.url.includes("localhost:5173")) || targets.find(x => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener("open", r, {once:true}); ws.addEventListener("error", j, {once:true}); });
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const {resolve, reject} = pending.get(m.id); pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result); } });
const send = (method, params={}) => { const id = nextId++; ws.send(JSON.stringify({id, method, params}));
  return new Promise((res, rej) => pending.set(id, {resolve: res, reject: rej})); };
const ev = async (x) => (await send("Runtime.evaluate", {expression: x, returnByValue: true, awaitPromise: true})).result?.value;
await send("Page.enable"); await send("Runtime.enable");
const clicked = await ev(`(() => {
  const wanted = ${JSON.stringify(text.toLowerCase())};
  const hit = [...document.querySelectorAll("button, a")].find(
    (n) => n.innerText && n.innerText.trim().toLowerCase().includes(wanted) && n.offsetParent !== null);
  if (!hit) return false; hit.click(); return true;
})()`);
console.log("clicked", JSON.stringify(text) + ":", clicked);
await new Promise(r => setTimeout(r, 2500));
console.log("now at:", await ev("window.location.pathname"));
const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
console.log("captured ->", `tools/screenshots/${name}.png`);
ws.close();
