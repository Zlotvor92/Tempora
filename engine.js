'use strict';
/* ============================================================
   SUB-19 GENERATOR v3 — deterministički engine plana (5K, 5 dana/ned)
   Tempi: Daniels–Gilbert jednačine (objavljene):
     VO2(v)      = -4.60 + 0.182258·v + 0.000104·v²        [v u m/min]
     %VO2max(t)  = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)   [t u min]
   VDOT = VO2(v_trke) / %VO2max(t_trke)
   Intenzitetske tačke (Daniels zone, sredine opsega): I=100% vVO2max,
   T=88%, E=70%, LR=68%, M=80% — konstante zona su izbor unutar
   objavljenih opsega, kalibrisane na etalon plan (v. testove).
   Rast VDOT-a po nedelji (heuristika, kalibrisana na etalon):
     konzervativno 0.15 · standard 0.25 · agresivno 0.36
   ============================================================ */

const Z = { I: 1.00, T: 0.88, M: 0.80, E: 0.70, LR: 0.68 };
/* Stope rasta VDOT/nedeljno:
   kons 0.15 i std 0.25 — unutar Danielsove trenerske smernice (~1 poen / 4–6 ned.,
   'Daniels' Running Formula'; ekspertska heuristika, NE kontrolisana studija).
   agr 0.43 — kalibrisano na dokumentovanu putanju autora plana (20:37→cilj 18:55 za 14 ned.,
   uz paralelno mršavljenje i nizak trenažni staž) — plafon, uz obaveznu ogradu u UI. */
const RAMP = { kons: 0.15, std: 0.25, agr: 0.43 };
const GROW_MAX = 1.08;          /* maks. +8% nedeljnog volumena */
const DELOAD_EVERY = 4;         /* svaka 4. nedelja */
const DELOAD_F = 0.73;          /* deload = 73% prethodne (etalon: 32/44) */
const TAPER_F = 0.65;           /* pretposlednja = 65% vrhunca (etalon: 30/46) */
const RACEWK_F = 0.30;          /* trkačka nedelja ≈ 30% vrhunca */
const LR_SHARE = 0.24;          /* LR ≈ 24% nedelje (etalon: 23–25%) */

/* ============================================================
   buildDaySlots — PROMENLJIVI BROJ DANA TRČANJA (2–7) + BROJ
   KVALITETNIH SESIJA (1–2). Ovo je INŽENJERSKA ODLUKA, ne naučna
   formula — nema objavljene konstante za "koliko kvalitetnih
   sesija za koliki broj dana". Pravilo koje primenjujem (šire
   rasprostranjena trenerska konvencija, ne izmerena vrednost):
   broj TEŠKIH dana ne raste linearno sa ukupnim brojem dana —
   razlika ide u broj LAKIH dana. Zato je kvalitet ograničen na
   najviše 2, i na najviše 1 kada je runDays ≤ 3 (nema prostora
   za oporavak između dva teška dana uz samo 2–3 dana ukupno).
   Nedelja: LR je UVEK dow=7 (Ned) — fiksan izbor, ne konfigurabilno.
   Kvalitet se postavlja na proporcionalne pozicije unutar preostalih
   dana (radi ravnomernog razmaka), NE na fiksne "poslednje" pozicije
   — kod runDays=4,quality=2 ovo se DOKAZANO poklapa sa etalonom
   (Pon lako / Sre intervali / Pet tempo / Ned LR), što je jedina
   konfiguracija sa realnom validacijom. Sve ostale kombinacije su
   inženjerska ekstrapolacija bez etalon-provere. */
function buildDaySlots(runDays, qualityCount, prefs){
  runDays = Math.max(2, Math.min(7, Math.round(runDays)));
  const effQ = runDays<=3 ? Math.min(qualityCount,1) : Math.min(qualityCount,2);
  /* KORISNIČKI IZBOR DANA (opciono): prefs = { lrDow: 1–7, qDows: [1–7,...] }.
     Bez prefs — ponašanje IDENTIČNO ranijem (LR nedelja, proporcionalni raspored). */
  const lrDow = (prefs && prefs.lrDow>=1 && prefs.lrDow<=7) ? Math.round(prefs.lrDow) : 7;
  const slots = {1:'rest',2:'rest',3:'rest',4:'rest',5:'rest',6:'rest',7:'rest'};
  slots[lrDow]='lr';
  let qSel = (prefs && Array.isArray(prefs.qDows) ? prefs.qDows : [])
    .map(Math.round).filter(d=>d>=1&&d<=7&&d!==lrDow);
  qSel = [...new Set(qSel)].slice(0, effQ).sort((a,b)=>a-b);
  const ORDER=[1,3,5,2,6,4,7].filter(d=>d!==lrDow && !qSel.includes(d));
  const need = runDays-1-qSel.length;
  const chosen = qSel.concat(ORDER.slice(0, Math.max(need,0))).sort((a,b)=>a-b);
  const len=chosen.length;
  if(qSel.length){
    /* eksplicitan izbor: raniji dan = q1 (VO2 familija), kasniji = q2 (prag) */
    chosen.forEach(dow=>{
      if(dow===qSel[0]) slots[dow]='q1';
      else if(qSel[1]!=null && dow===qSel[1]) slots[dow]='q2';
      else slots[dow]='easy';
    });
    /* ako je izabran samo 1 a effQ=2 — drugi kvalitet ide proporcionalno na preostale */
    if(qSel.length===1 && effQ===2){
      const rest=chosen.filter(d=>slots[d]==='easy');
      if(rest.length){ slots[rest[Math.min(rest.length-1, Math.round(rest.length*2/3))]]='q2'; }
    }
  }else{
    function idx(fracNum,fracDen){ return Math.min(len-1, Math.max(0, Math.round(len*fracNum/fracDen))); }
    let qIdx=[];
    if(effQ===2) qIdx=[idx(1,3), idx(2,3)];
    else if(effQ===1) qIdx=[idx(1,2)];
    qIdx = [...new Set(qIdx)];
    chosen.forEach((dow,i)=>{
      if(qIdx[0]===i) slots[dow]='q1';
      else if(qIdx[1]===i) slots[dow]='q2';
      else slots[dow]='easy';
    });
  }
  return slots;
}
/* Upozorenja za korisnički izbor dana — NE blokira (sve je izmenjivo, filozofija
   vlasnika), samo kaže. Hard/easy princip: dva teška dana zaredom (kvalitet ili LR)
   su trenerska konvencija koju treba izbeći; uključuje prelaz Ned→Pon. */
