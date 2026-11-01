/*
 * وحدة إدارة الجداول الدراسية المشتركة — UNEMSchedAdmin.mount(host, { sb, onChange })
 * تُستعمل في صفحة /emplois (دخول المشرف): رفع ملف PDF وتحليله، تعديل الحصص، إخفاء/حذف الجداول.
 * مبنية من نفس منطق لوحة المشرف في التطبيق الرئيسي (10-schedules-admin.js) مع عميل Supabase ممرَّر من الصفحة.
 */
(function(){
'use strict';
var CSS_ID='unem-schedules-admin-css';
var CSS=`:where(#usa-root){--card-bg:#ffffff;--border-color:#e2e8f0;--shadow-sm:0 2px 8px rgba(15,23,42,.06);--primary-color:#0f5132;--text-secondary:#64748b;--bg-color:#f8fafc;--text-primary:#0f172a}
/* ===== إدارة الجداول الدراسية داخل لوحة المشرف الرئيسي ===== */
.usa-wrap{grid-template-columns:minmax(0,1fr)}
.usa-card,.usa-item,.usa-item-head>div,.usa-detail,.usa-li-main{min-width:0;max-width:100%}
.usa-items,.usa-list{grid-template-columns:minmax(0,1fr)}
.usa-item-head{grid-template-columns:auto minmax(0,1fr)}
.usa-item-fields>*{min-width:0}
.usa-wrap{display:grid;gap:16px;text-align:right;direction:rtl}
.usa-card{background:var(--card-bg);border:1px solid var(--border-color);border-radius:18px;padding:clamp(12px,2.5vw,20px);box-shadow:var(--shadow-sm)}
.usa-card h3{margin:0 0 6px;font-size:1.05rem;color:var(--primary-color);font-weight:900}
.usa-hint{font-size:.78rem;color:var(--text-secondary);line-height:1.7;margin:0 0 12px}
.usa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;margin-bottom:10px}
.usa-f label{display:block;font-size:.76rem;font-weight:800;color:var(--text-secondary);margin:0 0 5px}
.usa-f input,.usa-f select{width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-color);color:var(--text-primary);font:inherit;font-size:.9rem}
.usa-chk{display:flex;align-items:flex-start;gap:8px;font-size:.84rem;font-weight:700;margin:8px 0;cursor:pointer;color:var(--text-primary)}
.usa-chk input{width:18px;height:18px;margin-top:2px;accent-color:#198754;flex:none}
.usa-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.usa-btn{border:0;border-radius:12px;padding:10px 16px;font:inherit;font-size:.86rem;font-weight:800;cursor:pointer;background:#e2e8f0;color:#1e293b;min-height:40px}
.usa-btn.p{background:linear-gradient(135deg,#0f5132,#198754);color:#fff}
.usa-btn.b{background:#2563eb;color:#fff}
.usa-btn.d{background:#fee2e2;color:#b91c1c}
.usa-btn.g{background:#f8efd1;color:#7c5a00}
.usa-btn.s{padding:7px 11px;min-height:34px;font-size:.78rem}
.usa-btn:disabled{opacity:.55;cursor:not-allowed}
body.dark-mode .usa-btn{background:#334155;color:#f1f5f9}
body.dark-mode .usa-btn.p{background:linear-gradient(135deg,#047857,#10b981)}
.usa-status{display:none;margin-top:10px;padding:10px 12px;border-radius:12px;font-size:.82rem;font-weight:800;line-height:1.6;white-space:pre-line}
.usa-status.show{display:block}
.usa-status.ok{background:#dcfce7;color:#166534}.usa-status.err{background:#fee2e2;color:#991b1b}.usa-status.info{background:#e0f2fe;color:#075985}.usa-status.warn{background:#fef3c7;color:#92400e}
.usa-items{display:grid;gap:10px;margin-top:12px}
.usa-item{border:1px solid var(--border-color);border-radius:14px;padding:11px;background:var(--bg-color)}
.usa-item.off{opacity:.6}
.usa-item-head{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start}
.usa-item-head>input[type=checkbox]{width:20px;height:20px;margin-top:8px;accent-color:#198754}
.usa-item-fields{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px}
.usa-item-fields input,.usa-item-fields select{width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:10px;background:var(--card-bg);color:var(--text-primary);font:inherit;font-size:.84rem;min-width:0}
.usa-item-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;font-size:.74rem;font-weight:800}
.usa-tag{padding:2px 9px;border-radius:99px;background:rgba(25,135,84,.14);color:var(--primary-color)}
.usa-tag.new{background:#dbeafe;color:#1d4ed8}.usa-tag.rep{background:#fef3c7;color:#92400e}.usa-tag.bad{background:#fee2e2;color:#b91c1c}
.usa-detail{margin-top:10px}
.usa-rows{display:grid;gap:7px}
.usa-row{display:grid;grid-template-columns:1.1fr 1fr 2.6fr 1fr 1.8fr auto;gap:6px;align-items:center}
.usa-row input,.usa-row select{width:100%;min-width:0;padding:8px 9px;border:1px solid var(--border-color);border-radius:10px;background:var(--card-bg);color:var(--text-primary);font:inherit;font-size:.82rem}
.usa-gridwrap{overflow-x:auto;margin-top:10px;border:1px solid var(--border-color);border-radius:12px;-webkit-overflow-scrolling:touch}
.usa-table{border-collapse:collapse;width:100%;min-width:640px;font-size:.74rem}
.usa-table th,.usa-table td{border:1px solid var(--border-color);padding:6px;vertical-align:top;text-align:center}
.usa-table th{background:rgba(25,135,84,.12);color:var(--primary-color);font-weight:900}
.usa-table td b{display:block;font-size:.76rem}.usa-table td small{display:block;color:var(--text-secondary)}
.usa-list{display:grid;gap:8px;margin-top:10px}
.usa-li{border:1px solid var(--border-color);border-radius:14px;padding:10px 12px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--bg-color)}
.usa-li.off{opacity:.65}
.usa-li-main{flex:1 1 220px;min-width:0}.usa-li-main b{display:block;font-size:.88rem;overflow-wrap:anywhere}.usa-li-main small{color:var(--text-secondary);font-size:.74rem}
.usa-li-act{display:flex;flex-wrap:wrap;gap:6px}
.usa-filter{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px;margin-top:6px}
.usa-empty{padding:18px;text-align:center;color:var(--text-secondary);font-weight:700;font-size:.85rem}
@media(max-width:760px){
  .usa-item-fields{grid-template-columns:1fr 1fr}.usa-item-fields>:first-child{grid-column:1/-1}
  .usa-row{grid-template-columns:1fr 1fr}.usa-row .usa-subj{grid-column:1/-1}.usa-row .usa-teach{grid-column:1/-1}
}`;
function injectCss(){if(document.getElementById(CSS_ID))return;var s=document.createElement('style');s.id=CSS_ID;s.textContent=CSS;document.head.appendChild(s);}
var loading=null;
function ensureParser(){
  if(window.UNEMSchedParser)return Promise.resolve();
  if(loading)return loading;
  loading=new Promise(function(res,rej){
    var sc=document.createElement('script');sc.src='/legacy/app/09-sched-parser.js?v=3';
    sc.onload=function(){window.UNEMSchedParser?res():rej(new Error('parser'));};
    sc.onerror=function(){loading=null;rej(new Error('parser-load'));};
    document.head.appendChild(sc);
  });
  return loading;
}
function build(SB,ON_CHANGE){
'use strict';
var P=window.UNEMSchedParser;
var SPECS=[['BA','Banques et Assurances'],['FC','Finance et Comptabilité'],['TCM','Techniques Commerciales et Marketing'],['GRH','Gestion des Ressources Humaines'],['SAE','Statistique Appliquée à l\'Économie'],['IG','Informatique de Gestion'],['DI','Développement Informatique'],['RIT','Réseaux Informatiques et Télécommunications']];
var LEVELS=['L1','L2','L3','M1','M2'];
var DAYS=P.DAYS;
var TIMES=['08h-10h','10h-12h','12h-14h','14h-15h','15h-17h','17h-19h','19h-21h'];
var state={existing:[],items:[],file:null,editing:null,editRows:null,selected:{}};
function $(s,r){return (r||document).querySelector(s);}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
function client(){return SB;}
function status(id,msg,type){var e=$('#'+id);if(!e)return;if(!msg){e.className='usa-status';e.textContent='';return;}e.textContent=msg;e.className='usa-status show '+(type||'info');}
function curYear(){var d=new Date(),y=d.getFullYear(),m=d.getMonth();var s=m>=8?y:y-1;return s+'-'+(s+1);}
function opts(list,sel,withEmpty){return (withEmpty?'<option value="">'+withEmpty+'</option>':'')+list.map(function(x){var v=Array.isArray(x)?x[0]:x,t=Array.isArray(x)?x[0]+' — '+x[1]:x;return '<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(t)+'</option>';}).join('');}
function semTag(t){t=String(t||'');return /impair/i.test(t)?'i':(/\bpairs?\b/i.test(t)?'p':'');}
function grp(g){return String(g||'').trim().toUpperCase();}

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

/* ---------- عرض الشبكة الأسبوعية ---------- */
function gridHtml(rows){
  rows=rows||[];
  if(!rows.length)return '<div class="usa-empty">لا توجد حصص.</div>';
  var days=DAYS.filter(function(d){return rows.some(function(r){return String(r.day).toUpperCase()===d;});});
  var extra=[];rows.forEach(function(r){var d=String(r.day||'').toUpperCase();if(d&&DAYS.indexOf(d)<0&&extra.indexOf(d)<0)extra.push(d);});
  days=days.concat(extra);
  var times=TIMES.slice();rows.forEach(function(r){if(r.time&&times.indexOf(r.time)<0)times.push(r.time);});
  times=times.filter(function(t){return rows.some(function(r){return r.time===t;});});
  var h='<div class="usa-gridwrap"><table class="usa-table"><thead><tr><th>الوقت</th>'+days.map(function(d){return '<th>'+esc(d)+'</th>';}).join('')+'</tr></thead><tbody>';
  times.forEach(function(t){
    h+='<tr><th>'+esc(t)+'</th>'+days.map(function(d){
      var c=rows.filter(function(r){return r.time===t&&String(r.day).toUpperCase()===d;});
      return '<td>'+c.map(function(r){return '<b>'+esc(r.subject)+'</b><small>'+esc(r.room)+(r.teacher?' · '+esc(r.teacher):'')+'</small>';}).join('<hr style="border:0;border-top:1px dashed #cbd5e1;margin:4px 0">')+'</td>';
    }).join('')+'</tr>';
  });
  return h+'</tbody></table></div>';
}

/* ---------- محرر الحصص (مشترك) ---------- */
function rowHtml(r){
  r=r||{};
  return '<div class="usa-row"><select data-k="day">'+opts(DAYS,String(r.day||'').toUpperCase(),'اليوم')+'</select>'+
  '<input data-k="time" list="usa-times" placeholder="الوقت" value="'+esc(r.time)+'">'+
  '<input class="usa-subj" data-k="subject" placeholder="المادة" value="'+esc(r.subject)+'">'+
  '<input data-k="room" placeholder="القاعة" value="'+esc(r.room)+'">'+
  '<input class="usa-teach" data-k="teacher" placeholder="الأستاذ" value="'+esc(r.teacher)+'">'+
  '<button type="button" class="usa-btn d s" data-act="delrow">✕</button></div>';
}
function mountRows(box,rows){
  box.innerHTML='<datalist id="usa-times">'+TIMES.map(function(t){return '<option value="'+t+'">';}).join('')+'</datalist><div class="usa-rows">'+(rows||[]).map(rowHtml).join('')+'</div><div class="usa-actions"><button type="button" class="usa-btn b s" data-act="addrow">＋ إضافة حصة</button></div>';
  box.onclick=function(e){
    var b=e.target.closest('[data-act]');if(!b)return;
    if(b.dataset.act==='delrow'){b.closest('.usa-row').remove();}
    if(b.dataset.act==='addrow'){var w=document.createElement('div');w.innerHTML=rowHtml({});box.querySelector('.usa-rows').appendChild(w.firstChild);}
  };
}
function readRows(box){
  return [].map.call(box.querySelectorAll('.usa-row'),function(r){
    var o={};[].forEach.call(r.querySelectorAll('[data-k]'),function(i){o[i.dataset.k]=i.value.trim();});
    if(o.day)o.day=o.day.toUpperCase();return o;
  }).filter(function(r){return r.day||r.time||r.subject||r.room||r.teacher;});
}

/* ---------- الهيكل الرئيسي ---------- */
function render(){
  var root=$('#usa-root');if(!root)return;
  root.innerHTML=
  '<div class="usa-wrap">'+
  '<div class="usa-card"><h3>📤 رفع جداول جديدة من ملف PDF</h3>'+
  '<p class="usa-hint">ارفع ملف الجداول الرسمي (مثل «Emplois-20-10-2025.pdf» الذي يحوي عدة جداول). يقرأ الموقع كل صفحة تلقائياً: التخصص والمستوى والمجموعة والسنة والفصل وكل حصة (اليوم، الوقت، المادة، القاعة، الأستاذ). ستراجع النتيجة وتعدّلها قبل النشر.</p>'+
  '<div class="usa-grid"><div class="usa-f"><label>السنة الجامعية</label><input id="usa-year" placeholder="2025-2026" value="'+curYear()+'"></div>'+
  '<div class="usa-f" style="grid-column:span 2"><label>ملف PDF</label><input id="usa-file" type="file" accept=".pdf,application/pdf"></div></div>'+
  '<label class="usa-chk"><input type="checkbox" id="usa-save-pdf" checked><span>حفظ ملف PDF الأصلي وربطه بكل جدول (يفتح مباشرة على صفحة الجدول)</span></label>'+
  '<label class="usa-chk"><input type="checkbox" id="usa-replace" checked><span>استبدال الجدول الموجود عند التطابق (نفس السنة والتخصص والمستوى والمجموعة والفصل) بدل إنشاء نسخة مكررة</span></label>'+
  '<div class="usa-actions"><button type="button" class="usa-btn p" id="usa-analyze">🔍 تحليل الملف</button></div>'+
  '<div id="usa-st-up" class="usa-status"></div><div id="usa-preview"></div></div>'+
  '<div class="usa-card"><h3>🗓️ الجداول المنشورة</h3><p class="usa-hint">عدّل أي جدول أو أخفِه عن الطلبة أو احذفه.</p>'+
  '<div class="usa-filter"><div class="usa-f"><input id="usa-q" placeholder="🔎 بحث بالعنوان"></div><div class="usa-f"><select id="usa-fs">'+opts(SPECS.map(function(s){return s[0];}),'', 'كل التخصصات')+'</select></div><div class="usa-f"><select id="usa-fl">'+opts(LEVELS,'','كل المستويات')+'</select></div><div class="usa-f"><select id="usa-fy"><option value="">كل السنوات</option></select></div></div>'+
  '<div class="usa-actions"><button type="button" class="usa-btn s" id="usa-refresh">🔄 تحديث</button><button type="button" class="usa-btn d s" id="usa-delsel">🗑️ حذف المحدد</button></div>'+
  '<div id="usa-st-list" class="usa-status"></div><div id="usa-list" class="usa-list"></div></div>'+
  '<div class="usa-card" id="usa-editor" style="display:none"></div>'+
  '</div>';
  $('#usa-analyze').onclick=analyze;
  $('#usa-year').addEventListener('change',function(){computeMatches();renderPreview();});
  $('#usa-refresh').onclick=loadExisting;
  $('#usa-delsel').onclick=deleteSelected;
  ['usa-q','usa-fs','usa-fl','usa-fy'].forEach(function(id){$('#'+id).addEventListener('input',renderList);});
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
  renderList();computeMatches();renderPreview();
  if(state._seen){try{if(ON_CHANGE)ON_CHANGE();}catch(e){}}state._seen=true;
}
function filteredExisting(){
  var q=($('#usa-q')||{value:''}).value.trim().toLowerCase(),s=($('#usa-fs')||{value:''}).value,l=($('#usa-fl')||{value:''}).value,y=($('#usa-fy')||{value:''}).value;
  return state.existing.filter(function(x){return (!s||x.specialization===s)&&(!l||x.level===l)&&(!y||x.academic_year===y)&&(!q||String(x.title||'').toLowerCase().indexOf(q)>=0);});
}
function renderList(){
  var box=$('#usa-list');if(!box)return;
  var list=filteredExisting();
  if(!list.length){box.innerHTML='<div class="usa-empty">لا توجد جداول مطابقة.</div>';return;}
  box.innerHTML=list.map(function(x){
    var n=(x.rows||[]).length;
    return '<div class="usa-li'+(x.is_active?'':' off')+'" data-id="'+esc(x.id)+'">'+
    '<label class="usa-chk" style="margin:0"><input type="checkbox" data-act="sel"'+(state.selected[x.id]?' checked':'')+'></label>'+
    '<div class="usa-li-main"><b>'+esc(x.title||'جدول')+'</b><small>'+esc(x.specialization)+' · '+esc(x.level)+(x.group_name?' · '+esc(x.group_name):'')+' · '+esc(x.academic_year||'')+' · '+n+' حصة'+(x.is_active?'':' · 🚫 مخفي')+'</small></div>'+
    '<div class="usa-li-act"><button type="button" class="usa-btn b s" data-act="edit">✏️ تعديل</button><button type="button" class="usa-btn g s" data-act="view">👁️ معاينة</button>'+
    (x.file_url?'<button type="button" class="usa-btn s" data-act="pdf">📄 PDF</button>':'')+
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
  if(a==='view'){var v=li.querySelector('.usa-view');if(v.style.display==='none'){v.innerHTML=gridHtml(x.rows);v.style.display='block';}else v.style.display='none';return;}
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
  '<div class="usa-f"><label>المجموعة</label><input id="ue-group" value="'+esc(x.group_name||'')+'" placeholder="G1 / FP — أو فارغ"></div>'+
  '<div class="usa-f"><label>السنة الجامعية</label><input id="ue-year" value="'+esc(x.academic_year)+'"></div></div>'+
  '<label class="usa-chk"><input type="checkbox" id="ue-active"'+(x.is_active?' checked':'')+'><span>منشور ومرئي للطلبة</span></label>'+
  '<div id="ue-rows"></div><div class="usa-actions"><button type="button" class="usa-btn p" id="ue-save">💾 حفظ التعديلات</button><button type="button" class="usa-btn" id="ue-prev">👁️ معاينة الشبكة</button><button type="button" class="usa-btn" id="ue-cancel">إغلاق</button></div>'+
  '<div id="ue-grid"></div><div id="ue-st" class="usa-status"></div>';
  mountRows($('#ue-rows'),x.rows||[]);
  $('#ue-prev').onclick=function(){$('#ue-grid').innerHTML=gridHtml(readRows($('#ue-rows')));};
  $('#ue-cancel').onclick=function(){box.style.display='none';state.editing=null;};
  $('#ue-save').onclick=saveEditor;
  box.scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveEditor(){
  var id=state.editing;if(!id)return;
  var year=$('#ue-year').value.trim(),spec=$('#ue-spec').value,level=$('#ue-level').value,g=$('#ue-group').value.trim(),title=$('#ue-title').value.trim();
  if(!/^\d{4}-\d{4}$/.test(year))return status('ue-st','❌ السنة يجب أن تكون بصيغة 2025-2026.','err');
  if(!title)return status('ue-st','❌ أدخل عنواناً للجدول.','err');
  var rows=readRows($('#ue-rows'));
  var r=await client().from('study_schedules').update({title:title,specialization:spec,level:level,group_name:g||null,academic_year:year,is_active:$('#ue-active').checked,rows:rows}).eq('id',id);
  if(r.error)return status('ue-st','❌ '+r.error.message,'err');
  status('ue-st','✅ تم حفظ التعديلات ('+rows.length+' حصة).','ok');loadExisting();
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
    if(!out.length)throw new Error('لم يتم العثور على أي جدول في هذا الملف. تأكد أنه ملف الجداول الرسمي.');
    if(year)$('#usa-year').value=year;
    state.file=f;
    state.items=out.map(function(r){
      var h=r.header,sem=r.semester==='impair'?'Semestres impairs':(r.semester==='pair'?'Semestres pairs':'');
      return {page:r.page,include:!!(h.spec&&h.level),title:h.raw+(sem?' — '+sem:''),spec:h.spec,level:h.level,group:h.group,rows:r.rows,warnings:r.warnings,match:null,open:false};
    });
    computeMatches();renderPreview();
    var total=state.items.reduce(function(a,i){return a+i.rows.length;},0),warns=state.items.reduce(function(a,i){return a+i.warnings.length;},0),unk=state.items.filter(function(i){return !i.spec||!i.level;}).length;
    status('usa-st-up','✅ تم العثور على '+out.length+' جدول و '+total+' حصة.'+(skipped.length?'\nصفحات تم تخطيها (ليست جداول): '+skipped.join('، '):'')+(unk?'\n⚠️ '+unk+' جدول يحتاج تحديد التخصص/المستوى يدوياً.':'')+(warns?'\n⚠️ '+warns+' خلية بصيغة غير معتادة — راجعها في المعاينة.':'')+'\nراجع النتيجة ثم اضغط «نشر».',(unk||warns)?'warn':'ok');
  }catch(e){status('usa-st-up','❌ '+(e&&e.message||e),'err');}
  finally{btn.disabled=false;}
}
function computeMatches(){
  var y=(($('#usa-year')||{}).value||'').trim();
  state.items.forEach(function(it){
    var c=state.existing.filter(function(x){return x.academic_year===y&&x.specialization===it.spec&&x.level===it.level&&grp(x.group_name)===grp(it.group);});
    var st=semTag(it.title);
    /* same semester first; otherwise an existing record without a semester tag (old/manual title) is the same table */
    var m=c.filter(function(x){return semTag(x.title)===st;})[0]||(c.length===1&&(!semTag(c[0].title)||!st)?c[0]:null);
    it.match=m?m.id:null;
  });
  /* an existing record can be replaced by ONE table only (prevents several pages overwriting each other) */
  var used={};
  state.items.forEach(function(it){if(!it.match)return;if(used[it.match]){it.match=null;it.dupe=true;}else used[it.match]=1;});
}
function renderPreview(){
  var box=$('#usa-preview');if(!box)return;
  if(!state.items.length){box.innerHTML='';return;}
  var inc=state.items.filter(function(i){return i.include;}).length;
  box.innerHTML='<div class="usa-actions"><button type="button" class="usa-btn s" id="up-all">تحديد الكل</button><button type="button" class="usa-btn s" id="up-none">إلغاء التحديد</button></div><div class="usa-items">'+
  state.items.map(function(it,i){
    var tag=!it.spec||!it.level?'<span class="usa-tag bad">يحتاج تحديد التخصص/المستوى</span>':(it.match?'<span class="usa-tag rep">سيُستبدل الموجود</span>':'<span class="usa-tag new">جديد</span>');
    return '<div class="usa-item'+(it.include?'':' off')+'" data-i="'+i+'"><div class="usa-item-head"><input type="checkbox" data-f="include"'+(it.include?' checked':'')+'><div>'+
    '<div class="usa-item-fields"><input data-f="title" value="'+esc(it.title)+'" aria-label="العنوان"><select data-f="spec" aria-label="التخصص">'+opts(SPECS.map(function(s){return s[0];}),it.spec,'— التخصص —')+'</select><select data-f="level" aria-label="المستوى">'+opts(LEVELS,it.level,'— المستوى —')+'</select><input data-f="group" value="'+esc(it.group)+'" placeholder="المجموعة" aria-label="المجموعة"></div>'+
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
    if(e.type==='change'&&f!=='title'){if(f==='spec'||f==='level'||f==='group'||f==='include'){if(!it.spec||!it.level)it.include=false;computeMatches();syncRowsFromDom();renderPreview();}}
  };
  box.onclick=function(e){
    var b=e.target.closest('[data-act="toggle"]');if(!b)return;
    var el=b.closest('.usa-item'),it=state.items[+el.dataset.i];
    syncRowsFromDom();it.open=!it.open;renderPreview();
  };
}
function syncRowsFromDom(){
  [].forEach.call(document.querySelectorAll('#usa-preview .usa-item'),function(el){
    var rb=el.querySelector('.usa-rows-box');if(rb&&rb.querySelector('.usa-rows')){state.items[+el.dataset.i].rows=readRows(rb);}
  });
}
/* ---------- النشر ---------- */
async function publish(){
  syncRowsFromDom();
  var sb=client(),year=$('#usa-year').value.trim(),sel=state.items.filter(function(i){return i.include;});
  if(!/^\d{4}-\d{4}$/.test(year))return status('usa-st-pub','❌ السنة الجامعية يجب أن تكون بصيغة 2025-2026.','err');
  if(!sel.length)return status('usa-st-pub','حدّد جدولاً واحداً على الأقل للنشر.','warn');
  var seenK={},dups=[];
  sel.forEach(function(i){var k=[year,i.spec,i.level,grp(i.group),semTag(i.title)].join('|');if(seenK[k]){dups.push('صفحة '+seenK[k].page+' و صفحة '+i.page+' : '+i.spec+' '+i.level+' '+(i.group||'(بدون مجموعة)'));}else seenK[k]=i;});
  if(dups.length)return status('usa-st-pub','❌ جداول متكررة بنفس (التخصص/المستوى/المجموعة) ولا يمكن نشرها معاً:\n'+dups.join('\n')+'\nصحّح خانة «المجموعة» لكل جدول (مثل G1 (TD)) ثم أعد المحاولة.','err');
  var bad=sel.filter(function(i){return !i.spec||!i.level||!i.title.trim();});
  if(bad.length)return status('usa-st-pub','❌ أكمل التخصص والمستوى والعنوان لكل جدول محدد.','err');
  var btn=$('#up-publish');btn.disabled=true;
  try{
    var ss=await sb.auth.getSession(),session=ss&&ss.data&&ss.data.session;
    if(!session)throw new Error('يجب تسجيل الدخول بحساب المشرف الرئيسي.');
    var url=null,pid=null,warnUp='';
    if($('#usa-save-pdf').checked&&state.file){
      status('usa-st-pub','⏳ رفع ملف PDF الأصلي...','info');
      try{
        var f=state.file,first=sel[0];
        var sign=await fetch('/api/public/cloudinary/sign',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({section:'schedules',fileName:f.name,fileSize:f.size,academicYear:year,specialization:first.spec,level:first.level,group:''})});
        var sd=await sign.json();if(!sign.ok)throw new Error(sd.error||'تعذر الحصول على تصريح الرفع.');
        var fd=new FormData();fd.append('file',f,f.name);fd.append('api_key',sd.apiKey);fd.append('timestamp',sd.timestamp);fd.append('signature',sd.signature);fd.append('folder',sd.folder);fd.append('public_id',sd.publicId);
        var up=await fetch(sd.uploadUrl,{method:'POST',body:fd}),ud=await up.json();
        if(!up.ok||!ud.secure_url)throw new Error((ud.error&&ud.error.message)||'فشل رفع PDF.');
        url=ud.secure_url;pid=ud.public_id||sd.publicId;
      }catch(e){warnUp='\n⚠️ لم يُحفظ ملف PDF الأصلي ('+(e.message||e)+') — تم حفظ الجداول المقروءة فقط.';}
    }
    var ins=0,upd=0,replace=$('#usa-replace').checked;
    for(var k=0;k<sel.length;k++){
      var it=sel[k];status('usa-st-pub','⏳ حفظ الجداول '+(k+1)+' / '+sel.length+'...','info');
      var rec={academic_year:year,specialization:it.spec,level:it.level,group_name:it.group?grp(it.group):null,title:it.title.trim(),rows:it.rows,is_active:true};
      if(url){rec.file_url=url+'#page='+it.page;rec.file_name=state.file.name;rec.cloudinary_public_id=pid;}
      var m=replace&&it.match?it.match:null,res;
      if(m){res=await sb.from('study_schedules').update(rec).eq('id',m);if(res.error)throw new Error('صفحة '+it.page+' ('+it.title+'): '+res.error.message);upd++;}
      else{rec.uploaded_by=session.user.id;if(!url){rec.file_url=null;}res=await sb.from('study_schedules').insert(rec);
        if(res.error&&(res.error.code==='23505'||/duplicate key|unique/i.test(res.error.message||''))&&replace){
          /* a record with the same key already exists in the DB (not matched locally): update it instead of failing */
          var q=sb.from('study_schedules').select('id,title').eq('academic_year',year).eq('specialization',it.spec).eq('level',it.level);
          q=it.group?q.eq('group_name',grp(it.group)):q.is('group_name',null);
          var ex=await q;if(ex.error)throw new Error('صفحة '+it.page+' ('+it.title+'): '+ex.error.message);
          var cand=(ex.data||[]).filter(function(x){return semTag(x.title)===semTag(it.title);})[0]||(ex.data||[])[0];
          if(!cand)throw new Error('صفحة '+it.page+' ('+it.title+'): '+res.error.message);
          var up2=Object.assign({},rec);delete up2.uploaded_by;
          res=await sb.from('study_schedules').update(up2).eq('id',cand.id);
          if(res.error)throw new Error('صفحة '+it.page+' ('+it.title+'): '+res.error.message);upd++;
        }else{
          if(res.error)throw new Error('صفحة '+it.page+' ('+it.title+'): '+res.error.message+(/duplicate key|unique/i.test(res.error.message||'')?'\nفعّل «استبدال الموجود» ثم أعد المحاولة.':''));
          ins++;
        }}
    }
    status('usa-st-pub','✅ تم النشر بنجاح: '+ins+' جدول جديد، '+upd+' جدول تم تحديثه.'+warnUp,warnUp?'warn':'ok');
    state.items=[];state.file=null;var fi=$('#usa-file');if(fi)fi.value='';
    await loadExisting();
    var st=$('#usa-st-pub');if(!st){status('usa-st-up','✅ تم النشر: '+ins+' جديد، '+upd+' محدّث.'+warnUp,warnUp?'warn':'ok');}
  }catch(e){status('usa-st-pub','❌ '+(e&&e.message||e),'err');var b2=$('#up-publish');if(b2)b2.disabled=false;}
}
return render;
}
window.UNEMSchedAdmin={
  mount:function(host,opts){
    opts=opts||{};
    if(!host||!opts.sb)return Promise.reject(new Error('UNEMSchedAdmin.mount: host و sb مطلوبان'));
    return ensureParser().then(function(){
      injectCss();
      host.innerHTML='<div id="usa-root"></div>';
      build(opts.sb,opts.onChange)();
    });
  }
};
})();
