// ---- Supabase setup ----
const SUPABASE_URL = 'https://hmxjngqxmesqixuxmoel.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_MyYPj-1x2dhgEOUASP50bA_UYO6mQwk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const syncDot = document.getElementById('syncDot');
function setSync(state) {
  syncDot.classList.remove('ok', 'err');
  if (state) syncDot.classList.add(state);
}

let goals = [];
let tasks = [];

// ---- Date helpers ----
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---- Load data ----
async function loadAll() {
  setSync(null);
  try {
    const [{ data: g, error: ge }, { data: t, error: te }] = await Promise.all([
      sb.from('goals').select('*').order('created_at', { ascending: true }),
      sb.from('tasks').select('*').order('created_at', { ascending: true })
    ]);
    if (ge || te) throw ge || te;
    goals = g || [];
    tasks = t || [];
    setSync('ok');
    renderAll();
  } catch (err) {
    console.error(err);
    setSync('err');
  }
}

// ---- Rendering ----
function renderAll() {
  populateGoalLinks();
  renderTaskList('daily', 'todayList', 'todayEmpty', t => t.due_date === todayStr());
  renderTaskList('weekly', 'weekList', 'weekEmpty');
  renderTaskList('monthly', 'monthList', 'monthEmpty');
  renderGoals();
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function populateGoalLinks() {
  ['today', 'week', 'month'].forEach(view => {
    const sel = document.getElementById(view + 'GoalLink');
    const current = sel.value;
    sel.innerHTML = '<option value="">No linked goal</option>' +
      goals.map(g => `<option value="${g.id}">${escapeHtml(g.title)}</option>`).join('');
    sel.value = current;
  });
}

function renderTaskList(timeframe, listId, emptyId, extraFilter) {
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  let items = tasks.filter(t => t.timeframe === timeframe);
  if (extraFilter) items = items.filter(extraFilter);
  items = items.slice().sort((a, b) => (a.done - b.done) || a.created_at.localeCompare(b.created_at));

  list.innerHTML = items.map(t => taskItemHtml(t)).join('');
  empty.classList.toggle('show', items.length === 0);

  list.querySelectorAll('.check').forEach(el => {
    el.addEventListener('click', () => toggleTask(el.dataset.id));
  });
  list.querySelectorAll('.task-del').forEach(el => {
    el.addEventListener('click', () => deleteTask(el.dataset.id));
  });
}

function taskItemHtml(t) {
  const goal = goals.find(g => g.id === t.goal_id);
  return `
    <li class="task-item ${t.done ? 'done' : ''}">
      <div class="check ${t.done ? 'done' : ''}" data-id="${t.id}"></div>
      <div class="task-body">
        <div class="task-title">${escapeHtml(t.title)}</div>
        ${goal ? `<span class="task-goal-tag">${escapeHtml(goal.title)}</span>` : ''}
      </div>
      <button class="task-del" data-id="${t.id}" aria-label="Delete">×</button>
    </li>`;
}

function renderGoals() {
  const list = document.getElementById('goalList');
  const empty = document.getElementById('goalEmpty');
  empty.classList.toggle('show', goals.length === 0);

  list.innerHTML = goals.map(g => {
    const linked = tasks.filter(t => t.goal_id === g.id);
    const doneCount = linked.filter(t => t.done).length;
    const pct = linked.length ? Math.round((doneCount / linked.length) * 100) : 0;
    const linkedHtml = linked.length
      ? `<div class="goal-linked-tasks">${linked.map(t => `
          <div class="goal-linked-task ${t.done ? 'done' : ''}">
            <span class="tf-badge">${t.timeframe}</span>
            <span>${escapeHtml(t.title)}</span>
          </div>`).join('')}</div>`
      : '';
    return `
      <li class="goal-card">
        <div class="goal-card-head">
          <span class="goal-title">${escapeHtml(g.title)}</span>
          <button class="task-del" data-id="${g.id}" data-goal="1" aria-label="Delete goal">×</button>
        </div>
        <div class="goal-progress-track"><div class="goal-progress-fill" style="width:${pct}%"></div></div>
        <div class="goal-progress-label">${doneCount} / ${linked.length} steps complete</div>
        ${linkedHtml}
      </li>`;
  }).join('');

  list.querySelectorAll('[data-goal]').forEach(el => {
    el.addEventListener('click', () => deleteGoal(el.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Mutations ----
async function addTask(timeframe, title, goalId, dueDate) {
  if (!title.trim()) return;
  const row = { title: title.trim(), timeframe, goal_id: goalId || null, due_date: dueDate || null, done: false };
  const { data, error } = await sb.from('tasks').insert(row).select().single();
  if (error) { console.error(error); setSync('err'); return; }
  tasks.push(data);
  renderAll();
}

async function toggleTask(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  t.done = !t.done;
  renderAll();
  const { error } = await sb.from('tasks').update({ done: t.done }).eq('id', id);
  if (error) { console.error(error); setSync('err'); }
}

async function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  renderAll();
  const { error } = await sb.from('tasks').delete().eq('id', id);
  if (error) { console.error(error); setSync('err'); }
}

async function addGoal(title) {
  if (!title.trim()) return;
  const { data, error } = await sb.from('goals').insert({ title: title.trim() }).select().single();
  if (error) { console.error(error); setSync('err'); return; }
  goals.push(data);
  renderAll();
}

async function deleteGoal(id) {
  goals = goals.filter(g => g.id !== id);
  tasks.forEach(t => { if (t.goal_id === id) t.goal_id = null; });
  renderAll();
  const { error } = await sb.from('goals').delete().eq('id', id);
  if (error) { console.error(error); setSync('err'); }
}

// ---- Wiring: add rows ----
document.getElementById('todayAdd').addEventListener('click', () => {
  const input = document.getElementById('todayInput');
  const goalId = document.getElementById('todayGoalLink').value;
  addTask('daily', input.value, goalId, todayStr());
  input.value = '';
});
document.getElementById('todayInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('todayAdd').click(); });

document.getElementById('weekAdd').addEventListener('click', () => {
  const input = document.getElementById('weekInput');
  const goalId = document.getElementById('weekGoalLink').value;
  addTask('weekly', input.value, goalId, null);
  input.value = '';
});
document.getElementById('weekInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('weekAdd').click(); });

document.getElementById('monthAdd').addEventListener('click', () => {
  const input = document.getElementById('monthInput');
  const goalId = document.getElementById('monthGoalLink').value;
  addTask('monthly', input.value, goalId, null);
  input.value = '';
});
document.getElementById('monthInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('monthAdd').click(); });

document.getElementById('goalAdd').addEventListener('click', () => {
  const input = document.getElementById('goalInput');
  addGoal(input.value);
  input.value = '';
});
document.getElementById('goalInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('goalAdd').click(); });

// ---- Tab switching ----
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
  });
});

// ---- All-mode toggle ----
const viewToggle = document.getElementById('viewToggle');
let allMode = false;
viewToggle.addEventListener('click', () => {
  allMode = !allMode;
  document.body.classList.toggle('all-mode', allMode);
  document.getElementById('tabs').classList.toggle('hidden', allMode);
  viewToggle.classList.toggle('active', allMode);
  if (allMode) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('active'));
  } else {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-today').classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab[data-view="today"]').classList.add('active');
  }
});

// ---- Init ----
loadAll();
