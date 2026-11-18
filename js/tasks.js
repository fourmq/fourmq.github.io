import { escapeHtml, svgIcon, todayStr, uid, WEEKDAYS_LONG, haptic, playSound, PALETTE, ymdLocal } from './utils.js';
import { state, save } from './db.js';

export function matchesRecurrence(t, dateStr) {
  const r = t.recurrence;
  if (!r) return t.date === dateStr;
  const d = new Date(dateStr + 'T12:00:00');
  const startStr = t.date || (t.createdAt ? ymdLocal(new Date(t.createdAt)) : dateStr);
  if (dateStr < startStr) return false;
  if (r === 'daily') return true;
  if (r === 'weekdays') return d.getDay() >= 1 && d.getDay() <= 5;
  if (r === 'weekly') {
    const start = t.date ? new Date(t.date + 'T12:00:00') : new Date(t.createdAt);
    return d.getDay() === start.getDay();
  }
  return false;
}
export function isTaskDoneOn(t, dateStr) { if (t.recurrence) return !!t.completions[dateStr]; return t.done; }
export function formatDuration(min) { if (min < 60) return min + ' мин'; const h = Math.floor(min / 60), m = min % 60; return m ? `${h}ч ${m}м` : `${h}ч`; }
export function formatTaskDate(d) { const today = todayStr(); const tom = new Date(); tom.setDate(tom.getDate() + 1); const tomStr = `${tom.getFullYear()}-${String(tom.getMonth()+1).padStart(2,'0')}-${String(tom.getDate()).padStart(2,'0')}`; if (d === today) return 'Сегодня'; if (d === tomStr) return 'Завтра'; return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); }

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
        <button class="swipe-btn post" onclick="event.stopPropagation();window.postponeTask(${t.id})">${svgIcon('calendar','#fff',18)}</button>
        <button class="swipe-btn edit" onclick="event.stopPropagation();window.openTaskEditor(${t.id})">${svgIcon('pencil','#fff',18)}</button>
        <button class="swipe-btn delete" onclick="event.stopPropagation();window.removeTask(${t.id})">${svgIcon('trash','#fff',18)}</button>
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
            ${(t.subtasks && t.subtasks.length) ? `<span class="subtask-progress">${t.subtasks.filter(s=>s.done).length}/${t.subtasks.length}</span>` : ''}
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
    t.date = ymdLocal(tomorrow);
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
  const isNew = !id;
  const t = id ? state.tasks.find(x => x.id === id) : { title: '', description: '', date: window.currentDate, startTime: null, duration: null, priority: 4, projectId: null, recurrence: null, subtasks: [], tags: [], notes: '' };
  if (!t) return;
  window._editingTask = t;
  window._isNewTask = isNew;

  const project = t.projectId ? state.projects.find(p => p.id === t.projectId) : null;
  const dateLabel = t.date ? formatTaskDate(t.date) : 'Без срока';
  const dateClass = t.date && t.date < todayStr() ? 'overdue' : (t.date === todayStr() ? 'today' : '');
  const prioText = t.priority < 4 ? 'P' + t.priority : 'Без приоритета';

  const html = `
    <div class="task-modal-inner" role="dialog" aria-modal="true">
      <div class="task-modal-header">
        <div class="task-modal-header-left">
          ${svgIcon('folder', 'currentColor', 16)}
          <span id="header-project-name">${escapeHtml(project?.name || 'Входящие')}</span>
          <span class="save-indicator-task" id="task-save-ind">Сохранено</span>
        </div>
        <div class="task-modal-header-right">
          <button type="button" aria-label="Предыдущая" onclick="window.taskNav(-1)">${svgIcon('arrowRight', 'currentColor', 16)}</button>
          <button type="button" aria-label="Следующая" onclick="window.taskNav(1)">${svgIcon('arrowRight', 'currentColor', 16)}</button>
          <button type="button" aria-label="Меню" onclick="window.openTaskMenu()">${svgIcon('settings', 'currentColor', 16)}</button>
          <button type="button" aria-label="Закрыть" onclick="window.closeTaskEditor()">×</button>
        </div>
      </div>
      <div class="task-modal-body">
        <div class="task-main">
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div class="check-circle p${t.priority}" style="margin-top:6px;" onclick="window.toggleCurrentTaskDone()"></div>
            <textarea id="t-title" class="task-title-edit" placeholder="Название задачи" rows="1">${escapeHtml(t.title)}</textarea>
          </div>
          <div class="task-desc-wrap">
            ${svgIcon('description', 'currentColor', 16)}
            <textarea id="t-desc" class="task-desc-edit" placeholder="Описание" rows="2">${escapeHtml(t.description || '')}</textarea>
          </div>
          <div id="subtasks-container"></div>
          <button type="button" class="add-subtask-btn" onclick="window.addSubtask()">+ Добавить подзадачу</button>
          <div id="comments-area" style="margin-top:20px;"></div>
          <div class="comment-input-row">
            <input type="text" id="t-comment-input" placeholder="Комментарий..." onkeydown="if(event.key==='Enter')window.addComment()">
            <button type="button" onclick="window.addComment()">${svgIcon('arrowRight','#fff',16)}</button>
          </div>
          ${isNew ? '<div style="margin-top:24px;"><button class="btn-primary" onclick="window.saveNewTask()">Добавить задачу</button></div>' : ''}
        </div>
        <div class="task-sidebar">
          <div class="prop-block" onclick="window.openProjectPicker()">
            <div class="prop-label">Проект</div>
            <div class="prop-value" id="prop-project">
              <span class="project-dot" style="background:${project?.color || 'var(--text-tert)'}"></span>
              <span>${escapeHtml(project?.name || 'Входящие')}</span>
            </div>
          </div>
          <div class="prop-block" id="prop-date-block" onclick="window.openDatePopover(event)">
            <div class="prop-label">Срок</div>
            <div class="prop-value ${dateClass}" id="prop-date">
              ${svgIcon('calendar', 'currentColor', 16)}
              <span>${dateLabel}</span>
            </div>
          </div>
          <div class="prop-block" onclick="window.openPriorityPicker()">
            <div class="prop-label">Приоритет</div>
            <div class="prop-value" id="prop-prio">
              ${svgIcon('flag', 'currentColor', 16)}
              <span>${prioText}</span>
            </div>
          </div>

        </div>
      </div>
    </div>
    <input type="hidden" id="t-date" value="${t.date || ''}">
    <input type="hidden" id="t-time" value="${t.startTime || ''}">
    <input type="hidden" id="t-duration" value="${t.duration || ''}">
    <input type="hidden" id="t-priority" value="${t.priority}">
    <input type="hidden" id="t-project" value="${t.projectId || ''}">
    <input type="hidden" id="t-recurrence" value="${t.recurrence || ''}">
    <input type="hidden" id="t-editing-id" value="${editingTaskId || ''}">
  `;

  window.openSheet(html);
  document.getElementById('sheet').classList.add('task-modal');
  setTimeout(() => {
    const titleEl = document.getElementById('t-title');
    if (titleEl) {
      titleEl.focus();
      autoResize(titleEl);
      if (isNew) {
        titleEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.saveNewTask(); }
        });
      }
    }
    if (!isNew) setupAutoSave();
    window.renderSubtasksEditor(t);
    window.renderComments && window.renderComments();
  }, 50);
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
window.renderSubtasksEditor = function(t) {
  const cont = document.getElementById('subtasks-container');
  if (!cont) return;
  const subs = (t.subtasks || []).filter(s => s.title && s.title.trim());
  cont.innerHTML = subs.map((s, i) => `
    <div class="subtask-row" draggable="true" data-idx="${i}" ondragstart="window.dragSubtask(event,${i})" ondragover="event.preventDefault()" ondrop="window.dropSubtask(event,${i})">
      <div class="subtask-drag">⋮⋮</div>
      <div class="check-circle p${s.priority || 4} ${s.done ? 'done' : ''}" onclick="window.toggleSubtask(${i})" style="width:18px;height:18px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7" stroke-linecap="round"/></svg>
      </div>
      <span class="subtask-title ${s.done ? 'done' : ''}" onclick="window.cycleSubtaskPriority(${i})" title="Приоритет">${escapeHtml(s.title)}</span>
      <div class="subtask-actions">
        <button type="button" onclick="window.cycleSubtaskPriority(${i})" title="Приоритет">${svgIcon('flag', s.priority===1?'var(--td-red)':s.priority===2?'var(--td-orange)':s.priority===3?'var(--td-blue)':'currentColor', 14)}</button>
        <button type="button" onclick="window.removeSubtask(${i})" title="Удалить" class="del">${svgIcon('trash','currentColor',14)}</button>
      </div>
    </div>
  `).join('');
};
window.dragSubtask = function(e, i) { e.dataTransfer.setData('text/plain', i); };
window.dropSubtask = function(e, targetIdx) {
  e.preventDefault();
  const srcIdx = +e.dataTransfer.getData('text/plain');
  if (srcIdx === targetIdx || !window._editingTask?.subtasks) return;
  const subs = window._editingTask.subtasks;
  const [item] = subs.splice(srcIdx, 1);
  subs.splice(targetIdx, 0, item);
  window.renderSubtasksEditor(window._editingTask);
  if (!window._isNewTask) window.saveTaskSilent();
};
window.cycleSubtaskPriority = function(i) {
  const s = window._editingTask?.subtasks?.[i];
  if (!s) return;
  s.priority = ((s.priority || 4) % 4) + 1;
  if (s.priority > 4) s.priority = 1;
  window.renderSubtasksEditor(window._editingTask);
  if (!window._isNewTask) window.saveTaskSilent();
};
window.editSubtask = function(i) {
  const s = window._editingTask?.subtasks?.[i];
  if (!s) return;
  const newTitle = prompt('Название подзадачи', s.title || '');
  if (newTitle !== null) { s.title = newTitle.trim(); window.renderSubtasksEditor(window._editingTask); if (!window._isNewTask) window.saveTaskSilent(); }
};
window.addSubtask = function() {
  const title = prompt('Название подзадачи');
  if (!title || !title.trim()) return;
  if (!window._editingTask) window._editingTask = { subtasks: [] };
  if (!window._editingTask.subtasks) window._editingTask.subtasks = [];
  window._editingTask.subtasks.push({ title: title.trim(), done: false, priority: 4 });
  window.renderSubtasksEditor(window._editingTask);
  if (!window._isNewTask) window.saveTaskSilent();
};
window.toggleSubtask = function(i) {
  const s = window._editingTask?.subtasks?.[i];
  if (s) { s.done = !s.done; if (!window._isNewTask) window.saveTaskSilent(); }
};
window.updateSubtask = function(i, val) {
  const s = window._editingTask?.subtasks?.[i];
  if (s) { s.title = val; if (!window._isNewTask) window.saveTaskSilent(); }
};
window.removeSubtask = function(i) {
  if (window._editingTask?.subtasks) {
    window._editingTask.subtasks.splice(i, 1);
    window.renderSubtasksEditor(window._editingTask);
    if (!window._isNewTask) window.saveTaskSilent();
  }
};
window.duplicateTask = function() {
  const id = document.getElementById('t-editing-id')?.value;
  if (!id) return;
  const t = state.tasks.find(x => x.id == id);
  if (!t) return;
  const copy = { ...t, id: uid(), title: t.title + ' (копия)', done: false, createdAt: Date.now() };
  state.tasks.push(copy);
  save(); window.closeSheet(); window.renderAll(); window.showToast('Задача скопирована');
};


