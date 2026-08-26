/* =====================================================================
   UNEM ISCAE — طبقة الرفع الموحّدة (متصفح / WebView / content://)
   ---------------------------------------------------------------------
   اختيار الملف → معالجة → توقيع UNEM (PDF / Word .docx / PowerPoint .pptx)
   → ضغط ذكي عند الحاجة → رفع مباشر إلى Cloudinary بتوقيع من الخادم
   → إرجاع النتيجة.

   • لا تُحمَّل مكتبة pdf-lib إلا عند الحاجة الفعلية لتوقيع PDF (Lazy load).
   • لا تُحمَّل مكتبة JSZip إلا عند الحاجة الفعلية لتوقيع Word/PowerPoint
     (Lazy load) — تُستعمل لإدراج شعار UNEM كعلامة مائية داخل حزمة
     OOXML (docx/pptx) دون المساس بمحتوى الملف أو تنسيقه.
   • Excel وصيغ Office القديمة (.doc / .ppt) تُرفع كما هي دون أي تعديل.
   • هذا التوقيع يخص قسم «المستندات» فقط (UNEMUpload.prepareFile)؛
     قسم «النتائج» له منطق معالجة مستقل خاص به لا يوقّع ملفات Office
     إطلاقاً (انظر resultats.html) بحسب طلب عدم توقيع ملفات النتائج.
   • الصور تُضغط فقط إن كانت كبيرة.
   ===================================================================== */
