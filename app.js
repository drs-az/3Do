
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
const TASK_XP = 5;
const PRIORITIES = {
  red:   { label: 'High',   pill:'red'   },
  yellow:{ label: 'Medium', pill:'yellow'},
  green: { label: 'Low',    pill:'green' },
};

function isoWeekKey(date = new Date()){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1..7 (Mon..Sun)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
}

const logSound = new Audio('sounds/log.mp3');
function playLogSound(){
  logSound.currentTime = 0;
  logSound.play().catch(()=>{});
}

// -------------------- State (localStorage) ----------------------------------
const LS_KEY = 'three_slot_planner_html_v1';
function generateId(){
  if(window.crypto && window.crypto.randomUUID){
    return window.crypto.randomUUID();
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

const defaultState = {
  tasks: [],
  xpTotal: 0,
  xpByWeek: {},
  history: [],
};
function ensureTaskId(task){
  if(task.id) return task;
  return { ...task, id: generateId() };
}
function migrateTasks(savedTasks){
  if(Array.isArray(savedTasks)){
    return savedTasks.map(ensureTaskId);
  }
  if(savedTasks && typeof savedTasks === 'object'){
    return Object.entries(savedTasks)
      .filter(([,task])=>!!task)
      .map(([priority, task])=> ensureTaskId({ ...task, priority }))
      .sort((a,b)=> new Date(a.createdAt||0) - new Date(b.createdAt||0));
  }
  return [];
}
function load(){
  try{
    const raw = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    const state = { ...defaultState, ...raw };
    state.tasks = migrateTasks(raw.tasks);
    return state;
  }
  catch(e){ return { ...defaultState }; }
}
function save(s){ localStorage.setItem(LS_KEY, JSON.stringify(s)); }
let state = load();

// -------------------- Tabs ---------------------------------------------------
let sections, activeTab='planner', historyModal, historyDetails;
let editingTaskId = null;
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
  renderTaskCreator();
  renderTaskColumns();
}

function field(labelText, value){
  return el('div',{},[
    el('div',{class:'muted', style:'font-size:12px', html:labelText}),
    el('div',{style:'margin-top:4px', html: value })
  ]);
}

function button(text, onClick, kind, props={}){
  const { class: extraClass = '', ...rest } = props;
  const classes = ['btn', kind||'', extraClass].filter(Boolean).join(' ');
  const b = el('button',{ ...rest, class: classes },text);
  if(onClick) b.addEventListener('click', onClick);
  return b;
}

function labelWrap(text,input){
  const w = el('div');
  w.append(el('label',{},text));
  w.append(input); return w;
}

function renderTaskCreator(){
  const container = $('#taskCreator');
  if(!container) return;
  container.innerHTML = '';

  const form = el('form',{class:'task-form'});
  const title = el('input',{placeholder:'e.g., Draft investor update', maxlength:'160'});
  const people = el('input',{placeholder:'e.g., Jason, Melissa — report to CFO', maxlength:'160'});
  const deliver = el('input',{placeholder:'e.g., 1‑page update PDF', maxlength:'160'});
  const priority = el('select');
  Object.entries(PRIORITIES).forEach(([value, info])=>{
    priority.append(el('option',{value}, info.label));
  });
  const defaultPriority = Object.keys(PRIORITIES)[0];
  priority.value = defaultPriority;

  const fields = el('div',{class:'task-form-grid'},[
    labelWrap('One‑line task', title),
    labelWrap('Who’s involved (teammates, reporting to)', people),
    labelWrap('Deliverable', deliver),
    labelWrap('Priority', priority)
  ]);

  const actions = el('div',{class:'row', style:'margin-top:8px'},[
    button('Add Task', null, 'pri', { type:'submit' }),
    el('span',{class:'muted', style:'font-size:12px'}, `Each task awards ${TASK_XP} XP.`)
  ]);

  form.append(fields, actions);
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const titleValue = title.value.trim();
    const deliverValue = deliver.value.trim();
    if(!titleValue || !deliverValue) return;
    const newTask = {
      id: generateId(),
      title: titleValue,
      people: people.value.trim(),
      deliverable: deliverValue,
      priority: priority.value,
      createdAt: new Date().toISOString(),
    };
    state.tasks = [...state.tasks, newTask];
    title.value='';
    people.value='';
    deliver.value='';
    priority.value = defaultPriority;
    editingTaskId = null;
    renderAll();
    playLogSound();
  });

  container.appendChild(form);
}