function setupAutoSave() {
  const fields = ['t-title', 't-desc', 't-notes'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      if (id === 't-title') autoResize(el);
      clearTimeout(window._taskSaveTimer);
      window._taskSaveTimer = setTimeout(window.saveTaskSilent, 400);
    });
  });
}

window.saveTaskSilent = function() {
  const id = document.getElementById('t-editing-id')?.value;
  if (!id) return;
  const t = state.tasks.find(x => x.id == id);
  if (!t) return;
  const title = document.getElementById('t-title').value.trim(); if (title) t.title = title;
  t.description = document.getElementById('t-desc').value.trim();
  t.subtasks = window._editingTask?.subtasks || [];
  t.comments = window._editingTask?.comments || [];
  t.date = document.getElementById('t-date').value || null;
  t.startTime = document.getElementById('t-time').value || null;
  t.duration = parseInt(document.getElementById('t-duration').value) || null;
  t.priority = parseInt(document.getElementById('t-priority').value) || 4;
  t.projectId = document.getElementById('t-project').value ? parseInt(document.getElementById('t-project').value) : null;
  t.recurrence = document.getElementById('t-recurrence').value || null;
  save();
  const ind = document.getElementById('task-save-ind');
  if (ind) { ind.classList.add('show'); setTimeout(() => ind.classList.remove('show'), 1500); }
};

