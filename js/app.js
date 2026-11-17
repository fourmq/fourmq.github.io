import { todayStr, haptic, escapeHtml, svgIcon, APP_VERSION, playSound, playTick, showToast, uid, PALETTE, WEEKDAYS_SHORT, WEEKDAYS_LONG, formatDateHuman, stripHtml, ICONS } from './utils.js';
import { state, save, initSupabase, pullFromCloud, pushToCloud, migrateState, supabaseClient, currentUser } from './db.js';
import * as Tasks from './tasks.js';
import * as Surveys from './surveys.js';

// ============ 1. ПРИВЯЗКА МОДУЛЕЙ К WINDOW ============
window.currentDate = todayStr();
window.taskWeekOffset = 0;
window.haptic = haptic;
window.playSound = playSound;
window.showToast = showToast;

window.openTaskEditor = Tasks.openTaskEditor;
window.toggleTask = Tasks.toggleTask;
window.removeTask = Tasks.removeTask;
window.postponeTask = Tasks.postponeTask;
window.openProject = Tasks.openProject;
window.addProject = Tasks.addProject;
window.deleteProject = Tasks.deleteProject;
window.changeTaskWeek = (dir) => { window.taskWeekOffset += dir; haptic(); Tasks.renderTasks(); };
window.setTaskFilter = (f) => { state.taskFilter = f; haptic(); save(); Tasks.renderTasks(); };
window.setAllFilter = (f) => { state.taskAllFilter = f; haptic(); save(); Tasks.renderTasks(); };

window.openDailySurvey = Surveys.openDailySurvey;
window.openChangelog = Surveys.openChangelog;
window.openWeeklySurvey = Surveys.openWeeklySurvey;
window.saveDailySurvey = Surveys.saveDailySurvey;
window.saveWeeklySurvey = Surveys.saveWeeklySurvey;

// ============ 2. БАЗОВЫЕ UI ФУНКЦИИ ============

// Sheet swipe-to-close
(function() {
  let startY = 0, currentY = 0, dragging = false;
  const sheet = () => document.getElementById('sheet');
  document.addEventListener('touchstart', e => {
    const s = sheet();
    if (!s || !s.classList.contains('open')) return;
    const touchY = e.touches[0].clientY; const handle = e.target.closest('.sheet') && (e.target === s || touchY - s.getBoundingClientRect().top < 48);
    if (handle || (e.target.closest('.sheet') && e.target.scrollTop === 0 && e.touches[0].clientY < s.getBoundingClientRect().top + 50)) {
      startY = e.touches[0].clientY;
      dragging = true;
    }
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    currentY = e.touches[0].clientY;
    const dy = currentY - startY;
    if (dy > 0) {
      const s = sheet();
      if (s) s.style.transform = `translateY(${dy}px)`;
    }
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    const dy = currentY - startY;
    const s = sheet();
    if (s) s.style.transform = '';
    if (dy > 80) window.closeSheet();
  });
})();

window.openSheet = (html) => { document.getElementById('sheet-content').innerHTML = html; document.getElementById('sheet').classList.add('open'); document.getElementById('backdrop').classList.add('open'); };
window.closeSheet = () => { const s = document.getElementById('sheet'); s.classList.remove('open'); document.getElementById('backdrop').classList.remove('open'); window.closePopover(); };
window.closePopover = () => { document.getElementById('popover-overlay').classList.remove('open'); };

// ============ 3. СВАЙПЫ (Только строки) ============
let touchStartX = 0, touchStartY = 0;
let touchEndX = 0, touchEndY = 0;
let swipingRow = null, isSwiping = false;

document.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
  
  const content = e.target.closest('.swipe-content');
  if (content) {
    document.querySelectorAll('.swipe-content').forEach(el => {
      if (el !== content && el.style.transform !== '') el.style.transform = 'translateX(0)';
    });
    swipingRow = content;
    isSwiping = false;
  }
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (!swipingRow) return;
  const currentX = e.changedTouches[0].screenX;
  const currentY = e.changedTouches[0].screenY;
  const dx = currentX - touchStartX;
  const dy = currentY - touchStartY;
  
  if (!isSwiping && Math.abs(dx) > Math.abs(dy) + 10) isSwiping = true;
  
  if (isSwiping) {
    e.preventDefault();
    let moveX = dx;
    if (moveX > 0) moveX = 0; 
    if (moveX < -160) moveX = -160; 
    swipingRow.style.transform = `translateX(${moveX}px)`;
  }
}, { passive: false });

document.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
  
  if (swipingRow) {
    const dx = touchEndX - touchStartX;
    if (isSwiping) {
      if (dx < -60) swipingRow.style.transform = `translateX(-160px)`;
      else swipingRow.style.transform = `translateX(0)`;
    }
    swipingRow = null; isSwiping = false;
    return;
  }
}, { passive: true });

// ============ 4. ЧАСЫ И ПРИВЕТСТВИЕ ============
window.getGreeting = function() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 18) return 'Добрый день';
  if (h >= 18 && h < 23) return 'Добрый вечер';
  return 'Доброй ночи';
};

window.getDynamicTitle = function() {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(window.currentDate + 'T12:00:00'); target.setHours(0,0,0,0);
  const diffDays = Math.round((target - today) / 86400000);
  if (diffDays === 0) return window.getGreeting();
  if (diffDays === -1) return 'Вчера';
  if (diffDays === 1) return 'Завтра';
  return target.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

window.updateTopbar = function() {
  const active = document.querySelector('.screen.active');
  const id = active ? active.id.replace('screen-', '') : 'today';
  const titleEl = document.getElementById('topbar-title');
  const TITLES = { today: 'Сегодня', tasks: 'Задачи', focus: 'Фокус', notes: 'Заметки', stats: 'Статистика' };
  if (id === 'today') titleEl.textContent = window.getDynamicTitle();
  else titleEl.textContent = TITLES[id];
};

window.tickClock = function() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('datestr').textContent = now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
  window.updateTopbar();
};
setInterval(window.tickClock, 1000);
window.tickClock();

// ============ 5. НАВИГАЦИЯ ============
window.changeDay = function(offset) {
  const d = new Date(window.currentDate + 'T12:00:00');
  d.setDate(d.getDate() + offset);
  window.currentDate = d.toISOString().slice(0, 10);
  haptic(); window.renderAll();
  window.maybeShowOnboarding && window.maybeShowOnboarding();
  window.scheduleSurveyReminderTick && window.scheduleSurveyReminderTick();
  document.getElementById('screen-today').classList.remove('slide-in-right', 'slide-in-left');
  void document.getElementById('screen-today').offsetWidth;
  document.getElementById('screen-today').classList.add(offset > 0 ? 'slide-in-right' : 'slide-in-left');
};
window.goToday = function() { window.currentDate = todayStr(); haptic(); window.renderAll(); };
window.updateDateNav = function() {
  const label = document.getElementById('date-nav-label');
  if (!label) return;
  if (window.currentDate === todayStr()) label.innerHTML = 'Сегодня';
  else {
    const d = new Date(window.currentDate + 'T12:00:00');
    label.innerHTML = `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' })} <span class="back-today" onclick="window.goToday()">Вернуться</span>`;
  }
};

window.switchTab = function(name) {
  if (name === 'today') window.currentDate = todayStr();
  if (window.closeSheet) window.closeSheet();
  window.updateTopbar(); // Сразу меняем заголовок, чтобы не было задержки
  
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.sidebar-nav button').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('slide-in-right', 'slide-in-left');
    s.classList.toggle('active', s.id === 'screen-' + name);
  });
  
  const targetScreen = document.getElementById('screen-' + name);
  if (targetScreen) {
    void targetScreen.offsetWidth;
    targetScreen.classList.add('slide-in-right');
  }
  
  document.querySelector('main').scrollTop = 0;
  document.getElementById('fab-tasks').classList.toggle('visible', name === 'tasks');
  document.getElementById('fab-notes').classList.toggle('visible', name === 'notes');
  
  if (name === 'focus') {
    window.populateFocusTasks();
    window.renderFocusHistory();
    document.getElementById('floating-timer').classList.remove('active');
  } else if (focusRunning) {
    document.getElementById('floating-timer').classList.add('active');
  }
  
  window.renderAll();
};
document.querySelectorAll('.tab, .sidebar-nav button').forEach(tab => tab.onclick = () => window.switchTab(tab.dataset.tab));

// ============ 6. ТЕМА И НАСТРОЙКИ ============
window.applyTheme = function() {
  const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = state.theme === 'dark' || (state.theme === 'auto' && sysDark);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
};
window.applyTheme();

window.openSettings = function() {
  const sb = state.supabase;
  const loggedIn = !!currentUser;
  const email = currentUser?.email || sb.email || '';
  
  window.openSheet(`
    <h2>Настройки</h2>
    ${loggedIn ? `
      <div class="profile-header"><div class="profile-avatar">${email.charAt(0).toUpperCase()}</div><div style="font-size:18px;font-weight:700;">${escapeHtml(email)}</div><div style="font-size:13px;color:var(--green-text);margin-top:4px;">✅ Синхронизация включена</div></div>
    ` : `
      <div class="profile-header" style="background:var(--pink-soft);"><div class="profile-avatar" style="background:var(--red);color:#fff;">!</div><div style="font-size:16px;font-weight:600;color:var(--red);">Вы не авторизованы</div><div style="font-size:13px;color:var(--text-sec);margin-top:4px;">Данные не сохраняются в облако</div></div>
    `}

    <div class="settings-header">Синхронизация</div>
    <div class="settings-group">
      <div class="settings-row"><div class="left"><div class="icon" style="background:var(--accent);">${svgIcon('cloud', '#fff', 16)}</div>Supabase URL</div></div>
      <div style="padding:0 16px 12px;"><input type="text" id="sb-url" value="${escapeHtml(sb.url)}" placeholder="https://xxx.supabase.co" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--separator-med);background:var(--input-bg);color:var(--text);outline:none;font-size:16px;height:44px;"></div>
      <div class="settings-row"><div class="left"><div class="icon" style="background:var(--accent);">${svgIcon('key', '#fff', 16)}</div>Anon Key</div></div>
      <div style="padding:0 16px 12px;"><input type="password" id="sb-key" value="${escapeHtml(sb.key)}" placeholder="eyJhbGciOi..." style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--separator-med);background:var(--input-bg);color:var(--text);outline:none;font-size:16px;height:44px;"></div>

      ${!loggedIn ? `
        <div class="settings-row"><div class="left"><div class="icon" style="background:var(--green);">${svgIcon('mail', '#fff', 16)}</div>Ваш Email</div></div>
        <div style="padding:0 16px 12px;"><input type="email" id="sb-email" placeholder="you@mail.com" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--separator-med);background:var(--input-bg);color:var(--text);outline:none;font-size:16px;height:44px;"></div>
        <div class="settings-row"><div class="left"><div class="icon" style="background:var(--green);">${svgIcon('lock', '#fff', 16)}</div>Пароль</div></div>
        <div style="padding:0 16px 12px;"><input type="password" id="sb-password" placeholder="••••••••" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--separator-med);background:var(--input-bg);color:var(--text);outline:none;font-size:16px;height:44px;"></div>
        <div style="padding:12px 16px;display:flex;gap:8px;">
          <button onclick="window.loginWithPassword()" style="flex:1;padding:12px;border-radius:10px;border:none;background:var(--accent-soft);color:var(--accent);font-weight:600;cursor:pointer;font-family:inherit;">Войти</button>
          <button onclick="window.registerWithPassword()" style="flex:1;padding:12px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-weight:600;cursor:pointer;font-family:inherit;">Регистрация</button>
        </div>
      ` : `
        <div class="settings-row" onclick="window.manualSync()" style="cursor:pointer;"><div class="left"><div class="icon" style="background:var(--green);">${svgIcon('refresh', '#fff', 16)}</div>Синхронизировать сейчас</div><div style="color:var(--text-tert);">›</div></div>
        <div class="settings-row" onclick="window.signOut()" style="cursor:pointer;"><div class="left"><div class="icon" style="background:var(--red);">${svgIcon('logout', '#fff', 16)}</div>Выйти</div></div>
      `}
    </div>

    <div class="settings-header">Внешний вид</div>
    <div class="settings-group">
      <div class="settings-row"><div class="left"><div class="icon" style="background:var(--teal);">${svgIcon('theme', '#fff', 16)}</div>Тема</div>
        <select onchange="window.state.theme=this.value; window.save(); window.applyTheme();" style="background:var(--bg);color:var(--text);border:none;font-size:16px;outline:none;">
          <option value="auto" ${state.theme === 'auto' ? 'selected' : ''}>Авто</option>
          <option value="light" ${state.theme === 'light' ? 'selected' : ''}>Светлая</option>
          <option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>Тёмная</option>
        </select>
      </div>
    </div>

    <div class="settings-header">Данные</div>
    <div class="settings-group">
      <div class="settings-row" onclick="window.openDataBackup()" style="cursor:pointer;">
        <div class="left"><div class="icon" style="background:var(--accent);">💾</div><span>Бэкап и напоминания</span></div>
        <div style="color:var(--accent);font-size:14px;font-weight:600;">→</div>
      </div>
    </div>

    <div class="settings-header">О приложении</div>
    <div class="settings-group">
      <div class="settings-row" onclick="window.openChangelog()" style="cursor:pointer;">
        <div class="left"><div class="icon" style="background:var(--text-tert);">${svgIcon('info', '#fff', 16)}</div><span>Версия ${APP_VERSION}</span></div>
        <div style="color:var(--accent);font-size:14px;font-weight:600;">Что нового? →</div>
      </div>
    </div>
    <div style="margin-top:20px;"><button class="btn-cancel" onclick="window.closeSheet()">Закрыть</button></div>
  `);
};

