
// -------------------- DOM Helpers -------------------------------------------
function $(sel, root=document){ return root.querySelector(sel); }
function el(tag, props={}, children=[]) {
  const n = document.createElement(tag);
  Object.entries(props).forEach(([k,v])=>{
    if(k==='class') n.className=v; else if(k==='html') n.innerHTML=v; else if(k==='style') n.setAttribute('style', v); else n.setAttribute(k,v);
  });
  (Array.isArray(children)?children:[children]).forEach(c=>{ if(c!==null && c!==undefined) n.appendChild(c.nodeType?c:document.createTextNode(c)) });
  return n;
}

// -------------------- Constants & Helpers -----------------------------------
const PRIORITIES = {
  red:   { label: 'High',   xp: 30, pill:'red'   },
  yellow:{ label: 'Medium', xp: 20, pill:'yellow'},
  green: { label: 'Low',    xp: 10, pill:'green' },
};

function isoWeekKey(date = new Date()){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1..7 (Mon..Sun)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
}

// -------------------- State (localStorage) ----------------------------------
const LS_KEY = 'three_slot_planner_html_v1';
const defaultState = {
  tasks: { red:null, yellow:null, green:null },
  xpTotal: 0,
  xpByWeek: {},
  history: [],
};
function load(){
  try{ return { ...defaultState, ...(JSON.parse(localStorage.getItem(LS_KEY))||{}) }; }
  catch(e){ return defaultState }
}
function save(s){ localStorage.setItem(LS_KEY, JSON.stringify(s)); }
let state = load();

// -------------------- Tabs ---------------------------------------------------
let sections, activeTab='planner';
function switchTab(name){
  activeTab = name;
  Object.entries(sections).forEach(([k,el])=> el.classList.toggle('hidden', k!==name));
}

// -------------------- UI Rendering ------------------------------------------
function renderAll(){
  renderHeader();
  renderSlots();
  renderHistory();
  renderRobot();
  save(state);
}

function renderHeader(){
  $('#xpAll').textContent = state.xpTotal;
  const wk = state.xpByWeek[isoWeekKey()]||0;
  $('#xpWeek').textContent = wk;
}

// ----- Slots
function renderSlots(){
  document.querySelectorAll('.slot').forEach(container=>{
    const pr = container.dataset.priority;
    const task = state.tasks[pr];
    container.innerHTML = '';

    const header = el('div',{class:'row', style:'justify-content:space-between'},[
      el('div',{html:`<b>${PRIORITIES[pr].label} Priority</b>`}),
      el('span',{class:'chip', html:`${PRIORITIES[pr].xp} XP`})
    ]);
    container.appendChild(header);

    if(task){
      const view = el('div',{},[
        field('Task', task.title),
        field("Who’s involved", task.people||'—'),
        field('Deliverable', task.deliverable||'—'),
      ]);
      container.appendChild(view);

      const actions = el('div',{class:'row', style:'margin-top:8px'},[
        button('Edit', ()=>editTask(pr)),
        button(`Complete +${PRIORITIES[pr].xp} XP`, ()=>completeTask(pr), 'pri'),
        el('div',{class:'right'}),
        button('Delete', ()=>deleteTask(pr), 'warn')
      ]);
      container.appendChild(actions);
    } else {
      const form = taskForm(pr);
      container.appendChild(form);
    }
  });
}

function field(labelText, value){
  return el('div',{},[
    el('div',{class:'muted', style:'font-size:12px', html:labelText}),
    el('div',{style:'margin-top:4px', html: value })
  ]);
}

function button(text, onClick, kind){
  const b = el('button',{class:`btn ${kind||''}`},text);
  b.addEventListener('click', onClick); return b;
}

function taskForm(priority){
  const p = PRIORITIES[priority];
  const f = el('form');
  const title = el('input',{placeholder:'e.g., Draft investor update', maxlength:'160'});
  const people = el('input',{placeholder:'e.g., Jason, Melissa — report to CFO', maxlength:'160'});
  const deliver = el('input',{placeholder:'e.g., 1‑page update PDF', maxlength:'160'});

  f.append(
    labelWrap('One‑line task', title),
    labelWrap('Who’s involved (teammates, reporting to)', people),
    labelWrap('Deliverable', deliver),
    el('div',{class:'row', style:'margin-top:8px'},[
      button(`Add ${p.label}`, (e)=>{
        e.preventDefault();
        if(!title.value.trim()||!deliver.value.trim()) return;
        state.tasks[priority] = { title:title.value.trim(), people:people.value.trim(), deliverable:deliver.value.trim(), createdAt:new Date().toISOString() };
        renderAll();
      }),
      el('span',{class:'muted', style:'font-size:12px', html:`Only one ${p.label.toLowerCase()} task at a time.`})
    ])
  );
  return f;
}