window.saveNewTask = function() {
  const title = document.getElementById('t-title').value.trim();
  if (!title) { window.showToast('Введите название'); return; }
  const newTask = {
    id: uid(),
    title,
    description: document.getElementById('t-desc').value.trim(),
    notes: document.getElementById('t-notes').value.trim(),
    done: false,
    date: document.getElementById('t-date').value || null,
    startTime: document.getElementById('t-time').value || null,
    duration: parseInt(document.getElementById('t-duration').value) || null,
    priority: parseInt(document.getElementById('t-priority').value) || 4,
    projectId: document.getElementById('t-project').value ? parseInt(document.getElementById('t-project').value) : null,
    recurrence: document.getElementById('t-recurrence').value || null,
    subtasks: (window._editingTask?.subtasks || []).filter(s => s.title && s.title.trim()),
    tags: window._editingTask?.tags || [],
    completions: {},
    createdAt: Date.now()
  };
  state.tasks.push(newTask);
  haptic('success'); playSound('success'); save(); window.closeTaskEditor(); window.renderAll();
};

window.closeTaskEditor = function() {
  clearTimeout(window._taskSaveTimer);
  if (!window._isNewTask) window.saveTaskSilent();
  if (window._isNewTask) {
    const title = document.getElementById('t-title')?.value.trim();
    if (title && !confirm('Закрыть без сохранения?')) return;
  }
  document.getElementById('sheet').classList.remove('task-modal');
  window.closeSheet();
  window._editingTask = null;
  window._isNewTask = false;
};

