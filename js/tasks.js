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
export function isTaskDoneOn(t, dateStr) { if (t.recurrence) return !!t.completions[dateStr]; return t.done; }
export function formatDuration(min) { if (min < 60) return min + ' мин'; const h = Math.floor(min / 60), m = min % 60; return m ? `${h}ч ${m}м` : `${h}ч`; }
export function formatTaskDate(d) { const today = todayStr(); const tom = new Date(); tom.setDate(tom.getDate() + 1); if (d === today) return 'Сегодня'; if (d === tom.toISOString().slice(0, 10)) return 'Завтра'; return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); }

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
  
  let dragAttr = opts.draggable ? `draggable="true" ondragstart="window.dragTask(event, ${t.id})"` : '';
  
  return `
    <div class="swipe-row-container">
      <div class="swipe-actions">
        <button class="swipe-btn post" onclick="event.stopPropagation();window.postponeTask(${t.id})">Завтра</button>
        <button class="swipe-btn edit" onclick="event.stopPropagation();window.openTaskEditor(${t.id})">Изменить</button>
        <button class="swipe-btn delete" onclick="event.stopPropagation();window.removeTask(${t.id})">Удалить</button>
      </div>
      <div class="swipe-content task-row ${opts.draggable ? 'draggable-task' : ''}" data-task-id="${t.id}" ${dragAttr} onclick="window.openTaskEditor(${t.id})">
        <div class="check-circle ${done ? 'done' : ''} p${t.priority}" onclick="event.stopPropagation();window.toggleTask(${t.id},'${dateStr}',this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="task-body">
          <div class="task-title ${done ? 'done' : ''}">${escapeHtml(t.title)}</div>
          <div class="task-meta">
            ${dateLabel ? `<span class="date-tag ${dateClass}">${svgIcon('calendar', 'currentColor', 12)} ${dateLabel}</span>` : ''}
            ${timeLabel ? `<span>${timeLabel}</span>` : ''}
            ${durLabel ? `<span>${durLabel}</span>` : ''}
            ${project ? `<span class="project-tag"><span class="project-dot" style="background:${project.color}"></span>${escapeHtml(project.name)}</span>` : ''}
            ${recurLabel ? `<span style="color:var(--text-sec);font-size:11px;">${recurLabel}</span>` : ''}
          </div>
        </div>
      </div>
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
    if (el) { el.classList.add('checking'); const row = el.closest('.swipe-content'); if (row) row.classList.add('completing'); }
    save(); setTimeout(() => { window.renderAll(); }, 500); return;
  }
  if (el) { el.classList.add('checking'); setTimeout(() => el.classList.remove('checking'), 400); }
  save(); window.renderAll();
}
window.toggleTask = toggleTask;

export function completeTaskFromFocus(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t && !t.done) {
    if (t.recurrence) t.completions[todayStr()] = true;
    else t.done = true;
    save();
  }
}
window.completeTaskFromFocus = completeTaskFromFocus;

export function removeTask(id) {
  if (!confirm('Удалить задачу?')) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  haptic(); save(); window.renderAll();
}
window.removeTask = removeTask;

export function postponeTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    t.date = tomorrow.toISOString().slice(0, 10);
    save(); window.renderAll(); window.showToast('Задача перенесена на завтра');
  }
}
window.postponeTask = postponeTask;

// DRAG & DROP
window.dragTask = function(event, id) {
  event.dataTransfer.setData('taskId', id);
  event.target.classList.add('dragging');
};
window.dropTask = function(event, dateStr) {
  event.preventDefault();
  const id = event.dataTransfer.getData('taskId');
  if (!id) return;
  const t = state.tasks.find(x => x.id == id);
  if (t) {
    t.date = dateStr;
    save(); window.renderAll(); window.showToast('Задача перенесена');
  }
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
};

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

let calendarExpanded = false;
window.toggleCalendarExpand = function() {
  calendarExpanded = !calendarExpanded;
  renderTasks();
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
    { id: 'calendar', label: 'Календарь', count: null },
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
  
  if (state.taskFilter === 'calendar') {
    content.innerHTML = renderTodoistCalendar().html;
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

function renderTodoistCalendar() {
  const realToday = todayStr();
  const todayObj = new Date();
  const y = todayObj.getFullYear(), m = todayObj.getMonth();
  
  // Складной календарь
  let miniCal = `
    <div class="mini-cal-wrapper">
      <div class="mini-cal-header" onclick="window.toggleCalendarExpand()">
        <span>${todayObj.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
        <span>${calendarExpanded ? '▲' : '▼'}</span>
      </div>
      <div class="mini-cal-grid">
  `;
  
  const shortDays = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  shortDays.forEach(d => miniCal += `<div class="mini-cal-dow">${d}</div>`);
  
  if (calendarExpanded) {
    const firstDay = (new Date(y, m, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) miniCal += `<div></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hasTasks = state.tasks.some(t => t.date === dateStr);
      const isToday = dateStr === realToday;
      miniCal += `<div class="mini-cal-day ${hasTasks ? 'has-tasks' : ''} ${isToday ? 'today' : ''}" onclick="event.stopPropagation();window.goToDate('${dateStr}')">${d}</div>`;
    }
  } else {
    // Показываем только текущую неделю
    const currentDayOfWeek = (todayObj.getDay() + 6) % 7; // 0 - пн
    const startOfWeek = new Date(todayObj);
    startOfWeek.setDate(todayObj.getDate() - currentDayOfWeek);
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const hasTasks = state.tasks.some(t => t.date === dateStr);
      const isToday = dateStr === realToday;
      miniCal += `<div class="mini-cal-day ${hasTasks ? 'has-tasks' : ''} ${isToday ? 'today' : ''}" onclick="event.stopPropagation();window.goToDate('${dateStr}')">${d.getDate()}</div>`;
    }
  }
  miniCal += `</div></div>`;

  // Все дни недели (или месяца)
  let listHtml = '';
  const startDate = new Date(); 
  startDate.setDate(startDate.getDate() - 3); // Смотрим на 3 дня назад
  
  const daysToRender = calendarExpanded ? 31 : 7;
  const listStart = calendarExpanded ? new Date(y, m, 1) : new Date(startDate);

  for (let i = 0; i < daysToRender; i++) {
    const d = new Date(listStart); d.setDate(listStart.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = WEEKDAYS_LONG[d.getDay()];
    const isToday = dateStr === realToday;
    
    const dayTasks = state.tasks.filter(t => t.recurrence ? matchesRecurrence(t, dateStr) : t.date === dateStr);
    dayTasks.sort((a, b) => a.priority - b.priority);
    let dateLabel = `${d.getDate()} ${['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'][d.getMonth()]}`;
    
    listHtml += `
      <div style="margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 700; color: ${isToday ? 'var(--td-red)' : 'var(--text)'}; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
          <span>${dateLabel} · ${dayName} ${isToday ? '(Сегодня)' : ''}</span>
          <button onclick="window.setCurrentDateAndOpenTask('${dateStr}')" style="background:none;border:none;color:var(--text-sec);cursor:pointer;padding:4px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
        <div class="card tight" style="margin-bottom:0; min-height: 40px;" ondragover="event.preventDefault(); this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="window.dropTask(event, '${dateStr}'); this.classList.remove('drag-over')">
          ${dayTasks.length ? dayTasks.map(t => taskRowHTML(t, dateStr, { hideDate: true, draggable: true })).join('') : '<div style="font-size:12px;color:var(--text-tert);text-align:center;padding:8px;">Нет задач</div>'}
        </div>
      </div>
    `;
  }

  return { html: `<div style="padding: 8px 0;">${miniCal}${listHtml}</div>` };
}

