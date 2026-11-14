import { todayStr, haptic, escapeHtml, svgIcon, APP_VERSION } from './utils.js';
import { state, save, initSupabase } from './db.js';
import * as Tasks from './tasks.js';
import * as Surveys from './surveys.js';

// Делаем глобальные функции доступными для HTML (onclick)
window.currentDate = todayStr();
window.haptic = haptic;
window.showToast = (msg) => { /* код */ };
window.openSheet = (html) => { document.getElementById('sheet-content').innerHTML = html; document.getElementById('sheet').classList.add('open'); document.getElementById('backdrop').classList.add('open'); };
window.closeSheet = () => { const s = document.getElementById('sheet'); s.classList.remove('open'); document.getElementById('backdrop').classList.remove('open'); };
window.closePopover = () => { document.getElementById('popover-overlay').classList.remove('open'); };
window.openSettings = openSettings;
window.manualSyncWithUI = (btn) => { /* из db.js */ };

// Привязка задач
window.openTaskEditor = Tasks.openTaskEditor;
window.renderTasksTodayMini = Tasks.renderTasksTodayMini;

// Привязка опросов
window.openDailySurvey = Surveys.openDailySurvey;

// ==== ПОМОДОРО ТАЙМЕР ====
let pomoTimer = null;
let pomoTimeLeft = 25 * 60;
let pomoRunning = false;

window.togglePomodoro = function() {
  const btn = document.getElementById('pomo-btn');
  const display = document.getElementById('pomo-time');
  if (pomoRunning) {
    clearInterval(pomoTimer);
    pomoRunning = false;
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
        if (window.playSound) window.playSound('success');
        alert('🍅 Время вышло! Пора отдохнуть.');
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

// ==== РЕНДЕР ВСЕГО ====
window.renderAll = function() {
  // Здесь мы вызываем функции из модулей
  Tasks.renderTasksTodayMini();
  Tasks.renderTasks();
  Tasks.renderFocusOfDay(); // из tasks.js
  
  // Surveys.renderStats(); // и т.д.
  
  // Временная заглушка для колец (переносим логику сюда или в отдельный модуль)
  updateRings();
};

function updateRings() {
  // Твой старый код updateRings
}

// ==== НАСТРОЙКИ (с Changelog) ====
function openSettings() {
  // ... Твой старый код настроек (без блока версии, он ниже)
  // В самом конце openSheet добавь:
  window.openSheet(`
    ... твои настройки ...
    <div class="settings-header">О приложении</div>
    <div class="settings-group">
      <div class="settings-row" onclick="window.openChangelog()" style="cursor:pointer;">
        <div class="left"><div class="icon" style="background:var(--text-tert);">${svgIcon('info','#fff',16)}</div><span>Версия ${APP_VERSION}</span></div>
        <div style="color:var(--accent);font-size:14px;font-weight:600;">Что нового? →</div>
      </div>
    </div>
    <div style="margin-top:20px;"><button class="btn-cancel" onclick="window.closeSheet()">Закрыть</button></div>
  `);
}

// ==== ЗАПУСК ====
document.addEventListener('DOMContentLoaded', () => {
  window.renderAll();
  initSupabase();
});
