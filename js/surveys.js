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

export function openWeeklySurvey(wk) {
  wk = wk || window.isoWeek();
  const s = state.weeklySurveys[wk] || {};
  const passed = !!s.ts;
  const get = (k, d) => s[k] ?? d;
  
  window.openSheet(`
    <h2>Компас недели</h2>
    <p style="font-size:13px;color:var(--text-sec);margin-bottom:12px;">
      Неделя ${wk} ${passed ? '· <span style="color:var(--green);font-weight:700;">✅ Пройден</span>' : ''}
    </p>
    
    <div class="survey-section">1. Цель недели</div>
    <div class="field"><label>Одна главная цель этой недели</label>
      <input type="text" id="w-goal" value="${escapeHtml(get('goal', ''))}" placeholder="Например: доделать проект X">
    </div>
    <div class="field"><label>Насколько продвинулся к ней (1-10) <span style="float:right;color:var(--accent);font-weight:700;" id="v-w-progress">${get('progress', 5)}</span></label>
      <input type="range" id="s-w-progress" min="1" max="10" value="${get('progress', 5)}" oninput="document.getElementById('v-w-progress').textContent=this.value">
    </div>

    <div class="survey-section">2. Шаг к мечте</div>
    <div class="field"><label>Какой конкретный шаг ты сделал к большой мечте?</label>
      <textarea id="w-dreamStep" placeholder="Даже маленький шаг — важен">${escapeHtml(get('dreamStep', ''))}</textarea>
    </div>

    <div class="survey-section">3. Что мешало</div>
    <div class="field"><label>Главное препятствие</label>
      <select id="w-obstacle">
        <option value="" ${!get('obstacle', '') ? 'selected' : ''}>—</option>
        <option value="sleep" ${get('obstacle', '') === 'sleep' ? 'selected' : ''}>Плохой сон</option>
        <option value="anxiety" ${get('obstacle', '') === 'anxiety' ? 'selected' : ''}>Тревога</option>
        <option value="procrastination" ${get('obstacle', '') === 'procrastination' ? 'selected' : ''}>Прокрастинация</option>
        <option value="people" ${get('obstacle', '') === 'people' ? 'selected' : ''}>Люди / обстоятельства</option>
        <option value="none" ${get('obstacle', '') === 'none' ? 'selected' : ''}>Ничего серьёзного</option>
      </select>
    </div>

    <div class="survey-section">4. Общее самочувствие</div>
    <div class="field"><label>Насколько доволен неделей (1-10) <span style="float:right;color:var(--accent);font-weight:700;" id="v-w-wellbeing">${get('wellbeing', 5)}</span></label>
      <input type="range" id="s-w-wellbeing" min="1" max="10" value="${get('wellbeing', 5)}" oninput="document.getElementById('v-w-wellbeing').textContent=this.value">
    </div>

    <div class="survey-section">5. Рефлексия</div>
    <div class="field"><label>Что ты понял о себе за эту неделю?</label>
      <textarea id="w-lesson" placeholder="Уроки — это топливо для следующего шага">${escapeHtml(get('lesson', ''))}</textarea>
    </div>

    <div class="sheet-actions">
      <button class="btn-cancel" onclick="window.closeSheet()">Отмена</button>
      <button class="btn-primary" onclick="window.saveWeeklySurvey('${wk}')">Сохранить</button>
    </div>
  `);
}

export function saveDailySurvey() {
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
  s.physical.sleepHours = window.computeSleepHours ? window.computeSleepHours(s.physical.sleepStart, s.physical.sleepEnd) : null;
  s.physical.movement = parseFloat(document.getElementById('d-movement').value) || 0;
  
  s.reflection = s.reflection || {}; s.reflection.gratitude = document.getElementById('d-gratitude').value.trim();
  s.contextTags = window.tempContextTags || [];
  
  const moods = state.moods[dateStr] || [];
  if (moods.length) s.emotions.joy = Math.round(moods.reduce((sum, m) => sum + m.val, 0) / moods.length);
  
  window.haptic('success'); window.playSound('success'); save(); window.closeSheet(); window.renderAll();
}
window.saveDailySurvey = saveDailySurvey;

export function saveWeeklySurvey(wk) {
  wk = wk || window.isoWeek();
  const goal = document.getElementById('w-goal').value.trim();
  const progress = +document.getElementById('s-w-progress').value;
  const dreamStep = document.getElementById('w-dreamStep').value.trim();
  const obstacle = document.getElementById('w-obstacle').value;
  const wellbeing = +document.getElementById('s-w-wellbeing').value;
  const lesson = document.getElementById('w-lesson').value.trim();
  
  state.weeklySurveys[wk] = { goal, progress, dreamStep, obstacle, wellbeing, lesson, ts: Date.now() };
  window.haptic('success'); window.playSound('success'); save(); window.closeSheet(); window.renderAll();
}
window.saveWeeklySurvey = saveWeeklySurvey;