function dayPrefWarnings(slots){
  const N=['Pon','Uto','Sre','Čet','Pet','Sub','Ned'];
  const hard=d=>slots[d]==='q1'||slots[d]==='q2'||slots[d]==='lr';
  const out=[];
  for(let d=1; d<=7; d++){
    const nxt = d===7 ? 1 : d+1;
    if(hard(d) && hard(nxt)) out.push(`Teški dani zaredom: ${N[d-1]} → ${N[nxt-1]} — hard/easy princip preporučuje lak dan ili odmor između.`);
  }
  return out;
}
/* Bira dan za snagu: prvi 'rest' dan u nedelji (jednostavno, generičko pravilo — snaga je opciona/samostalna, ne zahteva optimalan raspored). null ako nema slobodnog dana. */
function pickStrengthDay(slots){
  for(let d=1; d<=6; d++) if(slots[d]==='rest') return d;
  return null;
}

function vo2AtV(v){ return -4.60 + 0.182258*v + 0.000104*v*v; }
function vAtVo2(vo2){ /* inverz kvadratne */ 
  const a=0.000104,b=0.182258,c=-4.60-vo2;
  return (-b+Math.sqrt(b*b-4*a*c))/(2*a);
}
function pctVo2max(tMin){ return 0.8 + 0.1894393*Math.exp(-0.012778*tMin) + 0.2989558*Math.exp(-0.1932605*tMin); }
function vdotFromRace(distM, sec){
  const tMin=sec/60, v=distM/tMin;
  return vo2AtV(v)/pctVo2max(tMin);
}
/* tempo (sec/km) za zonu pri datom VDOT-u */
function paceForZone(vdot, zone){
  const v = vAtVo2(vdot * Z[zone]);   /* m/min */
  return Math.round(60000 / v);        /* sec/km */
}
/* vreme trke (sec) koje odgovara VDOT-u na distM — rešava se iterativno */
function raceTimeForVdot(vdot, distM){
  let t = distM/ (vAtVo2(vdot)); /* početna procena: tempo na 100% */
  for(let i=0;i<40;i++){
    const v = distM/t;                        /* m/min */
    const f = vo2AtV(v)/pctVo2max(t) - vdot;  /* koren */
    const dt = 0.01;
    const v2 = distM/(t+dt);
    const f2 = vo2AtV(v2)/pctVo2max(t+dt) - vdot;
    const d = (f2-f)/dt;
    if(Math.abs(d)<1e-9) break;
    t = t - f/d;
    if(Math.abs(f)<1e-6) break;
  }
  return Math.round(t*60);
}
/* INVERZ od paceForZone: opservirani tempo (sec/km) na datoj zoni -> implicirani VDOT.
   paceForZone je monotono opadajuća funkcija VDOT-a (viša forma = brži tempo) -> binarna pretraga. */
function vdotFromPace(paceSecKm, zone){
  let lo=20, hi=85;
  for(let i=0;i<40;i++){
    const mid=(lo+hi)/2;
    if(paceForZone(mid,zone) > paceSecKm) lo=mid; else hi=mid;
  }
  return (lo+hi)/2;
}
const r1=x=>Math.round(x*10)/10;
function fmtP(sec){const m=Math.floor(sec/60),s=sec%60;return m+':'+String(s).padStart(2,'0');}
function riegel(sec, fromM, toM){ return sec*Math.pow(toM/fromM,1.06); }

