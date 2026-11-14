import { todayStr, haptic, escapeHtml, svgIcon, APP_VERSION, playSound, showToast } from './utils.js';
import { state, save, initSupabase } from './db.js';
import * as Tasks from './tasks.js';
import * as Surveys from './surveys.js';

// Глобальные переменные
window.currentDate = todayStr();
window.taskWeekOffset = 0;

// Привязка утилит к window для HTML
window.haptic = haptic;
window.playSound = playSound;
window.showToast = showToast;
window.openSheet = (html) => { document.getElementById('sheet-content').innerHTML = html; document.getElementById('sheet').classList.add('open'); document.getElementById('backdrop').classList.add('open'); };
window.closeSheet = () => { const s = document.getElementById('sheet'); s.classList.remove('open'); document.getElementById('backdrop').classList.remove('open'); window.closePopover(); };
window.closePopover = () => { document.getElementById('popover-overlay').classList.remove('open'); };

// Привязка модулей
window.openTaskEditor = Tasks.openTaskEditor;
window.toggleTask = Tasks.toggleTask;
window.removeTask = Tasks.removeTask;
window.changeTaskWeek = (dir) => { window.taskWeekOffset += dir; haptic(); Tasks.renderTasks(); };
window.setTaskFilter = (f) => { state.taskFilter = f; haptic(); save(); Tasks.renderTasks(); };
window.setAllFilter = (f) => { state.taskAllFilter = f; haptic(); save(); Tasks.renderTasks(); };

window.openDailySurvey = Surveys.openDailySurvey;
window.openChangelog = Surveys.openChangelog;

// ==== ПОМОДОРО ТАЙМЕР ====
let pomoTimer = null;
let pomoTimeLeft = 25 * 60;
let pomoRunning = false;

window.togglePomodoro = function() {
  const btn = document.getElementById('pomo-btn');
  const display = document.getElementById('pomo-time');
  if (pomoRunning) {
    clearInterval(pomoTimer); pomoRunning = false;
    btn.textContent = 'Старт'; btn.style.background = 'var(--accent)';
  } else {
    pomoRunning = true;
    btn.textContent = 'Стоп'; btn.style.background = 'var(--red)';
    pomoTimer = setInterval(() => {
      pomoTimeLeft--;
      const m = Math.floor(pomoTimeLeft / 60), s = pomoTimeLeft % 60;
      display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      if (pomoTimeLeft <= 0) {
        clearInterval(pomoTimer); pomoRunning = false; display.textContent = '25:00';
        btn.textContent = 'Старт'; btn.style.background = 'var(--accent)';
        playSound('success'); showToast('🍅 Время вышло! Пора отдохнуть.');
      }
    }, 1000);
  }
};

// ==== НАВИГАЦИЯ ====
window.switchTab = function(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.sidebar-nav button').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  document.querySelector('main').scrollTop = 0;
  document.getElementById('fab-tasks').classList.toggle('visible', name === 'tasks');
  document.getElementById('fab-notes').classList.toggle('visible', name === 'notes');
  window.renderAll();
};
document.querySelectorAll('.tab, .sidebar-nav button').forEach(tab => tab.onclick = () => window.switchTab(tab.dataset.tab));

// ==== РЕНДЕР ====
window.renderAll = function() {
  Tasks.renderTasksTodayMini();
  Tasks.renderTasks();
  Tasks.renderFocusOfDay();
  
  updateRings();
};

function updateRings() {
  const t = window.currentDate;
  const sPct = state.surveys[t]?.evening ? 1 : 0;
  
  const sched = state.habits.filter(h => !h.archived); // упрощенно
  const hPct = sched.length ? sched.filter(h => (h.checks[t] || 0) >= h.target).length / sched.length : 0;
  
  const tToday = state.tasks.filter(x => x.recurrence ? Tasks.matchesRecurrence(x, t) : x.date === t);
  const tPct = tToday.length ? tToday.filter(x => Tasks.isTaskDoneOn(x, t)).length / tToday.length : 0;
  
  const setRing = (id, r, pct) => { const el = document.getElementById(id); const c = 2 * Math.PI * r; el.setAttribute('stroke-dasharray', `${c * Math.max(0, Math.min(1, pct))} ${c}`); };
  setRing('ring-survey', 52, sPct); setRing('ring-habits', 38, hPct); setRing('ring-tasks', 24, tPct);
  
  document.getElementById('pct-survey').textContent = Math.round(sPct * 100) + '%';
  document.getElementById('pct-habits').textContent = Math.round(hPct * 100) + '%';
  document.getElementById('pct-tasks').textContent = Math.round(tPct * 100) + '%';
  
  const btn = document.getElementById('survey-btn');
  const btnContent = document.getElementById('survey-btn-content');
  const btnTime = document.getElementById('survey-btn-time');
  if (sPct) {
    btn.classList.add('done');
    btnContent.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg> <span>Опрос пройден</span>`;
    btnTime.textContent = state.surveys[t].eveningTime || 'Сегодня';
  } else {
    btn.classList.remove('done');
    btnContent.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> <span>Пройти опрос</span>`;
    btnTime.textContent = '';
  }
}

// ==== НАСТРОЙКИ ====
window.openSettings = function() {
  window.openSheet(`
    <h2>Настройки</h2>
    <div class="settings-header">Синхронизация</div>
    <div class="settings-group">
      <div class="settings-row"><div class="left">Статус</div><div>Настроено</div></div>
    </div>
    
    <div class="settings-header">О приложении</div>
    <div class="settings-group">
      <div class="settings-row" onclick="window.openChangelog()" style="cursor:pointer;">
        <div class="left"><div class="icon" style="background:var(--text-tert);">${svgIcon('info','#fff',16)}</div><span>Версия ${APP_VERSION}</span></div>
        <div style="color:var(--accent);font-size:14px;font-weight:600;">Что нового? →</div>
      </div>
    </div>
    <div style="margin-top:20px;"><button class="btn-cancel" onclick="window.closeSheet()">Закрыть</button></div>
  `);
};

// ==== СТАРТ ====
document.addEventListener('DOMContentLoaded', () => {
  window.renderAll();
  initSupabase();
});