// ============ 7. ПРИВЫЧКИ ============
window.isScheduledOn = function(h, dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const sch = h.schedule || { type: 'daily' };
  if (sch.type === 'daily') return true;
  if (sch.type === 'weekdays') return (sch.days || []).includes(d.getDay());
  if (sch.type === 'interval') {
    const start = new Date((sch.startDate || h.createdAt) + 'T12:00:00');
    const diff = Math.floor((d - start) / 86400000);
    return diff >= 0 && diff % (sch.interval || 2) === 0;
  }
  return true;
};

window.weekCount = function(h, dateStr = todayStr()) {
  const d = new Date(dateStr + 'T12:00:00');
  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() || 7) - 1));
  let c = 0;
  for (let i = 0; i < 7; i++) {
    const ds = new Date(monday); ds.setDate(monday.getDate() + i);
    if ((h.checks[ds.toISOString().slice(0, 10)] || 0) > 0) c++;
  }
  return c;
};

window.isHabitDoneForDate = function(h, dateStr) {
  const sch = h.schedule || { type: 'daily' };
  if (sch.type === 'weekly') return window.weekCount(h, dateStr) >= (sch.interval || 3);
  return (h.checks[dateStr] || 0) >= h.target;
};

window.habitStreak = function(h) {
  let c = 0; const d = new Date();
  for (let i = 0; i < 365; i++) {
    const ds = d.toISOString().slice(0, 10);
    if (h.skips && h.skips[ds]) { d.setDate(d.getDate() - 1); continue; }
    if (!window.isScheduledOn(h, ds)) { d.setDate(d.getDate() - 1); continue; }
    if ((h.checks[ds] || 0) >= h.target) { c++; d.setDate(d.getDate() - 1); }
    else { if (i === 0) { d.setDate(d.getDate() - 1); continue; } break; }
  }
  return c;
};

window.activeHabits = function() { return state.habits.filter(h => !h.archived).sort((a, b) => (a.order || 0) - (b.order || 0)); };

window.habitsScheduledForDate = function(dateStr) {
  return window.activeHabits().filter(h => {
    if (h.skips && h.skips[dateStr]) return true;
    const sch = h.schedule || { type: 'daily' };
    if (sch.type === 'weekly') return window.weekCount(h, dateStr) < (sch.interval || 3) || (h.checks[dateStr] || 0) > 0;
    return window.isScheduledOn(h, dateStr);
  });
};

window.renderHabitsToday = function() {
  const el = document.getElementById('habits-today');
  const t = window.currentDate;
  const list = window.habitsScheduledForDate(t);
  if (!list.length) { el.innerHTML = '<div class="empty-hint">🌱 Пока тихий день.<br>Можно добавить привычку в ⚙️</div>'; return; }
  
  let html = '';
  list.forEach(h => {
    const cnt = h.checks[t] || 0; const done = window.isHabitDoneForDate(h, t); const skipped = h.skips && h.skips[t]; const streak = window.habitStreak(h); const isCounter = h.target > 1;
    const pillText = isCounter && !done ? (cnt > 0 ? `${cnt}/${h.target}` : `0/${h.target}`) : '';
    let sub = skipped ? '⏸ Пропущено' : (h.schedule.type === 'weekly' ? `${window.weekCount(h, t)}/${h.schedule.interval || 3} на неделе` : (isCounter ? `${cnt}/${h.target} · ${streak > 0 ? '🔥 ' + streak : ''}` : (streak > 0 ? '🔥 ' + streak + ' дн.' : 'Каждый день')));
    let checkContent = skipped ? '⏸' : (isCounter && !done ? pillText : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    
    // Свайпы убраны, обычная строка
    html += `
      <div class="habit-row ${skipped ? 'skipped' : ''}" data-habit-id="${h.id}">
        <div class="check-circle ${done ? 'done' : ''} ${isCounter && cnt > 0 && !done ? 'partial' : ''}" onclick="window.toggleHabit(${h.id},this)">${checkContent}</div>
        <div class="habit-icon-badge" style="background:${h.color}20;" onclick="window.openHabitDetail(${h.id})">${svgIcon(h.icon, h.color, 20)}</div>
        <div class="habit-info" onclick="window.openHabitDetail(${h.id})"><div class="habit-name ${done ? 'done' : ''}">${escapeHtml(h.name)}</div><div class="habit-sub">${sub}</div></div>
      </div>`;
  });
  el.innerHTML = html;
};

window.toggleHabit = function(id, el) {
  const h = state.habits.find(x => x.id === id); if (!h) return;
  const t = window.currentDate;
  if (h.skips && h.skips[t]) { delete h.skips[t]; save(); window.renderAll(); return; }
  const wasDone = window.isHabitDoneForDate(h, t);
  
  if (h.schedule.type === 'weekly') { if ((h.checks[t] || 0) > 0) delete h.checks[t]; else h.checks[t] = 1; }
  else { const cur = h.checks[t] || 0; if (cur >= h.target) delete h.checks[t]; else h.checks[t] = cur + 1; }
  
  const nowDone = window.isHabitDoneForDate(h, t);
  if (nowDone && !wasDone) {
    haptic('success'); playSound('success');
    if (el) { el.classList.add('checking'); const row = el.closest('.habit-row'); if (row) row.classList.add('completing'); }
    save(); setTimeout(() => { window.renderAll(); }, 500); return;
  }
  if (el) { el.classList.add('checking'); setTimeout(() => el.classList.remove('checking'), 400); }
  save(); window.renderAll();
};

window.openHabitDetail = function(id) {
  const h = state.habits.find(x => x.id === id); if (!h) return;
  const days = []; for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
  const doneDays = days.filter(d => window.isHabitDoneForDate(h, d)); const pct = Math.round(doneDays.length / 30 * 100); const streak = window.habitStreak(h);
  const total = Object.values(h.checks).reduce((a, b) => a + (b || 0), 0); const today = window.currentDate; const skippedToday = h.skips && h.skips[today];
  
  let heatmap = '';
  days.forEach(d => {
    const done = window.isHabitDoneForDate(h, d); const skipped = h.skips && h.skips[d]; const scheduled = window.isScheduledOn(h, d);
    heatmap += `<div style="aspect-ratio:1;border-radius:4px;background:${done ? 'var(--green)' : (skipped ? 'var(--yellow)' : 'var(--hm-empty)')};${!scheduled && !done ? 'opacity:.3' : ''} ${d === today ? 'outline:2px solid var(--accent);outline-offset:1px;' : ''}"></div>`;
  });
  
  window.openSheet(`
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><div class="habit-icon-badge" style="background:${h.color}20;width:48px;height:48px;border-radius:12px;">${svgIcon(h.icon, h.color, 26)}</div><h2 style="margin:0;">${escapeHtml(h.name)}</h2></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;">
      <div style="text-align:center;padding:12px;background:var(--input-bg);border-radius:12px;"><div style="font-size:22px;font-weight:700;">${streak}</div><div style="font-size:11px;color:var(--text-sec);">серия</div></div>
      <div style="text-align:center;padding:12px;background:var(--input-bg);border-radius:12px;"><div style="font-size:22px;font-weight:700;">${pct}%</div><div style="font-size:11px;color:var(--text-sec);">30 дней</div></div>
      <div style="text-align:center;padding:12px;background:var(--input-bg);border-radius:12px;"><div style="font-size:22px;font-weight:700;">${total}</div><div style="font-size:11px;color:var(--text-sec);">всего</div></div>
    </div>
    <div class="field"><label>30 дней</label></div>
    <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:4px;">${heatmap}</div>
    <div class="sheet-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn-cancel" style="flex:1 1 45%;margin:0;" onclick="window.skipHabitToday(${id})">${skippedToday ? '↩️ Отменить' : '⏸ Пропустить'}</button>
      <button class="btn-primary" style="flex:1 1 45%;" onclick="window.closeSheet();setTimeout(()=>window.openHabitEditor(${id}),100)">Изменить</button>
    </div>
    <div class="sheet-actions"><button class="btn-cancel" onclick="window.closeSheet()">Закрыть</button></div>
  `);
};

window.skipHabitToday = function(id) {
  const h = state.habits.find(x => x.id === id); if (!h) return; const t = window.currentDate; h.skips = h.skips || {};
  if (h.skips[t]) delete h.skips[t]; else h.skips[t] = true;
  haptic('medium'); save(); window.closeSheet(); window.renderAll(); setTimeout(() => window.openHabitDetail(id), 100);
};

window.openHabitSettings = function() {
  const habits = [...state.habits].sort((a, b) => (a.order || 0) - (b.order || 0));
  let list = '';
  habits.forEach(h => {
    list += `
      <div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:.5px solid var(--separator);">
        <div style="display:flex;flex-direction:column;gap:2px;"><button onclick="window.moveHabit(${h.id},-1)" style="width:28px;height:22px;border-radius:6px;border:none;background:var(--chip-bg);color:var(--text);">▲</button><button onclick="window.moveHabit(${h.id},1)" style="width:28px;height:22px;border-radius:6px;border:none;background:var(--chip-bg);color:var(--text);">▼</button></div>
        <div style="width:36px;height:36px;border-radius:10px;background:${h.color}20;display:flex;align-items:center;justify-content:center;">${svgIcon(h.icon, h.color, 20)}</div>
        <div style="flex:1;cursor:pointer;" onclick="window.closeSheet();setTimeout(()=>window.openHabitEditor(${h.id}),100)"><h4 style="font-size:15px;font-weight:600;">${escapeHtml(h.name)}</h4><p style="font-size:12px;color:var(--text-sec);">${h.schedule.type === 'daily' ? 'Каждый день' : h.schedule.type === 'weekdays' ? 'Дни недели' : 'Раз в неделю'}</p></div>
        <button onclick="event.stopPropagation();window.deleteHabit(${h.id})" style="background:none;border:none;color:var(--text-sec);display:flex;align-items:center;">${svgIcon('x', 'currentColor', 20)}</button>
      </div>`;
  });
  window.openSheet(`<h2>Привычки</h2><div class="card tight" style="margin-bottom:12px;">${list}</div><button class="btn-primary" onclick="window.closeSheet();setTimeout(window.openHabitEditor,100)">+ Новая привычка</button><div class="sheet-actions"><button class="btn-cancel" onclick="window.closeSheet()">Готово</button></div>`);
};

window.moveHabit = function(id, dir) {
  const sorted = state.habits.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const idx = sorted.findIndex(h => h.id === id); const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= sorted.length) return;
  [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]]; sorted.forEach((h, i) => h.order = i);
  haptic(); save(); window.openHabitSettings();
};
window.deleteHabit = function(id) { if (!confirm('Удалить привычку?')) return; state.habits = state.habits.filter(h => h.id !== id); save(); window.openHabitSettings(); window.renderAll(); };

let editingHabitId = null, habitDraft = null;
window.openHabitEditor = function(id) {
  editingHabitId = id || null; const existing = id ? state.habits.find(x => x.id === id) : null;
  habitDraft = existing ? JSON.parse(JSON.stringify(existing)) : { name: '', icon: 'target', color: PALETTE[5], target: 1, schedule: { type: 'daily', days: [1, 2, 3, 4, 5], interval: 2, startDate: todayStr() } };
  if (!habitDraft.schedule.days) habitDraft.schedule.days = [1, 2, 3, 4, 5]; if (!habitDraft.schedule.startDate) habitDraft.schedule.startDate = todayStr();
  window.renderHabitEditor();
};

