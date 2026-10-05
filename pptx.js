/* pptx.js — Présentation PowerPoint de la soutenance (22 diapositives), construite sur le même plan et les mêmes chiffres
 *  que le rapport Word (report.js) : enquête → étude de marché → prototype → hypothèses financières → faisabilité → conclusion.
 *  - Graphiques PowerPoint NATIFS (modifiables dans PowerPoint) ; captures du prototype intégrées (assets.js).
 *  - THÈME : la présentation suit le thème de la plateforme au moment de l'export (mode sombre → fond sombre et captures
 *    sombres ; mode clair → fond clair et captures claires).
 *  - ANIMATIONS : transitions « Morph » entre diapositives (repli sur « Fondu » dans les anciennes versions), anneaux HUD qui
 *    tournent, entrées échelonnées des cartes, graphiques, tableaux et images, logo flottant (module pptx-fx.js).
 *  - La bibliothèque PptxGenJS est chargée à la demande depuis un CDN (comme la bibliothèque Excel) : l'export PowerPoint
 *    nécessite donc une connexion Internet, contrairement au rapport Word.
 *  - Ne modifie aucune formule ni aucune autre fonction du site. */
(function (root) {
  'use strict';
  const D = root.PaygDocs, R = root.PaygReport;
  const { num, mru, pct, pctRaw } = D;
  const CDN = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
  const W = 13.333, H = 7.5;
  const K = { navy: '0F172A', slate: '334155', gray: '64748B', light: 'F1F5F9', line: 'CBD5E1', green: '16803A', greenDark: '14532D', lime: 'DCFCE7', gold: 'D4AF37', orange: 'F59E0B', orangeDark: 'EA580C', blue: '1D6FE0', blueDark: '1E3A8A', red: 'DC2626', white: 'FFFFFF', cream: 'FEF3C7' };
  const FONT = 'Arial';
  const noEmoji = (s) => String(s == null ? '' : s).replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

  function loadLib() {
    if (root.PptxGenJS) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = CDN; s.async = true;
      s.onload = () => (root.PptxGenJS ? resolve() : reject(new Error('pptx load')));
      s.onerror = () => reject(new Error('pptx load network'));
      document.head.appendChild(s);
    });
  }
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

  /* ---------- Thèmes (sombre = plateforme en mode sombre, clair = plateforme en mode clair) ---------- */
  const BRIGHT = { EA580C: 'FB923C', '16803A': '4ADE80', '1D6FE0': '60A5FA', '1E3A8A': '93C5FD', DC2626: 'F87171', F59E0B: 'FBBF24', '14532D': '86EFAC', D4AF37: 'FDE047', '334155': 'CBD5E1', '64748B': '94A3B8' };
  function makeTheme(light) {
    const hex = (c) => String(c || '').replace('#', '').toUpperCase();
    const T = light ? {
      light: true, bg: 'F6F9FC', bgCover: 'F6F9FC', band: 'E2E8F0', card: 'FFFFFF', cardAlt: 'F1F5F9', line: 'CBD5E1', text: '334155', muted: '64748B', head: '14532D', grid: 'E2E8F0',
      thFill: '14532D', thText: 'FFFFFF', warnFill: 'FEF3C7', warnLine: 'FCD34D', ringA: '0E7490', ringB: '16803A', ringC: 'D97706', rt: 80, gold: 'B45309', kicker: '92400E', sub: '334155', onAccent: 'FFFFFF',
      ac: (c) => hex(c)
    } : {
      light: false, bg: '08111F', bgCover: '050B16', band: '0B1730', card: '0F1D33', cardAlt: '132743', line: '27425F', text: 'D6E0EE', muted: '8EA2BD', head: 'F8FAFC', grid: '1E3452',
      thFill: '0F766E', thText: 'FFFFFF', warnFill: '2A2410', warnLine: '8A6D1A', ringA: '22D3EE', ringB: '34D399', ringC: 'FBBF24', rt: 62, gold: 'FBBF24', kicker: 'FBBF24', sub: 'DCFCE7', onAccent: 'FFFFFF',
      ac: (c) => BRIGHT[hex(c)] || hex(c)
    };
    // Graphiques SVG (courbe de trésorerie, fil conducteur) : fond et textes adaptés au thème sombre
    const MAP = { '#fff': T.card, '#0F172A': '#F1F5F9', '#334155': '#CBD5E1', '#475569': '#A9B8CE', '#E2E8F0': '#1E3452', '#CBD5E1': '#334B6B' };
    T.svg = (spec) => (light ? spec : Object.assign({}, spec, { svg: spec.svg.replace(/#(?:fff|[0-9A-Fa-f]{6})\b/g, (m) => (MAP[m] ? '#' + String(MAP[m]).replace('#', '') : m)) }));
    return T;
  }

  /* Prépare une diapositive : chaque élément reçoit un nom « FX<groupe>~<effet> » que pptx-fx.js transformera en animation */
  function wrap(s) {
    s._n = 0; s._g = null; s._chrome = false;
    const gid = () => (s._g != null ? s._g : ++s._n);
    const tag = (o, eff) => { o = o || {}; if (!o.objectName && !s._chrome) o.objectName = 'FX' + gid() + '~' + eff; return o; };
    const aT = s.addText.bind(s), aS = s.addShape.bind(s), aI = s.addImage.bind(s), aTb = s.addTable.bind(s), aC = s.addChart.bind(s);
    s.addText = (t, o) => aT(t, tag(o, 'float'));
    s.addShape = (sh, o) => aS(sh, tag(o, 'float'));
    s.addImage = (o) => aI(tag(o, 'zoom'));
    s.addTable = (r, o) => aTb(r, tag(o, 'fade'));
    s.addChart = (ty, d, o) => aC(ty, d, tag(o, 'wipe'));
    return s;
  }
  const grp = (s, fn) => { const prev = s._g; s._g = ++s._n; try { fn(); } finally { s._g = prev; } };

  /* Construit la présentation et retourne { bytes: Uint8Array, count } (sans la télécharger) */
  async function build(ctx) {
    await loadLib();
    const a = R.analyze(ctx), E = a.E, g = a.g, sc = a.sc, res = a.res, ind = a.ind, has = a.has;
    const cen = res.central, pru = res.prudent, dyn = res.dynamique, SC = R.SC;
    const assets = root.PAYG_ASSETS || {};
    const isLight = ctx.theme ? ctx.theme === 'light' : !!(assets.isLight ? assets.isLight() : (typeof document !== 'undefined' && document.documentElement.classList.contains('light')));
    const T = makeTheme(isLight);
    const pres = new root.PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    pres.title = 'Étude de faisabilité — Solar PAYG Mauritanie'; pres.author = 'Solar PAYG Mauritanie'; pres.company = 'Solar PAYG Mauritanie';
    let logo = null;
    let logoBig = null;
    try { if (assets.logoSvg) { // deux tailles : petite (en-tête des diapositives, fichier léger) et grande (couverture / fin)
      const sm = await D.svgToPngTransparent(assets.logoSvg, 1092, 1092, 0.2); logo = 'image/png;base64,' + b64(sm.bytes);
      const bg = await D.svgToPngTransparent(assets.logoSvg, 1092, 1092, 0.42); logoBig = 'image/png;base64,' + b64(bg.bytes);
    } } catch (e) { /* logo facultatif */ }
    const instLogo = assets.instLogo ? assets.instLogo.replace(/^data:/, '') : null; // logo ISCAE (JPEG)
    // Capture du prototype dans le thème actif (sombre / clair) ; repli sur la version sombre si la claire est absente
    const shotUri = (k) => (assets.shot ? assets.shot(k, isLight) : (assets.shots && assets.shots[k]) || null);
    const STEPS = { 1: 'Étape 1/7 · Problème en Mauritanie', 2: 'Étape 2/7 · Enquête → preuve du besoin', 3: 'Étape 3/7 · Étude de marché → demande', 4: 'Étape 4/7 · Prototype → démonstration', 5: 'Étape 5/7 · Hypothèses financières', 6: 'Étape 6/7 · Faisabilité → rentabilité et risques', 7: 'Étape 7/7 · Conclusion → décision' };
    const nTxt = has ? num(a.n) + ' répondant' + (a.n > 1 ? 's' : '') : null;
    const L = noEmoji;
    let count = 0;
    const TRANS = [];

    /* ---------- décor : anneaux HUD (nommés « !!hudN » : même nom d'une diapositive à l'autre → effet Morph) ---------- */
    const HUD_POS = [[11.7, 1.3], [1.5, 6.3], [12.3, 5.9], [1.0, 1.1], [11.4, 3.8], [2.3, 6.9], [12.2, 0.9], [0.8, 4.2]];
    function hud(s, cx, cy, k) {
      k = k || 1; const prev = s._chrome; s._chrome = true;
      const ring = (key, r, shape, o) => s.addShape(pres.ShapeType[shape], Object.assign({ x: cx - r * k, y: cy - r * k, w: 2 * r * k, h: 2 * r * k, objectName: '!!' + key }, o));
      const none = { color: T.ringA, transparency: 100 };
      ring('hud1', 3.7, 'ellipse', { fill: none, line: { color: T.ringA, width: 1, dashType: 'dash', transparency: T.rt } });
      ring('hud2', 3.15, 'blockArc', { angleRange: [20, 135], arcThicknessRatio: 0.05, fill: { color: T.ringB, transparency: T.rt - 4 }, line: { color: T.ringB, width: 0, transparency: 100 } });
      ring('hud3', 2.6, 'ellipse', { fill: none, line: { color: T.ringC, width: 0.75, transparency: T.rt + 6 } });
      ring('hud4', 4.2, 'blockArc', { angleRange: [200, 292], arcThicknessRatio: 0.022, fill: { color: T.ringA, transparency: T.rt - 6 }, line: { color: T.ringA, width: 0, transparency: 100 } });
      ring('hud5', 2.05, 'ellipse', { fill: none, line: { color: T.ringB, width: 1.25, dashType: 'sysDot', transparency: T.rt - 2 } });
      s._chrome = prev;
    }

    /* ---------- gabarit de diapositive ---------- */
    function slide(title, step, notes) {
      const s = wrap(pres.addSlide()); count++;
      s.background = { color: T.bg };
      const p = HUD_POS[count % HUD_POS.length];
      hud(s, p[0], p[1]);
      s._chrome = true;
      s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.1, fill: { color: T.ac(K.green) }, line: { color: T.ac(K.green), width: 0 }, objectName: 'Bandeau' });
      s.addShape(pres.ShapeType.rect, { x: 0, y: 0.1, w: W, h: 0.035, fill: { color: T.ac(K.gold) }, line: { color: T.ac(K.gold), width: 0 }, objectName: 'Liseré' });
      s._chrome = false; s._g = 0;
      s.addText(title, { x: 0.5, y: 0.3, w: 9.9, h: 0.75, fontFace: FONT, fontSize: 28, bold: true, color: T.head, charSpacing: 1, valign: 'middle', margin: 0, isTextBox: true, fit: 'shrink' });
      s.addShape(pres.ShapeType.rect, { x: 0.5, y: 1.07, w: 1.3, h: 0.05, fill: { color: T.ringA }, line: { color: T.ringA, width: 0 }, objectName: 'FX0~wipe' });
      if (step) s.addText(STEPS[step], { x: 0.5, y: 1.15, w: 9, h: 0.28, fontFace: FONT, fontSize: 12, italic: true, color: T.muted, margin: 0, isTextBox: true });
      s._g = null; s._chrome = true;
      if (logo) {
        s.addShape(pres.ShapeType.ellipse, { x: W - 1.22, y: 0.3, w: 0.82, h: 0.82, fill: { color: 'FFFFFF' }, line: { color: T.ac(K.gold), width: 1.5 }, objectName: '!!logo1' });
        s.addImage({ data: logo, x: W - 1.2, y: 0.32, w: 0.78, h: 0.78, objectName: '!!logo2' });
      }
      if (instLogo) {
        s.addShape(pres.ShapeType.ellipse, { x: W - 2.17, y: 0.3, w: 0.82, h: 0.82, fill: { color: 'FFFFFF' }, line: { color: T.ringA, width: 1.5 }, objectName: '!!inst1' });
        s.addImage({ data: instLogo, x: W - 2.13, y: 0.34, w: 0.74, h: 0.74, rounding: true, objectName: '!!inst2' });
        s.addText('ISCAE', { x: W - 2.45, y: 1.14, w: 1.4, h: 0.22, fontFace: FONT, fontSize: 9, bold: true, color: T.muted, align: 'center', charSpacing: 2, margin: 0, isTextBox: true, objectName: '!!inst3' });
      }
      s.addShape(pres.ShapeType.line, { x: 0.5, y: H - 0.5, w: W - 1, h: 0, line: { color: T.line, width: 0.75 }, objectName: 'Filet de pied' });
      s.addText('© 2027 Solar PAYG Mauritanie — ISCAE · Banque et Assurance — MDA — Tous droits réservés   |   Département Management, Economie et Droit', { x: 0.5, y: H - 0.45, w: 10.5, h: 0.3, fontFace: FONT, fontSize: 10, color: T.muted, margin: 0, isTextBox: true, objectName: 'Pied de page' });
      s.addText(String(count), { x: W - 1.1, y: H - 0.45, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: T.ac(K.green), align: 'right', margin: 0, isTextBox: true, objectName: 'Numéro' });
      s._chrome = false;
      if (notes) s.addNotes(notes);
      TRANS[count - 1] = 'morph';
      return s;
    }
    const txt = (s, t, o) => s.addText(t, Object.assign({ fontFace: FONT, fontSize: 16, color: T.text, margin: 0, valign: 'top', isTextBox: true }, o));
    const bullets = (s, items, o) => {
      const arr = items.map((t, i) => ({ text: t, options: { bullet: { code: '25CF', indent: 18 }, breakLine: i < items.length - 1, paraSpaceAfter: 8 } }));
      s.addText(arr, Object.assign({ fontFace: FONT, fontSize: 16, color: T.text, margin: 0, valign: 'top', isTextBox: true }, o));
    };
    function card(s, x, y, w, h, head, body, color, o) {
      o = o || {};
      const c = T.ac(color || K.greenDark);
      grp(s, () => {
        s.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: o.fill ? T.warnFill : T.card }, line: { color: o.line ? T.warnLine : T.line, width: 0.75 }, rectRadius: 0.08 });
        s.addShape(pres.ShapeType.rect, { x, y: y + 0.12, w: 0.09, h: h - 0.24, fill: { color: c }, line: { color: c, width: 0 } });
        s.addText(head, { x: x + 0.25, y: y + 0.1, w: w - 0.4, h: 0.45, fontFace: FONT, fontSize: o.hs || 16, bold: true, color: c, margin: 0, valign: 'middle', isTextBox: true });
        if (body) s.addText(body, { x: x + 0.25, y: y + 0.58, w: w - 0.4, h: h - 0.68, fontFace: FONT, fontSize: o.bs || 13, color: T.text, margin: 0, valign: 'top', isTextBox: true, fit: 'shrink' });
      });
    }
    function kpi(s, x, y, w, h, value, label, color) {
      const c = T.ac(color || K.green);
      grp(s, () => {
        s.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: T.card }, line: { color: c, width: 1.5 }, rectRadius: 0.1 });
        s.addText(value, { x: x + 0.1, y: y + 0.12, w: w - 0.2, h: h * 0.52, fontFace: FONT, fontSize: 26, bold: true, color: c, align: 'center', valign: 'middle', margin: 0, isTextBox: true, fit: 'shrink' });
        s.addText(label, { x: x + 0.12, y: y + h * 0.58, w: w - 0.24, h: h * 0.38, fontFace: FONT, fontSize: 12, color: T.text, align: 'center', valign: 'top', margin: 0, isTextBox: true, fit: 'shrink' });
      });
    }
    // Capture du prototype (thème actif), ajustée dans le cadre (x, y, w, h) sans déformation
    function shotImg(s, key, x, y, w, h) {
      const uri = shotUri(key); if (!uri) return false;
      const bytes = D.dataUriToBytes(uri), sz = D.imageSize(bytes), r = Math.min(w / sz.w, h / sz.h), iw = sz.w * r, ih = sz.h * r, ix = x + (w - iw) / 2, iy = y + (h - ih) / 2;
      grp(s, () => {
        s.addShape(pres.ShapeType.roundRect, { x: ix - 0.07, y: iy - 0.07, w: iw + 0.14, h: ih + 0.14, fill: { color: T.card }, line: { color: T.ac(K.green), width: 1.25 }, rectRadius: 0.06 });
        s.addImage({ data: uri.replace(/^data:/, ''), x: ix, y: iy, w: iw, h: ih });
      });
      return true;
    }
    const tableOpts = (o) => Object.assign({ fontFace: FONT, fontSize: 12, color: T.text, fill: { color: T.card }, border: { type: 'solid', color: T.line, pt: 0.75 }, valign: 'middle', margin: [0.04, 0.08, 0.04, 0.08] }, o);
    const th = (t) => ({ text: t, options: { bold: true, color: T.thText, fill: { color: T.thFill }, align: 'center' } });
    const td = (t, o) => ({ text: String(t), options: Object.assign({}, o) });
    const noData = (s, x, y, w, h) => card(s, x, y, w, h, 'Données de l’enquête à venir', 'Aucune réponse n’est encore enregistrée sur la plateforme Les Enquêtes. Cette diapositive se complétera automatiquement dès que des réponses seront disponibles (il suffit de régénérer la présentation).', K.orange, { fill: K.cream, line: 'FCD34D', bs: 14 });
    function chartBar(s, labels, series, pos, o) {
      o = o || {};
      const data = series.map((x) => ({ name: x.name, labels, values: x.values }));
      s.addChart(o.line ? pres.charts.LINE : pres.charts.BAR, data, Object.assign({
        x: pos.x, y: pos.y, w: pos.w, h: pos.h, barDir: o.horizontal ? 'bar' : 'col', barGrouping: 'clustered',
        chartColors: series.map((x) => T.ac(x.color)), showLegend: series.length > 1, legendPos: 'b', legendFontSize: 11, legendFontFace: FONT, legendColor: T.text,
        catAxisLabelFontSize: 11, catAxisLabelFontFace: FONT, catAxisLabelColor: T.text, valAxisLabelFontSize: 10, valAxisLabelColor: T.muted, valAxisLabelFontFace: FONT,
        valGridLine: { color: T.grid, size: 0.5 }, catGridLine: { style: 'none' },
        showValue: !!o.values, dataLabelFontSize: 10, dataLabelColor: T.text, dataLabelFormatCode: o.fmt || '#,##0', dataLabelPosition: o.dlPos || (o.line ? 't' : 'outEnd'), // « outEnd » est invalide pour un graphique en lignes
        valAxisLabelFormatCode: o.axisFmt || '#,##0', showTitle: !!o.title, title: o.title || '', titleFontSize: 13, titleColor: T.text, titleFontFace: FONT, barGapWidthPct: 60
      }, o.extra || {}));
    }
    const distChart = (s, key, pos, title) => {
      const d = a.dist(key); if (!d) return false;
      const items = d.items.filter((i) => i.label_fr);
      chartBar(s, items.map((i) => L(i.label_fr)), [{ name: '%', color: '#1D6FE0', values: items.map((i) => +i.pct.toFixed(1)) }], pos, { horizontal: true, values: true, fmt: '0.0"%"', axisFmt: '0"%"', title: title + ' (n = ' + d.total + ')', extra: { valAxisMaxVal: 100, catAxisOrientation: 'maxMin' } });
      return true;
    };

    /* =========================== 1. PAGE DE GARDE =========================== */
    {
      const s = wrap(pres.addSlide()); count++; TRANS[count - 1] = 'morph';
      s.background = { color: T.bgCover };
      hud(s, 1.9, 1.95, 1.0);
      s._chrome = true;
      s.addShape(pres.ShapeType.rect, { x: 0, y: 5.9, w: W, h: 1.6, fill: { color: T.band }, line: { color: T.band, width: 0 }, objectName: 'Bandeau bas' });
      s.addShape(pres.ShapeType.rect, { x: 0, y: 5.86, w: W, h: 0.06, fill: { color: T.ac(K.gold) }, line: { color: T.ac(K.gold), width: 0 }, objectName: 'Liseré bas' });
      s._chrome = false;
      if (logo) {
        s._g = 1;
        s.addShape(pres.ShapeType.ellipse, { x: 0.62, y: 0.67, w: 2.56, h: 2.56, fill: { color: T.ringA, transparency: 80 }, line: { color: T.ringA, width: 1, transparency: 50 }, objectName: '!!pulse' });
        s.addShape(pres.ShapeType.ellipse, { x: 0.72, y: 0.77, w: 2.36, h: 2.36, fill: { color: 'FFFFFF' }, line: { color: T.ac(K.gold), width: 3 }, objectName: '!!logo1' });
        s.addImage({ data: logoBig || logo, x: 0.78, y: 0.83, w: 2.24, h: 2.24, objectName: '!!logo2' });
        s._g = null;
      }
      if (instLogo) {
        s._g = 10;
        s.addShape(pres.ShapeType.roundRect, { x: W - 3.55, y: 0.3, w: 3.05, h: 1.0, fill: { color: 'FFFFFF' }, line: { color: T.ac(K.gold), width: 1.5 }, rectRadius: 0.12 });
        s.addImage({ data: instLogo, x: W - 3.47, y: 0.36, w: 0.88, h: 0.88 });
        s.addText([{ text: 'ISCAE', options: { fontSize: 26, bold: true, color: '0F172A', breakLine: true } }, { text: 'Banque et Assurance', options: { fontSize: 12, bold: true, color: '16803A' } }], { x: W - 2.5, y: 0.36, w: 1.95, h: 0.88, fontFace: FONT, margin: 0, valign: 'middle', isTextBox: true });
        s._g = null;
      }
      s.addText('SOUTENANCE — ÉTUDE DE FAISABILITÉ', { x: 3.5, y: 0.8, w: 6.1, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: T.kicker, charSpacing: 3, margin: 0, isTextBox: true, objectName: 'FX2~float' });
      s.addText('Financement PAYG de l’énergie solaire en Mauritanie', { x: 3.5, y: 1.5, w: 9.3, h: 1.5, fontFace: FONT, fontSize: 36, bold: true, color: T.head, margin: 0, valign: 'top', isTextBox: true, fit: 'shrink', objectName: 'FX3~float' });
      s.addShape(pres.ShapeType.rect, { x: 3.5, y: 3.05, w: 2.2, h: 0.05, fill: { color: T.ringA }, line: { color: T.ringA, width: 0 }, objectName: 'FX4~wipe' });
      s.addText('Scoring de crédit · Micro-assurance · Paiement mobile · Verrouillage à distance (IoT)', { x: 3.5, y: 3.3, w: 9.3, h: 0.5, fontFace: FONT, fontSize: 16, color: T.sub, margin: 0, isTextBox: true, objectName: 'FX5~float' });
      s.addText('Solar PAYG Mauritanie 2027', { x: 3.5, y: 4.1, w: 9.3, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: T.head, margin: 0, isTextBox: true, objectName: 'FX6~float' });
      const team = (a.team && a.team.length ? a.team : []).join('  ·  ');
      if (team) s.addText(team, { x: 3.5, y: 4.7, w: 9.3, h: 0.5, fontFace: FONT, fontSize: 18, color: T.gold, margin: 0, isTextBox: true, objectName: 'FX7~float' });
      s.addText('Département Management, Economie et Droit', { x: 0.7, y: 6.15, w: 8, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: T.head, margin: 0, isTextBox: true, objectName: 'FX8~float' });
      s.addText('© 2027 Solar PAYG Mauritanie — MDA — Tous droits réservés  ·  Généré le ' + (a.date || ''), { x: 0.7, y: 6.65, w: 11.5, h: 0.3, fontFace: FONT, fontSize: 11, color: T.muted, margin: 0, isTextBox: true, objectName: 'FX9~fade' });
      s.addNotes('Présenter le projet en une phrase : une entreprise qui finance des kits solaires et se fait rembourser par petits paiements mobiles. Annoncer le fil de la soutenance : problème, enquête, marché, prototype, finance, faisabilité, conclusion.');
    }

    /* =========================== PLAN DE LA SOUTENANCE =========================== */
    {
      const s = slide('Plan de la soutenance', null, 'Annoncer les sept étapes du fil conducteur : chaque diapositive porte le numéro de l’étape à laquelle elle appartient.');
      const cols = [K.orangeDark, K.orangeDark, K.blue, K.green, K.blueDark, K.greenDark, K.orange];
      const sub = ['Contexte et problématique', 'Preuve du besoin', 'Estimation de la demande', 'Démonstration de la solution', 'Coûts et revenus', 'Rentabilité et risques', 'Décision et prochaines étapes'];
      D.STORY.forEach((st, i) => {
        const row = i < 4 ? 0 : 1, col = i < 4 ? i : i - 4, n = row === 0 ? 4 : 3, w = row === 0 ? 2.95 : 3.95, gap = row === 0 ? 0.17 : 0.24;
        const x = 0.5 + col * (w + gap), y = 1.75 + row * 2.4;
        card(s, x, y, w, 2.15, (i + 1) + '. ' + (st[0] + ' ' + st[1]).trim(), st[2] ? st[2].charAt(0).toUpperCase() + st[2].slice(1) + '.' : sub[i] + '.', cols[i], { hs: row === 0 ? 14 : 16, bs: 14 });
      });
      txt(s, 'Chaque étape s’appuie sur la précédente : le besoin (enquête) justifie le marché, le marché justifie le prototype, le prototype fonde les hypothèses financières, et celles-ci conduisent à la décision.', { x: 0.5, y: 6.5, w: 12.3, h: 0.5, fontSize: 12, italic: true, color: T.muted });
    }

    /* =========================== 2. CONTEXTE =========================== */
    {
      const s = slide('Contexte', 1, 'Insister sur le contraste : fort besoin d’énergie, fort ensoleillement, paiement mobile déjà répandu, mais peu de financement adapté.');
      card(s, 0.5, 1.7, 3.9, 2.0, 'Un besoin d’énergie non satisfait', 'Beaucoup de ménages, commerces et exploitations sont hors réseau ou subissent des coupures : pétrole, bougies, piles, groupes électrogènes.', K.orangeDark);
      card(s, 4.72, 1.7, 3.9, 2.0, 'Un atout naturel', 'Un ensoleillement parmi les plus élevés au monde : l’énergie solaire est la solution évidente.', K.orange);
      card(s, 8.94, 1.7, 3.9, 2.0, 'Paiement mobile en essor', 'Bankily, Masrivi, Sedad, Click : des millions de transactions qui permettent de payer en petites sommes.', K.blue);
      txt(s, 'Le modèle PAYG (Pay-As-You-Go), déjà éprouvé en Afrique, transforme un achat comptant hors de portée en une série de petits paiements adaptés aux revenus irréguliers.', { x: 0.5, y: 4.15, w: 12.3, h: 0.9, fontSize: 18, bold: true, color: T.head });
      bullets(s, ['Cible : ménages et petites entreprises sans accès fiable au réseau électrique', 'Offre : kit solaire installé, payé par échéances depuis un portefeuille mobile', 'Sécurité : verrouillage à distance en cas d’impayé, micro-assurance de l’équipement'], { x: 0.5, y: 5.05, w: 12.3, h: 1.7, fontSize: 16 });
    }

    /* =========================== 3. PROBLÉMATIQUE =========================== */
    {
      const s = slide('Problématique', 1, 'Lire la question centrale, puis annoncer que le reste de la présentation y répond point par point.');
      s.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 1.65, w: 12.33, h: 1.55, fill: { color: K.greenDark }, line: { color: T.ac(K.green), width: 1 }, rectRadius: 0.1 });
      s.addText('Dans quelle mesure une entreprise de financement PAYG de systèmes solaires, appuyée sur le scoring alternatif, la micro-assurance et le paiement mobile, est-elle faisable et rentable en Mauritanie ?', { x: 0.8, y: 1.7, w: 11.7, h: 1.45, fontFace: FONT, fontSize: 22, bold: true, color: K.white, margin: 0, valign: 'middle', isTextBox: true, fit: 'shrink' });
      txt(s, 'Cinq sous-questions, cinq réponses dans cette soutenance', { x: 0.5, y: 3.45, w: 12, h: 0.4, fontSize: 16, bold: true, color: T.head });
      const qs = [['Le besoin existe-t-il ?', 'Enquête', K.orangeDark], ['Quels prix, quelle demande ?', 'Étude de marché', K.blue], ['La solution est-elle réalisable ?', 'Prototype', K.green], ['Le modèle est-il rentable ?', 'Étude financière', K.blueDark], ['Quels risques ?', 'Faisabilité', K.red]];
      qs.forEach((q, i) => { const x = 0.5 + i * 2.5; card(s, x, 3.95, 2.35, 2.4, q[1], q[0], q[2], { hs: 15, bs: 14 }); });
    }

    /* =========================== 4. SOLUTION PROPOSÉE =========================== */
    {
      const s = slide('Solution proposée', 4, 'Expliquer chaque service en une phrase : financer, installer, encaisser par mobile, sécuriser par IoT et assurance.');
      const sv = [['Kit solaire à crédit', 'Acompte puis échéances : le client accède à l’énergie sans capital important', K.orangeDark], ['Installation et SAV', 'Pose par une équipe formée, maintenance et assistance', K.green], ['Paiement mobile', 'Bankily, Masrivi, Sedad, Click : échéances simples et sans déplacement', K.blue], ['Verrouillage IoT', 'Module GSM : verrouillage en cas d’impayé, déverrouillage immédiat après paiement', K.blueDark], ['Micro-assurance', 'Casse, vol, panne : l’équipement et l’investissement sont protégés', K.orange], ['Scoring alternatif', 'Mauri-Score : acompte et plafond adaptés au profil, sans historique bancaire', K.greenDark]];
      sv.forEach((v, i) => card(s, 0.5 + (i % 3) * 4.18, 1.7 + Math.floor(i / 3) * 2.3, 3.95, 2.1, v[0], v[1], v[2], { bs: 14 }));
      txt(s, 'Trois kits : ' + mru(g.kit1_cash) + ' (éclairage) · ' + mru(g.kit2_cash) + ' (confort familial) · ' + mru(g.kit3_cash) + ' (productif) — prix comptants de référence, hypothèses à confirmer par devis.', { x: 0.5, y: 6.35, w: 12.3, h: 0.5, fontSize: 13, italic: true, color: T.muted });
    }

    /* =========================== 5. BUSINESS MODEL =========================== */
    {
      const s = slide('Business Model', 4, 'Présenter la logique : on achète un kit, on le finance, on se fait rembourser par petites échéances, et le risque est géré par le scoring, l’IoT et l’assurance.');
      const bm = [['Clients', 'Ménages et petites entreprises hors réseau ou mal desservis', K.orangeDark], ['Proposition de valeur', 'Énergie solaire sans capital initial important ; prix transparent ; SAV inclus', K.green], ['Canaux', 'Agents de terrain, partenaires, opérateurs, réseaux sociaux', K.blue], ['Revenus', 'Acompte + échéances (prix PAYG = coût + financement + assurance + marge)', K.greenDark], ['Coûts', 'Achat des kits, installation, IoT, financement, salaires, marketing, SAV', K.red], ['Partenaires', 'Paiement mobile, opérateurs télécoms, banques / IMF, assureurs, fournisseurs', K.blueDark]];
      bm.forEach((v, i) => card(s, 0.5 + (i % 3) * 4.18, 1.7 + Math.floor(i / 3) * 2.3, 3.95, 2.1, v[0], v[1], v[2], { bs: 14 }));
      txt(s, 'Prix PAYG = coût du kit + installation + IoT + financement + assurance + coûts opérationnels + provision pour risque + marge', { x: 0.5, y: 6.35, w: 12.3, h: 0.5, fontSize: 14, bold: true, color: T.head });
    }

    /* =========================== 6. FONCTIONNEMENT DU PAYG =========================== */
    {
      const s = slide('Fonctionnement du PAYG', 4, 'Montrer que le prix n’est pas arbitraire : il est construit composante par composante. Donner l’exemple chiffré du scénario Réaliste.');
      const pi = cen.priceInsured, lines = pi.lines.filter((l) => l.value > 0);
      chartBar(s, lines.map((l) => l.fr), [{ name: 'MRU', color: '#16803A', values: lines.map((l) => Math.round(l.value)) }], { x: 0.4, y: 1.55, w: 7.6, h: 5.2 }, { horizontal: true, values: true, title: 'Composition du prix PAYG (MRU) — kit à ' + mru(sc.central.cashPrice) + ' comptant', extra: { catAxisOrientation: 'maxMin' } });
      card(s, 8.3, 1.7, 4.55, 1.5, 'Acompte', pctRaw(g.deposit_pct, 0) + ' du prix, soit ' + mru(pi.deposit), K.orange, { bs: 16 });
      card(s, 8.3, 3.35, 4.55, 1.5, 'Échéances', pi.periods + (g.freq === 'daily' ? ' paiements quotidiens' : g.freq === 'weekly' ? ' paiements hebdomadaires' : ' paiements mensuels') + ' d’environ ' + mru(pi.installment), K.blue, { bs: 16 });
      card(s, 8.3, 5.0, 4.55, 1.5, 'Prix PAYG total', mru(pi.total) + ' · équivalent mensuel ' + mru(pi.monthlyEquivalent), K.greenDark, { bs: 16 });
    }

    /* =========================== 7. PROTOTYPE =========================== */
    {
      const s = slide('Prototype', 4, 'Présenter le prototype : application web bilingue qui rend le modèle démontrable. Les modules paiement et IoT sont des simulations.');
      shotImg(s, 'scoring', 0.5, 1.55, 6.0, 4.3); shotImg(s, 'pricing', 6.83, 1.55, 6.0, 4.3);
      txt(s, 'Module 1 — Scoring de crédit (Mauri-Score)', { x: 0.5, y: 5.95, w: 6, h: 0.3, fontSize: 13, bold: true, color: T.head, align: 'center' });
      txt(s, 'Module 2 — Tarification transparente & micro-assurance', { x: 6.83, y: 5.95, w: 6, h: 0.3, fontSize: 13, bold: true, color: T.head, align: 'center' });
      txt(s, 'Sept modules : scoring · tarification · IoT & paiement mobile · modèle financier · enquête · hypothèses & export · équipe', { x: 0.5, y: 6.35, w: 12.3, h: 0.5, fontSize: 13, italic: true, color: T.muted, align: 'center' });
    }

    /* =========================== 8. DÉMONSTRATION DU PARCOURS CLIENT =========================== */
    {
      const s = slide('Démonstration du parcours client', 4, 'Dérouler la démonstration en direct : 1) scoring, 2) offre, 3) acompte, 4) paiement mobile, 5) verrouillage / déverrouillage.');
      const st = [['1', 'Évaluation', 'Mauri-Score : acompte et plafond'], ['2', 'Offre', 'Kit, durée, prix transparent'], ['3', 'Installation', 'Acompte, pose, activation IoT'], ['4', 'Paiements', 'Échéances par portefeuille mobile'], ['5', 'Suivi', 'Rappels, verrouillage, déverrouillage'], ['6', 'Propriété', 'Dernière échéance : le kit est au client']];
      st.forEach((x, i) => {
        const px = 0.5 + i * 2.07;
        s.addShape(pres.ShapeType.homePlate, { x: px, y: 1.6, w: 2.0, h: 0.85, fill: { color: [K.orangeDark, K.orange, K.green, K.blue, K.blueDark, K.greenDark][i] }, line: { color: T.bg, width: 1 } });
        s.addText(x[0] + '. ' + x[1], { x: px + 0.1, y: 1.6, w: 1.7, h: 0.85, fontFace: FONT, fontSize: 14, bold: true, color: K.white, margin: 0, valign: 'middle', isTextBox: true });
        s.addText(x[2], { x: px, y: 2.5, w: 2.0, h: 0.7, fontFace: FONT, fontSize: 11, color: T.text, margin: 0, valign: 'top', isTextBox: true });
      });
      shotImg(s, 'iot_locked', 0.9, 3.3, 5.4, 3.2); shotImg(s, 'iot_unlocked', 7.0, 3.3, 5.4, 3.2);
      txt(s, 'Équipement verrouillé (échéance échue)', { x: 0.9, y: 6.55, w: 5.4, h: 0.3, fontSize: 12, bold: true, color: T.ac(K.red), align: 'center' });
      txt(s, 'Déverrouillé après paiement mobile (simulation)', { x: 7.0, y: 6.55, w: 5.4, h: 0.3, fontSize: 12, bold: true, color: T.ac(K.green), align: 'center' });
    }

    /* =========================== 9. MÉTHODOLOGIE DE L'ENQUÊTE =========================== */
    {
      const s = slide('Méthodologie de l’enquête', 2, 'Rappeler que l’enquête fournit la preuve du besoin, et que l’échantillon n’est pas probabiliste : les résultats décrivent les répondants.');
      card(s, 0.5, 1.7, 6.0, 2.45, 'Plateforme Les Enquêtes', 'Questionnaire bilingue (français / arabe) à questions fermées ; réponses stockées dans une base sécurisée et lues en direct par le prototype.', K.blue, { bs: 14 });
      card(s, 6.83, 1.7, 6.0, 2.45, 'Indicateurs calculés', 'Proportions avec intervalle de confiance de Wilson à 95 % · médiane et moyenne par interpolation sur tranches · modes (durée, fréquence).', K.green, { bs: 14 });
      kpi(s, 0.5, 4.5, 3.9, 1.6, has ? num(a.n) : '—', 'répondants à ce jour', K.orangeDark);
      kpi(s, 4.72, 4.5, 3.9, 1.6, has ? String(a.quality) : '—', 'qualité de l’échantillon (30 / 100)', K.blue);
      card(s, 8.94, 4.5, 3.9, 1.6, 'Limite', 'Échantillon non probabiliste : résultats indicatifs, non généralisables.', K.red, { bs: 13 });
    }

    /* =========================== 10. PROFIL DES RÉPONDANTS =========================== */
    {
      const s = slide('Profil des répondants', 2, 'Décrire qui a répondu : profil, activité, zone géographique. Relier à la population cible.');
      if (!has) noData(s, 0.5, 1.7, 12.3, 2.4);
      else {
        const keys = ['profile', 'activity', 'wilaya'].filter((k) => a.dist(k));
        const w = keys.length ? 12.3 / keys.length : 12.3;
        keys.forEach((k, i) => distChart(s, k, { x: 0.5 + i * w, y: 1.6, w: w - 0.1, h: 4.4 }, { profile: 'Profil principal', activity: 'Activité principale', wilaya: 'Wilaya' }[k]));
        const m = []; const mode = (k) => { const d = a.dist(k); if (!d) return null; const t = d.items.reduce((b, i) => (i.count > (b ? b.count : -1) ? i : b), null); return t && t.count ? L(t.label_fr) + ' (' + num(t.pct, 0) + ' %)' : null; };
        if (mode('profile')) m.push('Profil dominant : ' + mode('profile')); if (mode('wilaya')) m.push('Wilaya dominante : ' + mode('wilaya')); if (mode('household')) m.push('Taille de foyer la plus fréquente : ' + mode('household'));
        if (m.length) bullets(s, m, { x: 0.5, y: 6.05, w: 12.3, h: 0.9, fontSize: 13 });
      }
    }

    /* =========================== 11. RÉSULTATS CLÉS DE L'ENQUÊTE =========================== */
    {
      const s = slide('Résultats clés de l’enquête', 2, 'Donner les trois chiffres à retenir : intérêt, prix mensuel acceptable, acceptation du verrouillage. Préciser les intervalles de confiance.');
      if (!has) noData(s, 0.5, 1.7, 12.3, 2.4);
      else {
        kpi(s, 0.5, 1.65, 2.9, 1.5, pct(ind.payg_interest_rate, 0), 'prêts à acquérir un kit en PAYG (oui + peut-être)', K.green);
        kpi(s, 3.6, 1.65, 2.9, 1.5, pct(ind.purchase_intention_rate, 0), 'intention ferme (« oui »)', K.blue);
        kpi(s, 6.7, 1.65, 2.9, 1.5, ind.median_monthly_payment != null ? mru(ind.median_monthly_payment) : '—', 'montant mensuel acceptable (médiane)', K.orangeDark);
        kpi(s, 9.8, 1.65, 3.0, 1.5, ind.insurance_interest_rate != null ? pct(ind.insurance_interest_rate, 0) : '—', 'intéressés par la micro-assurance', K.blueDark);
        const ok = distChart(s, 'interest', { x: 0.5, y: 3.35, w: 6.1, h: 3.45 }, 'Intérêt pour un kit PAYG');
        const ok2 = distChart(s, 'monthlyPrice', { x: 6.75, y: 3.35, w: 6.1, h: 3.45 }, 'Montant mensuel maximum');
        if (!ok && !ok2) txt(s, 'Distributions détaillées : voir annexe B du rapport.', { x: 0.5, y: 3.5, w: 12, h: 0.5 });
      }
    }

    /* =========================== 12. ANALYSE DE LA DEMANDE =========================== */
    {
      const s = slide('Analyse de la demande', 3, 'Expliquer la formule : intention ferme + (peut-être × conversion), appliquée au marché adressable. Comparer au volume du scénario Réaliste.');
      if (a.demand) {
        const rows = [[th('Élément'), th('Valeur'), th('Source')], ['Intention d’achat ferme', pct(ind.purchase_intention_rate, 1), 'Enquête'], ['Réponses « peut-être »', pct(ind.maybe_rate, 1), 'Enquête'], ['Conversion des « peut-être »', pctRaw(g.maybe_conv, 0), 'Hypothèse'], ['Taux de demande plausible', pct(a.demand.rate, 1), 'Calcul'], ['Marché adressable', num(g.addressable), 'Hypothèse'], [td('Demande plausible', { bold: true }), td(num(a.demand.customers) + ' clients', { bold: true }), td('Calcul', { bold: true })]];
        s.addTable(rows.map((r, i) => (i === 0 ? r : r.map((c, j) => (typeof c === 'string' ? td(c, { align: j === 1 ? 'right' : 'left' }) : c)))), tableOpts({ x: 0.5, y: 1.7, w: 6.4, colW: [3.0, 1.9, 1.5], fontSize: 13, rowH: 0.45 }));
        chartBar(s, SC.map((x) => x.short), [{ name: 'Nouveaux clients, année 1', color: '#1D6FE0', values: SC.map((x) => res[x.k].years[0].clients) }, { name: 'Demande plausible', color: '#F59E0B', values: SC.map(() => Math.round(a.demand.customers)) }], { x: 7.1, y: 1.6, w: 5.8, h: 4.0 }, { values: true, title: 'Volume du modèle vs demande estimée' });
        txt(s, 'Le volume du scénario Réaliste (' + num(cen.years[0].clients) + ' clients en année 1) représente ' + pct(cen.years[0].clients / a.demand.customers, 1) + ' de la demande plausible.', { x: 0.5, y: 5.95, w: 12.3, h: 0.8, fontSize: 16, bold: true, color: T.head });
      } else {
        noData(s, 0.5, 1.7, 7.0, 2.6);
        kpi(s, 8.0, 1.7, 4.8, 1.6, num(g.addressable), 'marché adressable retenu (hypothèse)', K.blue);
        kpi(s, 8.0, 3.5, 4.8, 1.6, pct(cen.years[0].clients / g.addressable, 1), 'pénétration supposée en année 1 (Réaliste)', K.orangeDark);
        txt(s, 'La demande plausible sera calculée dès que l’enquête fournira le taux d’intention ferme et la part de « peut-être ».', { x: 0.5, y: 5.6, w: 12.3, h: 0.8, fontSize: 15, color: T.text });
      }
    }

    /* =========================== 13. ÉTUDE DE LA CONCURRENCE =========================== */
    {
      const s = slide('Étude de la concurrence', 3, 'Analyse qualitative : la présence et les prix des acteurs régionaux doivent être vérifiés sur le terrain avant décision.');
      const rows = [[th('Alternative'), th('Faiblesse principale'), th('Notre réponse')],
        ['Pétrole, bougies, piles', 'Dépense récurrente élevée, danger, faible qualité', 'Éclairage solaire à coût mensuel comparable'],
        ['Groupes électrogènes', 'Carburant coûteux, bruit, pannes, pollution', 'Kits familiaux et productifs sans carburant'],
        ['Kits solaires comptant', 'Prix initial hors de portée, pas de SAV', 'Paiement échelonné + installation + SAV'],
        ['Acteurs PAYG régionaux', 'Présence locale à vérifier, peu d’adaptation au contexte', 'Proximité, portefeuilles locaux, scoring adapté'],
        ['Programmes publics / ONG', 'Capacité limitée, pas de modèle récurrent', 'Complémentarité, subventions pour réduire le prix']];
      s.addTable(rows.map((r, i) => (i === 0 ? r : r.map((c, j) => td(c, { bold: j === 0 })))), tableOpts({ x: 0.5, y: 1.65, w: 12.33, colW: [2.9, 4.8, 4.63], fontSize: 13, rowH: 0.62 }));
      txt(s, 'Avantage recherché : la combinaison scoring + paiement mobile + IoT + assurance, adaptée au marché mauritanien.', { x: 0.5, y: 6.0, w: 12.3, h: 0.7, fontSize: 16, bold: true, color: T.head });
    }

    /* =========================== 14. MODÈLE ÉCONOMIQUE =========================== */
    {
      const s = slide('Modèle économique', 5, 'Montrer l’économie d’un client : ce qu’il paie, ce qu’il coûte, ce qui reste. Puis les trois scénarios de volume.');
      const u = cen.unit, pi = cen.priceInsured;
      const rows = [[th('Économie unitaire — scénario Réaliste'), th('MRU')], ['Prix PAYG moyen par client', num(u.price, 0)], ['dont acompte moyen', num(u.deposit, 0)], ['Coût d’acquisition (kit + installation + IoT)', num(u.acqCost, 0)], ['Assurance (par mois)', num(u.insMonthly, 0)], ['Suivi client (par mois)', num(u.servMonthly, 0)], [td('Contribution par client (cycle de vie)', { bold: true }), td(num(cen.contributionPerClient, 0), { bold: true, align: 'right' })]];
      s.addTable(rows.map((r, i) => (i === 0 ? r : r.map((c, j) => (typeof c === 'string' ? td(c, { align: j === 1 ? 'right' : 'left' }) : c)))), tableOpts({ x: 0.5, y: 1.65, w: 6.6, colW: [4.9, 1.7], fontSize: 13, rowH: 0.5 }));
      const hy = [[th('Hypothèse'), th('Pessimiste'), th('Réaliste'), th('Optimiste')], ['Clients, année 1'].concat(SC.map((x) => num(sc[x.k].clients1))), ['Croissance annuelle'].concat(SC.map((x) => pctRaw(sc[x.k].growth, 0))), ['Taux d’impayés'].concat(SC.map((x) => pctRaw(sc[x.k].defaultRate, 1))), ['Durée (mois)'].concat(SC.map((x) => String(sc[x.k].tenure))), ['Coûts opérationnels'].concat(SC.map((x) => '× ' + num(sc[x.k].opexMult, 2)))];
      s.addTable(hy.map((r, i) => (i === 0 ? r : r.map((c, j) => td(c, { align: j ? 'right' : 'left' })))), tableOpts({ x: 7.4, y: 1.65, w: 5.45, colW: [2.0, 1.15, 1.15, 1.15], fontSize: 12, rowH: 0.5 }));
      txt(s, 'Tous les paramètres sont classés (enquête / estimation / hypothèse / simulation) dans le registre des hypothèses du prototype.', { x: 0.5, y: 5.6, w: 12.3, h: 0.8, fontSize: 14, italic: true, color: T.muted });
    }

    /* =========================== 15. INVESTISSEMENT INITIAL =========================== */
    {
      const s = slide('Investissement initial', 5, 'Détailler les postes principaux de l’investissement ; rappeler que le montant est une hypothèse à confirmer par devis.');
      const items = E.CAPEX_ITEMS.map((it) => ({ l: it[1], v: g[it[0]] || 0 })).filter((x) => x.v > 0);
      chartBar(s, items.map((x) => x.l), [{ name: 'MRU', color: '#16803A', values: items.map((x) => Math.round(x.v)) }], { x: 0.4, y: 1.55, w: 8.2, h: 5.2 }, { horizontal: true, values: true, title: 'Investissement initial par poste (MRU)', extra: { catAxisOrientation: 'maxMin' } });
      kpi(s, 8.9, 1.7, 3.9, 1.6, mru(cen.capex), 'investissement initial total', K.greenDark);
      kpi(s, 8.9, 3.5, 3.9, 1.6, mru(cen.fundingNeed), 'besoin de financement maximal (Réaliste)', K.orangeDark);
      card(s, 8.9, 5.3, 3.9, 1.35, 'Subvention', 'Optimiste : ' + mru(sc.dynamique.grant) + ' (non acquise).', K.blue, { bs: 13 });
    }

    /* =========================== 16. COÛTS ET REVENUS PRÉVISIONNELS =========================== */
    {
      const s = slide('Coûts et revenus prévisionnels', 5, 'Montrer l’évolution sur 5 ans : encaissements, coûts, résultat net. Comparer ensuite les trois scénarios.');
      const yrs = ['Année 1', 'Année 2', 'Année 3', 'Année 4', 'Année 5'];
      chartBar(s, yrs, [{ name: 'Encaissements (CA)', color: '#1D6FE0', values: cen.years.map((y) => Math.round(y.revenue)) }, { name: 'Coûts totaux', color: '#F59E0B', values: cen.years.map((y) => Math.round(y.totalCosts)) }, { name: 'Résultat net', color: '#16803A', values: cen.years.map((y) => Math.round(y.netResult)) }], { x: 0.4, y: 1.55, w: 7.5, h: 5.2 }, { title: 'Scénario Réaliste (MRU)', extra: { valAxisLabelFormatCode: '#,##0' } });
      const rows = [[th('Cumul 5 ans'), th('Pessimiste'), th('Réaliste'), th('Optimiste')], ['Clients'].concat(SC.map((x) => num(res[x.k].totals.clients))), ['CA (MRU)'].concat(SC.map((x) => num(res[x.k].totals.revenue))), ['Résultat net (MRU)'].concat(SC.map((x) => num(res[x.k].totals.netResult)))];
      s.addTable(rows.map((r, i) => (i === 0 ? r : r.map((c, j) => td(c, { align: j ? 'right' : 'left', bold: j === 0 })))), tableOpts({ x: 8.1, y: 1.7, w: 4.75, colW: [1.45, 1.1, 1.1, 1.1], fontSize: 10, rowH: 0.5 }));
      txt(s, 'Le « chiffre d’affaires » désigne les encaissements (acomptes et échéances, nets des impayés), en base de trésorerie.', { x: 8.1, y: 4.1, w: 4.75, h: 1.2, fontSize: 12, italic: true, color: T.muted });
    }

    /* =========================== 17. RENTABILITÉ / SEUIL =========================== */
    {
      const s = slide('Rentabilité et seuil de rentabilité', 6, 'Donner VAN, TRI, délai de récupération et seuil de rentabilité pour chaque scénario. Montrer la courbe de trésorerie cumulée.');
      kpi(s, 0.5, 1.65, 2.95, 1.45, mru(cen.npv), 'VAN — Réaliste', cen.npv >= 0 ? K.green : K.red);
      kpi(s, 3.6, 1.65, 2.95, 1.45, cen.irr == null ? 'n/d' : pct(cen.irr, 1), 'TRI — Réaliste', K.blue);
      kpi(s, 6.7, 1.65, 2.95, 1.45, cen.paybackMonths == null ? '> 60 mois' : cen.paybackMonths + ' mois', 'récupération de l’investissement', K.orangeDark);
      kpi(s, 9.8, 1.65, 3.0, 1.45, cen.breakEvenClients == null ? 'impossible' : num(cen.breakEvenClients), 'seuil de rentabilité (clients / an)', K.blueDark);
      // Courbe de trésorerie cumulée : dessinée en image (le graphique en lignes natif de PptxGenJS écrit trois axes et n'est pas lisible par tous les logiciels)
      try { const cs = R.chartSpecs(a).cash; const png = await D.render(T.svg(cs)); s.addImage({ data: 'image/png;base64,' + b64(png.bytes), x: 0.4, y: 3.3, w: 7.5, h: 7.5 * cs.h / cs.w }); } catch (e) { console.warn('[pptx] courbe', e); }
      const rows = [[th(''), th('Pess.'), th('Réal.'), th('Opt.')], ['VAN (MRU)'].concat(SC.map((x) => num(res[x.k].npv))), ['TRI'].concat(SC.map((x) => (res[x.k].irr == null ? 'n/d' : pct(res[x.k].irr, 0)))), ['Récupération'].concat(SC.map((x) => (res[x.k].paybackMonths == null ? '> 60 m' : res[x.k].paybackMonths + ' m'))), ['Financement max.'].concat(SC.map((x) => num(res[x.k].fundingNeed)))];
      s.addTable(rows.map((r, i) => (i === 0 ? r : r.map((c, j) => td(c, { align: j ? 'right' : 'left', bold: j === 0 })))), tableOpts({ x: 8.2, y: 3.4, w: 4.65, colW: [1.4, 1.05, 1.1, 1.1], fontSize: 10, rowH: 0.5 }));
    }

    /* =========================== 18. RISQUES ET SOLUTIONS =========================== */
    {
      const s = slide('Risques et solutions', 6, 'Présenter les risques par famille et la mesure de mitigation associée ; appuyer sur la sensibilité : la VAN dépend surtout du volume et des impayés.');
      const rows = [[th('Risque'), th('Niveau'), th('Mesure de mitigation')],
        ['Impayés supérieurs aux prévisions', 'Élevé', 'Verrouillage IoT, acompte selon le score, provision, calibrage sur pilote'],
        ['Volumes de ventes insuffisants', 'Élevé', 'Partenariats, agents commissionnés, démarrage par zone'],
        ['Financement non couvert', 'Élevé', 'Lignes de refinancement, subventions, investissement phasé'],
        ['Hausse des coûts / change', 'Moyen', 'Contrats fournisseurs, ajustement du prix'],
        ['Réseau, pannes, réglementation', 'Moyen', 'Code OTP hors ligne, garantie + assurance, veille juridique']];
      s.addTable(rows.map((r, i) => (i === 0 ? r : r.map((c, j) => td(c, { bold: j === 0, color: j === 1 ? (c === 'Élevé' ? T.ac(K.red) : T.ac(K.orangeDark)) : T.text, align: j === 1 ? 'center' : 'left' })))), tableOpts({ x: 0.5, y: 1.65, w: 7.3, colW: [2.6, 0.9, 3.8], fontSize: 11, rowH: 0.62 }));
      const sv = a.sens;
      chartBar(s, sv.map((x) => x.label), [{ name: 'VAN (MRU)', color: '#16803A', values: sv.map((x) => Math.round(x.npv)) }], { x: 8.0, y: 1.55, w: 4.9, h: 5.2 }, { horizontal: true, values: true, fmt: '#,##0', title: 'Sensibilité de la VAN (Réaliste)', extra: { catAxisOrientation: 'maxMin', catAxisLabelFontSize: 9, dataLabelFontSize: 9 } });
    }

    /* =========================== 19. IMPACT ATTENDU EN MAURITANIE =========================== */
    {
      const s = slide('Impact attendu en Mauritanie', 7, 'Rester factuel : les nombres de foyers viennent du modèle (scénarios), les autres impacts sont des effets attendus à mesurer après un pilote.');
      kpi(s, 0.5, 1.65, 3.9, 1.6, num(pru.totals.clients) + ' à ' + num(dyn.totals.clients), 'ménages / entreprises équipés en 5 ans (scénarios Pessimiste à Optimiste)', K.green);
      kpi(s, 4.72, 1.65, 3.9, 1.6, num(cen.totals.clients), 'clients équipés en 5 ans (Réaliste)', K.blue);
      kpi(s, 8.94, 1.65, 3.9, 1.6, mru(cen.totals.revenue), 'encaissements cumulés (Réaliste)', K.orangeDark);
      card(s, 0.5, 3.65, 3.95, 2.9, 'Social', 'Accès à l’éclairage, à la recharge, à la réfrigération ; sécurité et études facilitées ; inclusion financière des ménages sans historique bancaire.', K.orangeDark, { bs: 13 });
      card(s, 4.69, 3.65, 3.95, 2.9, 'Économique', 'Baisse des dépenses d’énergie, activités productives (froid, commerce), emplois locaux : installateurs, agents, techniciens.', K.blue, { bs: 13 });
      card(s, 8.88, 3.65, 3.95, 2.9, 'Environnemental', 'Substitution du pétrole, des piles et des groupes électrogènes par une énergie renouvelable ; collecte et recyclage des batteries à prévoir.', K.green, { bs: 13 });
    }

    /* =========================== 20. CONCLUSION =========================== */
    {
      const s = slide('Conclusion', 7, 'Conclure par la décision, les conditions de réussite et les prochaines étapes. Terminer en reliant les 7 étapes du fil conducteur.');
      const v = a.verdict.level;
      const vt = v === 'favorable' ? 'Faisabilité financière favorable sous les hypothèses retenues : VAN positive et investissement récupéré en ' + cen.paybackMonths + ' mois (Réaliste).' : v === 'conditionnelle' ? 'Faisabilité conditionnelle : le scénario Réaliste n’atteint pas simultanément une VAN positive et la récupération dans les 60 mois.' : 'Sous les hypothèses actuelles, le projet n’est pas rentable dans l’horizon de 60 mois ; des leviers existent (prix, coûts, impayés, subvention).';
      s.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 1.65, w: 12.33, h: 1.2, fill: { color: v === 'favorable' ? K.greenDark : v === 'conditionnelle' ? K.orangeDark : K.red }, line: { color: K.white, width: 0 }, rectRadius: 0.1 });
      s.addText(vt, { x: 0.8, y: 1.68, w: 11.7, h: 1.14, fontFace: FONT, fontSize: 17, bold: true, color: K.white, margin: 0, valign: 'middle', isTextBox: true, fit: 'shrink' });
      const pts = [(has ? 'Besoin : ' + pct(ind.payg_interest_rate, 0) + ' des ' + nTxt + ' sont intéressés par un kit PAYG' : 'Besoin : à confirmer dès que l’enquête aura des réponses'), 'Solution : prototype démontrant le parcours complet (paiement et IoT simulés)', 'Rentabilité : VAN ' + mru(cen.npv) + (cen.irr != null ? ', TRI ' + pct(cen.irr, 1) : '') + ' (Réaliste)'];
      bullets(s, pts, { x: 0.5, y: 3.05, w: 6.2, h: 2.2, fontSize: 14 });
      txt(s, 'Recommandations', { x: 7.0, y: 3.0, w: 5.8, h: 0.35, fontSize: 15, bold: true, color: T.head });
      bullets(s, ['Remplacer les hypothèses par des devis réels', 'Élargir l’enquête (100 répondants minimum)', 'Mener un projet pilote (scoring, impayés réels)', 'Sécuriser refinancement et subventions', 'Valider le cadre juridique'], { x: 7.0, y: 3.4, w: 5.8, h: 2.3, fontSize: 13 });
      try { const st = D.story(-1); const png = await D.render(T.svg(st)); s.addImage({ data: 'image/png;base64,' + b64(png.bytes), x: 1.9, y: 5.15, w: 9.5, h: 9.5 * st.h / st.w }); } catch (e) { /* facultatif */ }
    }


    /* =========================== 21. MERCI / QUESTIONS =========================== */
    {
      const s = wrap(pres.addSlide()); count++; TRANS[count - 1] = 'morph';
      s.background = { color: T.bgCover };
      hud(s, W / 2, 3.1, 1.15);
      if (logo) {
        s._g = 1;
        s.addShape(pres.ShapeType.ellipse, { x: W / 2 - 1.3, y: 1.1, w: 2.6, h: 2.6, fill: { color: T.ringA, transparency: 80 }, line: { color: T.ringA, width: 1, transparency: 50 }, objectName: '!!pulse' });
        s.addShape(pres.ShapeType.ellipse, { x: W / 2 - 1.2, y: 1.2, w: 2.4, h: 2.4, fill: { color: 'FFFFFF' }, line: { color: T.ac(K.gold), width: 3 }, objectName: '!!logo1' });
        s.addImage({ data: logoBig || logo, x: W / 2 - 1.14, y: 1.26, w: 2.28, h: 2.28, objectName: '!!logo2' });
        s._g = null;
      }
      if (instLogo) {
        s.addText([{ text: 'ISCAE', options: { fontSize: 18, bold: true, color: T.head } }, { text: '  ·  Banque et Assurance', options: { fontSize: 18, bold: true, color: T.ac(K.green) } }], { x: 1, y: 6.15, w: W - 2, h: 0.4, fontFace: FONT, align: 'center', margin: 0, isTextBox: true, objectName: 'FX7~float' });
        s.addShape(pres.ShapeType.ellipse, { x: 0.6, y: 0.5, w: 1.3, h: 1.3, fill: { color: 'FFFFFF' }, line: { color: T.ac(K.gold), width: 2 }, objectName: '!!inst1' });
        s.addImage({ data: instLogo, x: 0.67, y: 0.57, w: 1.16, h: 1.16, rounding: true, objectName: '!!inst2' });
      }
      s.addText('Merci de votre attention', { x: 1, y: 4.0, w: W - 2, h: 0.9, fontFace: FONT, fontSize: 40, bold: true, color: T.head, align: 'center', charSpacing: 2, margin: 0, isTextBox: true, objectName: 'FX2~float' });
      s.addShape(pres.ShapeType.rect, { x: W / 2 - 1.1, y: 4.98, w: 2.2, h: 0.05, fill: { color: T.ringA }, line: { color: T.ringA, width: 0 }, objectName: 'FX3~wipe' });
      s.addText('Questions et discussion', { x: 1, y: 5.2, w: W - 2, h: 0.5, fontFace: FONT, fontSize: 22, color: T.sub, align: 'center', margin: 0, isTextBox: true, objectName: 'FX4~float' });
      const team = (a.team && a.team.length ? a.team : []).join('  ·  ');
      if (team) s.addText(team, { x: 1, y: 5.7, w: W - 2, h: 0.4, fontFace: FONT, fontSize: 15, color: T.gold, align: 'center', margin: 0, isTextBox: true, objectName: 'FX5~float' });
      s.addText('Solar PAYG Mauritanie 2027  ·  Département Management, Economie et Droit', { x: 1, y: 6.7, w: W - 2, h: 0.3, fontFace: FONT, fontSize: 12, color: T.muted, align: 'center', margin: 0, isTextBox: true, objectName: 'FX6~fade' });
      s.addNotes('Remercier le jury et inviter aux questions. Garder le prototype ouvert pour une démonstration si demandé.');
    }

    const raw = await pres.write({ outputType: 'uint8array' });
    let bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    // Transitions + animations (module pptx-fx.js) ; en cas de problème, la présentation reste valide mais sans animation
    try { if (root.PaygPptxFx) bytes = await root.PaygPptxFx.apply(bytes, { transitions: TRANS }); } catch (e) { console.warn('[pptx] animations ignorées :', e); }
    return { bytes, count, light: isLight };
  }

  async function write(ctx, fileName) {
    const r = await build(ctx);
    const blob = new Blob([r.bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName || 'soutenance_etude_faisabilite_payg.pptx';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    return r.count;
  }

  root.PaygPptx = { write, build, CDN };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PaygPptx;
})(typeof window !== 'undefined' ? window : globalThis);
