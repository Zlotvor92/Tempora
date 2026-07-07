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

const Z = { I: 1.00, T: 0.88, M: 0.80, E: 0.70, LR: 0.68, R: 1.05 };
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
const RAMP_CAP_WEEKS = 20;      /* inženjerski izbor (NE izmerena fiziološka granica): linearna
  ekstrapolacija forme preko ovog broja nedelja bi projektovala apsurdan skok (npr. +20 VDOT
  poena na 50 nedelja). Rast se ograničava na max 20 ned. neprekidnog linearnog napredovanja,
  dalje se forma DRŽI (plato) — ovo NE ograničava dužinu samog plana, samo trajanje "rampe". */

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
/* ============================================================
   PODRŽANE CILJNE DISTANCE. Ultra NIJE uključen — namerno.
   Daniels sam tretira ultra treninge kao posebno poglavlje,
   eksplicitno IZUZETO iz 150-min LR pravila ("unless preparing
   for ultraevents"). Matematički: pctVo2max(t) teži ka 80% kako
   t→∞ (asimptota u formuli) — za napore od 6-30+ sati to nije
   validirano niti verovatno tačno (realni održivi %VO2max pada
   mnogo niže zbog glikogena/termoregulacije/GI, što formula
   kalibrisana na rezultate do maratona ne modeluje).
   minWeeks je inženjerska bezbednosna granica (Daniels-ovi
   maratonski planovi u praksi traju 18+ nedelja), NE fiziološki
   zakon — plan ispod ovoga fizički radi, samo je rizičniji. */
