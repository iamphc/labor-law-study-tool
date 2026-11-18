"use strict";

const byId = id => document.getElementById(id);
const facts = byId("facts");
const result = byId("result");
const follow = byId("follow");
const status = byId("status");
const cloud = byId("cloud");
const review = byId("review");
let library;
let currentLinks = [];

function add(parent, type, value, className) {
  const element = document.createElement(type);
  if (value) element.textContent = value;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function link(parent, value, url) {
  currentLinks.push([value, url]);
  const element = add(parent, "a", value);
  element.href = url;
  element.target = "_blank";
  element.rel = "noopener noreferrer";
}

function renderReport(container,analysis,sources,sourceLink) {
  if(analysis.verification)add(container,"p",analysis.verification);
  const changes=add(container,"details","","report-change");
  add(changes,"summary",analysis.change?"判断与建议的变化":"案情摘要");
  add(changes,"p",analysis.change || analysis.summary);
  if(analysis.change)add(changes,"p",analysis.summary);
  const nav=add(container,"div","","report-nav");
  nav.setAttribute("role","group");
  nav.setAttribute("aria-label","分析分类");
  const panes=[];
  function category(name,tone){
    const btn=add(nav,"button",name,"category "+tone);
    btn.type="button";
    const pane=add(container,"section","","report-pane");
    pane.setAttribute("aria-label",name);
    panes.push({btn,pane});
    btn.onclick=()=>{
      const expand=btn.getAttribute("aria-pressed")!=="true";
      panes.forEach(entry=>{
        const visible=expand && entry.btn===btn;
        entry.pane.hidden=!visible;
        entry.btn.setAttribute("aria-pressed",String(visible));
        entry.btn.setAttribute("aria-expanded",String(visible));
      });
    };
    return pane;
  }
  function fold(parent,title,body){
    const box=add(parent,"details","","report-fold");
    add(box,"summary",title);
    if(body)add(box,"p",body);
    return box;
  }
  const actions=category("行动建议","action-tone");
  const evidence=category("证据材料","evidence-tone");
  const risks=category("风险与收益","risk-tone");
  for(const [i,item] of analysis.items.entries()){
    const title="建议 "+(i+1);
    const action=fold(actions,item.claim,item.evidence);
    action.open=i===0;
    const citations=add(action,"div","","cited-sources");
    action.querySelector("summary").after(citations);
    add(citations,"strong","本建议的核心依据");
    const refs=fold(action,"查看材料定位");
    const proof=fold(evidence,title+" · "+item.claim);
    for(const basis of item.basis || []){
      const label=analysis.materials?.[basis.id] || basis.id;
      add(refs,"p",label+" · "+basis.location);
      add(proof,"strong",label);add(proof,"p",basis.location+" · "+basis.supports);
    }
    if(item.gap)add(proof,"p","待补证据："+item.gap);
    for(const id of item.refs){
      const doc=sources["法条"][id] || sources["案例"][id];
      if(doc){
        const isLaw=Boolean(sources["法条"][id]);
        const row=add(citations,"div","",isLaw?"source-row law-tone":"source-row case-tone");
        add(row,"span",isLaw?"法条":"案例");
        sourceLink(row,doc.title,doc.url);
      }
    }
    const risk=fold(risks,title+" · "+item.claim);
    add(risk,"strong","风险");add(risk,"p",item.risk);
    add(risk,"strong","可能收益");add(risk,"p",item.benefit);
  }
  for(const [group,tone] of [["案例","case-tone"],["法条","law-tone"]]){
    const pane=category(group,tone);
    const others=fold(pane,"其他检索结果");
    const docs=sources[group];
    const ids=new Set([...(group==="案例"?analysis.ranking || []:[]),...Object.keys(docs)]);
    for(const id of ids){
      const doc=docs[id];if(!doc)continue;
      const related=analysis.items.filter(item=>item.refs.includes(id));
      const box=fold(related.length?pane:others,doc.title,doc.excerpt);
      if(related.length){
        box.classList.add("cited-fold",tone);
        sourceLink(box,"官方原文 · "+doc.title,doc.url);
        for(const item of related)add(box,"p","对应建议 "+(analysis.items.indexOf(item)+1)+(group==="案例"?" · "+item.difference:""));
      }else{
        const anchor=add(box,"a","官方原文");anchor.href=doc.url;anchor.target="_blank";anchor.rel="noopener";
      }
    }
    if(!others.querySelector("details"))others.remove();else pane.append(others);
  }
  panes[0].btn.click();
  add(container,"small","在线查询时间 "+sources.time);

}

function submittedInput(parent,text){
  const section=add(parent,"section","","submitted-input");
  add(section,"h3","本次提交的内容");
  add(section,"p",text);
}
function show(text,analysis,sources=analysis.sources) {
  result.replaceChildren(); follow.replaceChildren(); currentLinks=[];
  result.hidden=false;
  const toggle=byId("toggle-report");
  toggle.hidden=false;
  toggle.textContent="收起分析";
  toggle.setAttribute("aria-expanded","true");
  toggle.onclick=()=>{
    result.hidden=!result.hidden;
    toggle.textContent=result.hidden?"展开分析":"收起分析";
    toggle.setAttribute("aria-expanded",String(!result.hidden));
  };
  submittedInput(result,text);
  add(result,"h3","本次分析结果");
  renderReport(result,analysis,sources,link);
  byId("result-title").textContent="最新分析";
  result.closest(".results").classList.add("latest-analysis");
  byId("export").hidden=false;
  const questions=analysis?.questions || [];
  if (!questions.length) return;
  add(follow, "h3", "补充关键细节");
  questions.forEach((question, index) => {
    const label = add(follow, "label", question);
    const input = add(follow, "textarea");
    input.dataset.question=question;
    input.id = "answer-" + index;
    label.htmlFor = input.id;
    input.rows = 2;
    input.maxLength = 2500;
  });
  const uploadLabel=add(follow,"label","补充证明材料");
  const upload=add(follow,"input");
  upload.type="file"; upload.multiple=true; upload.id="follow-files";
  upload.accept=byId("material").accept; uploadLabel.htmlFor=upload.id;
  const attachments=add(follow,"div","","follow-materials");
  upload.onchange=()=>renderMaterials(upload,attachments);
  const button = add(follow, "button", analysis ? "补充并继续分析" : "加入案情", "secondary");
  button.type = "button";
  button.onclick=preview;
}

function preview() {
  if (cloud.disabled || review.open) return;
  if (!draft()) {
    status.textContent = "请先填写案情。";
    facts.focus();
    return;
  }
  const redact = /\b(?:1[3-9]\d{9}|\d{17}[\dXx])\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
  byId("outgoing").value = draft().replace(redact, "〔已遮盖〕");
  review.returnValue = "";
  review.showModal();
}

async function readAnalysis(response,log){
  if(!response.headers?.get("content-type")?.includes("application/x-ndjson"))return response.json();
  const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending="";
  while(true){
    const {value,done}=await reader.read();
    if(done)throw new Error("连接已结束，未收到完整分析。");
    pending+=value;
    const lines=pending.split("\n");pending=lines.pop();
    for(const line of lines){
      const event=JSON.parse(line);
      if(event.error)throw new Error(event.error);
      if(event.stage)log(event.stage);
      if(event.result)return event.result;
    }
  }
}

review.addEventListener("close", async () => {
  if (review.returnValue !== "send") return;
  const text = byId("outgoing").value.trim();
  if (!text) return;
  const before = caseText();
  cloud.disabled = true;
  byId("switch-case").disabled=true;
  const started=Date.now();
  const panel=byId("progress");
  panel.hidden=false;panel.open=true;byId("events").replaceChildren();
  function log(message){
    add(byId("events"),"li",new Date().toLocaleTimeString("zh-CN",{hour12:false})+"　"+message);
  }
  log("开始准备提交");
  const controller=new AbortController();
  const deadline=setTimeout(()=>controller.abort(), 420000);
  function updateWait(){
    const seconds=Math.floor((Date.now()-started)/1000);
    status.textContent="正在等待分析结果，已用 "+seconds+" 秒。";
  }
  updateWait();
  const ticker=setInterval(updateWait,1000);
  try {
    const selected=selectedFiles();
    if(selected.reduce((sum,file)=>sum+file.size,0)>32*1024*1024) throw new Error("单次附件合计最多 32 MB");
    const files=await Promise.all(selected.map(file=>new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve({name:file.name,data:reader.result.split(",")[1]});
      reader.onerror=()=>reject(new Error("文件读取失败"));
      reader.readAsDataURL(file);
    })));
    log("已准备 "+files.length+" 份附件，正在向本地服务发送请求");
    const response = await fetch("/analyze", {
      signal:controller.signal,
      method: "POST",
      headers: {"Content-Type": "application/json","Accept":"application/x-ndjson"},
      body: JSON.stringify({text,files,previous:rounds.at(-1)?.analysis?.items || [],prior_materials:rounds.at(-1)?.analysis?.materials || {},history:[...rounds.slice(-8).map(r=>r.text),rounds.at(-1)?.summary || "",...(rounds.at(-1)?.analysis?.questions || []).map(q=>"上次 AI 提问（问题本身不是已确认事实）："+q)].join("\n").slice(-48000)})
    });
    const data = await readAnalysis(response,log);
    if (!response.ok) throw new Error(data.error);
    log("分析已返回，正在保存记录");
    const unchanged=caseText()===before && selected.every((f,i)=>selectedFiles()[i]===f) && selected.length===selectedFiles().length;
    const entry={text,summary:data.summary,analysis:data,attachments:selected,submittedAt:new Date().toISOString()};
    entry.parent=rounds.at(-1)?.entryKey ?? null;
    entry.caseId=activeCase;
    entry.entryKey=await saveEntry(entry);
    rounds.push(entry);
    if(unchanged){
      for(const id of ["goal","facts","material","excerpt"])byId(id).value="";
      byId("materials").replaceChildren();
    }
    historyView();
    show(text,data);
    log("分析已保存，可以查看建议");
    status.textContent = unchanged ? "输入、材料和建议已保存。" : "此次分析已保存，编辑中的新内容可继续提交。";
  } catch (error) {
    log(error.name==="AbortError"?"等待超时":"处理未完成，请查看错误提示");
    status.textContent = error.name==="AbortError" ? "等待超过7分钟，已停止等待。当前输入和附件仍在，可以重试。" : error.message || "分析暂不可用。";
  } finally {
    clearInterval(ticker);clearTimeout(deadline);
    cloud.disabled = false;
    byId("switch-case").disabled=false;
  }
});

