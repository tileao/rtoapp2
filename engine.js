
function interp1(x, xs, ys){
  if(xs.length===0) return NaN;
  if(x<=xs[0]) return ys[0];
  if(x>=xs[xs.length-1]) return ys[ys.length-1];
  for(let i=1;i<xs.length;i++){
    if(x<=xs[i]){
      const x0=xs[i-1], x1=xs[i], y0=ys[i-1], y1=ys[i];
      return y0 + (y1-y0)*(x-x0)/(x1-x0);
    }
  } return NaN;
}
function interp2(oat, alt, oats, alts, grid){
  // bilinear in OAT (cols) and ALT (rows)
  const colVals = alts.map((a,ri)=>interp1(oat, oats, grid[ri]));
  return interp1(alt, alts, colVals);
}
// Fator de vento no RTO deve depender só da ALT (e peso), não da OAT
function rtoFactorByAlt(tbl, alt){
  if(!tbl || !tbl.alts || !tbl.fac) return 0;
  const reps = (tbl.alts||[]).map((a,ri) => {
    const row = (tbl.fac[ri]||[]).filter(v => typeof v==='number' && !isNaN(v));
    if(row.length===0) return 0;
    row.sort((a,b)=>a-b);
    const mid = Math.floor(row.length/2);
    return (row.length%2) ? row[mid] : (row[mid-1]+row[mid])/2;
  });
  return interp1(alt, tbl.alts, reps);
}
function headFrom(wind, wra){
  return wind*Math.cos(wra*Math.PI/180);
}
function nearestWeightTable(map, gw){
  const ks = Object.keys(map).map(k=>+k).sort((a,b)=>a-b);
  if(ks.length===0) return null;
  let best=ks[0], md=1e9;
  ks.forEach(k=>{ const d=Math.abs(k-gw); if(d<md){md=d; best=k;} });
  return map[best];
}
let DB=null;
async function loadDB(){ if(DB) return DB; try{ DB = await fetch("./db.json").then(r=>r.json()); } catch(e){ DB = {"conv":{},"enh":{},"rto":{}}; } return DB; }
function $(id){ return document.getElementById(id); }
function setSegActive(segId, btnId){
  const seg = $(segId);
  Array.from(seg.querySelectorAll("button")).forEach(b=>b.classList.remove("active"));
  $(btnId).classList.add("active");
}
function updatePressureAltitude(){
  const auto = $("altAuto").classList.contains("active");
  if(auto){
    const elev = +$("elev").value || 0;
    const qnh  = +$("qnh").value || 1013;
    const altp = elev + (1013 - qnh) * 30;
    $("alt").value = Math.round(altp);
  } else {
    const manual = +$("altManualInput").value || 0;
    $("alt").value = Math.round(manual);
  }
}
function show(val, unit, note){ $("result").textContent=val; $("unit").textContent=unit||""; $("note").textContent=note||""; }
async function calculate(){
  updatePressureAltitude();
  const mode = $("mode").value;
  const gw   = +$("gw").value;
  const oat  = +$("oat").value;
  const alt  = +$("alt").value;
  const wind = +$("wind").value;
  const wra  = +$("wra").value;
  const windMode = "trig"; // somente trig
  const descending = $("descToggle").checked; // default ON
  const filter  = +$("filter").value;
  const db = await loadDB();
  const head = headFrom(wind, wra);
  const FT_PER_KT = -1; // DropDown fixo
  if(mode==="conv" || mode==="enh"){
    const map = mode==="conv" ? db.conv : db.enh;
    const tbl = nearestWeightTable(map, gw);
    if(!tbl){ return show("—","Base não carregada"); }
    const base = interp2(oat, alt, tbl.oats, tbl.alts, tbl.grid);
    let dd = base + head*FT_PER_KT;
    if(mode==="conv" && descending) dd += 15;
    show(Math.round(dd)+" ft", mode==="conv" ? "Drop Down Convencional" : "Drop Down Enhanced",
         "Headwind: "+Math.round(head)+" kt  •  Alt pressão: "+Math.round(alt)+" ft");
  } else {
    const tbl = nearestWeightTable(db.rto, gw);
    if(!tbl){ return show("—","Base não carregada"); }
    const dist = interp2(oat, alt, tbl.oats, tbl.alts, tbl.dist);
    const fac  = rtoFactorByAlt(tbl, alt); // << CORREÇÃO: não depende de OAT
    const windBenefit = head * fac;
    const total = dist + windBenefit + filter;
    show(Math.round(total)+" m", "RTO Clear Area",
         "Benefício vento: "+Math.round(windBenefit)+" m  •  EAPS/IBF: "+filter+" m  •  Alt pressão: "+Math.round(alt)+" ft");
  }
}

