/* docs-common.js — Outils communs aux exports Word (.docx) et PowerPoint (.pptx).
 *  - Écriture ZIP sans dépendance (méthode « stored » + CRC32) ;
 *  - mise en forme des nombres (français) ;
 *  - graphiques dessinés en SVG puis convertis en PNG (aucune bibliothèque externe, aucun accès réseau) ;
 *  - utilitaires XML.
 *  N'altère aucune formule ni aucune autre fonction du site. */
(function (root) {
  'use strict';

  /* ---------- Couleurs de la charte (celles du logo) ---------- */
  const C = { navy: '0F172A', green: '16803A', greenDark: '14532D', orange: 'F59E0B', orangeDark: 'EA580C', blue: '1D6FE0', blueDark: '1E3A8A', gold: 'D4AF37', slate: '334155', gray: '64748B', light: 'F1F5F9', line: 'CBD5E1', red: 'DC2626' };
  const SERIES = ['#1D6FE0', '#F59E0B', '#16803A', '#A855F7', '#06B6D4', '#EC4899'];

  /* ---------- XML / texte ---------- */
  const clean = (v) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  const esc = (v) => clean(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  /* ---------- Nombres (format français, espace insécable) ---------- */
  const NB = '\u00A0';
  function num(x, dec) {
    if (x == null || !isFinite(x)) return '—';
    const d = dec == null ? 0 : dec;
    const s = Math.abs(x).toFixed(d);
    const parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    return (x < 0 && +s !== 0 ? '-' : '') + parts.join(',');
  }
  const mru = (x, dec) => (x == null || !isFinite(x) ? '—' : num(x, dec) + NB + 'MRU');
  const pct = (x, dec) => (x == null || !isFinite(x) ? '—' : num(x * 100, dec == null ? 1 : dec) + NB + '%');
  const pctRaw = (x, dec) => (x == null || !isFinite(x) ? '—' : num(x, dec == null ? 1 : dec) + NB + '%');
  // Montants compacts pour les axes de graphiques : 1,2 M / 350 k
  function compact(x) {
    if (x == null || !isFinite(x)) return '';
    const a = Math.abs(x), s = x < 0 ? '-' : '';
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
    if (a >= 1e3) return s + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace('.', ',').replace(',0', '') + ' k';
    return s + Math.round(a);
  }

  /* ---------- ZIP minimal ---------- */
  const CRC = (function () { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const utf8 = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Uint8Array.from(Buffer.from(s, 'utf8')));

  /* files : [{ name, data: string | Uint8Array }] -> tableau de Uint8Array (à passer à new Blob) */
  function zip(files) {
    const DOS_TIME = (12 << 11), DOS_DATE = (((2026 - 1980) << 9) | (1 << 5) | 1) & 0xFFFF;
    const parts = [], central = []; let offset = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    files.forEach((f) => {
      const name = utf8(f.name), data = typeof f.data === 'string' ? utf8(f.data) : f.data, crc = crc32(data);
      const local = Uint8Array.from([].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)));
      parts.push(local, name, data);
      central.push({ name, crc, size: data.length, offset });
      offset += local.length + name.length + data.length;
    });
    const cStart = offset; let cSize = 0;
    central.forEach((c) => {
      const h = Uint8Array.from([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(DOS_TIME), u16(DOS_DATE), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset)));
      parts.push(h, c.name); cSize += h.length + c.name.length;
    });
    parts.push(Uint8Array.from([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cSize), u32(cStart), u16(0))));
    return parts;
  }


  /* ---------- Lecture d'un ZIP (méthodes « stored » et « deflate ») ----------
   * Sert à retoucher un .pptx produit par PptxGenJS (ajout des transitions et animations). Sans bibliothèque :
   * la décompression utilise DecompressionStream (navigateurs récents et Node 18+). Retourne [{ name, data: Uint8Array }]. */
  async function unzip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('zip: fin de répertoire introuvable');
    const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const dec = new TextDecoder(), out = [];
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip: entrée corrompue');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      const lnlen = dv.getUint16(lo + 26, true), lxlen = dv.getUint16(lo + 28, true), start = lo + 30 + lnlen + lxlen;
      const raw = u8.subarray(start, start + csize);
      let data;
      if (method === 0) data = raw.slice();
      else if (method === 8) {
        const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(raw); w.close();
        data = new Uint8Array(await new Response(ds.readable).arrayBuffer());
      } else throw new Error('zip: méthode ' + method + ' non prise en charge');
      if (name.slice(-1) !== '/') out.push({ name, data });
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }

  /* ---------- Données binaires ---------- */
  function dataUriToBytes(uri) {
    const b64 = String(uri).split(',')[1] || '';
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function imageSize(bytes) { // largeur / hauteur d'un PNG ou JPEG
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return { w: (bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19]) >>> 0, h: (bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23]) >>> 0, ext: 'png', mime: 'image/png' };
    let i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const m = bytes[i + 1], len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8], ext: 'jpeg', mime: 'image/jpeg' };
      i += 2 + len;
    }
    return { w: 1100, h: 700, ext: 'jpeg', mime: 'image/jpeg' };
  }

  /* ---------- SVG -> PNG (navigateur) ---------- */
  function svgToPng(svg, w, h, scale) {
    scale = scale || 2;
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          try {
            const cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
            const cx = cv.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
            cx.drawImage(img, 0, 0, cv.width, cv.height);
            URL.revokeObjectURL(url);
            const bytes = dataUriToBytes(cv.toDataURL('image/png'));
            resolve({ bytes, w: cv.width, h: cv.height, ext: 'png', mime: 'image/png' });
          } catch (e) { URL.revokeObjectURL(url); reject(e); }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg')); };
        img.src = url;
      } catch (e) { reject(e); }
    });
  }
  // PNG avec fond transparent (logo)
  function svgToPngTransparent(svg, w, h, scale) {
    scale = scale || 2;
    return new Promise((resolve, reject) => {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }); const url = URL.createObjectURL(blob); const img = new Image();
      img.onload = () => { try { const cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); resolve({ bytes: dataUriToBytes(cv.toDataURL('image/png')), w: cv.width, h: cv.height, ext: 'png', mime: 'image/png' }); } catch (e) { reject(e); } };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg')); };
      img.src = url;
    });
  }

  /* ---------- Graphiques SVG ---------- */
  const FONT = 'Arial, Helvetica, sans-serif';
  const sx = (v) => esc(v);
  function wrapText(text, max) {
    const words = String(text == null ? '' : text).split(/\s+/); const lines = []; let cur = '';
    words.forEach((w) => { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) lines.push(cur); return lines.length ? lines : [''];
  }
  function svgOpen(w, h) { return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" font-family="' + FONT + '"><rect width="' + w + '" height="' + h + '" fill="#fff"/>'; }
  function titleSvg(title, w) { return title ? '<text x="' + (w / 2) + '" y="30" text-anchor="middle" font-size="19" font-weight="700" fill="#0F172A">' + sx(title) + '</text>' : ''; }
  function niceTicks(min, max, n) {
    if (min === max) { max = min + 1; }
    const span = max - min, raw = span / (n || 5), pow = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pow;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, t = [];
    for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(10));
    return t;
  }

  /* Barres horizontales : labels / values ; valueLabels (texte à droite de chaque barre) */
  function hbar(o) {
    const W = o.width || 960, labels = o.labels, vals = o.values, n = labels.length;
    const lblMax = o.labelChars || 44, rowsInfo = labels.map((l) => wrapText(l, lblMax));
    const rowH = (i) => Math.max(34, rowsInfo[i].length * 17 + 14);
    const top = o.title ? 52 : 18, left = 340, right = 150;
    const H = top + rowsInfo.reduce((a, _, i) => a + rowH(i), 0) + 22;
    const max = o.max != null ? o.max : Math.max.apply(null, vals.concat([1e-9])) * 1.0;
    let y = top, s = svgOpen(W, H) + titleSvg(o.title, W);
    s += '<line x1="' + left + '" y1="' + (top - 6) + '" x2="' + left + '" y2="' + (H - 16) + '" stroke="#CBD5E1"/>';
    labels.forEach((l, i) => {
      const rh = rowH(i), cy = y + rh / 2, bw = Math.max(0, (vals[i] / max) * (W - left - right)), col = (o.colors && o.colors[i]) || o.color || '#1D6FE0';
      rowsInfo[i].forEach((ln, k) => { s += '<text x="' + (left - 12) + '" y="' + (cy - ((rowsInfo[i].length - 1) * 8.5) + k * 17 + 5) + '" text-anchor="end" font-size="14" fill="#334155">' + sx(ln) + '</text>'; });
      s += '<rect x="' + left + '" y="' + (cy - 11) + '" width="' + bw.toFixed(1) + '" height="22" rx="4" fill="' + col + '"/>';
      s += '<text x="' + (left + bw + 8) + '" y="' + (cy + 5) + '" font-size="14" font-weight="700" fill="#0F172A">' + sx(o.valueLabels ? o.valueLabels[i] : String(vals[i])) + '</text>';
      y += rh;
    });
    return { svg: s + '</svg>', w: W, h: H };
  }

  /* Barres verticales groupées (valeurs négatives acceptées) */
  function gbars(o) {
    const W = o.width || 960, H = o.height || 470, L = 90, R = 24, T = o.title ? 56 : 24, B = 74;
    const cats = o.categories, ser = o.series;
    let mn = 0, mx = 0; ser.forEach((s) => s.values.forEach((v) => { if (isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } }));
    const ticks = niceTicks(mn, mx, 5), lo = ticks[0], hi = ticks[ticks.length - 1];
    const Y = (v) => T + (hi - v) / (hi - lo || 1) * (H - T - B), pw = W - L - R, gw = pw / cats.length;
    let s = svgOpen(W, H) + titleSvg(o.title, W);
    ticks.forEach((t) => { s += '<line x1="' + L + '" y1="' + Y(t).toFixed(1) + '" x2="' + (W - R) + '" y2="' + Y(t).toFixed(1) + '" stroke="' + (t === 0 ? '#64748B' : '#E2E8F0') + '"/><text x="' + (L - 8) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end" font-size="12" fill="#475569">' + sx(compact(t)) + '</text>'; });
    cats.forEach((c, i) => {
      const bw = Math.min(46, (gw * 0.78) / ser.length), x0 = L + gw * i + (gw - bw * ser.length) / 2;
      ser.forEach((se, k) => {
        const v = se.values[i]; if (!isFinite(v)) return;
        const y1 = Y(Math.max(v, 0)), y2 = Y(Math.min(v, 0));
        s += '<rect x="' + (x0 + bw * k).toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + (bw - 3).toFixed(1) + '" height="' + Math.max(1, y2 - y1).toFixed(1) + '" rx="3" fill="' + se.color + '"/>';
      });
      s += '<text x="' + (L + gw * i + gw / 2).toFixed(1) + '" y="' + (H - B + 22) + '" text-anchor="middle" font-size="13" fill="#334155">' + sx(c) + '</text>';
    });
    let lx = L; ser.forEach((se) => { s += '<rect x="' + lx + '" y="' + (H - 26) + '" width="14" height="14" rx="3" fill="' + se.color + '"/><text x="' + (lx + 20) + '" y="' + (H - 14) + '" font-size="13" fill="#334155">' + sx(se.name) + '</text>'; lx += 40 + se.name.length * 7.4; });
    if (o.yTitle) s += '<text x="16" y="' + (T + (H - T - B) / 2) + '" transform="rotate(-90 16 ' + (T + (H - T - B) / 2) + ')" text-anchor="middle" font-size="12" fill="#64748B">' + sx(o.yTitle) + '</text>';
    return { svg: s + '</svg>', w: W, h: H };
  }

  /* Courbes (ex. cash-flow cumulé, 60 mois) */
  function lines(o) {
    const W = o.width || 960, H = o.height || 470, L = 96, R = 28, T = o.title ? 56 : 24, B = 78, ser = o.series, n = ser[0].values.length;
    let mn = 0, mx = 0; ser.forEach((s) => s.values.forEach((v) => { if (isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } }));
    const ticks = niceTicks(mn, mx, 6), lo = ticks[0], hi = ticks[ticks.length - 1];
    const Y = (v) => T + (hi - v) / (hi - lo || 1) * (H - T - B), X = (i) => L + (i / (n - 1)) * (W - L - R);
    let s = svgOpen(W, H) + titleSvg(o.title, W);
    ticks.forEach((t) => { s += '<line x1="' + L + '" y1="' + Y(t).toFixed(1) + '" x2="' + (W - R) + '" y2="' + Y(t).toFixed(1) + '" stroke="' + (t === 0 ? '#64748B' : '#E2E8F0') + '"/><text x="' + (L - 8) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end" font-size="12" fill="#475569">' + sx(compact(t)) + '</text>'; });
    for (let m = 0; m < n; m += (o.xStep || 12)) s += '<line x1="' + X(m).toFixed(1) + '" y1="' + (H - B) + '" x2="' + X(m).toFixed(1) + '" y2="' + (H - B + 5) + '" stroke="#64748B"/><text x="' + X(m).toFixed(1) + '" y="' + (H - B + 22) + '" text-anchor="middle" font-size="12" fill="#475569">' + (o.xPrefix || '') + m + '</text>';
    if (o.xTitle) s += '<text x="' + ((L + W - R) / 2) + '" y="' + (H - B + 44) + '" text-anchor="middle" font-size="12" fill="#64748B">' + sx(o.xTitle) + '</text>';
    ser.forEach((se) => { s += '<polyline fill="none" stroke="' + se.color + '" stroke-width="3" stroke-linejoin="round" points="' + se.values.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ') + '"/>'; });
    let lx = L; ser.forEach((se) => { s += '<rect x="' + lx + '" y="' + (H - 26) + '" width="14" height="14" rx="3" fill="' + se.color + '"/><text x="' + (lx + 20) + '" y="' + (H - 14) + '" font-size="13" fill="#334155">' + sx(se.name) + '</text>'; lx += 40 + se.name.length * 7.4; });
    return { svg: s + '</svg>', w: W, h: H };
  }

  /* Fil conducteur du travail : Problème -> Enquête -> Marché -> Prototype -> Finance -> Faisabilité -> Conclusion */
  const STORY = [
    ['Problème', 'en Mauritanie', ''],
    ['Enquête', '', 'preuve du besoin'],
    ['Étude de marché', '', 'estimation de la demande'],
    ['Prototype', '', 'démonstration de la solution'],
    ['Hypothèses', 'financières', 'coûts et revenus'],
    ['Étude de', 'faisabilité', 'rentabilité et risques'],
    ['Conclusion', '', 'décision']
  ];
  function story(active) { // active : index 0..6 ou -1 (tout en couleur)
    const W = 1100, H = 190, n = STORY.length, w = 150, gap = 8, x0 = (W - (n * w + (n - 1) * gap)) / 2;
    const cols = ['#B45309', '#0E7490', '#0F766E', '#1D4ED8', '#7C3AED', '#16803A', '#14532D'];
    let s = svgOpen(W, H);
    STORY.forEach((st, i) => {
      const x = x0 + i * (w + gap), on = active < 0 || active === i, fill = on ? cols[i] : '#CBD5E1', tc = on ? '#FFFFFF' : '#64748B';
      s += '<polygon points="' + x + ',30 ' + (x + w - 16) + ',30 ' + (x + w) + ',70 ' + (x + w - 16) + ',110 ' + x + ',110 ' + (x + 16) + ',70" fill="' + fill + '"/>';
      s += '<text x="' + (x + w / 2 + 2) + '" y="' + (st[1] ? 63 : 76) + '" text-anchor="middle" font-size="15" font-weight="700" fill="' + tc + '">' + sx(st[0]) + '</text>';
      if (st[1]) s += '<text x="' + (x + w / 2 + 2) + '" y="83" text-anchor="middle" font-size="15" font-weight="700" fill="' + tc + '">' + sx(st[1]) + '</text>';
      s += '<text x="' + (x + w / 2) + '" y="20" text-anchor="middle" font-size="12" font-weight="700" fill="' + (on ? cols[i] : '#94A3B8') + '">' + (i + 1) + '</text>';
      if (st[2]) wrapText(st[2], 20).forEach((ln, k) => { s += '<text x="' + (x + w / 2) + '" y="' + (136 + k * 17) + '" text-anchor="middle" font-size="13" font-style="italic" fill="' + (on ? '#334155' : '#94A3B8') + '">' + sx(ln) + '</text>'; });
    });
    return { svg: s + '</svg>', w: W, h: H };
  }

  /* Rend une spécification {svg,w,h} en PNG */
  const render = (c) => svgToPng(c.svg, c.w, c.h, 2);

  const API = { C, SERIES, esc, clean, XML, num, mru, pct, pctRaw, compact, NB, zip, unzip, utf8, dataUriToBytes, imageSize, svgToPng, svgToPngTransparent, hbar, gbars, lines, story, STORY, render, wrapText };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PaygDocs = API;
})(typeof window !== 'undefined' ? window : globalThis);
