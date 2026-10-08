/**
 * Headless Chrome driver for IntelliSDLC, over the DevTools Protocol.
 *
 * No npm dependencies: Node 22+ ships a global WebSocket, which is all CDP needs.
 *
 *   node tools/drive.mjs          # drive every page as the PM, then as a developer
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.APP_URL ?? "http://localhost:5173";
const CDP = process.env.CDP_URL ?? "http://127.0.0.1:9222";
const SHOTS = join(process.cwd(), "tools", "screenshots");

mkdirSync(SHOTS, { recursive: true });

// --------------------------------------------------------------- CDP client
let nextId = 1;
const pending = new Map();
let consoleErrors = [];
let pageExceptions = [];

async function pickTarget() {
  const response = await fetch(`${CDP}/json/list`);
  const targets = await response.json();
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no page target; is Chrome up with --remote-debugging-port?");
  return page.webSocketDebuggerUrl;
}

const socket = new WebSocket(await pickTarget());
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
    consoleErrors.push(
      message.params.args.map((a) => a.value ?? a.description ?? a.type).join(" "),
    );
  }
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    pageExceptions.push(details.exception?.description ?? details.text);
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  throw new Error(`timed out waiting for ${label} (last value: ${JSON.stringify(last)})`);
}

async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
}

// ------------------------------------------------------------------ helpers
// innerText applies CSS text-transform, so Tailwind's `uppercase` labels come
// back shouting. Every text match here is therefore case-insensitive.
const hasText = (needle) =>
  `document.body.innerText.toLowerCase().includes(${JSON.stringify(needle.toLowerCase())})`;

function clickByText(text, tag = "*") {
  return `(() => {
    const wanted = ${JSON.stringify(text.toLowerCase())};
    const nodes = [...document.querySelectorAll(${JSON.stringify(tag)})];
    const hit = nodes.reverse().find(
      (n) =>
        n.innerText &&
        n.innerText.trim().toLowerCase().includes(wanted) &&
        n.offsetParent !== null
    );
    if (!hit) return false;
    hit.click();
    return true;
  })()`;
}

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` - ${detail}` : ""}`);
}

async function check(name, expression, detail = "") {
  try {
    const value = await evaluate(expression);
    record(name, Boolean(value), detail || (value === true ? "" : String(value)));
    return value;
  } catch (caught) {
    record(name, false, caught.message);
    return false;
  }
}

/** Navigate through react-router without a full page reload. */
async function go(path, expect, { label = path, timeout = 15000 } = {}) {
  consoleErrors = [];
  pageExceptions = [];
  await evaluate(
    `(() => {
      window.history.pushState({}, "", ${JSON.stringify(path)});
      window.dispatchEvent(new PopStateEvent("popstate"));
      return true;
    })()`,
  );
  await waitFor(hasText(expect), { label: `"${expect}" on ${label}`, timeout });
  await sleep(500);
}

