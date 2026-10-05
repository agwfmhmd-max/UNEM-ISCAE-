/* =====================================================================
 * engine.js — Moteur de calcul de l'étude de faisabilité (sans DOM)
 * Enquête → indicateurs de marché → prix PAYG → scénarios → exports
 *
 * Règle de classification de chaque donnée :
 *   enquete     = donnée réelle de l'enquête (calculée sur les réponses enregistrées)
 *   estimation  = calcul à partir de l'enquête avec une hypothèse d'interpolation
 *   externe     = donnée externe vérifiée (aucune n'est encodée ici : à renseigner avec source)
 *   hypothese   = valeur choisie par l'équipe, modifiable, non issue de l'enquête
 *   simulation  = résultat d'une simulation de prototype (pas de connexion réelle)
 * ===================================================================== */
(function (root) {
  'use strict';

  const MODEL_DATE = '2026-10-02';
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /* ---------------- 1. Lecture de l'enquête ---------------- */

  // Question → expression repérée dans le texte français (insensible aux accents)
  const QUESTION_MATCHERS = {
    interest:    /pret a acquerir un kit/,
    frequency:   /frequence de paiement/,
    duration:    /duree de financement/,
    insurance:   /micro-assurance integree/,
    monthlyPrice:/montant mensuel maximum|montant mensuel.*(accept|payer|pouvez)|(payer|paiement|verser).*(par mois|mensuel).*(maximum|accept)|(maximum|accept).*(par mois|mensuel)/,
    totalPrice:  /prix total.*acceptable|prix total.*(maximum|payer)|(maximum|accept).*prix total/,
    income:      /tranche.*revenu mensuel/,
    activity:    /activite principale/,
    profile:     /profil principal/,
    wilaya:      /wilaya/,
    energySpend: /depensez-vous par mois/,
    kit:         /quel kit solaire/,
    wallets:     /portefeuilles/,
    lock:        /verrouillage automatique/,
    household:   /combien de personnes/,
    existingSolar:/utilisez-vous deja/
  };

  // Bornes (MRU) des tranches, indexées par le code `value` de l'option
  const BANDS = {
    monthlyPrice: { lt_1000:[0,1000], '1000_2000':[1000,2000], '2000_3500':[2000,3500], '3500_5000':[3500,5000], '5000_8000':[5000,8000], gt_8000:[8000,null] },
    totalPrice:   { lt_100k:[0,100000], '100k_150k':[100000,150000], '150k_200k':[150000,200000], gt_200k:[200000,null] },
    income:       { lt_5000:[0,5000], '5000_10000':[5000,10000], '10000_20000':[10000,20000], gt_20000:[20000,null] },
    energySpend:  { lt_5000:[0,5000], '5000_15000':[5000,15000], '15000_30000':[15000,30000], gt_30000:[30000,null] }
  };
  const OPEN_BAND_FACTOR = 1.5; // hypothèse : tranche ouverte [lo ; lo×1,5]

  const DURATION_MONTHS = { '6_mois': 6, '12_mois': 12, '18_mois': 18, '24_mois': 24 };
  const FREQ_CODE = { quotidienne: 'daily', hebdomadaire: 'weekly', mensuelle: 'monthly', saisonniere: 'monthly' };

  function findQuestion(questions, key) {
    const re = QUESTION_MATCHERS[key];
    return (questions || []).find((q) => re.test(norm(q.question_fr))) || null;
  }

  // Distribution des réponses d'une question, reconstruite à partir des COMPTES (pas des % de la vue)
  function distribution(questions, rows, key) {
    const q = findQuestion(questions, key);
    if (!q) return null;
    const qRows = (rows || []).filter((r) => r.question_id === q.id);
    const items = (q.options || []).map((o) => {
      const row = qRows.find((r) => (r.option_id && r.option_id === o.id) || norm(r.option_label_fr) === norm(o.label_fr));
      return { value: o.value, label_fr: o.label_fr, label_ar: o.label_ar, count: Number(row ? row.response_count : 0) || 0 };
    });
    const total = sum(items.map((i) => i.count));
    items.forEach((i) => { i.pct = total > 0 ? (i.count / total) * 100 : 0; });
    return { questionId: q.id, key, total, items };
  }

  // Intervalle de Wilson à 95 % pour une proportion (affiché pour ne pas sur-interpréter un petit échantillon)
  function wilson(k, n) {
    if (!n) return null;
    const z = 1.96, p = k / n, d = 1 + (z * z) / n;
    const c = (p + (z * z) / (2 * n)) / d;
    const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }

  // Repli : si le code de l'option n'est pas dans BANDS, les bornes sont lues dans le libellé (« 1 000 – 2 000 MRU », « Moins de 1 000 », « Plus de 8 000 »)
  function bandFromLabel(label) {
    const t = norm(label).replace(/(\d)[\s\u00a0\u202f.,](?=\d{3}(?!\d))/g, '$1');
    const nums = (t.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(',', '.'))).filter((x) => isFinite(x));
    if (!nums.length) return null;
    if (nums.length >= 2) { const a = Math.min(nums[0], nums[1]), b = Math.max(nums[0], nums[1]); return [a, b]; }
    if (/moins|infer|jusqu|^\s*<|<\s*\d|sous/.test(t)) return [0, nums[0]];
    if (/plus|super|depass|au-dessus|>|\+|au moins/.test(t)) return [nums[0], null];
    return null;
  }
  const bandRange = (key, value, label) => {
    let b = BANDS[key] && BANDS[key][value];
    if (!b && label) b = bandFromLabel(label);
    if (!b) return null;
    return [b[0], b[1] == null ? b[0] * OPEN_BAND_FACTOR : b[1]];
  };

  // Part des répondants dont le montant maximum >= price (hypothèse : répartition uniforme dans la tranche)
  function shareAtLeast(dist, key, price) {
    if (!dist || !dist.total) return null;
    let acc = 0;
    dist.items.forEach((i) => {
      const r = bandRange(key, i.value, i.label_fr);
      if (!r || !i.count) return;
      const [lo, hi] = r;
      const frac = price <= lo ? 1 : price >= hi ? 0 : (hi - price) / (hi - lo);
      acc += i.count * frac;
    });
    return acc / dist.total;
  }

  // Prix couvert par une part `coverage` (0-1) des répondants (inverse de shareAtLeast)
  function priceForCoverage(dist, key, coverage) {
    if (!dist || !dist.total) return null;
    let lo = 0, hi = 0;
    dist.items.forEach((i) => { const r = bandRange(key, i.value, i.label_fr); if (r && i.count) hi = Math.max(hi, r[1]); });
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (shareAtLeast(dist, key, mid) >= coverage) lo = mid; else hi = mid;
    }
    return Math.round((lo + hi) / 2);
  }

  function meanFromBands(dist, key) {
    if (!dist || !dist.total) return null;
    let acc = 0;
    dist.items.forEach((i) => { const r = bandRange(key, i.value, i.label_fr); if (r && i.count) acc += i.count * (r[0] + r[1]) / 2; });
    return Math.round(acc / dist.total);
  }

  const modal = (dist) => {
    if (!dist || !dist.total) return null;
    return dist.items.reduce((best, i) => (i.count > (best ? best.count : -1) ? i : best), null);
  };

  const countOf = (dist, ...values) => dist ? sum(dist.items.filter((i) => values.includes(i.value)).map((i) => i.count)) : 0;

  /**
   * Calcule les indicateurs de marché à partir des lignes agrégées de la vue public_survey_results.
   * Aucune valeur n'est inventée : si une question n'existe pas encore ou n'a aucune réponse, l'indicateur est null.
   */
  function computeMarketIndicators(questions, rows, participants, opts) {
    opts = opts || {};
    const coverageTarget = opts.coverageTarget != null ? opts.coverageTarget : 0.5;
    const D = {};
    Object.keys(QUESTION_MATCHERS).forEach((k) => { D[k] = distribution(questions, rows, k); });

    const answeredMax = Math.max(0, ...Object.values(D).filter(Boolean).map((d) => d.total));
    const n = participants != null && participants > 0 ? participants : answeredMax;

    const ind = { market_sample_size: n, distributions: D, warnings: [] };
    ind.sample_quality = n < 30 ? 'insuffisant' : n < 100 ? 'indicatif' : 'acceptable';
    if (n < 30) ind.warnings.push('Moins de 30 répondants : résultats purement indicatifs, non généralisables.');
    else if (n < 100) ind.warnings.push('Moins de 100 répondants : lire les résultats avec prudence (intervalles de confiance larges).');
    ind.warnings.push('Échantillon non probabiliste : les résultats décrivent l’échantillon, pas la population mauritanienne.');

    const it = D.interest;
    if (it && it.total) {
      const yes = countOf(it, 'oui'), maybe = countOf(it, 'peut_etre');
      ind.purchase_intention_rate = yes / it.total;
      ind.purchase_intention_ci = wilson(yes, it.total);
      ind.payg_interest_rate = (yes + maybe) / it.total;
      ind.payg_interest_ci = wilson(yes + maybe, it.total);
      ind.maybe_rate = maybe / it.total;
      ind.interested_count = yes + maybe;
      ind.interest_base = it.total;
    }
    const ins = D.insurance;
    if (ins && ins.total) {
      ind.insurance_interest_rate = countOf(ins, 'oui', 'oui_si_prix') / ins.total;
      ind.insurance_unconditional_rate = countOf(ins, 'oui') / ins.total;
      ind.insurance_interest_ci = wilson(countOf(ins, 'oui', 'oui_si_prix'), ins.total);
    }
    const lk = D.lock;
    if (lk && lk.total) ind.lock_acceptance_rate = countOf(lk, 'oui', 'oui_delai') / lk.total;

    const mp = D.monthlyPrice;
    if (mp && mp.total) {
      ind.monthly_price_base = mp.total;
      ind.median_monthly_payment = priceForCoverage(mp, 'monthlyPrice', 0.5);
      ind.average_monthly_payment = meanFromBands(mp, 'monthlyPrice');
      ind.monthly_price_p75 = priceForCoverage(mp, 'monthlyPrice', 0.75); // 75 % peuvent payer au moins ce montant
      ind.reference_monthly_price = priceForCoverage(mp, 'monthlyPrice', coverageTarget);
      ind.reference_coverage = coverageTarget;
    }
    const tp = D.totalPrice;
    if (tp && tp.total) ind.median_total_price = priceForCoverage(tp, 'totalPrice', 0.5);

    const du = modal(D.duration);
    if (du) { ind.preferred_financing_duration = du.value; ind.preferred_financing_months = DURATION_MONTHS[du.value] || null; ind.preferred_financing_label = du.label_fr; }
    const fr = modal(D.frequency);
    if (fr) { ind.preferred_payment_frequency = fr.value; ind.preferred_payment_code = FREQ_CODE[fr.value] || null; ind.preferred_payment_label = fr.label_fr; }
    const pf = modal(D.profile);
    if (pf) { ind.target_customer_segment = pf.value; ind.target_customer_segment_label = pf.label_fr; }

    const inc = D.income;
    if (inc && inc.total) ind.median_income_band = priceForCoverage(inc, 'income', 0.5);
    const en = D.energySpend;
    if (en && en.total) ind.average_energy_spend = meanFromBands(en, 'energySpend');

    return ind;
  }

  /* ---------------- 2. Hypothèses globales (modifiables) ---------------- */

  const KITS = [
    { id: 'kit1', fr: 'Kit éclairage & chargeur', ar: 'نظام الإنارة والشحن' },
    { id: 'kit2', fr: 'Kit confort familial', ar: 'النظام العائلي' },
    { id: 'kit3', fr: 'Kit productif / commercial', ar: 'النظام الإنتاجي/التجاري' }
  ];

  // type: hypothese | estimation | enquete | externe | simulation
  const GLOBAL_DEFAULTS = {
    kit1_cash:     { v: 8500,   unit: 'MRU', fr: 'Prix comptant de référence – Kit éclairage', ar: 'السعر النقدي المرجعي – نظام الإنارة', type: 'hypothese', source: 'Ordre de grandeur marché : kit d’entrée de gamme (panneau 80 W, 4 lampes, chargeur) ≈ 200 USD ≈ 8 000-9 000 MRU (1 USD ≈ 40 MRU, juil. 2026) ; à remplacer par un devis fournisseur (droits et TVA inclus)' },
    kit2_cash:     { v: 20000,  unit: 'MRU', fr: 'Prix comptant de référence – Kit familial', ar: 'السعر النقدي المرجعي – النظام العائلي', type: 'hypothese', source: 'Ordre de grandeur marché : système familial avec TV et ventilateur ≈ 450-500 USD (réf. Sun King HomePlus Max + TV 43" : 62 000 KES au Kenya ≈ 19 000 MRU) ; à remplacer par un devis fournisseur' },
    kit3_cash:     { v: 55000,  unit: 'MRU', fr: 'Prix comptant de référence – Kit productif', ar: 'السعر النقدي المرجعي – النظام الإنتاجي', type: 'hypothese', source: 'Ordre de grandeur marché : congélateur solaire + panneaux + batterie pour boutique ≈ 1 300-1 500 USD ≈ 52 000-60 000 MRU ; à remplacer par un devis fournisseur' },
    install_pct:   { v: 5,      unit: '% du prix comptant', fr: 'Installation', ar: 'التركيب', type: 'hypothese', source: 'Hypothèse équipe — à valider (devis installateur)' },
    iot_cost:      { v: 600,    unit: 'MRU / kit', fr: 'Équipement de paiement / IoT (module de verrouillage)', ar: 'جهاز الدفع / إنترنت الأشياء', type: 'hypothese', source: 'Ordre de grandeur : module GSM de verrouillage PAYG ≈ 15 USD ≈ 600 MRU — à valider (devis fournisseur IoT)' },
    deposit_pct:   { v: 20,     unit: '% du prix total', fr: 'Acompte initial', ar: 'الدفعة المقدمة', type: 'hypothese', source: 'Hypothèse — à comparer à la question « acompte » de l’enquête' },
    tax_rate:      { v: 25,     unit: '% du bénéfice imposable', fr: 'Impôt sur le bénéfice (IS)', ar: 'الضريبة على الأرباح', type: 'hypothese', source: 'Taux normal de l’IS en Mauritanie (CGI, loi 2019-018) ; déficits reportés sur les années suivantes (simplification) ; impôt minimum forfaitaire non appliqué — à valider avec un expert-comptable' },
    funding_rate:  { v: 12,     unit: '% / an', fr: 'Coût de financement (refinancement)', ar: 'تكلفة التمويل', type: 'hypothese', source: 'Hypothèse équipe — à remplacer par l’offre d’une banque / bailleur' },
    commission_pct:{ v: 1,      unit: '% des encaissements', fr: 'Commission du paiement mobile', ar: 'عمولة الدفع عبر الهاتف', type: 'hypothese', source: 'Hypothèse — à remplacer par les conditions réelles des opérateurs' },
    servicing:     { v: 150,    unit: 'MRU / client / mois', fr: 'Coût de suivi client (SAV, recouvrement, SMS)', ar: 'تكلفة متابعة العميل', type: 'hypothese', source: 'Hypothèse équipe' },
    insurance_takeup: { v: 70,  unit: '% des clients', fr: 'Part des clients assurés', ar: 'نسبة العملاء المؤمَّنين', type: 'hypothese', source: 'Hypothèse — comparer à l’intérêt pour la micro-assurance mesuré dans l’enquête' },
    coverage:      { v: 50,     unit: '% des répondants', fr: 'Part des répondants devant pouvoir payer (prix de référence)', ar: 'نسبة المجيبين القادرين على الدفع', type: 'hypothese', source: 'Choix méthodologique de l’équipe' },
    addressable:   { v: 20000,  unit: 'ménages / entreprises', fr: 'Marché adressable (zone cible)', ar: 'السوق المستهدف', type: 'hypothese', source: 'Hypothèse — à remplacer par une donnée externe vérifiée (ANSADE / recensement) avec source' },
    maybe_conv:    { v: 25,     unit: '% des « peut-être »', fr: 'Conversion des réponses « peut-être » en achat', ar: 'تحويل "ربما" إلى شراء', type: 'hypothese', source: 'Hypothèse prudente de l’équipe' },
    freq:          { v: 'monthly', unit: '', fr: 'Fréquence de paiement du modèle', ar: 'وتيرة الدفع في النموذج', type: 'hypothese', source: 'Par défaut ; remplacée par la fréquence préférée de l’enquête si elle est disponible' }
  };

  // Investissement initial (A) et coûts fixes annuels (B) — exprimés en NOUVELLE OUGUIYA (MRU, après redénomination : un zéro retiré par rapport à l'ancien prototype)
  const CAPEX_ITEMS = [
    ['capex_platform', 'Développement de la plateforme', 'تطوير المنصة', 300000],
    ['capex_it',       'Matériel informatique et IoT', 'معدات معلوماتية', 150000],
    ['capex_vehicles', 'Véhicules', 'مركبات', 250000],
    ['capex_tools',    'Équipement d’installation', 'معدات التركيب', 100000],
    ['capex_launch',   'Lancement commercial', 'الإطلاق التجاري', 200000],
    ['capex_stock',    'Stock initial de kits (fonds de roulement)', 'مخزون أولي', 200000]
  ];
  const FIXED_ITEMS = [
    ['fx_salaries', 'Salaires', 'الرواتب', 480000],
    ['fx_premises', 'Locaux', 'المقرات', 120000],
    ['fx_software', 'Logiciels et hébergement', 'البرمجيات', 60000],
    ['fx_admin',    'Administration', 'الإدارة', 50000],
    ['fx_comm',     'Communication', 'التواصل', 50000],
    ['fx_maint',    'Maintenance', 'الصيانة', 40000]
  ];
  CAPEX_ITEMS.forEach(([k, fr, ar, v]) => { GLOBAL_DEFAULTS[k] = { v, unit: 'MRU', fr, ar, type: 'hypothese', source: 'Hypothèse équipe (répartition du CAPEX initial du prototype) — à justifier par devis', group: 'capex' }; });
  FIXED_ITEMS.forEach(([k, fr, ar, v]) => { GLOBAL_DEFAULTS[k] = { v, unit: 'MRU / an', fr, ar, type: 'hypothese', source: 'Hypothèse équipe (répartition de l’OPEX annuel du prototype) — à justifier', group: 'fixed' }; });

  const SCENARIO_FIELDS = [
    ['clients1',   'Nouveaux clients, année 1', 'عملاء جدد – السنة 1', 'clients'],
    ['growth',     'Croissance annuelle des nouveaux clients', 'نمو العملاء', '%'],
    ['cashPrice',  'Prix comptant moyen du kit', 'متوسط السعر النقدي', 'MRU'],
    ['costRatio',  'Coût d’achat du kit (% du prix comptant)', 'تكلفة شراء النظام', '%'],
    ['tenure',     'Durée de financement', 'مدة التمويل', 'mois'],
    ['defaultRate','Taux d’impayés', 'نسبة التعثر', '%'],
    ['insRate',    'Prime d’assurance (% du prix comptant / an)', 'قسط التأمين', '%'],
    ['marginPct',  'Marge visée (% des coûts)', 'الهامش', '%'],
    ['opexMult',   'Coefficient des coûts opérationnels', 'معامل التكاليف التشغيلية', '×'],
    ['grant',      'Subvention / don (non acquis)', 'منحة (غير مؤكدة)', 'MRU'],
    ['discount',   'Taux d’actualisation', 'معدل الخصم', '%']
  ];
  const SCENARIO_DEFAULTS = {
    prudent:   { clients1: 500,  growth: 0,  cashPrice: 20000, costRatio: 75, tenure: 12, defaultRate: 8,   insRate: 2.5, marginPct: 18, opexMult: 1.1,  grant: 0,       discount: 12 },
    central:   { clients1: 1000, growth: 10, cashPrice: 20000, costRatio: 70, tenure: 12, defaultRate: 5,   insRate: 2.5, marginPct: 20, opexMult: 1.0,  grant: 0,       discount: 10 },
    dynamique: { clients1: 1500, growth: 15, cashPrice: 20000, costRatio: 65, tenure: 12, defaultRate: 2.5, insRate: 2.5, marginPct: 22, opexMult: 1.0,  grant: 600000,  discount: 10 }
  };
  const SCENARIO_NAMES = { prudent: { fr: 'Prudent', ar: 'متحفظ' }, central: { fr: 'Central', ar: 'أساسي' }, dynamique: { fr: 'Dynamique', ar: 'ديناميكي' } };


  /* ---------------- 2 bis. Migration : anciennes valeurs (ancienne ouguiya) -> nouvelle ouguiya ----------------
   * Les états déjà enregistrés (navigateur, base de données, jeux nommés, fichiers importés) peuvent contenir
   * les anciennes valeurs par défaut (un zéro de trop). Seules les valeurs EXACTEMENT égales aux anciens défauts
   * sont converties ; toute valeur personnalisée par l'équipe est conservée telle quelle. Fonction idempotente. */
  const LEGACY_G = { capex_platform: 3000000, capex_it: 1500000, capex_vehicles: 2500000, capex_tools: 1000000, capex_launch: 2000000, capex_stock: 2000000,
    fx_salaries: 4800000, fx_premises: 1200000, fx_software: 600000, fx_admin: 500000, fx_comm: 500000, fx_maint: 400000 };
  const LEGACY_GRANT = { dynamique: 6000000 };
  function migrateLegacy(g, sc) {
    if (g) Object.keys(LEGACY_G).forEach((k) => { if (g[k] === LEGACY_G[k]) g[k] = GLOBAL_DEFAULTS[k].v; });
    if (sc) Object.keys(LEGACY_GRANT).forEach((k) => { if (sc[k] && sc[k].grant === LEGACY_GRANT[k]) sc[k].grant = SCENARIO_DEFAULTS[k].grant; });
    return { g, sc };
  }

  function defaultState() {
    const g = {};
    Object.keys(GLOBAL_DEFAULTS).forEach((k) => { g[k] = GLOBAL_DEFAULTS[k].v; });
    return { g, sc: JSON.parse(JSON.stringify(SCENARIO_DEFAULTS)) };
  }

  /* ---------------- 3. Prix PAYG transparent ---------------- */

  const PERIODS_PER_YEAR = { daily: 360, weekly: 52, monthly: 12 };
  const periodsCount = (tenure, freq) => Math.round((tenure * PERIODS_PER_YEAR[freq || 'monthly']) / 12);

  /**
   * Prix PAYG = Σ coûts + marge. Détail :
   *  coût kit = prix comptant × ratio ; installation = prix comptant × %; IoT = montant fixe ;
   *  financement = base × (1 − acompte) × taux × durée/12 × (n+1)/(2n)   [solde moyen d'un crédit amorti] ;
   *  assurance   = prime % × prix comptant × durée/12 (si assuré) ;
   *  suivi       = coût/mois × durée ;  risque = taux d'impayés × capital financé ;
   *  commission  = % × prix total (résolue de façon fermée) ;  marge = m × (tous les coûts).
   */
  function buildPrice(p) {
    const d = p.depositPct / 100, m = p.marginPct / 100, c = p.commissionPct / 100;
    const kit = p.cashPrice * (p.costRatio / 100);
    const install = p.cashPrice * (p.installPct / 100);
    const iot = p.iotCost;
    const base = kit + install + iot;
    const n = Math.max(1, p.tenure);
    const financed = base * (1 - d);
    const financing = financed * (p.fundingRate / 100) * (p.tenure / 12) * ((n + 1) / (2 * n));
    const insurance = p.insured ? p.cashPrice * (p.insRate / 100) * (p.tenure / 12) : 0;
    const servicing = p.servicing * p.tenure;
    const risk = financed * (p.defaultRate / 100);
    const c0 = base + financing + insurance + servicing + risk;
    const denom = 1 - c * (1 + m);
    const total = denom > 0 ? (c0 * (1 + m)) / denom : NaN;
    const commission = c * total;
    const margin = m * (c0 + commission);
    const deposit = d * total;
    const periods = periodsCount(p.tenure, p.freq);
    const installment = periods > 0 ? (total - deposit) / periods : NaN;
    const monthlyEquivalent = p.tenure > 0 ? (total - deposit) / p.tenure : NaN;
    return {
      lines: [
        { id: 'kit', fr: 'Coût du kit', ar: 'تكلفة النظام', value: kit },
        { id: 'install', fr: 'Installation', ar: 'التركيب', value: install },
        { id: 'iot', fr: 'Équipement paiement / IoT', ar: 'جهاز الدفع', value: iot },
        { id: 'financing', fr: 'Coût de financement', ar: 'تكلفة التمويل', value: financing },
        { id: 'insurance', fr: 'Micro-assurance', ar: 'التأمين الأصغر', value: insurance },
        { id: 'opex', fr: 'Coûts opérationnels attribuables (suivi + commission mobile)', ar: 'تكاليف تشغيلية', value: servicing + commission },
        { id: 'risk', fr: 'Provision pour risque de crédit', ar: 'مخصص مخاطر الائتمان', value: risk },
        { id: 'margin', fr: 'Marge', ar: 'الهامش', value: margin }
      ],
      parts: { kit, install, iot, financing, insurance, servicing, commission, risk, margin },
      total, deposit, financedAmount: total - deposit, periods, installment, monthlyEquivalent,
      costs: c0 + commission,
      checksum: kit + install + iot + financing + insurance + servicing + commission + risk + margin
    };
  }

  // Test d'accessibilité : compare l'équivalent mensuel au budget déclaré dans l'enquête
  function affordability(ind, price) {
    const dist = ind && ind.distributions && ind.distributions.monthlyPrice;
    if (!dist || !dist.total || !isFinite(price.monthlyEquivalent)) return null;
    return { share: shareAtLeast(dist, 'monthlyPrice', price.monthlyEquivalent), base: dist.total, monthly: price.monthlyEquivalent };
  }

  function suggestTenure(ind, p, target) {
    for (const t of [6, 12, 18, 24]) {
      const pr = buildPrice(Object.assign({}, p, { tenure: t }));
      if (isFinite(pr.monthlyEquivalent) && pr.monthlyEquivalent <= target) return { tenure: t, monthly: pr.monthlyEquivalent };
    }
    return null;
  }

  /* ---------------- 4. Modèle financier (60 mois, base de trésorerie) ---------------- */

  function priceParams(g, s, insured) {
    return {
      cashPrice: s.cashPrice, costRatio: s.costRatio, installPct: g.install_pct, iotCost: g.iot_cost,
      depositPct: g.deposit_pct, tenure: s.tenure, freq: g.freq || 'monthly', insured: !!insured,
      fundingRate: g.funding_rate, insRate: s.insRate, defaultRate: s.defaultRate,
      commissionPct: g.commission_pct, servicing: g.servicing * s.opexMult, marginPct: s.marginPct
    };
  }

  function irr(flows, lo, hi) {
    const f = (r) => flows.reduce((a, cf, t) => a + cf / Math.pow(1 + r, t), 0);
    lo = lo == null ? -0.99 : lo; hi = hi == null ? 1 : hi;
    if (f(lo) * f(hi) > 0) return null;
    for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
    return (lo + hi) / 2;
  }

  function runScenario(g, s) {
    const takeup = Math.min(1, Math.max(0, g.insurance_takeup / 100));
    const prIns = buildPrice(priceParams(g, s, true));
    const prNo = buildPrice(priceParams(g, s, false));
    const H = 60;
    const capex = sum(CAPEX_ITEMS.map(([k]) => g[k] || 0));
    const fixedAnnual = sum(FIXED_ITEMS.map(([k]) => g[k] || 0)) * s.opexMult;
    const D = Math.max(1, Math.round(s.tenure));
    const def = s.defaultRate / 100, c = g.commission_pct / 100;
    const mix = (a, b) => takeup * a + (1 - takeup) * b;

    // Valeurs par client (moyenne pondérée assurés / non assurés)
    const unit = {
      price: mix(prIns.total, prNo.total),
      deposit: mix(prIns.deposit, prNo.deposit),
      instMonthly: mix(prIns.monthlyEquivalent, prNo.monthlyEquivalent),
      acqCost: mix(prIns.parts.kit + prIns.parts.install + prIns.parts.iot, prNo.parts.kit + prNo.parts.install + prNo.parts.iot),
      insMonthly: takeup * (s.cashPrice * (s.insRate / 100) / 12),
      servMonthly: g.servicing * s.opexMult
    };

    const yearsClients = [0, 1, 2, 3, 4].map((y) => s.clients1 * Math.pow(1 + s.growth / 100, y));
    const newByMonth = new Array(H + 1).fill(0);
    for (let m = 1; m <= H; m++) newByMonth[m] = yearsClients[Math.floor((m - 1) / 12)] / 12;

    const flows = new Array(H + 1).fill(0); // flux net mensuel (t=0 = investissement)
    const yr = [0, 1, 2, 3, 4].map(() => ({ clients: 0, collections: 0, variable: 0, fixed: 0, deprec: 0 }));
    flows[0] = -capex + (s.grant || 0);

    for (let m = 1; m <= H; m++) {
      const y = Math.floor((m - 1) / 12);
      let collections = newByMonth[m] * unit.deposit;
      let variable = newByMonth[m] * unit.acqCost;
      yr[y].clients += newByMonth[m];
      for (let a = Math.max(1, m - D); a < m; a++) { // cohortes en cours de remboursement
        const act = newByMonth[a];
        collections += act * unit.instMonthly * (1 - def);
        variable += act * (unit.insMonthly + unit.servMonthly);
      }
      variable += c * collections;
      const fixed = fixedAnnual / 12;
      yr[y].collections += collections; yr[y].variable += variable; yr[y].fixed += fixed;
      flows[m] = collections - variable - fixed;
    }
    // Impôt sur le bénéfice : taux × résultat imposable ; les déficits des années précédentes sont reportés (simplification)
    const taxRate = Math.max(0, (g.tax_rate == null ? 25 : g.tax_rate)) / 100;
    let lossCarry = 0;
    const years = yr.map((r, i) => {
      const deprec = capex / 5;
      const grossMargin = r.collections - r.variable;
      const result = grossMargin - r.fixed - deprec; // résultat avant impôt
      let taxBase = 0;
      if (result < 0) lossCarry += -result;
      else { const used = Math.min(lossCarry, result); lossCarry -= used; taxBase = result - used; }
      const tax = taxBase * taxRate;
      const netResult = result - tax;
      const cash = flows.slice(1 + i * 12, 1 + (i + 1) * 12).reduce((a, b) => a + b, 0) + (i === 0 ? flows[0] : 0);
      return { year: i + 1, clients: r.clients, revenue: r.collections, variable: r.variable, fixed: r.fixed, totalCosts: r.variable + r.fixed, grossMargin, deprec, result, taxBase, tax, netResult, lossCarry, cash };
    });

    const rm = Math.pow(1 + s.discount / 100, 1 / 12) - 1;
    const npv = flows.reduce((a, cf, t) => a + cf / Math.pow(1 + rm, t), 0);
    const irrM = irr(flows);
    const irrA = irrM == null ? null : Math.pow(1 + irrM, 12) - 1;
    let cum = 0, trough = 0, payback = null;
    flows.forEach((cf, t) => { cum += cf; if (cum < trough) trough = cum; if (payback == null && cum >= 0 && t > 0) payback = t; });

    // Seuil de rentabilité : contribution d'un client sur son cycle de vie ; coûts fixes annuels à couvrir
    const lifeCollections = unit.deposit + unit.instMonthly * D * (1 - def);
    const lifeVariable = unit.acqCost + (unit.insMonthly + unit.servMonthly) * D + c * lifeCollections;
    const contribution = lifeCollections - lifeVariable;
    const breakEvenClients = contribution > 0 ? Math.ceil(fixedAnnual / contribution) : null;
    const breakEvenWithCapex = contribution > 0 ? Math.ceil((fixedAnnual + capex / 5) / contribution) : null;

    return {
      priceInsured: prIns, priceUninsured: prNo, unit, capex, fixedAnnual, years, flows,
      npv, irr: irrA, paybackMonths: payback, fundingNeed: -trough,
      revenuePerClient: lifeCollections, contributionPerClient: contribution,
      breakEvenClients, breakEvenWithCapex,
      totals: {
        clients: sum(years.map((y) => y.clients)),
        revenue: sum(years.map((y) => y.revenue)),
        costs: sum(years.map((y) => y.totalCosts)),
        grossMargin: sum(years.map((y) => y.grossMargin)),
        result: sum(years.map((y) => y.result)),
        tax: sum(years.map((y) => y.tax)),
        netResult: sum(years.map((y) => y.netResult)),
        cash: sum(years.map((y) => y.cash))
      }
    };
  }

  // Demande plausible issue de l'enquête (hypothèse de marché), pour confronter les scénarios
  function demandHypothesis(ind, g) {
    if (!ind || ind.purchase_intention_rate == null) return null;
    const firm = ind.purchase_intention_rate, maybe = ind.maybe_rate || 0;
    const rate = firm + maybe * (g.maybe_conv / 100);
    return { rate, customers: Math.round(g.addressable * rate) };
  }

  /* ---------------- 5. Registre « Hypothèses du modèle » ---------------- */

  const TYPE_LABELS = {
    enquete:    { fr: 'Donnée réelle de l’enquête', ar: 'بيانات فعلية من الاستبيان' },
    estimation: { fr: 'Estimation (calculée sur l’enquête + hypothèse d’interpolation)', ar: 'تقدير' },
    externe:    { fr: 'Donnée externe vérifiée', ar: 'بيانات خارجية موثقة' },
    hypothese:  { fr: 'Hypothèse', ar: 'فرضية' },
    simulation: { fr: 'Simulation', ar: 'محاكاة' }
  };

  function assumptionRegister(state, ind, surveyDate) {
    const rows = [];
    const sd = surveyDate || MODEL_DATE;
    const add = (key, fr, ar, value, unit, type, source, date) => rows.push({ key, fr, ar, value, unit, type, source, date: date || MODEL_DATE });
    if (ind) {
      add('market_sample_size', 'Nombre de répondants', 'عدد المجيبين', ind.market_sample_size, 'répondants', 'enquete', 'Enquête (base Supabase)', sd);
      if (ind.payg_interest_rate != null) add('payg_interest_rate', 'Taux d’intérêt PAYG (oui + peut-être)', 'نسبة الاهتمام', +(ind.payg_interest_rate * 100).toFixed(1), '%', 'enquete', 'Enquête — question « prêt à acquérir un kit »', sd);
      if (ind.purchase_intention_rate != null) add('purchase_intention_rate', 'Taux d’intention d’achat (oui ferme)', 'نية الشراء', +(ind.purchase_intention_rate * 100).toFixed(1), '%', 'enquete', 'Enquête', sd);
      if (ind.median_monthly_payment != null) add('median_monthly_payment', 'Montant mensuel acceptable – médiane', 'الوسيط', ind.median_monthly_payment, 'MRU / mois', 'estimation', 'Enquête, médiane interpolée sur tranches', sd);
      if (ind.average_monthly_payment != null) add('average_monthly_payment', 'Montant mensuel acceptable – moyenne', 'المتوسط', ind.average_monthly_payment, 'MRU / mois', 'estimation', 'Enquête, milieux de tranches (tranche ouverte = borne × ' + OPEN_BAND_FACTOR + ')', sd);
      if (ind.reference_monthly_price != null) add('reference_monthly_price', 'Prix mensuel de référence (hypothèse de prix client)', 'سعر مرجعي', ind.reference_monthly_price, 'MRU / mois', 'estimation', 'Enquête : montant que ' + Math.round((ind.reference_coverage || 0.5) * 100) + ' % des répondants peuvent payer', sd);
      if (ind.preferred_financing_months != null) add('preferred_financing_duration', 'Durée de financement préférée (mode)', 'المدة المفضلة', ind.preferred_financing_months, 'mois', 'enquete', 'Enquête — réponse la plus fréquente', sd);
      if (ind.preferred_payment_frequency) add('preferred_payment_frequency', 'Fréquence de paiement préférée (mode)', 'وتيرة الدفع المفضلة', ind.preferred_payment_label, '', 'enquete', 'Enquête — réponse la plus fréquente', sd);
      if (ind.insurance_interest_rate != null) add('insurance_interest_rate', 'Intérêt pour la micro-assurance (oui + oui si prime faible)', 'الاهتمام بالتأمين', +(ind.insurance_interest_rate * 100).toFixed(1), '%', 'enquete', 'Enquête', sd);
      if (ind.target_customer_segment_label) add('target_customer_segment', 'Segment le plus représenté dans l’échantillon', 'الشريحة الأكثر تمثيلا', ind.target_customer_segment_label, '', 'enquete', 'Enquête (profil principal) — pas de croisement possible avec l’intérêt', sd);
    }
    Object.keys(GLOBAL_DEFAULTS).forEach((k) => {
      const d = GLOBAL_DEFAULTS[k];
      add(k, d.fr, d.ar, state.g[k], d.unit, d.type, d.source);
    });
    return rows;
  }

  /* ---------------- 6. Exports ---------------- */

  function buildExport(state, ind, results, surveyDate) {
    const t = (o) => o.fr;
    const sheets = {};
    const r0 = (x) => (x == null || !isFinite(x) ? '' : Math.round(x));
    const pct = (x) => (x == null ? '' : +(x * 100).toFixed(1));

    sheets['Indicateurs_enquete'] = [['Indicateur', 'Valeur', 'Unité', 'Type de donnée', 'Remarque']];
    if (ind) {
      const R = sheets['Indicateurs_enquete'];
      R.push(['Nombre de répondants', ind.market_sample_size, 'répondants', 'Donnée réelle de l’enquête', 'Qualité de l’échantillon : ' + ind.sample_quality]);
      R.push(['Taux d’intérêt PAYG', pct(ind.payg_interest_rate), '%', 'Donnée réelle de l’enquête', ind.payg_interest_ci ? 'IC95 % : ' + pct(ind.payg_interest_ci[0]) + ' – ' + pct(ind.payg_interest_ci[1]) : '']);
      R.push(['Intention d’achat (oui ferme)', pct(ind.purchase_intention_rate), '%', 'Donnée réelle de l’enquête', ind.purchase_intention_ci ? 'IC95 % : ' + pct(ind.purchase_intention_ci[0]) + ' – ' + pct(ind.purchase_intention_ci[1]) : '']);
      R.push(['Montant mensuel acceptable – médiane', ind.median_monthly_payment == null ? '' : ind.median_monthly_payment, 'MRU/mois', 'Estimation', 'Interpolation sur tranches']);
      R.push(['Montant mensuel acceptable – moyenne', ind.average_monthly_payment == null ? '' : ind.average_monthly_payment, 'MRU/mois', 'Estimation', 'Milieux de tranches']);
      R.push(['Durée préférée', ind.preferred_financing_months == null ? '' : ind.preferred_financing_months, 'mois', 'Donnée réelle de l’enquête', 'Mode']);
      R.push(['Fréquence préférée', ind.preferred_payment_label || '', '', 'Donnée réelle de l’enquête', 'Mode']);
      R.push(['Intérêt micro-assurance', pct(ind.insurance_interest_rate), '%', 'Donnée réelle de l’enquête', '']);
      Object.keys(ind.distributions).forEach((k) => {
        const d = ind.distributions[k];
        if (!d || !d.total) return;
        d.items.forEach((i) => sheets['Distributions'] = (sheets['Distributions'] || [['Question', 'Option', 'Effectif', '%']]).concat([[k, i.label_fr, i.count, +i.pct.toFixed(1)]]));
      });
    }
    sheets['Hypotheses_modele'] = [['Paramètre', 'Valeur', 'Unité', 'Source', 'Date', 'Type de donnée']].concat(
      assumptionRegister(state, ind, surveyDate).map((r) => [t(r), r.value, r.unit, r.source, r.date, TYPE_LABELS[r.type].fr]));
    sheets['Prix_PAYG'] = [['Scénario', 'Composante', 'MRU']];
    sheets['Resultats_annuels'] = [['Scénario', 'Année', 'Nouveaux clients', 'Encaissements (CA)', 'Coûts variables', 'Coûts fixes', 'Coûts totaux', 'Marge brute', 'Amortissement', 'Résultat avant impôt', 'Impôt sur le bénéfice', 'Résultat net', 'Cash-flow net', 'Déficits antérieurs imputés', 'Résultat imposable', 'Déficit restant à reporter']];
    sheets['Indicateurs_financiers'] = [['Scénario', 'VAN (MRU)', 'TRI (%)', 'Payback (mois)', 'Besoin de financement max (MRU)', 'Seuil de rentabilité (clients/an)', 'CA cumulé 5 ans', 'Coûts cumulés 5 ans', 'Résultat avant impôt cumulé 5 ans', 'Impôts cumulés 5 ans', 'Résultat net cumulé 5 ans', 'Revenu moyen / client', 'Prix PAYG total (assuré)', 'Équivalent mensuel (assuré)']];
    ['prudent', 'central', 'dynamique'].forEach((k) => {
      const r = results[k]; if (!r) return;
      const nm = SCENARIO_NAMES[k].fr;
      r.priceInsured.lines.forEach((l) => sheets['Prix_PAYG'].push([nm, l.fr, r0(l.value)]));
      sheets['Prix_PAYG'].push([nm, 'TOTAL PAYG (client assuré)', r0(r.priceInsured.total)]);
      r.years.forEach((y) => sheets['Resultats_annuels'].push([nm, y.year, r0(y.clients), r0(y.revenue), r0(y.variable), r0(y.fixed), r0(y.totalCosts), r0(y.grossMargin), r0(y.deprec), r0(y.result), r0(y.tax), r0(y.netResult), r0(y.cash), r0(y.result > 0 ? y.result - y.taxBase : 0), r0(y.taxBase), r0(y.lossCarry)]));
      sheets['Indicateurs_financiers'].push([nm, r0(r.npv), r.irr == null ? 'n/d' : +(r.irr * 100).toFixed(1), r.paybackMonths == null ? '> 60' : r.paybackMonths, r0(r.fundingNeed), r.breakEvenClients == null ? 'impossible' : r.breakEvenClients, r0(r.totals.revenue), r0(r.totals.costs), r0(r.totals.result), r0(r.totals.tax), r0(r.totals.netResult), r0(r.revenuePerClient), r0(r.priceInsured.total), r0(r.priceInsured.monthlyEquivalent)]);
    });
    return sheets;
  }

  function toCSV(sheets) {
    const esc = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '\ufeff' + Object.keys(sheets).map((name) => '# ' + name + '\n' + sheets[name].map((row) => row.map(esc).join(';')).join('\n')).join('\n\n');
  }

  const API = {
    MODEL_DATE, QUESTION_MATCHERS, BANDS, KITS, GLOBAL_DEFAULTS, CAPEX_ITEMS, FIXED_ITEMS, SCENARIO_FIELDS, SCENARIO_DEFAULTS, SCENARIO_NAMES, TYPE_LABELS,
    defaultState, computeMarketIndicators, distribution, shareAtLeast, priceForCoverage, wilson,
    migrateLegacy, buildPrice, priceParams, affordability, suggestTenure, runScenario, demandHypothesis, assumptionRegister, buildExport, toCSV, irr, periodsCount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PaygEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
