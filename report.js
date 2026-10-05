/* report.js — Rapport Word (.docx) de l'étude de faisabilité, structuré selon le plan du rapport de fin d'études :
 *   Page de garde · Résumé exécutif · Introduction générale · Chapitres 1 à 6 · Conclusion générale · Bibliographie · Annexes.
 *  - Les chiffres proviennent de la plateforme Les Enquêtes (indicateurs de marché) et du moteur financier (engine.js) :
 *    aucune valeur n'est recopiée à la main, le rapport suit donc les hypothèses et les réponses du moment.
 *  - Autonome (aucune bibliothèque externe, aucun accès réseau) ; ne modifie aucune formule du site.
 *  - Expose aussi PaygReport.analyze(), réutilisée par l'export PowerPoint (pptx.js) : les deux documents racontent la même histoire. */
(function (root) {
  'use strict';
  const D = root.PaygDocs;
  const { num, mru, pct, pctRaw, esc, NB } = D;

  const DEPT = 'Département Management, Economie et Droit';
  const SC = [
    { k: 'prudent', fr: 'Pessimiste (Prudent)', short: 'Pessimiste', color: '#F59E0B' },
    { k: 'central', fr: 'Réaliste (Central)', short: 'Réaliste', color: '#1D6FE0' },
    { k: 'dynamique', fr: 'Optimiste (Dynamique)', short: 'Optimiste', color: '#16803A' }
  ];
  const noEmoji = (s) => String(s == null ? '' : s).replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
  const dash = (v) => (v == null || v === '' ? '—' : v);

  /* =====================================================================
   *  ANALYSE (partagée Word / PowerPoint)
   * ===================================================================== */
  function analyze(ctx) {
    const E = ctx.E, g = ctx.state.g, sc = ctx.state.sc, res = ctx.results, ind = ctx.ind || null;
    const n = ind ? ind.market_sample_size || 0 : 0;
    const has = !!(ind && n > 0);
    const dist = (k) => (ind && ind.distributions && ind.distributions[k] && ind.distributions[k].total ? ind.distributions[k] : null);
    const a = { E, g, sc, res, ind, n, has, dist, survey: ctx.survey || null, date: ctx.date, supervisor: ctx.supervisor || '', team: ctx.team || [] };
    a.quality = ind ? ind.sample_quality : null;
    a.demand = has ? E.demandHypothesis(ind, g) : null;
    a.aff = has ? E.affordability(ind, res.central.priceInsured) : null;

    // Sensibilités du scénario réaliste (central) : une variable à la fois
    const base = res.central;
    const run = (mutG, mutS) => { const g2 = Object.assign({}, g); const s2 = Object.assign({}, sc.central); if (mutG) mutG(g2); if (mutS) mutS(s2); return E.runScenario(g2, s2); };
    const variants = [
      ['Situation de référence (Réaliste)', null, null],
      ['Nouveaux clients −30 %', null, (s) => { s.clients1 = s.clients1 * 0.7; }],
      ['Taux d’impayés +5 points', null, (s) => { s.defaultRate = s.defaultRate + 5; }],
      ['Coût de financement +4 points', (x) => { x.funding_rate = x.funding_rate + 4; }, null],
      ['Prix comptant moyen −10 %', null, (s) => { s.cashPrice = s.cashPrice * 0.9; }],
      ['Coûts opérationnels +20 %', null, (s) => { s.opexMult = s.opexMult * 1.2; }]
    ];
    a.sens = variants.map((v) => { const r = run(v[1], v[2]); return { label: v[0], npv: r.npv, irr: r.irr, payback: r.paybackMonths, be: r.breakEvenClients, fund: r.fundingNeed, net5: r.totals.netResult }; });

    // Verdict de faisabilité (règle simple, transparente)
    const c = base, okNpv = c.npv > 0, okPay = c.paybackMonths != null;
    a.verdict = { npvPositive: okNpv, payback: okPay, level: okNpv && okPay ? 'favorable' : (okNpv || okPay ? 'conditionnelle' : 'défavorable') };
    a.byScenario = SC.map((s) => Object.assign({ meta: s }, res[s.k]));
    return a;
  }

  /* Spécifications des graphiques (SVG) — construites à partir de l'analyse */
  function chartSpecs(a) {
    const out = {}; const E = a.E;
    const pc = (v, t) => num(v, 0) + ' (' + num(t > 0 ? (v / t) * 100 : 0, 1) + ' %)';
    const SURVEY_TITLES = {
      interest: 'Intérêt pour l’acquisition d’un kit solaire en PAYG', monthlyPrice: 'Montant mensuel maximum acceptable', totalPrice: 'Prix total acceptable du kit',
      income: 'Tranche de revenu mensuel du foyer', duration: 'Durée de financement souhaitée', frequency: 'Fréquence de paiement souhaitée', insurance: 'Intérêt pour la micro-assurance intégrée',
      activity: 'Activité principale des répondants', profile: 'Profil principal des répondants', wilaya: 'Wilaya de résidence', energySpend: 'Dépense mensuelle actuelle en énergie',
      kit: 'Kit solaire souhaité', wallets: 'Portefeuilles mobiles utilisés', lock: 'Acceptation du verrouillage automatique', household: 'Taille du foyer', existingSolar: 'Utilisation actuelle d’une énergie solaire'
    };
    out.surveyKeys = [];
    Object.keys(SURVEY_TITLES).forEach((k) => {
      const d = a.dist(k); if (!d) return;
      const items = d.items.filter((i) => i.label_fr);
      out['s_' + k] = D.hbar({ title: SURVEY_TITLES[k] + ' (n = ' + d.total + ')', labels: items.map((i) => noEmoji(i.label_fr)), values: items.map((i) => i.pct), max: 100, valueLabels: items.map((i) => pc(i.count, d.total)), color: '#1D6FE0' });
      out.surveyKeys.push(k);
    });
    out.titles = SURVEY_TITLES;

    const cen = a.res.central;
    const pl = cen.priceInsured.lines.filter((l) => l.value > 0), tot = cen.priceInsured.total;
    out.price = D.hbar({ title: 'Composition du prix PAYG – scénario Réaliste (client assuré)', labels: pl.map((l) => l.fr), values: pl.map((l) => l.value), valueLabels: pl.map((l) => mru(l.value, 0) + ' · ' + num((l.value / tot) * 100, 1) + ' %'), color: '#16803A', labelChars: 40, width: 1000 });
    const yrs = ['Année 1', 'Année 2', 'Année 3', 'Année 4', 'Année 5'];
    out.clients = D.gbars({ title: 'Nouveaux clients par année et par scénario', categories: yrs, series: SC.map((s) => ({ name: s.short, color: s.color, values: a.res[s.k].years.map((y) => y.clients) })), yTitle: 'clients' });
    out.revcost = D.gbars({ title: 'Encaissements, coûts et résultat net – scénario Réaliste (MRU)', categories: yrs, series: [
      { name: 'Encaissements (CA)', color: '#1D6FE0', values: cen.years.map((y) => y.revenue) },
      { name: 'Coûts totaux', color: '#F59E0B', values: cen.years.map((y) => y.totalCosts) },
      { name: 'Résultat net', color: '#16803A', values: cen.years.map((y) => y.netResult) }] });
    out.net = D.gbars({ title: 'Résultat net par année et par scénario (MRU)', categories: yrs, series: SC.map((s) => ({ name: s.short, color: s.color, values: a.res[s.k].years.map((y) => y.netResult) })) });
    out.revenue = D.gbars({ title: 'Chiffre d’affaires (encaissements) par année et par scénario (MRU)', categories: yrs, series: SC.map((s) => ({ name: s.short, color: s.color, values: a.res[s.k].years.map((y) => y.revenue) })) });
    const cum = (flows) => { let c = 0; return flows.map((f) => (c += f)); };
    out.cash = D.lines({ title: 'Trésorerie cumulée sur 60 mois (MRU)', series: SC.map((s) => ({ name: s.short, color: s.color, values: cum(a.res[s.k].flows) })), xTitle: 'mois', xPrefix: '' });
    out.sens = D.hbar({ title: 'Sensibilité de la VAN – scénario Réaliste (MRU)', labels: a.sens.map((s) => s.label), values: a.sens.map((s) => Math.max(0, s.npv)), valueLabels: a.sens.map((s) => mru(s.npv, 0)), colors: a.sens.map((s) => (s.npv >= 0 ? '#16803A' : '#DC2626')), width: 1000, labelChars: 36 });
    // Si toutes les VAN sont négatives la barre serait vide : on affiche alors la valeur absolue (couleur rouge)
    if (a.sens.every((s) => s.npv < 0)) out.sens = D.hbar({ title: 'Sensibilité de la VAN – scénario Réaliste (VAN négative, valeur absolue, MRU)', labels: a.sens.map((s) => s.label), values: a.sens.map((s) => Math.abs(s.npv)), valueLabels: a.sens.map((s) => mru(s.npv, 0)), color: '#DC2626', width: 1000, labelChars: 36 });
    out.story = D.story(-1);
    return out;
  }

  /* =====================================================================
   *  PRIMITIVES WORDPROCESSINGML
   * ===================================================================== */
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const XML = D.XML;
  const FONT = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/>';

  function run(text, o) {
    o = o || {};
    let pr = FONT;
    if (o.bold) pr += '<w:b/><w:bCs/>';
    if (o.italic) pr += '<w:i/><w:iCs/>';
    if (o.caps) pr += '<w:caps/>';
    if (o.color) pr += '<w:color w:val="' + o.color + '"/>';
    if (o.size) pr += '<w:sz w:val="' + o.size + '"/><w:szCs w:val="' + o.size + '"/>';
    const parts = String(text == null ? '' : text).split('\n');
    return '<w:r><w:rPr>' + pr + '</w:rPr>' + parts.map((t, i) => (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + esc(t) + '</w:t>').join('') + '</w:r>';
  }
  // **gras** dans le texte
  function runs(text, o) {
    return String(text == null ? '' : text).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((seg) => (seg.indexOf('**') === 0 ? run(seg.slice(2, -2), Object.assign({}, o, { bold: true })) : run(seg, o))).join('');
  }
  function para(inner, o) {
    o = o || {};
    let pr = '';
    if (o.style) pr += '<w:pStyle w:val="' + o.style + '"/>';
    if (o.keepNext) pr += '<w:keepNext/>';
    if (o.keepLines) pr += '<w:keepLines/>';
    if (o.pageBreakBefore) pr += '<w:pageBreakBefore/>';
    if (o.num) pr += '<w:numPr><w:ilvl w:val="' + (o.lvl || 0) + '"/><w:numId w:val="' + o.num + '"/></w:numPr>';
    if (o.border) pr += '<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="' + o.border + '"/></w:pBdr>';
    if (o.shade) pr += '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade + '"/>';
    if (o.spacing) pr += '<w:spacing w:before="' + (o.spacing[0] || 0) + '" w:after="' + (o.spacing[1] || 0) + '"' + (o.line ? ' w:line="' + o.line + '" w:lineRule="auto"' : '') + '/>';
    if (o.ind) pr += '<w:ind w:left="' + (o.ind[0] || 0) + '" w:right="' + (o.ind[1] || 0) + '"' + (o.ind[2] ? ' w:hanging="' + o.ind[2] + '"' : '') + '/>';
    if (o.align) pr += '<w:jc w:val="' + o.align + '"/>';
    if (o.sect) pr += o.sect;
    return '<w:p>' + (pr ? '<w:pPr>' + pr + '</w:pPr>' : '') + inner + '</w:p>';
  }
  const isNum = (s) => /^-?[\d\u00A0\s.,]+(\u00A0?(%|MRU))?$/.test(String(s).trim()) && /\d/.test(String(s));

  /* =====================================================================
   *  CONSTRUCTION DU DOCUMENT
   * ===================================================================== */
  async function build(ctx) {
    const a = analyze(ctx), E = a.E, g = a.g, sc = a.sc, res = a.res, ind = a.ind, has = a.has;
    const specs = chartSpecs(a);
    const assets = root.PAYG_ASSETS || {};
    const body = [], toc = [], media = [];
    const W_PORTRAIT = 9638, W_LAND = 14570; // largeur utile (twips) A4 portrait / paysage, marges 2 cm
    let curW = W_PORTRAIT, figN = 0, tabN = 0, bm = 0, imgSeq = 0;

    /* --- images --- */
    function addMedia(m, name) { // m : {bytes,w,h,ext}
      imgSeq++; const rid = 'rIdImg' + imgSeq; media.push({ rid, name: 'image' + imgSeq + '.' + m.ext, bytes: m.bytes, mime: m.mime }); return { rid, id: imgSeq, w: m.w, h: m.h, name: name || ('Image ' + imgSeq) };
    }
    function drawing(im, cm, alt) {
      const cx = Math.round(cm * 360000), cy = Math.round(cx * im.h / im.w);
      return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + im.id + '" name="' + esc(im.name) + '" descr="' + esc(alt || im.name) + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + im.id + '" name="' + esc(im.name) + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + im.rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }

    /* --- blocs --- */
    const P = (t, o) => body.push(para(runs(t, Object.assign({ size: 21 }, (o && o.run) || {})), Object.assign({ align: 'both', spacing: [0, 120], line: 276 }, o || {})));
    const bullets = (arr) => arr.forEach((t) => body.push(para(runs(t, { size: 21 }), { num: 1, align: 'left', spacing: [0, 60], line: 264 })));
    const numbered = (arr) => arr.forEach((t, i) => body.push(para(runs((i + 1) + '.  ' + t, { size: 21 }), { align: 'left', ind: [454, 0, 340], spacing: [0, 60], line: 264 })));
    const note = (t, color) => body.push(para(runs(t, { size: 19, color: '334155' }), { shade: color || 'F1F5F9', border: '16803A', ind: [140, 120], spacing: [60, 160], line: 264, align: 'both', keepLines: true }));
    const warn = (t) => note('**À noter.** ' + t, 'FEF3C7');
    const fil = (i, t) => body.push(para(run('Fil conducteur — étape' + (/\D/.test(String(i)) ? 's ' : ' ') + i + '/7 : ', { size: 18, bold: true, color: '16803A' }) + run(t, { size: 18, italic: true, color: '475569' }), { spacing: [0, 160], border: 'F59E0B', ind: [140, 0], align: 'left' }));
    const pageBreak = () => body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    function heading(level, text, opts) {
      const id = 'Toc' + (++bm); toc.push({ level, text, id });
      const inner = '<w:bookmarkStart w:id="' + bm + '" w:name="_' + id + '"/>' + run(text, { bold: true }) + '<w:bookmarkEnd w:id="' + bm + '"/>';
      body.push(para(inner, Object.assign({ style: 'Heading' + level }, opts || {})));
    }
    const H1 = (t, o) => heading(1, t, Object.assign({ pageBreakBefore: true }, o || {}));
    const H2 = (t) => heading(2, t);
    const H3 = (t) => heading(3, t);
    function caption(kind, text) { const n = kind === 'Figure' ? ++figN : ++tabN; body.push(para(run(kind + ' ' + n + ' — ' + text, { size: 18, italic: true, color: '64748B' }), { style: 'Caption', align: kind === 'Figure' ? 'center' : 'left', keepNext: kind === 'Tableau', spacing: [kind === 'Figure' ? 40 : 120, kind === 'Figure' ? 200 : 60] })); }
    function table(rows, o) {
      o = o || {}; if (!rows || !rows.length) return;
      const fs = o.fs || 18, cols = Math.max.apply(null, rows.map((r) => r.length)), totalW = o.width || curW;
      let wts = o.widths;
      if (!wts) { wts = []; for (let c = 0; c < cols; c++) { let m = 0; rows.forEach((r, i) => { const len = D.clean(r[c]).length; const eff = i === 0 ? Math.min(len, 20) * 0.8 : Math.min(len, 60); if (eff > m) m = eff; }); wts.push(Math.max(7, m)); } }
      const sum = wts.reduce((x, y) => x + y, 0); let w = wts.map((x) => Math.max(650, Math.floor((x / sum) * totalW))); w[w.length - 1] += totalW - w.reduce((x, y) => x + y, 0);
      let x = '<w:tbl><w:tblPr><w:tblW w:w="' + totalW + '" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/><w:left w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/><w:right w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="45" w:type="dxa"/><w:left w:w="85" w:type="dxa"/><w:bottom w:w="45" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + w.map((n) => '<w:gridCol w:w="' + n + '"/>').join('') + '</w:tblGrid>';
      const boldRows = o.boldRows || [];
      // colonne « numérique » : toutes les cellules (hors en-tête) commencent par un chiffre, un signe ou un tiret
      const numCol = []; for (let c = 1; c < cols; c++) numCol[c] = rows.length > 1 && rows.slice(1).every((r) => /^\s*(?:[-−>]?\s*\d|—|n\/d|impossible)/.test(String(r[c] == null ? '' : r[c])));
      rows.forEach((r, i) => {
        const head = i === 0, bold = head || boldRows.indexOf(i) >= 0 || (o.boldLast && i === rows.length - 1);
        x += '<w:tr><w:trPr><w:cantSplit/>' + (head ? '<w:tblHeader/>' : '') + '</w:trPr>';
        for (let c = 0; c < cols; c++) {
          const val = r[c] == null ? '' : String(r[c]); const fill = head ? '14532D' : (bold ? 'DCFCE7' : (i % 2 === 0 ? 'F1F5F9' : 'FFFFFF'));
          const al = (o.align && o.align[c]) || (!head && c > 0 && numCol[c] ? 'right' : 'left');
          x += '<w:tc><w:tcPr><w:tcW w:w="' + w[c] + '" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>' + (head ? '<w:vAlign w:val="center"/>' : '') + '</w:tcPr>' + para(runs(val, { size: head ? fs - 1 : fs, bold: bold, color: head ? 'FFFFFF' : '0F172A' }), { align: head ? 'center' : al, line: 252 }) + '</w:tc>';
        }
        x += '</w:tr>';
      });
      body.push(x + '</w:tbl>'); body.push(para('', { spacing: [0, 100] }));
    }
    // Figure à partir d'une spécification SVG
    async function figure(spec, cap, cm) {
      try { const png = await D.render(spec); const im = addMedia(png, cap); body.push(para(drawing(im, cm || Math.min(16.4, curW / 567), cap), { align: 'center', keepNext: true, spacing: [100, 0] })); caption('Figure', cap); }
      catch (e) { console.warn('[report] figure ignorée :', cap, e); }
    }
    async function shot(key, cap, cm) {
      const uri = (assets.shot ? assets.shot(key) : (assets.shots && assets.shots[key])); if (!uri) return; // capture selon le thème actif (sombre / clair) au moment de l'export
      const bytes = D.dataUriToBytes(uri), sz = D.imageSize(bytes), im = addMedia(Object.assign({ bytes }, sz), cap);
      body.push(para(drawing(im, cm || 15.5, cap), { align: 'center', keepNext: true, spacing: [100, 0] })); caption('Figure', cap);
    }
    const sectBreak = (landscape, restart) => {
      const sz = landscape ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
      body.push(para('', { sect: '<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:type w:val="nextPage"/>' + sz + '<w:pgMar w:top="1300" w:right="1134" w:bottom="1134" w:left="1134" w:header="560" w:footer="480" w:gutter="0"/>' + (restart ? '<w:pgNumType w:start="1"/>' : '') + '</w:sectPr>' }));
    };
    const L = (v) => noEmoji(v);

    /* ---------- chiffres de référence ---------- */
    const cen = res.central, pru = res.prudent, dyn = res.dynamique;
    const nTxt = has ? num(a.n) + ' répondant' + (a.n > 1 ? 's' : '') : null;
    const modeLbl = (d) => { if (!d) return null; const m = d.items.reduce((b, i) => (i.count > (b ? b.count : -1) ? i : b), null); return m && m.count ? L(m.label_fr) + ' (' + num(m.pct, 1) + ' %)' : null; };
    const noSurvey = 'Aucune réponse n’est encore enregistrée sur la plateforme Les Enquêtes à la date de génération de ce rapport. Les tableaux et graphiques de cette section se compléteront automatiquement dès que des réponses seront disponibles (il suffit de régénérer le rapport).';
    const scName = (s) => s.fr;
    const capexTotal = cen.capex;
    const lifeYear = (r, i) => r.years[i];

    /* =================== PAGE DE GARDE =================== */
    let logo = null;
    try { if (assets.logoSvg) { const lp = await D.svgToPngTransparent(assets.logoSvg, 1092, 1092, 0.5); logo = addMedia(lp, 'Logo Solar PAYG Mauritanie'); } } catch (e) { console.warn('[report] logo', e); }
    // Identité de l'institut : logo ISCAE + nom + spécialité (en tête de la page de garde)
    if (assets.instLogo) {
      try { const ub = D.dataUriToBytes(assets.instLogo), us = D.imageSize(ub), il = addMedia(Object.assign({ bytes: ub }, us), 'Logo ISCAE');
        body.push(para(drawing(il, 3.4, 'Logo ISCAE'), { align: 'center', spacing: [0, 60] }));
      } catch (e) { console.warn('[report] logo ISCAE', e); }
    }
    body.push(para(run('ISCAE', { size: 44, bold: true, color: '0F172A' }), { align: 'center', spacing: [0, 20] }));
    body.push(para(run('Spécialité : ', { size: 24, color: '64748B' }) + run('Banque et Assurance', { size: 26, bold: true, color: '16803A' }), { align: 'center', spacing: [0, 160] }));
    if (logo) body.push(para(drawing(logo, 3.6, 'Logo Solar PAYG Mauritanie'), { align: 'center', spacing: [200, 120] }));
    body.push(para(run(DEPT.toUpperCase(), { size: 22, bold: true, color: '16803A' }), { align: 'center', spacing: [logo ? 0 : 600, 120] }));
    body.push(para(run('Rapport de projet — Prototype FinTech & Énergie', { size: 20, color: '64748B' }), { align: 'center', spacing: [0, 700] }));
    body.push('<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="280" w:type="dxa"/><w:left w:w="300" w:type="dxa"/><w:bottom w:w="280" w:type="dxa"/><w:right w:w="300" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="9638"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9638" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="14532D"/></w:tcPr>' +
      para(run('ÉTUDE DE FAISABILITÉ', { size: 24, bold: true, color: 'FBBF24' }), { align: 'center', spacing: [0, 120] }) +
      para(run('d’une entreprise de financement PAYG de l’énergie solaire en Mauritanie', { size: 38, bold: true, color: 'FFFFFF' }), { align: 'center', spacing: [0, 120], line: 300 }) +
      para(run('Scoring de crédit · Micro-assurance · Paiement mobile · Verrouillage à distance (IoT)', { size: 20, color: 'DCFCE7' }), { align: 'center' }) + '</w:tc></w:tr></w:tbl>');
    body.push(para('', { spacing: [500, 0] }));
    body.push(para(run('Solar PAYG Mauritanie 2027', { size: 28, bold: true, color: '0F172A' }), { align: 'center', spacing: [0, 160] }));
    const teamTxt = (a.team && a.team.length ? a.team : []).join('  ·  ');
    if (teamTxt) body.push(para(run('Équipe du projet', { size: 18, color: '64748B', caps: true }), { align: 'center', spacing: [300, 40] }) + '' + para(run(teamTxt, { size: 24, bold: true, color: '0F172A' }), { align: 'center', spacing: [0, 300] }));
    body.push(para(run('Document généré le ' + (a.date || '') + (a.supervisor ? ' par ' + a.supervisor : ''), { size: 18, color: '64748B' }), { align: 'center', spacing: [400, 40] }));
    body.push(para(run('Les chiffres de ce rapport proviennent de la plateforme Les Enquêtes et du modèle financier du prototype.', { size: 17, italic: true, color: '94A3B8' }), { align: 'center' }));
    // fin de section 1 (page de garde, sans en-tête ni pied de page)
    body.push(para('', { sect: '<w:sectPr><w:headerReference w:type="default" r:id="rIdHdrEmpty"/><w:footerReference w:type="default" r:id="rIdFtrEmpty"/><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1134" w:bottom="1000" w:left="1134" w:header="560" w:footer="480" w:gutter="0"/></w:sectPr>' }));

    /* =================== SOMMAIRE (placeholder, rempli à la fin) =================== */
    const tocIndex = body.length; body.push('');

    /* =================== RÉSUMÉ EXÉCUTIF =================== */
    H1('Résumé exécutif');
    P('Ce rapport présente l’étude de faisabilité d’une entreprise de **financement PAYG (Pay-As-You-Go)** de systèmes solaires domestiques et productifs en Mauritanie. Le client verse un acompte puis règle de petites échéances par **portefeuille mobile** (Bankily, Masrivi, Sedad, Click) ; l’équipement est **verrouillé à distance** en cas d’impayé et rétabli dès le paiement. Le risque est évalué par un **score alternatif (Mauri-Score)** et couvert par une **micro-assurance** intégrée.');
    if (has) P('**Le besoin est mesuré.** L’enquête menée sur la plateforme Les Enquêtes compte **' + nTxt + '** (qualité de l’échantillon : ' + a.quality + '). **' + pct(ind.payg_interest_rate, 1) + '** des répondants se disent prêts à acquérir un kit en PAYG (réponses « oui » et « peut-être »), dont **' + pct(ind.purchase_intention_rate, 1) + '** avec une intention ferme' + (ind.median_monthly_payment != null ? ' ; le montant mensuel acceptable médian est de **' + mru(ind.median_monthly_payment) + '**' : '') + '. L’échantillon n’étant pas probabiliste, ces résultats décrivent les répondants et non l’ensemble de la population.');
    else P('**Le besoin sera mesuré par l’enquête.** ' + noSurvey);
    P('**Le modèle financier** (60 mois, base de trésorerie) porte sur un investissement initial de **' + mru(capexTotal) + '**. Dans le scénario Réaliste, le chiffre d’affaires (encaissements) cumulé sur cinq ans atteint **' + mru(cen.totals.revenue) + '**, le résultat net cumulé **' + mru(cen.totals.netResult) + '**, la VAN **' + mru(cen.npv) + '**' + (cen.irr != null ? ' et le TRI **' + pct(cen.irr, 1) + '**' : '') + '. ' + (cen.paybackMonths != null ? 'L’investissement est récupéré en **' + cen.paybackMonths + ' mois**.' : 'L’investissement n’est **pas récupéré dans l’horizon de 60 mois**.') + ' Le seuil de rentabilité est de **' + (cen.breakEvenClients == null ? 'non atteignable' : num(cen.breakEvenClients) + ' clients par an') + '** (coûts fixes annuels) et le besoin de financement maximal de **' + mru(cen.fundingNeed) + '**.');
    caption('Tableau', 'Indicateurs clés des trois scénarios');
    table([['Indicateur', 'Pessimiste', 'Réaliste', 'Optimiste']].concat([
      ['Nouveaux clients, année 1'].concat(SC.map((s) => num(res[s.k].years[0].clients))),
      ['Chiffre d’affaires cumulé sur 5 ans'].concat(SC.map((s) => mru(res[s.k].totals.revenue))),
      ['Résultat net cumulé sur 5 ans'].concat(SC.map((s) => mru(res[s.k].totals.netResult))),
      ['VAN'].concat(SC.map((s) => mru(res[s.k].npv))),
      ['TRI'].concat(SC.map((s) => (res[s.k].irr == null ? 'n/d' : pct(res[s.k].irr, 1)))),
      ['Délai de récupération'].concat(SC.map((s) => (res[s.k].paybackMonths == null ? '> 60 mois' : res[s.k].paybackMonths + ' mois'))),
      ['Seuil de rentabilité (clients/an)'].concat(SC.map((s) => (res[s.k].breakEvenClients == null ? 'impossible' : num(res[s.k].breakEvenClients)))),
      ['Besoin de financement maximal'].concat(SC.map((s) => mru(res[s.k].fundingNeed)))]), { widths: [34, 22, 22, 22] });
    const vtxt = a.verdict.level === 'favorable' ? '**Conclusion : la faisabilité financière est favorable sous les hypothèses retenues** (VAN positive et investissement récupéré dans l’horizon d’étude). Elle reste conditionnée à la validation des hypothèses de prix, de coûts et d’impayés par des devis et par les résultats de l’enquête.'
      : a.verdict.level === 'conditionnelle' ? '**Conclusion : la faisabilité est conditionnelle.** Le scénario Réaliste n’atteint pas simultanément une VAN positive et la récupération de l’investissement dans l’horizon de 60 mois ; les leviers à actionner (prix, coûts, impayés, financement) sont analysés au chapitre 6.'
        : '**Conclusion : sous les hypothèses actuelles, le projet n’est pas rentable dans l’horizon de 60 mois.** Les sensibilités du chapitre 6 identifient les leviers (prix, coûts opérationnels, taux d’impayés, subvention) qui permettraient de rétablir l’équilibre.';
    note(vtxt);

    /* =================== INTRODUCTION GÉNÉRALE =================== */
    H1('Introduction générale');
    H2('Contexte');
    P('L’accès à une énergie fiable et abordable reste un enjeu majeur du développement en Mauritanie. Une part importante des ménages, des commerces et des exploitations situés en zones rurales et périurbaines n’est pas raccordée au réseau électrique, ou subit des coupures fréquentes. Ces foyers recourent à des solutions coûteuses et peu satisfaisantes : lampes à pétrole, bougies, piles jetables, groupes électrogènes thermiques.');
    P('Dans le même temps, la Mauritanie bénéficie d’un **ensoleillement parmi les plus élevés au monde** et d’une **adoption rapide du paiement mobile** (Bankily, Masrivi, Sedad, Click). Ces deux atouts rendent crédible un modèle déjà éprouvé ailleurs en Afrique : le **PAYG solaire**, qui transforme un achat comptant hors de portée en une série de petits paiements adaptés aux revenus irréguliers des clients.');
    H2('Problématique');
    P('Le prix comptant d’un kit solaire (de l’ordre de ' + mru(g.kit1_cash) + ' à ' + mru(g.kit3_cash) + ' selon le kit) dépasse la capacité d’épargne de nombreux ménages, tandis que les banques traditionnelles ne servent pas cette clientèle sans historique de crédit formel. La question centrale de cette étude est donc :');
    note('**Dans quelle mesure une entreprise de financement PAYG de systèmes solaires, appuyée sur le scoring alternatif, la micro-assurance et le paiement mobile, est-elle faisable et rentable en Mauritanie ?**');
    P('Elle se décline en cinq sous-questions :');
    numbered(['Le besoin existe-t-il et les clients potentiels sont-ils intéressés (enquête) ?', 'Quel prix et quel rythme de paiement sont acceptables, et quelle demande peut-on raisonnablement estimer (étude de marché) ?', 'La solution est-elle techniquement et opérationnellement réalisable (prototype) ?', 'Le cadre juridique et institutionnel permet-il de l’exercer ?', 'Le modèle est-il rentable et quels risques menacent sa viabilité (étude financière et de faisabilité) ?']);
    H2('Justification du projet');
    bullets(['**Sociale** : améliorer l’accès à l’éclairage, à la recharge des téléphones, à la télévision, à la réfrigération et à des usages productifs pour des ménages aujourd’hui exclus.', '**Économique** : réduire les dépenses d’énergie des foyers, soutenir les petites activités (commerces, conservation par le froid, artisanat) et créer des emplois locaux (installation, maintenance, recouvrement).', '**Environnementale** : substituer des sources fossiles ou jetables par une énergie renouvelable.', '**Académique et d’innovation** : combiner dans un même prototype scoring alternatif, micro-assurance et paiement mobile, et confronter ce prototype à une enquête réelle et à un modèle financier transparent.']);
    H2('Objectifs');
    P('**Objectif général.** Évaluer la faisabilité commerciale, technique, juridique et financière d’une entreprise de financement PAYG de l’énergie solaire en Mauritanie.');
    P('**Objectifs spécifiques :**', { spacing: [0, 60] });
    bullets(['mesurer le besoin, l’intérêt et la capacité de paiement des clients cibles par une enquête ;', 'estimer la demande et positionner l’offre face à la concurrence ;', 'concevoir et démontrer un prototype du parcours client (scoring, tarification, verrouillage IoT, paiement mobile) ;', 'bâtir un modèle financier sur 5 ans avec trois scénarios (pessimiste, réaliste, optimiste) ;', 'identifier les risques et les mesures de mitigation, puis conclure sur la faisabilité.']);
    H2('Méthodologie');
    P('Le travail raconte **une seule histoire**, de la preuve du besoin à la décision. Chaque étape alimente la suivante : l’enquête fournit la preuve du besoin et les prix acceptables ; l’étude de marché en déduit la demande ; le prototype démontre la solution ; les hypothèses financières traduisent la solution en coûts et en revenus ; l’étude de faisabilité mesure la rentabilité et les risques ; la conclusion tranche.');
    await figure(specs.story, 'Fil conducteur de l’étude : du problème à la décision', 16.4);
    caption('Tableau', 'Outils utilisés à chaque étape');
    table([['Étape', 'Outil / source', 'Résultat attendu'],
      ['Enquête', 'Plateforme Les Enquêtes (questionnaire FR/AR, base Supabase)', 'Preuve du besoin, intérêt, prix et rythme acceptables'],
      ['Étude de marché', 'Indicateurs calculés sur les réponses (taux, intervalles de confiance de Wilson à 95 %, médiane interpolée sur tranches)', 'Profil, demande estimée, positionnement'],
      ['Prototype', 'Application web : Mauri-Score, tarification transparente, simulateur IoT et paiement mobile', 'Démonstration du parcours client'],
      ['Hypothèses financières', 'Registre des hypothèses (chaque donnée est classée : enquête, estimation, hypothèse, simulation)', 'Coûts, prix, volumes'],
      ['Étude de faisabilité', 'Modèle sur 60 mois, base de trésorerie : VAN, TRI, seuil de rentabilité, délai de récupération, 3 scénarios', 'Rentabilité et risques'],
      ['Conclusion', 'Synthèse et recommandations', 'Décision']], { widths: [18, 50, 32] });
    P('**Principe de transparence.** Chaque donnée du modèle est classée : donnée réelle de l’enquête, estimation (calculée sur l’enquête avec une hypothèse d’interpolation), hypothèse de l’équipe, donnée externe vérifiée ou simulation de prototype. Aucune donnée externe n’est présentée comme vérifiée tant qu’une source n’est pas renseignée.');

    /* =================== CHAPITRE 1 =================== */
    H1('Chapitre 1 — Présentation du projet');
    fil(1, 'le problème en Mauritanie ; ce chapitre décrit la solution proposée avant de la confronter aux faits.');
    H2('1.1 Présentation de l’idée');
    P('Le projet consiste à créer une entreprise qui **finance et installe des kits solaires** chez des ménages et de petits entrepreneurs, puis se fait rembourser **par petites échéances payées depuis un portefeuille mobile**. Tant que les échéances sont honorées, le client dispose de l’énergie ; en cas d’impayé, l’équipement est verrouillé à distance, puis déverrouillé dès le paiement. Le client devient propriétaire à la fin de l’échéancier.');
    P('Trois kits sont envisagés, avec des prix comptants de référence qui sont des **hypothèses de l’équipe**, à remplacer par des devis fournisseurs :');
    caption('Tableau', 'Kits solaires proposés');
    table([['Kit', 'Usage type', 'Prix comptant de référence'], ['Kit éclairage & chargeur', 'Lampes, recharge des téléphones, radio', mru(g.kit1_cash)], ['Kit confort familial', 'Éclairage, télévision, ventilateur', mru(g.kit2_cash)], ['Kit productif / commercial', 'Congélateur solaire, petite boutique, activité artisanale', mru(g.kit3_cash)]], { widths: [30, 45, 25] });
    H2('1.2 Vision et mission');
    P('**Vision.** Faire de l’énergie solaire une option accessible à tout foyer et à toute petite entreprise de Mauritanie, quel que soit son niveau d’épargne, grâce au paiement par petites échéances.');
    P('**Mission.** Fournir des équipements solaires de qualité, financés de façon transparente et adaptés aux revenus des clients, en s’appuyant sur le paiement mobile, un scoring de crédit alternatif, une micro-assurance et un suivi à distance qui sécurisent à la fois le client et l’entreprise.');
    P('**Valeurs.** Transparence du prix (chaque composante est affichée), inclusion financière, fiabilité du service après-vente, respect du client.');
    H2('1.3 Services proposés');
    caption('Tableau', 'Services de l’entreprise');
    table([['Service', 'Description', 'Valeur pour le client'],
      ['Vente à crédit PAYG', 'Acompte puis échéances adaptées (fréquence et durée choisies par le client)', 'Accès à l’énergie sans capital initial important'],
      ['Installation', 'Pose du kit par une équipe formée', 'Mise en service rapide et sûre'],
      ['Verrouillage / déverrouillage à distance (IoT)', 'Module GSM intégré à l’équipement, commandé par la plateforme', 'Règles claires ; réactivation immédiate après paiement'],
      ['Paiement par portefeuille mobile', 'Bankily, Masrivi, Sedad, Click ; code OTP de secours hors ligne', 'Paiement simple, sans déplacement'],
      ['Micro-assurance', 'Couverture de l’équipement (casse, vol, panne) dans l’échéancier', 'Sécurité ; protection de l’investissement'],
      ['Maintenance et service après-vente', 'Interventions, remplacement, assistance', 'Équipement durablement fonctionnel']], { widths: [26, 40, 34] });
    H2('1.4 Fonctionnement du modèle PAYG');
    P('Le prix PAYG n’est pas un chiffre arbitraire : il est **construit par addition de ses coûts** puis d’une marge. Le prototype affiche cette décomposition au client.');
    note('**Prix PAYG = coût du kit + installation + équipement IoT + coût de financement + micro-assurance + coûts opérationnels attribuables (suivi, commission du paiement mobile) + provision pour risque de crédit + marge.**');
    caption('Tableau', 'Décomposition du prix PAYG — scénario Réaliste, client assuré (kit à ' + mru(sc.central.cashPrice) + ' comptant)');
    const pi = cen.priceInsured, ptot = pi.total;
    table([['Composante', 'Montant (MRU)', 'Part du prix total']].concat(pi.lines.map((l) => [l.fr, num(l.value, 0), num((l.value / ptot) * 100, 1) + NB + '%'])).concat([['Prix PAYG total', num(ptot, 0), '100' + NB + '%']]), { widths: [56, 22, 22], boldLast: true });
    P('Le client verse un **acompte de ' + pctRaw(g.deposit_pct, 0) + '** (' + mru(pi.deposit) + '), puis **' + pi.periods + ' échéance' + (pi.periods > 1 ? 's' : '') + (g.freq === 'daily' ? ' quotidiennes' : g.freq === 'weekly' ? ' hebdomadaires' : ' mensuelles') + '** d’environ **' + mru(pi.installment) + '**, soit un équivalent mensuel de **' + mru(pi.monthlyEquivalent) + '** sur ' + sc.central.tenure + ' mois.');
    await figure(specs.price, 'Composition du prix PAYG (scénario Réaliste)', 16.4);
    H2('1.5 Parcours client');
    caption('Tableau', 'Parcours client, de la découverte à la propriété');
    table([['Étape', 'Ce qui se passe', 'Module du prototype'],
      ['1. Découverte', 'Le client est informé (agent de terrain, bouche-à-oreille, réseaux, partenaires) et exprime son besoin', 'Enquête (étude de marché)'],
      ['2. Évaluation', 'L’agent saisit wilaya, revenus, historique de paiement mobile et actifs : le Mauri-Score fixe l’acompte et le plafond de crédit', 'Module 1 — Scoring'],
      ['3. Offre', 'Choix du kit, de la durée, de la fréquence et de l’assurance ; le prix est affiché composante par composante', 'Module 2 — Tarification & Assurance'],
      ['4. Acompte et installation', 'Paiement de l’acompte, pose du kit et activation du module IoT', 'Module 3 — Simulation IoT'],
      ['5. Paiements', 'Le client paie ses échéances depuis son portefeuille mobile ; chaque paiement ajoute des jours d’énergie', 'Module 3 — Paiement mobile'],
      ['6. Suivi et SAV', 'Rappels SMS, assistance, recouvrement ; verrouillage en cas d’impayé, déverrouillage immédiat au paiement', 'Module 3 — Verrouillage'],
      ['7. Fin de contrat', 'Dernière échéance payée : le client devient propriétaire ; possibilité d’un second kit', '—']], { widths: [20, 54, 26] });
    H2('1.6 Présentation du Prototype');
    P('Le prototype est une **application web bilingue (français / arabe)** qui rend le modèle démontrable. Il comprend sept modules :');
    caption('Tableau', 'Modules du prototype');
    table([['Module', 'Rôle'], ['1. Scoring de crédit (Mauri-Score)', 'Score de 300 à 850 à partir du revenu, du paiement mobile, des actifs et de la wilaya ; détermine l’acompte et le plafond de crédit'],
      ['2. Tarification & assurance', 'Prix PAYG transparent, accessibilité par rapport au budget déclaré dans l’enquête, durée et fréquence'],
      ['3. Simulation IoT & paiement mobile', 'Verrouillage / déverrouillage à distance, code OTP, paiement par portefeuille mobile (simulation)'],
      ['4. Modèle financier dynamique', 'Hypothèses modifiables, 3 scénarios, VAN / TRI, seuil de rentabilité, cash-flow'],
      ['5. Étude de marché (Enquête)', 'Résultats en direct de la plateforme Les Enquêtes'],
      ['Hypothèses & export', 'Registre classé des hypothèses ; exports CSV, Excel, PDF, Word, PowerPoint'],
      ['6. Équipe du projet', 'Présentation de l’équipe']], { widths: [34, 66] });
    await shot('scoring', 'Prototype — Module 1 : Mauri-Score', 15.5);
    await shot('pricing', 'Prototype — Module 2 : tarification transparente', 15.5);
    warn('Les modules « paiement mobile » et « verrouillage IoT » sont des **simulations** : aucune connexion réelle à un opérateur ni à un module GSM n’est établie à ce stade. Les captures complètes figurent en Annexe C.');

    /* =================== CHAPITRE 2 =================== */
    H1('Chapitre 2 — Étude de marché');
    fil('2 et 3', 'l’enquête apporte la preuve du besoin ; l’étude de marché en déduit le profil des clients, les prix acceptables et la demande.');
    if (!has) warn(noSurvey);
    const sectionDists = async (keys, introTxt) => { for (const k of keys) { if (specs['s_' + k]) await figure(specs['s_' + k], specs.titles[k], 16); } };
    H2('2.1 Population cible');
    P('La population cible est constituée des **ménages et des petites entreprises** (commerces, artisans, agriculteurs, éleveurs) de Mauritanie qui n’ont pas d’accès fiable au réseau électrique ou qui supportent des dépenses d’énergie élevées, en priorité dans les zones périurbaines de Nouakchott et dans les wilayas à fort besoin d’électrification.');
    P('Le **marché adressable** retenu dans le modèle est de **' + num(g.addressable) + ' ménages ou entreprises** dans la zone cible. Il s’agit d’une **hypothèse de l’équipe**, à remplacer par une donnée externe vérifiée (ANSADE, recensement) avec sa source.');
    H2('2.2 Méthode d’enquête');
    P('L’enquête a été conduite sur la plateforme **Les Enquêtes** : questionnaire bilingue (français / arabe) à questions fermées, réponses stockées dans une base de données sécurisée (Supabase), consultables en direct dans le prototype. Les résultats sont agrégés (comptes par option) puis transformés en indicateurs :');
    bullets(['**proportions** (intérêt, intention d’achat, intérêt pour l’assurance) accompagnées de leur **intervalle de confiance de Wilson à 95 %** ;', '**médiane et moyenne** des montants, calculées par interpolation sur les tranches de réponse (hypothèse : répartition uniforme dans une tranche ; tranche ouverte = borne × ' + 1.5 + ') ;', '**modes** (réponse la plus fréquente) pour la durée et la fréquence de paiement.']);
    P('**Limite méthodologique.** L’échantillon n’est pas probabiliste : les résultats décrivent les répondants, pas la population mauritanienne dans son ensemble.');
    H2('2.3 Taille de l’échantillon');
    if (has) {
      P('Au moment de la génération de ce rapport, l’enquête compte **' + nTxt + '**. Qualité de l’échantillon selon le prototype : **' + a.quality + '** (moins de 30 répondants : insuffisant ; moins de 100 : indicatif ; 100 et plus : acceptable).');
      if (ind.warnings && ind.warnings.length) bullets(ind.warnings.map((w) => w));
    } else P(noSurvey);
    H2('2.4 Profil des répondants');
    if (has) {
      const pr = [];
      const m1 = modeLbl(a.dist('profile')); if (m1) pr.push('profil le plus représenté : **' + m1 + '**');
      const m2 = modeLbl(a.dist('activity')); if (m2) pr.push('activité principale la plus fréquente : **' + m2 + '**');
      const m3 = modeLbl(a.dist('wilaya')); if (m3) pr.push('wilaya la plus représentée : **' + m3 + '**');
      const m4 = modeLbl(a.dist('household')); if (m4) pr.push('taille de foyer la plus fréquente : **' + m4 + '**');
      if (pr.length) { P('Les répondants se caractérisent ainsi :', { spacing: [0, 60] }); bullets(pr); }
      await sectionDists(['profile', 'activity', 'wilaya', 'household']);
    } else P(noSurvey);
    H2('2.5 Besoin identifié');
    if (has) {
      const need = [];
      const ex = a.dist('existingSolar'); if (ex) need.push('situation actuelle vis-à-vis du solaire : **' + modeLbl(ex) + '**');
      if (ind.average_energy_spend != null) need.push('dépense mensuelle moyenne en énergie : **' + mru(ind.average_energy_spend) + '** (milieux de tranches)');
      const m5 = modeLbl(a.dist('energySpend')); if (m5) need.push('tranche de dépense la plus fréquente : **' + m5 + '**');
      if (need.length) bullets(need);
      P('Le besoin est d’autant plus crédible que la dépense actuelle en énergie est proche de l’échéance PAYG envisagée (équivalent mensuel du scénario Réaliste : **' + mru(cen.priceInsured.monthlyEquivalent) + '**).');
      await sectionDists(['energySpend', 'existingSolar']);
    } else P(noSurvey);
    H2('2.6 Niveau d’intérêt');
    if (has) {
      P('**' + pct(ind.payg_interest_rate, 1) + '** des répondants sont prêts à acquérir un kit en PAYG (« oui » + « peut-être »)' + (ind.payg_interest_ci ? ' — intervalle de confiance à 95 % : ' + pct(ind.payg_interest_ci[0], 1) + ' à ' + pct(ind.payg_interest_ci[1], 1) : '') + '. L’**intention ferme** (« oui » seul) est de **' + pct(ind.purchase_intention_rate, 1) + '**' + (ind.purchase_intention_ci ? ' (IC 95 % : ' + pct(ind.purchase_intention_ci[0], 1) + ' à ' + pct(ind.purchase_intention_ci[1], 1) + ')' : '') + '. Les réponses « peut-être » (' + pct(ind.maybe_rate, 1) + ') ne sont converties en achats qu’à hauteur de ' + pctRaw(g.maybe_conv, 0) + ' dans le modèle (hypothèse prudente).');
      await sectionDists(['interest', 'kit']);
    } else P(noSurvey);
    H2('2.7 Prix acceptable');
    if (has && ind.median_monthly_payment != null) {
      P('Le **montant mensuel acceptable médian** est de **' + mru(ind.median_monthly_payment) + '** (moyenne : ' + mru(ind.average_monthly_payment) + ' ; ' + pctRaw(75, 0) + ' des répondants peuvent payer au moins ' + mru(ind.monthly_price_p75) + '). Le **prix mensuel de référence** retenu — celui que ' + pctRaw((ind.reference_coverage || 0.5) * 100, 0) + ' des répondants peuvent payer — est de **' + mru(ind.reference_monthly_price) + '**.' + (ind.median_total_price != null ? ' Le prix total médian jugé acceptable pour un kit est de **' + mru(ind.median_total_price) + '**.' : ''));
      if (a.aff) P('**Test d’accessibilité.** Le scénario Réaliste conduit à un équivalent mensuel de **' + mru(a.aff.monthly) + '** : **' + pct(a.aff.share, 1) + '** des répondants (base : ' + a.aff.base + ') ont un budget mensuel maximal supérieur ou égal à ce montant.');
      await sectionDists(['monthlyPrice', 'totalPrice']);
    } else P(noSurvey);
    H2('2.8 Capacité de paiement');
    if (has) {
      const cp = [];
      if (ind.median_income_band != null) cp.push('revenu mensuel médian estimé du foyer : **' + mru(ind.median_income_band) + '**');
      const m6 = modeLbl(a.dist('income')); if (m6) cp.push('tranche de revenu la plus fréquente : **' + m6 + '**');
      if (ind.median_income_band) cp.push('l’échéance mensuelle équivalente du scénario Réaliste représente **' + pct(cen.priceInsured.monthlyEquivalent / ind.median_income_band, 1) + '** du revenu mensuel médian estimé');
      if (cp.length) bullets(cp);
      await sectionDists(['income']);
    } else P(noSurvey);
    H2('2.9 Intention d’utilisation');
    if (has) {
      const iu = [];
      if (ind.preferred_financing_months != null) iu.push('durée de financement préférée : **' + ind.preferred_financing_months + ' mois**');
      if (ind.preferred_payment_label) iu.push('fréquence de paiement préférée : **' + L(ind.preferred_payment_label) + '**');
      if (ind.insurance_interest_rate != null) iu.push('intérêt pour la micro-assurance (oui + oui si prime faible) : **' + pct(ind.insurance_interest_rate, 1) + '**');
      if (ind.lock_acceptance_rate != null) iu.push('acceptation du verrouillage automatique en cas d’impayé : **' + pct(ind.lock_acceptance_rate, 1) + '**');
      const m7 = modeLbl(a.dist('wallets')); if (m7) iu.push('portefeuille mobile le plus utilisé : **' + m7 + '**');
      if (iu.length) bullets(iu);
      await sectionDists(['duration', 'frequency', 'insurance', 'lock', 'wallets']);
    } else P(noSurvey);
    H2('2.10 Analyse de la concurrence');
    P('Le marché n’est pas vide : le client compare l’offre PAYG à plusieurs alternatives. L’analyse ci-dessous est **qualitative** ; la présence effective des acteurs régionaux en Mauritanie et leurs prix doivent être **vérifiés sur le terrain** avant toute décision.');
    caption('Tableau', 'Analyse de la concurrence');
    table([['Alternative', 'Forces', 'Faiblesses', 'Notre réponse'],
      ['Lampes à pétrole, bougies, piles', 'Coût d’entrée nul, disponibles partout', 'Dépense récurrente élevée, danger, faible qualité de lumière', 'Éclairage solaire pour un coût mensuel comparable'],
      ['Groupes électrogènes', 'Puissance élevée, disponibles', 'Carburant coûteux, bruit, pannes, pollution', 'Kits familiaux et productifs sans carburant'],
      ['Kits solaires achetés comptant (revendeurs)', 'Pas de dette, produits variés', 'Prix initial hors de portée ; qualité inégale ; pas de SAV', 'Paiement échelonné, installation et SAV inclus'],
      ['Acteurs PAYG régionaux (ex. Sun King, d.light, BBOXX, ENGIE Energy Access)', 'Technologie éprouvée, financement, marque', 'Présence locale à vérifier ; coûts logistiques ; peu d’adaptation au contexte mauritanien', 'Proximité, partenariats locaux, paiement par les portefeuilles mauritaniens, scoring adapté'],
      ['Programmes publics et ONG (ex. électrification rurale)', 'Subventions, couverture', 'Capacité limitée, durée des projets, pas de modèle récurrent', 'Complémentarité : cibler les ménages non couverts ; mobiliser des subventions pour réduire le prix']], { widths: [22, 22, 28, 28], fs: 17 });
    H2('2.11 Analyse SWOT');
    caption('Tableau', 'Analyse SWOT');
    const sw = (arr) => arr.map((t) => '• ' + t).join('\n');
    table([['Forces', 'Faiblesses'], [sw(['Modèle PAYG éprouvé à l’international', 'Prix transparent et décomposé', 'Intégration scoring + assurance + paiement mobile + IoT', has ? 'Intérêt mesuré par l’enquête (' + pct(ind.payg_interest_rate, 0) + ')' : 'Enquête en cours de collecte', 'Prototype fonctionnel et bilingue']), sw(['Capital initial et besoin de financement importants (' + mru(cen.fundingNeed) + ' au maximum, scénario Réaliste)', 'Scoring non calibré sur des remboursements réels', 'Hypothèses encore à valider par devis', 'Échantillon d’enquête non probabiliste', 'Marque et réseau de distribution à construire'])],
      ['Opportunités', 'Menaces'], [sw(['Forte demande d’électrification hors réseau', 'Essor du paiement mobile', 'Soutien possible des bailleurs et programmes d’accès à l’énergie', 'Baisse continue du prix des panneaux et des batteries', 'Partenariats avec opérateurs, banques et IMF']), sw(['Impayés supérieurs aux prévisions', 'Concurrence de revendeurs et d’acteurs régionaux', 'Évolution de la réglementation (crédit, paiement, import)', 'Fluctuation du taux de change et du coût des équipements importés', 'Vol, fraude ou contournement du verrouillage'])]], { widths: [50, 50], align: ['left', 'left'], fs: 17 });
    H2('2.12 Estimation de la demande');
    P('La demande plausible est estimée à partir de l’enquête : **taux d’intention ferme + (taux de « peut-être » × taux de conversion)**, appliqué au marché adressable.');
    if (a.demand) {
      caption('Tableau', 'Estimation de la demande');
      const y1 = [pru, cen, dyn].map((r) => r.years[0].clients);
      table([['Élément', 'Valeur', 'Source'],
        ['Intention d’achat ferme', pct(ind.purchase_intention_rate, 1), 'Enquête'],
        ['Réponses « peut-être »', pct(ind.maybe_rate, 1), 'Enquête'],
        ['Conversion des « peut-être »', pctRaw(g.maybe_conv, 0), 'Hypothèse'],
        ['Taux de demande plausible', pct(a.demand.rate, 1), 'Calcul'],
        ['Marché adressable', num(g.addressable) + ' ménages / entreprises', 'Hypothèse'],
        ['Demande plausible', num(a.demand.customers) + ' clients', 'Calcul']], { widths: [40, 30, 30], boldLast: true });
      P('Confrontation avec le modèle : les nouveaux clients de l’année 1 sont de **' + num(y1[0]) + '** (Pessimiste), **' + num(y1[1]) + '** (Réaliste) et **' + num(y1[2]) + '** (Optimiste), soit respectivement **' + pct(y1[0] / a.demand.customers, 1) + '**, **' + pct(y1[1] / a.demand.customers, 1) + '** et **' + pct(y1[2] / a.demand.customers, 1) + '** de la demande plausible. ' + (y1[1] <= a.demand.customers ? 'Le scénario Réaliste reste donc dans l’ordre de grandeur de la demande estimée.' : 'Le scénario Réaliste dépasse la demande estimée : il faut soit élargir la zone cible, soit réviser le volume à la baisse.'));
    } else P('L’estimation de la demande s’appuie sur le taux d’intention ferme et sur la part de réponses « peut-être », qui ne sont pas encore disponibles. ' + 'Avec un marché adressable de ' + num(g.addressable) + ' ménages et les volumes du scénario Réaliste (' + num(cen.years[0].clients) + ' nouveaux clients en année 1), le modèle suppose une pénétration annuelle de **' + pct(cen.years[0].clients / g.addressable, 1) + '** du marché adressable.');
    note('**Place dans l’histoire.** Les résultats de l’enquête (besoin, intérêt, prix et rythme acceptables) fixent le prix de référence et le volume de clients utilisés par le modèle financier du chapitre 5.');

    /* =================== CHAPITRE 3 =================== */
    H1('Chapitre 3 — Étude technique et opérationnelle');
    fil(4, 'le prototype démontre que la solution est réalisable techniquement et opérationnellement.');
    H2('3.1 Fonctionnement de la plateforme');
    P('La plateforme centralise tout le cycle de vie d’un contrat : **évaluation** du client (Mauri-Score), **tarification** transparente, **activation** de l’équipement, **encaissement** par portefeuille mobile, **suivi** des échéances et **verrouillage / déverrouillage** à distance. Elle est accessible par navigateur, en français et en arabe, et réservée à l’équipe habilitée par connexion sécurisée.');
    H2('3.2 Technologie');
    caption('Tableau', 'Briques technologiques');
    table([['Brique', 'Choix', 'Rôle'], ['Application web', 'HTML / JavaScript, interface bilingue FR / AR', 'Prototype : scoring, tarification, simulateur, modèle financier'], ['Base de données et authentification', 'Supabase (PostgreSQL, sécurité au niveau des lignes)', 'Enquête, hypothèses partagées entre les membres de l’équipe, comptes des superviseurs'], ['Module IoT', 'Module GSM de verrouillage intégré au kit (coût retenu : ' + mru(g.iot_cost) + ' par kit)', 'Commande à distance de l’alimentation'], ['Réseau', 'Opérateurs mobiles (Mauritel, Mattel, Chinguitel)', 'Transmission des commandes de verrouillage et des SMS'], ['Paiement', 'Portefeuilles mobiles locaux', 'Encaissement des acomptes et échéances']], { widths: [24, 40, 36] });
    H2('3.3 Paiement mobile');
    P('Le client règle chaque échéance depuis son portefeuille (**Bankily, Masrivi, Sedad, Click**). Le prototype simule le flux : choix du portefeuille, saisie du numéro et du montant, confirmation, **ajout immédiat de jours d’énergie** et déverrouillage. Chaque paiement génère un coût de commission, estimé à **' + pctRaw(g.commission_pct, 1) + ' des encaissements** (hypothèse à remplacer par les conditions réelles des opérateurs).');
    P('Un **code OTP hors ligne** permet de réactiver l’équipement lorsque le réseau mobile est indisponible, après un paiement confirmé.');
    H2('3.4 Scoring');
    P('Le **Mauri-Score** est un score alternatif de solvabilité, de 300 à 850 points, pensé pour les clients sans historique bancaire. Il s’agit d’un **mécanisme expérimental** : les pondérations sont des hypothèses académiques, non calibrées sur des remboursements réels.');
    caption('Tableau', 'Composantes du Mauri-Score');
    table([['Composante', 'Formule', 'Points maximum'], ['Base', 'constante', '300'], ['Revenu du foyer', 'min(300 ; revenu ÷ 60 000 × 300)', '300'], ['Flux de paiement mobile', 'niveau (1 à 3) × 75', '225'], ['Actifs et garanties locales', 'niveau (1 à 3) × 70', '210'], ['Wilaya de résidence', 'niveau (1 à 3) × 45', '135'], ['Score', 'somme arrondie, bornée entre 300 et 850', '850']], { widths: [34, 46, 20], boldLast: true });
    caption('Tableau', 'Décision de crédit selon le score');
    table([['Score', 'Profil', 'Acompte', 'Plafond de crédit'], ['700 et plus', 'Risque faible', '10 %', '75 000 MRU'], ['550 à 699', 'Risque modéré', '20 %', '35 000 MRU'], ['Moins de 550', 'Risque élevé (garantie requise)', '30 %', '15 000 MRU']], { widths: [22, 38, 18, 22] });
    H2('3.5 Suivi des clients');
    P('Le suivi repose sur le **tableau de bord des échéances**, les **rappels par SMS** avant l’échéance, le **verrouillage progressif** en cas de retard et le **recouvrement amiable**. Le coût de suivi (SAV, recouvrement, SMS) est estimé à **' + mru(g.servicing) + ' par client et par mois** (hypothèse). Le taux d’impayés retenu est de **' + pctRaw(sc.prudent.defaultRate, 1) + ' / ' + pctRaw(sc.central.defaultRate, 1) + ' / ' + pctRaw(sc.dynamique.defaultRate, 1) + '** dans les scénarios pessimiste / réaliste / optimiste.');
    H2('3.6 Gestion des équipements');
    bullets(['**Approvisionnement** : achat de kits certifiés auprès de fournisseurs sélectionnés ; stock initial financé dans l’investissement de départ (' + mru(g.capex_stock) + ').', '**Installation** : équipe équipée (outillage ' + mru(g.capex_tools) + ' et véhicules ' + mru(g.capex_vehicles) + ' dans l’investissement) ; coût d’installation estimé à ' + pctRaw(g.install_pct, 0) + ' du prix comptant.', '**Identification** : chaque kit est relié à un contrat et à un module IoT identifié.', '**Maintenance** : interventions préventives et correctives (budget annuel de ' + mru(g.fx_maint) + ').', '**Fin de vie et reprise** : récupération des équipements en cas de défaut prolongé, reconditionnement et remise en circulation.']);
    H2('3.7 Assurance');
    P('Une **micro-assurance** est intégrée à l’échéancier. Elle est facturée sous forme de prime de **' + pctRaw(sc.central.insRate, 1) + ' du prix comptant par an** (scénario Réaliste) et couvre l’équipement. On suppose que **' + pctRaw(g.insurance_takeup, 0) + ' des clients** y souscrivent' + (has && ind.insurance_interest_rate != null ? ', à comparer à l’intérêt mesuré dans l’enquête (**' + pct(ind.insurance_interest_rate, 1) + '**)' : '') + '. Le coût de l’assurance par client est détaillé au chapitre 5.');
    H2('3.8 Ressources humaines');
    P('Le budget salarial prévu est de **' + mru(g.fx_salaries * sc.central.opexMult) + ' par an** (scénario Réaliste). L’équipe de départ comprend :');
    bullets(['une **direction générale** (stratégie, partenariats, financement) ;', 'un **responsable financier et crédit** (scoring, refinancement, recouvrement) ;', 'un **responsable technique** (approvisionnement, installation, maintenance) ;', 'des **agents de terrain** (prospection, installation, suivi des clients) ;', 'un **chargé de la relation client** (SAV, paiements, SMS) ;', 'un **profil informatique** (plateforme et IoT), éventuellement externalisé.']);
    P('Le dimensionnement exact (nombre de postes et niveaux de salaires) reste une **hypothèse à justifier**.');
    H2('3.9 Processus opérationnel');
    numbered(['Prospection et collecte de la demande (agents de terrain, partenaires).', 'Évaluation du client : saisie des données et calcul du Mauri-Score.', 'Offre : choix du kit, de la durée, de la fréquence et de l’assurance ; édition du contrat.', 'Acompte, livraison et installation ; activation du module IoT.', 'Encaissement des échéances par portefeuille mobile ; mise à jour automatique du compte.', 'Suivi : rappels, verrouillage en cas d’impayé, recouvrement, assistance.', 'Clôture : transfert de propriété, enquête de satisfaction, proposition d’un nouveau kit.']);
    note('**Place dans l’histoire.** Le prototype démontre chaque maillon de ce processus ; les coûts associés (IoT, installation, suivi, assurance) alimentent directement le modèle financier.');

    /* =================== CHAPITRE 4 =================== */
    H1('Chapitre 4 — Étude juridique et institutionnelle');
    fil('4 à 6', 'le cadre juridique conditionne la solution (prototype), son financement (hypothèses) et sa faisabilité.');
    warn('Cette partie présente un **cadre d’analyse** : les textes précis, les seuils et les démarches doivent être **confirmés auprès d’un conseil juridique et des autorités compétentes** avant toute création de l’entreprise.');
    H2('4.1 Forme juridique envisagée');
    P('La forme recommandée est la **société à responsabilité limitée (SARL)** : responsabilité limitée aux apports, gouvernance simple, adaptée à une entreprise de petite taille qui peut ensuite accueillir des investisseurs. La **société anonyme (SA)** pourrait être envisagée si le projet devait lever des fonds importants. Dans tous les cas, l’entreprise devra être immatriculée (registre du commerce, identifiant fiscal, affiliation sociale).');
    H2('4.2 Réglementation applicable');
    caption('Tableau', 'Domaines réglementaires à examiner');
    table([['Domaine', 'Autorité / cadre', 'Point d’attention pour le projet'],
      ['Création et fonctionnement de l’entreprise', 'Droit des sociétés ; guichet de création d’entreprises ; promotion des investissements', 'Capital, statuts, immatriculation, avantages éventuels'],
      ['Fiscalité', 'Code général des impôts', 'Impôt sur les bénéfices (' + pctRaw(g.tax_rate, 0) + ' retenu dans le modèle), TVA, droits de douane sur les kits importés'],
      ['Crédit et financement', 'Banque centrale ; réglementation du crédit et de la microfinance', 'Vente à crédit ou location-vente plutôt qu’octroi de crédit ; partenariat avec une banque ou une IMF si nécessaire'],
      ['Paiement mobile et monnaie électronique', 'Banque centrale ; opérateurs et établissements agréés', 'Utilisation des portefeuilles existants ; conventions avec les prestataires de paiement'],
      ['Télécommunications', 'Autorité de régulation ; opérateurs', 'Cartes SIM / connectivité des modules IoT'],
      ['Assurance', 'Autorité de contrôle des assurances', 'Micro-assurance distribuée via un assureur agréé (l’entreprise agit comme apporteur)'],
      ['Protection des consommateurs et des données personnelles', 'Droit de la consommation ; loi sur la protection des données à caractère personnel', 'Transparence du prix, clauses de verrouillage, consentement, sécurité des données des clients'],
      ['Qualité des produits et énergie', 'Normes et organismes en charge de l’énergie et de l’électrification', 'Équipements certifiés, garanties, gestion des déchets (batteries)']], { widths: [24, 32, 44], fs: 17 });
    H2('4.3 Partenaires potentiels');
    caption('Tableau', 'Partenaires potentiels');
    table([['Type de partenaire', 'Exemples', 'Apport'], ['Prestataires de paiement mobile', 'Bankily, Masrivi, Sedad, Click', 'Encaissement, interface de paiement'], ['Opérateurs de télécommunications', 'Mauritel, Mattel, Chinguitel', 'Connectivité IoT, SMS, distribution'], ['Banques et institutions de microfinance', 'Banques commerciales, IMF', 'Refinancement du portefeuille (coût retenu : ' + pctRaw(g.funding_rate, 1) + ' par an)'], ['Assureurs', 'Compagnies d’assurance agréées', 'Produit de micro-assurance'], ['Fournisseurs d’équipements', 'Fabricants de kits certifiés', 'Kits, garanties, formation technique'], ['Institutions publiques et bailleurs', 'Agences d’électrification et d’accès aux services, bailleurs internationaux', 'Subventions, garanties, programmes d’accès à l’énergie'], ['Établissements d’enseignement et ONG', 'Universités, associations locales', 'Relais de proximité, sensibilisation, recherche']], { widths: [28, 34, 38] });
    H2('4.4 Contraintes réglementaires');
    bullets(['**Statut de l’activité de crédit** : éviter d’exercer à titre habituel une activité de crédit non autorisée ; privilégier la vente à crédit ou un partenariat avec un établissement agréé.', '**Verrouillage à distance** : l’encadrer contractuellement (information préalable, délai de grâce, déverrouillage immédiat après paiement) pour respecter la protection du consommateur.', '**Données personnelles** : déclaration éventuelle, consentement du client, sécurisation et durée de conservation.', '**Importation** : formalités douanières, conformité des produits, taxes applicables.', '**Taux et frais** : éviter tout dépassement des plafonds éventuellement applicables ; afficher clairement le coût total du crédit.']);
    note('**Place dans l’histoire.** Les contraintes juridiques conditionnent la structure de financement (refinancement, assurance) retenue dans les hypothèses financières.');

    /* =================== CHAPITRE 5 =================== */
    H1('Chapitre 5 — Étude financière');
    fil(5, 'les hypothèses financières traduisent la solution en coûts et en revenus ; l’enquête fournit le prix, le rythme de paiement et le volume.');
    P('Le modèle couvre **60 mois** en base de trésorerie. Les scénarios sont nommés **Pessimiste (Prudent)**, **Réaliste (Central)** et **Optimiste (Dynamique)**. Tous les montants sont en **ouguiya (MRU)**. Le « chiffre d’affaires » désigne ici les **encaissements** (acomptes et échéances perçus, nets des impayés).');
    if (has) note('**Lien avec l’enquête.** Prix de référence (médiane mensuelle ' + mru(ind.median_monthly_payment) + '), durée préférée (' + dash(ind.preferred_financing_months) + ' mois), fréquence de paiement préférée et intérêt pour l’assurance proviennent des réponses ; les autres paramètres sont des hypothèses de l’équipe, classées comme telles dans l’annexe D.');
    else note('**Lien avec l’enquête.** Dès que des réponses seront enregistrées, le prix mensuel de référence, la durée et la fréquence préférées et l’intérêt pour l’assurance viendront confronter les hypothèses ci-dessous.');
    H2('5.1 Investissement initial');
    const capexRows = E.CAPEX_ITEMS.map((it) => [it[1], num(g[it[0]] || 0, 0)]);
    caption('Tableau', 'Investissement initial (MRU)');
    table([['Poste', 'Montant (MRU)']].concat(capexRows).concat([['Total investissement', num(capexTotal, 0)]]), { widths: [70, 30], boldLast: true });
    P('Une subvention éventuelle (**' + mru(sc.dynamique.grant) + '** dans le scénario Optimiste, non acquise) vient en déduction du besoin de financement.');
    H2('5.2 Coûts fixes');
    caption('Tableau', 'Coûts fixes annuels (MRU) selon le scénario');
    const fixRows = E.FIXED_ITEMS.map((it) => [it[1]].concat(SC.map((s) => num((g[it[0]] || 0) * sc[s.k].opexMult, 0))));
    table([['Poste', 'Pessimiste', 'Réaliste', 'Optimiste']].concat(fixRows).concat([['Total annuel'].concat(SC.map((s) => num(res[s.k].fixedAnnual, 0)))]), { widths: [40, 20, 20, 20], boldLast: true });
    P('Les coûts fixes sont multipliés par un coefficient de coûts opérationnels (**' + num(sc.prudent.opexMult, 2) + ' / ' + num(sc.central.opexMult, 2) + ' / ' + num(sc.dynamique.opexMult, 2) + '**).');
    H2('5.3 Coûts variables');
    caption('Tableau', 'Coûts variables par client — scénario Réaliste (MRU)');
    const u = cen.unit;
    table([['Élément', 'Montant', 'Remarque'], ['Acquisition de l’équipement (kit + installation + IoT)', num(u.acqCost, 0), 'Une seule fois, à la vente'], ['Assurance', num(u.insMonthly, 0) + ' / mois', 'Pondérée par la part des clients assurés'], ['Suivi client', num(u.servMonthly, 0) + ' / mois', 'SAV, recouvrement, SMS'], ['Commission du paiement mobile', pctRaw(g.commission_pct, 1) + ' des encaissements', 'Hypothèse'], ['Provision pour impayés', pctRaw(sc.central.defaultRate, 1) + ' du capital financé', 'Intégrée au prix et aux encaissements']], { widths: [46, 24, 30] });
    H2('5.4 Coût d’acquisition d’un équipement');
    const kitCost = sc.central.cashPrice * sc.central.costRatio / 100, inst = sc.central.cashPrice * g.install_pct / 100;
    P('Pour un kit vendu **' + mru(sc.central.cashPrice) + '** au comptant, le coût d’acquisition se compose du **coût d’achat du kit** (' + pctRaw(sc.central.costRatio, 0) + ' du prix comptant, soit ' + mru(kitCost) + '), de l’**installation** (' + mru(inst) + ') et de l’**équipement IoT** (' + mru(g.iot_cost) + '), soit **' + mru(kitCost + inst + g.iot_cost) + '** avant financement. Le coefficient d’achat est de ' + pctRaw(sc.prudent.costRatio, 0) + ' / ' + pctRaw(sc.central.costRatio, 0) + ' / ' + pctRaw(sc.dynamique.costRatio, 0) + ' selon le scénario (remises à l’achat croissantes).');
    H2('5.5 Coût du financement');
    const finLine = cen.priceInsured.parts.financing;
    P('Le portefeuille de créances est refinancé au taux de **' + pctRaw(g.funding_rate, 1) + ' par an** (hypothèse, à remplacer par l’offre d’une banque ou d’un bailleur). Pour un client du scénario Réaliste, le coût de financement inclus dans le prix est de **' + mru(finLine) + '** pour un montant financé de **' + mru(cen.priceInsured.financedAmount) + '** sur ' + sc.central.tenure + ' mois. Le besoin de financement maximal de l’entreprise (point bas de la trésorerie cumulée) est de **' + mru(cen.fundingNeed) + '**.');
    H2('5.6 Coût de l’assurance');
    P('La prime d’assurance est de **' + pctRaw(sc.central.insRate, 1) + ' du prix comptant par an**, soit **' + mru(cen.priceInsured.parts.insurance) + '** sur la durée du contrat pour un client assuré. Avec ' + pctRaw(g.insurance_takeup, 0) + ' de clients assurés, le coût moyen est de **' + mru(u.insMonthly) + ' par client et par mois**.');
    H2('5.7 Coût de la plateforme');
    P('La plateforme représente un **investissement de ' + mru(g.capex_platform) + '** (développement) et un **coût récurrent de ' + mru(g.fx_software) + ' par an** (logiciels et hébergement). À cela s’ajoutent le matériel informatique et IoT (' + mru(g.capex_it) + ') et le module IoT de chaque kit (' + mru(g.iot_cost) + ').');
    H2('5.8 Salaires');
    P('Le poste salaires est le **premier poste de coûts fixes** : **' + mru(g.fx_salaries * sc.central.opexMult) + ' par an** dans le scénario Réaliste, soit **' + pct(g.fx_salaries / Math.max(1, E.FIXED_ITEMS.reduce((s2, it) => s2 + (g[it[0]] || 0), 0)), 0) + '** des coûts fixes.');
    H2('5.9 Marketing');
    P('Le marketing comprend le **lancement commercial** (' + mru(g.capex_launch) + ' dans l’investissement initial) et la **communication** (' + mru(g.fx_comm * sc.central.opexMult) + ' par an) : agents de terrain, supports, démonstrations, partenariats.');
    H2('5.10 Revenus prévisionnels');
    P('Les revenus sont les **encaissements** des clients : acomptes à la vente et échéances ensuite, nets des impayés. Le prix PAYG moyen pondéré (assurés / non assurés) est de **' + mru(u.price) + '** par client dans le scénario Réaliste, dont un acompte moyen de **' + mru(u.deposit) + '**.');
    await figure(specs.revenue, 'Chiffre d’affaires (encaissements) par année et par scénario', 16.4);
    H2('5.11 Nombre de clients prévisionnel');
    caption('Tableau', 'Nouveaux clients par année');
    table([['Scénario', 'Année 1', 'Année 2', 'Année 3', 'Année 4', 'Année 5', 'Total']].concat(SC.map((s) => [s.fr].concat(res[s.k].years.map((y) => num(y.clients, 0))).concat([num(res[s.k].totals.clients, 0)]))), { widths: [28, 12, 12, 12, 12, 12, 12] });
    P('Hypothèses de volume : **' + num(sc.prudent.clients1) + ' / ' + num(sc.central.clients1) + ' / ' + num(sc.dynamique.clients1) + '** nouveaux clients en année 1, avec une croissance annuelle de **' + pctRaw(sc.prudent.growth, 0) + ' / ' + pctRaw(sc.central.growth, 0) + ' / ' + pctRaw(sc.dynamique.growth, 0) + '**.');
    await figure(specs.clients, 'Nouveaux clients par année et par scénario', 16.4);
    H2('5.12 Chiffre d’affaires');
    caption('Tableau', 'Chiffre d’affaires (encaissements) par année (MRU)');
    table([['Scénario', 'Année 1', 'Année 2', 'Année 3', 'Année 4', 'Année 5', 'Cumul']].concat(SC.map((s) => [s.fr].concat(res[s.k].years.map((y) => num(y.revenue, 0))).concat([num(res[s.k].totals.revenue, 0)]))), { widths: [22, 13, 13, 13, 13, 13, 13], fs: 16 });
    H2('5.13 Compte de résultat prévisionnel');
    for (const s of SC) {
      caption('Tableau', 'Compte de résultat prévisionnel — ' + s.fr + ' (MRU)');
      const r = res[s.k], Y = r.years;
      const row = (lbl, f) => [lbl].concat(Y.map((y) => num(f(y), 0))).concat([num(Y.reduce((t, y) => t + f(y), 0), 0)]);
      table([['Poste', 'Année 1', 'Année 2', 'Année 3', 'Année 4', 'Année 5', 'Cumul'], row('Encaissements (CA)', (y) => y.revenue), row('Coûts variables', (y) => -y.variable), row('Marge brute', (y) => y.grossMargin), row('Coûts fixes', (y) => -y.fixed), row('Amortissement', (y) => -y.deprec), row('Résultat avant impôt', (y) => y.result), row('Impôt sur le bénéfice', (y) => -y.tax), row('Résultat net', (y) => y.netResult)], { widths: [24, 13, 13, 13, 13, 12, 12], fs: 16, boldRows: [3, 6, 8] });
    }
    P('Le résultat intègre un **amortissement linéaire sur 5 ans** de l’investissement initial et un **impôt de ' + pctRaw(g.tax_rate, 0) + '** sur le bénéfice imposable, avec report des déficits antérieurs (simplification).');
    await figure(specs.revcost, 'Encaissements, coûts et résultat net — scénario Réaliste', 16.4);
    H2('5.14 Cash-flow');
    caption('Tableau', 'Cash-flow net par année (MRU, l’année 1 intègre l’investissement initial)');
    table([['Scénario', 'Année 1', 'Année 2', 'Année 3', 'Année 4', 'Année 5', 'Cumul']].concat(SC.map((s) => [s.fr].concat(res[s.k].years.map((y) => num(y.cash, 0))).concat([num(res[s.k].totals.cash, 0)]))), { widths: [22, 13, 13, 13, 13, 13, 13], fs: 16 });
    await figure(specs.cash, 'Trésorerie cumulée sur 60 mois', 16.4);
    H2('5.15 Seuil de rentabilité');
    P('Le seuil de rentabilité est le nombre de clients à servir chaque année pour **couvrir les coûts fixes annuels**, compte tenu de la contribution d’un client sur son cycle de vie.');
    caption('Tableau', 'Seuil de rentabilité');
    table([['Indicateur', 'Pessimiste', 'Réaliste', 'Optimiste']].concat([
      ['Encaissements par client sur son cycle de vie'].concat(SC.map((s) => mru(res[s.k].revenuePerClient, 0))),
      ['Contribution par client'].concat(SC.map((s) => mru(res[s.k].contributionPerClient, 0))),
      ['Coûts fixes annuels'].concat(SC.map((s) => mru(res[s.k].fixedAnnual, 0))),
      ['Seuil (clients par an) — coûts fixes'].concat(SC.map((s) => (res[s.k].breakEvenClients == null ? 'impossible' : num(res[s.k].breakEvenClients)))),
      ['Seuil (clients par an) — coûts fixes + amortissement'].concat(SC.map((s) => (res[s.k].breakEvenWithCapex == null ? 'impossible' : num(res[s.k].breakEvenWithCapex))))]), { widths: [43, 19, 19, 19] });
    H2('5.16 Délai de récupération de l’investissement');
    caption('Tableau', 'Rentabilité et récupération de l’investissement');
    table([['Indicateur', 'Pessimiste', 'Réaliste', 'Optimiste']].concat([
      ['VAN (taux d’actualisation ' + pctRaw(sc.prudent.discount, 0) + ' / ' + pctRaw(sc.central.discount, 0) + ' / ' + pctRaw(sc.dynamique.discount, 0) + ')'].concat(SC.map((s) => mru(res[s.k].npv, 0))),
      ['TRI annuel'].concat(SC.map((s) => (res[s.k].irr == null ? 'n/d' : pct(res[s.k].irr, 1)))),
      ['Délai de récupération'].concat(SC.map((s) => (res[s.k].paybackMonths == null ? '> 60 mois' : res[s.k].paybackMonths + ' mois'))),
      ['Besoin de financement maximal'].concat(SC.map((s) => mru(res[s.k].fundingNeed, 0)))]), { widths: [43, 19, 19, 19] });
    H2('5.17 Scénarios pessimiste / réaliste / optimiste');
    caption('Tableau', 'Hypothèses des trois scénarios');
    const fmtField = (k, v, unit) => num(v, { defaultRate: 1, insRate: 1, opexMult: 2 }[k] || 0) + (unit === '%' ? NB + '%' : unit ? NB + unit : '');
    table([['Hypothèse', 'Pessimiste', 'Réaliste', 'Optimiste']].concat(E.SCENARIO_FIELDS.map((f) => [f[1]].concat(SC.map((s) => fmtField(f[0], sc[s.k][f[0]], f[3]))))), { widths: [46, 18, 18, 18], fs: 17 });
    await figure(specs.net, 'Résultat net par année et par scénario', 16.4);
    note('**Place dans l’histoire.** Ces trois scénarios encadrent la rentabilité ; le chapitre suivant en teste la robustesse et recense les risques.');

    /* =================== CHAPITRE 6 =================== */
    H1('Chapitre 6 — Faisabilité et risques');
    fil(6, 'l’étude de faisabilité mesure la rentabilité et les risques avant de conclure.');
    P('La faisabilité est évaluée en **testant la robustesse** du scénario Réaliste : on fait varier une hypothèse à la fois et on observe la VAN, le délai de récupération et le seuil de rentabilité.');
    caption('Tableau', 'Analyse de sensibilité du scénario Réaliste');
    table([['Variante', 'VAN (MRU)', 'Récupération', 'Seuil (clients/an)', 'Résultat net 5 ans (MRU)']].concat(a.sens.map((s) => [s.label, num(s.npv, 0), s.payback == null ? '> 60 mois' : s.payback + ' mois', s.be == null ? 'impossible' : num(s.be), num(s.net5, 0)])), { widths: [34, 18, 15, 16, 17], fs: 17, boldRows: [1] });
    await figure(specs.sens, 'Sensibilité de la VAN', 16.4);
    const worst = a.sens.slice(1).reduce((b, s) => (s.npv < b.npv ? s : b), a.sens[1]);
    P('La variante la plus défavorable est « **' + worst.label + '** » (VAN de **' + mru(worst.npv) + '**). Les hypothèses à sécuriser en priorité sont donc celles qui pèsent le plus sur la VAN : le volume de clients, le taux d’impayés, le prix et le coût de financement.');
    H2('6.1 Risques financiers');
    bullets(['**Besoin de financement élevé** : le point bas de la trésorerie atteint **' + mru(cen.fundingNeed) + '** (Réaliste). Un refinancement insuffisant ou plus cher (' + pctRaw(g.funding_rate, 0) + ' retenu) retarde le démarrage.', '**Rentabilité sensible aux volumes** : une baisse de 30 % des nouveaux clients ramène la VAN à **' + mru(a.sens[1].npv) + '**.', '**Variation du taux de change** : les kits sont importés alors que les paiements sont en MRU.', '**Subvention non acquise** : le scénario Optimiste suppose ' + mru(sc.dynamique.grant) + ' de subvention qui n’est pas garantie.']);
    H2('6.2 Risques opérationnels');
    bullets(['**Logistique et installation** : délais d’approvisionnement, qualité de pose, couverture géographique.', '**Service après-vente** : pannes, remplacement, disponibilité des techniciens.', '**Dépendance aux personnes clés** et difficulté de recruter des agents de terrain qualifiés.', '**Croissance rapide** : capacité à servir ' + num(cen.years[4].clients, 0) + ' nouveaux clients en année 5 (Réaliste).']);
    H2('6.3 Risques de crédit');
    bullets(['**Impayés** : le taux retenu est de ' + pctRaw(sc.central.defaultRate, 1) + ' (Réaliste). Un taux supérieur de 5 points ramène la VAN à **' + mru(a.sens[2].npv) + '**.', '**Scoring non calibré** : le Mauri-Score doit être validé sur des remboursements réels avant d’être utilisé à grande échelle.', '**Fraude et contournement** du verrouillage ; **sur-endettement** du client.']);
    H2('6.4 Risques technologiques');
    bullets(['**Couverture réseau** insuffisante pour les modules GSM dans certaines zones ; **code OTP** de secours prévu.', '**Fiabilité des équipements** (batteries, onduleurs) et durée de vie.', '**Cybersécurité et protection des données** des clients ; disponibilité de la plateforme.', '**Dépendance** à des fournisseurs et à des opérateurs de paiement.']);
    H2('6.5 Risques réglementaires');
    bullets(['**Évolution des règles** sur le crédit, le paiement mobile, la microassurance ou les importations.', '**Requalification de l’activité** en activité de crédit nécessitant un agrément.', '**Protection du consommateur** : contestation des clauses de verrouillage.']);
    H2('6.6 Mesures de mitigation');
    caption('Tableau', 'Matrice des risques et mesures de mitigation');
    table([['Risque', 'Niveau', 'Mesure de mitigation'],
      ['Impayés supérieurs aux prévisions', 'Élevé', 'Verrouillage IoT, acompte selon le score, rappels SMS, provision pour risque dans le prix, calibrage du scoring sur les premiers remboursements'],
      ['Volumes de ventes insuffisants', 'Élevé', 'Partenariats de distribution, agents commissionnés, démarrage progressif par zone, suivi de l’enquête'],
      ['Besoin de financement non couvert', 'Élevé', 'Négocier des lignes de refinancement, rechercher subventions et garanties, phaser l’investissement'],
      ['Hausse des coûts d’achat ou du change', 'Moyen', 'Contrats d’approvisionnement, ajustement du prix, diversification des fournisseurs'],
      ['Pannes et SAV', 'Moyen', 'Équipements certifiés avec garantie, micro-assurance, stock de pièces, techniciens formés'],
      ['Réseau mobile indisponible', 'Moyen', 'Code OTP hors ligne, choix des zones couvertes'],
      ['Changement réglementaire', 'Moyen', 'Veille juridique, partenariat avec un établissement agréé, conseil juridique'],
      ['Fraude / contournement du verrouillage', 'Faible à moyen', 'Modules inviolables, contrôle des équipements, récupération des kits']], { widths: [30, 12, 58], fs: 17 });
    note('**Place dans l’histoire.** Ces risques et ces sensibilités permettent de formuler la décision de la conclusion.');

    /* =================== CONCLUSION =================== */
    H1('Conclusion générale');
    fil(7, 'la décision, fondée sur la preuve du besoin, la démonstration du prototype et la rentabilité.');
    P('Cette étude a montré qu’un modèle de **financement PAYG de l’énergie solaire** peut être conçu, démontré et évalué pour la Mauritanie en combinant **scoring alternatif, micro-assurance, paiement mobile et verrouillage à distance**.');
    P(has ? '**Sur le besoin** : l’enquête (' + nTxt + ') indique que ' + pct(ind.payg_interest_rate, 1) + ' des répondants sont intéressés par un kit en PAYG' + (ind.median_monthly_payment != null ? ' et que le montant mensuel acceptable médian est de ' + mru(ind.median_monthly_payment) : '') + '. Ces résultats restent indicatifs tant que l’échantillon n’est pas élargi et représentatif.' : '**Sur le besoin** : l’enquête n’a pas encore fourni de réponses ; la conclusion sur la demande devra être confirmée dès que les réponses seront collectées.');
    P('**Sur la solution** : le prototype démontre le parcours complet (évaluation, prix transparent, activation, paiement, verrouillage), même si les modules de paiement et d’IoT restent des simulations.');
    P('**Sur la rentabilité** : dans le scénario Réaliste, la VAN est de **' + mru(cen.npv) + '**' + (cen.irr != null ? ', le TRI de **' + pct(cen.irr, 1) + '**' : '') + ', ' + (cen.paybackMonths != null ? 'et l’investissement est récupéré en **' + cen.paybackMonths + ' mois**.' : 'et l’investissement **n’est pas récupéré en 60 mois**.') + ' Les scénarios Pessimiste et Optimiste donnent respectivement une VAN de **' + mru(pru.npv) + '** et de **' + mru(dyn.npv) + '**.');
    note(vtxt);
    P('**Recommandations :**', { spacing: [0, 60] });
    numbered(['Remplacer les hypothèses de prix, de coûts et d’installation par des **devis réels** (fournisseurs, installateurs, opérateurs).', 'Poursuivre l’enquête pour atteindre un échantillon **d’au moins 100 répondants** et mieux représenter les zones cibles.', 'Mener un **projet pilote** sur un petit nombre de clients pour calibrer le scoring et mesurer les impayés réels.', 'Sécuriser le **refinancement** et rechercher des **subventions** pour réduire le besoin de financement.', 'Valider le **cadre juridique** avec un conseil et les autorités compétentes.']);

    /* =================== BIBLIOGRAPHIE =================== */
    H1('Bibliographie');
    P('Les références ci-dessous sont **indicatives** : l’équipe doit vérifier l’édition, l’année et le lien de chaque document consulté, et les présenter selon la norme de citation exigée par l’établissement.');
    bullets(['GOGLA, Lighting Global, ESMAP, Efficiency for Access — *Off-Grid Solar Market Trends Report* (éditions successives).', 'GOGLA — *Global Off-Grid Solar Market Report* (données semestrielles de ventes et d’impact).', 'IEA, IRENA, UNSD, Banque mondiale, OMS — *Tracking SDG 7: The Energy Progress Report* (édition annuelle).', 'GSMA — *State of the Industry Report on Mobile Money* (édition annuelle).', 'Banque centrale de Mauritanie — textes et statistiques relatifs aux paiements et à la monnaie électronique.', 'ANSADE (Agence nationale de la statistique et de l’analyse démographique et économique) — données démographiques et d’enquêtes auprès des ménages.', 'Wilson, E. B. (1927) — *Probable inference, the law of succession, and statistical inference*, Journal of the American Statistical Association.', 'Brealey, R., Myers, S., Allen, F. — *Principles of Corporate Finance* (valeur actuelle nette, taux de rendement interne).', 'Plateforme Les Enquêtes — questionnaire et réponses de l’enquête de terrain (base Supabase, projet Solar PAYG Mauritanie).', 'Prototype Solar PAYG Mauritanie — registre des hypothèses du modèle financier (version du ' + E.MODEL_DATE + ').'].map((t) => t.replace(/\*([^*]+)\*/g, '$1')));

    /* =================== ANNEXES =================== */
    H1('Annexes');
    P('Annexe A — Questionnaire complet · Annexe B — Résultats détaillés de l’enquête · Annexe C — Captures du prototype · Annexe D — Tableaux financiers · Annexe E — Graphiques.');
    H2('Annexe A — Questionnaire complet');
    const qs = (a.survey && a.survey.questions) || [];
    if (qs.length) {
      qs.forEach((q, i) => {
        body.push(para(run((i + 1) + '.  ' + L(q.question_fr), { bold: true, size: 20 }), { keepNext: true, spacing: [140, 40], align: 'left', ind: [340, 0, 340] }));
        (q.options || []).forEach((o) => body.push(para(run('☐  ' + L(o.label_fr), { size: 19 }), { ind: [700, 0, 260], spacing: [0, 20], align: 'left' })));
      });
    } else P('Le questionnaire n’a pas pu être chargé depuis la plateforme Les Enquêtes au moment de la génération du rapport.');
    H2('Annexe B — Résultats détaillés de l’enquête');
    if (has) {
      const rows = [['Question', 'Option', 'Effectif', '%']];
      Object.keys(ind.distributions).forEach((k) => { const d = ind.distributions[k]; if (!d || !d.total) return; d.items.forEach((i, idx) => rows.push([idx === 0 ? (specs.titles[k] || k) : '', L(i.label_fr), num(i.count, 0), num(i.pct, 1)])); rows.push(['', 'Total des réponses', num(d.total, 0), '100,0']); });
      caption('Tableau', 'Résultats détaillés par question');
      table(rows, { widths: [34, 42, 12, 12], fs: 17 });
    } else P(noSurvey);
    H2('Annexe C — Captures du prototype');
    await shot('scoring', 'Module 1 — Scoring de crédit (Mauri-Score)', 15);
    await shot('pricing', 'Module 2 — Tarification et assurance', 15);
    await shot('iot_locked', 'Module 3 — Équipement verrouillé (échéance échue)', 15);
    await shot('iot_unlocked', 'Module 3 — Équipement déverrouillé après paiement mobile (simulation)', 15);
    await shot('financials', 'Module 4 — Modèle financier dynamique', 15);
    await shot('assumptions', 'Registre des hypothèses du modèle', 15);
    // section portrait terminée -> annexe D en paysage (la numérotation des pages démarre à 1 après la page de garde)
    sectBreak(false, true);
    curW = W_LAND;
    H2('Annexe D — Tableaux financiers');
    const sheets = E.buildExport(ctx.state, ind, res, ctx.date);
    const drop = { Indicateurs_enquete: 1 };
    const nice = { Hypotheses_modele: 'Hypothèses du modèle (registre classé)', Prix_PAYG: 'Prix PAYG par scénario', Resultats_annuels: 'Résultats annuels par scénario', Indicateurs_financiers: 'Indicateurs financiers', Distributions: 'Distributions des réponses' };
    for (const nm of ['Hypotheses_modele', 'Prix_PAYG', 'Resultats_annuels', 'Indicateurs_financiers']) {
      if (!sheets[nm]) continue;
      caption('Tableau', nice[nm]);
      const rws = sheets[nm].map((r, i) => r.map((c) => (i > 0 && typeof c === 'number' ? num(c, Number.isInteger(c) ? 0 : 1) : c)));
      table(rws, { fs: 15 });
    }
    sectBreak(true);
    curW = W_PORTRAIT;
    H2('Annexe E — Graphiques');
    await figure(specs.story, 'Fil conducteur de l’étude', 16.4);
    if (has) for (const k of specs.surveyKeys) await figure(specs['s_' + k], specs.titles[k], 15.5);
    await figure(specs.price, 'Composition du prix PAYG (scénario Réaliste)', 16.4);
    await figure(specs.clients, 'Nouveaux clients par année et par scénario', 16.4);
    await figure(specs.revenue, 'Chiffre d’affaires (encaissements) par année et par scénario', 16.4);
    await figure(specs.revcost, 'Encaissements, coûts et résultat net — scénario Réaliste', 16.4);
    await figure(specs.net, 'Résultat net par année et par scénario', 16.4);
    await figure(specs.cash, 'Trésorerie cumulée sur 60 mois', 16.4);
    await figure(specs.sens, 'Sensibilité de la VAN', 16.4);

    /* ---------- SOMMAIRE ---------- */
    const tocXml = [];
    tocXml.push(para(run('Sommaire', { bold: true, size: 36, color: '14532D' }), { spacing: [0, 240], keepNext: true }));
    const entries = toc.filter((t) => t.level <= 2);
    entries.forEach((t, i) => {
      const first = i === 0, last = i === entries.length - 1;
      const pre = first ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' : '';
      const post = last ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '';
      tocXml.push('<w:p><w:pPr><w:pStyle w:val="TOC' + t.level + '"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9628"/></w:tabs></w:pPr>' + pre + '<w:hyperlink w:anchor="_' + t.id + '" w:history="1">' + run(t.text, { size: t.level === 1 ? 21 : 19, bold: t.level === 1 }) + '</w:hyperlink>' + post + '</w:p>');
    });
    tocXml.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    body[tocIndex] = tocXml.join('');

    /* ---------- Assemblage du paquet .docx ---------- */
    const finalSect = '<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1134" w:bottom="1134" w:left="1134" w:header="560" w:footer="480" w:gutter="0"/></w:sectPr>';
    const documentXml = XML + '<w:document ' + NS + '><w:body>' + body.join('') + finalSect + '</w:body></w:document>';
    const stylesXml = XML + '<w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr>' + FONT + '<w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="fr-FR" w:eastAsia="fr-FR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="D4AF37"/></w:pBdr><w:spacing w:before="0" w:after="260"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="14532D"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="16803A"/><w:sz w:val="27"/><w:szCs w:val="27"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="334155"/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:i/><w:iCs/><w:color w:val="64748B"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:before="0" w:after="20"/><w:ind w:left="340"/></w:pPr></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
    const numberingXml = XML + '<w:numbering ' + NS + '><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="16803A"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
    const settingsXml = XML + '<w:settings ' + NS + '><w:zoom w:percent="100"/><w:updateFields w:val="true"/><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
    const fontTableXml = XML + '<w:fonts ' + NS + '><w:font w:name="Arial"><w:panose1 w:val="020B0604020202020204"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font></w:fonts>';
    const hdr = (inner) => XML + '<w:hdr ' + NS + '>' + inner + '</w:hdr>';
    const ftr = (inner) => XML + '<w:ftr ' + NS + '>' + inner + '</w:ftr>';
    const hdrXml = hdr(para(run('ISCAE — Banque et Assurance  |  Solar PAYG Mauritanie — Étude de faisabilité', { size: 16, color: '64748B' }), { align: 'left', border: null, spacing: [0, 0] }).replace('<w:pPr>', '<w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="D4AF37"/></w:pBdr>'));
    const fld = (ins) => '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ' + ins + ' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + run('1', { size: 16, color: '64748B' }) + '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const ftrXml = ftr(para(run('© 2027 Solar PAYG Mauritanie — ISCAE — MDA — Tous droits réservés  |  ' + DEPT + '  |  Page ', { size: 16, color: '64748B' }) + fld('PAGE'), { align: 'center' }));
    const emptyHdr = hdr('<w:p/>'), emptyFtr = ftr('<w:p/>');
    const mediaCT = [...new Set(media.map((m) => m.name.split('.').pop()))].map((e) => '<Default Extension="' + e + '" ContentType="' + (e === 'png' ? 'image/png' : 'image/jpeg') + '"/>').join('');
    const files = [
      { name: '[Content_Types].xml', data: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' + mediaCT + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
      { name: '_rels/.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdSet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdFnt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdHdrEmpty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/><Relationship Id="rIdFtrEmpty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>' + media.map((m) => '<Relationship Id="' + m.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>').join('') + '</Relationships>' },
      { name: 'word/document.xml', data: documentXml }, { name: 'word/styles.xml', data: stylesXml }, { name: 'word/numbering.xml', data: numberingXml }, { name: 'word/fontTable.xml', data: fontTableXml }, { name: 'word/settings.xml', data: settingsXml },
      { name: 'word/header1.xml', data: hdrXml }, { name: 'word/footer1.xml', data: ftrXml }, { name: 'word/header2.xml', data: emptyHdr }, { name: 'word/footer2.xml', data: emptyFtr },
      { name: 'docProps/core.xml', data: XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Étude de faisabilité — Solar PAYG Mauritanie</dc:title><dc:creator>Solar PAYG Mauritanie</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>' },
      { name: 'docProps/app.xml', data: XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Solar PAYG Mauritanie</Application></Properties>' }
    ].concat(media.map((m) => ({ name: 'word/media/' + m.name, data: m.bytes })));
    return D.zip(files);
  }

  const API = { build, analyze, chartSpecs, SC, DEPT, MIME: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PaygReport = API;
})(typeof window !== 'undefined' ? window : globalThis);
