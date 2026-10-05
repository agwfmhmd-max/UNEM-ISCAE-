/* pptx-fx.js — Transitions et animations PowerPoint, injectées après la génération du .pptx par PptxGenJS
 *  (PptxGenJS ne sait écrire ni transitions ni animations).
 *  - Transition « Morph » (PowerPoint 2019 / 365) avec repli automatique sur « Fondu » dans les versions plus anciennes ;
 *  - entrées échelonnées des éléments (fondu, flottement, balayage, zoom, glissement) ;
 *  - boucles continues : anneaux HUD qui tournent, logo qui flotte, halo qui pulse ;
 *  - lecture automatique à l'arrivée sur la diapositive (comme dans les présentations professionnelles).
 *  Les éléments à animer sont repérés par leur NOM (objectName) :
 *      FX<groupe>~<effet>   effet = fade | float | wipe | zoom | left | right   (même groupe = même instant d'entrée)
 *      !!hud1 … !!hud6      anneaux décoratifs (rotation en boucle, sens et vitesse propres à chaque anneau)
 *      !!logo               logo : flottement doux en boucle
 *      !!pulse              halo : pulsation en boucle
 *  Tout autre élément (pied de page, numéro…) reste fixe.
 *  Ne modifie aucune formule ni aucune autre fonction du site. */
