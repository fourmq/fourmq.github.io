export const APP_VERSION = '2.2.0';
export const CHANGELOG = [
  { v: '2.2.0', date: 'Сегодня', items: ['Переход на модули (файлы)', 'Помодоро-таймер', 'Повторяющиеся задачи', 'Умный дневник', 'Теги контекста'] }
];

export const DAILY_PROMPTS = [
  "За что ты сегодня благодарен судьбе?",
  "Что сегодня дало тебе энергию?",
  "Какой момент дня был самым приятным?",
  "Что ты сегодня сделал для своего будущего?",
  "За что ты можешь похвалить себя сегодня?",
  "Что было самым сложным и как ты это пережил?",
  "Что ты понял о себе сегодня?"
];

export const CONTEXT_TAGS = [
  { id: 'coffee', icon: '☕', label: 'Кофе' },
  { id: 'junk', icon: '🍔', label: 'Фастфуд' },
  { id: 'sport', icon: '🏃', label: 'Спорт' },
  { id: 'conflict', icon: '👥', label: 'Конфликт' },
  { id: 'weather', icon: '🌧', label: 'Погода' },
  { id: 'reading', icon: '📚', label: 'Чтение' }
];

export const todayStr = () => new Date().toISOString().slice(0, 10);
export const uid = () => Date.now() + Math.floor(Math.random() * 10000);
export const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const stripHtml = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export const hexToRgba = (hex, a) => { if (!hex) return `rgba(0,0,0,${a})`; const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; };

export const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const WEEKDAYS_LONG = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
export const formatDateHuman = ds => new Date(ds + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

export function haptic(t = 'light') {
  if (!window.state || !window.state.settings || !window.state.settings.haptics) return;
  if (!navigator.vibrate) return;
  try { if (t === 'success') navigator.vibrate([10, 40, 10]); else navigator.vibrate(8); } catch (e) {}
}

let toastTimer = null;
export function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

let audioCtx = null;
export function playSound(type) {
  if (!window.state || !window.state.settings || !window.state.settings.sounds) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    if (type === 'success') { osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1); gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3); }
    else { osc.type = 'sine'; osc.frequency.setValueAtTime(600, audioCtx.currentTime); gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1); }
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) {}
}

export const ICONS = {
  // ... Сюда вставляешь весь объект ICONS из предыдущего app.js ...
  // Для экономии места я не буду дублировать его здесь, скопируй из старого файла.
};

export function svgIcon(name, color = 'currentColor', size = 20) {
  const path = ICONS[name] || ICONS.sparkle;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

export const PALETTE = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#5AC8FA', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55'];
