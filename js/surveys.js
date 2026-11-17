import { escapeHtml, svgIcon, todayStr, uid, DAILY_PROMPTS, CONTEXT_TAGS, WEEKDAYS_LONG, formatDateHuman, APP_VERSION, CHANGELOG } from './utils.js';
import { state, save } from './db.js';

export let tempContextTags = [];

window.toggleContextTag = function(id) {
  const i = tempContextTags.indexOf(id);
  if (i >= 0) tempContextTags.splice(i, 1);
  else tempContextTags.push(id);
  window.tempContextTags = tempContextTags;
  const btn = document.getElementById('tag-' + id);
  if (btn) btn.classList.toggle('on', tempContextTags.includes(id));
  haptic && haptic();
};
window.tempContextTags = tempContextTags;



// ─── helpers: emoji score 1–10 as 5 chips mapped to 2,4,6,8,10 ───
function scoreChips(id, value, labels) {
  // labels: array of 5 {v, emoji, text}
  return `<div class="score-chips" id="wrap-${id}" data-id="${id}">
    ${labels.map(l => `
      <button type="button" class="score-chip ${Number(value) === l.v ? 'active' : ''}"
        data-v="${l.v}" onclick="window.pickScore('${id}', ${l.v})">
        <span class="score-emoji">${l.emoji}</span>
        <span class="score-label">${l.text}</span>
      </button>`).join('')}
    <input type="hidden" id="${id}" value="${value}">
  </div>`;
}

window.pickScore = function(id, v) {
  const wrap = document.getElementById('wrap-' + id);
  if (!wrap) return;
  wrap.querySelectorAll('.score-chip').forEach(b => b.classList.toggle('active', Number(b.dataset.v) === v));
  const inp = document.getElementById(id);
  if (inp) inp.value = v;
  haptic && haptic();
};

const ENERGY_L = [
  { v: 2, emoji: '🪫', text: 'Нет сил' },
  { v: 4, emoji: '😮‍💨', text: 'Так себе' },
  { v: 6, emoji: '😐', text: 'Норм' },
  { v: 8, emoji: '🙂', text: 'Бодро' },
  { v: 10, emoji: '⚡', text: 'Полон сил' }
];
const ANX_L = [
  { v: 2, emoji: '😌', text: 'Спокоен' },
  { v: 4, emoji: '🙂', text: 'Легко' },
  { v: 6, emoji: '😕', text: 'Немного' },
  { v: 8, emoji: '😰', text: 'Сильно' },
  { v: 10, emoji: '😫', text: 'На пределе' }
];
const MEANING_L = [
  { v: 2, emoji: '😶', text: 'Пусто' },
  { v: 4, emoji: '🤷', text: 'Слабо' },
  { v: 6, emoji: '🤔', text: 'Есть смысл' },
  { v: 8, emoji: '✨', text: 'Важно' },
  { v: 10, emoji: '🔥', text: 'По-настоящему' }
];
const PROD_L = [
  { v: 2, emoji: '🦥', text: 'Почти ноль' },
  { v: 4, emoji: '😑', text: 'Мало' },
  { v: 6, emoji: '👍', text: 'Ок' },
  { v: 8, emoji: '💪', text: 'Хорошо' },
  { v: 10, emoji: '🚀', text: 'На максимуме' }
];
const PROGRESS_L = [
  { v: 2, emoji: '🌑', text: 'Почти нет' },
  { v: 4, emoji: '🌘', text: 'Чуть-чуть' },
  { v: 6, emoji: '🌓', text: 'Середина' },
  { v: 8, emoji: '🌕', text: 'Сильно' },
  { v: 10, emoji: '🌟', text: 'Сделано' }
];
const WELL_L = [
  { v: 2, emoji: '😞', text: 'Тяжело' },
  { v: 4, emoji: '😕', text: 'Слабо' },
  { v: 6, emoji: '😐', text: 'Норм' },
  { v: 8, emoji: '😊', text: 'Доволен' },
  { v: 10, emoji: '🤩', text: 'Отлично' }
];

function nearestChip(val, labels) {
  const v = Number(val) || 6;
  let best = labels[2].v, dist = 99;
  labels.forEach(l => { const d = Math.abs(l.v - v); if (d < dist) { dist = d; best = l.v; } });
  return best;
}

