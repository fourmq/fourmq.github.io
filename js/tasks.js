import { escapeHtml, svgIcon, todayStr, uid, WEEKDAYS_LONG, haptic, playSound, PALETTE } from './utils.js';
import { state, save } from './db.js';

export function matchesRecurrence(t, dateStr) {
  const r = t.recurrence;
  if (!r) return t.date === dateStr;
  const d = new Date(dateStr + 'T12:00:00');
  if (r === 'daily') return true;
  if (r === 'weekdays') return d.getDay() >= 1 && d.getDay() <= 5;
  if (r === 'weekly') { const start = new Date(t.createdAt); return d.getDay() === start.getDay(); }
  return false;
}

export function isTaskDoneOn(t, dateStr) {
  if (t.recurrence) return !!t.completions[dateStr];
  return t.done;
}

export function formatDuration(min) {
  if (min < 60) return min + ' мин';
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}ч ${m}м` : `${h}ч`;
}

export function formatTaskDate(d) {
  const today = todayStr();
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  if (d === today) return 'Сегодня';
  if (d === tom.toISOString().slice(0, 10)) return 'Завтра';
  return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function taskRowHTML(t, dateStr = window.currentDate, opts = {}) {
  const done = isTaskDoneOn(t, dateStr);
  const project = t.projectId ? state.projects.find(p => p.id === t.projectId) : null;
  const showDate = opts.hideDate ? false : (!t.recurrence && t.date);
  const dateLabel = showDate ? formatTaskDate(t.date) : '';
  const timeLabel = t.startTime ? '⏰ ' + t.startTime : '';
  const durLabel = t.duration ? '⏱ ' + formatDuration(t.duration) : '';
  const recurLabel = t.recurrence ? '🔁 ' + ({ daily: 'каждый день', weekdays: 'будни', weekly: 'еженед.' }[t.recurrence]) : '';
  
  let dateClass = '';
  if (t.date) { if (t.date < todayStr()) dateClass = 'overdue'; else if (t.date === todayStr()) dateClass = 'today'; else dateClass = 'future'; }
  
  return `
    <div class="task-row" data-task-id="${t.id}">
      <div class="check-circle ${done ? 'done' : ''} p${t.priority}" onclick="event.stopPropagation();window.toggleTask(${t.id},'${dateStr}',this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="task-body" onclick="window.openTaskEditor(${t.id})">
        <div class="task-title ${done ? 'done' : ''}">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          ${dateLabel ? `<span class="date-tag ${dateClass}">${svgIcon('calendar', 'currentColor', 12)} ${dateLabel}</span>` : ''}
          ${timeLabel ? `<span>${timeLabel}</span>` : ''}
          ${durLabel ? `<span>${durLabel}</span>` : ''}
          ${project ? `<span class="project-tag"><span class="project-dot" style="background:${project.color}"></span>${escapeHtml(project.name)}</span>` : ''}
          ${recurLabel ? `<span style="color:var(--text-sec);font-size:11px;">${recurLabel}</span>` : ''}
        </div>
      </div>
      <button class="del-x" onclick="event.stopPropagation();window.removeTask(${t.id})">${svgIcon('x', 'currentColor', 18)}</button>
    </div>
  `;
}

export function toggleTask(id, dateStr = window.currentDate, el) {
  const t = state.tasks.find(x => x.id === id); if (!t) return;
  const wasDone = isTaskDoneOn(t, dateStr);
  if (t.recurrence) t.completions[dateStr] = !t.completions[dateStr]; else t.done = !t.done;
  const nowDone = isTaskDoneOn(t, dateStr);
  if (nowDone && !wasDone) {
    haptic('success'); playSound('success');
    if (el) { el.classList.add('checking'); const row = el.closest('.task-row'); if (row) row.classList.add('completing'); }
    save(); setTimeout(() => { window.renderAll(); }, 500); return;
  }
  if (el) { el.classList.add('checking'); setTimeout(() => el.classList.remove('checking'), 400); }
  save(); window.renderAll();
}
window.toggleTask = toggleTask;

export function removeTask(id) {
  if (!confirm('Удалить задачу?')) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  haptic(); save(); window.renderAll();
}
window.removeTask = removeTask;

export function openTaskEditor(id) {
  const editingTaskId = id || null;
  const t = id ? state.tasks.find(x => x.id === id) : { title: '', description: '', date: window.currentDate, startTime: null, duration: null, priority: 4, projectId: null, recurrence: null };
  const project = t.projectId ? state.projects.find(p => p.id === t.projectId) : null;
  const prioLabel = t.priority < 4 ? 'P' + t.priority : 'Приоритет';
  const prioClass = t.priority < 4 ? 'p' + t.priority : '';
  const recurLabel = t.recurrence ? ({daily:'Каждый день', weekdays:'Будни', weekly:'Раз в неделю'}[t.recurrence]) : 'Повтор';

  window.openSheet(`
    <div class="td-editor">
      <input type="text" id="t-title" class="td-title-input" value="${escapeHtml(t.title)}" placeholder="Название задачи" autocomplete="off">
      <input type="text" id="t-desc" class="td-desc-input" value="${escapeHtml(t.description || '')}" placeholder="Описание" autocomplete="off">
      <div class="td-toolbar">
        <button type="button" class="td-btn date-btn" id="chip-date" onclick="document.getElementById('t-date').showPicker()">
          ${svgIcon('calendar', 'currentColor', 14)}
          <span id="chip-date-text">${t.date ? formatTaskDate(t.date) : 'Дата'}</span>
          <input type="date" id="t-date" value="${t.date || ''}" onchange="window.updateTaskChipDate(this.value)">
        </button>
        
        <button type="button" class="td-btn" id="chip-recur" onclick="window.openRecurrencePicker()">
          ${svgIcon('refresh', 'currentColor', 14)}
          <span id="chip-recur-text">${recurLabel}</span>
        </button>

        <button type="button" class="td-btn prio-btn ${prioClass}" id="chip-prio" onclick="window.openPriorityPicker()">
          ${svgIcon('flag', 'currentColor', 14)}
          <span id="chip-prio-text">${prioLabel}</span>
        </button>
        <button type="button" class="td-btn project-btn" onclick="window.openProjectPicker()">
          <span class="project-dot" id="chip-project-dot" style="background:${project?.color || 'var(--text-tert)'}"></span>
          <span id="chip-project-text">${project?.name || 'Проект'}</span>
        </button>
      </div>
      <div class="td-detail-row">
        <div class="td-detail-item">${svgIcon('clock', 'currentColor', 14)}<input type="time" id="t-time" value="${t.startTime || ''}"></div>
        <div class="td-detail-item">${svgIcon('target', 'currentColor', 14)}<input type="number" id="t-duration" min="0" max="1440" step="5" value="${t.duration || ''}" placeholder="0"><span>мин</span></div>
      </div>
      <div class="td-actions">
        <button class="btn-cancel" style="width:auto;margin:0;padding:10px 20px;" onclick="window.closeSheet()">Отмена</button>
        <button class="btn-save-task" onclick="window.saveTask()">Сохранить</button>
      </div>
    </div>
    <input type="hidden" id="t-priority" value="${t.priority}">
    <input type="hidden" id="t-project" value="${t.projectId || ''}">
    <input type="hidden" id="t-recurrence" value="${t.recurrence || ''}">
    <input type="hidden" id="t-editing-id" value="${editingTaskId || ''}">
  `);
  window.updateTaskChipDate(t.date || '');
  setTimeout(() => { const el = document.getElementById('t-title'); if (el) el.focus(); }, 100);
}
window.openTaskEditor = openTaskEditor;

// --- Вспомогательные функции редактора ---
window.updateTaskChipDate = function(val) {
  const chipText = document.getElementById('chip-date-text');
  const chip = document.getElementById('chip-date');
  if (!chipText || !chip) return;
  chip.classList.remove('today', 'overdue', 'future');
  if (!val) { chipText.textContent = 'Дата'; return; }
  chipText.textContent = formatTaskDate(val);
  if (val === todayStr()) chip.classList.add('today');
  else if (val < todayStr()) chip.classList.add('overdue');
  else chip.classList.add('future');
};

window.openRecurrencePicker = function() {
  const cur = document.getElementById('t-recurrence').value;
  const content = document.getElementById('popover-content');
  content.innerHTML = `
    <h4 style="padding: 4px 12px 8px; font-size: 11px; color: var(--text-sec); font-weight: 700; text-transform: uppercase;">Повторение</h4>
    ${[{val:'',label:'Не повторять'},{val:'daily',label:'Каждый день'},{val:'weekdays',label:'По будням'},{val:'weekly',label:'Раз в неделю'}].map(o => `
      <div class="popover-item ${cur===o.val?'active':''}" onclick="window.pickRecurrence('${o.val}')">
        <span>${o.label}</span>
        ${cur===o.val?'<span style="margin-left:auto;color:var(--td-green);font-weight:700;">✓</span>':''}
      </div>
    `).join('')}
  `;
  document.getElementById('popover-overlay').classList.add('open');
};

window.pickRecurrence = function(val) {
  document.getElementById('t-recurrence').value = val;
  const text = document.getElementById('chip-recur-text');
  text.textContent = val ? ({daily:'Каждый день', weekdays:'Будни', weekly:'Раз в неделю'}[val]) : 'Повтор';
  window.closePopover();
};

window.openPriorityPicker = function() {
  const cur = +document.getElementById('t-priority').value;
  const content = document.getElementById('popover-content');
  content.innerHTML = `
    <h4 style="padding: 4px 12px 8px; font-size: 11px; color: var(--text-sec); font-weight: 700; text-transform: uppercase;">Приоритет</h4>
    ${[1, 2, 3, 4].map(p => `
      <div class="popover-item ${cur === p ? 'active' : ''}" onclick="window.pickPriority(${p})">
        <div class="flag-icon" style="background:${p === 1 ? 'var(--td-red)' : p === 2 ? 'var(--td-orange)' : p === 3 ? 'var(--td-blue)' : 'transparent'};${p === 4 ? 'border:1px solid var(--text-sec)' : ''}"></div>
        <span>P${p} — ${p === 1 ? 'Срочный' : p === 2 ? 'Высокий' : p === 3 ? 'Средний' : 'Без приоритета'}</span>
        ${cur === p ? '<span style="margin-left:auto;color:var(--td-green);font-weight:700;">✓</span>' : ''}
      </div>
    `).join('')}
  `;
  document.getElementById('popover-overlay').classList.add('open');
};

window.pickPriority = function(p) {
  document.getElementById('t-priority').value = p;
  const chip = document.getElementById('chip-prio');
  const text = document.getElementById('chip-prio-text');
  chip.className = 'td-btn prio-btn' + (p < 4 ? ' p' + p : '');
  text.textContent = p < 4 ? 'P' + p : 'Приоритет';
  window.closePopover();
};

window.openProjectPicker = function() {
  const cur = document.getElementById('t-project').value;
  const content = document.getElementById('popover-content');
  content.innerHTML = `
    <h4 style="padding: 4px 12px 8px; font-size: 11px; color: var(--text-sec); font-weight: 700; text-transform: uppercase;">Проект</h4>
    <div class="popover-item ${!cur ? 'active' : ''}" onclick="window.pickProject('')">
      <span class="project-dot" style="background:var(--text-tert)"></span><span>Без проекта</span>
      ${!cur ? '<span style="margin-left:auto;color:var(--td-green);font-weight:700;">✓</span>' : ''}
    </div>
    ${state.projects.map(p => `
      <div class="popover-item ${+cur === p.id ? 'active' : ''}" onclick="window.pickProject('${p.id}')">
        <span class="project-dot" style="background:${p.color}"></span><span>${escapeHtml(p.name)}</span>
        ${+cur === p.id ? '<span style="margin-left:auto;color:var(--td-green);font-weight:700;">✓</span>' : ''}
      </div>
    `).join('')}
  `;
  document.getElementById('popover-overlay').classList.add('open');
};

window.pickProject = function(id) {
  document.getElementById('t-project').value = id;
  const dot = document.getElementById('chip-project-dot');
  const text = document.getElementById('chip-project-text');
  if (!id) { dot.style.background = 'var(--text-tert)'; text.textContent = 'Проект'; }
  else { const p = state.projects.find(x => x.id === +id); if (p) { dot.style.background = p.color; text.textContent = p.name; } }
  window.closePopover();
};

window.saveTask = function() {
  const editingTaskId = document.getElementById('t-editing-id').value;
  const title = document.getElementById('t-title').value.trim();
  if (!title) { alert('Введите название'); return; }
  const description = document.getElementById('t-desc').value.trim();
  const date = document.getElementById('t-date').value || null;
  const startTime = document.getElementById('t-time').value || null;
  const duration = parseInt(document.getElementById('t-duration').value) || null;
  const priority = parseInt(document.getElementById('t-priority').value) || 4;
  const projVal = document.getElementById('t-project').value;
  const projectId = projVal ? parseInt(projVal) : null;
  const recurrence = document.getElementById('t-recurrence').value || null;
  
  if (editingTaskId) {
    const t = state.tasks.find(x => x.id == editingTaskId);
    Object.assign(t, { title, description, date, startTime, duration, priority, projectId, recurrence });
  } else {
    state.tasks.push({ id: uid(), title, description, done: false, date, startTime, duration, priority, projectId, recurrence, subtasks: [], tags: [], completions: {}, createdAt: Date.now() });
  }
  haptic('success'); playSound('success'); save(); window.closeSheet(); window.renderAll();
};

export function renderTasks() {
  const filtersEl = document.getElementById('task-filters');
  const content = document.getElementById('tasks-content');
  const today = window.currentDate;
  const realToday = todayStr();
  
  const todayTasks = state.tasks.filter(t => t.recurrence ? (matchesRecurrence(t, today) && !isTaskDoneOn(t, today)) : (t.date === today && !t.done));
  const allActive = state.tasks.filter(t => !isTaskDoneOn(t, realToday));
  
  const filters = [
    { id: 'today', label: 'Сегодня', count: todayTasks.length },
    { id: 'week', label: 'Неделя', count: null },
    { id: 'all', label: 'Все', count: allActive.length },
    { id: 'projects', label: 'Проекты', count: state.projects.length }
  ];
  
  filtersEl.innerHTML = filters.map(f => `
    <button class="filter-pill ${state.taskFilter === f.id ? 'active' : ''}" onclick="window.setTaskFilter('${f.id}')">
      ${f.label}${f.count !== null ? ` <span class="count">${f.count}</span>` : ''}
    </button>
  `).join('');
  
  if (state.taskFilter === 'projects') {
    let projHtml = '';
    state.projects.forEach(p => {
      const c = state.tasks.filter(t => t.projectId === p.id && !isTaskDoneOn(t, realToday)).length;
      projHtml += `
        <div class="card flat" style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="window.openProject(${p.id})">
          <span style="width:12px;height:12px;border-radius:3px;background:${p.color};"></span>
          <div style="flex:1;font-weight:600;">${escapeHtml(p.name)}</div>
          <span style="color:var(--text-sec);font-size:13px;">${c}</span>
        </div>
      `;
    });
    
    content.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input id="new-project" placeholder="Новый проект" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--separator-med);background:var(--card);color:var(--text);outline:none;font-size:16px;height:42px;" onkeydown="if(event.key==='Enter')window.addProject()">
        <button onclick="window.addProject()" style="padding:10px 18px;background:var(--td-red);color:#fff;border:none;border-radius:10px;font-size:18px;cursor:pointer;">+</button>
      </div>
      ${projHtml}
    `;
    return;
  }
  
  if (state.taskFilter === 'week') {
    content.innerHTML = renderWeekView().html;
    return;
  }
  
  if (state.taskFilter === 'all') {
    const allFilter = state.taskAllFilter || 'active';
    const subchips = `
      <div class="all-subfilters">
        <button class="subfilter-chip ${allFilter === 'active' ? 'active' : ''}" onclick="window.setAllFilter('active')">Активные</button>
        <button class="subfilter-chip ${allFilter === 'overdue' ? 'active' : ''}" onclick="window.setAllFilter('overdue')">Просроченные</button>
        <button class="subfilter-chip ${allFilter === 'no-date' ? 'active' : ''}" onclick="window.setAllFilter('no-date')">Без даты</button>
        <button class="subfilter-chip ${allFilter === 'done' ? 'active' : ''}" onclick="window.setAllFilter('done')">Выполненные</button>
      </div>
    `;
    
    let tasks = [];
    if (allFilter === 'active') tasks = state.tasks.filter(t => !t.done && !t.recurrence);
    else if (allFilter === 'overdue') tasks = state.tasks.filter(t => !t.done && t.date && t.date < realToday && !t.recurrence);
    else if (allFilter === 'no-date') tasks = state.tasks.filter(t => !t.done && !t.date && !t.recurrence);
    else tasks = state.tasks.filter(t => t.done || (t.recurrence && Object.values(t.completions || {}).some(Boolean)));
    
    tasks.sort((a, b) => { if (a.priority !== b.priority) return a.priority - b.priority; if (a.date && b.date) return a.date.localeCompare(b.date); if (a.date) return -1; if (b.date) return 1; return 0; });
    content.innerHTML = subchips + (tasks.length ? `<div class="card tight">${tasks.map(t => taskRowHTML(t, t.date || realToday)).join('')}</div>` : `<div class="card"><div class="empty-hint">Нет задач в этой категории.</div></div>`);
    return;
  }
  
  let tasks = state.tasks.filter(t => t.recurrence ? matchesRecurrence(t, today) : t.date === today);
  tasks.sort((a, b) => { const aDone = isTaskDoneOn(a, today) ? 1 : 0; const bDone = isTaskDoneOn(b, today) ? 1 : 0; if (aDone !== bDone) return aDone - bDone; if (a.priority !== b.priority) return a.priority - b.priority; if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime); return 0; });
  content.innerHTML = tasks.length ? `<div class="card tight">${tasks.map(t => taskRowHTML(t, today)).join('')}</div>` : `<div class="card"><div class="empty-hint">Задач нет.<br>Нажмите +, чтобы добавить.</div></div>`;
}