function fullReportText(){
  const copy=result.cloneNode(true);
  copy.querySelectorAll("button").forEach(el=>el.remove());
  copy.querySelectorAll("[hidden]").forEach(el=>el.hidden=false);
  copy.querySelectorAll("details").forEach(el=>el.open=true);
  return Array.from(copy.querySelectorAll("h3,summary,strong,p,a,small"),el=>el.textContent).join("\n");
}

byId("export").onclick = () => {
  const bibliography = [...new Map(currentLinks.map(([title, url]) => [title + "\t" + url, title + " " + url])).values()];
  const text = ["劳动维权清单", fullReportText(), "官方来源", ...bibliography].join("\n\n");
  const url = URL.createObjectURL(new Blob([text], {type: "text/plain;charset=utf-8"}));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "劳动维权清单.txt";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

async function init() {
  const response = await fetch("/library");
  if (!response.ok) throw new Error();
  library = await response.json();
  byId("connection").textContent = library.config_error || (library.connected ? "已配置 DeepSeek" : "在线检索模式");
  byId("foot").textContent="案例与法条在每次查询时读取官方网页。";
  cloud.disabled=!library.connected; cloud.onclick=preview;
 }
const rounds=[];
let database;
let activeCase;
function saveEntry(entry){
  return new Promise((resolve,reject)=>{
    const tx=database.transaction("entries","readwrite");
    const req=tx.objectStore("entries").add(entry);
    tx.oncomplete=()=>resolve(req.result);
    tx.onabort=()=>reject(new Error("本机保存失败，请检查浏览器存储空间。"));
  });
}
function readEntries(){
  return new Promise((resolve,reject)=>{
    const entries=[];
    const req=database.transaction("entries").objectStore("entries").openCursor();
    let legacyParent=null;
    req.onsuccess=()=>{
      const cursor=req.result;
      if(!cursor){resolve(entries);return;}
      const entry=cursor.value;
      if(!entry.caseId){
        entry.caseId="legacy";entry.parent=legacyParent;legacyParent=cursor.key;
      }
      entries.push({...entry,entryKey:cursor.key});
      cursor.continue();
    };
    req.onerror=()=>reject(req.error);
  });
}
function openCase(path,caseId){
  activeCase=caseId;
  rounds.splice(0,rounds.length,...path);
  for(const id of ["goal","facts","material","excerpt"])byId(id).value="";
  byId("materials").replaceChildren();follow.replaceChildren();result.replaceChildren();
  currentLinks=[];status.textContent="";result.hidden=false;
  result.closest(".results").classList.remove("latest-analysis");
  byId("progress").hidden=true;byId("export").hidden=true;byId("toggle-report").hidden=true;
  byId("result-title").textContent="案情分析与资料";
  historyView();
  const last=path.filter(r=>r.analysis).at(-1);
  if(last)show(last.text,last.analysis);
  else add(result,"p","输入案情后即可提交分析。","empty");
  byId("case-picker").hidden=true;byId("workspace").hidden=false;
  window.scrollTo(0,0);
}
async function listCases(){
  byId("workspace").hidden=true;byId("case-picker").hidden=false;
  const entries=await readEntries();
  const byKey=new Map(entries.map(e=>[e.entryKey,e]));
  const parents=new Set(entries.map(e=>e.parent));
  const list=byId("case-list");list.replaceChildren();
  if(!entries.length)add(list,"p","还没有提交记录。");
  for(const tip of entries.filter(e=>!parents.has(e.entryKey)).reverse()){
    const path=[];
    for(let e=tip;e;e=byKey.get(e.parent))path.unshift(e);
    const card=add(list,"article","","card");
    add(card,"h3",path[0].text.split("\n")[0].slice(0,70));
    add(card,"p",tip.text.slice(0,100));
    add(card,"small",(tip.submittedAt?new Date(tip.submittedAt).toLocaleString("zh-CN")+" · ":"")+path.length+" 条提交记录");
    const resume=add(card,"button","继续此案件");resume.onclick=()=>openCase(path,tip.caseId);
    if(path.length>1){
      const details=add(card,"details");add(details,"summary","从较早的提交继续");
      path.slice(0,-1).forEach((e,i)=>{
        const row=add(details,"p");
        const button=add(row,"button",(e.submittedAt?new Date(e.submittedAt).toLocaleString("zh-CN")+" · ":"")+e.text.slice(0,70),"secondary");
        button.onclick=()=>openCase(path.slice(0,i+1),crypto.randomUUID());
      });
    }
  }
}
async function restore(){
  database=await new Promise((resolve,reject)=>{
    const req=indexedDB.open("labor-case-history",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("entries",{autoIncrement:true});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  const old=sessionStorage.getItem("labor-online-rounds");
  if(old){
    const entries=await readEntries();
    for(const entry of JSON.parse(old)){
      if(!entries.some(r=>r.text===entry.text && r.summary===entry.summary)){
        await saveEntry(entry);entries.push(entry);
      }
    }
    sessionStorage.removeItem("labor-online-rounds");
  }
  await listCases();
  byId("new-case").disabled=false;
  byId("new-case").onclick=()=>openCase([],crypto.randomUUID());
  byId("switch-case").onclick=()=>{
    if(draft().trim() && !window.confirm("返回案件记录会放弃尚未提交的输入，继续吗？"))return;
    listCases();
  };
  await init();
}
restore().catch(()=>{byId("case-list").textContent="案件记录或服务暂时无法读取，请刷新重试。";});
const purposes = ["薪资谈判", "工作记录与出勤", "劳动关系", "工资支付与欠薪", "解除通知及经过（用于主张违法辞退）", "社保缴纳"];
function materialNotes() {
  return Array.from(document.querySelectorAll("#materials fieldset, .follow-materials fieldset"), group => {
    const tags = Array.from(group.querySelectorAll("input:checked"), input => input.value);
    const extra = group.querySelector("input[type=text]").value.trim();
    if (extra) tags.push(extra);
    return group.dataset.name + "｜拟证明：" + (tags.join("、") || "待标注");
  });
}
function draft() {
  const replies=Array.from(follow.querySelectorAll("textarea[data-question]"))
    .filter(input=>input.value.trim())
    .map(input=>"AI 追问："+input.dataset.question+"\n用户回答："+input.value.trim());
  return [byId("goal").value && "诉求：" + byId("goal").value, facts.value, ...replies, ...materialNotes(),
    byId("excerpt").value && "材料摘录：" + byId("excerpt").value].filter(Boolean).join("\n");
}
function caseText() {
  return [...rounds.map(r => r.text), draft()].filter(Boolean).join("\n\n");
}
function historyView() {
  byId("history").replaceChildren();
  [...rounds].reverse().forEach(r => {
    const block = add(byId("history"), "details");
    add(block,"summary",r.text.split("\n")[0].slice(0,55));
    submittedInput(block,r.text);
    if(r.submittedAt)add(block,"small",new Date(r.submittedAt).toLocaleString("zh-CN"));
    for(const file of r.attachments || []){
      const btn=add(block,"button",file.name,"secondary");
      btn.onclick=()=>{
        const url=URL.createObjectURL(file);
        const a=document.createElement("a");a.href=url;a.download=file.name;a.click();
        setTimeout(()=>URL.revokeObjectURL(url),1500);
      };
    }
    add(block,"h3","对应分析结果");
    if(r.analysis)renderReport(block,r.analysis,r.analysis.sources,(parent,title,url)=>{
      const a=add(parent,"a",title);a.href=url;a.target="_blank";a.rel="noopener";
    });
    else add(block,"p",r.summary || r.report || "");
    if(r.analysis?.questions?.length){
      add(block,"strong","当时待补充的问题");
      for(const q of r.analysis.questions)add(block,"p",q);
    }
  });
}
historyView();
function selectedFiles(){
  return [...byId("material").files,...(byId("follow-files")?.files || [])];
}
byId("material").onchange=()=>renderMaterials(byId("material"),byId("materials"));
function renderMaterials(upload,box){
  box.replaceChildren();
  for (const file of upload.files) {
    const group = add(box,"fieldset");
    group.dataset.name = file.name;
    add(group,"legend",file.name + " · 证明用途（可多选）");
    for (const purpose of purposes) {
      const label=add(group,"label");
      const input=add(label,"input");
      input.type="checkbox";
      input.value=purpose;
      label.append(document.createTextNode(purpose));
    }
    const label=add(group,"label","其他用途或具体待证事实");
    const custom=add(label,"input");
    custom.type="text";
    custom.maxLength=240;
    const extractButton=add(box,"button","本机提取文字");
    extractButton.type="button";
    extractButton.onclick=async () => {
      extractButton.disabled=true;
      try {
        const response=await fetch("/extract",{method:"POST",headers:{"X-File-Type":"."+file.name.split(".").pop()},body:file});
        const data=await response.json();
        if(!response.ok) throw new Error(data.error);
        if(!extractButton.isConnected) return;
        byId("excerpt").value += "\n"+file.name+"\n"+data.text;
        status.textContent=data.text ? "请核对识别结果并保留相关摘录。" : "未提取到文字，请手动摘录。";
      } catch(error) {status.textContent=error.message;}
      finally {extractButton.disabled=false;}
    };
    const url=URL.createObjectURL(file);
    if(file.type.startsWith("video/")) {const v=add(box,"video");v.controls=true;v.src=url;}
    else if(file.type.startsWith("audio/")) {const a=add(box,"audio");a.controls=true;a.src=url;}
    else if(file.type.startsWith("image/")) {const img=add(box,"img");img.src=url;img.alt=file.name;}
    else {const a=add(box,"a","查看原件");a.href=url;a.download=file.name;}
  }
};

const settings = byId("settings");
byId("configure").onclick = () => { byId("config-note").textContent = ""; settings.showModal(); };
byId("close-settings").onclick = () => settings.close();
settings.onclose = () => byId("key-form").reset();
byId("key-form").onsubmit = async event => {
  event.preventDefault();
  try {
    const response = await fetch("/config", {method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({key:byId("api-key").value})});
    if (!response.ok) throw new Error(response.status === 404 ? "当前服务版本较旧，请打开新版页面或重启服务。" : "保存失败，请检查密钥格式和本地服务。");
    cloud.disabled = false;
    byId("connection").textContent = "已配置 DeepSeek";
    settings.close();
  } catch (error) { byId("config-note").textContent = error.message; }
};