// ===== UX: auto-avanço inteligente (pula campos escondidos) =====
function enhanceInputs(){
  // comprimentos máximos de dígitos; Elevação=3, Vento=2, WRA=2
  const maxLen = { gw:4, oat:2, qnh:4, elev:3, altManualInput:4, wind:2, wra:2 };

  function visible(el){
    if(!el) return false;
    const style = window.getComputedStyle(el);
    if(style.display==='none' || style.visibility==='hidden') return false;
    if(el.offsetParent===null && style.position!=='fixed') return false;
    return true;
  }

  function inputById(id){ const el=document.getElementById(id); return el && el.tagName==='INPUT' ? el : null; }

  function sequence(){
    const auto = document.getElementById('altAuto').classList.contains('active');
    const ids = auto ? ["gw","oat","qnh","elev","wind","wra"] : ["gw","oat","altManualInput","wind","wra"];
    return ids.map(id => inputById(id)).filter(el => el && visible(el));
  }

  function setup(el){
    el.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); }, {passive:false});
    el.addEventListener('focus', () => {
      if(el.hasAttribute('data-autoselect')) setTimeout(()=>{ try{ el.select(); }catch{} },0);
      if(el.value==="0") el.value="";
    });
    el.addEventListener('keydown', e => {
      if(e.key==='Enter'){
        e.preventDefault();
        const seq = sequence();
        const idx = seq.indexOf(el);
        const next = seq[idx+1];
        if(next){ next.focus(); } else { const b=document.getElementById('calcBtn'); if(b) b.click(); }
      }
    });
    el.addEventListener('input', () => {
      const n = (el.value||"").replace(/[^0-9]/g,"").length;
      const lim = maxLen[el.id];
      if(lim && n>=lim){
        const seq = sequence();
        const idx = seq.indexOf(el);
        const next = seq[idx+1];
        if(next){ next.focus(); }
      }
      calculate(); // live
    });
  }

  ["gw","oat","qnh","elev","altManualInput","wind","wra"].forEach(id=>{ const el=inputById(id); if(el) setup(el); });

  const clearBtn = document.getElementById('clearBtn');
  if(clearBtn){
    clearBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      ["gw","oat","wind","wra","elev","altManualInput"].forEach(id=>{ const el=inputById(id); if(el) el.value=""; });
      const q=document.getElementById('qnh'); if(q) q.value="1013";
      const filter=document.getElementById('filter'); if(filter) filter.value="0";
      // defaults
      // trig only (sem segmento)
      setSegActive('altSeg','altAuto');  // Auto
      document.getElementById('altAutoRow').style.display='flex';
      document.getElementById('altManualRow').style.display='none';
      const desc=document.getElementById('descToggle'); if(desc) desc.checked=true; // Desc ON
      const mode=document.getElementById('mode'); if(mode) mode.value='rto';
      calculate();
      const first=inputById('gw'); if(first) first.focus();
    });
  }
}

async function refreshCacheAndReload(){
  try{
    if('caches' in window){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if('serviceWorker' in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  }catch(e){ console.warn('Cache clear error', e); }
  location.reload();
}

window.addEventListener("DOMContentLoaded", ()=>{
  
  
  document.getElementById("altAuto").addEventListener("click", ()=>{
    setSegActive("altSeg","altAuto");
    document.getElementById("altAutoRow").style.display="flex";
    document.getElementById("altManualRow").style.display="none";
    calculate();
  });
  document.getElementById("altManual").addEventListener("click", ()=>{
    setSegActive("altSeg","altManual");
    document.getElementById("altAutoRow").style.display="none";
    document.getElementById("altManualRow").style.display="flex";
    calculate();
  });
  ["mode","filter","descToggle"].forEach(id=>{
    const el=document.getElementById(id);
    if(el){ el.addEventListener("input", calculate); el.addEventListener("change", calculate); }
  });
  document.getElementById("calcBtn").addEventListener("click", e=>{ e.preventDefault(); calculate(); });
  document.getElementById("exportBtn").addEventListener("click", e=>{
    e.preventDefault();
    const payload = JSON.stringify(DB||{"conv":{},"enh":{},"rto":{}}, null, 2);
    const blob = new Blob([payload], {type:"application/json"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="db.json"; a.click();
  });
  document.getElementById("fileInput").addEventListener("change", async e=>{
    const file=e.target.files[0]; if(!file) return;
    const text=await file.text();
    try{ DB = JSON.parse(text); alert("Base de dados carregada!"); calculate(); }catch(err){ alert("JSON inválido."); }
  });
  const up = document.getElementById('updateCacheBtn'); if(up){ up.addEventListener('click', (e)=>{ e.preventDefault(); refreshCacheAndReload(); }); }
  enhanceInputs();
  calculate();
});