export function renderTasksTodayMini() {
  const t = window.currentDate;
  const tasks = state.tasks.filter(x => x.recurrence ? matchesRecurrence(x, t) : x.date === t);
  document.getElementById('tasks-today-mini').innerHTML = tasks.length ? tasks.map(x => taskRowHTML(x, t)).join('') : '<div class="empty-hint">Задач нет. Нажмите +, чтобы добавить.</div>';
}

function renderWeekView() {
  const realToday = todayStr();
  const monday = new Date(); monday.setHours(0, 0, 0, 0);
  const dow = monday.getDay() || 7;
  monday.setDate(monday.getDate() - dow + 1 + window.taskWeekOffset * 7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  
  let label = window.taskWeekOffset === 0 ? 'Текущая неделя' : (window.taskWeekOffset === 1 ? 'Следующая неделя' : 'Прошлая неделя');
  let html = `<div class="week-nav"><button class="week-nav-btn" onclick="window.changeTaskWeek(-1)">‹</button><div class="week-nav-label">${label}</div><button class="week-nav-btn" onclick="window.changeTaskWeek(1)">›</button></div>`;
  const monthsShort = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const isToday = dateStr === realToday;
    const isPast = dateStr < realToday;
    const dayTasks = state.tasks.filter(t => t.recurrence ? matchesRecurrence(t, dateStr) : t.date === dateStr);
    dayTasks.sort((a, b) => { const aDone = isTaskDoneOn(a, dateStr) ? 1 : 0; const bDone = isTaskDoneOn(b, dateStr) ? 1 : 0; if (aDone !== bDone) return aDone - bDone; if (a.priority !== b.priority) return a.priority - b.priority; return 0; });
    const dayName = WEEKDAYS_LONG[d.getDay()];
    const dayNum = d.getDate();
    const monthName = monthsShort[d.getMonth()];
    
    let tasksHtml = dayTasks.length ? dayTasks.map(t => taskRowHTML(t, dateStr, { hideDate: true })).join('') : '<div class="week-day-empty">Нет задач</div>';
    html += `<div class="week-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}"><div class="week-day-header"><span class="week-day-name">${dayName}</span><span class="week-day-date">${dayNum} ${monthName}</span>${isToday ? '<span class="week-day-badge">Сегодня</span>' : ''}</div><div class="week-day-tasks">${tasksHtml}</div></div>`;
  }
  return { html };
}

