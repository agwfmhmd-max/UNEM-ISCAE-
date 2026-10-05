/* auth.js — Écran de connexion des superviseurs (Supabase Auth).
 *  - Le superviseur choisit son nom dans la liste, puis saisit le mot de passe du compte
 *    « User » correspondant dans Supabase (Authentication → Users).
 *  - Client d'authentification SÉPARÉ du client de données : les lectures (équipe, enquête,
 *    hypothèses) continuent d'utiliser la clé anonyme exactement comme avant.
 *  - La session est conservée de façon PERMANENTE (localStorage) : fermer l'onglet ou le navigateur ne
 *    déconnecte pas ; le jeton est renouvelé automatiquement. Seul le bouton « Déconnexion » met fin à la session.
 *  - N'altère aucune formule ni aucune autre fonction du site. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const AR = () => typeof currentLang !== 'undefined' && currentLang === 'ar';
  const T = {
    fr: {
      title: 'Accès réservé aux superviseurs', sub: 'Choisissez votre nom puis saisissez votre mot de passe.',
      user: 'Superviseur', pick: '— Choisir votre nom —', pwd: 'Mot de passe', show: 'Afficher le mot de passe', hide: 'Masquer le mot de passe',
      login: 'Se connecter', loading: 'Connexion…', logout: 'Déconnexion', lang: 'العربية',
      needUser: 'Veuillez choisir votre nom.', needPwd: 'Veuillez saisir votre mot de passe.',
      bad: 'Mot de passe incorrect. Vérifiez-le et réessayez.', net: 'Connexion impossible : vérifiez votre accès Internet et réessayez.',
      unconf: 'Compte non configuré : renseignez l’e-mail de ce superviseur dans APP_CONFIG.AUTH_USERS (index.html).',
      nolib: 'Service d’authentification indisponible (Supabase non chargé). Vérifiez votre connexion Internet puis rechargez la page.',
      unconfirmed: 'Ce compte n’est pas encore confirmé dans Supabase.', other: 'Connexion refusée. Réessayez.', welcome: 'Connecté :'
    },
    ar: {
      title: 'الدخول مخصص للمشرفين', sub: 'اختر اسمك ثم أدخل كلمة المرور.',
      user: 'المشرف', pick: '— اختر اسمك —', pwd: 'كلمة المرور', show: 'إظهار كلمة المرور', hide: 'إخفاء كلمة المرور',
      login: 'تسجيل الدخول', loading: 'جارٍ الدخول…', logout: 'تسجيل الخروج', lang: 'Français',
      needUser: 'الرجاء اختيار اسمك.', needPwd: 'الرجاء إدخال كلمة المرور.',
      bad: 'كلمة المرور غير صحيحة. تحقق منها وأعد المحاولة.', net: 'تعذر الاتصال: تحقق من الإنترنت وأعد المحاولة.',
      unconf: 'الحساب غير مهيأ: أدخل بريد هذا المشرف في APP_CONFIG.AUTH_USERS (ملف index.html).',
      nolib: 'خدمة المصادقة غير متاحة (لم يتم تحميل Supabase). تحقق من الإنترنت ثم أعد تحميل الصفحة.',
      unconfirmed: 'هذا الحساب غير مؤكد بعد في Supabase.', other: 'تم رفض الدخول. أعد المحاولة.', welcome: 'متصل:'
    }
  };
  const t = (k) => T[AR() ? 'ar' : 'fr'][k];

  let client = null, current = null, busy = false;
  const cfg = () => (typeof APP_CONFIG !== 'undefined' && APP_CONFIG) || {};
  const users = () => (Array.isArray(cfg().AUTH_USERS) ? cfg().AUTH_USERS : []);
  const byName = (n) => users().find((u) => u.name === n) || null;
  // Un compte « User » Supabase par superviseur (APP_CONFIG.AUTH_USERS : name + email). Le superviseur principal (admin: true) est MDA.
  const emailOf = (u) => String((u && u.email) || '').trim().toLowerCase();
  const byEmail = (e) => users().find((u) => emailOf(u) && emailOf(u) === String(e || '').trim().toLowerCase()) || null;
  const unconfigured = (u) => !u || !emailOf(u);

  function getClient() {
    if (client) return client;
    if (!cfg().SUPABASE_URL || !cfg().SUPABASE_ANON_KEY) return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
    let store; try { store = window.localStorage; } catch (e) { store = undefined; }
    client = window.supabase.createClient(cfg().SUPABASE_URL, cfg().SUPABASE_ANON_KEY, {
      auth: { storage: store, storageKey: 'payg-supervisor-auth', persistSession: !!store, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return client;
  }

  /* ---------- Affichage ---------- */
  function setError(msg) {
    const el = $('lgError'); if (!el) return;
    if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.textContent = msg; el.classList.remove('hidden');
  }
  function paint() {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('lgTitle', t('title')); set('lgSub', t('sub')); set('lgUserLbl', t('user')); set('lgPwdLbl', t('pwd'));
    set('lgSubmitTxt', busy ? t('loading') : t('login')); set('lgLangTxt', t('lang')); set('authLogoutTxt', t('logout'));
    const sel = $('lgUser');
    if (sel) {
      const keep = sel.value;
      sel.innerHTML = '';
      const o0 = document.createElement('option'); o0.value = ''; o0.textContent = t('pick'); sel.appendChild(o0);
      users().forEach((u) => { const o = document.createElement('option'); o.value = u.name; o.textContent = u.name; sel.appendChild(o); });
      sel.value = keep && byName(keep) ? keep : '';
    }
    const eye = $('lgEye'), pw = $('lgPwd');
    if (eye && pw) eye.setAttribute('aria-label', pw.type === 'password' ? t('show') : t('hide'));
    const nm = $('authName'); if (nm) nm.textContent = current ? current.name : '';
    const bd = $('authBadge'); if (bd) { bd.classList.toggle('hidden', !(current && current.admin)); bd.textContent = AR() ? 'المشرف الرئيسي' : 'Principal'; }
  }
  function unlock(u) {
    current = u;
    document.documentElement.classList.remove('auth-locked');
    const chip = $('authChip'); if (chip) { chip.classList.remove('hidden'); chip.classList.add('flex'); }
    const pw = $('lgPwd'); if (pw) pw.value = '';
    setError(''); paint();
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ } // redessine les graphiques
    try { window.dispatchEvent(new CustomEvent('payg-auth', { detail: { user: current } })); } catch (e) { /* ignore */ } // droits MDA, statistiques, base de données des hypothèses
    try { if (window.HypDB) window.HypDB.load(); } catch (e) { /* ignore */ }
  }
  function lock() {
    current = null;
    document.documentElement.classList.add('auth-locked');
    const chip = $('authChip'); if (chip) { chip.classList.add('hidden'); chip.classList.remove('flex'); }
    try { window.dispatchEvent(new CustomEvent('payg-auth', { detail: { user: null } })); } catch (e) { /* ignore */ }
    const pw = $('lgPwd'); if (pw) pw.value = '';
    busy = false; const b = $('lgSubmit'); if (b) b.disabled = false;
    paint();
  }

  /* ---------- Connexion / déconnexion ---------- */
  async function submit(ev) {
    if (ev) ev.preventDefault();
    if (busy) return;
    const name = $('lgUser').value, pwd = $('lgPwd').value;
    if (!name) { setError(t('needUser')); return; }
    if (!pwd) { setError(t('needPwd')); return; }
    const u = byName(name);
    if (unconfigured(u)) { setError(t('unconf')); return; }
    const c = getClient();
    if (!c) { setError(t('nolib')); return; }
    busy = true; $('lgSubmit').disabled = true; setError(''); paint();
    try {
      const { data, error } = await c.auth.signInWithPassword({ email: emailOf(u), password: pwd });
      if (error) {
        const m = String(error.message || '');
        if (/confirm/i.test(m)) setError(t('unconfirmed'));
        else if (/invalid|credential|password/i.test(m) || error.status === 400) setError(t('bad'));
        else if (/fetch|network|failed/i.test(m) || error.status === 0) setError(t('net'));
        else setError(t('other'));
        return;
      }
      unlock(u);
      try { const r = await c.rpc('payg_log_login'); if (r && r.error) console.warn('[auth-log]', r.error.message); } catch (e2) { /* le journal est facultatif côté navigateur */ } // journal des connexions (voir supabase_security.sql)
    } catch (e) {
      console.error('[auth-login]', e);
      setError(t('net'));
    } finally {
      busy = false; const b = $('lgSubmit'); if (b) b.disabled = false; paint();
    }
  }
  async function logout() {
    try { const c = getClient(); if (c) await c.auth.signOut(); } catch (e) { console.error('[auth-logout]', e); }
    try { localStorage.removeItem('payg-supervisor-auth'); } catch (e) { /* ignore */ }
    lock();
  }

  async function restore() {
    const c = getClient();
    if (!c) return;
    try {
      const { data } = await c.auth.getSession();
      const s = data && data.session;
      const u = s && s.user ? byEmail(s.user.email) : null;
      if (u) unlock(u);
      else if (s) { await c.auth.signOut(); } // session valide mais compte non reconnu : on redemande la connexion
    } catch (e) {
      console.error('[auth-restore]', e);
      // base injoignable au démarrage (hors connexion) : on garde le superviseur connecté tant qu'il ne s'est pas déconnecté
      try { const raw = localStorage.getItem('payg-supervisor-auth'); const m = raw && raw.match(/"email"\s*:\s*"([^"]+)"/); const u = m ? byEmail(m[1]) : null; if (u) unlock(u); } catch (e2) { /* ignore */ }
    }
    c.auth.onAuthStateChange((evt, session) => { if (evt === 'SIGNED_OUT' && current) lock(); });
  }

  function init() {
    const form = $('lgForm'); if (!form) return;
    form.addEventListener('submit', submit);
    $('lgEye').addEventListener('click', () => { const p = $('lgPwd'); p.type = p.type === 'password' ? 'text' : 'password'; $('lgEyeIcon').className = 'fa-solid ' + (p.type === 'password' ? 'fa-eye' : 'fa-eye-slash'); paint(); });
    $('lgLang').addEventListener('click', () => { if (typeof toggleLanguage === 'function') toggleLanguage(); });
    $('authLogout').addEventListener('click', logout);
    $('lgUser').addEventListener('change', () => setError(''));
    $('lgPwd').addEventListener('input', () => setError(''));
    // le changement de langue du site repeint aussi l'écran de connexion
    const orig = window.applyLanguage;
    if (typeof orig === 'function') window.applyLanguage = function () { const r = orig.apply(this, arguments); try { paint(); } catch (e) { /* ignore */ } return r; };
    paint();
    if (!getClient()) setError(t('nolib'));
    restore();
    if (!current) setTimeout(() => { const s = $('lgUser'); if (s && document.documentElement.classList.contains('auth-locked')) s.focus(); }, 50);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.PaygAuth = { logout: logout, user: () => current, isAdmin: () => !!(current && current.admin), client: getClient };
})();
