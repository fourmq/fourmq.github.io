import { escapeHtml, svgIcon, todayStr, uid, DAILY_PROMPTS, CONTEXT_TAGS, WEEKDAYS_LONG, formatDateHuman, APP_VERSION, CHANGELOG } from './utils.js';
import { state, save } from './db.js';

export let tempContextTags = [];

export function openDailySurvey() {
  const dateStr = window.currentDate;
  const s = state.surveys[dateStr] || {};
  const moods = state.moods[dateStr] || [];
  const avgMood = moods.length ? Math.round(moods.reduce((sum, m) => sum + m.val, 0) / moods.length) : 5;
  
  const todayPrompt = DAILY_PROMPTS[new Date(dateStr).getDate() % DAILY_PROMPTS.length];
  const gratitude = s.reflection?.gratitude || '';
  
  tempContextTags = s.contextTags || [];
  const tagsHtml = CONTEXT_TAGS.map(t => `
    <button type="button" onclick="window.toggleContextTag('${t.id}')" id="tag-${t.id}" 
      style="padding:8px 12px;border-radius:12px;border:1px solid ${tempContextTags.includes(t.id) ? 'var(--accent)' : 'var(--separator-med)'};background:${tempContextTags.includes(t.id) ? 'var(--accent-soft)' : 'var(--input-bg)'};color:${tempContextTags.includes(t.id) ? 'var(--accent)' : 'var(--text)'};font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .2s;">
      ${t.icon} ${t.label}
    </button>
  `).join('');

  window.openSheet(`
    <h2>Вечерний опрос</h2>
    <p style="font-size:13px;color:var(--text-sec);margin-bottom:16px;">Средний пульс: ${avgMood}/10</p>
    
    <div class="survey-section">Как ты себя чувствовал</div>
    <div class="field"><label>Энергия <span style="float:right;color:var(--accent);font-weight:700;" id="v-d-energy">${s.physical?.energy ?? 5}</span></label><input type="range" id="d-energy" min="1" max="10" value="${s.physical?.energy ?? 5}" oninput="document.getElementById('v-d-energy').textContent=this.value"></div>
    <div class="field"><label>Тревога <span style="float:right;color:var(--accent);font-weight:700;" id="v-d-anx">${s.emotions?.anxiety ?? 5}</span></label><input type="range" id="d-anx" min="1" max="10" value="${s.emotions?.anxiety ?? 5}" oninput="document.getElementById('v-d-anx').textContent=this.value"></div>
    <div class="field"><label>Смысл <span style="float:right;color:var(--accent);font-weight:700;" id="v-d-meaning">${s.mental?.meaning ?? 5}</span></label><input type="range" id="d-meaning" min="1" max="10" value="${s.mental?.meaning ?? 5}" oninput="document.getElementById('v-d-meaning').textContent=this.value"></div>
    <div class="field"><label>Продуктивность <span style="float:right;color:var(--accent);font-weight:700;" id="v-d-prod">${s.mental?.productivity ?? 5}</span></label><input type="range" id="d-prod" min="1" max="10" value="${s.mental?.productivity ?? 5}" oninput="document.getElementById('v-d-prod').textContent=this.value"></div>

    <div class="survey-section">Сон</div>
    <div class="field"><label>Лёг</label><input type="time" id="d-sleep-start" value="${s.physical?.sleepStart || ''}"></div>
    <div class="field"><label>Встал</label><input type="time" id="d-sleep-end" value="${s.physical?.sleepEnd || ''}"></div>
    <div class="field"><label>Движение, минут</label><input type="number" id="d-movement" value="${s.physical?.movement || 0}" placeholder="0"></div>

    <div class="survey-section">Что влияло на состояние?</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">${tagsHtml}</div>

    <div class="survey-section">Рефлексия</div>
    <div class="field"><label style="color:var(--accent);font-size:14px;">${todayPrompt}</label><textarea id="d-gratitude" placeholder="Твой ответ...">${escapeHtml(gratitude)}</textarea></div>
    
    <div class="sheet-actions" style="display:flex;gap:8px;"><button class="btn-cancel" style="flex:1;" onclick="window.closeSheet()">Отмена</button><button class="btn-primary" style="flex:1;" onclick="window.saveDailySurvey()">Сохранить</button></div>
  `);
}

export function openChangelog() {
  const itemsHtml = CHANGELOG.map(c => `
    <div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-weight:700;font-size:16px;">Версия ${c.v}</span><span style="font-size:12px;color:var(--text-sec);">${c.date}</span>
      </div>
      <div class="card tight" style="padding:8px 12px;">${c.items.map(i => `<div style="font-size:14px;margin:4px 0;color:var(--text-sec);">• ${i}</div>`).join('')}</div>
    </div>
  `).join('');
  window.openSheet(`<h2>Что нового?</h2><div style="margin-top:16px;">${itemsHtml}</div><button class="btn-cancel" onclick="window.openSettings()">← Назад</button>`);
}

window.toggleContextTag = function(id) {
  const btn = document.getElementById('tag-' + id);
  if (tempContextTags.includes(id)) {
    tempContextTags = tempContextTags.filter(t => t !== id);
    btn.style.background = 'var(--input-bg)'; btn.style.borderColor = 'var(--separator-med)'; btn.style.color = 'var(--text)';
  } else {
    tempContextTags.push(id);
    btn.style.background = 'var(--accent-soft)'; btn.style.borderColor = 'var(--accent)'; btn.style.color = 'var(--accent)';
  }
};

function computeSleepHours(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number); const [eh, em] = end.split(':').map(Number);
  let startM = sh * 60 + sm; let endM = eh * 60 + em;
  if (endM <= startM) endM += 24 * 60;
  return +((endM - startM) / 60).toFixed(1);
}

window.saveDailySurvey = function() {
  const dateStr = window.currentDate;
  if (!state.surveys[dateStr]) state.surveys[dateStr] = {};
  const s = state.surveys[dateStr];
  s.evening = true;
  s.eveningTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  
  s.mental = s.mental || {}; s.mental.productivity = +document.getElementById('d-prod').value; s.mental.meaning = +document.getElementById('d-meaning').value;
  s.emotions = s.emotions || {}; s.emotions.anxiety = +document.getElementById('d-anx').value;
  s.physical = s.physical || {}; s.physical.energy = +document.getElementById('d-energy').value;
  s.physical.sleepStart = document.getElementById('d-sleep-start').value || null;
  s.physical.sleepEnd = document.getElementById('d-sleep-end').value || null;
  s.physical.sleepHours = computeSleepHours(s.physical.sleepStart, s.physical.sleepEnd);
  s.physical.movement = parseFloat(document.getElementById('d-movement').value) || 0;
  
  s.reflection = s.reflection || {}; s.reflection.gratitude = document.getElementById('d-gratitude').value.trim();
  s.contextTags = tempContextTags;
  
  const moods = state.moods[dateStr] || [];
  if (moods.length) s.emotions.joy = Math.round(moods.reduce((sum, m) => sum + m.val, 0) / moods.length);
  
  window.haptic('success'); window.playSound('success'); save(); window.closeSheet(); window.renderAll();
};

window.openDailySurvey = openDailySurvey;
window.openChangelog = openChangelog;