export function renderFocusOfDay() {
  const t = window.currentDate;
  const tasks = state.tasks.filter(x => x.recurrence ? (matchesRecurrence(x, t) && !isTaskDoneOn(x, t)) : (x.date === t && !x.done));
  const focusCard = document.getElementById('focus-card');
  if (!tasks.length) { focusCard.style.display = 'none'; focusCard.dataset.taskId = ''; return; }
  tasks.sort((a, b) => a.priority - b.priority);
  const top = tasks[0];
  focusCard.style.display = 'block';
  focusCard.dataset.taskId = top.id;
  document.getElementById('focus-title').innerHTML = escapeHtml(top.title);
  document.getElementById('focus-meta').innerText = top.priority === 1 ? "Высокий приоритет · Нажмите, чтобы найти" : "Следующая задача · Нажмите, чтобы найти";
}

window.focusTaskClick = function() {
  const id = document.getElementById('focus-card').dataset.taskId;
  if (!id) return;
  haptic();
  if (!document.getElementById('screen-today').classList.contains('active')) window.switchTab('today');
  setTimeout(() => {
    const el = document.querySelector(`.task-row[data-task-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => { el.classList.add('highlight-pulse'); setTimeout(() => el.classList.remove('highlight-pulse'), 2100); }, 200);
    }
  }, 200);
};