/* ---------- realnost cilja ---------- */
function assess(pb, weeks, intensity, goalSec){
  const vdot0 = vdotFromRace(pb.distM, pb.sec);
  const rampW = Math.max(weeks-2, 1);              /* rast staje pred taper */
  const vdotGoal = vdot0 + RAMP[intensity]*rampW;
  const predictedSec = raceTimeForVdot(vdotGoal, 5000);
  const out = { vdot0:r1(vdot0), vdotGoal:r1(vdotGoal), predictedSec, realno:null, goalVdot:null };
  if(goalSec){
    const gv = vdotFromRace(5000, goalSec);
    out.goalVdot = r1(gv);
    out.realno = gv <= vdotGoal + 0.3;             /* tolerancija zaokruživanja */
  }
  return out;
}

/* ---------- struktura sesija ---------- */
function pickReps(workKm, wkIdx, weeks){
  /* rani deo ciklusa: duži oporavci/kraći radovi → kasnije duži radovi; meni iz etalona */
  const menu = wkIdx/weeks < 0.25 ? [800,1000] : wkIdx/weeks < 0.7 ? [1000] : [1000,1200];
  const rep = menu[Math.min(menu.length-1, Math.floor((wkIdx/weeks)*menu.length))];
  const n = Math.max(3, Math.round(workKm*1000/rep));
  return { rep, n };
}

/* ============================================================
   RASPODELA VOLUMENA — LR INVARIJANTA
   Fiksno 24%-pravilo (etalon) je UKLONJENO na zahtev vlasnika plana.
   Zamena: (1) LR je NAJDUŽE trčanje nedelje — tvrda invarijanta, jača
   od svih ostalih ograničenja; (2) gornja granica LR-a za ≥5 dana
   trčanja ≈ Danielsova smernica (LR ≤ 30% nedeljnog obima za nedelje
   <64 km; 'Daniels Running Formula'); capovi za 2–4 dana su inženjerski
   (na 2 dana trčanja LR matematički MORA biti >50% nedelje).
   Izuzetak invarijante: SAMO trkačka nedelja (trka 5 km je najkraća). */
function allocEasyLR(vol, qKms, easyCount, runDays){
  const qSum=qKms.reduce((a,b)=>a+b,0);
  const maxQ=qKms.length?Math.max(...qKms):0;
  let rem=Math.max(vol-qSum, 3);
  if(easyCount===0) return { lr:r1(Math.max(rem, maxQ*1.1)), easies:[] };
  const capF = runDays>=5?0.32: runDays===4?0.36: runDays===3?0.50:0.68;
  let lr = Math.max(rem*0.45, maxQ*1.12, (rem/(easyCount+1))*1.3);
  lr = Math.min(lr, vol*capF, rem-3*easyCount);
  if(lr < maxQ*1.05) lr = Math.min(maxQ*1.12, rem-2.5*easyCount); /* invarijanta > cap */
  lr = Math.max(lr, 4);
  const wgt=[1.15,1,0.9,0.85,0.8,0.75].slice(0,easyCount);
  const wsum=wgt.reduce((a,b)=>a+b,0);
  let easies=wgt.map(x=>Math.max(3, r1((rem-lr)*x/wsum)));
  const mx=Math.max(...easies);
  if(mx>=lr){ const sc=(lr*0.9)/mx; easies=easies.map(e=>Math.max(3,r1(e*sc))); }
  lr=r1(Math.max(rem - easies.reduce((a,b)=>a+b,0), Math.max(...easies, maxQ)+0.5));
  return { lr, easies };
}

/* ============================================================
   ROTACIJA KVALITETNIH SESIJA — planovi NISU kopija etalona.
   q1 (VO2 familija): intervali; svaka 3. nedelja (faza <72%) = FARTLEK
     (McMillan: 10–12×1 min @ ~I tempo / 1 min džog).
   q2 (prag familija): rana faza (<35%) = broken tempo (Daniels 'cruise',
     ≤~10–12% nedelje na T); srednja = naizmenično kontinuirani tempo
     (~20 min, Daniels) / progresivni run; kasna = kontinuirani uz race-tempo.
   Interval Q-km = 10% nedelje (kompromis: Daniels cap 8% ↔ etalon 15% —
   inženjerska odluka, dokumentovana, nije naučna konstanta).
   quality=1: jedini kvalitet rotira int/tempo/fartlek po nedelji. */
