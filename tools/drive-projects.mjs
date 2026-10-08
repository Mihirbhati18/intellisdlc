/** Prove multi-project works: create a second project in the UI and check isolation. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const BASE = "http://localhost:5173";
const SHOTS = join(process.cwd(), "tools", "screenshots");
mkdirSync(SHOTS, { recursive: true });
let nextId = 1; const pending = new Map();
let consoleErrors = [];
const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const t = targets.filter(x => x.type === "page").find(x => x.url.includes("localhost:5173")) || targets.find(x => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener("open", r, {once:true}); ws.addEventListener("error", j, {once:true}); });
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const {resolve, reject} = pending.get(m.id); pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result); return; }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    consoleErrors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
});
const send = (method, params={}) => { const id = nextId++; ws.send(JSON.stringify({id, method, params}));
  return new Promise((res, rej) => pending.set(id, {resolve: res, reject: rej})); };
const ev = async (x) => { const r = await send("Runtime.evaluate", {expression: x, returnByValue: true, awaitPromise: true});
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
  return r.result?.value; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const hasText = (s) => `document.body.innerText.toLowerCase().includes(${JSON.stringify(s.toLowerCase())})`;
async function waitFor(expr, label, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { last = await ev(expr); if (last) return true; } catch (c) { last = c.message; } await sleep(250); }
  throw new Error(`timeout waiting for ${label} (last ${JSON.stringify(last)})`);
}
const click = (text, tag="button, a") => ev(`(() => {
  const w = ${JSON.stringify(text.toLowerCase())};
  const hit = [...document.querySelectorAll(${JSON.stringify(tag)})].reverse().find(n =>
    n.innerText && n.innerText.trim().toLowerCase().includes(w) && n.offsetParent !== null);
  if (!hit) return false; hit.click(); return true; })()`);
const shot = async (n) => { const {data} = await send("Page.captureScreenshot", {format:"png"});
  writeFileSync(join(SHOTS, n + ".png"), Buffer.from(data, "base64")); };
const results = [];
const rec = (n, ok, d="") => { results.push({n, ok, d}); console.log(`${ok?"PASS":"FAIL"}  ${n}${d?` - ${d}`:""}`); };
const check = async (n, expr) => { try { const v = await ev(expr); rec(n, Boolean(v), v === true ? "" : String(v)); return v; }
  catch (c) { rec(n, false, c.message); return false; } };
async function go(path, expect, label=path) {
  consoleErrors = [];
  await ev(`window.history.pushState({}, "", ${JSON.stringify(path)}); window.dispatchEvent(new PopStateEvent("popstate"));`);
  await waitFor(hasText(expect), `"${expect}" on ${label}`); await sleep(500);
}
await send("Page.enable"); await send("Runtime.enable");

// fresh PM session
await ev("localStorage.clear()");
await send("Page.navigate", { url: `${BASE}/login` });
await waitFor(hasText("Demo accounts"), "login");
await click("Project Manager");
await waitFor(hasText("Dashboard"), "dashboard");
await waitFor(hasText("Task completion"), "dashboard loaded");
await sleep(800);
await check("switcher shows the seeded project", `document.querySelector("aside select")?.selectedOptions[0]?.text.includes("ShopEase")`);
await check("dashboard scoped: 8 requirements", `document.body.innerText.split("REQUIREMENTS")[1].trim().startsWith("8")`);

// create a second project
await go("/projects", "Projects", "projects page");
await shot("live-06-projects");
await check("projects page lists ShopEase", hasText("ShopEase"));
rec("new project button", await click("New project"));
await waitFor(hasText("Create and open"), "create modal");
await ev(`(() => {
  const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set; d.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true })); };
  set(document.querySelector(".fixed input"), "Campus Placement Portal");
  set(document.querySelector(".fixed textarea"), "Placement drive management for the campus");
  return true; })()`);
await sleep(300);
await shot("live-07-new-project-modal");
await click("Create and open");
await sleep(2500);
await check("landed on dashboard after create", `window.location.pathname === "/"`);
await check("switcher now shows the new project", `document.querySelector("aside select")?.selectedOptions[0]?.text.includes("Campus Placement")`);
await shot("live-08-new-project-dashboard");

// the new project must be empty, not showing ShopEase data
const txt = await ev("document.body.innerText");
rec("new project dashboard is empty", txt.split("REQUIREMENTS")[1].trim().startsWith("0"), txt.split("REQUIREMENTS")[1].trim().slice(0, 3));
await check("no active sprint in the new project", hasText("No sprint is currently active"));

await go("/requirements", "Requirements", "requirements");
await sleep(800);
await check("requirements empty for new project", `document.querySelectorAll("tbody tr").length === 0`);
await check("no ShopEase requirement leaked", `!document.body.innerText.includes("REQ-101")`);
await shot("live-09-empty-requirements");

await go("/bugs", "Bugs", "bugs");
await sleep(700);
await check("bugs empty for new project", `!document.body.innerText.includes("BUG-101")`);

await go("/traceability", "Traceability", "traceability");
await sleep(900);
await check("traceability empty for new project", `!document.body.innerText.includes("REQ-101")`);

// switch back to ShopEase via the sidebar switcher
await ev(`(() => { const s = document.querySelector("aside select");
  const opt = [...s.options].find(o => o.text.includes("ShopEase"));
  s.value = opt.value; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
await sleep(2000);
await check("switching back restores ShopEase data", hasText("REQ-101"));
await shot("live-10-switched-back");
await go("/", "Dashboard", "dashboard");
await waitFor(`document.body.innerText.split("REQUIREMENTS")[1].trim().startsWith("8")`, "ShopEase counts restored");
await check("dashboard back to 8 requirements", `document.body.innerText.split("REQUIREMENTS")[1].trim().startsWith("8")`);
await check("active sprint is back", hasText("Sprint 3 - Payments"));

const noise = ["favicon", "React DevTools", "Future Flag"];
const errs = consoleErrors.filter(e => !noise.some(n => e.includes(n)));
rec("no console errors", errs.length === 0, errs.slice(0,2).join(" | "));
const failed = results.filter(r => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
if (failed.length) { console.log("\nFailures:"); failed.forEach(f => console.log(`  - ${f.n}${f.d?`: ${f.d}`:""}`)); }
ws.close(); process.exit(failed.length ? 1 : 0);