window.goToDate = function(dateStr) {
  window.currentDate = dateStr;
  haptic();
  window.renderAll();
};

window.setCurrentDateAndOpenTask = function(dateStr) {
  window.currentDate = dateStr;
  window.openTaskEditor();
};

export function renderTasksTodayMini() {
  const t = window.currentDate;
  const tasks = state.tasks.filter(x => x.recurrence ? matchesRecurrence(x, t) : x.date === t);
  document.getElementById('tasks-today-mini').innerHTML = tasks.length ? tasks.map(x => taskRowHTML(x, t)).join('') : '<div class="empty-hint">Задач нет. Нажмите +, чтобы добавить.</div>';
}

export function openProject(id) {
  const p = state.projects.find(x => x.id === id);
  const tasks = state.tasks.filter(t => t.projectId === id);
  let tasksHtml = tasks.length ? tasks.map(t => taskRowHTML(t, t.date || todayStr())).join('') : '<div class="empty-hint">Задач нет</div>';
  window.openSheet(`
    <h2>${escapeHtml(p.name)}</h2>
    <div class="card tight" style="margin-bottom:12px;">${tasksHtml}</div>
    <div class="sheet-actions">
      <button class="btn-cancel" onclick="window.closeSheet()">Закрыть</button>
      <button class="btn-danger" onclick="window.deleteProject(${id})">Удалить</button>
    </div>
  `);
}
window.openProject = openProject;

export function addProject() {
  const inp = document.getElementById('new-project');
  const name = inp.value.trim();
  if (!name) return;
  state.projects.push({ id: uid(), name, color: PALETTE[state.projects.length % PALETTE.length] });
  inp.value = '';
  save(); renderTasks();
}
window.addProject = addProject;

export function deleteProject(id) {
  if (!confirm('Удалить проект?')) return;
  state.projects = state.projects.filter(p => p.id !== id);
  state.tasks.forEach(t => { if (t.projectId === id) t.projectId = null; });
  save(); window.closeSheet(); renderTasks();
}
window.deleteProject = deleteProject;