window.openDatePopover = function(ev) {
  ev.stopPropagation();
  const existing = document.getElementById('date-popover');
  if (existing) { existing.remove(); return; }
  const block = document.getElementById('prop-date-block');
  const rect = block.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.id = 'date-popover';
  pop.className = 'date-popover';
  pop.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
  pop.style.top = (rect.bottom + 8) + 'px';
  const today = todayStr();
  const tomorrow = ymdLocal(new Date(Date.now() + 86400000));
  const weekend = (() => { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay() + 7) % 7); return ymdLocal(d); })();
  const nextWeek = (() => { const d = new Date(); d.setDate(d.getDate() + (8 - d.getDay()) % 7 || 7); return ymdLocal(d); })();
  pop.innerHTML = `
    <input type="text" id="date-input" placeholder="Введите срок" style="width:100%;padding:8px;border:none;border-bottom:1px solid var(--separator);font-size:14px;outline:none;background:transparent;">
    <div class="date-quick">
      <button type="button" onclick="window.setTaskDate('${today}')">${svgIcon('calendar','var(--td-green)',16)} Сегодня <span class="day-hint">${new Date().toLocaleDateString('ru-RU',{weekday:'short'})}</span></button>
      <button type="button" onclick="window.setTaskDate('${tomorrow}')">${svgIcon('sun','var(--td-orange)',16)} Завтра <span class="day-hint">${new Date(Date.now()+86400000).toLocaleDateString('ru-RU',{weekday:'short'})}</span></button>
      <button type="button" onclick="window.setTaskDate('${weekend}')">${svgIcon('moon','var(--td-blue)',16)} На выходных <span class="day-hint">Сб</span></button>
      <button type="button" onclick="window.setTaskDate('${nextWeek}')">${svgIcon('arrowRight','var(--purple)',16)} След. неделя <span class="day-hint">${new Date(nextWeek+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'})}</span></button>
    </div>
    <div id="date-cal-container"></div>
    <div class="date-footer">
      <button type="button" onclick="window.openTimePicker()">${svgIcon('clock','currentColor',14)} Время</button>
      <button type="button" onclick="window.openRecurrencePicker()">${svgIcon('refresh','currentColor',14)} Повтор</button>
      <button type="button" onclick="window.setTaskDate('')">Без срока</button>
    </div>
  `;
  document.body.appendChild(pop);
  window.renderDateCalendar();
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!pop.contains(e.target) && e.target !== block) { pop.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
};