function mkIntervals(dow,w,weeks,vol,pI){
  const qI=Math.max(2.4, Math.min(vol*0.10, 6));
  const {rep,n}=pickReps(qI,w,weeks);
  return sessInt(dow,1.5,n,rep,pI,120,1);
}
function mkFartlek(dow,w,pI,pE){
  const n=Math.min(12, 8+Math.floor(w/4));
  return sessFartlek(dow,1.5,n,60,60,pI,1,pE);
}
function mkTempoCont(dow,vol,pT,fixKm){
  const qT=fixKm!=null?fixKm:r1(Math.max(3, Math.min(vol*0.10, (20*60)/pT*1, 6)));
  return sessTempo(dow,2,qT,pT,2);
}
function mkBroken(dow,w,vol,pT){
  const total=Math.max(3.6, Math.min(vol*0.12, 7));
  const repM=Math.round(total*1000/2/100)*100;
  return sessInt(dow,2,2,repM,pT,90,2,'Tempo (broken)');
}
function mkProg(dow,vol,pT,pE){
  const total=r1(Math.max(5, Math.min(vol*0.20, 10)));
  return sessProg(dow,total,pT,pE);
}
function buildQuality(w,weeks,slotRole,effQ,vol,pI,pT,pE,isTaper1,dow,racePace){
  const phase=w/weeks;
  if(effQ===1){
    if(isTaper1) return sessInt(dow,1.5,5,400,Math.max(pI,racePace),90,1);
    const mod=w%3;
    if(mod===0 && phase<0.72) return mkFartlek(dow,w,pI,pE);
    if(mod===2) return mkTempoCont(dow,vol,pT);
    return mkIntervals(dow,w,weeks,vol,pI);
  }
  if(slotRole==='q1'){
    if(isTaper1) return sessInt(dow,1.5,5,400,Math.max(pI,racePace),90,1);
    if(w%3===0 && phase<0.72) return mkFartlek(dow,w,pI,pE);
    return mkIntervals(dow,w,weeks,vol,pI);
  }
  /* q2 */
  if(isTaper1) return mkTempoCont(dow,vol,pT,3);
  if(phase<0.35) return mkBroken(dow,w,vol,pT);
  if(phase<0.75) return (w%2===1)? mkProg(dow,vol,pT,pE) : mkTempoCont(dow,vol,pT);
  return mkTempoCont(dow,vol,pT);
}

/* ---------- glavni generator ---------- */
/* inp: {startDate, raceDate, pb:{distM,sec}, weeklyKm, intensity, goalSec?} */
/* ============================================================
   IZMENJIVA SESIJA — v1 (tempo + dužina ponavljanja + pauza + broj
   ponavljanja, sva 4 polja). Plan je skelet iz VDOT-a; korisnik sme
   ručno da prepravi bilo koje od ova 4 polja po sesiji. desc/km se
   NE peku unapred — računaju se IZ session objekta, uvek iznova.
   Obim: samo redovne 'int'/'tempo' dane (ne deload — nema kvalitetnih
   dana; ne trkačku nedelju — aktivacioni 200m dan ima drugačiji
   model pauze, distancni a ne vremenski, nije pokriven ovom v1).
   ============================================================ */
function fmtRest(sec){ return (sec>=60 && sec%60===0) ? Math.round(sec/60)+' min' : sec+' s'; }
function sessKm(s){
  if(s.type==='int')    return r1(s.wuKm + s.reps*s.repM/1000 + s.cdKm + Math.max(s.reps-1,0)*0.15);
  if(s.type==='fartlek')return r1(s.wuKm + s.cdKm + s.reps*(s.repSec/s.paceSec + s.restSec/s.easyPaceSec));
  if(s.type==='prog')   return r1(s.qKm);
  return r1(s.wuKm + s.qKm + s.cdKm); /* tempo kontinuirani */
}
function sessDesc(s){
  if(s.type==='int'){
    const restWord = s.kind==='Tempo (broken)' ? 'float' : 'hod';
    return `${s.kind} — ${s.wuKm} km WU + ${s.reps}×${s.repM} m @ ${fmtP(s.paceSec)}/km (${fmtRest(s.restSec)} ${restWord}) + ${s.cdKm} km CD`;
  }
  if(s.type==='fartlek')
    return `Fartlek — ${s.wuKm} km WU + ${s.reps}×${s.repSec} s brzo @ ~${fmtP(s.paceSec)}/km (${s.restSec} s lagani džog) + ${s.cdKm} km CD`;
  if(s.type==='prog')
    return `Progresivno — ${s.qKm} km: prve 2/3 @ ~${fmtP(s.easyPaceSec)}/km → poslednja trećina @ ${fmtP(s.paceSec)}/km`;
  return `Tempo — ${s.wuKm} km WU + ${s.qKm} km @ ${fmtP(s.paceSec)}/km + ${s.cdKm} km CD`;
}
function sessInt(dow,wuKm,reps,repM,paceSec,restSec,cdKm,kind){
  const session={type:'int',kind:kind||'Intervali',wuKm,reps,repM,paceSec,restSec,cdKm,overrides:{}};
  return {dow,tag:kind==='Tempo (broken)'?'tempo':'int',km:sessKm(session),desc:sessDesc(session),session};
}
function sessTempo(dow,wuKm,qKm,paceSec,cdKm){
  const session={type:'tempo',kind:'Tempo',wuKm,qKm,paceSec,cdKm,overrides:{}};
  return {dow,tag:'tempo',km:sessKm(session),desc:sessDesc(session),session};
}
/* Fartlek — struktura po McMillan smernici: 10–12 × 1 min surge (malo brže od 5K
   tempa ≈ naš I-tempo) / 1 min lagani džog. Vremenski surge-ovi → NEMA pouzdane
   Strava lap-detekcije po distanci (deriveQS ga preskače); Race Predictor red
   se emituje (surge-km @ surge tempo), popunjava se ručno. */