function renderTaskColumns(){
  const grouped = Object.keys(PRIORITIES).reduce((acc,key)=>{ acc[key]=[]; return acc; }, {});
  state.tasks.forEach(task=>{
    const key = PRIORITIES[task.priority] ? task.priority : Object.keys(PRIORITIES)[0];
    grouped[key].push(task);
  });
  Object.values(grouped).forEach(list=>{
    list.sort((a,b)=> new Date(a.createdAt||0) - new Date(b.createdAt||0));
  });

  document.querySelectorAll('.slot').forEach(container=>{
    const pr = container.dataset.priority;
    const info = PRIORITIES[pr] || PRIORITIES[Object.keys(PRIORITIES)[0]];
    const tasks = grouped[pr]||[];
    container.innerHTML = '';

    const header = el('div',{class:'row slot-header', style:'justify-content:space-between'},[
      el('div',{html:`<b>${info.label} Priority</b>`}),
      el('span',{class:'chip', html:`${tasks.length} task${tasks.length===1?'':'s'}`})
    ]);
    container.appendChild(header);

    if(!tasks.length){
      container.appendChild(el('div',{class:'muted empty-state', html:'No tasks yet.'}));
      return;
    }

    tasks.forEach(task=> container.appendChild(taskCard(task)));
  });
}

function taskCard(task){
  const fallback = PRIORITIES[Object.keys(PRIORITIES)[0]];
  const info = PRIORITIES[task.priority] || fallback;
  const card = el('div',{class:`task-card ${info.pill}`});
  const pillEl = el('span',{class:`pill ${info.pill}`}, info.label);
  const xpEl = el('span',{class:'chip', html:`${TASK_XP} XP`});
  const header = el('div',{class:'row task-card-header', style:'justify-content:space-between'},[
    pillEl,
    xpEl
  ]);

  if(editingTaskId === task.id){
    const title = el('input',{value:task.title, maxlength:'160'});
    const people = el('input',{value:task.people||'', maxlength:'160'});
    const deliver = el('input',{value:task.deliverable||'', maxlength:'160'});
    const priority = el('select');
    Object.entries(PRIORITIES).forEach(([value, pInfo])=>{
      priority.append(el('option',{value}, pInfo.label));
    });
    priority.value = task.priority;
    priority.addEventListener('change', ()=>{
      const nextInfo = PRIORITIES[priority.value] || fallback;
      pillEl.textContent = nextInfo.label;
      pillEl.className = `pill ${nextInfo.pill}`;
      card.className = `task-card ${nextInfo.pill}`;
    });

    const fields = el('div',{class:'task-form-grid'},[
      labelWrap('One‑line task', title),
      labelWrap('Who’s involved (teammates, reporting to)', people),
      labelWrap('Deliverable', deliver),
      labelWrap('Priority', priority)
    ]);

    const actions = el('div',{class:'row task-actions'},[
      button('Save', ()=>{
        const titleValue = title.value.trim();
        const deliverValue = deliver.value.trim();
        if(!titleValue || !deliverValue) return;
        saveTaskEdits(task.id, {
          title: titleValue,
          people: people.value.trim(),
          deliverable: deliverValue,
          priority: priority.value,
        });
      }, 'pri'),
      button('Cancel', ()=>cancelEditTask(), null),
      el('div',{class:'right'}),
      button('Delete', ()=>deleteTask(task.id), 'warn')
    ]);

    card.append(header, fields, actions);
    return card;
  }

  const details = el('div',{class:'task-details'},[
    field('Task', task.title),
    field("Who’s involved", task.people||'—'),
    field('Deliverable', task.deliverable||'—')
  ]);

  const actions = el('div',{class:'row task-actions'},[
    button('Edit', ()=>startEditTask(task.id)),
    button(`Complete +${TASK_XP} XP`, ()=>completeTask(task.id), 'pri'),
    el('div',{class:'right'}),
    button('Delete', ()=>deleteTask(task.id), 'warn')
  ]);

  card.append(header, details, actions);
  return card;
}

function startEditTask(id){
  editingTaskId = id;
  renderAll();
}

function cancelEditTask(){
  editingTaskId = null;
  renderAll();
}

function saveTaskEdits(id, updates){
  const idx = state.tasks.findIndex(t=>t.id===id);
  if(idx===-1) return;
  state.tasks[idx] = { ...state.tasks[idx], ...updates };
  editingTaskId = null;
  renderAll();
}

function deleteTask(id){
  const idx = state.tasks.findIndex(t=>t.id===id);
  if(idx===-1) return;
  state.tasks.splice(idx,1);
  if(editingTaskId === id) editingTaskId = null;
  renderAll();
}

