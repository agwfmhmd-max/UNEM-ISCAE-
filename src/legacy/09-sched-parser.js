/* UNEM schedule PDF parser v2 — geometry based (column = day, row = time slot).
   API: window.UNEMSchedParser = { DAYS, parsePage(items, pageNum) }
   items: [{str, x, y, w}]  (pdf.js text items; y grows upward)
   returns null (not a timetable page) or
   { page, year, semester:'impair'|'pair'|'', header:{raw,spec,level,group}, rows:[{day,time,subject,room,teacher}], warnings:[] } */
(function(){
'use strict';
var DAYS=['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI','DIMANCHE'];
var TIME_RE=/^\d{1,2}h\d{2}-\d{1,2}h\d{2}$/i;
function strip(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function clean(s){return String(s||'').replace(/\s+/g,' ').trim();}
function normTime(t){var m=String(t).toLowerCase().match(/^(\d{1,2})h(\d{2})-(\d{1,2})h(\d{2})$/);if(!m)return t;var p=function(n){return (+n<10?'0':'')+(+n);};return p(m[1])+'h'+m[2]+'-'+p(m[3])+'h'+m[4];}

/* join items of ONE line (sorted by x) into text, using real gaps between items */
function joinLine(line){
  line.sort(function(a,b){return a.x-b.x;});
  var out='',prev=null;
  line.forEach(function(it){
    var s=String(it.str||'');if(!s)return;
    if(prev){
      var gap=it.x-(prev.x+prev.w);
      var sp=/\s$/.test(out)||/^\s/.test(s)||gap>1.0;
      if(sp&&!/\s$/.test(out)&&!/^\s/.test(s))out+=' ';
    }
    out+=s;prev=it;
  });
  return out;
}
/* group items into visual lines (same baseline ±tol), top to bottom */
function toLines(items,tol){
  var arr=items.filter(function(i){return String(i.str||'').trim()!=='';}).sort(function(a,b){return b.y-a.y||a.x-b.x;});
  var lines=[];
  arr.forEach(function(it){
    var L=lines[lines.length-1];
    if(L&&Math.abs(L.y-it.y)<=tol){L.items.push(it);}
    else lines.push({y:it.y,items:[it]});
  });
  return lines.map(function(L){return joinLine(L.items);});
}
function cellText(items){return clean(toLines(items,5).join(' '));}

/* "Subject , Room , Teacher" -> parts. Splits ONLY on the first two " , " so a comma inside a
   teacher name ("Yahya O, Kebd") is kept; a doubled comma ("II , , 02") is collapsed first. */
function splitCell(t){
  t=clean(t).replace(/\s*,\s*(?:,\s*)+/g,' , ');
  var seps=[],m;
  /* separators are a comma preceded by a space (the PDF always writes " , ") */
  var re2=/\s+,\s*/g;
  while((m=re2.exec(t))){seps.push({i:m.index,l:m[0].length});if(seps.length===2)break;}
  if(seps.length<2)return null;
  return [t.slice(0,seps[0].i),t.slice(seps[0].i+seps[0].l,seps[1].i),t.slice(seps[1].i+seps[1].l)].map(clean);
}

var SPEC_RULES=[['GRH',/ressources humaines/],['DI',/developpement informatique/],['RIT',/reseaux/],['IG',/informatique de gestion/],
  ['BA',/banques/],['FC',/finance et compta/],['TCM',/commerciales|marketing/],['SAE',/statistique/]];
function parseHeader(raw){
  var h={raw:raw,spec:'',level:'',group:''};
  var s=clean(raw),m;
  if((m=s.match(/^(\d)\s*(?:ere|eme|er|e|re|ème|ère)?\s*ann/i))||(m=strip(s).match(/^(\d)\s*(?:ere|eme|er|e)?\s*annee/)))h.level='L'+m[1];
  else if((m=s.match(/^master\s*(\d)/i)))h.level='M'+m[1];
  var g=s.match(/\s+(G\s*\d+(?:\s*\(\s*TD\s*\))?)\s*$/i);
  if(g){h.group=clean(g[1]).replace(/^G\s*(\d+)/i,'G$1').replace(/\s*\(\s*TD\s*\)/i,' (TD)').toUpperCase();s=clean(s.slice(0,g.index));}
  var n=strip(s);
  for(var i=0;i<SPEC_RULES.length;i++){if(SPEC_RULES[i][1].test(n)){h.spec=SPEC_RULES[i][0];break;}}
  return h;
}

function parsePage(raw,pageNum){
  var items=(raw||[]).filter(function(i){return i&&typeof i.str==='string'&&isFinite(i.x)&&isFinite(i.y);}).map(function(i){return {str:i.str,x:i.x,y:i.y,w:isFinite(i.w)?i.w:0};});
  /* 1) day headers */
  var heads=items.filter(function(i){return DAYS.indexOf(clean(i.str).toUpperCase())>=0;});
  if(heads.length<5)return null;
  var topY=Math.max.apply(null,heads.map(function(h){return h.y;}));
  heads=heads.filter(function(h){return Math.abs(h.y-topY)<=6;}).sort(function(a,b){return a.x-b.x;});
  var seen={};heads=heads.filter(function(h){var k=clean(h.str).toUpperCase();if(seen[k])return false;seen[k]=1;return true;});
  if(heads.length<5)return null;
  var cols=heads.map(function(h){return {day:clean(h.str).toUpperCase(),c:h.x+h.w/2};});
  var bounds=[];for(var i=0;i<cols.length-1;i++)bounds.push((cols[i].c+cols[i+1].c)/2);
  var firstColLeft=heads[0].x-(heads[1].x-heads[0].x)*0.5;
  /* 2) time labels (left column) = row anchors */
  var labels=items.filter(function(i){return TIME_RE.test(clean(i.str))&&i.x<firstColLeft&&i.y<topY;}).sort(function(a,b){return b.y-a.y;});
  if(!labels.length)return null;
  var rowH=labels.length>1?(labels[0].y-labels[labels.length-1].y)/(labels.length-1):60;
  var bodyBottom=labels[labels.length-1].y-rowH-3;   /* anything below the last row = page footer */
  /* refine column borders: in each window around the midpoint pick the x covered by the fewest text items
     (the real cell border has none), so text never leaks into the neighbouring day */
  var body=items.filter(function(i){return i.y<topY-2&&i.y>=bodyBottom&&i.x+i.w/2>firstColLeft&&String(i.str).trim();});
  for(var bi=0;bi<bounds.length;bi++){
    var d=cols[bi+1].c-cols[bi].c,mid=bounds[bi],best=mid,bestN=1e9,bestD=1e9;
    for(var x=mid-0.2*d;x<=mid+0.2*d;x+=0.5){
      var n=0;for(var q=0;q<body.length;q++){if(body[q].x<x&&body[q].x+body[q].w>x)n++;}
      var dist=Math.abs(x-mid);
      if(n<bestN||(n===bestN&&dist<bestD)){bestN=n;bestD=dist;best=x;}
    }
    bounds[bi]=best;
  }
  var colOf=function(cx){var k=0;while(k<bounds.length&&cx>bounds[k])k++;return k;};
  var rowOf=function(y){var k=-1;for(var j=0;j<labels.length;j++){if(labels[j].y+6>=y)k=j;else break;}return k;};
  /* 3) distribute body items into cells */
  var cells={},warnings=[];
  items.forEach(function(it){
    if(it.y>=topY-2||it.y<bodyBottom)return;   /* header zone / footer */
    var cx=it.x+it.w/2;
    if(it.x<firstColLeft&&cx<firstColLeft)return;   /* time column */
    var r=rowOf(it.y);if(r<0)return;
    if(/^\s*dimanche\s+\d+\s+\w+\s+\d{4}/i.test(it.str)||/^Page\s+\d+/i.test(it.str))return;
    var k=r+'|'+colOf(cx);(cells[k]=cells[k]||[]).push(it);
  });
  var rows=[];
  Object.keys(cells).forEach(function(k){
    var p=k.split('|'),r=+p[0],c=+p[1];
    var txt=cellText(cells[k]);if(!txt)return;
    var parts=splitCell(txt);
    var day=cols[c].day,time=normTime(clean(labels[r].str));
    if(!parts){warnings.push(day+' '+time+' : '+txt);rows.push({day:day,time:time,subject:txt,room:'',teacher:''});return;}
    rows.push({day:day,time:time,subject:parts[0],room:parts[1],teacher:parts[2]});
  });
  var dOrder={};DAYS.forEach(function(d,i){dOrder[d]=i;});
  rows.sort(function(a,b){return (dOrder[a.day]-dOrder[b.day])||a.time.localeCompare(b.time);});
  /* 4) header, year, semester from the page text */
  var lines=toLines(items,5).join('\n');
  var pm=lines.match(/Profil\s*:\s*([^\n]*?)\s*:/);
  var rawTitle=pm?clean(pm[1]):'';
  var ym=lines.match(/(20\d{2})\s*\/\s*(20\d{2})/);
  var sm=lines.match(/Semestres?\s+(impairs?|pairs?)/i);
  var sem=sm?(/^impair/i.test(sm[1])?'impair':'pair'):'';
  if(!rawTitle&&!rows.length)return null;
  return {page:pageNum,year:ym?ym[1]+'-'+ym[2]:'',semester:sem,header:parseHeader(rawTitle),rows:rows,warnings:warnings};
}
window.UNEMSchedParser={DAYS:DAYS,parsePage:parsePage,_splitCell:splitCell,_parseHeader:parseHeader};
if(typeof module!=='undefined')module.exports=window.UNEMSchedParser;
})();
