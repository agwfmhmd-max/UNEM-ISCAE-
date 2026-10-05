/* extras.js — Mode clair/sombre, jeux d'hypothèses nommés, méthode de calcul (prix, VAN, TRI…) en direct.
 * N'altère aucune formule : lit l'état de StudyUI et les résultats de engine.js. */
(function () {
  'use strict';
  const E = window.PaygEngine, $ = (id) => document.getElementById(id);
  const AR = () => typeof currentLang !== 'undefined' && currentLang === 'ar';
  const L = (fr, ar) => (AR() ? ar : fr);
  const nf = (x, d) => (x == null || !isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }));
  const mru = (x) => (x == null || !isFinite(x) ? '—' : nf(Math.round(x)) + ' MRU');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- 1. Thème ---------- */
  const TK = 'payg_theme';
  const isLight = () => document.documentElement.classList.contains('light');
  window.themeColors = () => (isLight() ? { tick: '#475569', grid: 'rgba(15,23,42,.08)', edge: '#ffffff' } : { tick: '#94a3b8', grid: 'rgba(255,255,255,.05)', edge: '#0f172a' });
  function paintTheme() {
    const ic = $('themeIcon'), b = $('themeBtn');
    if (ic) ic.className = 'fa-solid ' + (isLight() ? 'fa-moon' : 'fa-sun');
    if (b) { const t = isLight() ? L('Passer au mode sombre', 'التبديل إلى الوضع الداكن') : L('Passer au mode clair', 'التبديل إلى الوضع الفاتح'); b.title = t; b.setAttribute('aria-label', t); }
    const c = window.vanChartInstance || (typeof vanChartInstance !== 'undefined' ? vanChartInstance : null);
    if (c) { const k = window.themeColors(); c.options.scales.x.ticks.color = k.tick; c.options.scales.y.ticks.color = k.tick; c.options.scales.y.grid.color = k.grid; c.update(); }
  }
  window.toggleTheme = function () {
    const h = document.documentElement, light = !isLight();
    h.classList.toggle('light', light); h.classList.toggle('dark', !light);
    try { localStorage.setItem(TK, light ? 'light' : 'dark'); } catch (e) { /* ignore */ }
    paintTheme(); if (window.StudyUI) window.StudyUI.onLanguage(); // redessine graphiques et tableaux
  };

  /* ---------- 2. Jeux d'hypothèses nommés ---------- */
  const PK = 'payg_hyp_profiles_v1';
  const migP = (o) => { o.list.forEach((x) => { if (x && x.g) E.migrateLegacy(x.g, x.sc); }); return o; }; // anciennes valeurs -> nouvelle ouguiya
  const readP = () => { try { const o = JSON.parse(localStorage.getItem(PK) || 'null'); if (o && Array.isArray(o.list)) return migP(o); } catch (e) { /* ignore */ } return { list: [], active: null }; };
  const writeP = (o) => { if (window.HypDB) window.HypDB.saveProfiles(o); try { localStorage.setItem(PK, JSON.stringify(o)); return true; } catch (e) { alert(L('Enregistrement impossible (stockage du navigateur indisponible).', 'تعذر الحفظ (تخزين المتصفح غير متاح).')); return false; } };
  const snap = (s) => JSON.stringify({ g: s.g, sc: s.sc });
  /* Nom du jeu : commence toujours par le nom du superviseur connecté (« MDA — … ») */
  const SEP = ' — ';
  const supName = () => { try { const u = window.PaygAuth && window.PaygAuth.user(); return u && u.name ? u.name : ''; } catch (e) { return ''; } };
  const supNames = () => { try { return (APP_CONFIG.AUTH_USERS || []).map((u) => u.name); } catch (e) { return []; } };
  function withSup(name) {
    const me = supName(); name = String(name == null ? '' : name).trim(); if (!me) return name;
    const rx = (n) => new RegExp('^\\s*' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[—-]\\s*', 'i');
    supNames().concat([me]).forEach((n) => { name = name.replace(rx(n), ''); }); // retire un ancien préfixe (le jeu d'un autre superviseur n'est pas écrasé)
    name = name.replace(/^\s*[—-]\s*/, '').trim();
    return me + SEP + name;
  }
  function applyProfile(name) {
    const ns = E.defaultState(), P = readP(), p = name == null ? null : P.list.find((x) => x.name === name);
    if (p) { Object.assign(ns.g, p.g); Object.keys(ns.sc).forEach((k) => Object.assign(ns.sc[k], (p.sc || {})[k] || {})); }
    P.active = p ? p.name : null; writeP(P);
    window.StudyUI.setState(ns);
    if (p) { const te = $('tenureInput'), fe = $('freqInput'); if (te && [...te.options].some((o) => o.value === String(ns.sc.central.tenure))) te.value = String(ns.sc.central.tenure); if (fe && [...fe.options].some((o) => o.value === ns.g.freq)) fe.value = ns.g.freq; if (window.StudyUI.renderPricing) window.StudyUI.renderPricing(); }
  }
  function saveProfile() {
    const P = readP(), st = window.StudyUI.getState();
    const me = supName();
    let name = prompt(L('Nom du jeu d’hypothèses à enregistrer :', 'اسم مجموعة الفرضيات المراد حفظها:') + (me ? '\n' + L('(le nom du superviseur « ' + me + ' » est ajouté au début automatiquement)', '(يُضاف اسم المشرف «' + me + '» تلقائيًا في البداية)') : ''), P.active ? withSup(P.active) : (me ? me + SEP : ''));
    if (name == null) return; name = name.trim();
    if (!name || (me && withSup(name) === me + SEP)) return; // nom vide (préfixe seul) : rien à enregistrer
    name = withSup(name).slice(0, 60);
    const i = P.list.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
    if (i >= 0 && !confirm(L('Un jeu nommé « ' + P.list[i].name + ' » existe déjà. Le remplacer ?', 'توجد مجموعة بنفس الاسم. هل تريد استبدالها؟'))) return;
    const rec = { name: i >= 0 ? P.list[i].name : name, saved: new Date().toISOString(), g: JSON.parse(JSON.stringify(st.g)), sc: JSON.parse(JSON.stringify(st.sc)) };
    if (i >= 0) P.list[i] = rec; else P.list.push(rec);
    P.active = rec.name; if (writeP(P)) { sig = ''; renderBar(); }
  }
  /* Superviseur principal (MDA) : seul à pouvoir supprimer un jeu d'hypothèses (règle aussi imposée par la base de données) */
  const isAdmin = () => { try { return !!(window.PaygAuth && window.PaygAuth.isAdmin && window.PaygAuth.isAdmin()); } catch (e) { return false; } };
  async function deleteProfile() {
    const P = readP(); if (!P.active) return;
    if (!isAdmin()) { alert(L('Seul le superviseur principal (MDA) peut supprimer un jeu d’hypothèses.', 'المشرف الرئيسي (MDA) وحده يمكنه حذف مجموعة فرضيات.')); return; }
    if (!confirm(L('Supprimer le jeu « ' + P.active + ' » ?', 'حذف المجموعة «' + P.active + '»؟'))) return;
    const name = P.active;
    const r = window.HypDB && window.HypDB.deleteProfile ? await window.HypDB.deleteProfile(name) : { ok: false, offline: true };
    if (r.ok) {
      const list = r.profiles && Array.isArray(r.profiles.list) ? r.profiles.list : P.list.filter((x) => x.name !== name);
      try { localStorage.setItem(PK, JSON.stringify({ list, active: null })); } catch (e) { /* ignore */ }
      sig = ''; renderBar(); return;
    }
    if (r.denied) { alert(L('Suppression refusée : seul le superviseur principal (MDA) peut supprimer un jeu d’hypothèses.', 'تم رفض الحذف: المشرف الرئيسي (MDA) وحده يمكنه حذف مجموعة فرضيات.')); return; }
    alert(L('Suppression impossible : la base de données est injoignable. Réessayez lorsque la connexion est rétablie.', 'تعذر الحذف: قاعدة البيانات غير متاحة. أعد المحاولة عند عودة الاتصال.'));
  }
  /* Export / import : permet à l'équipe d'échanger ses jeux d'hypothèses par fichier */
  const FMT = 'payg-hypotheses';
  function exportProfiles() {
    const P = readP(), st = window.StudyUI.getState(), list = P.list.map((x) => ({ name: x.name, saved: x.saved, g: x.g, sc: x.sc }));
    const act = P.list.find((x) => x.name === P.active);
    const cur = JSON.parse(snap(st)), ref = act ? JSON.stringify({ g: act.g, sc: act.sc }) : null;
    if (!act || JSON.stringify(cur) !== ref) { const d = new Date(); list.push({ name: withSup(L('Session en cours', 'الجلسة الحالية') + ' ' + d.toISOString().slice(0, 10)), saved: d.toISOString(), g: cur.g, sc: cur.sc }); }
    const blob = new Blob([JSON.stringify({ format: FMT, version: 1, exported: new Date().toISOString(), profiles: list }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hypotheses_payg_' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function cleanProfile(x) { // ne garde que les paramètres connus, avec valeurs numériques valides
    if (!x || typeof x.name !== 'string' || !x.name.trim() || typeof x.g !== 'object' || typeof x.sc !== 'object' || !x.g || !x.sc) return null;
    const d = E.defaultState(), g = {}, sc = {};
    Object.keys(d.g).forEach((k) => { const v = x.g[k]; g[k] = k === 'freq' ? (['daily', 'weekly', 'monthly'].includes(v) ? v : d.g.freq) : (typeof v === 'number' && isFinite(v) ? v : d.g[k]); });
    Object.keys(d.sc).forEach((sk) => { sc[sk] = {}; Object.keys(d.sc[sk]).forEach((f) => { const v = (x.sc[sk] || {})[f]; sc[sk][f] = typeof v === 'number' && isFinite(v) ? v : d.sc[sk][f]; }); });
    E.migrateLegacy(g, sc);
    return { name: x.name.trim().slice(0, 60), saved: typeof x.saved === 'string' ? x.saved : new Date().toISOString(), g, sc };
  }
  function importProfiles() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        let data; try { data = JSON.parse(rd.result); } catch (e) { alert(L('Fichier illisible (JSON invalide).', 'ملف غير صالح (JSON).')); return; }
        if (!data || data.format !== FMT || !Array.isArray(data.profiles)) { alert(L('Ce fichier n’est pas un export de jeux d’hypothèses de cette plateforme.', 'هذا الملف ليس تصدير مجموعات فرضيات من هذه المنصة.')); return; }
        const P = readP(); let added = 0, replaced = 0, skipped = 0;
        data.profiles.forEach((raw) => {
          const c = cleanProfile(raw); if (!c) { skipped++; return; }
          const i = P.list.findIndex((x) => x.name.toLowerCase() === c.name.toLowerCase());
          if (i >= 0) {
            if (confirm(L('Le jeu « ' + P.list[i].name + ' » existe déjà. OK = le remplacer, Annuler = l’importer sous un autre nom.', 'المجموعة «' + P.list[i].name + '» موجودة. موافق = استبدالها، إلغاء = استيرادها باسم آخر.'))) { P.list[i] = c; replaced++; return; }
            let n = 2; while (P.list.some((x) => x.name.toLowerCase() === (c.name + ' (' + n + ')').toLowerCase())) n++;
            c.name = c.name + ' (' + n + ')';
          }
          P.list.push(c); added++;
        });
        if (writeP(P)) { sig = ''; renderBar(); alert(L(added + ' ajouté(s), ' + replaced + ' remplacé(s), ' + skipped + ' ignoré(s). Choisissez un jeu dans la liste pour l’appliquer.', 'أضيف ' + added + '، استبدل ' + replaced + '، تجاهل ' + skipped + '. اختر مجموعة من القائمة لتطبيقها.')); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }
  let sig = '';
  function renderBar() {
    const root = $('hypProfilesRoot'); if (!root || !window.StudyUI) return;
    const P = readP(), st = window.StudyUI.getState(), act = P.list.find((x) => x.name === P.active) || null;
    const ref = act ? snap({ g: Object.assign(E.defaultState().g, act.g), sc: (() => { const d = E.defaultState().sc; Object.keys(d).forEach((k) => Object.assign(d[k], (act.sc || {})[k] || {})); return d; })() }) : snap(E.defaultState());
    const dirty = snap(st) !== ref;
    const s2 = [AR(), P.active, dirty, isAdmin(), P.list.map((x) => x.name + x.saved).join('|')].join('#');
    const chip = $('profChipLabel'); if (chip) chip.textContent = (act ? act.name : L('Défaut', 'الافتراضية')) + (dirty ? ' *' : '');
    if (s2 === sig) return; sig = s2;
    let h = '<div class="bg-slate-950 p-4 border border-slate-800 rounded-xl flex flex-wrap items-center gap-2 text-xs"><i class="fa-solid fa-layer-group text-amber-400"></i><strong class="text-slate-200">' + L('Jeux d’hypothèses', 'مجموعات الفرضيات') + ' :</strong>';
    h += '<select id="profSel" class="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white max-w-[16rem]"><option value="">' + L('Hypothèses par défaut', 'الفرضيات الافتراضية') + '</option>' + P.list.map((x) => '<option value="' + esc(x.name) + '"' + (x.name === P.active ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select>';
    h += '<button type="button" id="profSave" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"><i class="fa-solid fa-floppy-disk mx-1"></i>' + L('Enregistrer sous…', 'حفظ باسم…') + '</button>';
    if (act && isAdmin()) h += '<button type="button" id="profDel" class="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-red-400 hover:bg-slate-700"><i class="fa-solid fa-trash mx-1"></i>' + L('Supprimer', 'حذف') + '</button>';
    h += '<button type="button" id="profExp" class="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"><i class="fa-solid fa-file-export mx-1 text-cyan-400"></i>' + L('Exporter (JSON)', 'تصدير (JSON)') + '</button>';
    h += '<button type="button" id="profImp" class="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"><i class="fa-solid fa-file-import mx-1 text-cyan-400"></i>' + L('Importer (JSON)', 'استيراد (JSON)') + '</button>';
    h += '<span class="text-[11px] ' + (dirty ? 'text-amber-300' : 'text-emerald-400') + '">' + (dirty ? L('Modifié par rapport au jeu chargé', 'معدّلة مقارنة بالمجموعة المحمّلة') : L('Identique au jeu chargé', 'مطابقة للمجموعة المحمّلة')) + '</span>';
    h += '<span class="text-[10px] text-slate-500 w-full">' + L('Les jeux sont enregistrés dans ce navigateur. Chaque modification reste appliquée jusqu’au choix d’un autre jeu.', 'تُحفظ المجموعات في هذا المتصفح. تبقى كل التعديلات مطبّقة حتى اختيار مجموعة أخرى.') + '</span></div>';
    root.innerHTML = h;
    $('profSel').onchange = (e) => applyProfile(e.target.value || null);
    $('profExp').onclick = exportProfiles; $('profImp').onclick = importProfiles;
    $('profSave').onclick = saveProfile; if ($('profDel')) $('profDel').onclick = deleteProfile;
  }
  function chooser(force) {
    const P = readP(); if (!P.list.length && !force) return;
    if (!force) { try { if (sessionStorage.getItem('payg_chooser')) return; sessionStorage.setItem('payg_chooser', '1'); } catch (e) { /* ignore */ } }
    const old = $('profModal'); if (old) old.remove();
    const m = document.createElement('div'); m.id = 'profModal'; m.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4'; m.style.background = 'rgba(2,6,23,.6)';
    let h = '<div class="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-2"><h3 class="text-base font-bold text-white mb-1"><i class="fa-solid fa-layer-group text-amber-400 mx-1.5"></i>' + L('Choisir les hypothèses', 'اختيار الفرضيات') + '</h3><p class="text-xs text-slate-400 mb-2">' + L('Partir des hypothèses par défaut ou d’un jeu enregistré par l’équipe.', 'ابدأ بالفرضيات الافتراضية أو بمجموعة حفظها الفريق.') + '</p>';
    h += '<button data-p="" class="w-full text-start px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-amber-500 text-xs text-slate-200 font-bold">' + L('Hypothèses par défaut', 'الفرضيات الافتراضية') + '</button>';
    P.list.forEach((x, i) => { h += '<button data-p="' + (i + 1) + '" class="w-full text-start px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-amber-500 text-xs text-slate-200"><strong>' + esc(x.name) + '</strong> <span class="text-slate-500 font-mono">' + esc((x.saved || '').slice(0, 10)) + '</span></button>'; });
    h += '<button data-p="keep" class="w-full text-center px-3 py-2 rounded-xl text-[11px] text-slate-400 hover:text-white">' + L('Continuer avec la session en cours', 'المتابعة بالجلسة الحالية') + '</button></div>';
    m.innerHTML = h; document.body.appendChild(m);
    m.addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (!b && e.target !== m) return; if (b && b.dataset.p !== 'keep') applyProfile(b.dataset.p === '' ? null : P.list[+b.dataset.p - 1].name); m.remove(); sig = ''; renderBar(); });
  }
  window.openProfileChooser = () => chooser(true);

  /* ---------- 3. Méthode de calcul en direct ---------- */
  const open = {};
  const det = (id, title, body) => '<details data-id="' + id + '" ' + (open[id] !== false ? 'open' : '') + ' class="bg-slate-950 border border-slate-800 rounded-xl p-4"><summary class="cursor-pointer text-xs font-bold text-amber-400">' + title + '</summary><div class="mt-3 overflow-x-auto">' + body + '</div></details>';
  const tbl = (heads, rows) => '<table class="w-full text-[11px] text-slate-300"><thead><tr class="text-slate-500">' + heads.map((h) => '<th class="py-1 px-2 text-start">' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr class="border-t border-slate-800 align-top">' + r.map((c, i) => '<td class="py-1.5 px-2' + (i === 1 ? ' font-mono" dir="ltr' : i === 2 ? ' font-mono text-slate-200" dir="ltr' : '') + '">' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  const keep = (root, html) => { root.innerHTML = html; root.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', () => { open[d.dataset.id] = d.open; })); };

  function priceMethod() {
    const root = $('priceMethodRoot'); if (!root) return;
    const { p } = window.StudyUI.priceInputs(), r = E.buildPrice(p), P = r.parts, d = p.depositPct / 100, m = p.marginPct / 100, c = p.commissionPct / 100, n = Math.max(1, p.tenure);
    const base = P.kit + P.install + P.iot, fin = base * (1 - d), c0 = base + P.financing + P.insurance + P.servicing + P.risk, ppy = { daily: 360, weekly: 52, monthly: 12 }[p.freq];
    const st = window.StudyUI.getState();
    const rows = [
      ['1. ' + L('Coût du kit', 'تكلفة النظام'), L('prix comptant × ratio d’achat', 'السعر النقدي × نسبة الشراء'), nf(p.cashPrice) + ' × ' + p.costRatio + ' % = ' + mru(P.kit)],
      ['2. ' + L('Installation', 'التركيب'), L('prix comptant × % installation', 'السعر النقدي × نسبة التركيب'), nf(p.cashPrice) + ' × ' + p.installPct + ' % = ' + mru(P.install)],
      ['3. IoT', L('montant fixe par kit', 'مبلغ ثابت لكل نظام'), mru(P.iot)],
      ['4. ' + L('Base (coût d’acquisition)', 'الأساس (تكلفة الاقتناء)'), '1 + 2 + 3', mru(base)],
      ['5. ' + L('Capital financé', 'رأس المال الممول'), L('base × (1 − acompte %)', 'الأساس × (1 − المقدمة)'), nf(base) + ' × (1 − ' + p.depositPct + ' %) = ' + mru(fin)],
      ['6. ' + L('Coût de financement', 'تكلفة التمويل'), L('financé × taux × durée/12 × (n+1)/(2n), n = durée en mois', 'الممول × المعدل × المدة/12 × (n+1)/(2n)'), nf(fin) + ' × ' + p.fundingRate + ' % × ' + n + '/12 × ' + nf((n + 1) / (2 * n), 3) + ' = ' + mru(P.financing)],
      ['7. ' + L('Assurance', 'التأمين'), L('prime % × prix comptant × durée/12 (si assuré)', 'القسط × السعر النقدي × المدة/12 (عند التأمين)'), p.insured ? nf(p.cashPrice) + ' × ' + p.insRate + ' % × ' + n + '/12 = ' + mru(P.insurance) : L('non assuré = 0', 'بدون تأمين = 0')],
      ['8. ' + L('Suivi client', 'متابعة العميل'), L('coût/mois × durée', 'التكلفة الشهرية × المدة'), nf(p.servicing) + ' × ' + n + ' = ' + mru(P.servicing)],
      ['9. ' + L('Risque d’impayés', 'مخصص التعثر'), L('financé × taux d’impayés', 'الممول × نسبة التعثر'), nf(fin) + ' × ' + p.defaultRate + ' % = ' + mru(P.risk)],
      ['10. C0', '4 + 6 + 7 + 8 + 9', mru(c0)],
      ['11. ' + L('Prix total PAYG', 'السعر الإجمالي'), 'C0 × (1+m) ÷ (1 − c × (1+m))', nf(c0) + ' × ' + nf(1 + m, 3) + ' ÷ (1 − ' + nf(c, 3) + ' × ' + nf(1 + m, 3) + ') = <strong>' + mru(r.total) + '</strong>'],
      ['12. ' + L('Commission mobile', 'عمولة الدفع'), L('c × prix total', 'c × السعر الإجمالي'), p.commissionPct + ' % × ' + nf(r.total) + ' = ' + mru(P.commission)],
      ['13. ' + L('Marge', 'الهامش'), 'm × (C0 + ' + L('commission', 'العمولة') + ')', p.marginPct + ' % × ' + nf(c0 + P.commission) + ' = ' + mru(P.margin)],
      ['14. ' + L('Acompte', 'الدفعة المقدمة'), L('acompte % × prix total', 'المقدمة × السعر الإجمالي'), mru(r.deposit)],
      ['15. ' + L('Nombre d’échéances', 'عدد الأقساط'), L('durée × périodes/an ÷ 12', 'المدة × الفترات/السنة ÷ 12'), n + ' × ' + ppy + ' ÷ 12 = ' + r.periods],
      ['16. ' + L('Échéance', 'القسط'), L('(prix total − acompte) ÷ nb échéances', '(السعر − المقدمة) ÷ عدد الأقساط'), '(' + nf(r.total) + ' − ' + nf(r.deposit) + ') ÷ ' + r.periods + ' = <strong>' + mru(r.installment) + '</strong>'],
      ['17. ' + L('Équivalent mensuel', 'المعادل الشهري'), L('(prix total − acompte) ÷ durée', '(السعر − المقدمة) ÷ المدة'), mru(r.monthlyEquivalent)],
      [L('Vérification', 'التحقق'), L('Σ composantes = prix total', 'مجموع المكونات = السعر'), nf(r.checksum) + ' − ' + nf(r.total) + ' = ' + nf(r.checksum - r.total, 2) + ' ✓']
    ];
    const note = '<p class="text-[10px] text-slate-500 mb-2">' + L('Paramètres : scénario Central (ratio, impayés, marge, prime) ; acompte imposé par le Mauri-Score (' + p.depositPct + ' %) alors que le module 4 utilise l’hypothèse commune (' + st.g.deposit_pct + ' %).', 'المعاملات: السيناريو الأساسي؛ المقدمة يحددها Mauri-Score (' + p.depositPct + '%) بينما يستخدم النموذج المالي الفرضية المشتركة (' + st.g.deposit_pct + '%).') + '</p>';
    keep(root, det('price', L('Méthode de calcul du prix PAYG (valeurs en direct)', 'طريقة حساب السعر PAYG (بقيم حية)'), note + tbl([L('Étape', 'الخطوة'), L('Formule', 'الصيغة'), L('Application numérique', 'التطبيق العددي')], rows)));
  }

  function finMethod() {
    const root = $('finMethodRoot'); if (!root) return;
    const S = window.StudyUI, k = S.getActive(), r = S.getResults()[k], st = S.getState(), s = st.sc[k], g = st.g; if (!r) return;
    const F = r.flows, rm = Math.pow(1 + s.discount / 100, 1 / 12) - 1, D = Math.max(1, Math.round(s.tenure));
    let pv = 0; F.forEach((f, t) => { if (t) pv += f / Math.pow(1 + rm, t); });
    let cum = 0, trough = 0, tm = 0, pb = null, cumPb = null; F.forEach((f, t) => { cum += f; if (cum < trough) { trough = cum; tm = t; } if (pb == null && cum >= 0 && t > 0) { pb = t; cumPb = cum; } });
    const im = r.irr == null ? null : Math.pow(1 + r.irr, 1 / 12) - 1, npvIrr = im == null ? null : F.reduce((a, f, t) => a + f / Math.pow(1 + im, t), 0);
    const U = r.unit, life = r.revenuePerClient, contr = r.contributionPerClient, y1 = r.years[0];
    const rows = [
      [L('Flux mensuel Fₜ', 'التدفق الشهري'), 'F₀ = −CAPEX + ' + L('subvention', 'المنحة') + ' ; Fₜ = ' + L('encaissements − coûts variables − coûts fixes/12', 'المقبوضات − المتغيرة − الثابتة/12'), 'F₀ = −' + nf(r.capex) + ' + ' + nf(s.grant) + ' = ' + mru(F[0]) + ' ; F₁ = ' + mru(F[1]) + ' ; F₁₂ = ' + mru(F[12]) + ' ; F₆₀ = ' + mru(F[60])],
      [L('Valeurs par client', 'قيم كل عميل'), L('moyenne pondérée assurés / non assurés (' + g.insurance_takeup + ' % assurés)', 'متوسط مرجح للمؤمَّنين وغير المؤمَّنين'), L('prix ', 'السعر ') + mru(U.price) + ' ; ' + L('acompte ', 'المقدمة ') + mru(U.deposit) + ' ; ' + L('mensualité ', 'القسط الشهري ') + mru(U.instMonthly) + ' ; ' + L('achat+install+IoT ', 'الاقتناء ') + mru(U.acqCost)],
      ['VAN', 'Σₜ Fₜ ÷ (1+rₘ)ᵗ , t = 0…60 ; rₘ = (1+r)^(1/12) − 1', 'r = ' + s.discount + ' % → rₘ = ' + nf(rm * 100, 3) + ' % ; F₀ + Σₜ≥₁ = ' + nf(F[0]) + ' + ' + nf(pv) + ' = <strong>' + mru(F[0] + pv) + '</strong>'],
      ['TRI', L('rₘ* tel que VAN(rₘ*) = 0 (dichotomie) ; TRI = (1+rₘ*)¹² − 1', 'المعدل الذي تنعدم عنده VAN (تنصيف) ؛ TRI = (1+rₘ*)¹² − 1'), im == null ? L('non calculable (pas de changement de signe)', 'غير قابل للحساب') : 'rₘ* = ' + nf(im * 100, 3) + ' % → TRI = <strong>' + nf(r.irr * 100, 1) + ' %</strong> ; VAN(rₘ*) = ' + nf(npvIrr, 2) + ' ≈ 0 ✓'],
      ['Payback', L('premier mois t où Σ Fᵢ (i ≤ t) ≥ 0', 'أول شهر يصبح فيه المجموع التراكمي ≥ 0'), pb == null ? L('> 60 mois (cumul final ', '> 60 شهرا (التراكمي ') + mru(cum) + ')' : 't = ' + pb + ' ' + L('mois', 'شهرا') + ' ; ' + L('cumul = ', 'التراكمي = ') + mru(cumPb)],
      [L('Besoin de financement', 'حاجة التمويل'), L('− min des cumuls de Fₜ', '− أدنى قيمة للتراكمي'), L('creux au mois ', 'الأدنى في الشهر ') + tm + ' : ' + mru(trough) + ' → <strong>' + mru(r.fundingNeed) + '</strong>'],
      [L('Seuil de rentabilité', 'عتبة المردودية'), L('coûts fixes annuels ÷ contribution par client', 'الثابتة السنوية ÷ مساهمة العميل'), L('revenu/cycle ', 'الإيراد ') + mru(life) + ' − ' + L('variables ', 'المتغيرة ') + mru(life - contr) + ' = ' + mru(contr) + ' ; ' + nf(r.fixedAnnual) + ' ÷ ' + nf(contr) + ' → <strong>' + (r.breakEvenClients == null ? '—' : nf(r.breakEvenClients)) + '</strong> ' + L('clients/an', 'عميل/سنة') + ' (' + L('avec amort. : ', 'مع الاهتلاك: ') + (r.breakEvenWithCapex == null ? '—' : nf(r.breakEvenWithCapex)) + ')'],
      [L('Résultats annuels', 'النتائج السنوية'), L('CA = Σ encaissements ; marge brute = CA − variables ; résultat avant impôt = marge − fixes − CAPEX/5 ; impôt = taux × max(0 ; résultat − déficits reportés) ; résultat net = résultat − impôt ; cash = Σ Fₜ (avant impôt)', 'رقم المعاملات = المقبوضات؛ الهامش = ... ؛ النتيجة قبل الضريبة = الهامش − الثابتة − CAPEX/5 ؛ الضريبة = المعدل × max(0 ؛ النتيجة − الخسائر المرحّلة) ؛ النتيجة الصافية = النتيجة − الضريبة'), L('An 1 : ', 'سنة 1: ') + nf(y1.revenue) + ' − ' + nf(y1.variable) + ' = ' + nf(y1.grossMargin) + ' ; ' + L('résultat avant impôt ', 'النتيجة قبل الضريبة ') + nf(y1.result) + ' ; ' + L('impôt ', 'الضريبة ') + nf(y1.tax) + ' (' + nf(g.tax_rate == null ? 25 : g.tax_rate, 1) + ' %) ; ' + L('résultat net ', 'النتيجة الصافية ') + nf(y1.netResult) + ' ; cash ' + nf(y1.cash)]
    ];
    keep(root, det('fin', L('Méthode de calcul des indicateurs financiers — scénario ', 'طريقة حساب المؤشرات المالية — السيناريو ') + esc(E.SCENARIO_NAMES[k][AR() ? 'ar' : 'fr']) + L(' (valeurs en direct)', ' (بقيم حية)'), tbl([L('Indicateur', 'المؤشر'), L('Formule', 'الصيغة'), L('Application numérique (MRU)', 'التطبيق العددي')], rows)));
  }


  function scoreMethod() {
    const root = $('scoreMethodRoot'); if (!root) return;
    const iv = (id, d) => parseInt(($(id) || {}).value, 10) || d;
    const income = iv('incomeInput', 15000), vol = iv('mobileVolInput', 2), ass = iv('assetsInput', 2), wil = iv('wilayaInput', 3);
    const incS = Math.min(300, (income / 60000) * 300), vS = vol * 75, aS = ass * 70, wS = wil * 45, raw = 300 + incS + vS + aS + wS, tot = Math.min(850, Math.max(300, Math.round(raw)));
    const tier = tot >= 700 ? [L('Risque faible', 'مخاطر منخفضة'), '10 %', '75 000'] : tot >= 550 ? [L('Risque modéré', 'مخاطر متوسطة'), '20 %', '35 000'] : [L('Risque élevé', 'مخاطر مرتفعة'), '30 %', '15 000'];
    const rows = [
      [L('Base', 'الأساس'), L('constante', 'ثابت'), '300'],
      [L('Revenu du foyer', 'دخل الأسرة'), 'min(300 ; ' + L('revenu', 'الدخل') + ' ÷ 60 000 × 300)', 'min(300 ; ' + nf(income) + ' ÷ 60 000 × 300) = ' + nf(incS, 1)],
      [L('Paiement mobile', 'الدفع عبر الهاتف'), L('niveau (1-3) × 75', 'المستوى (1-3) × 75'), vol + ' × 75 = ' + vS],
      [L('Actifs & garanties', 'الأصول والضمانات'), L('niveau (1-3) × 70', 'المستوى (1-3) × 70'), ass + ' × 70 = ' + aS],
      [L('Wilaya', 'الولاية'), L('niveau (1-3) × 45', 'المستوى (1-3) × 45'), wil + ' × 45 = ' + wS],
      [L('Score', 'النقاط'), L('arrondi (somme) borné entre 300 et 850', 'مجموع مقرّب محصور بين 300 و850'), L('somme = ', 'المجموع = ') + nf(raw, 1) + ' → <strong>' + tot + '</strong> / 850' + (raw > 850 ? ' (' + L('plafonné', 'محصور') + ')' : '')],
      [L('Décision', 'القرار'), L('≥ 700 : 10 % / 75 000 · 550-699 : 20 % / 35 000 · < 550 : 30 % / 15 000 (acompte / plafond MRU)', '≥700 : 10% / 75 000 · 550-699 : 20% / 35 000 · <550 : 30% / 15 000'), tier[0] + ' → ' + L('acompte ', 'مقدمة ') + tier[1] + ', ' + L('plafond ', 'سقف ') + tier[2] + ' MRU']
    ];
    const note = '<p class="text-[10px] text-slate-500 mb-2">' + L('Mécanisme expérimental : pondérations choisies par l’équipe, non calibrées sur des remboursements réels. L’acompte calculé ici est celui utilisé par le module 2 ; les seuils et plafonds sont des paliers fixes (pas un calcul).', 'آلية تجريبية: أوزان اختارها الفريق وغير معايَرة على سداد فعلي. المقدمة المحسوبة هنا هي المستخدمة في الوحدة 2؛ العتبات والسقوف شرائح ثابتة وليست حسابا.') + '</p>';
    keep(root, det('score', L('Méthode de calcul du Mauri-Score (valeurs en direct)', 'طريقة حساب Mauri-Score (بقيم حية)'), note + tbl([L('Composante', 'المكوّن'), L('Formule', 'الصيغة'), L('Application numérique', 'التطبيق العددي')], rows)));
  }

  function surveyMethod() {
    const root = $('surveyMethodRoot'); if (!root) return;
    const S = window.StudyUI, I = S.getIndicators(), st = S.getState();
    if (!I) { root.innerHTML = ''; return; }
    const D = I.distributions, cnt = (d, ...v) => (d ? d.items.filter((i) => v.includes(i.value)).reduce((a, i) => a + i.count, 0) : 0);
    const rows = [], pct = (x, d) => (x == null ? '—' : nf(x * 100, d == null ? 1 : d) + ' %');
    const ci = (c) => (c ? pct(c[0]) + ' – ' + pct(c[1]) : '—');
    rows.push([L('Échantillon n', 'حجم العينة n'), L('participants enregistrés (sinon max. des réponses par question)', 'عدد المشاركين المسجلين'), nf(I.market_sample_size) + ' (' + I.sample_quality + ')']);
    if (D.interest && D.interest.total) {
      const y = cnt(D.interest, 'oui'), m = cnt(D.interest, 'peut_etre'), t0 = D.interest.total;
      rows.push([L('Intérêt PAYG', 'الاهتمام بـ PAYG'), L('(oui + peut-être) ÷ réponses', '(نعم + ربما) ÷ الإجابات'), '(' + y + ' + ' + m + ') ÷ ' + t0 + ' = <strong>' + pct(I.payg_interest_rate) + '</strong>']);
      rows.push([L('Intention d’achat', 'نية الشراء'), L('oui ferme ÷ réponses', 'نعم القاطعة ÷ الإجابات'), y + ' ÷ ' + t0 + ' = <strong>' + pct(I.purchase_intention_rate) + '</strong>']);
      rows.push([L('IC 95 % (Wilson)', 'فاصل الثقة 95% (Wilson)'), 'p̂ = k/n ; z = 1,96 ; centre = (p̂ + z²/2n) ÷ (1 + z²/n) ; demi-largeur = z·√(p̂(1−p̂)/n + z²/4n²) ÷ (1 + z²/n)', L('intérêt : ', 'الاهتمام: ') + ci(I.payg_interest_ci) + ' ; ' + L('intention : ', 'النية: ') + ci(I.purchase_intention_ci)]);
    }
    const mp = D.monthlyPrice;
    if (mp && mp.total) {
      rows.push([L('Part pouvant payer ≥ p', 'نسبة القادرين على دفع ≥ p'), L('Σ effectif × f ÷ total ; f = 1 si p ≤ borne basse, 0 si p ≥ borne haute, sinon (haute − p) ÷ (haute − basse) (répartition uniforme dans la tranche)', 'مجموع (العدد × f) ÷ المجموع؛ توزيع منتظم داخل الشريحة'), L('voir tableau des tranches ci-dessous', 'انظر جدول الشرائح أدناه')]);
      const ref = I.reference_monthly_price, sh = ref != null ? E.shareAtLeast(mp, 'monthlyPrice', ref) : null;
      rows.push([L('Prix de référence', 'السعر المرجعي'), L('p tel que part(p) = couverture (dichotomie, 60 itérations)', 'p بحيث تساوي النسبة التغطية (تنصيف)'), L('couverture ', 'التغطية ') + st.g.coverage + ' % → p = <strong>' + mru(ref) + '</strong> ; ' + L('contrôle part(p) = ', 'تحقق: ') + pct(sh)]);
      rows.push([L('Médiane', 'الوسيط'), L('même méthode, couverture = 50 %', 'نفس الطريقة بتغطية 50%'), mru(I.median_monthly_payment)]);
      rows.push([L('Moyenne', 'المتوسط'), L('Σ effectif × milieu de tranche ÷ total ; tranche ouverte [b ; 1,5·b]', 'مجموع (العدد × منتصف الشريحة) ÷ المجموع؛ الشريحة المفتوحة [b ; 1,5b]'), mru(I.average_monthly_payment)]);
      rows.push([L('P75', 'الشريحة 75%'), L('couverture = 75 %', 'تغطية 75%'), mru(I.monthly_price_p75)]);
    }
    if (D.totalPrice && D.totalPrice.total) rows.push([L('Prix total acceptable (médiane)', 'السعر الإجمالي المقبول (وسيط)'), L('même méthode sur les tranches de prix total', 'نفس الطريقة على شرائح السعر الإجمالي'), mru(I.median_total_price)]);
    if (I.preferred_financing_label) rows.push([L('Durée / fréquence préférées', 'المدة / الوتيرة المفضلة'), L('mode = réponse la plus fréquente', 'المنوال = الإجابة الأكثر تكرارا'), esc(I.preferred_financing_label) + ' / ' + esc(I.preferred_payment_label || '—')]);
    if (D.insurance && D.insurance.total) rows.push([L('Intérêt micro-assurance', 'الاهتمام بالتأمين'), L('(oui + oui si prime faible) ÷ réponses', '(نعم + نعم إذا انخفض القسط) ÷ الإجابات'), cnt(D.insurance, 'oui', 'oui_si_prix') + ' ÷ ' + D.insurance.total + ' = ' + pct(I.insurance_interest_rate)]);
    if (D.lock && D.lock.total) rows.push([L('Acceptation du verrouillage', 'قبول القفل التلقائي'), L('(oui + oui avec délai) ÷ réponses', '(نعم + نعم مع مهلة) ÷ الإجابات'), pct(I.lock_acceptance_rate)]);
    const dem = E.demandHypothesis(I, st.g);
    if (dem) rows.push([L('Demande plausible', 'الطلب المحتمل'), L('taux = oui + peut-être × conversion ; clients = marché adressable × taux', 'النسبة = نعم + ربما × التحويل؛ العملاء = السوق المستهدف × النسبة'), pct(I.purchase_intention_rate) + ' + ' + pct(I.maybe_rate) + ' × ' + st.g.maybe_conv + ' % = ' + pct(dem.rate) + ' ; ' + nf(st.g.addressable) + ' × ' + pct(dem.rate) + ' = <strong>' + nf(dem.customers) + '</strong> ' + L('clients', 'عميل')]);
    let bands = '';
    if (mp && mp.total) {
      const ref = I.reference_monthly_price, br = [];
      mp.items.forEach((i) => { const b = E.BANDS.monthlyPrice[i.value]; if (!b) return; const lo = b[0], hi = b[1] == null ? b[0] * 1.5 : b[1], f = ref == null ? null : ref <= lo ? 1 : ref >= hi ? 0 : (hi - ref) / (hi - lo); br.push([esc(i.label_fr), nf(lo) + ' – ' + nf(hi) + (b[1] == null ? ' *' : ''), nf(i.count) + ' (' + nf(i.pct, 1) + ' %)', f == null ? '—' : nf(f, 3)]); });
      bands = '<div class="mt-4 text-[11px] font-bold text-slate-300 mb-1">' + L('Tranches « montant mensuel maximum » et fraction f au prix de référence', 'شرائح «المبلغ الشهري الأقصى» والكسر f عند السعر المرجعي') + '</div>' + tbl([L('Tranche', 'الشريحة'), L('Bornes (MRU)', 'الحدود'), L('Effectif', 'العدد'), 'f'], br) + '<p class="text-[10px] text-slate-500 mt-1">* ' + L('tranche ouverte : borne haute = 1,5 × borne basse (hypothèse).', 'شريحة مفتوحة: الحد الأعلى = 1,5 × الأدنى (فرضية).') + '</p>';
    }
    keep(root, det('survey', L('Méthode de calcul des indicateurs de l’enquête (valeurs en direct)', 'طريقة حساب مؤشرات الاستبيان (بقيم حية)'), '<p class="text-[10px] text-slate-500 mb-2">' + L('Échantillon non probabiliste : les indicateurs décrivent les répondants, pas la population.', 'عينة غير احتمالية: المؤشرات تصف المجيبين وليس السكان.') + '</p>' + tbl([L('Indicateur', 'المؤشر'), L('Formule', 'الصيغة'), L('Application numérique', 'التطبيق العددي')], rows) + bands));
  }

  window.Extras = { render() { try { renderBar(); priceMethod(); finMethod(); scoreMethod(); surveyMethod(); } catch (e) { console.error('[extras]', e); } }, paintTheme, chooser: () => chooser(false),
    // Jeux d'hypothèses nommés : lecture / réception depuis la base de données (sans renvoi à la base)
    getProfiles: () => readP(),
    applyRemoteProfiles(o) {
      if (!o || !Array.isArray(o.list)) return;
      migP(o);
      try { localStorage.setItem(PK, JSON.stringify({ list: o.list, active: o.active || null })); } catch (e) { /* ignore */ }
      sig = ''; renderBar();
    } };
  window.addEventListener('payg-auth', () => { sig = ''; try { renderBar(); } catch (e) { /* ignore */ } }); // les droits (MDA) changent à la connexion / déconnexion
  const tb = $('themeBtn'); if (tb) tb.addEventListener('click', window.toggleTheme);
  const pc = $('profChip'); if (pc) pc.addEventListener('click', window.openProfileChooser);
  paintTheme(); window.Extras.render(); chooser(false);
})();