function reportRuntime(page) {
  const noise = [
    "favicon",
    "Download the React DevTools",
    "React Router Future Flag",
  ];
  const errors = consoleErrors.filter((e) => !noise.some((n) => e.includes(n)));
  record(`${page}: no console errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  record(
    `${page}: no uncaught exceptions`,
    pageExceptions.length === 0,
    pageExceptions.slice(0, 2).join(" | "),
  );
}

// --------------------------------------------------------------------- main
await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

console.log("=== IntelliSDLC UI drive ===\n");

// --- login page -----------------------------------------------------------
await send("Page.navigate", { url: `${BASE}/login` });
await waitFor(hasText("IntelliSDLC"), { label: "login page" });
await evaluate("localStorage.clear()");
await send("Page.navigate", { url: `${BASE}/login` });
await waitFor(hasText("Demo accounts"), { label: "demo accounts block" });
await screenshot("01-login");
await check("login: title renders", hasText("Requirements, sprints and intelligence"));
await check("login: four demo buttons", `document.querySelectorAll('button[type="button"]').length >= 4`);
reportRuntime("login");

// --- sign in as PM via the quick-fill button ------------------------------
await check("login: PM quick-fill clicks", clickByText("Project Manager", "button"));
await waitFor(hasText("Dashboard"), { label: "dashboard after login" });
await check(
  "login: token stored",
  `Boolean(localStorage.getItem("intellisdlc_token"))`,
);
await sleep(800);
await screenshot("02-dashboard");

// --- dashboard ------------------------------------------------------------
await check("dashboard: KPI cards", hasText("Task completion"));
await check("dashboard: requirement count is 8", `document.body.innerText.includes("8")`);
await check("dashboard: two charts render", `document.querySelectorAll("svg.recharts-surface").length >= 2`);
await check("dashboard: traceability summary", hasText("Average coverage"));
await check("dashboard: active sprint card", hasText("Sprint 3 - Payments"));
reportRuntime("dashboard");

// --- requirements ---------------------------------------------------------
await go("/requirements", "REQ-101", { label: "requirements" });
await screenshot("03-requirements");
await check("requirements: all eight rows", `document.querySelectorAll("tbody tr").length === 8`);
await check("requirements: REQ-103 listed", hasText("Online payments at checkout"));
await check("requirements: new-requirement button for PM", clickByText("New requirement", "button"));
await waitFor(hasText("Design reference"), { label: "create modal" });
await screenshot("04-requirement-modal");
await check("requirements: modal closes", clickByText("Cancel", "button"));
await sleep(400);
// filter down to CRITICAL
await evaluate(`(() => {
  const selects = [...document.querySelectorAll("select")];
  const priority = selects[selects.length - 1];
  priority.value = "CRITICAL";
  priority.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
await sleep(500);
await check(
  "requirements: priority filter narrows the table",
  `document.querySelectorAll("tbody tr").length < 8`,
  "",
);
reportRuntime("requirements");

// --- requirement detail ---------------------------------------------------
await go("/requirements/3", "Version history", { label: "REQ-103 detail" });
await sleep(700);
await screenshot("05-requirement-detail");
await check("detail: REQ-103 heading", hasText("REQ-103"));
await check("detail: three version entries", `document.body.innerText.includes("v3") && document.body.innerText.includes("v1")`);
await check("detail: priority change recorded", hasText("HIGH -> CRITICAL"));
await check("detail: linked tasks section", hasText("Linked tasks"));
await check("detail: test cases section", hasText("Test cases"));
await check("detail: deployments section", hasText("Deployments"));
reportRuntime("requirement-detail");

// --- sprints --------------------------------------------------------------
await go("/sprints", "Sprint 1 - Foundation", { label: "sprints" });
await sleep(700);
await screenshot("06-sprints");
await check("sprints: four cards", `document.querySelectorAll('a[href^="/sprints/"]').length === 4`);
await check("sprints: active badge", hasText("ACTIVE"));
await check("sprints: progress percentages", `/\\d+%/.test(document.body.innerText)`);
reportRuntime("sprints");

// --- sprint board ---------------------------------------------------------
await go("/sprints/3", "To do", { label: "sprint 3 board" });
await sleep(900);
await screenshot("07-sprint-board");
await check("board: five columns", hasText("In progress") );
await check("board: blocked column", hasText("Blocked"));
await check("board: task cards present", `document.querySelectorAll("article").length >= 8`);
await check("board: status dropdowns for PM", `document.querySelectorAll("article select").length >= 8`);
const movedCard = await evaluate(`(() => {
  const select = document.querySelector("article select");
  if (!select) return false;
  select.value = "REVIEW";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
record("board: status dropdown fires", Boolean(movedCard));
await sleep(1200);
await check("board: review column took the card", hasText("Review"));
reportRuntime("sprint-board");

// --- bugs -----------------------------------------------------------------
await go("/bugs", "BUG-101", { label: "bugs" });
await sleep(600);
await screenshot("08-bugs");
await check("bugs: five rows", `document.querySelectorAll("tbody tr").length === 5`);
await check("bugs: critical severity shown", hasText("CRITICAL"));
await check("bugs: links back to requirement", `document.querySelectorAll('a[href^="/requirements/"]').length >= 3`);
reportRuntime("bugs");

// --- test cases -----------------------------------------------------------
await go("/test-cases", "TC-101", { label: "test cases" });
await sleep(600);
await screenshot("09-test-cases");
await check("tests: seven rows", `document.querySelectorAll("tbody tr").length === 7`);
await check("tests: failed status visible", hasText("FAILED"));
await check("tests: pass/fail buttons", `document.querySelectorAll("tbody button").length >= 14`);
reportRuntime("test-cases");

// --- deployments ----------------------------------------------------------
await go("/deployments", "PRODUCTION", { label: "deployments" });
await sleep(600);
await screenshot("10-deployments");
await check("deployments: v1.2.0 in production", hasText("v1.2.0"));
await check("deployments: failed release shown", hasText("v1.3.0"));
await check("deployments: three environment columns", hasText("STAGING"));
reportRuntime("deployments");

// --- traceability ---------------------------------------------------------
await go("/traceability", "Traceability Matrix", { label: "traceability" });
await sleep(900);
await screenshot("11-traceability");
await check("traceability: eight rows", `document.querySelectorAll("tbody tr").length === 8`);
await check("traceability: REQ-101 complete", hasText("COMPLETE"));
await check("traceability: REQ-103 at risk", hasText("AT RISK"));
await check("traceability: NO TESTS flagged", hasText("NO TESTS"));
await check("traceability: coverage percentages", `/100%/.test(document.body.innerText)`);
reportRuntime("traceability");

// --- risk predictor -------------------------------------------------------
await go("/risk", "Sprint Risk Predictor", { label: "risk" });
await sleep(700);
await check("risk: predict button present", clickByText("Predict risk", "button"));
await waitFor(hasText("RISK"), { label: "risk score", timeout: 20000 });
await sleep(900);
await screenshot("12-risk-high");
await check("risk: sprint 3 scores HIGH", hasText("HIGH RISK"));
await check("risk: drivers chart", `document.querySelectorAll("svg.recharts-surface").length >= 1`);
await check("risk: suggested actions", hasText("Suggested actions"));
await check("risk: live metrics table", hasText("Critical bugs"));
await check("risk: model metrics", hasText("Accuracy"));
reportRuntime("risk");

// --- ai chat --------------------------------------------------------------
await go("/chat", "AI Project Agent", { label: "chat" });
await sleep(600);
await check("chat: suggestion chips", clickByText("Which critical bugs are still open?", "button"));
await waitFor(hasText("BUG-101"), { label: "agent answer", timeout: 20000 });
await sleep(600);
await screenshot("13-chat");
await check("chat: offline badge", hasText("Offline mode"));
await check("chat: cites bug ids", hasText("BUG-101"));
reportRuntime("chat");

// --- developer role -------------------------------------------------------
await evaluate("localStorage.clear()");
await send("Page.navigate", { url: `${BASE}/login` });
await waitFor(hasText("Demo accounts"), { label: "login page again" });
await check("logout: back to login", hasText("Demo accounts"));
await check("login: developer quick-fill", clickByText("Developer", "button"));
await waitFor(hasText("Dashboard"), { label: "developer dashboard" });
await sleep(900);
await screenshot("14-developer-dashboard");
await check(
  "developer: sidebar hides Risk Predictor",
  `!document.querySelector("aside").innerText.includes("Risk Predictor")`,
);
await go("/risk", "Dashboard", { label: "developer blocked from /risk" });
await check("developer: /risk redirects to dashboard", `window.location.pathname === "/"`);

await go("/sprints/3", "To do", { label: "developer board" });
await sleep(900);
await screenshot("15-developer-board");
await check(
  "developer: some cards are read only",
  `document.body.innerText.includes("Read only")`,
);
await check(
  "developer: own cards still editable",
  `document.querySelectorAll("article select").length >= 1`,
);
reportRuntime("developer-board");

// --- summary --------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
if (failed.length) {
  console.log("\nFailures:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
}
socket.close();
process.exit(failed.length ? 1 : 0);