(function (root) {
  'use strict';
  const D = root.PaygDocs || (typeof require !== 'undefined' ? require('./docs-common.js') : null);

  const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
  const NS_P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
  const NS_P159 = 'http://schemas.microsoft.com/office/powerpoint/2015/09/main';

  /* Rotation des anneaux : [sens (1 = horaire, -1 = antihoraire), durée d'un tour en ms] */
  const SPIN = { hud1: [1, 90000], hud2: [-1, 60000], hud3: [1, 140000], hud4: [-1, 75000], hud5: [1, 50000], hud6: [-1, 110000] };

  /* ---------- Transitions ---------- */
  function transitionXml(kind) {
    const mc = 'xmlns:mc="' + NS_MC + '"';
    if (kind === 'vortex' || kind === 'ripple' || kind === 'prism' || kind === 'glitter') {
      const inner = kind === 'vortex' ? '<p14:vortex dir="r"/>' : kind === 'ripple' ? '<p14:ripple/>' : kind === 'prism' ? '<p14:prism/>' : '<p14:glitter pattern="hexagon" dir="r"/>';
      return '<mc:AlternateContent ' + mc + '><mc:Choice xmlns:p14="' + NS_P14 + '" Requires="p14"><p:transition spd="slow" p14:dur="1600">' + inner + '</p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>';
    }
    if (kind === 'fade') return '<p:transition spd="slow"><p:fade/></p:transition>';
    // morph (par objet) : les objets de même nom (« !!… ») glissent d'une diapositive à l'autre
    return '<mc:AlternateContent ' + mc + ' xmlns:p159="' + NS_P159 + '"><mc:Choice Requires="p159"><p:transition spd="slow" xmlns:p14="' + NS_P14 + '" p14:dur="1400"><p159:morph option="byObject"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>';
  }

  /* ---------- Briques d'animation ---------- */
  function Builder() {
    let id = 3; // 1 = racine, 2 = séquence principale
    const nid = () => ++id;
    const tgt = (spid) => '<p:tgtEl><p:spTgt spid="' + spid + '"/></p:tgtEl>';
    const setVis = (spid) => '<p:set><p:cBhvr><p:cTn id="' + nid() + '" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>' + tgt(spid) + '<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>';
    const fadeIn = (spid, dur) => '<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="' + nid() + '" dur="' + dur + '"/>' + tgt(spid) + '</p:cBhvr></p:animEffect>';
    const tv = (v) => (/^[\d.]+$/.test(v) ? '<p:fltVal val="' + v + '"/>' : '<p:strVal val="' + v + '"/>');
    const animNum = (spid, attr, from, to, dur) => '<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="' + nid() + '" dur="' + dur + '" fill="hold"/>' + tgt(spid) + '<p:attrNameLst><p:attrName>' + attr + '</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val>' + tv(from) + '</p:val></p:tav><p:tav tm="100000"><p:val>' + tv(to) + '</p:val></p:tav></p:tavLst></p:anim>';
    const entr = (preset, sub, spid, delay, children, grp) => '<p:par><p:cTn id="' + nid() + '" presetID="' + preset + '" presetClass="entr" presetSubtype="' + sub + '" fill="hold"' + (grp ? ' grpId="0"' : '') + ' nodeType="withEffect"><p:stCondLst><p:cond delay="' + delay + '"/></p:stCondLst><p:childTnLst>' + children + '</p:childTnLst></p:cTn></p:par>';

    return {
      fade: (spid, delay, grp) => entr(10, 0, spid, delay, setVis(spid) + fadeIn(spid, 700), grp),
      float: (spid, delay, grp) => entr(42, 0, spid, delay, setVis(spid) + fadeIn(spid, 700) + animNum(spid, 'ppt_y', '#ppt_y+.06', '#ppt_y', 700), grp),
      wipe: (spid, delay, grp) => entr(22, 8, spid, delay, setVis(spid) + '<p:animEffect transition="in" filter="wipe(left)"><p:cBhvr><p:cTn id="' + nid() + '" dur="650"/>' + tgt(spid) + '</p:cBhvr></p:animEffect>', grp),
      zoom: (spid, delay, grp) => entr(53, 16, spid, delay, setVis(spid) + animNum(spid, 'ppt_w', '0', '#ppt_w', 600) + animNum(spid, 'ppt_h', '0', '#ppt_h', 600) + fadeIn(spid, 600), grp),
      left: (spid, delay, grp) => entr(2, 8, spid, delay, setVis(spid) + animNum(spid, 'ppt_x', '0-#ppt_w/2', '#ppt_x', 600) + animNum(spid, 'ppt_y', '#ppt_y', '#ppt_y', 600), grp),
      right: (spid, delay, grp) => entr(2, 2, spid, delay, setVis(spid) + animNum(spid, 'ppt_x', '1+#ppt_w/2', '#ppt_x', 600) + animNum(spid, 'ppt_y', '#ppt_y', '#ppt_y', 600), grp),
      // Boucles
      spin: (spid, dir, dur) => '<p:par><p:cTn id="' + nid() + '" presetID="8" presetClass="emph" presetSubtype="0" repeatCount="indefinite" fill="hold" nodeType="withEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:endCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:endCondLst><p:childTnLst><p:animRot by="' + (dir * 21600000) + '"><p:cBhvr><p:cTn id="' + nid() + '" dur="' + dur + '" fill="hold"/>' + tgt(spid) + '<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot></p:childTnLst></p:cTn></p:par>',
      floatLoop: (spid, dur) => '<p:par><p:cTn id="' + nid() + '" presetID="63" presetClass="path" presetSubtype="0" repeatCount="indefinite" accel="50000" decel="50000" autoRev="1" fill="hold" nodeType="withEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:animMotion origin="layout" path="M 0 0 L 0 0.025 " pathEditMode="relative" rAng="0" ptsTypes="AA"><p:cBhvr><p:cTn id="' + nid() + '" dur="' + dur + '" fill="hold"/>' + tgt(spid) + '<p:attrNameLst><p:attrName>ppt_x</p:attrName><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:rCtr x="0" y="1250"/></p:animMotion></p:childTnLst></p:cTn></p:par>',
      pulse: (spid, dur) => '<p:par><p:cTn id="' + nid() + '" presetID="6" presetClass="emph" presetSubtype="0" repeatCount="indefinite" autoRev="1" fill="hold" nodeType="withEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:animScale><p:cBhvr><p:cTn id="' + nid() + '" dur="' + dur + '" fill="hold"/>' + tgt(spid) + '</p:cBhvr><p:by x="108000" y="108000"/></p:animScale></p:childTnLst></p:cTn></p:par>',
      root: (effects, bld) => '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst><p:par><p:cTn id="' + nid() + '" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>' + effects + '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>' + (bld ? '<p:bldLst>' + bld + '</p:bldLst>' : '') + '</p:timing>'
    };
  }

  /* ---------- Analyse d'une diapositive ---------- */
  function shapesOf(xml) {
    const out = []; const re = /<p:(sp|pic|graphicFrame|cxnSp)>[\s\S]*?<p:cNvPr id="(\d+)" name="([^"]*)"/g; let m;
    while ((m = re.exec(xml))) out.push({ kind: m[1], id: m[2], name: m[3] });
    return out;
  }
  // graphicFrame : graphique (a:chart / c:chart) ou tableau (a:tbl)
  function frameKind(xml, id) {
    const i = xml.indexOf('<p:cNvPr id="' + id + '"'); if (i < 0) return 'table';
    const j = xml.indexOf('</p:graphicFrame>', i); const seg = xml.slice(i, j < 0 ? i + 4000 : j);
    return /<c:chart\b/.test(seg) ? 'chart' : 'table';
  }

  function slideFx(xml, opt) {
    const shapes = shapesOf(xml); const B = Builder();
    const groups = {}; const hud = []; const logos = []; const pulses = [];
    shapes.forEach((s) => {
      let m;
      if ((m = /^!!hud(\d)/.exec(s.name))) hud.push({ s, key: 'hud' + m[1] });
      else if (/^!!logo/.test(s.name)) logos.push(s);
      else if (/^!!pulse/.test(s.name)) pulses.push(s);
      else if ((m = /^FX(\d+)~(\w+)/.exec(s.name))) (groups[+m[1]] = groups[+m[1]] || []).push(Object.assign({ eff: m[2] }, s));
    });
    const order = Object.keys(groups).map(Number).sort((a, b) => a - b);
    if (!order.length && !hud.length && !logos.length && !pulses.length) return null;
    const n = order.length; const step = Math.max(70, Math.min(230, Math.round(2300 / Math.max(1, n))));
    let effects = '', bld = '';
    const addBld = (s, grp) => { if (!grp) return; bld += s.kind === 'graphicFrame' ? '<p:bldGraphic spid="' + s.id + '" grpId="0"><p:bldAsOne/></p:bldGraphic>' : '<p:bldP spid="' + s.id + '" grpId="0" animBg="1"/>'; };
    order.forEach((g, i) => {
      const delay = 150 + i * step;
      groups[g].forEach((s, k) => {
        let eff = s.eff; if (!B[eff] || ['spin', 'floatLoop', 'pulse', 'root'].indexOf(eff) >= 0) eff = 'fade';
        const grp = s.kind === 'sp' || (s.kind === 'graphicFrame' && frameKind(xml, s.id) === 'chart');
        effects += B[eff](s.id, delay + k * 20, grp); addBld(s, grp);
      });
    });
    if (opt.loops !== false) {
      hud.forEach((h) => { const sp = SPIN[h.key]; if (sp) effects += B.spin(h.s.id, sp[0], sp[1]); });
      logos.forEach((s, i) => { effects += B.floatLoop(s.id, 3600 + i * 400); });
      pulses.forEach((s) => { effects += B.pulse(s.id, 1800); });
    }
    return B.root(effects, bld);
  }

  /* u8 : .pptx (Uint8Array) ; opts : { transitions: ['morph'|'vortex'|…, …] (par n° de diapo), loops } -> Promise<Uint8Array> */
  async function apply(u8, opts) {
    opts = opts || {};
    const files = await D.unzip(u8); const dec = new TextDecoder(); const enc = new TextEncoder();
    const out = files.map((f) => {
      const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(f.name); if (!m) return f;
      let xml = dec.decode(f.data); const idx = +m[1] - 1;
      const kind = (opts.transitions && opts.transitions[idx]) || opts.transition || 'morph';
      const timing = slideFx(xml, opts);
      const add = transitionXml(kind) + (timing || '');
      if (/<p:transition|<p:timing|<mc:AlternateContent/.test(xml)) return f; // déjà animée
      const end = xml.lastIndexOf('</p:sld>'); if (end < 0) return f;
      xml = xml.slice(0, end) + add + xml.slice(end);
      return { name: f.name, data: enc.encode(xml) };
    });
    // [Content_Types].xml en premier, comme l'exige OPC
    out.sort((a, b) => (a.name === '[Content_Types].xml' ? -1 : b.name === '[Content_Types].xml' ? 1 : 0));
    const parts = D.zip(out);
    let len = 0; parts.forEach((p) => { len += p.length; });
    const res = new Uint8Array(len); let o = 0; parts.forEach((p) => { res.set(p, o); o += p.length; });
    return res;
  }

  const API = { apply, slideFx, transitionXml, SPIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PaygPptxFx = API;
})(typeof window !== 'undefined' ? window : globalThis);