const DIST_PROFILES = {
  5000:    { name:'5K',          minWeeks:6,  useM:false, qMix:'speed' },
  10000:   { name:'10K',         minWeeks:8,  useM:false, qMix:'speed' },
  21097.5: { name:'Polumaraton', minWeeks:10, useM:false, qMix:'threshold' },
  42195:   { name:'Maraton',     minWeeks:12, useM:true,  qMix:'marathon' }
};
function assess(pb, weeks, intensity, goalSec, raceDistM){
  raceDistM = raceDistM||5000;
  const vdot0 = vdotFromRace(pb.distM, pb.sec);
  const rampW = Math.min(Math.max(weeks-2, 1), RAMP_CAP_WEEKS);
  const vdotGoal = vdot0 + RAMP[intensity]*rampW;
  const predictedSec = raceTimeForVdot(vdotGoal, raceDistM);
  const out = { vdot0:r1(vdot0), vdotGoal:r1(vdotGoal), predictedSec, realno:null, goalVdot:null };
  if(goalSec){
    const gv = vdotFromRace(raceDistM, goalSec);
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
   od svih ostalih ograničenja; (2) gornja granica LR-a kombinuje DVA
   nezavisna Danielsova pravila, potvrđena pretragom pre implementacije:
     (a) broj-dana-strukturni cap (≥5 dana ≈32%, niže za manje dana —
         inženjerski, jer na 2-3 dana LR matematički MORA biti >50%)
     (b) Danielsov volumen-cap: <64 km/ned → 30% nedelje; ≥64 km/ned →
         min(25% nedelje, 150 minuta) — VAŽI ČAK I ZA MARATON, Daniels
         eksplicitno: "longest steady run... 150 minutes, even if
         preparing for a marathon" (izuzetak je SAMO ultra, van dometa).
   Konačan LR = najmanji od (a) i (b), ali nikad ispod invarijante.
   Izuzetak invarijante: SAMO trkačka nedelja (trka je najkraća sesija). */
function danielsLRCapKm(vol, pLRsecPerKm){
  if(vol<64) return vol*0.30;
  const pctCap = vol*0.25;
  const timeCapKm = pLRsecPerKm>0 ? (150*60)/pLRsecPerKm : Infinity;
  return Math.min(pctCap, timeCapKm);
}
function allocEasyLR(vol, qKms, easyCount, runDays, pLRsecPerKm){
  const qSum=qKms.reduce((a,b)=>a+b,0);
  const maxQ=qKms.length?Math.max(...qKms):0;
  let rem=Math.max(vol-qSum, 3);
  const danCap=danielsLRCapKm(vol, pLRsecPerKm||0);
  if(easyCount===0) return { lr:r1(Math.min(Math.max(rem, maxQ*1.1), Math.max(danCap,maxQ*1.05))), easies:[] };
  const capF = runDays>=5?0.32: runDays===4?0.36: runDays===3?0.50:0.68;
  const cap = Math.min(vol*capF, danCap);
  const floor = Math.max(maxQ*1.05, 4);           /* invarijanta: LR mora biti > najveće kvalitetne sesije */
  let lr = Math.max(rem*0.45, maxQ*1.12, (rem/(easyCount+1))*1.3);
  lr = Math.min(lr, cap, rem-3*easyCount);
  lr = Math.max(lr, Math.min(floor, rem-2.5*easyCount)); /* invarijanta > cap KADA je moguće, ali ne beskonačno */
  const wgt=[1.15,1,0.9,0.85,0.8,0.75].slice(0,easyCount);
  const wsum=wgt.reduce((a,b)=>a+b,0);
  let easies=wgt.map(x=>Math.max(3, r1((rem-lr)*x/wsum)));
  const mx=Math.max(...easies);
  if(mx>=lr){
    /* Bezbednosno pravilo "lak dan < LR" mora ostati strogo, ali margina od
       10% (0.9) je bila proizvoljno velika i nepotrebno je bacala kilometražu
       kad ima malo lakih dana (npr. 1 na runDays=4) — otkriveno testom pri
       uvođenju tešnjeg Daniels-capa za maraton, latentno i pre toga. Margina
       smanjena na 3% (0.97) — i dalje strogo ispod LR, samo manje rasipanja. */
    const sc=(lr*0.97)/mx;
    easies=easies.map(e=>Math.max(3,r1(e*sc)));
  }
  lr=r1(Math.max(lr, floor));
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
/* R (Repetition) — 105%+ VO2max, max 2 min/rep, odmor 1:2-1:3 po VREMENU
   rada, plafon min(8km, 5% nedelje) — sve citirano (Daniels). Uvodi se
   PRVO u ciklusu (Faza II "Early Quality"), fazi se izbacuje kad I postaje
   prioritet (Faza III — potvrđeno pretragom pre implementacije). */
function mkRepetition(dow,vol,pR){
  const total=Math.min(vol*0.05, 8);
  const repM=300; /* tipično 200-300m (izvori: "400m hard/jog", "200m ili 300m") */
  const reps=Math.max(4, Math.round(total*1000/repM));
  const restSec=Math.round((repM/1000)*pR*2.5); /* odmor ~1:2.5 po vremenu, sredina citiranog opsega 1:2-1:3 */
  return sessInt(dow,1.5,reps,repM,pR,restSec,1,'Repeticije');
}
function mkFartlek(dow,w,pI,pE){
  const n=Math.min(12, 8+Math.floor(w/4));
  return sessFartlek(dow,1.5,n,60,60,pI,1,pE);
}
function mkTempoCont(dow,vol,pT,fixKm){
  /* Daniels: kontinuiran tempo ograničen na ~20 min BEZ OBZIRA na volumen —
     to je i razlog zašto postoji odvojen "broken" tip (mkBroken) za veći
     ukupan obim na T tempu. Fiksni 6km plafon je UKLONJEN — 20-minutni
     vremenski plafon je jedini pravi limit i već je bio u formuli. */
  const qT=fixKm!=null?fixKm:r1(Math.max(3, Math.min(vol*0.10, (20*60)/pT)));
  return sessTempo(dow,2,qT,pT,2);
}
function mkBroken(dow,w,weeks,vol,pT){
  /* Daniels cruise-interval reps: 1,6-3,2 km (1-2 milje), rad:odmor ~5:1.
     Ukupan obim na T tempu: 12% nedelje (postojalo i pre). Fiksni 7km
     plafon je UKLONJEN — bio je niži od same 12% smernice već na 60+ km/ned
     nedeljama (maraton), praveći plafon jedinim ograničavajućim faktorom
     umesto volumena. Dužina repa raste sa fazom ciklusa (isto načelo kao
     kod čistih intervala): kraći rep rano (1,6km), duži kasnije (do 3,2km —
     Danielsova GORNJA granica za cruise intervale, ne izmišljen broj). */
  const total=Math.max(3.6, vol*0.12);
  const phase=w/weeks;
  /* mkBroken se poziva SAMO dok je phase<0.30-0.35 (v. buildQuality) — pragovi
     su zato preskalirani na taj STVARNO dostižan opseg, ne na ceo ciklus
     (raniji 0.3/0.6 prag bi ostavio gornje pragove kao mrtav kod). */
  const repKm = phase<0.15 ? 1.6 : phase<0.25 ? 2.0 : 2.4;
  const reps=Math.max(2, Math.round(total/repKm));
  const repM=Math.round(repKm*1000/100)*100;
  return sessInt(dow,2,reps,repM,pT,90,2,'Tempo (broken)');
}
function mkProg(dow,vol,pT,pE){
  const total=r1(Math.max(5, Math.min(vol*0.20, 10)));
  return sessProg(dow,total,pT,pE);
}
/* M (Marathon pace) — 75-84% VO2max (Z.M=0.80, sredina opsega), potvrđeno
   pretragom pre implementacije. Plafon: min(110 min, 29 km) po sesiji —
   računam ekvivalent u km preko pM (sec/km), ne fiksni broj. Koristi se
   SAMO za qMix='marathon' — za HM/10K/5K ova zona se ne koristi (HM tempo
   je praktično isti kao T, nema potrebe za posebnom zonom — Daniels). */
function mkMarathonPace(dow,vol,pM){
  const timeCapKm=(110*60)/pM;
  const q=r1(Math.max(5, Math.min(vol*0.22, timeCapKm, 29)));
  return sessTempo(dow,1.5,q,pM,1.5,'Maratonski tempo');
}
/* Race-pace sesija — tempo TAČNO na ciljnom tempu trke (racePace = Riegel/VDOT
   ishod, NE izmišljena %VO2max zona). Samo za 10K/HM: 5K već ima I≈race u
   završnici, maraton ima M-tempo koji JESTE race pace. Trajanje umereno jer je
   race pace zahtevan. "Practicing race pace" — svi izvori navode kao legitimno,
   i direktno pokriva Danielsov POZNATI nedostatak (nema 10K/HM-specific pace). */
function mkRacePace(dow,vol,racePace,label){
  const q=r1(Math.max(3, Math.min(vol*0.12, 8)));
  return sessTempo(dow,2,q,racePace,2,label);
}
function buildQuality(w,weeks,slotRole,effQ,vol,pI,pT,pE,isTaper1,dow,racePace,qMix,pM,pR,raceName){
  const phase=w/weeks;
  const fartlekEvery = qMix==='threshold' ? 4 : 3; /* HM: manje VO2max-varijeteta, više praga — Daniels: HM finalna faza = isključivo threshold */
  if(effQ===1){
    if(isTaper1) return sessInt(dow,1.5,5,400,Math.max(pI,racePace),90,1);
    if(phase<0.25) return mkRepetition(dow,vol,pR); /* Faza II "Early Quality" (potvrđeno pretragom) — R pre I/T */
    const mod=w%3;
    if(mod===0 && phase<0.72) return mkFartlek(dow,w,pI,pE);
    if(mod===2) return mkTempoCont(dow,vol,pT);
    return mkIntervals(dow,w,weeks,vol,pI);
  }
  if(slotRole==='q1'){
    if(isTaper1) return sessInt(dow,1.5,5,400,Math.max(pI,racePace),90,1);
    if(phase<0.25) return mkRepetition(dow,vol,pR); /* isto — već testirana rotacija netaknuta od phase>=0.25 */
    if(w%fartlekEvery===0 && phase<0.72) return mkFartlek(dow,w,pI,pE);
    return mkIntervals(dow,w,weeks,vol,pI);
  }
  /* q2 */
  if(qMix==='marathon'){
    if(isTaper1) return mkTempoCont(dow,vol,pT,3);
    if(phase<0.30) return mkBroken(dow,w,weeks,vol,pT);
    if(phase<0.55) return (w%2===1)? mkProg(dow,vol,pT,pE) : mkTempoCont(dow,vol,pT);
    return mkMarathonPace(dow,vol,pM); /* poslednja ~45% ciklusa: M-tempo dominira — Daniels "Final Quality" faza je maraton-specifična */
  }
  /* 10K/HM: race-pace sesija u završnoj fazi — pokriva Danielsov poznati
     nedostatak (nema 10K/HM-specific pace). 5K isključen (I≈race u završnici). */
  const wantsRacePace = (raceName==='10K' || raceName==='Polumaraton');
  if(isTaper1) return mkTempoCont(dow,vol,pT,3);
  if(phase<0.35) return mkBroken(dow,w,weeks,vol,pT);
  if(phase>=0.60 && wantsRacePace){
    const label = raceName==='10K' ? '10K tempo (ciljni ritam)' : 'HM tempo (ciljni ritam)';
    return (w%2===1)? mkRacePace(dow,vol,racePace,label) : mkTempoCont(dow,vol,pT);
  }
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
  return `${s.kind||'Tempo'} — ${s.wuKm} km WU + ${s.qKm} km @ ${fmtP(s.paceSec)}/km + ${s.cdKm} km CD`;
}
function sessInt(dow,wuKm,reps,repM,paceSec,restSec,cdKm,kind){
  const session={type:'int',kind:kind||'Intervali',wuKm,reps,repM,paceSec,restSec,cdKm,overrides:{}};
  return {dow,tag:kind==='Tempo (broken)'?'tempo':'int',km:sessKm(session),desc:sessDesc(session),session};
}
function sessTempo(dow,wuKm,qKm,paceSec,cdKm,kind){
  const session={type:'tempo',kind:kind||'Tempo',wuKm,qKm,paceSec,cdKm,overrides:{}};
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
function predRow(w,tip,q,pt,raceDistM){ raceDistM=raceDistM||5000; return { w, l:'N'+w+' · '+tip, q, pt, p5k: Math.round(riegel(pt*q, q*1000, raceDistM)) }; }
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
function derivePred(weeks,raceDistM){
  const pred=[];
  weeks.forEach(w=>w.days.forEach(d=>{
    if(!d.session) return;
    pred.push(predRow(w.w, d.session.kind, sessQKm(d.session), d.session.paceSec, raceDistM));
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
  /* KRITIČNO: mora biti dosledno UTC. new Date(ds+'T00:00:00') tumači se kao
     LOKALNO vreme, a new Date(ds) (bez vremena) kao UTC po ES spec-u — mešanje
     te dve konvencije je ranije davalo pogrešan datum (unazad 1 dan) u SVAKOJ
     vremenskoj zoni ispred UTC (Beograd, ceo istočni deo sveta), pošto browser
     radi u korisnikovoj lokalnoj zoni, ne u serverskom/test okruženju. */
  const d=new Date(ds);
  const wd=(d.getUTCDay()+6)%7;            /* 0=Pon */
  if(wd!==0)d.setUTCDate(d.getUTCDate()+(7-wd));
  return d.toISOString().slice(0,10);
}
function generatePlan(inp){
  const raceDistM = inp.raceDistM||5000;
  const prof = DIST_PROFILES[raceDistM];
  if(!prof) return { error: 'Nepodržana ciljna distanca. Podržano: 5K, 10K, polumaraton, maraton.' };
  const start = nextMonday(inp.startDate);
  const daysN = Math.round((new Date(inp.raceDate) - new Date(start)) / 86400000);
  const weeks = Math.floor(daysN/7) + 1;
  const maxWeeks = 104; /* bezbednosni plafon (2 god.) protiv degenerisanog unosa (npr. pogrešan datum), NE ograničenje planiranja — korisnik sme da se sprema koliko god unapred želi */
  if(weeks < prof.minWeeks) return { error: `Manje od ${prof.minWeeks} nedelja do trke (minimum za ${prof.name}) — puna periodizacija nije moguća.` };
  if(weeks > maxWeeks) return { error: `Više od ${maxWeeks} nedelja (2 godine) — proveri datum trke, verovatno je pogrešno unet.` };
  const runDays = Math.max(2, Math.min(7, Math.round(inp.runDays||4)));
  const qWant = Math.max(1, Math.min(2, Math.round(inp.quality||2)));
  const slots = buildDaySlots(runDays, qWant, { lrDow: inp.lrDow, qDows: inp.qDows });
  const dayWarnings = dayPrefWarnings(slots);
  const effQ = Object.values(slots).filter(r=>r==='q1'||r==='q2').length;
  const a = assess(inp.pb, weeks, inp.intensity, inp.goalSec||null, raceDistM);
  a.start = start;

  /* ============================================================
     FAZA 1 (bazna) — samo lako trčanje + strides, bez kvaliteta.
     Daniels: Faza I = aerobna baza, PRESKAČE se ako si trenirao
     redovno. Km SAM NE razlikuje početnika od treniranog trkača
     niskog obima (npr. 22 km/ned strukturirano = treniran). Zato
     dve informacije: nizak km I eksplicitna potvrda da NIJE trenirao
     redovno. <30 km je inženjerski prag (NE Danielsov broj); trajanje
     fiksno 4 nedelje. Aktivira se samo ako posle baze ostaje pun
     periodizovan ciklus (minWeeks). Default trainedRecently=true
     (stari pozivi bez ovog polja NE dobijaju bazu — non-breaking). */
  const BASE_THRESHOLD_KM = 30;   /* inženjerski prag, ne Danielsov podatak */
  const BASE_WEEKS = 4;
  const trainedRecently = inp.trainedRecently !== false; /* default true */
  const wantsBase = (inp.weeklyKm < BASE_THRESHOLD_KM) && !trainedRecently && (weeks >= prof.minWeeks + BASE_WEEKS);
  const baseWeeks = wantsBase ? BASE_WEEKS : 0;
  const qualWeeks = weeks - baseWeeks;  /* nedelje u kojima se odvija kvalitetni ciklus */

  /* volumen: start→vrhunac uz +8% cap, deload svake 4., taper 2 nedelje (NEPROMENJENO — kalibrisano na etalon, distancno-agnostičko po dizajnu) */
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

  const rampWeeks = Math.min(weeks-2, RAMP_CAP_WEEKS);
  const racePace = Math.round((inp.goalSec||a.predictedSec)/(raceDistM/1000));
  const raceDow = daysN - (weeks-1)*7 + 1; /* 1..7 unutar poslednje nedelje */
  const plan={ weeks:[], pred:[], qs:{}, meta:{...a, weeks, intensity:inp.intensity, racePace, runDays, quality:effQ, dayWarnings, raceDistM, raceName:prof.name, baseWeeks} };
  const strengthDow = (runDays<=5) ? pickStrengthDay(slots) : null;

  function D(dow,tag,km,desc){ return {dow,tag,km,desc}; }
  function REST(dow,desc){ return {dow,rest:true,desc:desc||null}; }
  function pushPredQs(dayObj,w){
    const ses=dayObj.session;
    plan.pred.push(predRow(w, ses.kind, sessQKm(ses), ses.paceSec, raceDistM));
    if(ses.type==='int') plan.qs['n'+w+'d'+dayObj.dow]=[ses.repM];
    else if(ses.type==='tempo') plan.qs['n'+w+'d'+dayObj.dow]=[Math.round(ses.qKm*1000)];
  }

  for(let w=1; w<=weeks; w++){
    const vdotW = a.vdot0 + (a.vdotGoal-a.vdot0)*Math.min(w,rampWeeks)/rampWeeks;
    /* Specifičnost tek u POSLEDNJIH 6 nedelja pred taper — APSOLUTAN broj,
       ne razlomak (w/weeks). Razlomak (weekPhase) se loše skalira na duge
       planove (maraton 40+ ned.): pošto VDOT plato nastupa na FIKSNIH 20
       nedelja (RAMP_CAP_WEEKS) bez obzira na dužinu plana, razlomak-prag bi
       na dugom planu presekao već ravan plato veštačkim usporavanjem na
       pola puta — dokazano testom (N25 3:28/km vs N45 4:04/km na istom
       platou, trebalo bi identično). Apsolutan broj (poslednjih 6 nedelja)
       ispravno prati "etalon N8-N13" nameru nezavisno od ukupne dužine. */
    const pI = (weeks - w)<=6 ? Math.max(paceForZone(vdotW,'I'), racePace) : paceForZone(vdotW,'I');
    const pT=paceForZone(vdotW,'T'), pE=paceForZone(vdotW,'E'), pLR=paceForZone(vdotW,'LR');
    const pM=paceForZone(vdotW,'M'); /* koristi se samo kad prof.useM (maraton) — bezopasno računati uvek */
    const pR=paceForZone(vdotW,'R'); /* koristi se samo u ranoj fazi (phase<0.25) — bezopasno računati uvek */
    const vol=vols[w-1];
    const isDeload = w%DELOAD_EVERY===0 && w<weeks-2;
    const isTaper1 = w===weeks-1, isRace = w===weeks;
    const days=[];

    if(isRace){
      /* trkačka nedelja pozicionirana po STVARNOM danu trke, ne fiksno četvrtak */
      const rp=racePace;
      const distKm=(raceDistM/1000).toFixed(1).replace(/\.0$/,'').replace('.',',');
      const mk={
        [raceDow-3]: dw=>D(dw,'lako',3,`3 km shakeout (skroz lagano) + lagani core`),
        [raceDow-2]: dw=>D(dw,'int',3.7,`1.5 km WU + 6×200 m @ ${fmtP(Math.max(rp-4,pI-6))}/km (200 m hod) + 1 km CD (aktivacija)`),
        [raceDow-1]: dw=>D(dw,'lako',2,`2 km shakeout + lagana mobilnost`),
        [raceDow]:   dw=>D(dw,'trka',raceDistM/1000,`🏁 TRKA ${distKm} km (${prof.name}) — cilj ${fmtP(inp.goalSec||a.predictedSec)} / ritam ${fmtP(rp)}/km`)
      };
      for(let dw=1; dw<=raceDow; dw++){ days.push(mk[dw]? mk[dw](dw) : REST(dw)); }
      if(raceDow-2>=1){ plan.pred.push(predRow(w,'Intervali',1.2,Math.max(rp-4,pI-6),raceDistM)); plan.qs['n'+w+'d'+(raceDow-2)]=[200]; }
    } else if(w <= baseWeeks){
      /* FAZA 1 (bazna) — samo lako trčanje + obavezne strides, bez kvaliteta.
         Gradi aerobnu bazu i obim pre nego što kvalitetni ciklus počne. */
      const alloc=allocEasyLR(vol, [], runDays-1, runDays, pLR);
      let ei=0;
      for(let dow=1; dow<=7; dow++){
        const role=slots[dow];
        if(role==='rest'){
          if(dow===strengthDow) days.push(D(dow,'snaga',null,`Mobilnost + snaga po sopstvenom programu — opciono (bez trčanja)`));
          else days.push(REST(dow));
          continue;
        }
        if(role==='lr'){
          days.push(D(dow,'lr',alloc.lr,`${alloc.lr} km lako-dugo (Z2) @ ~${fmtP(pLR)}/km — bazna faza, bez kvaliteta`));
          continue;
        }
        /* strides na svakom drugom lakom danu tokom baze (Daniels: strides kroz sve faze) */
        const km=alloc.easies[ei]!=null?alloc.easies[ei]:4;
        const strides = (ei%2===0) ? ' + 6×20 s strides (lagani ubrzani koraci, pun oporavak)' : '';
        days.push(D(dow,'lako',km,`${km} km lako (Z2) @ ~${fmtP(pE)}/km${strides}`));
        ei++;
      }
    } else {
      /* kvalitetne sesije po slotovima (deload: nema kvaliteta; prva kval. nedelja: samo q1, kao uvodna) */
      const qualW = w - baseWeeks;         /* redni broj unutar kvalitetnog ciklusa (1-indeksiran) */
      const isFirstQualWeek = qualW===1;
      const sessions={};
      for(let dow=1; dow<=7; dow++){
        const role=slots[dow];
        if(role!=='q1' && role!=='q2') continue;
        if(isDeload) continue;
        if(isFirstQualWeek && role==='q2') continue;
        if(isFirstQualWeek && role==='q1'){ /* uvodna: kontinuirani tempo umesto intervala */
          const qT=r1(Math.max(2, Math.min(vol*0.18, (20*60)/pT, 5)));
          sessions[dow]=sessTempo(dow,2,qT,pT,2);
          continue;
        }
        sessions[dow]=buildQuality(qualW,qualWeeks,role,effQ,vol,pI,pT,pE,isTaper1,dow,racePace,prof.qMix,pM,pR,prof.name);
      }
      const qKms=Object.values(sessions).map(d=>d.km||0);
      const easyDowsCount=[1,2,3,4,5,6,7].filter(d=>{
        const role=slots[d];
        return role==='easy' || ((role==='q1'||role==='q2') && !sessions[d]);
      }).length;
      const alloc=allocEasyLR(vol, qKms, easyDowsCount, runDays, pLR);
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
        /* Strides na prvom lakom danu SVAKE kval. nedelje (Daniels: kroz sve faze,
           redovno — ne povremeno). Izostaju samo u taper1 (izbeći dodatni neuro-
           stres neposredno pred trku). Deload: kraći set. */
        const strides = isTaper1 ? ''
          : (ei===0 ? (isDeload ? ' + 4×15 s strides (lagani ubrzani koraci)' : ' + 6×20 s strides (lagani ubrzani koraci, pun oporavak)') : '');
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
  const rampWeeks = Math.min(weeksTotal - 2, RAMP_CAP_WEEKS);
  const backdated = vdotNowSmoothed - RAMP[originalInput.intensity] * Math.min(currentWeekIdx-1, rampWeeks);
  const virtualPbSec = raceTimeForVdot(Math.max(backdated, 20), 5000);
  /* KRITIČNO: racePace mora ostati stabilan. Ako korisnik NIJE zadao goalSec,
     bez ove linije bi generatePlan iznutra računao FRESH predictedSec iz
     VEŠTAČKE (backdated) putanje — koja može ispasti sporija od stvarne
     trenutne forme (vdotNowSmoothed), jer predstavlja projekciju do KRAJA
     plana, ne trenutno stanje. Taj (pogrešno spor) racePace onda kroz
     Math.max(paceForZone(vdotW,'I'), racePace) veštački uspori intervale —
     korisnik uneseta TAČNO taj (već usporen) tempo i VDOT mu ispravno
     "opadne" na taj usporen broj, iako je trening odradio bez odstupanja.
     Rešenje: ako nema eksplicitnog cilja, koristi predikciju iz STVARNE
     trenutne forme kao stabilan oslonac, ne iz veštačke putanje. */
  const raceDistM = originalInput.raceDistM||5000;
  const stableGoalSec = originalInput.goalSec || raceTimeForVdot(vdotNowSmoothed, raceDistM);
  const replanned = generatePlan({ ...originalInput, pb:{ distM:5000, sec:virtualPbSec }, goalSec: stableGoalSec });
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
  const backdated = vdotAtPause - RAMP[originalInput.intensity] * Math.min(resumeWeekIdx-1, Math.min(weeksTotal-2, RAMP_CAP_WEEKS));
  const virtualPbSec = raceTimeForVdot(Math.max(backdated,20), 5000);
  const raceDistM = originalInput.raceDistM||5000; /* ista ispravka kao recalibratedPlan — stabilan racePace, ne iz veštačke putanje */
  const stableGoalSec = originalInput.goalSec || raceTimeForVdot(vdotAtPause, raceDistM);
  const replanned = generatePlan({ ...originalInput, pb:{ distM:5000, sec:virtualPbSec }, goalSec: stableGoalSec });
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
if(typeof module!=='undefined')module.exports=Object.assign(module.exports,{workLapsTempo,blockTempo,predictRange,riegelV2,danielsLRCapKm,DIST_PROFILES});
