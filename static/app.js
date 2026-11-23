/* iMAS · CRM менеджера — интерфейс в стиле imas.kz (чистый JS, без сборки) */
'use strict';

// ============ утилиты ============
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowSec = () => Math.floor(Date.now() / 1000);
const money = (v) => Number(v || 0).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
const short = (v) => { v = Number(v || 0); if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',') + ' млн ₸'; if (v >= 1e3) return Math.round(v / 1e3) + ' тыс ₸'; return v + ' ₸'; };
const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const m = n % 10; if (n > 10 && n < 20) return c; if (m > 1 && m < 5) return b; if (m === 1) return a; return c; };
const initials = (s) => (String(s || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
const hm = (ts) => new Date(ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000), n = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(n) - day(d)) / 86400000;
  if (diff === 0) return 'Сегодня, ' + hm(ts);
  if (diff === 1) return 'Вчера, ' + hm(ts);
  if (diff === -1) return 'Завтра, ' + hm(ts);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + hm(ts);
}
function fmtShort(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toDateString() === new Date().toDateString() ? hm(ts) : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function dayLabel(ts) {
  const d = new Date(ts * 1000), n = new Date(), y = new Date(); y.setDate(n.getDate() - 1);
  if (d.toDateString() === n.toDateString()) return 'Сегодня';
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

async function api(path, opts = {}) {
  const o = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: {} };
  if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  let r;
  try { r = await fetch('/api/' + path, o); } catch (e) { throw new Error('Нет связи с сервером сайта'); }
  let data = {};
  try { data = await r.json(); } catch (e) { /* пустой ответ */ }
  if (r.status === 401 && !['login', 'me', 'setup'].includes(path)) { S.me = null; route(); throw new Error('Требуется вход'); }
  if (!r.ok) throw new Error(data.error || ('Ошибка ' + r.status));
  return data;
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = (type === 'err' ? I.alert : type === 'ok' ? I.checkCircle : I.info) + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 7000 : 3500);
}

async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.html = btn.innerHTML; btn.innerHTML = '<span class="spinner sm"></span>' + esc(btn.textContent.trim()); }
  try { return await fn(); } catch (e) { toast(e.message, 'err'); } finally { if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.html; } }
}

