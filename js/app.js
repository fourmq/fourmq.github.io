import { todayStr, haptic, escapeHtml, svgIcon, APP_VERSION, playSound, showToast, uid, PALETTE, WEEKDAYS_SHORT, WEEKDAYS_LONG, formatDateHuman, stripHtml, ICONS } from './utils.js';
import { state, save, initSupabase, pullFromCloud, pushToCloud, migrateState, supabaseClient, currentUser } from './db.js';
import * as Tasks from './tasks.js';
import * as Surveys from './surveys.js';

// ============ 1. ПРИВЯЗКА МОДУЛЕЙ К WINDOW ============
window.currentDate = todayStr();
window.taskWeekOffset = 0;
window.haptic = haptic;
window.playSound = playSound;
window.showToast = showToast;

// Привязываем задачи (теперь HTML их увидит)
window.openTaskEditor = Tasks.openTaskEditor;
window.toggleTask = Tasks.toggleTask;
window.removeTask = Tasks.removeTask;
window.changeTaskWeek = (dir) => { window.taskWeekOffset += dir; haptic(); Tasks.renderTasks(); };
window.setTaskFilter = (f) => { state.taskFilter = f; haptic(); save(); Tasks.renderTasks(); };
window.setAllFilter = (f) => { state.taskAllFilter = f; haptic(); save(); Tasks.renderTasks(); };

// Привязываем опросы
window.openDailySurvey = Surveys.openDailySurvey;
window.openChangelog = Surveys.openChangelog;

// ============ 2. БАЗОВЫЕ UI ФУНКЦИИ ============
window.openSheet = (html) => { document.getElementById('sheet-content').innerHTML = html; document.getElementById('sheet').classList.add('open'); document.getElementById('backdrop').classList.add('open'); };
window.closeSheet = () => { const s = document.getElementById('sheet'); s.classList.remove('open'); document.getElementById('backdrop').classList.remove('open'); window.closePopover(); };
window.closePopover = () => { document.getElementById('popover-overlay').classList.remove('open'); };

// ============ 3. ЧАСЫ И ПРИВЕТСТВИЕ ============
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
  const TITLES = { today: 'Сегодня', tasks: 'Задачи', notes: 'Заметки', calendar: 'Календарь', stats: 'Статистика' };
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

