/** Walk through connecting a repository, capturing each step. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const BASE = "http://localhost:5173";
const REPO_PATH = process.argv[2];
const REPO_NAME = process.argv[3] ?? "repo";
const SHOTS = join(process.cwd(), "tools", "screenshots");
mkdirSync(SHOTS, { recursive: true });
let nextId=1; const pending=new Map();
const t=(await (await fetch("http://127.0.0.1:9222/json/list")).json()).filter(x=>x.type==="page").find(x=>x.url.includes("localhost:5173"))
  || (await (await fetch("http://127.0.0.1:9222/json/list")).json()).find(x=>x.type==="page");
const ws=new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.addEventListener("open",r,{once:true});ws.addEventListener("error",j,{once:true});});
ws.addEventListener("message",(e)=>{const m=JSON.parse(e.data);
 if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);}});
const send=(method,params={})=>{const id=nextId++;ws.send(JSON.stringify({id,method,params}));return new Promise((res,rej)=>pending.set(id,{resolve:res,reject:rej}));};
const ev=async(x)=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??"eval failed");return r.result?.value;};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const hasText=(s)=>`document.body.innerText.toLowerCase().includes(${JSON.stringify(s.toLowerCase())})`;
async function waitFor(e,l,t=30000){const end=Date.now()+t;let last;while(Date.now()<end){try{last=await ev(e);if(last)return true;}catch(c){last=c.message;}await sleep(250);}throw new Error(`timeout: ${l}`);}
const click=(text,tag="button, a")=>ev(`(()=>{const w=${JSON.stringify(text.toLowerCase())};
  const hit=[...document.querySelectorAll(${JSON.stringify(tag)})].reverse().find(n=>n.innerText&&n.innerText.trim().toLowerCase().includes(w)&&n.offsetParent!==null);
  if(!hit)return false;hit.click();return true;})()`);
const shot=async(n)=>{await send("Page.bringToFront");const{data}=await send("Page.captureScreenshot",{format:"png"});
  writeFileSync(join(SHOTS,n+".png"),Buffer.from(data,"base64"));console.log("  captured", n);};
await send("Page.enable");await send("Runtime.enable");

// sign in as PM
await ev("localStorage.clear()");
await send("Page.navigate",{url:`${BASE}/login`});
await waitFor(hasText("Demo accounts"),"login");
await click("Project Manager");
await waitFor(hasText("Task completion"),"dashboard");
await sleep(700);

// Code page, remove whatever is connected so we start from the empty state
await ev(`window.history.pushState({},"","/code");window.dispatchEvent(new PopStateEvent("popstate"));`);
await waitFor(hasText("Code"),"code page");
await sleep(900);
if (await ev(hasText("IntelliSDLC (this project)"))) {
  console.log("step 0 - clearing the seeded repository");
  await ev(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.querySelector("svg.lucide-trash2")||x.innerHTML.includes("trash"));if(b){b.click();return true}return false})()`);
  await sleep(1800);
}
await waitFor(hasText("No repository connected"),"empty state");
await sleep(400);
console.log("step 1 - nothing connected");
await shot("demo-01-empty");

console.log("step 2 - opening the connect form");
await click("Connect repository");
await waitFor(hasText("Folder path"),"connect modal");
await sleep(500);
await shot("demo-02-form");

console.log("step 3 - typing the folder path");
await ev(`(()=>{
  const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value").set;d.call(el,v);
    el.dispatchEvent(new Event("input",{bubbles:true}));};
  const inputs=[...document.querySelectorAll(".fixed input")];
  set(inputs[0], ${JSON.stringify(REPO_PATH)});
  set(inputs[1], ${JSON.stringify(REPO_NAME)});
  return true;})()`);
await sleep(600);
await shot("demo-03-filled");

console.log("step 4 - connecting");
await click("Connect");
await waitFor(hasText(REPO_NAME),"repository row");
await sleep(1200);
await shot("demo-04-connected");
console.log("  branch/row:", (await ev("document.body.innerText")).split("\n").filter(l=>l.includes("Never synced")||l.includes("commits stored")).slice(0,2));

console.log("step 5 - syncing (reads git log)");
await click("Sync");
await waitFor(hasText("commits read"),"sync summary",40000);
await sleep(1500);
await shot("demo-05-synced");

const summary = await ev(`(()=>{const t=document.body.innerText;const i=t.indexOf("commits read");
  return t.slice(Math.max(0,i-30), i+200).split(String.fromCharCode(10)).filter(Boolean).slice(0,10).join(" | ");})()`);
console.log("  summary:", summary);
const counter = await ev(`(()=>{const s=[...document.querySelectorAll('span')].map(n=>(n.innerText||'').trim())
  .find(x=>x.includes(' linked')&&x.includes(' of '));return s||'none';})()`);
console.log("  linked counter:", counter);
ws.close();process.exit(0);