function labelWrap(text,input){
  const w = el('div');
  w.append(el('label',{},text));
  w.append(input); return w;
}

function editTask(priority){
  const t = state.tasks[priority]; if(!t) return;
  const slot = document.querySelector(`.slot[data-priority="${priority}"]`);
  slot.innerHTML='';
  const title = el('input',{value:t.title, maxlength:'160'});
  const people = el('input',{value:t.people||'', maxlength:'160'});
  const deliver = el('input',{value:t.deliverable||'', maxlength:'160'});
  slot.append(
    el('div',{class:'row', style:'justify-content:space-between'},[
      el('div',{html:`<b>${PRIORITIES[priority].label} Priority</b>`}),
      el('span',{class:'chip', html:`${PRIORITIES[priority].xp} XP`})
    ]),
    labelWrap('One‑line task', title),
    labelWrap('Who’s involved (teammates, reporting to)', people),
    labelWrap('Deliverable', deliver),
    el('div',{class:'row', style:'margin-top:8px'},[
      button('Save', ()=>{ state.tasks[priority] = { ...t, title:title.value.trim(), people:people.value.trim(), deliverable:deliver.value.trim() }; renderAll(); }, 'pri'),
      el('div',{class:'right'}),
      button('Cancel', ()=>renderAll())
    ])
  );
}

function deleteTask(priority){ state.tasks[priority]=null; renderAll(); }

function completeTask(priority){
  const t = state.tasks[priority]; if(!t) return;
  const xp = PRIORITIES[priority].xp;
  const wk = isoWeekKey();
  const historyItem = { ...t, priority, xpAwarded: xp, completedAt:new Date().toISOString() };
  state.history = [historyItem, ...state.history].slice(0,500);
  state.tasks[priority] = null;
  state.xpTotal += xp;
  state.xpByWeek[wk] = (state.xpByWeek[wk]||0) + xp;
  renderAll();
}

// ----- History
function renderHistory(){
  const empty = $('#historyEmpty');
  const wrap = $('#historyTableWrap');
  const tbody = $('#historyTbody');
  if(!state.history.length){ empty.classList.remove('hidden'); wrap.classList.add('hidden'); return; }
  empty.classList.add('hidden'); wrap.classList.remove('hidden');
  tbody.innerHTML='';
  state.history.forEach(h=>{
    const tr = el('tr');
    tr.append(
      el('td',{},new Date(h.completedAt).toLocaleString()),
      el('td',{}, el('span',{class:`pill ${PRIORITIES[h.priority].pill}`}, PRIORITIES[h.priority].label)),
      el('td',{}, h.title),
      el('td',{}, h.people||'—'),
      el('td',{}, h.deliverable||'—'),
      el('td',{style:'text-align:right;font-weight:600'}, String(h.xpAwarded))
    );
    tbody.appendChild(tr);
  });
}

// ----- Robot
const PARTS = [
  { key:'legs',    label:'Legs',    xp:10  },
  { key:'body',    label:'Body',    xp:20  },
  { key:'arms',    label:'Arms',    xp:30  },
  { key:'head',    label:'Head',    xp:40  },
  { key:'antenna', label:'Antenna', xp:50  },
  { key:'eyes',    label:'Eyes',    xp:70  },
  { key:'jetpack', label:'Jetpack', xp:90  },
];

function renderRobot(){
  const wk = isoWeekKey();
  const xpThisWeek = state.xpByWeek[wk]||0;
  $('#xpWeek2').textContent = xpThisWeek;
  $('#weekKey').textContent = wk;

  const unlocked = PARTS.filter(p=> xpThisWeek >= p.xp).map(p=>p.key);
  const ul = $('#unlockList'); ul.innerHTML='';
  PARTS.forEach(p=>{
    const li = el('li',{class:'row', style:'justify-content:space-between;margin:6px 0'},[
      el('div',{class:'row', html:`<span style="width:8px;height:8px;border-radius:999px;display:inline-block;background:${xpThisWeek>=p.xp?'#10b981':'#cbd5e1'};margin-right:8px"></span>${p.label}`}),
      el('span',{class:'muted', style:`font-size:12px;color:${xpThisWeek>=p.xp?'#065f46':'#475569'}`}, `${p.xp} XP`)
    ]);
    ul.appendChild(li);
  });

  $('#robotCanvas').innerHTML = robotSVG(unlocked);
}

