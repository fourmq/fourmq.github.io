import { uid, ICONS, PALETTE, todayStr } from './utils.js';

export const SEED_KEY = 'cantilena_seed_v4', STORAGE = 'cantilena_v19'; // Обновил версию

export function migrateState(s) {
  s.surveys = s.surveys || {};
  s.weeklySurveys = s.weeklySurveys || {};
  s.theme = s.theme || 'auto';
  s.settings = s.settings || {};
  if (s.settings.haptics === undefined) s.settings.haptics = true;
  if (s.settings.sounds === undefined) s.settings.sounds = true;
  s.reminders = s.reminders || [
    { id: uid(), time: '09:00', text: 'Доброе утро! Время для привычек.', enabled: true },
    { id: uid(), time: '21:00', text: 'Как прошел день? Пора заполнить дневник.', enabled: true }
  ];
  s.moods = s.moods || {};
  s.supabase = s.supabase || { url: '', key: '', email: '', lastSync: null };
  s.habits = (s.habits || []).map((h, i) => {
    let icon = h.icon || 'sparkle';
    if (!ICONS[icon]) icon = 'sparkle';
    return { id: h.id || uid(), name: h.name || 'Привычка', icon: icon, color: h.color || PALETTE[i % PALETTE.length], target: h.target || 1, schedule: h.schedule || { type: 'daily' }, checks: h.checks || {}, skips: h.skips || {}, archived: h.archived || false, order: h.order != null ? h.order : i, createdAt: h.createdAt || Date.now() };
  });
  s.tasks = (s.tasks || []).map(t => ({ id: t.id || uid(), title: t.title || '', description: t.description || '', done: t.done || false, date: t.date || null, startTime: t.startTime || null, duration: t.duration || null, priority: t.priority || 4, projectId: t.projectId || null, subtasks: t.subtasks || [], tags: t.tags || [], recurrence: t.recurrence || null, completions: t.completions || {}, createdAt: t.createdAt || Date.now() }));
  s.projects = s.projects || [{ id: 1, name: 'Личное', color: '#007AFF' }];
  s.notes = (s.notes || []).map(n => ({ id: n.id || uid(), title: n.title || 'Без названия', body: n.body || '', folderId: n.folderId || null, pinned: n.pinned || false, createdAt: n.createdAt || Date.now(), updatedAt: n.updatedAt || Date.now() }));
  s.noteFolders = s.noteFolders || [{ id: 'default', name: 'Заметки', icon: '📝' }];
  if (s.taskFilter === 'inbox') s.taskFilter = 'all';
  s.taskFilter = s.taskFilter || 'today';
  s.taskAllFilter = s.taskAllFilter || 'active';
  s.selectedFolder = s.selectedFolder || 'all';
  s.dream = s.dream || { vision: '', markers: [], reviews: {}, createdAt: null, updatedAt: null };
  if (!Array.isArray(s.dream.markers)) s.dream.markers = [];
  if (!s.dream.reviews) s.dream.reviews = {};
  return s;
}

export function loadState() {
  let raw = null;
  for (const key of [STORAGE, 'cantilena_v18', 'cantilena_v17']) {
    try { const s = JSON.parse(localStorage.getItem(key)); if (s && Array.isArray(s.habits)) { raw = s; break; } } catch (e) {}
  }
  const s = migrateState(raw || {});
  if (!localStorage.getItem(SEED_KEY)) {
    const existing = new Set(s.habits.map(h => h.name));
    // Если привычек нет, добавим дефолтные (можно вынести в utils, но для скорости оставим тут)
    // ...
    localStorage.setItem(SEED_KEY, '1');
  }
  localStorage.setItem(STORAGE, JSON.stringify(s));
  return s;
}

export let state = loadState();
window.state = state;

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

export async function initSupabase() {
  if (!state.supabase.url || !state.supabase.key || !window.supabase) return;
  if (supabaseClient) return;
  try {
    supabaseClient = window.supabase.createClient(state.supabase.url, state.supabase.key);
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      currentUser = session.user;
      await pullFromCloud(true, false);
      startPolling();
    }
    supabaseClient.auth.onAuthStateChange(async (e, s) => {
      if (s) {
        currentUser = s.user;
        await pullFromCloud(true, false);
        startPolling();
        if (window.renderAll) window.renderAll();
      } else {
        currentUser = null;
        if (pollInterval) clearInterval(pollInterval);
      }
    });
  } catch (e) { console.warn(e); }
}

export function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    if (!currentUser || !supabaseClient || isPushing) return;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable) && active.value && active.value.length > 0) return;
    try {
      const { data, error } = await supabaseClient.from('cantilena_data').select('updated_at').eq('user_id', currentUser.id).maybeSingle();
      if (error || !data) return;
      if (new Date(data.updated_at).getTime() > lastCloudUpdate) await pullFromCloud(false, false);
    } catch (e) {}
  }, 5000);
}

export async function pullFromCloud(force = false, askBeforeOverwrite = false) {
  if (!currentUser || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('cantilena_data').select('*').eq('user_id', currentUser.id).maybeSingle();
    if (error) throw error;
    if (!data || !data.data || !data.data.habits) { await pushToCloud(); return; }
    if (force || new Date(data.updated_at).getTime() > lastCloudUpdate) {
      if (askBeforeOverwrite && !askedAboutOverwrite) {
        if ((state.habits && state.habits.length > 0) || (state.tasks && state.tasks.length > 0)) {
          if (!confirm('В облаке есть сохранённые данные.\n\nЗагрузить их?')) return;
          askedAboutOverwrite = true;
        }
      }
      window.state = migrateState(data.data);
      lastCloudUpdate = new Date(data.updated_at).getTime();
      localStorage.setItem(STORAGE, JSON.stringify(window.state));
      if (window.applyTheme) window.applyTheme();
      if (window.renderAll) window.renderAll();
    }
  } catch (e) {}
}

export async function pushToCloud() {
  if (!currentUser || !supabaseClient) return;
  isPushing = true;
  try {
    const nowISO = new Date().toISOString();
    await supabaseClient.from('cantilena_data').upsert({ user_id: currentUser.id, data: window.state, updated_at: nowISO }, { onConflict: 'user_id' });
    lastCloudUpdate = new Date(nowISO).getTime();
  } catch (e) {}
  finally { setTimeout(() => { isPushing = false; }, 2000); }
}

window.scheduleSync = function() {
  if (!currentUser || !supabaseClient) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushToCloud, 1500);
};

window.manualSyncWithUI = async function(btn) {
  const icon = btn.querySelector('.sync-icon');
  if (icon) icon.classList.add('spinning');
  await pullFromCloud(false, false);
  await pushToCloud();
  if (icon) icon.classList.remove('spinning');
  if (window.showToast) window.showToast('🔄 Данные обновлены');
};
