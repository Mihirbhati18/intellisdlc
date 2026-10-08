import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const BASE = "http://localhost:5173";
const SHOTS = join(process.cwd(), "tools", "screenshots");
mkdirSync(SHOTS, { recursive: true });
let nextId = 1; const pending = new Map();
const target = (await (await fetch("http://127.0.0.1:9222/json/list")).json()).find(t => t.type === "page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.addEventListener("open", res, {once:true}); socket.addEventListener("error", rej, {once:true}); });
socket.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const {resolve, reject} = pending.get(m.id); pending.delete(m.id);
    if (m.error) reject(new Error(m.error.message)); else resolve(m.result); }
});
const send = (method, params={}) => { const id = nextId++; socket.send(JSON.stringify({id, method, params}));
  return new Promise((resolve, reject) => pending.set(id, {resolve, reject})); };
const evaluate = async (expr) => (await send("Runtime.evaluate", {expression: expr, returnByValue: true, awaitPromise: true})).result?.value;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await send("Page.enable"); await send("Runtime.enable");

await send("Page.navigate", { url: `${BASE}/login` });
await sleep(2500);
console.log("backend is down; app still serves the login page:", await evaluate(`document.body.innerText.includes("Demo accounts")`));
// seed a session so the protected pages try to fetch and fail
await evaluate(`localStorage.setItem("intellisdlc_token","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.x");
  localStorage.setItem("intellisdlc_user", JSON.stringify({id:2,full_name:"Priya Nair",email:"pm@intellisdlc.dev",role:"PROJECT_MANAGER",is_active:true,skills:"",capacity_hours:40}));`);
await send("Page.navigate", { url: `${BASE}/` });
await sleep(4000);
const text = await evaluate("document.body.innerText");
console.log("--- dashboard with backend down ---");
console.log(text.split("\n").filter(Boolean).slice(0, 12).join("\n"));
const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(join(SHOTS, "20-backend-down.png"), Buffer.from(data, "base64"));
console.log("\nshows an error box:", await evaluate(`document.body.innerText.toLowerCase().includes("try again")`));
console.log("blank screen?:", await evaluate(`document.body.innerText.trim().length < 20`));
socket.close();