function sessFartlek(dow,wuKm,n,surgeSec,easySec,paceSec,cdKm,easyPaceSec){
  const session={type:'fartlek',kind:'Fartlek',wuKm,cdKm,reps:n,repSec:surgeSec,restSec:easySec,paceSec,easyPaceSec,overrides:{}};
  return {dow,tag:'int',km:sessKm(session),desc:sessDesc(session),session};
}
/* Progresivni run: prve 2/3 lako, poslednja trećina na T tempu. */
function sessProg(dow,totalKm,endPaceSec,easyPaceSec){
  const session={type:'prog',kind:'Progresivno',qKm:totalKm,paceSec:endPaceSec,easyPaceSec,wuKm:0,cdKm:0,overrides:{}};
  return {dow,tag:'tempo',km:sessKm(session),desc:sessDesc(session),session};
}
/* Primenjuje ručnu izmenu JEDNOG polja; mutira i vraća isti day objekat.
   field za 'int': paceSec | repM | reps | restSec | wuKm | cdKm
   field za 'tempo': paceSec | qKm | wuKm | cdKm */
function applyEdit(day, field, value){
  if(!day.session) throw new Error('Ovaj dan nema izmenjivu sesiju (deload/trkačka nedelja/lako/LR/snaga/odmor).');
  day.session[field]=value;
  day.session.overrides[field]=true;
  day.km=sessKm(day.session);
  day.desc=sessDesc(day.session);
  return day;
}
function predRow(w,tip,q,pt){ return { w, l:'N'+w+' · '+tip, q, pt, p5k: Math.round(riegel(pt*q, q*1000, 5000)) }; }
/* Predikcija i QS (Strava lap-detekcija) IZVEDENI iz trenutnog stanja sesija —
   pozivati posle bilo koje applyEdit, tako da oba ostanu dosledna izmeni
   (npr. promenjena dužina ponavljanja mora da promeni i šta sync traži u lapovima). */
function sessQKm(ses){
  if(ses.type==='int')    return r1(ses.reps*ses.repM/1000);
  if(ses.type==='fartlek')return r1(ses.reps*ses.repSec/ses.paceSec);
  if(ses.type==='prog')   return r1(ses.qKm/3); /* T deo = poslednja trećina */
  return ses.qKm;
}
function deriveQS(weeks){
  const qs={};
  weeks.forEach(w=>w.days.forEach(d=>{
    if(!d.session) return;
    if(d.session.type==='int') qs['n'+w.w+'d'+d.dow]=[d.session.repM];               /* i broken tempo — lapovi po repM */
    else if(d.session.type==='tempo') qs['n'+w.w+'d'+d.dow]=[Math.round(d.session.qKm*1000)];
    /* fartlek/prog: bez lap-spec — vremenski/kontinuirani, nema pouzdane detekcije */
  }));
  return qs;
}
function derivePred(weeks){
  const pred=[];
  weeks.forEach(w=>w.days.forEach(d=>{
    if(!d.session) return;
    pred.push(predRow(w.w, d.session.kind, sessQKm(d.session), d.session.paceSec));
  }));
  return pred;
}
/* Prenosi ZAKLJUČANA (ručno izmenjena) polja iz starih nedelja na sveže
   regenerisane — koristi ga recalibratedPlan da rekalibracija ne pregazi
   ručne izmene. Vraća fresh (mutiran) niz nedelja. */
function mergeOverrides(freshWeeks, oldWeeks){
  const oldByKey={};
  (oldWeeks||[]).forEach(w=>w.days.forEach(d=>{ if(d.session) oldByKey[w.w+'-'+d.dow]=d.session; }));
  freshWeeks.forEach(w=>w.days.forEach(d=>{
    if(!d.session) return;
    const old=oldByKey[w.w+'-'+d.dow];
    if(!old) return;
    if(old.type!==d.session.type) return; /* rotacija promenila tip sesije na tom slotu — polja nisu prenosiva */
    let touched=false;
    Object.keys(old.overrides||{}).forEach(f=>{
      if(old.overrides[f]){ d.session[f]=old[f]; d.session.overrides[f]=true; touched=true; }
    });
    if(touched){ d.km=sessKm(d.session); d.desc=sessDesc(d.session); }
  }));
  return freshWeeks;
}