export function hasDream() {
  return state.dream && (state.dream.vision || (state.dream.markers && state.dream.markers.length));
}

export function openDreamEditor() {
  const dream = state.dream || { vision: '', markers: [], reviews: {} };
  const markers = dream.markers.length ? dream.markers : [''];
  
  let markersHtml = '';
  markers.forEach((m, i) => {
    markersHtml += `
      <div class="marker-item">
        <input type="text" class="marker-input" value="${escapeHtml(m)}" placeholder="Маркер ${i + 1}">
        ${markers.length > 1 ? `<button class="marker-del" onclick="window.removeMarker(this)">×</button>` : ''}
      </div>
    `;
  });
  
  window.openSheet(`
    <h2>Моя мечта</h2>
    <p style="font-size:13px;color:var(--text-sec);margin-bottom:16px;">
      Куда ты идёшь? Одно предложение о будущем и 3-5 маркеров, по которым поймёшь, что приблизился.
    </p>
    
    <div class="field"><label>Через год я хочу быть...</label>
      <textarea id="dream-vision" placeholder="Например: человеком, который свободно говорит на английском и работает над своим проектом" style="min-height:100px;">${escapeHtml(dream.vision)}</textarea>
    </div>
    
    <div class="field"><label>Маркеры прогресса (что будет значить «я на пути»)</label>
      <div id="markers-container">${markersHtml}</div>
      <button class="btn-cancel" style="width:auto;margin-top:8px;padding:8px 14px;font-size:13px;" onclick="window.addMarker()">+ Добавить маркер</button>
    </div>
    
    <div class="sheet-actions" style="margin-top:20px;">
      <button class="btn-cancel" onclick="window.closeSheet()">Отмена</button>
      <button class="btn-primary" onclick="window.saveDream()">Сохранить</button>
    </div>
  `);
}

export function addMarker() {
  const container = document.getElementById('markers-container');
  const count = container.querySelectorAll('.marker-item').length;
  if (count >= 5) { window.showToast('Максимум 5 маркеров'); return; }
  const div = document.createElement('div');
  div.className = 'marker-item';
  div.innerHTML = `<input type="text" class="marker-input" placeholder="Маркер ${count + 1}"><button class="marker-del" onclick="window.removeMarker(this)">×</button>`;
  container.appendChild(div);
}

export function removeMarker(btn) {
  const container = document.getElementById('markers-container');
  if (container.querySelectorAll('.marker-item').length <= 1) return;
  btn.closest('.marker-item').remove();
}

export function saveDream() {
  const vision = document.getElementById('dream-vision').value.trim();
  const markers = [...document.querySelectorAll('.marker-input')].map(i => i.value.trim()).filter(Boolean);
  if (!state.dream) state.dream = { vision: '', markers: [], reviews: {} };
  state.dream.vision = vision;
  state.dream.markers = markers;
  state.dream.updatedAt = Date.now();
  if (!state.dream.createdAt) state.dream.createdAt = Date.now();
  window.haptic('success'); window.playSound('success'); save(); window.closeSheet(); window.renderAll();
}

export function openMonthlyReview() {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prev = state.dream.reviews[key] || {};
  window.openSheet(`
    <h2>Ревизия месяца</h2>
    <p style="font-size:13px;color:var(--text-sec);margin-bottom:16px;">${now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</p>
    <div class="field"><label>Насколько приблизился к мечте (1-10) <span style="float:right;color:var(--accent);font-weight:700;" id="v-rev-score">${prev.score || 5}</span></label>
      <input type="range" id="rev-score" min="1" max="10" value="${prev.score || 5}" oninput="document.getElementById('v-rev-score').textContent=this.value">
    </div>
    <div class="field"><label>Что изменилось?</label>
      <textarea id="rev-note" placeholder="Что стало по-другому в этом месяце?">${escapeHtml(prev.note || '')}</textarea>
    </div>
    <div class="sheet-actions">
      <button class="btn-cancel" onclick="window.closeSheet()">Отмена</button>
      <button class="btn-primary" onclick="window.saveMonthlyReview('${key}')">Сохранить</button>
    </div>
  `);
}

export function saveMonthlyReview(key) {
  const score = +document.getElementById('rev-score').value;
  const note = document.getElementById('rev-note').value.trim();
  if (!state.dream.reviews) state.dream.reviews = {};
  state.dream.reviews[key] = { score, note, ts: Date.now() };
  window.haptic('success'); save(); window.closeSheet(); window.renderAll();
}