// ============ 4. НАВИГАЦИЯ ПО ДАТАМ ============
window.changeDay = function(offset) {
  const d = new Date(window.currentDate + 'T12:00:00');
  d.setDate(d.getDate() + offset);
  window.currentDate = d.toISOString().slice(0, 10);
  haptic(); window.renderAll();
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

// ============ 5. ПРИВЫЧКИ (полный код) ============
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
  if (!list.length) { el.innerHTML = '<div class="empty-hint">Нет привычек на этот день.<br>Нажмите ⚙️, чтобы настроить.</div>'; return; }
  
  let html = '';
  list.forEach(h => {
    const cnt = h.checks[t] || 0; const done = window.isHabitDoneForDate(h, t); const skipped = h.skips && h.skips[t]; const streak = window.habitStreak(h); const isCounter = h.target > 1;
    const pillText = isCounter && !done ? (cnt > 0 ? `${cnt}/${h.target}` : `0/${h.target}`) : '';
    let sub = skipped ? '⏸ Пропущено' : (h.schedule.type === 'weekly' ? `${window.weekCount(h, t)}/${h.schedule.interval || 3} на неделе` : (isCounter ? `${cnt}/${h.target} · ${streak > 0 ? '🔥 ' + streak : ''}` : (streak > 0 ? '🔥 ' + streak + ' дн.' : 'Каждый день')));
    let checkContent = skipped ? '⏸' : (isCounter && !done ? pillText : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    
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

// ============ 6. ПУЛЬС ДНЯ ============
let moodTimerInterval = null;
window.quickMood = function(value) {
  const t = window.currentDate; if (!state.moods[t]) state.moods[t] = [];
  const now = Date.now(); const lastMood = state.moods[t][state.moods[t].length - 1];
  if (lastMood && (now - lastMood.ts < 1800000)) { window.showToast(`⏳ Следующая отметка через ${Math.ceil((1800000 - (now - lastMood.ts)) / 60000)} мин.`); return; }
  
  const timeStr = new Date(now).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  state.moods[t].push({ time: timeStr, val: value, ts: now });
  if (!state.surveys[t]) state.surveys[t] = {}; if (!state.surveys[t].emotions) state.surveys[t].emotions = {};
  state.surveys[t].emotions.joy = Math.round(state.moods[t].reduce((sum, m) => sum + m.val, 0) / state.moods[t].length);
  haptic('success'); playSound('success'); save(); window.renderAll(); window.showToast(`✓ Настроение (${value}) сохранено в ${timeStr}`);
};

window.renderQuickMoodUI = function() {
  const t = window.currentDate; const moods = state.moods[t] || []; const countEl = document.getElementById('mood-count');
  clearInterval(moodTimerInterval);
  const lastMood = moods[moods.length - 1]; const now = Date.now(); const cooldown = 30 * 60 * 1000;
  
  if (lastMood && (now - lastMood.ts < cooldown)) {
    const updateButtons = () => {
      const left = cooldown - (Date.now() - lastMood.ts);
      if (left <= 0) { clearInterval(moodTimerInterval); document.querySelectorAll('#quick-mood-row button').forEach(b => { b.style.opacity = '1'; b.style.pointerEvents = 'auto'; }); if (countEl) countEl.textContent = `Отметок: ${moods.length}`; return; }
      if (countEl) countEl.textContent = `⏳ ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')} до следующей`;
      document.querySelectorAll('#quick-mood-row button').forEach(b => { b.style.opacity = '0.3'; b.style.pointerEvents = 'none'; });
    };
    updateButtons(); moodTimerInterval = setInterval(updateButtons, 1000);
  } else {
    if (countEl) countEl.textContent = `Отметок: ${moods.length}`;
    document.querySelectorAll('#quick-mood-row button').forEach(b => { b.style.opacity = '1'; b.style.pointerEvents = 'auto'; });
  }
};

// ============ 7. ЗАМЕТКИ ============
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
    const folders = [{ id: 'all', name: 'Все', icon: '📚' }, ...state.noteFolders]; let chipsHtml = '';
    folders.forEach(f => { const isActive = state.selectedFolder === f.id; const isCustom = f.id !== 'all'; chipsHtml += `<button class="folder-chip" style="padding:7px 13px;border-radius:14px;border:none;font-size:13px;font-weight:600;background:${isActive ? 'var(--orange)' : 'var(--chip-bg)'};color:${isActive ? '#fff' : 'var(--text)'};white-space:nowrap;cursor:pointer;font-family:inherit;" onclick="window.onFolderChip('${f.id}',${isCustom})">${f.icon || ''} ${escapeHtml(f.name)}</button>`; });
    chipsHtml += `<button class="folder-chip" style="padding:7px 10px;border-radius:14px;border:none;font-size:13px;font-weight:600;background:var(--accent);color:#fff;cursor:pointer;font-family:inherit;" onclick="window.openFolderEditor()">＋</button>`;
    chips.innerHTML = chipsHtml;
  }
  const el = document.getElementById('notes-list'); if (!el) return;
  const search = (document.getElementById('notes-search')?.value || '').toLowerCase();
  let notes = state.notes;
  if (state.selectedFolder !== 'all') notes = notes.filter(n => n.folderId === state.selectedFolder);
  if (search) notes = notes.filter(n => (n.title || '').toLowerCase().includes(search) || stripHtml(n.body).toLowerCase().includes(search));
  notes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!notes.length) { el.innerHTML = '<div class="empty-hint">Заметок нет.<br>Нажмите +, чтобы создать.</div>'; return; }
  
  let notesHtml = '';
  notes.forEach(n => {
    const preview = stripHtml(n.body).slice(0, 80); const dateStr = new Date(n.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); const pinIcon = n.pinned ? '<span style="color:var(--orange);font-size:12px;margin-top:3px;">📌</span>' : '';
    notesHtml += `<div style="padding:12px 4px;border-bottom:.5px solid var(--separator);cursor:pointer;display:flex;align-items:flex-start;gap:8px;" onclick="window.openNote(${n.id})">${pinIcon}<div style="flex:1;min-width:0;"><h4 style="font-size:15px;font-weight:600;margin-bottom:2px;">${escapeHtml(n.title || 'Без названия')}</h4><p style="font-size:13px;color:var(--text-sec);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${escapeHtml(preview) || 'Пустая'}</p></div><span style="font-size:11px;color:var(--text-sec);margin-left:auto;white-space:nowrap;">${dateStr}</span></div>`;
  });
  el.innerHTML = notesHtml;
};

window.onFolderChip = function(id, isCustom) { if (isCustom && state.selectedFolder === id) { window.openFolderEditor(id); return; } state.selectedFolder = id; haptic(); save(); window.renderNotes(); };
window.openFolderEditor = function(id) { const folder = id ? state.noteFolders.find(f => f.id === id) : null; window.openSheet(`<h2>${folder ? 'Папка' : 'Новая папка'}</h2><div class="field"><label>Название</label><input type="text" id="f-name" value="${folder ? escapeHtml(folder.name) : ''}"></div><div class="field"><label>Иконка</label><input type="text" id="f-icon" value="${folder ? escapeHtml(folder.icon || '📁') : '📁'}" maxlength="2"></div><div class="sheet-actions">${folder ? `<button class="btn-danger" onclick="window.deleteFolder('${id}')">Удалить</button>` : ''}<button class="btn-cancel" onclick="window.closeSheet()">Отмена</button><button class="btn-primary" onclick="window.saveFolder('${id || ''}')">Сохранить</button></div>`); };
window.saveFolder = function(id) { const name = document.getElementById('f-name').value.trim(); const icon = document.getElementById('f-icon').value.trim() || '📁'; if (!name) return; if (id) { const f = state.noteFolders.find(x => x.id === id); if (f) { f.name = name; f.icon = icon; } } else { state.noteFolders.push({ id: uid() + '', name, icon }); } save(); window.closeSheet(); window.renderNotes(); };
window.deleteFolder = function(id) { if (!confirm('Удалить папку?')) return; state.noteFolders = state.noteFolders.filter(f => f.id !== id); state.notes.forEach(n => { if (n.folderId === id) n.folderId = null; }); if (state.selectedFolder === id) state.selectedFolder = 'all'; save(); window.closeSheet(); window.renderNotes(); };
window.addNote = function() { const folderId = state.selectedFolder === 'all' ? (state.noteFolders[0]?.id || null) : state.selectedFolder; const n = { id: uid(), title: 'Без названия', body: '', folderId, pinned: false, createdAt: Date.now(), updatedAt: Date.now() }; state.notes.push(n); haptic(); save(); window.openNote(n.id); };
window.openNote = function(id) { if (currentNoteId && currentNoteId !== id) window.saveCurrentNote(); const n = state.notes.find(x => x.id === id); if (!n) return; currentNoteId = id; document.getElementById('edit-note-title').value = n.title; document.getElementById('edit-note-body').innerHTML = n.body; document.getElementById('notes-list-view').style.display = 'none'; document.getElementById('note-edit-view').style.display = 'block'; window.updatePinBtn(); };
window.updatePinBtn = function() { const n = state.notes.find(x => x.id === currentNoteId); const btn = document.getElementById('pin-btn'); if (n && btn) { btn.style.color = n.pinned ? 'var(--orange)' : 'var(--text-sec)'; btn.style.background = n.pinned ? 'var(--accent-soft)' : 'var(--chip-bg)'; } };
window.togglePinNote = function() { const n = state.notes.find(x => x.id === currentNoteId); if (!n) return; n.pinned = !n.pinned; n.updatedAt = Date.now(); haptic(); save(); window.updatePinBtn(); };
window.closeNoteEditor = function() { window.saveCurrentNote(); currentNoteId = null; document.getElementById('notes-list-view').style.display = 'block'; document.getElementById('note-edit-view').style.display = 'none'; window.renderNotes(); };
window.deleteCurrentNote = function() { if (!currentNoteId || !confirm('Удалить?')) return; state.notes = state.notes.filter(n => n.id !== currentNoteId); save(); currentNoteId = null; document.getElementById('notes-list-view').style.display = 'block'; document.getElementById('note-edit-view').style.display = 'none'; window.renderNotes(); };

// ============ 8. КАЛЕНДАРЬ ============
let calDate = new Date();
window.renderCalendar = function() {
  const y = calDate.getFullYear(), m = calDate.getMonth();
  const startWeekday = (new Date(y, m, 1).getDay() + 6) % 7; const daysInMonth = new Date(y, m + 1, 0).getDate(); const today = todayStr();
  document.getElementById('cal-title').textContent = calDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const cells = []; for (let i = 0; i < startWeekday; i++) cells.push('<div class="cal-day empty"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; const sDone = !!state.surveys[dateStr]; const hDone = state.habits.some(h => !h.archived && window.isHabitDoneForDate(h, dateStr)); const tDone = state.tasks.some(t => t.recurrence ? (Tasks.matchesRecurrence(t, dateStr) && Tasks.isTaskDoneOn(t, dateStr)) : (t.date === dateStr && t.done));
    cells.push(`<div class="cal-day ${dateStr === today ? 'today' : ''}" style="aspect-ratio:1;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:13px;background:var(--input-bg);gap:2px;cursor:pointer;color:var(--text);${dateStr === today ? 'outline:2px solid var(--td-red);' : ''}" onclick="window.openDayDetail('${dateStr}')"><div>${d}</div><div style="display:flex;gap:2px;"><span style="width:4px;height:4px;border-radius:50%;background:${sDone ? 'var(--pink)' : 'var(--text-tert)'}"></span><span style="width:4px;height:4px;border-radius:50%;background:${hDone ? 'var(--green)' : 'var(--text-tert)'}"></span><span style="width:4px;height:4px;border-radius:50%;background:${tDone ? 'var(--td-blue)' : 'var(--text-tert)'}"></span></div></div>`);
  }
  document.getElementById('cal-grid').innerHTML = cells.join('');
};
window.openDayDetail = function(dateStr) {
  const s = state.surveys[dateStr]; const habitsDone = state.habits.filter(h => !h.archived && window.isHabitDoneForDate(h, dateStr)); const tasksOnDay = state.tasks.filter(t => t.recurrence ? Tasks.matchesRecurrence(t, dateStr) : t.date === dateStr); const tasksDone = tasksOnDay.filter(t => Tasks.isTaskDoneOn(t, dateStr)); const isToday = dateStr === todayStr();
  let habitsHtml = habitsDone.length ? habitsDone.map(h => `<div class="insight">${svgIcon(h.icon, h.color, 14)} ${escapeHtml(h.name)}</div>`).join('') : '<div class="empty-hint">Ни одна не выполнена</div>';
  let tasksHtml = tasksOnDay.length ? tasksOnDay.map(t => `<div class="insight">${Tasks.isTaskDoneOn(t, dateStr) ? '✅' : '○'} ${escapeHtml(t.title)}</div>`).join('') : '<div class="empty-hint">Задач не было</div>';
  window.openSheet(`<h2>${formatDateHuman(dateStr)}</h2>${isToday ? '<div style="display:inline-block;padding:2px 8px;background:var(--chip-bg);border-radius:6px;font-size:11px;color:var(--text-sec);margin-bottom:8px;">Сегодня</div>' : ''}<div style="font-size:12px;font-weight:700;color:var(--text-sec);text-transform:uppercase;letter-spacing:.4px;margin:16px 0 8px;">Опрос</div>${s ? `<div class="insight"><b>Настроение:</b> ${s.emotions?.joy ?? '—'}/10 · <b>Продуктивность:</b> ${s.mental?.productivity ?? '—'}/10 · <b>Смысл:</b> ${s.mental?.meaning ?? '—'}/10</div>` : `<div class="empty-hint">Опрос не заполнен</div>`}<div style="font-size:12px;font-weight:700;color:var(--text-sec);text-transform:uppercase;letter-spacing:.4px;margin:16px 0 8px;">Привычки (${habitsDone.length}/${state.habits.filter(h => !h.archived).length})</div>${habitsHtml}<div style="font-size:12px;font-weight:700;color:var(--text-sec);text-transform:uppercase;letter-spacing:.4px;margin:16px 0 8px;">Задачи (${tasksDone.length}/${tasksOnDay.length})</div>${tasksHtml}<div class="sheet-actions"><button class="btn-cancel" onclick="window.closeSheet()">Закрыть</button><button class="btn-primary" onclick="window.closeSheet();window.goToDate('${dateStr}')">Открыть →</button></div>`);
};
window.goToDate = function(dateStr) { window.currentDate = dateStr; window.switchTab('today'); };
window.prevMonth = function() { calDate.setMonth(calDate.getMonth() - 1); haptic(); window.renderCalendar(); };
window.nextMonth = function() { calDate.setMonth(calDate.getMonth() + 1); haptic(); window.renderCalendar(); };

// ============ 9. СТАТИСТИКА И МЕЧТА ============
function lastNDates(n){const a=[];for(let i=n-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);a.push(d.toISOString().slice(0,10))}return a}
function avgOf(a){const v=a.filter(x=>x!=null&&!isNaN(x));return v.length?v.reduce((x,y)=>x+y,0)/v.length:null}
function corr(xs,ys){const p=xs.map((x,i)=>[x,ys[i]]).filter(([x,y])=>x!=null&&y!=null&&!isNaN(x)&&!isNaN(y));const n=p.length;if(n<3)return null;const mx=p.reduce((a,q)=>a+q[0],0)/n,my=p.reduce((a,q)=>a+q[1],0)/n;let num=0,dx=0,dy=0;for(const[x,y]of p){num+=(x-mx)*(y-my);dx+=(x-mx)**2;dy+=(y-my)**2}const den=Math.sqrt(dx*dy);return den?num/den:null}
function surveyMetric(dateStr,path){const s=state.surveys[dateStr];if(!s)return null;const val=path.split('.').reduce((o,k)=>o&&o[k],s);if(val!=null)return val;return null}

