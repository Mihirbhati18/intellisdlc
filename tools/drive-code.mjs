/** Drive the Code page: sync the real repository and check the evidence lands. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const BASE = "http://localhost:5173";
const SHOTS = join(process.cwd(), "tools", "screenshots");
mkdirSync(SHOTS, { recursive: true });
let nextId=1; const pending=new Map(); let consoleErrors=[];
const t=(await (await fetch("http://127.0.0.1:9222/json/list")).json()).filter(x=>x.type==="page").find(x=>x.url.includes("localhost:5173"))
  || (await (await fetch("http://127.0.0.1:9222/json/list")).json()).find(x=>x.type==="page");
const ws=new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.addEventListener("open",r,{once:true});ws.addEventListener("error",j,{once:true});});
ws.addEventListener("message",(e)=>{const m=JSON.parse(e.data);
 if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);return;}
 if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error")consoleErrors.push(m.params.args.map(a=>a.value??a.description).join(" "));});
const send=(method,params={})=>{const id=nextId++;ws.send(JSON.stringify({id,method,params}));return new Promise((res,rej)=>pending.set(id,{resolve:res,reject:rej}));};
const ev=async(x)=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??"eval failed");return r.result?.value;};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const hasText=(s)=>`document.body.innerText.toLowerCase().includes(${JSON.stringify(s.toLowerCase())})`;
async function waitFor(e,l,t=20000){const end=Date.now()+t;let last;while(Date.now()<end){try{last=await ev(e);if(last)return true;}catch(c){last=c.message;}await sleep(250);}throw new Error(`timeout: ${l} (${JSON.stringify(last)})`);}
const click=(text,tag="button, a")=>ev(`(()=>{const w=${JSON.stringify(text.toLowerCase())};
  const hit=[...document.querySelectorAll(${JSON.stringify(tag)})].reverse().find(n=>n.innerText&&n.innerText.trim().toLowerCase().includes(w)&&n.offsetParent!==null);
  if(!hit)return false;hit.click();return true;})()`);
const shot=async(n)=>{const{data}=await send("Page.captureScreenshot",{format:"png"});writeFileSync(join(SHOTS,n+".png"),Buffer.from(data,"base64"));};
const results=[];const rec=(n,ok,d="")=>{results.push({n,ok,d});console.log(`${ok?"PASS":"FAIL"}  ${n}${d?` - ${d}`:""}`);};
const check=async(n,e)=>{try{const v=await ev(e);rec(n,Boolean(v),v===true?"":String(v));return v;}catch(c){rec(n,false,c.message);return false;}};
async function go(p,expect,l=p){consoleErrors=[];await ev(`window.history.pushState({},"",${JSON.stringify(p)});window.dispatchEvent(new PopStateEvent("popstate"));`);
  await waitFor(hasText(expect),`"${expect}" on ${l}`);await sleep(600);}
await send("Page.enable");await send("Runtime.enable");

await ev("localStorage.clear()");
await send("Page.navigate",{url:`${BASE}/login`});
await waitFor(hasText("Demo accounts"),"login");
await click("Project Manager");
await waitFor(hasText("Task completion"),"dashboard");
await sleep(800);

await check("sidebar has a Code item", `document.querySelector("aside").innerText.includes("Code")`);
await go("/code","Code","code page");
await sleep(900);
await shot("live-20-code-before-sync");
await check("seeded repository is listed", hasText("IntelliSDLC (this project)"));
await check("never synced yet", hasText("Never synced"));
await check("no commits yet", hasText("No commits read yet"));

rec("sync button clicked", await click("Sync"));
await waitFor(hasText("commits read"),"sync result",30000);
await sleep(1200);
await shot("live-21-code-after-sync");
await check("sync reported commits", hasText("requirement links"));
await check("a real commit subject appears", hasText("PART A: IntelliSDLC backend"));
await check("branch shown", hasText("master"));
// Target the counter span directly: searching the page text for ' linked'
// matches the page subtitle first and would pass for the wrong reason.
const linkedText = await ev(`(() => {
  const span = [...document.querySelectorAll('span')]
    .map((n) => (n.innerText || '').trim())
    .find((t) => t.includes(' linked') && t.includes(' of '));
  return span || 'none';
})()`);
rec("linked counter rendered", linkedText !== "none", linkedText);
await check("REQ badge on a commit", `document.body.innerText.includes("REQ-101")`);

await go("/traceability","Traceability","traceability");
await sleep(1000);
await shot("live-22-traceability-commits");
await check("matrix has a Commits column", hasText("Commits"));
await check("REQ-101 shows commit evidence", `document.body.innerText.includes("2 commits")`);

await go("/requirements/1","Version history","REQ-101 detail");
await sleep(1000);
await shot("live-23-requirement-commits");
await check("detail page has a Commits panel", hasText("Commits"));
await check("commit listed on the requirement", hasText("PART A"));

const noise=["favicon","React DevTools","Future Flag"];
const errs=consoleErrors.filter(e=>!noise.some(n=>e.includes(n)));
rec("no console errors",errs.length===0,errs.slice(0,2).join(" | "));
const failed=results.filter(r=>!r.ok);
console.log(`\n=== ${results.length-failed.length}/${results.length} checks passed ===`);
if(failed.length){console.log("\nFailures:");failed.forEach(f=>console.log(`  - ${f.n}${f.d?`: ${f.d}`:""}`));}
ws.close();process.exit(failed.length?1:0);