function nextMonday(ds){
  const d=new Date(ds+'T00:00:00');
  const wd=(d.getDay()+6)%7;            /* 0=Pon */
  if(wd!==0)d.setDate(d.getDate()+(7-wd));
  return d.toISOString().slice(0,10);
}
function generatePlan(inp){
  const start = nextMonday(inp.startDate);
  const daysN = Math.round((new Date(inp.raceDate) - new Date(start)) / 86400000);
  const weeks = Math.floor(daysN/7) + 1;
  if(weeks < 6) return { error: 'Manje od 6 nedelja do trke — puna periodizacija nije moguća. Skraćeni protokol nije deo v1.' };
  if(weeks > 20) return { error: 'Više od 20 nedelja — izaberi kasniji start plana.' };
  const runDays = Math.max(2, Math.min(7, Math.round(inp.runDays||4)));
  const qWant = Math.max(1, Math.min(2, Math.round(inp.quality||2)));
  const slots = buildDaySlots(runDays, qWant, { lrDow: inp.lrDow, qDows: inp.qDows });
  const dayWarnings = dayPrefWarnings(slots);
  const effQ = Object.values(slots).filter(r=>r==='q1'||r==='q2').length;
  const a = assess(inp.pb, weeks, inp.intensity, inp.goalSec||null);
  a.start = start;

  /* volumen: start→vrhunac uz +8% cap, deload svake 4., taper 2 nedelje (NEPROMENJENO — kalibrisano na etalon) */
  const vols=[]; let cur=Math.max(15, Math.min(inp.weeklyKm, 90));
  const peakTarget = Math.min(cur*2.1, cur + weeks*2.2, 90);
  for(let w=1; w<=weeks; w++){
    if(w===weeks){ vols.push(r1(peak(vols)*RACEWK_F)); }
    else if(w===weeks-1){ vols.push(r1(peak(vols.length?vols:[cur])*TAPER_F)); }
    else if(w%DELOAD_EVERY===0 && w<weeks-2){ vols.push(r1(vols[vols.length-1]*DELOAD_F)); }
    else{
      const prev = vols.length?vols[vols.length-1]:cur/GROW_MAX;
      const base = (w>1 && (w-1)%DELOAD_EVERY===0) ? vols[vols.length-2] : prev;
      cur = Math.min(base*GROW_MAX, peakTarget);
      vols.push(r1(cur));
    }
  }
  function peak(arr){ return Math.max(...arr, cur); }

  const rampWeeks = weeks-2;
  const racePace = Math.round((inp.goalSec||a.predictedSec)/5);
  const raceDow = daysN - (weeks-1)*7 + 1; /* 1..7 unutar poslednje nedelje */
  const plan={ weeks:[], pred:[], qs:{}, meta:{...a, weeks, intensity:inp.intensity, racePace, runDays, quality:effQ, dayWarnings} };
  const strengthDow = (runDays<=5) ? pickStrengthDay(slots) : null;

  function D(dow,tag,km,desc){ return {dow,tag,km,desc}; }
  function REST(dow,desc){ return {dow,rest:true,desc:desc||null}; }
  function pushPredQs(dayObj,w){
    const ses=dayObj.session;
    plan.pred.push(predRow(w, ses.kind, sessQKm(ses), ses.paceSec));
    if(ses.type==='int') plan.qs['n'+w+'d'+dayObj.dow]=[ses.repM];
    else if(ses.type==='tempo') plan.qs['n'+w+'d'+dayObj.dow]=[Math.round(ses.qKm*1000)];
  }

  for(let w=1; w<=weeks; w++){
    const vdotW = a.vdot0 + (a.vdotGoal-a.vdot0)*Math.min(w,rampWeeks)/rampWeeks;
    const pI=Math.max(paceForZone(vdotW,'I'), racePace);
    const pT=paceForZone(vdotW,'T'), pE=paceForZone(vdotW,'E'), pLR=paceForZone(vdotW,'LR');
    const vol=vols[w-1];
    const isDeload = w%DELOAD_EVERY===0 && w<weeks-2;
    const isTaper1 = w===weeks-1, isRace = w===weeks;
    const days=[];

    if(isRace){
      /* trkačka nedelja pozicionirana po STVARNOM danu trke, ne fiksno četvrtak */
      const rp=racePace;
      const mk={
        [raceDow-3]: dw=>D(dw,'lako',3,`3 km shakeout (skroz lagano) + lagani core`),
        [raceDow-2]: dw=>D(dw,'int',3.7,`1.5 km WU + 6×200 m @ ${fmtP(Math.max(rp-4,pI-6))}/km (200 m hod) + 1 km CD (aktivacija)`),
        [raceDow-1]: dw=>D(dw,'lako',2,`2 km shakeout + lagana mobilnost`),
        [raceDow]:   dw=>D(dw,'trka',5,`🏁 TRKA 5 km — cilj ${fmtP(inp.goalSec||a.predictedSec)} / ritam ${fmtP(rp)}/km`)
      };
      for(let dw=1; dw<=raceDow; dw++){ days.push(mk[dw]? mk[dw](dw) : REST(dw)); }
      if(raceDow-2>=1){ plan.pred.push(predRow(w,'Intervali',1.2,Math.max(rp-4,pI-6))); plan.qs['n'+w+'d'+(raceDow-2)]=[200]; }
    } else {
      /* kvalitetne sesije po slotovima (deload: nema kvaliteta; N1: samo q1, kao uvodna) */
      const sessions={};
      for(let dow=1; dow<=7; dow++){
        const role=slots[dow];
        if(role!=='q1' && role!=='q2') continue;
        if(isDeload) continue;
        if(w===1 && role==='q2') continue;
        if(w===1 && role==='q1'){ /* uvodna: kontinuirani tempo umesto intervala */
          const qT=r1(Math.max(2, Math.min(vol*0.18, 5)));
          sessions[dow]=sessTempo(dow,2,qT,pT,2);
          continue;
        }
        sessions[dow]=buildQuality(w,weeks,role,effQ,vol,pI,pT,pE,isTaper1,dow,racePace);
      }
      const qKms=Object.values(sessions).map(d=>d.km||0);
      const easyDowsCount=[1,2,3,4,5,6,7].filter(d=>{
        const role=slots[d];
        return role==='easy' || ((role==='q1'||role==='q2') && !sessions[d]);
      }).length;
      const alloc=allocEasyLR(vol, qKms, easyDowsCount, runDays);
      let ei=0;
      for(let dow=1; dow<=7; dow++){
        const role=slots[dow];
        if(role==='rest'){
          if(dow===strengthDow) days.push(D(dow,'snaga',null,`Mobilnost + snaga po sopstvenom programu — opciono (bez trčanja)`));
          else days.push(REST(dow));
          continue;
        }
        if(role==='lr'){
          days.push(D(dow,'lr',alloc.lr,`${alloc.lr} km LR (Z2) @ ~${fmtP(pLR)}/km — najduže trčanje nedelje`));
          continue;
        }
        if(sessions[dow]){ days.push(sessions[dow]); pushPredQs(sessions[dow],w); continue; }
        const km=alloc.easies[ei]!=null?alloc.easies[ei]:4;
        const strides = (isDeload&&ei===0)?' + 6×15 s strides' : ((!isDeload && w%2===0 && ei===alloc.easies.length-1)?' + 4×20 s strides':'');
        days.push(D(dow,'lako',km,`${km} km lako (Z2) @ ~${fmtP(pE)}/km${strides}`));
        ei++;
      }
    }
    plan.weeks.push({ w, vol: r1(days.reduce((s,d)=>s+(d.km||0),0)), days, deload:isDeload });
  }
  return plan;
}