function modal(title, bodyHtml, { okText = 'Сохранить', onOk, icon = I.plus } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="overlay"><div class="modal">
    <div class="mh"><span class="ico-box">${icon}</span><h3>${esc(title)}</h3><button class="x-btn" data-x title="Закрыть">${I.x}</button></div>
    <div class="mb">${bodyHtml}</div>
    <div class="mf"><button class="btn" data-x>Отмена</button>${onOk ? `<button class="btn primary" data-ok>${esc(okText)}</button>` : ''}</div>
  </div></div>`;
  const close = () => { root.innerHTML = ''; };
  $$('[data-x]', root).forEach((b) => b.onclick = close);
  $('.overlay', root).addEventListener('mousedown', (e) => { if (e.target.classList.contains('overlay')) close(); });
  const ok = $('[data-ok]', root);
  if (ok) ok.onclick = () => busy(ok, async () => { if ((await onOk(root)) !== false) close(); });
  const first = $('input, textarea, select', root);
  if (first) setTimeout(() => first.focus(), 30);
  return root;
}

const empty = (icon, title, text = '') => `<div class="empty"><div class="ill">${icon}</div><b>${esc(title)}</b>${text}</div>`;

// ============ иконки (собственный набор, линия 1.8) ============
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I = {
  grid: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="4.5" rx="1.8"/><rect x="13.5" y="11" width="7" height="9.5" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/>'),
  funnel: svg('<path d="M3.5 5h17l-6.5 7.6V19l-4 1.5v-7.9z"/>'),
  chat: svg('<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A1.5 1.5 0 0 1 4 15.5z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>'),
  check: svg('<path d="M5 12.5l4.2 4.2L19 7"/>'),
  checkCircle: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.6 2.6 4.9-5.2"/>'),
  tasks: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12.3l2.6 2.6L16 9.5"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4A7.6 7.6 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.6-1.5l2.4.9 2-3.4z"/>'),
  logout: svg('<path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14M10 16.5L5.5 12 10 7.5M5.5 12H15"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: svg('<path d="M14.5 6l-6 6 6 6"/>'),
  refresh: svg('<path d="M19.5 12a7.5 7.5 0 0 1-13.2 4.9M4.5 12A7.5 7.5 0 0 1 17.7 7.1"/><path d="M18 3.5v4h-4M6 20.5v-4h4"/>'),
  send: svg('<path d="M20.5 3.5L10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4z"/>'),
  spark: svg('<path d="M12 3.5l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  bot: svg('<rect x="4.5" y="8" width="15" height="11" rx="3.5"/><path d="M12 5v3M9.2 13h.01M14.8 13h.01M9.5 16h5"/><circle cx="12" cy="4" r="1"/>'),
  bulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.7.5 1 1.3 1 2.1h5c0-.8.3-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  pause: svg('<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>'),
  ext: svg('<path d="M13.5 4.5h6v6M19.5 4.5L11 13M17 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V9a1.5 1.5 0 0 1 1.5-1.5H11"/>'),
  copy: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>'),
  phone: svg('<path d="M6 4h3l1.6 4.2-2 1.3a10 10 0 0 0 5.9 5.9l1.3-2L20 15v3a2 2 0 0 1-2 2A14 14 0 0 1 4 6a2 2 0 0 1 2-2z"/>'),
  mail: svg('<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4 7l8 6 8-6"/>'),
  plug: svg('<path d="M9 3.5V8M15 3.5V8M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5v4"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  alert: svg('<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.5M12 17.3h.01"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'),
  note: svg('<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8.5h5M9 12.5h6.5M9 16h4.5"/>'),
  wallet: svg('<rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M3.5 10h17M16 14.5h.01"/>'),
  user: svg('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.8 3.9-6 7.5-6s6.7 2.2 7.5 6"/>'),
  users: svg('<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.6-3.3 3-5.3 6-5.3s5.4 2 6 5.3M15.5 5.5a3.3 3.3 0 0 1 0 6.3M17.5 14.6c1.8.7 3.1 2.4 3.5 4.9"/>'),
  flame: svg('<path d="M12 20.5c3.6 0 6-2.4 6-5.8 0-4.2-3.6-6.2-4.5-10.2-2.3 1.5-3.6 3.8-3.4 6.4-1-.6-1.7-1.6-1.9-2.8C6.8 9.6 6 11.6 6 14.7c0 3.4 2.4 5.8 6 5.8z"/>'),
  inbox: svg('<path d="M3.5 13.5l2.6-7.8A2 2 0 0 1 8 4.5h8a2 2 0 0 1 1.9 1.2l2.6 7.8v5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.5 13.5h5l1.2 2.5h4.6l1.2-2.5h5"/>'),
  pulse: svg('<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  sunrise: svg('<path d="M5 17a7 7 0 0 1 14 0M3 20.5h18M12 3.5v4M8.5 7l1 1.3M15.5 7l-1 1.3"/>'),
  later: svg('<path d="M5 12h12M13 7.5l4.5 4.5-4.5 4.5"/><path d="M20 5v14"/>'),
  tag: svg('<path d="M4 12.5V5.5A1.5 1.5 0 0 1 5.5 4h7l8 8-8.5 8.5z"/><circle cx="8.5" cy="8.5" r="1.3"/>'),
  draft: svg('<path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.5 18.5z"/><path d="M13.5 7.5l3 3"/>'),
};
const LOGO = `<svg width="38" height="38" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="16" stroke="#72c7ee" stroke-width="3" stroke-dasharray="76 25" stroke-linecap="round" transform="rotate(-30 20 20)"/><circle cx="20" cy="20" r="10" stroke="#1b95d0" stroke-width="3" stroke-dasharray="44 19" stroke-linecap="round" transform="rotate(150 20 20)"/><circle cx="20" cy="20" r="4.2" fill="#fff"/></svg>`;

const STATE_L = { new: 'Новый', exploring: 'Изучает', qualified: 'Квалифицирован', demo_requested: 'Хочет демо', demo_scheduled: 'Демо назначено', negotiation: 'Переговоры', ready_to_buy: 'Готов купить', postponed: 'Отложил', not_interested: 'Не интересно', existing_client: 'Текущий клиент', spam: 'Спам' };
const TEMP_L = { hot: 'Горячий', warm: 'Тёплый', cold: 'Холодный' };
const TEMP_C = { hot: '#d93f4c', warm: '#e59a1c', cold: '#1b95d0' };
const MODE = {
  auto: { l: 'ИИ отвечает', s: 'Авто', i: I.bot, c: '#12895f', d: 'n8n сам отвечает клиенту, оценивает лида и ставит задачи.' },
  copilot: { l: 'Подсказки', s: 'Подсказки', i: I.bulb, c: '#5b45c9', d: 'ИИ не пишет клиенту, только готовит черновики для вас (тег AI_DRAFT).' },
  off: { l: 'ИИ выключен', s: 'Выкл.', i: I.pause, c: '#d93f4c', d: 'ИИ не отвечает и не пишет черновики, сделку ведёт менеджер (тег AI_STOP).' },
};
const modeBadge = (m) => (m && MODE[m] ? `<span class="mode ${m}">${MODE[m].i}${MODE[m].l}</span>` : '');
const tempChip = (t) => (TEMP_L[t] ? `<span class="chip ${t}"><i></i>${TEMP_L[t]}</span>` : '');
function tagChip(t) {
  const T = S.settings?.crm?.tags || {};
  const l = t.toLowerCase();
  const map = { hot: 'hot', warm: 'warm', cold: 'cold', human: 'human', stop: 'ai-stop', draft: 'ai-draft' };
  const k = Object.keys(map).find((x) => (T[x] || '').toLowerCase() === l);
  return `<span class="chip ${k ? map[k] : ''}">${esc(t)}</span>`;
}

// ============ состояние и маршрутизация ============
const S = { me: null, meta: null, metaErr: '', settings: null, timers: [], leadsCache: null, pipelineId: null, badges: { chats: 0, tasks: 0 }, badgeTimer: null };

function clearTimers() { S.timers.forEach(clearInterval); S.timers = []; }
function every(ms, fn) { S.timers.push(setInterval(() => { if (!document.hidden) fn(); }, ms)); }

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', async () => {
  try { S.me = await api('me'); } catch (e) { S.me = null; }
  route();
});

async function route() {
  clearTimers();
  $('#modal-root').innerHTML = '';
  if (!S.me || !S.me.authed) return renderLogin();
  if (!S.settings) await loadBase();
  const [, view, id] = (location.hash || '#/desk').split('/');
  const views = { desk: viewDesk, leads: viewLeads, lead: viewLead, chats: viewChats, tasks: viewTasks, settings: viewSettings };
  (views[view] || viewDesk)(id);
}

async function loadBase() {
  try { S.settings = await api('settings'); } catch (e) { S.settings = { crm: { tags: {} }, _status: {} }; }
  await loadMeta();
  refreshBadges();
  if (!S.badgeTimer) S.badgeTimer = setInterval(() => { if (!document.hidden && S.me?.authed) refreshBadges(); }, 30000);
}
async function loadMeta(force) {
  try { S.meta = await api('amo/meta' + (force ? '?force=true' : '')); S.metaErr = ''; } catch (e) { S.meta = null; S.metaErr = e.message; }
  const pls = S.meta?.pipelines || [];
  let saved = 0;
  try { saved = Number(localStorage.getItem('pipeline')) || 0; } catch (e) { /* */ }
  saved = saved || Number(S.settings?.crm?.pipeline_id);
  S.pipelineId = (pls.find((p) => p.id === saved) || pls.find((p) => p.is_main) || pls[0] || {}).id || null;
}
const statusById = (id) => { for (const p of S.meta?.pipelines || []) for (const s of p.statuses) if (s.id === id) return { ...s, pipeline: p }; return null; };
const userName = (id) => (S.meta?.users || []).find((u) => u.id === id)?.name || '';

async function refreshBadges() {
  if (!S.meta) return;
  try {
    const [chats, tasks] = await Promise.all([api('chats'), api('tasks')]);
    S.badges.chats = chats.filter((c) => c.unread > 0).length;
    S.badges.tasks = tasks.filter((t) => t.complete_till < nowSec()).length;
    paintBadges();
  } catch (e) { /* amoCRM может быть недоступен */ }
}
function paintBadges() {
  for (const k of ['chats', 'tasks']) {
    const el = $(`.nav a[data-v="${k}"] .badge`);
    if (!el) continue;
    el.style.display = S.badges[k] ? '' : 'none';
    el.textContent = S.badges[k];
  }
}

// ============ вход ============
function renderLogin() {
  const setup = S.me?.needs_setup;
  $('#app').innerHTML = `<div class="login">
    <section class="hero"><div class="brand" style="padding:0">${LOGO}<div><div class="word">i<i>MAS</i></div><span class="tag">CRM менеджера</span></div></div>
      <div class="eyebrow">Рабочее место отдела продаж</div>
      <h2>Все клиенты и переписки — в одном окне.</h2>
      <p>Сделки и задачи из amoCRM, чаты из мессенджеров и подсказки ИИ-ассистента. Отвечайте быстрее и не теряйте обращения.</p>
      <div class="stats"><div><b>amoCRM</b><span>сделки и задачи</span></div><div><b>n8n</b><span>ИИ-ассистент</span></div><div><b>24/7</b><span>ответы клиентам</span></div></div>
    </section>
    <section class="pane"><form class="fade-in">
      <div class="eyebrow">${setup ? 'Первый запуск' : 'Вход'}</div>
      <h3>${setup ? 'Создайте пароль' : 'Добро пожаловать'}</h3>
      <p>${setup ? 'Пароль защитит доступ к amoCRM и переписке с клиентами.' : 'Введите пароль, чтобы продолжить.'}</p>
      <label class="field"><span>${setup ? 'Новый пароль' : 'Пароль'}</span><input class="input" type="password" name="pw" autocomplete="${setup ? 'new-password' : 'current-password'}" required></label>
      ${setup ? '<label class="field"><span>Повторите пароль</span><input class="input" type="password" name="pw2" autocomplete="new-password" required></label>' : ''}
      <button class="btn primary" style="width:100%;height:44px">${setup ? 'Создать пароль и войти' : 'Войти'}</button>
    </form></section></div>`;
  const f = $('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    busy($('button', f), async () => {
      if (setup && f.pw.value !== f.pw2.value) throw new Error('Пароли не совпадают');
      await api(setup ? 'setup' : 'login', { body: { password: f.pw.value } });
      S.me = await api('me');
      if (setup) location.hash = '#/settings/amo';
      route();
    });
  };
  setTimeout(() => f.pw.focus(), 50);
}

// ============ каркас ============
function shell(active, top, content) {
  if (!$('.shell')) {
    const nav = [['desk', 'Рабочий стол', I.grid], ['leads', 'Сделки', I.funnel], ['chats', 'Чаты', I.chat], ['tasks', 'Задачи', I.tasks]];
    $('#app').innerHTML = `<div class="shell">
      <aside class="side"><div class="brand">${LOGO}<div><div class="word">i<i>MAS</i></div><span class="tag">CRM менеджера</span></div></div>
        <nav class="nav"><div class="cap">Работа</div>
          ${nav.map(([k, l, i]) => `<a href="#/${k}" data-v="${k}">${i}<span>${l}</span><span class="badge" style="display:none"></span></a>`).join('')}
          <div class="cap">Система</div><a href="#/settings" data-v="settings">${I.gear}<span>Настройки</span></a></nav>
        <div class="foot"><div class="me"><div class="av">${esc(initials(S.meta?.account?.name || 'IMAS'))}</div>
          <div class="who"><b>${esc(S.meta?.account?.name || 'iMAS')}</b><span>${S.me?.demo ? 'демо-режим' : 'amoCRM подключён'}</span></div>
          <button data-logout title="Выйти">${I.logout}</button></div></div>
      </aside>
      <div class="main"><div id="demo"></div><header class="topbar" id="top"></header><div class="content" id="content"></div></div>
    </div>`;
    $('[data-logout]').onclick = async () => { await api('logout', { body: {} }); S.me = await api('me'); S.settings = null; route(); };
  }
  $$('.nav a[data-v]').forEach((a) => a.classList.toggle('active', a.dataset.v === active));
  $('#demo').innerHTML = S.me?.demo ? `<div class="demo-bar">${I.info}<span><b>Демо-режим.</b> Данные тестовые — можно спокойно освоиться.</span><a href="#/settings/amo">Подключить amoCRM →</a></div>` : '';
  $('#top').innerHTML = top;
  $('#content').innerHTML = content;
  $('#content').scrollTop = 0;
  paintBadges();
}
const title = (eyebrow, h) => `<div class="ttl"><span class="eyebrow">${esc(eyebrow)}</span><h1>${h}</h1></div>`;

function needAmo() {
  return `<div class="onboard fade-in">${empty(I.plug, 'amoCRM не подключён', `<p>${esc(S.metaErr || 'Подключите аккаунт amoCRM, чтобы видеть сделки, чаты и задачи.')}</p>`)}
    <a class="btn primary" href="#/settings/amo">Перейти к подключению</a></div>`;
}

// ============ графики (SVG) ============
const CH = { navy: '#032b58', cyan: '#1b95d0', grid: '#e8eef4', axis: '#9eb0c0' };

/** Площадной график с перекрестием и подсказкой. series: [{name,color,data,fill}] */
function areaChart(el, labels, series, h = 250) {
  const W = 760, H = h, pl = 34, pr = 12, pt = 14, pb = 28, n = labels.length;
  const max = Math.max(4, ...series.flatMap((s) => s.data));
  const top = Math.ceil(max / 4) * 4;
  const x = (i) => pl + (i * (W - pl - pr)) / (n - 1);
  const y = (v) => pt + (H - pt - pb) * (1 - v / top);
  const smooth = (pts) => pts.map((p, i) => {
    if (!i) return `M${p[0]},${p[1]}`;
    const [x0, y0] = pts[i - 1]; const cx = (x0 + p[0]) / 2;
    return `C${cx},${y0} ${cx},${p[1]} ${p[0]},${p[1]}`;
  }).join(' ');
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = (top / 4) * k;
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="${CH.grid}" ${k ? 'stroke-dasharray="3 4"' : ''}/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${CH.axis}">${v}</text>`;
  }
  labels.forEach((l, i) => { if ((n - 1 - i) % 2 === 0) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${CH.axis}">${esc(l)}</text>`; });
  const defs = series.map((s, si) => `<linearGradient id="ga${si}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="${s.fill ?? 0.18}"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`).join('');
  const paths = series.map((s, si) => {
    const line = smooth(s.data.map((v, i) => [x(i), y(v)]));
    return `<path d="${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#ga${si})"/><path d="${line}" fill="none" stroke="${s.color}" stroke-width="2.2"/>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="График активности"><defs>${defs}</defs>${g}${paths}
    <line class="cx" y1="${pt}" y2="${H - pb}" stroke="${CH.navy}" stroke-opacity=".3" stroke-dasharray="3 3" style="display:none"/>
    ${series.map((s, si) => `<circle class="pt pt${si}" r="5" fill="${s.color}" stroke="#fff" stroke-width="2" style="display:none"/>`).join('')}
    <rect x="${pl}" y="0" width="${W - pl - pr}" height="${H}" fill="transparent" class="hit"/></svg><div class="tip"></div>`;
  const svgEl = $('svg', el), tip = $('.tip', el), hit = $('.hit', el), cxl = $('.cx', el);
  hit.addEventListener('mousemove', (e) => {
    const r = svgEl.getBoundingClientRect(); const sx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((sx - pl) / (W - pl - pr)) * (n - 1))));
    cxl.setAttribute('x1', x(i)); cxl.setAttribute('x2', x(i)); cxl.style.display = '';
    series.forEach((s, si) => { const c = $('.pt' + si, el); c.setAttribute('cx', x(i)); c.setAttribute('cy', y(s.data[i])); c.style.display = ''; });
    tip.innerHTML = `<b>${esc(labels[i])}</b>` + series.map((s) => `<div><i style="background:${s.color}"></i>${esc(s.name)}: <strong>${s.data[i]}</strong></div>`).join('');
    tip.style.left = (x(i) / W) * r.width + 'px';
    tip.style.top = (Math.min(...series.map((s) => y(s.data[i]))) / H) * r.height + 'px';
    tip.style.opacity = 1;
  });
  hit.addEventListener('mouseleave', () => { tip.style.opacity = 0; cxl.style.display = 'none'; $$('.pt', el).forEach((c) => c.style.display = 'none'); });
}