window.renderHabitEditor = function() {
  const h = habitDraft, sch = h.schedule; const isWeekly = sch.type === 'weekly';
  window.openSheet(`
    <h2>${editingHabitId ? 'Изменить' : 'Новая привычка'}</h2>
    <div class="field"><label>Название</label><input type="text" id="h-name" value="${escapeHtml(h.name)}" placeholder="Например: Чтение"></div>
    <div class="field"><label>Иконка</label><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;" id="h-icons">${Object.keys(ICONS).map(n => `<button data-icon="${n}" style="aspect-ratio:1;border-radius:12px;border:2px solid ${n === h.icon ? 'var(--accent)' : 'transparent'};background:${n === h.icon ? 'var(--accent-soft)' : 'var(--input-bg)'};cursor:pointer;display:flex;align-items:center;justify-content:center;" onclick="window.pickHabitIcon('${n}')">${svgIcon(n, n === h.icon ? 'var(--accent)' : 'var(--text-sec)', 22)}</button>`).join('')}</div></div>
    <div class="field"><label>Цвет</label><div style="display:flex;gap:8px;flex-wrap:wrap;" id="h-colors">${PALETTE.map(c => `<button style="width:34px;height:34px;border-radius:50%;border:3px solid ${c === h.color ? 'var(--text)' : 'transparent'};background:${c};cursor:pointer;" onclick="window.pickHabitColor('${c}')"></button>`).join('')}</div></div>
    <div class="field"><label>${isWeekly ? 'Раз в неделю' : 'Сколько раз в день'}</label><input type="number" id="h-target" min="1" max="99" value="${isWeekly ? (sch.interval || 3) : h.target}"></div>
    <div class="field"><label>Повторяемость</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <button class="schedule-pill" style="padding:8px 12px;border-radius:14px;border:none;font-size:13px;font-weight:600;background:${sch.type === 'daily' ? 'var(--accent)' : 'var(--input-bg)'};color:${sch.type === 'daily' ? '#fff' : 'var(--text)'};cursor:pointer;font-family:inherit;" onclick="window.setScheduleType('daily')">Каждый день</button>
        <button class="schedule-pill" style="padding:8px 12px;border-radius:14px;border:none;font-size:13px;font-weight:600;background:${sch.type === 'weekdays' ? 'var(--accent)' : 'var(--input-bg)'};color:${sch.type === 'weekdays' ? '#fff' : 'var(--text)'};cursor:pointer;font-family:inherit;" onclick="window.setScheduleType('weekdays')">Дни недели</button>
        <button class="schedule-pill" style="padding:8px 12px;border-radius:14px;border:none;font-size:13px;font-weight:600;background:${sch.type === 'weekly' ? 'var(--accent)' : 'var(--input-bg)'};color:${sch.type === 'weekly' ? '#fff' : 'var(--text)'};cursor:pointer;font-family:inherit;" onclick="window.setScheduleType('weekly')">N раз в неделю</button>
      </div>
      ${sch.type === 'weekdays' ? `<div style="display:flex;gap:6px;justify-content:space-between;">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button style="width:36px;height:36px;border-radius:50%;border:none;font-size:13px;font-weight:600;background:${(sch.days || []).includes(d) ? 'var(--accent)' : 'var(--input-bg)'};color:${(sch.days || []).includes(d) ? '#fff' : 'var(--text)'};cursor:pointer;font-family:inherit;" onclick="window.toggleWeekday(${d})">${WEEKDAYS_SHORT[d]}</button>`).join('')}</div>` : ''}
      ${sch.type === 'weekly' ? `<p style="font-size:13px;color:var(--text-sec);">Отмечайте в любой день недели.</p>` : ''}
    </div>
    <div class="sheet-actions"><button class="btn-cancel" onclick="window.closeSheet()">Отмена</button><button class="btn-primary" onclick="window.saveHabit()">Сохранить</button></div>
  `);
};

window.pickHabitIcon = function(name) { habitDraft.icon = name; document.querySelectorAll('#h-icons button').forEach(b => { const a = b.dataset.icon === name; b.style.borderColor = a ? 'var(--accent)' : 'transparent'; b.style.background = a ? 'var(--accent-soft)' : 'var(--input-bg)'; b.innerHTML = svgIcon(b.dataset.icon, a ? 'var(--accent)' : 'var(--text-sec)', 22); }); };
window.pickHabitColor = function(c) { habitDraft.color = c; document.querySelectorAll('#h-colors button').forEach(b => { b.style.borderColor = b.style.backgroundColor.includes(c) ? 'var(--text)' : 'transparent'; }); };
window.setScheduleType = function(t) { habitDraft.name = document.getElementById('h-name').value; const val = Math.max(1, parseInt(document.getElementById('h-target').value) || 1); if (t !== 'weekly') habitDraft.target = val; habitDraft.schedule.type = t; if (t === 'weekdays' && !habitDraft.schedule.days) habitDraft.schedule.days = [1, 2, 3, 4, 5]; if (t === 'weekly') habitDraft.schedule.interval = val; window.renderHabitEditor(); };
window.toggleWeekday = function(d) { habitDraft.name = document.getElementById('h-name').value; habitDraft.target = Math.max(1, parseInt(document.getElementById('h-target').value) || 1); const days = habitDraft.schedule.days || []; const i = days.indexOf(d); if (i >= 0) days.splice(i, 1); else days.push(d); habitDraft.schedule.days = days; window.renderHabitEditor(); };
window.saveHabit = function() {
  habitDraft.name = document.getElementById('h-name').value.trim(); const val = Math.max(1, parseInt(document.getElementById('h-target').value) || 1);
  if (habitDraft.schedule.type === 'weekly') habitDraft.schedule.interval = val; else habitDraft.target = val;
  if (!habitDraft.name) { alert('Введите название'); return; }
  if (editingHabitId) { const h = state.habits.find(x => x.id === editingHabitId); Object.assign(h, habitDraft); }
  else { const order = Math.max(0, ...state.habits.map(x => x.order || 0)) + 1; state.habits.push({ ...habitDraft, id: uid(), checks: {}, skips: {}, archived: false, order, createdAt: Date.now() }); }
  haptic('success'); playSound('success'); save(); window.closeSheet(); window.renderAll();
};

// ============ 8. ПУЛЬС ДНЯ ============
let moodTimerInterval = null;
window.quickMood = function(value) {
  const t = window.currentDate; if (!state.moods[t]) state.moods[t] = [];
  const now = Date.now(); const lastMood = state.moods[t][state.moods[t].length - 1];
  if (lastMood && (now - lastMood.ts < 3600000)) { window.showToast(`⏳ Следующая отметка через ${Math.ceil((3600000 - (now - lastMood.ts)) / 60000)} мин.`); return; }
  
  const timeStr = new Date(now).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  state.moods[t].push({ time: timeStr, val: value, ts: now });
  if (!state.surveys[t]) state.surveys[t] = {}; if (!state.surveys[t].emotions) state.surveys[t].emotions = {};
  state.surveys[t].emotions.joy = Math.round(state.moods[t].reduce((sum, m) => sum + m.val, 0) / state.moods[t].length);
  haptic('success'); playSound('success'); save(); window.renderAll(); window.showToast(`✓ Настроение (${value}) сохранено`);
};

window.renderQuickMoodUI = function() {
  const t = window.currentDate; const moods = state.moods[t] || []; 
  const countEl = document.getElementById('mood-count');
  const container = document.getElementById('quick-mood-card');
  
  clearInterval(moodTimerInterval);
  const lastMood = moods[moods.length - 1]; const now = Date.now(); const cooldown = 3600000; // 1 час
  
  if (lastMood && (now - lastMood.ts < cooldown)) {
    container.style.display = 'none'; // Скрываем полностью
    const timeLeft = cooldown - (now - lastMood.ts);
    moodTimerInterval = setTimeout(() => { window.renderQuickMoodUI(); }, timeLeft);
  } else {
    container.style.display = 'block';
    container.classList.add('pulse-glow'); // Добавляем свечение
    if (countEl) countEl.textContent = `Отметок: ${moods.length}`;
    document.querySelectorAll('#quick-mood-row button').forEach(b => { b.style.opacity = '1'; b.style.pointerEvents = 'auto'; });
  }
};

// ============ 9. ЗАМЕТКИ ============
let currentNoteId = null, noteSaveTimer = null;
window.scheduleNoteSave = function() { clearTimeout(noteSaveTimer); noteSaveTimer = setTimeout(window.saveCurrentNote, 1500); };
window.saveCurrentNote = function() {
  if (!currentNoteId) return; clearTimeout(noteSaveTimer); const n = state.notes.find(x => x.id === currentNoteId); if (!n) return;
  n.title = document.getElementById('edit-note-title').value.trim() || 'Без названия';
  const body = document.getElementById('edit-note-body'); body.querySelectorAll('input[type=checkbox]').forEach(cb => { if (cb.checked) cb.setAttribute('checked', 'checked'); else cb.removeAttribute('checked'); });
  n.body = body.innerHTML; n.updatedAt = Date.now(); save();
};

window.renderNotes = function() {
  const chips = document.getElementById('folder-chips');
  if (chips) {
    const trashCount = (state.notes || []).filter(n => n.deletedAt).length;
    const folders = [{ id: 'all', name: 'Все', icon: '📚' }, ...state.noteFolders, { id: 'trash', name: trashCount ? `Корзина (${trashCount})` : 'Корзина', icon: '🗑' }];
    let chipsHtml = '';
    folders.forEach(f => {
      const isActive = state.selectedFolder === f.id;
      const isCustom = f.id !== 'all' && f.id !== 'trash';
      const bg = isActive ? (f.id === 'trash' ? 'var(--red)' : 'var(--orange)') : 'var(--chip-bg)';
      const color = isActive ? '#fff' : 'var(--text)';
      chipsHtml += `<button class="folder-chip" style="padding:7px 13px;border-radius:14px;border:none;font-size:13px;font-weight:600;background:${bg};color:${color};white-space:nowrap;cursor:pointer;font-family:inherit;" onclick="window.onFolderChip('${f.id}',${isCustom})">${f.icon || ''} ${escapeHtml(f.name)}</button>`;
    });
    if (state.selectedFolder !== 'trash') chipsHtml += `<button class="folder-chip" style="padding:7px 10px;border-radius:14px;border:none;font-size:13px;font-weight:600;background:var(--accent);color:#fff;cursor:pointer;font-family:inherit;" onclick="window.openFolderEditor()">＋</button>`;
    chips.innerHTML = chipsHtml;
  }
  const el = document.getElementById('notes-list'); if (!el) return;
  const search = (document.getElementById('notes-search')?.value || '').toLowerCase();
  const isTrash = state.selectedFolder === 'trash';
  let notes = state.notes || [];
  if (isTrash) notes = notes.filter(n => n.deletedAt);
  else {
    notes = notes.filter(n => !n.deletedAt);
    if (state.selectedFolder !== 'all') notes = notes.filter(n => n.folderId === state.selectedFolder);
  }
  if (search) notes = notes.filter(n => (n.title || '').toLowerCase().includes(search) || stripHtml(n.body).toLowerCase().includes(search));
  notes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!notes.length) { el.innerHTML = isTrash ? '<div class="empty-hint">🗑 Корзина пуста — и это хорошо</div>' : '<div class="empty-hint">📝 Здесь будут твои мысли.<br>Нажми +, когда захочешь</div>'; return; }
  
  let notesHtml = '';
  notes.forEach(n => {
    const preview = stripHtml(n.body).slice(0, 80);
    const dateStr = new Date(n.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const pinIcon = (!isTrash && n.pinned) ? '<span style="color:var(--orange);font-size:12px;margin-top:3px;">📌</span>' : '';
    const actions = isTrash
      ? `<button class="swipe-btn post" onclick="event.stopPropagation();window.restoreNote(${n.id})">${svgIcon('refresh','#fff',18)}</button>
          <button class="swipe-btn delete" onclick="event.stopPropagation();window.permanentlyDeleteNote(${n.id})">${svgIcon('trash','#fff',18)}</button>`
      : `<button class="swipe-btn unpin" onclick="event.stopPropagation();window.unpinNoteById(${n.id})">${svgIcon('pin','#fff',18)}</button>
          <button class="swipe-btn delete" onclick="event.stopPropagation();window.deleteNoteById(${n.id})">${svgIcon('trash','#fff',18)}</button>`;
    notesHtml += `
      <div class="swipe-row-container">
        <div class="swipe-actions">${actions}</div>
        <div class="swipe-content" onclick="window.openNote(${n.id})">
          ${pinIcon}
          <div style="flex:1;min-width:0;"><h4 style="font-size:15px;font-weight:600;margin-bottom:2px;${isTrash?'opacity:.7;':''}">${escapeHtml(n.title || 'Без названия')}</h4><p style="font-size:13px;color:var(--text-sec);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${escapeHtml(preview) || 'Пустая'}</p></div>
          <span style="font-size:11px;color:var(--text-sec);margin-left:auto;white-space:nowrap;">${dateStr}</span>
        </div>
      </div>`;
  });
  el.innerHTML = notesHtml + (isTrash ? '<button class="btn-cancel" style="width:100%;margin-top:12px;" onclick="window.clearOldTrash()">Очистить старше 30 дней</button>' : '');
};

window.deleteNoteById = function(id) {
  const n = state.notes.find(x => x.id === id);
  if (!n) return;
  n.deletedAt = Date.now();
  n.pinned = false;
  haptic(); save(); window.renderNotes();
  window.showToast('В корзине');
};
window.restoreNote = function(id) {
  const n = state.notes.find(x => x.id === id);
  if (!n) return;
  n.deletedAt = null; n.updatedAt = Date.now();
  haptic('success'); save(); window.renderNotes();
  window.showToast('Восстановлено');
};

window.clearOldTrash = function() {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const toRemove = (state.notes || []).filter(n => n.deletedAt && n.deletedAt < cutoff);
  if (!toRemove.length) { window.showToast('Нечего удалять'); return; }
  if (!confirm(`Удалить навсегда ${toRemove.length} зам. старше 30 дней?`)) return;
  const ids = new Set(toRemove.map(n => n.id));
  state.notes = state.notes.filter(n => !ids.has(n.id));
  haptic(); save(); window.renderNotes(); window.showToast(`Удалено: ${toRemove.length}`);
};

window.permanentlyDeleteNote = function(id) {
  if (!confirm('Удалить навсегда? Это нельзя отменить.')) return;
  state.notes = state.notes.filter(n => n.id !== id);
  haptic(); save(); window.renderNotes();
};

window.unpinNoteById = function(id) {
  const n = state.notes.find(n => n.id === id);
  if (n && n.pinned) {
    n.pinned = false;
    n.updatedAt = Date.now();
    save(); window.renderNotes();
  }
};

window.onFolderChip = function(id, isCustom) { if (isCustom && state.selectedFolder === id) { window.openFolderEditor(id); return; } state.selectedFolder = id; haptic(); save(); window.renderNotes(); };
window.openFolderEditor = function(id) { const folder = id ? state.noteFolders.find(f => f.id === id) : null; window.openSheet(`<h2>${folder ? 'Папка' : 'Новая папка'}</h2><div class="field"><label>Название</label><input type="text" id="f-name" value="${folder ? escapeHtml(folder.name) : ''}"></div><div class="field"><label>Иконка</label><input type="text" id="f-icon" value="${folder ? escapeHtml(folder.icon || '📁') : '📁'}" maxlength="2"></div><div class="sheet-actions">${folder ? `<button class="btn-danger" onclick="window.deleteFolder('${id}')">Удалить</button>` : ''}<button class="btn-cancel" onclick="window.closeSheet()">Отмена</button><button class="btn-primary" onclick="window.saveFolder('${id || ''}')">Сохранить</button></div>`); };
window.saveFolder = function(id) { const name = document.getElementById('f-name').value.trim(); const icon = document.getElementById('f-icon').value.trim() || '📁'; if (!name) return; if (id) { const f = state.noteFolders.find(x => x.id === id); if (f) { f.name = name; f.icon = icon; } } else { state.noteFolders.push({ id: uid() + '', name, icon }); } save(); window.closeSheet(); window.renderNotes(); };
window.deleteFolder = function(id) { if (!confirm('Удалить папку?')) return; state.noteFolders = state.noteFolders.filter(f => f.id !== id); state.notes.forEach(n => { if (n.folderId === id) n.folderId = null; }); if (state.selectedFolder === id) state.selectedFolder = 'all'; save(); window.closeSheet(); window.renderNotes(); };
window.addNote = function() { const folderId = state.selectedFolder === 'all' ? (state.noteFolders[0]?.id || null) : state.selectedFolder; const n = { id: uid(), title: 'Без названия', body: '', folderId, pinned: false, createdAt: Date.now(), updatedAt: Date.now() }; state.notes.push(n); haptic(); save(); window.openNote(n.id); };
window.openNote = function(id) {
  if (currentNoteId && currentNoteId !== id) window.saveCurrentNote();
  const n = state.notes.find(x => x.id === id);
  if (!n) return;
  currentNoteId = id;
  document.getElementById('edit-note-title').value = n.title || '';
  document.getElementById('edit-note-body').innerHTML = n.body || '';
  document.getElementById('notes-list-view').style.display = 'none';
  const edit = document.getElementById('note-edit-view');
  edit.style.display = 'flex';
  edit.style.flexDirection = 'column';
  window.updatePinBtn();
  window.updateNoteTrashActions(n);
  const dt = new Date(n.updatedAt);
  const mod = document.getElementById('note-last-modified');
  if (mod) {
    mod.textContent = n.deletedAt
      ? `В корзине · ${dt.toLocaleDateString('ru-RU')} ${dt.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}`
      : `Изменено ${dt.toLocaleDateString('ru-RU')} в ${dt.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}`;
  }
};

window.updateNoteTrashActions = function(n) {
  const actions = document.getElementById('note-header-actions');
  if (!actions) return;
  if (n && n.deletedAt) {
    actions.innerHTML = `
      <button class="note-ios-iconbtn" onclick="window.restoreCurrentNote()" title="Восстановить" style="color:var(--green);">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      </button>
      <button class="note-ios-iconbtn" onclick="window.deleteCurrentNote()" title="Удалить навсегда" style="color:var(--red);">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>`;
  } else {
    actions.innerHTML = `
      <button id="pin-btn" class="note-ios-iconbtn" onclick="togglePinNote()" title="Закрепить">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
      </button>
      <button class="note-ios-iconbtn" onclick="deleteCurrentNote()" title="Удалить" style="color:var(--red);">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>`;
    window.updatePinBtn();
  }
};

window.restoreCurrentNote = function() {
  if (!currentNoteId) return;
  const n = state.notes.find(x => x.id === currentNoteId);
  if (!n) return;
  n.deletedAt = null;
  n.updatedAt = Date.now();
  haptic('success');
  save();
  window.showToast('Восстановлено');
  currentNoteId = null;
  document.getElementById('notes-list-view').style.display = 'block';
  document.getElementById('note-edit-view').style.display = 'none';
  state.selectedFolder = 'all';
  window.renderNotes();
};
window.updatePinBtn = function() { const n = state.notes.find(x => x.id === currentNoteId); const btn = document.getElementById('pin-btn'); if (n && btn) { btn.style.color = n.pinned ? 'var(--orange)' : 'var(--text-sec)'; btn.style.background = n.pinned ? 'var(--accent-soft)' : 'var(--chip-bg)'; } };
window.togglePinNote = function() { const n = state.notes.find(x => x.id === currentNoteId); if (!n) return; n.pinned = !n.pinned; n.updatedAt = Date.now(); haptic(); save(); window.updatePinBtn(); window.renderNotes(); };
window.closeNoteEditor = function() { window.saveCurrentNote(); currentNoteId = null; document.getElementById('notes-list-view').style.display = 'block'; document.getElementById('note-edit-view').style.display = 'none'; window.renderNotes(); };

// Панель форматирования над клавиатурой (iOS-like)
(function setupNoteToolbarKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const tb = document.getElementById('note-toolbar-ios');
    const edit = document.getElementById('note-edit-view');
    if (!tb || !edit || edit.style.display === 'none') {
      if (tb) tb.style.transform = '';
      return;
    }
    // Разница между layout viewport и visual viewport = высота клавиатуры
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    tb.style.transform = kb > 40 ? `translateY(-${kb}px)` : '';
    tb.style.transition = 'transform 0.15s ease-out';
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
})();

window.deleteCurrentNote = function() {
  if (!currentNoteId) return;
  const n = state.notes.find(x => x.id === currentNoteId);
  if (!n) return;
  if (n.deletedAt) {
    if (!confirm('Удалить навсегда?')) return;
    state.notes = state.notes.filter(x => x.id !== currentNoteId);
  } else {
    n.deletedAt = Date.now();
    n.pinned = false;
    window.showToast('В корзине');
  }
  haptic(); save();
  currentNoteId = null;
  document.getElementById('notes-list-view').style.display = 'block';
  document.getElementById('note-edit-view').style.display = 'none';
  window.renderNotes();
};

// ============ 10. СТАТИСТИКА И ГРАФИКИ ============
function lastNDates(n){const a=[];for(let i=n-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);a.push(d.toISOString().slice(0,10))}return a}
function avgOf(a){const v=a.filter(x=>x!=null&&!isNaN(x));return v.length?v.reduce((x,y)=>x+y,0)/v.length:null}
function corr(xs,ys){const p=xs.map((x,i)=>[x,ys[i]]).filter(([x,y])=>x!=null&&y!=null&&!isNaN(x)&&!isNaN(y));const n=p.length;if(n<3)return null;const mx=p.reduce((a,q)=>a+q[0],0)/n,my=p.reduce((a,q)=>a+q[1],0)/n;let num=0,dx=0,dy=0;for(const[x,y]of p){num+=(x-mx)*(y-my);dx+=(x-mx)**2;dy+=(y-my)**2}const den=Math.sqrt(dx*dy);return den?num/den:null}

function dayTaskRate(dateStr) {
  const tasks = (state.tasks || []).filter(t => {
    if (t.recurrence) return typeof matchesRecurrence === 'function' ? matchesRecurrence(t, dateStr) : (window.Tasks && Tasks.matchesRecurrence ? Tasks.matchesRecurrence(t, dateStr) : false);
    return t.date === dateStr;
  });
  if (!tasks.length) return null;
  const done = tasks.filter(t => {
    if (window.Tasks && Tasks.isTaskDoneOn) return Tasks.isTaskDoneOn(t, dateStr);
    if (typeof isTaskDoneOn === 'function') return isTaskDoneOn(t, dateStr);
    return !!t.done;
  }).length;
  return done / tasks.length;
}

function surveyMetric(dateStr,path){const s=state.surveys[dateStr];if(!s)return null;const val=path.split('.').reduce((o,k)=>o&&o[k],s);if(val!=null)return val;return null}


window.exportWeeklyReport = function() {
  const days = lastNDates(7);
  const lines = ['# Недельный отчёт Cantilena', ''];
  days.forEach(d => {
    const s = state.surveys[d] || {};
    const rate = dayTaskRate(d);
    lines.push(`## ${d}`);
    lines.push(`- Энергия: ${s.physical?.energy ?? '—'} · Тревога: ${s.emotions?.anxiety ?? '—'} · Продуктивность: ${s.mental?.productivity ?? '—'}`);
    lines.push(`- Задачи: ${rate != null ? Math.round(rate * 100) + '%' : '—'}`);
    if (s.reflection?.gratitude) lines.push(`- Заметка: ${s.reflection.gratitude}`);
    lines.push('');
  });
  const wk = window.isoWeek ? window.isoWeek() : '';
  const ws = state.weeklySurveys?.[wk];
  if (ws) {
    lines.push('## Компас недели');
    lines.push(`- Цель: ${ws.goal || '—'}`);
    lines.push(`- Прогресс: ${ws.progress ?? '—'}/10`);
    lines.push(`- Урок: ${ws.lesson || '—'}`);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cantilena-week-${days[0]}.md`;
  a.click();
  window.showToast && window.showToast('Отчёт скачан');
};

window.renderStats = function() {
  const d14 = lastNDates(14);
  const d7 = lastNDates(7);
  const daysWithData = Object.keys(state.surveys).filter(d => state.surveys[d] && (state.surveys[d].evening || (state.surveys[d].emotions && state.surveys[d].emotions.joy))).length;
  const summaryEl = document.getElementById('stats-summary');

  // Hero insight
  const joy = avgOf(d7.map(d => surveyMetric(d, 'emotions.joy')));
  const energy = avgOf(d7.map(d => surveyMetric(d, 'physical.energy')));
  const prod = avgOf(d7.map(d => surveyMetric(d, 'mental.productivity')));
  const anx = avgOf(d7.map(d => surveyMetric(d, 'emotions.anxiety')));
  let heroEmoji = '🌱', heroTitle = 'Начинаем собирать картину', heroSub = 'Пара вечерних опросов — и здесь появится смысл';
  if (daysWithData === 0) {
    heroEmoji = '✨'; heroTitle = 'Пока тихо'; heroSub = 'Пройди первый вечерний опрос — откроется аналитика';
  } else if (daysWithData < 3) {
    heroEmoji = '📊'; heroTitle = `Уже ${daysWithData} дн. данных`; heroSub = `Ещё ${3 - daysWithData} — и появятся паттерны`;
  } else {
    if (energy != null && energy >= 7 && (anx == null || anx <= 4)) { heroEmoji = '⚡'; heroTitle = 'Неделя на энергии'; heroSub = 'Силы есть, тревога под контролем — хороший момент для важного'; }
    else if (anx != null && anx >= 7) { heroEmoji = '🫧'; heroTitle = 'Неделя была напряжённой'; heroSub = 'Тревога выше обычного — чуть больше отдыха не помешает'; }
    else if (prod != null && prod >= 7) { heroEmoji = '🚀'; heroTitle = 'Продуктивная неделя'; heroSub = 'Дела двигаются. Зафиксируй, что сработало'; }
    else if (energy != null && energy <= 4) { heroEmoji = '😴'; heroTitle = 'Сил маловато'; heroSub = 'Посмотри на сон и нагрузку — тело просит паузу'; }
    else { heroEmoji = '🙂'; heroTitle = 'Стабильная неделя'; heroSub = `На основе ${daysWithData} дней опросов`; }
  }

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="stats-hero">
        <div class="stats-hero-emoji">${heroEmoji}</div>
        <div class="stats-hero-text">
          <div class="stats-hero-title">${heroTitle}</div>
          <div class="stats-hero-sub">${heroSub}</div>
        </div>
      </div>`;
  }

  renderFocusAnalytics();
  renderAutoInsights();
  renderChart([
    { color: 'var(--td-orange)', data: d14.map(d => surveyMetric(d, 'emotions.joy')) },
    { color: 'var(--td-blue)', data: d14.map(d => surveyMetric(d, 'mental.productivity')) },
    { color: 'var(--pink)', data: d14.map(d => surveyMetric(d, 'emotions.anxiety')) }
  ]);
  renderTrends4W();
  renderStatsGrid();
  renderWeekdayPatterns();
  renderCorrMatrix();
  renderPsyProfile();
  renderPedRecommendations();
  renderYearInPixels();
};