if(typeof module!=='undefined')module.exports={vdotFromRace,paceForZone,raceTimeForVdot,generatePlan,assess,fmtP,Z,RAMP,buildDaySlots,pickStrengthDay,dayPrefWarnings};

/* ============================================================
   ADAPTIVNO REKALIBRISANJE — v3.1
   Damping težine po tipu sesije: inženjerski izbor (NE izmerena
   konstanta), obrazloženje: intervalne sesije nose grešku od pauza
   (već utvrđeno kod Race Predictora — ZADNJA/NAJBRŽA prvenstveno
   iz kontinuiranih sesija). Manji korak za intervale, veći za
   tempo/ritam. Podložno promeni.
   ============================================================ */
const ALPHA = { int: 0.12, tempo: 0.28, rain_default: 0.15 };

/* Nova ocena VDOT-a iz JEDNE sesije, sa prigušenjem prema prethodnoj
   (zaglađenoj) vrednosti. sessionType: 'int' | 'tempo'. zone: 'I' | 'T'. */
function recalibrate(vdotSmoothed, sessionPaceSecKm, zone, sessionType){
  const vObs = vdotFromPace(sessionPaceSecKm, zone);
  const a = ALPHA[sessionType] || ALPHA.rain_default;
  return { vdotObs: r1(vObs), vdotNew: r1(vdotSmoothed + a*(vObs - vdotSmoothed)), alpha:a };
}

/* Ponovo generiše SAMO preostale nedelje (>=currentWeekIdx) sa ispravljenom
   putanjom, tako što izračuna "virtuelni PB" koji bi originalnom formulom,
   primenjenom od nedelje 1, dao tačno vdotNowSmoothed na trenutnoj nedelji.
   Odrađene nedelje (< currentWeekIdx) se ne diraju — istorija je nepromenljiva.
   oldWeeksForMerge (opciono): ako je prosleđeno, ručno zaključana polja
   (session.overrides) iz njih se prenose na sveže regenerisane nedelje —
   rekalibracija ne sme da pregazi korisnikovu ručnu izmenu tempa/dužine/
   pauze/broja ponavljanja. Bez ovog parametra, ponašanje je IDENTIČNO
   ranijoj verziji (ništa se ne menja za postojeće pozive/testove). */
function recalibratedPlan(originalInput, currentWeekIdx, vdotNowSmoothed, oldWeeksForMerge){
  const weeksTotal = Math.round((new Date(originalInput.raceDate) - new Date(nextMonday(originalInput.startDate))) / 604800000) + 1;
  const rampWeeks = weeksTotal - 2;
  const backdated = vdotNowSmoothed - RAMP[originalInput.intensity] * Math.min(currentWeekIdx-1, rampWeeks);
  const virtualPbSec = raceTimeForVdot(Math.max(backdated, 20), 5000);
  const replanned = generatePlan({ ...originalInput, pb:{ distM:5000, sec:virtualPbSec } });
  if(replanned.error) return replanned;
  const weeksSlice = replanned.weeks.slice(currentWeekIdx-1);
  if(oldWeeksForMerge){
    mergeOverrides(weeksSlice, oldWeeksForMerge);
    return {
      weeks: weeksSlice,
      pred: derivePred(weeksSlice),
      qs: deriveQS(weeksSlice),
      meta: { ...replanned.meta, vdotAtRecal: r1(vdotNowSmoothed), recalWeek: currentWeekIdx }
    };
  }
  return {
    weeks: weeksSlice,
    pred: replanned.pred.filter(p=>p.w>=currentWeekIdx),
    qs: Object.fromEntries(Object.entries(replanned.qs).filter(([k])=>+k.match(/\d+/)[0] >= currentWeekIdx)),
    meta: { ...replanned.meta, vdotAtRecal: r1(vdotNowSmoothed), recalWeek: currentWeekIdx }
  };
}

