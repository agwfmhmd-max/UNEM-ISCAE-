/* =====================================================================
 * study.js — Interface de l'étude de faisabilité (utilise engine.js)
 * Enquête (Supabase) → indicateurs → prix PAYG → scénarios → hypothèses → exports
 * ===================================================================== */
(function () {
  'use strict';
  const E = window.PaygEngine;
  const LS_KEY = 'payg_study_state_v2';
  const lang = () => (typeof currentLang !== 'undefined' ? currentLang : 'fr');
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (x, d) => (x == null || !isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }));
  const mru = (x) => (x == null || !isFinite(x) ? '—' : nf(Math.round(x)) + ' MRU');
  const mm = (x) => (x == null || !isFinite(x) ? '—' : (x / 1e6 >= 0 ? '' : '') + nf(x / 1e6, 2) + ' M MRU');
  const pc = (x, d) => (x == null || !isFinite(x) ? '—' : nf(x * 100, d == null ? 1 : d) + ' %');

  /* ---------- Textes ---------- */
  const T = {
    fr: {
      simBanner: 'SIMULATION / PROTOTYPE — aucun paiement réel : aucune API Bankily, Masrivi, Sedad ou Click n’est connectée. Les montants et codes affichés sont fictifs.',
      scoreBanner: 'Mécanisme expérimental proposé dans le cadre de l’étude — ce n’est PAS un score bancaire officiel. Les pondérations sont des hypothèses académiques non calibrées sur des données de remboursement réelles.',
      scoreVarsTitle: 'Variables envisagées pour le scoring', scoreVarName: 'Variable', scoreVarStatus: 'Statut dans le prototype',
      sv: [
        ['Capacité de paiement', 'Utilisée (revenu mensuel du foyer, curseur ci-dessus)'],
        ['Stabilité des revenus', 'Non implémentée — à mesurer (question « nature du revenu » de l’enquête)'],
        ['Historique de paiement', 'Simulée via le volume de paiement mobile — nécessite des données réelles'],
        ['Niveau d’endettement', 'Non disponible — nécessiterait une source externe (ex. centrale des risques)'],
        ['Comportement de paiement PAYG', 'Disponible seulement après lancement (données de remboursement réelles)'],
        ['Profil du client', 'Utilisée (wilaya, actifs et garanties locales)']
      ],
      lblPriceSection: 'Construction transparente du prix PAYG', lblCompo: 'Composante', lblAmount: 'Montant', lblShare: 'Part du total', lblPaidBy: 'Ce que paie le client',
      totalPayg: 'Prix total PAYG (acompte inclus)', perPeriod: 'Échéance PAYG', nPeriods: 'Nombre d’échéances', monthlyEq: 'Équivalent mensuel',
      lblInsShare: 'Part de l’assurance dans chaque échéance', priceTypeNote: 'Tous les coûts de ce tableau sont des HYPOTHÈSES modifiables (module 4) ; seules les valeurs issues de l’enquête sont des données réelles.',
      marketRef: 'Repère de l’enquête (échantillon)', refMonthly: 'Montant mensuel que ≥ {c} % des répondants déclarent pouvoir payer', afford: 'Part des répondants dont le budget déclaré couvre cet équivalent mensuel',
      noSurveyYet: 'Indicateurs d’enquête indisponibles pour le moment (base non connectée, pas encore de réponses ou questions d’étude de marché non ajoutées).',
      tenureAdvice: 'Durée minimale respectant le budget de référence :', noTenure: 'Aucune durée proposée (6–24 mois) ne ramène l’équivalent mensuel sous le budget de référence : le prix du kit ou le modèle doit être revu.',
      applySurvey: 'Appliquer les résultats de l’enquête au modèle', applied: 'Appliqué : durée et fréquence préférées de l’échantillon.',
      sampleResults: 'Résultats de l’échantillon', usedHyp: 'Hypothèse utilisée dans le modèle financier',
      kSample: 'Nombre de répondants', kInterest: 'Taux d’intérêt PAYG', kIntent: 'Intention d’achat', kPrice: 'Prix mensuel acceptable', kDuration: 'Durée préférée', kFreq: 'Fréquence de paiement', kIns: 'Intérêt micro-assurance',
      interestSub: 'oui + peut-être', intentSub: 'réponse « oui » ferme', priceSub: 'médiane · moyenne', modeSub: 'réponse la plus fréquente', insSub: 'oui + oui si prime faible', potential: 'Clients potentiellement intéressés (échantillon)',
      icLabel: 'IC 95 %', quality: { insuffisant: 'Échantillon insuffisant (<30)', indicatif: 'Échantillon indicatif (<100)', acceptable: 'Taille d’échantillon acceptable' },
      chPrice: 'Montant mensuel acceptable', chInterest: 'Intérêt pour le PAYG', chDuration: 'Durée de financement préférée', chFreq: 'Fréquence de paiement préférée', chWilaya: 'Répartition géographique (wilaya)', chActivity: 'Répartition par activité', chIncome: 'Répartition par tranche de revenu', chProfile: 'Profil des répondants',
      hypTable: 'De l’enquête aux hypothèses du modèle', hCol: ['Résultat de l’échantillon', 'Hypothèse du modèle', 'Valeur utilisée'],
      hRows: ['Prix mensuel acceptable → hypothèse de prix client', 'Durée préférée → hypothèse de durée de financement', 'Fréquence préférée → hypothèse de paiement', 'Intention d’achat → hypothèse de demande'],
      missingQs: 'Questions d’étude de marché absentes de la base : exécutez MARKET_STUDY_QUESTIONS.sql (revenu, activité, budget mensuel, prix total…). Les indicateurs concernés sont masqués.',
      generalize: 'Échantillon non probabiliste : ces résultats décrivent les répondants, pas l’ensemble de la population mauritanienne.',
      detail: 'Détail question par question (résultats bruts)',
      scen: 'Scénario', tabIn: 'Hypothèses du scénario', globalIn: 'Hypothèses communes', capexT: 'A. Investissement initial', fixedT: 'B. Coûts fixes annuels', varT: 'C. Coûts variables (par client)', revT: 'D. Revenus', yearT: 'Résultats annuels — scénario sélectionné', compT: 'Comparaison des trois scénarios',
      hyp: 'Hypothèse', reset: 'Rétablir les valeurs par défaut',
      varDrivers: { install_pct: 'Installation (% prix comptant)', iot_cost: 'Équipement paiement/IoT (MRU/kit)', funding_rate: 'Coût de financement (% / an)', commission_pct: 'Commission paiement mobile (%)', servicing: 'Suivi client (MRU/mois)', deposit_pct: 'Acompte (% du prix total)', insurance_takeup: 'Clients assurés (%)', tax_rate: 'Impôt sur le bénéfice (% du résultat imposable)', coverage: 'Couverture du prix de référence (% répondants)', addressable: 'Marché adressable (nb. de clients potentiels)', maybe_conv: 'Conversion des « peut-être » (%)' },
      sc: ['Nouveaux clients, année 1', 'Croissance annuelle (%)', 'Prix comptant moyen du kit (MRU)', 'Coût d’achat du kit (% du prix comptant)', 'Durée de financement (mois)', 'Taux d’impayés (%)', 'Prime d’assurance (% prix comptant / an)', 'Marge visée (% des coûts)', 'Coefficient coûts opérationnels', 'Subvention non acquise (MRU)', 'Taux d’actualisation (%)'],
      rowsYear: ['Nouveaux clients', 'Chiffre d’affaires (encaissements)', 'Coûts variables', 'Coûts fixes', 'Coûts totaux', 'Marge brute', 'Amortissement (CAPEX/5)', 'Résultat avant impôt', '− Déficits antérieurs imputés', 'Résultat imposable', 'Impôt sur le bénéfice', 'Résultat net après impôt', 'Déficit restant à reporter', 'Cash-flow net'],
      rowsComp: ['CA cumulé 5 ans', 'Coûts cumulés 5 ans', 'Marge brute cumulée', 'Résultat avant impôt cumulé 5 ans', 'Impôts cumulés 5 ans', 'Résultat net cumulé 5 ans', 'Cash-flow cumulé 5 ans', 'VAN', 'TRI', 'Payback', 'Besoin de financement max', 'Seuil de rentabilité', 'Prix PAYG total (assuré)', 'Équivalent mensuel'],
      kVAN: 'VAN (60 mois)', kTRI: 'TRI annualisé', kPB: 'Payback', kBE: 'Seuil de rentabilité',
      why: { van: 'Flux mensuels sur 60 mois actualisés à {r} % ; investissement initial : {capex}.', tri: 'Taux qui annule la VAN des mêmes flux.', pb: 'Premier mois où le cash-flow cumulé devient positif.', be: 'Coûts fixes annuels ({fixed}) ÷ contribution par client ({contrib}) sur toute la durée de financement.' },
      months: 'mois', clientsYr: 'clients / an', over60: '> 60 mois', na: 'non calculable',
      demandT: 'Confrontation à la demande de l’enquête', demandTxt: 'Marché adressable (hypothèse) {a} × taux de demande {r} (intentions « oui » + {m} % des « peut-être », hypothèse) ≈ {n} clients ; le scénario vise {s} clients sur 5 ans, soit {p} de cette demande.',
      noDemand: 'Pas encore de taux d’intention d’achat issu de l’enquête.',
      verdict: 'Lecture des résultats', vPos: 'VAN positive dans {k} scénario(s) sur 3.', vNeg: 'VAN négative dans le scénario sélectionné : sous ces hypothèses, le projet ne crée pas de valeur.', vPos2: 'VAN positive dans le scénario sélectionné sous ces hypothèses.',
      vCaveat: 'Ces résultats dépendent d’hypothèses non encore validées (coûts, impayés, financement) : ils servent à tester la faisabilité, ils ne la prouvent pas.',
      vAfford: 'Attention : l’équivalent mensuel du kit ({m}) dépasse le budget que déclarent pouvoir payer la plupart des répondants ({p} seulement le couvrent).',
      asmTitle: 'Hypothèses du modèle', asmCols: ['Paramètre', 'Valeur', 'Unité', 'Source', 'Date', 'Type'], filterAll: 'Tous', export: 'Exporter les résultats', exCSV: 'CSV', exXLSX: 'Excel', exPDF: 'PDF (impression)', exDOCX: 'Word (rapport)', exPPTX: 'PowerPoint (soutenance)', exJSON: 'Paramètres Enquête → Prototype (JSON)',
      params: 'Paramètres transmis au prototype', navAsm: 'Hypothèses & Export', asmDesc: 'Chaque donnée est classée : donnée réelle de l’enquête, estimation, donnée externe vérifiée, hypothèse ou simulation. Les mêmes chiffres alimentent le rapport Word et le PowerPoint.', legend: 'Classification des données', printTitle: 'Étude de faisabilité — synthèse des résultats'
    },
    ar: {
      simBanner: 'محاكاة / نموذج أولي — لا توجد عملية دفع حقيقية: لا يوجد ربط فعلي بواجهات Bankily أو Masrivi أو Sedad أو Click. المبالغ والرموز المعروضة وهمية.',
      scoreBanner: 'آلية تجريبية مقترحة في إطار الدراسة — وهي ليست تنقيطا بنكيا رسميا. الأوزان فرضيات أكاديمية غير معايَرة على بيانات سداد فعلية.',
      scoreVarsTitle: 'المتغيرات المقترحة للتنقيط', scoreVarName: 'المتغير', scoreVarStatus: 'الحالة في النموذج',
      sv: [['القدرة على الدفع', 'مستخدمة (دخل الأسرة الشهري)'], ['استقرار الدخل', 'غير منفذة — تُقاس عبر سؤال طبيعة الدخل'], ['سجل الدفع', 'محاكاة عبر حجم الدفع بالهاتف — تتطلب بيانات حقيقية'], ['مستوى المديونية', 'غير متاح — يتطلب مصدرا خارجيا'], ['سلوك الدفع في PAYG', 'متاح بعد الإطلاق فقط'], ['ملف العميل', 'مستخدم (الولاية، الأصول والضمانات)']],
      lblPriceSection: 'بناء شفاف لسعر PAYG', lblCompo: 'المكوّن', lblAmount: 'المبلغ', lblShare: 'النسبة', lblPaidBy: 'ما يدفعه العميل',
      totalPayg: 'السعر الإجمالي PAYG (مع الدفعة المقدمة)', perPeriod: 'القسط PAYG', nPeriods: 'عدد الأقساط', monthlyEq: 'المعادل الشهري',
      lblInsShare: 'حصة التأمين في كل قسط', priceTypeNote: 'جميع تكاليف هذا الجدول فرضيات قابلة للتعديل (الوحدة 4)؛ والقيم الوحيدة الفعلية هي المستخرجة من الاستبيان.',
      marketRef: 'مرجع الاستبيان (العينة)', refMonthly: 'مبلغ شهري يصرّح ≥ {c}% من المجيبين بقدرتهم على دفعه', afford: 'نسبة المجيبين الذين تغطي ميزانيتهم هذا المعادل الشهري',
      noSurveyYet: 'مؤشرات الاستبيان غير متاحة حاليا (قاعدة غير متصلة، لا إجابات، أو أسئلة دراسة السوق غير مضافة).',
      tenureAdvice: 'أقل مدة تحترم الميزانية المرجعية:', noTenure: 'لا توجد مدة (6–24 شهرا) تُنزل المعادل الشهري تحت الميزانية المرجعية: يجب مراجعة سعر النظام أو النموذج.',
      applySurvey: 'تطبيق نتائج الاستبيان على النموذج', applied: 'تم التطبيق: المدة والوتيرة المفضلتان في العينة.',
      sampleResults: 'نتائج العينة', usedHyp: 'الفرضية المعتمدة في النموذج المالي',
      kSample: 'عدد المجيبين', kInterest: 'نسبة الاهتمام بـ PAYG', kIntent: 'نية الشراء', kPrice: 'المبلغ الشهري المقبول', kDuration: 'المدة المفضلة', kFreq: 'وتيرة الدفع', kIns: 'الاهتمام بالتأمين الأصغر',
      interestSub: 'نعم + ربما', intentSub: 'إجابة «نعم» قاطعة', priceSub: 'الوسيط · المتوسط', modeSub: 'الإجابة الأكثر تكرارا', insSub: 'نعم + نعم إذا كان القسط منخفضا', potential: 'العملاء المهتمون المحتملون (العينة)',
      icLabel: 'فاصل ثقة 95%', quality: { insuffisant: 'عينة غير كافية (<30)', indicatif: 'عينة إرشادية (<100)', acceptable: 'حجم عينة مقبول' },
      chPrice: 'المبلغ الشهري المقبول', chInterest: 'الاهتمام بـ PAYG', chDuration: 'مدة التمويل المفضلة', chFreq: 'وتيرة الدفع المفضلة', chWilaya: 'التوزيع الجغرافي (الولاية)', chActivity: 'التوزيع حسب النشاط', chIncome: 'التوزيع حسب شريحة الدخل', chProfile: 'ملف المجيبين',
      hypTable: 'من الاستبيان إلى فرضيات النموذج', hCol: ['نتيجة العينة', 'فرضية النموذج', 'القيمة المعتمدة'],
      hRows: ['المبلغ الشهري المقبول ← فرضية سعر العميل', 'المدة المفضلة ← فرضية مدة التمويل', 'الوتيرة المفضلة ← فرضية الدفع', 'نية الشراء ← فرضية الطلب'],
      missingQs: 'أسئلة دراسة السوق غير موجودة في القاعدة: شغّل MARKET_STUDY_QUESTIONS.sql. المؤشرات المعنية مخفية.',
      generalize: 'عينة غير احتمالية: هذه النتائج تصف المجيبين وليس كل سكان موريتانيا.',
      detail: 'التفصيل سؤالا بسؤال (النتائج الخام)',
      scen: 'السيناريو', tabIn: 'فرضيات السيناريو', globalIn: 'فرضيات مشتركة', capexT: 'أ. الاستثمار الأولي', fixedT: 'ب. التكاليف الثابتة السنوية', varT: 'ج. التكاليف المتغيرة (لكل عميل)', revT: 'د. الإيرادات', yearT: 'النتائج السنوية — السيناريو المختار', compT: 'مقارنة السيناريوهات الثلاثة',
      hyp: 'فرضية', reset: 'استعادة القيم الافتراضية',
      varDrivers: { install_pct: 'التركيب (% من السعر النقدي)', iot_cost: 'جهاز الدفع (أوقية/نظام)', funding_rate: 'تكلفة التمويل (% سنويا)', commission_pct: 'عمولة الدفع (%)', servicing: 'متابعة العميل (أوقية/شهر)', deposit_pct: 'الدفعة المقدمة (%)', insurance_takeup: 'العملاء المؤمَّنون (%)', tax_rate: 'الضريبة على الأرباح (% من الربح الخاضع للضريبة)', coverage: 'تغطية السعر المرجعي (% المجيبين)', addressable: 'السوق المستهدف (عدد العملاء)', maybe_conv: 'تحويل «ربما» (%)' },
      sc: ['عملاء جدد، السنة 1', 'النمو السنوي (%)', 'متوسط السعر النقدي (أوقية)', 'تكلفة شراء النظام (%)', 'مدة التمويل (أشهر)', 'نسبة التعثر (%)', 'قسط التأمين (% سنويا)', 'الهامش (% من التكاليف)', 'معامل التكاليف التشغيلية', 'منحة غير مؤكدة (أوقية)', 'معدل الخصم (%)'],
      rowsYear: ['عملاء جدد', 'رقم المعاملات (المقبوضات)', 'تكاليف متغيرة', 'تكاليف ثابتة', 'إجمالي التكاليف', 'الهامش الإجمالي', 'الاهتلاك', 'النتيجة قبل الضريبة', '− الخسائر المرحّلة المخصومة', 'الربح الخاضع للضريبة', 'الضريبة على الأرباح', 'النتيجة الصافية بعد الضريبة', 'الخسارة المتبقية للترحيل', 'التدفق النقدي الصافي'],
      rowsComp: ['رقم المعاملات 5 سنوات', 'التكاليف 5 سنوات', 'الهامش الإجمالي', 'النتيجة قبل الضريبة 5 سنوات', 'الضرائب 5 سنوات', 'النتيجة الصافية 5 سنوات', 'التدفق النقدي 5 سنوات', 'القيمة الحالية الصافية', 'معدل العائد الداخلي', 'فترة الاسترداد', 'أقصى حاجة تمويل', 'عتبة المردودية', 'السعر الإجمالي PAYG', 'المعادل الشهري'],
      kVAN: 'القيمة الحالية الصافية (60 شهرا)', kTRI: 'معدل العائد الداخلي', kPB: 'فترة الاسترداد', kBE: 'عتبة المردودية',
      why: { van: 'تدفقات شهرية على 60 شهرا مخصومة بمعدل {r}%؛ الاستثمار الأولي: {capex}.', tri: 'المعدل الذي يجعل القيمة الحالية صفرا.', pb: 'أول شهر يصبح فيه التدفق التراكمي موجبا.', be: 'التكاليف الثابتة السنوية ({fixed}) ÷ مساهمة العميل ({contrib}).' },
      months: 'شهرا', clientsYr: 'عميل / سنة', over60: '> 60 شهرا', na: 'غير قابل للحساب',
      demandT: 'مقارنة بالطلب المستخلص من الاستبيان', demandTxt: 'السوق المستهدف (فرضية) {a} × نسبة الطلب {r} ≈ {n} عميلا؛ السيناريو يستهدف {s} عميلا خلال 5 سنوات أي {p} من هذا الطلب.',
      noDemand: 'لا توجد بعد نسبة نية شراء من الاستبيان.',
      verdict: 'قراءة النتائج', vPos: 'قيمة حالية صافية موجبة في {k} سيناريو من 3.', vNeg: 'القيمة الحالية الصافية سالبة في السيناريو المختار: وفق هذه الفرضيات لا يخلق المشروع قيمة.', vPos2: 'القيمة الحالية الصافية موجبة في السيناريو المختار وفق هذه الفرضيات.',
      vCaveat: 'تعتمد هذه النتائج على فرضيات لم تُثبت بعد: فهي تختبر الجدوى ولا تثبتها.',
      vAfford: 'تنبيه: المعادل الشهري ({m}) يتجاوز ما يصرّح معظم المجيبين بقدرتهم على دفعه ({p} فقط يغطونه).',
      asmTitle: 'فرضيات النموذج', asmCols: ['المعامل', 'القيمة', 'الوحدة', 'المصدر', 'التاريخ', 'النوع'], filterAll: 'الكل', export: 'تصدير النتائج', exCSV: 'CSV', exXLSX: 'Excel', exPDF: 'PDF (طباعة)', exDOCX: 'Word (تقرير)', exPPTX: 'PowerPoint (عرض المناقشة)', exJSON: 'معاملات الاستبيان ← النموذج (JSON)',
      params: 'المعاملات المنقولة إلى النموذج', navAsm: 'الفرضيات والتصدير', asmDesc: 'كل معطى مصنف: فعلي من الاستبيان، تقدير، معطى خارجي موثق، فرضية أو محاكاة. الأرقام نفسها تغذي تقرير Word وعرض PowerPoint.', legend: 'تصنيف البيانات', printTitle: 'دراسة الجدوى — ملخص النتائج'
    }
  };
  const t = () => T[lang()];
  const TYPE_STYLE = { enquete: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', estimation: 'bg-sky-500/15 text-sky-300 border-sky-500/30', externe: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', hypothese: 'bg-amber-500/15 text-amber-300 border-amber-500/30', simulation: 'bg-purple-500/15 text-purple-300 border-purple-500/30' };
  const badge = (type) => '<span class="inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ' + TYPE_STYLE[type] + '">' + esc(E.TYPE_LABELS[type][lang()]) + '</span>';
  const tag = (type, short) => '<span class="inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ' + TYPE_STYLE[type] + '">' + esc(short) + '</span>';

  /* ---------- État ---------- */
  let state = E.defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved && saved.g && saved.sc) { Object.assign(state.g, saved.g); Object.keys(state.sc).forEach((k) => Object.assign(state.sc[k], saved.sc[k] || {})); }
  } catch (e) { /* stockage indisponible : on garde les valeurs par défaut */ }
  E.migrateLegacy(state.g, state.sc); // anciennes valeurs (ancienne ouguiya) -> nouvelle ouguiya ; valeurs personnalisées conservées
  const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } if (window.HypDB) window.HypDB.saveState(state); };

  let indicators = null, surveyStatus = 'loading', surveyMeta = null, activeScenario = 'central', results = {}, charts = [];
  const KIT_KEYS = { kit1: 'kit1_cash', kit2: 'kit2_cash', kit3: 'kit3_cash' };

  const recomputeAll = () => { ['prudent', 'central', 'dynamique'].forEach((k) => { results[k] = E.runScenario(state.g, state.sc[k]); }); };
  const surveyDate = () => (surveyMeta && surveyMeta.updatedAt ? surveyMeta.updatedAt.toISOString().slice(0, 10) : E.MODEL_DATE);

  /* ---------- Graphiques ---------- */
  const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316'];
  const TC = () => (window.themeColors ? window.themeColors() : { tick: '#94a3b8', grid: 'rgba(255,255,255,.05)', edge: '#0f172a' });
  function killCharts() { charts.forEach((c) => { try { c.destroy(); } catch (e) { /* ignore */ } }); charts = []; }
  function chart(id, type, labels, data, title) {
    const el = $(id); if (!el || typeof Chart === 'undefined') return;
    const isPie = type === 'doughnut';
    charts.push(new Chart(el.getContext('2d'), {
      type, data: { labels, datasets: [{ data, backgroundColor: isPie ? COLORS : COLORS[0] + 'cc', borderColor: isPie ? TC().edge : COLORS[0], borderWidth: isPie ? 2 : 1, borderRadius: isPie ? 0 : 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: type === 'bar' && labels.length > 5 ? 'y' : 'x',
        plugins: { legend: { display: isPie, position: 'bottom', labels: { color: TC().tick, font: { size: 10 }, boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => ' ' + nf(c.parsed.y != null && !isPie ? (c.chart.options.indexAxis === 'y' ? c.parsed.x : c.parsed.y) : c.parsed, 1) + ' %' } } },
        scales: isPie ? {} : { x: { grid: { display: false }, ticks: { color: TC().tick, font: { size: 10 } } }, y: { grid: { color: TC().grid }, ticks: { color: TC().tick, font: { size: 10 } } } }
      }
    }));
  }

  /* ---------- Module 5 : synthèse de l’étude de marché ---------- */
  const lab = (i) => (lang() === 'ar' && i.label_ar ? i.label_ar : i.label_fr);
  const kpiCard = (label, value, sub, color) => '<div class="bg-slate-950 border border-slate-800 p-4 rounded-xl text-center shadow"><span class="text-[11px] text-slate-400 block mb-1">' + esc(label) + '</span><span class="text-xl sm:text-2xl font-extrabold font-mono ' + color + '">' + value + '</span><span class="text-[10px] text-slate-500 block mt-1">' + sub + '</span></div>';

  function renderMarket() {
    const root = $('marketStudyRoot'); if (!root) return;
    killCharts();
    const L = t();
    if (!indicators) { root.innerHTML = '<div class="p-3 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-400">' + esc(L.noSurveyYet) + '</div>'; return; }
    const I = indicators, D = I.distributions;
    const ci = (c) => (c ? ' · ' + L.icLabel + ' ' + nf(c[0] * 100, 0) + '–' + nf(c[1] * 100, 0) + ' %' : '');
    let h = '<div class="flex flex-wrap items-center gap-2 text-[11px]">' + tag('enquete', L.sampleResults) + '<span class="px-2 py-0.5 rounded border border-slate-700 text-slate-300">' + esc(L.quality[I.sample_quality]) + '</span></div>';
    h += '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">';
    h += kpiCard(L.kSample, nf(I.market_sample_size), esc(L.potential) + ' : ' + (I.interested_count != null ? nf(I.interested_count) : '—'), 'text-cyan-400');
    h += kpiCard(L.kInterest, pc(I.payg_interest_rate, 0), esc(L.interestSub) + ci(I.payg_interest_ci), 'text-emerald-400');
    h += kpiCard(L.kIntent, pc(I.purchase_intention_rate, 0), esc(L.intentSub) + ci(I.purchase_intention_ci), 'text-amber-400');
    h += kpiCard(L.kPrice, I.median_monthly_payment != null ? nf(I.median_monthly_payment) + ' · ' + nf(I.average_monthly_payment) : '—', 'MRU / ' + (lang() === 'ar' ? 'شهر' : 'mois') + ' — ' + esc(L.priceSub), 'text-purple-400');
    h += kpiCard(L.kDuration, I.preferred_financing_label ? esc(I.preferred_financing_label) : '—', esc(L.modeSub), 'text-blue-400');
    h += kpiCard(L.kFreq, I.preferred_payment_label ? esc(I.preferred_payment_label) : '—', esc(L.modeSub), 'text-rose-400');
    h += kpiCard(L.kIns, pc(I.insurance_interest_rate, 0), esc(L.insSub) + ci(I.insurance_interest_ci), 'text-teal-400');
    h += '</div>';
    h += '<div class="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-200"><i class="fa-solid fa-triangle-exclamation mx-1"></i>' + esc(I.warnings.join(' ')) + '</div>';
    if (!D.monthlyPrice || !D.income) h += '<div class="p-3 rounded-lg border border-slate-700 bg-slate-950 text-[11px] text-slate-400"><i class="fa-solid fa-circle-info mx-1"></i>' + esc(L.missingQs) + '</div>';

    const defs = [['monthlyPrice', 'chPrice', 'bar'], ['interest', 'chInterest', 'doughnut'], ['duration', 'chDuration', 'bar'], ['frequency', 'chFreq', 'bar'], ['wilaya', 'chWilaya', 'bar'], ['activity', 'chActivity', 'doughnut'], ['income', 'chIncome', 'bar'], ['profile', 'chProfile', 'doughnut']];
    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    const todo = [];
    defs.forEach(([k, title, type], i) => {
      const d = D[k]; if (!d || !d.total) return;
      let items = d.items.slice();
      if (k === 'wilaya') items = items.filter((x) => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 8);
      if (type === 'doughnut') items = items.filter((x) => x.count > 0);
      todo.push(['mchart' + i, type, items.map(lab), items.map((x) => +x.pct.toFixed(1))]);
      h += '<div class="bg-slate-950 border border-slate-800 p-4 rounded-xl"><h5 class="text-xs font-bold text-slate-300 mb-1">' + esc(L[title]) + '</h5><p class="text-[10px] text-slate-500 mb-2">n = ' + nf(d.total) + '</p><div class="h-52"><canvas id="mchart' + i + '"></canvas></div></div>';
    });
    h += '</div>';

    // Résultats de l'échantillon → hypothèses du modèle
    const ref = I.reference_monthly_price;
    h += '<div class="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3"><div class="flex flex-wrap justify-between items-center gap-2"><h5 class="text-xs font-bold text-amber-400">' + esc(L.hypTable) + '</h5><button type="button" id="btnApplySurvey" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs">' + esc(L.applySurvey) + '</button></div>';
    h += '<div class="overflow-x-auto"><table class="w-full text-[11px] text-slate-300"><thead><tr class="text-slate-500 text-start">' + L.hCol.map((c) => '<th class="py-1 px-2 text-start">' + esc(c) + '</th>').join('') + '</tr></thead><tbody>';
    const dem = E.demandHypothesis(I, state.g);
    const rowsH = [
      [I.median_monthly_payment != null ? 'médiane ' + nf(I.median_monthly_payment) + ' · moy. ' + nf(I.average_monthly_payment) + ' MRU/mois' : '—', ref != null ? nf(ref) + ' MRU / ' + (lang() === 'ar' ? 'شهر' : 'mois') + ' (' + state.g.coverage + ' % ' + (lang() === 'ar' ? 'يقدرون' : 'peuvent payer') + ')' : '—'],
      [I.preferred_financing_label || '—', I.preferred_financing_months != null ? I.preferred_financing_months + ' ' + t().months : '—'],
      [I.preferred_payment_label || '—', I.preferred_payment_code || '—'],
      [I.purchase_intention_rate != null ? pc(I.purchase_intention_rate, 0) + ' oui · ' + pc(I.maybe_rate, 0) + ' peut-être' : '—', dem ? pc(dem.rate, 1) + ' (' + state.g.maybe_conv + ' % des « peut-être »)' : '—']
    ];
    rowsH.forEach((r, i) => { h += '<tr class="border-t border-slate-800"><td class="py-1.5 px-2">' + esc(L.hRows[i]) + '</td><td class="py-1.5 px-2">' + tag('enquete', L.sampleResults) + ' ' + esc(r[0]) + '</td><td class="py-1.5 px-2">' + tag('hypothese', L.usedHyp) + ' ' + esc(r[1]) + '</td></tr>'; });
    h += '</tbody></table></div><p class="text-[10px] text-slate-500">' + esc(L.generalize) + '</p><p id="appliedMsg" class="text-[11px] text-emerald-400 hidden">' + esc(L.applied) + '</p></div>';
    root.innerHTML = h;
    todo.forEach((a) => chart.apply(null, a));
    const b = $('btnApplySurvey'); if (b) b.onclick = applySurvey;
  }

  function applySurvey() {
    const I = indicators; if (!I) return;
    if (I.preferred_payment_code) { state.g.freq = I.preferred_payment_code; const f = $('freqInput'); if (f) f.value = I.preferred_payment_code; }
    if (I.preferred_financing_months) { Object.keys(state.sc).forEach((k) => { state.sc[k].tenure = I.preferred_financing_months; }); const te = $('tenureInput'); if (te) te.value = String(I.preferred_financing_months); }
    save(); renderAll();
    const m = $('appliedMsg'); if (m) m.classList.remove('hidden');
  }

  /* ---------- Module 2 : tarification ---------- */
  function currentPriceInputs() {
    const kit = (document.querySelector('input[name="productKit"]:checked') || {}).value || 'kit1';
    const cash = state.g[KIT_KEYS[kit]];
    const s = Object.assign({}, state.sc.central, { cashPrice: cash, tenure: parseInt(($('tenureInput') || {}).value, 10) || 12 });
    const g = Object.assign({}, state.g, { freq: ($('freqInput') || {}).value || 'weekly', deposit_pct: parseInt(($('resAcomptePct') || {}).innerText, 10) || state.g.deposit_pct });
    const insured = !!($('insuranceToggle') || {}).checked;
    return { p: E.priceParams(g, s, insured), kit, g, s };
  }

  function renderPricing() {
    if (!$('outInstallment')) return;
    const L = t(), { p, g, s } = currentPriceInputs(), pr = E.buildPrice(p), P = pr.parts;
    const freqNames = { daily: lang() === 'ar' ? 'القسط اليومي :' : 'Échéance quotidienne :', weekly: lang() === 'ar' ? 'القسط الأسبوعي :' : 'Échéance hebdomadaire :', monthly: lang() === 'ar' ? 'القسط الشهري :' : 'Échéance mensuelle :' };
    $('outAcompte').innerText = mru(pr.deposit);
    $('outInstallment').innerText = mru(pr.installment);
    $('outTotalCost').innerText = mru(pr.total);
    $('freqLabelDisplay').innerText = freqNames[p.freq];
    const base = P.kit + P.install + P.iot, ins = P.insurance, other = pr.total - base - ins;
    const w = (x) => Math.max(0, Math.round((x / pr.total) * 100));
    $('barPrincipal').style.width = w(base) + '%'; $('barInterest').style.width = w(other) + '%'; $('barInsurance').style.width = Math.max(0, 100 - w(base) - w(other)) + '%';
    $('lblCapVal').innerText = mru(base); $('lblIntVal').innerText = mru(other); $('lblInsVal').innerText = mru(ins);
    window.__lastInstallment = pr.installment; window.__lastPeriods = pr.periods; window.__freq = p.freq;
    refreshPayButtons();
    if (typeof window.syncPaymentPlan === 'function') window.syncPaymentPlan();

    const root = $('pricingStudyRoot'); if (!root) return;
    let h = '<div class="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4"><h4 class="text-xs text-emerald-400 font-bold uppercase tracking-wider">' + esc(L.lblPriceSection) + '</h4>';
    h += '<div class="overflow-x-auto"><table class="w-full text-xs text-slate-300"><thead><tr class="text-slate-500"><th class="py-1 text-start">' + esc(L.lblCompo) + '</th><th class="py-1 text-end">' + esc(L.lblAmount) + '</th><th class="py-1 text-end">' + esc(L.lblShare) + '</th></tr></thead><tbody>';
    pr.lines.forEach((l) => { const isIns = l.id === 'insurance'; h += '<tr class="border-t border-slate-800' + (isIns ? ' bg-emerald-500/10' : '') + '"><td class="py-1.5">' + esc(lang() === 'ar' ? l.ar : l.fr) + ' ' + tag('hypothese', L.hyp) + '</td><td class="py-1.5 text-end font-mono">' + mru(l.value) + '</td><td class="py-1.5 text-end font-mono">' + pc(l.value / pr.total, 1) + '</td></tr>'; });
    h += '<tr class="border-t-2 border-slate-600 font-bold text-white"><td class="py-2">' + esc(L.totalPayg) + '</td><td class="py-2 text-end font-mono">' + mru(pr.total) + '</td><td class="py-2 text-end font-mono">100 %</td></tr>';
    h += '<tr class="text-slate-400"><td class="py-1">' + esc(L.nPeriods) + ' (' + p.freq + ')</td><td class="py-1 text-end font-mono">' + nf(pr.periods) + '</td><td></td></tr>';
    h += '<tr class="text-emerald-300"><td class="py-1">' + esc(L.perPeriod) + ' = (' + esc(L.totalPayg) + ' − ' + (lang() === 'ar' ? 'المقدمة' : 'acompte') + ') ÷ ' + esc(L.nPeriods) + '</td><td class="py-1 text-end font-mono">' + mru(pr.installment) + '</td><td></td></tr>';
    h += '<tr class="text-slate-400"><td class="py-1">' + esc(L.monthlyEq) + '</td><td class="py-1 text-end font-mono">' + mru(pr.monthlyEquivalent) + '</td><td></td></tr>';
    h += '<tr class="text-emerald-400"><td class="py-1">' + esc(L.lblInsShare) + '</td><td class="py-1 text-end font-mono">' + mru(p.insured ? (P.insurance) / pr.periods : 0) + '</td><td></td></tr>';
    h += '</tbody></table></div><p class="text-[10px] text-slate-500">' + esc(L.priceTypeNote) + '</p>';

    // Repère enquête
    h += '<div class="border-t border-slate-800 pt-3 space-y-2"><div class="text-xs font-bold text-cyan-300">' + esc(L.marketRef) + ' ' + tag('enquete', L.sampleResults) + '</div>';
    const I = indicators, aff = I ? E.affordability(I, pr) : null;
    if (I && I.reference_monthly_price != null) {
      h += '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs"><div class="bg-slate-900 border border-slate-800 rounded-lg p-2.5"><span class="text-slate-400 block text-[11px]">' + esc(L.refMonthly.replace('{c}', Math.round((I.reference_coverage || 0.5) * 100))) + '</span><strong class="font-mono text-cyan-300">' + mru(I.reference_monthly_price) + '</strong></div>';
      h += '<div class="bg-slate-900 border border-slate-800 rounded-lg p-2.5"><span class="text-slate-400 block text-[11px]">' + esc(L.monthlyEq) + '</span><strong class="font-mono text-white">' + mru(pr.monthlyEquivalent) + '</strong></div>';
      h += '<div class="bg-slate-900 border border-slate-800 rounded-lg p-2.5"><span class="text-slate-400 block text-[11px]">' + esc(L.afford) + '</span><strong class="font-mono ' + (aff && aff.share >= 0.5 ? 'text-emerald-400' : 'text-red-400') + '">' + (aff ? pc(aff.share, 0) : '—') + '</strong></div></div>';
      if (pr.monthlyEquivalent > I.reference_monthly_price) {
        const sg = E.suggestTenure(I, p, I.reference_monthly_price);
        h += '<p class="text-[11px] text-amber-300"><i class="fa-solid fa-triangle-exclamation mx-1"></i>' + (sg ? esc(L.tenureAdvice) + ' <strong>' + sg.tenure + ' ' + esc(L.months) + '</strong> (' + mru(sg.monthly) + ' / ' + (lang() === 'ar' ? 'شهر' : 'mois') + ')' : esc(L.noTenure)) + '</p>';
      }
    } else h += '<p class="text-[11px] text-slate-500">' + esc(L.noSurveyYet) + '</p>';
    h += '</div></div>';
    root.innerHTML = h;
    if (window.Extras) window.Extras.render();
  }

  function refreshPayButtons() {
    const b = document.querySelectorAll('#module-iot button[onclick^="simulatePaymentWithAmount"]');
    const inst = window.__lastInstallment; if (!b.length || !inst || !isFinite(inst)) return;
    const per = { daily: lang() === 'ar' ? 'يوم' : 'jour', weekly: lang() === 'ar' ? 'أسبوع' : 'sem.', monthly: lang() === 'ar' ? 'شهر' : 'mois' }[window.__freq] || '';
    const a1 = Math.round(inst), a2 = Math.round(inst * (window.__freq === 'daily' ? 30 : window.__freq === 'weekly' ? 4 : 1));
    b[0].setAttribute('onclick', 'simulatePaymentWithAmount(' + a1 + ')'); b[0].textContent = nf(a1) + ' MRU (1 ' + per + ')';
    b[1].setAttribute('onclick', 'simulatePaymentWithAmount(' + a2 + ')'); b[1].textContent = nf(a2) + ' MRU (' + (lang() === 'ar' ? 'شهر' : '1 mois') + ')';
  }

  /* ---------- Module 4 : modèle financier ---------- */
  const scField = (key, label, val) => '<label class="block"><span class="block text-[11px] text-slate-300 mb-1">' + esc(label) + '</span><input type="number" step="any" data-sc="' + key + '" value="' + val + '" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"></label>';
  const gField = (key, label, val, type) => '<label class="block"><span class="block text-[11px] text-slate-300 mb-1">' + esc(label) + ' ' + tag(type || 'hypothese', t().hyp) + '</span><input type="number" step="any" data-g="' + key + '" value="' + val + '" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"></label>';

  function renderFinInputs() {
    const root = $('finInputsRoot'); if (!root) return;
    const L = t(), s = state.sc[activeScenario];
    let h = '<div class="flex flex-wrap gap-2 mb-3">';
    ['prudent', 'central', 'dynamique'].forEach((k) => { h += '<button type="button" data-tab="' + k + '" class="px-3 py-1.5 rounded-lg text-xs font-bold border ' + (k === activeScenario ? 'bg-amber-500/20 border-amber-500 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-300') + '">' + esc(E.SCENARIO_NAMES[k][lang()]) + '</button>'; });
    h += '<button type="button" id="btnResetState" class="ms-auto px-3 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-white">' + esc(L.reset) + '</button></div>';
    h += '<h5 class="text-[11px] font-bold text-amber-400 mb-2">' + esc(L.tabIn) + ' — ' + esc(E.SCENARIO_NAMES[activeScenario][lang()]) + '</h5><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">';
    E.SCENARIO_FIELDS.forEach(([key], i) => { h += scField(key, L.sc[i], s[key]); });
    h += '</div><h5 class="text-[11px] font-bold text-amber-400 mb-2">' + esc(L.varT) + '</h5><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">';
    Object.keys(L.varDrivers).forEach((k) => { h += gField(k, L.varDrivers[k], state.g[k]); });
    h += '</div><div class="grid grid-cols-1 lg:grid-cols-2 gap-5"><div><h5 class="text-[11px] font-bold text-amber-400 mb-2">' + esc(L.capexT) + '</h5><div class="grid grid-cols-1 sm:grid-cols-2 gap-3">';
    E.CAPEX_ITEMS.forEach(([k, fr, ar]) => { h += gField(k, lang() === 'ar' ? ar : fr, state.g[k]); });
    h += '</div></div><div><h5 class="text-[11px] font-bold text-amber-400 mb-2">' + esc(L.fixedT) + '</h5><div class="grid grid-cols-1 sm:grid-cols-2 gap-3">';
    E.FIXED_ITEMS.forEach(([k, fr, ar]) => { h += gField(k, lang() === 'ar' ? ar : fr, state.g[k]); });
    h += '</div></div></div><h5 class="text-[11px] font-bold text-amber-400 mt-5 mb-2">' + esc(L.revT) + '</h5><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">';
    ['kit1_cash', 'kit2_cash', 'kit3_cash'].forEach((k) => { h += gField(k, lang() === 'ar' ? E.GLOBAL_DEFAULTS[k].ar : E.GLOBAL_DEFAULTS[k].fr, state.g[k]); });
    h += '</div><p class="text-[10px] text-slate-500 mt-2">' + esc(lang() === 'ar' ? 'الإيرادات = عدد العملاء × متوسط الإيراد لكل عميل (الدفعة المقدمة + الأقساط × (1 − التعثر)).' : 'Revenus = nombre de clients × revenu moyen par client (acompte + échéances × (1 − impayés)). Le prix de chaque kit alimente le module 2.') + '</p>';
    root.innerHTML = h;
  }

  function renderFinOutputs() {
    const L = t(); recomputeAll();
    const r = results[activeScenario], s = state.sc[activeScenario], P = r.priceInsured;
    const hi = $('headerInsolvencyRate'); if (hi) hi.innerText = nf(state.sc.central.defaultRate, 1) + '%';
    const set = (id, txt, ok) => { const el = $(id); if (!el) return; el.innerText = txt; if (ok != null && id === 'outVAN') el.className = 'text-lg sm:text-xl font-extrabold font-mono ' + (ok ? 'text-emerald-400' : 'text-red-400'); };
    set('outVAN', (r.npv >= 0 ? '+' : '') + nf(r.npv / 1e6, 2) + ' M MRU', r.npv >= 0);
    set('outTRI', r.irr == null ? L.na : nf(r.irr * 100, 1) + ' %');
    set('outPayback', r.paybackMonths == null ? L.over60 : r.paybackMonths + ' ' + L.months);
    set('outBreakEven', r.breakEvenClients == null ? L.na : nf(r.breakEvenClients) + ' ' + L.clientsYr);
    const why = (id, txt) => { const el = $(id); if (el) el.innerText = txt; };
    why('whyVAN', L.why.van.replace('{r}', s.discount).replace('{capex}', mru(r.capex) + (s.grant ? ' − ' + mru(s.grant) : '')));
    why('whyTRI', L.why.tri); why('whyPB', L.why.pb);
    why('whyBE', L.why.be.replace('{fixed}', mru(r.fixedAnnual)).replace('{contrib}', mru(r.contributionPerClient)));

    // Tableaux
    const Y = r.years.map((y) => Object.assign({}, y, { lossUsed: y.result > 0 ? y.result - y.taxBase : 0 })); // déficit antérieur imputé (affichage)
    let h = '<h5 class="text-xs font-bold text-slate-300 mb-2">' + esc(L.yearT) + '</h5><div class="overflow-x-auto"><table class="w-full text-[11px] text-slate-300"><thead><tr class="text-slate-500"><th class="text-start py-1"></th>' + Y.map((y) => '<th class="text-end py-1 px-2">' + (lang() === 'ar' ? 'سنة ' : 'An ') + y.year + '</th>').join('') + '</tr></thead><tbody>';
    const keys = ['clients', 'revenue', 'variable', 'fixed', 'totalCosts', 'grossMargin', 'deprec', 'result', 'lossUsed', 'taxBase', 'tax', 'netResult', 'lossCarry', 'cash'];
    keys.forEach((k, i) => { h += '<tr class="border-t border-slate-800 ' + (['revenue', 'result', 'netResult', 'cash'].includes(k) ? 'font-bold text-white' : '') + '"><td class="py-1">' + esc(L.rowsYear[i]) + '</td>' + Y.map((y) => '<td class="text-end px-2 font-mono ' + (y[k] < 0 ? 'text-red-400' : '') + '">' + nf(y[k]) + '</td>').join('') + '</tr>'; });
    h += '</tbody></table></div><p class="text-[10px] text-slate-500 mt-1">MRU — ' + esc(lang() === 'ar' ? 'جميع الأرقام ناتجة عن الفرضيات أعلاه.' : 'tous ces chiffres découlent des hypothèses ci-dessus (aucune n’est une donnée d’enquête, sauf mention contraire).') + '</p>'+ '<p class="text-[10px] text-slate-500">' + esc(lang() === 'ar' ? 'الضريبة على الأرباح = معدل الضريبة × الربح الخاضع للضريبة بعد خصم الخسائر المرحّلة من السنوات السابقة (لا ضريبة عند الخسارة). لذلك قد تكون النتيجة قبل الضريبة موجبة والضريبة صفرًا: تُخصم أولًا خسائر السنوات السابقة (مثل السنة الأولى)، ولا تبدأ الضريبة إلا بعد استنفادها (انظر الأسطر «الخسائر المرحّلة المخصومة» و«الربح الخاضع للضريبة» و«الخسارة المتبقية للترحيل»). تُحتسب على النتيجة قبل الضريبة؛ مؤشرات VAN وTRI والتدفق النقدي تبقى قبل الضريبة.' : 'Impôt sur le bénéfice = taux × résultat imposable, après imputation des déficits des années précédentes (aucun impôt en cas de perte). Un résultat avant impôt positif peut donc donner un impôt de 0 : le déficit des années précédentes (ex. année 1) est d’abord déduit, et l’impôt ne commence que lorsque ce déficit est épuisé (lignes « Déficits imputés », « Résultat imposable » et « Déficit restant »). Les indicateurs VAN, TRI et cash-flow restent avant impôt.') + '</p>';
    $('finYearTable').innerHTML = h;

    const names = ['prudent', 'central', 'dynamique'];
    let c = '<h5 class="text-xs font-bold text-slate-300 mb-2">' + esc(L.compT) + '</h5><div class="overflow-x-auto"><table class="w-full text-[11px] text-slate-300"><thead><tr class="text-slate-500"><th></th>' + names.map((k) => '<th class="text-end py-1 px-2">' + esc(E.SCENARIO_NAMES[k][lang()]) + '</th>').join('') + '</tr></thead><tbody>';
    const comp = [(x) => nf(x.totals.revenue), (x) => nf(x.totals.costs), (x) => nf(x.totals.grossMargin), (x) => nf(x.totals.result), (x) => nf(x.totals.tax), (x) => nf(x.totals.netResult), (x) => nf(x.totals.cash), (x) => nf(x.npv), (x) => (x.irr == null ? '—' : nf(x.irr * 100, 1) + ' %'), (x) => (x.paybackMonths == null ? L.over60 : x.paybackMonths + ' ' + L.months), (x) => nf(x.fundingNeed), (x) => (x.breakEvenClients == null ? '—' : nf(x.breakEvenClients)), (x) => nf(x.priceInsured.total), (x) => nf(x.priceInsured.monthlyEquivalent)];
    L.rowsComp.forEach((lbl, i) => { c += '<tr class="border-t border-slate-800"><td class="py-1">' + esc(lbl) + '</td>' + names.map((k) => '<td class="text-end px-2 font-mono">' + comp[i](results[k]) + '</td>').join('') + '</tr>'; });
    c += '</tbody></table></div>';
    $('finCompTable').innerHTML = c;

    // Demande & lecture
    const dem = E.demandHypothesis(indicators, state.g);
    let d = '<h5 class="text-xs font-bold text-cyan-300 mb-1">' + esc(L.demandT) + '</h5>';
    if (dem) { const need = r.totals.clients; d += '<p class="text-[11px] text-slate-300">' + esc(L.demandTxt.replace('{a}', nf(state.g.addressable)).replace('{r}', pc(dem.rate, 1)).replace('{m}', state.g.maybe_conv).replace('{n}', nf(dem.customers)).replace('{s}', nf(need)).replace('{p}', pc(need / Math.max(1, dem.customers), 0))) + '</p>'; }
    else d += '<p class="text-[11px] text-slate-500">' + esc(L.noDemand) + '</p>';
    $('finDemand').innerHTML = d;

    const pos = names.filter((k) => results[k].npv > 0).length, aff = indicators ? E.affordability(indicators, P) : null;
    let v = '<p class="text-xs text-slate-300">' + esc(r.npv >= 0 ? L.vPos2 : L.vNeg) + ' ' + esc(L.vPos.replace('{k}', pos)) + '</p>';
    if (aff && aff.share < 0.5) v += '<p class="text-xs text-red-300 mt-1">' + esc(L.vAfford.replace('{m}', mru(aff.monthly)).replace('{p}', pc(aff.share, 0))) + '</p>';
    v += '<p class="text-[11px] text-slate-500 mt-1">' + esc(L.vCaveat) + '</p>';
    $('finVerdict').innerHTML = v;

    // Graphique VAN des trois scénarios (valeurs calculées)
    if (typeof vanChartInstance !== 'undefined' && vanChartInstance) {
      vanChartInstance.data.labels = names.map((k) => E.SCENARIO_NAMES[k][lang()]);
      const ds = vanChartInstance.data.datasets[0];
      ds.data = names.map((k) => +(results[k].npv / 1e6).toFixed(2));
      ds.backgroundColor = names.map((k) => (results[k].npv >= 0 ? 'rgba(16,185,129,.7)' : 'rgba(239,68,68,.6)'));
      ds.borderColor = names.map((k) => (results[k].npv >= 0 ? '#10b981' : '#ef4444'));
      vanChartInstance.update();
    }
    renderPricing(); renderAssumptions(); renderMarketDemandOnly(); if (window.Extras) window.Extras.render();
  }
  function renderMarketDemandOnly() { /* hook réservé */ }

  /* ---------- Hypothèses & export ---------- */
  let asmFilter = 'all';
  function renderAssumptions() {
    const root = $('assumptionsRoot'); if (!root) return;
    const L = t(), reg = E.assumptionRegister(state, indicators, surveyDate());
    const rows = reg.filter((r) => asmFilter === 'all' || r.type === asmFilter);
    let h = '<div class="flex flex-wrap gap-2 mb-3 text-[11px]"><button data-filter="all" class="px-2.5 py-1 rounded border ' + (asmFilter === 'all' ? 'border-amber-500 text-amber-300' : 'border-slate-700 text-slate-400') + '">' + esc(L.filterAll) + '</button>';
    Object.keys(E.TYPE_LABELS).forEach((k) => { h += '<button data-filter="' + k + '" class="px-2.5 py-1 rounded border ' + (asmFilter === k ? 'border-amber-500 text-amber-300' : 'border-slate-700 text-slate-400') + '">' + esc(E.TYPE_LABELS[k][lang()].split(' (')[0]) + '</button>'; });
    h += '</div><div class="overflow-x-auto"><table class="w-full text-[11px] text-slate-300"><thead><tr class="text-slate-500">' + L.asmCols.map((c) => '<th class="py-1 px-2 text-start">' + esc(c) + '</th>').join('') + '</tr></thead><tbody>';
    rows.forEach((r) => { h += '<tr class="border-t border-slate-800"><td class="py-1.5 px-2">' + esc(lang() === 'ar' ? r.ar : r.fr) + '</td><td class="py-1.5 px-2 font-mono text-white">' + esc(typeof r.value === 'number' ? nf(r.value, r.value % 1 ? 1 : 0) : r.value) + '</td><td class="py-1.5 px-2 text-slate-400">' + esc(r.unit) + '</td><td class="py-1.5 px-2 text-slate-400">' + esc(r.source) + '</td><td class="py-1.5 px-2 font-mono text-slate-500">' + esc(r.date) + '</td><td class="py-1.5 px-2">' + badge(r.type) + '</td></tr>'; });
    h += '</tbody></table></div>';
    root.innerHTML = h;
    const pj = $('paramsJson'); if (pj) pj.textContent = JSON.stringify(paramsObject(), null, 2);
  }
  function paramsObject() {
    const I = indicators || {};
    const o = { generated_on: E.MODEL_DATE, source: 'Supabase – public_survey_results (agrégats anonymes)', data_type: 'Donnée réelle de l’enquête / estimation sur tranches',
      market_sample_size: I.market_sample_size == null ? null : I.market_sample_size, payg_interest_rate: I.payg_interest_rate == null ? null : +I.payg_interest_rate.toFixed(4), purchase_intention_rate: I.purchase_intention_rate == null ? null : +I.purchase_intention_rate.toFixed(4),
      median_monthly_payment: I.median_monthly_payment == null ? null : I.median_monthly_payment, average_monthly_payment: I.average_monthly_payment == null ? null : I.average_monthly_payment, reference_monthly_price: I.reference_monthly_price == null ? null : I.reference_monthly_price,
      preferred_financing_duration: I.preferred_financing_duration || null, preferred_payment_frequency: I.preferred_payment_frequency || null, insurance_interest_rate: I.insurance_interest_rate == null ? null : +I.insurance_interest_rate.toFixed(4), target_customer_segment: I.target_customer_segment || null };
    return o;
  }
  function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  const stamp = () => new Date().toISOString().slice(0, 10);
  /* Rapport Word (plan du rapport de fin d'études) et PowerPoint (soutenance) : construits par report.js / pptx.js
     à partir des mêmes données que les autres exports (enquête + moteur financier). */
  function docContext() {
    let team = [], sup = '';
    try { if (typeof dbState !== 'undefined' && dbState.team && dbState.team.data) team = dbState.team.data.filter((m) => m.active !== false).map((m) => m.name_fr || m.name_ar).filter(Boolean); } catch (e) { /* ignore */ }
    try { const u = window.PaygAuth && window.PaygAuth.user(); if (u) sup = u.name; } catch (e) { /* ignore */ }
    return { E, state, results, ind: indicators, survey: surveyMeta && surveyMeta.status === 'ok' ? surveyMeta : null, date: surveyDate(), supervisor: sup, team };
  }
  let docBusy = false;
  // assets.js (logo + captures du prototype, ~1 Mo) n'est chargé qu'au moment d'un export Word / PowerPoint
  function ensureAssets() {
    if (window.PAYG_ASSETS) return Promise.resolve();
    return new Promise((resolve) => { const s = document.createElement('script'); s.src = 'assets.js'; s.onload = () => resolve(); s.onerror = () => resolve(); document.head.appendChild(s); });
  }
  async function exportDoc(kind, sheets) {
    if (docBusy) return; docBusy = true;
    const btn = document.querySelector('[data-export="' + kind + '"]'), lbl = btn ? btn.querySelector('span') : null, old = lbl ? lbl.textContent : '';
    if (lbl) lbl.textContent = lang() === 'ar' ? 'جارٍ الإنشاء…' : 'Génération…';
    try {
      await ensureAssets();
      if (kind === 'docx') {
        if (!window.PaygReport || !window.PaygDocs) throw new Error('report');
        const parts = await window.PaygReport.build(docContext());
        download('rapport_etude_faisabilite_payg_' + stamp() + '.docx', new Blob(parts, { type: window.PaygReport.MIME }));
      } else {
        if (!window.PaygPptx) throw new Error('pptx');
        await window.PaygPptx.write(docContext(), 'soutenance_etude_faisabilite_payg_' + stamp() + '.pptx');
      }
    } catch (err) {
      console.error('[export-' + kind + ']', err);
      if (kind === 'docx' && window.PaygWord) { // secours : version simple (tableaux uniquement)
        download('rapport_etude_faisabilite_payg_' + stamp() + '.docx', new Blob(window.PaygWord.build(sheets, { lang: lang(), title: t().printTitle, modelDate: E.MODEL_DATE }), { type: window.PaygWord.MIME }));
        alert(lang() === 'ar' ? 'تعذر إنشاء التقرير الكامل؛ تم تصدير نسخة مبسطة (جداول فقط).' : 'Le rapport complet n’a pas pu être généré ; une version simplifiée (tableaux) a été exportée.');
      } else alert(kind === 'pptx' && /load|network|pptx/i.test(String(err && err.message)) ? (lang() === 'ar' ? 'PowerPoint غير متاح بدون اتصال بالإنترنت.' : 'PowerPoint indisponible hors connexion.') : (lang() === 'ar' ? 'تعذر إنشاء الملف.' : 'Impossible de générer le fichier.'));
    } finally { if (lbl) lbl.textContent = old; docBusy = false; }
  }

  function doExport(kind) {
    recomputeAll();
    const sheets = E.buildExport(state, indicators, results, surveyDate());
    if (kind === 'csv') download('etude_faisabilite_payg_' + stamp() + '.csv', new Blob([E.toCSV(sheets)], { type: 'text/csv;charset=utf-8' }));
    else if (kind === 'json') download('parametres_enquete_prototype_' + stamp() + '.json', new Blob([JSON.stringify(paramsObject(), null, 2)], { type: 'application/json' }));
    else if (kind === 'xlsx') {
      const run = () => { const wb = XLSX.utils.book_new(); Object.keys(sheets).forEach((n) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets[n]), n.slice(0, 31))); XLSX.writeFile(wb, 'etude_faisabilite_payg_' + stamp() + '.xlsx'); };
      if (window.XLSX) run(); else { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = run; s.onerror = () => alert('Excel indisponible hors connexion : utilisez le CSV.'); document.head.appendChild(s); }
    } else if (kind === 'docx') {
      exportDoc('docx', sheets);
    } else if (kind === 'pptx') {
      exportDoc('pptx', sheets);
    } else if (kind === 'pdf') {
      let h = '<h1 style="font-size:18px;margin:0 0 4px">' + esc(t().printTitle) + '</h1><p style="font-size:11px;margin:0 0 12px">' + esc(E.MODEL_DATE) + ' — ' + esc(lang() === 'ar' ? 'جميع البيانات مصنفة: فعلية / تقدير / فرضية / محاكاة.' : 'chaque donnée est classée : enquête / estimation / hypothèse / simulation.') + '</p>';
      Object.keys(sheets).forEach((n) => { h += '<h2 style="font-size:13px;margin:14px 0 4px">' + esc(n.replace(/_/g, ' ')) + '</h2><table style="border-collapse:collapse;width:100%;font-size:9px">' + sheets[n].map((row, i) => '<tr>' + row.map((c) => '<' + (i ? 'td' : 'th') + ' style="border:1px solid #999;padding:2px 4px;text-align:left">' + esc(c) + '</' + (i ? 'td' : 'th') + '>').join('') + '</tr>').join('') + '</table>'; });
      const pa = $('printArea'); pa.innerHTML = h; window.print();
    }
  }

  /* ---------- Cycle de vie ---------- */
  function renderStatic() {
    const L = t();
    document.querySelectorAll('[data-k2]').forEach((el) => { const k = el.getAttribute('data-k2'); if (L[k] != null && typeof L[k] === 'string') el.textContent = L[k]; });
    const sv = $('scoreVarsBody'); if (sv) sv.innerHTML = L.sv.map((r) => '<tr class="border-t border-slate-800"><td class="py-1.5 px-2 text-slate-200">' + esc(r[0]) + '</td><td class="py-1.5 px-2 text-slate-400">' + esc(r[1]) + '</td></tr>').join('');
  }
  function renderAll() { recomputeAll(); renderStatic(); renderMarket(); renderFinInputs(); renderFinOutputs(); }

  function onSurvey(s) {
    surveyStatus = s.status; surveyMeta = s;
    if (s.status === 'ok' && s.questions.length) {
      indicators = E.computeMarketIndicators(s.questions, s.rows, s.participants, { coverageTarget: state.g.coverage / 100 });
    } else indicators = null;
    renderMarket(); renderFinOutputs();
  }

  function bind() {
    const fin = $('finInputsRoot');
    if (fin) {
      fin.addEventListener('input', (e) => {
        const el = e.target, v = parseFloat(el.value); if (!isFinite(v)) return;
        if (el.dataset.g) { state.g[el.dataset.g] = v; if (el.dataset.g === 'coverage' && indicators) onSurvey(surveyMeta); }
        else if (el.dataset.sc) state.sc[activeScenario][el.dataset.sc] = v;
        save(); renderFinOutputs(); if (indicators) renderMarket();
      });
      fin.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.tab) { activeScenario = b.dataset.tab; renderFinInputs(); renderFinOutputs(); }
        if (b.id === 'btnResetState') { state = E.defaultState(); save(); if (surveyMeta) onSurvey(surveyMeta); renderAll(); }
      });
    }
    const asm = $('assumptionsRoot'); if (asm) asm.addEventListener('click', (e) => { const b = e.target.closest('[data-filter]'); if (b) { asmFilter = b.dataset.filter; renderAssumptions(); } });
    document.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export)));
  }

  window.StudyUI = {
    init() { bind(); renderAll(); },
    onLanguage() { renderAll(); },
    onSurvey, renderPricing, renderFinOutputs,
    setState(ns) { state = ns; save(); if (surveyMeta) onSurvey(surveyMeta); renderAll(); },
    // Hypothèses reçues de la base de données : appliquées sans les renvoyer à la base (évite toute boucle d'écriture)
    applyRemote(remote) {
      const ns = E.defaultState();
      if (remote && remote.g && remote.sc) { Object.assign(ns.g, remote.g); Object.keys(ns.sc).forEach((k) => Object.assign(ns.sc[k], remote.sc[k] || {})); }
      E.migrateLegacy(ns.g, ns.sc); state = ns;
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
      const te = $('tenureInput'), fe = $('freqInput');
      if (te && [...te.options].some((o) => o.value === String(ns.sc.central.tenure))) te.value = String(ns.sc.central.tenure);
      if (fe && [...fe.options].some((o) => o.value === ns.g.freq)) fe.value = ns.g.freq;
      if (surveyMeta) onSurvey(surveyMeta); renderAll();
    },
    getActive: () => activeScenario, priceInputs: currentPriceInputs,
    getState: () => state, getIndicators: () => indicators, getResults: () => results
  };
})();