(function (global) {
  "use strict";

  var MAX_UPLOAD_SIZE = 60 * 1024 * 1024; // 60 MB
  var IMAGE_COMPRESS_THRESHOLD = 1.5 * 1024 * 1024; // فوقها فقط نضغط الصور
  var IMAGE_MAX_DIMENSION = 2400;
  var PDF_COMPRESS_THRESHOLD = 2 * 1024 * 1024; // فوقها نحاول تحسين حجم PDF

  /** أنواع الملفات المدعومة رسمياً */
  var TYPES = {
    pdf: { mime: "application/pdf", kind: "pdf", resourceType: "raw", icon: "fa-file-pdf", color: "#ef4444" },
    doc: { mime: "application/msword", kind: "word", resourceType: "raw", icon: "fa-file-word", color: "#2563eb" },
    docx: {
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      kind: "word", resourceType: "raw", icon: "fa-file-word", color: "#2563eb",
    },
    ppt: { mime: "application/vnd.ms-powerpoint", kind: "powerpoint", resourceType: "raw", icon: "fa-file-powerpoint", color: "#ea580c" },
    pptx: {
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      kind: "powerpoint", resourceType: "raw", icon: "fa-file-powerpoint", color: "#ea580c",
    },
    xls: { mime: "application/vnd.ms-excel", kind: "excel", resourceType: "raw", icon: "fa-file-excel", color: "#16a34a" },
    xlsx: {
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      kind: "excel", resourceType: "raw", icon: "fa-file-excel", color: "#16a34a",
    },
    jpg: { mime: "image/jpeg", kind: "image", resourceType: "image", icon: "fa-file-image", color: "#7c3aed" },
    jpeg: { mime: "image/jpeg", kind: "image", resourceType: "image", icon: "fa-file-image", color: "#7c3aed" },
    png: { mime: "image/png", kind: "image", resourceType: "image", icon: "fa-file-image", color: "#7c3aed" },
  };

  var ACCEPT_ATTR =
    ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png," +
    "application/pdf,application/msword," +
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
    "application/vnd.ms-powerpoint," +
    "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
    "application/vnd.ms-excel," +
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
    "image/jpeg,image/png";

  function extOf(name) {
    var m = /\.([A-Za-z0-9]+)$/.exec(String(name || ""));
    return m ? m[1].toLowerCase() : "";
  }

  function infoFor(name) {
    return TYPES[extOf(name)] || null;
  }

  function isSupported(name) {
    return !!infoFor(name);
  }

  /** تحقق موحّد قبل الرفع — يُستعمل في كل الواجهات */
  function validateFile(file) {
    if (!file) return "❌ لم يتم اختيار ملف.";
    var info = infoFor(file.name);
    if (!info) {
      return "❌ نوع الملف غير مدعوم. المسموح: PDF, Word, PowerPoint, Excel, JPG, PNG.";
    }
    if (file.size === 0) return "❌ الملف فارغ.";
    if (file.size > MAX_UPLOAD_SIZE) return "❌ حجم الملف كبير جداً (الحد الأقصى 60 ميغابايت).";
    if (String(file.name).length > 180) return "❌ اسم الملف طويل جداً.";
    return null;
  }

  /* ---------------- Lazy loading: pdf-lib ---------------- */
  var pdfLibPromise = null;
  function loadPdfLib() {
    if (global.PDFLib) return Promise.resolve(global.PDFLib);
    if (!pdfLibPromise) {
      pdfLibPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js";
        s.onload = function () { resolve(global.PDFLib); };
        s.onerror = function () { reject(new Error("تعذر تحميل مكتبة معالجة PDF.")); };
        document.head.appendChild(s);
      });
    }
    return pdfLibPromise;
  }

  /* ---------------- Lazy loading: JSZip (لتوقيع Word/PowerPoint) ---------------- */
  var jsZipPromise = null;
  function loadJSZip() {
    if (global.JSZip) return Promise.resolve(global.JSZip);
    if (!jsZipPromise) {
      jsZipPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js";
        s.onload = function () { resolve(global.JSZip); };
        s.onerror = function () { reject(new Error("تعذر تحميل مكتبة معالجة ملفات Office.")); };
        document.head.appendChild(s);
      });
    }
    return jsZipPromise;
  }

  /* ---------------- شعار UNEM كعلامة مائية شفافة ---------------- */
  var watermarkPromise = null;
  function getWatermarkBytes() {
    if (!watermarkPromise) {
      watermarkPromise = (async function () {
        var res = await fetch("/logo.png");
        if (!res.ok) throw new Error("لم يتم العثور على شعار UNEM (logo.png).");
        var buf = await res.arrayBuffer();
        var bitmap = await createImageBitmap(new Blob([buf], { type: "image/png" }));
        var canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var data = imageData.data;
        var WHITE_THRESHOLD = 235; // إزالة الخلفية البيضاء كلياً
        var WATERMARK_ALPHA = 100; // خطوط الشعار تبقى واضحة دون حجب النص
        for (var i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) {
            // البكسل شفاف أصلاً خارج دائرة الشعار — يبقى شفافاً (هذا ما كان يسبب المربع الرمادي)
            continue;
          }
          if (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD) {
            data[i + 3] = 0;
          } else {
            data[i + 3] = WATERMARK_ALPHA;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        var blob = await new Promise(function (r) { canvas.toBlob(r, "image/png"); });
        return new Uint8Array(await blob.arrayBuffer());
      })().catch(function (err) {
        watermarkPromise = null;
        throw err;
      });
    }
    return watermarkPromise;
  }

  /** توقيع ملف PDF بشعار UNEM مع الحفاظ على المحتوى والجودة */
  async function signPdfBlob(blob) {
    var PDFLibRef = await loadPdfLib();
    var watermarkBytes = await getWatermarkBytes();
    var PDFDocument = PDFLibRef.PDFDocument;
    var bytes = await blob.arrayBuffer();
    var pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    var stamp = await pdfDoc.embedPng(watermarkBytes);
    pdfDoc.getPages().forEach(function (page) {
      var size = page.getSize();
      var dims = stamp.scale(0.5);
      var maxWidth = size.width * 0.6;
      if (dims.width > maxWidth) {
        var factor = maxWidth / dims.width;
        dims = { width: dims.width * factor, height: dims.height * factor };
      }
      page.drawImage(stamp, {
        x: (size.width - dims.width) / 2,
        y: (size.height - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
    });
    var out = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
    return new Blob([out], { type: "application/pdf" });
  }

  /** تحسين حجم PDF دون المساس بالنص أو الصفحات (إعادة حفظ فقط) */
  async function optimizePdfBlob(blob) {
    try {
      var PDFLibRef = await loadPdfLib();
      var doc = await PDFLibRef.PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
      var out = await doc.save({ useObjectStreams: true, addDefaultPage: false });
      var next = new Blob([out], { type: "application/pdf" });
      return next.size < blob.size ? next : blob;
    } catch (_) {
      return blob;
    }
  }

  /* =====================================================================
     توقيع Word (.docx) و PowerPoint (.pptx) بشعار UNEM كعلامة مائية
     ---------------------------------------------------------------------
     ملفات docx/pptx هي حزم OOXML (أرشيف ZIP يحوي ملفات XML). نستعمل
     JSZip لفتح الحزمة، إدراج صورة الشعار الشفافة، وربطها كعلامة مائية:
       • Word: عبر رأس الصفحة (header) — يتكرر تلقائياً في كل صفحات المستند.
       • PowerPoint: عبر القالب الرئيسي (slideMaster) — يظهر خلف كل شريحة.
     أي فشل في المعالجة يُرجع الملف الأصلي دون تعديل (لا كسر لأي ملف).
     ===================================================================== */

  var OOXML_NS = {
    w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    a: "http://schemas.openxmlformats.org/drawingml/2006/main",
    pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  };

  /** يضمن وجود إعلانات xmlns اللازمة على الوسم الجذري (دون حذف أي إعلان موجود) */
  function ensureXmlNamespaces(xml, rootTagName, nsMap) {
    var re = new RegExp("<" + rootTagName + "\\b[^>]*>");
    var m = re.exec(xml);
    if (!m) return xml;
    var tag = m[0];
    var additions = "";
    for (var prefix in nsMap) {
      var attr = "xmlns:" + prefix + "=";
      if (tag.indexOf(attr) === -1) additions += " xmlns:" + prefix + '="' + nsMap[prefix] + '"';
    }
    if (!additions) return xml;
    var selfClosing = /\/>$/.test(tag);
    var newTag = selfClosing
      ? tag.slice(0, -2) + additions + "/>"
      : tag.slice(0, -1) + additions + ">";
    return xml.slice(0, m.index) + newTag + xml.slice(m.index + tag.length);
  }

  /** أول رقم rId متاح غير مستخدم في ملف علاقات (rels) */
  function nextFreeRelId(relsXml) {
    var used = [], re = /Id="rId(\d+)"/g, m;
    while ((m = re.exec(relsXml))) used.push(parseInt(m[1], 10));
    return "rId" + (used.length ? Math.max.apply(null, used) + 1 : 1);
  }

  /** يقرأ Target لعلاقة Id معيّنة من ملف rels */
  function relTargetFor(relsXml, rid) {
    var re1 = new RegExp('<Relationship[^>]*Id="' + rid + '"[^>]*Target="([^"]+)"');
    var m = re1.exec(relsXml);
    if (m) return m[1];
    var re2 = new RegExp('<Relationship[^>]*Target="([^"]+)"[^>]*Id="' + rid + '"');
    m = re2.exec(relsXml);
    return m ? m[1] : null;
  }

  function emptyRelsXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
    );
  }

  /** فقرة Word تحوي صورة عائمة خلف النص، مُوسّطة على الصفحة (علامة مائية) */
  function buildDocxWatermarkParagraph(rid) {
    var size = 3600000; // ≈ 3.9 بوصة، حجم متوازن كعلامة مائية مركزية
    var docPrId = 809991;
    return (
      '<w:p><w:r><w:rPr/><w:drawing>' +
      '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" ' +
      'behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">' +
      '<wp:simplePos x="0" y="0"/>' +
      '<wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH>' +
      '<wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV>' +
      '<wp:extent cx="' + size + '" cy="' + size + '"/>' +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:wrapNone/>' +
      '<wp:docPr id="' + docPrId + '" name="UNEM_Watermark"/>' +
      '<wp:cNvGraphicFramePr/>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + docPrId + '" name="UNEM_Watermark"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + size + '" cy="' + size + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>'
    );
  }

  /** توقيع ملف Word (.docx) — يضيف شعار UNEM كعلامة مائية في رأس كل صفحة */
  async function signDocxBlob(blob) {
    var JSZipRef = await loadJSZip();
    var watermarkBytes = await getWatermarkBytes();
    var zip = await JSZipRef.loadAsync(await blob.arrayBuffer());

    var docXmlPath = "word/document.xml";
    var docXmlFile = zip.file(docXmlPath);
    var relsPath = "word/_rels/document.xml.rels";
    var ctPath = "[Content_Types].xml";
    if (!docXmlFile || !zip.file(ctPath)) return blob; // بنية غير متوقعة — لا نخاطر بكسر الملف

    var docXml = await docXmlFile.async("string");
    var relsFile = zip.file(relsPath);
    var relsXml = relsFile ? await relsFile.async("string") : emptyRelsXml();
    var ctXml = await zip.file(ctPath).async("string");

    var mediaName = "media/unem_watermark.png";
    var sectPrRegex = /<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g;
    var sections = docXml.match(sectPrRegex) || [];
    if (!sections.length) return blob;

    var mediaAdded = false;
    var newRelEntries = "";
    var newHeaderIndex = 1;
    var touched = false;

    for (var i = 0; i < sections.length; i++) {
      var sect = sections[i];
      var refMatch = /<w:headerReference[^>]*w:type="default"[^>]*r:id="(rId\d+)"[^>]*\/>/.exec(sect);

      if (refMatch) {
        // يوجد رأس صفحة افتراضي بالفعل — أضف العلامة المائية إلى نهايته دون حذف أي محتوى
        var target = relTargetFor(relsXml, refMatch[1]);
        if (!target) continue;
        var headerFileName = target.replace(/^.*\//, "");
        var headerPath = "word/" + headerFileName;
        var headerFile = zip.file(headerPath);
        if (!headerFile) continue;

        var headerXml = await headerFile.async("string");
        headerXml = ensureXmlNamespaces(headerXml, "w:hdr", OOXML_NS);
        var headerRelsPath = "word/_rels/" + headerFileName + ".rels";
        var headerRelsFile = zip.file(headerRelsPath);
        var headerRelsXml = headerRelsFile ? await headerRelsFile.async("string") : emptyRelsXml();

        if (!mediaAdded) { zip.file("word/" + mediaName, watermarkBytes); mediaAdded = true; }
        var imgRid = nextFreeRelId(headerRelsXml);
        headerRelsXml = headerRelsXml.replace(
          "</Relationships>",
          '<Relationship Id="' + imgRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + mediaName + '"/></Relationships>',
        );
        headerXml = headerXml.replace("</w:hdr>", buildDocxWatermarkParagraph(imgRid) + "</w:hdr>");

        zip.file(headerPath, headerXml);
        zip.file(headerRelsPath, headerRelsXml);
        touched = true;
      } else {
        // لا يوجد رأس صفحة افتراضي لهذا القسم — أنشئ رأساً جديداً واربطه به
        var fileName = "header" + newHeaderIndex + ".xml";
        while (zip.file("word/" + fileName)) { newHeaderIndex++; fileName = "header" + newHeaderIndex + ".xml"; }
        newHeaderIndex++;

        if (!mediaAdded) { zip.file("word/" + mediaName, watermarkBytes); mediaAdded = true; }

        var newHeaderRelId = "rId1";
        var newHeaderRelsXml =
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="' + newHeaderRelId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + mediaName + '"/>' +
          '</Relationships>';
        var newHeaderXml =
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:hdr xmlns:w="' + OOXML_NS.w + '" xmlns:r="' + OOXML_NS.r + '" xmlns:wp="' + OOXML_NS.wp +
          '" xmlns:a="' + OOXML_NS.a + '" xmlns:pic="' + OOXML_NS.pic + '">' +
          buildDocxWatermarkParagraph(newHeaderRelId) +
          '</w:hdr>';

        zip.file("word/" + fileName, newHeaderXml);
        zip.file("word/_rels/" + fileName + ".rels", newHeaderRelsXml);

        var docRelId = nextFreeRelId(relsXml + newRelEntries);
        newRelEntries +=
          '<Relationship Id="' + docRelId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="' + fileName + '"/>';

        var headerRef = '<w:headerReference w:type="default" r:id="' + docRelId + '"/>';
        var updatedSect = sect.replace(/^(<w:sectPr\b[^>]*>)/, "$1" + headerRef);
        if (updatedSect !== sect) { docXml = docXml.replace(sect, updatedSect); touched = true; }

        if (!/ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.header\+xml"/.test(ctXml)) {
          ctXml = ctXml.replace(
            "</Types>",
            '<Override PartName="/word/' + fileName + '" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>',
          );
        } else {
          ctXml = ctXml.replace(
            "</Types>",
            '<Override PartName="/word/' + fileName + '" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>',
          );
        }
      }
    }

    if (!touched) return blob; // لم نجد أي قسم قابل للتوقيع دون مخاطرة — أعده كما هو

    if (!/Extension="png"/i.test(ctXml)) {
      ctXml = ctXml.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
    }
    if (newRelEntries) relsXml = relsXml.replace("</Relationships>", newRelEntries + "</Relationships>");

    zip.file(docXmlPath, docXml);
    zip.file(relsPath, relsXml);
    zip.file(ctPath, ctXml);

    return zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }

  /** شكل PowerPoint (p:pic) يحمل صورة الشعار، يُدرج في القالب الرئيسي فيظهر خلف كل شريحة */
  function buildPptxWatermarkPic(rid, x, y, size, id) {
    return (
      '<p:pic><p:nvPicPr><p:cNvPr id="' + id + '" name="UNEM_Watermark"/>' +
      '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + size + '" cy="' + size + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
    );
  }

  /** توقيع ملف PowerPoint (.pptx) — يضيف شعار UNEM كعلامة مائية خلف كل شريحة عبر القالب الرئيسي */
  async function signPptxBlob(blob) {
    var JSZipRef = await loadJSZip();
    var watermarkBytes = await getWatermarkBytes();
    var zip = await JSZipRef.loadAsync(await blob.arrayBuffer());

    var masterPaths = Object.keys(zip.files).filter(function (p) {
      return /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(p);
    });
    if (!masterPaths.length) return blob;

    var ctPath = "[Content_Types].xml";
    if (!zip.file(ctPath)) return blob;
    var ctXml = await zip.file(ctPath).async("string");
    if (!/Extension="png"/i.test(ctXml)) {
      ctXml = ctXml.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
    }

    var slideCx = 12192000, slideCy = 6858000; // افتراضي 16:9 إن تعذّرت القراءة
    var presFile = zip.file("ppt/presentation.xml");
    if (presFile) {
      var presXml = await presFile.async("string");
      var szMatch = /<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/.exec(presXml);
      if (szMatch) { slideCx = parseInt(szMatch[1], 10); slideCy = parseInt(szMatch[2], 10); }
    }
    var wmSize = Math.round(Math.min(slideCx, slideCy) * 0.55);
    var wmX = Math.round((slideCx - wmSize) / 2);
    var wmY = Math.round((slideCy - wmSize) / 2);

    var mediaName = "media/unem_watermark.png";
    zip.file("ppt/" + mediaName, watermarkBytes);

    var touched = false;
    for (var i = 0; i < masterPaths.length; i++) {
      var masterPath = masterPaths[i];
      var masterFile = masterPath.split("/").pop();
      var relsPath = "ppt/slideMasters/_rels/" + masterFile + ".rels";
      var relsFile = zip.file(relsPath);
      var relsXml = relsFile ? await relsFile.async("string") : emptyRelsXml();
      var rid = nextFreeRelId(relsXml);
      relsXml = relsXml.replace(
        "</Relationships>",
        '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../' + mediaName + '"/></Relationships>',
      );

      var masterXml = await zip.file(masterPath).async("string");
      var spTreeMatch = /(<p:spTree>)([\s\S]*?)(<\/p:spTree>)/.exec(masterXml);
      if (!spTreeMatch) continue;

      var picXml = buildPptxWatermarkPic(rid, wmX, wmY, wmSize, 900001 + i);
      var grpEnd = /<\/p:grpSpPr>/.exec(spTreeMatch[2]);
      var innerContent = grpEnd
        ? spTreeMatch[2].slice(0, grpEnd.index + grpEnd[0].length) + picXml + spTreeMatch[2].slice(grpEnd.index + grpEnd[0].length)
        : picXml + spTreeMatch[2];

      masterXml =
        masterXml.slice(0, spTreeMatch.index) +
        spTreeMatch[1] + innerContent + spTreeMatch[3] +
        masterXml.slice(spTreeMatch.index + spTreeMatch[0].length);

      zip.file(masterPath, masterXml);
      zip.file(relsPath, relsXml);
      touched = true;
    }

    if (!touched) return blob;
    zip.file(ctPath, ctXml);

    return zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }

  /** ضغط ذكي للصور: لا يلمس الصور الصغيرة إطلاقاً */
  async function compressImage(file) {
    if (file.size <= IMAGE_COMPRESS_THRESHOLD) return { blob: file, mime: file.type || infoFor(file.name).mime, ext: extOf(file.name) };
    var bitmap = await createImageBitmap(file);
    var scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    var quality = 0.9;
    var best = null;
    for (var attempt = 0; attempt < 8; attempt++) {
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      var ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      best = await new Promise(function (r) { canvas.toBlob(r, "image/jpeg", quality); });
      if (best && best.size <= IMAGE_COMPRESS_THRESHOLD) break;
      if (quality > 0.6) quality -= 0.08;
      else scale *= 0.85;
    }
    if (!best || best.size >= file.size) {
      return { blob: file, mime: file.type || infoFor(file.name).mime, ext: extOf(file.name) };
    }
    return { blob: best, mime: "image/jpeg", ext: "jpg" };
  }

  /** تحويل صورة إلى PDF بحجم صفحة مناسب ثم إعادة استخدامها في مسار توقيع PDF. */
  async function imageToPdfBlob(blob, mime) {
    var PDFLibRef = await loadPdfLib();
    var PDFDocument = PDFLibRef.PDFDocument;
    var pdfDoc = await PDFDocument.create();
    var imageBytes = new Uint8Array(await blob.arrayBuffer());
    var image = String(mime || '').toLowerCase() === 'image/png'
      ? await pdfDoc.embedPng(imageBytes)
      : await pdfDoc.embedJpg(imageBytes);

    // A4 بالنقاط مع الحفاظ الكامل على نسبة الصورة وعدم قصها.
    var pageW = 595.28;
    var pageH = 841.89;
    var page = pdfDoc.addPage([pageW, pageH]);
    var margin = 24;
    var maxW = pageW - margin * 2;
    var maxH = pageH - margin * 2;
    var dims = image.scale(1);
    var scale = Math.min(maxW / dims.width, maxH / dims.height);
    var w = dims.width * scale;
    var h = dims.height * scale;
    page.drawImage(image, {
      x: (pageW - w) / 2,
      y: (pageH - h) / 2,
      width: w,
      height: h,
    });

    var bytes = await pdfDoc.save({ useObjectStreams: true });
    return new Blob([bytes], { type: 'application/pdf' });
  }

  /**
   * معالجة ملف قبل الرفع.
   * PDF              → توقيع UNEM + تحسين الحجم عند الحاجة.
   * Word (.docx)      → توقيع UNEM كعلامة مائية في رأس الصفحة.
   * PowerPoint (.pptx) → توقيع UNEM كعلامة مائية خلف كل شريحة.
   * صورة              → ضغط اختياري → تحويل إلى PDF → توقيع UNEM.
   * Excel و صيغ Office القديمة (.doc/.ppt) → تُترك كما هي دون أي تعديل.
   */
  async function prepareFile(file, options) {
    var opts = options || {};
    var info = infoFor(file.name);
    if (!info) throw new Error("نوع الملف غير مدعوم.");
    var result = {
      blob: file,
      ext: extOf(file.name),
      mime: file.type || info.mime,
      kind: info.kind,
      resourceType: info.resourceType,
      signed: false,
      originalName: file.name,
      originalSize: file.size,
    };

    if (info.kind === "pdf") {
      if (opts.sign !== false) {
        try {
          result.blob = await signPdfBlob(file);
          result.signed = true;
        } catch (err) {
          console.warn("[UNEMUpload] تعذر توقيع الملف، سيتم رفعه كما هو:", err && err.message);
          result.blob = file;
        }
      }
      if (result.blob.size > PDF_COMPRESS_THRESHOLD) {
        result.blob = await optimizePdfBlob(result.blob);
      }
      result.mime = "application/pdf";
    } else if (info.kind === "image") {
      var compressed = await compressImage(file);
      var imagePdf = await imageToPdfBlob(compressed.blob, compressed.mime);
      result.blob = imagePdf;
      result.mime = "application/pdf";
      result.ext = "pdf";
      result.resourceType = "raw";
      if (opts.sign !== false) {
        try {
          result.blob = await signPdfBlob(imagePdf);
          result.signed = true;
        } catch (err) {
          console.warn("[UNEMUpload] تعذر توقيع PDF الناتج من الصورة، سيتم رفعه بدون العلامة:", err && err.message);
          result.blob = imagePdf;
        }
      }
      if (result.blob.size > PDF_COMPRESS_THRESHOLD) {
        result.blob = await optimizePdfBlob(result.blob);
      }
    } else if (info.kind === "word" && result.ext === "docx") {
      if (opts.sign !== false) {
        try {
          result.blob = await signDocxBlob(file);
          result.signed = true;
        } catch (err) {
          console.warn("[UNEMUpload] تعذر توقيع ملف Word، سيتم رفعه كما هو:", err && err.message);
          result.blob = file;
        }
      }
      result.mime = info.mime;
    } else if (info.kind === "powerpoint" && result.ext === "pptx") {
      if (opts.sign !== false) {
        try {
          result.blob = await signPptxBlob(file);
          result.signed = true;
        } catch (err) {
          console.warn("[UNEMUpload] تعذر توقيع ملف PowerPoint، سيتم رفعه كما هو:", err && err.message);
          result.blob = file;
        }
      }
      result.mime = info.mime;
    } else {
      // Excel، و Word/PowerPoint بصيغتهما القديمة (.doc/.ppt) — لا معالجة ولا ضغط
      result.mime = info.mime;
    }

    result.size = result.blob.size;
    return result;
  }

  /** طلب توقيع الرفع من الخادم (الصلاحيات تُتحقَّق هناك) */
  async function requestSignature(meta, token) {
    var res = await fetch("/api/public/cloudinary/sign", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(meta),
    });
    var data = await res.json().catch(function () { return null; });
    if (!res.ok) throw new Error((data && data.error) || "❌ تعذر بدء الرفع (صلاحية أو إعدادات الخادم).");
    return data;
  }

  /** رفع مباشر إلى Cloudinary بتوقيع الخادم مع متابعة التقدم */
  function uploadSigned(signature, blob, fileName, onProgress) {
    return new Promise(function (resolve, reject) {
      var form = new FormData();
      form.append("file", blob, fileName);
      form.append("api_key", signature.apiKey);
      form.append("timestamp", signature.timestamp);
      form.append("signature", signature.signature);
      form.append("folder", signature.folder);
      form.append("public_id", signature.publicId);

      var xhr = new XMLHttpRequest();
      xhr.open("POST", signature.uploadUrl, true);
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = function () {
        var body = null;
        try { body = JSON.parse(xhr.responseText); } catch (_) { body = null; }
        if (xhr.status >= 200 && xhr.status < 300 && body && body.secure_url) { resolve(body); return; }
        var msg = (body && body.error && body.error.message) || "فشل الرفع إلى Cloudinary.";
        if (/pdf|zip|not allowed|untrusted/i.test(msg)) {
          msg = "Cloudinary يمنع تسليم هذا النوع حالياً. فعّل «Allow delivery of PDF and ZIP files» من إعدادات Security في Cloudinary.";
        }
        reject(new Error(msg));
      };
      xhr.onerror = function () { reject(new Error("انقطع الاتصال أثناء الرفع.")); };
      xhr.onabort = function () { reject(new Error("تم إلغاء الرفع.")); };
      xhr.send(form);
    });
  }

  /* ---------------- العرض: فتح الملف بالعارض المناسب ---------------- */
  function officeViewerUrl(url) {
    return "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(url);
  }
  function googleViewerUrl(url) {
    return "https://docs.google.com/gview?embedded=true&url=" + encodeURIComponent(url);
  }
  /** العارض المناسب حسب نوع الملف — الصور تُعرض مباشرة */
  function viewerUrlFor(fileName, absUrl) {
    var info = infoFor(fileName);
    var kind = info ? info.kind : "pdf";
    if (kind === "image") return absUrl;
    if (kind === "pdf") return googleViewerUrl(absUrl);
    return officeViewerUrl(absUrl);
  }

  global.UNEMUpload = {
    MAX_UPLOAD_SIZE: MAX_UPLOAD_SIZE,
    ACCEPT_ATTR: ACCEPT_ATTR,
    TYPES: TYPES,
    extOf: extOf,
    infoFor: infoFor,
    isSupported: isSupported,
    validateFile: validateFile,
    prepareFile: prepareFile,
    signPdfBlob: signPdfBlob,
    signDocxBlob: signDocxBlob,
    signPptxBlob: signPptxBlob,
    optimizePdfBlob: optimizePdfBlob,
    compressImage: compressImage,
    requestSignature: requestSignature,
    uploadSigned: uploadSigned,
    viewerUrlFor: viewerUrlFor,
    officeViewerUrl: officeViewerUrl,
    googleViewerUrl: googleViewerUrl,
  };
})(window);
