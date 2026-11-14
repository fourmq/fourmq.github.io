import { todayStr, haptic, escapeHtml, svgIcon, APP_VERSION, playSound, showToast, uid, PALETTE, WEEKDAYS_SHORT, WEEKDAYS_LONG, formatDateHuman, stripHtml, ICONS } from './utils.js';
import { state, save, initSupabase, pullFromCloud, pushToCloud, migrateState } from './db.js';
import * as Tasks from './tasks.js';
import * as Surveys from './surveys.js';

// ============ ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ============
window.currentDate = todayStr();
window.taskWeekOffset = 0;
window.haptic = haptic;
window.playSound = playSound;
window.showToast = showToast;

// ============ UI ФУНКЦИИ ============
window.openSheet = (html) => { document.getElementById('sheet-content').innerHTML = html; document.getElementById('sheet').classList.add('open'); document.getElementById('backdrop').classList.add('open'); };
window.closeSheet = () => { const s = document.getElementById('sheet'); s.classList.remove('open'); document.getElementById('backdrop').classList.remove('open'); window.closePopover(); };
window.closePopover = () => { document.getElementById('popover-overlay').classList.remove('open'); };

// ============ НАВИГАЦИЯ ПО ДАТАМ ============
window.changeDay = function(offset) {
  const d = new Date(window.currentDate + 'T12:00:00');
  d.setDate(d.getDate() + offset);
  window.currentDate = d.toISOString().slice(0, 10);
  haptic(); window.renderAll();
};

window.goToday = function() {
  window.currentDate = todayStr();
  haptic(); window.renderAll();
};

window.updateDateNav = function() {
  const label = document.getElementById('date-nav-label');
  if (!label) return;
  if (window.currentDate === todayStr()) {
    label.innerHTML = 'Сегодня';
  } else {
    const d = new Date(window.currentDate + 'T12:00:00');
    label.innerHTML = `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' })} <span class="back-today" onclick="window.goToday()">Вернуться</span>`;
  }
};

// ============ ПРИВЫЧКИ ============
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
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() || 7) - 1));
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
    const cnt = h.checks[t] || 0;
    const done = window.isHabitDoneForDate(h, t);
    const skipped = h.skips && h.skips[t];
    const streak = window.habitStreak(h);
    const isCounter = h.target > 1;
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
  const doneDays = days.filter(d => window.isHabitDoneForDate(h, d));
  const pct = Math.round(doneDays.length / 30 * 100);
  const streak = window.habitStreak(h);
  const total = Object.values(h.checks).reduce((a, b) => a + (b || 0), 0);
  const today = window.currentDate;
  const skippedToday = h.skips && h.skips[today];
  
  let heatmap = '';
  days.forEach(d => {
    const done = window.isHabitDoneForDate(h, d);
    const skipped = h.skips && h.skips[d];
    const scheduled = window.isScheduledOn(h, d);
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
  const h = state.habits.find(x => x.id === id); if (!h) return;
  const t = window.currentDate; h.skips = h.skips || {};
  if (h.skips[t]) delete h.skips[t]; else h.skips[t] = true;
  haptic('medium'); save(); window.closeSheet(); window.renderAll();
  setTimeout(() => window.openHabitDetail(id), 100);
};

window.openHabitSettings = function() {
  const habits = [...state.habits].sort((a, b) => (a.order || 0) - (b.order || 0));
  let list = '';
  habits.forEach(h => {
    list += `
      <div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:.5px solid var(--separator);">
        <div style="display:flex;flex-direction:column;gap:2px;">
          <button onclick="window.moveHabit(${h.id},-1)" style="width:28px;height:22px;border-radius:6px;border:none;background:var(--chip-bg);color:var(--text);">▲</button>
          <button onclick="window.moveHabit(${h.id},1)" style="width:28px;height:22px;border-radius:6px;border:none;background:var(--chip-bg);color:var(--text);">▼</button>
        </div>
        <div style="width:36px;height:36px;border-radius:10px;background:${h.color}20;display:flex;align-items:center;justify-content:center;">${svgIcon(h.icon, h.color, 20)}</div>
        <div style="flex:1;cursor:pointer;" onclick="window.closeSheet();setTimeout(()=>window.openHabitEditor(${h.id}),100)">
          <h4 style="font-size:15px;font-weight:600;">${escapeHtml(h.name)}</h4>
          <p style="font-size:12px;color:var(--text-sec);">${h.schedule.type === 'daily' ? 'Каждый день' : h.schedule.type === 'weekdays' ? 'Дни недели' : 'Раз в неделю'}</p>
        </div>
        <button onclick="event.stopPropagation();window.deleteHabit(${h.id})" style="background:none;border:none;color:var(--text-sec);display:flex;align-items:center;">${svgIcon('x', 'currentColor', 20)}</button>
      </div>`;
  });
  window.openSheet(`<h2>Привычки</h2><div class="card tight" style="margin-bottom:12px;">${list}</div><button class="btn-primary" onclick="window.closeSheet();setTimeout(window.openHabitEditor,100)">+ Новая привычка</button><div class="sheet-actions"><button class="btn-cancel" onclick="window.closeSheet()">Готово</button></div>`);
};

window.moveHabit = function(id, dir) {
  const sorted = state.habits.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const idx = sorted.findIndex(h => h.id === id); const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= sorted.length) return;
  [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]];
  sorted.forEach((h, i) => h.order = i);
  haptic(); save(); window.openHabitSettings();
};