function robotSVG(unlocked){
  const has = k => unlocked.includes(k);
  return `
  <svg viewBox="0 0 220 260" width="100%" height="auto" style="max-width:360px">
    <ellipse cx="110" cy="240" rx="60" ry="8" fill="#e5e7eb" />
    <g opacity="${has('legs')?1:0.15}">
      <rect x="85" y="175" width="20" height="50" rx="6" fill="#64748b" />
      <rect x="115" y="175" width="20" height="50" rx="6" fill="#64748b" />
      <rect x="80" y="225" width="30" height="8" rx="4" fill="#334155" />
      <rect x="110" y="225" width="30" height="8" rx="4" fill="#334155" />
    </g>
    <g opacity="${has('body')?1:0.15}">
      <rect x="65" y="110" width="90" height="70" rx="12" fill="#94a3b8" />
      <rect x="75" y="120" width="70" height="10" rx="5" fill="#cbd5e1" />
      <rect x="75" y="135" width="70" height="35" rx="6" fill="#e2e8f0" />
    </g>
    <g opacity="${has('arms')?1:0.15}">
      <rect x="50" y="120" width="15" height="55" rx="8" fill="#64748b" />
      <rect x="155" y="120" width="15" height="55" rx="8" fill="#64748b" />
      <circle cx="58" cy="178" r="8" fill="#334155" />
      <circle cx="162" cy="178" r="8" fill="#334155" />
    </g>
    <g opacity="${has('head')?1:0.15}">
      <rect x="80" y="70" width="60" height="40" rx="10" fill="#94a3b8" />
    </g>
    <g opacity="${has('antenna')?1:0.15}">
      <rect x="108" y="40" width="4" height="30" rx="2" fill="#64748b" />
      <circle cx="110" cy="38" r="6" fill="#ef4444" />
    </g>
    <g opacity="${has('eyes')?1:0.15}">
      <circle cx="98" cy="90" r="6" fill="#0ea5e9" />
      <circle cx="122" cy="90" r="6" fill="#0ea5e9" />
    </g>
    <g opacity="${has('jetpack')?1:0.15}">
      <rect x="60" y="145" width="15" height="30" rx="4" fill="#475569" />
      <rect x="145" y="145" width="15" height="30" rx="4" fill="#475569" />
      <polygon points="68,178 76,178 72,195" fill="#fb923c" />
      <polygon points="152,178 160,178 156,195" fill="#fb923c" />
    </g>
  </svg>`;
}

// -------------------- PWA Registration & Install ----------------------------
function pwaSetup(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
  let deferredPrompt = null; const installBtn = $('#installBtn');
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault(); deferredPrompt = e; installBtn.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', ()=>{ deferredPrompt = null; installBtn.classList.add('hidden'); });
  installBtn.addEventListener('click', async ()=>{
    if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; installBtn.classList.add('hidden');
  });
}

// -------------------- Boot ---------------------------------------------------
document.addEventListener('DOMContentLoaded', ()=>{
  sections = { planner:$('#planner'), robot:$('#robot'), history:$('#history') };
  document.querySelectorAll('nav [data-tab]').forEach(btn=>btn.addEventListener('click', ()=>switchTab(btn.dataset.tab)));
  $('#resetBtn').addEventListener('click',()=>{
    if(confirm('Reset all data? This cannot be undone.')){ state = { ...defaultState }; renderAll(); }
  });
  $('#updateBtn').addEventListener('click', async ()=>{
    if('serviceWorker' in navigator && navigator.serviceWorker.controller){
      const mc = new MessageChannel();
      mc.port1.onmessage = () => window.location.reload();
      navigator.serviceWorker.controller.postMessage({type:'CLEAR_CACHE'}, [mc.port2]);
    } else {
      window.location.reload();
    }
  });
  const powerLink = $('#powerLink');
  const powerModal = $('#powerModal');
  const powerClose = $('#powerClose');
  powerLink.addEventListener('click', e=>{ e.preventDefault(); powerModal.classList.remove('hidden'); });
  powerClose.addEventListener('click', ()=> powerModal.classList.add('hidden'));
  powerModal.addEventListener('click', e=>{ if(e.target===powerModal) powerModal.classList.add('hidden'); });
  renderAll();
  switchTab('planner');
  pwaSetup();
});
