import { escapeHtml, todayStr, haptic, svgIcon, APP_VERSION } from './utils.js';
import { state, save, initSupabase, manualSyncWithUI } from './db.js';
import * as Tasks from './tasks.js';
import * as Surveys from './surveys.js';

// Делаем важные функции глобальными, чтобы они были доступны из HTML (onclick)
window.currentDate = todayStr();
window.haptic = haptic;
window.showToast = showToast; 
window.renderAll = renderAll;
window.switchTab = switchTab;
window.openSheet = openSheet;
window.closeSheet = closeSheet;
window.closePopover = closePopover;
window.openSettings = openSettings;
window.openTaskEditor = Tasks.openTaskEditor;
window.openDailySurvey = Surveys.openDailySurvey;
window.openChangelog = Surveys.openChangelog;
// и так далее...

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
    btn.textContent = 'Старт';
    btn.style.background = 'var(--accent)';
  } else {
    pomoRunning = true;
    btn.textContent = 'Стоп';
    btn.style.background = 'var(--red)';
    pomoTimer = setInterval(() => {
      pomoTimeLeft--;
      const m = Math.floor(pomoTimeLeft / 60);
      const s = pomoTimeLeft % 60;
      display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      
      if (pomoTimeLeft <= 0) {
        clearInterval(pomoTimer);
        pomoRunning = false;
        display.textContent = '25:00';
        btn.textContent = 'Старт';
        btn.style.background = 'var(--accent)';
        playSound('success');
        showToast('🍅 Время вышло! Пора отдохнуть.');
      }
    }, 1000);
  }
};

// ==== РОУТЕР И РЕНДЕР ====
function switchTab(name) {
  // Логика переключения экранов
  // ...
  renderAll();
}

function renderAll() {
  // Вызовы функций из других модулей
  updateRings();
  Tasks.renderTasks();
  // Surveys.renderWeeklyCard();
  // ... и т.д.
}

// ==== НАСТРОЙКИ (добавлен блок версии) ====
function openSettings() {
  // ... твой старый код настроек ...
  // В самом низу шторки добавь:
  openSheet(`
    ...
    <div class="settings-header">О приложении</div>
    <div class="settings-group">
      <div class="settings-row" onclick="openChangelog()" style="cursor:pointer;">
        <div class="left"><div class="icon" style="background:var(--text-tert);">${svgIcon('info','#fff',16)}</div><span>Версия ${APP_VERSION}</span></div>
        <div style="color:var(--accent);font-size:14px;font-weight:600;">Что нового? →</div>
      </div>
    </div>
    <div style="margin-top:20px;"><button class="btn-cancel" onclick="closeSheet()">Закрыть</button></div>
  `);
}

// Запуск
document.addEventListener('DOMContentLoaded', () => {
  renderAll();
  initSupabase();
});