/* ============================================================
   POVREDA-SVESTAN RE-ENTRY — v3.1
   Bez izmišljene "X dana pauze = Y dana rampe" formule. Umesto toga:
   plan po povratku kreće od STVARNO poslednje ostvarene nedeljne
   zapremine (ne od originalno planirane za tu nedelju), a već
   testiran GROW_MAX (+8%/ned.) iz generatora vraća volumen na krivu.
   Tempo/VDOT se NE pogađa unapred — koriguje ga recalibrate() na
   osnovu prve stvarne sesije posle povratka.
   ============================================================ */
function reentryPlan(originalInput, resumeWeekIdx, lastRealizedVolKm, vdotAtPause){
  const weeksTotal = Math.round((new Date(originalInput.raceDate) - new Date(nextMonday(originalInput.startDate))) / 604800000) + 1;
  const weeksLeft = weeksTotal - resumeWeekIdx + 1;
  if(weeksLeft < 4) return { error:'Manje od 4 nedelje do trke posle pauze — pun re-entry nije moguć. Cilj treba ručno preispitati.' };
  const backdated = vdotAtPause - RAMP[originalInput.intensity] * Math.min(resumeWeekIdx-1, weeksTotal-2);
  const virtualPbSec = raceTimeForVdot(Math.max(backdated,20), 5000);
  const replanned = generatePlan({ ...originalInput, pb:{ distM:5000, sec:virtualPbSec } });
  if(replanned.error) return replanned;
  /* prva nedelja po povratku: cap na lastRealizedVolKm umesto plana; GROW_MAX dalje sam vraća krivu */
  const w0 = replanned.weeks[resumeWeekIdx-1];
  const scale = w0.vol>0 ? Math.min(lastRealizedVolKm*GROW_MAX, w0.vol)/w0.vol : 1;
  const first = { ...w0, vol:r1(w0.vol*scale), days:w0.days.map(d=>d.km!=null?{...d,km:r1(d.km*scale)}:d), reentry:true };
  return { weeks:[first, ...replanned.weeks.slice(resumeWeekIdx)], pred:replanned.pred.filter(p=>p.w>=resumeWeekIdx), meta:replanned.meta };
}

if(typeof module!=='undefined')module.exports=Object.assign(module.exports,{vdotFromPace,recalibrate,recalibratedPlan,reentryPlan,ALPHA,GROW_MAX});

/* ============================================================
   RACE PREDICTOR — OPSEG (nadogradnja POSTOJEĆEG Riegel mehanizma
   u v2 aplikaciji, riegel(tempoSec,q) — NE deo VDOT generatora.
   workLapsTempo ovde je VERNA KOPIJA funkcije već aktivne u v2
   index.html (Strava sync) — duplirana radi samostalne testabilnosti
   pre porta; logika mora ostati identična na oba mesta.
   ============================================================ */
function workLapsTempo(laps, specs, tol=0.12){
  const work=laps.filter(L=>specs.some(m=>Math.abs(L.distance-m)/m<=tol));
  if(!work.length)return null;
  const dist=work.reduce((s,L)=>s+L.distance,0), t=work.reduce((s,L)=>s+(L.moving_time||L.elapsed_time||0),0);
  if(!dist||!t)return null;
  return Math.round(t/(dist/1000));
}
/* Donja granica: prvi radni lap -> poslednji radni lap, UKLJUČUJUĆI sve između (oporavke).
   WU pre prvog i CD posle poslednjeg ostaju isključeni — isto ograničenje kao gornja granica. */
function blockTempo(laps, specs, tol=0.12){
  const idx = laps.map((L,i)=>({i,hit:specs.some(m=>Math.abs(L.distance-m)/m<=tol)})).filter(x=>x.hit).map(x=>x.i);
  if(!idx.length) return null;
  const block = laps.slice(idx[0], idx[idx.length-1]+1);
  const dist=block.reduce((s,L)=>s+L.distance,0), t=block.reduce((s,L)=>s+(L.moving_time||L.elapsed_time||0),0);
  if(!dist||!t) return null;
  return Math.round(t/(dist/1000));
}
const riegelV2 = (tempoSecPerKm,qKm) => tempoSecPerKm*qKm*Math.pow(5/qKm,1.06);
/* Vraća {hi,lo,hiPace,loPace} za intervalne sesije sa lap podacima, ili null
   (pozivalac tada koristi postojeći jedan-broj tok — kontinuirane sesije / ručni unos). */
function predictRange(laps, specs, qKm){
  if(!laps || !laps.length) return null;
  const hiPace=workLapsTempo(laps,specs), loPace=blockTempo(laps,specs);
  if(hiPace==null||loPace==null) return null;
  return { hi:Math.round(riegelV2(hiPace,qKm)), lo:Math.round(riegelV2(loPace,qKm)), hiPace, loPace };
}

if(typeof module!=='undefined')module.exports=Object.assign(module.exports,{sessInt,sessTempo,sessKm,sessDesc,applyEdit,deriveQS,derivePred,mergeOverrides,predRow,fmtRest});
if(typeof module!=='undefined')module.exports=Object.assign(module.exports,{workLapsTempo,blockTempo,predictRange,riegelV2});