window.setTaskDate = function(dateStr) {
  document.getElementById('t-date').value = dateStr;
  const label = dateStr ? formatTaskDate(dateStr) : 'Без срока';
  const cls = dateStr && dateStr < todayStr() ? 'overdue' : (dateStr === todayStr() ? 'today' : '');
  const el = document.getElementById('prop-date');
  if (el) { el.className = 'prop-value ' + cls; el.innerHTML = svgIcon('calendar','currentColor',16) + ' <span>' + label + '</span>'; }
  const pop = document.getElementById('date-popover');
  if (pop) pop.remove();
  if (!window._isNewTask) window.saveTaskSilent();
};

window.renderDateCalendar = function() {
  const cont = document.getElementById('date-cal-container');
  if (!cont) return;
  const now = new Date();
  let html = '';
  for (let m = 0; m < 3; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const title = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    html += `<div class="cal-month-title">${title}</div><div class="cal-grid">`;
    ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(w => html += `<div class="cal-dow">${w}</div>`);
    const first = (d.getDay() + 6) % 7;
    for (let i = 0; i < first; i++) html += '<div></div>';
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= days; day++) {
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const isToday = ds === todayStr();
      const isSel = ds === document.getElementById('t-date').value;
      const isPast = ds < todayStr();
      html += `<button type="button" class="cal-day ${isToday?'today':''} ${isSel?'selected':''} ${isPast?'past':''}" onclick="window.setTaskDate('${ds}')">${day}</button>`;
    }
    html += '</div>';
  }
  cont.innerHTML = html;
};

window.openTimePicker = function() {
  const curTime = document.getElementById('t-time')?.value || '';
  const curDur = document.getElementById('t-duration')?.value || '';
  const content = document.getElementById('popover-content');
  content.innerHTML = `
    <h4 style="padding:4px 12px 8px;font-size:11px;color:var(--text-sec);font-weight:700;text-transform:uppercase;">Время</h4>
    <div style="padding:8px 12px;"><input type="time" id="tmp-time" value="${curTime}" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--separator);background:var(--input-bg);color:var(--text);"></div>
    <div style="padding:8px 12px;"><input type="number" id="tmp-dur" min="0" max="1440" value="${curDur}" placeholder="минут" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--separator);background:var(--input-bg);color:var(--text);"></div>
    <div style="padding:8px 12px;display:flex;gap:8px;"><button class="btn-cancel" onclick="window.closePopover()">Отмена</button><button class="btn-primary" onclick="window.applyTime()">Готово</button></div>
  `;
  document.getElementById('popover-overlay').classList.add('open');
};
window.applyTime = function() {
  const tEl = document.getElementById('t-time');
  const dEl = document.getElementById('t-duration');
  if (tEl) tEl.value = document.getElementById('tmp-time')?.value || '';
  if (dEl) dEl.value = document.getElementById('tmp-dur')?.value || '';
  window.closePopover();
  if (!window._isNewTask) window.saveTaskSilent();
};

window.openTagsEditor = function() {
  const tags = (window._editingTask?.tags || []).join(', ');
  window.openSheet(`
    <h2>Метки</h2>
    <div class="field"><label>Через запятую</label><input type="text" id="tmp-tags" value="${escapeHtml(tags)}" placeholder="работа, дом, срочно"></div>
    <div class="sheet-actions"><button class="btn-cancel" onclick="window.closeSheet()">Отмена</button><button class="btn-primary" onclick="window.applyTags()">Готово</button></div>
  `);
};
window.applyTags = function() {
  const raw = document.getElementById('tmp-tags').value;
  const tags = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (window._editingTask) window._editingTask.tags = tags;
  const el = document.getElementById('prop-tags');
  if (el) el.innerHTML = svgIcon('sparkle','currentColor',16) + ' <span>' + (tags.length ? tags.map(escapeHtml).join(', ') : 'Нет меток') + '</span>';
  window.closeSheet();
  if (!window._isNewTask) window.saveTaskSilent();
};

window.toggleCurrentTaskDone = function() {
  const id = document.getElementById('t-editing-id')?.value;
  if (!id) return;
  const t = state.tasks.find(x => x.id == id);
  if (t) { t.done = !t.done; save(); window.renderAll(); }
};

window.taskNav = function(dir) {
  // placeholder for prev/next
  window.showToast('Навигация по задачам скоро');
};

