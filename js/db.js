import { uid, ICONS, PALETTE, todayStr } from './utils.js';

export const SEED_KEY = 'cantilena_seed_v4', STORAGE = 'cantilena_v18';

export function migrateState(s) {
  // ... Копируешь сюда функцию migrateState из старого app.js ...
  // И добавляешь s.tasks.forEach чтобы t.recurrence остался.
  return s;
}

export function loadState() {
  let raw = null;
  for (const key of [STORAGE, 'cantilena_v17']) {
    try { const s = JSON.parse(localStorage.getItem(key)); if (s && Array.isArray(s.habits)) { raw = s; break; } } catch (e) {}
  }
  const s = migrateState(raw || {});
  // Seed logic...
  return s;
}

export let state = loadState();
window.state = state; // Делаем доступным глобально для простоты

let saveIndicatorTimer;
export const save = () => {
  if (!state.supabase) state.supabase = {};
  state.supabase.lastSync = Date.now();
  localStorage.setItem(STORAGE, JSON.stringify(state));
  if (window.scheduleSync) window.scheduleSync();
  const ind = document.getElementById('save-indicator');
  if (ind) {
    ind.classList.add('show');
    clearTimeout(saveIndicatorTimer);
    saveIndicatorTimer = setTimeout(() => { ind.classList.remove('show'); }, 2000);
  }
};
window.save = save;

export let supabaseClient = null, syncTimer = null, currentUser = null, pollInterval = null;
export let lastCloudUpdate = 0, isPushing = false, askedAboutOverwrite = false;

// ... Сюда копируешь функции initSupabase, startPolling, pullFromCloud, pushToCloud, manualSyncWithUI, updateSyncStatus из старого app.js ...
// Вместо вызова renderAll(), используй window.renderAll() 