function moveChips(val) {
  const opts = [
    { v: 0, label: '0' }, { v: 15, label: '15' }, { v: 30, label: '30' },
    { v: 45, label: '45' }, { v: 60, label: '60+' }
  ];
  const cur = Number(val) || 0;
  const active = cur >= 60 ? 60 : (opts.find(o => o.v === cur) ? cur : (cur > 45 ? 60 : 0));
  return `<div class="score-chips compact" id="wrap-d-movement">
    ${opts.map(o => `<button type="button" class="score-chip ${active === o.v ? 'active' : ''}" data-v="${o.v}" onclick="window.pickScore('d-movement', ${o.v})"><span class="score-label">${o.label} мин</span></button>`).join('')}
    <input type="hidden" id="d-movement" value="${active}">
  </div>`;
}

export function openDailySurvey() {
  const dateStr = window.currentDate;
  const s = state.surveys[dateStr] || {};
  const moods = state.moods[dateStr] || [];
  const avgMood = moods.length ? Math.round(moods.reduce((sum, m) => sum + m.val, 0) / moods.length) : null;

  const todayPrompt = DAILY_PROMPTS[new Date(dateStr + 'T12:00:00').getDate() % DAILY_PROMPTS.length];
  const gratitude = s.reflection?.gratitude || '';

  tempContextTags = [...(s.contextTags || [])];
  const tagsHtml = CONTEXT_TAGS.map(t => `
    <button type="button" class="ctx-tag ${tempContextTags.includes(t.id) ? 'on' : ''}" id="tag-${t.id}"
      onclick="window.toggleContextTag('${t.id}')">${t.icon} ${t.label}</button>
  `).join('');

  const e = nearestChip(s.physical?.energy ?? 6, ENERGY_L);
  const a = nearestChip(s.emotions?.anxiety ?? 4, ANX_L);
  const m = nearestChip(s.mental?.meaning ?? 6, MEANING_L);
  const p = nearestChip(s.mental?.productivity ?? 6, PROD_L);

  window.openSheet(`
    <h2 style="margin-bottom:4px;">Как прошёл день?</h2>
    <p style="font-size:13px;color:var(--text-sec);margin-bottom:16px;">
      ${avgMood != null ? `Среднее настроение сегодня: ${avgMood}/10` : 'Пара касаний — и готово'}
    </p>

    <div class="survey-q">
      <div class="survey-q-title">🔋 Как по энергии?</div>
      ${scoreChips('d-energy', e, ENERGY_L)}
    </div>

    <div class="survey-q">
      <div class="survey-q-title">💭 Насколько было тревожно?</div>
      ${scoreChips('d-anx', a, ANX_L)}
    </div>

    <div class="survey-q">
      <div class="survey-q-title">✨ День был осмысленным?</div>
      ${scoreChips('d-meaning', m, MEANING_L)}
    </div>

    <div class="survey-q">
      <div class="survey-q-title">🎯 Насколько ты «сделал дела»?</div>
      ${scoreChips('d-prod', p, PROD_L)}
    </div>

    <div class="survey-q">
      <div class="survey-q-title">😴 Сон</div>
      <div style="display:flex;gap:10px;">
        <div class="field" style="flex:1;margin:0;"><label>Лёг</label><input type="time" id="d-sleep-start" value="${s.physical?.sleepStart || ''}"></div>
        <div class="field" style="flex:1;margin:0;"><label>Встал</label><input type="time" id="d-sleep-end" value="${s.physical?.sleepEnd || ''}"></div>
      </div>
    </div>

    <div class="survey-q">
      <div class="survey-q-title">🚶 Движение сегодня</div>
      ${moveChips(s.physical?.movement || 0)}
    </div>

    <div class="survey-q">
      <div class="survey-q-title">Что влияло на день?</div>
      <div class="ctx-tags">${tagsHtml}</div>
    </div>

    <div class="survey-q">
      <div class="survey-q-title">${todayPrompt}</div>
      <textarea id="d-gratitude" rows="3" placeholder="Можно коротко, своими словами…">${escapeHtml(gratitude)}</textarea>
    </div>

    <div class="sheet-actions" style="display:flex;gap:8px;">
      <button class="btn-cancel" style="flex:1;" onclick="window.closeSheet()">Позже</button>
      <button class="btn-primary" style="flex:1;" onclick="window.saveDailySurvey()">Готово</button>
    </div>
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
  const prog = nearestChip(get('progress', 6), PROGRESS_L);
  const well = nearestChip(get('wellbeing', 6), WELL_L);

  const obstacles = [
    { id: 'sleep', emoji: '😴', label: 'Сон' },
    { id: 'anxiety', emoji: '😰', label: 'Тревога' },
    { id: 'procrastination', emoji: '📱', label: 'Прокрастинация' },
    { id: 'people', emoji: '👥', label: 'Люди' },
    { id: 'none', emoji: '✅', label: 'Ничего серьёзного' }
  ];
  const curObs = get('obstacle', '');
  const obsHtml = obstacles.map(o => `
    <button type="button" class="score-chip ${curObs === o.id ? 'active' : ''}" data-obs="${o.id}"
      onclick="window.pickObstacle('${o.id}')">
      <span class="score-emoji">${o.emoji}</span>
      <span class="score-label">${o.label}</span>
    </button>`).join('');

  window.openSheet(`
    <h2 style="margin-bottom:4px;">Компас недели</h2>
    <p style="font-size:13px;color:var(--text-sec);margin-bottom:16px;">
      ${wk}${passed ? ' · <span style="color:var(--green);font-weight:600;">уже заполнен</span>' : ' · 5 коротких ответов'}
    </p>

    <div class="survey-q">
      <div class="survey-q-title">🎯 Одна главная цель на неделю</div>
      <input type="text" id="w-goal" value="${escapeHtml(get('goal', ''))}" placeholder="Например: закрыть важный кусок проекта">
    </div>

    <div class="survey-q">
      <div class="survey-q-title">Насколько продвинулся к ней?</div>
      ${scoreChips('s-w-progress', prog, PROGRESS_L)}
    </div>

    <div class="survey-q">
      <div class="survey-q-title">🌟 Какой шаг к большой мечте ты сделал?</div>
      <textarea id="w-dreamStep" rows="2" placeholder="Даже маленький шаг считается">${escapeHtml(get('dreamStep', ''))}</textarea>
    </div>

    <div class="survey-q">
      <div class="survey-q-title">Что больше всего мешало?</div>
      <div class="score-chips" id="obstacle-chips">${obsHtml}</div>
      <input type="hidden" id="w-obstacle" value="${escapeHtml(curObs)}">
    </div>

    <div class="survey-q">
      <div class="survey-q-title">🙂 Насколько доволен неделей в целом?</div>
      ${scoreChips('s-w-wellbeing', well, WELL_L)}
    </div>

    <div class="survey-q">
      <div class="survey-q-title">Что понял о себе за эту неделю?</div>
      <textarea id="w-lesson" rows="2" placeholder="Один вывод — уже победа">${escapeHtml(get('lesson', ''))}</textarea>
    </div>

    <div class="sheet-actions" style="display:flex;gap:8px;">
      <button class="btn-cancel" style="flex:1;" onclick="window.closeSheet()">Позже</button>
      <button class="btn-primary" style="flex:1;" onclick="window.saveWeeklySurvey('${wk}')">Готово</button>
    </div>
  `);
}

window.pickObstacle = function(id) {
  document.getElementById('w-obstacle').value = id;
  document.querySelectorAll('#obstacle-chips .score-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.obs === id);
  });
  haptic && haptic();
};

export function saveDailySurvey() {
  const dateStr = window.currentDate;
  if (!state.surveys[dateStr]) state.surveys[dateStr] = {};
  const s = state.surveys[dateStr];
  s.evening = true;
  s.eveningTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  s.mental = s.mental || {};
  s.mental.productivity = +document.getElementById('d-prod').value;
  s.mental.meaning = +document.getElementById('d-meaning').value;
  s.emotions = s.emotions || {};
  s.emotions.anxiety = +document.getElementById('d-anx').value;
  s.physical = s.physical || {};
  s.physical.energy = +document.getElementById('d-energy').value;
  s.physical.sleepStart = document.getElementById('d-sleep-start').value || null;
  s.physical.sleepEnd = document.getElementById('d-sleep-end').value || null;
  s.physical.sleepHours = window.computeSleepHours ? window.computeSleepHours(s.physical.sleepStart, s.physical.sleepEnd) : null;
  s.physical.movement = parseFloat(document.getElementById('d-movement').value) || 0;

  s.reflection = s.reflection || {};
  s.reflection.gratitude = document.getElementById('d-gratitude').value.trim();
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

  state.weeklySurveys[wk] = {
    ...(state.weeklySurveys[wk] || {}),
    goal, progress, dreamStep, obstacle, wellbeing, lesson,
    ts: Date.now()
  };
  window.haptic('success'); window.playSound('success'); save(); window.closeSheet(); window.renderAll();
}
window.saveWeeklySurvey = saveWeeklySurvey;

window.openDailySurvey = openDailySurvey;
window.openWeeklySurvey = openWeeklySurvey;
window.openChangelog = openChangelog;