window.openTaskMenu = function() {
  const id = document.getElementById('t-editing-id')?.value;
  window.openSheet(`
    <h2>Задача</h2>
    <button class="btn-cancel" onclick="window.duplicateTask()">Дублировать</button>
    <button class="btn-danger" onclick="window.removeTask(${id || 0}); window.closeSheet();">Удалить</button>
    <button class="btn-cancel" onclick="window.closeSheet()">Закрыть</button>
  `);
};

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
  window.closePopover();
  if (!window._isNewTask) window.saveTaskSilent();
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
  const colors = { 1: 'var(--td-red)', 2: 'var(--td-orange)', 3: 'var(--td-blue)', 4: 'var(--text-sec)' };
  const el = document.getElementById('prop-prio');
  if (el) {
    el.innerHTML = svgIcon('flag', colors[p] || 'currentColor', 16) + ' <span>' + (p < 4 ? 'P' + p : 'Без приоритета') + '</span>';
  }
  const circle = document.querySelector('.task-modal .check-circle');
  if (circle) circle.className = 'check-circle p' + p;
  window.closePopover();
  if (!window._isNewTask) window.saveTaskSilent();
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
  const el = document.getElementById('prop-project');
  const header = document.getElementById('header-project-name');
  if (!id) {
    if (el) el.innerHTML = '<span class="project-dot" style="background:var(--text-tert)"></span><span>Входящие</span>';
    if (header) header.textContent = 'Входящие';
  } else {
    const p = state.projects.find(x => x.id === +id);
    if (p) {
      if (el) el.innerHTML = `<span class="project-dot" style="background:${p.color}"></span><span>${escapeHtml(p.name)}</span>`;
      if (header) header.textContent = p.name;
    }
  }
  window.closePopover();
  if (!window._isNewTask) window.saveTaskSilent();
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
  
  let subs = [];
  if (editingTaskId) {
    const t = state.tasks.find(x => x.id == editingTaskId);
    subs = (t?.subtasks || []).filter(s => s.title && s.title.trim());
    Object.assign(t, { title, description, date, startTime, duration, priority, projectId, recurrence, subtasks: subs });
  } else {
    subs = (window._draftTask?.subtasks || []).filter(s => s.title && s.title.trim());
    state.tasks.push({ id: uid(), title, description, done: false, date, startTime, duration, priority, projectId, recurrence, subtasks: subs, tags: [], completions: {}, createdAt: Date.now() });
  }
  window._draftTask = null;
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
  
  const overdueList = (window.getOverdueTasks && window.getOverdueTasks()) || [];
  const filters = [
    { id: 'today', label: 'Сегодня', count: todayTasks.length },
    { id: 'overdue', label: 'Просрочено', count: overdueList.length },
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
        <div class="project-card" onclick="window.openProject(${p.id})">
          <div class="project-color-bar" style="background:${p.color}"></div>
          <div class="project-info">
            <div class="project-name">${escapeHtml(p.name)}</div>
            <div class="project-count">${c} ${c === 1 ? 'задача' : c < 5 ? 'задачи' : 'задач'}</div>
          </div>
          ${svgIcon('arrowRight', 'var(--text-tert)', 16)}
        </div>
      `;
    });
    
    content.innerHTML = `
      <div class="project-add-row">
        <input id="new-project" placeholder="Новый проект" onkeydown="if(event.key==='Enter')window.addProject()">
        <button onclick="window.addProject()">+</button>
      </div>
      ${projHtml}
    `;
    return;
  }
  
  if (state.taskFilter === 'overdue') {
    const list = window.getOverdueTasks ? window.getOverdueTasks() : [];
    content.innerHTML = list.length
      ? list.map(t => taskRowHTML(t, t.date)).join('')
      : '<div class="empty-hint warm">✅ Просроченных нет — отличная новость.</div>';
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
    
    tasks.sort((a, b) => { if (a.done !== b.done) return a.done ? 1 : -1; if (a.priority !== b.priority) return a.priority - b.priority; if (a.date && b.date) return a.date.localeCompare(b.date); if (a.date) return -1; if (b.date) return 1; return 0; });
    content.innerHTML = subchips + (tasks.length ? `<div class="card tight">${tasks.map(t => taskRowHTML(t, t.date || realToday)).join('')}</div>` : `<div class="card"><div class="empty-hint">Пока пусто в этой категории.</div></div>`);
    return;
  }
  
  let tasks = state.tasks.filter(t => t.recurrence ? matchesRecurrence(t, today) : t.date === today);
  // Сортировка: сначала невыполненные, потом по приоритету и времени
  tasks.sort((a, b) => { 
    const aDone = isTaskDoneOn(a, today) ? 1 : 0; 
    const bDone = isTaskDoneOn(b, today) ? 1 : 0; 
    if (aDone !== bDone) return aDone - bDone; 
    if (a.priority !== b.priority) return a.priority - b.priority; 
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime); 
    return 0; 
  });
  content.innerHTML = tasks.length ? `<div class="card tight">${tasks.map(t => taskRowHTML(t, today)).join('')}</div>` : `<div class="card"><div class="empty-hint">Задач нет.<br>Нажмите +, чтобы добавить.</div></div>`;
}

function renderTodoistCalendar() {
  const realToday = todayStr();
  const anchorStr = window._calendarAnchor || realToday;
  const anchor = new Date(anchorStr + 'T12:00:00');
  const monthsShort = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'нояб', 'дек'];
  const dow = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const calBase = window._calMonth ? new Date(window._calMonth) : new Date(anchor);
  const y = calBase.getFullYear();
  const m = calBase.getMonth();

  const weekStart = new Date(anchor);
  const mondayOffset = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - mondayOffset);

  let weekHtml = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = ymdLocal(d);
    const isToday = dateStr === realToday;
    const isSelected = dateStr === anchorStr;
    weekHtml += `<button type="button" class="week-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="window.goToDate('${dateStr}')"><span class="dn">${dow[i]}</span><span class="n">${d.getDate()}</span></button>`;
  }

  let popover = '';
  if (calendarExpanded) {
    const monthTitle = calBase.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    let grid = dow.map(name => `<div class="cal-pop-dow">${name}</div>`).join('');
    const firstDay = (new Date(y, m, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) grid += '<div></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === realToday;
      const isSelected = dateStr === anchorStr;
      grid += `<button type="button" class="cal-pop-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="window.goToDate('${dateStr}')">${day}</button>`;
    }
    const next = new Date(y, m + 1, 1);
    const nextTitle = next.toLocaleDateString('ru-RU', { month: 'long' });
    const nextDays = new Date(y, m + 2, 0).getDate();
    const nextFirst = (next.getDay() + 6) % 7;
    let nextGrid = `<div class="cal-pop-next">${nextTitle}</div>`;
    for (let i = 0; i < nextFirst; i++) nextGrid += '<div></div>';
    const peek = Math.min(14, nextDays);
    for (let day = 1; day <= peek; day++) {
      const dateStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === realToday;
      const isSelected = dateStr === anchorStr;
      nextGrid += `<button type="button" class="cal-pop-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="window.goToDate('${dateStr}')">${day}</button>`;
    }
    popover = `
      <div class="cal-popover" onclick="event.stopPropagation()">
        <div class="cal-pop-head">
          <strong>${monthTitle}</strong>
          <span>
            <button type="button" onclick="window.changeCalMonth(-1)" aria-label="Предыдущий месяц">‹</button>
            <button type="button" onclick="window.goToDate('${realToday}')" aria-label="Сегодня">●</button>
            <button type="button" onclick="window.changeCalMonth(1)" aria-label="Следующий месяц">›</button>
          </span>
        </div>
        <div class="cal-pop-grid">${grid}</div>
        <div class="cal-pop-grid">${nextGrid}</div>
      </div>`;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = ymdLocal(tomorrow);

  let listHtml = '';
  for (let i = 0; i < 21; i++) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + i);
    const dateStr = ymdLocal(d);
    const isToday = dateStr === realToday;
    const isTomorrow = dateStr === tomorrowStr;
    const dayName = WEEKDAYS_LONG[d.getDay()];
    const rel = isToday ? ' · Сегодня' : (isTomorrow ? ' · Завтра' : '');
    const dayTasks = state.tasks.filter(t => t.recurrence ? matchesRecurrence(t, dateStr) : t.date === dateStr && !t.deletedAt);
    dayTasks.sort((a, b) => a.priority - b.priority);
    const tasksHtml = dayTasks.map(t => taskRowHTML(t, dateStr, { hideDate: true, draggable: true })).join('');
    listHtml += `
      <section class="up-day" id="cal-day-${dateStr}">
        <div class="up-day-title ${isToday ? 'today' : ''}">${d.getDate()} ${monthsShort[d.getMonth()]}${rel} · ${dayName}</div>
        ${tasksHtml ? `<div class="up-tasks" ondragover="event.preventDefault()" ondrop="window.dropTask(event, '${dateStr}')">${tasksHtml}</div>` : ''}
        <button type="button" class="up-add" onclick="window.setCurrentDateAndOpenTask('${dateStr}')">+ Добавить задачу</button>
      </section>`;
  }

  const monthLabel = anchor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return { html: `
    <div class="upcoming">
      <div class="upcoming-bar">
        <button type="button" class="upcoming-month" onclick="window.toggleCalendarExpand()">${monthLabel} <span>${calendarExpanded ? '▴' : '▾'}</span></button>
        ${popover}
      </div>
      <div class="week-strip">${weekHtml}</div>
      <div class="upcoming-list">${listHtml}</div>
    </div>` };
}