function completeTask(id){
  const idx = state.tasks.findIndex(t=>t.id===id);
  if(idx===-1) return;
  const [task] = state.tasks.splice(idx,1);
  const xp = TASK_XP;
  const wk = isoWeekKey();
  const historyItem = { ...task, xpAwarded: xp, completedAt:new Date().toISOString() };
  state.history = [historyItem, ...state.history].slice(0,500);
  state.xpTotal += xp;
  state.xpByWeek[wk] = (state.xpByWeek[wk]||0) + xp;
  editingTaskId = null;
  renderAll();
  playLogSound();
}

// ----- History
function renderHistory(){
  const empty = $('#historyEmpty');
  const wrap = $('#historyTableWrap');
  const tbody = $('#historyTbody');
  if(!state.history.length){ empty.classList.remove('hidden'); wrap.classList.add('hidden'); return; }
  empty.classList.add('hidden'); wrap.classList.remove('hidden');
  tbody.innerHTML='';
  state.history.forEach((h,idx)=>{
    const tr = el('tr');
    const link = el('a',{href:'#'},'View');
    link.addEventListener('click', e=>{ e.preventDefault(); showHistoryDetails(idx); });
    tr.append(
      el('td',{}, new Date(h.completedAt).toLocaleString()),
      el('td',{}, [
        el('div',{}, h.title),
        el('div',{style:'margin-top:4px'}, link)
      ])
    );
    tbody.appendChild(tr);
  });
}

function showHistoryDetails(idx){
  const h = state.history[idx];
  if(!h) return;
  const info = PRIORITIES[h.priority] || { label: (h.priority||'—') };
  historyDetails.innerHTML = `
    <p><b>Task:</b> ${h.title}</p>
    <p><b>Priority:</b> ${info.label}</p>
    <p><b>Involved:</b> ${h.people || '—'}</p>
    <p><b>Deliverable:</b> ${h.deliverable || '—'}</p>
    <p><b>XP:</b> ${h.xpAwarded}</p>
    <p><b>Completed:</b> ${new Date(h.completedAt).toLocaleString()}</p>
  `;
  historyModal.classList.remove('hidden');
}

// ----- Robot
const PARTS = [
  { key:'legs',    label:'Legs',    xp:30  },
  { key:'body',    label:'Body',    xp:60  },
  { key:'arms',    label:'Arms',    xp:90  },
  { key:'head',    label:'Head',    xp:120  },
  { key:'antenna', label:'Antenna', xp:150  },
  { key:'eyes',    label:'Eyes',    xp:180  },
  { key:'jetpack', label:'Jetpack', xp:210  },
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
  const resetModal = $('#resetModal');
  const resetConfirm = $('#resetConfirm');
  const resetCancel = $('#resetCancel');
  $('#resetBtn').addEventListener('click',()=> resetModal.classList.remove('hidden'));
  resetCancel.addEventListener('click', ()=> resetModal.classList.add('hidden'));
  resetConfirm.addEventListener('click', ()=>{
    state = { ...defaultState };
    renderAll();
    resetModal.classList.add('hidden');
  });
  resetModal.addEventListener('click', e=>{ if(e.target===resetModal) resetModal.classList.add('hidden'); });
  const updateBtn = $('#updateBtn');
  if('serviceWorker' in navigator && !navigator.serviceWorker.controller){
    updateBtn.disabled = true;
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      updateBtn.disabled = false;
    }, { once:true });
  }
  updateBtn.addEventListener('click', async ()=>{
    if('serviceWorker' in navigator){
      const sw = await navigator.serviceWorker.ready.then(reg=>reg.active);
      if(sw){
        const mc = new MessageChannel();
        mc.port1.onmessage = () => window.location.reload();
        sw.postMessage({type:'CLEAR_CACHE'}, [mc.port2]);
      } else {
        alert('No Service Worker available to update.');
      }
    } else {
      alert('Service Worker not supported.');
    }
  });
  const powerLink = $('#powerLink');
  const powerModal = $('#powerModal');
  const powerClose = $('#powerClose');
  powerLink.addEventListener('click', e=>{ e.preventDefault(); powerModal.classList.remove('hidden'); });
  powerClose.addEventListener('click', ()=> powerModal.classList.add('hidden'));
  powerModal.addEventListener('click', e=>{ if(e.target===powerModal) powerModal.classList.add('hidden'); });
  historyModal = $('#historyModal');
  historyDetails = $('#historyDetails');
  const historyClose = $('#historyClose');
  historyClose.addEventListener('click', ()=> historyModal.classList.add('hidden'));
  historyModal.addEventListener('click', e=>{ if(e.target===historyModal) historyModal.classList.add('hidden'); });
  renderAll();
  switchTab('planner');
  pwaSetup();
});
