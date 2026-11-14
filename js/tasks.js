import { escapeHtml, svgIcon, todayStr, uid, WEEKDAYS_LONG, haptic, playSound } from './utils.js';
import { state, save } from './db.js';

// ... Функции matchesRecurrence, isTaskDoneOn, taskRowHTML, formatDuration, formatTaskDate ...

export function openTaskEditor(id) {
  const editingTaskId = id || null;
  const t = id ? state.tasks.find(x => x.id === id) : { title: '', description: '', date: window.currentDate, startTime: null, duration: null, priority: 4, projectId: null, recurrence: null };
  
  // ДОБАВЛЯЕМ UI ДЛЯ ПОВТОРЕНИЯ
  const recurOptions = [
    { val: '', label: 'Не повторять' },
    { val: 'daily', label: 'Каждый день' },
    { val: 'weekdays', label: 'По будням' },
    { val: 'weekly', label: 'Раз в неделю' }
  ];
  const recurHtml = recurOptions.map(o => `
    <div class="popover-item ${t.recurrence === o.val || (!t.recurrence && !o.val) ? 'active' : ''}" onclick="pickRecurrence('${o.val}')">
      <span>${o.label}</span>
      ${(t.recurrence === o.val || (!t.recurrence && !o.val)) ? '<span style="margin-left:auto;color:var(--td-green);font-weight:700;">✓</span>' : ''}
    </div>
  `).join('');

  window.openSheet(`
    <div class="td-editor">
      <input type="text" id="t-title" class="td-title-input" value="${escapeHtml(t.title)}" placeholder="Название задачи">
      <input type="text" id="t-desc" class="td-desc-input" value="${escapeHtml(t.description || '')}" placeholder="Описание">
      <div class="td-toolbar">
        <button type="button" class="td-btn" id="chip-date" onclick="document.getElementById('t-date').showPicker()">
          ${svgIcon('calendar', 'currentColor', 14)}
          <span id="chip-date-text">${t.date ? window.formatTaskDate(t.date) : 'Дата'}</span>
          <input type="date" id="t-date" value="${t.date || ''}" onchange="window.updateTaskChipDate(this.value)">
        </button>
        
        <!-- НОВАЯ КНОПКА ПОВТОРЕНИЯ -->
        <button type="button" class="td-btn" id="chip-recur" onclick="openRecurrencePicker()">
          ${svgIcon('refresh', 'currentColor', 14)}
          <span id="chip-recur-text">${t.recurrence ? ({daily:'Каждый день', weekdays:'Будни', weekly:'Раз в неделю'}[t.recurrence]) : 'Повтор'}</span>
        </button>

        <button type="button" class="td-btn prio-btn" id="chip-prio" onclick="window.openPriorityPicker()">
          ${svgIcon('flag', 'currentColor', 14)}
          <span id="chip-prio-text">${t.priority < 4 ? 'P' + t.priority : 'Приоритет'}</span>
        </button>
      </div>
      <!-- ... Блок времени и сохранения ... -->
      <div class="td-actions">
        <button class="btn-cancel" style="width:auto;margin:0;padding:10px 20px;" onclick="window.closeSheet()">Отмена</button>
        <button class="btn-save-task" onclick="window.saveTask()">Сохранить</button>
      </div>
    </div>
    <input type="hidden" id="t-priority" value="${t.priority}">
    <input type="hidden" id="t-recurrence" value="${t.recurrence || ''}">
  `);
}

// Вызывается из кнопки
window.openRecurrencePicker = function() {
  const cur = document.getElementById('t-recurrence').value;
  const content = document.getElementById('popover-content');
  content.innerHTML = `
    <h4 style="padding: 4px 12px 8px; font-size: 11px; color: var(--text-sec); font-weight: 700; text-transform: uppercase;">Повторение</h4>
    ${[{val:'',label:'Не повторять'},{val:'daily',label:'Каждый день'},{val:'weekdays',label:'По будням'},{val:'weekly',label:'Раз в неделю'}].map(o => `
      <div class="popover-item ${cur===o.val?'active':''}" onclick="pickRecurrence('${o.val}')">
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

export function saveTask() {
  // В функции saveTask при сохранении добавляем:
  const recurrence = document.getElementById('t-recurrence').value || null;
  // ... и передаем recurrence в объект задачи ...
}

// Экспортируем всё остальное (renderTasks, openProject и т.д.), 
// чтобы app.js мог их вызвать. Внутри используй window.renderAll() вместо renderAll().