window.goToDate = function(dateStr) {
  window.currentDate = dateStr;
  state.taskFilter = 'calendar';
  window._calendarAnchor = dateStr;
  window._calMonth = new Date(dateStr + 'T12:00:00');
  calendarExpanded = false;
  haptic();
  window.renderAll();
  if (!document.getElementById('screen-tasks')?.classList.contains('active')) {
    window.switchTab('tasks');
  }
};

window.changeCalMonth = function(delta) {
  const base = window._calMonth ? new Date(window._calMonth) : new Date();
  window._calMonth = new Date(base.getFullYear(), base.getMonth() + delta, 1);
  calendarExpanded = true;
  renderTasks();
};

window.setCurrentDateAndOpenTask = function(dateStr) {
  window.currentDate = dateStr;
  window.openTaskEditor();
};

window._showCompletedTasks = window._showCompletedTasks ?? false;
export function renderTasksTodayMini() {
  const t = window.currentDate;
  const tasks = state.tasks.filter(x => x.recurrence ? matchesRecurrence(x, t) : x.date === t);
  // Сортируем: невыполненные вверх
  tasks.sort((a, b) => { 
    const aDone = isTaskDoneOn(a, t) ? 1 : 0; 
    const bDone = isTaskDoneOn(b, t) ? 1 : 0; 
    if (aDone !== bDone) return aDone - bDone; 
    return a.priority - b.priority; 
  });
  const done = tasks.filter(x => isTaskDoneOn(x, t));
  const open = tasks.filter(x => !isTaskDoneOn(x, t));
  const showDone = window._showCompletedTasks;
  let html = '';
  if (open.length) html += open.map(x => taskRowHTML(x, t)).join('');
  if (done.length) {
    html += `<div class="completed-toggle" onclick="window.toggleCompletedTasks()" style="padding:10px 12px;font-size:13px;color:var(--text-sec);cursor:pointer;text-align:center;">
      ${showDone ? 'Скрыть' : 'Показать'} выполненные (${done.length})
    </div>`;
    if (showDone) html += done.map(x => taskRowHTML(x, t)).join('');
  }
  if (!tasks.length) html = '<div class="empty-hint warm">🍃 Список пуст — можно выдохнуть или добавить одну важную.</div>';
  document.getElementById('tasks-today-mini').innerHTML = html;
  if (window.renderAnxietyTaskHint) window.renderAnxietyTaskHint();
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

window.toggleCompletedTasks = function() {
  window._showCompletedTasks = !window._showCompletedTasks;
  renderTasksTodayMini();
};

window.renderComments = function() {
  const area = document.getElementById('comments-area');
  if (!area || !window._editingTask) return;
  const comments = window._editingTask.comments || [];
  area.innerHTML = comments.map(c => `
    <div class="comment-bubble">
      <div class="comment-text">${escapeHtml(c.text)}</div>
      <div class="comment-time">${new Date(c.ts).toLocaleString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
    </div>
  `).join('');
};
window.addComment = function() {
  const input = document.getElementById('t-comment-input');
  const text = input?.value.trim();
  if (!text || !window._editingTask) return;
  if (!window._editingTask.comments) window._editingTask.comments = [];
  window._editingTask.comments.push({ text, ts: Date.now() });
  input.value = '';
  window.renderComments();
  if (!window._isNewTask) window.saveTaskSilent();
};
