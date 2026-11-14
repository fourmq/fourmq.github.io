import { escapeHtml, svgIcon, todayStr, DAILY_PROMPTS, CONTEXT_TAGS, APP_VERSION, CHANGELOG } from './utils.js';
import { state, save } from './db.js';

export let tempContextTags = [];

export function openDailySurvey() {
  const dateStr = window.currentDate;
  const s = state.surveys[dateStr] || {};
  const moods = state.moods[dateStr] || [];
  const avgMood = moods.length ? Math.round(moods.reduce((sum, m) => sum + m.val, 0) / moods.length) : 5;
  
  // Умный вопрос
  const todayPrompt = DAILY_PROMPTS[new Date(dateStr).getDate() % DAILY_PROMPTS.length];
  const gratitude = s.reflection?.gratitude || '';
  
  // Теги
  tempContextTags = s.contextTags || [];
  const tagsHtml = CONTEXT_TAGS.map(t => `
    <button type="button" onclick="toggleContextTag('${t.id}')" id="tag-${t.id}" 
      style="padding:8px 12px;border-radius:12px;border:1px solid ${tempContextTags.includes(t.id) ? 'var(--accent)' : 'var(--separator-med)'};background:${tempContextTags.includes(t.id) ? 'var(--accent-soft)' : 'var(--input-bg)'};color:${tempContextTags.includes(t.id) ? 'var(--accent)' : 'var(--text)'};font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .2s;">
      ${t.icon} ${t.label}
    </button>
  `).join('');

  window.openSheet(`
    <h2>Вечерний опрос</h2>
    <p style="font-size:13px;color:var(--text-sec);margin-bottom:16px;">Средний пульс: ${avgMood}/10</p>
    
    <!-- ... Слайдеры (энергия, тревога, смысл, продуктивность) ... -->
    <!-- ... Сон (лёг, встал) ... -->
    
    <div class="survey-section">Контекст дня</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">${tagsHtml}</div>

    <div class="survey-section">Рефлексия</div>
    <div class="field">
      <label style="color:var(--accent);font-size:14px;margin-bottom:8px;">${todayPrompt}</label>
      <textarea id="d-gratitude" placeholder="Твой ответ...">${escapeHtml(gratitude)}</textarea>
    </div>
    
    <div class="sheet-actions" style="display:flex;gap:8px;">
      <button class="btn-cancel" style="flex:1;margin:0;" onclick="window.closeSheet()">Отмена</button>
      <button class="btn-primary" style="flex:1;" onclick="saveDailySurvey()">Сохранить</button>
    </div>
  `);
}

window.toggleContextTag = function(id) {
  const btn = document.getElementById('tag-' + id);
  if (tempContextTags.includes(id)) {
    tempContextTags = tempContextTags.filter(t => t !== id);
    btn.style.background = 'var(--input-bg)';
    btn.style.borderColor = 'var(--separator-med)';
    btn.style.color = 'var(--text)';
  } else {
    tempContextTags.push(id);
    btn.style.background = 'var(--accent-soft)';
    btn.style.borderColor = 'var(--accent)';
    btn.style.color = 'var(--accent)';
  }
};

export function saveDailySurvey() {
  const dateStr = window.currentDate;
  if (!state.surveys[dateStr]) state.surveys[dateStr] = {};
  const s = state.surveys[dateStr];
  s.evening = true;
  // ... сохранение слайдеров ...
  s.reflection.gratitude = document.getElementById('d-gratitude').value.trim();
  s.contextTags = tempContextTags;
  
  window.haptic('success'); window.playSound('success'); save(); window.closeSheet(); window.renderAll();
}

// Экран Changelog
export function openChangelog() {
  const itemsHtml = CHANGELOG.map(c => `
    <div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-weight:700;font-size:16px;">Версия ${c.v}</span>
        <span style="font-size:12px;color:var(--text-sec);">${c.date}</span>
      </div>
      <div class="card tight" style="padding:8px 12px;">
        ${c.items.map(i => `<div style="font-size:14px;margin:4px 0;color:var(--text-sec);">• ${i}</div>`).join('')}
      </div>
    </div>
  `).join('');

  window.openSheet(`
    <h2>Что нового?</h2>
    <div style="margin-top:16px;">${itemsHtml}</div>
    <button class="btn-cancel" onclick="window.openSettings()">← Назад</button>
  `);
}

// Экспортируй сюда же openWeeklySurvey, saveWeeklySurvey, renderDreamCard, openDreamEditor и т.д.
