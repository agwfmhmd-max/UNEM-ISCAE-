/* stats.js — Onglet « Statistiques » réservé au superviseur principal (MDA).
 *  - Affiche toutes les connexions des superviseurs et tous les ajouts / remplacements / suppressions de jeux d'hypothèses,
 *    avec la date et l'heure, un tableau filtrable et des graphiques.
 *  - Source : table payg_activity (voir supabase_hypotheses.sql). La base n'autorise la lecture qu'à MDA :
 *    même si ce panneau était affiché pour quelqu'un d'autre, il n'obtiendrait aucune donnée.
 *  - N'altère aucune formule ni aucune autre fonction du site. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const AR = () => typeof currentLang !== 'undefined' && currentLang === 'ar';
  const T = {
    fr: {
      nav: 'Statistiques (MDA)', title: 'Statistiques d’activité', sub: 'Connexions des superviseurs et jeux d’hypothèses ajoutés — visible uniquement par le superviseur principal.',
      refresh: 'Actualiser', loading: 'Chargement du journal…', empty: 'Aucune activité enregistrée pour le moment.',
      errTable: 'Journal introuvable : exécutez supabase_hypotheses.sql dans Supabase.', errAccess: 'Accès refusé : seul le superviseur principal peut lire ce journal.', errGen: 'Impossible de charger le journal. Réessayez.',
      kLogins: 'Connexions', kAdds: 'Jeux ajoutés', kUpd: 'Jeux remplacés', kDel: 'Jeux supprimés', kLast: 'Dernière activité',
      cLoginsBy: 'Connexions par superviseur', cAddsBy: 'Jeux d’hypothèses ajoutés par superviseur', cDaily: 'Activité par jour (30 derniers jours)', cHour: 'Connexions par heure de la journée',
      series: { login: 'Connexions', hypothesis_add: 'Jeux ajoutés' }, tabLog: 'Journal détaillé', fAll: 'Tous', fWho: 'Superviseur', fEv: 'Événement',
      colAt: 'Date et heure', colWho: 'Superviseur', colEv: 'Événement', colDet: 'Détail',
      ev: { login: 'Connexion', hypothesis_add: 'Jeu d’hypothèses ajouté', hypothesis_update: 'Jeu d’hypothèses remplacé', hypothesis_delete: 'Jeu d’hypothèses supprimé' },
      shown: 'affichés sur', noChart: 'Graphiques indisponibles (Chart.js non chargé).', others: 'autres superviseurs'
    },
    ar: {
      nav: 'الإحصائيات (MDA)', title: 'إحصائيات النشاط', sub: 'تسجيلات دخول المشرفين ومجموعات الفرضيات المضافة — تظهر للمشرف الرئيسي فقط.',
      refresh: 'تحديث', loading: 'جارٍ تحميل السجل…', empty: 'لا يوجد نشاط مسجَّل حتى الآن.',
      errTable: 'السجل غير موجود: نفّذ ملف supabase_hypotheses.sql في Supabase.', errAccess: 'تم رفض الوصول: المشرف الرئيسي وحده يمكنه قراءة هذا السجل.', errGen: 'تعذر تحميل السجل. أعد المحاولة.',
      kLogins: 'تسجيلات الدخول', kAdds: 'مجموعات مضافة', kUpd: 'مجموعات مستبدلة', kDel: 'مجموعات محذوفة', kLast: 'آخر نشاط',
      cLoginsBy: 'تسجيلات الدخول لكل مشرف', cAddsBy: 'مجموعات الفرضيات المضافة لكل مشرف', cDaily: 'النشاط اليومي (آخر 30 يومًا)', cHour: 'تسجيلات الدخول حسب ساعة اليوم',
      series: { login: 'تسجيلات الدخول', hypothesis_add: 'مجموعات مضافة' }, tabLog: 'السجل التفصيلي', fAll: 'الكل', fWho: 'المشرف', fEv: 'الحدث',
      colAt: 'التاريخ والوقت', colWho: 'المشرف', colEv: 'الحدث', colDet: 'التفاصيل',
      ev: { login: 'تسجيل دخول', hypothesis_add: 'إضافة مجموعة فرضيات', hypothesis_update: 'استبدال مجموعة فرضيات', hypothesis_delete: 'حذف مجموعة فرضيات' },
      shown: 'معروض من', noChart: 'الرسوم غير متاحة (لم يتم تحميل Chart.js).', others: 'مشرفون آخرون'
    }
  };
  const t = () => T[AR() ? 'ar' : 'fr'];
  const COL = { login: '#3b82f6', hypothesis_add: '#10b981', hypothesis_update: '#f59e0b', hypothesis_delete: '#ef4444' };
  const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#06b6d4', '#ec4899'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isAdmin = () => !!(window.PaygAuth && window.PaygAuth.isAdmin && window.PaygAuth.isAdmin());

  let rows = [], status = 'idle', charts = [], filterWho = '', filterEv = '', shownMax = 100;

  const fmtDate = (d) => d.toLocaleDateString(AR() ? 'ar-MR' : 'fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtTime = (d) => d.toLocaleTimeString(AR() ? 'ar-MR' : 'fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  function killCharts() { charts.forEach((c) => { try { c.destroy(); } catch (e) { /* ignore */ } }); charts = []; }
  function tc() { try { return window.themeColors ? window.themeColors() : { tick: '#94a3b8', grid: 'rgba(148,163,184,.15)' }; } catch (e) { return { tick: '#94a3b8', grid: 'rgba(148,163,184,.15)' }; } }

  async function load() {
    if (!isAdmin()) return;
    if (status !== 'ok') { status = 'loading'; paint(); }
    const c = window.PaygAuth.client();
    if (!c) { status = 'error'; paint(); return; }
    try {
      const { data, error } = await c.from('payg_activity').select('id, at, user_email, user_name, event, details').order('at', { ascending: false }).limit(5000);
      if (error) throw error;
      const next = (data || []).map((r) => Object.assign({}, r, { d: new Date(r.at) })).filter((r) => !isNaN(r.d));
      const same = status === 'ok' && next.length === rows.length && (!next.length || next[0].id === rows[0].id);
      rows = next; status = 'ok';
      if (same) return; // rien de nouveau : on ne redessine pas (évite le clignotement des graphiques)
    } catch (err) {
      console.error('[stats]', err);
      status = /payg_activity|does not exist|schema cache|42P01|PGRST205/i.test(String(err && (err.message || err.code))) ? 'notable' : (err && err.code === '42501' ? 'denied' : 'error');
    }
    paint();
  }

  /* ---------- Agrégats ---------- */
  function aggregate() {
    const names = []; const seen = {};
    rows.forEach((r) => { const n = r.user_name || r.user_email; if (!seen[n]) { seen[n] = 1; names.push(n); } });
    names.sort();
    const count = (ev, n) => rows.filter((r) => r.event === ev && (r.user_name || r.user_email) === n).length;
    const per = names.map((n) => ({ name: n, logins: count('login', n), adds: count('hypothesis_add', n), upd: count('hypothesis_update', n), del: count('hypothesis_delete', n) }));
    const days = []; const now = new Date(); now.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days.push(d); }
    const dk = days.map(dayKey), byDay = { login: dk.map(() => 0), hypothesis_add: dk.map(() => 0) };
    rows.forEach((r) => { const i = dk.indexOf(dayKey(r.d)); if (i >= 0 && byDay[r.event]) byDay[r.event][i]++; });
    const hours = new Array(24).fill(0); rows.forEach((r) => { if (r.event === 'login') hours[r.d.getHours()]++; });
    return { names, per, days, byDay, hours };
  }

  /* ---------- Rendu ---------- */
  function msgBox(txt, tone) { return '<div class="p-4 rounded-xl border text-xs ' + (tone === 'err' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-slate-950 border-slate-800 text-slate-300') + '">' + esc(txt) + '</div>'; }

  function paint() {
    const root = $('statsRoot'); if (!root) return;
    const nav = $('navStats'); if (nav) nav.classList.toggle('hidden', !isAdmin());
    const sec = $('module-stats'); if (sec) sec.classList.toggle('hidden', !isAdmin());
    const tl = $('navStatsTxt'); if (tl) tl.textContent = t().nav;
    if (!isAdmin()) { killCharts(); root.innerHTML = ''; return; }
    const S = t();
    const ttl = $('statsTitle'); if (ttl) ttl.textContent = S.title; const sb = $('statsSub'); if (sb) sb.textContent = S.sub;
    const rb = $('statsRefreshTxt'); if (rb) rb.textContent = S.refresh;
    killCharts();
    if (status === 'loading' || status === 'idle') { root.innerHTML = msgBox(S.loading); return; }
    if (status === 'notable') { root.innerHTML = msgBox(S.errTable, 'err'); return; }
    if (status === 'denied') { root.innerHTML = msgBox(S.errAccess, 'err'); return; }
    if (status === 'error') { root.innerHTML = msgBox(S.errGen, 'err'); return; }
    if (!rows.length) { root.innerHTML = msgBox(S.empty); return; }

    const A = aggregate(), cnt = (ev) => rows.filter((r) => r.event === ev).length;
    const last = rows[0];
    const kpi = (lbl, val, color, icon) => '<div class="bg-slate-950 border border-slate-800 rounded-xl p-4"><div class="text-[11px] text-slate-400 flex items-center gap-1.5"><i class="fa-solid ' + icon + ' ' + color + '"></i>' + esc(lbl) + '</div><div class="text-2xl font-bold text-white font-mono mt-1">' + val + '</div></div>';
    let h = '<div class="grid grid-cols-2 lg:grid-cols-5 gap-3">' +
      kpi(S.kLogins, cnt('login'), 'text-blue-400', 'fa-right-to-bracket') + kpi(S.kAdds, cnt('hypothesis_add'), 'text-emerald-400', 'fa-circle-plus') +
      kpi(S.kUpd, cnt('hypothesis_update'), 'text-amber-400', 'fa-pen') + kpi(S.kDel, cnt('hypothesis_delete'), 'text-red-400', 'fa-trash') +
      '<div class="bg-slate-950 border border-slate-800 rounded-xl p-4 col-span-2 lg:col-span-1"><div class="text-[11px] text-slate-400 flex items-center gap-1.5"><i class="fa-solid fa-clock text-cyan-400"></i>' + esc(S.kLast) + '</div><div class="text-sm font-bold text-white mt-1.5">' + esc(last.user_name || last.user_email) + '</div><div class="text-[11px] text-slate-400 font-mono">' + esc(fmtDate(last.d) + ' ' + fmtTime(last.d)) + '</div></div></div>';

    h += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">' +
      '<div class="bg-slate-950 border border-slate-800 rounded-xl p-4"><h4 class="text-xs font-bold text-slate-200 mb-3">' + esc(S.cLoginsBy) + '</h4><div class="h-56"><canvas id="stLogins"></canvas></div></div>' +
      '<div class="bg-slate-950 border border-slate-800 rounded-xl p-4"><h4 class="text-xs font-bold text-slate-200 mb-3">' + esc(S.cAddsBy) + '</h4><div class="h-56"><canvas id="stAdds"></canvas></div></div>' +
      '<div class="bg-slate-950 border border-slate-800 rounded-xl p-4 lg:col-span-2"><h4 class="text-xs font-bold text-slate-200 mb-3">' + esc(S.cDaily) + '</h4><div class="h-64"><canvas id="stDaily"></canvas></div></div>' +
      '<div class="bg-slate-950 border border-slate-800 rounded-xl p-4 lg:col-span-2"><h4 class="text-xs font-bold text-slate-200 mb-3">' + esc(S.cHour) + '</h4><div class="h-52"><canvas id="stHours"></canvas></div></div></div>';

    // Journal détaillé
    const evKeys = ['login', 'hypothesis_add', 'hypothesis_update', 'hypothesis_delete'];
    const sel = 'bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs';
    h += '<div class="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3"><div class="flex flex-wrap items-center gap-2"><h4 class="text-xs font-bold text-slate-200 me-2"><i class="fa-solid fa-list-ul text-amber-400 mx-1"></i>' + esc(S.tabLog) + '</h4>' +
      '<label class="text-[11px] text-slate-400">' + esc(S.fWho) + ' <select id="stFWho" class="' + sel + '"><option value="">' + esc(S.fAll) + '</option>' + A.names.map((n) => '<option value="' + esc(n) + '"' + (n === filterWho ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></label>' +
      '<label class="text-[11px] text-slate-400">' + esc(S.fEv) + ' <select id="stFEv" class="' + sel + '"><option value="">' + esc(S.fAll) + '</option>' + evKeys.map((k) => '<option value="' + k + '"' + (k === filterEv ? ' selected' : '') + '>' + esc(S.ev[k]) + '</option>').join('') + '</select></label></div>';
    const list = rows.filter((r) => (!filterWho || (r.user_name || r.user_email) === filterWho) && (!filterEv || r.event === filterEv));
    h += '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400 border-b border-slate-800"><th class="text-start py-2 pe-3">' + esc(S.colAt) + '</th><th class="text-start py-2 pe-3">' + esc(S.colWho) + '</th><th class="text-start py-2 pe-3">' + esc(S.colEv) + '</th><th class="text-start py-2">' + esc(S.colDet) + '</th></tr></thead><tbody>';
    list.slice(0, shownMax).forEach((r) => {
      const det = r.details && r.details.name ? r.details.name : '';
      h += '<tr class="border-b border-slate-800/60"><td class="py-1.5 pe-3 font-mono text-slate-300 whitespace-nowrap" dir="ltr">' + esc(fmtDate(r.d) + '  ' + fmtTime(r.d)) + '</td><td class="py-1.5 pe-3 font-semibold text-slate-100">' + esc(r.user_name || r.user_email) + '</td>' +
        '<td class="py-1.5 pe-3 whitespace-nowrap"><span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background:' + (COL[r.event] || '#94a3b8') + '"></span>' + esc(S.ev[r.event] || r.event) + '</span></td><td class="py-1.5 text-slate-300">' + esc(det) + '</td></tr>';
    });
    h += '</tbody></table></div><div class="flex items-center justify-between text-[11px] text-slate-500"><span>' + Math.min(shownMax, list.length) + ' ' + esc(S.shown) + ' ' + list.length + '</span>' + (list.length > shownMax ? '<button type="button" id="stMore" class="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700">+100</button>' : '') + '</div></div>';
    root.innerHTML = h;

    const f1 = $('stFWho'), f2 = $('stFEv'), mo = $('stMore');
    if (f1) f1.onchange = () => { filterWho = f1.value; shownMax = 100; paint(); };
    if (f2) f2.onchange = () => { filterEv = f2.value; shownMax = 100; paint(); };
    if (mo) mo.onclick = () => { shownMax += 100; paint(); };

    if (typeof Chart === 'undefined') { root.insertAdjacentHTML('afterbegin', msgBox(S.noChart)); return; }
    const C = tc(), opts = (extra) => Object.assign({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: C.tick, maxRotation: 0, autoSkip: true }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: C.tick, precision: 0 }, grid: { color: C.grid } } } }, extra || {});
    const mk = (id, cfg) => { const el = $(id); if (el) charts.push(new Chart(el.getContext('2d'), cfg)); };
    mk('stLogins', { type: 'bar', data: { labels: A.per.map((p) => p.name), datasets: [{ data: A.per.map((p) => p.logins), backgroundColor: A.per.map((_, i) => PALETTE[i % PALETTE.length] + 'cc'), borderColor: A.per.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 1, borderRadius: 6, maxBarThickness: 70 }] }, options: opts() });
    mk('stAdds', { type: 'bar', data: { labels: A.per.map((p) => p.name), datasets: [{ data: A.per.map((p) => p.adds), backgroundColor: A.per.map((_, i) => PALETTE[i % PALETTE.length] + 'cc'), borderColor: A.per.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 1, borderRadius: 6, maxBarThickness: 70 }] }, options: opts() });
    mk('stDaily', { type: 'line', data: { labels: A.days.map((d) => d.toLocaleDateString(AR() ? 'ar-MR' : 'fr-FR', { day: '2-digit', month: '2-digit' })), datasets: [
      { label: S.series.login, data: A.byDay.login, borderColor: COL.login, backgroundColor: COL.login + '33', tension: 0.3, fill: true, pointRadius: 2 },
      { label: S.series.hypothesis_add, data: A.byDay.hypothesis_add, borderColor: COL.hypothesis_add, backgroundColor: COL.hypothesis_add + '33', tension: 0.3, fill: true, pointRadius: 2 }] }, options: opts({ plugins: { legend: { display: true, labels: { color: C.tick } } } }) });
    mk('stHours', { type: 'bar', data: { labels: A.hours.map((_, i) => String(i).padStart(2, '0') + 'h'), datasets: [{ data: A.hours, backgroundColor: COL.login + 'cc', borderColor: COL.login, borderWidth: 1, borderRadius: 4 }] }, options: opts() });
  }

  function init() {
    const b = $('statsRefresh'); if (b) b.addEventListener('click', load);
    window.addEventListener('payg-auth', () => { rows = []; status = 'idle'; filterWho = ''; filterEv = ''; shownMax = 100; paint(); if (isAdmin()) load(); });
    const orig = window.applyLanguage;
    if (typeof orig === 'function') window.applyLanguage = function () { const r = orig.apply(this, arguments); try { paint(); } catch (e) { /* ignore */ } return r; };
    // actualisation légère toutes les 60 s tant que l'onglet est visible
    setInterval(() => { if (isAdmin() && !document.hidden && status === 'ok') load(); }, 60000);
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.PaygStats = { reload: load };
})();