function renderFocusAnalytics() {
  const el = document.getElementById('focus-analytics');
  if (!el) return;
  const sessions = state.focusSessions || [];
  const totalMins = sessions.reduce((sum, s) => sum + s.duration, 0);
  const totalHours = (totalMins / 60).toFixed(1);
  const treesGrown = sessions.length;
  
  const projStats = {};
  sessions.forEach(s => {
    if (!s.taskId) return;
    const t = state.tasks.find(x => x.id == s.taskId);
    if (t && t.projectId) {
      const p = state.projects.find(x => x.id === t.projectId);
      if (p) projStats[p.name] = (projStats[p.name] || 0) + s.duration;
    } else {
      projStats['Без проекта'] = (projStats['Без проекта'] || 0) + s.duration;
    }
  });
  
  let projHtml = '';
  Object.keys(projStats).sort((a,b) => projStats[b] - projStats[a]).forEach(k => {
    const hrs = (projStats[k] / 60).toFixed(1);
    projHtml += `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:.5px solid var(--separator); font-size:13px;"><span>${escapeHtml(k)}</span><b style="color:var(--text);">${hrs} ч</b></div>`;
  });

  el.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
      <div style="text-align:center; padding:12px; background:var(--input-bg); border-radius:12px;"><div style="font-size:22px; font-weight:700;">${totalHours} ч</div><div style="font-size:11px; color:var(--text-sec);">Всего в фокусе</div></div>
      <div style="text-align:center; padding:12px; background:var(--input-bg); border-radius:12px;"><div style="font-size:22px; font-weight:700;">${treesGrown} 🌳</div><div style="font-size:11px; color:var(--text-sec);">Деревьев выращено</div></div>
    </div>
    <div style="font-size:11px; font-weight:700; color:var(--text-sec); text-transform:uppercase; margin-bottom:6px;">Время по проектам</div>
    ${projHtml || '<div class="empty-hint" style="padding:0;">Пока нет данных.</div>'}
  `;
}

function renderChart(series) {
  const el = document.getElementById('chart-mood-prod'); const W = 380, H = 130, pad = { top: 10, right: 8, bottom: 18, left: 22 };
  const innerW = W - pad.left - pad.right, innerH = H - pad.top - pad.bottom; const n = series[0].data.length;
  const x = i => pad.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2); const y = v => pad.top + (1 - (v - 1) / 9) * innerH;
  let svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}">`;
  for (let v = 1; v <= 10; v += 3) { svg += `<line x1="${pad.left}" y1="${y(v)}" x2="${W - pad.right}" y2="${y(v)}" stroke="var(--chart-grid)" stroke-width="1"/>`; svg += `<text x="${pad.left - 4}" y="${y(v) + 3}" font-size="8" fill="var(--text-sec)" text-anchor="end">${v}</text>`; }
  series.forEach(s => { const pts = []; s.data.forEach((v, i) => { if (v != null) pts.push([x(i), y(v)]); }); if (pts.length < 2) { pts.forEach(p => svg += `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${s.color}"/>`); return; } let path = `M ${pts[0][0]} ${pts[0][1]}`; for (let i = 1; i < pts.length; i++) path += ` L ${pts[i][0]} ${pts[i][1]}`; svg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`; pts.forEach(p => svg += `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${s.color}"/>`); });
  svg += '</svg>'; el.innerHTML = svg;
}

function renderStatsGrid() {
  const d7 = lastNDates(7), d7prev = lastNDates(14).slice(0, 7);
  const metrics = [{ key: 'emotions.joy', label: 'Настроение' }, { key: 'mental.productivity', label: 'Продуктивность' }, { key: 'emotions.anxiety', label: 'Тревога', inv: true }, { key: 'physical.energy', label: 'Энергия' }, { key: 'physical.sleepHours', label: 'Сон', suffix: ' ч' }, { key: 'screen.totalHours', label: 'Экран', suffix: ' ч', inv: true }, { key: 'mental.meaning', label: 'Смысл' }, { key: 'physical.movement', label: 'Движение', suffix: ' мин' }];
  document.getElementById('stats-grid').innerHTML = metrics.map(m => { const cur = avgOf(d7.map(d => surveyMetric(d, m.key))); const prev = avgOf(d7prev.map(d => surveyMetric(d, m.key))); const delta = (cur != null && prev != null) ? cur - prev : null; const up = m.inv ? (delta != null && delta < 0) : (delta != null && delta > 0); const deltaHtml = delta != null ? `<span class="stat-delta ${up ? 'delta-up' : 'delta-down'}">${delta > 0 ? '↑' : '↓'}${Math.abs(delta).toFixed(1)}</span>` : ''; return `<div class="stat-card"><div class="stat-value small">${cur != null ? cur.toFixed(1) : '—'}${m.suffix || ''}${deltaHtml}</div><div class="stat-label">${m.label}</div></div>`; }).join('');
}

function renderWeekdayPatterns() {
  const el = document.getElementById('weekday-patterns'); if (!el) return;
  const days = lastNDates(60);
  const buckets = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const prods = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const rates = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  days.forEach(d => {
    if (!state.surveys[d] && dayTaskRate(d) == null) return;
    const wd = new Date(d + 'T12:00:00').getDay();
    const joy = surveyMetric(d, 'emotions.joy');
    const prod = surveyMetric(d, 'mental.productivity');
    const rate = dayTaskRate(d);
    if (joy != null) buckets[wd].push(joy);
    if (prod != null) prods[wd].push(prod);
    if (rate != null) rates[wd].push(rate);
  });
  const emojiFor = (v) => v == null ? '·' : v >= 8 ? '😄' : v >= 6 ? '🙂' : v >= 4 ? '😐' : '😔';
  const rows = [1, 2, 3, 4, 5, 6, 0].map(wd => ({
    wd, name: WEEKDAYS_LONG[wd],
    joy: avgOf(buckets[wd]), prod: avgOf(prods[wd]), rate: avgOf(rates[wd])
  }));
  if (!rows.some(r => r.joy != null || r.prod != null || r.rate != null)) {
    el.innerHTML = '<div class="empty-hint warm">📅 Через 2–3 недели здесь появятся «хорошие» и «тяжёлые» дни недели.</div>';
    return;
  }
  el.innerHTML = `<div class="weekday-cards">` + rows.map(r => {
    const w = r.joy != null ? (r.joy / 10 * 100) : 0;
    const ratePct = r.rate != null ? Math.round(r.rate * 100) + '%' : '—';
    return `<div class="weekday-card">
      <div class="weekday-card-top"><span class="weekday-emoji">${emojiFor(r.joy)}</span><span class="weekday-name">${r.name.slice(0,2)}</span></div>
      <div class="weekday-bar"><div style="width:${w}%"></div></div>
      <div class="weekday-meta">${r.joy != null ? r.joy.toFixed(1) : '—'} · задачи ${ratePct}</div>
    </div>`;
  }).join('') + `</div>`;
}

function renderCorrMatrix() {
  const el = document.getElementById('corr-matrix'); const metrics = [{ key: 'emotions.joy', label: 'Настроение' }, { key: 'mental.productivity', label: 'Продукт.' }, { key: 'emotions.anxiety', label: 'Тревога' }, { key: 'physical.sleepHours', label: 'Сон' }, { key: 'screen.totalHours', label: 'Экран' }, { key: 'physical.energy', label: 'Энергия' }];
  const days = lastNDates(30); const data = metrics.map(m => days.map(d => surveyMetric(d, m.key)));
  const cellClass = v => { if (v == null) return ''; const a = Math.abs(v); const sign = v > 0 ? 'pos' : 'neg'; if (a >= 0.6) return sign + '-strong'; if (a >= 0.3) return sign + '-med'; return sign + '-weak'; };
  let html = '<div class="corr-grid"><div class="corr-cell header"></div>' + metrics.map(m => `<div class="corr-cell header">${m.label}</div>`).join('');
  metrics.forEach((m1, i) => { html += `<div class="corr-cell header corr-row-label">${m1.label}</div>`; metrics.forEach((m2, j) => { if (i === j) { html += '<div class="corr-cell diag">—</div>'; return; } const v = corr(data[i], data[j]); html += `<div class="corr-cell ${cellClass(v)}">${v != null ? v.toFixed(2) : '·'}</div>`; }); });
  html += '</div><div style="font-size:11px;color:var(--text-sec);margin-top:8px;text-align:center;">r Пирсона. Ярче = сильнее связь. Требуется ≥ 3 дней.</div>'; el.innerHTML = html;
}

function renderAutoInsights() {
  const el = document.getElementById('auto-insights'); if (!el) return;
  const days = lastNDates(30);
  const insights = [];

  // Emotion ↔ task completion
  const joyArr = [], rateArr = [], anxArr = [], energyArr = [];
  days.forEach(d => {
    const rate = dayTaskRate(d);
    if (rate == null) return;
    const joy = surveyMetric(d, 'emotions.joy');
    const anx = surveyMetric(d, 'emotions.anxiety');
    const en = surveyMetric(d, 'physical.energy');
    if (joy != null) { joyArr.push(joy); rateArr.push(rate); }
    if (anx != null) anxArr.push({ anx, rate });
    if (en != null) energyArr.push({ en, rate });
  });
  if (joyArr.length >= 5) {
    const r = corr(joyArr, rateArr);
    if (r != null && Math.abs(r) > 0.25) {
      insights.push(r > 0
        ? { e: '✅', t: `В дни с лучшим настроением ты закрываешь больше задач (связь r=${r.toFixed(2)}).` }
        : { e: '🤔', t: `Настроение и закрытие задач связаны слабо/обратно (r=${r.toFixed(2)}).` });
    }
  }
  if (anxArr.length >= 5) {
    const high = anxArr.filter(x => x.anx >= 7);
    const low = anxArr.filter(x => x.anx <= 4);
    if (high.length >= 2 && low.length >= 2) {
      const hAvg = avgOf(high.map(x => x.rate));
      const lAvg = avgOf(low.map(x => x.rate));
      if (hAvg != null && lAvg != null && lAvg - hAvg > 0.1) {
        const pct = Math.round((lAvg - hAvg) * 100);
        insights.push({ e: '🫧', t: `В дни с высокой тревогой закрываешь примерно на ${pct}% меньше задач. Имеет смысл планировать меньше.` });
      }
    }
  }
  if (energyArr.length >= 5) {
    const high = energyArr.filter(x => x.en >= 7);
    const low = energyArr.filter(x => x.en <= 4);
    if (high.length >= 2 && low.length >= 2) {
      const hAvg = avgOf(high.map(x => x.rate));
      const lAvg = avgOf(low.map(x => x.rate));
      if (hAvg != null && lAvg != null && hAvg - lAvg > 0.1) {
        insights.push({ e: '⚡', t: `При высокой энергии задачи закрываются заметно лучше. Лови такие дни для важного.` });
      }
    }
  }

  // Sleep / anxiety classics
  const lowSleep = days.filter(d => { const h = state.surveys[d]?.physical?.sleepHours; return h != null && h < 7; });
  const normSleep = days.filter(d => { const h = state.surveys[d]?.physical?.sleepHours; return h != null && h >= 7; });
  const lowAnx = avgOf(lowSleep.map(d => state.surveys[d]?.emotions?.anxiety));
  const normAnx = avgOf(normSleep.map(d => state.surveys[d]?.emotions?.anxiety));
  if (lowAnx != null && normAnx != null && lowAnx > normAnx + 0.8) {
    insights.push({ e: '😴', t: `После короткого сна тревога выше (~${lowAnx.toFixed(1)} vs ${normAnx.toFixed(1)}). Сон — рычаг.` });
  }
  const moveDays = days.filter(d => (state.surveys[d]?.physical?.movement || 0) >= 20);
  const noMoveDays = days.filter(d => (state.surveys[d]?.physical?.movement || 0) < 20 && state.surveys[d]);
  const moveMood = avgOf(moveDays.map(d => state.surveys[d]?.emotions?.joy));
  const noMoveMood = avgOf(noMoveDays.map(d => state.surveys[d]?.emotions?.joy));
  if (moveMood != null && noMoveMood != null && moveMood > noMoveMood + 0.5) {
    insights.push({ e: '🚶', t: `В дни с движением настроение выше (${moveMood.toFixed(1)} vs ${noMoveMood.toFixed(1)}).` });
  }
  const w1 = lastNDates(14).slice(0, 7), w2 = lastNDates(7);
  const anx1 = avgOf(w1.map(d => state.surveys[d]?.emotions?.anxiety));
  const anx2 = avgOf(w2.map(d => state.surveys[d]?.emotions?.anxiety));
  if (anx1 != null && anx2 != null && anx2 > anx1 + 1) insights.push({ e: '📈', t: 'Тревога на этой неделе выше прошлой. Можно снизить нагрузку.' });
  if (anx1 != null && anx2 != null && anx1 > anx2 + 1) insights.push({ e: '📉', t: 'Тревога снизилась по сравнению с прошлой неделей — хороший знак.' });

  if (!insights.length) {
    const daysWithData = days.filter(d => state.surveys[d]?.evening).length;
    if (daysWithData < 3) el.innerHTML = `<div class="empty-hint warm">🌱 Пока рано для выводов. Ещё ${3 - daysWithData} вечерних опроса — и появятся паттерны.</div>`;
    else el.innerHTML = `<div class="empty-hint warm">✨ Пока резких паттернов нет — это тоже нормально. Продолжай отмечать дни.</div>`;
    return;
  }
  el.innerHTML = insights.slice(0, 4).map(i => `<div class="insight-card"><span class="insight-emoji">${i.e}</span><span class="insight-text">${escapeHtml(i.t)}</span></div>`).join('');
}

function renderTrends4W() {
  const el = document.getElementById('trends-4w'); if (!el) return; const last28 = lastNDates(28); const weeks = [last28.slice(0, 7), last28.slice(7, 14), last28.slice(14, 21), last28.slice(21, 28)];
  const metrics = [{ key: 'emotions.joy', label: 'Настроение', inv: false }, { key: 'mental.productivity', label: 'Продуктивность', inv: false }, { key: 'emotions.anxiety', label: 'Тревога', inv: true }, { key: 'physical.energy', label: 'Энергия', inv: false }];
  const rows = metrics.map(m => { const vals = weeks.map(w => avgOf(w.map(d => state.surveys[d]?.[m.key.split('.')[0]]?.[m.key.split('.')[1]]))); const firstNonNull = vals.find(v => v != null); const lastNonNull = [...vals].reverse().find(v => v != null); const delta = (firstNonNull != null && lastNonNull != null) ? lastNonNull - firstNonNull : null; const good = delta != null && (m.inv ? delta < -0.3 : delta > 0.3); const bad = delta != null && (m.inv ? delta > 0.3 : delta < -0.3); const arrow = delta == null ? '' : delta > 0.3 ? '↑' : delta < -0.3 ? '↓' : '→'; return { label: m.label, vals, delta, good, bad, arrow }; });
  if (!rows.some(r => r.vals.some(v => v != null))) { el.innerHTML = '<div class="empty-hint">Нужно минимум 2-3 недели данных для трендов.</div>'; return; }
  el.innerHTML = rows.map(r => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:.5px solid var(--separator);"><div style="flex:1;font-size:13px;">${r.label}</div>${r.vals.map(v => `<div style="width:32px;text-align:center;font-size:11px;color:var(--text-sec);font-variant-numeric:tabular-nums;">${v != null ? v.toFixed(1) : '·'}</div>`).join('')}<div style="width:52px;text-align:right;font-size:13px;font-weight:700;color:${r.good ? 'var(--green)' : r.bad ? 'var(--red)' : 'var(--text-sec)'};">${r.arrow}${r.delta != null ? Math.abs(r.delta).toFixed(1) : ''}</div></div>`).join('') + `<div style="display:flex;gap:10px;font-size:10px;color:var(--text-sec);margin-top:8px;"><div style="flex:1;"></div>${['−3н', '−2н', '−1н', 'сейчас'].map(w => `<div style="width:32px;text-align:center;">${w}</div>`).join('')}<div style="width:52px;"></div></div>`;
}

function renderPsyProfile() {
  const el = document.getElementById('psy-profile'); const days = lastNDates(14); const get = k => avgOf(days.map(d => surveyMetric(d, k)));
  const joy = get('emotions.joy'), anx = get('emotions.anxiety'), sad = get('emotions.sadness'), irr = get('emotions.irritation'), meaning = get('mental.meaning'); const posAvg = joy; const negAvg = avgOf([anx, sad, irr].filter(x => x != null)); const balance = (posAvg != null && negAvg != null) ? posAvg - negAvg : null; const balanceLabel = balance == null ? 'мало данных' : balance > 2 ? '🟢 позитивный' : balance > 0 ? '🟡 сбалансированный' : '🔴 негативный';
  const stress = get('mental.stress'), energy = get('physical.energy'), sleepQ = get('physical.sleepQuality'); let burnRisk = 0, parts = 0;
  if (stress != null) { burnRisk += stress; parts++; } if (energy != null) { burnRisk += (10 - energy); parts++; } if (anx != null) { burnRisk += anx; parts++; } if (sleepQ != null) { burnRisk += (10 - sleepQ); parts++; }
  const burn = parts ? burnRisk / parts : 0; const burnLabel = burn > 7 ? '🔴 Высокий' : burn > 5 ? '🟡 Умеренный' : burn > 0 ? '🟢 Низкий' : '—';
  const sleepCorr = corr(days.map(d => surveyMetric(d, 'physical.sleepHours')), days.map(d => surveyMetric(d, 'emotions.joy'))); const screenAnx = corr(days.map(d => surveyMetric(d, 'screen.totalHours')), days.map(d => surveyMetric(d, 'emotions.anxiety')));
  if (balance == null && burn === 0 && sleepCorr == null && meaning == null) { el.innerHTML = '<div class="expert-badge badge-psy">Картина недели</div><div class="empty-hint">Пройди 2-3 вечерних опроса, чтобы получить картину недели.</div>'; return; }
  el.innerHTML = `<div class="expert-badge badge-psy">Картина недели</div><div class="insight">🙂 <b>Баланс:</b> ${balanceLabel} ${balance != null ? `(${balance.toFixed(1)})` : ''}</div><div class="insight">🔥 <b>Нагрузка:</b> ${burnLabel} ${burn ? `(${burn.toFixed(1)}/10)` : ''}</div>${meaning != null ? `<div class="insight">✨ <b>Смысл:</b> ${meaning.toFixed(1)}/10 ${meaning < 5 ? '— стоит проверить ценности' : '— хороший знак'}</div>` : ''}${sleepCorr != null && Math.abs(sleepCorr) > 0.3 ? `<div class="insight"><b>Сон влияет на настроение:</b> r=${sleepCorr.toFixed(2)}</div>` : ''}${screenAnx != null && Math.abs(screenAnx) > 0.3 ? `<div class="insight"><b>Экран ↔ тревога:</b> r=${screenAnx.toFixed(2)}</div>` : ''}<div class="insight" style="color:var(--text-sec);font-size:13px;">На основе ${days.filter(d => state.surveys[d]).length} опросов за 14 дней</div>`;
}

function renderPedRecommendations() {
  const el = document.getElementById('ped-recommendations'); const days = lastNDates(7); const active = window.activeHabits(); const habitRate = active.length ? active.reduce((acc, h) => acc + days.filter(d => window.isHabitDoneForDate(h, d)).length, 0) / (active.length * 7) * 100 : null; const bestStreak = active.reduce((m, h) => Math.max(m, window.habitStreak(h)), 0);
  const totalTasks = state.tasks.filter(t => !t.recurrence && days.includes(t.date)); const doneTasks = totalTasks.filter(t => t.done).length; const taskRate = totalTasks.length ? Math.round(doneTasks / totalTasks.length * 100) : null; const recs = [];
  if (active.length > 3 && habitRate != null && habitRate < 40) recs.push({ e: '✂️', t: `У вас ${active.length} привычек, но выполняете ${habitRate.toFixed(0)}%. Сократи до 2-3.` }); else if (habitRate != null && habitRate >= 70) recs.push({ e: '🏆', t: `Отличная приверженность (${habitRate.toFixed(0)}%). Можно добавить новую.` });
  if (bestStreak >= 5) recs.push({ e: '🔥', t: `Лучшая серия — ${bestStreak} дней. Продолжай!` }); if (taskRate != null && taskRate < 50 && totalTasks.length > 5) recs.push({ e: '🎯', t: `Выполняешь ${taskRate}% задач. Сократи до 3-5 в день.` });
  const sleepMood = corr(lastNDates(14).map(d => surveyMetric(d, 'physical.sleepHours')), lastNDates(14).map(d => surveyMetric(d, 'emotions.joy'))); if (sleepMood != null && sleepMood > 0.4) recs.push({ e: '🧪', t: `Эксперимент: ложись на 30 мин раньше 3 дня подряд.` });
  if (!recs.length) recs.push({ e: '📊', t: 'Собираем данные. Пройди 3-5 опросов.' });
  el.innerHTML = `<div class="expert-badge badge-ped">Педагог</div>` + recs.map(r => `<div class="insight">${r.e} ${escapeHtml(r.t)}</div>`).join('');
}

function renderYearInPixels() {
  const el = document.getElementById('year-grid'); if (!el) return; const days = []; for (let i = 364; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
  el.innerHTML = days.map(d => { const sPct = state.surveys[d]?.evening ? 1 : 0; const sched = window.habitsScheduledForDate(d); const hPct = sched.length ? sched.filter(h => window.isHabitDoneForDate(h, d)).length / sched.length : 0; const tToday = state.tasks.filter(x => x.recurrence ? Tasks.matchesRecurrence(x, d) : x.date === d); const tPct = tToday.length ? tToday.filter(x => Tasks.isTaskDoneOn(x, d)).length / tToday.length : 0; const score = (sPct + hPct + tPct) / 3; let cls = ''; if (score > 0.75) cls = 'level-4'; else if (score > 0.5) cls = 'level-3'; else if (score > 0.25) cls = 'level-2'; else if (score > 0) cls = 'level-1'; return `<div class="year-cell ${cls}" title="${d}"></div>`; }).join('');
}



window.renderAnxietyTaskHint = function() {
  const t = window.currentDate || (typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0,10));
  const el = document.getElementById('tasks-today-mini');
  if (!el || !el.parentElement) return;
  el.parentElement.querySelectorAll('.anxiety-task-hint').forEach(n => n.remove());
  let a = state.surveys[t]?.emotions?.anxiety;
  if (a == null) {
    const y = new Date(t + 'T12:00:00'); y.setDate(y.getDate() - 1);
    a = state.surveys[y.toISOString().slice(0,10)]?.emotions?.anxiety;
  }
  if (a == null || a < 7) return;
  const tip = document.createElement('div');
  tip.className = 'anxiety-task-hint onboard-tip';
  tip.style.marginBottom = '10px';
  tip.innerHTML = '<div>🫧 Тревога была высокой. На сегодня лучше <b>2–3 задачи</b>, не больше.</div>';
  el.parentElement.insertBefore(tip, el);
};

window.renderOnboardTip = function() {
  const el = document.getElementById('onboard-survey-tip');
  if (!el) return;
  if (localStorage.getItem('cantilena_tip_survey_v1')) { el.innerHTML = ''; return; }
  const daysWith = Object.keys(state.surveys || {}).filter(d => state.surveys[d]?.evening).length;
  if (daysWith >= 5) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="onboard-tip">
    <div>✨ <b>Зачем вечерний опрос?</b><br>3 касания — и статистика начнёт показывать твои паттерны: сон, тревога, задачи.</div>
    <button type="button" onclick="localStorage.setItem('cantilena_tip_survey_v1','1');this.parentElement.remove()" aria-label="Закрыть">×</button>
  </div>`;
};

window.renderWeeklyCard = function() {
  const container = document.getElementById('weekly-survey-container'); if (!container) return; const wk = window.isoWeek(); const s = state.weeklySurveys[wk]; const passed = s && s.ts;
  
  let goal = s?.goal || 'Цель не указана';
  let progress = s?.progress !== undefined ? s.progress : '—';
  
  let cardContent = ''; 
  if (passed) { 
    cardContent = `<div class="compass-goal">${escapeHtml(goal)}</div><div class="compass-meta">Прогресс: ${progress}/10 </div><div class="compass-status passed">✅ Опрос пройден</div>`; 
  } else { 
    cardContent = `<div class="compass-goal">Определи цель недели →</div><div class="compass-meta">Цель, прогресс, что мешало, вывод.</div>`; 
  }
  container.innerHTML = `<div class="card compass-card" onclick="window.openWeeklySurvey('${wk}')" style="cursor:pointer;"><div class="compass-label">${svgIcon('target', 'currentColor', 14)} Компас недели</div>${cardContent}</div>`;
};

window.isoWeek = function(d = new Date()) { const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dayNum = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - dayNum); const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1)); const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7); return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`; };

// ============ 11. РЕНДЕР ============

// ===== TODAY HERO (1 insight + 1 CTA) =====
window.renderTodayHero = function() {
  const el = document.getElementById('today-hero'); if (!el) return;
  const t = window.currentDate;
  const surveyDone = !!(state.surveys[t]?.evening);
  const habits = (window.habitsScheduledForDate && window.habitsScheduledForDate(t)) || [];
  const habitsDone = habits.filter(h => window.isHabitDoneForDate(h, t)).length;
  const tasks = (state.tasks || []).filter(x => {
    if (x.recurrence) return window.Tasks?.matchesRecurrence ? Tasks.matchesRecurrence(x, t) : false;
    return x.date === t;
  });
  const tasksOpen = tasks.filter(x => !(window.Tasks?.isTaskDoneOn ? Tasks.isTaskDoneOn(x, t) : x.done)).length;
  const overdue = window.getOverdueTasks ? window.getOverdueTasks() : [];
  const anx = state.surveys[t]?.emotions?.anxiety ?? state.surveys[(() => { const d=new Date(t+'T12:00:00');d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);})()]?.emotions?.anxiety;

  let emoji = '☀️', title = 'Хороший день, чтобы двигаться', sub = '', cta = '', ctaFn = '';
  if (overdue.length) {
    emoji = '📌'; title = `${overdue.length} просроченных`; sub = 'Разбери хотя бы одну — станет легче'; cta = 'К просроченным'; ctaFn = "window.switchTab('tasks');state.taskFilter='overdue';window.setTaskFilter('overdue')";
  } else if (!surveyDone && new Date().getHours() >= 18) {
    emoji = '✨'; title = 'Вечерний опрос'; sub = '3 касания — и день зафиксирован'; cta = 'Пройти опрос'; ctaFn = 'window.openDailySurvey()';
  } else if (tasksOpen > 0) {
    emoji = '✅'; title = `${tasksOpen} задач на сегодня`; sub = anx >= 7 ? 'Тревога была высокой — лучше 2–3 дела' : 'Можно начать с фокуса на одной'; cta = 'Фокус 20 мин'; ctaFn = "window.switchTab('focus');window.prepareFocusForAnxiety && window.prepareFocusForAnxiety()";
  } else if (habits.length && habitsDone < habits.length) {
    emoji = '🌱'; title = `Привычки ${habitsDone}/${habits.length}`; sub = 'Отметь оставшиеся — серия продолжится'; cta = 'К привычкам'; ctaFn = "document.getElementById('habits-today')?.scrollIntoView({behavior:'smooth'})";
  } else if (surveyDone && tasksOpen === 0) {
    emoji = '🎉'; title = 'День закрыт'; sub = 'Опрос есть, задачи в порядке'; cta = 'Статистика'; ctaFn = "window.switchTab('stats')";
  } else {
    emoji = '🌿'; title = 'С чего начнём?'; sub = 'Добавь задачу или отметь пульс дня'; cta = 'Новая задача'; ctaFn = 'window.openTaskEditor()';
  }
  el.innerHTML = `<div class="today-hero-row"><div class="today-hero-emoji">${emoji}</div><div class="today-hero-text"><div class="today-hero-title">${title}</div><div class="today-hero-sub">${sub}</div></div></div>
    ${cta ? `<button type="button" class="btn-primary today-hero-cta" onclick="${ctaFn}">${cta}</button>` : ''}`;
};

window.getOverdueTasks = function() {
  const today = typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0,10);
  return (state.tasks || []).filter(t => {
    if (t.recurrence) return false;
    if (!t.date || t.date >= today) return false;
    if (window.Tasks?.isTaskDoneOn) return !Tasks.isTaskDoneOn(t, t.date);
    return !t.done;
  });
};

window.renderOverdueBlock = function() {
  const el = document.getElementById('overdue-block'); if (!el) return;
  const list = window.getOverdueTasks();
  if (!list.length) { el.innerHTML = ''; return; }
  const rows = list.slice(0, 5).map(t => {
    const name = escapeHtml(t.title || t.name || 'Без названия');
    return `<div class="overdue-row" onclick="window.openTaskEditor(${t.id})"><span>⚠️ ${name}</span><span class="overdue-date">${t.date}</span></div>`;
  }).join('');
  el.innerHTML = `<div class="card overdue-card"><div class="section-title" style="margin:0 0 8px;"><span>Просрочено (${list.length})</span><span class="link" onclick="window.switchTab('tasks');state.taskFilter='overdue';save();Tasks.renderTasks()">Все →</span></div>${rows}</div>`;
};

// ===== SLEEP =====
window.renderSleepCard = function() {
  const el = document.getElementById('sleep-card-body'); if (!el) return;
  const t = window.currentDate;
  const s = (state.sleep && state.sleep[t]) || {};
  // also from survey
  const fromSurvey = state.surveys[t]?.physical;
  const hours = s.hours ?? fromSurvey?.sleepHours;
  const quality = s.quality;
  const bed = s.bedTime || fromSurvey?.sleepStart;
  const wake = s.wakeTime || fromSurvey?.sleepEnd;
  if (hours == null && !bed && !wake) {
    el.innerHTML = 'Нет записи — нажми «Изменить»';
    return;
  }
  const qEmoji = quality >= 8 ? '😊' : quality >= 5 ? '😐' : quality ? '😫' : '';
  el.innerHTML = `<div class="sleep-stats">
    <div><b>${hours != null ? hours.toFixed(1) + ' ч' : '—'}</b><span>длительность</span></div>
    <div><b>${qEmoji || '—'} ${quality != null ? quality + '/10' : ''}</b><span>качество</span></div>
    <div><b>${bed || '—'} → ${wake || '—'}</b><span>лёг · встал</span></div>
  </div>`;
};

window.openSleepEditor = function() {
  const t = window.currentDate;
  const s = (state.sleep && state.sleep[t]) || {};
  const fromSurvey = state.surveys[t]?.physical || {};
  const hours = s.hours ?? fromSurvey.sleepHours ?? '';
  const quality = s.quality ?? 6;
  const bed = s.bedTime || fromSurvey.sleepStart || '';
  const wake = s.wakeTime || fromSurvey.sleepEnd || '';
  const qChips = [2,4,6,8,10].map(v => `<button type="button" class="score-chip ${quality==v?'active':''}" onclick="window.pickScore('sleep-quality',${v})"><span class="score-emoji">${v>=8?'😊':v>=5?'😐':'😫'}</span><span class="score-label">${v}</span></button>`).join('');
  window.openSheet(`<h2>😴 Сон</h2>
    <div class="field"><label>Лёг</label><input type="time" id="sleep-bed" value="${bed}"></div>
    <div class="field"><label>Встал</label><input type="time" id="sleep-wake" value="${wake}"></div>
    <div class="field"><label>Часы (если знаешь)</label><input type="number" id="sleep-hours" step="0.5" min="0" max="16" value="${hours}" placeholder="авто из времени"></div>
    <div class="survey-q"><div class="survey-q-title">Качество</div><div class="score-chips" id="wrap-sleep-quality">${qChips}<input type="hidden" id="sleep-quality" value="${quality}"></div></div>
    <div class="sheet-actions" style="display:flex;gap:8px;"><button class="btn-cancel" style="flex:1;" onclick="closeSheet()">Отмена</button><button class="btn-primary" style="flex:1;" onclick="window.saveSleep()">Сохранить</button></div>`);
};

window.saveSleep = function() {
  const t = window.currentDate;
  if (!state.sleep) state.sleep = {};
  let bed = document.getElementById('sleep-bed')?.value || null;
  let wake = document.getElementById('sleep-wake')?.value || null;
  let hours = parseFloat(document.getElementById('sleep-hours')?.value);
  if ((isNaN(hours) || !hours) && bed && wake && window.computeSleepHours) {
    hours = window.computeSleepHours(bed, wake);
  }
  const quality = +document.getElementById('sleep-quality')?.value || null;
  state.sleep[t] = { hours: isNaN(hours) ? null : hours, quality, bedTime: bed, wakeTime: wake };
  // mirror into survey physical for correlations
  if (!state.surveys[t]) state.surveys[t] = {};
  state.surveys[t].physical = state.surveys[t].physical || {};
  if (hours) state.surveys[t].physical.sleepHours = hours;
  if (bed) state.surveys[t].physical.sleepStart = bed;
  if (wake) state.surveys[t].physical.sleepEnd = wake;
  save(); closeSheet(); window.renderSleepCard(); window.renderTodayHero();
  window.showToast && window.showToast('Сон сохранён');
};

// ===== FOCUS + ANXIETY =====
window.prepareFocusForAnxiety = function() {
  const t = window.currentDate || todayStr();
  let a = state.surveys[t]?.emotions?.anxiety;
  if (a == null) {
    const y = new Date(t + 'T12:00:00'); y.setDate(y.getDate() - 1);
    a = state.surveys[y.toISOString().slice(0,10)]?.emotions?.anxiety;
  }
  if (a != null && a >= 7) {
    const minsEl = document.getElementById('focus-mins');
    if (minsEl) minsEl.value = 15;
    if (window.setFocusTime) window.setFocusTime();
    window.showToast && window.showToast('15 мин — мягкий режим при тревоге');
  }
};

window.startFocusWithBreath = function() {
  const t = window.currentDate || todayStr();
  let a = state.surveys[t]?.emotions?.anxiety;
  if (a == null) {
    const y = new Date(t + 'T12:00:00'); y.setDate(y.getDate() - 1);
    a = state.surveys[y.toISOString().slice(0,10)]?.emotions?.anxiety;
  }
  window.prepareFocusForAnxiety();
  if (a != null && a >= 7) {
    window.runBreathThenStart();
  } else {
    if (window.startFocusTimer) window.startFocusTimer();
  }
};

window.runBreathThenStart = function() {
  const ov = document.getElementById('breath-overlay');
  const text = document.getElementById('breath-text');
  const circle = document.getElementById('breath-circle');
  if (!ov) { window.startFocusTimer && window.startFocusTimer(); return; }
  ov.style.display = 'flex';
  let step = 0;
  const phases = [
    { t: 'Вдох…', ms: 2000, scale: 1.2 },
    { t: 'Ещё вдох…', ms: 800, scale: 1.35 },
    { t: 'Длинный выдох…', ms: 3500, scale: 1 },
    { t: 'Ещё раз', ms: 500, scale: 1 },
    { t: 'Вдох…', ms: 2000, scale: 1.2 },
    { t: 'Выдох…', ms: 3500, scale: 1 },
    { t: 'Готов', ms: 600, scale: 1 },
  ];
  const run = () => {
    if (step >= phases.length) {
      ov.style.display = 'none';
      window.startFocusTimer && window.startFocusTimer();
      return;
    }
    const p = phases[step++];
    if (text) text.textContent = p.t;
    if (circle) circle.style.transform = `scale(${p.scale})`;
    setTimeout(run, p.ms);
  };
  run();
};
window.skipBreathAndStart = function() {
  const ov = document.getElementById('breath-overlay');
  if (ov) ov.style.display = 'none';
  window.startFocusTimer && window.startFocusTimer();
};

// ===== NOTIFICATIONS =====
window.setupSurveyReminder = async function() {
  if (!('Notification' in window)) { window.showToast && window.showToast('Уведомления не поддерживаются'); return; }
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') { window.showToast && window.showToast('Разрешение не дано'); return; }
  state.settings = state.settings || {};
  state.settings.surveyRemindEnabled = true;
  save();
  window.showToast && window.showToast('Напоминание включено (~' + (state.settings.surveyRemindHour ?? 21) + ':00)');
  window.scheduleSurveyReminderTick();
};

window.scheduleSurveyReminderTick = function() {
  if (window.__surveyRemindTimer) clearInterval(window.__surveyRemindTimer);
  window.__surveyRemindTimer = setInterval(() => {
    if (!state.settings?.surveyRemindEnabled) return;
    if (Notification.permission !== 'granted') return;
    const hour = state.settings.surveyRemindHour ?? 21;
    const now = new Date();
    if (now.getHours() !== hour || now.getMinutes() > 2) return;
    const t = todayStr();
    if (state.surveys[t]?.evening) return;
    const key = 'survey_notif_' + t;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    try { new Notification('Cantilena', { body: 'Вечерний опрос — 3 касания, и день в данных.', tag: 'survey' }); } catch(e) {}
  }, 60000);
};

// ===== ONBOARDING =====
window.maybeShowOnboarding = function() {
  if (state.settings?.onboardingDone) return;
  if (localStorage.getItem('cantilena_onboard_v1')) {
    state.settings = state.settings || {};
    state.settings.onboardingDone = true;
    save();
    return;
  }
  const el = document.getElementById('onboarding');
  if (!el) return;
  el.style.display = 'flex';
  let step = 0;
  const steps = el.querySelectorAll('.onboarding-step');
  const show = () => steps.forEach((s, i) => { s.style.display = i === step ? 'block' : 'none'; });
  show();
  document.getElementById('onboard-next').onclick = () => {
    if (step < 2) { step++; show(); document.getElementById('onboard-next').textContent = step === 2 ? 'Начать' : 'Далее'; }
    else {
      el.style.display = 'none';
      localStorage.setItem('cantilena_onboard_v1', '1');
      state.settings = state.settings || {};
      state.settings.onboardingDone = true;
      save();
    }
  };
  document.getElementById('onboard-skip').onclick = () => {
    el.style.display = 'none';
    localStorage.setItem('cantilena_onboard_v1', '1');
    state.settings = state.settings || {};
    state.settings.onboardingDone = true;
    save();
  };
};

// ===== WEEKLY IN-APP REPORT =====
window.renderWeeklyReportCard = function() {
  const el = document.getElementById('weekly-report-card'); if (!el) return;
  const days = lastNDates(7);
  const rates = days.map(d => dayTaskRate(d)).filter(x => x != null);
  const avgRate = rates.length ? Math.round(avgOf(rates) * 100) : null;
  const joys = days.map(d => surveyMetric(d, 'emotions.joy')).filter(x => x != null);
  const avgJoy = joys.length ? avgOf(joys).toFixed(1) : null;
  const sleepH = days.map(d => state.sleep?.[d]?.hours ?? surveyMetric(d, 'physical.sleepHours')).filter(x => x != null);
  const avgSleep = sleepH.length ? avgOf(sleepH).toFixed(1) : null;
  if (avgRate == null && avgJoy == null) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card weekly-report"><div class="section-title" style="margin:0 0 10px;"><span>🗓 Итоги 7 дней</span><span class="link" onclick="window.exportWeeklyReport()">Файл</span></div>
    <div class="sleep-stats">
      <div><b>${avgJoy ?? '—'}</b><span>настроение</span></div>
      <div><b>${avgRate != null ? avgRate + '%' : '—'}</b><span>задачи</span></div>
      <div><b>${avgSleep != null ? avgSleep + ' ч' : '—'}</b><span>сон</span></div>
    </div></div>`;
};


window.renderAll = function() {
  window.updateDateNav(); 
  window.renderHabitsToday(); 
  window.renderQuickMoodUI();
  Tasks.renderTasksTodayMini(); 
  Tasks.renderTasks(); 
  window.renderNotes(); 
  window.updateRings();
  window.renderStats(); 
  window.renderWeeklyCard(); window.renderOnboardTip && window.renderOnboardTip();
  window.renderTodayHero && window.renderTodayHero();
  window.renderOverdueBlock && window.renderOverdueBlock();
  window.renderSleepCard && window.renderSleepCard();
  window.renderWeeklyReportCard && window.renderWeeklyReportCard();
};

window.updateRings = function() {
  const t = window.currentDate; const sPct = state.surveys[t]?.evening ? 1 : 0; const sched = window.habitsScheduledForDate(t); const hPct = sched.length ? sched.filter(h => window.isHabitDoneForDate(h, t)).length / sched.length : 0; const tToday = state.tasks.filter(x => x.recurrence ? Tasks.matchesRecurrence(x, t) : x.date === t); const tPct = tToday.length ? tToday.filter(x => Tasks.isTaskDoneOn(x, t)).length / tToday.length : 0;
  const setMiniRing = (id, pct) => { const el = document.getElementById(id); if (!el) return; const c = 2 * Math.PI * 15; el.setAttribute('stroke-dasharray', `${c * Math.max(0, Math.min(1, pct))} ${c}`); };
  setMiniRing('ring-survey', sPct); setMiniRing('ring-habits', hPct); setMiniRing('ring-tasks', tPct);
  document.getElementById('pct-survey').textContent = Math.round(sPct * 100) + '%'; document.getElementById('pct-habits').textContent = Math.round(hPct * 100) + '%'; document.getElementById('pct-tasks').textContent = Math.round(tPct * 100) + '%';
  const btn = document.getElementById('survey-btn'); const btnContent = document.getElementById('survey-btn-content'); const btnTime = document.getElementById('survey-btn-time');
  if (sPct) { btn.classList.add('done'); btnContent.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg> <span>Опрос пройден</span>`; btnTime.textContent = state.surveys[t].eveningTime || 'Сегодня'; }
  else { btn.classList.remove('done'); btnContent.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> <span>Пройти опрос</span>`; btnTime.textContent = ''; }
};

// ============ 12. ЭКСПОРТ / ИМПОРТ ============
window.openDataBackup = function() {
  window.openSheet(`<h2>Данные и бэкап</h2>
    <p style="font-size:13px;color:var(--text-sec);margin-bottom:12px;">Скачай копию — можно восстановить на другом устройстве.</p>
    <button class="btn-primary" style="width:100%;margin-bottom:8px;" onclick="window.exportData();window.closeSheet()">⬇️ Скачать всё (JSON)</button>
    <button class="btn-cancel" style="width:100%;margin-bottom:8px;" onclick="window.exportWeeklyReport()">🗓 Отчёт за неделю</button>
    <button class="btn-cancel" style="width:100%;margin-bottom:8px;" onclick="document.getElementById('import-file')?.click();window.closeSheet()">⬆️ Импорт JSON</button>
    <hr style="border:none;border-top:1px solid var(--separator);margin:16px 0;">
    <button class="btn-cancel" style="width:100%;margin-bottom:8px;" onclick="window.setupSurveyReminder()">🔔 Напоминание опроса</button>
    <div class="field"><label>Час напоминания (0–23)</label><input type="number" id="remind-hour" min="0" max="23" value="${state.settings?.surveyRemindHour ?? 21}" onchange="state.settings=state.settings||{};state.settings.surveyRemindHour=+this.value;save();"></div>
    <button class="btn-cancel" onclick="window.closeSheet()">Закрыть</button>`);
};
window.exportData = function() { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `cantilena-backup-${todayStr()}.json`; a.click(); URL.revokeObjectURL(url); };
window.exportCSV = function() { let csv = "Дата,Настроение,Продуктивность,Тревога,Энергия,Смысл,Сон_ч\n"; Object.keys(state.surveys).sort().forEach(d => { const s = state.surveys[d]; const avg = (state.moods[d] || []).length ? Math.round(state.moods[d].reduce((sum, m) => sum + m.val, 0) / state.moods[d].length) : ''; csv += `${d},${avg},${s.mental?.productivity || ''},${s.emotions?.anxiety || ''},${s.physical?.energy || ''},${s.mental?.meaning || ''},${s.physical?.sleepHours || ''}\n`; }); const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `cantilena-data-${todayStr()}.csv`; a.click(); };
window.importData = function(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => { try { const data = JSON.parse(ev.target.result); if (!data || !Array.isArray(data.habits)) throw new Error('Неверный формат'); if (!confirm('Заменить данные?')) return; const newState = migrateState(data); Object.keys(state).forEach(k => delete state[k]); Object.assign(state, newState); save(); window.renderAll(); alert('Импорт успешно!'); } catch (err) { alert('Ошибка: ' + err.message); } }; reader.readAsText(file); e.target.value = ''; };

// ============ 13. ФОКУС-ТАЙМЕР ============
let focusInterval = null, focusRunning = false, focusTimeLeft = 25 * 60, focusTotalTime = 25 * 60, focusMode = 'focus';

window.openFocusTimePicker = function() {
  if (focusRunning) return;
  const curMins = parseInt(document.getElementById('focus-mins').value) || 25;
  const presets = [5, 10, 15, 20, 25, 30, 45, 50, 60, 90];
  const presetsHtml = presets.map(m => `<button onclick="window.pickFocusMinutes(${m})" style="padding:12px 0;border-radius:12px;border:1px solid ${curMins===m?'var(--accent)':'var(--separator-med)'};background:${curMins===m?'var(--accent-soft)':'var(--input-bg)'};color:${curMins===m?'var(--accent)':'var(--text)'};font-weight:700;font-size:16px;cursor:pointer;font-family:inherit;">${m}</button>`).join('');
  window.openSheet(`<h2 style="text-align:center;margin-bottom:8px;">Время фокуса</h2><p style="text-align:center;font-size:13px;color:var(--text-sec);margin-bottom:16px;">Выбери минуты</p><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:20px;">${presetsHtml}</div><div class="field"><label>Своё время (минуты)</label><input type="number" id="custom-focus-mins" value="${curMins}" min="1" max="180" style="text-align:center;font-size:20px;font-weight:700;"></div><div class="sheet-actions" style="display:flex;gap:8px;"><button class="btn-cancel" style="flex:1;" onclick="window.closeSheet()">Отмена</button><button class="btn-primary" style="flex:1;" onclick="window.applyCustomFocusTime()">Готово</button></div>`);
};
window.pickFocusMinutes = function(m) {
  document.getElementById('focus-mins').value = m;
  document.getElementById('focus-secs').value = 0;
  state.focusSettings.customMins = m; state.focusSettings.customSecs = 0; save();
  window.setFocusTime(); window.closeSheet();
};
window.applyCustomFocusTime = function() {
  const m = Math.max(1, Math.min(180, parseInt(document.getElementById('custom-focus-mins').value) || 25));
  document.getElementById('focus-mins').value = m;
  document.getElementById('focus-secs').value = 0;
  state.focusSettings.customMins = m; state.focusSettings.customSecs = 0; save();
  window.setFocusTime(); window.closeSheet();
};
window.setFocusTime = function() {
  if (focusRunning) return;
  const mins = Math.max(0, Math.min(180, parseInt(document.getElementById('focus-mins').value) || 0));
  const secs = Math.max(0, Math.min(59, parseInt(document.getElementById('focus-secs').value) || 0));
  focusTotalTime = mins * 60 + secs;
  focusTimeLeft = focusTotalTime;
  if (focusTotalTime <= 0) focusTotalTime = focusTimeLeft = 60;
  updateFocusDisplay();
};

function updateFocusDisplay() { 
  const m = Math.floor(focusTimeLeft / 60); 
  const s = focusTimeLeft % 60; 
  const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; 
  const display = document.getElementById('focus-display'); if (display) display.textContent = timeStr; 
  const floatTime = document.getElementById('float-time'); if (floatTime) floatTime.textContent = timeStr; 
  const status = document.getElementById('focus-status'); 
  if (status && focusRunning) status.textContent = focusMode === 'break' ? 'Отдых...' : 'В процессе...'; 
  else if (status && !focusRunning && focusTimeLeft < focusTotalTime) status.textContent = 'На паузе'; 
  
  if (focusMode === 'focus') {
    const progress = focusTotalTime > 0 ? (1 - focusTimeLeft / focusTotalTime) : 0;
    const trunk = document.getElementById('tree-trunk');
    const branches = document.getElementById('tree-branches');
    const leaves = document.getElementById('tree-leaves');
    const seed = document.getElementById('tree-seed');
    const container = document.getElementById('tree-container');
    if (trunk) trunk.style.opacity = String(0.25 + progress * 0.75);
    if (branches) branches.style.opacity = String(Math.max(0, (progress - 0.18) / 0.45));
    if (leaves) leaves.style.opacity = String(Math.max(0, (progress - 0.42) / 0.5));
    if (seed) seed.style.opacity = String(progress < 0.12 ? 1 : Math.max(0, 1 - progress * 2.2));
    if (container) {
      container.classList.toggle('growing', progress > 0.05 && progress < 0.95);
      container.style.transform = `scale(${1 + Math.sin(progress * Math.PI) * 0.06})`;
    }
    // Gentle leaf sway
    const leaves = document.getElementById('tree-leaves');
    if (leaves && progress > 0.5) leaves.style.transform = `rotate(${Math.sin(Date.now() / 800) * 2}deg)`;
  }
}

window.startFocusTimer = function() {
  const taskSelect = document.getElementById('focus-task-select');
  const descInput = document.getElementById('focus-desc');
  const taskId = taskSelect.value;
  const desc = descInput.value.trim();
  
  if (!taskId && !desc) {
    window.showToast('⚠️ Выберите задачу или введите название');
    if (!desc) descInput.focus();
    return;
  }
  
  if (focusTotalTime <= 0) setFocusTime();
  playTick();
  
  document.getElementById('focus-setup-controls').style.display = 'none';
  document.getElementById('focus-start-btn-container').style.display = 'none';
  document.getElementById('focus-active-controls').style.display = 'flex';
  
  let taskName = desc || 'Фокус';
  if (taskSelect && taskSelect.value) { const t = state.tasks.find(x => x.id == taskSelect.value); if (t) taskName = t.title; }
  
  const floatTask = document.getElementById('float-task'); if (floatTask) floatTask.textContent = taskName;
  
  toggleFocusTimer(); 
};

window.toggleFocusTimer = function() {
  const btn = document.getElementById('focus-main-btn'); const floatBtn = document.getElementById('float-play-icon');
  
  if (focusRunning) { 
    clearInterval(focusInterval); focusRunning = false; 
    if (btn) btn.textContent = 'Продолжить'; 
    if (floatBtn) floatBtn.innerHTML = `<path d="m5 3 14 9-14 9V3z"/>`; 
    updateFocusDisplay(); 
  } else {
    if (focusTimeLeft <= 0) focusTimeLeft = focusTotalTime;
    focusRunning = true; 
    if (btn) btn.textContent = 'Пауза'; 
    if (floatBtn) floatBtn.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
    document.getElementById('floating-timer').classList.remove('active'); 
    document.getElementById('focus-status').textContent = focusMode === 'break' ? 'Отдых...' : 'В процессе...';
    
    focusInterval = setInterval(() => { 
      focusTimeLeft--; 
      updateFocusDisplay(); 
      if (focusTimeLeft <= 0) completeFocusSession(); 
    }, 1000);
  }
};

window.confirmStopFocus = function() {
  if (confirm('Вы уверены, что хотите сбросить таймер? Прогресс не сохранится.')) {
    stopFocusTimer();
  }
};

window.stopFocusTimer = function() { 
  clearInterval(focusInterval); focusRunning = false; focusTimeLeft = focusTotalTime; 
  updateFocusDisplay(); 
  document.getElementById('floating-timer').classList.remove('active'); 
  
  document.getElementById('focus-setup-controls').style.display = 'block';
  document.getElementById('focus-start-btn-container').style.display = 'block';
  document.getElementById('focus-active-controls').style.display = 'none';
  
  const status = document.getElementById('focus-status'); if (status) status.textContent = 'Готов к работе'; 
  
  const treePath = document.getElementById('tree-path');
  if (treePath) { treePath.style.strokeDashoffset = 200; treePath.style.stroke = '#555'; }
  setTimeout(() => { if(treePath) treePath.style.stroke = ''; }, 2000);
};

window.exitFocusMode = function() {
  stopFocusTimer();
};

function completeFocusSession() {
  clearInterval(focusInterval); focusRunning = false; 
  document.getElementById('floating-timer').classList.remove('active'); 
  document.getElementById('focus-status').textContent = focusMode === 'break' ? 'Отдых завершен!' : 'Сессия завершена! 🎉'; 
  
  document.getElementById('focus-setup-controls').style.display = 'block';
  document.getElementById('focus-start-btn-container').style.display = 'block';
  document.getElementById('focus-active-controls').style.display = 'none';
  
  const treePath = document.getElementById('tree-path');
  if (treePath) treePath.classList.add('tree-completed');
  setTimeout(() => { if(treePath) treePath.classList.remove('tree-completed'); }, 3000);
  
  if (focusMode === 'focus') {
    playSound('success');
    
    if (!state.focusSessions) state.focusSessions = []; 
    const taskSelect = document.getElementById('focus-task-select'); 
    const taskId = taskSelect && taskSelect.value ? taskSelect.value : null;
    const desc = document.getElementById('focus-desc').value.trim();
    
    state.focusSessions.push({ date: todayStr(), duration: focusTotalTime / 60, taskId: taskId, desc: desc, ts: Date.now() }); 
    save(); 
    showToast('🔥 Отличная работа! Дерево выращено.');
    
    if (document.getElementById('focus-auto-complete').checked && taskId) {
      Tasks.completeTaskFromFocus(taskId);
      save(); showToast('✅ Задача выполнена!');
    }
    
    if (document.getElementById('focus-auto-break').checked) {
      focusMode = 'break';
      focusTotalTime = 5 * 60;
      focusTimeLeft = focusTotalTime;
      document.getElementById('focus-status').textContent = 'Перерыв 5 минут...';
      window.startFocusTimer(); // Запускаем перерыв
      return;
    }
  }
  
  focusTimeLeft = focusTotalTime; 
  updateFocusDisplay();
  window.renderFocusHistory();
  const treePathReset = document.getElementById('tree-path');
  if(treePathReset) treePathReset.style.strokeDashoffset = 200;
}

window.populateFocusTasks = function() { 
  const sel = document.getElementById('focus-task-select'); if (!sel) return; 
  sel.innerHTML = '<option value="">Без задачи</option>'; 
  const activeTasks = state.tasks.filter(t => !t.done && (t.date === todayStr() || !t.date)); 
  activeTasks.forEach(t => { const opt = document.createElement('option'); opt.value = t.id; opt.textContent = t.title; sel.appendChild(opt); }); 
};

window.renderFocusHistory = function() {
  const el = document.getElementById('focus-history-list');
  if (!el) return;
  const sessions = (state.focusSessions || []).slice().sort((a,b) => b.ts - a.ts).slice(0, 5);
  if (!sessions.length) { el.innerHTML = '<div class="empty-hint">🌲 Первое дерево ещё впереди. Запусти фокус, когда будешь готов</div>'; return; }
  
  el.innerHTML = sessions.map(s => {
    const dt = new Date(s.ts);
    const dateStr = dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const timeStr = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const task = s.taskId ? state.tasks.find(t => t.id == s.taskId) : null;
    const name = task ? task.title : (s.desc || 'Фокус');
    return `<div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: .5px solid var(--separator); font-size:13px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)}</div>
        <div style="font-size:11px; color:var(--text-sec); margin-top:2px;">${dateStr} · ${timeStr}</div>
      </div>
      <b style="color:var(--green);margin-left:8px;">${s.duration} мин 🌳</b>
    </div>`;
  }).join('');
};

document.addEventListener('change', (e) => {
  if (e.target.id === 'focus-auto-break') { state.focusSettings.autoBreak = e.target.checked; save(); }
  if (e.target.id === 'focus-auto-complete') { state.focusSettings.autoComplete = e.target.checked; save(); }
});

// ============ 14. СИНХРОНИЗАЦИЯ ============
window.loginWithPassword = async function() { const email = document.getElementById('sb-email').value.trim(); const password = document.getElementById('sb-password').value; const url = document.getElementById('sb-url').value.trim(); const key = document.getElementById('sb-key').value.trim(); if (!email || !password || !url || !key) { alert('Заполните все поля'); return; } state.supabase.url = url; state.supabase.key = key; state.supabase.email = email; save(); try { if (!supabaseClient) supabaseClient = window.supabase.createClient(url, key); const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password }); if (error) throw error; currentUser = data.user; window.closeSheet(); window.renderAll(); } catch (e) { alert('Ошибка: ' + e.message); } };
window.registerWithPassword = async function() { const email = document.getElementById('sb-email').value.trim(); const password = document.getElementById('sb-password').value; const url = document.getElementById('sb-url').value.trim(); const key = document.getElementById('sb-key').value.trim(); if (!email || !password || !url || !key) { alert('Заполните все поля'); return; } state.supabase.url = url; state.supabase.key = key; state.supabase.email = email; save(); try { if (!supabaseClient) supabaseClient = window.supabase.createClient(url, key); const { data, error } = await supabaseClient.auth.signUp({ email, password }); if (error) throw error; currentUser = data.user; window.closeSheet(); window.renderAll(); } catch (e) { alert('Ошибка: ' + e.message); } };
window.manualSync = async function() { await pullFromCloud(false, false); await pushToCloud(); window.showToast('🔄 Синхронизировано'); window.closeSheet(); };
window.signOut = async function() { if (window.supabaseClient) await window.supabaseClient.auth.signOut(); window.currentUser = null; window.updateSyncStatus('online', 'Не вошли'); window.closeSheet(); window.showToast('Вы вышли из аккаунта'); };
window.manualSyncWithUI = async function(btn) { const icon = btn.querySelector('.sync-icon'); if (icon) icon.classList.add('spinning'); await pullFromCloud(false, false); await pushToCloud(); if (icon) icon.classList.remove('spinning'); window.showToast('🔄 Обновлено'); };

document.addEventListener('DOMContentLoaded', () => {
  window.renderAll();
  initSupabase();
  const splash = document.getElementById('splash'); if (splash) setTimeout(() => splash.classList.add('hidden'), 1500);
  document.getElementById('splash').addEventListener('click', () => document.getElementById('splash').classList.add('hidden'));
  
  // Подгружаем настройки фокуса в инпуты при старте
  document.getElementById('focus-mins').value = state.focusSettings.customMins || 25;
  document.getElementById('focus-secs').value = state.focusSettings.customSecs || 0;
  document.getElementById('focus-auto-break').checked = state.focusSettings.autoBreak;
  document.getElementById('focus-auto-complete').checked = state.focusSettings.autoComplete;
});