/** Кольцевая диаграмма: items [{label,value,color}] */
function donut(items, size = 168, thick = 20) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const r = (size - thick) / 2, c = 2 * Math.PI * r, gap = items.filter((i) => i.value).length > 1 ? 3 : 0;
  let off = 0;
  const arcs = items.map((it) => {
    const len = total ? (it.value / total) * c : 0;
    const seg = Math.max(0, len - gap);
    const s = seg ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${thick}" stroke-dasharray="${seg} ${c - seg}" stroke-dashoffset="${-off}"><title>${esc(it.label)}: ${it.value}</title></circle>` : '';
    off += len; return s;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#eef3f8" stroke-width="${thick}"/>${arcs}</svg>`;
}

/** Мини-столбики для KPI */
function sparkBars(data, color = CH.cyan) {
  const W = 120, H = 34, n = data.length, step = W / n, max = Math.max(1, ...data);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${data.map((v, i) => { const h = Math.max(2, (v / max) * (H - 2)); return `<rect x="${i * step}" y="${H - h}" width="${step - 2}" height="${h}" rx="2" fill="${color}" opacity="${i === n - 1 ? 1 : 0.4}"><title>${v}</title></rect>`; }).join('')}</svg>`;
}

/** Кольцо прогресса (балл клиента) */
function ring(value, color = CH.cyan) {
  const r = 26, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="#eef3f8" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(v / 100) * c} ${c}"/></svg><b>${v}</b></div>`;
}

// ============ РАБОЧИЙ СТОЛ ============
async function viewDesk() {
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  shell('desk', `${title('Обзор', 'Рабочий стол')}<div class="grow"></div><button class="btn" id="rf">${I.refresh}Обновить</button>`, '<div class="spinner"></div>');
  $('#rf').onclick = () => viewDesk();
  if (!S.meta) { $('#content').innerHTML = needAmo(); return; }
  let d;
  try { d = await api('dashboard'); } catch (e) { $('#content').innerHTML = empty(I.alert, 'Не удалось загрузить данные', `<p>${esc(e.message)}</p>`); return; }
  const sr = d.series;
  const labels = sr.days.map((t) => new Date(t * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''));
  const answers = sr.bot.map((v, i) => v + sr.manager[i]);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const newWeek = sum(sr.new_leads.slice(-7));
  const p = (S.meta.pipelines || []).find((x) => x.id === S.pipelineId) || (S.meta.pipelines || [])[0];
  const stageList = (p?.statuses || []).filter((s) => d.stages[s.id]);
  const maxS = Math.max(1, ...stageList.map((s) => d.stages[s.id]));
  const maxM = Math.max(1, ...d.by_manager.map((m) => m.count));
  const t = d.temperature, tt = t.hot + t.warm + t.cold;
  const m = d.ai_modes, mt = m.auto + m.copilot + m.off;

  $('#content').innerHTML = `<div class="dash fade-in">
    <div class="hello"><div><div class="eyebrow">${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <h2>${hello}!</h2><p>${d.active} ${plural(d.active, 'активная сделка', 'активные сделки', 'активных сделок')} на сумму ${money(d.active_sum)}${d.overdue ? ` · <b style="color:var(--red)">${d.overdue} ${plural(d.overdue, 'просроченная задача', 'просроченные задачи', 'просроченных задач')}</b>` : ''}</p></div>
      <div class="row"><a class="btn" href="#/chats">${I.chat}Открыть чаты</a><a class="btn primary" href="#/leads">${I.funnel}К воронке</a></div></div>

    <div class="kpis">
      <div class="kpi" data-go="#/leads"><div class="top"><span class="lbl">Активные сделки</span><span class="ico-box navy">${I.wallet}</span></div>
        <div class="val">${d.active}</div><div class="foot"><span class="pill ${newWeek ? 'up' : ''}">+${newWeek} за 7 дней</span>${sparkBars(sr.new_leads, CH.navy)}</div></div>
      <div class="kpi" data-go="#/tasks"><div class="top"><span class="lbl">Просроченные задачи</span><span class="ico-box ${d.overdue ? 'red' : 'green'}">${I.clock}</span></div>
        <div class="val" style="color:${d.overdue ? 'var(--red)' : 'inherit'}">${d.overdue}</div><div class="foot"><span class="pill ${d.overdue ? 'bad' : 'up'}">${d.overdue ? 'требуют внимания' : 'всё в срок'}</span><span class="small muted">из ${d.todo} открытых</span></div></div>
      <div class="kpi" data-go="#/chats"><div class="top"><span class="lbl">Сообщений клиентов</span><span class="ico-box">${I.chat}</span></div>
        <div class="val">${sum(sr.client.slice(-7))}</div><div class="foot"><span class="pill ok">за 7 дней</span>${sparkBars(sr.client, CH.cyan)}</div></div>
      <div class="kpi" data-go="#/leads"><div class="top"><span class="lbl">Сделок без задач</span><span class="ico-box amber">${I.alert}</span></div>
        <div class="val">${d.leads_without_tasks}</div><div class="foot"><span class="pill">${short(d.leads_without_tasks_sum)}</span><span class="small muted">выполнено за неделю: ${d.done_week}</span></div></div>
    </div>

    <div class="dgrid">
      <div class="panel span-8"><div class="panel-h"><span class="ico-box">${I.pulse}</span><div><h3>Активность в чатах</h3><div class="sub">Сообщения за 14 дней по данным n8n</div></div><div class="grow"></div>
        <div class="legend"><span><i style="background:${CH.cyan}"></i>Клиенты · ${sum(sr.client)}</span><span><i style="background:${CH.navy}"></i>Ответы ИИ и менеджеров · ${sum(answers)}</span></div></div>
        <div class="panel-b"><div class="chart" id="act"></div></div></div>

      <div class="panel span-4"><div class="panel-h"><span class="ico-box">${I.bot}</span><div><h3>Режим ИИ по сделкам</h3><div class="sub">Переключается тегами</div></div></div>
        <div class="panel-b" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
          <div style="position:relative">${donut(['auto', 'copilot', 'off'].map((k) => ({ label: MODE[k].l, value: m[k], color: MODE[k].c })))}
            <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center"><div><div style="font-size:30px;font-weight:800">${mt}</div><div class="small muted">${plural(mt, 'сделка', 'сделки', 'сделок')}</div></div></div></div>
          <div style="flex:1;min-width:140px">${['auto', 'copilot', 'off'].map((k) => `<div class="row" style="justify-content:space-between;margin-bottom:12px"><span class="row" style="gap:8px"><span class="dot" style="background:${MODE[k].c};width:10px;height:10px;border-radius:3px"></span>${MODE[k].l}</span><b>${m[k]}</b></div>`).join('')}</div>
        </div></div>

      <div class="panel span-5"><div class="panel-h"><span class="ico-box navy">${I.funnel}</span><div><h3>Воронка продаж</h3><div class="sub">${esc(p?.name || '')} · активные сделки по этапам</div></div></div>
        <div class="panel-b">${stageList.map((s) => `<div class="funnel-row"><span class="nm" title="${esc(s.name)}">${esc(s.name)}</span><span class="tr"><i style="width:${(d.stages[s.id] / maxS) * 100}%"></i></span><span class="n">${d.stages[s.id]}</span></div>`).join('') || '<div class="muted">Нет активных сделок</div>'}</div></div>

      <div class="panel span-4"><div class="panel-h"><span class="ico-box navy">${I.users}</span><div><h3>Менеджеры</h3><div class="sub">Сделки в работе</div></div></div>
        <div class="panel-b">${d.by_manager.map((x) => `<div class="leader"><span class="av">${esc(initials(x.name))}</span><div class="nm"><b>${esc(x.name)}</b><div class="bar"><i style="width:${(x.count / maxM) * 100}%"></i></div></div>
          <div class="sum"><b>${x.count} ${plural(x.count, 'сделка', 'сделки', 'сделок')}</b>${short(x.sum)}</div></div>`).join('') || '<div class="muted">Нет данных</div>'}</div></div>

      <div class="panel span-3"><div class="panel-h"><span class="ico-box red">${I.flame}</span><div><h3>Температура</h3><div class="sub">Оценка ИИ</div></div></div>
        <div class="panel-b"><div class="stack">${tt ? ['hot', 'warm', 'cold'].filter((k) => t[k]).map((k) => `<i style="flex:${t[k]};background:${TEMP_C[k]}" title="${TEMP_L[k]}: ${t[k]}"></i>`).join('') : '<i style="flex:1;background:#eef3f8"></i>'}</div>
          ${['hot', 'warm', 'cold'].map((k) => `<div class="row" style="justify-content:space-between;margin-bottom:8px"><span class="row" style="gap:8px"><span class="dot" style="background:${TEMP_C[k]}"></span>${TEMP_L[k]}</span><b>${t[k]}</b></div>`).join('')}
          <div class="small muted">без оценки: ${t['']}</div></div></div>

      <div class="panel span-12"><div class="panel-h"><span class="ico-box amber">${I.alert}</span><div><h3>Требуют внимания</h3><div class="sub">Клиенту нужен менеджер или лид горячий</div></div>${d.needs_human ? `<span class="badge">${d.needs_human}</span>` : ''}</div>
        <div class="panel-b attn" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:0 28px">${d.attention.map((l) => `<a href="#/lead/${l.id}"><span class="dot" style="background:${l.needs_human ? '#e59a1c' : TEMP_C[l.temperature] || CH.cyan}"></span><span class="nm">${esc(l.name)}</span>${l.needs_human ? '<span class="chip human">нужен менеджер</span>' : tempChip(l.temperature)}<span class="small muted">${l.price ? short(l.price) : ''}</span></a>`).join('') || '<div class="muted">Сейчас всё спокойно — срочных клиентов нет.</div>'}</div></div>
    </div></div>`;
  areaChart($('#act'), labels, [
    { name: 'Клиенты', color: CH.cyan, data: sr.client, fill: 0.22 },
    { name: 'Ответы', color: CH.navy, data: answers, fill: 0.08 },
  ]);
  $$('[data-go]').forEach((el) => el.onclick = () => location.hash = el.dataset.go);
}

// ============ СДЕЛКИ (воронка) ============
async function viewLeads() {
  const pls = S.meta?.pipelines || [];
  shell('leads', `${title('Продажи', 'Сделки')}
    ${pls.length > 1 ? `<select class="select" id="pl" style="width:auto;max-width:240px">${pls.map((p) => `<option value="${p.id}" ${p.id === S.pipelineId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
    <label class="search">${I.search}<input class="input" id="q" placeholder="Название, контакт, телефон или ID"></label>
    <div class="grow"></div><span class="count" id="cnt"></span>
    <button class="btn icon" id="rf" title="Обновить">${I.refresh}</button><button class="btn primary" id="add">${I.plus}Новая сделка</button>`, '<div class="spinner"></div>');
  if (!S.meta) { $('#content').innerHTML = needAmo(); return; }
  if ($('#pl')) $('#pl').onchange = (e) => { S.pipelineId = Number(e.target.value); try { localStorage.setItem('pipeline', S.pipelineId); } catch (er) { /* */ } loadBoard(); };
  let tmo;
  $('#q').oninput = () => { clearTimeout(tmo); tmo = setTimeout(paintBoard, 150); };
  $('#rf').onclick = () => loadBoard();
  $('#add').onclick = () => newLeadModal();
  await loadBoard();
  every(30000, () => loadBoard(true));
}

async function loadBoard(silent) {
  try { S.leadsCache = await api('leads' + (S.pipelineId ? '?pipeline_id=' + S.pipelineId : '')); paintBoard(); }
  catch (e) { if (!silent) $('#content').innerHTML = empty(I.alert, 'Не удалось загрузить сделки', `<p>${esc(e.message)}</p>`); }
}

function paintBoard() {
  const p = (S.meta.pipelines || []).find((x) => x.id === S.pipelineId);
  if (!p || !S.leadsCache || !$('#cnt')) return;
  const q = ($('#q')?.value || '').toLowerCase().trim();
  const leads = S.leadsCache.filter((l) => !q || [l.name, l.contact?.name, String(l.id), ...(l.contact?.phones || []), ...l.tags].some((x) => String(x || '').toLowerCase().includes(q)));
  const statuses = p.statuses.filter((s) => s.type !== 1 || leads.some((l) => l.status_id === s.id));
  const open = leads.filter((l) => ![142, 143].includes(l.status_id));
  $('#cnt').textContent = `${open.length} ${plural(open.length, 'сделка', 'сделки', 'сделок')} · ${money(open.reduce((a, l) => a + l.price, 0))}`;
  const sc = $('#content').scrollLeft;
  $('#content').innerHTML = `<div class="board">${statuses.map((s) => {
    const ls = leads.filter((l) => l.status_id === s.id);
    const color = s.id === 143 ? '#9eb0c0' : s.id === 142 ? '#12895f' : (s.color || CH.cyan);
    const closed = s.type === 1 || s.id === 142 || s.id === 143;
    return `<div class="col" style="--c:${color}"><div class="col-head"><div class="t"><span class="dot" style="background:${color}"></span><span>${esc(s.name)}</span><span class="n">${ls.length}</span></div>
      <div class="s">${money(ls.reduce((a, l) => a + l.price, 0))}</div><div class="ln"></div></div>
      <div class="col-body" data-status="${s.id}">${closed ? '' : `<button class="col-add" data-add="${s.id}">${I.plus}Добавить</button>`}${ls.map(cardHtml).join('')}</div></div>`;
  }).join('')}</div>`;
  $('#content').scrollLeft = sc;
  $$('.card').forEach((c) => {
    c.onclick = () => location.hash = '#/lead/' + c.dataset.id;
    c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); };
    c.ondragend = () => c.classList.remove('dragging');
  });
  $$('.col-body').forEach((b) => {
    b.ondragover = (e) => { e.preventDefault(); b.classList.add('drop'); };
    b.ondragleave = () => b.classList.remove('drop');
    b.ondrop = async (e) => {
      e.preventDefault(); b.classList.remove('drop');
      const id = Number(e.dataTransfer.getData('text/plain')), st = Number(b.dataset.status);
      const l = S.leadsCache.find((x) => x.id === id);
      if (!l || l.status_id === st) return;
      const old = l.status_id; l.status_id = st; paintBoard();
      try { await api('leads/' + id, { method: 'PATCH', body: { status_id: st, pipeline_id: S.pipelineId } }); toast(`«${l.name}» → ${statusById(st)?.name}`, 'ok'); }
      catch (err) { l.status_id = old; paintBoard(); toast(err.message, 'err'); }
    };
  });
  $$('[data-add]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); newLeadModal(Number(b.dataset.add)); });
}

function cardHtml(l) {
  const tags = l.tags.filter((t) => !/^AI: (горячий|тёплый|холодный)$/i.test(t));
  return `<div class="card" draggable="true" data-id="${l.id}">
    <div class="c-top"><span>#${l.id}</span>${l.temperature ? tempChip(l.temperature) : `<span>${fmtShort(l.updated_at)}</span>`}</div>
    <div class="c-name">${esc(l.name)}</div>
    <div class="c-who"><span class="av">${esc(initials(l.contact?.name))}</span>${esc(l.contact?.name || 'Без контакта')}</div>
    <div class="c-bottom"><span class="c-price">${l.price ? money(l.price) : '<span class="dim">без бюджета</span>'}</span>${l.ai_mode !== 'auto' ? modeBadge(l.ai_mode) : ''}</div>
    ${tags.length ? `<div class="c-tags" style="margin-top:8px">${tags.slice(0, 3).map(tagChip).join('')}</div>` : ''}
  </div>`;
}

function newLeadModal(statusId) {
  const p = (S.meta?.pipelines || []).find((x) => x.id === S.pipelineId);
  const sts = (p?.statuses || []).filter((s) => s.type !== 1 && s.id !== 142 && s.id !== 143);
  modal('Новая сделка', `
    <label class="field"><span>Название сделки</span><input class="input" name="name" placeholder="Например: Акимат — мониторинг СМИ"></label>
    <div class="grid2"><label class="field"><span>Бюджет, ₸</span><input class="input" name="price" type="number" min="0" placeholder="0"></label>
    <label class="field"><span>Этап</span><select class="select" name="status">${sts.map((s) => `<option value="${s.id}" ${s.id === statusId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></div>
    <div class="grid2"><label class="field"><span>Контакт</span><input class="input" name="contact" placeholder="Имя клиента"></label>
    <label class="field"><span>Телефон</span><input class="input" name="phone" placeholder="+7 7__ ___ __ __"></label></div>`,
  { okText: 'Создать сделку', icon: I.funnel, onOk: async (r) => {
    const v = (n) => $(`[name=${n}]`, r).value.trim();
    const res = await api('leads', { body: { name: v('name'), price: Number(v('price')) || 0, status_id: Number(v('status')) || null, pipeline_id: S.pipelineId || null, contact_name: v('contact'), phone: v('phone') } });
    toast('Сделка создана', 'ok');
    location.hash = '#/lead/' + res.id;
  } });
}

// ============ ЛЕНТА + КОМПОЗЕР (общие для сделки и чатов) ============
function feedHtml(L) {
  const tl = L.timeline || [];
  const open = (L.tasks || []).filter((t) => !t.is_completed).sort((a, b) => a.complete_till - b.complete_till);
  let html = open.map((t) => `<div class="task-pin ${t.complete_till < nowSec() ? 'overdue' : ''}"><span class="ico-box ${t.complete_till < nowSec() ? 'red' : 'amber'}">${I.clock}</span>
      <div class="tx"><div class="when">${t.complete_till < nowSec() ? 'Просрочено · ' : ''}${fmtTime(t.complete_till)}${t.responsible_user_id ? ' · ' + esc(userName(t.responsible_user_id)) : ''}</div>${esc(t.text)}</div>
      <button class="btn sm success" data-done="${t.id}">${I.check}Выполнить</button></div>`).join('');
  if (!tl.length) html += empty(I.chat, 'Переписки пока нет', '<p class="small">Сообщения появятся, когда n8n запишет их в примечания сделки.</p>');
  let lastDay = '';
  const cname = L.contact?.name || 'Клиент';
  for (const n of tl) {
    const d = dayLabel(n.at);
    if (d !== lastDay) { html += `<div class="day"><span>${d}</span></div>`; lastDay = d; }
    const time = hm(n.at);
    if (n.kind === 'client') {
      html += `<div class="msg"><div class="av">${esc(initials(cname))}</div><div><div class="meta">${esc(cname)} · ${time}</div><div class="bubble">${esc(n.text)}</div></div></div>`;
    } else if (n.kind === 'bot' || n.kind === 'manager') {
      const bot = n.kind === 'bot';
      const who = bot ? 'ИИ-ассистент' : (userName(n.created_by) || 'Менеджер');
      html += `<div class="msg out ${bot ? 'bot' : ''}"><div class="av">${bot ? I.bot.replace('<svg', '<svg width="18" height="18"') : esc(initials(who))}</div><div><div class="meta">${esc(who)} · ${time}</div><div class="bubble">${esc(n.text)}</div></div></div>`;
    } else if (n.kind === 'state') {
      const st = n.state || {};
      html += `<div class="sys state"><div class="meta">${I.spark} ИИ обновил оценку клиента · ${time}<span style="margin-left:auto">${tempChip(st.temp)}<span class="chip">${esc(STATE_L[st.state] || st.state || '')}</span>${st.score ? `<span class="chip">${esc(st.score)}/100</span>` : ''}</span></div>${esc(n.text.split('\n').filter((x) => !x.startsWith('📊')).join('\n'))}</div>`;
    } else if (n.kind === 'draft') {
      html += `<div class="sys draft"><div class="meta">${I.draft} Черновик ИИ — клиенту не отправлен · ${time}</div>${esc(n.text.replace(/^💡[^\n]*\n/, ''))}
        <div class="actions"><button class="btn sm soft" data-use="${n.id}">${I.copy}Использовать черновик</button></div></div>`;
    } else if (n.kind === 'control') {
      html += `<div class="sys control">${esc(n.text)} · ${time}</div>`;
    } else {
      html += `<div class="sys"><div class="meta">${I.note} Примечание${userName(n.created_by) ? ' · ' + esc(userName(n.created_by)) : ''} · ${time}</div>${esc(n.text)}</div>`;
    }
  }
  return html;
}

function composerHtml(L) {
  const st = S.settings?._status || {};
  const n8n = S.settings?.n8n?.console_url;
  return `<div class="composer">
    <div class="tabs"><button class="on" data-tab="chat">${I.chat}Сообщение клиенту</button><button data-tab="note">${I.note}Примечание</button><button data-tab="task">${I.clock}Задача</button><span class="grow"></span>
      <span class="hint">${L.ai_mode === 'auto' ? 'После вашего ответа ИИ уступит диалог на ' + (S.settings?.crm?.takeover_minutes || 60) + ' мин' : ''}</span></div>
    <div data-pane="chat"><textarea class="input" id="msg" placeholder="Напишите сообщение клиенту…"></textarea>
      <div class="bar2">${n8n ? `<button class="btn soft" id="aiHelp" title="ИИ улучшит ваш текст или напишет сообщение по инструкции">${I.spark}ИИ-помощник</button>` : ''}
        <span class="grow"></span>
        ${st.send ? '<span class="hint">Ctrl + Enter — отправить</span>' : `<span class="hint" style="color:var(--amber)">Отправка не настроена · <a href="#/settings/sending">настроить</a></span>`}
        <button class="btn primary" id="send">${I.send}Отправить</button></div></div>
    <div data-pane="note" style="display:none"><textarea class="input" id="note" placeholder="Примечание видно только сотрудникам"></textarea>
      <div class="bar2"><span class="grow"></span><button class="btn primary" id="saveNote">${I.note}Сохранить примечание</button></div></div>
    <div data-pane="task" style="display:none">
      <div class="row" style="margin-bottom:10px"><select class="select" id="tWhen" style="width:230px"><option value="3600">Через час</option><option value="eod">Сегодня до конца дня</option><option value="tom">Завтра в 10:00</option><option value="week">Через неделю</option><option value="custom">Выбрать дату…</option></select>
      <input class="input" type="datetime-local" id="tDate" style="width:230px;display:none"></div>
      <textarea class="input" id="tText" style="min-height:56px" placeholder="Что сделать: например, «Позвонить и уточнить по КП»"></textarea>
      <div class="bar2"><span class="grow"></span><button class="btn primary" id="saveTask">${I.clock}Поставить задачу</button></div></div>
  </div>`;
}

function bindLeadUI(root, L, reload) {
  $$('.composer [data-tab]', root).forEach((b) => b.onclick = () => {
    $$('.composer [data-tab]', root).forEach((x) => x.classList.toggle('on', x === b));
    $$('.composer [data-pane]', root).forEach((p) => p.style.display = p.dataset.pane === b.dataset.tab ? '' : 'none');
  });
  const msg = $('#msg', root);
  const draftKey = 'draft:' + L.id;
  try { if (!msg.value) msg.value = localStorage.getItem(draftKey) || ''; } catch (e) { /* */ }
  msg.oninput = () => { try { localStorage.setItem(draftKey, msg.value); } catch (e) { /* */ } };
  const sendBtn = $('#send', root);
  const send = () => busy(sendBtn, async () => {
    await api(`leads/${L.id}/send`, { body: { text: msg.value } });
    msg.value = ''; msg.oninput();
    toast('Сообщение отправлено клиенту', 'ok');
    await reload();
  });
  sendBtn.onclick = send;
  if ($('#aiHelp', root)) $('#aiHelp', root).onclick = () => aiAssistant(L, msg, reload);
  msg.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };
  $('#saveNote', root).onclick = (e) => busy(e.currentTarget, async () => {
    await api(`leads/${L.id}/note`, { body: { text: $('#note', root).value } });
    $('#note', root).value = ''; toast('Примечание сохранено', 'ok'); await reload();
  });
  $('#tWhen', root).onchange = (e) => { $('#tDate', root).style.display = e.target.value === 'custom' ? '' : 'none'; };
  $('#saveTask', root).onclick = (e) => busy(e.currentTarget, async () => {
    const w = $('#tWhen', root).value; const d = new Date();
    let ts;
    if (w === 'eod') { d.setHours(23, 59, 0, 0); ts = d / 1000; }
    else if (w === 'tom') { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); ts = d / 1000; }
    else if (w === 'week') ts = nowSec() + 7 * 86400;
    else if (w === 'custom') { const v = $('#tDate', root).value; if (!v) throw new Error('Выберите дату'); ts = new Date(v) / 1000; }
    else ts = nowSec() + Number(w);
    await api('tasks', { body: { lead_id: L.id, text: $('#tText', root).value || 'Связаться с клиентом', complete_till: Math.floor(ts), responsible_user_id: L.responsible_user_id || null } });
    $('#tText', root).value = ''; toast('Задача поставлена', 'ok'); await reload(); refreshBadges();
  });
  $$('[data-done]', root).forEach((b) => b.onclick = () => completeTask(Number(b.dataset.done), reload));
  $$('[data-use]', root).forEach((b) => b.onclick = () => {
    const n = L.timeline.find((x) => x.id === Number(b.dataset.use));
    msg.value = n.text.replace(/^💡[^\n]*\n/, ''); msg.oninput();
    $('.composer [data-tab=chat]', root).click(); msg.focus();
  });
}

function contactInfoHtml(L) {
  const cs = L.contacts || [];
  if (!cs.length) return empty(I.user, 'Контакт не привязан', '<p class="small">Привяжите контакт к сделке в amoCRM — здесь появятся телефон, почта и другие данные.</p>');
  const row = (icon, label, val, href) => `<div class="ci-row"><span class="ci-ico">${icon}</span><div class="ci-v"><small>${label}</small>${href ? `<a href="${esc(href)}">${esc(val)}</a>` : `<span>${esc(val)}</span>`}</div><button class="btn sm icon" data-copy="${esc(val)}" title="Копировать">${I.copy}</button></div>`;
  return cs.map((c) => `<div class="ci-card">
    <div class="ci-head"><span class="av lg">${esc(initials(c.name))}</span><div style="flex:1;min-width:0"><b>${esc(c.name || 'Без имени')}</b>
      <div class="small muted">Контакт #${c.id}${c.companies?.length ? ' · ' + esc(c.companies.join(', ')) : ''}</div></div>
      ${S.meta?.link ? `<a class="btn sm" href="${esc(S.meta.link)}/contacts/detail/${c.id}" target="_blank" rel="noopener">${I.ext}В amoCRM</a>` : ''}</div>
    ${c.phones.map((p) => row(I.phone, 'Телефон', p, 'tel:' + p)).join('')}
    ${c.emails.map((e) => row(I.mail, 'Почта', e, 'mailto:' + e)).join('')}
    ${(c.fields || []).map((f) => row(I.info, esc(f.name), f.value)).join('')}
    ${!c.phones.length && !c.emails.length && !(c.fields || []).length ? '<div class="dim small" style="padding:8px 0">Телефон и почта не указаны</div>' : ''}
    <div class="kv" style="margin-top:12px">
      ${userName(c.responsible_user_id) ? `<span class="k">Ответственный</span><span class="v">${esc(userName(c.responsible_user_id))}</span>` : ''}
      ${c.created_at ? `<span class="k">Создан</span><span class="v">${fmtTime(c.created_at)}</span>` : ''}
      ${c.tags?.length ? `<span class="k">Теги</span><span class="v">${c.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</span>` : ''}
    </div></div>`).join('');
}

const AI_ACTIONS = [
  { k: 'polish', t: 'Улучшить мой текст', d: 'ИИ поправит и переведёт на язык клиента, затем отправит', ph: 'Ваш черновик сообщения клиенту' },
  { k: 'write_send', t: 'Написать и отправить', d: 'ИИ напишет сообщение по вашей инструкции и сразу отправит', ph: 'Например: напомни про демо, предложи четверг 15:00' },
  { k: 'write_draft', t: 'Только черновик', d: 'ИИ напишет сообщение и сохранит его в чат как черновик, без отправки', ph: 'Например: ответь на вопрос о цене, мягко' },
  { k: 'send', t: 'Отправить как есть', d: 'Текст уйдёт клиенту без изменений', ph: 'Сообщение клиенту' },
];

function aiAssistant(L, msg, reload) {
  let act = msg.value.trim() ? 'polish' : 'write_send';
  const body = `<div class="ai-lead">${I.funnel}<span>Сделка <b>#${L.id}</b>${L.name && !String(L.name).includes(String(L.id)) ? ' · ' + esc(L.name) : ''}</span></div>
    <div class="ai-acts">${AI_ACTIONS.map((a) => `<button type="button" class="ai-act" data-act="${a.k}"><b>${a.t}</b><small>${a.d}</small></button>`).join('')}</div>
    <label class="field"><span id="aiLbl">Текст</span><textarea class="input" name="aiText" style="min-height:96px">${esc(msg.value)}</textarea>
      <small>Ctrl + Enter — выполнить</small></label>`;
  const root = modal('ИИ-помощник', body, {
    okText: 'Выполнить', icon: I.spark, onOk: async (r) => {
      const text = $('[name=aiText]', r).value;
      await api(`leads/${L.id}/assistant`, { body: { action: act, text } });
      if (act !== 'write_draft' && msg.value.trim()) { msg.value = ''; msg.oninput(); }
      toast(act === 'write_draft' ? 'Черновик появится в чате через несколько секунд' : 'n8n отправит сообщение клиенту через несколько секунд', 'ok');
      setTimeout(() => reload(), 5000);
    },
  });
  const ta = $('[name=aiText]', root);
  const sync = () => {
    const a = AI_ACTIONS.find((x) => x.k === act);
    $$('[data-act]', root).forEach((b) => b.classList.toggle('on', b.dataset.act === act));
    $('#aiLbl', root).textContent = act.startsWith('write') ? 'Инструкция для ИИ' : 'Текст сообщения';
    ta.placeholder = a.ph;
  };
  $$('[data-act]', root).forEach((b) => b.onclick = () => { act = b.dataset.act; sync(); ta.focus(); });
  ta.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('[data-ok]', root).click(); } };
  sync();
  setTimeout(() => ta.focus(), 40);
}

function completeTask(id, after) {
  modal('Завершить задачу', `<label class="field"><span>Результат</span><textarea class="input" name="res" placeholder="Например: созвонились, отправил КП"></textarea></label>`, {
    okText: 'Выполнить', icon: I.checkCircle, onOk: async (r) => {
      await api(`tasks/${id}/complete`, { body: { result: $('[name=res]', r).value } });
      toast('Задача выполнена', 'ok'); refreshBadges(); if (after) await after();
    },
  });
}

function modeSeg(L) {
  return `<div class="seg">${['auto', 'copilot', 'off'].map((k) => `<button class="${k} ${L.ai_mode === k ? 'on' : ''}" data-mode="${k}" title="${MODE[k].d}">${MODE[k].i}${MODE[k].s}</button>`).join('')}</div>`;
}
function aiPanelHtml(L) {
  const st = L.ai_state || {};
  return `<div class="ai-card">${modeSeg(L)}<div class="hint">${MODE[L.ai_mode]?.d || ''}</div>
    ${st.state ? `<div class="ai-state">${ring(st.score, TEMP_C[st.temperature] || CH.cyan)}<div class="st"><b>${esc(STATE_L[st.state] || st.state)}</b><span>вероятность покупки, из 100</span><div style="margin-top:6px">${tempChip(st.temperature)}${st.needs_human ? '<span class="chip human">нужен менеджер</span>' : ''}</div></div></div>
      ${L.ai_state_text ? `<div class="ai-sum">${esc(L.ai_state_text)}</div>` : ''}`
    : '<div class="ai-sum" style="margin-top:12px">Оценки пока нет — она появится, когда n8n обработает сообщения клиента.</div>'}</div>`;
}
function bindAiPanel(root, L, reload) {
  $$('[data-mode]', root).forEach((b) => b.onclick = () => {
    const m = b.dataset.mode;
    if (m === L.ai_mode) return;
    busy(b, async () => { await api(`leads/${L.id}/ai-mode`, { body: { mode: m } }); toast('Режим ИИ: ' + MODE[m].l, 'ok'); await reload(); });
  });
}
const changed = (a, b) => JSON.stringify([a.timeline.length, a.tags, a.status_id, a.tasks.length, a.name, a.price]) !== JSON.stringify([b.timeline.length, b.tags, b.status_id, b.tasks.length, b.name, b.price]);

// ============ КАРТОЧКА СДЕЛКИ ============
async function viewLead(id) {
  shell('leads', title('Сделка', 'Загрузка…'), '<div class="spinner"></div>');
  if (!S.meta) { $('#content').innerHTML = needAmo(); return; }
  let L;
  const load = async () => { L = await api('leads/' + id); paint(); };
  const paint = () => {
    const st = statusById(L.status_id);
    const p = st?.pipeline || (S.meta.pipelines || []).find((x) => x.id === L.pipeline_id);
    const sts = (p?.statuses || []).filter((s) => s.type !== 1 && s.id !== 143);
    const idx = sts.findIndex((s) => s.id === L.status_id);
    const fe = $('.feed');
    const atBottom = !fe || fe.scrollHeight - fe.scrollTop - fe.clientHeight < 60;
    const keep = $('#msg')?.value;
    $('#top').innerHTML = `${title('Сделка #' + L.id, esc(L.name))}${modeBadge(L.ai_mode)}<div class="grow"></div>
      <a class="btn" href="${esc(L.link)}" target="_blank" rel="noopener">${I.ext}Открыть в amoCRM</a><button class="btn icon" id="rf" title="Обновить">${I.refresh}</button>`;
    $('#content').innerHTML = `<div class="lead">
      <aside class="lead-left">
        <div class="head"><a class="back" href="#/leads">${I.back}Все сделки</a>
          <div class="lead-title" contenteditable="true" spellcheck="false" id="lname" title="Нажмите, чтобы изменить">${esc(L.name)}</div>
          <div class="price-in"><input class="input" id="lprice" type="number" min="0" value="${L.price || 0}"><span class="muted">₸ бюджет</span></div>
          <select class="select" id="lstatus">${(p?.statuses || []).map((s) => `<option value="${s.id}" ${s.id === L.status_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
          <div class="stages">${sts.map((s, i) => `<i class="${i < idx ? 'on' : i === idx ? 'cur' : ''}" title="${esc(s.name)}"></i>`).join('')}</div>
        </div>
        <div class="section"><h4>${I.bot.replace('<svg', '<svg width="15" height="15"')}ИИ-ассистент · n8n</h4>${aiPanelHtml(L)}</div>
        <div class="section"><h4>${I.info.replace('<svg', '<svg width="15" height="15"')}Основное</h4><div class="kv">
          <span class="k">Ответственный</span><span class="v"><select class="select" id="lresp" style="height:34px">${(S.meta.users || []).map((u) => `<option value="${u.id}" ${u.id === L.responsible_user_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></span>
          <span class="k">Теги</span><span class="v">${L.tags.map(tagChip).join('') || '<span class="dim">—</span>'}</span>
          <span class="k">Создана</span><span class="v">${fmtTime(L.created_at)}</span>
          ${(L.custom_fields || []).map((f) => `<span class="k">${esc(f.name || 'Поле ' + f.id)}</span><span class="v">${esc(f.value)}</span>`).join('')}
        </div></div>
        <div class="section"><h4>${I.user.replace('<svg', '<svg width="15" height="15"')}Контакты</h4>${(L.contacts || []).map((c) => `<div class="contact"><span class="av">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b>
          ${c.phones.map((ph) => `<div class="ln">${I.phone}<a href="tel:${esc(ph)}">${esc(ph)}</a></div>`).join('')}${c.emails.map((em) => `<div class="ln">${I.mail}<a href="mailto:${esc(em)}">${esc(em)}</a></div>`).join('')}</div></div>`).join('') || '<span class="dim">Нет контактов</span>'}</div>
      </aside>
      <section class="lead-right"><div class="feed">${feedHtml(L)}</div>${composerHtml(L)}</section></div>`;
    if (keep) $('#msg').value = keep;
    const f = $('.feed'); if (atBottom) f.scrollTop = f.scrollHeight;
    bindLeadUI($('#content'), L, load);
    bindAiPanel($('#content'), L, load);
    $('#rf').onclick = () => load().catch((e) => toast(e.message, 'err'));
    const patch = async (body, ok) => { try { await api('leads/' + L.id, { method: 'PATCH', body }); toast(ok, 'ok'); await load(); } catch (e) { toast(e.message, 'err'); } };
    const nm = $('#lname');
    nm.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); nm.blur(); } };
    nm.onblur = () => { const v = nm.textContent.trim(); if (v && v !== L.name) patch({ name: v }, 'Название сохранено'); };
    $('#lprice').onchange = (e) => patch({ price: Number(e.target.value) || 0 }, 'Бюджет сохранён');
    $('#lstatus').onchange = (e) => patch({ status_id: Number(e.target.value), pipeline_id: L.pipeline_id }, 'Этап изменён');
    $('#lresp').onchange = (e) => patch({ responsible_user_id: Number(e.target.value) }, 'Ответственный изменён');
  };
  try { await load(); } catch (e) { $('#content').innerHTML = empty(I.alert, 'Сделка не загрузилась', `<p>${esc(e.message)}</p>`); return; }
  every(10000, async () => {
    if (['lname', 'lprice'].includes(document.activeElement?.id) || $('#modal-root').innerHTML) return;
    const fresh = await api('leads/' + id).catch(() => null);
    if (fresh && changed(fresh, L)) { const a = document.activeElement?.id; L = fresh; paint(); if (a && $('#' + a)) $('#' + a).focus(); }
  });
}

// ============ ЧАТЫ ============
async function viewChats(id) {
  S.chatFilter = S.chatFilter || 'all';
  shell('chats', `${title('Мессенджеры', 'Чаты')}<label class="search">${I.search}<input class="input" id="q" placeholder="Поиск по чатам"></label><div class="grow"></div><span class="count">Переписки за 30 дней</span>`,
  `<div class="chats"><div class="chat-list"><div class="filters">${[['all', 'Все'], ['unread', 'Непрочитанные'], ['human', 'Нужен менеджер'], ['auto', 'ИИ отвечает'], ['copilot', 'Подсказки'], ['off', 'ИИ выкл.']].map(([k, l]) => `<button data-f="${k}" class="${S.chatFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="clist"><div class="spinner"></div></div></div>
    <div class="chat-pane" id="cpane">${empty(I.inbox, 'Выберите чат', '<p class="small">Слева — все переписки с клиентами</p>')}</div></div>`);
  if (!S.meta) { $('#content').innerHTML = needAmo(); return; }
  let chats = [];
  const match = (c, f) => f === 'all' || (f === 'unread' ? c.unread > 0 : f === 'human' ? c.needs_human : c.mode === f);
  const paintList = () => {
    if (!$('#clist')) return;
    const q = ($('#q').value || '').toLowerCase();
    const list = chats.filter((c) => match(c, S.chatFilter) && (!q || [c.name, c.lead_name, c.last_text].some((x) => String(x || '').toLowerCase().includes(q))));
    $('#clist').innerHTML = list.map((c) => {
      const who = { client: '', bot: 'ИИ: ', manager: 'Менеджер: ' }[c.last_role] || '';
      return `<div class="chat-item ${String(c.lead_id) === String(id) ? 'on' : ''}" data-id="${c.lead_id}">
        <div class="av" style="background:${c.needs_human ? '#e59a1c' : TEMP_C[c.temperature] || CH.navy}">${esc(initials(c.name || c.lead_name))}</div>
        <div class="body"><div class="l1"><b>${esc(c.name || c.lead_name)}</b><span class="t">${fmtShort(c.last_at)}</span></div>
          <div class="l2">${esc(who + (c.last_text || ''))}</div>
          <div class="l3"><span class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">${esc(c.lead_name || '')}</span><span class="row" style="gap:6px">${c.mode !== 'auto' ? modeBadge(c.mode) : ''}${c.unread ? `<span class="badge cyan">${c.unread}</span>` : ''}</span></div></div></div>`;
    }).join('') || empty(I.chat, 'Чатов нет', '<p class="small">Здесь появятся переписки, которые n8n записывает в сделки.</p>');
    $$('.chat-item').forEach((el) => el.onclick = () => location.hash = '#/chats/' + el.dataset.id);
  };
  const loadList = async () => {
    try { chats = await api('chats'); S.badges.chats = chats.filter((c) => c.unread > 0).length; paintBadges(); paintList(); }
    catch (e) { if ($('#clist')) $('#clist').innerHTML = empty(I.alert, 'Ошибка загрузки', `<p class="small">${esc(e.message)}</p>`); }
  };
  $('#q').oninput = paintList;
  $$('[data-f]').forEach((b) => b.onclick = () => { S.chatFilter = b.dataset.f; $$('[data-f]').forEach((x) => x.classList.toggle('on', x === b)); paintList(); });
  if (!id) { await loadList(); every(15000, loadList); return; }
  let L;
  let chatTab = 'chat';
  const pane = $('#cpane');
  const load = async () => { L = await api('leads/' + id); paintPane(); };
  const paintPane = () => {
    const st = statusById(L.status_id);
    const keep = $('#msg', pane)?.value;
    const fe = $('.feed', pane);
    const atBottom = !fe || fe.scrollHeight - fe.scrollTop - fe.clientHeight < 60;
    pane.innerHTML = `<div class="chat-head"><span class="contact"><span class="av">${esc(initials(L.contact?.name || L.name))}</span></span>
        <div style="min-width:0;flex:1"><a href="#/lead/${L.id}" style="font-size:16px;font-weight:750;color:var(--navy)">${esc(L.contact?.name || L.name)}</a>
        <div class="small muted">${esc(L.name)}${st ? ` · <span class="dot" style="background:${esc(st.color || CH.cyan)}"></span> ${esc(st.name)}` : ''}${L.price ? ' · ' + money(L.price) : ''}</div></div>
        <div style="width:300px">${modeSeg(L)}</div><a class="btn sm" href="#/lead/${L.id}">${I.ext}Сделка</a></div>
      <div class="ctabs"><button data-ct="chat" class="${chatTab === 'chat' ? 'on' : ''}">${I.chat}Переписка</button><button data-ct="contact" class="${chatTab === 'contact' ? 'on' : ''}">${I.user}Контакт</button></div>
      <div class="cbody" data-cb="chat" style="${chatTab === 'chat' ? '' : 'display:none'}"><div class="feed">${feedHtml(L)}</div>${composerHtml(L)}</div>
      <div class="cbody cinfo" data-cb="contact" style="${chatTab === 'contact' ? '' : 'display:none'}">${contactInfoHtml(L)}</div>`;
    if (keep) $('#msg', pane).value = keep;
    const f = $('.feed', pane); if (atBottom) f.scrollTop = f.scrollHeight;
    $$('[data-ct]', pane).forEach((b) => b.onclick = () => {
      chatTab = b.dataset.ct;
      $$('[data-ct]', pane).forEach((x) => x.classList.toggle('on', x === b));
      $$('[data-cb]', pane).forEach((x) => x.style.display = x.dataset.cb === chatTab ? '' : 'none');
      if (chatTab === 'chat') { const fe2 = $('.feed', pane); fe2.scrollTop = fe2.scrollHeight; }
    });
    bindCopy(pane);
    bindLeadUI(pane, L, load);
    bindAiPanel(pane, L, load);
  };
  pane.innerHTML = '<div class="spinner"></div>';
  try { await load(); } catch (e) { pane.innerHTML = empty(I.alert, 'Чат не загрузился', `<p class="small">${esc(e.message)}</p>`); }
  await loadList();
  every(15000, loadList);
  every(10000, async () => {
    if ($('#modal-root').innerHTML || !L) return;
    const fresh = await api('leads/' + id).catch(() => null);
    if (fresh && changed(fresh, L)) { const foc = document.activeElement?.id === 'msg'; L = fresh; paintPane(); if (foc) $('#msg', pane).focus(); }
  });
}

// ============ ЗАДАЧИ ============
async function viewTasks() {
  shell('tasks', `${title('Планирование', 'Задачи')}<label class="search">${I.search}<input class="input" id="q" placeholder="Поиск по задачам"></label><div class="grow"></div><span class="count" id="cnt"></span>
    <button class="btn icon" id="rf" title="Обновить">${I.refresh}</button><button class="btn primary" id="add">${I.plus}Новая задача</button>`, '<div class="spinner"></div>');
  if (!S.meta) { $('#content').innerHTML = needAmo(); return; }
  let tasks = [];
  const paint = () => {
    if (!$('#cnt')) return;
    const q = ($('#q').value || '').toLowerCase();
    const list = tasks.filter((t) => !q || [t.text, t.lead_name].some((x) => String(x || '').toLowerCase().includes(q)));
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const tomorrow = d0 / 1000 + 86400, after = tomorrow + 86400, n = nowSec();
    const cols = [
      ['Просрочено', 'red', I.alert, list.filter((t) => t.complete_till < n)],
      ['Сегодня', 'green', I.sun, list.filter((t) => t.complete_till >= n && t.complete_till < tomorrow)],
      ['Завтра', '', I.sunrise, list.filter((t) => t.complete_till >= tomorrow && t.complete_till < after)],
      ['Позже', 'navy', I.later, list.filter((t) => t.complete_till >= after)],
    ];
    $('#cnt').textContent = `${list.length} ${plural(list.length, 'задача', 'задачи', 'задач')}`;
    $('#content').innerHTML = `<div class="tasks">${cols.map(([name, c, ic, ts]) => `<div class="tcol"><div class="tcol-head"><span class="ico-box ${c}">${ic}</span><b>${name}</b><span class="n">${ts.length}</span></div>
      ${ts.map((t) => `<div class="tcard"><button class="done" data-done="${t.id}" title="Выполнить">${I.check}</button>
        ${t.entity_id ? `<a class="ln" href="#/lead/${t.entity_id}">${esc(t.lead_name || 'Сделка #' + t.entity_id)}</a>` : '<span class="ln">Без сделки</span>'}
        <div class="when ${t.complete_till < n ? 'red' : ''}">${I.clock}${fmtTime(t.complete_till)}</div>
        <div class="tx">${esc(t.text)}</div><div class="who">${esc(userName(t.responsible_user_id) || '')}${t.created_by === 0 ? ' · от робота' : ''}</div></div>`).join('') || '<div class="small muted" style="text-align:center;padding:18px 0">Нет задач</div>'}</div>`).join('')}</div>`;
    $$('[data-done]').forEach((b) => b.onclick = () => completeTask(Number(b.dataset.done), load));
  };
  const load = async () => {
    try { tasks = await api('tasks'); S.badges.tasks = tasks.filter((t) => t.complete_till < nowSec()).length; paintBadges(); paint(); }
    catch (e) { $('#content').innerHTML = empty(I.alert, 'Не удалось загрузить задачи', `<p>${esc(e.message)}</p>`); }
  };
  $('#q').oninput = paint;
  $('#rf').onclick = load;
  $('#add').onclick = async () => {
    const leads = await api('leads').catch(() => []);
    modal('Новая задача', `<label class="field"><span>Сделка</span><select class="select" name="lead"><option value="">— без сделки —</option>${leads.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label>
      <div class="grid2"><label class="field"><span>Срок</span><input class="input" type="datetime-local" name="due"></label>
      <label class="field"><span>Ответственный</span><select class="select" name="resp">${(S.meta.users || []).map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label></div>
      <label class="field"><span>Что сделать</span><textarea class="input" name="text" placeholder="Связаться с клиентом"></textarea></label>`,
    { okText: 'Поставить задачу', icon: I.clock, onOk: async (r) => {
      const v = (n) => $(`[name=${n}]`, r).value;
      const due = v('due') ? new Date(v('due')) / 1000 : nowSec() + 3600;
      await api('tasks', { body: { lead_id: Number(v('lead')) || null, text: v('text'), complete_till: Math.floor(due), responsible_user_id: Number(v('resp')) || null } });
      toast('Задача поставлена', 'ok'); load();
    } });
    const d = new Date(Date.now() + 3600e3); d.setMinutes(0 - d.getTimezoneOffset());
    $('[name=due]').value = d.toISOString().slice(0, 16);
  };
  await load();
  every(30000, load);
}

// ============ НАСТРОЙКИ ============
const SECTIONS = [
  ['amo', 'Подключение amoCRM', I.plug, (st) => st.amo || S.me?.demo],
  ['sending', 'Отправка и теги', I.send, (st) => st.send],
  ['security', 'Безопасность', I.lock, () => true],
];

async function viewSettings(sec) {
  sec = SECTIONS.some((s) => s[0] === sec) ? sec : 'amo';
  try { S.settings = await api('settings'); } catch (e) { toast(e.message, 'err'); return; }
  const st = S.settings._status;
  shell('settings', title('Система', 'Настройки'), `<div class="settings"><nav>${SECTIONS.map(([k, l, i, ok]) => `<a href="#/settings/${k}" class="${k === sec ? 'on' : ''}">${i}${l}<span class="st ${ok(st) ? 'ok' : ''}"></span></a>`).join('')}</nav>
    <div class="pane"><div class="page" id="sp"></div></div></div>`);
  ({ amo: setAmo, sending: setSending, security: setSecurity })[sec]($('#sp'), S.settings);
}

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function inp(path, label, { type = 'text', ph = '', help = '' } = {}) {
  const v = get(S.settings, path);
  return `<label class="field"><span>${label}</span><input class="input" data-k="${path}" data-t="${type === 'number' ? 'num' : 'str'}" type="${type}" value="${esc(v ?? '')}" placeholder="${esc(ph)}" ${type === 'password' ? 'autocomplete="new-password"' : ''}>${help ? `<small>${help}</small>` : ''}</label>`;
}
function sel(path, label, options, { help = '', t = 'num' } = {}) {
  const v = get(S.settings, path);
  return `<label class="field"><span>${label}</span><select class="select" data-k="${path}" data-t="${t}">${options.map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(v ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${help ? `<small>${help}</small>` : ''}</label>`;
}
function collect(root) {
  const out = {};
  $$('[data-k]', root).forEach((el) => {
    let v = el.dataset.t === 'bool' ? el.checked : el.value.trim();
    if (el.dataset.t === 'num') v = Number(v) || 0;
    const keys = el.dataset.k.split('.');
    let o = out;
    keys.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; });
    o[keys.at(-1)] = v;
  });
  return out;
}
function saveBar(root) {
  root.insertAdjacentHTML('beforeend', `<div class="save-bar"><button class="btn primary" id="save">${I.check}Сохранить изменения</button></div>`);
  $('#save', root).onclick = (e) => busy(e.currentTarget, async () => {
    await api('settings', { body: collect(root) });
    S.me = await api('me');
    toast('Настройки сохранены', 'ok');
    await loadMeta(true);
    $('#app').innerHTML = '';  // перерисовать боковую панель (имя аккаунта, режим)
    route();
  });
}
function bindCopy(root) {
  $$('[data-copy]', root).forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Скопировано', 'ok'); } catch (e) { toast('Не удалось скопировать — выделите текст вручную', 'err'); } });
}
const block = (icon, h, p, body, cls = '') => `<div class="card-block"><div class="bh"><span class="ico-box ${cls}">${icon}</span><div><h3>${h}</h3>${p ? `<p>${p}</p>` : ''}</div></div>${body}</div>`;

function setAmo(root, s) {
  const demo = !!s.demo;
  root.innerHTML = block(I.tag, 'Режим работы', 'В демо-режиме сайт работает на тестовых данных. Для работы с реальными клиентами выберите «Мой аккаунт amoCRM».',
    `<div class="seg" style="max-width:440px"><button class="${demo ? 'on copilot' : ''}" data-demo="1">${I.spark}Демо-режим</button><button class="${!demo ? 'on auto' : ''}" data-demo="0">${I.plug}Мой аккаунт amoCRM</button></div>
     <input type="checkbox" data-k="demo" data-t="bool" ${demo ? 'checked' : ''} hidden>
     ${demo ? `<div style="margin-top:14px"><button class="btn sm danger" id="resetDemo">${I.refresh}Сбросить демо-данные</button></div>` : ''}`)
  + block(I.plug, 'Аккаунт amoCRM', 'Подключение займёт около 5 минут.',
    `<ol class="steps">
      <li>В amoCRM откройте <b>Настройки → Интеграции</b> → <b>«Создать интеграцию»</b> → <b>«Внешняя интеграция»</b>.</li>
      <li>Укажите название, в поле «Ссылка для перенаправления» вставьте адрес ниже, отметьте <b>«Доступ к данным аккаунта»</b> и сохраните.</li>
      <li>Откройте интеграцию → вкладка <b>«Ключи и доступы»</b> → <b>«Сгенерировать долгосрочный токен»</b>.</li>
      <li>Вставьте адрес аккаунта и токен ниже и нажмите «Проверить подключение».</li></ol>
    <div class="copy" style="margin-bottom:18px"><input class="input" readonly value="${esc(s._oauth_redirect)}"><button class="btn" data-copy="${esc(s._oauth_redirect)}">${I.copy}Копировать</button></div>
    <div class="grid2">${inp('amo.subdomain', 'Адрес аккаунта', { ph: 'inheaveniam8', help: 'Для https://inheaveniam8.amocrm.ru введите inheaveniam8' })}
      ${sel('amo.domain', 'Домен', [['amocrm.ru', 'amocrm.ru'], ['kommo.com', 'kommo.com'], ['amocrm.com', 'amocrm.com']], { t: 'str' })}</div>
    ${sel('amo.auth_mode', 'Способ авторизации', [['longlived', 'Долгосрочный токен (рекомендуется)'], ['oauth', 'OAuth 2.0 (код авторизации)']], { t: 'str' })}
    <div id="ll" style="${s.amo.auth_mode === 'oauth' ? 'display:none' : ''}">${inp('amo.long_token', 'Долгосрочный токен', { type: 'password', ph: 'eyJ0eXAiOiJKV1QiLCJhbGciOi…' })}</div>
    <div id="oa" style="${s.amo.auth_mode === 'oauth' ? '' : 'display:none'}">
      <div class="grid2">${inp('amo.client_id', 'ID интеграции')}${inp('amo.client_secret', 'Секретный ключ', { type: 'password' })}</div>
      ${inp('amo.redirect_uri', 'Ссылка для перенаправления', { ph: s._oauth_redirect, help: 'Должна совпадать с указанной в интеграции amoCRM' })}
      <label class="field"><span>Код авторизации</span><div class="copy"><input class="input" id="code" placeholder="def50200… (действует 20 минут)"><button class="btn" id="exch">Получить токен</button></div>
        <small>Код — в интеграции, вкладка «Ключи и доступы». ${s.amo.refresh_token ? '<b style="color:var(--green)">✓ Токен получен</b>' : ''}</small></label></div>
    <button class="btn cyan" id="test">${I.plug}Проверить подключение</button><div id="testRes"></div>`);
  $$('[data-demo]', root).forEach((b) => b.onclick = () => {
    $('[data-k=demo]', root).checked = b.dataset.demo === '1';
    $$('[data-demo]', root).forEach((x) => x.className = x === b ? 'on ' + (b.dataset.demo === '1' ? 'copilot' : 'auto') : '');
  });
  $('[data-k="amo.auth_mode"]', root).onchange = (e) => { $('#ll', root).style.display = e.target.value === 'oauth' ? 'none' : ''; $('#oa', root).style.display = e.target.value === 'oauth' ? '' : 'none'; };
  bindCopy(root);
  if ($('#resetDemo', root)) $('#resetDemo', root).onclick = (e) => busy(e.currentTarget, async () => { await api('demo/reset', { body: {} }); toast('Демо-данные сброшены', 'ok'); await loadMeta(true); });
  $('#test', root).onclick = (e) => busy(e.currentTarget, async () => {
    await api('settings', { body: collect(root) });
    S.me = await api('me');
    try {
      const m = await api('amo/test', { body: {} });
      $('#testRes', root).innerHTML = `<div class="status-line ok">${I.checkCircle}<span>Подключено: <b>${esc(m.account.name)}</b> · ${m.users.length} ${plural(m.users.length, 'пользователь', 'пользователя', 'пользователей')} · ${m.pipelines.length} ${plural(m.pipelines.length, 'воронка', 'воронки', 'воронок')}</span></div>`;
      await loadMeta(true);
    } catch (err) { $('#testRes', root).innerHTML = `<div class="status-line err">${I.alert}<span>${esc(err.message)}</span></div>`; }
  });
  $('#exch', root).onclick = (e) => busy(e.currentTarget, async () => {
    await api('settings', { body: collect(root) });
    const m = await api('amo/oauth', { body: { code: $('#code', root).value } });
    toast('amoCRM подключён: ' + m.account.name, 'ok');
    S.me = await api('me'); await loadMeta(true); viewSettings('amo');
  });
  saveBar(root);
}

function setSending(root) {
  const pls = S.meta?.pipelines || [];
  const fOpts = [[0, '— не выбрано —'], ...((S.meta?.fields || []).map((f) => [f.id, `${f.name} (ID ${f.id})`]))];
  root.innerHTML = (!S.meta ? `<div class="status-line err" style="margin:0 0 16px">${I.alert}<span>Сначала подключите amoCRM — тогда здесь появятся воронки и поля.</span></div>` : '')
  + block(I.send, 'Отправка сообщений клиенту', 'Кнопка «Отправить» работает как консоль менеджера в n8n: текст попадает в поле «AI ответ», затем Salesbot отправляет его в мессенджер клиента. Укажите те же значения, что в узле <b>CRM Config</b> (<span class="mono">reply_field_id</span>, <span class="mono">salesbot_id</span>).',
    `<div class="grid2">${sel('crm.reply_field_id', 'Поле «AI ответ»', fOpts)}${inp('crm.salesbot_id', 'ID Salesbot', { type: 'number', ph: '11761' })}</div>
     ${inp('crm.takeover_minutes', 'Пауза ИИ после сообщения менеджера, мин', { type: 'number', help: 'Только для подсказки в интерфейсе. Сама пауза задаётся в n8n (takeover_minutes).' })}`)
  + block(I.funnel, 'Воронка по умолчанию', 'Открывается в разделе «Сделки» и считается на рабочем столе.',
    sel('crm.pipeline_id', 'Воронка', [[0, '— главная воронка —'], ...pls.map((x) => [x.id, x.name])]), 'navy')
  + block(I.tag, 'Теги ИИ', 'Должны совпадать с <span class="mono">tags</span> в узле CRM Config в n8n. По ним сайт показывает и переключает режим ИИ и температуру лида.',
    `<div class="grid2">${[['stop', 'ИИ выключен'], ['draft', 'Только подсказки'], ['human', 'Нужен менеджер'], ['hot', 'Горячий'], ['warm', 'Тёплый'], ['cold', 'Холодный'], ['gov', 'Госсектор'], ['biz', 'Бизнес']].map(([k, l]) => inp('crm.tags.' + k, l)).join('')}</div>`, 'amber')
  + block(I.spark, 'ИИ-помощник менеджера (n8n)', 'Ссылка на форму «Manager console» в n8n. В чате появится кнопка «ИИ-помощник (n8n)».',
    inp('n8n.console_url', 'Ссылка на консоль менеджера', { ph: 'https://ваш-n8n/form/imas-manager-console' })
    + `<div class="grid2">${inp('n8n.console_user', 'Логин формы', { help: 'Если в форме n8n включён Basic Auth' })}${inp('n8n.console_password', 'Пароль формы', { type: 'password' })}</div>`);
  saveBar(root);
}

function setSecurity(root) {
  root.innerHTML = block(I.lock, 'Пароль входа', 'Пароль защищает доступ к сайту, amoCRM и переписке.',
    `<div class="grid2"><label class="field"><span>Текущий пароль</span><input class="input" type="password" id="pOld"></label><label class="field"><span>Новый пароль (от 6 символов)</span><input class="input" type="password" id="pNew"></label></div>
     <button class="btn primary" id="pSave">${I.lock}Сменить пароль</button>`);
  $('#pSave', root).onclick = (e) => busy(e.currentTarget, async () => { await api('settings/password', { body: { old: $('#pOld', root).value, new: $('#pNew', root).value } }); toast('Пароль изменён', 'ok'); $('#pOld', root).value = $('#pNew', root).value = ''; });
}
