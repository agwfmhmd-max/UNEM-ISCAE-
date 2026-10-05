/* hypdb.js — Sauvegarde des hypothèses du modèle financier dans la base de données (Supabase).
 *  - Table : public.payg_hypotheses (voir supabase_hypotheses.sql), une ligne par projet (SURVEY_SLUG).
 *  - Contenu : état courant (hypothèses communes + 3 scénarios) ET jeux d'hypothèses nommés.
 *  - Le stockage du navigateur (localStorage) reste utilisé comme cache / secours hors connexion :
 *    si la base est injoignable, rien n'est perdu et la synchronisation reprend automatiquement.
 *  - N'altère aucune formule ni aucune autre fonction du site. */
(function () {
  'use strict';
  const TABLE = 'payg_hypotheses';
  const DIRTY_KEY = 'payg_hyp_dirty_v1'; // modifications locales pas encore envoyées à la base
  const DELAY = 900;                      // regroupe les saisies rapides en une seule écriture
  const RETRY = 20000;                    // nouvelle tentative si la base est injoignable

  const AR = () => typeof currentLang !== 'undefined' && currentLang === 'ar';
  const msgs = {
    loading: ['Connexion à la base de données…', 'جارٍ الاتصال بقاعدة البيانات…'],
    saving: ['Enregistrement dans la base de données…', 'جارٍ الحفظ في قاعدة البيانات…'],
    saved: ['Hypothèses enregistrées dans la base de données', 'تم حفظ الفرضيات في قاعدة البيانات'],
    loaded: ['Hypothèses chargées depuis la base de données', 'تم تحميل الفرضيات من قاعدة البيانات'],
    offline: ['Base de données indisponible : sauvegarde locale, synchronisation automatique dès que possible', 'قاعدة البيانات غير متاحة: حفظ محلي مع مزامنة تلقائية عند توفرها'],
    noconfig: ['Base de données non configurée : sauvegarde locale uniquement', 'قاعدة البيانات غير مهيأة: حفظ محلي فقط'],
    notable: ['Table « payg_hypotheses » introuvable : exécutez supabase_hypotheses.sql dans Supabase (sauvegarde locale en attendant)', 'الجدول «payg_hypotheses» غير موجود: نفّذ ملف supabase_hypotheses.sql في Supabase (حفظ محلي مؤقتًا)']
  };
  const icons = { loading: 'fa-spinner fa-spin text-slate-400', saving: 'fa-spinner fa-spin text-amber-400', saved: 'fa-database text-emerald-400', loaded: 'fa-database text-emerald-400', offline: 'fa-triangle-exclamation text-amber-400', noconfig: 'fa-triangle-exclamation text-amber-400', notable: 'fa-triangle-exclamation text-red-400' };

  let cache = { state: null, profiles: null }; // dernières valeurs connues (pour écrire la ligne complète)
  let known = null; // noms des jeux présents en base lors de la dernière synchronisation (détecte les jeux supprimés par MDA)
  const namesOf = (p) => (p && Array.isArray(p.list) ? p.list.map((x) => x && x.name) : []);
  let ready = false, loading = false, timer = null, retryTimer = null, status = 'loading';

  // Les hypothèses sont protégées par la sécurité de la base (RLS) : on utilise la session du superviseur connecté (auth.js).
  // Sans superviseur connecté, aucune lecture/écriture n'est tentée. (Repli sur le client public seulement si auth.js est absent.)
  const client = () => {
    try {
      if (window.PaygAuth && typeof window.PaygAuth.client === 'function') return window.PaygAuth.user() ? window.PaygAuth.client() : null;
      return typeof getSupabase === 'function' ? getSupabase() : null;
    } catch (e) { return null; }
  };
  const key = () => { try { return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SURVEY_SLUG) || 'default'; } catch (e) { return 'default'; } };
  const isDirty = () => { try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch (e) { return false; } };
  const setDirty = (v) => { try { if (v) localStorage.setItem(DIRTY_KEY, '1'); else localStorage.removeItem(DIRTY_KEY); } catch (e) { /* ignore */ } };
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  function paint() {
    const el = document.getElementById('hypDbStatus'); if (!el) return;
    const m = msgs[status] || msgs.loading;
    el.innerHTML = '<i class="fa-solid ' + icons[status] + '"></i> <span>' + (AR() ? m[1] : m[0]) + '</span>';
    el.title = (AR() ? m[1] : m[0]);
  }
  function setStatus(s) { status = s; paint(); }

  const missingTable = (err) => err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache|Could not find the table/i.test(err.message || ''));

  function scheduleRetry() { if (retryTimer) return; retryTimer = setTimeout(() => { retryTimer = null; if (!ready) load(); else flush(); }, RETRY); }

  /* Écrit la ligne complète (état + jeux nommés) — upsert sur la clé du projet */
  async function flush() {
    timer = null;
    const c = client(); if (!c) { setStatus('noconfig'); return; }
    if (!ready) { load(); return; } // on n'écrase jamais la base avant de l'avoir lue
    if (!cache.state && !cache.profiles) return;
    setStatus('saving');
    try {
      // Un jeu supprimé entre-temps par le superviseur principal ne doit pas être ré-envoyé depuis un cache périmé de ce navigateur.
      if (known && cache.profiles && Array.isArray(cache.profiles.list)) {
        const cur = await c.from(TABLE).select('profiles').eq('project_key', key()).maybeSingle();
        if (!cur.error && cur.data && cur.data.profiles && Array.isArray(cur.data.profiles.list)) {
          const now = namesOf(cur.data.profiles), gone = cache.profiles.list.filter((x) => known.indexOf(x.name) >= 0 && now.indexOf(x.name) < 0);
          if (gone.length) {
            const kept = cache.profiles.list.filter((x) => gone.indexOf(x) < 0);
            cache.profiles = { list: kept, active: gone.some((x) => x.name === cache.profiles.active) ? null : (cache.profiles.active || null) };
            const EX0 = window.Extras; if (EX0 && EX0.applyRemoteProfiles) EX0.applyRemoteProfiles(clone(cache.profiles));
          }
        }
      }
      const row = { project_key: key(), state: cache.state, profiles: cache.profiles || { list: [], active: null }, schema_version: 3, updated_at: new Date().toISOString() };
      const { data: back, error } = await c.from(TABLE).upsert(row, { onConflict: 'project_key' }).select('profiles').maybeSingle();
      if (error) throw error;
      // La base conserve les jeux d'un autre superviseur absents de cet enregistrement : on aligne la liste locale sur la base (sans renvoi).
      try {
        const EX = window.Extras, remote = back && back.profiles;
        if (remote && Array.isArray(remote.list) && cache.profiles && Array.isArray(cache.profiles.list) && remote.list.length !== cache.profiles.list.length && EX && EX.applyRemoteProfiles) {
          const merged = { list: clone(remote.list), active: cache.profiles.active || null };
          cache.profiles = clone(merged); EX.applyRemoteProfiles(merged);
        }
      } catch (e2) { /* ignore */ }
      known = namesOf(cache.profiles);
      setDirty(false); setStatus('saved');
    } catch (err) {
      setDirty(true); setStatus(missingTable(err) ? 'notable' : 'offline'); scheduleRetry();
    }
  }
  function queue() { setDirty(true); if (timer) clearTimeout(timer); timer = setTimeout(flush, DELAY); }

  function saveState(state) { cache.state = { v: 3, g: clone(state.g), sc: clone(state.sc) }; queue(); }
  function saveProfiles(p) { cache.profiles = clone(p); queue(); }

  /* Lecture initiale : la base fait foi, sauf si des modifications locales n'ont pas encore été envoyées */
  async function load() {
    if (loading) return; loading = true;
    const c = client();
    if (!c) { loading = false; setStatus('noconfig'); scheduleRetry(); return; }
    setStatus('loading');
    try {
      const { data, error } = await c.from(TABLE).select('state, profiles, updated_at').eq('project_key', key()).maybeSingle();
      if (error) throw error;
      const SU = window.StudyUI, EX = window.Extras;
      const localState = SU && SU.getState ? SU.getState() : null;
      const localProfiles = EX && EX.getProfiles ? EX.getProfiles() : null;
      if (data && !isDirty()) {
        cache.state = data.state || (localState ? { v: 3, g: clone(localState.g), sc: clone(localState.sc) } : null);
        cache.profiles = data.profiles || localProfiles;
        known = namesOf(data.profiles);
        ready = true;
        if (data.state && SU && SU.applyRemote) SU.applyRemote(data.state);
        if (data.profiles && EX && EX.applyRemoteProfiles) EX.applyRemoteProfiles(data.profiles);
        // si la base contenait d'anciennes valeurs (ancienne ouguiya), on y réécrit les valeurs converties
        const after = SU && SU.getState ? SU.getState() : null;
        if (after && data.state && JSON.stringify({ g: after.g, sc: after.sc }) !== JSON.stringify({ g: data.state.g, sc: data.state.sc })) { cache.state = { v: 3, g: clone(after.g), sc: clone(after.sc) }; if (EX && EX.getProfiles) cache.profiles = EX.getProfiles(); queue(); }
        else { setDirty(false); setStatus('loaded'); }
      } else {
        // aucune ligne en base (première utilisation) ou modifications locales en attente : on envoie l'état local
        cache.state = localState ? { v: 3, g: clone(localState.g), sc: clone(localState.sc) } : null;
        cache.profiles = (data && !localProfiles ? data.profiles : localProfiles) || { list: [], active: null };
        known = data ? namesOf(data.profiles) : null;
        ready = true; queue();
      }
    } catch (err) {
      ready = false; setStatus(missingTable(err) ? 'notable' : 'offline'); scheduleRetry();
    }
    loading = false;
  }

  window.addEventListener('beforeunload', () => { if (timer && ready) { clearTimeout(timer); flush(); } });
  /* Suppression d'un jeu d'hypothèses : réservée au superviseur principal (contrôle imposé par la base : payg_delete_profile).
   * Retourne true si la suppression a été faite (ou s'il n'y a pas de base à contacter), false si elle est refusée / impossible. */
  async function deleteProfile(name) {
    const c = client();
    if (!c) return { ok: false, offline: true };
    try {
      const { data, error } = await c.rpc('payg_delete_profile', { p_name: name, p_project: key() });
      if (error) throw error;
      if (data && Array.isArray(data.list)) { cache.profiles = { list: clone(data.list), active: data.active || null }; known = namesOf(cache.profiles); }
      return { ok: true, profiles: data };
    } catch (err) {
      return { ok: false, denied: !!(err && (err.code === '42501' || /superviseur principal/i.test(err.message || ''))), message: err && err.message };
    }
  }
  window.HypDB = { load, saveState, saveProfiles, deleteProfile, repaint: paint, getStatus: () => status };
})();
