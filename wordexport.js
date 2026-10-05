/* wordexport.js — Export du rapport d'étude au format Word (.docx).
 *  - Autonome : aucune bibliothèque externe, fonctionne aussi hors connexion.
 *  - Reçoit exactement les mêmes tableaux que les exports CSV / Excel / PDF (E.buildExport),
 *    donc les chiffres du rapport Word sont identiques à ceux des autres exports.
 *  - N'altère aucune formule ni aucune autre fonction du site. */
(function (root) {
  'use strict';

  const DEPARTMENT = 'Département Management, Economie et Droit';

  /* ---------- Outils XML ---------- */
  const clean = (v) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  const esc = (v) => clean(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  /* run de texte ; rtl = texte arabe */
  function run(text, o) {
    o = o || {};
    let pr = '';
    pr += '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>';
    if (o.bold) pr += '<w:b/><w:bCs/>';
    if (o.italic) pr += '<w:i/><w:iCs/>';
    if (o.color) pr += '<w:color w:val="' + o.color + '"/>';
    if (o.size) pr += '<w:sz w:val="' + o.size + '"/><w:szCs w:val="' + o.size + '"/>';
    if (o.rtl) pr += '<w:rtl/>';
    return '<w:r><w:rPr>' + pr + '</w:rPr><w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>';
  }

  function para(runs, o) {
    o = o || {};
    let pr = '';
    if (o.style) pr += '<w:pStyle w:val="' + o.style + '"/>';
    if (o.keepNext) pr += '<w:keepNext/>';
    if (o.border) pr += '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="D4AF37"/></w:pBdr>';
    if (o.bidi) pr += '<w:bidi/>';
    if (o.spacing) pr += '<w:spacing w:before="' + (o.spacing[0] || 0) + '" w:after="' + (o.spacing[1] || 0) + '"/>';
    if (o.align) pr += '<w:jc w:val="' + o.align + '"/>';
    return '<w:p>' + (pr ? '<w:pPr>' + pr + '</w:pPr>' : '') + runs + '</w:p>';
  }

  /* ---------- Tableau ---------- */
  const isNum = (s) => /^-?[\d\s\u00A0\u202F.,]+%?$/.test(String(s).trim()) && /\d/.test(String(s));

  function table(rows, totalW) {
    if (!rows || !rows.length) return '';
    const cols = Math.max.apply(null, rows.map((r) => r.length));
    // largeur de chaque colonne proportionnelle au contenu (bornée), somme = totalW
    const weight = [];
    for (let c = 0; c < cols; c++) {
      let m = 0;
      rows.forEach((r, i) => {
        const len = clean(r[c]).length;
        const eff = i === 0 ? Math.min(len, 22) * 0.75 : Math.min(len, 60); // l'en-tête peut passer à la ligne
        if (eff > m) m = eff;
      });
      weight.push(Math.max(6, m));
    }
    const sum = weight.reduce((a, b) => a + b, 0);
    let w = weight.map((x) => Math.max(700, Math.floor((x / sum) * totalW)));
    const diff = totalW - w.reduce((a, b) => a + b, 0);
    w[w.length - 1] += diff; // la somme des colonnes doit être exacte

    const border = (c) => '<w:top w:val="single" w:sz="4" w:space="0" w:color="' + c + '"/><w:left w:val="single" w:sz="4" w:space="0" w:color="' + c + '"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="' + c + '"/><w:right w:val="single" w:sz="4" w:space="0" w:color="' + c + '"/>';
    let x = '<w:tbl><w:tblPr><w:tblW w:w="' + totalW + '" w:type="dxa"/><w:tblBorders>' +
      '<w:top w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/><w:left w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/><w:right w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>' +
      '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/></w:tblBorders>' +
      '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>';
    x += '<w:tblGrid>' + w.map((n) => '<w:gridCol w:w="' + n + '"/>').join('') + '</w:tblGrid>';
    rows.forEach((r, i) => {
      const head = i === 0;
      x += '<w:tr><w:trPr><w:cantSplit/>' + (head ? '<w:tblHeader/>' : '') + '</w:trPr>';
      for (let c = 0; c < cols; c++) {
        const val = clean(r[c]);
        const shade = head ? '0F172A' : (i % 2 === 0 ? 'F1F5F9' : 'FFFFFF');
        x += '<w:tc><w:tcPr><w:tcW w:w="' + w[c] + '" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="' + shade + '"/></w:tcPr>' +
          para(run(val, { size: head ? 15 : 16, bold: head, color: head ? 'FFFFFF' : '0F172A' }), { align: !head && isNum(val) ? 'right' : 'left' }) + '</w:tc>';
      }
      x += '</w:tr>';
    });
    return x + '</w:tbl>';
  }

  /* ---------- Contenu du document ---------- */
  function buildDocumentXml(sheets, o) {
    const ar = o.lang === 'ar';
    const PW = 16838, PH = 11906, M = 720; // A4 paysage (les tableaux comptent jusqu'à 16 colonnes)
    const textW = PW - 2 * M;
    let b = '';
    b += para(run(o.title, { bold: true, size: 36, color: '0F172A', rtl: ar }), { style: 'Title', bidi: ar, spacing: [0, 80], border: true });
    b += para(run(o.subtitle, { size: 20, color: '475569', rtl: ar }), { bidi: ar, spacing: [60, 40] });
    b += para(run(o.department, { size: 20, bold: true, color: '047857' }), { spacing: [0, 40] });
    b += para(run(o.note, { size: 18, italic: true, color: '64748B', rtl: ar }), { bidi: ar, spacing: [0, 200] });
    Object.keys(sheets).forEach((n) => {
      b += para(run(n.replace(/_/g, ' '), { bold: true, size: 24, color: 'B45309' }), { style: 'Heading2', keepNext: true, spacing: [240, 80] });
      b += table(sheets[n], textW);
      b += para('', { spacing: [0, 60] });
    });
    b += '<w:sectPr><w:headerReference w:type="default" r:id="rId11"/><w:footerReference w:type="default" r:id="rId12"/>' +
      '<w:pgSz w:w="' + PW + '" w:h="' + PH + '" w:orient="landscape"/><w:pgMar w:top="1000" w:right="' + M + '" w:bottom="900" w:left="' + M + '" w:header="450" w:footer="400" w:gutter="0"/></w:sectPr>';
    return XML + '<w:document ' + NS + '><w:body>' + b + '</w:body></w:document>';
  }

  const styles = XML + '<w:styles ' + NS + '>' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="fr-FR" w:eastAsia="fr-FR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '</w:styles>';

  const field = (instr) => '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ' + instr + ' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + run('1', { size: 16, color: '64748B' }) + '<w:r><w:fldChar w:fldCharType="end"/></w:r>';

  function headerXml(o) {
    return XML + '<w:hdr ' + NS + '>' + para(run('Solar PAYG Mauritanie — ' + o.headerText, { size: 16, color: '64748B' }), { align: 'left' }) + '</w:hdr>';
  }
  function footerXml(o) {
    return XML + '<w:ftr ' + NS + '>' +
      para(run(o.footerText, { size: 16, color: '64748B' }) + run('   |   Page ', { size: 16, color: '64748B' }) + field('PAGE') + run(' / ', { size: 16, color: '64748B' }) + field('NUMPAGES'), { align: 'center' }) + '</w:ftr>';
  }

  /* ---------- ZIP minimal (méthode « stored », CRC32) ---------- */
  const CRC = (function () { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const utf8 = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Uint8Array.from(Buffer.from(s, 'utf8')));

  function zip(files) {
    const DOS_TIME = (12 << 11), DOS_DATE = (((2027 - 1980) << 9) | (1 << 5) | 1) & 0xFFFF; // date fixe : fichier reproductible
    const parts = [], central = []; let offset = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    files.forEach((f) => {
      const name = utf8(f.name), data = utf8(f.data), crc = crc32(data);
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

  /* ---------- API ---------- */
  /* sheets : { NomFeuille: [[en-têtes…], [ligne…], …], … }  (sortie de E.buildExport)
   * opts   : { lang: 'fr'|'ar', title, subtitle, note, modelDate }  */
  function build(sheets, opts) {
    opts = opts || {};
    const ar = opts.lang === 'ar';
    const title = opts.title || (ar ? 'دراسة جدوى شركة تمويل الطاقة الشمسية PAYG في موريتانيا' : 'Étude de faisabilité — financement PAYG de l’énergie solaire en Mauritanie');
    const o = {
      lang: opts.lang,
      title: title,
      subtitle: 'Solar PAYG Mauritanie 2027' + (opts.modelDate ? ' — ' + opts.modelDate : ''),
      department: DEPARTMENT,
      note: opts.note || (ar ? 'جميع البيانات مصنفة: فعلية / تقدير / فرضية / محاكاة.' : 'Chaque donnée est classée : enquête / estimation / hypothèse / simulation.'),
      headerText: 'Étude de faisabilité',
      footerText: '© 2027 Solar PAYG Mauritanie — MDA — Tous droits réservés — ' + DEPARTMENT
    };
    const files = [
      { name: '[Content_Types].xml', data: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
      { name: '_rels/.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>' },
      { name: 'word/document.xml', data: buildDocumentXml(sheets, o) },
      { name: 'word/styles.xml', data: styles },
      { name: 'word/header1.xml', data: headerXml(o) },
      { name: 'word/footer1.xml', data: footerXml(o) },
      { name: 'docProps/core.xml', data: XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + esc(title) + '</dc:title><dc:creator>Solar PAYG Mauritanie</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>' },
      { name: 'docProps/app.xml', data: XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Solar PAYG Mauritanie</Application></Properties>' }
    ];
    return zip(files); // tableau de Uint8Array (à passer à new Blob)
  }

  const API = { build: build, DEPARTMENT: DEPARTMENT, MIME: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PaygWord = API;
})(typeof window !== 'undefined' ? window : globalThis);
