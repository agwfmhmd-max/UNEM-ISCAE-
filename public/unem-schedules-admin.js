/* UNEM ISCAE — إدارة الجداول الدراسية (مشتركة بين لوحة المشرف الرئيسية وصفحة الجداول) */

/* محلل الجداول الدراسية: يحوّل عناصر نص PDF (مع الإحداثيات) إلى جداول منظمة */
(function(root){
  var DAYS=['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI','DIMANCHE'];
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’`]/g,"'").replace(/\s+/g,' ').trim();}
  var SPEC_MAP=[
    [/banques? et assurances?/,'BA'],
    [/developpement informatique/,'DI'],
    [/reseaux? informatiques? et telecommunications?/,'RIT'],
    [/informatique de gestion/,'IG'],
    [/finance et comptabilite/,'FC'],
    [/gestion des ressources humaines/,'GRH'],
    [/statistiques? appliquees? a l'economie/,'SAE'],
    [/techniques? commerciales? et marketing/,'TCM']
  ];
  function specFromName(name){var n=norm(name);for(var i=0;i<SPEC_MAP.length;i++){if(SPEC_MAP[i][0].test(n))return SPEC_MAP[i][1];}return '';}
  function parseHeader(text){
    var m=String(text).match(/Profil\s*:\s*(.+)$/);
    var raw=(m?m[1]:String(text).replace(/^.*Profil\s*:/,'')).replace(/[^\u0020-\u024F\u2019]+/g,' ').replace(/\(cid:\d+\)/g,' ').replace(/(?:\s*:\s*)+$/,'').replace(/\s+/g,' ').trim().replace(/(?:\s*:\s*)+$/,'').trim();
    var level='',rest=raw;
    var lm=raw.match(/^(\d)\s*(?:ère|ere|ème|eme|e|re|er)?\s*ann[ée]e\s+(.*)$/i);
    if(lm){level='L'+lm[1];rest=lm[2];}
    else{var mm=raw.match(/^(?:master\s*|M)(\d)\s*(?:ann[ée]e)?\s*(.*)$/i);if(mm){level='M'+mm[1];rest=mm[2];}}
    var group='';
    var gm=rest.match(/[\s-]+(G\s?\d+)\s*$/i);
    if(gm){group=gm[1].replace(/\s/g,'').toUpperCase();rest=rest.slice(0,gm.index);}
    else{var fm=rest.match(/[\s-]+(FP|FC|FA)\s*$/);if(fm&&/-\s*FP$|\sFP$/.test(rest)){group='FP';rest=rest.slice(0,fm.index);}}
    rest=rest.trim();
    return {raw:raw,level:level,profile:rest,group:group,spec:specFromName(rest)};
  }
  function splitCell(text){
    var t=text.replace(/\s+/g,' ').replace(/\s+,/g,' ,').trim();
    var parts=t.split(/\s*,\s*/).map(function(x){return x.trim();});
    // إزالة الفواصل المتكررة الفارغة (مثل: "II , , 16")
    var clean=[];parts.forEach(function(p,i){if(p===''&&i>0)return;clean.push(p);});
    var subject=clean[0]||'',room='',teacher='';
    if(clean.length>=3){room=clean[1];teacher=clean.slice(2).join(', ');}
    else if(clean.length===2){room=clean[1];}
    return {subject:subject,room:room,teacher:teacher,raw:t,ok:clean.length>=3};
  }
  /* items: [{str,x,y,w}] — y يزيد نحو الأعلى (إحداثيات PDF) */
  function parsePage(items,pageNum){
    var its=items.filter(function(i){return i.str&&i.str.trim();});
    var headerItem=its.filter(function(i){return /Profil\s*:/i.test(i.str);})[0];
    /* PDF.js قد يعيد سطر Profil كعدة عناصر منفصلة؛ نجمع العناصر الموجودة على السطر نفسه. */
    var headerText=headerItem?its.filter(function(i){return Math.abs(i.y-headerItem.y)<4;}).sort(function(a,b){return a.x-b.x;}).map(function(i){return i.str;}).join(' '):its.map(function(i){return i.str;}).join(' ');
    if(!/Profil\s*:/i.test(headerText))return null;
    var hdr=parseHeader(headerText);
    var yearItem=its.filter(function(i){return /^\s*\d{4}\s*\/\s*\d{4}\s*$/.test(i.str);})[0];
    var year=yearItem?yearItem.str.replace(/\s/g,'').replace('/','-'):'';
    var semester='';
    var semItem=its.filter(function(i){return /Semestres?\s*(Impairs?|Pairs?)/i.test(i.str);})[0];
    if(semItem)semester=/impair/i.test(semItem.str)?'impair':'pair';
    else{
      /* PDF.js قد يقسم «Semestres Impairs» إلى عدة عناصر: نجمع نص الصفحة كاملاً ونبحث فيه */
      var allTxt=its.slice().sort(function(a,b){return Math.abs(b.y-a.y)>3?b.y-a.y:a.x-b.x;}).map(function(i){return i.str;}).join(' ').replace(/\s+/g,'');
      var sm=allTxt.match(/Semestres?(Impairs?|Pairs?)/i);
      if(sm)semester=/^impair/i.test(sm[1])?'impair':'pair';
    }
    // رؤوس الأيام
    var dayCols=[];
    DAYS.forEach(function(d){var it=its.filter(function(i){return norm(i.str).toUpperCase()===d || new RegExp('(?:^|\\s)'+d+'(?:$|\\s)','i').test(String(i.str||'').trim());})[0];if(it)dayCols.push({day:d,cx:it.x+it.w/2,y:it.y});});
    if(!dayCols.length)return null;
    var headerY=dayCols[0].y;
    // تسميات الأوقات
    var timePattern=/^\d{1,2}h(?:\d{2})?\s*-\s*\d{1,2}h(?:\d{2})?$/i;
    var times=its.filter(function(i){return timePattern.test(i.str.replace(/\s+/g,'').trim())&&i.y<headerY;}).sort(function(a,b){return b.y-a.y;});
    if(!times.length)return null;
    var rowH=times.length>1?(times[0].y-times[1].y):60;
    var minY=times[times.length-1].y-rowH+6;
    var cells={};
    its.forEach(function(i){
      if(i.y>=headerY-2)return;               // ما فوق رؤوس الأيام
      if(i.y<minY)return;                     // تذييل الصفحة
      if(timePattern.test(i.str.replace(/\s+/g,'').trim()))return;
      var cx=i.x+i.w/2,best=0,bd=1e9;
      dayCols.forEach(function(c,k){var d=Math.abs(c.cx-cx);if(d<bd){bd=d;best=k;}});
      if(i.x+i.w<dayCols[0].cx-60)return;     // عمود التوقيت
      var r=0;for(var k=0;k<times.length;k++){if(times[k].y+3>=i.y){r=k;}else break;}
      var key=r+'|'+best;(cells[key]=cells[key]||[]).push(i);
    });
    var rows=[],warnings=[];
    Object.keys(cells).forEach(function(key){
      var p=key.split('|'),r=+p[0],c=+p[1];
      var arr=cells[key].sort(function(a,b){return Math.abs(b.y-a.y)>3?b.y-a.y:a.x-b.x;});
      var text=arr.reduce(function(acc,a){var t=a.str.trim();return acc===''?t:(/-$/.test(acc)?acc+t:acc+' '+t);},'');
      var s=splitCell(text);
      var row={day:dayCols[c].day,time:times[r].str.replace(/\s/g,''),subject:s.subject,room:s.room,teacher:s.teacher};
      if(!s.ok)warnings.push(row.day+' '+row.time+': '+text);
      row._r=r;row._c=c;rows.push(row);
    });
    rows.sort(function(a,b){return a._c-b._c||a._r-b._r;});
    // ترتيب أيام الأسبوع
    rows.forEach(function(r){delete r._r;delete r._c;});
    return {page:pageNum,year:year,semester:semester,header:hdr,rows:rows,warnings:warnings};
  }
  root.UNEMSchedParser={parsePage:parsePage,parseHeader:parseHeader,specFromName:specFromName,splitCell:splitCell,DAYS:DAYS};
  if(typeof module!=='undefined')module.exports=root.UNEMSchedParser;
})(typeof window!=='undefined'?window:globalThis);


var USA_CSS="\n/* ===== إدارة الجداول الدراسية داخل لوحة المشرف الرئيسي ===== */\n.usa-wrap{grid-template-columns:minmax(0,1fr)}\n.usa-card,.usa-item,.usa-item-head>div,.usa-detail,.usa-li-main{min-width:0;max-width:100%}\n.usa-items,.usa-list{grid-template-columns:minmax(0,1fr)}\n.usa-item-head{grid-template-columns:auto minmax(0,1fr)}\n.usa-item-fields>*{min-width:0}\n.usa-wrap{display:grid;gap:16px;text-align:right;direction:rtl}\n.usa-card{background:var(--card-bg,#ffffff);border:1px solid var(--border-color,#e2e8f0);border-radius:18px;padding:clamp(12px,2.5vw,20px);box-shadow:var(--shadow-sm,0 2px 8px rgba(15,23,42,.06))}\n.usa-card h3{margin:0 0 6px;font-size:1.05rem;color:var(--primary-color,#0f5132);font-weight:900}\n.usa-hint{font-size:.78rem;color:var(--text-secondary,#64748b);line-height:1.7;margin:0 0 12px}\n.usa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;margin-bottom:10px}\n.usa-f label{display:block;font-size:.76rem;font-weight:800;color:var(--text-secondary,#64748b);margin:0 0 5px}\n.usa-f input,.usa-f select{width:100%;padding:10px 12px;border:1px solid var(--border-color,#e2e8f0);border-radius:12px;background:var(--bg-color,#f8fafc);color:var(--text-primary,#0f172a);font:inherit;font-size:.9rem}\n.usa-chk{display:flex;align-items:flex-start;gap:8px;font-size:.84rem;font-weight:700;margin:8px 0;cursor:pointer;color:var(--text-primary,#0f172a)}\n.usa-chk input{width:18px;height:18px;margin-top:2px;accent-color:#198754;flex:none}\n.usa-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}\n.usa-btn{border:0;border-radius:12px;padding:10px 16px;font:inherit;font-size:.86rem;font-weight:800;cursor:pointer;background:#e2e8f0;color:#1e293b;min-height:40px}\n.usa-btn.p{background:linear-gradient(135deg,#0f5132,#198754);color:#fff}\n.usa-btn.b{background:#2563eb;color:#fff}\n.usa-btn.d{background:#fee2e2;color:#b91c1c}\n.usa-btn.g{background:#f8efd1;color:#7c5a00}\n.usa-btn.s{padding:7px 11px;min-height:34px;font-size:.78rem}\n.usa-btn:disabled{opacity:.55;cursor:not-allowed}\nbody.dark-mode .usa-btn{background:#334155;color:#f1f5f9}\nbody.dark-mode .usa-btn.p{background:linear-gradient(135deg,#047857,#10b981)}\n.usa-status{display:none;margin-top:10px;padding:10px 12px;border-radius:12px;font-size:.82rem;font-weight:800;line-height:1.6;white-space:pre-line}\n.usa-status.show{display:block}\n.usa-status.ok{background:#dcfce7;color:#166534}.usa-status.err{background:#fee2e2;color:#991b1b}.usa-status.info{background:#e0f2fe;color:#075985}.usa-status.warn{background:#fef3c7;color:#92400e}\n.usa-items{display:grid;gap:10px;margin-top:12px}\n.usa-item{border:1px solid var(--border-color,#e2e8f0);border-radius:14px;padding:11px;background:var(--bg-color,#f8fafc)}\n.usa-item.off{opacity:.6}\n.usa-item-head{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start}\n.usa-item-head>input[type=checkbox]{width:20px;height:20px;margin-top:8px;accent-color:#198754}\n.usa-item-fields{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px}\n.usa-item-fields input,.usa-item-fields select{width:100%;padding:8px 10px;border:1px solid var(--border-color,#e2e8f0);border-radius:10px;background:var(--card-bg,#ffffff);color:var(--text-primary,#0f172a);font:inherit;font-size:.84rem;min-width:0}\n.usa-item-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;font-size:.74rem;font-weight:800}\n.usa-tag{padding:2px 9px;border-radius:99px;background:rgba(25,135,84,.14);color:var(--primary-color,#0f5132)}\n.usa-tag.new{background:#dbeafe;color:#1d4ed8}.usa-tag.rep{background:#fef3c7;color:#92400e}.usa-tag.bad{background:#fee2e2;color:#b91c1c}\n.usa-detail{margin-top:10px}\n.usa-rows{display:grid;gap:7px}\n.usa-row{display:grid;grid-template-columns:1.1fr 1fr 2.6fr 1fr 1.8fr auto;gap:6px;align-items:center}\n.usa-row input,.usa-row select{width:100%;min-width:0;padding:8px 9px;border:1px solid var(--border-color,#e2e8f0);border-radius:10px;background:var(--card-bg,#ffffff);color:var(--text-primary,#0f172a);font:inherit;font-size:.82rem}\n.usa-gridwrap{overflow-x:auto;margin-top:10px;border:1px solid var(--border-color,#e2e8f0);border-radius:12px;-webkit-overflow-scrolling:touch}\n.usa-table{border-collapse:collapse;width:100%;min-width:640px;font-size:.74rem}\n.usa-table th,.usa-table td{border:1px solid var(--border-color,#e2e8f0);padding:6px;vertical-align:top;text-align:center}\n.usa-table th{background:rgba(25,135,84,.12);color:var(--primary-color,#0f5132);font-weight:900}\n.usa-table td b{display:block;font-size:.76rem}.usa-table td small{display:block;color:var(--text-secondary,#64748b)}\n.usa-list{display:grid;gap:8px;margin-top:10px}\n.usa-li{border:1px solid var(--border-color,#e2e8f0);border-radius:14px;padding:10px 12px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--bg-color,#f8fafc)}\n.usa-li.off{opacity:.65}\n.usa-li-main{flex:1 1 220px;min-width:0}.usa-li-main b{display:block;font-size:.88rem;overflow-wrap:anywhere}.usa-li-main small{color:var(--text-secondary,#64748b);font-size:.74rem}\n.usa-li-act{display:flex;flex-wrap:wrap;gap:6px}\n.usa-filter{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px;margin-top:6px}\n.usa-empty{padding:18px;text-align:center;color:var(--text-secondary,#64748b);font-weight:700;font-size:.85rem}\n@media(max-width:760px){\n  .usa-item-fields{grid-template-columns:1fr 1fr}.usa-item-fields>:first-child{grid-column:1/-1}\n  .usa-row{grid-template-columns:1fr 1fr}.usa-row .usa-subj{grid-column:1/-1}.usa-row .usa-teach{grid-column:1/-1}\n}\n\n.usa-days{display:flex;gap:6px;overflow-x:auto;padding:2px 0 8px;-webkit-overflow-scrolling:touch}\n.usa-day{flex:1 0 auto;min-width:72px;position:relative;border:1px solid var(--border-color,#e2e8f0);background:var(--card-bg,#fff);color:var(--text-primary,#0f172a);border-radius:12px;padding:7px 10px;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:1px}\n.usa-day b{font-size:.82rem}.usa-day small{font-size:.6rem;color:var(--text-secondary,#64748b);font-weight:700}\n.usa-day i{position:absolute;top:-6px;inset-inline-start:-4px;background:#198754;color:#fff;border-radius:99px;font-style:normal;font-size:.65rem;font-weight:900;padding:1px 6px}\n.usa-day.on{background:linear-gradient(135deg,#0f5132,#198754);color:#fff;border-color:transparent}.usa-day.on small{color:rgba(255,255,255,.85)}\n.usa-daybar{display:flex;justify-content:space-between;align-items:center;margin:6px 0 8px;font-size:.86rem}.usa-daybar span{color:var(--text-secondary,#64748b);font-weight:800;font-size:.78rem}\n.usa-srow{display:grid;grid-template-columns:1.2fr 2.4fr 1fr 1.8fr 1.1fr auto;gap:8px;align-items:end;padding:10px;border:1px solid var(--border-color,#e2e8f0);border-radius:14px;background:var(--bg-color,#f8fafc)}\n.usa-sf label{display:block;font-size:.68rem;font-weight:800;color:var(--text-secondary,#64748b);margin:0 0 3px}\n.usa-sf input,.usa-sf select{width:100%;min-width:0;padding:9px 10px;border:1px solid var(--border-color,#e2e8f0);border-radius:10px;background:var(--card-bg,#fff);color:var(--text-primary,#0f172a);font:inherit;font-size:.84rem}\n.usa-prev{margin-top:10px}\n@media(max-width:760px){.usa-srow{grid-template-columns:1fr 1fr}.usa-srow .usa-subj,.usa-srow .usa-teach{grid-column:1/-1}.usa-srow .usa-btn{grid-column:1/-1}}\n";

(function(){
'use strict';
var P=window.UNEMSchedParser,cfg={};
var SPECS=[['BA','Banques et Assurances'],['FC','Finance et Comptabilité'],['TCM','Techniques Commerciales et Marketing'],['GRH','Gestion des Ressources Humaines'],['SAE','Statistique Appliquée à l\'Économie'],['IG','Informatique de Gestion'],['DI','Développement Informatique'],['RIT','Réseaux Informatiques et Télécommunications']];
var LEVELS=['L1','L2','L3','M1','M2'];
var DAYS=P.DAYS;
var TIMES=['08h30-10h30','10h30-12h30','12h30-14h30','14h30-15h00','15h00-17h00','17h00-19h00','19h00-21h00'];
var state={existing:[],items:[],file:null,editing:null,editRows:null,selected:{}};
function $(s,r){return (r||document).querySelector(s);}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
function client(){return cfg.sb||((typeof supabaseClient!=='undefined')?supabaseClient:null);}
function apiUrl(p){return cfg.api?cfg.api(p):((typeof unemApi==='function')?unemApi(p):p);}
/* توحيد صيغة التوقيت: 8h30-10h30 / 10h:30-12h30 / 08h30 - 10h30  ←  08h30-10h30 */
function normTime(v){
  var t=String(v==null?'':v).trim();if(!t)return '';
  var m=t.replace(/[–—−]/g,'-').match(/^(\d{1,2})\s*(?:[hH:])?\s*:?\s*(\d{2})?\s*-\s*(\d{1,2})\s*(?:[hH:])?\s*:?\s*(\d{2})?$/);
  if(!m)return t.replace(/\s+/g,'');
  var h1=+m[1],h2=+m[3];if(h1>24||h2>24)return t.replace(/\s+/g,'');
  var p=function(n){return (n<10?'0':'')+n;};
  var withMin=m[2]!=null||m[4]!=null;
  var a=p(h1)+'h'+(withMin?(m[2]||'00'):''),b=p(h2)+'h'+(withMin?(m[4]||'00'):'');
  return a+'-'+b;
}
function status(id,msg,type){var e=$('#'+id);if(!e)return;if(!msg){e.className='usa-status';e.textContent='';return;}e.textContent=msg;e.className='usa-status show '+(type||'info');}
function curYear(){var d=new Date(),y=d.getFullYear(),m=d.getMonth();var s=m>=8?y:y-1;return s+'-'+(s+1);}
function opts(list,sel,withEmpty){return (withEmpty?'<option value="">'+withEmpty+'</option>':'')+list.map(function(x){var v=Array.isArray(x)?x[0]:x,t=Array.isArray(x)?x[0]+' — '+x[1]:x;return '<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(t)+'</option>';}).join('');}
function semTag(t){t=String(t||'');return /impair/i.test(t)?'i':(/\bpairs?\b/i.test(t)?'p':'');}
/* تحويل الفصل المكتوب في ملف PDF إلى رمز قاعدة البيانات S1..S6؛ لا نعتمد على العنوان وحده عند النشر. */
function semesterOptionsForLevel(level){var l=String(level||'').toUpperCase();return ({L1:['S1','S2'],L2:['S3','S4'],L3:['S5','S6'],M1:['S1','S2'],M2:['S3','S4']})[l]||[];}
function inferSemester(level,title){var opts=semesterOptionsForLevel(level),tag=semTag(title);if(!opts.length||!tag)return '';return tag==='i'?opts[0]:opts[1];}
function validSemester(level,semester){return semesterOptionsForLevel(level).indexOf(String(semester||'').toUpperCase())!==-1;}
function semesterForRecord(x){return String((x&&x.semester)||inferSemester(x&&x.level,x&&x.title)||'').toUpperCase();}
function grp(g){return String(g||'').trim().toUpperCase();}
function isImageSched(x){var n=String((x&&x.file_name)||'')+' '+String((x&&x.file_url)||'');return /\.(jpe?g|png|webp|gif)(\s|\?|#|$)/i.test(n)||/\/image\/upload\//i.test(String((x&&x.file_url)||''));}
/* نوع الفصل الافتراضي عند عدم قدرة الموقع على قراءته من PDF: i = فردي، p = زوجي */
function defaultSemKind(){
  var el=$('#usa-sem-default'),v=el?el.value:'auto';
  if(v==='i'||v==='p')return v;
  var m=new Date().getMonth();           // سبتمبر..يناير = فردي، فبراير..أغسطس = زوجي
  return (m>=8||m===0)?'i':'p';
}
function resolveSemester(level,sem,title){
  if(validSemester(level,sem))return String(sem).toUpperCase();
  var inf=inferSemester(level,title);if(inf)return inf;
  var o=semesterOptionsForLevel(level);if(!o.length)return '';
  return defaultSemKind()==='i'?o[0]:o[1];
}

/* ---------- تحميل pdf.js عند الحاجة ---------- */
var pdfReady=null;
function loadPdfJs(){
  if(window.pdfjsLib)return Promise.resolve();
  if(pdfReady)return pdfReady;
  pdfReady=new Promise(function(res,rej){
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload=function(){try{window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';res();}catch(e){rej(e);}};
    s.onerror=function(){pdfReady=null;rej(new Error('تعذر تحميل مكتبة قراءة PDF. تحقق من الاتصال بالإنترنت.'));};
    document.head.appendChild(s);
  });
  return pdfReady;
}

function timeKey(t){var m=String(t||'').match(/(\d{1,2})\s*h\s*(\d{2})?/i);return m?(+m[1])*60+(+(m[2]||0)):9999;}
/* ---------- عرض الشبكة الأسبوعية ---------- */
function gridHtml(rows){
  rows=rows||[];
  if(!rows.length)return '<div class="usa-empty">لا توجد حصص.</div>';
  var days=DAYS.filter(function(d){return rows.some(function(r){return String(r.day).toUpperCase()===d;});});
  var extra=[];rows.forEach(function(r){var d=String(r.day||'').toUpperCase();if(d&&DAYS.indexOf(d)<0&&extra.indexOf(d)<0)extra.push(d);});
  days=days.concat(extra);
  rows=rows.map(function(r){var c={};for(var k in r)c[k]=r[k];c.time=normTime(r.time);c.day=String(r.day||'').toUpperCase();return c;});
  var times=[];rows.forEach(function(r){if(r.time&&times.indexOf(r.time)<0)times.push(r.time);});
  times.sort(function(a,b){var ka=timeKey(a),kb=timeKey(b);return ka-kb||(a<b?-1:1);});
  var h='<div class="usa-gridwrap"><table class="usa-table"><thead><tr><th>الوقت</th>'+days.map(function(d){return '<th>'+esc(d)+'</th>';}).join('')+'</tr></thead><tbody>';
  times.forEach(function(t){
    h+='<tr><th>'+esc(t)+'</th>'+days.map(function(d){
      var c=rows.filter(function(r){return r.time===t&&String(r.day).toUpperCase()===d;});
      return '<td>'+c.map(function(r){return '<b>'+esc(r.subject)+'</b><small>'+esc(r.room)+(r.teacher?' · '+esc(r.teacher):'')+'</small>';}).join('<hr style="border:0;border-top:1px dashed #cbd5e1;margin:4px 0">')+'</td>';
    }).join('')+'</tr>';
  });
  return h+'</tbody></table></div>';
}

/* ---------- محرر الحصص: اختيار اليوم ← إضافة / تعديل / حذف حصة ---------- */
var DAY_AR={LUNDI:'الاثنين',MARDI:'الثلاثاء',MERCREDI:'الأربعاء',JEUDI:'الخميس',VENDREDI:'الجمعة',SAMEDI:'السبت',DIMANCHE:'الأحد'};
var _eid=0;
function nonEmptyRow(r){return r.day||r.time||r.subject||r.room||r.teacher;}
function mountRows(box,rows){
  var id='usa-times-'+(++_eid);
  var data=(rows||[]).map(function(r){return {day:String(r.day||'').trim().toUpperCase(),time:normTime(r.time),subject:String(r.subject||'').trim(),room:String(r.room||'').trim(),teacher:String(r.teacher||'').trim()};});
  var cur=DAYS.filter(function(d){return data.some(function(r){return r.day===d;});})[0]||'LUNDI';
  var showPrev=false;
  box._get=function(){return data.map(function(r){return {day:r.day,time:normTime(r.time),subject:r.subject.trim(),room:r.room.trim(),teacher:r.teacher.trim()};}).filter(nonEmptyRow);};
  function cnt(d){return data.filter(function(r){return r.day===d&&nonEmptyRow(r);}).length;}
  function paint(){
    var idx=[];data.forEach(function(r,k){if(r.day===cur)idx.push(k);});
    idx.sort(function(a,b){return timeKey(data[a].time)-timeKey(data[b].time);});
    var other=data.filter(function(r){return r.day&&DAYS.indexOf(r.day)<0;}).length;
    var h='<datalist id="'+id+'">'+TIMES.map(function(t){return '<option value="'+t+'">';}).join('')+'</datalist>'+
    '<div class="usa-days" role="tablist">'+DAYS.map(function(d){var n=cnt(d);return '<button type="button" class="usa-day'+(d===cur?' on':'')+'" data-day="'+d+'"><b>'+DAY_AR[d]+'</b><small>'+d+'</small>'+(n?'<i>'+n+'</i>':'')+'</button>';}).join('')+'</div>'+
    '<div class="usa-daybar"><b>حصص يوم '+DAY_AR[cur]+' ('+cur+')</b><span>'+idx.length+' حصة</span></div>'+
    '<div class="usa-rows">'+(idx.length?idx.map(function(k){var r=data[k];return '<div class="usa-srow" data-k="'+k+'">'+
      '<div class="usa-sf"><label>الوقت</label><input data-f="time" list="'+id+'" inputmode="text" dir="ltr" placeholder="08h30-10h30" value="'+esc(r.time)+'"></div>'+
      '<div class="usa-sf usa-subj"><label>المادة</label><input data-f="subject" placeholder="المادة" value="'+esc(r.subject)+'"></div>'+
      '<div class="usa-sf"><label>القاعة</label><input data-f="room" placeholder="القاعة" value="'+esc(r.room)+'"></div>'+
      '<div class="usa-sf usa-teach"><label>الأستاذ</label><input data-f="teacher" placeholder="الأستاذ" value="'+esc(r.teacher)+'"></div>'+
      '<div class="usa-sf usa-mv"><label>اليوم</label><select data-f="day">'+DAYS.map(function(d){return '<option value="'+d+'"'+(d===r.day?' selected':'')+'>'+DAY_AR[d]+'</option>';}).join('')+'</select></div>'+
      '<button type="button" class="usa-btn d s" data-act="delrow" title="حذف الحصة">🗑️ حذف</button></div>';}).join(''):'<div class="usa-empty">لا توجد حصص في هذا اليوم. اضغط «إضافة حصة».</div>')+'</div>'+
    (other?'<div class="usa-status warn show">⚠️ '+other+' حصة بيوم غير معروف — ستُحفظ كما هي.</div>':'')+
    '<div class="usa-actions"><button type="button" class="usa-btn b s" data-act="addrow">＋ إضافة حصة في '+DAY_AR[cur]+'</button><button type="button" class="usa-btn s" data-act="prev">'+(showPrev?'إخفاء المعاينة':'👁️ معاينة الجدول كاملاً')+'</button></div>'+
    (showPrev?'<div class="usa-prev">'+gridHtml(box._get())+'</div>':'');
    box.innerHTML=h;
  }
  box.onclick=function(e){
    var b=e.target.closest('[data-day],[data-act]');if(!b||!box.contains(b))return;
    if(b.dataset.day){cur=b.dataset.day;paint();return;}
    var a=b.dataset.act;
    if(a==='addrow'){var last=data.filter(function(r){return r.day===cur;}).slice(-1)[0];data.push({day:cur,time:'',subject:'',room:'',teacher:''});paint();var ins=box.querySelectorAll('.usa-srow');var f=ins[ins.length-1]&&ins[ins.length-1].querySelector('input');
      /* آخر حصة أُضيفت تظهر مرتبة حسب الوقت (فارغ = في النهاية) */
      var rowsEls=box.querySelectorAll('.usa-srow');for(var q=0;q<rowsEls.length;q++){if(+rowsEls[q].dataset.k===data.length-1){f=rowsEls[q].querySelector('input');}}
      if(f)f.focus();return;}
    if(a==='delrow'){var k=+b.closest('.usa-srow').dataset.k;data.splice(k,1);paint();return;}
    if(a==='prev'){showPrev=!showPrev;paint();return;}
  };
  box.oninput=function(e){var el=e.target.closest('.usa-srow');if(!el||!e.target.dataset.f||e.target.dataset.f==='day')return;data[+el.dataset.k][e.target.dataset.f]=e.target.value;};
  box.onchange=function(e){
    var el=e.target.closest('.usa-srow');if(!el||!e.target.dataset.f)return;var f=e.target.dataset.f,k=+el.dataset.k;
    if(f==='time'){var n=normTime(e.target.value);data[k].time=n;e.target.value=n;return;}
    if(f==='day'){data[k].day=e.target.value;cur=e.target.value;paint();return;}
    data[k][f]=e.target.value;
  };
  paint();
}
function readRows(box){return box&&box._get?box._get():[];}
function rowsProblem(rows){
  for(var i=0;i<rows.length;i++){var r=rows[i],n=(DAY_AR[r.day]||r.day||'؟')+' '+(r.time||'؟');
    if(!r.day)return '❌ توجد حصة بلا يوم.';
    if(!r.time)return '❌ حصة يوم '+(DAY_AR[r.day]||r.day)+' بلا وقت ('+(r.subject||'بدون مادة')+').';
    if(!r.subject)return '❌ حصة '+n+' بلا مادة.';
    if(!/^\d{2}h(\d{2})?-\d{2}h(\d{2})?$/.test(r.time))return '❌ صيغة الوقت غير صحيحة في حصة '+n+' (المطلوب مثل 08h30-10h30).';}
  return '';
}

/* ---------- الهيكل الرئيسي ---------- */
function render(){
  var root=$('#usa-root');if(!root)return;
  root.innerHTML=
  '<div class="usa-wrap">'+
  '<div class="usa-card"><h3>📤 رفع جداول جديدة من ملف PDF</h3>'+
  '<p class="usa-hint">ارفع ملف الجداول الرسمي (مثل «Emplois-20-10-2025.pdf» الذي يحوي عدة جداول). يقرأ الموقع كل صفحة تلقائياً: التخصص والمستوى والمجموعة والسنة والفصل وكل حصة (اليوم، الوقت، المادة، القاعة، الأستاذ). ستراجع النتيجة وتعدّلها قبل النشر.</p>'+
  '<div class="usa-grid"><div class="usa-f"><label>السنة الجامعية</label><input id="usa-year" placeholder="2025-2026" value="'+curYear()+'"></div>'+
  '<div class="usa-f"><label>الفصل إن لم يُقرأ تلقائياً</label><select id="usa-sem-default"><option value="auto">تلقائي (حسب التاريخ)</option><option value="i">فردي (S1 / S3 / S5)</option><option value="p">زوجي (S2 / S4 / S6)</option></select></div><div class="usa-f" style="grid-column:span 2"><label>ملف PDF</label><input id="usa-file" type="file" accept=".pdf,application/pdf"></div></div>'+
  '<label class="usa-chk"><input type="checkbox" id="usa-save-pdf" checked><span>حفظ ملف PDF الأصلي وربطه بكل جدول (يفتح مباشرة على صفحة الجدول)</span></label>'+
  '<label class="usa-chk"><input type="checkbox" id="usa-replace" checked><span>استبدال الجدول الموجود عند التطابق (نفس السنة والتخصص والمستوى والمجموعة والفصل) بدل إنشاء نسخة مكررة</span></label>'+
  '<div class="usa-actions"><button type="button" class="usa-btn p" id="usa-analyze">🔍 تحليل الملف</button></div>'+
  '<div id="usa-st-up" class="usa-status"></div><div id="usa-preview"></div></div>'+
  '<div class="usa-card"><h3>🖼️ رفع جدول كصورة (JPG / PNG)</h3>'+
  '<p class="usa-hint">للجداول التي تصلك كصورة (مثل جداول الماستر). اختر التخصص والمستوى والفصل ثم الصورة، وستظهر للطلبة مباشرة.</p>'+
  '<div class="usa-grid">'+
  '<div class="usa-f"><label>السنة الجامعية</label><input id="usi-year" placeholder="2026-2027" value="'+curYear()+'"></div>'+
  '<div class="usa-f"><label>التخصص</label><select id="usi-spec">'+opts(SPECS.map(function(s){return s[0];}),'','— التخصص —')+'</select></div>'+
  '<div class="usa-f"><label>المستوى</label><select id="usi-level">'+opts(LEVELS,'','— المستوى —')+'</select></div>'+
  '<div class="usa-f"><label>الفصل</label><select id="usi-sem"><option value="">— الفصل —</option></select></div>'+
  '<div class="usa-f"><label>المجموعة (اختياري)</label><input id="usi-group" placeholder="G1 / FP"></div>'+
  '<div class="usa-f" style="grid-column:span 2"><label>العنوان (اختياري)</label><input id="usi-title" placeholder="مثال: Master Finance et Comptabilité — S1"></div>'+
  '<div class="usa-f" style="grid-column:1/-1"><label>الصورة</label><input id="usi-file" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg"></div></div>'+
  '<div id="usi-prev" style="margin-top:10px"></div>'+
  '<label class="usa-chk"><input type="checkbox" id="usi-replace" checked><span>استبدال الجدول الموجود عند التطابق (نفس السنة والتخصص والمستوى والفصل والمجموعة)</span></label>'+
  '<div class="usa-actions"><button type="button" class="usa-btn p" id="usi-upload">🚀 رفع ونشر الصورة</button></div><div id="usi-st" class="usa-status"></div></div>'+
  '<div class="usa-card"><h3>🗓️ الجداول المنشورة</h3><p class="usa-hint">عدّل أي جدول أو أخفِه عن الطلبة أو احذفه.</p>'+
  '<div class="usa-filter"><div class="usa-f"><input id="usa-q" placeholder="🔎 بحث بالعنوان"></div><div class="usa-f"><select id="usa-fs">'+opts(SPECS.map(function(s){return s[0];}),'', 'كل التخصصات')+'</select></div><div class="usa-f"><select id="usa-fl">'+opts(LEVELS,'','كل المستويات')+'</select></div><div class="usa-f"><select id="usa-fg"><option value="">كل المجموعات</option></select></div><div class="usa-f"><select id="usa-fsem"><option value="">كل الفصول</option>'+['S1','S2','S3','S4','S5','S6'].map(function(x){return '<option>'+x+'</option>';}).join('')+'</select></div><div class="usa-f"><select id="usa-fy"><option value="">كل السنوات</option></select></div></div>'+
  '<div class="usa-actions"><button type="button" class="usa-btn s" id="usa-refresh">🔄 تحديث</button><button type="button" class="usa-btn d s" id="usa-delsel">🗑️ حذف المحدد</button></div>'+
  '<div id="usa-st-list" class="usa-status"></div><div id="usa-list" class="usa-list"></div></div>'+
  '<div class="usa-card" id="usa-editor" style="display:none"></div>'+
  '</div>';
  $('#usa-analyze').onclick=analyze;
  $('#usi-upload').onclick=uploadImage;
  $('#usi-level').onchange=function(){var o=semesterOptionsForLevel($('#usi-level').value);$('#usi-sem').innerHTML=opts(o,'','— الفصل —');};
  $('#usi-file').onchange=function(){var f=this.files[0],b=$('#usi-prev');if(!f){b.innerHTML='';return;}var u=URL.createObjectURL(f);b.innerHTML='<img src="'+u+'" alt="" style="max-width:100%;max-height:260px;border-radius:10px;border:1px solid #cbd5e1">';};
  $('#usa-year').addEventListener('change',function(){computeMatches();renderPreview();});
  $('#usa-refresh').onclick=loadExisting;
  $('#usa-delsel').onclick=deleteSelected;
  ['usa-q','usa-fs','usa-fl','usa-fy','usa-fg','usa-fsem'].forEach(function(id){$('#'+id).addEventListener('input',renderList);});
  loadExisting();
}

/* ---------- قراءة الجداول الحالية ---------- */
async function loadExisting(){
  var sb=client();if(!sb){status('usa-st-list','❌ لا يوجد اتصال بقاعدة البيانات.','err');return;}
  status('usa-st-list','⏳ جاري تحميل الجداول...','info');
  var r=await sb.from('study_schedules').select('*').order('academic_year',{ascending:false}).order('specialization').order('level').order('group_name');
  if(r.error){status('usa-st-list','❌ تعذر تحميل الجداول: '+r.error.message+'\nتأكد من تنفيذ ملف الهجرة study_schedules في Supabase.','err');return;}
  state.existing=r.data||[];state.selected={};status('usa-st-list','');
  var ys=[];state.existing.forEach(function(x){if(x.academic_year&&ys.indexOf(x.academic_year)<0)ys.push(x.academic_year);});
  var fy=$('#usa-fy');if(fy){var old=fy.value;fy.innerHTML='<option value="">كل السنوات</option>'+ys.map(function(y){return '<option>'+esc(y)+'</option>';}).join('');fy.value=ys.indexOf(old)>=0?old:'';}
  var fg=$('#usa-fg');if(fg){var og=fg.value,gs=[];state.existing.forEach(function(x){var g=grp(x.group_name);if(g&&gs.indexOf(g)<0)gs.push(g);});gs.sort();fg.innerHTML='<option value="">كل المجموعات</option><option value="__none">بدون مجموعة</option>'+gs.map(function(g){return '<option>'+esc(g)+'</option>';}).join('');fg.value=(og==='__none'||gs.indexOf(og)>=0)?og:'';}
  renderList();computeMatches();renderPreview();
  if(state.booted&&typeof cfg.onChange==='function'){try{cfg.onChange();}catch(e){}}state.booted=true;
}
function filteredExisting(){
  var q=($('#usa-q')||{value:''}).value.trim().toLowerCase(),s=($('#usa-fs')||{value:''}).value,l=($('#usa-fl')||{value:''}).value,y=($('#usa-fy')||{value:''}).value,g=($('#usa-fg')||{value:''}).value,sm=($('#usa-fsem')||{value:''}).value;
  return state.existing.filter(function(x){return (!s||x.specialization===s)&&(!l||x.level===l)&&(!y||x.academic_year===y)&&(!g||(g==='__none'?!x.group_name:grp(x.group_name)===g))&&(!sm||semesterForRecord(x)===sm)&&(!q||String(x.title||'').toLowerCase().indexOf(q)>=0);});
}
function renderList(){
  var box=$('#usa-list');if(!box)return;
  var list=filteredExisting();
  if(!list.length){box.innerHTML='<div class="usa-empty">لا توجد جداول مطابقة.</div>';return;}
  box.innerHTML=list.map(function(x){
    var n=(x.rows||[]).length;
    return '<div class="usa-li'+(x.is_active?'':' off')+'" data-id="'+esc(x.id)+'">'+
    '<label class="usa-chk" style="margin:0"><input type="checkbox" data-act="sel"'+(state.selected[x.id]?' checked':'')+'></label>'+
    '<div class="usa-li-main"><b>'+esc(x.title||'جدول')+'</b><small>'+esc(x.specialization)+' · '+esc(x.level)+(semesterForRecord(x)?' · '+esc(semesterForRecord(x)):'')+(x.group_name?' · '+esc(x.group_name):'')+' · '+esc(x.academic_year||'')+' · '+n+' حصة'+(x.is_active?'':' · 🚫 مخفي')+'</small></div>'+
    '<div class="usa-li-act"><button type="button" class="usa-btn b s" data-act="edit">✏️ تعديل</button><button type="button" class="usa-btn g s" data-act="view">👁️ معاينة</button>'+
    (x.file_url?'<button type="button" class="usa-btn s" data-act="pdf">'+(isImageSched(x)?'🖼️ الصورة':'📄 PDF')+'</button>':'')+
    '<button type="button" class="usa-btn s" data-act="toggle">'+(x.is_active?'🙈 إخفاء':'👀 إظهار')+'</button><button type="button" class="usa-btn d s" data-act="del">🗑️</button></div>'+
    '<div class="usa-view" style="flex:1 1 100%;display:none"></div></div>';
  }).join('');
  box.onclick=listClick;box.onchange=function(e){var li=e.target.closest('.usa-li');if(li&&e.target.dataset.act==='sel')state.selected[li.dataset.id]=e.target.checked;};
}
function byId(id){return state.existing.filter(function(x){return x.id===id;})[0];}
async function listClick(e){
  var b=e.target.closest('[data-act]');if(!b||b.dataset.act==='sel')return;
  var li=b.closest('.usa-li'),id=li.dataset.id,x=byId(id);if(!x)return;
  var a=b.dataset.act,sb=client();
  if(a==='edit')return openEditor(id);
  if(a==='view'){var v=li.querySelector('.usa-view');if(v.style.display==='none'){v.innerHTML=(isImageSched(x)&&!(x.rows&&x.rows.length))?'<img src="'+esc(x.file_url)+'" alt="" style="max-width:100%;border-radius:10px">':gridHtml(x.rows);v.style.display='block';}else v.style.display='none';return;}
  if(a==='pdf'){window.open(x.file_url,'_blank','noopener');return;}
  if(a==='toggle'){var r=await sb.from('study_schedules').update({is_active:!x.is_active}).eq('id',id);if(r.error)return status('usa-st-list','❌ '+r.error.message,'err');return loadExisting();}
  if(a==='del'){if(!confirm('هل تريد حذف هذا الجدول نهائياً؟'))return;var d=await sb.from('study_schedules').delete().eq('id',id);if(d.error)return status('usa-st-list','❌ '+d.error.message,'err');status('usa-st-list','✅ تم الحذف.','ok');return loadExisting();}
}
async function deleteSelected(){
  var ids=Object.keys(state.selected).filter(function(k){return state.selected[k];});
  if(!ids.length)return status('usa-st-list','حدّد جدولاً واحداً على الأقل.','warn');
  if(!confirm('حذف '+ids.length+' جدول نهائياً؟'))return;
  var d=await client().from('study_schedules').delete().in('id',ids);
  if(d.error)return status('usa-st-list','❌ '+d.error.message,'err');
  status('usa-st-list','✅ تم حذف '+ids.length+' جدول.','ok');loadExisting();
}

/* ---------- محرر جدول موجود ---------- */
function openEditor(id){
  var x=byId(id),box=$('#usa-editor');if(!x||!box)return;
  state.editing=id;box.style.display='block';
  box.innerHTML='<h3>✏️ تعديل الجدول</h3><div class="usa-grid">'+
  '<div class="usa-f" style="grid-column:1/-1"><label>العنوان</label><input id="ue-title" value="'+esc(x.title)+'"></div>'+
  '<div class="usa-f"><label>التخصص</label><select id="ue-spec">'+opts(SPECS.map(function(s){return s[0];}),x.specialization)+'</select></div>'+
  '<div class="usa-f"><label>المستوى</label><select id="ue-level">'+opts(LEVELS,x.level)+'</select></div>'+
  '<div class="usa-f"><label>الفصل</label><select id="ue-sem">'+opts(semesterOptionsForLevel(x.level),semesterForRecord(x),'— الفصل —')+'</select></div>'+
  '<div class="usa-f"><label>المجموعة</label><input id="ue-group" value="'+esc(x.group_name||'')+'" placeholder="G1 / FP — أو فارغ"></div>'+
  '<div class="usa-f"><label>السنة الجامعية</label><input id="ue-year" value="'+esc(x.academic_year)+'"></div></div>'+
  '<label class="usa-chk"><input type="checkbox" id="ue-active"'+(x.is_active?' checked':'')+'><span>منشور ومرئي للطلبة</span></label>'+
  '<div id="ue-rows"></div><div class="usa-actions"><button type="button" class="usa-btn p" id="ue-save">💾 حفظ التعديلات</button><button type="button" class="usa-btn" id="ue-prev">👁️ معاينة الشبكة</button><button type="button" class="usa-btn" id="ue-cancel">إغلاق</button></div>'+
  '<div id="ue-grid"></div><div id="ue-st" class="usa-status"></div>';
  mountRows($('#ue-rows'),x.rows||[]);
  $('#ue-prev').onclick=function(){$('#ue-grid').innerHTML=gridHtml(readRows($('#ue-rows')));};
  $('#ue-level').onchange=function(){var l=$('#ue-level').value,cur=$('#ue-sem').value;var o=semesterOptionsForLevel(l);$('#ue-sem').innerHTML=opts(o,o.indexOf(cur)>=0?cur:'','— الفصل —');};
  $('#ue-cancel').onclick=function(){box.style.display='none';state.editing=null;};
  $('#ue-save').onclick=saveEditor;
  box.scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveEditor(){
  var id=state.editing;if(!id)return;
  var year=$('#ue-year').value.trim(),spec=$('#ue-spec').value,level=$('#ue-level').value,g=$('#ue-group').value.trim(),title=$('#ue-title').value.trim();
  if(!/^\d{4}-\d{4}$/.test(year))return status('ue-st','❌ السنة يجب أن تكون بصيغة 2025-2026.','err');
  if(!title)return status('ue-st','❌ أدخل عنواناً للجدول.','err');
  var rows=readRows($('#ue-rows'));var pb=rowsProblem(rows);if(pb)return status('ue-st',pb,'err');
  var sem=$('#ue-sem').value;if(sem&&!validSemester(level,sem))return status('ue-st','❌ اختر فصلاً دراسياً يتوافق مع المستوى '+level+'.','err');
  var upd={title:title,specialization:spec,level:level,group_name:g||null,academic_year:year,is_active:$('#ue-active').checked,rows:rows};
  var pr=await client().from('study_schedules').select('semester').limit(1);if(!pr.error&&sem)upd.semester=sem;
  var r=await client().from('study_schedules').update(upd).eq('id',id);
  if(r.error)return status('ue-st','❌ '+r.error.message,'err');
  status('ue-st','✅ تم حفظ التعديلات ('+rows.length+' حصة).','ok');loadExisting();
}


/* ---------- رفع جدول كصورة ---------- */
async function uploadImage(){
  var f=$('#usi-file').files[0],year=$('#usi-year').value.trim(),spec=$('#usi-spec').value,level=$('#usi-level').value,sem=$('#usi-sem').value,g=grp($('#usi-group').value),title=$('#usi-title').value.trim();
  var st=function(m,t){status('usi-st',m,t);};
  if(!/^\d{4}-\d{4}$/.test(year))return st('❌ السنة الجامعية يجب أن تكون بصيغة 2026-2027.','err');
  if(!spec)return st('❌ اختر التخصص.','err');
  if(!level)return st('❌ اختر المستوى.','err');
  if(!validSemester(level,sem))return st('❌ اختر الفصل الدراسي المناسب للمستوى '+level+'.','err');
  if(!f)return st('❌ اختر صورة الجدول.','err');
  if(!/\.(jpe?g|png)$/i.test(f.name))return st('❌ الصيغ المسموحة للصور: JPG أو PNG.','err');
  if(!f.size)return st('❌ الملف فارغ.','err');
  if(f.size>25*1024*1024)return st('❌ حجم الصورة كبير (الحد 25MB).','err');
  var btn=$('#usi-upload');btn.disabled=true;
  try{
    var sb=client();if(!sb)throw new Error('لا يوجد اتصال بقاعدة البيانات.');
    var ss=await sb.auth.getSession(),session=ss&&ss.data&&ss.data.session;
    if(!session)throw new Error('يجب تسجيل الدخول بحساب المشرف الرئيسي.');
    st('⏳ رفع الصورة...','info');
    var signUrl=apiUrl('/api/public/cloudinary/sign');
    var sign=await fetch(signUrl,{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({section:'schedules',fileName:f.name,fileSize:f.size,academicYear:year,specialization:spec,level:level,semester:sem,group:g})});
    var sd=await sign.json().catch(function(){return null;});
    if(!sign.ok)throw new Error((sd&&sd.error)||'تعذر الحصول على تصريح الرفع (تأكد من نشر آخر نسخة من الخادم على Vercel).');
    if(!sd||!sd.uploadUrl||!sd.apiKey||!sd.timestamp||!sd.signature||!sd.folder||!sd.publicId)throw new Error('استجابة تصريح الرفع غير مكتملة.');
    var fd=new FormData();fd.append('file',f,f.name);fd.append('api_key',sd.apiKey);fd.append('timestamp',sd.timestamp);fd.append('signature',sd.signature);fd.append('folder',sd.folder);fd.append('public_id',sd.publicId);
    var up=await fetch(sd.uploadUrl,{method:'POST',body:fd}),ud=await up.json().catch(function(){return null;});
    if(!up.ok||!ud||!ud.secure_url)throw new Error((ud&&ud.error&&ud.error.message)||'فشل رفع الصورة إلى Cloudinary.');
    st('⏳ حفظ الجدول...','info');
    var rec={academic_year:year,specialization:spec,level:level,semester:sem,group_name:g||null,title:title||(spec+' '+level+' — '+sem+(g?' '+g:'')),rows:[],is_active:true,file_url:ud.secure_url,file_name:f.name,cloudinary_public_id:ud.public_id||sd.publicId};
    var probe=await sb.from('study_schedules').select('semester').limit(1);if(probe.error)delete rec.semester;
    await loadExisting();
    var m=$('#usi-replace').checked?state.existing.filter(function(x){return x.academic_year===year&&x.specialization===spec&&x.level===level&&grp(x.group_name)===g&&semesterForRecord(x)===sem;})[0]:null;
    var res=m?await sb.from('study_schedules').update(rec).eq('id',m.id):await sb.from('study_schedules').insert(Object.assign({uploaded_by:session.user.id},rec));
    if(res.error){
      try{await fetch(apiUrl('/api/public/cloudinary/destroy'),{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({orphanPublicId:rec.cloudinary_public_id,resourceType:'image'})});}catch(_){}
      throw res.error;
    }
    st('✅ تم نشر الجدول (صورة).'+(probe.error?'\n⚠️ نفّذ ملف SQL الخاص بعمود الفصل في Supabase.':''),probe.error?'warn':'ok');
    $('#usi-file').value='';$('#usi-prev').innerHTML='';await loadExisting();
  }catch(e){st('❌ '+(e&&e.message||e),'err');}
  finally{btn.disabled=false;}
}
/* ---------- تحليل PDF ---------- */
async function analyze(){
  var f=$('#usa-file').files[0];
  if(!f||!/\.pdf$/i.test(f.name))return status('usa-st-up','❌ اختر ملف PDF صالحاً.','err');
  if(f.size>60*1024*1024)return status('usa-st-up','❌ الحد الأقصى لحجم الملف 60MB.','err');
  var btn=$('#usa-analyze');btn.disabled=true;
  try{
    status('usa-st-up','⏳ تحميل مكتبة القراءة...','info');await loadPdfJs();
    var buf=await f.arrayBuffer();
    var doc=await window.pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;
    var out=[],skipped=[],year='';
    for(var n=1;n<=doc.numPages;n++){
      status('usa-st-up','⏳ تحليل الصفحة '+n+' من '+doc.numPages+'...','info');
      var pg=await doc.getPage(n),tc=await pg.getTextContent();
      var r=P.parsePage(tc.items.map(function(i){return {str:i.str,x:i.transform[4],y:i.transform[5],w:i.width};}),n);
      if(r){out.push(r);if(!year&&r.year)year=r.year;}else skipped.push(n);
    }
    if(!out.length)throw new Error('لم يتم التعرّف على صفحات الجداول داخل PDF. تأكد أن الملف يحتوي على نص قابل للقراءة، وأن عناوين Profil وأيام الأسبوع وأوقات الحصص ظاهرة. إذا كان الملف ممسوحاً ضوئياً كصور، فلن يمكن استخراجه بهذه الطريقة.');
    if(year)$('#usa-year').value=year;
    state.file=f;
    state.items=out.map(function(r){
      var h=r.header,sem=r.semester==='impair'?'Semestres impairs':(r.semester==='pair'?'Semestres pairs':'');
      var title=h.raw+(sem?' — '+sem:'');
      return {page:r.page,include:!!(h.spec&&h.level),title:title,spec:h.spec,level:h.level,semester:(r.semester?inferSemester(h.level,title):''),group:h.group,rows:r.rows.map(function(x){x.time=normTime(x.time);return x;}),warnings:r.warnings,match:null,open:false};
    });
    state.items.forEach(function(it){if(it.level&&!validSemester(it.level,it.semester))it.semester=resolveSemester(it.level,'',it.title);});
    computeMatches();renderPreview();
    var total=state.items.reduce(function(a,i){return a+i.rows.length;},0),warns=state.items.reduce(function(a,i){return a+i.warnings.length;},0),unk=state.items.filter(function(i){return !i.spec||!i.level;}).length;
    status('usa-st-up','✅ تم العثور على '+out.length+' جدول و '+total+' حصة.'+(skipped.length?'\nصفحات تم تخطيها (ليست جداول): '+skipped.join('، '):'')+(unk?'\n⚠️ '+unk+' جدول يحتاج تحديد التخصص/المستوى يدوياً.':'')+(warns?'\n⚠️ '+warns+' خلية بصيغة غير معتادة — راجعها في المعاينة.':'')+'\nراجع النتيجة ثم اضغط «نشر».',(unk||warns)?'warn':'ok');
  }catch(e){status('usa-st-up','❌ '+(e&&e.message||e),'err');}
  finally{btn.disabled=false;}
}
function computeMatches(){
  var y=(($('#usa-year')||{}).value||'').trim();
  state.items.forEach(function(it){
    var m=state.existing.filter(function(x){return x.academic_year===y&&x.specialization===it.spec&&x.level===it.level&&grp(x.group_name)===grp(it.group)&&semesterForRecord(x)===String(it.semester||'').toUpperCase();})[0];
    it.match=m?m.id:null;
  });
}
function renderPreview(){
  var box=$('#usa-preview');if(!box)return;
  if(!state.items.length){box.innerHTML='';return;}
  var inc=state.items.filter(function(i){return i.include;}).length;
  box.innerHTML='<div class="usa-actions"><button type="button" class="usa-btn s" id="up-all">تحديد الكل</button><button type="button" class="usa-btn s" id="up-none">إلغاء التحديد</button></div><div class="usa-items">'+
  state.items.map(function(it,i){
    var tag=!it.spec||!it.level?'<span class="usa-tag bad">يحتاج تحديد التخصص/المستوى</span>':(it.match?'<span class="usa-tag rep">سيُستبدل الموجود</span>':'<span class="usa-tag new">جديد</span>');
    return '<div class="usa-item'+(it.include?'':' off')+'" data-i="'+i+'"><div class="usa-item-head"><input type="checkbox" data-f="include"'+(it.include?' checked':'')+'><div>'+
    '<div class="usa-item-fields"><input data-f="title" value="'+esc(it.title)+'" aria-label="العنوان"><select data-f="spec" aria-label="التخصص">'+opts(SPECS.map(function(s){return s[0];}),it.spec,'— التخصص —')+'</select><select data-f="level" aria-label="المستوى">'+opts(LEVELS,it.level,'— المستوى —')+'</select><select data-f="semester" aria-label="الفصل الدراسي">'+opts(semesterOptionsForLevel(it.level),it.semester,'— الفصل الدراسي —')+'</select><input data-f="group" value="'+esc(it.group)+'" placeholder="المجموعة" aria-label="المجموعة"></div>'+
    '<div class="usa-item-meta">'+tag+'<span class="usa-tag">صفحة '+it.page+'</span><span class="usa-tag">'+it.rows.length+' حصة</span>'+(it.warnings.length?'<span class="usa-tag bad">⚠️ '+it.warnings.length+' للمراجعة</span>':'')+'<button type="button" class="usa-btn s" data-act="toggle">'+(it.open?'إخفاء الحصص':'عرض / تعديل الحصص')+'</button></div></div></div>'+
    (it.open?'<div class="usa-detail">'+(it.warnings.length?'<div class="usa-status warn show">خلايا غير معتادة:\n'+esc(it.warnings.join('\n'))+'</div>':'')+gridHtml(it.rows)+'<div class="usa-rows-box" style="margin-top:10px"></div></div>':'')+'</div>';
  }).join('')+'</div><div class="usa-actions"><button type="button" class="usa-btn p" id="up-publish">🚀 نشر المحدد ('+inc+')</button><button type="button" class="usa-btn" id="up-cancel">إلغاء</button></div><div id="usa-st-pub" class="usa-status"></div>';
  [].forEach.call(box.querySelectorAll('.usa-item'),function(el){var it=state.items[+el.dataset.i];if(it.open){mountRows(el.querySelector('.usa-rows-box'),it.rows);}});
  $('#up-all').onclick=function(){state.items.forEach(function(i){if(i.spec&&i.level)i.include=true;});renderPreview();};
  $('#up-none').onclick=function(){state.items.forEach(function(i){i.include=false;});renderPreview();};
  $('#up-cancel').onclick=function(){state.items=[];state.file=null;renderPreview();status('usa-st-up','');};
  $('#up-publish').onclick=publish;
  box.onchange=box.oninput=function(e){
    var el=e.target.closest('.usa-item');if(!el||!e.target.dataset.f)return;
    var it=state.items[+el.dataset.i],f=e.target.dataset.f;
    it[f]=f==='include'?e.target.checked:e.target.value;
    if(f==='group')it.group=e.target.value.trim();
    if(e.type==='change'&&f!=='title'){if(f==='spec'||f==='level'||f==='semester'||f==='group'||f==='include'){if(f==='level'&&!validSemester(it.level,it.semester))it.semester='';if(f==='spec'||f==='level'){if(!it.spec||!it.level)it.include=false;}computeMatches();syncRowsFromDom();renderPreview();}}
  };
  box.onclick=function(e){
    var b=e.target.closest('[data-act="toggle"]');if(!b)return;
    var el=b.closest('.usa-item'),it=state.items[+el.dataset.i];
    syncRowsFromDom();it.open=!it.open;renderPreview();
  };
}
function syncRowsFromDom(){
  [].forEach.call(document.querySelectorAll('#usa-preview .usa-item'),function(el){
    var rb=el.querySelector('.usa-rows-box');if(rb&&rb._get){state.items[+el.dataset.i].rows=readRows(rb);}
  });
}
/* ---------- النشر ---------- */
async function publish(){
  syncRowsFromDom();
  var sb=client(),year=$('#usa-year').value.trim(),sel=state.items.filter(function(i){return i.include;});
  if(!/^\d{4}-\d{4}$/.test(year))return status('usa-st-pub','❌ السنة الجامعية يجب أن تكون بصيغة 2025-2026.','err');
  if(!sel.length)return status('usa-st-pub','حدّد جدولاً واحداً على الأقل للنشر.','warn');
  sel.forEach(function(i){i.rows=(i.rows||[]).map(function(r){var c={};for(var k in r)c[k]=r[k];c.time=normTime(r.time);c.day=String(r.day||'').toUpperCase();return c;});if(i.level&&!validSemester(i.level,i.semester))i.semester=resolveSemester(i.level,i.semester,i.title);});
  var rp=sel.map(function(i){var p=rowsProblem(i.rows);return p?('صفحة '+i.page+': '+p.replace('❌ ','')):'';}).filter(Boolean);
  if(rp.length)return status('usa-st-pub','❌ حصص تحتاج تصحيحاً قبل النشر:\n'+rp.slice(0,6).join('\n'),'err');
  computeMatches();
  var bad=sel.filter(function(i){return !i.spec||!i.level||!i.title.trim()||!validSemester(i.level,i.semester);});
  if(bad.length){renderPreview();return status('usa-st-pub','❌ جداول تحتاج تصحيحاً (التخصص أو المستوى أو العنوان): صفحة '+bad.map(function(i){return i.page;}).join('، ')+'. اختر القيم الصحيحة ثم أعد النشر.','err');}
  var btn=$('#up-publish');btn.disabled=true;
  try{
    var ss=await sb.auth.getSession(),session=ss&&ss.data&&ss.data.session;
    if(!session)throw new Error('يجب تسجيل الدخول بحساب المشرف الرئيسي.');
    var url=null,pid=null,pdfWarn='';
    if($('#usa-save-pdf').checked&&state.file){
     try{
      status('usa-st-pub','⏳ رفع ملف PDF الأصلي...','info');
      var f=state.file,first=sel[0];
      if(!/\.pdf$/i.test(f.name)||f.size===0)throw new Error('ملف PDF غير صالح أو فارغ. اختر ملف الجداول الأصلي من جديد.');
      var sign;
      try {
        sign=await fetch(apiUrl('/api/public/cloudinary/sign'),{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({section:'schedules',fileName:f.name,fileSize:f.size,academicYear:year,specialization:first.spec,level:first.level,group:''})});
      } catch(signNetworkError) {
        throw new Error('تعذر الاتصال بخادم تجهيز رفع PDF. تأكد من فتح المنصة عبر رابط Vercel المنشور، وأن مسار /api/public/cloudinary/sign منشور ويعمل. التفاصيل: '+(signNetworkError&&signNetworkError.message||'Failed to fetch'));
      }
      var sd=await sign.json().catch(function(){return null;});
      if(!sign.ok)throw new Error((sd&&sd.error)||'تعذر الحصول على تصريح رفع PDF. تحقق من صلاحية المشرف وإعدادات الخادم.');
      if(!sd||!sd.uploadUrl||!sd.apiKey||!sd.timestamp||!sd.signature||!sd.folder||!sd.publicId)throw new Error('استجابة تصريح الرفع غير مكتملة. تحقق من إعدادات Cloudinary في الخادم.');
      var fd=new FormData();fd.append('file',f,f.name);fd.append('api_key',sd.apiKey);fd.append('timestamp',sd.timestamp);fd.append('signature',sd.signature);fd.append('folder',sd.folder);fd.append('public_id',sd.publicId);
      var up;
      try { up=await fetch(sd.uploadUrl,{method:'POST',body:fd}); }
      catch(uploadNetworkError) {
        throw new Error('تم تجهيز طلب الرفع، لكن تعذر الاتصال بخدمة Cloudinary لرفع ملف PDF. تحقق من اتصال الإنترنت وإعدادات الرفع الموقّع. التفاصيل: '+(uploadNetworkError&&uploadNetworkError.message||'Failed to fetch'));
      }
      var ud=await up.json().catch(function(){return null;});
      if(!up.ok||!ud||!ud.secure_url){
        var uploadError=(ud&&ud.error&&ud.error.message)||(ud&&ud.error)||'فشل رفع PDF إلى Cloudinary.';
        if(/pdf|zip|not allowed|untrusted/i.test(String(uploadError)))uploadError+=' — قد يلزم تفعيل Allow delivery of PDF and ZIP files من إعدادات Security في Cloudinary.';
        throw new Error(uploadError);
      }
      url=ud.secure_url;pid=ud.public_id||sd.publicId;
     }catch(pdfErr){url=null;pid=null;pdfWarn='\n⚠️ تم نشر الجداول لكن تعذر حفظ ملف PDF الأصلي: '+(pdfErr&&pdfErr.message||pdfErr);}
    }
    var probe=await sb.from('study_schedules').select('semester').limit(1),hasSem=!probe.error;
    if(!hasSem)pdfWarn+='\n⚠️ عمود semester غير موجود في قاعدة البيانات، فتم الحفظ بدونه. نفّذ ملف SQL «20261011_study_schedules_semester.sql» في Supabase لإضافته.';
    var ins=0,upd=0,replace=$('#usa-replace').checked;
    for(var k=0;k<sel.length;k++){
      var it=sel[k];status('usa-st-pub','⏳ حفظ الجداول '+(k+1)+' / '+sel.length+'...','info');
      var rec={academic_year:year,specialization:it.spec,level:it.level,semester:String(it.semester).toUpperCase(),group_name:it.group?grp(it.group):null,title:it.title.trim(),rows:it.rows,is_active:true};
      if(!hasSem)delete rec.semester;
      if(url){rec.file_url=url+'#page='+it.page;rec.file_name=state.file.name;rec.cloudinary_public_id=pid;}
      var m=replace&&it.match?it.match:null,res;
      try {
        if(m){res=await sb.from('study_schedules').update(rec).eq('id',m);if(res.error)throw res.error;upd++;}
        else{rec.uploaded_by=session.user.id;if(!url){rec.file_url=null;}res=await sb.from('study_schedules').insert(rec);
          if(res.error&&(res.error.code==='23505'||/duplicate key|unique/i.test(res.error.message||''))){
            var ex2=await sb.from('study_schedules').select('id,group_name').eq('academic_year',year).eq('specialization',it.spec).eq('level',it.level).eq('semester',rec.semester);
            var hit=(ex2.data||[]).filter(function(x){return grp(x.group_name)===grp(it.group);})[0];
            if(!hit)throw res.error;
            delete rec.uploaded_by;if(!url){delete rec.file_url;}
            res=await sb.from('study_schedules').update(rec).eq('id',hit.id);if(res.error)throw res.error;upd++;
          }else{if(res.error)throw res.error;ins++;}}
      } catch(dbError) {
        var dbMessage=dbError&&dbError.message||String(dbError||'خطأ غير معروف');
        if(/failed to fetch|networkerror|fetch failed/i.test(dbMessage)) throw new Error('تم رفع ملف PDF'+(url?' إلى Cloudinary':'')+'، لكن تعذر الاتصال بقاعدة بيانات Supabase لحفظ الجداول. تحقق من اتصال الشبكة وإعدادات Supabase ثم أعد المحاولة. التفاصيل: '+dbMessage);
        throw dbError;
      }
    }
    status('usa-st-pub','✅ تم النشر بنجاح: '+ins+' جدول جديد، '+upd+' جدول تم تحديثه.'+(url?' وتم حفظ ملف PDF الأصلي.':'')+pdfWarn,pdfWarn?'warn':'ok');
    state.items=[];state.file=null;var fi=$('#usa-file');if(fi)fi.value='';
    await loadExisting();
    var st=$('#usa-st-pub');if(!st){status('usa-st-up','✅ تم النشر: '+ins+' جديد، '+upd+' محدّث.'+(url?' وتم حفظ ملف PDF الأصلي.':''),'ok');}
  }catch(e){status('usa-st-pub','❌ '+(e&&e.message||e),'err');var b2=$('#up-publish');if(b2)b2.disabled=false;}
}

/* ---------- نقطة الدخول ---------- */
function injectCss(){if(document.getElementById('usa-css'))return;var s=document.createElement('style');s.id='usa-css';s.textContent=USA_CSS;document.head.appendChild(s);}
window.UNEMSchedAdmin={
  normTime:normTime,
  mount:function(el,opts){
    cfg=opts||{};injectCss();
    el.innerHTML='<div id="usa-root"></div>';
    state.items=[];state.file=null;state.editing=null;state.booted=false;
    render();
  }
};
})();