window.renderStats = function() {
  const d14 = lastNDates(14);
  const daysWithData = Object.keys(state.surveys).filter(d => state.surveys[d] && (state.surveys[d].evening || (state.surveys[d].emotions && state.surveys[d].emotions.joy))).length;
  const summaryEl = document.getElementById('stats-summary');
  if (daysWithData === 0) summaryEl.innerHTML = '📊 Пока нет данных. Пройди первый вечерний опрос — начнёт появляться аналитика.';
  else if (daysWithData < 3) summaryEl.innerHTML = `📊 Данных пока мало (${daysWithData} дн.). Пройди ещё ${3 - daysWithData} опроса — появятся графики и паттерны.`;
  else summaryEl.innerHTML = `📊 Статистика на основе <b>${daysWithData}</b> дней опросов.`;

  renderAutoInsights(); renderDreamProgress();
  renderChart([{ color: 'var(--td-orange)', data: d14.map(d => surveyMetric(d, 'emotions.joy')) }, { color: 'var(--td-blue)', data: d14.map(d => surveyMetric(d, 'mental.productivity')) }, { color: 'var(--pink)', data: d14.map(d => surveyMetric(d, 'emotions.anxiety')) }]);
  renderTrends4W(); renderStatsGrid(); renderWeekdayPatterns(); renderCorrMatrix(); renderPsyProfile(); renderPedRecommendations(); renderYearInPixels();
};

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
  const el = document.getElementById('weekday-patterns'); const days = lastNDates(60); const buckets = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, prods = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  days.forEach(d => { if (!state.surveys[d]) return; const wd = new Date(d + 'T12:00:00').getDay(); const joy = surveyMetric(d, 'emotions.joy'); const prod = surveyMetric(d, 'mental.productivity'); if (joy != null) buckets[wd].push(joy); if (prod != null) prods[wd].push(prod); });
  const rows = [1, 2, 3, 4, 5, 6, 0].map(wd => ({ wd, name: WEEKDAYS_LONG[wd], joy: avgOf(buckets[wd]), prod: avgOf(prods[wd]) }));
  if (!rows.some(r => r.joy != null || r.prod != null)) { el.innerHTML = '<div class="empty-hint">Пройдите опрос за 2-3 недели, чтобы увидеть паттерны по дням недели.</div>'; return; }
  el.innerHTML = rows.map(r => { const w = (r.joy || 0) / 10 * 100; return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13px;"><div style="width:100px;color:var(--text-sec);">${r.name}</div><div style="flex:1;height:8px;background:var(--input-bg);border-radius:4px;overflow:hidden;"><div style="height:100%;background:linear-gradient(90deg,var(--pink),var(--orange));width:${w}%;transition:width .6s"></div></div><div style="width:70px;text-align:right;font-weight:600;">${r.joy != null ? r.joy.toFixed(1) : '—'} / ${r.prod != null ? r.prod.toFixed(1) : '—'}</div></div>`; }).join('') + '<div style="font-size:11px;color:var(--text-sec);text-align:center;margin-top:8px;">Настроение / Продуктивность</div>';
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
  const el = document.getElementById('auto-insights'); if (!el) return; const days = lastNDates(30); const insights = [];
  const lowSleep = days.filter(d => { const h = state.surveys[d]?.physical?.sleepHours; return h != null && h < 7; }); const normSleep = days.filter(d => { const h = state.surveys[d]?.physical?.sleepHours; return h != null && h >= 7; });
  const lowAnx = avgOf(lowSleep.map(d => state.surveys[d]?.emotions?.anxiety)); const normAnx = avgOf(normSleep.map(d => state.surveys[d]?.emotions?.anxiety));
  if (lowAnx != null && normAnx != null && Math.abs(lowAnx - normAnx) > 0.3) { const diff = (lowAnx - normAnx).toFixed(1); insights.push({ icon: '😴', text: lowAnx > normAnx ? `Когда сон < 7 ч, тревога в среднем на ${diff} выше` : `Когда сон < 7 ч, тревога в среднем на ${Math.abs(diff)} ниже` }); }
  const moveDays = days.filter(d => (state.surveys[d]?.physical?.movement || 0) >= 20); const noMoveDays = days.filter(d => (state.surveys[d]?.physical?.movement || 0) < 20 && state.surveys[d]);
  const moveMood = avgOf(moveDays.map(d => state.surveys[d]?.emotions?.joy)); const noMoveMood = avgOf(noMoveDays.map(d => state.surveys[d]?.emotions?.joy));
  if (moveMood != null && noMoveMood != null && moveMood - noMoveMood > 0.5) { insights.push({ icon: '🏃', text: `В дни с движением настроение на ${(moveMood - noMoveMood).toFixed(1)} выше` }); }
  const sleepVals = days.map(d => state.surveys[d]?.physical?.sleepHours).filter(v => v != null);
  if (sleepVals.length >= 5) { const mean = avgOf(sleepVals); const variance = avgOf(sleepVals.map(v => (v - mean) ** 2)); const std = Math.sqrt(variance); insights.push({ icon: '⏰', text: `Сон в среднем ${mean.toFixed(1)} ч, стабильность ±${std.toFixed(1)} ч` }); }
  const last28 = lastNDates(28); const w1 = last28.slice(0, 14), w2 = last28.slice(14);
  const anx1 = avgOf(w1.map(d => state.surveys[d]?.emotions?.anxiety)); const anx2 = avgOf(w2.map(d => state.surveys[d]?.emotions?.anxiety));
  if (anx1 != null && anx2 != null && Math.abs(anx2 - anx1) > 0.5) { const dir = anx2 < anx1 ? '↓' : '↑'; insights.push({ icon: anx2 < anx1 ? '📉' : '📈', text: `Тревога за 2 недели ${dir} на ${Math.abs(anx2 - anx1).toFixed(1)}` }); }
  const joy1 = avgOf(w1.map(d => state.surveys[d]?.emotions?.joy)); const joy2 = avgOf(w2.map(d => state.surveys[d]?.emotions?.joy));
  if (joy1 != null && joy2 != null && Math.abs(joy2 - joy1) > 0.5) { const dir = joy2 > joy1 ? '↑' : '↓'; insights.push({ icon: joy2 > joy1 ? '🌟' : '💧', text: `Настроение за 2 недели ${dir} на ${Math.abs(joy2 - joy1).toFixed(1)}` }); }
  if (!insights.length) { const daysWithData = days.filter(d => state.surveys[d]?.evening).length; if (daysWithData < 3) el.innerHTML = `<div class="empty-hint">📊 Собираем данные (${daysWithData}/3 дня).</div>`; else el.innerHTML = `<div class="empty-hint">📊 Пока значимых паттернов не найдено.</div>`; return; }
  el.innerHTML = insights.map(i => `<div class="insight"><span class="insight-icon">${i.icon}</span>${escapeHtml(i.text)}</div>`).join('');
}

function renderTrends4W() {
  const el = document.getElementById('trends-4w'); if (!el) return; const last28 = lastNDates(28); const weeks = [last28.slice(0, 7), last28.slice(7, 14), last28.slice(14, 21), last28.slice(21, 28)];
  const metrics = [{ key: 'emotions.joy', label: 'Настроение', inv: false }, { key: 'mental.productivity', label: 'Продуктивность', inv: false }, { key: 'emotions.anxiety', label: 'Тревога', inv: true }, { key: 'physical.energy', label: 'Энергия', inv: false }];
  const rows = metrics.map(m => { const vals = weeks.map(w => avgOf(w.map(d => state.surveys[d]?.[m.key.split('.')[0]]?.[m.key.split('.')[1]]))); const firstNonNull = vals.find(v => v != null); const lastNonNull = [...vals].reverse().find(v => v != null); const delta = (firstNonNull != null && lastNonNull != null) ? lastNonNull - firstNonNull : null; const good = delta != null && (m.inv ? delta < -0.3 : delta > 0.3); const bad = delta != null && (m.inv ? delta > 0.3 : delta < -0.3); const arrow = delta == null ? '' : delta > 0.3 ? '↑' : delta < -0.3 ? '↓' : '→'; return { label: m.label, vals, delta, good, bad, arrow }; });
  if (!rows.some(r => r.vals.some(v => v != null))) { el.innerHTML = '<div class="empty-hint">Нужно минимум 2-3 недели данных для трендов.</div>'; return; }
  el.innerHTML = rows.map(r => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:.5px solid var(--separator);"><div style="flex:1;font-size:13px;">${r.label}</div>${r.vals.map(v => `<div style="width:32px;text-align:center;font-size:11px;color:var(--text-sec);font-variant-numeric:tabular-nums;">${v != null ? v.toFixed(1) : '·'}</div>`).join('')}<div style="width:52px;text-align:right;font-size:13px;font-weight:700;color:${r.good ? 'var(--green)' : r.bad ? 'var(--red)' : 'var(--text-sec)'};">${r.arrow}${r.delta != null ? Math.abs(r.delta).toFixed(1) : ''}</div></div>`).join('') + `<div style="display:flex;gap:10px;font-size:10px;color:var(--text-sec);margin-top:8px;"><div style="flex:1;"></div>${['−3н', '−2н', '−1н', 'сейчас'].map(w => `<div style="width:32px;text-align:center;">${w}</div>`).join('')}<div style="width:52px;"></div></div>`;
}

function renderDreamProgress() {
  const el = document.getElementById('dream-progress'); if (!el) return;
  if (!window.hasDream()) { el.innerHTML = `<div class="empty-hint">🌱 Определи мечту — и здесь появятся маркеры прогресса и ревизии месяцев.</div><button class="btn-primary" style="margin-top:8px;" onclick="window.openDreamEditor()">Определить мечту</button>`; return; }
  const dream = state.dream; const reviews = Object.entries(dream.reviews || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-6); const lastReview = reviews.length ? reviews[reviews.length - 1][1] : null;
  let markersHtml = ''; if (dream.markers.filter(Boolean).length) { markersHtml = `<div style="margin-bottom:12px;">${dream.markers.filter(Boolean).map(m => `<div class="insight" style="font-size:13px;">◦ ${escapeHtml(m)}</div>`).join('')}</div>`; }
  let reviewsHtml = ''; if (reviews.length) { reviewsHtml = `<div style="font-size:11px;font-weight:700;color:var(--text-sec);text-transform:uppercase;margin-top:12px;margin-bottom:6px;">Ревизии месяцев</div>${reviews.map(([key, r]) => `<div class="insight" style="display:flex;justify-content:space-between;align-items:center;"><div><b>${key}</b>${r.note ? `<div style="font-size:12px;color:var(--text-sec);margin-top:2px;">${escapeHtml(r.note)}</div>` : ''}</div><b style="color:${r.score >= 7 ? 'var(--green)' : r.score >= 4 ? 'var(--orange)' : 'var(--red)'};">${r.score}/10</b></div>`).join('')}`; }
  el.innerHTML = `<div style="font-size:14px;font-weight:600;margin-bottom:6px;">${escapeHtml(dream.vision)}</div>${markersHtml}${reviewsHtml}<button class="btn-primary" style="margin-top:12px;background:var(--indigo);" onclick="window.openMonthlyReview()">${lastReview ? 'Новая ревизия месяца' : 'Сделать первую ревизию'}</button>`;
}

function renderPsyProfile() {
  const el = document.getElementById('psy-profile'); const days = lastNDates(14); const get = k => avgOf(days.map(d => surveyMetric(d, k)));
  const joy = get('emotions.joy'), anx = get('emotions.anxiety'), sad = get('emotions.sadness'), irr = get('emotions.irritation'), meaning = get('mental.meaning'); const posAvg = joy; const negAvg = avgOf([anx, sad, irr].filter(x => x != null)); const balance = (posAvg != null && negAvg != null) ? posAvg - negAvg : null; const balanceLabel = balance == null ? 'мало данных' : balance > 2 ? '🟢 позитивный' : balance > 0 ? '🟡 сбалансированный' : '🔴 негативный';
  const stress = get('mental.stress'), energy = get('physical.energy'), sleepQ = get('physical.sleepQuality'); let burnRisk = 0, parts = 0;
  if (stress != null) { burnRisk += stress; parts++; } if (energy != null) { burnRisk += (10 - energy); parts++; } if (anx != null) { burnRisk += anx; parts++; } if (sleepQ != null) { burnRisk += (10 - sleepQ); parts++; }
  const burn = parts ? burnRisk / parts : 0; const burnLabel = burn > 7 ? '🔴 Высокий' : burn > 5 ? '🟡 Умеренный' : burn > 0 ? '🟢 Низкий' : '—';
  const sleepCorr = corr(days.map(d => surveyMetric(d, 'physical.sleepHours')), days.map(d => surveyMetric(d, 'emotions.joy'))); const screenAnx = corr(days.map(d => surveyMetric(d, 'screen.totalHours')), days.map(d => surveyMetric(d, 'emotions.anxiety')));
  if (balance == null && burn === 0 && sleepCorr == null && meaning == null) { el.innerHTML = '<div class="expert-badge badge-psy">Психолог</div><div class="empty-hint">Пройди 2-3 вечерних опроса, чтобы получить психологический профиль.</div>'; return; }
  el.innerHTML = `<div class="expert-badge badge-psy">Психолог</div><div class="insight"><b>Эмоциональный баланс:</b> ${balanceLabel} ${balance != null ? `(${balance.toFixed(1)})` : ''}</div><div class="insight"><b>Индикатор выгорания:</b> ${burnLabel} ${burn ? `(${burn.toFixed(1)}/10)` : ''}</div>${meaning != null ? `<div class="insight"><b>Ощущение смысла:</b> ${meaning.toFixed(1)}/10 ${meaning < 5 ? '— стоит проверить ценности' : '— хороший знак'}</div>` : ''}${sleepCorr != null && Math.abs(sleepCorr) > 0.3 ? `<div class="insight"><b>Сон влияет на настроение:</b> r=${sleepCorr.toFixed(2)}</div>` : ''}${screenAnx != null && Math.abs(screenAnx) > 0.3 ? `<div class="insight"><b>Экран ↔ тревога:</b> r=${screenAnx.toFixed(2)}</div>` : ''}<div class="insight" style="color:var(--text-sec);font-size:13px;">На основе ${days.filter(d => state.surveys[d]).length} опросов за 14 дней</div>`;
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

// ==== Мечта ====
window.hasDream = function() { return state.dream && (state.dream.vision || (state.dream.markers && state.dream.markers.length)); };
window.openDreamEditor = function() {
  const dream = state.dream || { vision: '', markers: [], reviews: {} }; const markers = dream.markers.length ? dream.markers : [''];
  let markersHtml = ''; markers.forEach((m, i) => { markersHtml += `<div class="marker-item"><input type="text" class="marker-input" value="${escapeHtml(m)}" placeholder="Маркер ${i + 1}">${markers.length > 1 ? `<button class="marker-del" onclick="window.removeMarker(this)">×</button>` : ''}</div>`; });
  window.openSheet(`<h2>Моя мечта</h2><p style="font-size:13px;color:var(--text-sec);margin-bottom:16px;">Куда ты идёшь? Одно предложение о будущем и 3-5 маркеров.</p><div class="field"><label>Через год я хочу быть...</label><textarea id="dream-vision" placeholder="Например: человеком, который..." style="min-height:100px;">${escapeHtml(dream.vision)}</textarea></div><div class="field"><label>Маркеры прогресса</label><div id="markers-container">${markersHtml}</div><button class="btn-cancel" style="width:auto;margin-top:8px;padding:8px 14px;font-size:13px;" onclick="window.addMarker()">+ Добавить маркер</button></div><div class="sheet-actions" style="margin-top:20px;"><button class="btn-cancel" onclick="window.closeSheet()">Отмена</button><button class="btn-primary" onclick="window.saveDream()">Сохранить</button></div>`);
};
window.addMarker = function() { const container = document.getElementById('markers-container'); const count = container.querySelectorAll('.marker-item').length; if (count >= 5) { window.showToast('Максимум 5 маркеров'); return; } const div = document.createElement('div'); div.className = 'marker-item'; div.innerHTML = `<input type="text" class="marker-input" placeholder="Маркер ${count + 1}"><button class="marker-del" onclick="window.removeMarker(this)">×</button>`; container.appendChild(div); };
window.removeMarker = function(btn) { const container = document.getElementById('markers-container'); if (container.querySelectorAll('.marker-item').length <= 1) return; btn.closest('.marker-item').remove(); };
window.saveDream = function() { const vision = document.getElementById('dream-vision').value.trim(); const markers = [...document.querySelectorAll('.marker-input')].map(i => i.value.trim()).filter(Boolean); if (!state.dream) state.dream = { vision: '', markers: [], reviews: {} }; state.dream.vision = vision; state.dream.markers = markers; state.dream.updatedAt = Date.now(); if (!state.dream.createdAt) state.dream.createdAt = Date.now(); haptic('success'); playSound('success'); save(); window.closeSheet(); window.renderAll(); };
window.openMonthlyReview = function() {
  const now = new Date(); const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; const prev = state.dream.reviews[key] || {};
  window.openSheet(`<h2>Ревизия месяца</h2><p style="font-size:13px;color:var(--text-sec);margin-bottom:16px;">${now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</p><div class="field"><label>Насколько приблизился к мечте (1-10) <span style="float:right;color:var(--accent);font-weight:700;" id="v-rev-score">${prev.score || 5}</span></label><input type="range" id="rev-score" min="1" max="10" value="${prev.score || 5}" oninput="document.getElementById('v-rev-score').textContent=this.value"></div><div class="field"><label>Что изменилось?</label><textarea id="rev-note" placeholder="Что стало по-другому?">${escapeHtml(prev.note || '')}</textarea></div><div class="sheet-actions"><button class="btn-cancel" onclick="window.closeSheet()">Отмена</button><button class="btn-primary" onclick="window.saveMonthlyReview('${key}')">Сохранить</button></div>`);
};
window.saveMonthlyReview = function(key) { const score = +document.getElementById('rev-score').value; const note = document.getElementById('rev-note').value.trim(); if (!state.dream.reviews) state.dream.reviews = {}; state.dream.reviews[key] = { score, note, ts: Date.now() }; haptic('success'); save(); window.closeSheet(); window.renderAll(); };

// ==== Компас ====
window.renderDreamCard = function() {
  const container = document.getElementById('dream-card-container'); if (!container) return;
  if (!window.hasDream()) { container.innerHTML = `<div class="card dream-card" onclick="window.openDreamEditor()"><div class="dream-label">${svgIcon('compass', 'currentColor', 14)} Моя мечта</div><div class="dream-empty">Определи мечту →</div><div class="dream-meta">Одно предложение о будущем + 3-5 маркеров.</div></div>`; return; }
  const dream = state.dream; const markersCount = dream.markers.filter(Boolean).length; const now = new Date(); const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; const hasReview = !!dream.reviews[monthKey];
  container.innerHTML = `<div class="card dream-card" onclick="window.openDreamEditor()"><div class="dream-label">${svgIcon('compass', 'currentColor', 14)} Моя мечта</div><div class="dream-title">${escapeHtml(dream.vision || 'Определи мечту')}</div><div class="dream-meta">${markersCount} маркеров · ${hasReview ? '✅ ревизия месяца сделана' : '⏳ пора сделать ревизию'}</div></div>${!hasReview ? `<button class="btn-primary" style="margin-bottom:10px;background:var(--indigo);" onclick="window.openMonthlyReview()">Сделать ревизию месяца</button>` : ''}`;
};
window.renderWeeklyCard = function() {
  const container = document.getElementById('weekly-survey-container'); if (!container) return; const wk = window.isoWeek(); const s = state.weeklySurveys[wk]; const passed = s && s.ts;
  let cardContent = ''; if (passed) { cardContent = `<div class="compass-goal">${escapeHtml(s.goal || 'Цель не указана')}</div><div class="compass-meta">Прогресс: ${s.progress}/10 · Шаг к мечте: ${s.dreamStep ? '✓' : '—'}</div><div class="compass-status passed">✅ Опрос пройден</div>`; } else { cardContent = `<div class="compass-goal">Определи цель недели →</div><div class="compass-meta">10 вопросов. Фокус, шаг к мечте, рефлексия.</div>`; }
  container.innerHTML = `<div class="card compass-card" onclick="window.openWeeklySurvey('${wk}')" style="cursor:pointer;"><div class="compass-label">${svgIcon('target', 'currentColor', 14)} Компас недели</div>${cardContent}</div>`;
};
window.isoWeek = function(d = new Date()) { const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dayNum = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - dayNum); const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1)); const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7); return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`; };
window.openWeeklySurvey = function(wk) {
  wk = wk || window.isoWeek(); const s = state.weeklySurveys[wk] || {}; const passed = !!s.ts; const get = (k, d) => s[k] ?? d;
  window.openSheet(`<h2>Компас недели</h2><p style="font-size:13px;color:var(--text-sec);margin-bottom:12px;">Неделя ${wk} ${passed ? '· <span style="color:var(--green);font-weight:700;">✅ Пройден</span>' : ''}</p><div class="survey-section">1. Цель недели</div><div class="field"><label>Одна главная цель</label><input type="text" id="w-goal" value="${escapeHtml(get('goal', ''))}"></div><div class="field"><label>Прогресс (1-10) <span style="float:right;color:var(--accent);font-weight:700;" id="v-w-progress">${get('progress', 5)}</span></label><input type="range" id="s-w-progress" min="1" max="10" value="${get('progress', 5)}" oninput="document.getElementById('v-w-progress').textContent=this.value"></div><div class="survey-section">2. Шаг к мечте</div><div class="field"><label>Какой шаг сделал?</label><textarea id="w-dreamStep">${escapeHtml(get('dreamStep', ''))}</textarea></div><div class="survey-section">3. Рефлексия</div><div class="field"><label>Что понял о себе?</label><textarea id="w-lesson">${escapeHtml(get('lesson', ''))}</textarea></div><div class="sheet-actions"><button class="btn-cancel" onclick="window.closeSheet()">Отмена</button><button class="btn-primary" onclick="window.saveWeeklySurvey('${wk}')">Сохранить</button></div>`);
};
window.saveWeeklySurvey = function(wk) {
  wk = wk || window.isoWeek(); const goal = document.getElementById('w-goal').value.trim(); const progress = +document.getElementById('s-w-progress').value; const dreamStep = document.getElementById('w-dreamStep').value.trim(); const lesson = document.getElementById('w-lesson').value.trim();
  state.weeklySurveys[wk] = { goal, progress, dreamStep, lesson, ts: Date.now() }; haptic('success'); playSound('success'); save(); window.closeSheet(); window.renderAll();
};

// ============ 10. НАСТРОЙКИ И СИНХРОНИЗАЦИЯ ============
window.manualSyncWithUI = async function(btn) { const icon = btn.querySelector('.sync-icon'); if (icon) icon.classList.add('spinning'); await pullFromCloud(false, false); await pushToCloud(); if (icon) icon.classList.remove('spinning'); window.showToast('🔄 Обновлено'); };

window.openSettings = function() {
  const sb = state.supabase;
  const loggedIn = !!currentUser;
  const email = currentUser?.email || sb.email || '';
  const notifPermission = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';

  window.openSheet(`
    <h2>Настройки</h2>
    ${loggedIn ? `
      <div class="profile-header">
        <div class="profile-avatar">${email.charAt(0).toUpperCase()}</div>
        <div style="font-size:18px;font-weight:700;">${escapeHtml(email)}</div>
        <div style="font-size:13px;color:var(--green-text);margin-top:4px;">✅ Синхронизация включена</div>
      </div>
    ` : `
      <div class="profile-header" style="background:var(--pink-soft);">
        <div class="profile-avatar" style="background:var(--red);color:#fff;">!</div>
        <div style="font-size:16px;font-weight:600;color:var(--red);">Вы не авторизованы</div>
        <div style="font-size:13px;color:var(--text-sec);margin-top:4px;">Данные не сохраняются в облако</div>
      </div>
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
window.manualSync = async function() { await pullFromCloud(false, false); await pushToCloud(); window.showToast('🔄 Синхронизировано'); window.closeSheet(); };
window.signOut = async function() { if (window.supabaseClient) await window.supabaseClient.auth.signOut(); window.currentUser = null; window.updateSyncStatus('online', 'Не вошли'); window.closeSheet(); window.showToast('Вы вышли из аккаунта'); };

// ============ 11. ЭКСПОРТ / ИМПОРТ ============
window.exportData = function() { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `cantilena-backup-${todayStr()}.json`; a.click(); URL.revokeObjectURL(url); };
window.exportCSV = function() { let csv = "Дата,Настроение,Продуктивность,Тревога,Энергия,Смысл,Сон_ч\n"; Object.keys(state.surveys).sort().forEach(d => { const s = state.surveys[d]; const avg = (state.moods[d] || []).length ? Math.round(state.moods[d].reduce((sum, m) => sum + m.val, 0) / state.moods[d].length) : ''; csv += `${d},${avg},${s.mental?.productivity || ''},${s.emotions?.anxiety || ''},${s.physical?.energy || ''},${s.mental?.meaning || ''},${s.physical?.sleepHours || ''}\n`; }); const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `cantilena-data-${todayStr()}.csv`; a.click(); };
window.importData = function(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => { try { const data = JSON.parse(ev.target.result); if (!data || !Array.isArray(data.habits)) throw new Error('Неверный формат'); if (!confirm('Заменить данные?')) return; const newState = migrateState(data); Object.keys(state).forEach(k => delete state[k]); Object.assign(state, newState); save(); window.renderAll(); alert('Импорт успешно!'); } catch (err) { alert('Ошибка: ' + err.message); } }; reader.readAsText(file); e.target.value = ''; };

// ============ 12. ПОМОДОРО ============
let pomoTimer = null, pomoTimeLeft = 25 * 60, pomoRunning = false;
window.togglePomodoro = function() {
  const btn = document.getElementById('pomo-btn'); const display = document.getElementById('pomo-time');
  if (pomoRunning) { clearInterval(pomoTimer); pomoRunning = false; btn.textContent = 'Старт'; btn.style.background = 'var(--accent)'; }
  else { pomoRunning = true; btn.textContent = 'Стоп'; btn.style.background = 'var(--red)'; pomoTimer = setInterval(() => { pomoTimeLeft--; const m = Math.floor(pomoTimeLeft / 60), s = pomoTimeLeft % 60; display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; if (pomoTimeLeft <= 0) { clearInterval(pomoTimer); pomoRunning = false; display.textContent = '25:00'; btn.textContent = 'Старт'; btn.style.background = 'var(--accent)'; playSound('success'); window.showToast('🍅 Время вышло!'); } }, 1000); }
};

// ============ 13. НАВИГАЦИЯ И РЕНДЕР ============
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

window.renderAll = function() {
  window.updateDateNav(); window.renderHabitsToday(); window.renderQuickMoodUI();
  Tasks.renderTasksTodayMini(); Tasks.renderTasks(); Tasks.renderFocusOfDay();
  window.renderNotes(); window.renderCalendar(); window.updateRings();
  window.renderStats(); window.renderDreamCard(); window.renderWeeklyCard();
};

window.updateRings = function() {
  const t = window.currentDate; const sPct = state.surveys[t]?.evening ? 1 : 0; const sched = window.habitsScheduledForDate(t); const hPct = sched.length ? sched.filter(h => window.isHabitDoneForDate(h, t)).length / sched.length : 0; const tToday = state.tasks.filter(x => x.recurrence ? Tasks.matchesRecurrence(x, t) : x.date === t); const tPct = tToday.length ? tToday.filter(x => Tasks.isTaskDoneOn(x, t)).length / tToday.length : 0;
  const setRing = (id, r, pct) => { const el = document.getElementById(id); const c = 2 * Math.PI * r; el.setAttribute('stroke-dasharray', `${c * Math.max(0, Math.min(1, pct))} ${c}`); };
  setRing('ring-survey', 52, sPct); setRing('ring-habits', 38, hPct); setRing('ring-tasks', 24, tPct);
  document.getElementById('pct-survey').textContent = Math.round(sPct * 100) + '%'; document.getElementById('pct-habits').textContent = Math.round(hPct * 100) + '%'; document.getElementById('pct-tasks').textContent = Math.round(tPct * 100) + '%';
  const btn = document.getElementById('survey-btn'); const btnContent = document.getElementById('survey-btn-content'); const btnTime = document.getElementById('survey-btn-time');
  if (sPct) { btn.classList.add('done'); btnContent.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg> <span>Опрос пройден</span>`; btnTime.textContent = state.surveys[t].eveningTime || 'Сегодня'; }
  else { btn.classList.remove('done'); btnContent.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> <span>Пройти опрос</span>`; btnTime.textContent = ''; }
};

// ============ 14. СТАРТ ============
document.addEventListener('DOMContentLoaded', () => {
  window.renderAll();
  initSupabase();
  const splash = document.getElementById('splash'); if (splash) setTimeout(() => splash.classList.add('hidden'), 1500);
  document.getElementById('splash').addEventListener('click', () => document.getElementById('splash').classList.add('hidden'));
});