window.deleteHabit = function(id) {
  if (!confirm('Удалить привычку?')) return;
  state.habits = state.habits.filter(h => h.id !== id);
  save(); window.openHabitSettings(); window.renderAll();
};

let editingHabitId = null, habitDraft = null;

window.openHabitEditor = function(id) {
  editingHabitId = id || null;
  const existing = id ? state.habits.find(x => x.id === id) : null;
  habitDraft = existing ? JSON.parse(JSON.stringify(existing)) : { name: '', icon: 'target', color: PALETTE[5], target: 1, schedule: { type: 'daily', days: [1, 2, 3, 4, 5], interval: 2, startDate: todayStr() } };
  if (!habitDraft.schedule.days) habitDraft.schedule.days = [1, 2, 3, 4, 5];
  if (!habitDraft.schedule.startDate) habitDraft.schedule.startDate = todayStr();
  window.renderHabitEditor();
};

window.renderHabitEditor = function() {
  const h = habitDraft, sch = h.schedule;
  const isWeekly = sch.type === 'weekly';
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

window.pickHabitIcon = function(name) {
  habitDraft.icon = name;
  document.querySelectorAll('#h-icons button').forEach(b => {
    const a = b.dataset.icon === name;
    b.style.borderColor = a ? 'var(--accent)' : 'transparent';
    b.style.background = a ? 'var(--accent-soft)' : 'var(--input-bg)';
    b.innerHTML = svgIcon(b.dataset.icon, a ? 'var(--accent)' : 'var(--text-sec)', 22);
  });
};

window.pickHabitColor = function(c) {
  habitDraft.color = c;
  document.querySelectorAll('#h-colors button').forEach(b => { b.style.borderColor = b.style.backgroundColor.includes(c) ? 'var(--text)' : 'transparent'; });
};

window.setScheduleType = function(t) {
  habitDraft.name = document.getElementById('h-name').value;
  const val = Math.max(1, parseInt(document.getElementById('h-target').value) || 1);
  if (t !== 'weekly') habitDraft.target = val;
  habitDraft.schedule.type = t;
  if (t === 'weekdays' && !habitDraft.schedule.days) habitDraft.schedule.days = [1, 2, 3, 4, 5];
  if (t === 'weekly') habitDraft.schedule.interval = val;
  window.renderHabitEditor();
};

window.toggleWeekday = function(d) {
  habitDraft.name = document.getElementById('h-name').value;
  habitDraft.target = Math.max(1, parseInt(document.getElementById('h-target').value) || 1);
  const days = habitDraft.schedule.days || [];
  const i = days.indexOf(d);
  if (i >= 0) days.splice(i, 1); else days.push(d);
  habitDraft.schedule.days = days;
  window.renderHabitEditor();
};

window.saveHabit = function() {
  habitDraft.name = document.getElementById('h-name').value.trim();
  const val = Math.max(1, parseInt(document.getElementById('h-target').value) || 1);
  if (habitDraft.schedule.type === 'weekly') habitDraft.schedule.interval = val; else habitDraft.target = val;
  if (!habitDraft.name) { alert('Введите название'); return; }
  if (editingHabitId) {
    const h = state.habits.find(x => x.id === editingHabitId);
    Object.assign(h, habitDraft);
  } else {
    const order = Math.max(0, ...state.habits.map(x => x.order || 0)) + 1;
    state.habits.push({ ...habitDraft, id: uid(), checks: {}, skips: {}, archived: false, order, createdAt: Date.now() });
  }
  haptic('success'); playSound('success'); save(); window.closeSheet(); window.renderAll();
};

// ============ ПУЛЬС ДНЯ ============
let moodTimerInterval = null;

window.quickMood = function(value) {
  const t = window.currentDate;
  if (!state.moods[t]) state.moods[t] = [];
  const now = Date.now();
  const lastMood = state.moods[t][state.moods[t].length - 1];
  if (lastMood && (now - lastMood.ts < 1800000)) { window.showToast(`⏳ Следующая отметка через ${Math.ceil((1800000 - (now - lastMood.ts)) / 60000)} мин.`); return; }
  
  const timeStr = new Date(now).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  state.moods[t].push({ time: timeStr, val: value, ts: now });
  if (!state.surveys[t]) state.surveys[t] = {};
  if (!state.surveys[t].emotions) state.surveys[t].emotions = {};
  state.surveys[t].emotions.joy = Math.round(state.moods[t].reduce((sum, m) => sum + m.val, 0) / state.moods[t].length);
  haptic('success'); playSound('success'); save(); window.renderAll();
  window.showToast(`✓ Настроение (${value}) сохранено в ${timeStr}`);
};

window.renderQuickMoodUI = function() {
  const t = window.currentDate;
  const moods = state.moods[t] || [];
  const countEl = document.getElementById('mood-count');
  clearInterval(moodTimerInterval);
  const lastMood = moods[moods.length - 1];
  const now = Date.now();
  const cooldown = 30 * 60 * 1000;
  
  if (lastMood && (now - lastMood.ts < cooldown)) {
    const updateButtons = () => {
      const left = cooldown - (Date.now() - lastMood.ts);
      if (left <= 0) {
        clearInterval(moodTimerInterval);
        document.querySelectorAll('#quick-mood-row button').forEach(b => { b.style.opacity = '1'; b.style.pointerEvents = 'auto'; });
        if (countEl) countEl.textContent = `Отметок: ${moods.length}`;
        return;
      }
      if (countEl) countEl.textContent = `⏳ ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')} до следующей`;
      document.querySelectorAll('#quick-mood-row button').forEach(b => { b.style.opacity = '0.3'; b.style.pointerEvents = 'none'; });
    };
    updateButtons(); moodTimerInterval = setInterval(updateButtons, 1000);
  } else {
    if (countEl) countEl.textContent = `Отметок: ${moods.length}`;
    document.querySelectorAll('#quick-mood-row button').forEach(b => { b.style.opacity = '1'; b.style.pointerEvents = 'auto'; });
  }
};

// ============ ЗАМЕТКИ ============
let currentNoteId = null, noteSaveTimer = null;

window.scheduleNoteSave = function() { clearTimeout(noteSaveTimer); noteSaveTimer = setTimeout(window.saveCurrentNote, 1500); };

window.saveCurrentNote = function() {
  if (!currentNoteId) return;
  clearTimeout(noteSaveTimer);
  const n = state.notes.find(x => x.id === currentNoteId);
  if (!n) return;
  n.title = document.getElementById('edit-note-title').value.trim() || 'Без названия';
  const body = document.getElementById('edit-note-body');
  body.querySelectorAll('input[type=checkbox]').forEach(cb => { if (cb.checked) cb.setAttribute('checked', 'checked'); else cb.removeAttribute('checked'); });
  n.body = body.innerHTML; n.updatedAt = Date.now(); save();
};

window.renderNotes = function() {
  const chips = document.getElementById('folder-chips');
  if (chips) {
    const folders = [{ id: 'all', name: 'Все', icon: '📚' }, ...state.noteFolders];
    let chipsHtml = '';
    folders.forEach(f => {
      const isActive = state.selectedFolder === f.id; const isCustom = f.id !== 'all';
      chipsHtml += `<button class="folder-chip" style="padding:7px 13px;border-radius:14px;border:none;font-size:13px;font-weight:600;background:${isActive ? 'var(--orange)' : 'var(--chip-bg)'};color:${isActive ? '#fff' : 'var(--text)'};white-space:nowrap;cursor:pointer;font-family:inherit;" onclick="window.onFolderChip('${f.id}',${isCustom})">${f.icon || ''} ${escapeHtml(f.name)}</button>`;
    });
    chipsHtml += `<button class="folder-chip" style="padding:7px 10px;border-radius:14px;border:none;font-size:13px;font-weight:600;background:var(--accent);color:#fff;cursor:pointer;font-family:inherit;" onclick="window.openFolderEditor()">＋</button>`;
    chips.innerHTML = chipsHtml;
  }
  
  const el = document.getElementById('notes-list');
  if (!el) return;
  const search = (document.getElementById('notes-search')?.value || '').toLowerCase();
  let notes = state.notes;
  if (state.selectedFolder !== 'all') notes = notes.filter(n => n.folderId === state.selectedFolder);
  if (search) notes = notes.filter(n => (n.title || '').toLowerCase().includes(search) || stripHtml(n.body).toLowerCase().includes(search));
  notes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  
  if (!notes.length) { el.innerHTML = '<div class="empty-hint">Заметок нет.<br>Нажмите +, чтобы создать.</div>'; return; }
  
  let notesHtml = '';
  notes.forEach(n => {
    const preview = stripHtml(n.body).slice(0, 80);
    const dateStr = new Date(n.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const pinIcon = n.pinned ? '<span style="color:var(--orange);font-size:12px;margin-top:3px;">📌</span>' : '';
    notesHtml += `
      <div style="padding:12px 4px;border-bottom:.5px solid var(--separator);cursor:pointer;display:flex;align-items:flex-start;gap:8px;" onclick="window.openNote(${n.id})">
        ${pinIcon}
        <div style="flex:1;min-width:0;"><h4 style="font-size:15px;font-weight:600;margin-bottom:2px;">${escapeHtml(n.title || 'Без названия')}</h4><p style="font-size:13px;color:var(--text-sec);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${escapeHtml(preview) || 'Пустая'}</p></div>
        <span style="font-size:11px;color:var(--text-sec);margin-left:auto;white-space:nowrap;">${dateStr}</span>
      </div>`;
  });
  el.innerHTML = notesHtml;
};

window.onFolderChip = function(id, isCustom) { if (isCustom && state.selectedFolder === id) { window.openFolderEditor(id); return; } state.selectedFolder = id; haptic(); save(); window.renderNotes(); };
window.openFolderEditor = function(id) {
  const folder = id ? state.noteFolders.find(f => f.id === id) : null;
  window.openSheet(`<h2>${folder ? 'Папка' : 'Новая папка'}</h2><div class="field"><label>Название</label><input type="text" id="f-name" value="${folder ? escapeHtml(folder.name) : ''}"></div><div class="field"><label>Иконка</label><input type="text" id="f-icon" value="${folder ? escapeHtml(folder.icon || '📁') : '📁'}" maxlength="2"></div><div class="sheet-actions">${folder ? `<button class="btn-danger" onclick="window.deleteFolder('${id}')">Удалить</button>` : ''}<button class="btn-cancel" onclick="window.closeSheet()">Отмена</button><button class="btn-primary" onclick="window.saveFolder('${id || ''}')">Сохранить</button></div>`);
};
window.saveFolder = function(id) {
  const name = document.getElementById('f-name').value.trim(); const icon = document.getElementById('f-icon').value.trim() || '📁';
  if (!name) return;
  if (id) { const f = state.noteFolders.find(x => x.id === id); if (f) { f.name = name; f.icon = icon; } }
  else { state.noteFolders.push({ id: uid() + '', name, icon }); }
  save(); window.closeSheet(); window.renderNotes();
};
window.deleteFolder = function(id) {
  if (!confirm('Удалить папку?')) return;
  state.noteFolders = state.noteFolders.filter(f => f.id !== id);
  state.notes.forEach(n => { if (n.folderId === id) n.folderId = null; });
  if (state.selectedFolder === id) state.selectedFolder = 'all';
  save(); window.closeSheet(); window.renderNotes();
};
window.addNote = function() {
  const folderId = state.selectedFolder === 'all' ? (state.noteFolders[0]?.id || null) : state.selectedFolder;
  const n = { id: uid(), title: 'Без названия', body: '', folderId, pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
  state.notes.push(n); haptic(); save(); window.openNote(n.id);
};
window.openNote = function(id) {
  if (currentNoteId && currentNoteId !== id) window.saveCurrentNote();
  const n = state.notes.find(x => x.id === id); if (!n) return;
  currentNoteId = id;
  document.getElementById('edit-note-title').value = n.title;
  document.getElementById('edit-note-body').innerHTML = n.body;
  document.getElementById('notes-list-view').style.display = 'none';
  document.getElementById('note-edit-view').style.display = 'block';
  window.updatePinBtn();
};
window.updatePinBtn = function() {
  const n = state.notes.find(x => x.id === currentNoteId); const btn = document.getElementById('pin-btn');
  if (n && btn) { btn.style.color = n.pinned ? 'var(--orange)' : 'var(--text-sec)'; btn.style.background = n.pinned ? 'var(--accent-soft)' : 'var(--chip-bg)'; }
};
window.togglePinNote = function() {
  const n = state.notes.find(x => x.id === currentNoteId); if (!n) return;
  n.pinned = !n.pinned; n.updatedAt = Date.now(); haptic(); save(); window.updatePinBtn();
};
window.closeNoteEditor = function() {
  window.saveCurrentNote(); currentNoteId = null;
  document.getElementById('notes-list-view').style.display = 'block';
  document.getElementById('note-edit-view').style.display = 'none';
  window.renderNotes();
};
window.deleteCurrentNote = function() {
  if (!currentNoteId || !confirm('Удалить?')) return;
  state.notes = state.notes.filter(n => n.id !== currentNoteId); save();
  currentNoteId = null;
  document.getElementById('notes-list-view').style.display = 'block';
  document.getElementById('note-edit-view').style.display = 'none';
  window.renderNotes();
};

// ============ КАЛЕНДАРЬ ============
let calDate = new Date();

window.renderCalendar = function() {
  const y = calDate.getFullYear(), m = calDate.getMonth();
  const startWeekday = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = todayStr();
  
  document.getElementById('cal-title').textContent = calDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push('<div class="cal-day empty"></div>');
  
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const sDone = !!state.surveys[dateStr];
    const hDone = state.habits.some(h => !h.archived && window.isHabitDoneForDate(h, dateStr));
    const tDone = state.tasks.some(t => t.recurrence ? (Tasks.matchesRecurrence(t, dateStr) && Tasks.isTaskDoneOn(t, dateStr)) : (t.date === dateStr && t.done));
    cells.push(`<div class="cal-day ${dateStr === today ? 'today' : ''}" style="aspect-ratio:1;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:13px;background:var(--input-bg);gap:2px;cursor:pointer;color:var(--text);${dateStr === today ? 'outline:2px solid var(--td-red);' : ''}" onclick="window.openDayDetail('${dateStr}')"><div>${d}</div><div style="display:flex;gap:2px;"><span style="width:4px;height:4px;border-radius:50%;background:${sDone ? 'var(--pink)' : 'var(--text-tert)'}"></span><span style="width:4px;height:4px;border-radius:50%;background:${hDone ? 'var(--green)' : 'var(--text-tert)'}"></span><span style="width:4px;height:4px;border-radius:50%;background:${tDone ? 'var(--td-blue)' : 'var(--text-tert)'}"></span></div></div>`);
  }
  document.getElementById('cal-grid').innerHTML = cells.join('');
};

window.openDayDetail = function(dateStr) {
  const s = state.surveys[dateStr];
  const habitsDone = state.habits.filter(h => !h.archived && window.isHabitDoneForDate(h, dateStr));
  const tasksOnDay = state.tasks.filter(t => t.recurrence ? Tasks.matchesRecurrence(t, dateStr) : t.date === dateStr);
  const tasksDone = tasksOnDay.filter(t => Tasks.isTaskDoneOn(t, dateStr));
  const isToday = dateStr === todayStr();
  
  let habitsHtml = habitsDone.length ? habitsDone.map(h => `<div class="insight">${svgIcon(h.icon, h.color, 14)} ${escapeHtml(h.name)}</div>`).join('') : '<div class="empty-hint">Ни одна не выполнена</div>';
  let tasksHtml = tasksOnDay.length ? tasksOnDay.map(t => `<div class="insight">${Tasks.isTaskDoneOn(t, dateStr) ? '✅' : '○'} ${escapeHtml(t.title)}</div>`).join('') : '<div class="empty-hint">Задач не было</div>';
  
  window.openSheet(`
    <h2>${formatDateHuman(dateStr)}</h2>
    ${isToday ? '<div style="display:inline-block;padding:2px 8px;background:var(--chip-bg);border-radius:6px;font-size:11px;color:var(--text-sec);margin-bottom:8px;">Сегодня</div>' : ''}
    <div style="font-size:12px;font-weight:700;color:var(--text-sec);text-transform:uppercase;letter-spacing:.4px;margin:16px 0 8px;">Опрос</div>
    ${s ? `<div class="insight"><b>Настроение:</b> ${s.emotions?.joy ?? '—'}/10 · <b>Продуктивность:</b> ${s.mental?.productivity ?? '—'}/10 · <b>Смысл:</b> ${s.mental?.meaning ?? '—'}/10</div>` : `<div class="empty-hint">Опрос не заполнен</div>`}
    <div style="font-size:12px;font-weight:700;color:var(--text-sec);text-transform:uppercase;letter-spacing:.4px;margin:16px 0 8px;">Привычки (${habitsDone.length}/${state.habits.filter(h => !h.archived).length})</div>
    ${habitsHtml}
    <div style="font-size:12px;font-weight:700;color:var(--text-sec);text-transform:uppercase;letter-spacing:.4px;margin:16px 0 8px;">Задачи (${tasksDone.length}/${tasksOnDay.length})</div>
    ${tasksHtml}
    <div class="sheet-actions"><button class="btn-cancel" onclick="window.closeSheet()">Закрыть</button><button class="btn-primary" onclick="window.closeSheet();window.goToDate('${dateStr}')">Открыть →</button></div>
  `);
};

window.goToDate = function(dateStr) { window.currentDate = dateStr; window.switchTab('today'); };
window.prevMonth = function() { calDate.setMonth(calDate.getMonth() - 1); haptic(); window.renderCalendar(); };
window.nextMonth = function() { calDate.setMonth(calDate.getMonth() + 1); haptic(); window.renderCalendar(); };

// ============ НАСТРОЙКИ И СИНХРОНИЗАЦИЯ ============
window.manualSyncWithUI = async function(btn) {
  const icon = btn.querySelector('.sync-icon'); if (icon) icon.classList.add('spinning');
  await pullFromCloud(false, false); await pushToCloud();
  if (icon) icon.classList.remove('spinning'); window.showToast('🔄 Обновлено');
};

window.openSettings = function() {
  window.openSheet(`
    <h2>Настройки</h2>
    <div class="settings-header">Синхронизация</div>
    <div class="settings-group">
      <div class="settings-row" onclick="window.manualSyncWithUI(this)" style="cursor:pointer;"><div class="left"><div class="icon" style="background:var(--green);">${svgIcon('refresh', '#fff', 16)}</div>Синхронизировать</div></div>
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

// ============ ЭКСПОРТ / ИМПОРТ ============
window.exportData = function() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `cantilena-backup-${todayStr()}.json`; a.click(); URL.revokeObjectURL(url);
};
window.exportCSV = function() {
  let csv = "Дата,Настроение,Продуктивность,Тревога,Энергия,Смысл,Сон_ч,Лёг,Встал,Движение_мин\n";
  Object.keys(state.surveys).sort().forEach(d => {
    const s = state.surveys[d]; const avg = (state.moods[d] || []).length ? Math.round(state.moods[d].reduce((sum, m) => sum + m.val, 0) / state.moods[d].length) : '';
    csv += `${d},${avg},${s.mental?.productivity || ''},${s.emotions?.anxiety || ''},${s.physical?.energy || ''},${s.mental?.meaning || ''},${s.physical?.sleepHours || ''},${s.physical?.sleepStart || ''},${s.physical?.sleepEnd || ''},${s.physical?.movement || ''}\n`;
  });
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `cantilena-data-${todayStr()}.csv`; a.click();
};
window.importData = function(e) {
  const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data || !Array.isArray(data.habits)) throw new Error('Неверный формат');
      if (!confirm('Заменить данные?')) return;
      window.state = migrateState(data); save(); window.renderAll(); alert('Импорт успешно!');
    } catch (err) { alert('Ошибка: ' + err.message); }
  };
  reader.readAsText(file); e.target.value = '';
};

// ============ ПОМОДОРО ТАЙМЕР ============
let pomoTimer = null, pomoTimeLeft = 25 * 60, pomoRunning = false;

window.togglePomodoro = function() {
  const btn = document.getElementById('pomo-btn');
  const display = document.getElementById('pomo-time');
  if (pomoRunning) {
    clearInterval(pomoTimer); pomoRunning = false;
    btn.textContent = 'Старт'; btn.style.background = 'var(--accent)';
  } else {
    pomoRunning = true; btn.textContent = 'Стоп'; btn.style.background = 'var(--red)';
    pomoTimer = setInterval(() => {
      pomoTimeLeft--; const m = Math.floor(pomoTimeLeft / 60), s = pomoTimeLeft % 60;
      display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      if (pomoTimeLeft <= 0) {
        clearInterval(pomoTimer); pomoRunning = false; display.textContent = '25:00';
        btn.textContent = 'Старт'; btn.style.background = 'var(--accent)';
        playSound('success'); window.showToast('🍅 Время вышло! Пора отдохнуть.');
      }
    }, 1000);
  }
};

// ============ НАВИГАЦИЯ ============
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

// ============ РЕНДЕР ============
window.renderAll = function() {
  window.updateDateNav();
  window.renderHabitsToday();
  window.renderQuickMoodUI();
  Tasks.renderTasksTodayMini();
  Tasks.renderTasks();
  Tasks.renderFocusOfDay();
  window.renderNotes();
  window.renderCalendar();
  window.updateRings();
};

window.updateRings = function() {
  const t = window.currentDate;
  const sPct = state.surveys[t]?.evening ? 1 : 0;
  const sched = window.habitsScheduledForDate(t);
  const hPct = sched.length ? sched.filter(h => window.isHabitDoneForDate(h, t)).length / sched.length : 0;
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
};

// ============ СТАРТ ============
document.addEventListener('DOMContentLoaded', () => {
  window.renderAll();
  initSupabase();
});
