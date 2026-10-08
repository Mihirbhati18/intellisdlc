/**
 * Edge-case pass: the paths a happy-path click-through never reaches.
 *
 *   node tools/drive-edge.mjs
 *
 * Expects the backend on 8000 and Vite on 5173, and Chrome listening on 9222.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.APP_URL ?? "http://localhost:5173";
const API = process.env.API_URL ?? "http://localhost:8000/api/v1";
const CDP = process.env.CDP_URL ?? "http://127.0.0.1:9222";
const SHOTS = join(process.cwd(), "tools", "screenshots");
mkdirSync(SHOTS, { recursive: true });

let nextId = 1;
const pending = new Map();
let consoleErrors = [];
let pageExceptions = [];

const response = await fetch(`${CDP}/json/list`);
const target = (await response.json()).find((t) => t.type === "page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    consoleErrors.push(message.params.args.map((a) => a.value ?? a.description).join(" "));
  }
  if (message.method === "Runtime.exceptionThrown") {
    pageExceptions.push(
      message.params.exceptionDetails.exception?.description ??
        message.params.exceptionDetails.text,
    );
  }
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
  }
  return result.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasText = (needle) =>
  `document.body.innerText.toLowerCase().includes(${JSON.stringify(needle.toLowerCase())})`;

async function waitFor(expression, { timeout = 15000, label = "condition" } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(expression);
      if (last) return true;
    } catch (caught) {
      last = caught.message;
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
}

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
}
async function check(name, expression) {
  try {
    const value = await evaluate(expression);
    record(name, Boolean(value), value === true ? "" : String(value));
    return value;
  } catch (caught) {
    record(name, false, caught.message);
    return false;
  }
}

function clickByText(text, tag = "*") {
  return `(() => {
    const wanted = ${JSON.stringify(text.toLowerCase())};
    const hit = [...document.querySelectorAll(${JSON.stringify(tag)})].reverse().find(
      (n) => n.innerText && n.innerText.trim().toLowerCase().includes(wanted) && n.offsetParent !== null
    );
    if (!hit) return false;
    hit.click();
    return true;
  })()`;
}

async function go(path, expect, label = path) {
  consoleErrors = [];
  pageExceptions = [];
  await evaluate(`(() => {
    window.history.pushState({}, "", ${JSON.stringify(path)});
    window.dispatchEvent(new PopStateEvent("popstate"));
    return true;
  })()`);
  await waitFor(hasText(expect), { label: `"${expect}" on ${label}` });
  await sleep(400);
}

async function loginAs(label) {
  await evaluate("localStorage.clear()");
  await send("Page.navigate", { url: `${BASE}/login` });
  await waitFor(hasText("Demo accounts"), { label: "login page" });
  await evaluate(clickByText(label, "button"));
  await waitFor(hasText("Dashboard"), { label: "dashboard" });
  await sleep(600);
}

await send("Page.enable");
await send("Runtime.enable");

console.log("=== IntelliSDLC edge cases ===\n");

// --- 1. a stale / bogus token must bounce to the login page ---------------
// A logged-in session is bounced off /login, so clear storage before asking for it.
await send("Page.navigate", { url: `${BASE}/login` });
await waitFor(hasText("IntelliSDLC"), { label: "app shell" });
await evaluate("localStorage.clear()");
await send("Page.navigate", { url: `${BASE}/login` });
await waitFor(hasText("Demo accounts"), { label: "login" });
await evaluate(`(() => {
  localStorage.setItem("intellisdlc_token", "not.a.real.token");
  localStorage.setItem("intellisdlc_user", JSON.stringify({
    id: 2, full_name: "Priya Nair", email: "pm@intellisdlc.dev",
    role: "PROJECT_MANAGER", is_active: true, skills: "", capacity_hours: 40
  }));
  return true;
})()`);
await send("Page.navigate", { url: `${BASE}/` });
await sleep(3000);
await screenshot("16-stale-token");
await check(
  "stale token: redirected back to /login",
  `window.location.pathname === "/login"`,
);
await check("stale token: cleared from storage", `localStorage.getItem("intellisdlc_token") === null`);

// --- 2. empty state when a filter matches nothing -------------------------
await loginAs("Project Manager");
await go("/bugs", "BUG-101", "bugs");
await evaluate(`(() => {
  const selects = [...document.querySelectorAll("select")];
  selects[0].value = "LOW";
  selects[0].dispatchEvent(new Event("change", { bubbles: true }));
  selects[1].value = "OPEN";
  selects[1].dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
await sleep(700);
await screenshot("17-empty-state");
await check("empty state: message shown", hasText("No bugs match these filters"));
await check("empty state: table is gone", `document.querySelectorAll("tbody tr").length === 0`);

// --- 3. QA writes a test case for REQ-106 and traceability reacts ---------
await loginAs("QA Engineer");
await go("/traceability", "Traceability Matrix", "traceability");
await sleep(800);
const withoutTestsBefore = await evaluate(`(() => {
  const text = document.body.innerText;
  const match = text.match(/WITHOUT TESTS\\s*(\\d+)/i);
  return match ? Number(match[1]) : -1;
})()`);
record("traceability: starting without-tests count", withoutTestsBefore === 3, String(withoutTestsBefore));

await go("/test-cases", "TC-101", "test cases");
await check("qa: can open the create modal", clickByText("New test case", "button"));
await waitFor(hasText("Expected result"), { label: "test case modal" });
await evaluate(`(() => {
  const setValue = (el, value) => {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const select = document.querySelector(".fixed select");
  const requirement = [...select.options].find((o) => o.text.includes("REQ-106"));
  select.value = requirement.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  setValue(document.querySelector('.fixed input[type="text"], .fixed input:not([type])'), "Submit a product review");
  setValue(document.querySelector(".fixed textarea"), "The review appears on the product page");
  return true;
})()`);
await sleep(400);
await screenshot("18-test-case-modal");
await check("qa: save button enabled", `(() => {
  const save = [...document.querySelectorAll(".fixed button")].find((b) => b.innerText.trim() === "Save");
  return Boolean(save) && !save.disabled;
})()`);
await evaluate(clickByText("Save", "button"));
await sleep(1500);
await check("qa: new test case appears in the table", hasText("Submit a product review"));

await go("/traceability", "Traceability Matrix", "traceability");
await sleep(1000);
const withoutTestsAfter = await evaluate(`(() => {
  const match = document.body.innerText.match(/WITHOUT TESTS\\s*(\\d+)/i);
  return match ? Number(match[1]) : -1;
})()`);
record(
  "traceability: without-tests count drops after adding one",
  withoutTestsAfter === withoutTestsBefore - 1,
  `${withoutTestsBefore} -> ${withoutTestsAfter}`,
);
await screenshot("19-traceability-after");

// --- 4. a role that cannot write sees no write affordance ----------------
await loginAs("Developer");
await go("/test-cases", "TC-101", "test cases as developer");
await check(
  "developer: no create button on test cases",
  `!document.body.innerText.includes("New test case")`,
);
await check(
  "developer: no pass/fail buttons",
  `document.querySelectorAll("tbody button").length === 0`,
);
await go("/requirements", "REQ-101", "requirements as developer");
await check(
  "developer: no create button on requirements",
  `!document.body.innerText.includes("New requirement")`,
);
await check("developer: no edit pencils", `document.querySelectorAll("tbody button").length === 0`);

console.log(`\nconsole errors seen: ${consoleErrors.length}, exceptions: ${pageExceptions.length}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
if (failed.length) {
  console.log("\nFailures:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
}
socket.close();
process.exit(failed.length ? 1 : 0);
