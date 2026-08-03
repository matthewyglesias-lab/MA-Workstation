/* Legacy runtime block 1: <script> */
const $=id=>document.getElementById(id);

/* ============================================================
   DRUG REFERENCE — single source of truth. Edit freely.
   Add ndc:"..." to a drug to auto-fill the NDC field.
   winB / winA = scheduling window (days before / after target).
   ============================================================ */
const FLAG = {
  opioidFree:{t:"Current opioid-risk / provider plan verified", s:"Current opioid-risk screen and provider plan verified, including recent opioid, buprenorphine, methadone, or tramadol exposure and current product-label contraindications."},
  naltrexHS:{t:"Naltrexone/hepatic review verified", s:"Naltrexone/excipient hypersensitivity and hepatic-risk review verified against the active order and current product information."},
  suppliedNeedle:{t:"Supplied needle / body-habitus check", s:"Kit-supplied needle and body-habitus selection verified; deep gluteal IM route/site documented as ordered.", plan:true},
  resuspend:{t:"Suspension inspected & mixed", s:"Medication inspected and mixed/resuspended per label; no particulates or discoloration noted."},
  invegaInit:{t:"Initiation / re-initiation plan verified", s:"Active order and current product-specific PI/provider initiation or re-initiation plan verified before administration."},
  oralOverlap:{t:"Ordered oral initiation plan documented", s:"Ordered oral aripiprazole initiation or overlap plan verified against the active order."},
  stabilized:{t:"Stabilized on prerequisite LAI", s:"Pt adequately stabilized on the prerequisite formulation prior to transition to this interval."},
  paliperidoneTolerability:{t:"Paliperidone/risperidone tolerability reviewed", s:"Paliperidone or risperidone tolerability reviewed when applicable prior to administration."},
  aripiprazoleTolerability:{t:"Aripiprazole tolerability / transition reviewed", s:"Aripiprazole tolerability and initiation or transition plan reviewed when applicable prior to administration."},
  glutealOnly:{t:"Gluteal-only administration", s:"Medication is gluteal-only; administration site confirmed before injection.", plan:true},
  noMassage:{t:"No massage after injection", s:"Injection site was not massaged after administration per product instructions.", plan:true},
  deepZtrack:{t:"Ordered route / technique verified", s:"Ordered route, site, and current product-specific technique verified; document the actual route and site used.", plan:true}
};

const MEDS = [
  {key:"aristada", label:"Aristada", name:"Aristada", gen:"aripiprazole lauroxil", cls:"Atypical antipsychotic LAI", route:"IM", site:"R ventrogluteal", intervalKey:"q4wk", winB:7, winA:7, timingMode:"orderVerify",
    winByInterval:{q4wk:{winB:7,winA:7}, q6wk:{winB:14,winA:14}, q8wk:{winB:14,winA:14}},
    tech:"Use the kit/PI dose- and site-specific needle; tap, shake \u226530 seconds, and re-shake if delayed before injection.",
    doses:["441 mg","662 mg","882 mg","1064 mg"],
    dosesByInterval:{q4wk:["441 mg","662 mg","882 mg"], q6wk:["882 mg"], q8wk:["1064 mg"]},
    storage:"Room temp; protect from light.",
    recon:"Prefilled syringe \u2014 tap and shake vigorously \u2265 30 s.",
    missed:"Late dose: use the PI re-initiation table \u2014 may need Aristada Initio 675 mg + a single 30 mg oral aripiprazole depending on the prior dose and length of gap.",
    caution:"Establish tolerability with oral aripiprazole first. 441 mg deltoid or gluteal; higher doses gluteal. Confirm the interval selected matches the ordered dose \u2014 882 mg is the only strength valid on both the q4wk and q6wk schedules; 1064 mg is q8wk (every 2 months) only.",
    tip:"441 mg may be deltoid or gluteal; higher doses gluteal. 882 mg may be dosed q4wk or q6wk; 1064 mg is dosed q8wk (every 2 months) only. Initiate with Aristada Initio 675 mg + single 30 mg oral aripiprazole, or 21-day oral overlap.",
    flags:["resuspend","oralOverlap"]},
  {key:"initio", label:"Aristada Initio", name:"Aristada Initio", gen:"aripiprazole lauroxil", cls:"LAI initiation kit", route:"IM", site:"R deltoid", intervalKey:"once", winB:0, winA:0,
    tech:"shake vigorously 30s",
    doses:["675 mg"],
    storage:"Room temp; protect from light.",
    recon:"Prefilled syringe \u2014 shake vigorously 30 s.",
    missed:"One-time initiation; not repeated. Follow with Aristada maintenance per schedule.",
    caution:"Give with a single 30 mg oral aripiprazole. Not a maintenance dose.",
    tip:"One-time initiation dose. Give with a single 30 mg oral aripiprazole and the first Aristada maintenance dose (may be same day). Deltoid or gluteal.",
    flags:["resuspend"]},
  {key:"sustenna", label:"Invega Sustenna", name:"Invega Sustenna", gen:"paliperidone palmitate", cls:"Atypical antipsychotic LAI (monthly)", route:"IM", site:"R deltoid", intervalKey:"q4wk", winB:7, winA:7,
    tech:"23G 1\" (deltoid) / 22G 1.5\" (gluteal), shake \u226515s",
    doses:["39 mg","78 mg","117 mg","156 mg","234 mg"],
    storage:"Room temp \u226430\u00b0C.",
    recon:"Prefilled syringe \u2014 shake vigorously \u2265 15 s within 5 min of injecting.",
    missed:"Use the current product-specific missed-dose table and the active provider/pharmacist re-initiation plan. Renal status and a prior 234 mg regimen require distinct label-directed dosing; do not reconstruct a regimen from this helper.",
    caution:"Verify the active initiation, maintenance, or re-initiation plan against the current PI and renal-status guidance before administration.",
    tip:"Monthly paliperidone helper. Verify the active order, current PI, renal-status guidance, dose, site, and re-initiation plan before administration.",
    flags:["resuspend","invegaInit"]},
  {key:"erzofri", label:"Erzofri", name:"Erzofri", gen:"paliperidone palmitate", cls:"Atypical antipsychotic LAI (monthly)", route:"IM", site:"R deltoid", intervalKey:"q4wk", winB:7, winA:7,
    tech:"Deltoid: 23G 1\" if <90 kg or 22G 1.5\" if \u226590 kg; gluteal: 22G 1.5\". Shake vigorously \u226510 sec.",
    doses:["39 mg","78 mg","117 mg","156 mg","234 mg","351 mg"],
    allowedSites:["R deltoid","L deltoid","R ventrogluteal","L ventrogluteal","R dorsogluteal","L dorsogluteal"],
    allowedRoutes:["IM"],
    storage:"Room temp; protect from light. Do not freeze.",
    recon:"Prefilled syringe — shake vigorously for at least 10 seconds until homogeneous; visually inspect before use.",
    missed:"Use the current ERZOFRI missed-dose table and the active provider/pharmacist re-initiation plan. The prior 234 mg regimen and renal status require distinct label-directed dosing; do not reconstruct a regimen from this helper.",
    caution:"Verify active initiation, maintenance, or re-initiation plan against the current PI and renal-status guidance before administration.",
    tip:"Once-monthly paliperidone helper. Verify the active order, current PI, renal-status guidance, dose, site, and re-initiation plan before administration.",
    flags:["resuspend","paliperidoneTolerability"]},
  {key:"trinza", label:"Invega Trinza", name:"Invega Trinza", gen:"paliperidone palmitate", cls:"Atypical antipsychotic LAI (q3 mo)", route:"IM", site:"R ventrogluteal", intervalKey:"q12wk", winB:14, winA:14,
    tech:"22G 1.5\" gluteal / 22G 1\" deltoid, shake 15s",
    doses:["273 mg","410 mg","546 mg","819 mg"],
    storage:"Room temp \u226430\u00b0C.",
    recon:"Prefilled syringe \u2014 shake vigorously \u2265 15 s.",
    missed:"Use the current dose-specific INVEGA TRINZA missed-dose table and the active provider/pharmacist re-initiation plan. Do not use a generic PP1M re-loading regimen from this helper.",
    caution:"Only after \u22654 months on Sustenna; dose = 3.5\u00d7 the prior monthly Sustenna dose. Conversion from the 39 mg Sustenna dose was not studied.",
    tip:"Use only after \u22654 months on Invega Sustenna. Dose = 3.5\u00d7 the prior monthly Sustenna dose. q3 months, \u00b12wk.",
    flags:["resuspend","stabilized"]},
  {key:"hafyera", label:"Invega Hafyera", name:"Invega Hafyera", gen:"paliperidone palmitate", cls:"Atypical antipsychotic LAI (q6 mo)", route:"IM", site:"R ventrogluteal", intervalKey:"q26wk", winB:14, winA:21,
    tech:"20G 1.5\" gluteal, shake vigorously",
    doses:["1092 mg","1560 mg"],
    storage:"Room temp \u226430\u00b0C.",
    recon:"Prefilled syringe \u2014 shake vigorously ~15 s.",
    missed:"Use the current dose-specific INVEGA HAFYERA missed-dose table and the active provider/pharmacist re-initiation plan. Do not use a generic PP1M re-loading regimen from this helper.",
    caution:"Only after \u22654 months on Sustenna (last 2 cycles same strength) or \u22651 cycle of Trinza. Gluteal only.",
    tip:"q6 months \u2014 up to 2wk early or 3wk late. Use after \u22654 months on Sustenna (last 2 cycles same strength) or \u22651 cycle of Trinza. Gluteal only.",
    flags:["resuspend","stabilized"]},
  {key:"uzedy", label:"Uzedy", name:"Uzedy", gen:"risperidone ER", cls:"Atypical antipsychotic LAI (SubQ)", route:"SubQ", site:"Abdomen (SubQ)", intervalKey:"q4wk", winB:7, winA:7, timingMode:"orderVerify",
    winByInterval:{q4wk:{winB:7,winA:7}, q8wk:{winB:14,winA:14}},
    tech:"supplied syringe, SubQ abdomen or upper arm",
    doses:["50 mg","75 mg","100 mg","125 mg","150 mg","200 mg","250 mg"],
    dosesByInterval:{q4wk:["50 mg","75 mg","100 mg","125 mg"], q8wk:["100 mg","150 mg","200 mg","250 mg"]},
    storage:"Refrigerate 2\u20138\u00b0C; may be kept at room temp limited time \u2014 check label.",
    recon:"Prefilled syringe \u2014 no reconstitution; mix per label.",
    missed:"PI defines no fixed early/late cutoff for Uzedy \u2014 if a dose is missed, give the next injection as soon as possible and do not dose more often than the selected interval. No loading dose or oral overlap needed at initiation or when switching between the once-monthly and once-every-2-months regimens.",
    caution:"SubQ only \u2014 abdomen or upper arm. Once-monthly (50/75/100/125 mg) and once-every-2-months (100/150/200/250 mg) are distinct regimens \u2014 confirm the interval selected matches the ordered dose; 100 mg is the only strength valid on either schedule.",
    tip:"SubQ \u2014 abdomen or upper arm, rotate sites. To switch regimens, give the first dose of the new schedule on the date the original schedule's next dose would have been due, then revise the return-visit interval \u2014 no loading dose or extra oral overlap needed. Picking a monthly-only or q2-month-only dose auto-sets the matching interval below.",
    flags:["resuspend"]},
  {key:"maintena", label:"Abilify Maintena", name:"Abilify Maintena", gen:"aripiprazole", cls:"Atypical antipsychotic LAI (monthly)", route:"IM", site:"R ventrogluteal", intervalKey:"q4wk", winB:2, winA:7, timingMode:"orderVerify",
    tech:"23G 1\" deltoid / 22G 1.5\" gluteal",
    doses:["300 mg","400 mg"],
    storage:"Room temp; protect from light.",
    recon:"Reconstitute lyophilized vial with SWFI per kit (or use prefilled dual-chamber syringe).",
    missed:"PI: not sooner than 26 days after the previous injection (no stated early-dose tolerance). Missed dose #2\u20133: >4\u2013<5wk since last injection \u2014 give as soon as possible; \u22655wk \u2014 restart initiation. Missed dose #4+: >4\u2013<6wk \u2014 give as soon as possible; \u22656wk \u2014 restart initiation.",
    caution:"Verify the prescribed initiation or re-initiation plan against the current PI; label-supported one-day and 14-day initiation pathways differ. Do not give sooner than 26 days after the previous injection.",
    tip:"Monthly \u2014 no sooner than 26 days after the previous injection. Verify the active initiation/restart plan, dose, route, and site against the current PI.",
    flags:["resuspend","oralOverlap"]},
  {key:"asimtufii", label:"Abilify Asimtufii", name:"Abilify Asimtufii", gen:"aripiprazole", cls:"Atypical antipsychotic LAI (q2 mo)", route:"IM", site:"R ventrogluteal", intervalKey:"q8wk", winB:14, winA:14,
    tech:"Gluteal IM only. Non-obese: 22G 1.5\"; obese: 21G 2\". Tap syringe 10x and shake \u226510 sec; do not massage site.",
    doses:["720 mg","960 mg"],
    allowedSites:["R ventrogluteal","L ventrogluteal","R dorsogluteal","L dorsogluteal"],
    allowedRoutes:["IM"],
    storage:"Room temp; store in original package. Do not freeze.",
    recon:"Prefilled syringe — tap at least 10 times and shake vigorously at least 10 seconds until uniform; visually inspect before use.",
    missed:"q2 months (56 days). May be given up to 2 weeks before/after scheduled timepoint. >8 to <14 weeks since last dose: give as soon as possible and resume q2-month schedule. >14 weeks: restart initiation per PI.",
    caution:"Gluteal IM only. Establish oral aripiprazole tolerability when applicable; verify the exact initiation, transition, or re-initiation plan against the active provider order and current PI.",
    tip:"Every 2 months. Gluteal IM only; do not massage injection site. Usual dose 960 mg unless prescriber orders 720 mg for tolerability/CYP considerations.",
    flags:["resuspend","aripiprazoleTolerability","glutealOnly","noMassage"]},
  {key:"vivitrol", label:"Vivitrol", name:"Vivitrol", gen:"naltrexone ER", cls:"Opioid antagonist LAI (monthly)", route:"IM", site:"R ventrogluteal", intervalKey:"q4wk", winB:3, winA:7, timingMode:"orderVerify",
    tech:"Use kit-supplied customized needle selected by body habitus; deep gluteal IM only, alternate sides.",
    doses:["380 mg"],
    storage:"Refrigerate 2\u20138\u00b0C; may be at room temp \u22647 days before use. Do not freeze.",
    recon:"Reconstitute powder with supplied diluent; suspend fully; administer immediately.",
    missed:"For a missed dose, use the active provider order and current PI; assess current opioid-risk status before administration. Patients transitioning from buprenorphine or methadone may remain vulnerable to precipitated withdrawal for as long as 2 weeks.",
    caution:"Deep gluteal IM only with kit-supplied needle/body-habitus selection. Verify current opioid-risk and contraindication review per provider plan; do not use a generic timing window as clearance.",
    tip:"Reconstitute with supplied diluent and administer immediately. Deep gluteal IM only; alternate sides. Verify current opioid-risk/provider plan and emergency overdose-reversal counseling per current PI.",
    flags:["opioidFree","naltrexHS","suppliedNeedle"]},
  {key:"haldol", label:"Haldol Dec.", name:"Haldol Decanoate", gen:"haloperidol decanoate", cls:"Typical antipsychotic LAI", route:"IM", site:"", intervalKey:"q4wk", winB:7, winA:7,
    tech:"Document the actual ordered route, site, and technique.",
    doses:["50 mg","100 mg","150 mg","200 mg","300 mg"],
    storage:"Room temp; protect from light. Oil-based.",
    recon:"Oil solution \u2014 ready to use; allow to reach room temp.",
    missed:"Interval individualized (commonly q4 wk). Late-dose handling per prescriber.",
    caution:"Verify the current product information and active order. This local helper does not impose a generic anatomical site or Z-track technique.",
    tip:"Use the active order and current product information for route, site, dose, initiation, and timing decisions.",
    flags:[]},
  {key:"prolixin", label:"Prolixin Dec.", name:"Prolixin Decanoate", gen:"fluphenazine decanoate", cls:"Typical antipsychotic LAI", route:"IM or SubQ", site:"", intervalKey:"q3wk", winB:7, winA:7,
    tech:"Document the actual ordered IM or subcutaneous route, site, and technique.",
    doses:["12.5 mg","25 mg","37.5 mg","50 mg"],
    storage:"Room temp; protect from light. Oil-based.",
    recon:"Oil solution \u2014 ready to use.",
    missed:"Interval individualized, commonly q2\u20134 wk. Late-dose handling per prescriber.",
    caution:"The label permits IM or subcutaneous administration. Follow the active order and document the actual route/site; this helper does not invent an anatomical default.",
    tip:"Use the active order and current product information for route, site, dose, and timing decisions.",
    flags:[]},
  {key:"other", label:"Other", name:"", gen:"", cls:"", route:"IM", site:"", intervalKey:"q4wk", winB:7, winA:7,
    tech:"", doses:[], storage:"", recon:"", missed:"", caution:"", tip:"Enter all fields manually for drugs not listed.", flags:[]}
];

const INTERVALS=[
  {k:"q1wk",l:"q1 wk",d:7},{k:"q2wk",l:"q2 wk",d:14},{k:"q3wk",l:"q3 wk",d:21},
  {k:"q4wk",l:"q4 wk",d:28},{k:"q6wk",l:"q6 wk",d:42},{k:"q8wk",l:"q8 wk",d:56},
  {k:"q12wk",l:"q3 mo",d:84},{k:"q26wk",l:"q6 mo",d:182},{k:"once",l:"one-time",d:0}
];
const intDays = k => (INTERVALS.find(i=>i.k===k)||{}).d;

/* ---------- scheduling-window + regimen helpers ----------
   A drug's window/dose options can depend on which interval is active
   (e.g. Uzedy is labeled once-monthly AND once-every-2-months on the same
   product, chosen with the interval chips). winByInterval / dosesByInterval
   on a MEDS entry override the drug's static defaults whenever the selected
   interval differs from med.intervalKey; every call site must read the
   window through effectiveWindow() rather than med.winB/med.winA directly,
   or it will silently keep using the drug's default-interval window even
   after the clinician switches to a different labeled interval. */
function windowForInterval(intervalKey){
  const d=intDays(intervalKey);
  if(!(d>0))return {winB:0,winA:0};
  return d>28 ? {winB:14,winA:14} : {winB:7,winA:7};
}
function effectiveWindow(med, intervalKey){
  const ik=intervalKey||(med&&med.intervalKey)||'';
  if(med&&med.winByInterval&&med.winByInterval[ik])return med.winByInterval[ik];
  if(med&&ik===med.intervalKey)return {winB:med.winB||0,winA:med.winA||0};
  const d=intDays(ik);
  if(d>0)return windowForInterval(ik);
  return {winB:(med&&med.winB)||7,winA:(med&&med.winA)||7};
}
function windowSummary(med){
  if(!med)return "verify schedule";
  if(med.timingMode==="orderVerify")return "verify active order / current PI";
  if(med.winByInterval){
    return Object.keys(med.winByInterval).map(k=>{
      const lbl=(INTERVALS.find(i=>i.k===k)||{}).l||k, w=med.winByInterval[k];
      return `${lbl} ±${w.winB===w.winA?w.winB:(w.winB+"/"+w.winA)}d`;
    }).join(" · ");
  }
  const w=effectiveWindow(med,med.intervalKey);
  return w.winB===w.winA?`±${w.winB} days`:`${w.winB}/${w.winA} days`;
}
function medDosesForInterval(med, intervalKey){
  if(med&&med.dosesByInterval&&med.dosesByInterval[intervalKey])return med.dosesByInterval[intervalKey];
  return (med&&med.doses)||[];
}
function medDoseSummary(med){
  if(med.dosesByInterval){
    return Object.keys(med.dosesByInterval).map(k=>{
      const lbl=(INTERVALS.find(i=>i.k===k)||{}).l||k;
      return `${lbl}: ${med.dosesByInterval[k].join("/")}`;
    }).join(" · ");
  }
  return med.doses.join(", ")||"—";
}
function medIntervalSummary(med){
  if(med.winByInterval){
    return Object.keys(med.winByInterval).map(k=>(INTERVALS.find(i=>i.k===k)||{}).l||k).join(" or ")+" (set per order)";
  }
  return (INTERVALS.find(i=>i.k===med.intervalKey)||{}).l||"—";
}

const REASONS=[
  {k:"scheduled",l:"Scheduled",cc:"scheduled LAI administration"},
  {k:"initiation",l:"Initiation",cc:"LAI initiation"},
  {k:"reinit",l:"Re-initiation",cc:"LAI re-initiation"},
  {k:"loading",l:"Loading dose",cc:"loading dose"},
  {k:"prn",l:"PRN / ordered",cc:"clinician-ordered injection"}
];

const ATTEST=[
  {id:"id2", t:"Two-identifier ID", s:"Pt identity verified using two identifiers (full name & DOB)."},
  {id:"rights", t:"Medication \u2018rights\u2019", s:"Med verified against active order \u2014 right pt, right drug, right dose, right route, right time, right documentation."},
  {id:"allergy", t:"Allergies reviewed", s:"ALLERGY"},
  {id:"consent", t:"Consent reaffirmed", s:"Consent for injection obtained and reaffirmed prior to administration."},
  {id:"prior", t:"Prior dose tolerated", s:"Prior dose tolerated well per pt report; no new or unresolved s/e."},
  {id:"screen", t:"No contraindications", s:"No acute s/e or contraindications to administration noted on pre-injection screening."},
  {id:"twoperson", t:"Two-clinician check", s:"Independent two-clinician verification of drug, dose & pt completed.", off:true},
  {id:"hygiene", t:"Aseptic technique", s:"Hand hygiene performed and gloves donned; injection site cleansed w/ alcohol and allowed to dry.", plan:true},
  {id:"observe", t:"Post-inj observation", s:"Pt observed post-injection w/o adverse reaction.", plan:true},
  {id:"education", t:"Education provided", s:"Post-injection education provided re: expected effects, s/e to report, and adherence to next dose.", plan:true}
];

const RESP=[
  {k:"well", l:"Tolerated well", s:"no immediate complication, no bleeding or swelling at site"},
  {k:"bleed", l:"Minor bleeding, controlled", s:"minor bleeding controlled with pressure, no swelling"},
  {k:"disc", l:"Mild site discomfort", s:"mild transient site discomfort, no acute reaction"},
  {k:"custom", l:"Custom\u2026", s:""}
];

const INJ_SAFETY=[
  {id:"dizzy", t:"Dizzy / faint / fall concern", level:"warn", s:"Patient reports dizziness, lightheadedness, syncope, or acute fall-risk concern; provider review requested before administration."},
  {id:"cardiac", t:"Chest pain / SOB / palpitations", level:"danger", s:"Patient reports chest pain, shortness of breath, palpitations, or acute cardiac symptoms; provider review requested before administration."},
  {id:"nms", t:"Fever + rigidity/confusion", level:"danger", s:"Patient reports fever with muscle rigidity, confusion, diaphoresis, or autonomic instability; provider review requested for possible serious antipsychotic reaction."},
  {id:"eps", t:"Severe EPS / akathisia", level:"warn", s:"Patient reports severe restlessness, stiffness, abnormal movements, tremor, or extrapyramidal symptoms; provider review requested."},
  {id:"site", t:"Severe injection-site reaction", level:"warn", s:"Patient reports severe or worsening injection-site pain, swelling, warmth, drainage, skin changes, or a rapidly enlarging lump; provider review requested."},
  {id:"opioid", t:"Recent opioid / withdrawal concern", level:"danger", med:["vivitrol"], s:"Recent opioid use, possible opioid exposure, or withdrawal symptoms reported; provider review requested before Vivitrol administration."},
  {id:"liver", t:"Possible liver symptoms", level:"warn", med:["vivitrol"], s:"Patient reports possible liver-related symptoms such as right upper-quadrant pain, dark urine, jaundice, or unusual fatigue; provider review requested before Vivitrol administration."}
];

const UDS_REASONS=[
  {k:"routine",l:"Routine monitoring",cc:"routine medication monitoring"},
  {k:"medmgmt",l:"Medication management",cc:"medication management"},
  {k:"preinj",l:"Pre-injection",cc:"pre-injection screening"},
  {k:"ordered",l:"Provider ordered",cc:"provider-ordered urine drug screen"},
  {k:"other",l:"Other",cc:"point-of-care urine drug screen"}
];
const UDS_TEMP=[
  {k:"acceptable",l:"Acceptable",s:"Specimen temperature acceptable at time of collection."},
  {k:"not documented",l:"Not documented",s:"Specimen temperature not documented."},
  {k:"not acceptable",l:"Not acceptable",s:"Specimen temperature not acceptable; provider review recommended."}
];
const UDS_CONTROL=[
  {k:"not documented",l:"Not documented",s:"Device control line not documented; do not interpret results until it is verified."},
  {k:"valid",l:"Valid control line",s:"Device control line present; test interpreted per cup instructions."},
  {k:"invalid",l:"Invalid / missing control",s:"Control line absent or unreadable; result should not be interpreted."}
];
const UDS_GROUPS=[
  {k:"opioid",l:"Opioid / MAT-related",sub:"Medication-assisted treatment and opioid panels",panels:["BUP","MTD","MOP","OXY","PPX"]},
  {k:"sedative",l:"Sedative / psychiatric relevance",sub:"Benzodiazepine, barbiturate, and TCA panels",panels:["BZO","BAR","TCA"]},
  {k:"stimulant",l:"Stimulant / illicit",sub:"Amphetamine, methamphetamine, cocaine, MDMA, PCP",panels:["AMP","MET","COC","MDMA","PCP"]},
  {k:"cannabis",l:"Cannabis",sub:"THC panel",panels:["THC"]}
];
const UDS_PANELS=UDS_GROUPS.flatMap(g=>g.panels);
const UDS_RESULT_LABEL={neg:"Negative",pos:"Preliminary positive",invalid:"Invalid / unreadable",nt:"Not tested"};
const UDS_RESULT_SHORT={neg:"negative",pos:"preliminary positive",invalid:"invalid/unreadable",nt:"not tested"};

const UDS_PANEL_INFO={
  BUP:{name:"Buprenorphine",patient:"buprenorphine medication screen",group:"Opioid / medication-assisted treatment"},
  MTD:{name:"Methadone",patient:"methadone medication screen",group:"Opioid / medication-assisted treatment"},
  MOP:{name:"Morphine / opiate",patient:"opiate pain medicine screen",group:"Opioid / medication-assisted treatment"},
  OXY:{name:"Oxycodone",patient:"oxycodone pain medicine screen",group:"Opioid / medication-assisted treatment"},
  PPX:{name:"Propoxyphene",patient:"propoxyphene pain medicine screen",group:"Opioid / medication-assisted treatment"},
  BZO:{name:"Benzodiazepines",patient:"benzodiazepine medicine screen",group:"Sedative / psychiatric relevance"},
  BAR:{name:"Barbiturates",patient:"barbiturate medicine screen",group:"Sedative / psychiatric relevance"},
  TCA:{name:"Tricyclic antidepressants",patient:"tricyclic antidepressant medicine screen",group:"Sedative / psychiatric relevance"},
  AMP:{name:"Amphetamines",patient:"amphetamine stimulant screen",group:"Stimulant / other substances"},
  MET:{name:"Methamphetamine",patient:"methamphetamine stimulant screen",group:"Stimulant / other substances"},
  COC:{name:"Cocaine metabolite",patient:"cocaine screen",group:"Stimulant / other substances"},
  MDMA:{name:"MDMA / ecstasy",patient:"ecstasy-related substance screen",group:"Stimulant / other substances"},
  PCP:{name:"Phencyclidine",patient:"phencyclidine screen",group:"Stimulant / other substances"},
  THC:{name:"Cannabinoids / THC",patient:"cannabis or marijuana screen",group:"Cannabis"}
};
function udsPanelName(panel){return (UDS_PANEL_INFO[panel]||{}).name||panel;}
function udsPanelPatientName(panel){return (UDS_PANEL_INFO[panel]||{}).patient||udsPanelName(panel);}
function udsPanelGroupName(panel){return (UDS_PANEL_INFO[panel]||{}).group||"Other";}
function udsPlainList(panels,none="none documented"){return panels&&panels.length?panels.map(udsPanelPatientName).join(", "):none;}
function udsLabResultWord(state){return ({neg:"Negative",pos:"Preliminary positive",invalid:"Invalid / unreadable",nt:"Not tested"})[state]||"Not tested";}
function udsLabComment(panel,state){
  if(state==="pos")return "Flagged for clinician review; point-of-care screening result only.";
  if(state==="invalid")return "Do not interpret this panel; repeat or confirmation per provider direction.";
  if(state==="nt")return "Panel not tested or not documented on this cup/result.";
  return "No preliminary positive result documented.";
}
function udsReportId(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");
  return `POC-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}


/* patient-facing aftercare line for the AVS */
const AVSNOTE={
  _default:"Take any other medicines exactly as prescribed and do not stop them without talking to your provider.",
  vivitrol:"Do not use any opioids — they will not work normally and could be dangerous. Carry your Vivitrol patient wallet card at all times, and tell any other provider you receive this injection.",
  aristada:"Keep taking any oral medicines as prescribed. Report unusual movements, muscle stiffness, restlessness, or high fever.",
  initio:"Keep taking any oral medicines as prescribed. Report unusual movements, muscle stiffness, restlessness, or high fever.",
  sustenna:"Keep taking any oral medicines as prescribed. Report unusual movements, muscle stiffness, restlessness, or high fever.",
  trinza:"Keep taking any oral medicines as prescribed. Report unusual movements, muscle stiffness, restlessness, or high fever.",
  hafyera:"Keep taking any oral medicines as prescribed. Report unusual movements, muscle stiffness, restlessness, or high fever.",
  uzedy:"Keep taking any oral medicines as prescribed. Report unusual movements, muscle stiffness, restlessness, or high fever.",
  erzofri:"Keep taking medicines exactly as prescribed. Report unusual movements, muscle stiffness, restlessness, high fever, or severe sleepiness.",
  maintena:"Keep taking any oral medicines as prescribed. Report unusual movements, muscle stiffness, restlessness, or high fever.",
  asimtufii:"Keep your every-2-month injection appointment. Do not rub or massage the injection site. Report unusual movements, muscle stiffness, restlessness, high fever, or severe sleepiness.",
  haldol:"Keep taking any oral medicines as prescribed. Report unusual movements, muscle stiffness, restlessness, or high fever.",
  prolixin:"Keep taking any oral medicines as prescribed. Report unusual movements, muscle stiffness, restlessness, or high fever."
};

const CLINICS=[
  {n:"San Bernardino", p:""},
  {n:"Telemedicine - San Bernardino", p:""},
  {n:"Chino", p:"(909) 902-1082"},
  {n:"Yucaipa", p:"(909) 793-9596"},
  {n:"Victorville", p:"(760) 660-6798"},
  {n:"Eastvale", p:"(951) 344-4451"},
  {n:"Temecula", p:"(951) 373-6819"},
  {n:"Wildomar", p:"(951) 373-6803"},
  {n:"Downey", p:"(562) 543-2389"},
  {n:"Glendora", p:"(626) 335-1919"},
  {n:"Claremont", p:"(909) 625-7175"},
  {n:"Lancaster", p:"(661) 383-1446"},
  {n:"Garden Grove", p:"(714) 823-4780"},
  {n:"San Juan Capistrano", p:"(949) 226-6914"},
  {n:"Other / custom IPMG location", p:""}
];

/* ---------- state ---------- */
const S={ med:null, dose:"", site:"", route:"", intervalKey:"", reason:"scheduled",
          resp:"well", attest:{}, flags:{}, guard:{}, retCustom:false, adminGuideCollapsed:false, needleGuideOpen:false };
ATTEST.forEach(a=>S.attest[a.id]=!a.off&&a.id!=="prior");
const UDS={reason:"routine",temp:"acceptable",control:"valid",results:{},validity:"acceptable",consistent:"no unexpected",lab:"provider to decide",photoData:""};
UDS_PANELS.forEach(p=>UDS.results[p]="neg");
let LOG=[];
function localDateKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
const LOG_STORAGE_KEY="ipmgMedAssistActivityLog_"+localDateKey();
const SAFE_STORAGE={
  get(k,f=''){try{return window.localStorage.getItem(k)??f;}catch(e){return f;}},
  set(k,v){try{window.localStorage.setItem(k,String(v));return true;}catch(e){return false;}},
  remove(k){try{window.localStorage.removeItem(k);return true;}catch(e){return false;}}
};
const STAFF_STORAGE_KEY='ipmgMedAssistStaff';
const LEGACY_STAFF_STORAGE_KEY='ipmgStaffName';
function getStoredStaff(){
  const saved=SAFE_STORAGE.get(STAFF_STORAGE_KEY,'').trim();
  if(saved)return saved;
  const legacy=SAFE_STORAGE.get(LEGACY_STAFF_STORAGE_KEY,'').trim();
  if(!legacy)return '';
  SAFE_STORAGE.set(STAFF_STORAGE_KEY,legacy);
  SAFE_STORAGE.remove(LEGACY_STAFF_STORAGE_KEY);
  return legacy;
}
function loadLog(){try{const raw=SAFE_STORAGE.get(LOG_STORAGE_KEY);LOG=raw?JSON.parse(raw):[];if(!Array.isArray(LOG))LOG=[];}catch(e){LOG=[];}}
function saveLog(){try{return SAFE_STORAGE.set(LOG_STORAGE_KEY,JSON.stringify(LOG))===true;}catch(e){return false;}}
function appendLogEntry(entry){LOG.push(entry);if(saveLog())return true;LOG.pop();return false;}


/* ---------- helpers ---------- */
function localDateValue(d=new Date()){const pad=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function addDays(iso,n){const d=new Date(iso+"T00:00:00");d.setDate(d.getDate()+n);return localDateValue(d);}
function dow(iso){if(!iso)return 0;return new Date(iso+"T00:00:00").getDay();}
function fmtDate(s){if(!s)return"";return new Date(s+"T00:00:00").toLocaleDateString("en-US",{weekday:undefined,month:"short",day:"numeric",year:"numeric"});}
function fmtShort(s){if(!s)return"";return new Date(s+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});}
function dowName(s){if(!s)return"";return new Date(s+"T00:00:00").toLocaleDateString("en-US",{weekday:"long"});}
function initials(n){if(!n)return"—";const c=n.replace(/,/g,"").trim().split(/\s+/);return (c.length===1?c[0].slice(0,2):c[0][0]+c[c.length-1][0]).toUpperCase();}
function firstName(n){if(!n)return"";if(n.includes(","))return n.split(",")[1].trim().split(/\s+/)[0];return n.trim().split(/\s+/)[0];}
function fmtDOB(v){let d=(v||"").replace(/\D/g,"").slice(0,8);if(d.length>=5)return d.slice(0,2)+"/"+d.slice(2,4)+"/"+d.slice(4);if(d.length>=3)return d.slice(0,2)+"/"+d.slice(2);return d;}
function esc(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}

function localDateTimeValue(d=new Date()){
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function monthExpired(v,referenceDate=""){
  if(!v)return false;
  const [y,m]=v.split("-").map(Number);
  if(!y||!m)return false;
  const end=new Date(y,m,0,23,59,59,999);
  const reference=referenceDate?new Date(String(referenceDate).slice(0,10)+"T00:00:00"):new Date();
  if(Number.isNaN(reference.getTime()))return false;
  reference.setHours(0,0,0,0);
  return end<reference;
}
function setFieldQa(id,level){
  const el=$(id);if(!el)return;
  el.classList.remove("qa-missing","qa-danger");
  if(level==="warn")el.classList.add("qa-missing");
  if(level==="danger")el.classList.add("qa-danger");
}
function qaBadge(level,text){
  const mark=level==="ok"?"✓":level==="danger"?"!":level==="warn"?"!":"•";
  return `<span class="qa-chip ${level}">${mark} ${esc(text)}</span>`;
}
function renderQaPanel(id,title,items){
  const box=$(id);if(!box)return;
  const danger=items.filter(i=>i.level==="danger").length;
  const warn=items.filter(i=>i.level==="warn").length;
  const ok=items.filter(i=>i.level==="ok").length;
  const info=items.filter(i=>i.level==="info").length;
  const score=danger?`${danger} action needed`:(warn?`${warn} check${warn>1?"s":""}`:(ok?"Ready":(info?"Not started":"Ready")));
  box.innerHTML=`<div class="qa-head"><div class="qa-title">${esc(title)}</div><div class="qa-score">${esc(score)}</div></div><div class="qa-list">${items.map(i=>qaBadge(i.level,i.text)).join("")}</div>`;
}
function injectionTraceIssues(){
  const issues=[];
  if(!$('ndc').value.trim())issues.push('NDC');
  if(!$('lot').value.trim())issues.push('lot');
  if(!$('exp').value.trim())issues.push('expiration');
  return issues;
}
function udsTraceIssues(){
  const issues=[];
  if(!$('udsLot').value.trim())issues.push('lot');
  if(!$('udsExp').value.trim())issues.push('expiration');
  if(!$('udsCollector').value.trim())issues.push('collector');
  return issues;
}

function parseBp(v){
  const m=(v||"").trim().match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if(!m)return null;
  return {sys:+m[1],dia:+m[2]};
}
function parseNum(v){
  const m=(v||"").trim().match(/-?\d+(?:\.\d+)?/);
  return m?+m[0]:null;
}
function parseTempF(v){
  const raw=(v||"").trim();
  if(!raw)return null;
  let n=parseNum(raw); if(n==null)return null;
  if(/[cC]/.test(raw) || n<45)n=(n*9/5)+32;
  return n;
}
function medSafetyFamily(m){
  if(!m)return "";
  if(m.key==="vivitrol")return "vivitrol";
  if(["haldol","prolixin"].includes(m.key))return "typical";
  if(["sustenna","trinza","hafyera","erzofri","uzedy"].includes(m.key))return "paliperidoneRisperidone";
  if(["aristada","initio","maintena","asimtufii"].includes(m.key))return "aripiprazole";
  return "antipsychotic";
}
function activeSafetyGuards(){
  const key=S.med?S.med.key:"";
  return INJ_SAFETY.filter(g=>!g.med || g.med.includes(key));
}
function selectedSafetyGuards(){
  return activeSafetyGuards().filter(g=>S.guard[g.id]);
}
function vitalSafetyItems(){
  const items=[];
  const bp=parseBp($('bp').value), hr=parseNum($('hr').value), temp=parseTempF($('temp').value);
  const fam=medSafetyFamily(S.med);
  if(bp){
    if(bp.sys>=180 || bp.dia>=120)items.push({level:'danger',text:`BP ${bp.sys}/${bp.dia} — urgent provider review`});
    else if(bp.sys>=160 || bp.dia>=100)items.push({level:'warn',text:`BP ${bp.sys}/${bp.dia} elevated — review before giving`});
    else if(bp.sys<90 || bp.dia<50)items.push({level:'danger',text:`BP ${bp.sys}/${bp.dia} low — review before giving`});
    else items.push({level:'ok',text:`BP ${bp.sys}/${bp.dia}`});
  }else if($('bp').value.trim())items.push({level:'warn',text:'BP format not recognized'});
  if(hr!=null){
    if(hr>=120 || hr<=50)items.push({level:'danger',text:`HR ${hr} — provider review`});
    else if(hr>=100)items.push({level:'warn',text:`HR ${hr} elevated — review if symptomatic`});
    else items.push({level:'ok',text:`HR ${hr}`});
  }else if($('hr').value.trim())items.push({level:'warn',text:'HR format not recognized'});
  if(temp!=null){
    if(temp>=100.4)items.push({level:fam&&fam!=="vivitrol"?'danger':'warn',text:`Temp ${temp.toFixed(1)}°F — fever screen/provider review`});
    else items.push({level:'ok',text:`Temp ${temp.toFixed(1)}°F`});
  }else if($('temp').value.trim())items.push({level:'warn',text:'Temperature format not recognized'});
  return items;
}
function medicationSafetyItems(){
  const items=[]; const m=S.med; if(!m)return items;
  (m.flags||[]).forEach(fk=>{
    const f=FLAG[fk]; if(!f)return;
    if(!S.flags[fk])items.push({level:fk==='opioidFree'||fk==='glutealOnly'?'danger':'warn',text:`Review required: ${f.t}`});
  });
  const fam=medSafetyFamily(m);
  if(fam==='paliperidoneRisperidone')items.push({level:'info',text:'Monitor vulnerable patients for orthostatic hypotension/syncope'});
  if(fam==='aripiprazole')items.push({level:'info',text:'Monitor vulnerable patients for orthostatic hypotension/syncope'});
  if(fam==='typical')items.push({level:'info',text:'Watch for EPS/NMS and cardiac symptoms'});
  if(fam==='vivitrol')items.push({level:'info',text:'Confirm opioid-free status and liver/injection-site concerns'});
  return items;
}
function safetyNarrativeLines(){
  const lines=[];
  const vitals=vitalSafetyItems().filter(i=>i.level==='danger'||i.level==='warn');
  if(vitals.length)lines.push('Provider review triggers from vitals: '+vitals.map(i=>i.text).join('; ')+'.');
  selectedSafetyGuards().forEach(g=>lines.push(g.s));
  return lines;
}
function renderInjQa(){
  const hasMed=!!S.med;
  const ndc=$('ndc').value.trim(),lot=$('lot').value.trim(),exp=$('exp').value.trim(),next=$('nextDate').value,admin=$('admin').value.trim(),adminTime=$('injAdminTime')?.value.trim()||'',ordering=$('orderingProvider').value.trim();
  setFieldQa('ndc',hasMed&&!ndc?'warn':null);
  setFieldQa('lot',hasMed&&!lot?'danger':null);
  setFieldQa('exp',hasMed?(!exp?'danger':monthExpired(exp,$('adminDate').value)?'danger':null):null);
  setFieldQa('nextDate',hasMed&&!next?'warn':null);
  setFieldQa('injAdminTime',hasMed&&!adminTime?'warn':null);
  setFieldQa('admin',hasMed&&!admin?'warn':null);
  setFieldQa('orderingProvider',hasMed&&!ordering?'warn':null);
  const items=[];
  if(!hasMed){items.push({level:'info',text:'Pick a medication to start'});renderQaPanel('injQa','Injection readiness',items);return;}
  items.push({level:ordering?'ok':'warn',text:ordering?'Ordering provider documented':'Add ordering provider'});
  items.push({level:ndc&&lot&&exp?'ok':(lot&&exp?'warn':'danger'),text:ndc&&lot&&exp?'NDC / lot / exp documented':'Complete NDC / lot / exp'});
  if(exp&&monthExpired(exp,$('adminDate').value))items.push({level:'danger',text:'Medication expiration appears past'});
  items.push({level:S.site&&S.route?'ok':'warn',text:S.site&&S.route?`Route/site selected · ${S.route} · ${S.site}`:'Route/site incomplete'});
  items.push({level:next?'ok':'warn',text:next?'Next dose date ready':'Next dose missing'});
  items.push({level:adminTime?'ok':'warn',text:adminTime?'Actual administration time documented':'Add actual administration time'});
  items.push({level:admin?'ok':'warn',text:admin?'Administered-by documented':'Add administering staff'});
  items.push(...vitalSafetyItems());
  selectedSafetyGuards().forEach(g=>items.push({level:g.level||'warn',text:`Provider review: ${g.t}`}));
  items.push(...medicationSafetyItems());
  renderQaPanel('injQa','Injection safety + readiness',items);
}
function renderUdsQa(pos=udsPanelsByState('pos'),inv=udsPanelsByState('invalid'),neg=udsPanelsByState('neg'),nt=udsPanelsByState('nt')){
  const lot=$('udsLot').value.trim(),exp=$('udsExp').value.trim(),collector=$('udsCollector').value.trim();
  setFieldQa('udsLot',!lot?'warn':null);
  setFieldQa('udsExp',!exp?'warn':monthExpired(exp,$('udsDateTime').value)?'danger':null);
  setFieldQa('udsCollector',!collector?'warn':null);
  const items=[];
  if(UDS.control==='valid')items.push({level:'ok',text:'Control line valid'});
  else items.push({level:'danger',text:UDS.control==='invalid'?'Control invalid — do not interpret':'Control line not documented — do not interpret'});
  if(inv.length)items.push({level:'danger',text:`Invalid panel${inv.length>1?'s':''}: ${shortList(inv)}`});
  if(pos.length)items.push({level:'warn',text:`Prelim positive: ${shortList(pos)}`});
  if(!pos.length&&!inv.length&&UDS.control==='valid')items.push({level:'ok',text:`All ${neg.length} tested panel${neg.length===1?'':'s'} negative`});
  if(nt.length)items.push({level:'info',text:`Not tested: ${shortList(nt)}`});
  if(UDS.temp==='not acceptable')items.push({level:'danger',text:'Temperature not acceptable'});
  else if(UDS.temp==='not documented')items.push({level:'warn',text:'Temperature not documented'});
  if(UDS.validity==='needs review')items.push({level:'warn',text:'Validity needs review'});
  if(UDS.consistent==='not aligned'||UDS.consistent==='needs review')items.push({level:'warn',text:'Clinician handoff requested'});
  items.push({level:lot&&exp&&!monthExpired(exp,$('udsDateTime').value)?'ok':(exp&&monthExpired(exp,$('udsDateTime').value)?'danger':'warn'),text:lot&&exp&&!monthExpired(exp,$('udsDateTime').value)?'Device lot/exp documented':'Complete device lot/exp'});
  if(exp&&monthExpired(exp,$('udsDateTime').value))items.push({level:'danger',text:'Device expiration appears past'});
  items.push({level:collector?'ok':'warn',text:collector?'Collector documented':'Add collector'});
  renderQaPanel('udsQa','UDS readiness',items);
}

/* ---------- chips ---------- */
function chipEl(label,on,cls,onClick,inner){
  const c=document.createElement("button");
  c.type="button";
  c.className="chip "+(cls||"")+(on?" on":"");
  c.setAttribute("aria-pressed",String(!!on));
  c.innerHTML=(inner||"")+`<span>${label}</span>`;
  c.addEventListener("click",onClick);return c;
}
const tickHTML=`<span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>`;

function renderReasons(){const b=$("reasonChips");b.innerHTML="";REASONS.forEach(r=>b.appendChild(chipEl(r.l,S.reason===r.k,"sm",()=>{S.reason=r.k;renderReasons();render();})));}
function renderMeds(){const b=$("medChips");b.innerHTML="";MEDS.forEach(m=>b.appendChild(chipEl(m.label,S.med&&S.med.key===m.key,"med",()=>selectMed(m))));}

$("medClear").addEventListener("click",()=>{
  S.med=null;S.dose="";S.flags={};S.adminGuideCollapsed=false;S.needleGuideOpen=false;
  $("medHdr").classList.remove("show");$("medChipsGrp").classList.remove("hidden");
  $("medDetail").classList.add("hidden");$("medSpecWrap").classList.remove("show");$("medTip").classList.remove("show");
  renderMeds();render();
});

function renderDoses(){
  const b=$("doseChips");b.innerHTML="";
  const doses=medDosesForInterval(S.med,S.intervalKey);
  if(!S.med||!doses.length){const i=document.createElement("input");i.placeholder="enter dose";i.style.maxWidth="160px";i.value=S.dose;i.addEventListener("input",e=>{S.dose=e.target.value;render();});b.appendChild(i);return;}
  doses.forEach(d=>b.appendChild(chipEl(d,S.dose===d,"dose sm",()=>{S.dose=d;applyMedDoseRules();renderDoses();renderSites();renderRoutes();renderIntervals();recalcNext();render();})));
}
function renderIntervals(){const b=$("intChips");b.innerHTML="";INTERVALS.forEach(i=>b.appendChild(chipEl(i.l,S.intervalKey===i.k,"sm",()=>{
  S.intervalKey=i.k;$("intAuto").style.display="none";S.retCustom=false;
  if(S.med&&S.med.dosesByInterval&&S.med.dosesByInterval[i.k]&&!S.med.dosesByInterval[i.k].includes(S.dose)){S.dose="";}
  recalcNext();renderDoses();renderIntervals();render();
})));}
function renderMedSpec(){
  const wrap=$("medSpecWrap"),b=$("medSpecChips");b.innerHTML="";
  const flags=(S.med&&S.med.flags)||[];
  if(!flags.length){wrap.classList.remove("show");return;}
  wrap.classList.add("show");$("msTitle").textContent=S.med.label+" safety";
  flags.forEach(fk=>{const f=FLAG[fk];if(!f)return;b.appendChild(chipEl(f.t,!!S.flags[fk],"att sm",()=>{S.flags[fk]=!S.flags[fk];renderMedSpec();render();},tickHTML));});
}
function renderAtt(){const b=$("attChips");b.innerHTML="";ATTEST.forEach(a=>b.appendChild(chipEl(a.t,!!S.attest[a.id],"att sm",()=>{S.attest[a.id]=!S.attest[a.id];renderAtt();render();},tickHTML)));}
function renderInjSafetyChips(){
  const b=$("injSafetyChips");if(!b)return;b.innerHTML="";
  activeSafetyGuards().forEach(g=>b.appendChild(chipEl(g.t,!!S.guard[g.id],"att sm",()=>{S.guard[g.id]=!S.guard[g.id];renderInjSafetyChips();render();},tickHTML)));
}
function renderResp(){const b=$("respChips");b.innerHTML="";RESP.forEach(r=>b.appendChild(chipEl(r.l,S.resp===r.k,"sm",()=>{S.resp=r.k;$("respCustomWrap").classList.toggle("hidden",r.k!=="custom");renderResp();render();})));}

function renderUdsReasons(){const b=$("udsReasonChips");if(!b)return;b.innerHTML="";UDS_REASONS.forEach(r=>b.appendChild(chipEl(r.l,UDS.reason===r.k,"sm",()=>{UDS.reason=r.k;renderUdsReasons();renderUdsNote();})));}
function renderUdsTemp(){const b=$("udsTempChips");if(!b)return;b.innerHTML="";UDS_TEMP.forEach(r=>b.appendChild(chipEl(r.l,UDS.temp===r.k,"sm",()=>{UDS.temp=r.k;renderUdsTemp();renderUdsNote();})));}
function renderUdsControl(){const b=$("udsControlChips");if(!b)return;b.innerHTML="";UDS_CONTROL.forEach(r=>b.appendChild(chipEl(r.l,UDS.control===r.k,"sm",()=>{UDS.control=r.k;renderUdsControl();renderUdsResults();renderUdsNote();})));}
function setUdsPanels(panels,state){
  panels.forEach(p=>{UDS.results[p]=state;});
  renderUdsResults();renderUdsNote();
}
function setAllUdsResults(state){setUdsPanels(UDS_PANELS,state);}
function clearUdsFlags(){
  UDS_PANELS.forEach(p=>{if(UDS.results[p]==="pos"||UDS.results[p]==="invalid")UDS.results[p]="neg";});
  renderUdsResults();renderUdsNote();
}
function renderUdsAttention(pos=udsPanelsByState("pos"),inv=udsPanelsByState("invalid"),neg=udsPanelsByState("neg"),nt=udsPanelsByState("nt")){
  const box=$("udsAttention");if(!box)return;
  const lines=[];
  if(UDS.control!=="valid")lines.push({level:"danger",text:UDS.control==="invalid"?"Invalid/missing control line — do not interpret result.":"Control line not documented — do not interpret result until verified."});
  if(inv.length)lines.push({level:"danger",text:`Invalid/unreadable panels: ${commaList(inv)}.`});
  if(pos.length)lines.push({level:"warn",text:`Preliminary positive panels: ${commaList(pos)}.`});
  if(!pos.length&&!inv.length&&UDS.control==="valid"&&neg.length)lines.push({level:"ok",text:`No preliminary positives documented in ${neg.length} tested panel${neg.length===1?"":"s"}.`});
  if(nt.length)lines.push({level:"",text:`Not tested / not documented: ${commaList(nt)}.`});
  lines.push({level:UDS.consistent==="not aligned"?"warn":"",text:`Medication alignment: ${udsAlignmentShort()}.`});
  lines.push({level:"",text:`Provider action: ${udsProviderActionShort()}.`});
  box.innerHTML=`<div class="ah">Clinician attention</div><div class="alist">${lines.map(x=>`<div class="aitem ${x.level}">${esc(x.text)}</div>`).join("")}</div>`;
}
function renderUdsResults(){
  const g=$("udsResultGrid");if(!g)return;g.innerHTML="";
  UDS_GROUPS.forEach(group=>{
    const wrap=document.createElement("div");wrap.className="uds-group";
    wrap.innerHTML=`<div class="uds-group-head"><div><div class="uds-group-title">${esc(group.l)}</div><div class="uds-group-sub">${esc(group.sub)}</div></div><div class="uds-group-actions"><button type="button" class="mini" data-gstate="neg">Group negative</button><button type="button" class="mini" data-gstate="nt">Group not tested</button></div></div><div class="uds-group-grid"></div>`;
    wrap.querySelectorAll("[data-gstate]").forEach(btn=>btn.addEventListener("click",()=>setUdsPanels(group.panels,btn.dataset.gstate)));
    const grid=wrap.querySelector(".uds-group-grid");
    group.panels.forEach(panel=>{
      const state=UDS.results[panel]||"nt";
      const card=document.createElement("div");card.className=`uds-panel ${state}`;
      card.innerHTML=`<div class="udsh"><span class="drug">${panel}</span><span class="state">${UDS_RESULT_LABEL[state]}</span></div><div class="minirow"></div>`;
      const row=card.querySelector(".minirow");
      [["neg","Neg"],["pos","Pos"],["invalid","Invalid"],["nt","Not tested"]].forEach(([k,l])=>{
        const m=document.createElement("button");m.type="button";m.className="mini"+(k==="nt"?" nt":"")+(state===k?" on":"");m.textContent=l;
        m.addEventListener("click",()=>{UDS.results[panel]=k;renderUdsResults();renderUdsNote();});row.appendChild(m);
      });
      grid.appendChild(card);
    });
    g.appendChild(wrap);
  });
  const pos=udsPanelsByState("pos"),inv=udsPanelsByState("invalid"),neg=udsPanelsByState("neg"),nt=udsPanelsByState("nt");
  renderUdsAttention(pos,inv,neg,nt);
  const s=$("udsSummaryBadges");
  if(s){
    const needs=UDS.control!=="valid"||inv.length||pos.length||UDS.validity==="needs review"||UDS.consistent==="not aligned"||UDS.consistent==="needs review";
    const tested=UDS_PANELS.length-nt.length;
    s.innerHTML=`<span class="uds-badge ${needs?"pos":""}">${needs?"Provider review":"No flagged findings"}</span><span class="uds-badge">Tested: ${tested}</span><span class="uds-badge">Negative: ${neg.length}</span><span class="uds-badge pos">Prelim positive: ${pos.length}</span><span class="uds-badge invalid">Invalid: ${inv.length}</span><span class="uds-badge nt">Not tested: ${nt.length}</span>`;
  }
}
function udsPanelsByState(state){return UDS_PANELS.filter(p=>(UDS.results[p]||"nt")===state);}
function udsReasonObj(){return UDS_REASONS.find(r=>r.k===UDS.reason)||UDS_REASONS[0];}
function udsTempObj(){return UDS_TEMP.find(r=>r.k===UDS.temp)||UDS_TEMP[0];}
function udsControlObj(){return UDS_CONTROL.find(r=>r.k===UDS.control)||UDS_CONTROL[0];}
function shortList(items,noneText="none"){return items&&items.length?items.join("/"):noneText;}
function commaList(items,noneText="none"){return items&&items.length?items.join(", "):noneText;}
function udsCollectionDateText(){
  const raw=$("udsDateTime")?$("udsDateTime").value:"";
  if(!raw)return "";
  const d=new Date(raw);
  if(Number.isNaN(d.getTime()))return raw.replace("T"," ");
  return d.toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
}
function udsLabText(){
  const v=$("udsLab")?$("udsLab").value:UDS.lab;
  if(v==="not needed")return "outside lab not needed";
  if(v==="ordered")return "outside lab order placed";
  if(v==="recommended")return "outside lab recommended if clinically indicated";
  return "outside lab deferred to provider";
}
function udsLabPlanLine(){
  const v=$("udsLab")?$("udsLab").value:UDS.lab;
  if(v==="not needed")return "No outside lab order documented today.";
  if(v==="ordered")return "Outside lab order placed per clinic workflow.";
  if(v==="recommended")return "Outside lab confirmation recommended if clinically indicated.";
  return "Outside lab confirmation deferred to provider judgment.";
}
function udsProviderActionShort(){
  const v=$("udsLab")?$("udsLab").value:UDS.lab;
  if(v==="not needed")return "FYI / no outside lab documented";
  if(v==="ordered")return "outside lab order placed";
  if(v==="recommended")return "consider outside lab confirmation";
  return "provider to decide on outside lab confirmation";
}
function udsAlignmentShort(){
  const map={
    "not aligned":"not readily explained by available medication list",
    "needs review":"provider review requested",
    "no unexpected":"no unexpected findings noted by staff",
    "patient explanation":"patient reports prescribed/known explanation",
    "unavailable":"medication list unavailable / not reviewed"
  };
  return map[UDS.consistent]||map["not aligned"];
}
function udsGroupedResultLines(){
  return UDS_GROUPS.map(group=>{
    const parts=group.panels.map(p=>`${p} ${UDS_RESULT_SHORT[UDS.results[p]||"nt"]}`);
    return `${group.l}: ${parts.join(", ")}.`;
  });
}
function udsClinicianAttentionText(pos,inv,nt){
  const lines=[];
  if(UDS.control!=="valid")lines.push(UDS.control==="invalid"?"Invalid/missing control line: do not interpret result.":"Control line not documented: do not interpret result until verified.");
  if(inv.length)lines.push(`Invalid/unreadable panels: ${commaList(inv)}.`);
  if(pos.length)lines.push(`Preliminary positive: ${commaList(pos)}.`);
  if(nt.length)lines.push(`Not tested / not documented: ${commaList(nt)}.`);
  if(!lines.length)lines.push("No preliminary positive or invalid panels documented among tested panels.");
  lines.push(`Medication alignment: ${udsAlignmentShort()}.`);
  return lines;
}
function udsConsistencyLine(){
  const map={
    "not aligned":"Result not readily explained by medication information available to staff at time of collection; no final clinical interpretation made by staff.",
    "needs review":"Provider review requested; final interpretation deferred to clinician.",
    "no unexpected":"No unexpected findings noted by staff based on available medication context; provider has final interpretation.",
    "patient explanation":"Patient reports a prescribed or known explanation; provider to review and determine clinical significance.",
    "unavailable":"Medication list unavailable or not reviewed at time of collection; provider to interpret in clinical context."
  };
  return map[UDS.consistent]||map["not aligned"];
}
function udsSnapshot(pos,inv,neg,nt=udsPanelsByState("nt")){
  const val=UDS.validity==="acceptable"?"interpretable":`validity ${UDS.validity}`;
  if(UDS.control!=="valid"){
    return `UDS handoff — ${UDS.control==="invalid"?'invalid':'undocumented'} control; do not interpret; provider review requested.`;
  }
  if(inv.length){
    return `UDS handoff — invalid ${shortList(inv)}; do not interpret affected panel(s); provider review requested.`;
  }
  if(pos.length){
    return `UDS handoff — +${shortList(pos)}; ${val}; ${udsAlignmentShort()}; provider review requested.`;
  }
  if(!neg.length && nt.length){
    return `UDS handoff — no panels marked tested; documentation incomplete.`;
  }
  const ntPart=nt.length?`; ${nt.length} not tested`:"";
  return `UDS handoff — all tested panels negative${ntPart}; ${val}; ${udsProviderActionShort()}.`;
}
function renderUdsNote(){
  if(!$('udsOutCC'))return;
  const name=$('udsPtName').value.trim();$('udsScanAv').textContent=initials(name);$('udsScanName').textContent=name||'Patient name';
  UDS.validity=$('udsValidity').value;UDS.consistent=$('udsConsistent').value;UDS.lab=$('udsLab').value;
  const pos=udsPanelsByState('pos'),inv=udsPanelsByState('invalid'),neg=udsPanelsByState('neg'),nt=udsPanelsByState('nt');
  const reason=udsReasonObj();
  const ccHeadline=udsSnapshot(pos,inv,neg,nt);
  const collectionText=udsCollectionDateText();
  const ccBody=`Point-of-care urine drug screen completed for ${reason.cc}${collectionText?` on ${collectionText}`:''}. This note is a staff handoff for clinician review; final interpretation deferred to provider.`;
  $('udsScanPrev').textContent=ccHeadline;
  $('udsOutCC').innerHTML=`<p class="preview-line">${esc(ccHeadline)}</p><p>${esc(ccBody)}</p>`;

  const attentionLines=udsClinicianAttentionText(pos,inv,nt);
  const groupedLines=UDS.control!=='valid'
    ? [`Grouped panel results not interpreted due to ${UDS.control==='invalid'?'invalid/missing':'undocumented'} control line.`]
    : udsGroupedResultLines();

  const comment=$('udsComment').value.trim();
  const handoffLines=[
    'Clinician attention:',
    ...attentionLines,
    '',
    'Validity:',
    udsControlObj().s,
    udsTempObj().s,
    `Validity markers: ${UDS.validity}.`,
    '',
    'Grouped panel results:',
    ...groupedLines,
    '',
    'Staff context:',
    udsConsistencyLine(),
    comment?`Patient/comment context: ${comment}`:'Patient/comment context: none documented.'
  ];

  const handoffHtml=[
    `<div class="note-group"><span class="note-label">Clinician attention</span>${attentionLines.map(l=>`<p>${esc(l)}</p>`).join('')}</div>`,
    `<div class="note-group"><span class="note-label">Validity</span><p>${esc(udsControlObj().s)}</p><p>${esc(udsTempObj().s)}</p><p>${esc(`Validity markers: ${UDS.validity}.`)}</p></div>`,
    `<div class="note-group"><span class="note-label">Grouped panel results</span>${groupedLines.map(l=>`<p class="result-line">${esc(l)}</p>`).join('')}</div>`,
    `<div class="note-group"><span class="note-label">Staff context</span><p>${esc(udsConsistencyLine())}</p><p>${esc(comment?`Patient/comment context: ${comment}`:'Patient/comment context: none documented.')}</p></div>`
  ];
  $('udsOutAS').innerHTML=handoffHtml.join('');

  const device=$('udsDevice').value||'not documented',lot=$('udsLot').value.trim()||'not documented',exp=$('udsExp').value.trim()||'not documented',collector=$('udsCollector').value.trim()||'not documented';
  const trace=[`Device: ${device}`,`Lot: ${lot}`,`Exp: ${exp}`,collectionText?`Collected: ${collectionText}`:'Collected: not documented',`Collected by: ${collector}`];
  const followLines=[];
  followLines.push('Results documented as point-of-care preliminary screening only.');
  if(UDS.control!=='valid'){
    followLines.push(`Do not interpret this result due to ${UDS.control==='invalid'?'invalid/missing':'undocumented'} control line; verify/repeat UDS or use outside lab confirmation per provider direction.`);
  } else if(inv.length){
    followLines.push('Invalid/unreadable panel(s) should not be used for clinical interpretation; repeat affected panel(s) or outside lab confirmation per provider direction.');
  } else if(pos.length){
    followLines.push('Preliminary positive finding(s) routed as clinician handoff for review in clinical context.');
  } else {
    followLines.push('No preliminary positive panels documented among tested panels.');
  }
  followLines.push(udsLabPlanLine());
  const pHtml=followLines.map(l=>`<p>${esc(l)}</p>`);
  pHtml.push(`<div class="note-group"><span class="note-label">Traceability</span><p class="trace">${esc(trace.join(' · '))}</p></div>`);
  $('udsOutPL').innerHTML=pHtml.join('');

  const tebraNote=[
    ccHeadline,
    '',
    ccBody,
    '',
    ...handoffLines,
    '',
    'Provider follow-up:',
    ...followLines,
    '',
    'Device traceability:',
    trace.join(' · ')
  ].filter((line,idx,arr)=>line!==''||arr[idx-1]!=='' ).join('\n').trim();

  window._udsNote={
    cc:ccHeadline+'\n\n'+ccBody,
    as:handoffLines.filter((line,idx,arr)=>line!==''||arr[idx-1]!=='' ).join('\n').trim(),
    pl:[...followLines,'','Traceability:',trace.join(' · ')].filter((line,idx,arr)=>line!==''||arr[idx-1]!=='' ).join('\n').trim(),
    tebra:tebraNote,
    headline:ccHeadline,
    positives:pos,
    invalids:inv,
    negatives:neg,
    notTested:nt,
    attentionLines,
    followLines,
    contextLines:[udsConsistencyLine()]
  };
  renderUdsAttention(pos,inv,neg,nt);
  renderUdsQa(pos,inv,neg,nt);renderCommandCenter();
}
function softResetUds(){
  UDS.reason="routine";UDS.temp="acceptable";UDS.control="valid";UDS.validity="acceptable";UDS.consistent="no unexpected";UDS.lab="provider to decide";UDS_PANELS.forEach(p=>UDS.results[p]="neg");
  UDS.photoData="";
  ["udsPtName","udsDOB","udsCollector","udsLot","udsExp","udsComment"].forEach(id=>{if($(id))$(id).value="";});
  if($("udsPhoto"))$("udsPhoto").value="";if($("udsPhotoPreview")){$("udsPhotoPreview").src="";$("udsPhotoPreview").classList.add("hidden");}if($("udsPhotoEmpty"))$("udsPhotoEmpty").classList.remove("hidden");
  if($("udsDevice"))$("udsDevice").value="";if($("udsValidity"))$("udsValidity").value="acceptable";if($("udsConsistent"))$("udsConsistent").value="no unexpected";if($("udsLab"))$("udsLab").value="provider to decide";
  if($("udsDateTime"))$("udsDateTime").value=localDateTimeValue();
  renderUdsReasons();renderUdsTemp();renderUdsControl();renderUdsResults();renderUdsNote();toast("UDS cleared");
}

/* ---------- return date module ---------- */
function recalcNext(){
  const d=intDays(S.intervalKey),ad=$("adminDate").value;
  if(!S.retCustom){ $("nextDate").value = (d>0&&ad)?addDays(ad,d):""; }
  renderReturn();
}
function renderReturn(){
  const ad=$("adminDate").value, nd=$("nextDate").value, snap=$("snapRow");
  const big=$("retBig"),dowEl=$("retDow"),win=$("retWin");snap.innerHTML="";
  if(!nd){big.textContent="—";dowEl.textContent="";win.textContent="Pick a drug & interval to compute the window.";return;}
  big.textContent=fmtShort(nd);
  const wd=dow(nd);dowEl.textContent=dowName(nd);
  // window
  const w=effectiveWindow(S.med,S.intervalKey);
  const e=addDays(nd,-(w.winB||0)), l=addDays(nd,(w.winA||0));
  let winTxt=S.med&&S.med.timingMode==="orderVerify"
    ? "Target date from interval \u00b7 verify the active order and current PI before scheduling or giving."
    : `Window: <b>${fmtShort(e)}</b> \u2192 <b>${fmtShort(l)}</b>`;
  if(S.med){const id=intDays(S.intervalKey);winTxt+= id>0?` \u00b7 ${ (INTERVALS.find(i=>i.k===S.intervalKey)||{}).l } from admin`:"";}
  if(wd===0||wd===6){winTxt+=` \u00b7 <span class="warn">lands on a weekend</span>`;}
  win.innerHTML=winTxt;
  // weekend snap suggestions
  if(wd===0||wd===6){
    const lab=document.createElement("span");lab.className="lab";lab.textContent="Move to:";snap.appendChild(lab);
    const fri = wd===6? addDays(nd,-1) : addDays(nd,-2);
    const mon = wd===6? addDays(nd,2) : addDays(nd,1);
    snap.appendChild(chipEl("Fri "+fmtShort(fri),false,"sm",()=>{$("nextDate").value=fri;S.retCustom=true;renderReturn();render();}));
    snap.appendChild(chipEl("Mon "+fmtShort(mon),false,"sm",()=>{$("nextDate").value=mon;S.retCustom=true;renderReturn();render();}));
  } else {
    const lab=document.createElement("span");lab.className="lab";lab.textContent="Nudge:";snap.appendChild(lab);
    snap.appendChild(chipEl("\u2212 1 wk",false,"sm",()=>{$("nextDate").value=addDays(nd,-7);S.retCustom=true;renderReturn();render();}));
    snap.appendChild(chipEl("+ 1 wk",false,"sm",()=>{$("nextDate").value=addDays(nd,7);S.retCustom=true;renderReturn();render();}));
    snap.appendChild(chipEl("Reset",false,"sm",()=>{S.retCustom=false;recalcNext();render();}));
  }
  renderSMS();
}
$("adminDate").addEventListener("change",()=>{recalcNext();render();});
$("nextDate").addEventListener("change",()=>{S.retCustom=true;renderReturn();render();});
$("adminDate").value=localDateValue();
$("ndc").addEventListener("input",e=>e.target.classList.remove("auto"));

/* ---------- SMS ---------- */
CLINICS.forEach(c=>{const o=document.createElement("option");o.value=c.n+"|"+c.p;o.textContent=c.n+" — "+c.p;$("clinic").appendChild(o);});
$("smsToggle").addEventListener("click",()=>{$("smsWrap").classList.toggle("show");renderSMS();});
$("clinic").addEventListener("change",renderSMS);
function renderSMS(){
  if(!$("smsWrap").classList.contains("show"))return;
  const fn=firstName($("ptName").value)||"there", nd=$("nextDate").value;
  const when = nd ? `${dowName(nd)}, ${fmtDate(nd)}` : "your next appointment";
  const whenES = nd ? new Date(nd+"T00:00:00").toLocaleDateString("es-ES",{weekday:"long",month:"long",day:"numeric"}) : "su pr\u00f3xima cita";
  const cl=$("clinic").value, clName=cl?cl.split("|")[0]:"", clPhone=cl?cl.split("|")[1]:"";
  const callEN = clPhone? ` To reschedule, call ${clName} at ${clPhone}.` : "";
  const callES = clPhone? ` Para reprogramar, llame a ${clName} al ${clPhone}.` : "";
  $("smsEN").textContent=`Hi ${fn}, this is a reminder from IPMG about your next injection appointment on ${when}.${callEN}`;
  $("smsES").textContent=`Hola ${fn}, le recordamos de IPMG su pr\u00f3xima cita de inyecci\u00f3n el ${whenES}.${callES}`;
}
document.querySelectorAll("[data-sms]").forEach(b=>b.addEventListener("click",()=>{const k=b.dataset.sms;copy($(k==="en"?"smsEN":"smsES").textContent, k==="en"?"English SMS":"SMS en espa\u00f1ol");}));

/* ---------- render note ---------- */
function medTypeLabel(m){return m&&/LAI/i.test(m.cls||"")?"LAI":"injection";}
function reasonSnapshotLabel(reasonKey,m){
  const t=medTypeLabel(m);
  const map={
    scheduled:`Scheduled ${t}`,
    initiation:t==="LAI"?"LAI initiation":"Injection initiation",
    reinit:t==="LAI"?"LAI re-initiation":"Injection re-initiation",
    loading:"Loading dose",
    prn:"Clinician-ordered injection"
  };
  return map[reasonKey]||`Medication ${t}`;
}
function responseSnapshot(){
  if(S.resp==="custom")return ($("respCustom").value.trim()||"response documented").replace(/\.$/,"");
  if(S.resp==="bleed")return "minor bleeding controlled";
  if(S.resp==="disc")return "mild site discomfort";
  return "tolerated well";
}
function medSnapshotLine(){
  if(!S.med)return "";
  return `${S.med.name||S.med.label||"Medication"}${S.dose?" "+S.dose:""}${S.route?" "+S.route:""}${S.site?", "+S.site:""}`;
}
function traceabilityLine(){
  if(!S.med)return "";
  const ndc=$("ndc").value.trim(),lot=$("lot").value.trim(),exp=$("exp").value.trim();
  const parts=[`NDC: ${ndc||"not documented"}`,`Lot: ${lot||"not documented"}`,`Exp: ${exp||"not documented"}`];
  return `Medication details: ${parts.join(" · ")}.`;
}
function render(){
  const ptN=$("ptName").value.trim(),m=S.med,med=m?(m.name||m.label||""):"",reason=REASONS.find(r=>r.k===S.reason)||REASONS[0];
  $("scanAv").textContent=initials(ptN);$("scanName").textContent=ptN||"Patient name";

  const next=$("nextDate").value;
  const ccHeadline=med?`${reasonSnapshotLabel(S.reason,m)} — ${medSnapshotLine()}; ${responseSnapshot()}; ${next?"next due "+fmtDate(next):"next due TBD"}.`:"Injection administration";
  const ccBody=`Patient presents today for ${reason.cc}.`;
  $("scanPrev").textContent=ccHeadline;
  $("outCC").innerHTML=med?`<p class="preview-line">${esc(ccHeadline)}</p><p>${esc(ccBody)}</p>`:`<p class="empty">Tap a drug to build the CC preview line.</p>`;

  let aLines=[];
  ATTEST.filter(a=>!a.plan).forEach(a=>{if(!S.attest[a.id])return;if(a.id==="allergy")aLines.push(`Allergies reviewed — ${$("allergies").value.trim()||"reviewed"}.`);else aLines.push(a.s);});
  (m?m.flags:[]).forEach(fk=>{const f=FLAG[fk];if(f&&!f.plan&&S.flags[fk])aLines.push(f.s);});
  const bp=$("bp").value.trim(),hr=$("hr").value.trim(),temp=$("temp").value.trim();
  if(bp||hr||temp)aLines.push(`Vitals: ${[bp?"BP "+bp:"",hr?"HR "+hr:"",temp?"Temp "+temp:""].filter(Boolean).join(", ")}.`);
  safetyNarrativeLines().forEach(l=>aLines.push(l));
  $("outAS").innerHTML=aLines.length?aLines.map(l=>`<p>${esc(l)}</p>`).join(""):`<p class="empty">Tap verification chips to build the Assessment.</p>`;

  let pLines=[];
  if(med)pLines.push(`Administered ${medSnapshotLine()} using aseptic technique.`);
  (m?m.flags:[]).forEach(fk=>{const f=FLAG[fk];if(f&&f.plan&&S.flags[fk])pLines.push(f.s);});
  const tech=$("tech").value.trim();if(tech)pLines.push(`Needle / technique: ${tech}.`);
  let rs=RESP.find(r=>r.k===S.resp),respTxt=S.resp==="custom"?$("respCustom").value.trim():(rs?rs.s:"");
  if(respTxt)pLines.push(`Patient tolerated injection well; ${respTxt}.`);
  if(S.attest.observe)pLines.push(ATTEST.find(a=>a.id==="observe").s);
  if(S.attest.education)pLines.push(ATTEST.find(a=>a.id==="education").s);
  const trace=traceabilityLine();if(trace)pLines.push(trace);
  if(next)pLines.push(`Next dose due ${fmtDate(next)}.`);
  const ordProv=$("orderingProvider")?.value.trim();if(ordProv)pLines.push(`Ordering provider: ${ordProv}.`);
  const admin=$("admin").value.trim();if(admin)pLines.push(`Administered by ${admin}.`);

  $("outPL").innerHTML=pLines.length?pLines.map(l=>l.startsWith("Medication details:")?`<p class="code">${esc(l)}</p>`:`<p>${esc(l)}</p>`).join(""):`<p class="empty">Set drug & site to build the Plan.</p>`;

  window._note={
    cc:med?ccHeadline+"\n\n"+ccBody:"",
    as:aLines.join("\n"),
    pl:pLines.join("\n")
  };
  renderInjSafetyChips();renderInjQa();renderSMS();renderAVS();renderCommandCenter();
}

/* ---------- After-Visit Summary ---------- */
function cleanPrintClasses(){document.body.classList.remove("print-avs","print-uds","print-uds-patient","print-sample","print-daily","print-letter","print-sample-worksheet","print-inj-worksheet");}
$("printAVS").addEventListener("click",()=>{
  if(!S.med){toast("Pick a drug first");return;}
  renderAVS();cleanPrintClasses();document.body.classList.add("print-avs");window.print();setTimeout(cleanPrintClasses,500);
});

function udsPrintStatusClass(){
  const inv=udsPanelsByState('invalid'),pos=udsPanelsByState('pos');
  if(UDS.control!=='valid'||inv.length||UDS.temp==='not acceptable')return 'danger';
  if(pos.length||UDS.validity==='needs review'||UDS.consistent==='not aligned'||UDS.consistent==='needs review')return 'warn';
  return 'ok';
}
function udsPrintStatusText(){
  const cls=udsPrintStatusClass();
  if(cls==='danger')return 'Do not interpret / review needed';
  if(cls==='warn')return 'Provider review requested';
  return 'No flagged findings';
}
function udsResultPill(panel){
  const state=UDS.results[panel]||'nt';
  return `<span class="rpill ${state}">${esc(panel)} ${esc(UDS_RESULT_SHORT[state])}</span>`;
}
function udsGroupPillHtml(){
  return UDS_GROUPS.map(group=>`<div class="group-line"><div class="group-title">${esc(group.l)}</div><div class="pillgrid">${group.panels.map(udsResultPill).join('')}</div></div>`).join('');
}
/* ---------- staff sign-in / autofill ---------- */
function getSignedStaff(){return (($('staffSignIn')&&$('staffSignIn').value)||'').trim();}
function updateStaffCurrent(){
  const s=getSignedStaff();
  if($('staffCurrent'))$('staffCurrent').textContent=s?`Signed in: ${s}`:'Not signed in';
}
function applyStaffToEncounter(force=false){
  const s=getSignedStaff();
  if(!s)return;
  if($('admin')&&(force||!$('admin').value.trim()))$('admin').value=s;
  if($('udsCollector')&&(force||!$('udsCollector').value.trim()))$('udsCollector').value=s;
  SAFE_STORAGE.set(STAFF_STORAGE_KEY,s);
  updateStaffCurrent();
  render();renderUdsNote();
}
function initStaffSignIn(){
  const inp=$('staffSignIn');
  if(!inp)return;
  const saved=getStoredStaff();
  if(saved){inp.value=saved;applyStaffToEncounter(false);}else updateStaffCurrent();
  inp.addEventListener('input',()=>{SAFE_STORAGE.set(STAFF_STORAGE_KEY,inp.value.trim());updateStaffCurrent();applyStaffToEncounter(false);});
  if($('staffApply'))$('staffApply').addEventListener('click',()=>{if(!getSignedStaff()){toast('Enter staff name first');return;}applyStaffToEncounter(true);toast('Staff applied');});
  if($('staffClear'))$('staffClear').addEventListener('click',()=>{inp.value='';SAFE_STORAGE.remove(STAFF_STORAGE_KEY);SAFE_STORAGE.remove(LEGACY_STAFF_STORAGE_KEY);updateStaffCurrent();toast('Staff sign-in cleared');});
}



/* ===================== PASS 12 OVERRIDES: print output refinement ===================== */
function shortPrintDate(){return new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function classicDash(v){return (v&&String(v).trim())?String(v).trim():'—';}
/* ===================== PASS 13 OVERRIDES: report redesign + signature toggle ===================== */
function udsIncludeSignatureFields(){
  const el=$('udsSigToggle');
  return !el || el.checked;
}
function initUdsReportOptions(){
  const el=$('udsSigToggle');
  if(!el)return;
  const saved=SAFE_STORAGE.get('ipmgUdsSignatureFields');
  if(saved!==null)el.checked=saved==='1';
  el.addEventListener('change',()=>{
    SAFE_STORAGE.set('ipmgUdsSignatureFields',el.checked?'1':'0');
    toast(el.checked?'Signature fields will print':'Signature fields hidden for e-send');
  });
}
function renderUdsReport(){
  renderUdsNote();
  const n=window._udsNote||{};
  const name=$('udsPtName').value.trim()||'—', dob=$('udsDOB').value.trim()||'—', collector=$('udsCollector').value.trim()||'—';
  const collection=udsCollectionDateText()||'—', reason=udsReasonObj().l, temp=udsTempObj().l;
  const device=$('udsDevice').value||'—', lot=$('udsLot').value.trim()||'—', exp=$('udsExp').value.trim()||'—';
  const pos=udsPanelsByState('pos'), inv=udsPanelsByState('invalid'), nt=udsPanelsByState('nt');
  const tested=UDS_PANELS.length-nt.length;
  const comment=$('udsComment').value.trim();
  const statusClass=udsPrintStatusClass();
  const attention=(n.attentionLines||udsClinicianAttentionText(pos,inv,nt));
  const attentionClass=statusClass==='danger'?'danger':statusClass==='warn'?'warn':'';
  const attentionHtml=attention.length?attention.slice(0,5).map(l=>`<li>${esc(l)}</li>`).join(''):'<li>No flagged findings documented by staff.</li>';
  const rowHtml=[];
  const cells=UDS_PANELS.map(panel=>{
    const state=UDS.results[panel]||'nt';
    return `<td class="lm-screen">${esc(panel)}<small>${esc(udsPanelName(panel))}</small></td><td><span class="lm-result ${state}">${esc(udsLabResultWord(state))}</span></td>`;
  });
  for(let i=0;i<cells.length;i+=2){rowHtml.push(`<tr>${cells[i]}${cells[i+1]||'<td></td><td></td>'}</tr>`);}
  const interpretation=statusClass==='danger'
    ? 'Invalid or non-interpretable finding documented. Do not use affected result(s) for clinical interpretation without repeat testing or confirmation per provider direction.'
    : statusClass==='warn'
      ? 'One or more findings require clinician review. Staff handoff is provided; final interpretation is deferred to the treating clinician.'
      : 'No preliminary positive or invalid findings documented among tested panels.';
  const context=(n.contextLines||[]).slice(0,3).map(l=>`<p>${esc(l)}</p>`).join('') || '<p>No additional staff context documented.</p>';
  const follow=(n.followLines||[]).slice(0,2).map(l=>`<p>${esc(l)}</p>`).join('');
  const photoBlock=UDS.photoData?`<div class="lm-photo"><img src="${UDS.photoData}" alt="Point-of-care cup photo" /></div>`:'<div class="lm-photo">No cup photo attached</div>';
  const signBlock=udsIncludeSignatureFields()
    ? `<div class="lm-sign"><div>Reviewed by / date</div><div>Follow-up or outside lab decision</div></div>`
    : `<div class="lm-esign">Signature fields omitted — report prepared for electronic routing/review.</div>`;
  $('udsSheet').innerHTML=`
    <div class="report-shell lab-modern">
      <div class="lm-head">
        <div class="lm-title">
          <div class="lm-facility">Inland Psychiatric Medical Group</div>
          <h1>Point-of-Care Urine Drug Screen Report</h1>
          <div class="lm-sub">Qualitative immunoassay screening · clinician copy · preliminary office screen, not confirmatory laboratory testing</div>
          <div class="lm-idline"><span><b>Report ID:</b> ${esc(udsReportId())}</span><span><b>Printed:</b> ${esc(new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}))}</span></div>
        </div>
        <div class="lm-statusbox">
          <div class="lm-status ${statusClass}">${esc(udsPrintStatusText())}</div>
          <div class="lm-metricgrid"><div class="lm-metric"><b>${tested}</b>tested</div><div class="lm-metric"><b>${pos.length}</b>prelim +</div><div class="lm-metric"><b>${inv.length}</b>invalid</div><div class="lm-metric"><b>${nt.length}</b>not tested</div></div>
        </div>
      </div>
      <div class="lm-card"><h2>Patient / specimen</h2><div class="lm-demo">
        <div><span>Patient</span><b>${esc(name)}</b></div><div><span>Date of birth</span><b>${esc(dob)}</b></div><div><span>Collection date/time</span><b>${esc(collection)}</b></div><div><span>Collected by</span><b>${esc(collector)}</b></div>
        <div><span>Reason</span><b>${esc(reason)}</b></div><div><span>Specimen</span><b>Urine</b></div><div><span>Temperature</span><b>${esc(temp)}</b></div><div><span>Device control</span><b>${esc(udsControlObj().l)}</b></div>
      </div></div>
      <div class="lm-card"><h2>Qualitative screening results</h2><table class="lm-results"><thead><tr><th>Screen</th><th>Result</th><th>Screen</th><th>Result</th></tr></thead><tbody>${rowHtml.join('')}</tbody></table></div>
      <div class="lm-two">
        <div>
          <div class="lm-card"><h2>Clinician attention</h2><div class="lm-attn ${attentionClass}"><ul>${attentionHtml}</ul></div></div>
          <div class="lm-card"><h2>Handoff / interpretation</h2><div class="lm-body"><p><b>Overall:</b> ${esc(interpretation)}</p>${context}${follow}${comment?`<p><b>Patient/staff comment:</b> ${esc(comment)}</p>`:''}</div></div>
        </div>
        <div>
          <div class="lm-card"><h2>Validity / traceability</h2><div class="lm-trace"><div><span>Device</span>${esc(device)}</div><div><span>Lot</span>${esc(lot)}</div><div><span>Expiration</span>${esc(exp)}</div><div><span>Operator</span>${esc(collector)}</div></div><div class="lm-body"><p><b>Validity markers:</b> ${esc(UDS.validity)}.</p>${photoBlock}</div></div>
          <div class="lm-card"><h2>Method & limitations</h2><div class="lm-body"><p>Point-of-care urine drug screen results are preliminary qualitative screening results. Cross-reactivity, prescribed medications, timing of last use, specimen quality, and device limitations may affect interpretation.</p><p>No final clinical interpretation is made by staff. Provider determines whether outside laboratory confirmation is clinically indicated.</p></div></div>
        </div>
      </div>
      <div class="lm-footer">This report is intended for clinician review as a point-of-care screening handoff. It is not a confirmatory laboratory report and should be interpreted in clinical context.${signBlock}</div>
    </div>`;
}
/* ===================== PASS 14 OVERRIDES: patient-friendly print layouts ===================== */

function injectionCarePlan(med){
  const key=med&&med.key;
  const base={
    expect:['Mild soreness, redness, or a small firm lump can be normal for a few days.','You may apply a cool pack. Avoid rubbing or massaging the area.'],
    reminders:['Keep taking your medicines exactly as prescribed unless your provider gives different instructions.'],
    call:['Severe or worsening pain, swelling, warmth, drainage, or a rapidly growing lump at the injection site.','Fever, rash, hives, trouble breathing, or swelling of the face, lips, or throat.','Any reaction or symptom that worries you.'],
    note:'Please keep your next injection appointment so your medication stays on schedule.'
  };
  const antipsychoticWarn=['New or worsening restlessness, shakiness, stiffness, unusual movements, severe sleepiness, confusion, or high fever.'];
  const oralReminder='If your provider gave you an oral medication overlap plan, continue it exactly as directed.';
  const plans={
    vivitrol:{
      expect:base.expect,
      reminders:['Do not use opioids while this medicine is active. Opioids may not work normally and can become dangerous.','Tell any outside clinician, dentist, or emergency department that you receive Vivitrol/naltrexone.','Carry your Vivitrol wallet card if you were given one.'],
      call:['Any opioid use, opioid craving, or symptoms of withdrawal.','Severe belly pain, yellowing of the skin/eyes, dark urine, or unusual tiredness.'].concat(base.call),
      note:'This injection blocks opioid effects. Your provider should review any pain-treatment plan before opioids are used.'
    },
    uzedy:{
      expect:['A small bump, itching, redness, or tenderness under the skin can happen after a subcutaneous injection.','Do not rub or massage the area. Avoid tight clothing over the site if it is irritated.'],
      reminders:['Keep taking your medicines exactly as prescribed unless your provider gives different instructions.'],
      call:antipsychoticWarn.concat(['Severe redness, warmth, swelling, drainage, or worsening pain at the injection site.']),
      note:'This medication is given under the skin; rotate sites as directed by your care team.'
    },
    aristada:{reminders:[oralReminder,'Keep taking medicines exactly as prescribed unless your provider gives different instructions.'],call:antipsychoticWarn.concat(base.call),note:'Report unusual movements, stiffness, restlessness, high fever, or severe sleepiness promptly.'},
    initio:{reminders:[oralReminder,'This is an initiation dose; continue the follow-up injection plan exactly as directed.'],call:antipsychoticWarn.concat(base.call),note:'This medication is part of a start-up plan. Keep the next scheduled injection/medication instructions.'},
    maintena:{reminders:[oralReminder,'Keep taking medicines exactly as prescribed unless your provider gives different instructions.'],call:antipsychoticWarn.concat(base.call),note:'Continue any oral overlap or medication plan exactly as your provider instructed.'},
    asimtufii:{expect:['Mild soreness, pressure, redness, or a small firm area at the gluteal injection site can happen for a few days.','Do not rub or massage the injection site. You may use a cool pack if the area is sore.'],reminders:[oralReminder,'This medication is usually given every 2 months. Keep the next appointment window so your treatment stays on schedule.','Keep taking medicines exactly as prescribed unless your provider gives different instructions.'],call:antipsychoticWarn.concat(['Severe or worsening pain, swelling, warmth, drainage, or a rapidly growing lump at the injection site.']),note:'Because this medication lasts about 2 months, call early if you need to reschedule.'},
    sustenna:{reminders:['Keep taking medicines exactly as prescribed unless your provider gives different instructions.','If you are in an initiation schedule, keep the next injection date exactly as instructed.'],call:antipsychoticWarn.concat(base.call),note:'If this is part of a start-up series, the next dose timing is especially important.'},
    erzofri:{reminders:['Keep your monthly injection appointment so your medicine stays on schedule.','Keep taking medicines exactly as prescribed unless your provider gives different instructions.','If this was a start-up dose, the next monthly injection timing is important.'],call:antipsychoticWarn.concat(base.call),note:'This is a once-monthly paliperidone injection. Call early if you need to reschedule.'},
    trinza:{reminders:['This medication is longer acting. Please keep your future injection window so your treatment stays on schedule.','Keep taking medicines exactly as prescribed unless your provider gives different instructions.'],call:antipsychoticWarn.concat(base.call),note:'Because this is a longer-acting injection, call early if you need to reschedule.'},
    hafyera:{reminders:['This medication is longer acting. Please keep your future injection window so your treatment stays on schedule.','Keep taking medicines exactly as prescribed unless your provider gives different instructions.'],call:antipsychoticWarn.concat(base.call),note:'Because this is a longer-acting injection, call early if you need to reschedule.'},
    haldol:{reminders:['Keep taking medicines exactly as prescribed unless your provider gives different instructions.'],call:antipsychoticWarn.concat(['New muscle spasms, trouble swallowing, or uncontrolled eye/neck movements.']).concat(base.call),note:'Report stiffness, tremor, restlessness, unusual movements, or severe sleepiness.'},
    prolixin:{reminders:['Keep taking medicines exactly as prescribed unless your provider gives different instructions.'],call:antipsychoticWarn.concat(['New muscle spasms, trouble swallowing, or uncontrolled eye/neck movements.']).concat(base.call),note:'Report stiffness, tremor, restlessness, unusual movements, or severe sleepiness.'}
  };
  const p=plans[key]||{};
  return {
    expect:p.expect||base.expect,
    reminders:p.reminders||base.reminders,
    call:p.call||base.call,
    note:p.note||base.note
  };
}
function medFriendlyName(med){
  if(!med)return 'your injection';
  if(med.key==='vivitrol')return 'Vivitrol / naltrexone';
  if(med.key==='erzofri')return 'Erzofri / paliperidone';
  if(med.key==='asimtufii')return 'Abilify Asimtufii / aripiprazole';
  return med.name||med.label||'your injection';
}
function renderListItems(items){return (items||[]).map(x=>`<li>${esc(x)}</li>`).join('');}

function patientRouteLabel(route){
  if(route==='IM')return 'Intramuscular injection';
  if(route==='SubQ')return 'Subcutaneous injection';
  return route?route+' injection':'Injection';
}
function patientSiteLabel(site){
  if(!site)return '';
  return site.replace(/^R\s+/i,'right ').replace(/^L\s+/i,'left ').replace(/SubQ/g,'subcutaneous');
}
function injectionSiteSpecificCare(route, site){
  const s=(site||'').toLowerCase(), r=(route||'').toLowerCase();
  if(r==='subq' || s.includes('abdomen') || s.includes('subcutaneous')){
    return ['A small lump, redness, itching, or tenderness under the skin can happen.','Do not rub or massage the area. Avoid tight clothing over the site if it feels irritated.','Let staff know at your next visit if the area stayed painful, warm, swollen, or bothersome.'];
  }
  if(s.includes('deltoid') || s.includes('arm')){
    return ['Arm soreness can happen after a deltoid injection.','Use the arm normally, but avoid heavy upper-body strain if it is uncomfortable today.','Do not rub or massage the injection site.'];
  }
  if(s.includes('glut') || s.includes('ventro') || s.includes('dorso')){
    return ['Soreness with sitting or walking can happen after a gluteal injection.','Do not rub or massage the injection site.','Call if pain, swelling, warmth, drainage, or a rapidly growing lump develops.'];
  }
  return ['Mild soreness, redness, or a small firm area can happen for a few days.','Do not rub or massage the injection site unless your provider gives different instructions.','Let the clinic know if the site reaction worsens instead of improving.'];
}
function injectionHowItWorksLine(med){
  if(!med)return 'This is a long-acting injection. Keeping the next appointment helps your treatment stay consistent.';
  const k=med.key||'';
  if(k==='vivitrol')return 'This medication lasts over time and blocks opioid effects. Your provider should review pain-treatment plans before opioids are used.';
  if(['hafyera','trinza','asimtufii'].includes(k))return 'This is a longer-acting injection. Staying within the next-dose window is important because the medication continues releasing over time.';
  if(['sustenna','erzofri','aristada','initio','maintena','uzedy','haldol','prolixin'].includes(k))return 'This medication is long-acting and continues releasing over time. Your next injection keeps the treatment schedule consistent.';
  return 'This is a long-acting injection. Keeping the next appointment helps your treatment stay consistent.';
}
/* ---------- copy / toast ---------- */
function toast(m){const t=$("toast");$("toastMsg").textContent=m;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),1600);}
function copy(text,label){if(!text){toast("Nothing to copy yet");return;}navigator.clipboard.writeText(text).then(()=>toast(label+" copied")).catch(()=>{const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();toast(label+" copied");});}
document.querySelectorAll(".cp[data-copy]").forEach(b=>b.addEventListener("click",()=>{const n=window._note||{},k=b.dataset.copy;copy(k==="cc"?n.cc:k==="as"?n.as:n.pl,k==="cc"?"CC":k==="as"?"Assessment":"Plan");}));
$("copyAll").addEventListener("click",()=>{const n=window._note||{};if(!n.cc){toast("Build the note first");return;}copy([n.cc,n.as,n.pl].filter(Boolean).join("\n\n────────────────────────────────\n\n"),"Tebra section blocks");});
document.querySelectorAll(".cp[data-udscopy]").forEach(b=>b.addEventListener("click",()=>{const n=window._udsNote||{},k=b.dataset.udscopy;copy(k==="cc"?n.cc:k==="as"?n.as:n.pl,k==="cc"?"UDS thumbnail":k==="as"?"UDS handoff":"UDS follow-up");}));
$("udsCopyAll").addEventListener("click",()=>{const n=window._udsNote||{};if(!n.cc){toast("Build the UDS note first");return;}copy(n.tebra||[n.cc,n.as,n.pl].filter(Boolean).join("\n\n"),"Tebra UDS note");});
if($("udsUsePatient"))$("udsUsePatient").addEventListener("click",()=>{$("udsPtName").value=$("ptName").value||$("samplePtName").value||"";$("udsDOB").value=$("ptDOB").value||$("sampleDOB").value||"";renderUdsNote();toast("Current patient copied into UDS");});
if($("udsUseStaff"))$("udsUseStaff").addEventListener("click",()=>{applyStaffToEncounter(true);toast(getStoredStaff()?"Signed-in staff applied":"No signed-in staff saved");});
if($("udsAllNeg"))$("udsAllNeg").addEventListener("click",()=>setAllUdsResults("neg"));
if($("udsAllNt"))$("udsAllNt").addEventListener("click",()=>setAllUdsResults("nt"));
if($("udsThcPos"))$("udsThcPos").addEventListener("click",()=>{UDS_PANELS.forEach(p=>UDS.results[p]=p==="THC"?"pos":"neg");renderUdsResults();renderUdsNote();});
if($("udsClearFlags"))$("udsClearFlags").addEventListener("click",clearUdsFlags);
$("printUdsReport").addEventListener("click",()=>{renderUdsReport();cleanPrintClasses();document.body.classList.add("print-uds");window.print();setTimeout(cleanPrintClasses,500);});
$("printUdsPatient").addEventListener("click",()=>{renderUdsPatientSummary();cleanPrintClasses();document.body.classList.add("print-uds-patient");window.print();setTimeout(cleanPrintClasses,500);});
$("resetBtn").addEventListener("click",()=>{if(confirm("Clear the current note? (Your session log is kept)")) softReset();});
$("udsReset").addEventListener("click",()=>{if(confirm("Clear the current UDS note?")) softResetUds();});

function softReset(){
  S.med=null;S.dose="";S.flags={};S.guard={};S.reason="scheduled";S.resp="well";S.retCustom=false;
  ATTEST.forEach(a=>S.attest[a.id]=!a.off&&a.id!=="prior");
  ["ptName","ptDOB","orderingProvider","injOrderPurpose","tech","ndc","lot","exp","injProductSource","injProductSourceOther","injPreparation","injPreparationDetail","injWasteAmount","injWasteWitness","injProductIssueDetail","injProductIssueAction","injProductIssueRecipient","injProductIssueNotificationTime","injProductIssueDirection","injProductIssueNextStep","bp","hr","temp","rr","spo2","vitalRepeatNote","admin","respCustom","injAdminTime","injSecondAdminTime","injVolume","injVolumeUnit","injDevice","injDeviceOther","injSiteCondition","injSiteConditionDetail","injExceptionSummary","injExceptionRecipient","injExceptionTime","injExceptionOutcome","nextDate","priorDose","priorSite"].forEach(id=>{if($(id))$(id).value="";});
  ["injWasteToggle","injProductIssueToggle","injExceptionToggle"].forEach(id=>{if($(id))$(id).checked=false;});
  try{if(typeof window.resetSmartVitalsState==='function')window.resetSmartVitalsState();}catch(e){}
  $("allergies").value="";$("adminDate").value=localDateValue();
  try{const flow=window.__IPMG_RC530__;if(flow){flow.safetyNone=false;flow.inj={};flow.manualOpen.inj={};}}catch(e){}
  $("medHdr").classList.remove("show");$("medChipsGrp").classList.remove("hidden");
  $("medDetail").classList.add("hidden");$("medSpecWrap").classList.remove("show");$("medTip").classList.remove("show");
  $("respCustomWrap").classList.add("hidden");$("smsWrap").classList.remove("show");
  renderReasons();renderMeds();renderAtt();renderResp();recalcNext();applyStaffToEncounter(false);render();toast("Note cleared");
}


/* ---------- oral sample dispensing handout maker ---------- */
const SAMPLE_MEDS=[
  {key:"trintellix",label:"Trintellix",generic:"vortioxetine",className:"antidepressant",strengths:["5 mg tablet","10 mg tablet","20 mg tablet"],defaultSig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",food:"with or without food",purpose:"Medication sample start",sigOptions:[
    {label:"5 mg start",strength:"5 mg tablet",qty:"7–14 tablets or sample card",sig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",titration:"Use the strength and duration selected by the prescriber. Do not change dose unless instructed."},
    {label:"10 mg daily",strength:"10 mg tablet",qty:"7–14 tablets or sample card",sig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food."},
    {label:"20 mg daily",strength:"20 mg tablet",qty:"7–14 tablets or sample card",sig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food."}
  ],watch:["Nausea or stomach upset can happen when starting.","Call the clinic right away for new or worsening mood changes, suicidal thoughts, agitation, or unusual behavior.","Tell the prescriber if taking other antidepressants, migraine medicines, blood thinners, or NSAIDs."],reminders:["Do not change the dose or stop unless the prescriber tells you.","It may take time to notice the full benefit."]},
  {key:"austedo",label:"Austedo / Austedo XR",generic:"deutetrabenazine",className:"VMAT2 inhibitor",strengths:["6 mg tablet","9 mg tablet","12 mg tablet","24 mg XR tablet","Starter / titration pack"],defaultSig:"Take exactly as prescribed. Swallow tablets whole.",food:"with food",purpose:"Titration / starter pack",sigOptions:[
    {label:"Starter/titration pack",strength:"Starter / titration pack",qty:"starter pack",sig:"Take exactly as directed on the prescriber’s titration schedule. Swallow tablets whole.",titration:"Document the prescriber schedule here before printing, including dose changes and timing."},
    {label:"Austedo BID",strength:"6 mg / 9 mg / 12 mg tablet",qty:"sample card",sig:"Take by mouth exactly as prescribed with food. Follow the written titration schedule.",titration:"Usually titration-sensitive. Confirm exact morning/evening instructions with prescriber."},
    {label:"Austedo XR daily",strength:"Austedo XR tablet",qty:"sample card",sig:"Take by mouth once daily with food as prescribed. Swallow whole.",titration:"Confirm the exact XR strength and titration schedule before dispensing."}
  ],watch:["May cause sleepiness, fatigue, restlessness, or mood changes.","Call the clinic for new or worsening depression, suicidal thoughts, severe restlessness, stiffness, or trouble swallowing.","Avoid driving or risky activities until you know how it affects you."],reminders:["Follow the prescriber’s titration schedule carefully.","Do not crush, chew, or break tablets."]},
  {key:"ingrezza",label:"Ingrezza",generic:"valbenazine",className:"VMAT2 inhibitor",strengths:["40 mg capsule","60 mg capsule","80 mg capsule","Starter pack"],defaultSig:"Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",food:"with or without food",purpose:"Medication sample start",sigOptions:[
    {label:"40 mg start",strength:"40 mg capsule",qty:"7–14 capsules or starter pack",sig:"Take 1 capsule by mouth once daily as prescribed. May be taken with or without food."},
    {label:"80 mg target",strength:"80 mg capsule",qty:"7–14 capsules or sample card",sig:"Take 1 capsule by mouth once daily as prescribed. May be taken with or without food."},
    {label:"Starter pack",strength:"Starter pack",qty:"starter pack",sig:"Take exactly as directed by the prescriber on the starter schedule. May be taken with or without food.",titration:"Confirm which capsules are used on each day/week before dispensing."}
  ],watch:["May cause sleepiness or tiredness.","Call the clinic for severe sleepiness, fainting, fast/irregular heartbeat, allergic reaction, or unusual mood changes.","Avoid driving or risky activities until you know how it affects you."],reminders:["Take at the same time each day.","Do not change dose unless the prescriber tells you."]},
  {key:"aplenzin",label:"Aplenzin",generic:"bupropion hydrobromide ER",className:"antidepressant",strengths:["174 mg ER tablet","348 mg ER tablet","522 mg ER tablet"],defaultSig:"Take 1 tablet by mouth once daily in the morning as prescribed. Swallow whole.",food:"with or without food",purpose:"Medication sample start",sigOptions:[
    {label:"174 mg start",strength:"174 mg ER tablet",qty:"7–14 tablets or sample card",sig:"Take 1 tablet by mouth once daily in the morning as prescribed. Swallow whole."},
    {label:"348 mg daily",strength:"348 mg ER tablet",qty:"7–14 tablets or sample card",sig:"Take 1 tablet by mouth once daily in the morning as prescribed. Swallow whole."},
    {label:"522 mg daily",strength:"522 mg ER tablet",qty:"7–14 tablets or sample card",sig:"Take 1 tablet by mouth once daily in the morning as prescribed. Swallow whole."}
  ],watch:["May cause insomnia, dry mouth, headache, or anxiety when starting.","Call the clinic right away for seizure, severe allergic reaction, very high blood pressure symptoms, or new/worsening mood changes.","Avoid taking late in the day unless instructed."],reminders:["Do not crush, split, or chew extended-release tablets.","Avoid combining with other bupropion products unless the prescriber instructed it."]},
  {key:"auvelity",label:"Auvelity",generic:"dextromethorphan HBr / bupropion HCl ER",className:"antidepressant / NMDA antagonist",strengths:["45 mg/105 mg ER tablet","30 mg/105 mg ER tablet","Sample titration pack"],defaultSig:"Take 1 tablet by mouth each morning for 3 days. Starting day 4, take 1 tablet twice daily at least 8 hours apart if prescriber instructed. Swallow whole.",food:"with or without food",purpose:"Titration / starter pack",guard:"Confirm no duplicate bupropion product, seizure-risk concern, MAOI use, or prescriber restriction before dispensing.",sigOptions:[
    {label:"MDD starter 45/105",strength:"45 mg/105 mg ER tablet",qty:"starter card or 7–14 tablets",sig:"Take 1 tablet by mouth each morning for 3 days. Starting day 4, take 1 tablet twice daily at least 8 hours apart if prescriber instructed. Swallow whole.",titration:"Do not take more than 2 tablets in 24 hours. Do not crush, chew, split, or divide."},
    {label:"Once-daily 45/105",strength:"45 mg/105 mg ER tablet",qty:"7–14 tablets or sample card",sig:"Take 1 tablet by mouth each morning as prescribed. Swallow whole.",titration:"Use once-daily schedule only when selected by prescriber; do not increase unless instructed."},
    {label:"Sample titration pack",strength:"30 mg/105 mg + 45 mg/105 mg titration pack",qty:"sample titration pack",sig:"Use the sample titration pack exactly as directed by the prescriber. Take doses at least 8 hours apart when taking twice daily. Swallow tablets whole.",titration:"Write the prescriber’s day-by-day schedule here before printing."}
  ],watch:["Call right away for seizure, severe allergic reaction, confusion, hallucinations, very high blood pressure symptoms, or new/worsening mood changes.","Tell the clinic/pharmacist about other bupropion products, antidepressants, migraine medicines, MAOIs, cough/cold medicines, or seizure history.","Avoid taking extra doses if a dose is missed."],reminders:["Swallow tablets whole. Do not crush, chew, split, or divide.","Do not take more than 2 tablets in 24 hours.","Avoid duplicate bupropion products unless the prescriber specifically instructed it."]},
  {key:"vraylar",label:"Vraylar",generic:"cariprazine",className:"atypical antipsychotic",strengths:["1.5 mg capsule","3 mg capsule","4.5 mg capsule","6 mg capsule","Starter pack"],defaultSig:"Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",food:"with or without food",purpose:"Titration / starter pack",sigOptions:[
    {label:"1.5 mg start",strength:"1.5 mg capsule",qty:"7–14 capsules or starter pack",sig:"Take 1 capsule by mouth once daily as prescribed. May be taken with or without food."},
    {label:"3 mg daily",strength:"3 mg capsule",qty:"7–14 capsules or sample card",sig:"Take 1 capsule by mouth once daily as prescribed. May be taken with or without food."},
    {label:"Starter pack",strength:"Starter pack",qty:"starter pack",sig:"Follow the prescriber’s starter pack schedule exactly. Take once daily as directed, with or without food.",titration:"Document the selected titration schedule before dispensing."},
    {label:"1.5 mg → 3 mg",strength:"1.5 mg capsule",qty:"per prescriber (see titration)",sig:"Take 1 capsule by mouth once daily, then follow the prescriber’s next-step instructions.",titration:"Timing is indication-specific per PI: schizophrenia or bipolar mania — increase to 3 mg on Day 2 if tolerated; bipolar depression (adjunctive) — increase to 3 mg on Day 15. Confirm the treated indication and exact day with the prescriber before dispensing.",multiDose:[{strength:"Vraylar 3 mg capsule",qty:"per prescriber",sig:"Then take 1 capsule by mouth once daily as directed by the prescriber."}]}
  ],watch:["Call for severe restlessness, stiffness, tremor, fever/confusion, fainting, or uncontrolled movements.","May cause sleepiness, dizziness, nausea, or restlessness.","Dose changes may take several weeks to fully show effect."],reminders:["Take at the same time each day.","Do not increase dose faster than the prescriber instructed."]},
  {key:"caplyta",label:"Caplyta",generic:"lumateperone",className:"atypical antipsychotic",strengths:["42 mg capsule","21 mg capsule","10.5 mg capsule"],defaultSig:"Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",food:"with or without food",purpose:"Medication sample start",guard:"Standard adult dose is usually 42 mg once daily; lower strengths are used for specific interaction or hepatic-impairment situations per prescriber.",sigOptions:[
    {label:"42 mg daily",strength:"42 mg capsule",qty:"7–14 capsules or sample card",sig:"Take 1 capsule by mouth once daily as prescribed. May be taken with or without food."},
    {label:"21 mg daily",strength:"21 mg capsule",qty:"7–14 capsules or sample card",sig:"Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",titration:"Use this lower-strength option only when selected by the prescriber."},
    {label:"10.5 mg daily",strength:"10.5 mg capsule",qty:"7–14 capsules or sample card",sig:"Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",titration:"Use this reduced-dose option only when selected by the prescriber."}
  ],watch:["May cause sleepiness, dizziness, nausea, dry mouth, or diarrhea.","Call the clinic right away for fever/confusion/stiffness, uncontrolled movements, fainting, severe allergic reaction, or new/worsening mood changes.","Avoid driving or risky activities until you know how it affects you."],reminders:["Take once daily at the time of day chosen by the prescriber.","Dose titration is generally not needed unless the prescriber gives special instructions."]},
  {key:"cobenfy",label:"Cobenfy",generic:"xanomeline / trospium chloride",className:"muscarinic agonist / anticholinergic combination",strengths:["50 mg/20 mg capsule","100 mg/20 mg capsule","125 mg/30 mg capsule","Starter / titration pack"],defaultSig:"Take 1 capsule by mouth twice daily as prescribed on an empty stomach: at least 1 hour before food or at least 2 hours after food. Do not open capsules.",food:"empty stomach",purpose:"Titration / starter pack",guard:"Provider/order verification required before dispensing: active adult-schizophrenia plan; baseline liver enzymes/bilirubin and heart rate assessed; current-PI renal/hepatic, urinary-retention, gastric-retention, and narrow-angle-glaucoma considerations reviewed.",sigOptions:[
    {label:"Starter 50/20 BID",strength:"50 mg/20 mg capsule",qty:"starter pack or sample card",sig:"Take 1 capsule by mouth twice daily on an empty stomach: at least 1 hour before food or at least 2 hours after food. Do not open capsules.",titration:"PI: 50 mg/20 mg BID for ≥ 2 days, then 100 mg/20 mg BID for ≥ 5 days, then may increase to 125 mg/30 mg BID based on tolerability. Geriatric patients: start 50 mg/20 mg BID, consider slower titration, max 100 mg/20 mg BID. Confirm the exact schedule with the prescriber before dispensing."},
    {label:"100/20 BID",strength:"100 mg/20 mg capsule",qty:"sample card",sig:"Take 1 capsule by mouth twice daily on an empty stomach as prescribed. Do not open capsules."},
    {label:"125/30 BID",strength:"125 mg/30 mg capsule",qty:"sample card",sig:"Take 1 capsule by mouth twice daily on an empty stomach as prescribed. Do not open capsules."}
  ],watch:["Common issues may include nausea, constipation, dry mouth, indigestion, or dizziness.","Call the clinic for trouble urinating, severe constipation, fainting, fast heart rate, severe stomach pain, yellowing skin/eyes, or dark urine.","Tell the prescriber about liver, kidney, urinary, or stomach-emptying problems."],reminders:["Take exactly on the titration schedule provided by the prescriber.","Do not open, crush, or chew capsules."]},
  {key:"fanapt",label:"Fanapt",generic:"iloperidone",className:"atypical antipsychotic",strengths:["1 mg tablet","2 mg tablet","4 mg tablet","6 mg tablet","8 mg tablet","10 mg tablet","12 mg tablet","Titration pack"],defaultSig:"Take by mouth twice daily as prescribed. Follow the titration schedule carefully.",food:"with or without food",purpose:"Titration / starter pack",guard:"Provider/order verification required before dispensing or restart: indication, current titration plan, QT-risk/interaction review, and any CYP2D6/CYP3A4 dose-adjustment plan verified.",sigOptions:[
    {label:"Titration pack",strength:"Titration pack",qty:"titration pack",sig:"Follow the prescriber’s Fanapt titration pack schedule exactly. Take twice daily as directed.",titration:"Document the prescriber’s titration schedule here before printing. If FANAPT has been stopped for more than 3 days, confirm the prescriber’s re-initiation titration plan before restarting."},
    {label:"Titration strength",strength:"1 mg / 2 mg tablets",qty:"sample card",sig:"Take by mouth twice daily as prescribed. Follow the written titration schedule."},
    {label:"Maintenance strength",strength:"6 mg / 8 mg / 10 mg / 12 mg tablet",qty:"sample card",sig:"Take 1 tablet by mouth twice daily as prescribed."}
  ],watch:["May cause dizziness or lightheadedness, especially when standing during titration.","Call for fainting, racing/irregular heartbeat, severe dizziness, fever/confusion/stiffness, or uncontrolled movements.","Stand up slowly until you know how it affects you."],reminders:["Fanapt usually requires gradual titration before reaching the target dose.","If FANAPT has been stopped for more than 3 days, confirm the prescriber’s re-initiation titration plan before restarting." ]},
  {key:"lybalvi",label:"Lybalvi",generic:"olanzapine / samidorphan",className:"atypical antipsychotic with opioid antagonist",strengths:["5 mg/10 mg tablet","10 mg/10 mg tablet","15 mg/10 mg tablet","20 mg/10 mg tablet"],defaultSig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",food:"with or without food",purpose:"Medication sample start",guard:"Opioid safety check required: Lybalvi must not be used with opioids or during acute opioid withdrawal. Prescriber should confirm opioid-free status before start.",sigOptions:[
    {label:"5/10 sensitive start",strength:"5 mg/10 mg tablet",qty:"7–14 tablets or sample card",sig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",titration:"Lower starting option. Confirm opioid-free status and prescriber plan before dispensing."},
    {label:"10/10 start",strength:"10 mg/10 mg tablet",qty:"7–14 tablets or sample card",sig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",titration:"Confirm opioid-free status and prescriber plan before dispensing."},
    {label:"15/10 start",strength:"15 mg/10 mg tablet",qty:"7–14 tablets or sample card",sig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",titration:"Often used when prescriber selects higher starting dose. Confirm opioid-free status before dispensing."},
    {label:"20/10 daily",strength:"20 mg/10 mg tablet",qty:"7–14 tablets or sample card",sig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",titration:"Target/highest listed strength. Use only if prescriber selected this strength."}
  ],watch:["Do not take with opioid pain medicines, opioid cough medicines, or opioid withdrawal treatment unless prescriber specifically reviewed it.","Call right away for severe sleepiness, dizziness/fainting, confusion, fever/stiffness, uncontrolled movements, or allergic reaction.","Tell providers and emergency clinicians that this medication contains an opioid-blocking component."],reminders:["Be honest with the prescriber about any opioid use before starting.","Take once daily as prescribed; do not change dose unless instructed.","May cause sleepiness, dizziness, weight/metabolic changes, or dry mouth."]},
  {key:"rexulti",label:"Rexulti",generic:"brexpiprazole",className:"atypical antipsychotic",strengths:["0.25 mg tablet","0.5 mg tablet","1 mg tablet","2 mg tablet","3 mg tablet","4 mg tablet","Starter pack"],defaultSig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",food:"with or without food",purpose:"Titration / starter pack",guard:"Provider/order verification required: indication-specific active dose and current renal/hepatic/CYP adjustment plan verified. REXULTI is not PRN for agitation associated with dementia due to Alzheimer's disease.",sigOptions:[
    {label:"0.25 mg start",strength:"0.25 mg tablet",qty:"7–14 tablets or starter pack",sig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",titration:"Use only when it matches the active provider plan/PI adjustment."},
    {label:"0.5–1 mg titration",strength:"0.5 mg / 1 mg tablet",qty:"starter pack or sample card",sig:"Take 1 tablet by mouth once daily as prescribed. Follow the written titration schedule."},
    {label:"Provider-selected 2–4 mg",strength:"2 mg / 3 mg / 4 mg tablet",qty:"sample card",sig:"Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",titration:"Confirm indication and active order; 4 mg is schizophrenia dosing, while MDD adjunctive therapy and agitation associated with dementia due to Alzheimer's disease are capped at 3 mg/day."}
  ],watch:["May cause sleepiness, restlessness, weight/metabolic changes, or dizziness.","Call for severe restlessness, uncontrolled movements, fever/confusion/stiffness, fainting, or new/worsening mood changes.","Tell the clinic about new or increased urges to gamble, shop, eat, or have sex.","Avoid driving or risky activities until you know how it affects you."],reminders:["Follow the prescriber’s titration schedule.","Do not change dose unless instructed."]},
  {key:"other",label:"Other",generic:"",className:"manual entry",strengths:[""],defaultSig:"Take exactly as prescribed by your provider.",food:"custom",purpose:"Medication sample start",sigOptions:[
    {label:"Manual directions",strength:"",qty:"",sig:"Take exactly as prescribed by your provider.",titration:"Enter the prescriber’s complete directions before printing."}
  ],watch:["Call the clinic or pharmacist with questions about side effects or how to take this medication."],reminders:["Follow the written prescriber instructions on this handout."]}
]

const SAMPLE_INTENTS=[
  {value:"Medication sample start",label:"Start medication",note:"This sample is intended to help you start the medication exactly as your prescriber directed."},
  {value:"Titration / starter pack",label:"Titration / starter",note:"This sample includes step-by-step dosing. Follow the sequence written by your prescriber."},
  {value:"Bridge until pharmacy fill",label:"Bridge to pharmacy",note:"This sample is intended to help cover you while the pharmacy prescription is being processed."},
  {value:"Dose change sample",label:"Dose change",note:"This sample supports a dose change. Use only the strength and schedule your prescriber directed."},
  {value:"Tolerability trial",label:"Tolerability trial",note:"This sample is intended as a short trial so your provider can see how you tolerate the medication."},
  {value:"Continuation sample",label:"Continuation",note:"This sample is intended to help you continue treatment while follow-up medication access is arranged."}
];
const SAMPLE_STATE={med:null};
function sampleMed(){return SAMPLE_STATE.med||SAMPLE_MEDS[0];}

function sampleIntentObj(){
  const v=$('samplePurpose')?.value||'';
  return SAMPLE_INTENTS.find(x=>x.value===v)||SAMPLE_INTENTS[0];
}
function renderSampleIntentChips(){
  const box=$('sampleIntentChips'); if(!box)return;
  const cur=$('samplePurpose')?.value||'';
  box.innerHTML=SAMPLE_INTENTS.map((x,i)=>`<button type="button" class="sample-intent-chip ${x.value===cur?'on':''}" data-intent="${i}">${esc(x.label)}</button>`).join('');
  box.querySelectorAll('[data-intent]').forEach(btn=>btn.addEventListener('click',()=>{
    const opt=SAMPLE_INTENTS[Number(btn.dataset.intent)]; if(!opt)return;
    $('samplePurpose').value=opt.value;
    renderSampleIntentChips(); renderSampleHandout(); toast('Prescriber intent set');
  }));
}
function pluralizeLastWord(text,count){
  if(count===1)return text;
  return String(text||'').replace(/\b(box|card|kit|pack|bottle|package|supply|tablet|capsule)\b(?!.*\b(box|card|kit|pack|bottle|package|supply|tablet|capsule)\b)/i,(m)=>{
    const lower=m.toLowerCase();
    const map={box:'boxes',card:'cards',kit:'kits',pack:'packs',bottle:'bottles',package:'packages',supply:'supplies',tablet:'tablets',capsule:'capsules'};
    const out=map[lower]||m+'s'; return m[0]===m[0].toUpperCase()?out.charAt(0).toUpperCase()+out.slice(1):out;
  });
}
function formatPackageFromCurrent(count){
  const raw=($('sampleQty')?.value||'').trim();
  if(!raw){
    const first=(samplePackageOptions()[0]||{}).value||'1 sample package';
    $('sampleQty').value=first;
    return formatPackageFromCurrent(count);
  }
  const slash=raw.match(/^\s*(\d+)\s+(.+?)\s*\/\s*(\d+)\s+([A-Za-z][A-Za-z\s-]*)\s*$/);
  if(slash){
    const oldCount=parseInt(slash[1],10)||1, left=slash[2], per=parseInt(slash[3],10)||0, unit=slash[4].trim();
    const baseEach=per/oldCount || per || 0;
    const total=Math.round(baseEach*count);
    return `${count} ${pluralizeLastWord(left,count)} / ${total} ${pluralizeLastWord(unit,total)}`;
  }
  const simple=raw.match(/^\s*(\d+)\s+(.+)$/);
  if(simple){return `${count} ${pluralizeLastWord(simple[2],count)}`;}
  return `${count} ${pluralizeLastWord(raw,count)}`;
}
function currentPackageCount(){
  const m=(($('sampleQty')?.value||'').trim()).match(/^\s*(\d+)/);
  return m?Math.max(1,parseInt(m[1],10)||1):1;
}
function changeSamplePackage(delta){
  const next=Math.max(1,currentPackageCount()+delta);
  $('sampleQty').value=formatPackageFromCurrent(next);
  renderSamplePackageMeta(); renderSampleHandout();
}
function renderSamplePackageMeta(){
  const box=$('sampleQtyMeta'); if(!box)return;
  const raw=($('sampleQty')?.value||'').trim();
  const slash=raw.match(/^\s*(\d+)\s+(.+?)\s*\/\s*(\d+)\s+([A-Za-z][A-Za-z\s-]*)\s*$/);
  if(slash){box.textContent=`Package-aware: ${slash[1]} package item(s), ${slash[3]} ${slash[4].trim()} total documented.`;return;}
  box.textContent=raw?'Package documented. Use +/- if this package starts with a count.':'Tap a physical package below; use +/- only after selecting a package.';
}
function addSameSampleStrength(){
  const strength=($('sampleMedLabel')?.value||'').trim()||sampleMed().label;
  const qty=($('sampleQty')?.value||'').trim();
  const sig=sampleSigText();
  addSampleDoseRow({strength,qty,sig});
  toast('Current package added to samples list');
}
function sampleFoodText(){
  const v=$("sampleFood").value;
  if(v==="auto")return sampleMed().food||"as prescribed";
  if(v==="custom")return "see prescriber instructions";
  return v;
}
function sampleSigText(){return ($("sampleSig").value||"").trim() || sampleMed().defaultSig || "Take exactly as prescribed by your provider.";}

function sampleDoseEntries(){
  const entries=[];
  const mainMed=($('sampleMedLabel')?.value||'').trim();
  const mainQty=($('sampleQty')?.value||'').trim();
  const mainSig=sampleSigText();
  if(mainMed||mainQty||mainSig)entries.push({strength:mainMed||sampleMed().label,qty:mainQty||'not documented',sig:mainSig});
  document.querySelectorAll('.sample-dose-row').forEach(row=>{
    const strength=row.querySelector('[data-dose-strength]')?.value.trim()||'';
    const qty=row.querySelector('[data-dose-qty]')?.value.trim()||'';
    const sig=row.querySelector('[data-dose-sig]')?.value.trim()||'';
    if(strength||qty||sig)entries.push({strength:strength||'Additional strength',qty:qty||'not documented',sig:sig||'Use as directed by prescriber.'});
  });
  return entries;
}
function sampleStrengthText(){return (($('sampleMedLabel')&&$('sampleMedLabel').value)||'').toLowerCase();}
function packageMatchStrength(opt){
  const s=sampleStrengthText();
  if(!opt.match||!opt.match.length)return true;
  return opt.match.some(m=>s.includes(String(m).toLowerCase()));
}
function samplePackageOptions(){
  const med=sampleMed();
  const library={
    trintellix:[
      {label:'1 sample card / 7 tablets',value:'1 Trintellix sample card / 7 tablets'},
      {label:'2 sample cards / 14 tablets',value:'2 Trintellix sample cards / 14 tablets'},
      {label:'1 box / 7 tablets',value:'1 box / 7 tablets'}
    ],
    austedo:[
      {label:'1 titration kit',value:'1 Austedo titration kit',match:['starter','titration']},
      {label:'1 sample card',value:'1 Austedo sample card'},
      {label:'7 tablets',value:'7 tablets'},
      {label:'14 tablets',value:'14 tablets'},
      {label:'Austedo XR card',value:'1 Austedo XR sample card',match:['xr','24']}
    ],
    ingrezza:[
      {label:'1 starter pack',value:'1 Ingrezza starter pack',match:['starter','40']},
      {label:'1 box / 7 capsules',value:'1 box / 7 capsules'},
      {label:'2 boxes / 14 capsules',value:'2 boxes / 14 capsules'},
      {label:'1 sample card',value:'1 Ingrezza sample card'}
    ],
    aplenzin:[
      {label:'1 sample card / 7 tablets',value:'1 Aplenzin sample card / 7 tablets'},
      {label:'2 sample cards / 14 tablets',value:'2 Aplenzin sample cards / 14 tablets'},
      {label:'1 bottle/box as provided',value:'1 manufacturer sample package as provided'}
    ],
    vraylar:[
      {label:'1.5 mg box / 7 caps',value:'1 Vraylar 1.5 mg box / 7 capsules',match:['1.5']},
      {label:'3 mg box / 7 caps',value:'1 Vraylar 3 mg box / 7 capsules',match:['3 mg']},
      {label:'4.5 mg box / 7 caps',value:'1 Vraylar 4.5 mg box / 7 capsules',match:['4.5']},
      {label:'6 mg box / 7 caps',value:'1 Vraylar 6 mg box / 7 capsules',match:['6 mg']},
      {label:'1.5 mg + 3 mg boxes',value:'Vraylar 1.5 mg box + Vraylar 3 mg box'},
      {label:'starter pack',value:'1 Vraylar starter pack',match:['starter']}
    ],
    cobenfy:[
      {label:'starter pack',value:'1 Cobenfy starter pack',match:['starter','50/20']},
      {label:'7-day card',value:'1 Cobenfy 7-day sample card'},
      {label:'14 capsules',value:'14 capsules'},
      {label:'sample card',value:'1 Cobenfy sample card'}
    ],
    fanapt:[
      {label:'titration pack',value:'1 Fanapt titration pack',match:['titration','1 mg','2 mg']},
      {label:'sample card',value:'1 Fanapt sample card'},
      {label:'7-day supply',value:'1 Fanapt 7-day sample supply'}
    ],
    rexulti:[
      {label:'starter pack',value:'1 Rexulti starter pack',match:['starter','0.25','0.5']},
      {label:'1 sample card / 7 tablets',value:'1 Rexulti sample card / 7 tablets'},
      {label:'2 sample cards / 14 tablets',value:'2 Rexulti sample cards / 14 tablets'}
    ],
    auvelity:[
      {label:'sample titration pack',value:'1 Auvelity sample titration pack',match:['titration','sample']},
      {label:'7 tablets',value:'7 tablets'},
      {label:'14 tablets',value:'14 tablets'},
      {label:'1 blister/sample card',value:'1 Auvelity sample card'}
    ],
    caplyta:[
      {label:'1 box / 7 capsules',value:'1 Caplyta box / 7 capsules'},
      {label:'2 boxes / 14 capsules',value:'2 Caplyta boxes / 14 capsules'},
      {label:'1 sample card',value:'1 Caplyta sample card'}
    ],
    lybalvi:[
      {label:'1 box / 7 tablets',value:'1 Lybalvi box / 7 tablets'},
      {label:'2 boxes / 14 tablets',value:'2 Lybalvi boxes / 14 tablets'},
      {label:'1 sample card',value:'1 Lybalvi sample card'}
    ],
    other:[
      {label:'1 sample package',value:'1 manufacturer sample package'},
      {label:'7 tablets/capsules',value:'7 tablets/capsules'},
      {label:'14 tablets/capsules',value:'14 tablets/capsules'}
    ]
  };
  const generic=[
    {label:'sample card',value:'1 sample card'},
    {label:'starter pack',value:'1 starter pack'},
    {label:'titration kit',value:'1 titration kit'},
    {label:'manual',value:''}
  ];
  const medSpecific=(library[med.key]||library.other).filter(packageMatchStrength);
  return [...medSpecific,...generic].filter((o,idx,arr)=>arr.findIndex(x=>x.label===o.label&&x.value===o.value)===idx);
}
function addSamplePackageOption(opt){
  const qty=(opt&&opt.value)||'';
  if(!qty){
    $('sampleQty').focus();
    toast('Type the exact package');
    return;
  }
  const medText=($('sampleMedLabel')?.value||'').trim()||sampleMed().label;
  const sig=sampleSigText();
  if(!($('sampleQty').value||'').trim()){
    $('sampleQty').value=qty;
    renderSamplePackageMeta();
    renderSampleHandout();
    toast('Primary package added');
  }else{
    addSampleDoseRow({strength:medText, qty:qty, sig:sig});
    renderSampleHandout();
    toast('Package added to samples list');
  }
}
function renderSamplePackageButtons(){
  const box=$('samplePackageButtons'); if(!box)return;
  const opts=samplePackageOptions();
  box.innerHTML=opts.map((o,i)=>`<button type="button" class="sample-pack-btn ${o.value?'':'manual'}" data-pack-opt="${i}" title="${esc(o.value||'Type package manually')}">${esc(o.label||o.value)}</button>`).join('');
  box.querySelectorAll('[data-pack-opt]').forEach(btn=>btn.addEventListener('click',()=>{ const opt=samplePackageOptions()[Number(btn.dataset.packOpt)]||{}; addSamplePackageOption(opt); }));
}
function clearSampleDoseRows(){const box=$('sampleDoseRows'); if(box){box.innerHTML=''; box.classList.remove('show');}}
function addSampleDoseRow(data={}){
  const box=$('sampleDoseRows'); if(!box)return;
  box.classList.add('show');
  const row=document.createElement('div');
  row.className='sample-dose-row';
  row.innerHTML=`<div class="field"><label>Medication / strength</label><input data-dose-strength placeholder="e.g., Vraylar 3 mg capsule" value="${esc(data.strength||'')}"></div><div class="field"><label>Package handed out</label><input data-dose-qty placeholder="e.g., 1 box / 7 caps" value="${esc(data.qty||'')}"></div><div class="field"><label>Directions for this package/step</label><input data-dose-sig placeholder="e.g., Then take 1 capsule daily" value="${esc(data.sig||'')}"></div><button class="sample-dose-remove" type="button" title="Remove">×</button>`;
  row.querySelectorAll('input').forEach(i=>i.addEventListener('input',renderSampleHandout));
  row.querySelector('.sample-dose-remove').addEventListener('click',()=>{row.remove(); if(!box.children.length)box.classList.remove('show'); renderSampleHandout();});
  box.appendChild(row);
  renderSampleHandout();
}
function sampleDosePlanHtml(){
  const entries=sampleDoseEntries();
  if(entries.length<=1)return '';
  return `<div class="sh-section"><div class="sh-label">Samples provided / step plan</div><div class="sample-dose-list timeline soft">${entries.map((e,i)=>`<div class="sd-item" data-step="${i+1}"><b>${esc(e.strength)}</b><br><span class="sd-qty">${esc(e.qty)}</span><span class="sd-sig">${esc(e.sig)}</span></div>`).join('')}</div><div class="sample-guard-soft">Follow the steps exactly as written by the prescriber. Do not take multiple strengths together unless the prescriber specifically told you to.</div></div>`;
}
function sampleDosePlanText(){
  const entries=sampleDoseEntries();
  if(entries.length<=1)return '';
  return entries.map((e,i)=>`${i+1}. ${e.strength} — ${e.qty}; ${e.sig}`).join('\n');
}
function sampleDosePlanPrintHtml(){
  const entries=sampleDoseEntries();
  if(entries.length<=1)return '';
  return `<div class="ph-dose-plan"><h2>Samples provided / step plan</h2><div class="ph-dose-row"><div>Medication/strength</div><div>Quantity</div><div>Directions</div></div>${entries.map(e=>`<div class="ph-dose-row"><div>${esc(e.strength)}</div><div>${esc(e.qty)}</div><div>${esc(e.sig)}</div></div>`).join('')}</div>`;
}
function renderSampleMedChips(){
  const box=$("sampleMedChips");if(!box)return;box.innerHTML="";
  SAMPLE_MEDS.forEach(m=>box.appendChild(chipEl(m.label,SAMPLE_STATE.med&&SAMPLE_STATE.med.key===m.key,"sm",()=>selectSampleMed(m))));
}
function selectSampleMed(m){
  SAMPLE_STATE.med=m;
  const first=(m.sigOptions&&m.sigOptions[0])||{};
  const strength=first.strength||((m.strengths&&m.strengths[0])?m.strengths[0]:"");
  $("sampleMedLabel").value=m.label+(strength?` ${strength}`:"")+(m.generic?` (${m.generic})`:"");
  $("samplePurpose").value=first.purpose||m.purpose||"Medication sample start";
  $("sampleSig").value=first.sig||m.defaultSig||"";
  $("sampleTitration").value=first.titration||"";
  $("sampleFood").value=first.food||"auto";
  $("sampleQty").value=first.qty||((m.strengths&&m.strengths[0])?m.strengths[0]:"");
  clearSampleDoseRows();renderSampleMedChips();renderSampleSigSuggestions();renderSamplePackageButtons();renderSampleIntentChips();renderSamplePackageMeta();renderSampleHandout();
}
function sampleSigOptions(){
  const m=sampleMed();
  return (m.sigOptions&&m.sigOptions.length)?m.sigOptions:[{label:"Use default",strength:(m.strengths&&m.strengths[0])||"",qty:"",sig:m.defaultSig||"Take exactly as prescribed by your provider."}];
}
function applySampleSigOption(i){
  const m=sampleMed();
  const opt=sampleSigOptions()[i]; if(!opt)return;
  if(opt.strength!==undefined)$("sampleMedLabel").value=m.label+(opt.strength?` ${opt.strength}`:"")+(m.generic?` (${m.generic})`:"");
  if(opt.qty!==undefined)$("sampleQty").value=opt.qty||"";
  if(opt.sig)$("sampleSig").value=opt.sig;
  if(opt.titration!==undefined)$("sampleTitration").value=opt.titration||"";
  if(opt.food)$("sampleFood").value=opt.food;
  if(opt.purpose)$("samplePurpose").value=opt.purpose;
  clearSampleDoseRows();
  if(opt.multiDose&&Array.isArray(opt.multiDose))opt.multiDose.forEach(addSampleDoseRow);
  renderSamplePackageButtons();
  renderSamplePackageMeta();
  renderSampleHandout();
  toast("Sample directions applied");
}
function renderSampleSigSuggestions(){
  const box=$("sampleSigSuggestions"); if(!box)return;
  const opts=sampleSigOptions();
  const btns=opts.map((o,i)=>`<button type="button" class="sample-sig-btn" data-sig-opt="${i}">${esc(o.label||`Option ${i+1}`)}</button>`).join("");
  const med=sampleMed();
  box.innerHTML=`<div class="sig-head"><div><div class="sig-title">Suggested sample directions</div><div class="sig-help">Quick-fill common sample strengths and directions, then adjust to the prescriber’s exact intent.</div></div></div><div class="sample-sig-buttons">${btns}</div>${med.guard?`<div class="sample-alertline">${esc(med.guard)}</div>`:""}<div class="sample-sig-meta">Suggestions are documentation helpers only. Confirm the exact sample box, prescriber order, and active label before dispensing.</div>`;
  box.querySelectorAll('[data-sig-opt]').forEach(b=>b.addEventListener('click',()=>applySampleSigOption(Number(b.dataset.sigOpt))));
  renderSamplePackageButtons();
}
function samplePatientName(){return ($("samplePtName").value||"").trim()||"Patient";}
function sampleTraceIssues(){
  const out=[];
  if(!$("sampleMedLabel").value.trim())out.push("medication");
  if(!$("sampleSig").value.trim())out.push("directions");
  if(!$("sampleQty").value.trim())out.push("quantity/package");
  if(!$("samplePrescriber").value.trim())out.push("prescriber");
  if(!$("sampleLot").value.trim())out.push("lot");
  if(!$("sampleExp").value.trim())out.push("expiration");
  if(monthExpired($("sampleExp").value,$("sampleDate").value))out.push("expired sample");
  if(!$("sampleStaff").value.trim())out.push("dispensed by");
  return out;
}
function renderSampleReadiness(){
  const box=$("sampleReadiness");if(!box)return;
  const issues=sampleTraceIssues();
  const items=[];
  if(!issues.length)items.push(`<div class="qa-ok">Ready: handout and sample log look complete.</div>`);
  else items.push(`<div class="qa-warn">Missing or review: ${esc(issues.join(", "))}.</div>`);
  const med=sampleMed();
  if(["fanapt","cobenfy","austedo","vraylar","rexulti","auvelity"].includes(med.key))items.push(`<div class="qa-warn">Titration-sensitive or dose-sensitive medication: verify the prescriber schedule is written clearly.</div>`);
  if(med.key==="caplyta")items.push(`<div class="qa-ok">Caplyta: standard adult sample flow is simple once-daily dosing; lower strengths should be prescriber-selected.</div>`);
  if(["lybalvi","cobenfy","fanapt","rexulti"].includes(med.key))items.push(`<div class="qa-warn">${esc(med.label)}: confirm prescriber reviewed the active order and product-specific safety considerations before dispensing.</div>`);
  if(sampleDoseEntries().length>1)items.push(`<div class="qa-warn">Multiple strengths/packages: confirm the patient knows the order and not to take both unless prescribed.</div>`);
  if(med.guard)items.push(`<div class="qa-warn">${esc(med.guard)}</div>`);
  box.innerHTML=items.join("");
}
function sampleFriendlyMedication(){
  const medLabel=$("sampleMedLabel").value.trim()||sampleMed().label;
  return medLabel;
}
function sampleInstructionsBlock(){
  const sig=sampleSigText();
  const tit=($("sampleTitration").value||"").trim();
  return tit?`${sig}\n\nPrescriber schedule / special instructions:\n${tit}`:sig;
}
function sampleNoteText(){
  const med=sampleFriendlyMedication();
  const lines=[];
  lines.push(`Sample dispensed — ${med}; ${$("samplePurpose").value||"sample provided"}; patient handout given.`);
  lines.push("");
  lines.push(`Patient was provided an oral medication sample per prescriber direction. Instructions reviewed: ${sampleSigText()}`);
  const dosePlan=sampleDosePlanText();
  if(dosePlan)lines.push(`Sample strengths/packages:
${dosePlan}`);
  if($("sampleTitration").value.trim())lines.push(`Titration / special instructions: ${$("sampleTitration").value.trim()}`);
  lines.push(`Medication check: ${$("sampleMedCheck").value}. Education: ${$("sampleEdu").value}.`);
  if($("sampleExtra").value.trim())lines.push(`Patient note/context: ${$("sampleExtra").value.trim()}`);
  lines.push("");
  lines.push(`Traceability: ${med}. Quantity/package: ${$("sampleQty").value.trim()||"not documented"}. Lot: ${$("sampleLot").value.trim()||"not documented"}. Exp: ${$("sampleExp").value||"not documented"}. Prescriber: ${$("samplePrescriber").value.trim()||"not documented"}. Dispensed by: ${$("sampleStaff").value.trim()||"not documented"}.`);
  return lines.join("\n");
}
function renderSampleHandout(){
  const med=sampleMed();
  const medLabel=sampleFriendlyMedication();
  const sig=sampleInstructionsBlock();
  const primaryQty=($('sampleQty')?.value||'').trim()||'Quantity not documented yet';
  $("samplePrevMed").textContent=medLabel||"—";
  $("samplePrevSig").textContent=primaryQty||"—";
  const food=sampleFoodText();
  const watch=(med.watch&&med.watch.length?med.watch:["You are not sure how to take the sample.","Side effects feel severe, unusual, or concerning."]).map(x=>`<li>${esc(x)}</li>`).join("");
  const reminders=(med.reminders&&med.reminders.length?med.reminders:["Take only the amount your prescriber instructed.","Do not share medication samples with anyone else.","Keep samples away from children and pets."]).map(x=>`<li>${esc(x)}</li>`).join("");
  const extra=($("sampleExtra").value||"").trim();
  const intent=sampleIntentObj();
  const startDate=$("sampleStart").value?fmtDate($("sampleStart").value):"as directed";
  $("samplePreview").innerHTML=`
    <div class="sample-handout soft-sample">
      <div class="sh-hero">
        <div class="sh-kicker">Medication sample instructions</div>
        <div class="sh-title">Your sample plan</div>
        <p class="sh-sub">A simple reminder of what was provided and how your prescriber wants you to take it.</p>
      </div>
      <div class="sh-body">
        <div class="sample-soft-grid">
          <div class="sample-soft-card primary"><div class="mini-label">Medication</div><div><div class="med-name">${esc(medLabel)}</div>${med.generic?`<div class="muted-line">${esc(med.generic)}</div>`:""}</div></div>
          <div class="sample-soft-card"><div class="mini-label">Quantity</div><div><div class="qty-line">${esc(primaryQty)}</div><div class="muted-line">Primary sample package handed out.</div></div></div>
          <div class="sample-soft-card"><div class="mini-label">Purpose</div><div><div class="qty-line">${esc(intent.label||$("samplePurpose").value||"Sample provided")}</div><div class="muted-line">Start ${esc(startDate)}.</div></div></div>
        </div>
        <div class="sample-soft-instructions"><div class="take-title">How to take it</div><p class="take-text">${esc(sig).replace(/\n/g,"<br>")}</p><p class="sh-muted"><b>Food timing:</b> ${esc(food)}.</p></div>
        ${sampleDosePlanHtml()}
        ${med.guard?`<div class="sample-alertline"><b>Before you start:</b> ${esc(med.guard)}</div>`:""}
        <div class="sample-soft-details">
          <div class="detail-block"><div class="sh-label">Helpful reminders</div><ul>${reminders}</ul></div>
          <div class="detail-block"><div class="sh-label">Call the clinic if</div><ul>${watch}</ul></div>
        </div>
        ${extra?`<div class="sample-warn">${esc(extra)}</div>`:""}
      </div>
    </div>`;
  renderSampleSigSuggestions();renderSampleReadiness();renderCommandCenter();
}
function resetSample(){
  ["samplePtName","sampleDOB","samplePrescriber","sampleStaff","sampleQty","sampleLot","sampleExp","sampleTitration","sampleExtra","sampleHandoutStatus","sampleFollowUp"].forEach(id=>{if($(id))$(id).value="";});
  if($("sampleDate"))$("sampleDate").value=localDateValue();
  if($("sampleStart"))$("sampleStart").value=localDateValue();
  if($("sampleMedCheck"))$("sampleMedCheck").value="Prescriber reviewed / ok to dispense";
  if($("sampleEdu"))$("sampleEdu").value="Reviewed with patient";
  clearSampleDoseRows();
  selectSampleMed(SAMPLE_MEDS[0]);
  applyStaffToSamples(false);
  toast("Sample handout cleared");
}
function applyStaffToSamples(show=true){
  const saved=getStoredStaff();
  if(saved&&$("sampleStaff"))$("sampleStaff").value=saved;
  if(show)toast(saved?"Signed-in staff applied":"No signed-in staff saved");
  renderSampleHandout();
}
function initSamples(){
  if(!$("sampleDate"))return;
  $("sampleDate").value=localDateValue();
  if($("sampleStart"))$("sampleStart").value=localDateValue();
  renderSampleMedChips();selectSampleMed(SAMPLE_MEDS[0]);renderSampleSigSuggestions();renderSamplePackageButtons();renderSampleIntentChips();renderSamplePackageMeta();applyStaffToSamples(false);
  ["samplePtName","samplePrescriber","sampleStaff","sampleQty","sampleLot","sampleExp","sampleStart","sampleSig","sampleTitration","sampleExtra","sampleFollowUp"].forEach(id=>{const el=$(id);if(el)el.addEventListener("input",()=>{if(id==='sampleQty')renderSamplePackageMeta();renderSampleHandout();});});
  if($("sampleMedLabel"))$("sampleMedLabel").addEventListener("input",()=>{renderSamplePackageButtons();renderSampleHandout();});
  ["samplePurpose","sampleFood","sampleMedCheck","sampleEdu","sampleDate","sampleHandoutStatus"].forEach(id=>{const el=$(id);if(el)el.addEventListener("change",()=>{renderSampleIntentChips();renderSampleHandout();});});
  if($('sampleQtyMinus'))$('sampleQtyMinus').addEventListener('click',()=>changeSamplePackage(-1));
  if($('sampleQtyPlus'))$('sampleQtyPlus').addEventListener('click',()=>changeSamplePackage(1));
  if($('sampleQtySame'))$('sampleQtySame').addEventListener('click',addSameSampleStrength);
  if($('sampleQtyClear'))$('sampleQtyClear').addEventListener('click',()=>{$('sampleQty').value='';renderSamplePackageMeta();renderSampleHandout();});
  $("sampleDOB").addEventListener("input",e=>{e.target.value=fmtDOB(e.target.value);renderSampleHandout();});
  $("sampleUsePatient").addEventListener("click",()=>{$("samplePtName").value=$("ptName").value||$("udsPtName").value||"";$("sampleDOB").value=$("ptDOB").value||$("udsDOB").value||"";renderSampleHandout();toast("Patient copied into sample handout");});
  $("sampleUseStaff").addEventListener("click",()=>applyStaffToSamples(true));
  $("sampleAddDose").addEventListener("click",()=>addSampleDoseRow());
  $("sampleReset").addEventListener("click",resetSample);
  $("sampleCopy").addEventListener("click",()=>copy(sampleNoteText(),"Tebra sample note"));
  $("samplePrint").addEventListener("click",()=>{renderSampleSheet();cleanPrintClasses();document.body.classList.add("print-sample");window.print();setTimeout(cleanPrintClasses,500);});
  $("sampleAddLog").addEventListener("click",()=>{
    const issues=sampleTraceIssues();
    if(issues.length&&!confirm(`Sample documentation incomplete (${issues.join(", ")}). Add sample to activity log anyway?`))return;
    const entry={type:"sample",status:issues.length?"needs_review":"completed",time:nowStamp(),pt:$("samplePtName").value.trim()||"—",summary:sampleFriendlyMedication(),details:[sampleSigText(), sampleDosePlanText()].filter(Boolean).join(" | "),trace:[$("sampleQty").value.trim(),$("sampleLot").value.trim()?`Lot ${$("sampleLot").value.trim()}`:"",$("sampleExp").value?`Exp ${$("sampleExp").value}`:""].filter(Boolean).join(" · ")||"—",follow:$("samplePurpose").value||"Sample dispensed",by:$("sampleStaff").value.trim()||"—"};
    if(!appendLogEntry(entry)){toast("Sample could not be saved to the activity log in this browser.");return;}
    renderLog();renderCommandCenter();toast("Sample added to activity log");
  });
}

/* ---------- session activity log ---------- */
const LOG_FILTERS=[
  {k:"all",l:"All"},
  {k:"injection",l:"Injections"},
  {k:"uds",l:"UDS"},
  {k:"sample",l:"Samples"},
  {k:"forms",l:"Forms"},
  {k:"needs_review",l:"Needs review"},
  {k:"completed",l:"Completed"}
];
let LOG_FILTER="all";
function nowStamp(){return new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});}
function logTypeLabel(type){return type==="uds"?"UDS":type==="sample"?"Sample":type==="forms"?"Forms":"Injection";}
function logStatusLabel(status){return status==="needs_review"?"Needs review":"Completed";}
function activityStatusFromUds(){
  const inv=udsPanelsByState("invalid"),pos=udsPanelsByState("pos");
  const trace=udsTraceIssues();
  const tested=UDS_PANELS.filter(p=>UDS.results[p]&&UDS.results[p]!=="nt");
  const profileIssues=typeof window.ipmgUdsPanelProfileIssues==="function"?window.ipmgUdsPanelProfileIssues():[];
  const additionalIssues=typeof window.ipmgUdsAdditionalOutputIssues==="function"?window.ipmgUdsAdditionalOutputIssues():[];
  if(!$("udsPtName").value.trim()||!$("udsDOB").value.trim()||!$("udsDateTime").value||!$("udsDevice").value||trace.length||profileIssues.length||additionalIssues.length||!tested.length||UDS.control!=="valid"||inv.length||pos.length||UDS.validity!=="acceptable"||UDS.consistent!=="no unexpected"||UDS.temp!=="acceptable"||monthExpired($("udsExp").value,$("udsDateTime").value))return "needs_review";
  return "completed";
}
function activityMatchesFilter(r){
  if(LOG_FILTER==="all")return true;
  if(LOG_FILTER==="injection"||LOG_FILTER==="uds"||LOG_FILTER==="sample"||LOG_FILTER==="forms")return r.type===LOG_FILTER;
  return r.status===LOG_FILTER;
}
function renderLogFilters(){
  const box=$("logFilters");if(!box)return;box.innerHTML="";
  LOG_FILTERS.forEach(f=>{
    const count=f.k==="all"?LOG.length:LOG.filter(r=>(f.k==="injection"||f.k==="uds"||f.k==="sample"||f.k==="forms")?r.type===f.k:r.status===f.k).length;
    box.appendChild(chipEl(`${f.l} ${count?`(${count})`:""}`,LOG_FILTER===f.k,"sm",()=>{LOG_FILTER=f.k;renderLog();}));
  });
}
$("addLog").addEventListener("click",()=>{
  if(!S.med||!S.dose){toast("Pick a drug & dose first");return;}
  const traceIssues=injectionTraceIssues();
  if(traceIssues.length&&!confirm(`Traceability incomplete (${traceIssues.join(", ")}). Add injection to activity log anyway?`))return;
  const ndc=$("ndc").value.trim(),lot=$("lot").value.trim(),exp=$("exp").value.trim();
  const protocolLog=typeof window.ipmgInitiationProtocolLog==='function'?window.ipmgInitiationProtocolLog():{details:[],trace:[],follow:""};
  const actualAdminTime=$("injAdminTime")?.value.trim()||"",secondAdminTime=$("injSecondAdminTime")?.value.trim()||"";
  if(actualAdminTime||secondAdminTime)protocolLog.details=[actualAdminTime?"Actual administration time "+actualAdminTime:"",secondAdminTime?"Component 2 administration time "+secondAdminTime:"",...(protocolLog.details||[])].filter(Boolean);
  const entry={
    type:"injection",status:"completed",time:nowStamp(),
    pt:$("ptName").value.trim()||"—",
    summary:`${S.med.name||S.med.label||'Medication'} ${S.dose}`.trim(),
    details:[S.route,S.site,...(protocolLog.details||[])].filter(Boolean).join(" · ")||"—",
    trace:[ndc?`NDC ${ndc}`:"",lot?`Lot ${lot}`:"",exp?`Exp ${exp}`:"",...(protocolLog.trace||[])].filter(Boolean).join(" · ")||"—",
    follow:protocolLog.follow||($("nextDate").value?`Next ${fmtShort($("nextDate").value)}`:"Next dose TBD"),
    by:$("admin").value.trim()||"—"
  };
  if(!appendLogEntry(entry)){toast("Injection could not be saved to the activity log in this browser.");return;}
  renderLog();renderCommandCenter();toast("Injection added to activity log");
});
$("addUdsLog").addEventListener("click",()=>{
  renderUdsNote();
  const n=window._udsNote||{};
  if(!n.cc){toast("Build the UDS note first");return;}
  const traceIssues=udsTraceIssues();
  const pos=udsPanelsByState("pos"),inv=udsPanelsByState("invalid"),neg=udsPanelsByState("neg"),nt=udsPanelsByState("nt");
  const device=$("udsDevice").value,lot=$("udsLot").value.trim(),exp=$("udsExp").value.trim();
  const detail=[pos.length?`Pos ${shortList(pos)}`:"",inv.length?`Invalid ${shortList(inv)}`:"",`Neg ${neg.length}`,nt.length?`Not tested ${shortList(nt)}`:""].filter(Boolean).join(" · ");
  const status=activityStatusFromUds();
  const entry={
    type:"uds",status,time:nowStamp(),
    pt:$("udsPtName").value.trim()||"—",
    summary:n.headline||"UDS documented",
    details:detail,
    trace:[device||"",lot?`Lot ${lot}`:"",exp?`Exp ${exp}`:""].filter(Boolean).join(" · ")||"—",
    follow:udsLabPlanLine().replace(/\.$/,""),
    by:$("udsCollector").value.trim()||"—"
  };
  if(!appendLogEntry(entry)){toast("UDS could not be saved to the activity log in this browser.");return;}
  renderLog();renderCommandCenter();toast(status==="needs_review"?`UDS added as Needs review${traceIssues.length?` — complete ${traceIssues.join(", ")}`:""}`:"UDS added to activity log");
});
function renderLog(){
  $("logCount").textContent=LOG.length;
  renderLogFilters();
  renderCloseout();
  const body=$("logBody"),empty=$("logEmpty"),table=$("logTable");
  const rows=LOG.map((r,i)=>({...r,_i:i})).filter(activityMatchesFilter);
  if(!LOG.length){table.style.display="none";empty.style.display="";empty.textContent="No activity logged yet. Add an injection or UDS entry from its workflow.";return;}
  if(!rows.length){table.style.display="none";empty.style.display="";empty.textContent="No activity matches this filter.";return;}
  table.style.display="";empty.style.display="none";body.innerHTML="";
  rows.forEach((r,idx)=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${idx+1}</td><td>${esc(r.time||"—")}</td><td><span class="typepill ${esc(r.type)}">${logTypeLabel(r.type)}</span><div style="margin-top:5px"><span class="statuspill ${esc(r.status)}">${logStatusLabel(r.status)}</span></div></td><td>${esc(r.pt)}</td>
      <td><div class="logsummary">${esc(r.summary||"—")}</div></td><td><div class="logsub">${esc(r.details||"—")}</div></td>
      <td class="mono">${esc(r.trace||"—")}</td><td>${esc(r.follow||"—")}</td><td>${esc(r.by||"—")}</td><td><span class="del" data-i="${r._i}">✕</span></td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll(".del").forEach(d=>d.addEventListener("click",()=>{LOG.splice(+d.dataset.i,1);saveLog();renderLog();renderCommandCenter();}));
}
// Write-only bridge for the Daily Closeout panel's per-row delete - there's
// no stable element id per row for clickLegacyControl() to target, so this
// mirrors the .del click handler above exactly.
window.ipmgDeleteLogEntry=(index)=>{
  if(!(index>=0&&index<LOG.length))return;
  LOG.splice(index,1);saveLog();renderLog();renderCommandCenter();
};
$("clearLog").addEventListener("click",()=>{if(LOG.length&&confirm("Clear the entire activity log?")){LOG=[];LOG_FILTER="all";saveLog();renderLog();renderCommandCenter();renderCommandCenter();toast("Activity log cleared");}});
$("copyLog").addEventListener("click",()=>{
  if(!LOG.length){toast("Log is empty");return;}
  const rows=LOG.filter(activityMatchesFilter);
  if(!rows.length){toast("No rows match this filter");return;}
  const head=["#","Time","Type","Status","Patient","Summary","Details","Traceability","Follow-up","By"].join("\t");
  const out=rows.map((r,i)=>[i+1,r.time||"",logTypeLabel(r.type),logStatusLabel(r.status),r.pt,r.summary||"",r.details||"",r.trace||"",r.follow||"",r.by||""].join("\t"));
  copy([head,...out].join("\n"),"Activity log");
});


/* ---------- daily closeout / PDF sheet ---------- */
function closeoutStats(){
  const total=LOG.length;
  const count=t=>LOG.filter(r=>r.type===t).length;
  const completed=LOG.filter(r=>r.status==='completed').length;
  const review=LOG.filter(r=>r.status==='needs_review').length;
  return {total,injection:count('injection'),uds:count('uds'),sample:count('sample'),forms:count('forms'),completed,review};
}
function needsReviewRows(){return LOG.map((r,i)=>({...r,_i:i})).filter(r=>r.status==='needs_review');}
function renderCloseout(){
  const k=$('closeoutKpis'), list=$('needsReviewList');
  if(!k||!list)return;
  const s=closeoutStats();
  const items=[['Total',s.total],['Injections',s.injection],['UDS',s.uds],['Samples',s.sample],['Forms',s.forms],['Completed',s.completed],['Needs review',s.review]];
  k.innerHTML=items.map(([l,n])=>`<div class="kpi ${l==='Needs review'&&n?'warn':''}"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
  const rows=needsReviewRows();
  if(!rows.length){list.innerHTML='<div class="review-empty">No needs-review items logged.</div>';return;}
  list.innerHTML=rows.map(r=>`<div class="review-item"><div class="review-top"><b>${esc(logTypeLabel(r.type))}</b><span>${esc(r.time||'')}</span></div><div>${esc(r.pt||'—')} · ${esc(r.summary||'—')}</div><div class="review-sub">${esc([r.details,r.follow].filter(Boolean).join(' · ')||'—')}</div></div>`).join('');
}
function dailySummaryText(){
  const s=closeoutStats();
  const today=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const lines=[`IPMG daily closeout — ${today}`,`Total: ${s.total} | Injections: ${s.injection} | UDS: ${s.uds} | Samples: ${s.sample} | Forms: ${s.forms} | Completed: ${s.completed} | Needs review: ${s.review}`];
  const review=needsReviewRows();
  if(review.length){
    lines.push('', 'Needs review:');
    review.forEach((r,i)=>lines.push(`${i+1}. ${logTypeLabel(r.type)} — ${r.pt||'—'} — ${r.summary||'—'} — ${r.follow||'—'}`));
  }else lines.push('', 'Needs review: none');
  return lines.join('\\n');
}
function csvEscape(v){
  v=(v??'').toString();
  if(/^[\t\r ]*[=+\-@]/.test(v))v="'"+v;
  return /[",\n\t]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
}
function exportDailyCsv(){
  if(!LOG.length){toast('Activity log is empty');return;}
  const cols=['#','Time','Type','Status','Patient','Summary','Details','Traceability','Follow-up','By'];
  const rows=LOG.map((r,i)=>[i+1,r.time||'',logTypeLabel(r.type),logStatusLabel(r.status),r.pt||'',r.summary||'',r.details||'',r.trace||'',r.follow||'',r.by||'']);
  const csv=[cols,...rows].map(row=>row.map(csvEscape).join(',')).join('\\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  const date=localDateKey();
  a.href=URL.createObjectURL(blob);a.download=`IPMG_daily_closeout_${date}.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);
  toast('Daily CSV downloaded');
}
function renderDailySheet(){
  const sheet=$('dailySheet'); if(!sheet)return;
  const s=closeoutStats();
  const date=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const staff=(typeof getSignedStaff==='function'&&getSignedStaff())||'';
  const review=needsReviewRows();
  const rows=LOG.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.time||'')}</td><td>${esc(logTypeLabel(r.type))}<br><span>${esc(logStatusLabel(r.status))}</span></td><td>${esc(r.pt||'—')}</td><td>${esc(r.summary||'—')}</td><td>${esc(r.details||'—')}</td><td>${esc(r.trace||'—')}</td><td>${esc(r.follow||'—')}</td><td>${esc(r.by||'—')}</td></tr>`).join('');
  sheet.innerHTML=`<div class="daily-pdf">
    <div class="dp-head"><div><div class="dp-brand">Inland Psychiatric Medical Group</div><div class="dp-title">Daily Activity Closeout</div></div><div class="dp-meta"><b>${esc(date)}</b><br>${staff?`Prepared by: ${esc(staff)}<br>`:''}Generated from IPMG MedAssist</div></div>
    <div class="dp-kpis">
      <div class="dp-kpi"><div class="n">${s.total}</div><div class="l">Total</div></div><div class="dp-kpi"><div class="n">${s.injection}</div><div class="l">Injections</div></div><div class="dp-kpi"><div class="n">${s.uds}</div><div class="l">UDS</div></div><div class="dp-kpi"><div class="n">${s.sample}</div><div class="l">Samples</div></div><div class="dp-kpi"><div class="n">${s.forms}</div><div class="l">Forms</div></div><div class="dp-kpi"><div class="n">${s.completed}</div><div class="l">Completed</div></div><div class="dp-kpi"><div class="n">${s.review}</div><div class="l">Needs review</div></div>
    </div>
    ${review.length?`<div class="dp-alert"><b>Needs-review items:</b> ${review.length} item${review.length===1?'':'s'} should be routed/confirmed before closeout is considered complete.</div>`:`<div class="dp-alert"><b>Needs-review items:</b> none logged.</div>`}
    <div class="dp-section"><h3>Needs-review queue</h3>${review.length?review.map((r,i)=>`<div class="dp-review"><b>${i+1}. ${esc(logTypeLabel(r.type))} — ${esc(r.pt||'—')}</b><br>${esc(r.summary||'—')}<br>${esc([r.details,r.follow].filter(Boolean).join(' · ')||'—')}</div>`).join(''):'<div class="dp-review">No needs-review items logged.</div>'}</div>
    <div class="dp-section"><h3>Full activity log</h3><table><thead><tr><th style="width:4%">#</th><th style="width:8%">Time</th><th style="width:10%">Type</th><th style="width:13%">Patient</th><th style="width:17%">Summary</th><th style="width:15%">Details</th><th style="width:15%">Traceability</th><th style="width:11%">Follow-up</th><th style="width:7%">By</th></tr></thead><tbody>${rows||'<tr><td colspan="9">No activity logged.</td></tr>'}</tbody></table></div>
    <div class="dp-foot"><div class="sigline">Prepared / reviewed by</div><div class="sigline">Date / time</div></div>
  </div>`;
}
function printDailyCloseout(){
  renderDailySheet();cleanPrintClasses();document.body.classList.add('print-daily');window.print();setTimeout(cleanPrintClasses,500);
}
function saveDailyPdf(){
  renderDailySheet();cleanPrintClasses();document.body.classList.add('print-daily');
  toast('Choose “Save as PDF” in the print dialog');
  window.print();setTimeout(cleanPrintClasses,500);
}
function initDailyCloseout(){
  if($('copyDailySummary'))$('copyDailySummary').addEventListener('click',()=>copy(dailySummaryText(),'Daily closeout summary'));
  if($('exportDailyCsv'))$('exportDailyCsv').addEventListener('click',exportDailyCsv);
  if($('printDailyLog'))$('printDailyLog').addEventListener('click',printDailyCloseout);
  if($('saveDailyPdf'))$('saveDailyPdf').addEventListener('click',saveDailyPdf);
}
initDailyCloseout();

/* ---------- clinical knowledge base ---------- */
const KB_CATEGORIES=[
  {k:'all',l:'All'}, {k:'lai',l:'LAIs'}, {k:'uds',l:'UDS'}, {k:'samples',l:'PO samples'}, {k:'labs',l:'Labs/levels'}, {k:'tms',l:'TMS'}, {k:'safety',l:'Safety'}, {k:'ops',l:'Office ops'}
];
let KB_FILTER='all';

function kbList(items){return `<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;}
function kbPanel(title, value){return `<div class="kb-row"><div class="k">${esc(title)}</div><div class="v">${value}</div></div>`;}
function kbFactGrid(items){return `<div class="kb-mini">${items.map(x=>`<div><b>${esc(x.k)}</b>${esc(x.v)}</div>`).join('')}</div>`;}

function laiToKb(m){
  const interval=medIntervalSummary(m);
  const bits=[
    kbPanel('Doses', esc(medDoseSummary(m))),
    kbPanel('Route/site', `${esc(m.route||'—')} · ${esc(m.site||'—')} · interval ${esc(interval)} · window ${esc(windowSummary(m))}`),
    kbPanel('Technique', esc(m.tech||'—')),
    kbPanel('Prep/storage', `${esc(m.recon||'—')}<br>${esc(m.storage||'—')}`),
    kbPanel('Late/missed', esc(m.missed||'Verify against current PI and prescriber direction.')),
    kbPanel('MA guardrail', esc(m.caution||'Verify active order, tolerability, lot/exp/NDC, and site/route before documenting.'))
  ];
  return {type:'lai', title:m.name, sub:`${m.gen} · ${m.cls}`, icon:'LAI', tags:['Injection','Safety','AVS'], search:[m.name,m.gen,m.cls,m.key,'injection LAI long acting'].join(' '), rows:bits};
}

const UDS_KB=[
  {type:'uds',title:'UDS result language',sub:'How to document point-of-care screens without over-interpreting',icon:'UDS',tags:['UDS','Handoff','Language'],search:'urine drug screen point of care immunoassay preliminary positive negative invalid confirmation',rows:[
    kbPanel('Best wording', kbList(['Use “preliminary positive” rather than “positive” for office immunoassay results.','Use “not readily explained by available medication list” rather than “inconsistent” when staff are handing off to a clinician.','Use “provider to review in clinical context” for the final interpretation.'])),
    kbPanel('Validity first', kbList(['Control line present = result can be read.','Control line missing/invalid = do not interpret; repeat or outside lab confirmation per provider direction.','Document not-tested panels separately from invalid/unreadable panels.'])),
    kbPanel('Confirmatory testing', 'Point-of-care results are screening results. Outside lab confirmation may be ordered if clinically indicated or required by provider/policy.'),
    kbPanel('Thumbnail examples', kbList(['UDS handoff — all tested panels negative; validity acceptable; FYI only.','UDS handoff — +THC/+BZO; not readily explained by available medication list; provider review requested.','UDS handoff — invalid control line; do not interpret; repeat/confirmation needed.']))
  ]},
  {type:'uds',title:'UDS panel map',sub:'Common cup abbreviations translated for staff and patient handouts',icon:'MAP',tags:['UDS','Panels','Patient language'],search:'AMP BAR BUP BZO COC MDMA MET MOP MTD OXY PCP PPX TCA THC meaning',rows:[
    kbPanel('Opioid / MAT-related', kbFactGrid([{k:'BUP',v:'Buprenorphine screen'},{k:'MTD',v:'Methadone screen'},{k:'MOP/OPI',v:'Morphine/opiate screen'},{k:'OXY',v:'Oxycodone screen'},{k:'PPX',v:'Propoxyphene screen'}])),
    kbPanel('Sedative / psych', kbFactGrid([{k:'BZO',v:'Benzodiazepine screen'},{k:'BAR',v:'Barbiturate screen'},{k:'TCA',v:'Tricyclic antidepressant screen'}])),
    kbPanel('Stimulant / illicit', kbFactGrid([{k:'AMP',v:'Amphetamine screen'},{k:'MET',v:'Methamphetamine screen'},{k:'COC',v:'Cocaine screen'},{k:'MDMA',v:'MDMA/ecstasy screen'},{k:'PCP',v:'Phencyclidine screen'}])),
    kbPanel('Cannabis', kbFactGrid([{k:'THC',v:'Cannabis/marijuana screen'}]))
  ]},
  {type:'uds',title:'UDS workflow checklist',sub:'What the MA should complete before routing to provider',icon:'CHK',tags:['UDS','Workflow','Provider review'],search:'UDS workflow checklist provider review outside lab specimen validity medication list patient explanation',rows:[
    kbPanel('Before logging', kbList(['Patient and DOB entered.','Collection date/time and collected by completed.','Device, lot, and expiration documented.','Control line/result validity selected.','Panels marked negative/preliminary positive/invalid/not tested.'])),
    kbPanel('If preliminary positive', kbList(['Move positive panels to clinician attention.','Document patient comment if offered; do not argue or interpret.','Mark medication alignment as a handoff, not a final conclusion.','Choose provider action: FYI, review, review before controlled-med decision, or consider outside lab confirmation.'])),
    kbPanel('Patient summary', 'Use plain-language names such as “cannabis/marijuana screen” instead of unexplained panel codes like THC/BZO.')
  ]}
];

const SAMPLE_KB=[
  {type:'samples',title:'Sample dispensing principles',sub:'Patient-friendly, prescriber-first sample workflow',icon:'RX',tags:['Samples','Handout','Traceability'],search:'oral medication samples quantity lot expiration prescriber instructions patient handout',rows:[
    kbPanel('Source of truth', 'The prescriber’s sig and titration intent override any quick-fill suggestion.'),
    kbPanel('Always capture', kbList(['Medication and strength.','Quantity/package, including packs/kits/boxes.','Lot and expiration.','Prescriber and dispensed by.','Patient instructions and whether more than one strength was provided.'])),
    kbPanel('Multi-strength guardrail', 'When multiple strengths are dispensed, the handout should clearly say which strength to take first and that the patient should not take more than one strength together unless the prescriber specifically instructed it.'),
    kbPanel('Common intents', 'Start medication · titration/starter · bridge to pharmacy fill · dose change · tolerability trial · continuation')
  ]},
  {type:'samples',title:'Auvelity sample guardrails',sub:'Dextromethorphan/bupropion ER',icon:'AUV',tags:['Samples','MDD','Safety'],search:'Auvelity dextromethorphan bupropion sample sig seizure duplicate bupropion MAOI',rows:[
    kbPanel('Common sample sigs', kbList(['45/105 mg ER: take 1 tablet by mouth in the morning as directed.','If prescriber directs BID: take doses at least 8 hours apart.','Do not crush, cut, or chew ER tablets.'])),
    kbPanel('MA safety prompts', kbList(['Ask/flag duplicate bupropion products.','Flag seizure history, eating-disorder history, or MAOI concern for provider review.','Do not change dose without prescriber direction.'])),
    kbPanel('Handout phrasing', '“This sample is to help you start or bridge treatment exactly as your provider directed. Do not take extra tablets if you miss a dose unless your provider tells you to.”')
  ]},
  {type:'samples',title:'Caplyta sample guardrails',sub:'Lumateperone',icon:'CAP',tags:['Samples','Antipsychotic','Safety'],search:'Caplyta lumateperone sample 42 mg 21 mg 10.5 mg sleepiness orthostatic falls',rows:[
    kbPanel('Common strengths', '42 mg capsule is the standard adult strength; 21 mg and 10.5 mg are lower-strength options for specific prescriber-selected situations.'),
    kbPanel('Patient reminders', kbList(['Take once daily as directed, with or without food.','May cause sleepiness, dizziness, or lightheadedness.','Rise slowly and use caution with driving until the patient knows how it affects them.'])),
    kbPanel('MA guardrail', 'Lower strengths should not be treated as casual starter doses; use exactly as prescribed, especially with interaction/hepatic considerations.')
  ]},
  {type:'samples',title:'Lybalvi sample guardrails',sub:'Olanzapine/samidorphan',icon:'LYB',tags:['Samples','Opioid warning','Safety'],search:'Lybalvi olanzapine samidorphan opioid contraindication acute withdrawal sample handout',rows:[
    kbPanel('Hard stop prompt', 'Flag for provider review if the patient is using opioids, recently used opioids, may need opioid pain treatment, or is in/at risk for opioid withdrawal.'),
    kbPanel('Patient reminders', kbList(['Take once daily as directed, with or without food.','Do not start opioid medicines unless the provider knows the patient takes Lybalvi.','Seek urgent help for severe sedation, allergic symptoms, or symptoms concerning for opioid withdrawal/overdose.'])),
    kbPanel('Handoff wording', '“Opioid-safety review completed/needs provider review” should be obvious in the sample note and readiness panel.')
  ]},
  {type:'samples',title:'Titration-sensitive samples',sub:'Fanapt, Vraylar, Austedo, Cobenfy, and similar meds',icon:'TIT',tags:['Samples','Titration','Safety'],search:'Fanapt titration Vraylar long half life Austedo titration Cobenfy empty stomach sample workflow',rows:[
    kbPanel('Fanapt', 'Titration should stay front-and-center because rapid titration can increase orthostatic hypotension/syncope risk.'),
    kbPanel('Vraylar', 'Dose changes can take time to show full effect due to long half-life/active metabolites; handout should avoid implying immediate dose-response.'),
    kbPanel('Austedo', 'Titration kit instructions should be explicit; remind patient to take exactly as directed and not to double doses unless prescribed.'),
    kbPanel('Cobenfy', 'Handout should emphasize empty-stomach timing and “do not open capsules.” MA should flag urinary retention, narrow-angle glaucoma, significant hepatic/renal concerns, and gallbladder/liver symptoms per protocol.')
  ]}
];


const LABS_KB=[
  {type:'labs',title:'Psych lab monitoring snapshot',sub:'What MAs should know when routing routine labs and med-monitoring results',icon:'LAB',tags:['Labs','Monitoring','Psych meds'],search:'psychiatry lab monitoring antipsychotic mood stabilizer metabolic CBC CMP TSH A1c lipid prolactin pregnancy ECG',rows:[
    kbPanel('Core principle', kbList(['Labs support provider decision-making; staff should not interpret or change treatment plans.','Use lab reference ranges, ordering provider instructions, and clinic protocol first.','Flag clearly abnormal, missing, late, or wrong-timing labs for provider review.'])),
    kbPanel('Common psych lab buckets', kbFactGrid([{k:'Metabolic',v:'Weight/BMI, blood pressure, HbA1c or glucose, lipid panel'},{k:'Safety',v:'CBC, CMP/LFTs, renal function, electrolytes'},{k:'Endocrine',v:'TSH, prolactin when clinically indicated'},{k:'Medication levels',v:'Lithium, valproate, carbamazepine, clozapine/norclozapine when ordered'},{k:'Other',v:'Pregnancy test, ECG, UDS, or disease-specific labs per order'}])),
    kbPanel('MA handoff phrase', '“Lab/level received or pending; provider review requested. Timing, reference range, and current medication context should be reviewed by provider.”'),
    kbPanel('Avoid', kbList(['Do not tell a patient a medication level is “safe,” “toxic,” or “therapeutic” without provider direction.','Do not assume a level is useful if it was not drawn at the correct time.','Do not omit timing details when documenting drug levels.']))
  ]},
  {type:'labs',title:'Antipsychotic metabolic monitoring',sub:'Weight, BP, blood sugar, and lipids for SGAs/LAIs',icon:'META',tags:['Labs','Antipsychotics','Metabolic','Safety'],search:'antipsychotic metabolic monitoring weight BMI blood pressure A1c glucose lipids baseline 12 weeks annually',rows:[
    kbPanel('Why it matters', 'Second-generation antipsychotics and many LAIs can be associated with weight, glucose, and lipid changes; providers commonly monitor weight/BMI, blood pressure, HbA1c or glucose, and lipid panel.'),
    kbPanel('Common schedule concept', kbList(['Baseline before or near start when possible.','Early follow-up around 12 weeks / 3 months after start or major change.','Ongoing annual monitoring, or more often if abnormal/high-risk per provider.','Weight/BMI and BP may be checked more often because they are easy office measures.'])),
    kbPanel('Useful MA flags', kbList(['No recent A1c/glucose or lipid panel on chart when starting/changing antipsychotic.','Rapid weight gain or patient reports new excessive thirst/urination.','Very abnormal BP/vitals or symptoms.','Patient asks why labs are needed: explain they help the provider monitor medication safety.'])),
    kbPanel('Patient-friendly wording', '“These labs help your provider watch for medication-related changes in blood sugar, cholesterol, weight, and overall safety.”')
  ]},
  {type:'labs',title:'Lithium level handoff',sub:'Timing and safety items to route clearly',icon:'Li',tags:['Labs','Drug levels','Lithium','Mood stabilizer'],search:'lithium level trough 8 12 hours renal thyroid calcium toxicity dehydration NSAID ACE diuretic',rows:[
    kbPanel('Timing', 'Lithium levels are commonly drawn as a trough about 8–12 hours after the most recent dose. Document when the patient last took lithium and when the blood was drawn if known.'),
    kbPanel('Usual monitoring context', kbList(['Kidney function and thyroid function are commonly monitored with lithium.','Calcium may also be monitored because lithium can be associated with hypercalcemia/hyperparathyroidism.','Levels are often checked after dose changes, adherence concerns, side effects, dehydration/illness, or interacting medication changes.'])),
    kbPanel('Provider-review flags', kbList(['Nausea/vomiting, diarrhea, worsening tremor, confusion, weakness, trouble walking, severe sedation.','Dehydration, fever, heavy sweating, acute illness, or major sodium/fluid change.','New NSAID, ACE inhibitor/ARB, diuretic, or other interacting medication reported.','Level not drawn as trough or timing unknown.'])),
    kbPanel('Handoff note', '“Lithium level/labs available or pending. Last dose time: __. Draw time: __. Symptoms/concerns: __. Provider review requested.”')
  ]},
  {type:'labs',title:'Valproate / divalproex level handoff',sub:'Trough timing, liver/CBC context, and symptom flags',icon:'VPA',tags:['Labs','Drug levels','Valproate','Mood stabilizer'],search:'valproate valproic acid divalproex level trough LFT CBC platelets ammonia pregnancy symptoms toxicity',rows:[
    kbPanel('Timing', 'Valproate levels are usually most useful as a trough, commonly just before the next dose. Document last dose and draw time when possible.'),
    kbPanel('Common associated labs', kbList(['Liver function/CMP.','CBC with platelets.','Pregnancy-related considerations when applicable.','Ammonia may be ordered if symptoms suggest encephalopathy, per provider judgment.'])),
    kbPanel('Provider-review flags', kbList(['Extreme sedation, confusion, vomiting, abdominal pain, jaundice, unusual bruising/bleeding.','Pregnancy or possible pregnancy.','Level drawn at wrong/unclear time.','Reported missed doses or extra doses.'])),
    kbPanel('Handoff note', '“Valproate/divalproex level available or pending. Last dose time: __. Draw time: __. CBC/CMP status: __. Symptoms/concerns: __.”')
  ]},
  {type:'labs',title:'Carbamazepine / oxcarbazepine labs',sub:'Levels, sodium, CBC/CMP, and rash precautions',icon:'CBZ',tags:['Labs','Drug levels','Carbamazepine','Oxcarbazepine','Mood stabilizer'],search:'carbamazepine level trough CBC CMP sodium oxcarbazepine hyponatremia rash Stevens Johnson',rows:[
    kbPanel('Timing', 'Carbamazepine levels are typically interpreted as troughs; document last dose and draw time. Oxcarbazepine monitoring often emphasizes sodium and clinical status rather than a routine serum level.'),
    kbPanel('Common associated labs', kbList(['CBC and CMP/LFTs for carbamazepine.','Sodium level especially for oxcarbazepine or symptoms of hyponatremia.','Pregnancy and interaction considerations per provider.'])),
    kbPanel('Provider-review flags', kbList(['Rash, mouth sores, fever, sore throat, or flu-like symptoms.','Dizziness, ataxia, diplopia, confusion, severe sedation.','Low sodium symptoms: headache, confusion, weakness, seizures.','Level timing unclear or recent interacting medication change.'])),
    kbPanel('Handoff note', '“Carbamazepine/oxcarbazepine monitoring result available or pending. Last dose/draw timing: __. Sodium/CBC/CMP status: __. Symptoms/concerns: __.”')
  ]},
  {type:'labs',title:'Clozapine ANC and level handoff',sub:'ANC schedule concepts, clozapine/norclozapine levels, and urgent symptoms',icon:'CLZ',tags:['Labs','Drug levels','Clozapine','ANC','Safety'],search:'clozapine ANC monitoring weekly every two weeks monthly clozapine level norclozapine smoking infection seizure myocarditis constipation',rows:[
    kbPanel('ANC schedule concept', kbList(['Baseline ANC is required before starting.','Common product-label schedule: weekly for first 6 months, every 2 weeks for months 7–12, then monthly if acceptable ANC is maintained.','BEN/Duffy-null associated neutrophil count has different ANC thresholds; provider/pharmacy protocol should direct.'])),
    kbPanel('Clozapine level context', kbList(['Clozapine/norclozapine levels may help evaluate adherence, toxicity, smoking changes, infection/inflammation, interactions, or nonresponse.','Timing matters; document last dose and draw time.','Smoking changes can affect clozapine exposure and should be routed to provider.'])),
    kbPanel('Provider-review flags', kbList(['Fever, sore throat, flu-like illness, signs of infection.','Chest pain, shortness of breath, marked tachycardia, severe fatigue.','Seizure, severe sedation, confusion.','Severe constipation, abdominal pain, vomiting, or no bowel movement.','Smoking stopped/started/changed significantly.'])),
    kbPanel('Handoff note', '“Clozapine ANC/level available or pending. ANC schedule stage: __. Last dose/draw timing: __. Smoking/infection/constipation concerns: __. Provider review requested.”')
  ]},
  {type:'labs',title:'Stimulant / ADHD monitoring cues',sub:'Vitals, growth/appetite, and when labs are not the main monitor',icon:'ADHD',tags:['Labs','Vitals','ADHD','Safety'],search:'stimulant ADHD monitoring blood pressure heart rate weight appetite growth labs ECG',rows:[
    kbPanel('Core monitoring', 'For stimulant and some non-stimulant ADHD medications, BP/HR, weight, appetite, sleep, and symptom response are often more relevant than routine drug levels.'),
    kbPanel('MA prompts', kbList(['BP/HR obtained if clinic protocol requires.','Weight/appetite/sleep concerns documented.','Chest pain, fainting, palpitations, severe anxiety/agitation, or new tics routed to provider.','For children/adolescents, growth/appetite concerns should be routed.'])),
    kbPanel('ECG/labs', 'ECG or labs are not universal for every ADHD medication; they should follow provider order, cardiac history, symptoms, and clinic protocol.'),
    kbPanel('Handoff note', '“ADHD medication monitoring: BP __ HR __ weight __. Patient reports: __. Provider review requested for: __.”')
  ]},
  {type:'labs',title:'Lab-result workflow for MAs',sub:'How to document, route, and close the loop without over-interpreting',icon:'FLOW',tags:['Labs','Office ops','Provider review'],search:'lab result workflow route provider review patient notified psychiatry office close loop',rows:[
    kbPanel('Intake checklist', kbList(['Result type and date.','Ordering provider.','Medication it relates to.','Whether timing was correct or unknown.','Patient symptoms/comments if they called about the result.','Whether outside lab/fax result is uploaded to Tebra.'])),
    kbPanel('Routing status', kbList(['FYI only.','Provider review requested.','Urgent provider review.','Patient asking for results.','Repeat lab/order needed per provider direction.'])),
    kbPanel('Patient communication', 'Avoid giving detailed interpretation unless a provider has reviewed and documented instructions. Use “Your provider will review the result and the office will follow up if any action is needed,” unless clinic policy says otherwise.'),
    kbPanel('Closeout phrase', '“Lab result routed to provider. Patient notified per provider direction: __. Follow-up/repeat lab status: __.”')
  ]}
];

const TMS_KB=[
  {type:'tms',title:'TMS future workflow scaffold',sub:'Placeholder knowledge base for upcoming TMS operations',icon:'TMS',tags:['TMS','Coming soon','Workflow'],search:'TMS rTMS depression treatment session workflow PHQ9 GAD7 technician note safety screen',rows:[
    kbPanel('Core session data', kbList(['Patient and treatment number.','Protocol/device once confirmed.','Motor threshold date and treatment intensity.','Session tolerance, side effects, and technician initials.','Next appointment/status.'])),
    kbPanel('Symptom tracking', 'Plan for PHQ-9 / GAD-7 cadence once clinic protocol is finalized. Consider baseline, periodic interval, and end-of-course summary.'),
    kbPanel('MA note style', '“TMS session #__ completed per protocol. Patient tolerated treatment without acute complication. Side effects/safety concerns: __. Next session: __.”')
  ]},
  {type:'tms',title:'TMS safety screen concepts',sub:'Items to confirm with the TMS provider/protocol',icon:'SAFE',tags:['TMS','Safety','Provider review'],search:'TMS safety seizure risk metal implants hearing protection headache scalp discomfort medication changes sleep alcohol',rows:[
    kbPanel('Provider-review triggers', kbList(['New seizure, fainting, neurologic event, or head injury.','Medication changes that may affect seizure threshold.','Significant sleep deprivation, alcohol/substance change, or withdrawal concern.','New implanted metal/electronic device concern near head/neck.','Severe headache, scalp pain, hearing concern, or new mania/activation symptoms.'])),
    kbPanel('Common patient experience', 'Many patients report mild headache or scalp discomfort; serious events like seizure are rare but protocol-dependent.'),
    kbPanel('Before go-live', 'Confirm device-specific checklist, contraindications, hearing protection workflow, emergency process, and documentation requirements.')
  ]}
];

const PSYCH_KB=[
  {type:'safety',title:'Vitals / provider-review prompts',sub:'Operational thresholds to route, not diagnose',icon:'VS',tags:['Safety','Vitals','Injection'],search:'vitals blood pressure heart rate temperature provider review injection psychiatry MA',rows:[
    kbPanel('Urgent review examples', kbList(['Very high BP, especially ≥180 systolic or ≥120 diastolic.','Chest pain, shortness of breath, palpitations, syncope, severe dizziness, fall concern.','Fever with rigidity/confusion or severe muscle symptoms.','Severe injection-site reaction, allergic symptoms, or acute neurologic symptoms.'])),
    kbPanel('Documentation tone', 'Use “provider notified / provider review requested / held per provider” rather than staff clinical conclusions.'),
    kbPanel('Clinic settings', 'Consider a future protocol drawer so IPMG can set yellow/red thresholds and escalation wording by provider-approved policy.')
  ]},
  {type:'ops',title:'Provider handoff language',sub:'Useful phrases for MA documentation across modules',icon:'H/O',tags:['Ops','Handoff','Tebra'],search:'provider handoff note language staff documentation psych clinic tebra',rows:[
    kbPanel('Use', kbList(['“Provider review requested.”','“Routed to provider for review.”','“No final clinical interpretation made by staff.”','“Patient comment/context documented as reported.”','“Outside lab confirmation may be ordered if clinically indicated.”'])),
    kbPanel('Avoid', kbList(['“Patient is inconsistent.”','“Patient failed UDS.”','“Medication is contraindicated” unless the prescriber/policy directly determines it.','Definitive diagnosis/work restriction wording without provider approval.'])),
    kbPanel('Thumbnail formula', 'Task — key abnormal/important finding; action needed; status. Example: “UDS handoff — +THC/+BZO; not readily explained by available med list; provider review requested.”')
  ]},
  {type:'ops',title:'Letters & forms guardrails',sub:'Draft support without overstepping provider/legal decisions',icon:'LTR',tags:['Forms','Letters','Ops'],search:'forms letters diagnosis off work return to work provider approval psychiatry office',rows:[
    kbPanel('Staff role', 'Prepare drafts, track status, collect context, and route to provider. Provider determines diagnosis language, restrictions, dates, and release.'),
    kbPanel('Before release', kbList(['Correct patient and DOB.','Recipient and purpose clear.','Provider/signature selected.','Fee/status handled if clinic policy applies.','Diagnosis, off-work, restrictions, and return-to-work language approved by provider.'])),
    kbPanel('Handoff phrase', '“Draft prepared for provider review/signature; not released pending provider approval.”')
  ]}
];

function allKbItems(){
  return [
    ...MEDS.filter(m=>m.key!=='other').map(laiToKb),
    ...UDS_KB,
    ...SAMPLE_KB,
    ...LABS_KB,
    ...TMS_KB,
    ...PSYCH_KB
  ];
}
function renderKbFilters(){
  const box=$('kbFilters'); if(!box) return;
  box.innerHTML='';
  KB_CATEGORIES.forEach(c=>{
    const b=document.createElement('button'); b.type='button'; b.className='kb-filter'+(KB_FILTER===c.k?' on':''); b.textContent=c.l;
    b.addEventListener('click',()=>{KB_FILTER=c.k; renderKbFilters(); renderRef($('refSearch')?.value||'');});
    box.appendChild(b);
  });
}
function renderRef(filter){
  const grid=$('refGrid'); if(!grid) return; grid.innerHTML='';
  const f=(filter||'').toLowerCase().trim();
  const items=allKbItems().filter(item=>{
    const catOk=KB_FILTER==='all'||item.type===KB_FILTER||item.tags.some(t=>t.toLowerCase().includes(KB_FILTER));
    const hay=[item.title,item.sub,item.search,item.tags.join(' ')].join(' ').toLowerCase();
    return catOk && (!f || hay.includes(f));
  });
  items.forEach((item,idx)=>{
    const card=document.createElement('div'); card.className='kb-card'+(idx<2?' open':'');
    card.innerHTML=`
      <div class="kh"><div class="kicon">${esc(item.icon||'KB')}</div><div><div class="ktitle">${esc(item.title)}</div><div class="ksub">${esc(item.sub||'')}</div></div>
        <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></div>
      <div class="kb-tags">${item.tags.map(t=>`<span class="kb-tag">${esc(t)}</span>`).join('')}</div>
      <div class="kb-body">${item.rows.join('')}</div>`;
    card.querySelector('.kh').addEventListener('click',()=>card.classList.toggle('open'));
    grid.appendChild(card);
  });
  if(!items.length) grid.innerHTML=`<div class="logempty">No knowledge-base entries match “${esc(filter)}”.</div>`;
}
renderKbFilters();
if($('refSearch')) $('refSearch').addEventListener('input',e=>renderRef(e.target.value));



/* ---------- welcome dashboard ---------- */
function workflowPatient(){
  const choices=[
    {n:$('ptName')?.value?.trim(), d:$('ptDOB')?.value?.trim()},
    {n:$('udsPtName')?.value?.trim(), d:$('udsDOB')?.value?.trim()},
    {n:$('samplePtName')?.value?.trim(), d:$('sampleDOB')?.value?.trim()},
    {n:$('formsPtName')?.value?.trim(), d:$('formsDOB')?.value?.trim()}
  ];
  const picked=choices.find(x=>x.n)||choices[0]||{};
  return {name:picked.n||'',dob:picked.d||''};
}
/* Distinguish a genuinely-started workflow from default form seeding (UDS seeds all-negative
   panels; Samples seeds a default medication). Used by the dashboard and workflow-QA cards. */
function udsEngaged(){
  if(($('udsPtName')?.value||'').trim()) return true;
  if(typeof UDS_PANELS!=='undefined' && UDS_PANELS.some(p=>UDS.results[p]==='pos'||UDS.results[p]==='invalid')) return true;
  if(typeof UDS!=='undefined' && UDS.control==='invalid') return true;
  return false;
}
function samplesEngaged(){
  if(($('samplePtName')?.value||'').trim()) return true;
  if(($('sampleLot')?.value||'').trim()) return true;
  if(($('sampleExp')?.value||'').trim()) return true;
  if(($('sampleStaff')?.value||'').trim()) return true;
  if(typeof SAMPLE_STATE!=='undefined' && SAMPLE_STATE.med && typeof SAMPLE_MEDS!=='undefined' && SAMPLE_MEDS[0] && SAMPLE_STATE.med.key!==SAMPLE_MEDS[0].key) return true;
  return false;
}
function homeLine(label, text, level='idle'){
  return `<div class="home-check ${level}"><span class="marker"></span><span class="txt"><b>${esc(label)}</b>${esc(text)}</span></div>`;
}
function workflowQaItem(name,state,detail,actions){
  const level=state==='ready'?'ready':state==='danger'?'danger':state==='warn'?'warn':'idle';
  const stateLabel=state==='ready'?'Ready':state==='danger'?'Action':state==='warn'?'Check':'Idle';
  const btns=(actions||[]).map(a=>`<button type="button" class="workflow-qa-btn ${a.primary?'primary':''}" data-qa-action="${esc(a.action)}">${esc(a.label)}</button>`).join('');
  return `<div class="workflow-qa-item ${level}"><div class="workflow-qa-top"><span class="workflow-qa-dot"></span><span class="workflow-qa-name">${esc(name)}</span><span class="workflow-qa-state">${esc(stateLabel)}</span></div><div class="workflow-qa-detail">${esc(detail)}</div><div class="workflow-qa-actions">${btns}</div></div>`;
}
function workflowQaRows(){
  const rows=[];
  const injSelected=!!S.med;
  const injMiss=[]; if(injSelected&&!$('ndc')?.value.trim()) injMiss.push('NDC'); if(injSelected&&!$('lot')?.value.trim()) injMiss.push('lot'); if(injSelected&&!$('exp')?.value) injMiss.push('expiration');
  const injSafety=injSelected && typeof injectionSafetyMessages==='function'?injectionSafetyMessages():[];
  rows.push(workflowQaItem('Injection', !injSelected?'idle':(injSafety.length?'warn':injMiss.length?'warn':'ready'), !injSelected?'Select an LAI medication to start the injection workflow.':injSafety.length?`Provider/safety review prompt present: ${injSafety[0]}`:injMiss.length?`Traceability missing: ${injMiss.join(', ')}.`:'Ready for note, AVS, and activity log.', [{label:'Open',action:'tab:administer',primary:!injSelected||injMiss.length||injSafety.length},{label:'Print AVS',action:'print:avs'}]));

  const udsStarted=udsEngaged();
  const ctrl=(typeof UDS_CONTROL!=='undefined' && UDS.control)||'';
  const pos=typeof UDS_PANELS!=='undefined'?UDS_PANELS.filter(p=>UDS.results[p]==='pos'):[];
  const inv=typeof UDS_PANELS!=='undefined'?UDS_PANELS.filter(p=>UDS.results[p]==='invalid'):[];
  const udsMiss=udsStarted?udsTraceIssues():[];
  rows.push(workflowQaItem('UDS', !udsStarted?'idle':ctrl==='invalid'?'danger':(pos.length||inv.length||udsMiss.length?'warn':'ready'), !udsStarted?'No UDS encounter started yet.':ctrl==='invalid'?'Control line is invalid — do not interpret results.':pos.length||inv.length?`${pos.length} preliminary positive / ${inv.length} invalid panel(s); handoff should be reviewed.`:udsMiss.length?`Traceability missing: ${udsMiss.join(', ')}.`:'Ready for handoff, report, patient summary, and log.', [{label:'Open',action:'tab:uds',primary:udsStarted&&ctrl==='invalid'},{label:'Patient summary',action:'print:udsPatient'}]));

  const smed=samplesEngaged();
  const sampleMiss=[]; if(smed&&!$('sampleQty')?.value.trim()) sampleMiss.push('quantity/package'); if(smed&&!$('sampleLot')?.value.trim()) sampleMiss.push('lot'); if(smed&&!$('sampleExp')?.value) sampleMiss.push('expiration');
  rows.push(workflowQaItem('Samples', !smed?'idle':(sampleMiss.length?'warn':'ready'), !smed?'Select a PO sample medication to start the handout/dispensing workflow.':sampleMiss.length?`Before dispensing/logging, check ${sampleMiss.join(', ')}.`:'Ready for patient handout, dispensing note, and log.', [{label:'Open',action:'tab:samples',primary:!!sampleMiss.length},{label:'Print handout',action:'print:sample'}]));

  const formStarted=!!($('formsPtName')?.value.trim()||$('formsProvider')?.value.trim()||$('formsNotes')?.value.trim()||$('letterSubject')?.value.trim());
  const fIssues=formStarted && typeof formsReadinessIssues==='function'?formsReadinessIssues():[];
  rows.push(workflowQaItem('Forms / letters', !formStarted?'idle':(fIssues.length?'warn':'ready'), !formStarted?'No paperwork request started yet.':fIssues.length?`Track before release: ${fIssues.join(', ')}.`:'Ready for provider review, PDF/print, and log.', [{label:'Open',action:'tab:forms',primary:!!fIssues.length},{label:'Print letter',action:'print:letter'}]));
  return rows;
}
function renderWorkflowQa(){
  const grid=$('workflowQaGrid'); if(!grid)return;
  grid.innerHTML=workflowQaRows().join('');
}
function wireWorkflowQa(){
  const grid=$('workflowQaGrid'); if(!grid)return;
  grid.addEventListener('click',e=>{
    const b=e.target.closest('[data-qa-action]'); if(!b)return;
    const a=b.dataset.qaAction||'';
    if(a.startsWith('tab:')){window.IPMGNavigation?.activate(a.split(':')[1],{focusPanel:true,resetScroll:true});return;}
    if(a==='print:avs' && $('printAVS')) return $('printAVS').click();
    if(a==='print:udsPatient' && $('printUdsPatient')) return $('printUdsPatient').click();
    if(a==='print:sample' && $('samplePrint')) return $('samplePrint').click();
    if(a==='print:letter' && $('letterPrint')) return $('letterPrint').click();
  });
}
function renderHome(){
  const p=workflowPatient();
  if($('homePatient')) $('homePatient').textContent=p.name||'No patient selected';
  if($('homeMeta')) $('homeMeta').textContent=p.dob?`DOB ${p.dob}`:'Use any workflow below, then return here for the next best action.';
  const needs=(Array.isArray(LOG)?LOG:[]).filter(x=>(x.status||'').toLowerCase().includes('review')).length;
  if($('homeTodayTotal')) $('homeTodayTotal').textContent=(Array.isArray(LOG)?LOG.length:0);
  if($('homeNeedsReview')) $('homeNeedsReview').textContent=needs;
  const lines=[];
  if(!p.name) lines.push(homeLine('Start patient context','Enter patient name/DOB in Injection, UDS, or Samples.', 'idle'));
  if(S.med){
    const injMissing=[]; if(!$('ndc')?.value.trim()) injMissing.push('NDC'); if(!$('lot')?.value.trim()) injMissing.push('lot'); if(!$('exp')?.value) injMissing.push('expiration');
    const vit=typeof injectionSafetyMessages==='function'?injectionSafetyMessages():[];
    lines.push(homeLine('Injection', injMissing.length?`Missing ${injMissing.join(', ')} before final documentation.`:vit.length?`Safety review item present: ${vit[0]}`:'Ready for note, log, and patient AVS.', injMissing.length||vit.length?'warn':'ready'));
  } else lines.push(homeLine('Injection','No injection medication selected yet.', 'idle'));
  const udsAny=udsEngaged();
  if(udsAny){
    const pos=UDS_PANELS.filter(p=>UDS.results[p]==='pos');
    const inv=UDS_PANELS.filter(p=>UDS.results[p]==='invalid');
    const ctrl=(typeof UDS_CONTROL!=='undefined' && UDS.control)||'';
    lines.push(homeLine('UDS', ctrl==='invalid'?'Invalid control — do not interpret.':pos.length||inv.length?`${pos.length} preliminary positive / ${inv.length} invalid panel(s); provider review likely.`:'UDS appears routine; review traceability before logging.', ctrl==='invalid'?'danger':(pos.length||inv.length?'warn':'ready')));
  } else lines.push(homeLine('UDS','No UDS documented yet.', 'idle'));
  const smed=samplesEngaged();
  if(smed){
    const missing=[]; if(!$('sampleQty')?.value.trim()) missing.push('quantity/package'); if(!$('sampleLot')?.value.trim()) missing.push('lot'); if(!$('sampleExp')?.value) missing.push('expiration');
    lines.push(homeLine('Samples', missing.length?`Missing ${missing.join(', ')}.`:'Sample handout and dispensing note are ready to review.', missing.length?'warn':'ready'));
  } else lines.push(homeLine('Samples','No sample medication selected yet.', 'idle'));
  if($('formsPtName') && ($('formsPtName').value.trim()||$('formsProvider').value.trim()||$('formsNotes').value.trim())){
    const fIssues=typeof formsReadinessIssues==='function'?formsReadinessIssues():[];
    lines.push(homeLine('Forms / letters', fIssues.length?`Check ${fIssues.join(', ')}.`:`${currentFormType().t} is being tracked.`, fIssues.length?'warn':'ready'));
  } else lines.push(homeLine('Forms / letters','No paperwork request started yet.', 'idle'));
  lines.push(homeLine('TMS','Placeholder ready. Build once device/protocol workflow is confirmed.', 'idle'));
  if($('homeReadiness')) $('homeReadiness').innerHTML=lines.join('');
  renderWorkflowQa();
}
function activeTabName(){return document.querySelector('.tab.on')?.dataset.tab||'home';}
function preferredOutputWorkflow(){
  const last=window.IPMGNavigation&&window.IPMGNavigation.state&&window.IPMGNavigation.state.lastClinical;
  if(['administer','uds','samples','forms'].includes(last))return last;
  const engaged=[];
  if(S&&S.med)engaged.push('administer');
  if(typeof udsEngaged==='function'&&udsEngaged())engaged.push('uds');
  if(typeof samplesEngaged==='function'&&samplesEngaged())engaged.push('samples');
  if($('formsPtName')&&($('formsPtName').value.trim()||$('formsProvider').value.trim()||$('formsNotes').value.trim()))engaged.push('forms');
  return engaged.length===1?engaged[0]:'';
}
function wireHomeDashboard(){
  document.querySelectorAll('[data-home-action]').forEach(btn=>btn.addEventListener('click',()=>{
    const a=btn.dataset.homeAction;
    const tab=preferredOutputWorkflow();
    if(a==='copy-note'){
      if(!tab){toast('Open or resume a documentation workflow before using the active-note shortcut.');return;}
      if(tab==='uds' && $('udsCopyAll')) $('udsCopyAll').click();
      else if(tab==='samples' && $('sampleCopy')) $('sampleCopy').click();
      else if(tab==='forms' && $('formsCopy')) $('formsCopy').click();
      else if($('copyAll')) $('copyAll').click();
    }
    if(a==='packet'){
      if(!tab){toast('Open or resume a documentation workflow before using the patient-printout shortcut.');return;}
      if(tab==='uds' && $('printUdsPatient')) $('printUdsPatient').click();
      else if(tab==='samples' && $('samplePrint')) $('samplePrint').click();
      else if(tab==='forms' && $('letterPrint')) $('letterPrint').click();
      else if($('printAVS')) $('printAVS').click();
    }
  }));
}

/* ---------- tabs ---------- */
(function(){
  const state={scroll:{},lastClinical:''};
  const clinicalTabs=new Set(['administer','uds','samples','forms']);
  const tabs=()=>[...document.querySelectorAll('.tab[data-tab]')];
  const panel=name=>$('panel-'+name);
  const reducedMotion=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let topScrollCommit=0;
  window.addEventListener('scroll',()=>{
    const active=tabs().find(tab=>tab.classList.contains('on'));
    const name=active&&active.dataset.tab||'';
    if(!name)return;
    const y=window.scrollY||0;
    clearTimeout(topScrollCommit);
    if(y>0){
      state.scroll[name]=y;
      return;
    }
    /* A browser may briefly scroll the sticky navigator into view immediately
       before dispatching its click. Commit an intentional return-to-top only
       after the active workspace has remained there for a moment. */
    topScrollCommit=setTimeout(()=>{
      const stillActive=tabs().find(tab=>tab.classList.contains('on'))?.dataset.tab;
      if(stillActive===name&&(window.scrollY||0)===0)state.scroll[name]=0;
    },180);
  },{passive:true});
  function sync(){
    const all=tabs(),list=all[0]&&all[0].parentElement;
    if(list){list.setAttribute('role','tablist');list.setAttribute('aria-label','Workspace modules');}
    all.forEach((tab,index)=>{
      const selected=tab.classList.contains('on'),target=panel(tab.dataset.tab);
      if(!tab.id)tab.id='workspace-tab-'+(index+1);
      tab.setAttribute('role','tab');tab.setAttribute('aria-controls','panel-'+tab.dataset.tab);
      tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
      if(target){
        target.setAttribute('role','tabpanel');target.setAttribute('aria-labelledby',tab.id);
        target.setAttribute('aria-hidden',String(!selected));
      }
    });
  }
  function focusPanel(name){
    const targetPanel=panel(name);if(!targetPanel)return;
    const anchor=targetPanel.querySelector('h1,h2,.panel-title,.home-title')||targetPanel;
    if(!anchor.hasAttribute('tabindex'))anchor.setAttribute('tabindex','-1');
    anchor.classList.add('module-focus-anchor');
    try{anchor.focus({preventScroll:true});}catch(e){anchor.focus();}
  }
  function activate(name,options={}){
    const target=tabs().find(tab=>tab.dataset.tab===name),targetPanel=panel(name);if(!target||!targetPanel)return false;
    const current=tabs().find(tab=>tab.classList.contains('on'));
    const currentName=current&&current.dataset.tab||'';
    if(currentName&&currentName!==name){
      const liveScroll=window.scrollY||0;
      if(liveScroll>0||!Object.prototype.hasOwnProperty.call(state.scroll,currentName))state.scroll[currentName]=liveScroll;
    }
    tabs().forEach(tab=>tab.classList.toggle('on',tab===target));
    document.querySelectorAll('.panel').forEach(item=>item.classList.toggle('on',item===targetPanel));
    if(clinicalTabs.has(name))state.lastClinical=name;
    sync();
    try{if(typeof renderHome==='function')renderHome();}catch(e){}
    try{if(typeof renderCommandCenter==='function')renderCommandCenter();}catch(e){}
    if(currentName!==name){
      const panelTop=Math.max(0,Math.round(targetPanel.getBoundingClientRect().top+(window.scrollY||0)-24));
      const top=options.resetScroll?panelTop:(Object.prototype.hasOwnProperty.call(state.scroll,name)?state.scroll[name]:panelTop);
      window.scrollTo({top,behavior:'auto'});
      if(options.focusPanel)requestAnimationFrame(()=>focusPanel(name));
      document.dispatchEvent(new CustomEvent('ipmg:tabchange',{detail:{from:currentName,to:name}}));
    }else if(options.focusPanel)requestAnimationFrame(()=>focusPanel(name));
    if(options.focusTab)target.focus({preventScroll:true});
    requestAnimationFrame(()=>{
      const rail=target.closest('.tabs');
      if(!rail||getComputedStyle(rail).flexDirection!=='row'||rail.scrollWidth<=rail.clientWidth+2)return;
      const left=target.offsetLeft,right=left+target.offsetWidth;
      const viewLeft=rail.scrollLeft,viewRight=viewLeft+rail.clientWidth;
      const next=left<viewLeft?Math.max(0,left-8):(right>viewRight?right-rail.clientWidth+8:viewLeft);
      if(next!==viewLeft)rail.scrollTo({left:next,behavior:reducedMotion()?'auto':'smooth'});
    });
    return true;
  }
  const list=document.querySelector('.tabs');
  if(list){
    list.addEventListener('keydown',event=>{
      const tab=event.target.closest('.tab[data-tab]');if(!tab)return;
      if(!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key))return;
      event.preventDefault();
      const all=tabs(),index=all.indexOf(tab);let next=index;
      if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%all.length;
      if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index-1+all.length)%all.length;
      if(event.key==='Home')next=0;if(event.key==='End')next=all.length-1;
      activate(all[next].dataset.tab,{focusTab:true});
    });
  }
  tabs().forEach(tab=>tab.addEventListener('click',()=>activate(tab.dataset.tab)));
  window.IPMGNavigation={activate,sync,focusPanel,state,reducedMotion};
  sync();
})();
wireHomeDashboard();
wireWorkflowQa();
renderHome();



/* ---------- responsive click safety ---------- */
document.addEventListener('click', e => {
  if(!window.matchMedia || !window.matchMedia('print').matches){
    if(document.body.classList.contains('print-uds') || document.body.classList.contains('print-uds-patient') || document.body.classList.contains('print-sample') || document.body.classList.contains('print-daily') || document.body.classList.contains('print-letter')) cleanPrintClasses();
  }
}, true);


let _homeTimer=null;
function scheduleHomeRender(){clearTimeout(_homeTimer);_homeTimer=setTimeout(()=>{if(typeof renderHome==='function')renderHome();},80);}
document.addEventListener('input',scheduleHomeRender,true);
document.addEventListener('change',scheduleHomeRender,true);

/* ---------- wire inputs ---------- */
["ptName","orderingProvider","tech","ndc","lot","exp","allergies","bp","hr","temp","admin","respCustom"].forEach(id=>{const el=$(id);if(el)el.addEventListener("input",render);});
$("ptDOB").addEventListener("input",e=>{e.target.value=fmtDOB(e.target.value);render();});
$("ptName").addEventListener("input",renderSMS);
["udsPtName","udsCollector","udsLot","udsExp","udsComment"].forEach(id=>{const el=$(id);if(el)el.addEventListener("input",renderUdsNote);});
["udsDevice","udsDateTime","udsValidity","udsConsistent","udsLab"].forEach(id=>{const el=$(id);if(el)el.addEventListener("change",renderUdsNote);});
if($("udsPhoto"))$("udsPhoto").addEventListener("change",e=>{
  const file=e.target.files&&e.target.files[0];
  if(!file){UDS.photoData="";if($("udsPhotoPreview")){$("udsPhotoPreview").src="";$("udsPhotoPreview").classList.add("hidden");}if($("udsPhotoEmpty"))$("udsPhotoEmpty").classList.remove("hidden");return;}
  const reader=new FileReader();
  reader.onload=ev=>{UDS.photoData=ev.target.result;if($("udsPhotoPreview")){$("udsPhotoPreview").src=UDS.photoData;$("udsPhotoPreview").classList.remove("hidden");}if($("udsPhotoEmpty"))$("udsPhotoEmpty").classList.add("hidden");};
  reader.readAsDataURL(file);
});
$("udsDOB").addEventListener("input",e=>{e.target.value=fmtDOB(e.target.value);renderUdsNote();});

/* ---------- init ---------- */
if($("udsDateTime"))$("udsDateTime").value=localDateTimeValue();



/* PASS 42: Forms / professional letter builder — verified working */
const FORM_TYPES=[
  {k:'work',t:'Work / school letter',d:'Work note, school note, accommodation wording.'},
  {k:'disability',t:'Disability / EDD form',d:'Provider-completed form or supplemental paperwork.'},
  {k:'fmla',t:'FMLA / leave paperwork',d:'Leave, intermittent leave, employer forms.'},
  {k:'records',t:'Records / release',d:'Copy request, ROI, outside provider paperwork.'},
  {k:'med',t:'Medication / treatment letter',d:'Medication list, treatment participation, clearance-style request.'},
  {k:'other',t:'Other paperwork',d:'Custom form, letter, or administrative request.'}
];
const FORM_STATUS=[
  {k:'received',l:'Received'}, {k:'provider_review',l:'Provider review'}, {k:'fee_pending',l:'Fee pending'},
  {k:'in_progress',l:'In progress'}, {k:'ready',l:'Ready'}, {k:'notified',l:'Patient notified'}, {k:'completed',l:'Completed'}
];
const LETTER_TYPES=[
  {k:'dx',l:'Diagnosis / treatment verification'},
  {k:'offwork',l:'Off-work letter'},
  {k:'return',l:'Return-to-work letter'},
  {k:'restrictions',l:'Restrictions / accommodations'},
  {k:'custom',l:'Custom provider letter'}
];
const FORMS={type:'work',status:'received'};
const LETTER={type:'dx'};
function currentFormType(){return FORM_TYPES.find(x=>x.k===FORMS.type)||FORM_TYPES[0];}
function currentFormStatus(){return FORM_STATUS.find(x=>x.k===FORMS.status)||FORM_STATUS[0];}
function currentLetterType(){return LETTER_TYPES.find(x=>x.k===LETTER.type)||LETTER_TYPES[0];}
function letterVal(id){return ($(id)?.value||'').trim();}
function dateText(id){return $(id)?.value?fmtDate($(id).value):'';}
function providerDisplayName(){return letterVal('letterProvider')||letterVal('formsProvider')||'[Provider name]';}
function providerDisplayCreds(){return letterVal('letterCreds');}
function letterFullProvider(){const name=providerDisplayName(); const creds=providerDisplayCreds(); return creds?`${name}, ${creds}`:name;}
function renderFormsTypeGrid(){
  const grid=$('formsTypeGrid'); if(!grid)return; grid.innerHTML='';
  FORM_TYPES.forEach(x=>{const el=document.createElement('div');el.className='form-kind '+(FORMS.type===x.k?'on':'');el.innerHTML=`<div class="t">${esc(x.t)}</div><div class="d">${esc(x.d)}</div>`;el.addEventListener('click',()=>{FORMS.type=x.k;renderFormsTypeGrid();renderForms();});grid.appendChild(el);});
}
function renderFormsStatusChips(){
  const box=$('formsStatusChips'); if(!box)return; box.innerHTML='';
  FORM_STATUS.forEach(x=>{const el=document.createElement('button');el.type='button';el.className='form-status '+(FORMS.status===x.k?'on':'');el.innerHTML=`<span class="dot"></span>${esc(x.l)}`;el.addEventListener('click',()=>{FORMS.status=x.k;renderFormsStatusChips();renderForms();});box.appendChild(el);});
}
function renderLetterTypeChips(){
  const box=$('letterTypeChips'); if(!box)return; box.innerHTML='';
  LETTER_TYPES.forEach(x=>{const b=document.createElement('button');b.type='button';b.className='letter-chip '+(LETTER.type===x.k?'on':'');b.textContent=x.l;b.addEventListener('click',()=>{LETTER.type=x.k;renderLetterTypeChips();renderForms();});box.appendChild(b);});
}
function letterSubjectText(){
  const custom=letterVal('letterSubject'); if(custom)return custom;
  if(LETTER.type==='offwork')return 'Work Status Letter';
  if(LETTER.type==='return')return 'Return to Work Letter';
  if(LETTER.type==='restrictions')return 'Restrictions / Accommodation Letter';
  if(LETTER.type==='custom')return 'Provider Letter';
  return 'Diagnosis / Treatment Verification Letter';
}
function letterBodyParagraphs(){
  const pt=letterVal('formsPtName')||'[Patient name]';
  const dob=letterVal('formsDOB');
  const provider=letterFullProvider();
  const dx=letterVal('letterDx');
  const restr=letterVal('letterRestrictions');
  const offStart=dateText('letterOffStart'), offEnd=dateText('letterOffEnd'), ret=dateText('letterReturn');
  const patientPhrase=`${pt}${dob?' (DOB '+dob+')':''}`;
  const paragraphs=[];
  if(LETTER.type==='dx'){
    paragraphs.push(`This letter is to verify that ${patientPhrase} is an established patient under the care of ${provider} at Inland Psychiatric Medical Group.`);
    paragraphs.push(dx?`Provider-approved clinical information: ${dx}`:'Clinical information or diagnosis wording should be completed by the provider if release is appropriate.');
    if(restr)paragraphs.push(`Additional provider-approved note: ${restr}`);
  } else if(LETTER.type==='offwork'){
    paragraphs.push(`${patientPhrase} is under the care of ${provider} at Inland Psychiatric Medical Group.`);
    const range = offStart||offEnd ? ` from work${offStart?' beginning '+offStart:''}${offEnd?' through '+offEnd:''}` : ' from work for the dates specified by the provider';
    paragraphs.push(`Based on provider review, the patient is excused${range}.${ret?` The anticipated return-to-work date is ${ret}.`:''}`);
    paragraphs.push(restr?`Work restrictions / additional instructions: ${restr}`:'Any work restrictions or additional instructions should be completed by the provider before release.');
  } else if(LETTER.type==='return'){
    paragraphs.push(`${patientPhrase} is under the care of ${provider} at Inland Psychiatric Medical Group.`);
    paragraphs.push(`Based on provider review, the patient may return to work${ret?' on '+ret:''}.`);
    paragraphs.push(restr?`Restrictions / accommodations: ${restr}`:'No restrictions are listed in this draft unless added and approved by the provider.');
  } else if(LETTER.type==='restrictions'){
    paragraphs.push(`${patientPhrase} is under the care of ${provider} at Inland Psychiatric Medical Group.`);
    paragraphs.push(`Provider-approved restrictions or accommodations: ${restr||'[Provider-approved restrictions/accommodations]'}`);
    if(dx)paragraphs.push(`Clinical basis, if provider approves release: ${dx}`);
  } else {
    paragraphs.push(`${patientPhrase} is under the care of ${provider} at Inland Psychiatric Medical Group.`);
    paragraphs.push(restr||dx||'[Provider to complete custom letter wording]');
  }
  return paragraphs;
}
function letterDraftText(){
  const date=dateText('letterDate')||fmtDate(localDateValue());
  const recipient=letterVal('letterRecipient')||'To Whom It May Concern';
  const address=letterVal('letterRecipientAddress');
  const provider=letterFullProvider();
  const sigMode=$('letterSignatureMode')?.value||'wet';
  const parts=[date,'',recipient];
  if(address)parts.push(address);
  parts.push('',`RE: ${letterSubjectText()}`,'');
  letterBodyParagraphs().forEach(p=>parts.push(p,''));
  parts.push('Sincerely,','');
  if(sigMode==='wet')parts.push('______________________________');
  if(sigMode==='electronic')parts.push(`Electronically reviewed / approved by ${provider}`);
  parts.push(provider,'Inland Psychiatric Medical Group');
  const prepared=letterVal('letterPreparedBy')||letterVal('formsStaff');
  if(prepared)parts.push('',`Prepared by: ${prepared}`);
  return parts.join('\n').replace(/\n{3,}/g,'\n\n');
}
function renderLetterPreviewHtml(){
  const lp=$('letterPreview'); if(!lp)return;
  const date=dateText('letterDate')||fmtDate(localDateValue());
  const recipient=letterVal('letterRecipient')||'To Whom It May Concern';
  const address=letterVal('letterRecipientAddress');
  const provider=letterFullProvider();
  const sigMode=$('letterSignatureMode')?.value||'wet';
  const paragraphs=letterBodyParagraphs().map(p=>`<p>${esc(p)}</p>`).join('');
  const sig=sigMode==='wet'?`<div class="lp-sig"><div class="lp-line">${esc(provider)}<br>Inland Psychiatric Medical Group</div></div>`:sigMode==='electronic'?`<div class="lp-sig"><p><b>${esc(provider)}</b><br>Electronically reviewed / approved by provider.</p></div>`:`<div class="lp-sig"><p><b>${esc(provider)}</b><br>Inland Psychiatric Medical Group</p></div>`;
  lp.innerHTML=`<div class="letter-preview-page"><div class="lp-head"><p class="lp-brand">Inland Psychiatric Medical Group</p><div class="lp-sub">Professional letter draft · provider approval required before release</div></div><div class="lp-body"><p>${esc(date)}</p><p>${esc(recipient)}${address?'<br>'+esc(address).replace(/\n/g,'<br>'):''}</p><div class="lp-subject">RE: ${esc(letterSubjectText())}</div>${paragraphs}<p>Sincerely,</p>${sig}</div></div>`;
}
function renderLetterSheet(){
  const sheet=$('letterSheet'); if(!sheet)return;
  const date=dateText('letterDate')||fmtDate(localDateValue());
  const recipient=letterVal('letterRecipient')||'To Whom It May Concern';
  const address=letterVal('letterRecipientAddress');
  const provider=providerDisplayName();
  const creds=providerDisplayCreds();
  const full=letterFullProvider();
  const sigMode=$('letterSignatureMode')?.value||'wet';
  const prepared=letterVal('letterPreparedBy')||letterVal('formsStaff');
  const paragraphs=letterBodyParagraphs().map(p=>`<p>${esc(p)}</p>`).join('');
  let sig='';
  if(sigMode==='wet') sig=`<div class="print-signature"><div class="sig-line"><b>${esc(provider)}</b>${creds?`<br><span class="cred">${esc(creds)}</span>`:''}<br>Inland Psychiatric Medical Group</div></div>`;
  else if(sigMode==='electronic') sig=`<div class="print-electronic"><b>Electronic approval:</b> ${esc(full)} reviewed/approved this letter for release according to clinic policy.</div>`;
  else sig=`<div class="print-signature" style="margin-top:.18in"><b>${esc(full)}</b><br>Inland Psychiatric Medical Group</div>`;
  const preparedHtml=prepared?`<div class="print-prepared">Prepared by: ${esc(prepared)}${letterVal('formsDate')?' · Request date: '+esc(fmtDate(letterVal('formsDate'))):''}</div>`:'';
  const footer='This document should be released only after provider approval and according to clinic policy. Diagnosis, work-status, restrictions, or accommodations should be included only when appropriate authorization/release is confirmed.';
  sheet.innerHTML=`<div class="letter-page-print"><div class="print-letterhead"><div><p class="print-brand">Inland Psychiatric Medical Group</p><div class="print-sub">Psychiatric care · Medication management · Patient documentation</div></div><div class="print-doc">Provider Letter<br><span>Draft / Review</span></div></div><div class="print-date">${esc(date)}</div><div class="print-recipient"><b>${esc(recipient)}</b>${address?'\n'+esc(address):''}</div><div class="print-subject">RE: ${esc(letterSubjectText())}</div><div class="print-body">${paragraphs}</div><div class="print-close">Sincerely,</div>${sig}${preparedHtml}<div class="print-footer">${esc(footer)}</div></div>`;
}
function formsReadinessIssues(){
  const issues=[];
  if(!letterVal('formsPtName'))issues.push('patient name');
  if(!letterVal('formsProvider')&&!letterVal('letterProvider'))issues.push('provider/signature name');
  if(!letterVal('formsStaff')&&!letterVal('letterPreparedBy'))issues.push('prepared by/staff');
  if(!$('formsDue')?.value && ['provider_review','in_progress','fee_pending'].includes(FORMS.status))issues.push('target date');
  if(FORMS.status==='fee_pending')issues.push('fee still pending');
  if(['offwork','return','restrictions'].includes(LETTER.type) && !letterVal('letterRestrictions') && !$('letterReturn')?.value && !$('letterOffStart')?.value)issues.push('letter details');
  if(LETTER.type==='dx' && !letterVal('letterDx'))issues.push('provider-approved clinical wording');
  return issues;
}
function formsNoteText(){
  const type=currentFormType().t, status=currentFormStatus().l, ltype=currentLetterType().l;
  const pt=letterVal('formsPtName')||'Patient';
  const dob=letterVal('formsDOB');
  const provider=letterVal('formsProvider')||letterVal('letterProvider')||'provider to assign/review';
  const staff=letterVal('formsStaff')||letterVal('letterPreparedBy')||'staff not documented';
  const due=$('formsDue')?.value?fmtDate($('formsDue').value):'not set';
  const fee=$('formsFee')?.value||'not documented';
  const del=$('formsDelivery')?.value||'not documented';
  const notify=$('formsNotified')?.value||'not documented';
  const notes=letterVal('formsNotes');
  const approval=letterVal('formsApproval'),action=letterVal('formsAction'),followUp=letterVal('formsFollowUp');
  const parts=[`Forms/letter handoff — ${ltype}; ${status.toLowerCase()}.`,'',`Patient: ${pt}${dob?' · DOB '+dob:''}`,`Request category: ${type}`,`Letter draft type: ${ltype}`,`Status: ${status}`,`Assigned provider: ${provider}`,`Assigned staff: ${staff}`,`Due/target date: ${due}`,`Fee status: ${fee}`,`Delivery/pickup: ${del}`,`Patient notification: ${notify}`];
  if(notes)parts.push('',`Request notes: ${notes}`);
  if(approval)parts.push(`Approval / release: ${approval}`);
  if(action)parts.push('',`Action: ${action}`);
  if(followUp)parts.push(`Follow-up: ${followUp}`);
  return parts.join('\n');
}
function renderForms(){
  const prev=$('formsNotePreview'); if(prev)prev.textContent=formsNoteText();
  renderLetterPreviewHtml();
  const qa=$('formsReadiness'); if(qa){const issues=formsReadinessIssues();renderQaPanel('formsReadiness','Forms readiness', issues.length?issues.map(x=>({level:'warn',text:`Check ${x}`})):[{level:'ok',text:'Forms/letter item has the key tracking fields documented.'}]);}
  if(typeof renderCommandCenter==='function')renderCommandCenter();
  if(typeof renderHome==='function')renderHome();
}
function resetForms(){
  ['formsPtName','formsDOB','formsProvider','formsStaff','formsDue','formsNotes','formsApproval','formsAction','formsFollowUp','letterProvider','letterCreds','letterSubject','letterRecipientAddress','letterPreparedBy','letterOffStart','letterOffEnd','letterReturn','letterDx','letterRestrictions'].forEach(id=>{const el=$(id);if(el)el.value='';});
  if($('formsDate'))$('formsDate').value=localDateValue();
  if($('letterDate'))$('letterDate').value=localDateValue();
  if($('letterRecipient'))$('letterRecipient').value='To Whom It May Concern';
  if($('letterSignatureMode'))$('letterSignatureMode').value='wet';
  if($('formsFee'))$('formsFee').value='No fee / not applicable';
  if($('formsDelivery'))$('formsDelivery').value='Patient pickup';
  if($('formsNotified'))$('formsNotified').value='Not yet notified';
  FORMS.type='work';FORMS.status='received';LETTER.type='dx';renderFormsTypeGrid();renderFormsStatusChips();renderLetterTypeChips();renderForms();
}
function initForms(){
  if(!$('formsPtName'))return;
  if($('formsDate')&&!$('formsDate').value)$('formsDate').value=localDateValue();
  if($('letterDate')&&!$('letterDate').value)$('letterDate').value=localDateValue();
  renderFormsTypeGrid();renderFormsStatusChips();renderLetterTypeChips();
  ['formsPtName','formsProvider','formsStaff','formsDue','formsNotes','formsAction','formsFollowUp','letterRecipient','letterProvider','letterCreds','letterSubject','letterRecipientAddress','letterPreparedBy','letterOffStart','letterOffEnd','letterReturn','letterDx','letterRestrictions'].forEach(id=>{const el=$(id);if(el)el.addEventListener('input',renderForms);});
  ['formsFee','formsDelivery','formsNotified','formsApproval','formsDate','letterDate','letterSignatureMode'].forEach(id=>{const el=$(id);if(el)el.addEventListener('change',renderForms);});
  $('formsDOB')?.addEventListener('input',e=>{e.target.value=fmtDOB(e.target.value);renderForms();});
  $('formsUsePatient')?.addEventListener('click',()=>{$('formsPtName').value=$('ptName').value||$('udsPtName').value||$('samplePtName').value||'';$('formsDOB').value=$('ptDOB').value||$('udsDOB').value||$('sampleDOB').value||'';renderForms();toast('Patient copied into forms module');});
  $('formsUseStaff')?.addEventListener('click',()=>{const staff=(typeof getSignedStaff==='function'&&getSignedStaff())||'';if(staff){$('formsStaff').value=staff;if($('letterPreparedBy')&&!$('letterPreparedBy').value)$('letterPreparedBy').value=staff;renderForms();toast('Staff copied');}else toast('Sign in staff first');});
  $('formsReset')?.addEventListener('click',resetForms);
  $('formsCopy')?.addEventListener('click',()=>copy(formsNoteText(),'Forms handoff note'));
  $('letterCopy')?.addEventListener('click',()=>copy(letterDraftText(),'Letter text'));
  $('letterPrint')?.addEventListener('click',()=>{renderLetterSheet();cleanPrintClasses();document.body.classList.add('print-letter');window.print();setTimeout(cleanPrintClasses,800);});
  $('formsAddLog')?.addEventListener('click',()=>{
    const issues=formsReadinessIssues();
    if(issues.length&&!confirm(`Forms/letter tracking incomplete (${issues.join(', ')}). Add to activity log anyway?`))return;
    const entry={type:'forms',status:FORMS.status==='completed'||FORMS.status==='notified'?'completed':'needs_review',time:nowStamp(),pt:letterVal('formsPtName')||'—',summary:currentLetterType().l,details:`Status: ${currentFormStatus().l} · Provider: ${(letterVal('formsProvider')||letterVal('letterProvider')||'—')}`,trace:[$('formsFee')?.value,$('formsDelivery')?.value].filter(Boolean).join(' · '),follow:`Due: ${$('formsDue')?.value?fmtShort($('formsDue').value):'TBD'} · ${$('formsNotified')?.value||'Not documented'}`,by:letterVal('formsStaff')||letterVal('letterPreparedBy')||'—'};
    if(!appendLogEntry(entry)){toast('Forms/letter item could not be saved to the activity log in this browser.');return;}
    renderLog();renderCommandCenter();toast('Forms/letter item added to activity log');
  });
  renderForms();
}

/* PASS 24: Encounter command center */
function cmdSetCard(id,level,status,detail){
  const card=$(id); if(!card)return;
  card.className='cmd-card '+(level||'idle');
  const st=card.querySelector('.status'),dt=card.querySelector('.detail');
  if(st)st.textContent=status||'Idle';
  if(dt)dt.textContent=detail||'';
}
function cmdBtn(label,kind,actionId){
  return `<button type="button" class="cmd-action ${kind||''}" data-cmd-action="${esc(actionId)}">${esc(label)}</button>`;
}
function activePatientSummary(){
  const choices=[
    {n:$('ptName')&&$('ptName').value.trim(), d:$('ptDOB')&&$('ptDOB').value.trim()},
    {n:$('udsPtName')&&$('udsPtName').value.trim(), d:$('udsDOB')&&$('udsDOB').value.trim()},
    {n:$('samplePtName')&&$('samplePtName').value.trim(), d:$('sampleDOB')&&$('sampleDOB').value.trim()},
    {n:$('formsPtName')&&$('formsPtName').value.trim(), d:$('formsDOB')&&$('formsDOB').value.trim()}
  ];
  const c=choices.find(x=>x.n)||choices[0]||{};
  return {name:c.n||'',dob:c.d||''};
}
function injectionCommandStatus(){
  if(!S.med)return {level:'idle',status:'Idle',detail:'No injection medication selected.',next:'Pick the injection medication if an injection is being given.'};
  const trace=injectionTraceIssues();
  const vitalFlags=vitalSafetyItems().filter(i=>i.level==='danger'||i.level==='warn');
  const selected=selectedSafetyGuards();
  const medFlags=medicationSafetyItems().filter(i=>i.level==='danger'||i.level==='warn');
  const danger=vitalFlags.some(i=>i.level==='danger')||selected.some(g=>g.level==='danger')||medFlags.some(i=>i.level==='danger')||($('exp').value&&monthExpired($('exp').value,$('adminDate').value));
  const warn=trace.length||vitalFlags.length||selected.length||medFlags.length||!$('nextDate').value||!$('admin').value.trim();
  if(danger)return {level:'danger',status:'Review',detail:'Provider review or expired/missing safety item before administration/logging.',next:'Review injection safety flags with provider before completing the note.'};
  if(warn)return {level:'warn',status:'Check',detail:`${trace.length?'Missing '+trace.join(', ')+'. ':''}${!$('nextDate').value?'Next dose missing. ':''}${!$('admin').value.trim()?'Staff not documented. ':''}`.trim()||'Review warning items before logging.',next:'Complete injection traceability and staff fields, then copy note or print AVS.'};
  return {level:'ready',status:'Ready',detail:`${S.med.name} ${S.dose||''}; next dose ${$('nextDate').value?fmtDate($('nextDate').value):'ready'}.`,next:'Injection looks ready: copy Tebra note, add to log, or print AVS.'};
}
function udsCommandStatus(){
  const patient=($('udsPtName')&&$('udsPtName').value.trim())||'';
  const pos=udsPanelsByState('pos'),inv=udsPanelsByState('invalid'),nt=udsPanelsByState('nt');
  const trace=udsTraceIssues();
  const hasUds=patient||$('udsLot').value.trim()||$('udsExp').value||pos.length||inv.length||nt.length!==UDS_PANELS.length;
  if(!hasUds)return {level:'idle',status:'Idle',detail:'No UDS encounter started.',next:'Open UDS when a point-of-care screen is needed.'};
  if(UDS.control==='invalid'||inv.length||UDS.temp==='not acceptable')return {level:'danger',status:'Do not interpret',detail:'Invalid control/panel or unacceptable temperature. Provider review needed.',next:'Route UDS to provider and do not treat invalid results as interpreted.'};
  if(pos.length||UDS.validity==='needs review'||UDS.consistent==='not aligned'||UDS.consistent==='needs review')return {level:'warn',status:'Handoff',detail:`${pos.length?'Preliminary positive: '+shortList(pos)+'. ':''}${trace.length?'Missing '+trace.join(', ')+'. ':''}`.trim()||'Clinician handoff requested.',next:'Complete UDS traceability, then copy the clinician handoff or print report.'};
  if(trace.length)return {level:'warn',status:'Check',detail:'Missing '+trace.join(', ')+'.',next:'Complete UDS lot/exp/collector before logging or printing.'};
  return {level:'ready',status:'Ready',detail:'UDS documented with no preliminary positives among tested panels.',next:'UDS is ready to log, copy, or print patient summary if requested.'};
}
function sampleCommandStatus(){
  const started=($('samplePtName')&&$('samplePtName').value.trim())||($('sampleQty')&&$('sampleQty').value.trim())||($('sampleLot')&&$('sampleLot').value.trim())||($('sampleSig')&&$('sampleSig').value.trim());
  if(!started)return {level:'idle',status:'Idle',detail:'No sample handout started.',next:'Use Samples when dispensing an oral medication sample.'};
  const issues=sampleTraceIssues();
  const med=sampleMed();
  const multi=sampleDoseEntries().length>1;
  const requiresReview=['lybalvi','cobenfy','fanapt','rexulti'].includes(med.key);
  const danger=requiresReview&&($('sampleMedCheck')&&$('sampleMedCheck').value!=='Prescriber reviewed / ok to dispense');
  if(danger)return {level:'danger',status:'Review',detail:`${med.label} prescriber review should be confirmed before dispensing.`,next:'Confirm prescriber review before dispensing this sample.'};
  if(issues.length||multi)return {level:'warn',status:'Check',detail:`${issues.length?'Missing '+issues.join(', ')+'. ':''}${multi?'Multiple strengths: confirm step order with patient.':''}`.trim(),next:'Complete sample quantity/lot/exp and verify the step plan before printing handout.'};
  return {level:'ready',status:'Ready',detail:`${sampleFriendlyMedication()} handout ready with package and traceability documented.`,next:'Sample handout looks ready: print, copy Tebra note, or add to activity log.'};
}
function formsCommandStatus(){
  const started=($('formsPtName')&&$('formsPtName').value.trim())||($('formsProvider')&&$('formsProvider').value.trim())||($('formsNotes')&&$('formsNotes').value.trim());
  if(!started)return {level:'idle',status:'Idle',detail:'No forms/letters item started.',next:'Open Forms when a patient has paperwork, letter, fee, or pickup tracking.'};
  const issues=(typeof formsReadinessIssues==='function')?formsReadinessIssues():[];
  if(FORMS.status==='completed'||FORMS.status==='notified')return {level:'ready',status:'Ready',detail:'Forms item appears ready/completed for log closeout.',next:'Add the forms item to the activity log if not already logged.'};
  return {level:issues.length?'warn':'warn',status:'Track',detail:`${currentFormType().t} · ${currentFormStatus().l}${issues.length?' · Check '+issues.join(', '):''}`,next:'Complete forms tracking fields and add the item to the activity log.'};
}
function commandPrimaryFromStatus(inj,uds,sam,frm){
  const statuses=[['Injection',inj,'administer'],['UDS',uds,'uds'],['Samples',sam,'samples'],['Forms',frm,'forms']];
  const danger=statuses.find(x=>x[1].level==='danger'); if(danger)return danger[1].next;
  const warn=statuses.find(x=>x[1].level==='warn'); if(warn)return warn[1].next;
  const ready=statuses.find(x=>x[1].level==='ready'); if(ready)return ready[1].next;
  return 'Start with the patient name and the workflow needed today.';
}
function renderCommandCenter(){
  if(!$('commandCenter'))return;
  const pt=activePatientSummary();
  $('cmdPatient').textContent=pt.name?`${pt.name}${pt.dob?' · DOB '+pt.dob:''}`:'No patient selected';
  const staff=(typeof getSignedStaff==='function')?getSignedStaff():'';
  $('cmdSub').textContent=`${staff?'Signed in: '+staff+'. ':'No staff signed in. '}Quick readiness snapshot for notes, handouts, and log entries.`;
  const inj=injectionCommandStatus(),uds=udsCommandStatus(),sam=sampleCommandStatus(),frm=formsCommandStatus();
  cmdSetCard('cmdInjectionCard',inj.level,inj.status,inj.detail);
  cmdSetCard('cmdUdsCard',uds.level,uds.status,uds.detail);
  cmdSetCard('cmdSampleCard',sam.level,sam.status,sam.detail);
  cmdSetCard('cmdFormsCard',frm.level,frm.status,frm.detail);
  $('cmdNext').textContent=commandPrimaryFromStatus(inj,uds,sam,frm);
  const actions=[];
  if(inj.level==='ready'){actions.push(cmdBtn('Copy injection note','primary','copy-inj'));actions.push(cmdBtn('Print injection AVS','','print-inj'));}
  else actions.push(cmdBtn('Go to injection','','go-administer'));
  if(uds.level==='ready'||uds.level==='warn'||uds.level==='danger'){actions.push(cmdBtn('Copy UDS handoff',uds.level==='danger'?'primary':'','copy-uds'));actions.push(cmdBtn('Print UDS report','','print-uds'));}
  else actions.push(cmdBtn('Go to UDS','','go-uds'));
  if(sam.level==='ready'||sam.level==='warn'){actions.push(cmdBtn('Print sample handout',sam.level==='ready'?'primary':'','print-sample'));actions.push(cmdBtn('Copy sample note','','copy-sample'));}
  else actions.push(cmdBtn('Go to Samples','','go-samples'));
  if(frm.level==='ready'||frm.level==='warn'){actions.push(cmdBtn('Copy forms note','','copy-forms'));actions.push(cmdBtn('Add forms to log','','add-forms'));}
  else actions.push(cmdBtn('Go to Forms','','go-forms'));
  $('cmdActions').innerHTML=actions.join('');
}
function wireCommandCenter(){
  document.querySelectorAll('[data-jump-tab]').forEach(el=>el.addEventListener('click',()=>window.IPMGNavigation?.activate(el.dataset.jumpTab,{focusPanel:true,resetScroll:true})));
  if($('cmdActions'))$('cmdActions').addEventListener('click',e=>{
    const b=e.target.closest('[data-cmd-action]'); if(!b)return;
    const a=b.dataset.cmdAction;
    const map={
      'copy-inj':'copyAll','print-inj':'printAVS','copy-uds':'udsCopyAll','print-uds':'printUdsReport','print-sample':'samplePrint','copy-sample':'sampleCopy','copy-forms':'formsCopy','add-forms':'formsAddLog'
    };
    if(a.startsWith('go-')){window.IPMGNavigation?.activate(a.replace('go-',''),{focusPanel:true,resetScroll:true});return;}
    const el=$(map[a]); if(el)el.click();
  });
}

/* Hoisting placeholders: the real renderAVS/renderUdsPatientSummary implementations
   are assigned later (window.renderAVS=.../window.renderUdsPatientSummary=... inside
   later patch IIFEs). The bootstrap call below runs render() synchronously before
   those IIFEs execute, and only a plain function declaration — not a later assignment —
   is hoisted early enough for that call to find it. Without this, render() throws
   ReferenceError here and aborts the rest of this script block, including install(). */
function renderAVS(){}
function renderUdsPatientSummary(){}

wireCommandCenter();
loadLog();
renderReasons();renderMeds();renderAtt();renderInjSafetyChips();renderResp();renderUdsReasons();renderUdsTemp();renderUdsControl();renderUdsResults();renderRef("");renderLog();recalcNext();render();renderUdsNote();renderCommandCenter();
initStaffSignIn();
initUdsReportOptions();
initSamples();
initForms();
renderHome();
renderCommandCenter();


/* ===================== PASS 34 behavior overrides ===================== */
(function(){
  // Make command-center functions harmless now that the block is visually retired.
  if(typeof window !== 'undefined'){
    window.renderCommandCenter = function(){ return; };
  }

  // Better label for the reference tab after it became a broader clinical knowledge base.
  document.querySelectorAll('.tab[data-tab="reference"]').forEach(t=>{
    const nodes=[...t.childNodes];
    const textNode=nodes.find(n=>n.nodeType===Node.TEXT_NODE && n.textContent.trim());
    if(textNode) textNode.textContent=' Knowledge base';
  });
  document.querySelectorAll('[data-jump-tab="reference"].home-quick').forEach(b=>{
    b.childNodes.forEach(n=>{ if(n.nodeType===Node.TEXT_NODE && n.textContent.includes('Drug reference')) n.textContent='Knowledge base'; });
  });

  // Replace knowledge-base rendering with single-card open behavior and no default bulky expansion.
  if(typeof allKbItems==='function' && typeof esc==='function'){
    window.renderRef = function(filter){
      const grid=document.getElementById('refGrid'); if(!grid) return; grid.innerHTML='';
      const f=(filter||'').toLowerCase().trim();
      const items=allKbItems().filter(item=>{
        const catOk=KB_FILTER==='all'||item.type===KB_FILTER||item.tags.some(t=>t.toLowerCase().includes(KB_FILTER));
        const hay=[item.title,item.sub,item.search,item.tags.join(' ')].join(' ').toLowerCase();
        return catOk && (!f || hay.includes(f));
      });
      items.forEach((item)=>{
        const card=document.createElement('div'); card.className='kb-card';
        card.innerHTML=`
          <div class="kh" role="button" tabindex="0" aria-expanded="false"><div class="kicon">${esc(item.icon||'KB')}</div><div><div class="ktitle">${esc(item.title)}</div><div class="ksub">${esc(item.sub||'')}</div></div>
            <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></div>
          <div class="kb-tags">${item.tags.map(t=>`<span class="kb-tag">${esc(t)}</span>`).join('')}</div>
          <div class="kb-body">${item.rows.join('')}</div>`;
        const toggle=()=>{
          const willOpen=!card.classList.contains('open');
          grid.querySelectorAll('.kb-card.open').forEach(x=>{x.classList.remove('open'); x.querySelector('.kh')?.setAttribute('aria-expanded','false');});
          if(willOpen){card.classList.add('open'); card.querySelector('.kh')?.setAttribute('aria-expanded','true');}
        };
        card.querySelector('.kh').addEventListener('click',toggle);
        card.querySelector('.kh').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
        grid.appendChild(card);
      });
      if(!items.length) grid.innerHTML=`<div class="logempty kb-empty">No knowledge-base entries match “${esc(filter)}”.</div>`;
    };
    const oldFilters=window.renderKbFilters;
    window.renderKbFilters=function(){
      if(typeof oldFilters==='function') oldFilters();
      // Rebind filter buttons so the refined renderer is always used.
      document.querySelectorAll('#kbFilters .kb-filter').forEach(btn=>{
        btn.addEventListener('click',()=>setTimeout(()=>window.renderRef(document.getElementById('refSearch')?.value||''),0));
      });
    };
    try{ window.renderRef(document.getElementById('refSearch')?.value||''); }catch(e){}
  }

  if(typeof renderHome==='function'){
    const oldRenderHome=renderHome;
    window.renderHome=function(){
      oldRenderHome();
      const meta=document.getElementById('homeMeta');
      if(meta && meta.textContent.includes('Use any workflow')) meta.textContent='Choose a workflow below. The dashboard stays clean and the details live inside each module.';
    };
    try{window.renderHome();}catch(e){}
  }
})();



/* ===================== PASS 40: CONSOLIDATED BEHAVIOR QA ===================== */
(function(){
  /* PASS40 previously installed a second tab/jump controller. The workspace
     navigation module above is now the sole owner of selection, ARIA, focus,
     keyboard behavior, and per-module scroll restoration. */
  window.IPMGNavigation?.sync();
  // Guard against stale print classes after print/cancel.
  window.addEventListener('afterprint',()=>{try{ if(typeof cleanPrintClasses==='function') cleanPrintClasses(); }catch(e){}});
})();


/* ===================== PASS 45: BUILD MODERN APP SHELL ===================== */
(function(){
  const wrap=document.querySelector('.wrap');
  if(!wrap || wrap.querySelector('.app-shell')) return;
  const topbar=wrap.querySelector('.topbar');
  const staffbar=wrap.querySelector('.staffbar');
  const tabs=wrap.querySelector('.tabs');
  const panels=Array.from(wrap.children).filter(el=>el.classList && el.classList.contains('panel'));
  const cmd=wrap.querySelector('.command-center');
  if(cmd) cmd.style.display='none';
  if(!topbar || !tabs || !panels.length) return;

  const shell=document.createElement('div'); shell.className='app-shell';
  const side=document.createElement('aside'); side.className='app-sidebar';
  const main=document.createElement('main'); main.className='app-main';
  shell.appendChild(side); shell.appendChild(main);
  wrap.appendChild(shell);

  side.appendChild(topbar);
  const navLabel=document.createElement('div'); navLabel.className='nav-label'; navLabel.textContent='Workspace';
  side.appendChild(navLabel);
  side.appendChild(tabs);
  if(staffbar) side.appendChild(staffbar);
  panels.forEach(p=>main.appendChild(p));

  const pill=topbar.querySelector('.pill');
  if(pill) pill.innerHTML='<span class="dot"></span> Visit-ready workspace';
  const h1=topbar.querySelector('.brand h1');
  if(h1) h1.textContent='IPMG MA Workstation';
  const sub=topbar.querySelector('.brand .sub');
  if(sub) sub.textContent='Injections · UDS · samples · forms · knowledge';
  const homeTitle=document.querySelector('.home-title');
  if(homeTitle) homeTitle.textContent='A softer, smarter medical assistant workspace.';
  const homeSub=document.querySelector('.home-subtitle');
  if(homeSub) homeSub.textContent='Start from a calm dashboard, move into the right workflow, and keep notes, patient handouts, safety, and closeout all in one elegant system.';
})();



/* ===================== PASS 47: DASHBOARD/NAV MICRO-INTERACTION FIXES ===================== */
(function(){
  // Prevent accidental selection highlight from quick drag/click on action-card labels.
  document.querySelectorAll('.home-action,.home-quick,.tab,button').forEach(el=>{
    el.setAttribute('draggable','false');
    el.addEventListener('dragstart',e=>e.preventDefault());
    el.addEventListener('pointerup',()=>{
      const sel=window.getSelection && window.getSelection();
      if(sel && sel.type==='Range' && el.matches('.home-action,.home-quick,.tab')) sel.removeAllRanges();
    });
  });
  // Make dashboard copy a little less generic if Pass 46 did not already update it.
  const qaFoot=document.querySelector('.workflow-qa-foot');
  if(qaFoot) qaFoot.textContent='Use this as the live pre-closeout checklist: each card checks whether the workflow is ready to copy, print, log, and hand off cleanly.';
})();



/* ===================== PASS 48: SAMPLES WORKFLOW STRUCTURE ===================== */
(function(){
  const panel=document.getElementById('panel-samples');
  if(!panel || panel.querySelector('.sample-module-hero')) return;
  const layout=panel.querySelector('.layout');
  if(!layout) return;
  const hero=document.createElement('div');
  hero.className='sample-module-hero';
  hero.innerHTML=`
    <div class="sample-hero-main">
      <div class="sample-hero-kicker">Samples workflow</div>
      <h2 class="sample-hero-title">Document exactly what was handed out.</h2>
      <p class="sample-hero-copy">Start with the patient and prescriber intent, choose the medication, tap the physical package, then verify the dose plan before printing the patient handout or copying the Tebra note.</p>
      <div class="sample-hero-pills"><span class="sample-hero-pill"><span></span>Physical package first</span><span class="sample-hero-pill"><span></span>Quantity visible</span><span class="sample-hero-pill"><span></span>Prescriber directions remain source of truth</span></div>
    </div>
    <div class="sample-hero-side">
      <div class="eyebrow">Real-world sequence</div>
      <div class="sample-micro-steps">
        <div class="sample-micro-step"><div class="num">1</div><div><b>Identify patient</b><span>Use current patient or enter name/DOB.</span></div></div>
        <div class="sample-micro-step"><div class="num">2</div><div><b>Pick med + package</b><span>Tap the actual box, card, kit, or pack.</span></div></div>
        <div class="sample-micro-step"><div class="num">3</div><div><b>Confirm instructions</b><span>Keep sig and step plan clear for the patient.</span></div></div>
        <div class="sample-micro-step"><div class="num">4</div><div><b>Print + log</b><span>Handout, Tebra note, and daily closeout stay aligned.</span></div></div>
      </div>
    </div>`;
  panel.insertBefore(hero, layout);
  const firstHead=panel.querySelector('.form-col > .card .card-head h2');
  if(firstHead) firstHead.textContent='1. Patient + prescriber intent';
  const medHead=[...panel.querySelectorAll('.form-col > .card .card-head h2')].find(h=>h.textContent.trim()==='Medication sample');
  if(medHead) medHead.textContent='2. Medication + physical package';
  const safetyHead=[...panel.querySelectorAll('.form-col > .card .card-head h2')].find(h=>h.textContent.trim()==='Safety handoff');
  if(safetyHead) safetyHead.textContent='3. Safety + patient education';
  const prevTitle=panel.querySelector('.note-top .ttl');
  if(prevTitle) prevTitle.textContent='Patient handout preview';
})();



/* ===================== PASS 49: UDS MODULE STRUCTURE POLISH ===================== */
(function(){
  const panel=document.getElementById('panel-uds');
  if(!panel || panel.querySelector('.uds-modern-hero')) return;
  const layout=panel.querySelector(':scope > .layout');
  if(!layout) return;
  const hero=document.createElement('div');
  hero.className='uds-modern-hero';
  hero.innerHTML=`
    <div class="hero-grid">
      <div>
        <div class="eyebrow">Point-of-care screen</div>
        <h2>UDS documentation that reads like a clean clinical handoff.</h2>
        <p>Capture collection validity, panel results, patient context, and provider-facing wording without making staff interpret beyond the office screen.</p>
        <div class="steps" aria-label="UDS workflow steps">
          <span class="step"><b>1</b> Collect</span>
          <span class="step"><b>2</b> Validate device</span>
          <span class="step"><b>3</b> Mark results</span>
          <span class="step"><b>4</b> Copy / print / log</span>
        </div>
      </div>
      <div class="mini-panel">
        <div class="mini-title">Staff guardrails</div>
        <div class="mini-copy">Use preliminary language, document what was seen, and route unexpected findings to the provider for review.</div>
        <div class="mini-tags"><span>Preliminary</span><span>Validity first</span><span>Provider review</span></div>
      </div>
    </div>`;
  panel.insertBefore(hero, layout);

  const preview=panel.querySelector('.preview-col');
  if(preview && !preview.querySelector('.uds-output-shell')){
    const shell=document.createElement('div');
    shell.className='uds-output-shell';
    const title=document.createElement('div');
    title.className='uds-output-title';
    title.innerHTML=`<div class="mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6.2L5.4 17.1A2.6 2.6 0 0 0 7.7 21h8.6a2.6 2.6 0 0 0 2.3-3.9L14 9.2V3"/></svg></div><div><h3>UDS output center</h3><p>Preview, readiness, note, report, patient summary, and log actions.</p></div>`;
    shell.appendChild(title);
    while(preview.firstChild){shell.appendChild(preview.firstChild);}
    preview.appendChild(shell);
  }
})();



/* ===================== PASS 50: INJECTION / ADMINISTER STRUCTURE ===================== */
(function(){
  const panel=document.getElementById('panel-administer');
  if(!panel || panel.querySelector('.inj-modern-hero')) return;
  const layout=panel.querySelector('.layout');
  if(!layout) return;
  const hero=document.createElement('div');
  hero.className='inj-modern-hero';
  hero.innerHTML=`
    <div class="hero-grid">
      <div>
        <div class="eyebrow">Injection workflow</div>
        <h2>Give the dose, protect the details, hand the patient a clear next step.</h2>
        <p>Use this screen to move from encounter details to medication, traceability, safety checks, next-dose timing, Tebra note, AVS, and closeout without losing the clinical sequence.</p>
        <div class="steps" aria-label="Injection workflow steps">
          <span class="step"><b>1</b> Patient</span>
          <span class="step"><b>2</b> Medication</span>
          <span class="step"><b>3</b> Lot + safety</span>
          <span class="step"><b>4</b> Next dose + AVS</span>
        </div>
      </div>
      <div class="mini-panel">
        <div class="mini-title">Designed for the MA handoff</div>
        <div class="mini-copy">The right side stays focused on readiness, the Tebra note, logging, and the patient-facing after-visit summary.</div>
        <div class="mini-tags"><span class="mini-tag">Safety first</span><span class="mini-tag">Traceable</span><span class="mini-tag">Print-ready</span></div>
      </div>
    </div>`;
  panel.insertBefore(hero, layout);
  const cardTitles=[...panel.querySelectorAll('.form-col > .card .card-head h2')];
  const map={
    'Encounter':'1 · Encounter',
    'Medication':'2 · Medication order',
    'Lot & traceability':'3 · Lot & traceability',
    'Verification & safety':'4 · Verification & safety',
    'Return date':'5 · Next dose planning',
    'Response & follow-up':'6 · Response & staff'
  };
  cardTitles.forEach(h=>{ const t=h.textContent.trim(); if(map[t]) h.textContent=map[t]; });
  const noteTtl=panel.querySelector('.note-top .ttl');
  if(noteTtl) noteTtl.textContent='Tebra administration note';
  const foot=panel.querySelector('.preview-col .foot');
  if(foot) foot.textContent='Defaults and date windows are workflow helpers. Verify against the active order, current product labeling, and site protocol before administration.';
})();



/* ===================== PASS 51: FORMS + LETTER BUILDER STRUCTURE ===================== */
(function(){
  const panel=document.getElementById('panel-forms');
  if(!panel || panel.querySelector('.forms-hero')) return;
  const hero=document.createElement('div');
  hero.className='forms-hero';
  hero.innerHTML=`
    <div class="forms-hero-inner">
      <div>
        <div class="forms-eyebrow">Forms + letters</div>
        <h2 class="forms-title">Track paperwork, draft letters, and keep release steps clear.</h2>
        <p class="forms-sub">A calmer workspace for request intake, provider assignment, letter drafting, fee status, patient notification, and closeout documentation.</p>
        <div class="forms-steps" aria-label="Forms workflow steps">
          <div class="forms-step"><b>1</b><span>Capture request</span></div>
          <div class="forms-step"><b>2</b><span>Assign provider</span></div>
          <div class="forms-step"><b>3</b><span>Draft / review</span></div>
          <div class="forms-step"><b>4</b><span>Print / log</span></div>
        </div>
      </div>
      <div class="forms-hero-card">
        <div>
          <div class="label">Release guardrail</div>
          <div class="value">Provider approval before release</div>
          <div class="meta">The module can draft and organize the request, but clinical wording, restrictions, dates, and diagnosis release stay provider-reviewed.</div>
        </div>
        <div class="chips">
          <span class="forms-hero-pill">Letter PDF</span>
          <span class="forms-hero-pill">Handoff note</span>
          <span class="forms-hero-pill">Closeout ready</span>
        </div>
      </div>
    </div>`;
  const layout=panel.querySelector('.forms-layout');
  if(layout) panel.insertBefore(hero, layout);

  const topCard=panel.querySelector('.forms-layout .form-col .card');
  if(topCard){
    const hint=topCard.querySelector('.card-head .hint');
    if(hint) hint.textContent='Start here: patient, requested date, and quick autofill from the active encounter.';
  }
  const letterHint=panel.querySelector('.letter-builder-card .card-head .hint');
  if(letterHint) letterHint.textContent='Build a clean provider-review draft and print/save it as a letter-style PDF.';

  function refreshHero(){
    const name=document.getElementById('formsPtName')?.value?.trim();
    const type=document.querySelector('#formsTypeGrid .chip.on')?.textContent?.trim();
    const status=document.querySelector('#formsStatusChips .chip.on')?.textContent?.trim();
    const value=hero.querySelector('.forms-hero-card .value');
    const meta=hero.querySelector('.forms-hero-card .meta');
    if(value) value.textContent=name?name:'Provider approval before release';
    if(meta) meta.textContent=name?`${type||'Request'} · ${status||'status pending'} · keep wording provider-reviewed before release.`:'The module can draft and organize the request, but clinical wording, restrictions, dates, and diagnosis release stay provider-reviewed.';
  }
  ['formsPtName','formsTypeGrid','formsStatusChips','formsProvider','letterTypeChips'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.addEventListener('input',refreshHero);el.addEventListener('click',()=>setTimeout(refreshHero,0));}
  });
  refreshHero();
})();



/* ===================== PASS 52: KNOWLEDGE BASE UX ===================== */
(function(){
  function esc2(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function copyText(txt,btn){
    const done=()=>{ if(btn){ const old=btn.textContent; btn.textContent='Copied'; btn.classList.add('copied'); setTimeout(()=>{btn.textContent=old;btn.classList.remove('copied');},1100);} };
    if(navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done).catch(()=>{}); else { try{ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }catch(e){} }
  }
  function enhanceKbShell(){
    const panel=document.getElementById('panel-reference');
    if(!panel || panel.querySelector('.kb-workspace')) return;
    const hero=panel.querySelector('.kb-hero');
    const tools=panel.querySelector('.kb-tools');
    const grid=panel.querySelector('#refGrid');
    const foot=panel.querySelector('.foot');
    if(!hero||!tools||!grid) return;
    const workspace=document.createElement('div'); workspace.className='kb-workspace';
    const side=document.createElement('aside'); side.className='kb-side';
    const main=document.createElement('div'); main.className='kb-main';
    const stats=document.createElement('div'); stats.className='kb-side-card'; stats.innerHTML=`<h3>Quick scan</h3><div class="kb-stat-grid" id="kbStats"><div class="kb-stat"><div class="n">—</div><div class="t">Entries</div></div><div class="kb-stat"><div class="n">—</div><div class="t">Shown</div></div></div><p class="kb-side-note" style="margin-top:12px">Search should answer: what should staff capture, what should be flagged, and what wording is safest for handoff.</p>`;
    const copy=document.createElement('div'); copy.className='kb-side-card'; copy.innerHTML=`<h3>Quick-copy phrases</h3><div class="kb-copy-list">
      <button type="button" class="kb-copy-btn" data-copy="Provider to review in clinical context; staff did not interpret final clinical significance.">Provider review handoff</button>
      <button type="button" class="kb-copy-btn" data-copy="Preliminary point-of-care screen documented; outside/confirmatory lab may be ordered per provider direction.">UDS preliminary wording</button>
      <button type="button" class="kb-copy-btn" data-copy="Sample medication dispensed per prescriber direction; quantity/package, lot, expiration, and patient instructions documented.">Sample traceability wording</button>
      <button type="button" class="kb-copy-btn" data-copy="Draft prepared for provider review/signature; not released pending provider approval.">Letter review wording</button>
    </div>`;
    const guard=document.createElement('div'); guard.className='kb-side-card'; guard.innerHTML=`<h3>Use safely</h3><p class="kb-side-note">This is a workflow aide, not a prescribing source. Confirm dosing, contraindications, labs, and clinical interpretation with current policy, labeling, and provider direction.</p>`;
    side.append(stats,copy,guard);
    const mode=document.createElement('div'); mode.className='kb-mode-strip'; mode.innerHTML=`<div class="kb-mode-pill"><span></span>Operational guidance</div><div class="kb-mode-pill"><span></span>Handoff wording</div><div class="kb-mode-pill"><span></span>Safety prompts</div>`;
    main.append(mode,tools,grid);
    if(foot) main.append(foot);
    workspace.append(side,main);
    hero.after(workspace);
    panel.querySelectorAll('.kb-copy-btn').forEach(btn=>btn.addEventListener('click',()=>copyText(btn.dataset.copy||btn.textContent,btn)));
  }
  function updateKbStats(shown){
    const box=document.getElementById('kbStats');
    if(!box) return;
    let total='—';
    try{ if(typeof allKbItems==='function') total=allKbItems().length; }catch(e){}
    box.innerHTML=`<div class="kb-stat"><div class="n">${esc2(total)}</div><div class="t">Entries</div></div><div class="kb-stat"><div class="n">${esc2(shown ?? document.querySelectorAll('#refGrid .kb-card').length)}</div><div class="t">Shown</div></div>`;
  }
  const reRender=function(filter){
    const grid=document.getElementById('refGrid'); if(!grid || typeof allKbItems!=='function') return;
    const f=(filter||'').toLowerCase().trim();
    let active='all'; try{ active=window.KB_FILTER || (typeof KB_FILTER!=='undefined'?KB_FILTER:'all'); }catch(e){}
    const items=allKbItems().filter(item=>{
      const catOk=active==='all'||item.type===active||(item.tags||[]).some(t=>String(t).toLowerCase().includes(active));
      const hay=[item.title,item.sub,item.search,(item.tags||[]).join(' ')].join(' ').toLowerCase();
      return catOk && (!f || hay.includes(f));
    });
    grid.innerHTML='';
    items.forEach((item,idx)=>{
      const card=document.createElement('div'); card.className='kb-card'+(idx===0?' open':'');
      card.innerHTML=`<div class="kh" role="button" tabindex="0" aria-expanded="${idx===0?'true':'false'}"><div class="kicon">${esc2(item.icon||'KB')}</div><div><div class="ktitle">${esc2(item.title)}</div><div class="ksub">${esc2(item.sub||'')}</div></div><svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></div><div class="kb-tags">${(item.tags||[]).slice(0,5).map(t=>`<span class="kb-tag">${esc2(t)}</span>`).join('')}</div><div class="kb-body">${item.rows.join('')}</div>`;
      const toggle=()=>{ const willOpen=!card.classList.contains('open'); grid.querySelectorAll('.kb-card.open').forEach(x=>{x.classList.remove('open'); x.querySelector('.kh')?.setAttribute('aria-expanded','false');}); if(willOpen){card.classList.add('open'); card.querySelector('.kh')?.setAttribute('aria-expanded','true');} };
      card.querySelector('.kh').addEventListener('click',toggle);
      card.querySelector('.kh').addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault(); toggle();} });
      grid.appendChild(card);
    });
    if(!items.length) grid.innerHTML=`<div class="kb-empty">No knowledge-base entries match “${esc2(filter)}”. Try a medication, UDS panel, lab, or workflow word.</div>`;
    updateKbStats(items.length);
  };
  enhanceKbShell();
  if(typeof window.renderRef==='function'){
    window.renderRef=reRender;
    try{reRender(document.getElementById('refSearch')?.value||'');}catch(e){}
  }
  const input=document.getElementById('refSearch');
  if(input){ input.addEventListener('input',e=>setTimeout(()=>reRender(e.target.value),0)); }
  const originalFilters=window.renderKbFilters;
  if(typeof originalFilters==='function'){
    window.renderKbFilters=function(){ originalFilters(); document.querySelectorAll('#kbFilters .kb-filter').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>reRender(document.getElementById('refSearch')?.value||''),0))); };
    try{window.renderKbFilters();}catch(e){}
  }
})();



/* ===================== PASS 53: LOG + DAILY CLOSEOUT WORKSPACE ===================== */
(function(){
  function qs(s,r=document){return r.querySelector(s)}
  function qsa(s,r=document){return Array.from(r.querySelectorAll(s))}
  function enhanceLogPanel(){
    const panel=document.getElementById('panel-log');
    if(!panel || panel.querySelector('.log-hero')) return;
    const hero=document.createElement('div');
    hero.className='log-hero';
    hero.innerHTML=`
      <div class="log-hero-inner">
        <div>
          <div class="log-kicker">Daily operations</div>
          <h2 class="log-title">Close the day without losing the details.</h2>
          <p class="log-subtitle">Review injections, UDS screens, samples, and forms in one calm queue. Copy the summary, export CSV, print the daily log, or save a closeout PDF when the day is ready.</p>
          <div class="log-steps"><span class="log-step"><b>1</b> Review activity</span><span class="log-step"><b>2</b> Resolve flags</span><span class="log-step"><b>3</b> Save closeout</span></div>
        </div>
        <div class="log-live-card">
          <div><div class="label">Today’s activity</div><div class="big" id="logHeroTotal">0</div><div class="small" id="logHeroText">No entries logged yet.</div></div>
          <div class="log-live-mini"><div><strong id="logHeroReview">0</strong><span>Needs review</span></div><div><strong id="logHeroDone">0</strong><span>Completed</span></div></div>
        </div>
      </div>`;
    panel.insertBefore(hero,panel.firstElementChild);
    const card=qs('#panel-log > .card');
    if(card && !qs('.closeout-meta-strip',card)){
      const strip=document.createElement('div');
      strip.className='closeout-meta-strip';
      strip.innerHTML='<span><b>Closeout tip:</b> unresolved review items should be addressed before exporting or printing.</span><span id="logCloseoutState">Waiting for activity</span>';
      const filters=qs('#logFilters',card);
      if(filters) card.insertBefore(strip,filters);
    }
  }
  function updateLogHero(){
    const rows=qsa('#logBody tr');
    const total=rows.length;
    let review=0,done=0;
    rows.forEach(r=>{
      const txt=(r.textContent||'').toLowerCase();
      if(txt.includes('needs review')||txt.includes('review requested')||txt.includes('provider review')) review++;
      if(txt.includes('completed')||txt.includes('logged')) done++;
    });
    const totalEl=document.getElementById('logHeroTotal');
    const reviewEl=document.getElementById('logHeroReview');
    const doneEl=document.getElementById('logHeroDone');
    const textEl=document.getElementById('logHeroText');
    const stateEl=document.getElementById('logCloseoutState');
    if(totalEl) totalEl.textContent=String(total);
    if(reviewEl) reviewEl.textContent=String(review);
    if(doneEl) doneEl.textContent=String(Math.max(done,total-review));
    if(textEl) textEl.textContent= total ? `${total} item${total===1?'':'s'} in today’s log${review?`, ${review} needs review`:''}.` : 'No entries logged yet.';
    if(stateEl) stateEl.textContent= total ? (review?`${review} review item${review===1?'':'s'} open`:'Ready for closeout') : 'Waiting for activity';
    qsa('.closeout-kpi').forEach(k=>{
      const label=(qs('.t',k)?.textContent||'').toLowerCase();
      if(label.includes('review')) k.classList.toggle('warn', Number(qs('.n',k)?.textContent||0)>0);
    });
    const list=document.getElementById('needsReviewList');
    if(list && !list.textContent.trim()) list.innerHTML='<div class="review-empty">No unresolved review items are showing right now.</div>';
  }
  const mo=new MutationObserver(()=>setTimeout(updateLogHero,0));
  function init(){
    enhanceLogPanel();
    const body=document.getElementById('logBody');
    const kpis=document.getElementById('closeoutKpis');
    const review=document.getElementById('needsReviewList');
    if(body) mo.observe(body,{childList:true,subtree:true,characterData:true});
    if(kpis) mo.observe(kpis,{childList:true,subtree:true,characterData:true});
    if(review) mo.observe(review,{childList:true,subtree:true,characterData:true});
    setTimeout(updateLogHero,0);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();



/* ===================== PASS 54: PRODUCTION QA + CLEANUP ===================== */
(function(){
  function qs(s,r=document){return r.querySelector(s)}
  function qsa(s,r=document){return Array.from(r.querySelectorAll(s))}
  function addRibbon(){
    const main=qs('.app-main') || qs('.wrap');
    if(!main || qs('.production-ready-ribbon')) return;
    const ribbon=document.createElement('div');
    ribbon.className='production-ready-ribbon';
    ribbon.innerHTML='<span><b>Production cleanup pass:</b> workflow styling, print isolation, focus states, and small-window safeguards are active.</span><span class="status">QA ready</span>';
    main.insertBefore(ribbon, main.firstElementChild);
  }
  function normalizeInteractiveElements(){
    qsa('[data-jump-tab],.home-action,.home-quick,.chip,.kb-filter,.tab').forEach(el=>{
      if(!el.hasAttribute('tabindex') && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/i.test(el.tagName)) el.setAttribute('tabindex','0');
      if(!el.hasAttribute('role') && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/i.test(el.tagName)) el.setAttribute('role','button');
    });
    qsa('button').forEach(btn=>{
      if(!btn.getAttribute('type')) btn.setAttribute('type','button');
    });
  }
  function patchKeyboardActivation(){
    document.addEventListener('keydown',function(e){
      const el=e.target.closest && e.target.closest('[data-jump-tab],.home-action,.home-quick,.chip,.kb-filter');
      if(!el || e.defaultPrevented) return;
      /* Native controls already synthesize click for Enter/Space. Re-triggering
         them here caused duplicate navigation, selection, and print actions when
         focus sat on a child icon or label. */
      if(el.matches('button,a[href],input,select,textarea')) return;
      if(e.key==='Enter' || e.key===' '){
        if(/^(INPUT|SELECT|TEXTAREA)$/i.test(e.target.tagName)) return;
        e.preventDefault();
        el.click();
      }
    },true);
  }
  function patchPrintCleanup(){
    const cleanup=()=>{
      if(typeof window.cleanPrintClasses==='function'){
        try{window.cleanPrintClasses();return;}catch(e){}
      }
      ['print-avs','print-uds','print-uds-patient','print-sample','print-letter','print-daily'].forEach(c=>document.body.classList.remove(c));
    };
    window.addEventListener('afterprint',()=>setTimeout(cleanup,50));
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden) setTimeout(cleanup,250); });
    window.addEventListener('focus',()=>setTimeout(cleanup,350));
  }
  function fixWorkflowQaLetterShortcut(){
    qsa('[data-qa-action="print-letter"], [data-home-action="print-letter"]').forEach(btn=>{
      btn.addEventListener('click',e=>{
        const real=qs('#printLetter,#letterPrint,#print-letter,#btnPrintLetter,[data-action="print-letter"]');
        if(real){ e.preventDefault(); real.click(); }
      },true);
    });
  }
  function runSoftDiagnostics(){
    const tabs=qsa('.tab[data-tab]');
    const missing=tabs.map(t=>t.dataset.tab).filter(name=>!qs('#panel-'+name));
    if(missing.length) console.warn('IPMG QA: tabs missing panels', missing);
    const ids={};
    qsa('[id]').forEach(el=>{ids[el.id]=(ids[el.id]||0)+1;});
    const dup=Object.keys(ids).filter(id=>ids[id]>1);
    if(dup.length) console.warn('IPMG QA: duplicate ids', dup);
    document.documentElement.dataset.ipmgQa='pass54';
  }
  function init(){
    /* Release build: internal QA changelog ribbon intentionally suppressed. */
    normalizeInteractiveElements();
    patchKeyboardActivation();
    patchPrintCleanup();
    fixWorkflowQaLetterShortcut();
    runSoftDiagnostics();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();



/* ===================== PASS 56: MOVE CLINIC LOCATION TO WORKSPACE RAIL ===================== */
(function(){
  const STORAGE_KEY='ipmgMedAssistClinicLocation_v1';
  function byId(id){return document.getElementById(id);}
  function refreshClinicOptions(){
    const sel=byId('clinic');
    if(!sel || !Array.isArray(window.CLINICS)) return;
  }
  function optionLabel(value){
    if(!value) return 'No location selected';
    const parts=value.split('|');
    return parts[1] ? `${parts[0]} · ${parts[1]}` : parts[0];
  }
  function moveClinicSelector(){
    const sel=byId('clinic');
    if(!sel) return;
    // Deduplicate/rebuild options from CLINICS, preserving the existing selected value when possible.
    const selected=sel.value || SAFE_STORAGE.get(STORAGE_KEY) || '';
    sel.innerHTML='<option value="">Select visit location</option>';
    try{
      CLINICS.forEach(c=>{
        const o=document.createElement('option');
        o.value=(c.n||'')+'|'+(c.p||'');
        o.textContent=c.p ? `${c.n} — ${c.p}` : c.n;
        sel.appendChild(o);
      });
    }catch(e){}
    if(selected){
      const match=[...sel.options].find(o=>o.value===selected || o.value.split('|')[0]===selected.split('|')[0]);
      if(match) sel.value=match.value;
    }

    const originalField=sel.closest('.field') || sel.parentElement;
    if(!originalField) return;
    let card=byId('globalLocationCard');
    if(!card){
      card=document.createElement('div');
      card.id='globalLocationCard';
      card.className='global-location-card';
      card.innerHTML=`
        <div class="loc-top">
          <div class="loc-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>
          <div><div class="loc-title">Visit location</div><div class="loc-sub">Used for call-back line and patient printouts.</div></div>
        </div>
        <div class="loc-select-slot"></div>
        <div class="loc-hint" id="clinicLocationHint">${optionLabel(sel.value)}</div>`;
    }
    const slot=card.querySelector('.loc-select-slot');
    if(slot && !slot.contains(sel)) slot.appendChild(sel);
    originalField.classList.add('moved-clinic-field');
    const sidebar=document.querySelector('.app-sidebar');
    const staffbar=document.querySelector('.staffbar');
    const navLabel=document.querySelector('.nav-label');
    if(sidebar){
      if(staffbar) sidebar.insertBefore(card, staffbar.nextSibling);
      else if(navLabel) sidebar.insertBefore(card, navLabel);
      else sidebar.appendChild(card);
    }else{
      const topbar=document.querySelector('.topbar');
      if(topbar && topbar.parentNode) topbar.parentNode.insertBefore(card, topbar.nextSibling);
    }
    function update(){
      try{SAFE_STORAGE.set(STORAGE_KEY,sel.value||'');}catch(e){}
      const hint=byId('clinicLocationHint');
      if(hint) hint.textContent=optionLabel(sel.value);
      try{ if(typeof renderSMS==='function') renderSMS(); }catch(e){}
      try{ if(typeof renderHome==='function') renderHome(); }catch(e){}
    }
    sel.addEventListener('change',update);
    update();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(moveClinicSelector,0));
  else setTimeout(moveClinicSelector,0);
})();



/* ===================== PASS 62: prevent dashboard/action text highlight ===================== */
(function(){
  const selector='.home-action,.home-quick,.workflow-qa-btn,.tab,.btn,button';
  const clearSelection=()=>{
    const sel=window.getSelection&&window.getSelection();
    if(sel && sel.removeAllRanges) sel.removeAllRanges();
  };
  document.addEventListener('mousedown',e=>{
    if(e.target.closest && e.target.closest(selector)) clearSelection();
  },true);
  document.addEventListener('mouseup',e=>{
    if(e.target.closest && e.target.closest(selector)) setTimeout(clearSelection,0);
  },true);
  document.addEventListener('click',e=>{
    if(e.target.closest && e.target.closest(selector)) setTimeout(clearSelection,0);
  },true);
  document.addEventListener('selectstart',e=>{
    if(e.target.closest && e.target.closest(selector)) e.preventDefault();
  },true);
})();



/* ===================== PASS 64: smart route/site selector ===================== */
const ADMIN_SITE_LIBRARY=[
  {id:'R deltoid',label:'R deltoid',group:'deltoid',route:'IM',map:'site-deltoid-r'},
  {id:'L deltoid',label:'L deltoid',group:'deltoid',route:'IM',map:'site-deltoid-l'},
  {id:'R ventrogluteal',label:'R gluteal',group:'gluteal',route:'IM',map:'site-glute-r'},
  {id:'L ventrogluteal',label:'L gluteal',group:'gluteal',route:'IM',map:'site-glute-l'},
  {id:'R dorsogluteal',label:'R dorsogluteal',group:'gluteal',route:'IM',map:'site-glute-r'},
  {id:'L dorsogluteal',label:'L dorsogluteal',group:'gluteal',route:'IM',map:'site-glute-l'},
  {id:'Abdomen LUQ (SubQ)',label:'LUQ abdomen',group:'abdomen',route:'SubQ',map:'site-abd-luq'},
  {id:'Abdomen RUQ (SubQ)',label:'RUQ abdomen',group:'abdomen',route:'SubQ',map:'site-abd-ruq'},
  {id:'Abdomen LLQ (SubQ)',label:'LLQ abdomen',group:'abdomen',route:'SubQ',map:'site-abd-llq'},
  {id:'Abdomen RLQ (SubQ)',label:'RLQ abdomen',group:'abdomen',route:'SubQ',map:'site-abd-rlq'},
  {id:'R upper arm (SubQ)',label:'R upper arm SQ',group:'upperArmSQ',route:'SubQ',map:'site-arm-r'},
  {id:'L upper arm (SubQ)',label:'L upper arm SQ',group:'upperArmSQ',route:'SubQ',map:'site-arm-l'}
];
function medAdminRule(m=S.med,dose=S.dose){
  if(!m)return {route:['IM','SubQ'],sites:ADMIN_SITE_LIBRARY.map(s=>s.id),label:'Medication not selected',summary:'Select a medication to see route and site guidance.',note:'Provider order and current prescribing information remain the source of truth.',source:'Medication not selected.'};
  const k=m.key;
  const allIM=['R deltoid','L deltoid','R ventrogluteal','L ventrogluteal','R dorsogluteal','L dorsogluteal'];
  const gluteal=['R ventrogluteal','L ventrogluteal','R dorsogluteal','L dorsogluteal'];
  const deltoid=['R deltoid','L deltoid'];
  const subq=['Abdomen LUQ (SubQ)','Abdomen RUQ (SubQ)','Abdomen LLQ (SubQ)','Abdomen RLQ (SubQ)','R upper arm (SubQ)','L upper arm (SubQ)'];
  const abdomen=['Abdomen LUQ (SubQ)','Abdomen RUQ (SubQ)','Abdomen LLQ (SubQ)','Abdomen RLQ (SubQ)'];
  const base={route:['IM'],sites:allIM,label:m.label,summary:'IM administration; choose a labeled IM site or follow provider order.',note:'Verify site against the medication label and prescriber order.',source:'Label / PI based guidance. Verify current PI before rollout.'};
  const rules={
    sustenna:{route:['IM'],sites:allIM,summary:'IM. Initiation doses are deltoid; maintenance may be deltoid or gluteal.',note:'If this is Day 1 / Day 8 initiation, use deltoid per order.'},
    trzina:{route:['IM'],sites:allIM,summary:'IM. Deltoid or gluteal administration.',note:'Use only after stabilization requirements are met per provider order.'},
    trinza:{route:['IM'],sites:allIM,summary:'IM. Deltoid or gluteal administration.',note:'Use only after stabilization requirements are met per provider order.'},
    hafyera:{route:['IM'],sites:gluteal,summary:'IM. Gluteal administration only.',note:'Do not use deltoid for Hafyera.'},
    erzofri:{route:['IM'],sites:(dose==='351 mg'?deltoid:allIM),summary:dose==='351 mg'?'IM. 351 mg initial dose is deltoid only.':'IM. Deltoid or gluteal administration.',note:'For 351 mg initial dose, use deltoid.'},
    aristada:{route:['IM'],sites:(dose==='441 mg'?allIM:gluteal),summary:dose==='441 mg'?'IM. 441 mg may be deltoid or gluteal.':'IM. Higher Aristada doses are treated as gluteal-only in this helper.',note:'Verify dose-specific Aristada site guidance in the PI.'},
    initio:{route:['IM'],sites:allIM,summary:'IM one-time initiation. Deltoid or gluteal.',note:'Give with the ordered oral aripiprazole / Aristada initiation plan.'},
    uzedy:{route:['SubQ'],sites:subq,summary:'SubQ. Abdomen or upper arm. Abdomen quadrants are shown for rotation documentation.',note:'Rotate sites. Do not document an IM site for Uzedy.'},
    maintena:{route:['IM'],sites:allIM,summary:'IM. Deltoid or gluteal administration.',note:'Follow ordered initiation/oral overlap plan.'},
    asimtufii:{route:['IM'],sites:gluteal,summary:'IM. Gluteal administration only.',note:'Do not use deltoid for Asimtufii.'},
    vivitrol:{route:['IM'],sites:gluteal,summary:'IM. Gluteal administration only; alternate buttocks.',note:'Confirm opioid-free status per provider workflow before administration.'},
    haldol:{route:['IM'],sites:allIM,summary:'Deep IM. Site per medication order and office policy.',note:'Use office policy/provider order for deltoid vs gluteal selection.'},
    prolixin:{route:['IM'],sites:allIM,summary:'Deep IM. Site per medication order and office policy.',note:'Use office policy/provider order for deltoid vs gluteal selection.'},
    other:{route:['IM','SubQ'],sites:ADMIN_SITE_LIBRARY.map(s=>s.id),summary:'Manual medication. Select route and site based on provider order.',note:'Manual entry should be verified before documentation.'}
  };
  return Object.assign(base,rules[k]||{});
}
function normalizeAdminSite(site){
  if(site==='Abdomen (SubQ)')return 'Abdomen RUQ (SubQ)';
  return site;
}
function siteIsAllowed(site=S.site){
  const rule=medAdminRule();
  const s=normalizeAdminSite(site||'');
  return !!s && rule.sites.includes(s) && (!rule.route.length || rule.route.includes(S.route));
}
function adminAllowedText(rule){
  const groups=[];
  if(rule.sites.some(s=>s.includes('deltoid')))groups.push('deltoid');
  if(rule.sites.some(s=>s.includes('gluteal')))groups.push('gluteal');
  if(rule.sites.some(s=>s.includes('Abdomen')))groups.push('abdomen quadrants');
  if(rule.sites.some(s=>s.includes('upper arm')))groups.push('upper arm SQ');
  return `${rule.route.join(' / ')} · ${groups.join(', ')||'manual site selection'}`;
}

function adminSiteGroups(){
  return [
    {key:'deltoid', title:'Deltoid IM', route:'IM', hint:'Shoulder muscle sites', sites:['R deltoid','L deltoid']},
    {key:'gluteal', title:'Gluteal IM', route:'IM', hint:'Gluteal muscle sites', sites:['R ventrogluteal','L ventrogluteal','R dorsogluteal','L dorsogluteal']},
    {key:'abdomen', title:'Abdomen SubQ', route:'SubQ', hint:'Use quadrant rotation when ordered', sites:['Abdomen LUQ (SubQ)','Abdomen RUQ (SubQ)','Abdomen LLQ (SubQ)','Abdomen RLQ (SubQ)']},
    {key:'upperArmSQ', title:'Upper arm SubQ', route:'SubQ', hint:'Posterior upper-arm tissue', sites:['R upper arm (SubQ)','L upper arm (SubQ)']}
  ];
}
function adminSiteDisplay(site){
  const meta=ADMIN_SITE_LIBRARY.find(s=>s.id===site);
  return meta?meta.label:site;
}
function adminSiteExplain(site){
  if(/deltoid/i.test(site)) return 'Shoulder injection site';
  if(/ventrogluteal/i.test(site)) return 'Ventrogluteal gluteal site';
  if(/dorsogluteal/i.test(site)) return 'Dorsogluteal gluteal site';
  if(/Abdomen/i.test(site)) return 'Subcutaneous abdominal site';
  if(/upper arm/i.test(site)) return 'Subcutaneous upper-arm site';
  return 'Selected administration site';
}
function previewSiteKey(site){
  const s=(site||'').toLowerCase();
  if(s.includes('r deltoid')) return 'r-deltoid';
  if(s.includes('l deltoid')) return 'l-deltoid';
  if(s.includes('r ventrogluteal')||s.includes('r dorsogluteal')) return 'r-gluteal';
  if(s.includes('l ventrogluteal')||s.includes('l dorsogluteal')) return 'l-gluteal';
  if(s.includes('luq')) return 'abd-luq';
  if(s.includes('ruq')) return 'abd-ruq';
  if(s.includes('llq')) return 'abd-llq';
  if(s.includes('rlq')) return 'abd-rlq';
  if(s.includes('r upper arm')) return 'r-upper-arm';
  if(s.includes('l upper arm')) return 'l-upper-arm';
  return '';
}
function adminPreviewSVG(site){
  const key=previewSiteKey(site);
  const isBack = /gluteal/i.test(site||'');
  const active = cls => (key===cls ? (/(abd|upper-arm)/.test(cls)?'zone active subq':'zone active') : 'zone');
  return `<svg class="admin-preview-svg" viewBox="0 0 250 300" aria-hidden="true">
    <circle class="base-fill" cx="125" cy="30" r="18"></circle>
    ${isBack
      ? `<path class="base-fill" d="M87 60 C97 52 109 48 125 48 C141 48 153 52 163 60 C171 67 175 78 174 91 L171 124 C170 133 164 141 156 145 L149 147 L146 178 L142 252 C141 262 148 269 156 269 C164 269 169 263 169 254 L169 192 C169 183 161 175 152 174 L98 174 C89 175 81 183 81 192 L81 254 C81 263 86 269 94 269 C102 269 109 262 108 252 L104 178 L101 147 L94 145 C86 141 80 133 79 124 L76 91 C75 78 79 67 87 60 Z"></path>
         <path class="base-soft" d="M78 88 C65 98 60 113 60 128 L60 154 C60 164 66 172 74 172 C82 172 88 165 88 155 L88 116 C88 107 84 97 78 88 Z"></path>
         <path class="base-soft" d="M172 88 C185 98 190 113 190 128 L190 154 C190 164 184 172 176 172 C168 172 162 165 162 155 L162 116 C162 107 166 97 172 88 Z"></path>
         <ellipse class="${active('r-gluteal')}" cx="104" cy="160" rx="24" ry="18"></ellipse>
         <ellipse class="${active('l-gluteal')}" cx="146" cy="160" rx="24" ry="18"></ellipse>
         <text class="label" x="125" y="286" text-anchor="middle">Back view</text>`
      : `<path class="base-fill" d="M87 60 C97 52 109 48 125 48 C141 48 153 52 163 60 C171 67 175 78 174 91 L171 124 C170 133 164 141 156 145 L149 147 L146 178 L142 252 C141 262 148 269 156 269 C164 269 169 263 169 254 L169 194 C169 185 157 183 153 190 L141 223 C138 229 133 233 125 233 C117 233 112 229 109 223 L97 190 C93 183 81 185 81 194 L81 254 C81 263 86 269 94 269 C102 269 109 262 108 252 L104 178 L101 147 L94 145 C86 141 80 133 79 124 L76 91 C75 78 79 67 87 60 Z"></path>
         <path class="base-soft" d="M78 88 C65 98 60 113 60 128 L60 154 C60 164 66 172 74 172 C82 172 88 165 88 155 L88 116 C88 107 84 97 78 88 Z"></path>
         <path class="base-soft" d="M172 88 C185 98 190 113 190 128 L190 154 C190 164 184 172 176 172 C168 172 162 165 162 155 L162 116 C162 107 166 97 172 88 Z"></path>
         <ellipse class="${active('r-deltoid')}" cx="74" cy="112" rx="13" ry="16"></ellipse>
         <ellipse class="${active('l-deltoid')}" cx="176" cy="112" rx="13" ry="16"></ellipse>
         <rect class="${active('abd-luq')}" x="107" y="95" width="18" height="18" rx="5"></rect>
         <rect class="${active('abd-ruq')}" x="126" y="95" width="18" height="18" rx="5"></rect>
         <rect class="${active('abd-llq')}" x="107" y="114" width="18" height="18" rx="5"></rect>
         <rect class="${active('abd-rlq')}" x="126" y="114" width="18" height="18" rx="5"></rect>
         <ellipse class="${active('r-upper-arm')}" cx="74" cy="148" rx="12" ry="16"></ellipse>
         <ellipse class="${active('l-upper-arm')}" cx="176" cy="148" rx="12" ry="16"></ellipse>
         <text class="label" x="125" y="286" text-anchor="middle">Front view</text>`}
  </svg>`;
}
function buildSiteOption(site, allowed){
  const selected=normalizeAdminSite(S.site||'')===site;
  const meta=ADMIN_SITE_LIBRARY.find(s=>s.id===site) || {route:'',label:site};
  return `<button type="button" class="site-option ${allowed?'allowed':'muted'} ${selected?'selected':''}" data-site="${esc(site)}" data-allowed="${allowed?'1':'0'}">
    <div class="site-option-main">
      <div class="site-option-title">${esc(meta.label)}</div>
      <div class="site-option-sub">${esc(adminSiteExplain(site))}</div>
    </div>
    <span class="site-option-badge">${selected?'Selected':(allowed?'Usual':'Verify')}</span>
  </button>`;
}
function renderBodyMap(){
  const wrap=$('bodyMap'); if(!wrap) return;
  const rule=medAdminRule();
  const selected=normalizeAdminSite(S.site||'');
  const groups=adminSiteGroups();
  const selectedAllowed = selected ? siteIsAllowed(selected) : false;
  const currentCard = selected ? `
    <div class="selector-current">
      <div class="selector-current-copy">
        <div class="selector-current-kicker">Current selection</div>
        <div class="selector-current-line">${esc(adminSiteDisplay(selected))}</div>
        <div class="selector-current-sub">${esc((S.route||'Route pending') + ' · ' + adminSiteExplain(selected))}</div>
      </div>
      <div class="selector-current-state">${selectedAllowed ? 'Matches guidance' : 'Verify order'}</div>
    </div>` : '';
  wrap.innerHTML=`
    <div class="site-selector-shell">
      <div class="site-selector-left selector-panel">
        <div class="selector-head">
          <div>
            <div class="selector-title">Choose administration site</div>
            <div class="selector-sub">Use the site cards below for fast, precise selection. This keeps the workflow clear on smaller windows and makes the documented site easier to review.</div>
          </div>
          <div class="selector-pill">${esc((rule.route||[]).join(' / ')||'Route')}</div>
        </div>
        ${currentCard}
        <div class="site-group-grid">
          ${groups.map(group=>{
            const allowedSites=group.sites.filter(site=>rule.sites.includes(site));
            const displaySites=(allowedSites.length?allowedSites:group.sites);
            const muted=!allowedSites.length;
            return `<section class="site-group-card ${muted?'group-muted':''}">
              <div class="site-group-head">
                <div>
                  <div class="site-group-title">${esc(group.title)}</div>
                  <div class="site-option-sub" style="margin-top:4px;">${esc(group.hint||'')}</div>
                </div>
                <div class="site-group-route">${esc(group.route)}</div>
              </div>
              <div class="site-options">
                ${displaySites.map(site=>buildSiteOption(site, rule.sites.includes(site))).join('')}
              </div>
            </section>`;
          }).join('')}
        </div>
        <div class="selector-help">Muted options are outside the usual guidance for the selected medication, but remain available in case a provider-specific order requires a different documented site.</div>
      </div>
    </div>`;
  wrap.querySelectorAll('.site-option').forEach(btn=>{
    btn.addEventListener('click',()=>selectAdminSite(btn.dataset.site, btn.dataset.allowed==='1'));
  });
}
function needleGuideData(){
  const selected=normalizeAdminSite(S.site||'');
  const route=(S.route||medAdminRule().route?.[0]||'').toLowerCase();
  const isSubq=route.includes('subq') || /subq|abdomen|upper arm/i.test(selected);
  if(isSubq){
    const siteLabel=selected||'abdomen / upper arm';
    const angle=/abdomen/i.test(siteLabel) ? '45°–90°' : '45°–90°';
    return {
      title:'Subcutaneous placement',
      pill:`SubQ · ${angle}`,
      metas:['SubQ route', angle, siteLabel],
      note:'Subcutaneous injections are placed into the fatty layer beneath the skin. Angle depends on tissue depth and the device / needle being used.',
      bullets:[
        'Use the ordered subcutaneous site and rotate injection areas when appropriate.',
        'Pinch or gently lift the subcutaneous tissue if needed, then insert at 45° to 90° based on tissue depth and needle length.',
        'Avoid massaging the area unless the manufacturer or provider specifically instructs otherwise.'
      ],
      svg:`<svg class="needle-svg" viewBox="0 0 240 180" aria-hidden="true">
        <rect class="n-skin" x="26" y="46" width="166" height="22" rx="11"></rect>
        <rect class="n-subq" x="26" y="68" width="166" height="44" rx="12"></rect>
        <rect class="n-muscle" x="26" y="112" width="166" height="38" rx="12"></rect>
        <path class="n-line" d="M142 28 L188 72"></path>
        <path class="n-line" d="M150 30 L188 68"></path>
        <path class="n-line" d="M184 64 L199 60"></path>
        <path class="n-line" d="M78 42 Q66 68 78 94"></path>
        <path class="n-line" d="M112 42 Q100 68 112 94"></path>
        <path class="n-line" d="M148 37 A26 26 0 0 1 175 52"></path>
        <text class="n-angle" x="171" y="42">${angle}</text>
        <text class="n-note" x="30" y="40">Skin</text>
        <text class="n-note" x="30" y="92">Subcutaneous tissue</text>
        <text class="n-note" x="30" y="138">Muscle</text>
        <text class="n-note" x="77" y="32">Lift / pinch if needed</text>
      </svg>`
    };
  }
  const siteLabel=selected||'deltoid / gluteal';
  return {
    title:'Intramuscular placement',
    pill:'IM · 90°',
    metas:['IM route','90°',siteLabel],
    note:'Intramuscular injections are given at a 90° angle into the muscle. Site landmarks and needle choice should follow the medication guidance and office protocol.',
    bullets:[
      'Identify the ordered IM site and confirm landmarks before administration.',
      'Insert at a 90° angle with the muscle relaxed. Deltoid and gluteal placement may differ in body positioning and landmarking.',
      'Do not massage the site unless the product guidance or provider specifically says to do so.'
    ],
    svg:`<svg class="needle-svg" viewBox="0 0 240 180" aria-hidden="true">
      <rect class="n-skin" x="26" y="44" width="172" height="22" rx="11"></rect>
      <rect class="n-subq" x="26" y="66" width="172" height="24" rx="11"></rect>
      <rect class="n-muscle" x="26" y="90" width="172" height="56" rx="14"></rect>
      <path class="n-line" d="M143 18 L143 96"></path>
      <path class="n-line" d="M151 18 L151 94"></path>
      <path class="n-line" d="M147 18 L160 6"></path>
      <path class="n-line" d="M147 18 L134 6"></path>
      <path class="n-line" d="M118 18 A28 28 0 0 1 147 47"></path>
      <text class="n-angle" x="92" y="28">90°</text>
      <text class="n-note" x="30" y="38">Skin</text>
      <text class="n-note" x="30" y="83">Subcutaneous layer</text>
      <text class="n-note" x="30" y="124">Muscle</text>
      <text class="n-note" x="134" y="156">Needle advances into muscle</text>
    </svg>`
  };
}
function renderNeedleGuide(){
  const guide=$('needleGuide'), pill=$('needleGuidePill'), title=$('needleGuideTitle'), meta=$('needleGuideMeta'), note=$('needleGuideNote'), list=$('needleGuideList'), diagram=$('needleGuideDiagram');
  if(!guide||!pill||!title||!meta||!note||!list||!diagram)return;
  const d=needleGuideData();
  pill.textContent=S.needleGuideOpen ? d.pill : 'Hidden';
  title.textContent=d.title;
  meta.innerHTML=(d.metas||[]).map(x=>`<span class="meta">${esc(x)}</span>`).join('');
  note.textContent=d.note;
  list.innerHTML=(d.bullets||[]).map(x=>`<li>${esc(x)}</li>`).join('');
  diagram.innerHTML=d.svg;
  guide.classList.toggle('hidden', !S.needleGuideOpen);
}
function setAdminGuideCollapsed(next){
  S.adminGuideCollapsed=!!next;
  const guide=$('adminGuide'), summary=$('adminGuideSummary'), detail=$('adminGuideDetail'), edit=$('adminGuideEdit');
  if(!guide||!summary||!detail)return;
  const canCollapse=!!(S.med && normalizeAdminSite(S.site||'') && S.route);
  const collapsed=canCollapse && !!S.adminGuideCollapsed;
  guide.classList.toggle('collapsed', collapsed);
  summary.classList.toggle('hidden', !collapsed);
  detail.classList.toggle('hidden', collapsed);
  detail.setAttribute('aria-hidden',String(collapsed));
  if(edit)edit.setAttribute('aria-expanded',String(!collapsed));
}
function renderAdminGuide(){
  const rule=medAdminRule();
  const title=$('adminGuideTitle'),sub=$('adminGuideSub'),pill=$('adminRoutePill'),allowed=$('adminAllowedText'),sel=$('adminSelectedText'),status=$('adminStatusText');
  const summary=$('adminGuideSummary'), summaryLine=$('adminGuideSummaryLine'), summarySub=$('adminGuideSummarySub');
  const routeText=(rule.route||[]).join(' / ')||'Route';
  const selected=normalizeAdminSite(S.site||'');
  const medName=S.med?S.med.label:'Select a medication';
  const doseText=S.dose?` ${S.dose}`:'';
  if(title)title.textContent=medName;
  if(sub)sub.textContent=rule.summary+' '+rule.note;
  if(pill)pill.textContent=routeText;
  if(allowed){
    const groupText=adminAllowedText(rule).replace(/^.*?·\s*/,'') || 'Manual site selection';
    allowed.innerHTML=`<div class="admin-route-row"><span class="admin-route-badge">${esc(routeText)}</span><span class="smallmuted">Usual route</span></div><div class="admin-site-groups"><b>Usual sites:</b> ${esc(groupText)}</div>`;
  }
  if(sel){
    const route=S.route||'route not selected';
    const site=selected||'site not selected';
    sel.innerHTML=`<div class="sel-med">${esc(medName+doseText)}</div><div class="sel-line"><b>${esc(route)}</b> · ${esc(site)}</div>`;
  }
  let statusText='Select medication, route, and site to confirm alignment.';
  let statusClass='';
  if(S.med&&selected){
    if(siteIsAllowed(selected)){
      statusClass='ok';
      statusText='Matches medication guidance. Ready to document route and site.';
    }else{
      statusClass='warn';
      statusText='Needs confirmation — selected route or site is outside usual guidance for this medication.';
    }
  }
  if(status){
    status.className='admin-status';
    if(statusClass)status.classList.add(statusClass);
    status.textContent=statusText;
  }
  if(summaryLine){
    const route=S.route||'Route pending';
    const site=selected||'Site pending';
    summaryLine.textContent=(S.med?`${medName}${doseText} · ${route} · ${site}`:'Select a medication');
  }
  if(summarySub) summarySub.textContent=statusText;
  const canCollapse=!!(S.med && selected && S.route);
  if(summary) summary.classList.toggle('hidden', !(canCollapse && S.adminGuideCollapsed));
  if(!canCollapse) S.adminGuideCollapsed=false;
  setAdminGuideCollapsed(S.adminGuideCollapsed);
  renderBodyMap();
  renderNeedleGuide();
}
function renderSites(){
  const b=$('siteChips'); if(!b)return; b.innerHTML='';
  const rule=medAdminRule();
  const sites=ADMIN_SITE_LIBRARY.map(s=>s.id);
  sites.forEach(s=>{
    const allowed=rule.sites.includes(s);
    const label=(ADMIN_SITE_LIBRARY.find(x=>x.id===s)||{}).label||s;
    const chip=chipEl(label,normalizeAdminSite(S.site)===s,`sm ${allowed?'':'muted warn'}`,()=>selectAdminSite(s,allowed));
    b.appendChild(chip);
  });
  renderAdminGuide();
}
function renderRoutes(){
  const b=$('routeChips');if(!b)return;b.innerHTML='';
  const rule=medAdminRule();
  const routes=Array.from(new Set([...(rule.route||[]), ...((S.med&&S.med.key==='other')?['IM','SubQ','IM (deep)']:[])]));
  routes.forEach(r=>b.appendChild(chipEl(r,S.route===r,'sm',()=>{S.route=r;renderRoutes();renderSites();render();})));
  renderAdminGuide();
}
function applyMedDoseRules(){
  if(!S.med)return;
  const rule=medAdminRule(S.med,S.dose);
  if(rule.route.length===1)S.route=rule.route[0];
  S.site=normalizeAdminSite(S.site);
  if(!S.site || !rule.sites.includes(S.site)){S.site=rule.sites[0]||S.site; $('siteAuto').style.display='';}
  if(S.med.key==='erzofri' && S.dose==='351 mg'){S.route='IM';S.site='R deltoid';$('siteAuto').style.display='';}
  if(S.med.key==='asimtufii'){S.route='IM'; if(!/gluteal/i.test(S.site)){S.site='R ventrogluteal';$('siteAuto').style.display='';}}
}
function selectMed(m){
  S.med=m;S.dose="";S.site="";S.route=m.route;S.intervalKey="";S.retCustom=false;
  S.adminGuideCollapsed=false;S.needleGuideOpen=false;
  S.flags={};
  $('tech').value=m.tech||'';$('siteAuto').style.display='';$('intAuto').style.display='';
  if(m.ndc){const n=$('ndc');n.value=m.ndc;n.classList.add('auto');}
  $('medHdr').classList.add('show');$('medHdrName').textContent=m.label;$('medHdrGen').textContent=m.gen||'manual entry';
  $('medChipsGrp').classList.add('hidden');$('medDetail').classList.remove('hidden');
  if(m.tip){$('medTip').classList.add('show');$('medTipTxt').textContent=m.tip;}else $('medTip').classList.remove('show');
  applyMedDoseRules();renderDoses();renderSites();renderRoutes();renderIntervals();renderMedSpec();renderInjSafetyChips();recalcNext();render();
}
const _ipmgPrevMedSafety=medicationSafetyItems;
medicationSafetyItems=function medicationSafetyItems(){
  const items=_ipmgPrevMedSafety();
  if(S.med&&S.site&&S.route){
    // Haldol Decanoate and Prolixin Decanoate are documented from the active
    // order: the local catalog does not invent an anatomical default or turn
    // an order-directed site string into a false safety stop.
    if(['haldol','prolixin'].includes(S.med.key))items.unshift({level:'info',text:'Route/site documented per active order'});
    else if(siteIsAllowed(S.site))items.unshift({level:'ok',text:'Route/site matches medication guidance'});
    else items.unshift({level:'danger',text:'Route/site outside usual guidance — verify provider direction'});
  }
  return items;
}
if($('adminGuideEdit'))$('adminGuideEdit').addEventListener('click',()=>{
  const opening=!!S.adminGuideCollapsed;
  S.adminGuideCollapsed=!S.adminGuideCollapsed;
  renderAdminGuide();
  if(opening)requestAnimationFrame(()=>{
    const target=$('bodyMap')?.querySelector('[role="button"][tabindex="0"],button:not([disabled])');
    if(target)target.focus({preventScroll:true});
  });
});
if($('needleGuideToggle'))$('needleGuideToggle').addEventListener('click',()=>{S.needleGuideOpen=!S.needleGuideOpen;renderNeedleGuide();});
try{renderSites();renderRoutes();renderAdminGuide();}catch(e){console.warn('site guide init skipped',e);}



/* PASS 66: Dashboard selection guard */
(function(){
  function clearDashboardSelection(){
    try{
      const sel=window.getSelection&&window.getSelection();
      if(sel&&sel.rangeCount)sel.removeAllRanges();
    }catch(e){}
    try{ if(document.selection)document.selection.empty(); }catch(e){}
  }
  function isDashboardControl(target){
    return !!(target&&target.closest&&target.closest('#panel-home .home-action,#panel-home .home-quick,#panel-home .workflow-qa-grid button,#panel-home .qa-chip,#panel-home .home-status-card,#panel-home .cmd-card'));
  }
  ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click','dblclick','selectstart'].forEach(evt=>{
    document.addEventListener(evt,function(e){
      if(isDashboardControl(e.target)){
        if(evt==='selectstart') e.preventDefault();
        setTimeout(clearDashboardSelection,0);
        setTimeout(clearDashboardSelection,80);
      }
    }, evt==='selectstart'?false:true);
  });
})();


/* PASS 68 runtime guard: dashboard actions stay icon-only, with no selectable text or pseudo-label source. */
(function(){
  function normalizeDashboardGoLabels(){
    document.querySelectorAll('#panel-home .home-action .go').forEach(go=>{
      go.removeAttribute('data-label');
      Array.from(go.childNodes).forEach(n=>{ if(n.nodeType===3) n.remove(); });
      go.setAttribute('aria-hidden','true');
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',normalizeDashboardGoLabels,{once:true});
  else normalizeDashboardGoLabels();
})();



/* ===================== PASS 69: interaction elegance behavior ===================== */
(function(){
  function tabClick(name){
    window.IPMGNavigation?.activate(name,{focusPanel:true,resetScroll:true});
  }
  function preferredCardAction(card){
    if(!card) return '';
    const primary=card.querySelector('.workflow-qa-btn.primary[data-qa-action]');
    const open=card.querySelector('.workflow-qa-btn[data-qa-action^="tab:"]');
    const any=card.querySelector('.workflow-qa-btn[data-qa-action]');
    return (primary||open||any)?.dataset.qaAction || '';
  }
  function runQaAction(action){
    if(!action) return;
    if(action.startsWith('tab:')) return tabClick(action.split(':')[1]);
    if(action==='print:avs' && window.$ && $('printAVS')) return $('printAVS').click();
    if(action==='print:udsPatient' && window.$ && $('printUdsPatient')) return $('printUdsPatient').click();
    if(action==='print:sample' && window.$ && $('samplePrint')) return $('samplePrint').click();
    if(action==='print:letter' && window.$ && $('letterPrint')) return $('letterPrint').click();
  }
  function labelQaButtons(){
    document.querySelectorAll('.workflow-qa-btn[data-qa-action]').forEach(btn=>{
      const txt=(btn.textContent||'').trim();
      if(txt) btn.setAttribute('aria-label',txt);
      btn.setAttribute('title',txt||'Open action');
    });
  }
  function wireWholeQaCards(){
    const grid=document.getElementById('workflowQaGrid');
    if(!grid || grid.dataset.pass69Wired) return;
    grid.dataset.pass69Wired='1';
    grid.addEventListener('click',e=>{
      const button=e.target.closest('.workflow-qa-btn[data-qa-action]');
      if(button) return;
      const card=e.target.closest('.workflow-qa-item');
      if(!card || !grid.contains(card)) return;
      e.preventDefault();
      runQaAction(preferredCardAction(card));
    });
    grid.addEventListener('keydown',e=>{
      if(e.key!=='Enter' && e.key!==' ') return;
      if(e.target.closest('.workflow-qa-btn[data-qa-action],button,a,input,select,textarea')) return;
      const card=e.target.closest('.workflow-qa-item');
      if(!card || !grid.contains(card)) return;
      e.preventDefault();
      runQaAction(preferredCardAction(card));
    });
  }
  function makeQaCardsFocusable(){
    document.querySelectorAll('.workflow-qa-item').forEach(card=>{
      card.removeAttribute('tabindex');
      card.setAttribute('role','group');
      const action=preferredCardAction(card);
      const name=card.querySelector('.workflow-qa-name')?.textContent?.trim()||'workflow';
      card.setAttribute('aria-label',`${name} workflow status and actions`);
      card.dataset.cardAction=action;
    });
  }
  function makeKbWholeHeader(){
    document.querySelectorAll('.kb-card .kh').forEach(head=>{
      if(!head.hasAttribute('tabindex')) head.setAttribute('tabindex','0');
      if(!head.hasAttribute('role')) head.setAttribute('role','button');
      const title=head.querySelector('.ktitle')?.textContent?.trim()||'knowledge card';
      head.setAttribute('aria-label',`Expand ${title}`);
      if(!head.dataset.pass69Keys){
        head.dataset.pass69Keys='1';
        head.addEventListener('keydown',e=>{
          if(e.key==='Enter'||e.key===' '){e.preventDefault();head.click();}
        });
      }
    });
  }
  function polishOutputTrayLabels(){
    document.querySelectorAll('.preview-col .sect .sh .cp').forEach(cp=>{
      const label=(cp.textContent||'Copy').trim()||'Copy';
      cp.setAttribute('aria-label',label);
      cp.setAttribute('title',label);
    });
  }
  function pass69Refresh(){
    labelQaButtons();
    makeQaCardsFocusable();
    makeKbWholeHeader();
    polishOutputTrayLabels();
  }
  const oldRenderWorkflowQa=window.renderWorkflowQa;
  if(typeof oldRenderWorkflowQa==='function' && !oldRenderWorkflowQa._pass69Wrapped){
    const wrapped=function(){
      const result=oldRenderWorkflowQa.apply(this,arguments);
      setTimeout(pass69Refresh,0);
      return result;
    };
    wrapped._pass69Wrapped=true;
    window.renderWorkflowQa=wrapped;
  }
  wireWholeQaCards();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',pass69Refresh); else pass69Refresh();
  const mo=new MutationObserver(()=>pass69Refresh());
  const grid=document.getElementById('workflowQaGrid');
  if(grid) mo.observe(grid,{childList:true,subtree:true});
})();



/* ===================== PASS 81: forms sidebar behavior + icon restore ===================== */
(function(){
  const FORM_TYPE_ICONS={
    work:'✦',
    disability:'▣',
    fmla:'☑',
    records:'◇',
    med:'✚',
    other:'…'
  };
  window.renderFormsTypeGrid=function(){
    const grid=$('formsTypeGrid'); if(!grid)return; grid.innerHTML='';
    FORM_TYPES.forEach(x=>{
      const el=document.createElement('div');
      el.className='form-kind '+(FORMS.type===x.k?'on':'');
      el.setAttribute('role','button');
      el.setAttribute('tabindex','0');
      el.innerHTML=`<div class="fi" aria-hidden="true">${FORM_TYPE_ICONS[x.k]||'•'}</div><div><div class="t">${esc(x.t)}</div><div class="d">${esc(x.d)}</div></div>`;
      const activate=()=>{FORMS.type=x.k;renderFormsTypeGrid();renderForms();};
      el.addEventListener('click',activate);
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}});
      grid.appendChild(el);
    });
  };
  function restoreFormsSidebarActions(){
    const map={formsReset:'↺',formsCopy:'⧉',letterPrint:'⎙',letterCopy:'⧉',formsAddLog:'＋'};
    Object.entries(map).forEach(([id,icon])=>{const el=$(id); if(el) el.setAttribute('data-form-icon',icon);});
  }
  function refreshFormsPass81(){
    try{renderFormsTypeGrid();}catch(e){}
    restoreFormsSidebarActions();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshFormsPass81,{once:true});
  else refreshFormsPass81();
})();


/* ===================== RELEASE PASS: live dashboard card status dots ===================== */
(function(){
  const LABEL_TO_TAB={
    'injection':'administer',
    'uds':'uds',
    'samples':'samples',
    'forms':'forms',
    'forms / letters':'forms',
    'tms':'tms'
  };
  function syncHomeCardDots(){
    const statusByTab={};
    document.querySelectorAll('#homeReadiness .home-check').forEach(row=>{
      const label=(row.querySelector('b')?.textContent||'').trim().toLowerCase();
      const lvl=['danger','warn','ready','idle'].find(c=>row.classList.contains(c))||'idle';
      const tab=LABEL_TO_TAB[label];
      if(tab) statusByTab[tab]=lvl;
    });
    document.querySelectorAll('#panel-home .home-action[data-jump-tab]').forEach(card=>{
      const tab=card.dataset.jumpTab;
      let st=statusByTab[tab]||'idle';
      if(tab==='log'){
        const log=(typeof LOG!=='undefined')?LOG:null;
        st=(Array.isArray(log)&&log.length)?'ready':'idle';
      }
      card.setAttribute('data-status',st);
    });
  }
  const prev=window.renderHome;
  if(typeof prev==='function' && !prev._dotWrap){
    const wrapped=function(){ const r=prev.apply(this,arguments); try{syncHomeCardDots();}catch(e){} return r; };
    wrapped._dotWrap=true;
    window.renderHome=wrapped;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(syncHomeCardDots,0));
  else setTimeout(syncHomeCardDots,0);
})();


/* ===================== RELEASE PASS: clinical decision support ===================== */
/* (A) UDS medication-reconciliation interpreter  (B) LAI dosing-window + missed-dose guardrail.
   Cross-reactivity / detection notes per AAFP 2010 & 2019, US Pharmacist 2016, J Anal Toxicol 2014.
   All output stays preliminary; the provider makes the final clinical interpretation. */
(function(){
  /* ---------- (A) UDS medication reconciliation ---------- */
  const UDS_RX_MEDS=[
    {key:'clonazepam',label:'Clonazepam',panel:'BZO',detect:'poor'},
    {key:'lorazepam',label:'Lorazepam',panel:'BZO',detect:'poor'},
    {key:'alprazolam',label:'Alprazolam',panel:'BZO',detect:'poor'},
    {key:'diazepam',label:'Diazepam',panel:'BZO',detect:'reliable'},
    {key:'temazepam',label:'Temazepam',panel:'BZO',detect:'reliable'},
    {key:'buprenorphine',label:'Buprenorphine',panel:'BUP',detect:'reliable'},
    {key:'methadone',label:'Methadone',panel:'MTD',detect:'reliable'},
    {key:'morphine',label:'Morphine',panel:'MOP',detect:'reliable'},
    {key:'codeine',label:'Codeine',panel:'MOP',detect:'reliable'},
    {key:'oxycodone',label:'Oxycodone',panel:'OXY',detect:'reliable',note:'Often missed by the general opiate (MOP) panel — read the dedicated oxycodone (OXY) panel.'},
    {key:'hydrocodone',label:'Hydrocodone',panel:'MOP',detect:'poor',note:'Semisynthetic opioid — variably detected by the opiate (MOP) panel; may read negative even when taken.'},
    {key:'amphetamine',label:'Amphetamine (Adderall)',panel:'AMP',detect:'reliable'},
    {key:'lisdex',label:'Lisdexamfetamine (Vyvanse)',panel:'AMP',detect:'reliable'},
    {key:'methylphenidate',label:'Methylphenidate (Ritalin)',panel:null,detect:'none',note:'Does not cross-react with the amphetamine panel — expected to read negative even when taken as prescribed.'},
    {key:'phenobarbital',label:'Phenobarbital',panel:'BAR',detect:'reliable'},
    {key:'amitriptyline',label:'Amitriptyline',panel:'TCA',detect:'reliable'},
    {key:'nortriptyline',label:'Nortriptyline',panel:'TCA',detect:'reliable'},
    {key:'doxepin',label:'Doxepin',panel:'TCA',detect:'reliable'},
    {key:'dronabinol',label:'Dronabinol',panel:'THC',detect:'reliable'},
    {key:'tramadol',label:'Tramadol',panel:null,detect:'none',note:'Not detected by the standard opiate (MOP) panel.'},
    {key:'naltrexone',label:'Naltrexone / Vivitrol',panel:null,detect:'none',note:'May affect some opioid immunoassay methods; check the device IFU. Do not infer an expected result from this helper.'}
  ];
  const UDS_FALSE_POS={
    AMP:['bupropion','trazodone','pseudoephedrine / decongestants','atomoxetine','selegiline','labetalol'],
    MET:['selegiline','OTC nasal inhaler (l-methamphetamine)','bupropion'],
    TCA:['quetiapine','diphenhydramine','carbamazepine','cyclobenzaprine'],
    PCP:['dextromethorphan','ketamine','venlafaxine','tramadol'],
    THC:['dronabinol','efavirenz','some NSAIDs (rare)'],
    BZO:['sertraline (rare)','efavirenz (rare)'],
    MOP:['poppy seeds','quinolone antibiotics','rifampin'],
    MTD:['quetiapine (reported)','verapamil (reported)']
  };
  function panelName(p){return (typeof UDS_PANEL_INFO!=='undefined'&&UDS_PANEL_INFO[p]&&UDS_PANEL_INFO[p].name)||p;}
  function computeUdsReconcile(){
    const items=[], noteLines=[];
    if(typeof UDS==='undefined'||typeof UDS_PANELS==='undefined') return {items,noteLines};
    const sel=(UDS.rxMeds||[]).map(k=>UDS_RX_MEDS.find(m=>m.key===k)).filter(Boolean);
    if(!sel.length) return {items,noteLines};
    const byPanel={};
    sel.forEach(m=>{ if(m.panel){(byPanel[m.panel]=byPanel[m.panel]||[]).push(m);} });
    const res=p=>UDS.results[p]||'nt';
    sel.filter(m=>!m.panel).forEach(m=>{
      items.push({level:'info',text:`${m.label}: ${m.note}`});
      noteLines.push(`${m.label.replace(/\s*\(.*\)/,'')} — ${m.note}`);
    });
    UDS_PANELS.forEach(p=>{
      const st=res(p); if(st==='nt'||st==='invalid') return;
      const meds=byPanel[p]||[];
      if(st==='pos'){
        if(meds.length){
          const names=meds.map(m=>m.label).join(', ');
          items.push({level:'info',text:`${panelName(p)} preliminary positive may be consistent with listed ${names}; verify the device IFU/cutoffs, timing, and full medication history.`});
          noteLines.push(`${panelName(p)} preliminary positive may be consistent with listed ${names}; verify device IFU/cutoffs, timing, and full medication history.`);
        }else{
          const fp=UDS_FALSE_POS[p]||[];
          const fpTxt=fp.length?` Common interferents (verify before acting): ${fp.join(', ')}.`:'';
          items.push({level:'warn',text:`${panelName(p)} positive with no listed medication to explain it — provider review.${fpTxt}`});
          noteLines.push(`${panelName(p)} positive without a listed medication explanation; provider review.`);
        }
      }else if(st==='neg'){
        const reliable=meds.filter(m=>m.detect==='reliable');
        const poor=meds.filter(m=>m.detect==='poor');
        if(reliable.length){
          const names=reliable.map(m=>m.label).join(', ');
          items.push({level:'warn',text:`${panelName(p)} negative is unexpected for listed ${names}; do not infer adherence or diversion from this point-of-care screen. Verify the device IFU, timing, medication history, and need for confirmation.`});
          noteLines.push(`${panelName(p)} negative is unexpected for listed ${names}; do not infer adherence or diversion from this point-of-care screen. Verify device IFU, timing, medication history, and need for confirmation.`);
        }else if(poor.length){
          const names=poor.map(m=>m.label).join(', ');
          items.push({level:'info',text:`${panelName(p)} negative; the immunoassay often misses ${names}, so a negative does not confirm non-adherence.`});
          noteLines.push(`${panelName(p)} negative; assay often misses ${names} — a negative does not confirm non-adherence.`);
        }
      }
    });
    return {items,noteLines};
  }
  function renderUdsReconChips(){
    const box=$('udsReconChips'); if(!box) return; box.innerHTML='';
    UDS_RX_MEDS.forEach(m=>{
      const on=(UDS.rxMeds||[]).includes(m.key);
      const el=document.createElement('span');
      el.className='rc-chip'+(on?' on':''); el.textContent=m.label;
      el.setAttribute('role','button'); el.setAttribute('tabindex','0');
      const toggle=()=>{
        UDS.rxMeds=UDS.rxMeds||[];
        const i=UDS.rxMeds.indexOf(m.key);
        if(i>=0) UDS.rxMeds.splice(i,1); else UDS.rxMeds.push(m.key);
        renderUdsReconChips();
        if(typeof renderUdsNote==='function') renderUdsNote();
      };
      el.addEventListener('click',toggle);
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
      box.appendChild(el);
    });
  }
  function renderUdsReconInterp(){
    const box=$('udsReconInterp'); if(!box) return;
    const sel=(typeof UDS!=='undefined'&&UDS.rxMeds)||[];
    const {items}=computeUdsReconcile();
    if(!sel.length){ box.innerHTML=`<div class="rc-empty">Select the patient’s current medications above to flag expected vs. unexpected results and known assay limitations.</div>`; return; }
    if(!items.length){ box.innerHTML=`<div class="rc-empty">No expected/unexpected conflicts among tested panels for the selected medications.</div>`; return; }
    box.innerHTML=items.map(i=>`<div class="rc-item ${i.level}">${esc(i.text)}</div>`).join('');
  }
  function buildUdsReconUI(){
    const wrap=$('udsReconWrap'); if(!wrap||wrap.dataset.built) return;
    wrap.dataset.built='1';
    if(typeof UDS!=='undefined'&&!UDS.rxMeds) UDS.rxMeds=[];
    wrap.innerHTML=`<div class="rc-label">Current medications — for screen interpretation <span class="rc-tag">decision support</span></div>
      <div class="rc-chips" id="udsReconChips"></div>
      <div class="rc-interp" id="udsReconInterp"></div>`;
    renderUdsReconChips();
    renderUdsReconInterp();
  }
  /* inject reconciliation into the UDS handoff note (kept copyable via window._udsNote.as) */
  if(typeof renderUdsNote==='function' && !renderUdsNote._reconWrap){
    const _prev=renderUdsNote;
    const wrapped=function(){
      const r=_prev.apply(this,arguments);
      try{
        const {noteLines}=computeUdsReconcile();
        if(noteLines.length){
          const txt='Medication reconciliation (staff, preliminary): '+noteLines.join(' ');
          if(window._udsNote){ window._udsNote.as=(window._udsNote.as?window._udsNote.as+'\n\n':'')+txt; }
          const as=$('udsOutAS');
          if(as){ const g=document.createElement('div'); g.className='note-group'; g.innerHTML=`<span class="note-label">Medication reconciliation</span>`+noteLines.map(l=>`<p>${esc(l)}</p>`).join(''); as.appendChild(g); }
        }
        renderUdsReconInterp();
      }catch(e){}
      return r;
    };
    wrapped._reconWrap=true;
    renderUdsNote=wrapped;
  }

  /* ---------- (B) LAI dosing-window + missed-dose guardrail ---------- */
  function injectionTiming(){
    if(typeof S==='undefined'||!S.med||S.med.key==='other') return null;
    const exp=($('exp')?.value||'').trim();
    if(exp && typeof monthExpired==='function' && monthExpired(exp,$('adminDate')?.value||'')){
      return {level:'danger',pill:'Do not administer',detail:'Medication lot appears past its expiration date — do not administer. Obtain in-date stock and re-verify lot and expiration before giving.',missed:''};
    }
    if(S.med.intervalKey==='once'){
      return {level:'ok',pill:'One-time dose',detail:'One-time initiation/loading dose — routine interval spacing does not apply.',missed:''};
    }
    const prior=($('priorDose')?.value||''), admin=($('adminDate')?.value||'');
    const intervalDays=(typeof intDays==='function')?intDays(S.intervalKey):0;
    if(!(intervalDays>0)) return {level:'ok',pill:'Set interval',detail:'Set a dosing interval to evaluate timing.',missed:''};
    if(!prior) return {level:'ok',pill:'Add prior dose',detail:S.med.timingMode==='orderVerify'?'Enter the prior injection date and verify timing against the active provider order and current PI.':'Enter the prior injection date to confirm today’s dose falls within the labeled dosing window.',missed:''};
    if(!admin) return null;
    const daysSince=Math.round((new Date(admin+'T00:00:00')-new Date(prior+'T00:00:00'))/86400000);
    if(daysSince<0) return {level:'warn',pill:'Check dates',detail:'The administered date is before the prior-dose date — verify the dates entered.',missed:''};
    if(S.med.timingMode==='orderVerify'){
      return {level:'warn',pill:'Verify order / PI',detail:`${daysSince} day(s) since the prior dose. Use the active provider order and current product PI for timing and any re-initiation decision; this helper does not provide a generic labeled early/late window for this product.`,missed:S.med.missed||''};
    }
    const w=effectiveWindow(S.med,S.intervalKey);
    const early=intervalDays-(w.winB||0), late=intervalDays+(w.winA||0);
    if(daysSince<early){
      return {level:'warn',pill:'Early',detail:`Given ${daysSince} day(s) after the prior dose — earlier than the labeled window (about ${early}–${late} days). Confirm this is an intentional, provider-directed early dose.`,missed:''};
    }
    if(daysSince<=late){
      return {level:'ok',pill:'On schedule',detail:`Given ${daysSince} day(s) after the prior dose — within the labeled window (about ${early}–${late} days).`,missed:''};
    }
    const over=daysSince-late;
    const farLate=daysSince>Math.round(intervalDays*1.5);
    return {level:'danger',pill:farLate?'Significantly overdue':'Late',
      detail:`Given ${daysSince} day(s) after the prior dose — ${over} day(s) beyond the labeled window (about ${early}–${late} days).${farLate?' A gap this long may require re-initiation/loading rather than a routine maintenance dose.':''} Confirm timing and dosing with the provider.`,
      missed:S.med.missed||''};
  }
  function renderInjTiming(){
    const box=$('injTiming'); if(!box) return;
    const t=injectionTiming();
    if(!t){ box.className='inj-timing'; box.innerHTML=''; return; }
    box.className='inj-timing show '+t.level;
    box.innerHTML=`<div class="tl-head">Dosing window check <span class="tl-pill">${esc(t.pill)}</span></div>`+
      `<div class="tl-detail">${esc(t.detail)}</div>`+
      (t.missed?`<div class="tl-missed"><b>Missed-dose guidance:</b> ${esc(t.missed)}</div>`:'');
  }
  if(typeof recalcNext==='function' && !recalcNext._timingWrap){
    const _prev=recalcNext;
    const wrapped=function(){ const r=_prev.apply(this,arguments); try{renderInjTiming();}catch(e){} return r; };
    wrapped._timingWrap=true;
    recalcNext=wrapped;
  }
  function populatePriorSiteOptions(){
    const sel=$('priorSite'); if(!sel||sel.dataset.built) return;
    sel.dataset.built='1';
    ADMIN_SITE_LIBRARY.forEach(s=>{ const o=document.createElement('option'); o.value=s.id; o.textContent=s.label; sel.appendChild(o); });
  }
  function priorSiteInfo(){
    const prior=($('priorSite')?.value||'').trim();
    if(!prior) return null;
    const label=(ADMIN_SITE_LIBRARY.find(s=>s.id===prior)||{}).label||prior;
    const today=typeof normalizeAdminSite==='function'?normalizeAdminSite(S.site||''):(S.site||'');
    const same=!!today && today===prior;
    return {label, same, line: same?`Same site as the prior documented dose (${label}) — consider rotating to a different site.`:`Prior site: ${label}.`};
  }
  /* inject prior-dose date/timing and prior-site/rotation check into the injection note (kept copyable via window._note.pl) */
  if(typeof render==='function' && !render._priorDoseWrap){
    const _prevRender=render;
    const wrapped=function(){
      const r=_prevRender.apply(this,arguments);
      try{
        const prior=($('priorDose')?.value||'').trim();
        const siteInfo=priorSiteInfo();
        if((prior||siteInfo) && typeof S!=='undefined' && S.med){
          const lines=[];
          if(prior){ const t=injectionTiming(); lines.push(`Prior dose: ${fmtDate(prior)}${t&&t.detail?' — '+t.detail:''}`); }
          if(siteInfo) lines.push(siteInfo.line);
          const joined=lines.join('\n');
          if(window._note){ window._note.pl=(window._note.pl?window._note.pl+'\n':'')+joined; }
          const pl=$('outPL');
          if(pl){
            if(prior){ const p=document.createElement('p'); p.textContent=lines[0]; pl.appendChild(p); }
            if(siteInfo){ const p=document.createElement('p'); p.textContent=siteInfo.line; if(siteInfo.same){p.style.color='var(--amber)';p.style.fontWeight='600';} pl.appendChild(p); }
          }
        }
      }catch(e){}
      return r;
    };
    wrapped._priorDoseWrap=true;
    render=wrapped;
  }
  if(typeof softResetUds==='function' && !softResetUds._reconWrap){
    const _prev=softResetUds;
    const wrapped=function(){ if(typeof UDS!=='undefined') UDS.rxMeds=[]; const r=_prev.apply(this,arguments); try{renderUdsReconChips();renderUdsReconInterp();}catch(e){} return r; };
    wrapped._reconWrap=true;
    softResetUds=wrapped;
  }
  function initClinical(){
    buildUdsReconUI();
    populatePriorSiteOptions();
    try{ if($('priorDose')) $('priorDose').addEventListener('change',()=>{try{renderInjTiming();}catch(e){} try{if(typeof render==='function')render();}catch(e){}}); }catch(e){}
    try{ if($('priorSite')) $('priorSite').addEventListener('change',()=>{
      try{if(typeof renderBodyMap==='function')renderBodyMap();}catch(e){}
      try{if(typeof renderAdminGuide==='function')renderAdminGuide();}catch(e){}
      try{if(typeof render==='function')render();}catch(e){}
    }); }catch(e){}
    try{ if($('exp')) $('exp').addEventListener('input',()=>{try{renderInjTiming();}catch(e){}}); }catch(e){}
    try{ if(typeof renderUdsNote==='function') renderUdsNote(); }catch(e){}
    try{ renderInjTiming(); }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initClinical,{once:true});
  else initClinical();
})();


/* ===================== RELEASE PASS: interactive injection body map ===================== */
(function(){
  const BM_FRONT_BASE=`
    <circle class="bm-base" cx="125" cy="30" r="18"></circle>
    <path class="bm-base" d="M87 60 C97 52 109 48 125 48 C141 48 153 52 163 60 C171 67 175 78 174 91 L171 124 C170 133 164 141 156 145 L149 147 L146 178 L142 252 C141 262 148 269 156 269 C164 269 169 263 169 254 L169 194 C169 185 157 183 153 190 L141 223 C138 229 133 233 125 233 C117 233 112 229 109 223 L97 190 C93 183 81 185 81 194 L81 254 C81 263 86 269 94 269 C102 269 109 262 108 252 L104 178 L101 147 L94 145 C86 141 80 133 79 124 L76 91 C75 78 79 67 87 60 Z"></path>
    <path class="bm-base-soft" d="M78 88 C65 98 60 113 60 128 L60 154 C60 164 66 172 74 172 C82 172 88 165 88 155 L88 116 C88 107 84 97 78 88 Z"></path>
    <path class="bm-base-soft" d="M172 88 C185 98 190 113 190 128 L190 154 C190 164 184 172 176 172 C168 172 162 165 162 155 L162 116 C162 107 166 97 172 88 Z"></path>`;
  const BM_BACK_BASE=`
    <circle class="bm-base" cx="125" cy="30" r="18"></circle>
    <path class="bm-base" d="M87 60 C97 52 109 48 125 48 C141 48 153 52 163 60 C171 67 175 78 174 91 L171 124 C170 133 164 141 156 145 L149 147 L146 178 L142 252 C141 262 148 269 156 269 C164 269 169 263 169 254 L169 192 C169 183 161 175 152 174 L98 174 C89 175 81 183 81 192 L81 254 C81 263 86 269 94 269 C102 269 109 262 108 252 L104 178 L101 147 L94 145 C86 141 80 133 79 124 L76 91 C75 78 79 67 87 60 Z"></path>
    <path class="bm-base-soft" d="M78 88 C65 98 60 113 60 128 L60 154 C60 164 66 172 74 172 C82 172 88 165 88 155 L88 116 C88 107 84 97 78 88 Z"></path>
    <path class="bm-base-soft" d="M172 88 C185 98 190 113 190 128 L190 154 C190 164 184 172 176 172 C168 172 162 165 162 155 L162 116 C162 107 166 97 172 88 Z"></path>`;
  const BM_ZONES_FRONT=[
    {key:'r-deltoid',cands:['R deltoid'],shape:{t:'ellipse',cx:74,cy:112,rx:13,ry:16},label:'R',lx:74,ly:115},
    {key:'l-deltoid',cands:['L deltoid'],shape:{t:'ellipse',cx:176,cy:112,rx:13,ry:16},label:'L',lx:176,ly:115},
    {key:'abd-luq',cands:['Abdomen LUQ (SubQ)'],shape:{t:'rect',x:107,y:95,w:18,h:18,rx:5}},
    {key:'abd-ruq',cands:['Abdomen RUQ (SubQ)'],shape:{t:'rect',x:126,y:95,w:18,h:18,rx:5}},
    {key:'abd-llq',cands:['Abdomen LLQ (SubQ)'],shape:{t:'rect',x:107,y:114,w:18,h:18,rx:5}},
    {key:'abd-rlq',cands:['Abdomen RLQ (SubQ)'],shape:{t:'rect',x:126,y:114,w:18,h:18,rx:5}},
    {key:'r-upper-arm',cands:['R upper arm (SubQ)'],shape:{t:'ellipse',cx:74,cy:150,rx:12,ry:15},label:'R',lx:74,ly:153},
    {key:'l-upper-arm',cands:['L upper arm (SubQ)'],shape:{t:'ellipse',cx:176,cy:150,rx:12,ry:15},label:'L',lx:176,ly:153}
  ];
  const BM_ZONES_BACK=[
    {key:'l-gluteal',cands:['L ventrogluteal','L dorsogluteal'],shape:{t:'ellipse',cx:104,cy:160,rx:24,ry:18},label:'L',lx:104,ly:164},
    {key:'r-gluteal',cands:['R ventrogluteal','R dorsogluteal'],shape:{t:'ellipse',cx:146,cy:160,rx:24,ry:18},label:'R',lx:146,ly:164}
  ];
  const ALL_ZONES=[...BM_ZONES_FRONT,...BM_ZONES_BACK];
  const ROT_IC='<svg class="bm-rot-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';

  /* ----- persistent per-patient site history (cross-visit rotation) ----- */
  const SITE_HISTORY_KEY='ipmgMedAssistSiteHistory';
  function loadSiteHistory(){ try{const r=SAFE_STORAGE.get(SITE_HISTORY_KEY);const o=r?JSON.parse(r):{};return (o&&typeof o==='object')?o:{};}catch(e){return {};} }
  function ptKey(name,dob){
    const patient=(name||'').trim().toLowerCase(),birthDate=(dob||'').trim().toLowerCase();
    return patient&&birthDate?`${patient}|${birthDate}`:'';
  }
  window.recordInjectionSite=function(name,site,dob,context={}){
    const key=ptKey(name,dob||$('ptDOB')?.value);
    const medKey=String(context.medKey||(typeof S!=='undefined'&&S.med&&S.med.key)||'').trim();
    const route=String(context.route||(typeof S!=='undefined'&&S.route)||'').trim();
    const date=String(context.adminDate||$('adminDate')?.value||localDateValue()).trim();
    if(!key||!site||!medKey||!route||!date)return false;
    try{
      const h=loadSiteHistory();
      const list=Array.isArray(h[key])?h[key]:[],recordId=String(context.recordId||'').trim();
      const fingerprint=[date,medKey,route,site].join('|');
      const next=list.filter(entry=>recordId?entry.recordId!==recordId:entry.fingerprint!==fingerprint);
      next.push({site,date,medKey,route,recordId,fingerprint,storedAt:new Date().toISOString()});
      h[key]=next.slice(-12);
      return SAFE_STORAGE.set(SITE_HISTORY_KEY,JSON.stringify(h))===true;
    }catch(e){return false;}
  };
  function lastInjectionSiteForPatient(){
    const key=ptKey($('ptName')?.value,$('ptDOB')?.value);
    if(!key) return null;
    try{
      const h=loadSiteHistory();
      const medKey=String((typeof S!=='undefined'&&S.med&&S.med.key)||'').trim();
      const route=String((typeof S!=='undefined'&&S.route)||'').trim();
      const list=(Array.isArray(h[key])?h[key]:[]).filter(entry=>entry&&entry.medKey===medKey&&entry.route===route).sort((a,b)=>`${a.date||''}|${a.storedAt||''}`.localeCompare(`${b.date||''}|${b.storedAt||''}`));
      if(Array.isArray(list)&&list.length){
        const e=list[list.length-1];
        let whenShort=e.date;
        try{ whenShort=new Date(e.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); }catch(_){}
        return {site:e.site,whenShort};
      }
    }catch(e){}
    return null;
  }
  function enteredPriorSiteForEncounter(){
    const site=typeof normalizeAdminSite==='function'
      ? normalizeAdminSite(($('priorSite')?.value||'').trim())
      : ($('priorSite')?.value||'').trim();
    if(!site)return null;
    const priorDose=($('priorDose')?.value||'').trim();
    let whenShort='';
    if(priorDose){
      try{whenShort=new Date(priorDose+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}catch(_){whenShort=priorDose;}
    }
    return {site,whenShort,source:'encounter'};
  }
  function injectionSiteRotationContext(){
    return enteredPriorSiteForEncounter()||lastInjectionSiteForPatient();
  }
  function mirrorSite(site){
    if(/^R /.test(site)) return site.replace(/^R /,'L ');
    if(/^L /.test(site)) return site.replace(/^L /,'R ');
    const q={'Abdomen LUQ (SubQ)':'Abdomen RLQ (SubQ)','Abdomen RUQ (SubQ)':'Abdomen LLQ (SubQ)','Abdomen LLQ (SubQ)':'Abdomen RUQ (SubQ)','Abdomen RLQ (SubQ)':'Abdomen LUQ (SubQ)'};
    return q[site]||site;
  }
  function recommendedInjectionSite(rule,prior){
    const allowed=Array.isArray(rule&&rule.sites)?rule.sites:[];
    if(!prior||!prior.site||!allowed.length)return '';
    const normalized=typeof normalizeAdminSite==='function'?normalizeAdminSite(prior.site):prior.site;
    const mirrored=mirrorSite(normalized);
    if(mirrored!==normalized&&allowed.includes(mirrored))return mirrored;
    const opposite=allowed.find(site=>site!==normalized&&(
      (/^R /.test(normalized)&&/^L /.test(site))||
      (/^L /.test(normalized)&&/^R /.test(site))
    ));
    return opposite||allowed.find(site=>site!==normalized)||'';
  }
  window.injectionSiteRotationContext=injectionSiteRotationContext;
  window.injectionRecommendedSite=function(rule){return recommendedInjectionSite(rule||medAdminRule(),injectionSiteRotationContext());};

  function zoneSVG(z,rule,selKey,lastKey,recommendedKey){
    const allowed=z.cands.some(c=>rule.sites.includes(c));
    const sel=selKey===z.key;
    const isLast=lastKey===z.key;
    const isRecommended=recommendedKey===z.key&&!sel;
    const cls='bz '+(allowed?'bz-ok':'bz-mute')+(sel?' bz-sel':'')+(isRecommended?' bz-rec':'');
    const s=z.shape; let shape,ring='';
    if(s.t==='ellipse'){
      const hitRx=z.key.includes('gluteal')?Math.min(s.rx,20):s.rx;
      shape=`<ellipse class="bz-hit" cx="${s.cx}" cy="${s.cy}" rx="${hitRx}" ry="${s.ry}"></ellipse><ellipse class="bz-shape" cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"></ellipse>`;
      if(isLast) ring=`<ellipse class="bz-last-ring" cx="${s.cx}" cy="${s.cy}" rx="${s.rx+5}" ry="${s.ry+5}"></ellipse>`;
    }else{
      shape=`<rect class="bz-hit" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.rx||5}"></rect><rect class="bz-shape" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.rx}"></rect>`;
      if(isLast) ring=`<rect class="bz-last-ring" x="${s.x-4}" y="${s.y-4}" width="${s.w+8}" height="${s.h+8}" rx="${(s.rx||5)+3}"></rect>`;
    }
    const label=z.label?`<text class="bm-z-label" x="${z.lx}" y="${z.ly}" text-anchor="middle">${z.label}</text>`:'';
    const ariaState=(isRecommended?', recommended alternate':'')+(isLast?', previous site':'');
    return `<g class="${cls}" data-zone="${z.key}" role="button" tabindex="0" aria-pressed="${sel?'true':'false'}" aria-label="${esc(((ADMIN_SITE_LIBRARY.find(a=>a.id===z.cands[0])||{}).label||z.key)+ariaState)}">${shape}${label}</g>${ring}`;
  }

  function renderBodyMapInteractive(){
    const wrap=$('bodyMap'); if(!wrap) return;
    if(typeof S==='undefined'||!S.med){
      wrap.className='bodymap2';
      wrap.innerHTML=`<div class="bm-rotation none">${ROT_IC}<div>Select a medication to see its allowed injection sites on the body map.</div></div>`;
      return;
    }
    const rule=medAdminRule();
    const selKey=previewSiteKey(normalizeAdminSite(S.site||''));
    const last=injectionSiteRotationContext();
    const lastKey=last?previewSiteKey(last.site):'';
    const recommended=last?recommendedInjectionSite(rule,last):'';
    const recommendedKey=recommended?previewSiteKey(recommended):'';
    if(typeof S!=='undefined')S.siteSuggestion=recommended||((rule.sites||[])[0]||'');
    const routeTxt=(rule.route||[]).join(' / ')||'Route';
    const frontZones=BM_ZONES_FRONT.map(z=>zoneSVG(z,rule,selKey,lastKey,recommendedKey)).join('');
    const backZones=BM_ZONES_BACK.map(z=>zoneSVG(z,rule,selKey,lastKey,recommendedKey)).join('');
    const frontSVG=`<svg class="bm-svg" viewBox="0 0 250 300" role="group" aria-label="Front view injection sites">${BM_FRONT_BASE}${frontZones}</svg>`;
    const backSVG=`<svg class="bm-svg" viewBox="0 0 250 300" role="group" aria-label="Back view injection sites">${BM_BACK_BASE}${backZones}</svg>`;
    let rot;
    if(last){
      const selected=normalizeAdminSite(S.site||'');
      const sameAsPrior=selected&&selected===normalizeAdminSite(last.site);
      const recommendationSelected=recommended&&selected===recommended;
      const altChip=(recommended&&!recommendationSelected)?`<span class="bm-rot-alt" data-alt="${esc(recommended)}" role="button" tabindex="0">Select ${esc(adminSiteDisplay(recommended))}</span>`:'';
      const selectedMark=recommendationSelected?'<span class="bm-rec-confirmed">Recommended site selected</span>':'';
      const recommendationCopy=recommended
        ? ` <b>Recommended alternate:</b> ${esc(adminSiteDisplay(recommended))}.`
        : ' No different site is available within the current medication guidance; verify the active order and product instructions.';
      rot=`<div class="bm-rotation ${sameAsPrior?'warn':''} ${recommendationSelected?'done':''}">${ROT_IC}<div><b>Prior dose:</b> ${esc(adminSiteDisplay(last.site))}${last.whenShort?` · ${esc(last.whenShort)}`:''}.${recommendationCopy}${sameAsPrior?' <strong>Today’s selection repeats the prior site.</strong>':''}${altChip}${selectedMark}</div></div>`;
    }else if(($('priorDose')?.value||'').trim()){
      let priorLabel='';
      try{priorLabel=new Date($('priorDose').value+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}catch(_){priorLabel=$('priorDose').value;}
      rot=`<div class="bm-rotation none">${ROT_IC}<div><b>Prior dose:</b> ${esc(priorLabel)}. Add the previous injection site above to receive a rotation recommendation.</div></div>`;
    }else{
      rot=`<div class="bm-rotation none">${ROT_IC}<div>No prior injection on file for this patient. Documenting today’s site starts rotation tracking for next visit.</div></div>`;
    }
    const allowedSites=ADMIN_SITE_LIBRARY.map(s=>s.id).filter(id=>rule.sites.includes(id));
    const lmChips=allowedSites.map(id=>{
      const on=normalizeAdminSite(S.site||'')===id;
      const lastDot=(last&&previewSiteKey(last.site)===previewSiteKey(id))?'<span class="bm-lm-dot" title="last dose zone"></span>':'';
      const rec=id===recommended&&!on;
      const recBadge=rec?'<span class="bm-rec-badge">Recommended</span>':'';
      const ariaState=(rec?', recommended alternate':'')+(last&&previewSiteKey(last.site)===previewSiteKey(id)?', previous site':'');
      return `<span class="bm-lm ${on?'on':''} ${rec?'recommended':''}" data-site="${esc(id)}" role="button" tabindex="0" aria-pressed="${on?'true':'false'}" aria-label="${esc(adminSiteDisplay(id)+ariaState)}">${lastDot}${esc(adminSiteDisplay(id))}${recBadge}</span>`;
    }).join('');
    wrap.className='bodymap2';
    wrap.innerHTML=`
      <div class="bm-head"><span class="bm-title">Tap the injection site</span><span class="bm-route">${esc(routeTxt)}</span></div>
      ${rot}
      <div class="bm-figs"><div class="bm-fig"><div class="bm-cap">Front · facing patient</div>${frontSVG}</div><div class="bm-fig"><div class="bm-cap">Back</div>${backSVG}</div></div>
      <div class="bm-landmarks"><div class="bm-lm-label">Exact site for documentation</div><div class="bm-lm-chips">${lmChips}</div></div>
      <div class="bm-legend"><span><i class="l-ok"></i>Allowed</span><span><i class="l-rec"></i>Recommended</span><span><i class="l-sel"></i>Selected</span><span><i class="l-mute"></i>Off-guidance</span><span><i class="l-last"></i>Prior dose</span></div>`;
    wrap.querySelectorAll('.bz').forEach(g=>{
      const z=ALL_ZONES.find(x=>x.key===g.dataset.zone);
      const pick=(focusAfter=false)=>{ const allowedCand=z.cands.find(c=>rule.sites.includes(c)); pickSiteFromFigure(allowedCand||z.cands[0],!!allowedCand,focusAfter); };
      g.addEventListener('click',()=>pick(false));
      g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(true);}});
    });
    wrap.querySelectorAll('.bm-lm').forEach(c=>{
      const go=(focusAfter=false)=>pickSiteFromFigure(c.dataset.site,rule.sites.includes(c.dataset.site),focusAfter);
      c.addEventListener('click',()=>go(false));
      c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go(true);}});
    });
    const altBtn=wrap.querySelector('.bm-rot-alt');
    if(altBtn){
      const go=(focusAfter=false)=>pickSiteFromFigure(altBtn.dataset.alt,rule.sites.includes(altBtn.dataset.alt),focusAfter);
      altBtn.addEventListener('click',()=>go(false));
      altBtn.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go(true);}});
    }
  }
  function pickSiteFromFigure(site,allowed,focusAfter=false){
    S.site=site;
    const meta=ADMIN_SITE_LIBRARY.find(s=>s.id===site); if(meta)S.route=meta.route;
    S.adminGuideCollapsed=!!allowed;
    if($('siteAuto'))$('siteAuto').style.display='none';
    if(!allowed)toast('Selected site is outside usual guidance — verify provider direction');
    try{renderSites();}catch(e){}      /* renderSites → renderAdminGuide → renderBodyMap refreshes the figure */
    try{renderRoutes();}catch(e){}
    try{renderInjQa();}catch(e){}
    try{render();}catch(e){}
    document.dispatchEvent(new CustomEvent('ipmg:siteconfirmed',{detail:{site,allowed:!!allowed,focusAfter:!!focusAfter}}));
  }
  window.pickSiteFromFigure=pickSiteFromFigure;

  /* swap the list-style body map for the interactive figure */
  if(typeof renderBodyMap==='function'){ renderBodyMap=renderBodyMapInteractive; }

  function initBodyMap(){
    try{ if($('ptName')) $('ptName').addEventListener('input',()=>{try{ if(typeof renderBodyMap==='function') renderBodyMap(); }catch(e){}}); }catch(e){}
    try{ if($('ptDOB')) $('ptDOB').addEventListener('input',()=>{try{ if(typeof renderBodyMap==='function') renderBodyMap(); }catch(e){}}); }catch(e){}
    try{ if(typeof renderBodyMap==='function') renderBodyMap(); }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initBodyMap,{once:true});
  else initBodyMap();
})();


/* ===================== RELEASE PASS: interactive UDS cup / strip reader ===================== */
(function(){
  /* Read each panel the way the physical cup reads: control (C) + test (T) lines.
     Two lines = negative · control only = preliminary positive · no control = invalid · dimmed = not tested.
     (Competitive immunoassay: a visible test line indicates a negative result.) */
  function nextCupState(st){
    return ({neg:'pos',pos:'invalid',invalid:'nt',nt:'neg'})[st]||'pos';
  }
  function cupStrip(p){
    const st=(typeof UDS!=='undefined'&&UDS.results[p])||'nt';
    const info=(typeof UDS_PANEL_INFO!=='undefined'&&UDS_PANEL_INFO[p])||{};
    const ctrlOn = st!=='invalid';
    const tOn = st==='neg';
    const label=(typeof UDS_RESULT_LABEL!=='undefined'&&UDS_RESULT_LABEL[st])||st;
    return `<div class="cup-strip st-${st}" data-panel="${p}" role="button" tabindex="0" aria-label="${esc((info.name||p))}: ${esc(label)}. Tap to change reading.">
      <div class="cup-strip-window">
        <span class="cs-mark cs-cm">C</span><span class="cs-mark cs-tm">T</span>
        <div class="cs-line cs-c ${ctrlOn?'on':'off'}"></div>
        <div class="cs-line cs-t ${tOn?'on':'off'}"></div>
      </div>
      <div class="cup-strip-meta"><div class="cs-code">${esc(p)}</div><div class="cs-name">${esc(info.name||'')}</div></div>
      <div class="cs-state">${esc(label)}</div>
    </div>`;
  }
  function renderUdsCup(){
    const g=$('udsResultGrid'); if(!g) return;
    if(typeof UDS_GROUPS==='undefined'){ return; }
    g.className='uds-cup';
    const legend=`<div class="cup-legend">
      <span class="cl-item"><span class="cl-strip"><i class="c on"></i><i class="t on"></i></span> Two lines = negative</span>
      <span class="cl-item"><span class="cl-strip"><i class="c on"></i><i class="t off"></i></span> Control only = prelim positive</span>
      <span class="cl-item"><span class="cl-strip"><i class="c off"></i><i class="t off"></i></span> No control = invalid</span>
      <span class="cl-item">Tap a panel to cycle the reading</span>
    </div>`;
    const groups=UDS_GROUPS.map(group=>{
      const strips=group.panels.map(cupStrip).join('');
      return `<section class="cup-group">
        <div class="cup-group-head">
          <div><div class="cup-group-title">${esc(group.l)}</div><div class="cup-group-sub">${esc(group.sub)}</div></div>
          <div class="cup-group-actions">
            <button type="button" class="mini" data-gstate="neg" data-grp="${group.k}">All negative</button>
            <button type="button" class="mini" data-gstate="nt" data-grp="${group.k}">Not tested</button>
          </div>
        </div>
        <div class="cup-strip-grid">${strips}</div>
      </section>`;
    }).join('');
    g.innerHTML=legend+groups;
    g.querySelectorAll('.cup-strip').forEach(el=>{
      const p=el.dataset.panel;
      const cycle=(restoreFocus=false)=>{ UDS.results[p]=nextCupState(UDS.results[p]||'nt'); renderUdsResults(); if(typeof renderUdsNote==='function')renderUdsNote(); if(restoreFocus)requestAnimationFrame(()=>$('udsResultGrid')?.querySelector(`[data-panel="${CSS.escape(p)}"]`)?.focus({preventScroll:true})); };
      el.addEventListener('click',()=>cycle(false));
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cycle(true);}});
    });
    g.querySelectorAll('[data-gstate]').forEach(btn=>{
      const grp=UDS_GROUPS.find(x=>x.k===btn.dataset.grp);
      btn.addEventListener('click',e=>{ e.stopPropagation(); const selector=`[data-gstate="${CSS.escape(btn.dataset.gstate)}"][data-grp="${CSS.escape(btn.dataset.grp)}"]`; if(grp)setUdsPanels(grp.panels,btn.dataset.gstate); requestAnimationFrame(()=>$('udsResultGrid')?.querySelector(selector)?.focus({preventScroll:true})); });
    });
    /* preserve the attention panel + summary badges that the original renderer maintained */
    try{
      const pos=udsPanelsByState('pos'),inv=udsPanelsByState('invalid'),neg=udsPanelsByState('neg'),nt=udsPanelsByState('nt');
      if(typeof renderUdsAttention==='function') renderUdsAttention(pos,inv,neg,nt);
      const s=$('udsSummaryBadges');
      if(s){
        const needs=UDS.control!=='valid'||inv.length||pos.length||UDS.validity==='needs review'||UDS.consistent==='not aligned'||UDS.consistent==='needs review';
        const tested=UDS_PANELS.length-nt.length;
        s.innerHTML=`<span class="uds-badge ${needs?'pos':''}">${needs?'Provider review':'No flagged findings'}</span><span class="uds-badge">Tested: ${tested}</span><span class="uds-badge">Negative: ${neg.length}</span><span class="uds-badge pos">Prelim positive: ${pos.length}</span><span class="uds-badge invalid">Invalid: ${inv.length}</span><span class="uds-badge nt">Not tested: ${nt.length}</span>`;
      }
    }catch(e){}
  }
  if(typeof renderUdsResults==='function'){ renderUdsResults=renderUdsCup; }
  function initCup(){ try{ if(typeof renderUdsResults==='function') renderUdsResults(); }catch(e){} }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initCup,{once:true});
  else initCup();
})();



/* ===================== RC5: SAMPLE START STUDIO ===================== */
(function(){
  if(window.__IPMG_SAMPLE_RC5__) return;
  window.__IPMG_SAMPLE_RC5__=true;

  function rc5Today(){return localDateValue();}
  function rc5DateObj(iso){ if(!iso)return null; const d=new Date(iso+'T00:00:00'); return isNaN(d)?null:d; }
  function rc5Iso(d){ return d?localDateValue(d):''; }
  function rc5AddDays(d,n){ const x=new Date(d.getTime()); x.setDate(x.getDate()+n); return x; }
  function rc5PrettyIso(iso){ return iso ? fmtDate(iso) : ''; }
  function rc5Safe(v,fallback='—'){ const s=(v==null?'':String(v)).trim(); return s||fallback; }
  function rc5Li(items){ return (items||[]).filter(Boolean).map(x=>`<li>${esc(x)}</li>`).join(''); }
  function rc5Number(v){ const n=parseFloat(String(v||'').replace(/[^0-9.]/g,'')); return isFinite(n)?n:null; }
  function rc5QtyCount(text){
    const s=String(text||'').replace(/[–—]/g,'-');
    const slash=s.match(/\/\s*(\d{1,4})\s*(?:tabs?|tablets?|caps?|capsules?)/i);
    if(slash) return parseInt(slash[1],10);
    const matches=[...s.matchAll(/(\d{1,4})\s*(?:tabs?|tablets?|caps?|capsules?)\b/ig)].map(m=>parseInt(m[1],10)).filter(Boolean);
    if(matches.length) return matches[matches.length-1];
    const range=s.match(/\b(\d{1,4})\s*-\s*(\d{1,4})\s*(?:tabs?|tablets?|caps?|capsules?)\b/i);
    if(range) return parseInt(range[2],10);
    return null;
  }
  function rc5UnitsPerDay(sig){
    const s=String(sig||'').toLowerCase();
    let times=1;
    if(/\b(qid|four times|4 times)\b/.test(s)) times=4;
    else if(/\b(tid|three times|3 times)\b/.test(s)) times=3;
    else if(/\b(bid|twice|two times|2 times)\b/.test(s)) times=2;
    let amount=1;
    const m=s.match(/take\s+(\d+(?:\.\d+)?)\s*(?:tab|tablet|cap|capsule)/i);
    if(m) amount=parseFloat(m[1])||1;
    return amount*times;
  }
  function rc5DurationFromSig(sig){
    const s=String(sig||'').toLowerCase().replace(/[–—]/g,'-');
    let m=s.match(/(?:for|x|×)\s*(\d{1,3})\s*days?\b/i); if(m) return parseInt(m[1],10);
    m=s.match(/day\s*(\d{1,3})\s*-\s*(\d{1,3})/i); if(m) return Math.max(1,parseInt(m[2],10)-parseInt(m[1],10)+1);
    m=s.match(/\b(\d{1,3})\s*days?\b/i); if(m) return parseInt(m[1],10);
    return null;
  }
  function rc5ExplicitDays(val){ const n=parseInt(String(val||'').trim(),10); return isFinite(n)&&n>0?n:null; }
  function rc5EntryAnalysis(entry,index,cursor){
    const qtyCount=rc5QtyCount(entry.qty);
    const units=rc5UnitsPerDay(entry.sig);
    const days=rc5ExplicitDays(entry.days)||rc5DurationFromSig(entry.sig)||(qtyCount&&units?Math.floor(qtyCount/units):null);
    const needed=days&&units?Math.ceil(days*units):null;
    const supplied=qtyCount||null;
    const start=cursor?rc5Iso(cursor):'';
    const end=(cursor&&days)?rc5Iso(rc5AddDays(cursor,days-1)):'';
    const next=(cursor&&days)?rc5AddDays(cursor,days):cursor;
    let status='info', statusText='Verify quantity';
    if(supplied&&needed){
      const diff=supplied-needed;
      if(diff>=0){status='ok';statusText=diff===0?'Covered exactly':`Covered · ${diff} extra`;}
      else {status='danger';statusText=`Short by ${Math.abs(diff)}`;}
    }else if(supplied&&!needed){status='warn';statusText='Quantity documented · duration unclear';}
    else if(!supplied&&needed){status='warn';statusText='Need quantity';}
    return {...entry,index,qtyCount,units,days,needed,supplied,start,end,next,status,statusText};
  }
  function rc5PlanAnalysis(){
    const entries=(typeof sampleDoseEntries==='function'?sampleDoseEntries():[]);
    const start=rc5DateObj($('sampleStart')?.value||'');
    let cursor=start;
    const steps=entries.map((e,i)=>{ const a=rc5EntryAnalysis(e,i,cursor); cursor=a.next||cursor; return a; });
    const known=steps.filter(s=>s.days&&s.end);
    const totalNeeded=steps.reduce((sum,s)=>sum+(s.needed||0),0);
    const totalSupplied=steps.reduce((sum,s)=>sum+(s.supplied||0),0);
    const anyUnknownQty=steps.some(s=>!s.supplied);
    const anyUnknownNeed=steps.some(s=>!s.needed);
    const shortage=(totalNeeded&&totalSupplied)?totalSupplied-totalNeeded:null;
    const lastEnd=known.length?known[known.length-1].end:'';
    let level='warn', headline='Verify coverage', detail='Enter a start date, duration, and package quantity to calculate the bridge supply.';
    if(steps.length===0){ level='warn'; headline='No sample plan yet'; detail='Select a medication and package, then build the dose steps.'; }
    else if(!start){ level='warn'; headline='Start date needed'; detail='Add a start date to calculate calendar dates and bridge-through coverage.'; }
    else if(anyUnknownQty||anyUnknownNeed){ level='warn'; headline=lastEnd?`Plan reaches ${rc5PrettyIso(lastEnd)}`:'Quantity review needed'; detail='Some package quantities or durations are unclear. Verify the sample covers the intended schedule before printing.'; }
    else if(shortage>=0){ level='ok'; headline=lastEnd?`Covered through ${rc5PrettyIso(lastEnd)}`:'Sample plan covered'; detail=shortage===0?'Provided quantity matches the planned schedule.':`Provided quantity covers the schedule with ${shortage} extra tablet/capsule unit(s).`; }
    else { level='danger'; headline=`Short by ${Math.abs(shortage)} tablet/capsule unit(s)`; detail=lastEnd?`The documented package quantity may not cover the plan through ${rc5PrettyIso(lastEnd)}.`:'The documented package quantity may not cover the plan.'; }
    return {steps,totalNeeded,totalSupplied,shortage,level,headline,detail,lastEnd};
  }
  function rc5BridgeCard(){ const a=rc5PlanAnalysis(); return `<div class="rc5-bridge-card ${a.level}"><div class="top"><div><div class="label">Bridge / coverage check</div><div class="big">${esc(a.headline)}</div><div class="detail">${esc(a.detail)}</div></div><span class="rc5-status-dot"></span></div></div>`; }
  function rc5StepMeta(s){
    const chips=[];
    if(s.start&&s.end) chips.push(`<span class="rc5-chip ok">${esc(rc5PrettyIso(s.start))} → ${esc(rc5PrettyIso(s.end))}</span>`);
    else if(s.days) chips.push(`<span class="rc5-chip">${s.days} day${s.days===1?'':'s'}</span>`);
    if(s.needed) chips.push(`<span class="rc5-chip">Needs ${s.needed}</span>`);
    if(s.supplied) chips.push(`<span class="rc5-chip">Provided ${s.supplied}</span>`);
    chips.push(`<span class="rc5-chip ${s.status==='danger'?'danger':s.status==='ok'?'ok':'warn'}">${esc(s.statusText)}</span>`);
    return chips.join('');
  }
  function rc5TimelineHtml(compact=false){
    const a=rc5PlanAnalysis();
    if(!a.steps.length) return rc5BridgeCard();
    const steps=a.steps.map(s=>`<div class="rc5-step"><div class="orb">${s.index+1}</div><div><h4>${esc(s.strength||'Medication step')}</h4><p>${esc(s.sig||'Use as directed by prescriber.')}</p><p><b>Package:</b> ${esc(s.qty||'not documented')}</p><div class="meta">${rc5StepMeta(s)}</div></div></div>`).join('');
    return `${rc5BridgeCard()}<div class="rc5-timeline">${steps}</div>${a.steps.length>1?`<div class="sample-guard-soft">Use the steps in order. Do not take multiple strengths together unless the prescriber specifically instructed it.</div>`:''}`;
  }
  const RC5_TEMPLATES={
    trintellix:[{name:'5 mg start → 10 mg',purpose:'Titration / starter pack',note:'A simple two-step start plan staff can adjust to the prescriber order.',steps:[{strength:'Trintellix 5 mg tablet',qty:'1 sample card / 7 tablets',days:7,sig:'Take 1 tablet by mouth once daily for 7 days as prescribed. May be taken with or without food.'},{strength:'Trintellix 10 mg tablet',qty:'1 sample card / 7 tablets',days:7,sig:'Then take 1 tablet by mouth once daily as prescribed. May be taken with or without food.'}]}],
    auvelity:[{name:'Morning start → twice daily',purpose:'Titration / starter pack',note:'Documents the common day-1 to day-4 transition; verify prescriber direction.',steps:[{strength:'Auvelity 45 mg/105 mg ER tablet',qty:'3 tablets',days:3,sig:'Take 1 tablet by mouth each morning for 3 days. Swallow whole.'},{strength:'Auvelity 45 mg/105 mg ER tablet',qty:'1 sample card / 14 tablets',days:7,sig:'Starting day 4, take 1 tablet twice daily at least 8 hours apart if prescriber instructed. Swallow whole.'}]}],
    ingrezza:[{name:'40 mg start → target strength',purpose:'Titration / starter pack',note:'Starter-style sequence; adjust target strength to the actual package.',steps:[{strength:'Ingrezza 40 mg capsule',qty:'1 starter pack / 7 capsules',days:7,sig:'Take 1 capsule by mouth once daily for 7 days as prescribed. May be taken with or without food.'},{strength:'Ingrezza target strength capsule',qty:'1 sample card / 7 capsules',days:7,sig:'Then take 1 capsule by mouth once daily as prescribed. May be taken with or without food.'}]}],
    vraylar:[{name:'1.5 mg → 3 mg sequence',purpose:'Titration / starter pack',note:'Two-strength starter layout; verify exact timing and diagnosis-specific plan.',steps:[{strength:'Vraylar 1.5 mg capsule',qty:'1 box / 7 capsules',days:7,sig:'Take 1 capsule by mouth once daily for 7 days as prescribed. May be taken with or without food.'},{strength:'Vraylar 3 mg capsule',qty:'1 box / 7 capsules',days:7,sig:'Then take 1 capsule by mouth once daily as prescribed. May be taken with or without food.'}]}],
    rexulti:[{name:'Low-dose starter ladder',purpose:'Titration / starter pack',note:'Three-step visual ladder; adjust strengths/days to the prescriber order.',steps:[{strength:'Rexulti 0.5 mg tablet',qty:'7 tablets',days:7,sig:'Take 1 tablet by mouth once daily for 7 days as prescribed.'},{strength:'Rexulti 1 mg tablet',qty:'7 tablets',days:7,sig:'Then take 1 tablet by mouth once daily for 7 days as prescribed.'},{strength:'Rexulti target strength tablet',qty:'7 tablets',days:7,sig:'Then take the target strength once daily as prescribed.'}]}],
    austedo:[{name:'Starter kit as written',purpose:'Titration / starter pack',note:'Keeps kit directions prominent without guessing the prescriber’s exact dose changes.',steps:[{strength:'Austedo starter / titration pack',qty:'1 titration kit',days:'',sig:'Take exactly as directed on the prescriber’s written titration schedule. Take with food. Swallow tablets whole.'}]}],
    fanapt:[{name:'Titration pack as written',purpose:'Titration / starter pack',note:'Fanapt is titration-sensitive; write the exact prescriber schedule before printing.',steps:[{strength:'Fanapt titration pack',qty:'1 titration pack',days:'',sig:'Take exactly as directed on the prescriber’s written titration schedule. Do not skip ahead unless instructed.'}]}],
    cobenfy:[{name:'Starter pack as written',purpose:'Titration / starter pack',note:'Starter-pack layout with anticholinergic counseling kept visible.',steps:[{strength:'Cobenfy starter pack',qty:'1 starter pack',days:'',sig:'Take exactly as directed on the prescriber’s written starter-pack schedule.'}]}],
    caplyta:[{name:'Once-daily bridge',purpose:'Bridge until pharmacy fill',note:'Simple once-daily bridge calculator.',steps:[{strength:'Caplyta 42 mg capsule',qty:'1 box / 7 capsules',days:7,sig:'Take 1 capsule by mouth once daily as prescribed. Take with or without food unless instructed otherwise.'}]}],
    lybalvi:[{name:'Once-daily bridge',purpose:'Bridge until pharmacy fill',note:'Bridge calculator; opioid safety verification remains required.',steps:[{strength:'Lybalvi tablet',qty:'1 box / 7 tablets',days:7,sig:'Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.'}]}]
  };
  function rc5TemplatesForCurrent(){ const m=(typeof sampleMed==='function'?sampleMed():{})||{}; const base=RC5_TEMPLATES[m.key]||[]; return base.length?base:[{name:'Custom sample bridge',purpose:'Bridge until pharmacy fill',note:'Build a coverage plan from the actual package and prescriber sig.',steps:[{strength:($('sampleMedLabel')?.value||m.label||'Medication sample'),qty:($('sampleQty')?.value||'1 sample package'),days:'',sig:(typeof sampleSigText==='function'?sampleSigText():'Take exactly as prescribed.')}]}]; }
  function rc5ApplyTemplate(idx){
    const t=rc5TemplatesForCurrent()[idx]; if(!t||!t.steps||!t.steps.length)return;
    const first=t.steps[0];
    if($('samplePurpose')) $('samplePurpose').value=t.purpose||'Titration / starter pack';
    if($('sampleStart')&&!$('sampleStart').value) $('sampleStart').value=rc5Today();
    if($('sampleMedLabel')) $('sampleMedLabel').value=first.strength||'';
    if($('sampleQty')) $('sampleQty').value=first.qty||'';
    if($('sampleSig')) $('sampleSig').value=first.sig||'';
    if($('samplePrimaryDays')) $('samplePrimaryDays').value=first.days||'';
    if($('sampleTitration')) $('sampleTitration').value=t.steps.map((s,i)=>`Step ${i+1}: ${s.strength}${s.days?` for ${s.days} days`:''} — ${s.sig}`).join('\n');
    if(typeof clearSampleDoseRows==='function') clearSampleDoseRows();
    t.steps.slice(1).forEach(s=>addSampleDoseRow({strength:s.strength,qty:s.qty,sig:s.sig,days:s.days}));
    if(typeof renderSampleIntentChips==='function') renderSampleIntentChips();
    if(typeof renderSamplePackageMeta==='function') renderSamplePackageMeta();
    renderSampleHandout(); toast('RC5 start plan applied');
  }
  window.rc5ApplySampleTemplate=rc5ApplyTemplate;
  function rc5EnsureDom(){
    const panel=$('panel-samples'); if(!panel || panel.dataset.rc5Ready==='1')return;
    panel.dataset.rc5Ready='1';
    const layout=panel.querySelector('.layout');
    /* PASS48 already supplies the module hero. Keep one clear entry point instead
       of stacking a second "Sample Start Studio" marketing panel above the form. */
    if(layout&&!document.querySelector('#panel-samples .sample-module-hero')){layout.insertAdjacentHTML('beforebegin',`<div class="sample-module-hero rc5"><div class="sample-hero-main"><div class="sample-hero-kicker">Samples workflow</div><h2 class="sample-hero-title">Document exactly what was handed out.</h2><p class="sample-hero-copy">Select the medication, tap the physical package handed out, confirm the prescriber’s plan, and keep the patient handout and Tebra note aligned.</p></div><div class="sample-hero-side"><div class="eyebrow">Staff flow</div><div class="sample-micro-steps rc5"><div class="sample-micro-step"><span class="num">1</span><div><b>Pick the sample</b><span>Medication and physical package.</span></div></div><div class="sample-micro-step"><span class="num">2</span><div><b>Confirm the plan</b><span>Duration, dates, and sequence.</span></div></div><div class="sample-micro-step"><span class="num">3</span><div><b>Print + copy</b><span>Patient packet and matching Tebra note.</span></div></div></div></div></div>`);}
    const startField=$('sampleStart')?.closest('.field');
    if(startField && !$('samplePrimaryDays')) startField.insertAdjacentHTML('afterend',`<div class="field rc5-primary-days"><label>Primary step duration</label><input id="samplePrimaryDays" type="number" min="1" inputmode="numeric" placeholder="Days, if titration/bridge" /></div>`);
    const builder=panel.querySelector('.sample-dose-builder');
    if(builder && !$('rc5TemplateBank')){
      const top=builder.querySelector('.sample-dose-top');
      if(top) top.insertAdjacentHTML('afterend',`<div class="rc5-plan-toolbar"><div><div class="rc5-plan-title">Visual titration + bridge builder</div><div class="rc5-plan-sub">Use a template or manually add steps. Dates and quantity coverage update automatically.</div></div><div class="rc5-plan-actions"><button class="rc5-soft-btn" id="rc5ShowTemplates" type="button">Start-plan templates</button><button class="rc5-soft-btn" id="rc5ClearPlan" type="button">Clear steps</button></div></div><div class="rc5-template-bank" id="rc5TemplateBank"></div>`);
      builder.insertAdjacentHTML('beforeend',`<div id="rc5BridgePanel"></div>`);
    }
    const summary=$('samplePrevSig')?.closest('.sample-summary');
    if(summary && !$('rc5PreviewBridge')) summary.insertAdjacentHTML('afterend',`<div id="rc5PreviewBridge"></div>`);
    const primaryDays=$('samplePrimaryDays'); if(primaryDays) primaryDays.addEventListener('input',renderSampleHandout);
    const show=$('rc5ShowTemplates'); if(show) show.addEventListener('click',()=>{rc5RenderTemplateBank(true);});
    const clear=$('rc5ClearPlan'); if(clear) clear.addEventListener('click',()=>{if(typeof clearSampleDoseRows==='function')clearSampleDoseRows(); if($('samplePrimaryDays'))$('samplePrimaryDays').value=''; renderSampleHandout(); toast('Sample steps cleared');});
  }
  function rc5RenderTemplateBank(forceOpen=false){
    const bank=$('rc5TemplateBank'); if(!bank)return;
    const templates=rc5TemplatesForCurrent();
    bank.innerHTML=`<div class="rc5-template-head"><div><b>Start-plan templates</b><span>These are staff documentation starters. Adjust to the prescriber’s exact directions before printing.</span></div></div><div class="rc5-template-grid">${templates.map((t,i)=>`<button type="button" class="rc5-template-btn" data-rc5-template="${i}">${esc(t.name)}<small>${esc(t.note||'Apply a structured sample plan.')}</small></button>`).join('')}</div>`;
    bank.querySelectorAll('[data-rc5-template]').forEach(b=>b.addEventListener('click',()=>rc5ApplyTemplate(Number(b.dataset.rc5Template))));
    if(forceOpen) bank.classList.toggle('show');
  }

  sampleDoseEntries = window.sampleDoseEntries = function sampleDoseEntriesRC5(){
    const entries=[];
    const mainMed=($('sampleMedLabel')?.value||'').trim();
    const mainQty=($('sampleQty')?.value||'').trim();
    const mainSig=(typeof sampleSigText==='function'?sampleSigText():($('sampleSig')?.value||'')).trim();
    const mainDays=($('samplePrimaryDays')?.value||'').trim();
    if(mainMed||mainQty||mainSig) entries.push({strength:mainMed||(sampleMed().label),qty:mainQty||'not documented',sig:mainSig,days:mainDays});
    document.querySelectorAll('#sampleDoseRows .sample-dose-row').forEach(row=>{
      const strength=row.querySelector('[data-dose-strength]')?.value.trim()||'';
      const qty=row.querySelector('[data-dose-qty]')?.value.trim()||'';
      const days=row.querySelector('[data-dose-days]')?.value.trim()||'';
      const sig=row.querySelector('[data-dose-sig]')?.value.trim()||'';
      if(strength||qty||days||sig) entries.push({strength:strength||'Additional strength',qty:qty||'not documented',sig:sig||'Use as directed by prescriber.',days});
    });
    return entries;
  };
  addSampleDoseRow = window.addSampleDoseRow = function addSampleDoseRowRC5(data={}){
    const box=$('sampleDoseRows'); if(!box)return;
    box.classList.add('show');
    const row=document.createElement('div'); row.className='sample-dose-row';
    row.innerHTML=`<div class="field"><label>Medication / strength</label><input data-dose-strength placeholder="e.g., Vraylar 3 mg capsule" value="${esc(data.strength||'')}"></div><div class="field"><label>Package</label><input data-dose-qty placeholder="e.g., 1 box / 7 caps" value="${esc(data.qty||'')}"></div><div class="field"><label>Days</label><input data-dose-days type="number" min="1" inputmode="numeric" placeholder="7" value="${esc(data.days||'')}"></div><div class="field"><label>Directions for this step</label><input data-dose-sig placeholder="e.g., Then take 1 capsule daily" value="${esc(data.sig||'')}"></div><button class="sample-dose-remove" type="button" title="Remove">×</button>`;
    row.querySelectorAll('input').forEach(i=>i.addEventListener('input',renderSampleHandout));
    row.querySelector('.sample-dose-remove').addEventListener('click',()=>{row.remove(); if(!box.children.length)box.classList.remove('show'); renderSampleHandout();});
    box.appendChild(row); renderSampleHandout();
  };
  sampleDosePlanHtml = window.sampleDosePlanHtml = function sampleDosePlanHtmlRC5(){ return rc5TimelineHtml(false); };
  sampleDosePlanText = window.sampleDosePlanText = function sampleDosePlanTextRC5(){
    const a=rc5PlanAnalysis(); if(!a.steps.length)return '';
    const lines=a.steps.map(s=>`${s.index+1}. ${s.strength} — ${s.qty}; ${s.sig}${s.days?`; ${s.days} day(s)`:''}${s.start&&s.end?`; ${rc5PrettyIso(s.start)} to ${rc5PrettyIso(s.end)}`:''}${s.needed?`; needs ${s.needed}`:''}${s.supplied?`; provided ${s.supplied}`:''}`);
    lines.push(`Coverage check: ${a.headline}. ${a.detail}`);
    return lines.join('\n');
  };
  sampleDosePlanPrintHtml = window.sampleDosePlanPrintHtml = function sampleDosePlanPrintHtmlRC5(){
    const a=rc5PlanAnalysis(); if(!a.steps.length)return '';
    return `<div class="rc5-sp-section"><h2>Sample step plan</h2><div class="rc5-sp-plan">${a.steps.map(s=>`<div class="rc5-sp-step"><div class="n">Step ${s.index+1}</div><div><b>${esc(s.strength)}</b><p>${esc(s.sig)}</p><p>Package: ${esc(s.qty)}${s.start&&s.end?` · ${esc(rc5PrettyIso(s.start))} to ${esc(rc5PrettyIso(s.end))}`:''}${s.needed?` · Needs ${s.needed}`:''}${s.supplied?` · Provided ${s.supplied}`:''}</p></div></div>`).join('')}</div><div class="rc5-sp-callout"><b>Coverage:</b> ${esc(a.headline)}. ${esc(a.detail)}</div></div>`;
  };
  renderSampleSigSuggestions = window.renderSampleSigSuggestions = function renderSampleSigSuggestionsRC5(){
    const box=$('sampleSigSuggestions'); if(!box)return;
    const opts=(typeof sampleSigOptions==='function'?sampleSigOptions():[]);
    const med=(typeof sampleMed==='function'?sampleMed():{})||{};
    const btns=opts.map((o,i)=>`<button type="button" class="sample-sig-btn" data-sig-opt="${i}">${esc(o.label||`Option ${i+1}`)}</button>`).join('');
    box.innerHTML=`<div class="sig-head"><div><div class="sig-title">Suggested directions + sample intelligence</div><div class="sig-help">Quick-fill the common wording, then use the RC5 builder for dated steps and bridge coverage.</div></div></div><div class="sample-sig-buttons">${btns}</div>${med.guard?`<div class="sample-alertline"><b>Verify before dispensing:</b> ${esc(med.guard)}</div>`:''}<div class="sample-sig-meta">Templates are documentation starters only. Prescriber directions and the physical sample label remain the source of truth.</div>`;
    box.querySelectorAll('[data-sig-opt]').forEach(b=>b.addEventListener('click',()=>applySampleSigOption(Number(b.dataset.sigOpt))));
    if(typeof renderSamplePackageButtons==='function')renderSamplePackageButtons();
    rc5RenderTemplateBank(false);
  };
  const oldSelect=window.selectSampleMed||selectSampleMed;
  selectSampleMed = window.selectSampleMed = function selectSampleMedRC5(m){
    oldSelect(m); rc5EnsureDom(); if($('samplePrimaryDays'))$('samplePrimaryDays').value=''; rc5RenderTemplateBank(false); renderSampleHandout();
  };
  renderSampleReadiness = window.renderSampleReadiness = function renderSampleReadinessRC5(){
    const box=$('sampleReadiness'); if(!box)return;
    const issues=(typeof sampleTraceIssues==='function'?sampleTraceIssues():[]);
    const a=rc5PlanAnalysis(); const med=(typeof sampleMed==='function'?sampleMed():{})||{};
    const items=[];
    if(!issues.length) items.push(`<div class="qa-ok">Ready: traceability fields are complete.</div>`); else items.push(`<div class="qa-warn">Missing or review: ${esc(issues.join(', '))}.</div>`);
    items.push(`<div class="${a.level==='danger'?'qa-danger':a.level==='ok'?'qa-ok':'qa-warn'}">${esc(a.headline)} — ${esc(a.detail)}</div>`);
    if(['fanapt','cobenfy','austedo','vraylar','rexulti','auvelity','ingrezza'].includes(med.key)) items.push(`<div class="qa-warn">Titration-sensitive sample: confirm the written sequence, start date, and package order with the prescriber.</div>`);
    if(['lybalvi','cobenfy','fanapt','rexulti'].includes(med.key)) items.push(`<div class="qa-warn">${esc(med.label)}: confirm prescriber reviewed the active order and product-specific safety considerations before dispensing.</div>`);
    if((typeof sampleDoseEntries==='function'?sampleDoseEntries():[]).length>1) items.push(`<div class="qa-warn">Multiple strengths/packages: make sure the handout clearly says what to take first, then next.</div>`);
    box.innerHTML=items.join('');
  };
  sampleNoteText = window.sampleNoteText = function sampleNoteTextRC5(){
    const med=sampleFriendlyMedication(); const a=rc5PlanAnalysis(); const lines=[];
    lines.push(`Sample dispensed: ${med}`);
    lines.push(`Purpose: ${$('samplePurpose')?.value||'sample provided'}`);
    lines.push(`Patient instructions: ${typeof sampleSigText==='function'?sampleSigText():'Take as directed.'}`);
    lines.push('');
    lines.push('Sample start / bridge plan:');
    lines.push(sampleDosePlanText()||'No step plan documented.');
    if($('sampleTitration')?.value.trim()) lines.push(`Prescriber schedule / special instructions: ${$('sampleTitration').value.trim()}`);
    lines.push('');
    lines.push(`Coverage check: ${a.headline}. ${a.detail}`);
    lines.push(`Medication check: ${$('sampleMedCheck')?.value||'not documented'}. Education: ${$('sampleEdu')?.value||'not documented'}.`);
    if($('sampleExtra')?.value.trim()) lines.push(`Patient-friendly note/context: ${$('sampleExtra').value.trim()}`);
    lines.push('');
    lines.push(`Traceability: Quantity/package: ${$('sampleQty')?.value.trim()||'not documented'}. Lot: ${$('sampleLot')?.value.trim()||'not documented'}. Exp: ${$('sampleExp')?.value||'not documented'}. Prescriber: ${$('samplePrescriber')?.value.trim()||'not documented'}. Dispensed by: ${$('sampleStaff')?.value.trim()||'not documented'}. Patient handout given.`);
    return lines.join('\n');
  };
  renderSampleHandout = window.renderSampleHandout = function renderSampleHandoutRC5(){
    rc5EnsureDom();
    const med=(typeof sampleMed==='function'?sampleMed():{})||{}; const medLabel=sampleFriendlyMedication(); const qty=($('sampleQty')?.value||'').trim()||'Quantity not documented yet'; const food=(typeof sampleFoodText==='function'?sampleFoodText():'as prescribed'); const intent=(typeof sampleIntentObj==='function'?sampleIntentObj():{label:$('samplePurpose')?.value||'Sample provided'}); const startDate=$('sampleStart')?.value?fmtDate($('sampleStart').value):'as directed'; const extra=($('sampleExtra')?.value||'').trim(); const sig=(typeof sampleInstructionsBlock==='function'?sampleInstructionsBlock():(typeof sampleSigText==='function'?sampleSigText():'')); const a=rc5PlanAnalysis();
    if($('samplePrevMed')) $('samplePrevMed').textContent=medLabel||'—';
    if($('samplePrevSig')) $('samplePrevSig').textContent=a.headline||qty||'—';
    if($('rc5BridgePanel')) $('rc5BridgePanel').innerHTML=rc5BridgeCard();
    if($('rc5PreviewBridge')) $('rc5PreviewBridge').innerHTML='';
    const reminders=(med.reminders&&med.reminders.length?med.reminders:['Take only the amount your prescriber instructed.','Do not share medication samples with anyone else.','Keep samples away from children and pets.']).slice(0,4);
    const watch=(med.watch&&med.watch.length?med.watch:['You are not sure how to take the sample.','Side effects feel severe, unusual, or concerning.','You have trouble getting the pharmacy prescription filled.']).slice(0,4);
    const preview=$('samplePreview'); if(preview){ preview.innerHTML=`<div class="sample-handout soft-sample rc5"><div class="sh-hero"><div class="sh-kicker">Medication sample packet</div><div class="sh-title">Before you start your sample</div><p class="sh-sub">A clear plan for what was provided, when each step starts, and how long the sample should last.</p></div><div class="sh-body"><div class="sample-soft-grid"><div class="sample-soft-card primary"><div class="mini-label">Medication</div><div><div class="med-name">${esc(medLabel)}</div>${med.generic?`<div class="muted-line">${esc(med.generic)}</div>`:''}</div></div><div class="sample-soft-card"><div class="mini-label">Package</div><div><div class="qty-line">${esc(qty)}</div><div class="muted-line">Actual sample handed out.</div></div></div><div class="sample-soft-card"><div class="mini-label">Purpose</div><div><div class="qty-line">${esc(intent.label||$('samplePurpose')?.value||'Sample provided')}</div><div class="muted-line">Start ${esc(startDate)}.</div></div></div></div><div class="sample-soft-instructions"><div class="take-title">Prescriber directions</div><p class="take-text">${esc(sig).replace(/\n/g,'<br>')}</p><p class="sh-muted"><b>Food timing:</b> ${esc(food)}.</p></div>${rc5TimelineHtml(false)}${med.guard?`<div class="sample-alertline"><b>Before you start:</b> ${esc(med.guard)}</div>`:''}<div class="rc5-intel"><div class="intel-block"><h4>Helpful reminders</h4><ul>${rc5Li(reminders)}</ul></div><div class="intel-block"><h4>Call the clinic if</h4><ul>${rc5Li(watch)}</ul></div></div>${extra?`<div class="sample-warn">${esc(extra)}</div>`:''}</div></div>`; }
    renderSampleReadiness(); if(typeof renderCommandCenter==='function')renderCommandCenter();
  };
  const oldReset=window.resetSample||resetSample;
  resetSample = window.resetSample = function resetSampleRC5(){ oldReset(); if($('samplePrimaryDays'))$('samplePrimaryDays').value=''; rc5RenderTemplateBank(false); renderSampleHandout(); };
  function rc5Init(){ rc5EnsureDom(); rc5RenderTemplateBank(false); renderSampleSigSuggestions(); renderSampleHandout(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',rc5Init,{once:true}); else setTimeout(rc5Init,0);
})();


/* ===================== RC5.1: SAMPLES COHESION INTERACTIONS ===================== */
(function(){
  if(window.__IPMG_SAMPLE_RC51__) return;
  window.__IPMG_SAMPLE_RC51__=true;
  const q=id=>document.getElementById(id);
  const text=id=>(q(id)?.value||'').trim();
  const safe=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function focusField(id){
    const el=q(id); if(!el) return;
    const card=el.closest('[data-guide]');
    if(card&&window.IPMGGuided&&window.IPMGGuided.samples)window.IPMGGuided.samples.open(card.dataset.guide,false);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const rect=el.getBoundingClientRect();
      if(rect.top<16||rect.bottom>window.innerHeight-16)el.scrollIntoView({behavior:'auto',block:'nearest'});
      try{el.focus({preventScroll:true});}catch(e){el.focus();}
    }));
  }
  function statusFor(kind){
    const hasPatient=!!(text('samplePtName')&&text('sampleDOB'));
    const hasMed=!!(text('sampleMedLabel')&&text('sampleQty'));
    const hasPlan=!!(text('sampleSig')&&(text('samplePrimaryDays')||document.querySelector('#sampleDoseRows .sample-dose-row')||text('sampleTitration')));
    const hasTrace=!!(text('samplePrescriber')&&text('sampleStaff')&&text('sampleLot')&&text('sampleExp'));
    if(kind==='patient') return hasPatient?['ok','Patient ready',`${text('samplePtName')}${text('sampleDOB')?' · DOB '+text('sampleDOB'):''}`]:['warn','Patient details','Add name and DOB before printing.'];
    if(kind==='med') return hasMed?['ok','Sample selected',`${text('sampleMedLabel')} · ${text('sampleQty')}`]:['warn','Medication package','Select a med and physical package.'];
    if(kind==='plan') return hasPlan?['ok','Dose plan active',text('samplePrimaryDays')?`Primary step ${text('samplePrimaryDays')} day(s)`:'Timeline / instructions documented']:['warn','Plan check','Add directions and duration/steps for bridge math.'];
    if(kind==='trace') return hasTrace?['ok','Ready to hand off','Lot, exp, prescriber, and staff are documented.']:['warn','Traceability','Finish prescriber, staff, lot, and expiration.'];
    return ['warn','Review',''];
  }
  function ensureProgress(){
    const panel=q('panel-samples'); if(!panel) return null;
    let rail=q('rc51SampleProgress');
    if(!rail){
      const hero=panel.querySelector('.sample-module-hero.rc5');
      const layout=panel.querySelector('.layout');
      rail=document.createElement('div');
      rail.id='rc51SampleProgress';
      rail.className='rc51-progress';
      const anchor=hero||layout;
      if(anchor) anchor.insertAdjacentElement(hero?'afterend':'beforebegin',rail);
      rail.addEventListener('click',e=>{
        const card=e.target.closest('[data-focus]'); if(card) focusField(card.dataset.focus);
      });
      rail.addEventListener('keydown',e=>{
        const card=e.target.closest('[data-focus]');
        if(card && (e.key==='Enter'||e.key===' ')){e.preventDefault();focusField(card.dataset.focus);}
      });
    }
    return rail;
  }
  function renderProgress(){
    const rail=ensureProgress(); if(!rail) return;
    const cards=[
      ['patient','samplePtName'],['med','sampleMedLabel'],['plan','sampleSig'],['trace','sampleLot']
    ].map(([kind,focus])=>{const [level,title,sub]=statusFor(kind);return `<button type="button" class="rc51-progress-card ${level}" data-focus="${focus}"><b>${safe(title)}</b><span>${safe(sub)}</span></button>`;}).join('');
    rail.innerHTML=cards;
  }
  function wire(){
    const panel=q('panel-samples'); if(!panel) return;
    renderProgress();
    const watch=['samplePtName','sampleDOB','samplePrescriber','sampleStaff','sampleMedLabel','sampleQty','sampleSig','samplePrimaryDays','sampleTitration','sampleLot','sampleExp','sampleStart','sampleExtra'];
    watch.forEach(id=>{const el=q(id); if(el&&!el.dataset.rc51Watch){el.dataset.rc51Watch='1'; el.addEventListener('input',renderProgress); el.addEventListener('change',renderProgress);}});
    ['sampleMedChips','samplePackageButtons','sampleIntentChips','sampleDoseRows','rc5TemplateBank'].forEach(id=>{const el=q(id); if(el&&!el.dataset.rc51Watch){el.dataset.rc51Watch='1'; el.addEventListener('click',()=>setTimeout(renderProgress,80));}});
    const prevMed=q('samplePrevMed'); if(prevMed&&!prevMed.dataset.rc51Edit){prevMed.dataset.rc51Edit='1'; prevMed.title='Click to edit medication'; prevMed.addEventListener('click',()=>focusField('sampleMedLabel'));}
    const prevSig=q('samplePrevSig'); if(prevSig&&!prevSig.dataset.rc51Edit){prevSig.dataset.rc51Edit='1'; prevSig.title='Click to edit dose plan'; prevSig.addEventListener('click',()=>focusField('sampleSig'));}
  }
  function boot(){
    wire();
    const old=window.renderSampleHandout;
    if(typeof old==='function' && !old.__rc51Wrapped){
      const wrapped=function(){ const out=old.apply(this,arguments); setTimeout(()=>{wire();renderProgress();},0); return out; };
      wrapped.__rc51Wrapped=true;
      window.renderSampleHandout=wrapped;
    }
    setTimeout(renderProgress,100);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();




/* ===================== RC5.3: GUIDED FRAMEWORK + SAMPLES IMPLEMENTATION ===================== */
(function(){
  if(window.__IPMG_GUIDED_FRAMEWORK_RC53__) return;
  window.__IPMG_GUIDED_FRAMEWORK_RC53__=true;
  const splitClasses=v=>String(v||'').split(/\s+/).filter(Boolean);
  const addClasses=(el,v)=>{ if(el) el.classList.add(...splitClasses(v)); };
  const safe=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const defaults={
    card:'guided-card', head:'guided-head', body:'guided-body', footer:'guided-footer',
    preview:'guided-preview', status:'guided-status', chevron:'guided-chevron', cont:'guided-continue'
  };
  function createGuidedStack(config){
    const root=typeof config.root==='string'?document.querySelector(config.root):config.root;
    if(!root) return null;
    const cx=Object.assign({},defaults,config.classes||{});
    const order=config.order||[];
    const selector=config.cardSelector||'.guided-card[data-guide]';
    const cards=()=>Array.from(root.querySelectorAll(selector));
    function statusOf(id){
      const s=(config.status&&config.status(id))||{};
      return {level:s.level||'needs',label:s.label||'Needs info',preview:s.preview||''};
    }
    function nextAction(){
      if(config.nextAction) return config.nextAction(statusOf);
      const next=order.find(id=>statusOf(id).level!=='ready')||order[order.length-1];
      return [next,'Next: continue workflow','Complete the open card, then continue.'];
    }
    function setOpen(id,scroll=false){
      cards().forEach(card=>{
        const open=card.dataset.guide===id;
        card.classList.toggle('open',open);
        card.querySelector('[data-guided-head]')?.setAttribute('aria-expanded',String(open));
      });
      refresh({keepOpen:true,autoOpen:false});
      if(config.onOpen) config.onOpen(id);
      const card=cards().find(c=>c.dataset.guide===id);
      /* RC5.12: no automatic page scroll on guided-card changes; staff stays visually anchored. */
    }
    function openNext(current){
      const idx=order.indexOf(current);
      const after=idx>=0?order.slice(idx+1):order;
      const next=after.find(id=>statusOf(id).level!=='ready') || order[Math.min(idx+1,order.length-1)] || order[order.length-1];
      setOpen(next,false);
    }
    function prepare(card){
      if(!card||card.dataset.guidedPrepared==='1') return;
      card.dataset.guidedPrepared='1'; addClasses(card,cx.card);
      const head=card.querySelector(':scope > .card-head, :scope > .guided-head, :scope > .sample-guide-head')||card.querySelector('.card-head');
      if(!head) return;
      let body=card.querySelector(':scope > .guided-body, :scope > .sample-guide-body');
      if(!body){
        body=document.createElement('div'); addClasses(body,cx.body);
        head.insertAdjacentElement('afterend',body);
        while(body.nextSibling) body.appendChild(body.nextSibling);
      }else addClasses(body,cx.body);
      addClasses(head,cx.head); head.dataset.guidedHead='1'; head.tabIndex=0; head.setAttribute('role','button'); head.setAttribute('aria-expanded','false');
      if(!head.querySelector('[data-guided-status]')){
        const chip=document.createElement('span'); addClasses(chip,cx.status); chip.dataset.guidedStatus='1'; head.appendChild(chip);
      }
      if(!head.querySelector('[data-guided-chevron]')){
        const chev=document.createElement('span'); addClasses(chev,cx.chevron); chev.dataset.guidedChevron='1'; chev.setAttribute('aria-hidden','true'); chev.textContent='⌄'; head.appendChild(chev);
      }
      if(!head.querySelector('[data-guided-preview]')){
        const preview=document.createElement('div'); addClasses(preview,cx.preview); preview.dataset.guidedPreview='1'; head.appendChild(preview);
      }
      head.addEventListener('click',e=>{
        if(e.target.closest('button,input,select,textarea,a,.chip,.mini,.sample-pack-btn,.sample-intent-chip,.sample-sig-btn')) return;
        setOpen(card.dataset.guide,false);
      });
      head.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpen(card.dataset.guide,false);} });
      if(!body.querySelector(':scope > [data-guided-footer]')){
        const footer=document.createElement('div'); addClasses(footer,cx.footer); footer.dataset.guidedFooter='1';
        const isOutput=card.dataset.guide==='output';
        footer.innerHTML=`<div class="guide-footnote">${safe(isOutput?(config.outputNote||'Final actions are available here.'):(config.stepNote||'Complete this card, then continue to the next step.'))}</div><button class="${safe(cx.cont)} ${isOutput?'secondary':''}" type="button">${safe(isOutput?(config.outputButton||'Review final packet'):(config.continueText||'Continue'))}</button>`;
        body.appendChild(footer);
        footer.querySelector('button').addEventListener('click',()=>{ if(isOutput){ const tray=root.closest('.panel')?.querySelector('.preview-col')||root.querySelector('.preview-col'); if(tray){ tray.classList.add('output-pulse'); setTimeout(()=>tray.classList.remove('output-pulse'),900); } return; } openNext(card.dataset.guide); });
      }
    }
    function refresh(opts={}){
      const all=cards(); if(!all.length) return;
      all.forEach(card=>{
        const s=statusOf(card.dataset.guide);
        card.classList.toggle('done',s.level==='ready');
        card.classList.toggle('review',s.level==='review');
        card.classList.toggle('needs',s.level==='needs');
        const chip=card.querySelector('[data-guided-status]');
        const prev=card.querySelector('[data-guided-preview]');
        if(chip){chip.className=''; addClasses(chip,cx.status); chip.classList.add(s.level); chip.textContent=s.label;}
        if(prev) prev.textContent=s.preview;
      });
      const action=nextAction();
      if(config.onRefresh) config.onRefresh(action,statusOf);
      if(opts.autoOpen!==false && !all.some(c=>c.classList.contains('open'))){
        const id=action&&action[0]?action[0]:order[0];
        if(id) setOpen(id,false);
      }
    }
    function boot(){ cards().forEach(prepare); refresh({autoOpen:true}); }
    return {root,cards,prepare,refresh,open:setOpen,next:openNext,status:statusOf,boot};
  }
  window.IPMGGuided={create:createGuidedStack};
})();

(function(){
  if(window.__IPMG_SAMPLE_RC53__) return;
  window.__IPMG_SAMPLE_RC53__=true;
  const q=id=>document.getElementById(id);
  const txt=id=>(q(id)?.value||'').trim();
  const safe=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const todayIso=()=>localDateValue();
  const prettyDate=iso=>{try{return iso&&typeof fmtDate==='function'?fmtDate(iso):iso;}catch(e){return iso||'';}};
  const cleanEmpty=el=>{if(el&&!el.children.length&&!String(el.textContent||'').trim())el.remove();};
  function fieldWrap(id){
    const el=q(id); if(!el) return null;
    return el.closest('.field,.sample-packbox,.sample-sigbox,.sample-dose-builder,.grp,.sample-intent-box,.rc5-plan-toolbar,.rc5-template-bank,.rc5-bridge-card')||el;
  }
  function svgPath(kind){
    if(kind==='plan') return '<path d="M4 5h16M4 12h16M4 19h10"/><path d="M8 9v6"/><path d="M12 9v6"/>';
    if(kind==='trace') return '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>';
    if(kind==='output') return '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>';
    if(kind==='safety') return '<path d="M9 12l2 2 4-4"/><path d="M21 12c0 5-3.5 7.5-8.5 9C7.5 19.5 4 17 4 12V6l8-3 8 3z"/>';
    return '<path d="M10 21h4"/><path d="M8 3h8l1 5-3 10h-4L7 8z"/><path d="M8 8h8"/>';
  }
  function guideHead(title,hint,kind){
    const tone=kind==='safety'||kind==='trace'?'mint':kind==='output'?'amber':kind==='plan'?'lav':'blue';
    return `<div class="card-head"><div class="ico ${tone}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath(kind)}</svg></div><div><h2>${safe(title)}</h2><div class="hint">${safe(hint)}</div></div></div>`;
  }
  function makeCard(id,title,hint,kind){
    const card=document.createElement('div'); card.className='card sample-guide-card guided-card'; card.dataset.guide=id; card.innerHTML=guideHead(title,hint,kind); return card;
  }
  function moveButton(id,dest){const b=q(id); if(!b||!dest)return; b.style.flex=''; dest.appendChild(b);}
  function moveNodes(ids,dest){
    ids.forEach(id=>{const n=fieldWrap(id)||q(id); if(n&&!dest.contains(n)) dest.appendChild(n);});
  }
  function restructureSamples(){
    const panel=q('panel-samples'); const form=panel?.querySelector('.form-col'); if(!panel||!form) return false;
    if(form.dataset.rc53Structured==='1') return true;
    form.dataset.rc53Structured='1'; form.classList.add('guided-stack','sample-guided-stack');
    q('rc51SampleProgress')?.remove();
    /* Resolve each original card from its unique field anchor. Broad text matching
       merged Patient and Medication because the encounter card also contains the
       "Medication sample start" purpose option. */
    const encounter=q('samplePtName')?.closest('.card');
    const medCard=q('sampleMedChips')?.closest('.card');
    const safety=q('sampleMedCheck')?.closest('.card');
    if(!encounter||!medCard||!safety||new Set([encounter,medCard,safety]).size!==3){
      delete form.dataset.rc53Structured;
      return false;
    }
    encounter.dataset.guide='patient'; encounter.classList.add('sample-guide-card','guided-card');
    medCard.dataset.guide='selected'; medCard.classList.add('sample-guide-card','guided-card');
    safety.dataset.guide='safety'; safety.classList.add('sample-guide-card','guided-card');
    const patientTitle=encounter.querySelector('h2'); if(patientTitle) patientTitle.textContent='Patient / encounter';
    const patientHint=encounter.querySelector('.hint'); if(patientHint) patientHint.textContent='Confirm who is receiving the sample and why it is being dispensed.';
    const medTitle=medCard.querySelector('h2'); if(medTitle) medTitle.textContent='Sample selected';
    const medHint=medCard.querySelector('.hint'); if(medHint) medHint.textContent='Choose the medication and exact physical package handed out.';
    const safetyTitle=safety.querySelector('h2'); if(safetyTitle) safetyTitle.textContent='Counseling / safety';
    const safetyHint=safety.querySelector('.hint'); if(safetyHint) safetyHint.textContent='Confirm the counseling status and any plain-language patient note.';
    const banner=document.createElement('div'); banner.className='guided-banner sample-guide-banner'; banner.id='rc53SampleGuideBanner';
    banner.innerHTML='<div class="guide-mark">→</div><div><div class="guide-eyebrow">Guided sample workflow</div><div class="guide-title" id="rc53NextTitle">Next: complete patient details</div><div class="guide-sub" id="rc53NextSub">Use this as a quick handout builder: identify the patient, select the exact package, choose or confirm the dose plan, then verify lot/expiration.</div></div><div class="guide-mode">Guided mode</div><div class="sample-guide-playbook" aria-label="Sample workflow plan"><div class="sample-play-step"><b><span class="num">1</span>Patient</b><span>Name, DOB, prescriber, staff, and date.</span></div><div class="sample-play-step"><b><span class="num">2</span>Package</b><span>Medication, quantity, and physical sample selected.</span></div><div class="sample-play-step"><b><span class="num">3</span>Plan</b><span>Use a quick template or write the provider direction.</span></div><div class="sample-play-step"><b><span class="num">4</span>Verify</b><span>Lot/exp, counseling, then use the right output tray.</span></div></div>';
    form.insertBefore(banner,encounter);
    medCard.querySelector('.sample-workflow-strip')?.remove();
    const selectedGrid=document.createElement('div'); selectedGrid.className='sample-medbox sample-guide-selected-grid';
    moveNodes(['sampleMedLabel','sampleQty','samplePackageBox'],selectedGrid);
    const medGrp=medCard.querySelector('.grp'); if(medGrp) medGrp.insertAdjacentElement('afterend',selectedGrid); else medCard.appendChild(selectedGrid);
    const planCard=makeCard('plan','Dose plan','Build the dated titration or bridge plan. The handout and Tebra note will mirror this.','plan');
    const planBody=document.createElement('div'); planBody.className='sample-medbox sample-guide-plan-grid';
    moveNodes(['sampleStart','samplePrimaryDays','sampleFood','sampleSig','sampleSigSuggestions','sampleDoseRows','sampleTitration'],planBody);
    const doseBuilder=fieldWrap('sampleAddDose'); if(doseBuilder&&!planBody.contains(doseBuilder)) planBody.appendChild(doseBuilder);
    planCard.appendChild(planBody); medCard.insertAdjacentElement('afterend',planCard);
    const traceCard=makeCard('trace','Traceability','Capture lot and expiration so the handout and note have the sample tracking details.','trace');
    const traceHelper=document.createElement('div'); traceHelper.className='sample-guide-helper'; traceHelper.textContent='Lot and expiration should match the physical sample package. Expired samples should not be dispensed.';
    const traceGrid=document.createElement('div'); traceGrid.className='sample-guide-trace-grid'; const traceSection=q('samplePackageTraceability'); if(traceSection)traceGrid.appendChild(traceSection);else moveNodes(['sampleLot','sampleExp'],traceGrid);
    traceCard.appendChild(traceHelper); traceCard.appendChild(traceGrid); planCard.insertAdjacentElement('afterend',traceCard);
    const outputCard=makeCard('output','Output','Finalize from the right output tray. The live handout, Tebra note, print, copy, and log actions stay anchored on the right.','output');
    const outPanel=document.createElement('div'); outPanel.className='sample-output-panel sample-output-panel-lite';
    outPanel.innerHTML='<div class="output-line"><b>Use the right-side output tray.</b> The guided cards prepare the sample packet; the live preview, copy button, print button, add-to-log button, and reset button stay on the right for now.</div><div class="output-readiness" id="rc53OutputReadiness"></div>';
    outputCard.appendChild(outPanel); safety.insertAdjacentElement('afterend',outputCard);
    const oldMedbox=medCard.querySelector(':scope > .sample-medbox'); cleanEmpty(oldMedbox);
    const medStat=q('samplePrevMed')?.closest('.sample-stat'); if(medStat) medStat.dataset.openGuide='selected';
    const sigStat=q('samplePrevSig')?.closest('.sample-stat'); if(sigStat) sigStat.dataset.openGuide='plan';
    return true;
  }
  function sampleStatus(id){
    const patient=txt('samplePtName'), dob=txt('sampleDOB'), prescriber=txt('samplePrescriber'), staff=txt('sampleStaff'), date=txt('sampleDate');
    const med=txt('sampleMedLabel'), qty=txt('sampleQty'), sig=txt('sampleSig'), start=txt('sampleStart'), lot=txt('sampleLot'), exp=txt('sampleExp');
    const hasRows=!!document.querySelector('#sampleDoseRows .sample-dose-row');
    const planText=txt('samplePrimaryDays')||txt('sampleTitration')||(hasRows?'steps documented':'');
    if(id==='patient'){
      const ok=patient&&dob&&prescriber&&staff&&date;
      const missing=[!patient?'patient':null,!dob?'DOB':null,!prescriber?'prescriber':null,!staff?'staff':null,!date?'date':null].filter(Boolean);
      return {level:ok?'ready':'needs',label:ok?'Ready':'Needs info',preview:ok?`${patient} · DOB ${dob} · ${prescriber} · ${prettyDate(date)}`:`Add ${missing.join(', ')}.`};
    }
    if(id==='selected'){
      const ok=med&&qty;
      return {level:ok?'ready':'needs',label:ok?'Selected':'Needs sample',preview:ok?`${med} · ${qty}`:'Select the sample medication and physical package.'};
    }
    if(id==='plan'){
      const ok=sig&&(start||planText||hasRows);
      const prev=(q('samplePrevSig')?.textContent||'').trim();
      return {level:ok?'ready':'needs',label:ok?'Plan active':'Needs plan',preview:ok?`${prev&&prev!=='—'?prev:sig}${start?' · starts '+prettyDate(start):''}`:'Add patient directions, start date, and duration/steps.'};
    }
    if(id==='trace'){
      const packageIssues=typeof window.samplePackageTraceIssues==='function'?window.samplePackageTraceIssues():[];
      const now=todayIso().slice(0,7); const expired=!!(exp&&exp<now); const ok=lot&&exp&&!expired&&!packageIssues.length;
      return {level:expired?'review':ok?'ready':'needs',label:expired?'Review':ok?'Trace ready':'Traceability',preview:expired?`Expiration ${exp} appears past. Do not dispense without review.`:ok?`Lot ${lot} · Exp ${exp}`:packageIssues.length?`Add ${packageIssues.join(', ')}.`:'Add lot and expiration from the package.'};
    }
    if(id==='safety'){
      const medCheck=txt('sampleMedCheck'), edu=txt('sampleEdu'), extra=txt('sampleExtra');
      const confirmed=typeof window.sampleReviewConfirmationCurrent==='function'?window.sampleReviewConfirmationCurrent():false;
      const review=/pending|not available|needs|not documented/i.test(`${medCheck} ${edu}`)||!confirmed;
      return {level:review?'review':'ready',label:review?'Review':'Ready',preview:`${medCheck||'Medication check'} · ${edu||'education'}${confirmed?' · reviewed today':' · final review not confirmed'}${extra?' · extra note added':''}`};
    }
    const ids=['patient','selected','plan','trace','safety'].map(sampleStatus);
    const review=ids.some(s=>s.level==='review'), needs=ids.some(s=>s.level==='needs');
    return {level:review?'review':needs?'needs':'ready',label:review?'Review':needs?'Needs info':'Ready',preview:review?'Resolve the review item before finalizing.':needs?'Complete the remaining cards before printing/copying.':'Handout ready · Tebra note ready · log ready.'};
  }
  function sampleNextAction(statusOf){
    const order=[
      ['patient','Next: complete patient details','Add patient, DOB, prescriber, staff, and date.'],
      ['selected','Next: select the sample package','Choose the medication and exact package handed out.'],
      ['plan','Next: choose the patient directions','Use a quick template when possible, then confirm start date and how long the sample should last.'],
      ['trace','Next: verify the package','Capture lot and expiration from the physical package before printing.'],
      ['safety','Next: review counseling','Confirm medication check and education status.'],
      ['output','Ready: finalize the sample packet','Print the handout, copy the Tebra note, or add the sample to today’s log.']
    ];
    return order.find(([id])=>statusOf(id).level!=='ready')||order[order.length-1];
  }
  function outputRefresh(action,statusOf){
    const title=q('rc53NextTitle')||q('rc52NextTitle'), sub=q('rc53NextSub')||q('rc52NextSub');
    if(title) title.textContent=action[1]; if(sub) sub.textContent=action[2];
    const out=q('rc53OutputReadiness')||q('rc52OutputReadiness');
    if(out){
      out.innerHTML=['patient','selected','plan','trace','safety'].map(id=>{const s=statusOf(id);return `<span class="qa-chip ${s.level==='ready'?'ok':s.level==='review'?'danger':'warn'}">${safe(id.charAt(0).toUpperCase()+id.slice(1))}: ${safe(s.label)}</span>`;}).join('');
    }
  }
  function bootSamples(){
    if(!restructureSamples()||!window.IPMGGuided) return;
    const guide=window.IPMGGuided.create({
      root:'#panel-samples',
      cardSelector:'.sample-guide-card[data-guide]',
      order:['patient','selected','plan','trace','safety','output'],
      status:sampleStatus,
      nextAction:sampleNextAction,
      onRefresh:outputRefresh,
      classes:{card:'guided-card sample-guide-card',head:'guided-head sample-guide-head',body:'guided-body sample-guide-body',footer:'guided-footer sample-guide-footer',preview:'guided-preview sample-guide-preview',status:'guided-status sample-guide-status',chevron:'guided-chevron sample-guide-chevron',cont:'guided-continue sample-guide-continue'},
      outputNote:'Final actions stay anchored in the right-side output tray.',
      outputButton:'Highlight output tray'
    });
    if(!guide) return;
    guide.boot();
    window.IPMGGuided.samples=guide;
    const panel=q('panel-samples');
    let timer=null; const deb=()=>{clearTimeout(timer);timer=setTimeout(()=>guide.refresh({keepOpen:true,autoOpen:false}),70);};
    ['input','change','click'].forEach(ev=>panel.addEventListener(ev,e=>{
      if(ev==='click'){
        const stat=e.target.closest('.sample-stat[data-open-guide]'); if(stat){guide.open(stat.dataset.openGuide,false);return;}
        if(e.target.closest('.chip,.mini,.sample-pack-btn,.sample-intent-chip,.sample-sig-btn,.sample-dose-remove,.sample-add-dose,.qty-step,.qty-mini,.btn,[data-rc5-template]')) deb();
      }else deb();
    },true));
    const old=window.renderSampleHandout;
    if(typeof old==='function'&&!old.__rc53Wrapped){
      const wrapped=function(){const out=old.apply(this,arguments);setTimeout(()=>guide.refresh({keepOpen:true,autoOpen:false}),0);return out;};
      wrapped.__rc53Wrapped=true; window.renderSampleHandout=wrapped;
    }
    setTimeout(()=>guide.refresh({autoOpen:true}),150);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(bootSamples,0),{once:true}); else setTimeout(bootSamples,0);
})();

/* ===================== RC5.4: GUIDED UDS IMPLEMENTATION ===================== */
(function(){
  if(window.__IPMG_UDS_GUIDED_RC54__) return;
  window.__IPMG_UDS_GUIDED_RC54__=true;
  const q=id=>document.getElementById(id);
  const txt=id=>(q(id)?.value||'').trim();
  const safe=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labelFrom=(arr,key,fb)=>{try{return (arr||[]).find(x=>x.k===key)?.l||fb||key||'';}catch(e){return fb||key||'';}};
  const pretty=iso=>{try{return iso&&typeof fmtDate==='function'?fmtDate(iso.slice(0,10)):iso;}catch(e){return iso||'';}};
  const counts=()=>{
    try{
      const panels=(typeof UDS_PANELS!=='undefined'?UDS_PANELS:[]);
      const res=(typeof UDS!=='undefined'&&UDS.results)||{};
      return {
        neg:panels.filter(p=>res[p]==='neg').length,
        pos:panels.filter(p=>res[p]==='pos').length,
        invalid:panels.filter(p=>res[p]==='invalid').length,
        nt:panels.filter(p=>res[p]==='nt').length,
        tested:panels.filter(p=>res[p]&&res[p]!=='nt').length,
        total:panels.length
      };
    }catch(e){return {neg:0,pos:0,invalid:0,nt:0,tested:0,total:0};}
  };
  function monthExpired(value){
    try{
      if(!value) return false;
      const documented=txt('udsDateTime');
      if(typeof window.monthExpired==='function') return !!window.monthExpired(value,documented);
      const now=documented?new Date(documented):new Date();
      const ym=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
      return value<ym;
    }catch(e){return false;}
  }
  function restructureUds(){
    const panel=q('panel-uds'); const form=panel?.querySelector('.form-col'); if(!panel||!form||!window.IPMGGuided) return false;
    if(form.dataset.rc54Structured==='1') return true;
    form.dataset.rc54Structured='1'; form.classList.add('guided-stack','uds-guided-stack');
    const cards=Array.from(form.querySelectorAll(':scope > .card'));
    const ids=['encounter','device','results','review'];
    cards.slice(0,4).forEach((card,i)=>{card.dataset.guide=ids[i];card.classList.add('uds-guide-card','guided-card');});
    if(!panel.querySelector('.uds-guide-banner')){
      const banner=document.createElement('div');
      banner.className='guided-banner uds-guide-banner';
      banner.innerHTML='<div class="guide-mark">U</div><div><div class="guide-eyebrow">Guided UDS</div><div class="guide-title" id="udsGuideNextTitle">Next: complete collection details</div><div class="guide-sub" id="udsGuideNextSub">Start with patient, DOB, collector, time, temperature, and reason.</div></div><div class="guide-mode">Guided mode</div>';
      form.insertAdjacentElement('beforebegin',banner);
    }
    if(!form.querySelector('[data-guide="output"]')){
      const out=document.createElement('div');
      out.className='card uds-guide-card guided-card';
      out.dataset.guide='output';
      out.innerHTML=`
        <div class="card-head">
          <div class="ico blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
          <div><h2>Output</h2><div class="hint">Finalize from the right output tray.</div></div>
        </div>
        <div class="uds-output-panel uds-output-panel-lite">
          <div class="uds-guided-mini"><b>Use the right-side output tray.</b> The guided UDS cards prepare the packet; the live UDS note, copy button, reports, patient summary, log, and reset buttons stay on the right for now.</div>
          <div class="uds-guided-readiness" id="udsGuideOutputReadiness"></div>
        </div>`;
      form.appendChild(out);
    }
    return true;
  }
  function udsFinalizationIssues(){
    try{
      const issues=typeof window.ipmgUdsFinalizationIssues==='function'?window.ipmgUdsFinalizationIssues():(typeof window.ipmgUdsAdditionalOutputIssues==='function'?window.ipmgUdsAdditionalOutputIssues():[]);
      return Array.isArray(issues)?issues.filter(Boolean):[];
    }catch(e){return [];}
  }
  function udsFinalizationMessage(issues=udsFinalizationIssues()){
    if(issues.length===1&&issues[0]==='physical cup and displayed panel readings verified') return 'Confirm the physical cup and displayed panel readings before finalizing the UDS packet.';
    if(issues.length===1&&issues[0]==='an in-date cup') return 'Use an in-date cup before finalizing the UDS packet.';
    return `Complete ${issues.join(', ')} before finalizing the UDS packet.`;
  }
  function udsStatus(id){
    const c=counts();
    const patient=txt('udsPtName'), dob=txt('udsDOB'), collector=txt('udsCollector'), dt=txt('udsDateTime');
    const temp=(typeof UDS!=='undefined'?UDS.temp:'not documented');
    const control=(typeof UDS!=='undefined'?UDS.control:'not documented');
    const reason=(typeof UDS!=='undefined'?UDS.reason:'routine');
    const validity=txt('udsValidity') || (typeof UDS!=='undefined'?UDS.validity:'not documented');
    const consistent=txt('udsConsistent') || (typeof UDS!=='undefined'?UDS.consistent:'unavailable');
    const lab=txt('udsLab') || (typeof UDS!=='undefined'?UDS.lab:'provider to decide');
    if(id==='encounter'){
      const ok=patient&&collector&&dt&&temp!=='not documented';
      const missing=[!patient?'patient':null,!collector?'collector':null,!dt?'collection time':null,temp==='not documented'?'specimen temperature':null].filter(Boolean);
      const tempLabel=labelFrom(typeof UDS_TEMP!=='undefined'?UDS_TEMP:[],temp,temp);
      return {level:ok?'ready':'needs',label:ok?'Ready':'Needs info',preview:ok?`${patient}${dob?' · DOB '+dob:''} · ${pretty(dt)} · ${tempLabel}`:`Add ${missing.join(', ')}.`};
    }
    if(id==='device'){
      const lot=txt('udsLot'), exp=txt('udsExp'); const expired=monthExpired(exp);
      if(control==='invalid') return {level:'review',label:'Do not interpret',preview:'Device control line invalid or missing — do not interpret cup result.'};
      if(control!=='valid') return {level:'needs',label:'Needs validation',preview:'Document a valid device control line before interpreting the cup result.'};
      if(expired) return {level:'review',label:'Review',preview:`Device expiration ${exp} appears past. Verify before using.`};
      const ok=lot&&exp;
      return {level:ok?'ready':'needs',label:ok?'Device ready':'Needs trace',preview:ok?`${txt('udsDevice')||'UDS cup'} · Lot ${lot} · Exp ${exp} · valid control`:'Add lot, expiration, and control-line status.'};
    }
    if(id==='results'){
      if(control==='invalid') return {level:'review',label:'Invalid control',preview:'Results should not be interpreted because the control line is invalid.'};
      if(control!=='valid') return {level:'needs',label:'Validate control',preview:'Document a valid device control line before interpreting panel results.'};
      if(c.invalid) return {level:'review',label:'Review',preview:`${c.invalid} invalid panel${c.invalid===1?'':'s'} · ${c.pos} preliminary positive · ${c.neg} negative.`};
      if(c.pos) return {level:'review',label:'Provider review',preview:`${c.pos} preliminary positive · ${c.neg} negative · ${c.tested} tested panel${c.tested===1?'':'s'}.`};
      return {level:c.tested?'ready':'needs',label:c.tested?'Entered':'Needs results',preview:c.tested?`${c.neg} negative · ${c.nt} not tested · ${c.tested} tested panel${c.tested===1?'':'s'}.`:'Tap panel readings or use a quick action.'};
    }
    if(id==='review'){
      const needsReview=control!=='valid'||c.invalid||c.pos||temp==='not acceptable'||temp==='not documented'||validity==='not documented'||consistent==='unavailable'||/needs review|not aligned/i.test(`${validity} ${consistent}`);
      const level=needsReview?'review':'ready';
      const reasonLabel=labelFrom(typeof UDS_REASONS!=='undefined'?UDS_REASONS:[],reason,reason);
      return {level,label:needsReview?'Review':'Ready',preview:`${reasonLabel} · validity ${validity} · alignment ${consistent} · lab ${lab}.`};
    }
    const statuses=['encounter','device','results','review'].map(udsStatus);
    const review=statuses.some(s=>s.level==='review'), cardNeeds=statuses.some(s=>s.level==='needs');
    const finalizationIssues=udsFinalizationIssues();
    const hardStop=finalizationIssues.length>0;
    const needs=cardNeeds||hardStop;
    const confirmationOnly=hardStop&&finalizationIssues.length===1&&finalizationIssues[0]==='physical cup and displayed panel readings verified';
    return {level:hardStop?'needs':review?'review':needs?'needs':'ready',label:hardStop?(confirmationOnly?'Needs confirmation':'Needs update'):review?'Review':needs?'Needs info':'Ready',preview:hardStop?udsFinalizationMessage(finalizationIssues):review?'Review items before finalizing the UDS packet.':needs?'Complete remaining UDS cards before output.':'UDS note, reports, and log action are ready.'};
  }
  function nextAction(statusOf){
    const order=[
      ['encounter','Next: complete collection details','Add patient, collector, collection time, temperature, and reason.'],
      ['device','Next: verify the device','Capture cup type, lot, expiration, and control-line status.'],
      ['results','Next: read the cup','Tap each panel or use a quick action, then check attention alerts.'],
      ['review','Next: add clinical context','Document validity, medication alignment, lab plan, and patient context.'],
      ['output','Ready: finalize UDS packet','Copy the Tebra note, print reports, or add the UDS to today’s log.']
    ];
    const next=order.find(([id])=>statusOf(id).level!=='ready')||order[order.length-1];
    const finalizationIssues=udsFinalizationIssues();
    if(next[0]==='output'&&finalizationIssues.length){
      const verifyReadings=finalizationIssues.length===1&&finalizationIssues[0]==='physical cup and displayed panel readings verified';
      return ['output',verifyReadings?'Next: verify cup readings':'Next: resolve finalization check',udsFinalizationMessage(finalizationIssues)];
    }
    return next;
  }
  function refreshBanner(action,statusOf){
    const title=q('udsGuideNextTitle'), sub=q('udsGuideNextSub');
    if(title) title.textContent=action[1]; if(sub) sub.textContent=action[2];
    const out=q('udsGuideOutputReadiness');
    if(out){
      out.innerHTML=['encounter','device','results','review'].map(id=>{const s=statusOf(id);return `<span class="qa-chip ${s.level==='ready'?'ok':s.level==='review'?'danger':'warn'}">${safe(id.charAt(0).toUpperCase()+id.slice(1))}: ${safe(s.label)}</span>`;}).join('');
    }
  }
  function bootUdsGuide(){
    if(!restructureUds()||!window.IPMGGuided) return;
    const guide=window.IPMGGuided.create({
      root:'#panel-uds .form-col',
      cardSelector:'.uds-guide-card[data-guide]',
      order:['encounter','device','results','review','output'],
      status:udsStatus,
      nextAction,
      onRefresh:refreshBanner,
      classes:{card:'guided-card uds-guide-card',head:'guided-head uds-guide-head',body:'guided-body uds-guide-body',footer:'guided-footer uds-guide-footer',preview:'guided-preview uds-guide-preview',status:'guided-status uds-guide-status',chevron:'guided-chevron uds-guide-chevron',cont:'guided-continue uds-guide-continue'},
      stepNote:'Fill what is needed here, then continue. The page will not jump while you work.',
      outputNote:'Final actions stay anchored in the right-side output tray.',
      outputButton:'Highlight output tray'
    });
    if(!guide) return;
    guide.boot();
    window.IPMGGuided.uds=guide;
    const panel=q('panel-uds'); let timer=null;
    const deb=()=>{clearTimeout(timer);timer=setTimeout(()=>guide.refresh({keepOpen:true,autoOpen:false}),70);};
    ['input','change','click'].forEach(ev=>panel.addEventListener(ev,e=>{
      if(ev==='click'){
        if(e.target.closest('.chip,.mini,.uds-panel,.btn,[data-udscopy]')) deb();
      }else deb();
    },true));
    ['renderUdsNote','renderUdsResults','renderUdsControl','renderUdsTemp','renderUdsReason'].forEach(name=>{
      const old=window[name];
      if(typeof old==='function'&&!old.__rc54Wrapped){
        const wrapped=function(){const out=old.apply(this,arguments);setTimeout(()=>guide.refresh({keepOpen:true,autoOpen:false}),0);return out;};
        wrapped.__rc54Wrapped=true; window[name]=wrapped;
      }
    });
    setTimeout(()=>guide.refresh({autoOpen:true}),180);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(bootUdsGuide,0),{once:true}); else setTimeout(bootUdsGuide,0);
})();



/* ===================== RC5.5: SHARED PATIENT HANDOUT SYSTEM =====================
   Uses the same patient-facing print language for Samples as the existing AVS/UDS patient pages. */
(function(){
  if(window.__IPMG_RC55_HANDOUTS__) return;
  window.__IPMG_RC55_HANDOUTS__=true;
  const q=id=>document.getElementById(id);
  const v=(id,f='—')=>{const el=q(id); const val=el && 'value' in el ? el.value : ''; return String(val||'').trim()||f;};
  const h=s=>typeof esc==='function'?esc(s==null?'':String(s)):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=d=>{try{return typeof fmtDate==='function'?fmtDate(d):d;}catch(e){return d||'—';}};
  const today=()=>{try{return typeof rc5Today==='function'?rc5Today():localDateValue();}catch(e){return localDateValue();}};
  const safe=(x,f='—')=>{try{return typeof rc5Safe==='function'?rc5Safe(x,f):(String(x||'').trim()||f);}catch(e){return String(x||'').trim()||f;}};
  const list=items=>(items||[]).filter(Boolean).map(x=>`<li>${h(x)}</li>`).join('');
  function sharedHeader(kind,title,sub,status='Ready',cls='ok'){
    return `<div class="ipmg-patient-head"><div class="ipmg-patient-kicker">${h(kind)}</div><h1 class="ipmg-patient-title">${h(title)}</h1><p class="ipmg-patient-sub">${h(sub)}</p>${status?`<div class="ipmg-patient-status ${h(cls)}">${h(status)}</div>`:''}</div>`;
  }
  function sharedMeta(items){
    return `<div class="ipmg-patient-meta">${items.map(i=>`<div class="meta-item"><span>${h(i.k)}</span><b>${h(i.v||'—')}</b></div>`).join('')}</div>`;
  }
  function sharedFooter(text,date){
    return `<div class="ipmg-footer"><div>${text}</div><div class="printed">Printed ${h(date||fmt(today()))}</div></div>`;
  }
  function samplePrintTimeline(){
    const a=(typeof rc5PlanAnalysis==='function'?rc5PlanAnalysis():{steps:[],headline:'Coverage not calculated',detail:'Add a dated dose plan to calculate sample coverage.'});
    if(!a.steps||!a.steps.length) return '';
    return `<div class="ipmg-plan-timeline"><div class="ipmg-section" style="border-top:0!important;padding-top:0!important;margin-top:0!important"><h2>Medication step plan</h2></div>${a.steps.map(s=>`<div class="ipmg-plan-step"><div class="step-no">Step ${Number(s.index||0)+1}</div><div><b>${h(s.strength||'Sample step')}</b><p>${h(s.sig||'Use as directed by prescriber.')}</p><p>Package: ${h(s.qty||'—')}${s.start&&s.end?` · ${h(typeof rc5PrettyIso==='function'?rc5PrettyIso(s.start):s.start)} to ${h(typeof rc5PrettyIso==='function'?rc5PrettyIso(s.end):s.end)}`:''}${s.needed?` · Needs ${h(s.needed)}`:''}${s.supplied?` · Provided ${h(s.supplied)}`:''}</p></div></div>`).join('')}<div class="ipmg-callout"><b>Coverage check:</b> ${h(a.headline)}. ${h(a.detail)}</div></div>`;
  }
  window.sampleDosePlanPrintHtml = samplePrintTimeline;
})();



/* ===================== RC5.6: SAMPLES HANDOUT UPGRADE =====================
   Timeline-first patient handout with stronger multi-strength protection and clearer coverage language. */
(function(){
  if(window.__IPMG_RC56_SAMPLE_HANDOUT__) return;
  window.__IPMG_RC56_SAMPLE_HANDOUT__=true;
  const q=id=>document.getElementById(id);
  const h=s=>typeof esc==='function'?esc(s==null?'':String(s)):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const raw=(id,f='')=>{const el=q(id); const val=el&&'value' in el?el.value:''; return String(val||'').trim()||f;};
  const safe=(x,f='—')=>String(x==null?'':x).trim()||f;
  const fmt=d=>{try{return typeof fmtDate==='function'?fmtDate(d):d;}catch(e){return d||'—';}};
  const today=()=>{try{return typeof rc5Today==='function'?rc5Today():localDateValue();}catch(e){return localDateValue();}};
  const list=items=>(items||[]).filter(Boolean).map(x=>`<li>${h(x)}</li>`).join('');
  function dateObj(iso){ if(!iso)return null; const d=new Date(iso+'T00:00:00'); return isNaN(d)?null:d; }
  function iso(d){ return d?localDateValue(d):''; }
  function addDays(d,n){ const x=new Date(d.getTime()); x.setDate(x.getDate()+n); return x; }
  function qtyCount(text){
    const s=String(text||'').replace(/[–—]/g,'-');
    const slash=s.match(/\/\s*(\d{1,4})\s*(?:tabs?|tablets?|caps?|capsules?)/i); if(slash) return parseInt(slash[1],10);
    const range=s.match(/\b(\d{1,4})\s*-\s*(\d{1,4})\s*(?:tabs?|tablets?|caps?|capsules?)\b/i); if(range) return parseInt(range[2],10);
    const matches=[...s.matchAll(/(\d{1,4})\s*(?:tabs?|tablets?|caps?|capsules?)\b/ig)].map(m=>parseInt(m[1],10)).filter(Boolean);
    if(matches.length) return matches[matches.length-1];
    return null;
  }
  function unitsPerDay(sig){
    const s=String(sig||'').toLowerCase(); let times=1;
    if(/\b(qid|four times|4 times)\b/.test(s)) times=4; else if(/\b(tid|three times|3 times)\b/.test(s)) times=3; else if(/\b(bid|twice|two times|2 times)\b/.test(s)) times=2;
    let amount=1; const m=s.match(/take\s+(\d+(?:\.\d+)?)\s*(?:tab|tablet|cap|capsule)/i); if(m) amount=parseFloat(m[1])||1;
    return amount*times;
  }
  function durationFromSig(sig){
    const s=String(sig||'').toLowerCase().replace(/[–—]/g,'-');
    let m=s.match(/(?:for|x|×)\s*(\d{1,3})\s*days?\b/i); if(m) return parseInt(m[1],10);
    m=s.match(/day\s*(\d{1,3})\s*-\s*(\d{1,3})/i); if(m) return Math.max(1,parseInt(m[2],10)-parseInt(m[1],10)+1);
    m=s.match(/\b(\d{1,3})\s*days?\b/i); if(m) return parseInt(m[1],10);
    return null;
  }
  function explicitDays(v){ const n=parseInt(String(v||'').trim(),10); return isFinite(n)&&n>0?n:null; }
  function entries(){
    try{ if(typeof sampleDoseEntries==='function') return sampleDoseEntries(); }catch(e){}
    return [];
  }
  function analyze(){
    const start=dateObj(raw('sampleStart'));
    let cursor=start;
    const steps=entries().map((e,i)=>{
      const supplied=qtyCount(e.qty)||null; const units=unitsPerDay(e.sig); const days=explicitDays(e.days)||durationFromSig(e.sig)||(supplied&&units?Math.floor(supplied/units):null); const needed=days&&units?Math.ceil(days*units):null;
      const s=cursor?iso(cursor):''; const end=(cursor&&days)?iso(addDays(cursor,days-1)):''; const next=(cursor&&days)?addDays(cursor,days):cursor;
      cursor=next||cursor;
      return {...e,index:i,supplied,units,days,needed,start:s,end};
    });
    const known=steps.filter(s=>s.days&&s.end); const lastEnd=known.length?known[known.length-1].end:'';
    const totalNeeded=steps.reduce((a,s)=>a+(s.needed||0),0); const totalSupplied=steps.reduce((a,s)=>a+(s.supplied||0),0);
    const anyUnknown=steps.some(s=>!s.supplied||!s.needed); const shortage=(totalNeeded&&totalSupplied)?totalSupplied-totalNeeded:null;
    let level='warn', headline='Verify coverage', detail='Enter a start date, duration, and package quantity to calculate how long the sample lasts.';
    if(!steps.length){headline='No sample plan yet'; detail='Add the medication, package, and dose steps before printing.';}
    else if(!start){headline='Start date needed'; detail='Add a start date to show the patient when each step begins.';}
    else if(anyUnknown){headline=lastEnd?`Plan reaches ${fmt(lastEnd)}`:'Quantity review needed'; detail='Some package quantities or durations are unclear. Verify the sample covers the intended schedule before printing.';}
    else if(shortage>=0){level='ok'; headline=lastEnd?`Estimated to last through ${fmt(lastEnd)}`:'Sample plan covered'; detail=shortage===0?'Provided quantity matches the planned schedule.':`Provided quantity covers the schedule with ${shortage} extra tablet/capsule unit(s).`;}
    else {level='danger'; headline=`Short by ${Math.abs(shortage)} tablet/capsule unit(s)`; detail=lastEnd?`The documented package quantity may not cover the plan through ${fmt(lastEnd)}.`:'The documented package quantity may not cover the plan.';}
    return {steps,lastEnd,totalNeeded,totalSupplied,shortage,level,headline,detail};
  }
  function stepLabel(i,total){ if(i===0) return 'Take first'; if(i===1) return 'Then switch to'; return `Then step ${i+1}`; }
  function timelineHtml(a){
    if(!a.steps.length) return `<div class="rc56-timeline"><h2>Your medication step plan</h2><div class="rc56-safety-banner"><b>Plan needed:</b> Ask staff to confirm the written instructions before you leave.</div></div>`;
    return `<div class="rc56-timeline"><h2>Your medication step plan</h2>${a.steps.map((s,i)=>`<div class="rc56-step"><div class="rc56-step-label ${i===0?'first':'then'}">${h(stepLabel(i,a.steps.length))}</div><div><b>${h(s.strength||'Sample step')}</b><p>${h(s.sig||'Use as directed by prescriber.')}</p><p class="muted">${s.start&&s.end?`${h(fmt(s.start))} – ${h(fmt(s.end))}`:(s.days?`${h(s.days)} day(s)`:'Dates depend on start date')}${s.qty?` · Package: ${h(s.qty)}`:''}${s.needed?` · Needs ${h(s.needed)}`:''}${s.supplied?` · Provided ${h(s.supplied)}`:''}</p></div></div>`).join('')}</div>`;
  }
  window.sampleDosePlanPrintHtml=function sampleDosePlanPrintHtmlRC56(){ const a=analyze(); return timelineHtml(a)+`<div class="rc56-callout ${a.level==='danger'?'warning':''}"><b>Coverage check:</b> ${h(a.headline)}. ${h(a.detail)}</div>`; };
})();



/* ===================== RC5.9: QA MARKER =====================
   Version marker used during print smoke testing; no workflow logic changes. */
window.IPMG_RC_VERSION = 'RC5.9 Print QA + Cohesion';



/* ===================== RC5.10: FRIENDLY HANDOUT BEAUTY PASS =====================
   Final visual pass for patient-facing handouts. */
(function(){
  if(window.__IPMG_RC510_HANDOUT_BEAUTY__) return;
  window.__IPMG_RC510_HANDOUT_BEAUTY__=true;
  const q=id=>document.getElementById(id);
  const h=s=>typeof esc==='function'?esc(s==null?'':String(s)):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const raw=(id,f='')=>{const el=q(id); const v=el&&'value'in el?String(el.value||'').trim():''; return v||f;};
  const fmt=d=>{try{return d?(typeof fmtDate==='function'?fmtDate(d):d):'—';}catch(e){return d||'—';}};
  const today=()=>localDateValue();
  const add=(d,n)=>{try{return typeof addDays==='function'?addDays(d,n):new Date(new Date(d).getTime()+n*86400000).toISOString().slice(0,10);}catch(e){return d;}};
  const printed=()=>{try{return typeof shortPrintDate==='function'?shortPrintDate():fmt(today());}catch(e){return fmt(today());}};
  const list=items=>(items||[]).filter(Boolean).map(x=>`<li>${h(x)}</li>`).join('');
  function head(kind,title,sub,status='',cls=''){
    return `<div class="beauty-head"><div class="beauty-kicker">${h(kind)}</div><h1 class="beauty-title">${h(title)}</h1><p class="beauty-sub">${h(sub)}</p>${status?`<div class="beauty-pill ${h(cls)}">${h(status)}</div>`:''}</div>`;
  }
  function meta(items){return `<div class="beauty-meta">${items.map(i=>`<div><span>${h(i.k)}</span>${h(i.v||'—')}</div>`).join('')}</div>`;}
  function footer(text){return `<div class="beauty-footer"><div>${text}</div><div class="beauty-printed">Printed ${h(printed())}</div></div>`;}
  function sampleEntries(){try{return typeof sampleDoseEntries==='function'?sampleDoseEntries():[];}catch(e){return [];}}
  function doseRows(entries){
    const rows=[`<div class="beauty-dose-row"><div>Step</div><div>How long</div><div>Instructions</div></div>`];
    (entries||[]).forEach((e,i)=>{
      const tag=i===0?'Take first':(i===1?'Then switch to':`Step ${i+1}`);
      const days=e.days?`${h(e.days)} day${String(e.days)==='1'?'':'s'}`:'As directed';
      rows.push(`<div class="beauty-dose-row"><div><b>${tag}</b>${h(e.strength||'Medication sample')}</div><div>${days}</div><div>${h(e.sig||'Take exactly as directed by your provider.')}${e.qty?`<br><span class="beauty-muted">Package: ${h(e.qty)}</span>`:''}</div></div>`);
    });
    return `<div class="beauty-dose"><h2>Your dose plan</h2>${rows.join('')}</div>`;
  }
  function sampleCoverage(entries,start){
    const total=(entries||[]).reduce((sum,e)=>sum+(parseInt(e.days,10)||0),0);
    if(start&&total>0){const end=add(start,total-1);return {status:'Estimated supply through',line:fmt(end),detail:'Please contact your pharmacy or clinic before this date if you do not have your prescription.'};}
    return {status:'Supply coverage',line:'Follow prescriber directions',detail:'Coverage depends on the exact package and instructions provided.'};
  }
  function udsPatientName(panel){try{return typeof udsPanelPatientName==='function'?udsPanelPatientName(panel):panel;}catch(e){return panel;}}
  function joined(panels,none){return panels&&panels.length?panels.map(udsPatientName).join(', '):(none||'None documented');}
  window.renderUdsPatientSummary=function renderUdsPatientSummaryRC510(){
    try{ if(typeof renderUdsNote==='function') renderUdsNote(); }catch(e){}
    const sheet=q('udsPatientSheet'); if(!sheet) return;
    const name=raw('udsPtName','Patient'), dob=raw('udsDOB','—');
    const collection=(typeof udsCollectionDateText==='function'?udsCollectionDateText():raw('udsDate','—'))||'—';
    const reason=(typeof udsReasonObj==='function'?udsReasonObj().l:raw('udsReason','Routine screening'));
    const panels=(typeof UDS_PANELS!=='undefined'?UDS_PANELS:[]);
    const results=(typeof UDS!=='undefined'&&UDS.results)?UDS.results:{};
    const byState=st=>{try{return typeof udsPanelsByState==='function'?udsPanelsByState(st):panels.filter(p=>(results[p]||'neg')===st);}catch(e){return [];}};
    const pos=byState('pos'), inv=byState('invalid'), nt=byState('nt'), neg=byState('neg');
    const invalidControl=typeof UDS!=='undefined' && UDS.control!=='valid';
    const tested=Math.max(0,panels.length-nt.length);
    const status=invalidControl?'Do not interpret':(pos.length||inv.length?'Provider review':'Screen completed');
    const cls=invalidControl?'danger':(pos.length||inv.length?'warn':'ok');
    const main=invalidControl?`The device control was ${UDS.control==='invalid'?'not valid':'not documented'}, so today’s cup should not be interpreted.`:(pos.length||inv.length?'Some screening areas need provider review. Your provider will review them with your medication list and treatment plan.':'No initial positive results were documented among the screening areas tested today.');
    const resultsHtml=[invalidControl?`<div class="beauty-result danger"><b>Device control</b><span>Control was ${UDS.control==='invalid'?'invalid or missing':'not documented'}. The cup should not be interpreted.</span></div>`:'',pos.length?`<div class="beauty-result warn"><b>Needs provider review</b><span>${h(joined(pos))}</span></div>`:'',inv.length?`<div class="beauty-result danger"><b>Unreadable areas</b><span>${h(joined(inv))}</span></div>`:'',(!invalidControl&&!pos.length&&!inv.length)?`<div class="beauty-result ok"><b>Initial positives</b><span>None documented among tested areas.</span></div>`:'',!invalidControl?`<div class="beauty-result ok"><b>Negative areas</b><span>${h(neg.length===tested&&tested>0?'All screening areas tested today were negative.':`${neg.length} of ${tested} tested screening areas were negative.`)}</span></div>`:'',nt.length?`<div class="beauty-result"><b>Not tested today</b><span>${h(joined(nt))}</span></div>`:''].join('');
    sheet.innerHTML=`<div class="beauty-page beauty-uds">
      ${head('Urine drug screen visit summary','Your office screen was completed today','This plain-language summary explains the point-of-care cup result. It is not a final laboratory confirmation report.',status,cls)}
      ${meta([{k:'Patient',v:name},{k:'Date of birth',v:dob},{k:'Date / time',v:collection},{k:'Reason',v:reason}])}
      <div class="beauty-hero ${cls==='ok'?'mint':cls==='warn'?'warm':''}"><div class="beauty-label">Today’s main takeaway</div><div class="beauty-big sm">${h(status)}</div><p class="beauty-plain">${h(main)}</p></div>
      <div class="beauty-grid"><div class="beauty-card"><h2>Result summary</h2>${resultsHtml}<p class="beauty-muted">This summary uses plain-language names instead of panel abbreviations.</p></div><div class="beauty-card"><h2>What this means</h2><p>This is an initial office screen. It helps your provider decide whether any follow-up discussion, repeat screen, or outside laboratory confirmation is needed.</p><div class="beauty-callout mint"><b>Provider context matters:</b> Your medications, history, and treatment plan affect how the result is reviewed.</div></div></div>
      <div class="beauty-grid"><div class="beauty-card"><h2>Important context</h2><ul class="beauty-list">${list(['Prescription and over-the-counter medications can affect how an office screen is reviewed.','Some medications may not show on every cup panel.','Your provider makes the final clinical interpretation, not the cup by itself.'])}</ul></div><div class="beauty-card"><h2>Contact the clinic if</h2><ul class="beauty-list">${list(['You have questions about what the office screen means.','You recently started, stopped, or changed a medication.','You think an outside laboratory confirmation may be needed.','You need to update your medication list before provider review.'])}</ul></div></div>
      <div class="beauty-trace"><b>What this does not mean:</b> This page does not diagnose substance use and does not replace provider interpretation or a final laboratory confirmation if ordered.</div>
      ${footer('This patient summary is for education and visit documentation. The provider reviews office-screening results with the full clinical context.')}
    </div>`;
  };
  window.renderAVS=function renderAVSRC510(){
    const sheet=q('avsSheet'); if(!sheet) return;
    const name=raw('ptName','Patient'), dob=raw('ptDOB','—');
    const med=(typeof S!=='undefined'&&S.med)?S.med:{}; const medName=med.name||'Injection';
    const dose=(typeof S!=='undefined'&&S.dose)?S.dose:''; const route=(typeof S!=='undefined'&&S.route)?S.route:''; const site=(typeof S!=='undefined'&&S.site)?S.site:'';
    const given=raw('adminDate')||today(); const next=raw('nextDate'); const by=raw('admin','');
    const resp=(typeof RESP!=='undefined'&&typeof S!=='undefined'?(RESP.find(r=>r.k===S.resp)||{}).l:'')||'Tolerated well';
    const cl=raw('clinic',''); const clName=cl?cl.split('|')[0]:''; const clPhone=cl?cl.split('|')[1]:'';
    const ivKey=(typeof S!=='undefined'&&S.intervalKey)?S.intervalKey:med.intervalKey;
    const w=(typeof effectiveWindow==='function')?effectiveWindow(med,ivKey):{winB:med.winB||0,winA:med.winA||0};
    const nextWindow=next?(med.timingMode==='orderVerify'?'Confirm timing with your clinic':`${fmt(add(next,-(w.winB||0)))} – ${fmt(add(next,(w.winA||0)))}`):'To be scheduled with the clinic';
    const note=(typeof AVSNOTE!=='undefined'&&med.key&&AVSNOTE[med.key])||((typeof AVSNOTE!=='undefined'&&AVSNOTE._default)||'Follow the aftercare instructions from your care team.');
    const routeSite=[route,site].filter(Boolean).join(' · ')||'Injection administered in office';
    const siteCare = /deltoid|arm/i.test(site) ? 'Try to avoid heavy upper-arm activity right after the injection if your arm feels sore.' : /glute|buttock/i.test(site) ? 'Avoid firm rubbing or pressure over the injection site unless your care team tells you otherwise.' : /abdomen|subq|subcutaneous/i.test(site+route) ? 'Avoid scratching, rubbing, or applying heat directly over the area.' : 'Keep the injection area clean and follow your care team’s instructions.';
    sheet.innerHTML=`<div class="beauty-page beauty-avs">
      ${head('Injection after-visit summary','You received your injection today','A simple summary of today’s injection, site-care reminders, and the next-dose plan.','Injection visit','ok')}
      ${meta([{k:'Patient',v:name},{k:'Date of birth',v:dob},{k:'Visit date',v:fmt(given)},{k:'Response',v:resp}])}
       <div class="beauty-grid"><div class="beauty-hero emphasis"><div class="beauty-label">Today you received</div><div class="beauty-big">${h(medName)}${dose?` ${h(dose)}`:''}</div><p class="beauty-plain">${h(routeSite)}</p><p class="beauty-muted">${by?`Administered by ${h(by)}`:'Administered in office'}</p></div><div class="beauty-next"><div class="beauty-label">Next injection</div><div class="beauty-date">${h(next?fmt(next):'Schedule')}</div><p class="beauty-window">${next?`${h(typeof dowName==='function'?dowName(next):'')} · ${med.timingMode==='orderVerify'?'Timing confirmed by your clinic.':`Recommended window: ${h(nextWindow)}`}`:'Your clinic will help schedule the next dose.'}</p></div></div>
      <div class="beauty-grid"><div class="beauty-card"><h2>What to expect</h2><ul class="beauty-list">${list(['Mild soreness, redness, or a small firm area can be normal for a few days.',note,'Continue medications exactly as prescribed unless your provider gives different instructions.'])}</ul></div><div class="beauty-card"><h2>Site care</h2><p>${h(siteCare)}</p><p class="beauty-muted">Avoid rubbing or massaging the injection site unless your care team specifically tells you otherwise.</p></div></div>
      <div class="beauty-grid"><div class="beauty-card"><h2>Call the clinic if</h2><ul class="beauty-list">${list(['Severe or worsening pain, swelling, warmth, drainage, or rash at the injection site.','Any symptom or reaction that feels unusual or worries you.','You are not sure when your next injection should be scheduled.'])}</ul></div><div class="beauty-card"><h2>Seek emergency care now for</h2><ul class="beauty-list">${list(['Trouble breathing, chest tightness, or severe dizziness.','Swelling of the face, lips, tongue, or throat.','A severe allergic reaction or symptoms that feel urgent.'])}</ul></div></div>
      <div class="beauty-trace"><b>Documentation details:</b> Medication ${h(medName)} · Dose ${h(dose||'—')} · Route/site ${h(routeSite)} · Lot ${h(raw('lot','not documented'))} · Exp ${h(raw('exp')?fmt(raw('exp')):'not documented')}</div>
      ${footer(`<b>Questions?</b> ${clPhone?`Call ${h(clName||'your clinic')} at ${h(clPhone)}.`:'Please contact your IPMG clinic.'}`)}
    </div>`;
  };
  window.IPMG_RC_VERSION='RC5.11 Output Tray + Guided Card Formatting Pass';
})();


/* RC5.10a: normalize sample timeline so patient handout shows actual steps, not the free-text summary as Step 1. */
(function(){
  if(window.__IPMG_RC510A_SAMPLE_FIX__) return;
  window.__IPMG_RC510A_SAMPLE_FIX__=true;
  const q=id=>document.getElementById(id);
  const h=s=>typeof esc==='function'?esc(s==null?'':String(s)):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const raw=(id,f='')=>{const el=q(id); const v=el&&'value'in el?String(el.value||'').trim():''; return v||f;};
  const fmt=d=>{try{return d?(typeof fmtDate==='function'?fmtDate(d):d):'—';}catch(e){return d||'—';}};
  const today=()=>localDateValue();
  const add=(d,n)=>{try{return typeof addDays==='function'?addDays(d,n):new Date(new Date(d).getTime()+n*86400000).toISOString().slice(0,10);}catch(e){return d;}};
  const printed=()=>{try{return typeof shortPrintDate==='function'?shortPrintDate():fmt(today());}catch(e){return fmt(today());}};
  const list=items=>(items||[]).filter(Boolean).map(x=>`<li>${h(x)}</li>`).join('');
  function head(kind,title,sub,status='',cls=''){return `<div class="beauty-head"><div class="beauty-kicker">${h(kind)}</div><h1 class="beauty-title">${h(title)}</h1><p class="beauty-sub">${h(sub)}</p>${status?`<div class="beauty-pill ${h(cls)}">${h(status)}</div>`:''}</div>`;}
  function meta(items){return `<div class="beauty-meta">${items.map(i=>`<div><span>${h(i.k)}</span>${h(i.v||'—')}</div>`).join('')}</div>`;}
  function footer(text){return `<div class="beauty-footer"><div>${text}</div><div class="beauty-printed">Printed ${h(printed())}</div></div>`;}
  function normalizeEntries(){
    let entries=[]; try{entries=typeof sampleDoseEntries==='function'?sampleDoseEntries():[];}catch(e){}
    entries=(entries||[]).map(e=>Object.assign({},e));
    if(entries.length>1){
      const first=(entries[0].strength||'')+' '+(entries[0].sig||'');
      if(/then|step plan|follow the step plan|switch/i.test(first)) entries.shift();
    }
    entries.forEach(e=>{ if(!e.days){ const m=String(e.sig||'').match(/for\s+(\d{1,3})\s+days?/i); if(m) e.days=m[1]; }
      if(!e.days && /once\s+daily|daily/i.test(String(e.sig||''))){ const q=String(e.qty||'').match(/(\d{1,3})\s*(?:tablet|tab|capsule|cap)s?/i); if(q) e.days=q[1]; } });
    return entries;
  }
  function doseRows(entries){
    const rows=[`<div class="beauty-dose-row"><div>Step</div><div>How long</div><div>Instructions</div></div>`];
    (entries||[]).forEach((e,i)=>{ const tag=i===0?'Take first':(i===1?'Then switch to':`Step ${i+1}`); const days=e.days?`${h(e.days)} day${String(e.days)==='1'?'':'s'}`:'As directed'; rows.push(`<div class="beauty-dose-row"><div><b>${tag}</b>${h(e.strength||'Medication sample')}</div><div>${days}</div><div>${h(e.sig||'Take exactly as directed by your provider.')}${e.qty?`<br><span class="beauty-muted">Package: ${h(e.qty)}</span>`:''}</div></div>`); });
    return `<div class="beauty-dose"><h2>Your dose plan</h2>${rows.join('')}</div>`;
  }
  function coverage(entries,start){ const total=(entries||[]).reduce((sum,e)=>sum+(parseInt(e.days,10)||0),0); if(start&&total>0){const end=add(start,total-1);return {status:'Estimated supply through',line:fmt(end),detail:'Please contact your pharmacy or clinic before this date if you do not have your prescription.'};} return {status:'Supply coverage',line:'Follow prescriber directions',detail:'Coverage depends on the exact package and instructions provided.'}; }
  window.renderSampleSheet=function renderSampleSheetRC510A(){
    try{ if(typeof renderSampleHandout==='function') renderSampleHandout(); }catch(e){}
    const sheet=q('sampleSheet'); if(!sheet) return;
    const med=(typeof sampleMed==='function'?sampleMed():{})||{};
    const patient=(typeof samplePatientName==='function'?samplePatientName():raw('samplePtName','Patient'));
    const dob=raw('sampleDOB','—'), prescriber=raw('samplePrescriber','—'), staff=raw('sampleStaff','—');
    const date=raw('sampleDate')?fmt(raw('sampleDate')):fmt(today());
    const medLabel=typeof sampleFriendlyMedication==='function'?sampleFriendlyMedication():raw('sampleMedLabel','Medication sample');
    const qty=raw('sampleQty','Quantity not documented');
    const lot=raw('sampleLot','not documented'), exp=raw('sampleExp')?fmt(raw('sampleExp')):'not documented';
    const food=typeof sampleFoodText==='function'?sampleFoodText():'as directed';
    const sig=typeof sampleInstructionsBlock==='function'?sampleInstructionsBlock():(typeof sampleSigText==='function'?sampleSigText():'Take exactly as directed by your provider.');
    const entries=normalizeEntries(); const cov=coverage(entries,raw('sampleStart')||raw('sampleDate')||today());
    const multi=entries.length>1 || /\b(and|\+)\b/i.test(raw('sampleMedLabel',''));
    const reminders=(med.reminders&&med.reminders.length?med.reminders:['Take only the amount your prescriber instructed.','Do not share medication samples with anyone else.','Keep samples away from children and pets.']).slice(0,4);
    const watch=(med.watch&&med.watch.length?med.watch:['You are not sure which sample to take first.','Your instructions do not match what your provider told you.','You may run out before your pharmacy prescription is ready.','You have a side effect that feels concerning.']).slice(0,4);
    sheet.innerHTML=`<div class="beauty-page beauty-sample">
      ${head('Medication sample instructions','You were given a medication sample today','Follow the plan below exactly as directed by your prescriber. If anything looks different from what your provider told you, call the clinic before starting.','Sample handout','')}
      ${meta([{k:'Patient',v:patient},{k:'Date of birth',v:dob},{k:'Date',v:date},{k:'Prescriber / staff',v:`${prescriber} · ${staff}`}])}
      <div class="beauty-grid"><div class="beauty-hero emphasis"><div class="beauty-label">Medication sample</div><div class="beauty-big">${h(medLabel)}</div><p class="beauty-plain">${h(qty)}</p><p class="beauty-muted">Take with food timing: ${h(food)}.</p></div><div class="beauty-hero mint"><div class="beauty-label">${h(cov.status)}</div><div class="beauty-big sm">${h(cov.line)}</div><p class="beauty-plain">${h(cov.detail)}</p></div></div>
      ${entries.length?doseRows(entries):`<div class="beauty-callout warm"><b>Dose plan:</b> ${h(sig)}</div>`}
      ${multi?`<div class="beauty-callout warm"><b>Important:</b> Do not take multiple sample strengths together unless your provider specifically told you to. Use the steps in the order written above.</div>`:''}
      <div class="beauty-grid"><div class="beauty-card"><h2>How to take it</h2><p>${h(sig).replace(/\n/g,'<br>')}</p>${med.guard?`<div class="beauty-callout warm"><b>Before you start:</b> ${h(med.guard)}</div>`:''}</div><div class="beauty-card"><h2>Call the clinic if</h2><ul class="beauty-list">${list(watch)}</ul></div></div>
      <div class="beauty-grid"><div class="beauty-card"><h2>Helpful reminders</h2><ul class="beauty-list">${list(reminders)}</ul></div><div class="beauty-card"><h2>Do not miss this</h2><ul class="beauty-list">${list(['Take only the sample listed on the current step.','Keep the sample packaging until you finish the starter plan.','Keep medication samples away from children and pets.'])}</ul></div></div>
      <div class="beauty-trace"><b>Sample tracking:</b> ${h(medLabel)} · Lot ${h(lot)} · Exp ${h(exp)} · Package ${h(qty)}</div>
      ${footer('<b>Questions?</b> Please contact Inland Psychiatric Medical Group before changing how you take this sample.')}
    </div>`;
  };
})();


/* ===================== RC5.13: SAMPLE DISPENSING WORKSHEET ===================== */
(function(){
  if(window.__IPMG_SAMPLE_WORKSHEET_RC513__) return;
  window.__IPMG_SAMPLE_WORKSHEET_RC513__=true;
  const q=id=>document.getElementById(id);
  const safe=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const val=id=>(q(id)?.value||'').trim();
  const line=(label,value,cls='')=>`<div class="sw-field ${cls}"><span class="k">${safe(label)}</span><span class="v">${safe(value||'')}</span></div>`;
  const blankLine=(label,cls='')=>line(label,'',cls);
  const check=txt=>`<div class="sw-check"><span class="sw-box"></span><span>${safe(txt)}</span></div>`;
  function fmt(d){ try{ if(window.fmtDate) return fmtDate(d); }catch(e){} return d||''; }
  function today(){ try{ if(window.rc5Today) return rc5Today(); }catch(e){} return localDateValue(); }
  function doseText(){
    try{ if(window.sampleDosePlanText){ const t=sampleDosePlanText(); if(t) return t; } }catch(e){}
    return val('sampleTitration') || val('sampleSig') || '';
  }
  function medLabel(){
    try{ if(window.sampleFriendlyMedication) return sampleFriendlyMedication(); }catch(e){}
    return val('sampleMedLabel');
  }
  function coverage(){
    try{ if(window.rc5PlanAnalysis){ const a=rc5PlanAnalysis(); return `${a.headline||''}${a.detail?'. '+a.detail:''}`; } }catch(e){}
    return '';
  }
  function purpose(){ return val('samplePurpose') || 'Medication sample'; }
  function render(blank=false){
    const date=blank?'':(val('sampleDate')?fmt(val('sampleDate')):fmt(today()));
    const start=blank?'':(val('sampleStart')?fmt(val('sampleStart')):'');
    const patient=blank?'':val('samplePtName');
    const dob=blank?'':val('sampleDOB');
    const prescriber=blank?'':val('samplePrescriber');
    const staff=blank?'':val('sampleStaff');
    const med=blank?'':medLabel();
    const pkg=blank?'':val('sampleQty');
    const sig=blank?'':val('sampleSig');
    const titration=blank?'':doseText();
    const lot=blank?'':val('sampleLot');
    const exp=blank?'':val('sampleExp');
    const food=blank?'':(val('sampleFood')==='auto'?'Medication-specific / as directed':val('sampleFood'));
    const mode=blank?'Blank worksheet':'Prefilled worksheet';
    const sheet=q('sampleWorksheetSheet'); if(!sheet) return;
    sheet.innerHTML=`
      <div class="sw-page">
        <div class="sw-head">
          <div>
            <div class="sw-kicker">Inland Psychiatric Medical Group</div>
            <h1 class="sw-title">Sample Dispensing Worksheet</h1>
            <div class="sw-sub">Clinician-to-staff handoff. Provider documents the intended sample plan; staff completes actual dispensing traceability before patient handout and Tebra documentation.</div>
          </div>
          <div class="sw-badge"><b>${safe(mode)}</b><span>Internal worksheet</span></div>
        </div>

        <div class="sw-flow">
          <div><b>1. Provider intent</b>Medication, purpose, and directions are written clearly.</div>
          <div><b>2. Staff verification</b>Actual package, lot, expiration, and quantity are confirmed.</div>
          <div><b>3. Documentation</b>Patient handout, Tebra note, and log are completed.</div>
        </div>

        <div class="sw-section provider">
          <h2>Provider completes <span>sample intent</span></h2>
          <div class="sw-grid three">
            ${blank?blankLine('Patient name'):line('Patient name',patient)}
            ${blank?blankLine('Date of birth'):line('Date of birth',dob)}
            ${blank?blankLine('Date'):line('Date',date)}
            ${blank?blankLine('Prescriber'):line('Prescriber',prescriber)}
            ${blank?blankLine('Medication / strength(s)'):line('Medication / strength(s)',med)}
            ${blank?blankLine('Quantity / package requested'):line('Quantity / package requested',pkg)}
          </div>
          <div class="sw-checks">
            ${check('Starter / titration sample')}
            ${check('Bridge until pharmacy fill')}
            ${check('Dose change / tolerability trial')}
            ${check('Pharmacy delay / prior authorization delay')}
          </div>
        </div>

        <div class="sw-section provider">
          <h2>Directions for patient <span>write clearly</span></h2>
          <div class="sw-directions">
            ${blank?blankLine('Start date / when to begin'):line('Start date / when to begin',start)}
            ${blank?blankLine('Directions / sig', 'tall'):line('Directions / sig',sig,'tall')}
            ${blank?blankLine('Titration / step plan', 'tall'):line('Titration / step plan',titration,'tall')}
            ${blank?blankLine('Food timing / special instructions'):line('Food timing / special instructions',food)}
          </div>
          <div class="sw-mini-note">If multiple strengths are given, specify exactly which strength is taken first, when to switch, and whether strengths should not be combined.</div>
        </div>

        <div class="sw-section safety">
          <h2>Counseling / safety <span>provider initials if applicable</span></h2>
          <div class="sw-checks">
            ${check('Patient understands which sample to take first')}
            ${check('Do not combine strengths unless directed')}
            ${check('When to call clinic reviewed')}
            ${check('Medication list / interaction concern reviewed')}
            ${check('Prescription sent or pharmacy plan discussed')}
            ${check('Follow-up scheduled or scheduling needed')}
          </div>
          <div class="sw-quiet">Use this section to capture provider intent. Staff should not guess titration, strength sequence, or whether pharmacy bridge supply is appropriate.</div>
          <div class="sw-grid" style="margin-top:8px">
            ${blank?blankLine('Prescription sent / pharmacy plan'):line('Prescription sent / pharmacy plan','')}
            ${blank?blankLine('Follow-up plan'):line('Follow-up plan','')}
          </div>
          <div class="sw-sign">Provider signature / initials</div>
        </div>

        <div class="sw-section staff">
          <h2>Staff completes <span>actual dispensing</span></h2>
          <div class="sw-grid three">
            ${blank?blankLine('Actual package dispensed'):line('Actual package dispensed',pkg)}
            ${blank?blankLine('Lot #'):line('Lot #',lot)}
            ${blank?blankLine('Expiration'):line('Expiration',exp)}
            ${blank?blankLine('Quantity dispensed'):line('Quantity dispensed',pkg)}
            ${blank?blankLine('Dispensed by'):line('Dispensed by',staff)}
            ${blank?blankLine('Coverage check'):line('Coverage check',coverage())}
          </div>
          <div class="sw-checks">
            ${check('Patient handout printed')}
            ${check('Tebra note entered')}
            ${check('Sample log completed')}
            ${check('Worksheet scanned / filed if needed')}
          </div>
          <div class="sw-quiet">Staff verifies the physical package before handing the sample to the patient. Use the app handout as the patient-facing instructions.</div>
          <div class="sw-sign">Staff initials / date-time</div>
        </div>

        <div class="sw-footer">
          <div><b>Purpose:</b> ${safe(blank?'':purpose()) || '________________'}</div>
          <div><b>Reminder:</b> worksheet is an internal handoff, not a patient medication guide.</div>
          <div><b>Printed:</b> ${safe(date || '____________')}</div>
        </div>
      </div>`;
  }
  window.renderSampleWorksheet=render;
  function printWorksheet(blank=false){
    render(blank);
    if(window.cleanPrintClasses) cleanPrintClasses();
    document.body.classList.add('print-sample-worksheet');
    window.print();
    setTimeout(()=>{ if(window.cleanPrintClasses) cleanPrintClasses(); else document.body.classList.remove('print-sample-worksheet'); },500);
  }
  function wire(){
    const pre=q('sampleWorksheetPrint'); if(pre&&!pre.dataset.rc513){pre.dataset.rc513='1'; pre.addEventListener('click',()=>printWorksheet(false));}
    const blank=q('sampleWorksheetBlank'); if(blank&&!blank.dataset.rc513){blank.dataset.rc513='1'; blank.addEventListener('click',()=>printWorksheet(true));}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire,{once:true}); else wire();
})();


/* ===================== RC5.14 Injection Start Worksheet ===================== */
(function(){
  const get=id=>document.getElementById(id);
  const val=id=>(get(id)?.value||'').trim();
  const safe=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt=s=>{try{return s?new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';}catch(e){return s||'';}};
  const today=()=>localDateValue();
  const line=(k,v,cls='')=>`<div class="iw-field ${cls}"><span class="k">${safe(k)}</span><span class="v">${safe(v)||'&nbsp;'}</span></div>`;
  const blankLine=(k,cls='')=>line(k,'',cls);
  const check=t=>`<label class="iw-check"><span class="iw-box"></span><span>${safe(t)}</span></label>`;
  function medName(){
    try{ if(window.S&&S.med){ return S.med.name||S.med.label||''; } }catch(e){}
    return '';
  }
  function intervalLabel(){
    try{ const key=(window.S&&S.intervalKey)||''; const row=(window.INTERVALS||[]).find(i=>i.key===key); return row?row.label:key; }catch(e){ return ''; }
  }
  function timingWindow(){
    try{
      const next=val('nextDate'), admin=val('adminDate');
      if(next){ return `${fmt(next)}${intervalLabel()?` · ${intervalLabel()}`:''}`; }
      if(admin&&intervalLabel()) return `${intervalLabel()} from ${fmt(admin)}`;
      return intervalLabel();
    }catch(e){return '';}
  }
  function workflowReason(){
    try{
      const r=(window.S&&S.reason)||'';
      const found=(window.REASONS||[]).find(x=>x.key===r);
      return found?found.label:r;
    }catch(e){return '';}
  }
  function currentSite(){
    try{return (window.S&&S.site)||'';}catch(e){return '';}
  }
  function currentRoute(){
    try{return (window.S&&S.route)||'';}catch(e){return '';}
  }
  function currentDose(){
    try{return (window.S&&S.dose)||'';}catch(e){return '';}
  }
  function render(blank=false){
    const sheet=get('injWorksheetSheet'); if(!sheet) return;
    const date=blank?'':(val('adminDate')?fmt(val('adminDate')):fmt(today()));
    const patient=blank?'':val('ptName');
    const dob=blank?'':val('ptDOB');
    const provider=blank?'':val('orderingProvider');
    const staff=blank?'':val('admin');
    const med=blank?'':medName();
    const dose=blank?'':currentDose();
    const route=blank?'':currentRoute();
    const site=blank?'':currentSite();
    const ndc=blank?'':val('ndc');
    const lot=blank?'':val('lot');
    const exp=blank?'':val('exp');
    const next=blank?'':(val('nextDate')?fmt(val('nextDate')):'');
    const windowTxt=blank?'':timingWindow();
    const reason=blank?'':workflowReason();
    const mode=blank?'Blank worksheet':'Prefilled worksheet';
    sheet.innerHTML=`
      <div class="iw-page">
        <div class="iw-head">
          <div>
            <div class="iw-kicker">Inland Psychiatric Medical Group</div>
            <h1 class="iw-title">Injection Start Worksheet</h1>
            <div class="iw-sub">Compact clinician-to-staff handoff for first dose, restart, loading dose, dose change, or any injection that needs extra verification before administration.</div>
          </div>
          <div class="iw-badge"><b>${safe(mode)}</b><span>Internal worksheet</span></div>
        </div>

        <div class="iw-flow">
          <div><b>1. Provider intent</b>Medication, dose, timing, and reason are clear.</div>
          <div><b>2. Staff verifies</b>Physical product, lot, expiration, route, and site are checked.</div>
          <div><b>3. Document</b>Tebra note, AVS, next visit, and log are completed.</div>
        </div>

        <div class="iw-meta">
          ${blank?blankLine('Patient name'):line('Patient name',patient)}
          ${blank?blankLine('DOB'):line('DOB',dob)}
          ${blank?blankLine('Date'):line('Date',date)}
          ${blank?blankLine('Provider'):line('Provider',provider)}
        </div>

        <div class="iw-main">
          <div>
            <div class="iw-section provider">
              <h2>Provider completes <span>injection intent</span></h2>
              <div class="iw-grid">
                ${blank?blankLine('Medication'):line('Medication',med)}
                ${blank?blankLine('Dose'):line('Dose',dose)}
                ${blank?blankLine('Route'):line('Route',route)}
                ${blank?blankLine('Frequency'):line('Frequency',intervalLabel())}
              </div>
              <div class="iw-checks one">
                ${check('First dose / new start')}
                ${check('Loading dose / initiation sequence')}
                ${check('Restart after missed dose')}
                ${check('Dose change')}
                ${check('Maintenance dose with special instruction')}
              </div>
              <div class="iw-note">Use this worksheet when the injection needs clear provider intent. Routine maintenance doses may not need a worksheet unless something changed.</div>
              <div class="iw-sign">Provider signature / initials</div>
            </div>

            <div class="iw-section timing">
              <h2>Timing / instructions <span>provider review</span></h2>
              <div class="iw-grid">
                ${blank?blankLine('Give today?'):line('Give today?','Yes / per provider order')}
                ${blank?blankLine('Next due / window'):line('Next due / window',next||windowTxt)}
              </div>
              ${blank?blankLine('Special instructions','tall'):line('Special instructions',reason,'tall')}
              <div class="iw-checks one">
                ${check('Dosing window reviewed if late/early')}
                ${check('Oral overlap / loading instructions reviewed if applicable')}
                ${check('Patient questions addressed before administration')}
              </div>
            </div>
          </div>

          <div>
            <div class="iw-section staff">
              <h2>Staff completes <span>verification</span></h2>
              <div class="iw-grid">
                ${blank?blankLine('Actual medication'):line('Actual medication',med)}
                ${blank?blankLine('Actual dose'):line('Actual dose',dose)}
                ${blank?blankLine('Route verified'):line('Route verified',route)}
                ${blank?blankLine('Injection site'):line('Injection site',site)}
                ${blank?blankLine('Lot #'):line('Lot #',lot)}
                ${blank?blankLine('Expiration'):line('Expiration',exp)}
              </div>
              <div class="iw-checks one">
                ${check('Medication matches provider order')}
                ${check('Dose / route / site verified')}
                ${check('Expiration checked before administration')}
                ${check('Previous site / rotation checked if applicable')}
                ${check('Allergies / safety concerns reviewed')}
                ${check('Patient tolerated injection')}
              </div>
              <div class="iw-sign">Staff initials / date-time</div>
            </div>

            <div class="iw-section doc">
              <h2>Documentation <span>closeout</span></h2>
              <div class="iw-grid">
                ${blank?blankLine('NDC / product code'):line('NDC / product code',ndc)}
                ${blank?blankLine('Administered by'):line('Administered by',staff)}
              </div>
              <div class="iw-checks one">
                ${check('Tebra administration note entered')}
                ${check('AVS printed or offered')}
                ${check('Next appointment reviewed / scheduled')}
                ${check('Logged in assistant')}
                ${check('Worksheet scanned / filed if needed')}
              </div>
              <div class="iw-quiet">This worksheet is internal. The patient-facing output remains the Injection AVS.</div>
            </div>
          </div>
        </div>

        <div class="iw-footer">
          <div><b>Reason:</b> ${safe(blank?'':reason) || '________________'}</div>
          <div><b>Reminder:</b> verify active Rx, medication label, site protocol, and provider order before administering.</div>
          <div><b>Printed:</b> ${safe(date || '____________')}</div>
        </div>
      </div>`;
  }
  window.renderInjectionWorksheet=render;
  function printWorksheet(blank=false){
    render(blank);
    if(window.cleanPrintClasses) cleanPrintClasses();
    document.body.classList.add('print-inj-worksheet');
    window.print();
    setTimeout(()=>{ if(window.cleanPrintClasses) cleanPrintClasses(); else document.body.classList.remove('print-inj-worksheet'); },500);
  }
  function wire(){
    const pre=get('injWorksheetPrint'); if(pre&&!pre.dataset.rc514){pre.dataset.rc514='1'; pre.addEventListener('click',()=>printWorksheet(false));}
    const blank=get('injWorksheetBlank'); if(blank&&!blank.dataset.rc514){blank.dataset.rc514='1'; blank.addEventListener('click',()=>printWorksheet(true));}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire,{once:true}); else wire();
})();



/* ===================== RC5.16: worksheet render hardening + print intercept ===================== */
(function(){
  if(window.__IPMG_WORKSHEET_RC516__) return;
  window.__IPMG_WORKSHEET_RC516__=true;
  const get=id=>document.getElementById(id);
  const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
  const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const val=id=>clean(get(id)?.value||'');
  const txt=id=>clean(get(id)?.textContent||'');
  const useful=s=>{s=clean(s); return s && !/^[-—]+$/.test(s) && !/^(select|route|patient name|cc first line|pick a|not signed in)$/i.test(s);};
  const first=(...items)=>{for(const it of items){let v=typeof it==='function'?it():it; v=clean(v); if(useful(v)) return v;} return '';};
  const today=()=>localDateValue();
  function fmt(raw){
    raw=clean(raw); if(!raw) return '';
    try{
      if(/^\d{4}-\d{2}$/.test(raw)){ const [y,m]=raw.split('-'); return `${m}/${y}`; }
      if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){ const [y,m,d]=raw.split('-'); return `${m}/${d}/${y}`; }
      if(window.fmtDate) return fmtDate(raw);
    }catch(e){}
    return raw;
  }
  function selectedChip(container){
    const root=get(container); if(!root) return '';
    const el=root.querySelector('.chip.on,.mini.on,.sample-intent-chip.on,button.on,[aria-pressed="true"]');
    return clean(el?.textContent||'');
  }
  function staffFallback(){
    return first(val('sampleStaff'), val('admin'), val('staffSignIn'), txt('staffCurrent'), ()=>{try{return typeof window.getStoredStaff==='function'?window.getStoredStaff():((window.SAFE_STORAGE&&SAFE_STORAGE.get('ipmgMedAssistStaff',''))||localStorage.getItem('ipmgMedAssistStaff')||'');}catch(e){return '';}});
  }
  function patientFallback(){ return first(val('samplePtName'), val('ptName'), val('udsPtName')); }
  function dobFallback(){ return first(val('sampleDOB'), val('ptDOB'), val('udsDOB')); }
  function providerFallback(){ return first(val('samplePrescriber'), val('orderingProvider')); }
  function line(prefix,label,value,cls=''){
    const v=clean(value); return `<div class="${prefix}-field ${cls} ${v?'filled':'empty'}"><span class="k">${safe(label)}</span><span class="v">${v?safe(v):'&nbsp;'}</span></div>`;
  }
  function check(prefix,txt,checked=false){return `<div class="${prefix}-check"><span class="${prefix}-box ${checked?'checked':''}">${checked?'✓':''}</span><span>${safe(txt)}</span></div>`;}
  function sampleDoseEntriesSafe(){try{return (typeof window.sampleDoseEntries==='function'?sampleDoseEntries():[]).filter(Boolean);}catch(e){return [];}}
  function sampleEngaged(){
    const ids=['samplePtName','sampleDOB','samplePrescriber','sampleStaff','sampleMedLabel','sampleQty','sampleLot','sampleExp','sampleStart','sampleSig','sampleTitration','sampleExtra'];
    return ids.some(id=>useful(val(id))) || sampleDoseEntriesSafe().length>0;
  }
  function sampleMedLabelSafe(blank){
    if(blank) return '';
    const entries=sampleDoseEntriesSafe();
    return first(val('sampleMedLabel'), ()=>entries.map(e=>e.strength).filter(useful).join(' + '), ()=>sampleEngaged()&&typeof window.sampleFriendlyMedication==='function'?sampleFriendlyMedication():'');
  }
  function sampleQtySafe(blank){
    if(blank) return '';
    const entries=sampleDoseEntriesSafe();
    return first(val('sampleQty'), ()=>entries.map(e=>e.qty).filter(useful).join(' + '));
  }
  function sampleSigSafe(blank){
    if(blank) return '';
    return first(val('sampleSig'), ()=>sampleEngaged()&&typeof window.sampleInstructionsBlock==='function'?sampleInstructionsBlock():'', ()=>sampleEngaged()&&typeof window.sampleSigText==='function'?sampleSigText():'');
  }
  function samplePlanSafe(blank){
    if(blank) return '';
    const entries=sampleDoseEntriesSafe();
    const rows=entries.map((e,i)=>`Step ${i+1}: ${[e.strength,e.qty,e.days?`${e.days} day(s)`:'' ,e.sig].filter(useful).join(' · ')}`).filter(useful).join('\n');
    return first(val('sampleTitration'), rows, ()=>sampleEngaged()&&typeof window.sampleDosePlanText==='function'?sampleDosePlanText():'');
  }
  function sampleFoodSafe(blank){
    if(blank) return '';
    return first(()=>{const v=val('sampleFood'); return v && v!=='auto'?v:'';}, ()=>sampleEngaged()&&typeof window.sampleFoodText==='function'?sampleFoodText():'Medication-specific / as directed');
  }
  function sampleCoverageSafe(blank){
    if(blank) return '';
    try{ if(sampleEngaged()&&typeof window.rc5PlanAnalysis==='function'){ const a=rc5PlanAnalysis(); return first(a?.headline, a?.line, a?.detail); } }catch(e){}
    return '';
  }
  function renderSampleWorksheet516(blank=false){
    const sheet=get('sampleWorksheetSheet'); if(!sheet) return;
    const date=blank?'':first(()=>val('sampleDate')?fmt(val('sampleDate')):'', ()=>fmt(today()));
    const purpose=blank?'':first(()=>val('samplePurpose'), ()=>typeof window.sampleIntentObj==='function'?(sampleIntentObj().label||''):'');
    const purposeLC=purpose.toLowerCase();
    const med=sampleMedLabelSafe(blank);
    const qty=sampleQtySafe(blank);
    const sig=sampleSigSafe(blank);
    const plan=samplePlanSafe(blank);
    const start=blank?'':(val('sampleStart')?fmt(val('sampleStart')):'');
    const food=sampleFoodSafe(blank);
    const lot=blank?'':val('sampleLot');
    const exp=blank?'':fmt(val('sampleExp'));
    const staff=blank?'':staffFallback();
    const mode=blank?'Blank worksheet':'Prefilled worksheet';
    sheet.innerHTML=`
      <div class="sw-page ws-modern sw-sample">
        <div class="sw-head">
          <div><div class="sw-kicker">Inland Psychiatric Medical Group</div><h1 class="sw-title">Sample Dispensing Worksheet</h1><div class="sw-sub">Clinician-to-staff handoff. Provider writes the intended sample plan; staff verifies actual package, quantity, lot, expiration, handout, Tebra note, and sample log.</div></div>
          <div class="sw-badge"><b>${safe(mode)}</b><span>Internal handoff</span></div>
        </div>
        <div class="sw-flow"><div><b>1. Provider intent</b>Medication, purpose, directions.</div><div><b>2. Staff verification</b>Package, lot, exp, quantity.</div><div><b>3. Closeout</b>Handout, Tebra note, log.</div></div>

        <div class="sw-section provider">
          <h2>Provider completes <span>sample intent</span></h2>
          <div class="sw-grid three">
            ${line('sw','Patient name',blank?'':patientFallback())}
            ${line('sw','Date of birth',blank?'':dobFallback())}
            ${line('sw','Date',date)}
            ${line('sw','Prescriber',blank?'':providerFallback())}
            ${line('sw','Medication / strength(s)',med)}
            ${line('sw','Quantity / package requested',qty)}
          </div>
          <div class="sw-checks">
            ${check('sw','Starter / titration sample',/titration|starter|start/.test(purposeLC))}
            ${check('sw','Bridge until pharmacy fill',/bridge|pharmacy|prior authorization/.test(purposeLC))}
            ${check('sw','Dose change / tolerability trial',/dose change|tolerability/.test(purposeLC))}
            ${check('sw','Continuation / short supply',/continuation/.test(purposeLC))}
          </div>
        </div>

        <div class="sw-section provider">
          <h2>Directions for patient <span>write clearly</span></h2>
          <div class="sw-directions">
            ${line('sw','Start date / when to begin',start)}
            ${line('sw','Directions / sig',sig,'tall')}
            ${line('sw','Titration / step plan',plan,'tall')}
            ${line('sw','Food timing / special instructions',food)}
          </div>
          <div class="sw-mini-note">If multiple strengths are given, specify the first strength, when to switch, and whether strengths should not be combined.</div>
        </div>

        <div class="sw-split">
          <div class="sw-section safety">
            <h2>Counseling / safety <span>provider initials if applicable</span></h2>
            <div class="sw-checks">
              ${check('sw','Patient understands which sample to take first',!!plan||!!sig)}
              ${check('sw','Do not combine strengths unless directed',/step|then|titration|\+| and /i.test(plan||med))}
              ${check('sw','When to call clinic reviewed',false)}
              ${check('sw','Medication list / interaction concern reviewed',false)}
              ${check('sw','Prescription sent or pharmacy plan discussed',/bridge|pharmacy|prior authorization/.test(purposeLC))}
              ${check('sw','Follow-up scheduled or scheduling needed',false)}
            </div>
            <div class="sw-grid" style="margin-top:.08in">
              ${line('sw','Prescription sent / pharmacy plan',blank?'':(/bridge|pharmacy|prior authorization/.test(purposeLC)?purpose:''))}
              ${line('sw','Follow-up plan','')}
            </div>
            <div class="sw-quiet">Staff should not guess titration, strength sequence, or bridge appropriateness. Clarify with provider if this section is incomplete.</div>
            <div class="sw-sign">Provider signature / initials</div>
          </div>

          <div class="sw-section staff">
            <h2>Staff completes <span>actual dispensing</span></h2>
            <div class="sw-grid three">
              ${line('sw','Actual package dispensed',qty)}
              ${line('sw','Lot #',lot)}
              ${line('sw','Expiration',exp)}
              ${line('sw','Quantity dispensed',qty)}
              ${line('sw','Dispensed by',staff)}
              ${line('sw','Coverage check',sampleCoverageSafe(blank))}
            </div>
            <div class="sw-checks">
              ${check('sw','Patient handout printed',false)}
              ${check('sw','Tebra note entered',false)}
              ${check('sw','Sample log completed',false)}
              ${check('sw','Worksheet scanned / filed if needed',false)}
            </div>
            <div class="sw-quiet">Verify the physical package before handing the sample to the patient. Use the app handout as the patient-facing instructions.</div>
            <div class="sw-sign">Staff initials / date-time</div>
          </div>
        </div>

        <div class="sw-footer"><div><b>Purpose:</b> ${safe(purpose)||'________________'}</div><div><b>Reminder:</b> internal handoff only; not a patient medication guide.</div><div><b>Printed:</b> ${safe(date||'____________')}</div></div>
      </div>`;
  }

  function injectionMedNameSafe(blank){
    if(blank) return '';
    return first(()=>{try{return window.S&&S.med?(S.med.name||S.med.label||''):'';}catch(e){return ''; }}, txt('medHdrName'), selectedChip('medChips'));
  }
  function injectionDoseSafe(blank){ if(blank) return ''; return first(()=>{try{return window.S&&S.dose||'';}catch(e){return '';}}, selectedChip('doseChips')); }
  function injectionRouteSafe(blank){ if(blank) return ''; return first(()=>{try{return window.S&&S.route||'';}catch(e){return '';}}, selectedChip('routeChips'), txt('adminRoutePill')); }
  function injectionSiteSafe(blank){ if(blank) return ''; return first(()=>{try{return window.S&&S.site||'';}catch(e){return '';}}, selectedChip('siteChips'), txt('adminSelectedText')); }
  function humanizeToken(s){s=clean(s); if(!s) return ''; const intervalMap={q2w:'Every 2 weeks',q3w:'Every 3 weeks',q4w:'Every 4 weeks',monthly:'Monthly',q8w:'Every 8 weeks',q12w:'Every 12 weeks',q6mo:'Every 6 months'}; if(intervalMap[s]) return intervalMap[s]; return s.replace(/[_-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());}
  function injectionIntervalSafe(blank){ if(blank) return ''; return first(()=>{try{const key=(window.S&&S.intervalKey)||''; const row=(window.INTERVALS||[]).find(i=>i.key===key); return row?row.label:humanizeToken(key);}catch(e){return '';}}, selectedChip('intChips')); }
  function injectionReasonSafe(blank){ if(blank) return ''; return first(()=>{try{const r=(window.S&&S.reason)||''; const found=(window.REASONS||[]).find(x=>x.key===r); return found?found.label:humanizeToken(r);}catch(e){return '';}}, selectedChip('reasonChips')); }
  function renderInjectionWorksheet516(blank=false){
    const sheet=get('injWorksheetSheet'); if(!sheet) return;
    const date=blank?'':first(()=>val('adminDate')?fmt(val('adminDate')):'', ()=>fmt(today()));
    const reason=injectionReasonSafe(blank);
    const reasonLC=reason.toLowerCase();
    const med=injectionMedNameSafe(blank);
    const dose=injectionDoseSafe(blank);
    const route=injectionRouteSafe(blank);
    const site=injectionSiteSafe(blank);
    const interval=injectionIntervalSafe(blank);
    const next=blank?'':first(()=>val('nextDate')?fmt(val('nextDate')):'', txt('retBig'));
    const windowTxt=blank?'':first(()=>txt('retWin'), interval);
    const provider=blank?'':providerFallback();
    const staff=blank?'':staffFallback();
    const mode=blank?'Blank worksheet':'Prefilled worksheet';
    sheet.innerHTML=`
      <div class="iw-page ws-modern iw-injection">
        <div class="iw-head">
          <div><div class="iw-kicker">Inland Psychiatric Medical Group</div><h1 class="iw-title">Injection Start Worksheet</h1><div class="iw-sub">Clinician-to-staff handoff for first dose, restart, loading dose, dose change, late dose, or any injection needing extra verification before administration.</div></div>
          <div class="iw-badge"><b>${safe(mode)}</b><span>Internal handoff</span></div>
        </div>
        <div class="iw-flow"><div><b>1. Provider intent</b>Medication, dose, timing.</div><div><b>2. Staff verifies</b>Product, lot, route, site.</div><div><b>3. Document</b>Tebra note, AVS, log.</div></div>
        <div class="iw-meta">
          ${line('iw','Patient name',blank?'':patientFallback())}
          ${line('iw','DOB',blank?'':dobFallback())}
          ${line('iw','Date',date)}
          ${line('iw','Provider',provider)}
        </div>

        <div class="iw-main">
          <div>
            <div class="iw-section provider">
              <h2>Provider completes <span>injection intent</span></h2>
              <div class="iw-grid">
                ${line('iw','Medication',med)}
                ${line('iw','Dose',dose)}
                ${line('iw','Route',route)}
                ${line('iw','Frequency',interval)}
              </div>
              <div class="iw-checks one">
                ${check('iw','First dose / new start',/first|new start|start/.test(reasonLC))}
                ${check('iw','Loading dose / initiation sequence',/loading|initiation/.test(reasonLC))}
                ${check('iw','Restart after missed dose',/restart|missed|late/.test(reasonLC))}
                ${check('iw','Dose change',/dose change|change/.test(reasonLC))}
                ${check('iw','Maintenance dose with special instruction',/maintenance|special/.test(reasonLC))}
              </div>
              <div class="iw-note">Use this worksheet when clear provider intent is needed. Routine maintenance doses may not need it unless something changed.</div>
              <div class="iw-sign">Provider signature / initials</div>
            </div>
            <div class="iw-section timing">
              <h2>Timing / instructions <span>provider review</span></h2>
              <div class="iw-grid">
                ${line('iw','Give today?',blank?'':'Yes / per provider order')}
                ${line('iw','Next due / window',first(next,windowTxt))}
              </div>
              ${line('iw','Special instructions',reason,'tall')}
              <div class="iw-checks one">
                ${check('iw','Dosing window reviewed if late/early',/late|missed|restart/.test(reasonLC)||!!next)}
                ${check('iw','Oral overlap / loading instructions reviewed if applicable',/loading|initiation|overlap/.test(reasonLC))}
                ${check('iw','Patient questions addressed before administration',false)}
              </div>
            </div>
          </div>
          <div>
            <div class="iw-section staff">
              <h2>Staff completes <span>verification</span></h2>
              <div class="iw-grid">
                ${line('iw','Actual medication',med)}
                ${line('iw','Actual dose',dose)}
                ${line('iw','Route verified',route)}
                ${line('iw','Injection site',site)}
                ${line('iw','Lot #',blank?'':val('lot'))}
                ${line('iw','Expiration',blank?'':fmt(val('exp')))}
              </div>
              <div class="iw-checks one">
                ${check('iw','Medication matches provider order',false)}
                ${check('iw','Dose / route / site verified',false)}
                ${check('iw','Expiration checked before administration',false)}
                ${check('iw','Previous site / rotation checked if applicable',false)}
                ${check('iw','Allergies / safety concerns reviewed',false)}
                ${check('iw','Patient tolerated injection',false)}
              </div>
              <div class="iw-sign">Staff initials / date-time</div>
            </div>
            <div class="iw-section doc">
              <h2>Documentation <span>closeout</span></h2>
              <div class="iw-grid">
                ${line('iw','NDC / product code',blank?'':val('ndc'))}
                ${line('iw','Administered by',staff)}
              </div>
              <div class="iw-checks one">
                ${check('iw','Tebra administration note entered',false)}
                ${check('iw','AVS printed or offered',false)}
                ${check('iw','Next appointment reviewed / scheduled',false)}
                ${check('iw','Logged in assistant',false)}
                ${check('iw','Worksheet scanned / filed if needed',false)}
              </div>
              <div class="iw-quiet">This worksheet is internal. The patient-facing output remains the Injection AVS.</div>
            </div>
          </div>
        </div>
        <div class="iw-footer"><div><b>Reason:</b> ${safe(reason)||'________________'}</div><div><b>Reminder:</b> verify active Rx, medication label, site protocol, and provider order before administering.</div><div><b>Printed:</b> ${safe(date||'____________')}</div></div>
      </div>`;
  }

  window.renderSampleWorksheet=renderSampleWorksheet516;
  window.renderInjectionWorksheet=renderInjectionWorksheet516;
  function samplePrint(blank){renderSampleWorksheet516(!!blank); if(window.cleanPrintClasses) cleanPrintClasses(); document.body.classList.add('print-sample-worksheet'); window.print(); setTimeout(()=>{ if(window.cleanPrintClasses) cleanPrintClasses(); else document.body.classList.remove('print-sample-worksheet'); },500);}
  function injPrint(blank){renderInjectionWorksheet516(!!blank); if(window.cleanPrintClasses) cleanPrintClasses(); document.body.classList.add('print-inj-worksheet'); window.print(); setTimeout(()=>{ if(window.cleanPrintClasses) cleanPrintClasses(); else document.body.classList.remove('print-inj-worksheet'); },500);}
  function wire(){
    const pairs=[['sampleWorksheetPrint',()=>samplePrint(false)],['sampleWorksheetBlank',()=>samplePrint(true)],['injWorksheetPrint',()=>injPrint(false)],['injWorksheetBlank',()=>injPrint(true)]];
    pairs.forEach(([id,fn])=>{const el=get(id); if(!el||el.dataset.rc516) return; el.dataset.rc516='1'; el.addEventListener('click',ev=>{ev.preventDefault(); ev.stopImmediatePropagation(); fn();},true);});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire,{once:true}); else wire();
})();


/* ===================== RC5.17: Meticulous worksheet logic + click takeover ===================== */
(function(){
  if(window.__IPMG_WORKSHEET_RC517__) return;
  window.__IPMG_WORKSHEET_RC517__=true;
  const get=id=>document.getElementById(id);
  const clean=s=>String(s==null?'':s).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const val=id=>clean(get(id)?.value||'');
  const txt=id=>clean(get(id)?.textContent||'');
  const badPatterns=[
    /^[-_—–]+$/i,/^select( a)? /i,/not selected/i,/route not selected/i,/site not selected/i,/pick a /i,/compute the window/i,
    /^cc first line$/i,/^patient name$/i,/^not signed in$/i,/^medication-specific \/ as directed$/i,/^as directed$/i,/^im\s*\/\s*subq$/i
  ];
  function useful(s){s=clean(s); return !!s && !badPatterns.some(rx=>rx.test(s));}
  function first(...items){for(const it of items){let v=typeof it==='function'?it():it; v=clean(v); if(useful(v)) return v;} return '';}
  function fmt(raw){
    raw=clean(raw); if(!raw || !useful(raw)) return '';
    try{
      if(/^\d{4}-\d{2}$/.test(raw)){const [y,m]=raw.split('-'); return `${m}/${y}`;}
      if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){const [y,m,d]=raw.split('-'); return `${m}/${d}/${y}`;}
      if(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(raw)) return raw;
      if(window.fmtDate){const f=window.fmtDate(raw); if(useful(f)) return f;}
    }catch(e){}
    return raw;
  }
  const today=()=>localDateValue();
  function selectedChip(container){
    const root=get(container); if(!root) return '';
    const el=root.querySelector('.chip.on,.mini.on,.sample-intent-chip.on,button.on,[aria-pressed="true"]');
    return clean(el?.textContent||'');
  }
  function line(prefix,label,value,cls=''){
    const v=clean(value); return `<div class="${prefix}-field ${cls} ${useful(v)?'filled':'empty'}"><span class="k">${safe(label)}</span><span class="v">${useful(v)?safe(v):'&nbsp;'}</span></div>`;
  }
  function check(prefix,label,checked=false){return `<div class="${prefix}-check"><span class="${prefix}-box ${checked?'checked':''}">${checked?'✓':''}</span><span>${safe(label)}</span></div>`;}
  function humanizeToken(s){
    s=clean(s); if(!useful(s)) return '';
    const m={q2w:'Every 2 weeks',q3w:'Every 3 weeks',q4w:'Every 4 weeks',monthly:'Monthly',q8w:'Every 8 weeks',q12w:'Every 12 weeks',q6mo:'Every 6 months',new_start:'New start',dose_change:'Dose change'};
    return m[s] || s.replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }
  function staffFallback(){return first(val('sampleStaff'),val('admin'),val('staffSignIn'),txt('staffCurrent'),()=>{try{return typeof window.getStoredStaff==='function'?window.getStoredStaff():((window.SAFE_STORAGE&&SAFE_STORAGE.get('ipmgMedAssistStaff',''))||localStorage.getItem('ipmgMedAssistStaff')||'');}catch(e){return '';}});}
  function patientFallback(){return first(val('samplePtName'),val('ptName'),val('udsPtName'));}
  function dobFallback(){return first(val('sampleDOB'),val('ptDOB'),val('udsDOB'));}
  function providerFallback(){return first(val('samplePrescriber'),val('orderingProvider'));}

  function sampleDoseEntriesSafe(){try{return (typeof window.sampleDoseEntries==='function'?window.sampleDoseEntries():[]).filter(Boolean);}catch(e){return [];}}
  function sampleEngaged(){
    const ids=['samplePtName','sampleDOB','samplePrescriber','sampleStaff','sampleMedLabel','sampleQty','sampleLot','sampleExp','sampleStart','sampleSig','sampleTitration','sampleExtra','samplePurpose'];
    return ids.some(id=>useful(val(id))) || sampleDoseEntriesSafe().length>0 || useful(selectedChip('sampleMedChips')) || useful(selectedChip('sampleIntentChips'));
  }
  function sampleIntentSafe(blank){if(blank) return ''; return first(val('samplePurpose'), selectedChip('sampleIntentChips'), ()=>{try{return window.sampleIntentObj?window.sampleIntentObj().label:'';}catch(e){return '';}});}
  function sampleMedLabelSafe(blank){
    if(blank) return '';
    const entries=sampleDoseEntriesSafe();
    return first(val('sampleMedLabel'), selectedChip('sampleMedChips'), ()=>entries.map(e=>e.strength).filter(useful).join(' + '), ()=>sampleEngaged()&&window.sampleFriendlyMedication?window.sampleFriendlyMedication():'');
  }
  function sampleQtySafe(blank){
    if(blank) return '';
    const entries=sampleDoseEntriesSafe();
    return first(val('sampleQty'), txt('sampleQtyMeta'), selectedChip('samplePackageButtons'), val('samplePackageBox'), ()=>entries.map(e=>e.qty).filter(useful).join(' + '));
  }
  function sampleSigSafe(blank){
    if(blank) return '';
    return first(val('sampleSig'), ()=>sampleEngaged()&&window.sampleSigText?window.sampleSigText():'', ()=>sampleEngaged()&&window.sampleInstructionsBlock?window.sampleInstructionsBlock():'');
  }
  function samplePlanSafe(blank){
    if(blank) return '';
    const entries=sampleDoseEntriesSafe();
    const rows=entries.map((e,i)=>`Step ${i+1}: ${[e.strength,e.qty,e.days?`${e.days} day(s)`:'' ,e.sig].filter(useful).join(' - ')}`).filter(useful).join('\n');
    return first(val('sampleTitration'), rows);
  }
  function sampleFoodSafe(blank){if(blank) return ''; return first(()=>{const v=val('sampleFood'); return v && v!=='auto'?v:'';}, ()=>sampleEngaged()&&window.sampleFoodText?window.sampleFoodText():'');}
  function sampleCoverageSafe(blank){
    if(blank) return '';
    try{if(sampleEngaged()&&window.rc5PlanAnalysis){const a=window.rc5PlanAnalysis(); return first(a?.headline,a?.line,a?.detail);}}catch(e){}
    return '';
  }

  function renderSampleWorksheet517(blank=false){
    const sheet=get('sampleWorksheetSheet'); if(!sheet) return;
    const date=blank?'':first(()=>val('sampleDate')?fmt(val('sampleDate')):'',()=>fmt(today()));
    const purpose=sampleIntentSafe(blank);
    const purposeLC=purpose.toLowerCase();
    const med=sampleMedLabelSafe(blank), qty=sampleQtySafe(blank), sig=sampleSigSafe(blank), plan=samplePlanSafe(blank), food=sampleFoodSafe(blank);
    const start=blank?'':(val('sampleStart')?fmt(val('sampleStart')):'');
    const lot=blank?'':val('sampleLot'), exp=blank?'':fmt(val('sampleExp')), staff=blank?'':staffFallback();
    const bridge=/bridge|pharmacy|prior authorization|pa delay|fill/.test(purposeLC);
    const mode=blank?'Blank worksheet':'Prefilled worksheet';
    sheet.innerHTML=`
      <div class="sw-page ws-modern sw-sample">
        <div class="sw-head">
          <div><div class="sw-kicker">Inland Psychiatric Medical Group</div><h1 class="sw-title">Sample Dispensing Worksheet</h1><div class="sw-sub">Clinician-to-staff handoff. Provider writes the intended sample plan; staff verifies the actual package, quantity, lot, expiration, handout, Tebra note, and sample log.</div></div>
          <div class="sw-badge"><b>${safe(mode)}</b><span>Internal handoff</span></div>
        </div>
        <div class="sw-flow"><div><b>1. Provider intent</b>Medication, purpose, directions.</div><div><b>2. Staff verification</b>Package, lot, exp, quantity.</div><div><b>3. Closeout</b>Handout, Tebra note, log.</div></div>
        <div class="sw-section provider">
          <h2>Provider completes <span>sample intent</span></h2>
          <div class="sw-grid three">
            ${line('sw','Patient name',blank?'':patientFallback())}
            ${line('sw','Date of birth',blank?'':dobFallback())}
            ${line('sw','Date',date)}
            ${line('sw','Prescriber',blank?'':providerFallback())}
            ${line('sw','Medication / strength(s)',med)}
            ${line('sw','Quantity / package requested',qty)}
          </div>
          <div class="sw-checks">
            ${check('sw','Starter / titration sample',/titration|starter|start/.test(purposeLC))}
            ${check('sw','Bridge until pharmacy fill',bridge)}
            ${check('sw','Dose change / tolerability trial',/dose change|tolerability|trial/.test(purposeLC))}
            ${check('sw','Continuation / short supply',/continuation|short supply|continue/.test(purposeLC))}
          </div>
        </div>
        <div class="sw-section provider">
          <h2>Directions for patient <span>write clearly</span></h2>
          <div class="sw-directions">
            ${line('sw','Start date / when to begin',start)}
            ${line('sw','Directions / sig',sig,'tall')}
            ${line('sw','Titration / step plan',plan,'tall')}
            ${line('sw','Food timing / special instructions',food)}
          </div>
          <div class="sw-mini-note">If multiple strengths are given, specify the first strength, when to switch, and whether strengths should not be combined.</div>
        </div>
        <div class="sw-split">
          <div class="sw-section safety">
            <h2>Counseling / safety <span>provider initials if applicable</span></h2>
            <div class="sw-checks">
              ${check('sw','Patient understands which sample to take first',!!plan || /titration|starter|start/.test(purposeLC))}
              ${check('sw','Do not combine strengths unless directed',/step|then|titration|\+| and /i.test(plan||med))}
              ${check('sw','When to call clinic reviewed',false)}
              ${check('sw','Medication list / interaction concern reviewed',false)}
              ${check('sw','Prescription sent or pharmacy plan discussed',bridge)}
              ${check('sw','Follow-up scheduled or scheduling needed',false)}
            </div>
            <div class="sw-grid" style="margin-top:.08in">
              ${line('sw','Prescription sent / pharmacy plan',bridge?purpose:'')}
              ${line('sw','Follow-up plan','')}
            </div>
            <div class="sw-quiet">Staff should not guess titration, strength sequence, or bridge appropriateness. Clarify with provider if this section is incomplete.</div>
            <div class="sw-sign">Provider signature / initials</div>
          </div>
          <div class="sw-section staff">
            <h2>Staff completes <span>actual dispensing</span></h2>
            <div class="sw-grid three">
              ${line('sw','Actual package dispensed',qty)}
              ${line('sw','Lot #',lot)}
              ${line('sw','Expiration',exp)}
              ${line('sw','Quantity dispensed',qty)}
              ${line('sw','Dispensed by',staff)}
              ${line('sw','Coverage check',sampleCoverageSafe(blank))}
            </div>
            <div class="sw-checks">
              ${check('sw','Patient handout printed',false)}
              ${check('sw','Tebra note entered',false)}
              ${check('sw','Sample log completed',false)}
              ${check('sw','Worksheet scanned / filed if needed',false)}
            </div>
            <div class="sw-quiet">Verify the physical package before handing the sample to the patient. Use the app handout as the patient-facing instructions.</div>
            <div class="sw-sign">Staff initials / date-time</div>
          </div>
        </div>
        <div class="sw-footer"><div><b>Purpose:</b> ${safe(purpose)||'________________'}</div><div><b>Reminder:</b> internal handoff only; not a patient medication guide.</div><div><b>Printed:</b> ${safe(date||'____________')}</div></div>
      </div>`;
  }

  function injectionMedNameSafe(blank){if(blank) return ''; return first(()=>{try{return window.S&&S.med?(S.med.name||S.med.label||''):'';}catch(e){return '';}},txt('medHdrName'),selectedChip('medChips'));}
  function injectionDoseSafe(blank){if(blank) return ''; return first(()=>{try{return window.S&&S.dose||'';}catch(e){return '';}},selectedChip('doseChips'));}
  function injectionRouteSafe(blank){if(blank) return ''; return first(()=>{try{return window.S&&S.route||'';}catch(e){return '';}},selectedChip('routeChips'));}
  function injectionSiteSafe(blank){if(blank) return ''; return first(()=>{try{return window.S&&S.site||'';}catch(e){return '';}},selectedChip('siteChips'));}
  function injectionIntervalSafe(blank){if(blank) return ''; return first(()=>{try{const key=(window.S&&S.intervalKey)||''; const row=(window.INTERVALS||[]).find(i=>i.key===key); return row?row.label:humanizeToken(key);}catch(e){return '';}},selectedChip('intChips'));}
  function injectionReasonSafe(blank){if(blank) return ''; return first(()=>{try{const r=(window.S&&S.reason)||''; const found=(window.REASONS||[]).find(x=>x.key===r); return found?found.label:humanizeToken(r);}catch(e){return '';}},selectedChip('reasonChips'));}
  function injectionNextSafe(blank){if(blank) return ''; return first(()=>val('nextDate')?fmt(val('nextDate')):'',txt('retBig'),txt('retWin'));}
  function renderInjectionWorksheet517(blank=false){
    const sheet=get('injWorksheetSheet'); if(!sheet) return;
    const date=blank?'':first(()=>val('adminDate')?fmt(val('adminDate')):'',()=>fmt(today()));
    const reason=injectionReasonSafe(blank), reasonLC=reason.toLowerCase();
    const med=injectionMedNameSafe(blank), dose=injectionDoseSafe(blank), route=injectionRouteSafe(blank), site=injectionSiteSafe(blank), interval=injectionIntervalSafe(blank);
    const next=injectionNextSafe(blank), provider=blank?'':providerFallback(), staff=blank?'':staffFallback();
    const hasOrder=!!(med||dose||route||interval||reason||next);
    const special=first(val('injSpecial'), val('specialInstructions'), val('adminSpecial'), ()=>(reason && !/^scheduled$/i.test(reason)?reason:''));
    const mode=blank?'Blank worksheet':'Prefilled worksheet';
    const initiationWorksheet=blank?'':(typeof window.ipmgInitiationProtocolWorksheet==='function'?window.ipmgInitiationProtocolWorksheet():'');
    sheet.innerHTML=`
      <div class="iw-page ws-modern iw-injection">
        <div class="iw-head">
          <div><div class="iw-kicker">Inland Psychiatric Medical Group</div><h1 class="iw-title">Injection Start Worksheet</h1><div class="iw-sub">Clinician-to-staff handoff for first dose, restart, loading dose, dose change, late dose, or any injection needing extra verification before administration.</div></div>
          <div class="iw-badge"><b>${safe(mode)}</b><span>Internal handoff</span></div>
        </div>
        <div class="iw-flow"><div><b>1. Provider intent</b>Medication, dose, timing.</div><div><b>2. Staff verifies</b>Product, lot, route, site.</div><div><b>3. Document</b>Tebra note, AVS, log.</div></div>
        <div class="iw-meta">${line('iw','Patient name',blank?'':patientFallback())}${line('iw','DOB',blank?'':dobFallback())}${line('iw','Date',date)}${line('iw','Provider',provider)}</div>
        <div class="iw-main">
          <div>
            <div class="iw-section provider">
              <h2>Provider completes <span>injection intent</span></h2>
              <div class="iw-grid">${line('iw','Medication',med)}${line('iw','Dose',dose)}${line('iw','Route',route)}${line('iw','Frequency',interval)}</div>
              <div class="iw-checks one">${check('iw','First dose / new start',/first|new start|start/.test(reasonLC))}${check('iw','Loading dose / initiation sequence',/loading|initiation/.test(reasonLC))}${check('iw','Restart after missed dose',/restart|missed|late/.test(reasonLC))}${check('iw','Dose change',/dose change|change/.test(reasonLC))}${check('iw','Maintenance dose with special instruction',/maintenance|special/.test(reasonLC))}</div>
              <div class="iw-note">Use this worksheet when clear provider intent is needed. Routine maintenance doses may not need it unless something changed.</div>
              <div class="iw-sign">Provider signature / initials</div>
            </div>
            <div class="iw-section timing">
              <h2>Timing / instructions <span>provider review</span></h2>
              <div class="iw-grid">${line('iw','Give today?',hasOrder?'Yes / per provider order':'')}${line('iw','Next due / window',next || interval)}</div>
              ${line('iw','Special instructions',special,'tall')}
              <div class="iw-checks one">${check('iw','Dosing window reviewed if late/early',/late|missed|restart/.test(reasonLC)||!!next)}${check('iw','Oral overlap / loading instructions reviewed if applicable',/loading|initiation|overlap/.test(reasonLC))}${check('iw','Patient questions addressed before administration',false)}</div>
            </div>
          </div>
          <div>
            <div class="iw-section staff">
              <h2>Staff completes <span>verification</span></h2>
              <div class="iw-grid">${line('iw','Actual medication',med)}${line('iw','Actual dose',dose)}${line('iw','Route verified',route)}${line('iw','Injection site',site)}${line('iw','Lot #',blank?'':val('lot'))}${line('iw','Expiration',blank?'':fmt(val('exp')))}</div>
              <div class="iw-checks one">${check('iw','Medication matches provider order',false)}${check('iw','Dose / route / site verified',false)}${check('iw','Expiration checked before administration',false)}${check('iw','Previous site / rotation checked if applicable',false)}${check('iw','Allergies / safety concerns reviewed',false)}${check('iw','Patient tolerated injection',false)}</div>
              <div class="iw-sign">Staff initials / date-time</div>
            </div>
            <div class="iw-section doc">
              <h2>Documentation <span>closeout</span></h2>
              <div class="iw-grid">${line('iw','NDC / product code',blank?'':val('ndc'))}${line('iw','Administered by',staff)}</div>
              <div class="iw-checks one">${check('iw','Tebra administration note entered',false)}${check('iw','AVS printed or offered',false)}${check('iw','Next appointment reviewed / scheduled',false)}${check('iw','Logged in assistant',false)}${check('iw','Worksheet scanned / filed if needed',false)}</div>
              <div class="iw-quiet">This worksheet is internal. The patient-facing output remains the Injection AVS.</div>
            </div>
          </div>
        </div>
        ${initiationWorksheet}
        <div class="iw-footer"><div><b>Reason:</b> ${safe(reason)||'________________'}</div><div><b>Reminder:</b> verify active Rx, medication label, site protocol, and provider order before administering.</div><div><b>Printed:</b> ${safe(date||'____________')}</div></div>
      </div>`;
  }

  window.renderSampleWorksheet=renderSampleWorksheet517;
  window.renderInjectionWorksheet=renderInjectionWorksheet517;
  function cleanPrint(){ if(window.cleanPrintClasses) window.cleanPrintClasses(); document.body.classList.remove('print-avs','print-uds','print-uds-patient','print-sample','print-daily','print-letter','print-sample-worksheet','print-inj-worksheet'); }
  function samplePrint(blank){renderSampleWorksheet517(!!blank); cleanPrint(); document.body.classList.add('print-sample-worksheet'); window.print(); setTimeout(cleanPrint,500);}
  function injPrint(blank){renderInjectionWorksheet517(!!blank); cleanPrint(); document.body.classList.add('print-inj-worksheet'); window.print(); setTimeout(cleanPrint,500);}
  function takeover(id,handler){const old=get(id); if(!old || old.dataset.rc517) return; const fresh=old.cloneNode(true); fresh.dataset.rc517='1'; old.parentNode.replaceChild(fresh,old); fresh.addEventListener('click',ev=>{ev.preventDefault(); ev.stopPropagation(); handler();},true);}
  function wire(){takeover('sampleWorksheetPrint',()=>samplePrint(false)); takeover('sampleWorksheetBlank',()=>samplePrint(true)); takeover('injWorksheetPrint',()=>injPrint(false)); takeover('injWorksheetBlank',()=>injPrint(true));}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire,{once:true}); else wire();
})();



/* RC5.17b: post-render refinement - clears generic filler and adds intentional writing space. */
(function(){
  if(window.__IPMG_WORKSHEET_RC517B__) return;
  window.__IPMG_WORKSHEET_RC517B__=true;
  const prevSample=window.renderSampleWorksheet;
  const prevInj=window.renderInjectionWorksheet;
  function labelText(field){return (field?.querySelector('.k')?.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();}
  function valText(field){return (field?.querySelector('.v')?.textContent||'').replace(/\s+/g,' ').trim();}
  function clearIfGeneric(root){
    root.querySelectorAll('.sw-field,.iw-field').forEach(f=>{
      const label=labelText(f), v=valText(f);
      if(/titration \/ step plan/.test(label) && /^use the strength and duration selected by the prescriber/i.test(v)){
        const vv=f.querySelector('.v'); if(vv){vv.innerHTML='&nbsp;'; f.classList.remove('filled'); f.classList.add('empty');}
      }
      if(/special instructions/.test(label) && /^scheduled$/i.test(v)){
        const vv=f.querySelector('.v'); if(vv){vv.innerHTML='&nbsp;'; f.classList.remove('filled'); f.classList.add('empty');}
      }
      if(/next due \/ window/.test(label) && /pick a|compute the window/i.test(v)){
        const vv=f.querySelector('.v'); if(vv){vv.innerHTML='&nbsp;'; f.classList.remove('filled'); f.classList.add('empty');}
      }
    });
  }
  function field(prefix,label){return `<div class="${prefix}-field tall ${prefix}-extra-note empty"><span class="k">${label}</span><span class="v">&nbsp;</span></div>`;}
  function enhanceSample(){
    const root=document.getElementById('sampleWorksheetSheet'); if(!root) return; clearIfGeneric(root);
    const safety=root.querySelector('.sw-section.safety .sw-sign');
    if(safety && !root.querySelector('.sw-section.safety .sw-extra-note')) safety.insertAdjacentHTML('beforebegin', field('sw','Clarifications / provider notes'));
    const staff=root.querySelector('.sw-section.staff .sw-sign');
    if(staff && !root.querySelector('.sw-section.staff .sw-extra-note')) staff.insertAdjacentHTML('beforebegin', field('sw','Staff notes / follow-up needed'));
  }
  function enhanceInj(){
    const root=document.getElementById('injWorksheetSheet'); if(!root) return; clearIfGeneric(root);
    const docQuiet=root.querySelector('.iw-section.doc .iw-quiet');
    if(docQuiet && !root.querySelector('.iw-section.doc .iw-extra-note')) docQuiet.insertAdjacentHTML('beforebegin', field('iw','Staff notes / questions'));
  }
  window.renderSampleWorksheet=function(blank){ if(prevSample) prevSample(!!blank); enhanceSample(); };
  window.renderInjectionWorksheet=function(blank){ if(prevInj) prevInj(!!blank); enhanceInj(); };
  function clean(){ if(window.cleanPrintClasses) window.cleanPrintClasses(); document.body.classList.remove('print-avs','print-uds','print-uds-patient','print-sample','print-daily','print-letter','print-sample-worksheet','print-inj-worksheet'); }
  function takeover(id,handler){const old=document.getElementById(id); if(!old || old.dataset.rc517b) return; const fresh=old.cloneNode(true); fresh.dataset.rc517b='1'; old.parentNode.replaceChild(fresh,old); fresh.addEventListener('click',ev=>{ev.preventDefault(); ev.stopPropagation(); handler();},true);}
  function wire(){
    takeover('sampleWorksheetPrint',()=>{window.renderSampleWorksheet(false); clean(); document.body.classList.add('print-sample-worksheet'); window.print(); setTimeout(clean,500);});
    takeover('sampleWorksheetBlank',()=>{window.renderSampleWorksheet(true); clean(); document.body.classList.add('print-sample-worksheet'); window.print(); setTimeout(clean,500);});
    takeover('injWorksheetPrint',()=>{window.renderInjectionWorksheet(false); clean(); document.body.classList.add('print-inj-worksheet'); window.print(); setTimeout(clean,500);});
    takeover('injWorksheetBlank',()=>{window.renderInjectionWorksheet(true); clean(); document.body.classList.add('print-inj-worksheet'); window.print(); setTimeout(clean,500);});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire,{once:true}); else wire();
})();



/* RC5.17c: injection bottom notes zone. */
(function(){
  if(window.__IPMG_WORKSHEET_RC517C__) return;
  window.__IPMG_WORKSHEET_RC517C__=true;
  const prev=window.renderInjectionWorksheet;
  function addBottomNotes(){
    const root=document.getElementById('injWorksheetSheet'); if(!root) return;
    root.querySelectorAll('.iw-section.doc .iw-extra-note').forEach(n=>n.remove());
    const main=root.querySelector('.iw-main');
    if(main && !root.querySelector('.iw-bottom-notes')){
      main.insertAdjacentHTML('afterend', `<div class="iw-bottom-notes"><div class="iw-bottom-box"><div class="iw-field tall iw-extra-note empty"><span class="k">Provider clarifications / hold parameters</span><span class="v">&nbsp;</span></div></div><div class="iw-bottom-box"><div class="iw-field tall iw-extra-note empty"><span class="k">Staff notes / follow-up needed</span><span class="v">&nbsp;</span></div></div></div>`);
    }
  }
  window.renderInjectionWorksheet=function(blank){ if(prev) prev(!!blank); addBottomNotes(); };
  function clean(){ if(window.cleanPrintClasses) window.cleanPrintClasses(); document.body.classList.remove('print-avs','print-uds','print-uds-patient','print-sample','print-daily','print-letter','print-sample-worksheet','print-inj-worksheet'); }
  function takeover(id,handler){const old=document.getElementById(id); if(!old || old.dataset.rc517c) return; const fresh=old.cloneNode(true); fresh.dataset.rc517c='1'; old.parentNode.replaceChild(fresh,old); fresh.addEventListener('click',ev=>{ev.preventDefault(); ev.stopPropagation(); handler();},true);}
  function wire(){takeover('injWorksheetPrint',()=>{window.renderInjectionWorksheet(false); clean(); document.body.classList.add('print-inj-worksheet'); window.print(); setTimeout(clean,500);}); takeover('injWorksheetBlank',()=>{window.renderInjectionWorksheet(true); clean(); document.body.classList.add('print-inj-worksheet'); window.print(); setTimeout(clean,500);});}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire,{once:true}); else wire();
})();



/* ===================== RC5.19: rollback-safe fast checkboxes =====================
   Intentionally wraps RC5.17 renderers instead of replacing them.
   Keeps worksheet geometry stable and avoids the RC5.18 over-expansion. */
(function(){
  if(window.__IPMG_WORKSHEET_RC519__) return;
  window.__IPMG_WORKSHEET_RC519__=true;
  const prevSample=window.renderSampleWorksheet;
  const prevInj=window.renderInjectionWorksheet;
  const clean=s=>String(s==null?'':s).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const get=id=>document.getElementById(id);
  const val=id=>clean(get(id)?.value||'');
  const useful=s=>{s=clean(s); return !!s && !/^(select|not selected|pick a|compute|scheduled$|im\s*\/\s*subq$|as directed$)/i.test(s);};
  function fieldValue(root,label){
    const rx=new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
    for(const f of root.querySelectorAll('.sw-field,.iw-field')){
      const k=clean(f.querySelector('.k')?.textContent||'');
      if(rx.test(k)){const v=clean(f.querySelector('.v')?.textContent||''); return useful(v)?v:'';}
    }
    return '';
  }
  function todayMatch(s,offset=0){
    s=clean(s); if(!s) return false;
    const d=new Date(); d.setDate(d.getDate()+offset);
    const mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'), yyyy=d.getFullYear();
    return s===`${mm}/${dd}/${yyyy}` || s===`${yyyy}-${mm}-${dd}`;
  }
  function box(prefix,label,checked){return `<div class="${prefix}-check"><span class="${prefix}-box ${checked?'checked':''}">${checked?'✓':''}</span><span>${esc(label)}</span></div>`;}
  function band(prefix,title,items,cols='three',alert=false){return `<div class="ws-fastband ${alert?'ws-alertband':''}"><div class="ws-fasttitle">${esc(title)}</div><div class="ws-fastchecks ${cols}">${items.map(i=>box(prefix,i[0],!!i[1])).join('')}</div></div>`;}
  function removeOld(root){root.querySelectorAll('.ws-fastband').forEach(n=>n.remove());}

  function addSampleFastChecks(blank){
    const root=document.getElementById('sampleWorksheetSheet'); if(!root) return;
    removeOld(root);
    const purpose=clean(root.querySelector('.sw-footer')?.textContent||'')+' '+val('samplePurpose');
    const p=purpose.toLowerCase();
    const med=fieldValue(root,'Medication');
    const qty=fieldValue(root,'Quantity');
    const sig=fieldValue(root,'Directions');
    const plan=fieldValue(root,'Titration');
    const food=fieldValue(root,'Food');
    const start=fieldValue(root,'Start date')||val('sampleStart');
    const lot=fieldValue(root,'Lot');
    const exp=fieldValue(root,'Expiration');
    const engaged=!blank && [med,qty,sig,plan,food,start,lot,exp,purpose].some(useful);

    const intentSection=root.querySelector('.sw-section.provider');
    const intentChecks=intentSection?.querySelector('.sw-checks');
    if(intentSection && intentChecks && !intentSection.querySelector('.ws-fastband')){
      intentSection.classList.add('compact-after-add');
      intentChecks.insertAdjacentHTML('afterend', band('sw','Fast provider shortcuts',[
        ['Start today',todayMatch(start,0)],['Start tomorrow',todayMatch(start,1)],['Start date written',!!start && !todayMatch(start,0) && !todayMatch(start,1)],
        ['Rx sent / to send',/rx|prescription.*sent|send today/i.test(p)],['PA / pharmacy delay',/prior authorization|pa delay|delay/i.test(p)],['Bridge until fill',/bridge|pharmacy fill/i.test(p)],
        ['Clarify SIG',engaged&&!sig],['Clarify quantity',engaged&&!qty]
      ],'four'));
    }

    const dirSection=root.querySelector('.sw-directions')?.closest('.sw-section');
    const note=dirSection?.querySelector('.sw-mini-note');
    if(note && !dirSection.querySelector('.ws-fastband')){
      const text=(sig+' '+plan+' '+food).toLowerCase();
      note.insertAdjacentHTML('beforebegin', band('sw','Take-it instructions',[
        ['Morning',/morning|\bam\b/.test(text)],['Evening',/evening|\bpm\b/.test(text)],['Bedtime',/bedtime|qhs|night/.test(text)],
        ['With food',/with food/.test(text)&&!/with or without/.test(text)],['Without food',/without food/.test(text)&&!/with or without/.test(text)],['With or without food',/with or without|with\/without/.test(text)],
        ['Do not split/crush',/do not split|do not crush|whole/.test(text)],['Do not combine strengths',/do not combine|multiple strengths|\+| then /.test(text)]
      ],'four'));
    }

    const staff=root.querySelector('.sw-section.staff');
    const quiet=staff?.querySelector('.sw-quiet');
    if(quiet && !staff.querySelector('.ws-fastband')){
      staff.classList.add('compact-after-add');
      quiet.insertAdjacentHTML('beforebegin', band('sw','Final staff checks',[
        ['Package visually verified',false],['Med/strength matches intent',false],['Quantity matches intent',false],['Lot recorded',!!lot],['Expiration recorded',!!exp],['Patient handout printed',false],['Tebra note copied',false],['Sample log completed',false]
      ],'four'));
    }

    const safety=root.querySelector('.sw-section.safety .sw-sign');
    if(safety && !root.querySelector('.sw-section.safety .ws-alertband')){
      safety.insertAdjacentHTML('beforebegin', band('sw','Clarify before dispensing if',[
        ['unclear med/strength',engaged&&!med],['unclear quantity',engaged&&!qty],['unclear timing/SIG',engaged&&!sig],['patient question/concern',false]
      ],'two',true));
    }
  }

  function addInjFastChecks(blank){
    const root=document.getElementById('injWorksheetSheet'); if(!root) return;
    removeOld(root);
    const med=fieldValue(root,'Medication') || fieldValue(root,'Actual medication');
    const dose=fieldValue(root,'Dose') || fieldValue(root,'Actual dose');
    const route=fieldValue(root,'Route') || fieldValue(root,'Route verified');
    const site=fieldValue(root,'Injection site');
    const lot=fieldValue(root,'Lot');
    const exp=fieldValue(root,'Expiration');
    const reason=clean(root.querySelector('.iw-footer')?.textContent||'')+' '+val('injReason')+' '+val('reason');
    const all=(route+' '+site).toLowerCase();
    const engaged=!blank && [med,dose,route,site,lot,exp,reason].some(useful);

    const providerChecks=root.querySelector('.iw-section.provider .iw-checks');
    if(providerChecks && !root.querySelector('.iw-section.provider .ws-fastband')){
      providerChecks.insertAdjacentHTML('afterend', band('iw','Source / order shortcut',[
        ['Clinic stock',false],['Patient supplied',false],['Pharmacy shipped',false],['Refrigerated med',false],['Room temp if required',false],['Active Rx/order verified',false],['Clarify before giving',engaged&&(!med||!dose||!route)]
      ],'two',engaged&&(!med||!dose||!route)));
    }

    const staff=root.querySelector('.iw-section.staff');
    const staffGrid=staff?.querySelector('.iw-grid');
    if(staffGrid && !staff.querySelector('.ws-fastband')){
      staffGrid.insertAdjacentHTML('afterend', band('iw','Route / site picker',[
        ['IM',/\bim\b|intramuscular/i.test(route)],['SubQ',/subq|subcutaneous/i.test(route)],['Deltoid L',/left.*deltoid|l deltoid/.test(all)],['Deltoid R',/right.*deltoid|r deltoid/.test(all)],
        ['VG L',/left.*ventro|l ventro/.test(all)],['VG R',/right.*ventro|r ventro/.test(all)],['DG L',/left.*dorso|l dorso/.test(all)],['DG R',/right.*dorso|r dorso/.test(all)],
        ['Abd L',/left.*abdomen|l abdomen/.test(all)],['Abd R',/right.*abdomen|r abdomen/.test(all)],['Thigh L',/left.*thigh|l thigh/.test(all)],['Thigh R',/right.*thigh|r thigh/.test(all)],
        ['Site rotated',false],['Per med protocol',!!site]
      ],'four'));
    }

    const staffChecks=staff?.querySelector('.iw-checks.one');
    if(staffChecks && !staff.querySelector('.ws-alertband')){
      staffChecks.insertAdjacentHTML('afterend', band('iw','Safety quick checks',[
        ['Last injection date reviewed',false],['Dose window reviewed',/late|early|missed|restart/i.test(reason)],['Lot/exp checked before giving',!!lot&&!!exp],['Provider reviewed if late/restart/change',/late|restart|missed|change/i.test(reason)]
      ],'two'));
    }

    const doc=root.querySelector('.iw-section.doc');
    const quiet=doc?.querySelector('.iw-quiet');
    if(quiet && !doc.querySelector('.ws-fastband')){
      quiet.insertAdjacentHTML('beforebegin', band('iw','After giving / closeout',[
        ['Patient tolerated',false],['Bandage applied',false],['Side effects reviewed',false],['Next due date reviewed',false],['Next appt scheduled/offered',false],['Log completed',false]
      ],'three'));
    }
  }

  window.renderSampleWorksheet=function(blank){ if(prevSample) prevSample(!!blank); addSampleFastChecks(!!blank); };
  window.renderInjectionWorksheet=function(blank){ if(prevInj) prevInj(!!blank); addInjFastChecks(!!blank); };
  function cleanPrint(){ if(window.cleanPrintClasses) window.cleanPrintClasses(); document.body.classList.remove('print-avs','print-uds','print-uds-patient','print-sample','print-daily','print-letter','print-sample-worksheet','print-inj-worksheet'); }
  function takeover(id,handler){const old=document.getElementById(id); if(!old || old.dataset.rc519) return; const fresh=old.cloneNode(true); fresh.dataset.rc519='1'; old.parentNode.replaceChild(fresh,old); fresh.addEventListener('click',ev=>{ev.preventDefault(); ev.stopPropagation(); handler();},true);}
  function wire(){
    takeover('sampleWorksheetPrint',()=>{window.renderSampleWorksheet(false); cleanPrint(); document.body.classList.add('print-sample-worksheet'); window.print(); setTimeout(cleanPrint,500);});
    takeover('sampleWorksheetBlank',()=>{window.renderSampleWorksheet(true); cleanPrint(); document.body.classList.add('print-sample-worksheet'); window.print(); setTimeout(cleanPrint,500);});
    takeover('injWorksheetPrint',()=>{window.renderInjectionWorksheet(false); cleanPrint(); document.body.classList.add('print-inj-worksheet'); window.print(); setTimeout(cleanPrint,500);});
    takeover('injWorksheetBlank',()=>{window.renderInjectionWorksheet(true); cleanPrint(); document.body.classList.add('print-inj-worksheet'); window.print(); setTimeout(cleanPrint,500);});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire,{once:true}); else wire();
})();
/* </script> */

;

/* Legacy runtime block 2: <script> */
(function(){
  document.addEventListener('pointerup', function(evt){
    var card = evt.target && evt.target.closest ? evt.target.closest('.home-action') : null;
    if(card && typeof card.blur === 'function'){ setTimeout(function(){ card.blur(); }, 0); }
  }, true);
})();
/* </script> */

;

/* Legacy runtime block 3: <script> */
/* ===================== RC5.22: medication-aware injection response + admin pearls =====================
   Adds safer, medication-specific administration response support without rewriting the injection module. */
(function(){
  if(window.__IPMG_INJ_MED_RESPONSE_RC522__) return;
  window.__IPMG_INJ_MED_RESPONSE_RC522__=true;
  const byId=id=>document.getElementById(id);
  const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const medKey=()=>((window.S&&S.med&&S.med.key)||'').toLowerCase();
  const medName=()=>((window.S&&S.med&&(S.med.label||S.med.name))||'Selected medication');
  function addStyle(){
    if(byId('rc522InjMedResponseStyle')) return;
    const st=document.createElement('style'); st.id='rc522InjMedResponseStyle';
    st.textContent=`
      .inj-response-support{margin-top:10px;border:1px solid #E1E5EF;background:linear-gradient(180deg,#FFFFFF,#FBFCFF);border-radius:14px;padding:10px 11px;box-shadow:0 1px 2px rgba(28,34,53,.03)}
      .inj-response-support .irs-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#6B5CA5}
      .inj-response-support .irs-head span{margin-left:auto;color:#8C93A6;font-weight:800;letter-spacing:.04em}
      .inj-response-support ul{margin:0;padding-left:17px}.inj-response-support li{font-size:11.4px;line-height:1.35;margin:0 0 3px;color:#2B3346}.inj-response-support li:last-child{margin-bottom:0}
      .med-admin-pearls{margin-top:12px;border:1px solid #E2DBFF;background:#FBFAFF;border-radius:16px;padding:12px 13px;display:grid;gap:8px}
      .med-admin-pearls .map-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.med-admin-pearls .map-title{font-family:'Plus Jakarta Sans';font-size:12.5px;font-weight:900;color:#2B3346}.med-admin-pearls .map-pill{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#6B5CA5;border:1px solid #DDD7F4;background:#fff;border-radius:999px;padding:4px 8px;white-space:nowrap}
      .med-admin-pearls .map-note{font-size:11.5px;line-height:1.4;color:#556075}.med-admin-pearls ul{margin:0;padding-left:17px}.med-admin-pearls li{font-size:11.35px;line-height:1.35;margin:0 0 4px;color:#30384A}.med-admin-pearls li:last-child{margin-bottom:0}
      @media print{.inj-response-support,.med-admin-pearls{box-shadow:none;background:#fff!important;border-color:#999!important}}
    `;
    document.head.appendChild(st);
  }
  function guideFor(k){
    const general={
      title:'General injection response support', pill:'general',
      note:'Use these as quick documentation prompts. Provider order, active label/PI, and clinic protocol remain the source of truth.',
      ui:[
        'Confirm medication, dose, route, site, lot/expiration, and patient identifiers before administration.',
        'If dose delivery is uncertain, do not guess: document what happened and notify provider/supervisor before closing the encounter.',
        'Document patient response, site appearance, education, and next-dose plan.'
      ],
      noteLines:['General administration response: medication/order, route/site, lot/expiration, patient response, education, and next-dose plan reviewed/documented.'],
      needle:[]
    };
    const g={
      aristada:{title:'ARISTADA flow / suspension watch',pill:'flow watch',note:'ARISTADA is a suspension and can feel firm if it settles or if the injection is paused. The app now pushes the “tap, shake, prime, continuous injection” check into the response support.',ui:[
        'Tap syringe at least 10 times, then shake vigorously for at least 30 seconds before injecting; re-shake if it sits too long.',
        'Use the ordered site and needle. 441 mg may be deltoid or gluteal; higher maintenance doses are gluteal-only in this helper.',
        'Inject rapidly and continuously without hesitation. If flow becomes stuck/clogged or dose delivery is uncertain, document delivered/undelivered amount if known and notify provider/supervisor.'
      ],noteLines:['ARISTADA-specific technique reviewed: suspension tapped/shaken, appropriate needle/site selected, syringe primed, and medication administered rapidly/continuously without intentional pause.','If ARISTADA flow resistance/sticking/clogging occurs, document whether full dose was delivered, retain/identify product details when appropriate, and notify provider/supervisor.'],needle:['For ARISTADA: keep the injection motion continuous; hesitation can make administration harder because this is a suspension.','If resistance or a stuck plunger occurs, stop guessing about dose delivery and escalate per clinic/product protocol.']},
      initio:{title:'ARISTADA INITIO one-time dose watch',pill:'initiation',note:'INITIO is not interchangeable with maintenance ARISTADA and is used as a one-time initiation/re-initiation component.',ui:[
        'Tap/shake/prime per product directions and administer IM as ordered.',
        'Confirm same-day oral aripiprazole / maintenance ARISTADA plan before closing.',
        'If flow becomes stuck or dose delivery is uncertain, document and notify provider/supervisor.'
      ],noteLines:['ARISTADA INITIO-specific technique/plan reviewed: one-time initiation/re-initiation role, oral aripiprazole/maintenance plan, and IM administration requirements verified.'],needle:['Confirm INITIO vs maintenance ARISTADA before administration; they are not interchangeable.','If flow resistance occurs, document actual dose-delivery status and escalate.']},
      sustenna:{title:'Paliperidone monthly suspension watch',pill:'shake + site',note:'Paliperidone palmitate products are suspensions; homogeneous mixing and the ordered site/needle are the fast checks.',ui:['Shake vigorously per kit/label timing and inspect suspension before injection.','Use kit-provided needle/site guidance; initiation dosing is deltoid-focused when applicable.','Avoid documenting final interpretation of side effects; route concerns to provider.'],noteLines:['Paliperidone LAI technique reviewed: suspension mixed per product directions, ordered route/site verified, and patient response documented.'],needle:['For paliperidone LAIs: mixing/needle selection and site restrictions matter; follow the active package instructions.']},
      erzofri:{title:'Erzofri suspension watch',pill:'monthly',note:'Monthly paliperidone helper: verify start dose/site plan and shake/inspect before injection.',ui:['Shake per product directions until uniform and visually inspect.','Initial/start dosing and renal/CYP considerations should be provider-reviewed when relevant.','Document route/site and patient response before closeout.'],noteLines:['Erzofri technique reviewed: monthly paliperidone suspension mixed/inspected, route/site verified, and response documented.'],needle:['For Erzofri: follow product-specific shake/site/needle instructions and provider start-dose plan.']},
      trinza:{title:'Invega Trinza longer-interval check',pill:'q3 mo',note:'Longer-interval paliperidone: confirm prerequisite stabilization and next-dose window.',ui:['Verify patient was transitioned appropriately from monthly paliperidone before administration.','Shake/inspect suspension and use deltoid/gluteal guidance per product instructions.','Next-dose window matters; document late/early provider review when applicable.'],noteLines:['Invega Trinza-specific checks reviewed: prerequisite stabilization, suspension preparation, route/site, and next-dose window documented.'],needle:['For Trinza: longer interval means late-dose handling should be verified before administration.']},
      hafyera:{title:'Invega Hafyera gluteal-only check',pill:'q6 mo',note:'Six-month paliperidone: gluteal-only in this helper and high importance on prerequisite therapy / late-dose handling.',ui:['Verify prerequisite Sustenna/Trinza treatment before administration.','Gluteal IM only in this helper; use product needle guidance.','Document next-dose window clearly because the interval is long.'],noteLines:['Invega Hafyera-specific checks reviewed: prerequisite LAI therapy, gluteal-only administration, suspension preparation, and next-dose window documented.'],needle:['For Hafyera: gluteal-only guidance and missed-dose handling should be verified before giving.']},
      maintena:{title:'Abilify Maintena oral-overlap check',pill:'aripiprazole',note:'Monthly aripiprazole LAI: confirm initiation/overlap plan when starting or restarting.',ui:['Confirm oral aripiprazole tolerability/overlap plan when initiating or restarting.','Verify deltoid vs gluteal site and preparation method for the product form used.','Document patient response and next monthly plan.'],noteLines:['Abilify Maintena-specific checks reviewed: aripiprazole tolerability/overlap plan when applicable, preparation method, route/site, and response documented.'],needle:['For Maintena: initiation/restart often needs oral overlap verification.']},
      asimtufii:{title:'Abilify Asimtufii gluteal-only check',pill:'q2 mo',note:'Two-month aripiprazole LAI: gluteal-only in this helper and no more often than ordered interval.',ui:['Confirm gluteal IM site and correct dose interval before administration.','Verify oral tolerability/transition plan when applicable.','Do not massage site unless directed by product/clinic guidance.'],noteLines:['Abilify Asimtufii-specific checks reviewed: gluteal-only route/site, interval timing, transition/overlap plan when applicable, and response documented.'],needle:['For Asimtufii: gluteal-only site and interval timing are key checks.']},
      uzedy:{title:'Uzedy SubQ site-response check',pill:'subq',note:'Subcutaneous risperidone: focus on site rotation, no rubbing/massage, and local reaction monitoring.',ui:['Verify SubQ route and selected abdomen/upper arm site per order/product guidance.','Rotate sites and avoid rubbing/massaging unless directed.','Document local site response and patient education.'],noteLines:['Uzedy-specific checks reviewed: SubQ route/site, site rotation, local reaction monitoring, and response documented.'],needle:['For Uzedy: SubQ placement and site rotation are the main documentation checks.']},
      vivitrol:{title:'Vivitrol opioid-safety + gluteal check',pill:'safety',note:'Vivitrol requires extra opioid-use/withdrawal screening and gluteal administration.',ui:['Confirm opioid-free status / withdrawal-risk screening per provider protocol before giving.','Use supplied kit/needle and gluteal site as ordered; alternate sides when appropriate.','Document pain-treatment counseling and emergency opioid-blockade context when applicable.'],noteLines:['Vivitrol-specific checks reviewed: opioid-use/withdrawal-risk screening, gluteal kit administration, side rotation when applicable, and response documented.'],needle:['For Vivitrol: opioid-free screening and gluteal administration are hard stops.']},
      haldol:{title:'Oil-based decanoate response check',pill:'deep IM',note:'Oil-based typical antipsychotic decanoates can feel slower to inject; deep IM/Z-track documentation helps.',ui:['Verify deep IM site and Z-track/office technique when ordered.','Inject steadily and document any unusual resistance, pain, or site reaction.','Monitor/report EPS, stiffness, restlessness, or severe sedation concerns.'],noteLines:['Haldol decanoate-specific checks reviewed: deep IM/Z-track technique when applicable, site response, EPS education, and response documented.'],needle:['For oil-based decanoates: slow steady administration and deep IM technique may be relevant.']},
      prolixin:{title:'Oil-based decanoate response check',pill:'deep IM',note:'Oil-based typical antipsychotic decanoates can feel slower to inject; document site/response clearly.',ui:['Verify ordered IM/deep SubQ route and gluteal site plan.','Inject steadily and document any unusual resistance, pain, or site reaction.','Monitor/report EPS, stiffness, restlessness, or severe sedation concerns.'],noteLines:['Prolixin decanoate-specific checks reviewed: ordered route/site, site response, EPS education, and response documented.'],needle:['For oil-based decanoates: route/site clarity and site response documentation matter.']}
    };
    return Object.assign({}, general, g[k]||{});
  }
  function responseExtras(){
    if(!Array.isArray(window.RESP)) return;
    const extras=[
      {k:'flowres', l:'Slow/firm flow, completed', s:'slow or firm medication flow noted during administration; injection completed and patient monitored without immediate adverse reaction'},
      {k:'devicehold', l:'Device/flow concern — provider notified', s:'medication flow/device concern occurred; administration details documented and provider/supervisor notified'},
      {k:'obsok', l:'Observed, no acute reaction', s:'post-injection observation completed without acute adverse reaction'}
    ];
    extras.forEach(item=>{
      if(RESP.some(r=>r.k===item.k)) return;
      const idx=RESP.findIndex(r=>r.k==='custom');
      if(idx>=0) RESP.splice(idx,0,item); else RESP.push(item);
    });
  }
  function selectedResponseIssueLine(){
    const k=(window.S&&S.resp)||'';
    if(k==='flowres') return 'Administration response: slow/firm plunger or medication flow noted; injection completed and patient monitored without immediate adverse reaction.';
    if(k==='devicehold') return 'Administration response: medication flow/device concern documented; provider/supervisor notified and dose-delivery details should be confirmed before final closeout.';
    if(k==='obsok') return 'Administration response: post-injection observation completed without acute adverse reaction.';
    return '';
  }
  function copyLines(){
    const k=medKey(); const g=guideFor(k); const lines=[];
    const resp=selectedResponseIssueLine(); if(resp) lines.push(resp);
    if(k && k!=='other') lines.push((g.noteLines||[])[0]);
    if((k==='aristada'||k==='initio') && (window.S&&['flowres','devicehold'].includes(S.resp))) lines.push((g.noteLines||[])[1]);
    return lines.filter(Boolean);
  }
  function uiLines(){
    const g=guideFor(medKey());
    let items=(g.ui||[]).slice(0,3);
    const resp=selectedResponseIssueLine();
    if(resp) items.unshift(resp.replace(/^Administration response:\s*/i,''));
    return items.filter(Boolean).slice(0,4);
  }
  function appendOutputSupport(){
    const out=byId('outPL'); if(!out) return;
    out.querySelectorAll('.inj-response-support').forEach(n=>n.remove());
    if(!(window.S&&S.med)) return;
    const g=guideFor(medKey());
    const items=uiLines();
    if(!items.length) return;
    out.insertAdjacentHTML('beforeend', `<div class="inj-response-support"><div class="irs-head">Injection response support <span>${safe(g.pill||'guide')}</span></div><ul>${items.map(x=>`<li>${safe(x)}</li>`).join('')}</ul></div>`);
    if(window._note){
      const extra=copyLines();
      if(extra.length){
        const existing=String(window._note.pl||'');
        const add=extra.filter(line=>!existing.includes(line)).join('\n');
        if(add) window._note.pl=[existing,add].filter(Boolean).join('\n');
      }
    }
  }
  function renderPearlsPanel(){
    const detail=byId('adminGuideDetail')||byId('adminGuide'); if(!detail) return;
    let box=byId('medAdminPearls');
    if(!box){ box=document.createElement('div'); box.id='medAdminPearls'; box.className='med-admin-pearls'; detail.appendChild(box); }
    const g=guideFor(medKey());
    const title=(window.S&&S.med)?g.title:'Medication-specific response guide';
    const ui=(g.ui||[]).slice(0,4);
    box.innerHTML=`<div class="map-head"><div class="map-title">${safe(title)}</div><div class="map-pill">${safe(g.pill||'guide')}</div></div><div class="map-note">${safe(g.note||'Select a medication to personalize response and administration prompts.')}</div><ul>${ui.map(x=>`<li>${safe(x)}</li>`).join('')}</ul>`;
  }
  addStyle();
  responseExtras();
  const prevSnapshot=window.responseSnapshot;
  window.responseSnapshot=function(){
    if(window.S){
      if(S.resp==='flowres') return 'slow/firm flow noted, completed and monitored';
      if(S.resp==='devicehold') return 'device/flow concern documented, provider notified';
      if(S.resp==='obsok') return 'observed with no acute reaction';
    }
    return typeof prevSnapshot==='function'?prevSnapshot():'tolerated well';
  };
  const prevNeedle=window.needleGuideData;
  if(typeof prevNeedle==='function'){
    window.needleGuideData=function(){
      const d=prevNeedle.apply(this,arguments)||{};
      const g=guideFor(medKey());
      const add=(g.needle||[]).filter(Boolean);
      if(add.length){
        d.bullets=(d.bullets||[]).concat(add);
        d.metas=(d.metas||[]).concat(g.pill?[g.pill]:[]);
      }
      return d;
    };
  }
  const prevAdminGuide=window.renderAdminGuide;
  if(typeof prevAdminGuide==='function'){
    window.renderAdminGuide=function(){ const r=prevAdminGuide.apply(this,arguments); renderPearlsPanel(); return r; };
  }
  const prevRender=window.render;
  if(typeof prevRender==='function'){
    window.render=function(){ responseExtras(); const r=prevRender.apply(this,arguments); appendOutputSupport(); renderPearlsPanel(); return r; };
  }
  function boot(){ responseExtras(); try{ if(typeof window.renderResp==='function') window.renderResp(); }catch(e){} try{ if(typeof window.render==='function') window.render(); }catch(e){} }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  window.IPMG_RC_VERSION='RC5.23 Injection Response Visible';
})();
/* </script> */

;

/* Legacy runtime block 4: <script> */
/* ===================== RC5.23: make injection response support visible =====================
   RC5.22 added the logic, but it used window.RESP/window.S. Those are top-level const bindings,
   so the chips/panel did not appear. This patch mutates the actual RESP/S bindings and places
   the guidance directly inside section 6 where staff expects to see it. */
(function(){
  function ready(fn){ if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true}); else fn(); }
  function el(id){ return document.getElementById(id); }
  function hasGlobal(name){ try{ return typeof eval(name)!=='undefined'; }catch(e){ return false; } }
  function getMedKey(){ try{ return (typeof S!=='undefined' && S.med && S.med.key) ? String(S.med.key).toLowerCase() : ''; }catch(e){ return ''; } }
  function getMedLabel(){ try{ return (typeof S!=='undefined' && S.med && (S.med.label||S.med.name)) ? (S.med.label||S.med.name) : ''; }catch(e){ return ''; } }
  function esc(x){ return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  function addStyle(){
    if(el('rc523-response-style')) return;
    const css=`
      .inj-response-inline{margin:12px 0 14px;border:1px solid var(--lav-line,#DCD8F0);background:linear-gradient(180deg,#FBFAFE,#fff);border-radius:14px;padding:12px 13px;box-shadow:0 1px 2px rgba(28,34,53,.03)}
      .inj-response-inline .ir-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
      .inj-response-inline .ir-title{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12.5px;font-weight:800;color:var(--ink,#1C2235);letter-spacing:-.01em;line-height:1.2}
      .inj-response-inline .ir-sub{font-size:11.2px;color:var(--ink-soft,#5A6276);font-weight:600;margin-top:2px;line-height:1.35}
      .inj-response-inline .ir-pill{font-size:9.8px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--lav,#6B5CA5);background:var(--lav-soft,#ECEAF7);border:1px solid var(--lav-line,#DCD8F0);border-radius:999px;padding:4px 8px;white-space:nowrap}
      .inj-response-inline .ir-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}
      .inj-response-inline .ir-box{border:1px solid var(--border,#E6E8F0);background:#fff;border-radius:11px;padding:9px 10px;min-height:70px}
      .inj-response-inline .ir-box b{display:block;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--lav,#6B5CA5);margin-bottom:5px}
      .inj-response-inline ul{margin:0;padding-left:15px}
      .inj-response-inline li{font-size:11.4px;line-height:1.35;color:var(--ink,#1C2235);margin:2px 0}
      .inj-response-inline .ir-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
      .inj-response-inline .ir-mini{border:1px solid var(--border-strong,#D2D6E3);background:#fff;color:var(--ink-soft,#5A6276);border-radius:999px;padding:6px 9px;font-size:10.7px;font-weight:800;cursor:pointer;line-height:1}
      .inj-response-inline .ir-mini:hover{border-color:var(--lav,#6B5CA5);color:var(--lav,#6B5CA5)}
      .inj-response-inline .ir-mini.on{background:var(--lav,#6B5CA5);border-color:var(--lav,#6B5CA5);color:#fff}
      .inj-response-support{margin-top:9px;border:1px solid var(--lav-line,#DCD8F0);background:#FBFAFE;border-radius:12px;padding:9px 10px}
      .inj-response-support .irs-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:800;color:var(--lav,#6B5CA5);margin-bottom:5px}
      .inj-response-support .irs-head span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;border:1px solid var(--lav-line,#DCD8F0);border-radius:999px;padding:2px 6px;background:#fff;color:var(--ink-soft,#5A6276)}
      .inj-response-support ul{margin:0;padding-left:16px}.inj-response-support li{font-size:11.2px;line-height:1.35;margin:2px 0;color:var(--ink,#1C2235)}
      @media(max-width:720px){.inj-response-inline .ir-grid{grid-template-columns:1fr}}
    `;
    const st=document.createElement('style'); st.id='rc523-response-style'; st.textContent=css; document.head.appendChild(st);
  }

  const GUIDES={
    general:{title:'General injection response support',pill:'general',sub:'Quick prompts for the response note, staff closeout, and provider escalation.',
      general:['Document tolerance/site response before closing.','Verify route/site, lot/expiration, and dose-delivery status.','Review education and next appointment/AVS.'],
      med:['Select a medication to show specific administration reminders.'],
      note:['General administration response reviewed: patient tolerance/site response, dose delivery, education, and next-dose plan documented.']},
    aristada:{title:'ARISTADA flow / suspension watch',pill:'flow watch',sub:'For the real-world firm plunger, slow flow, clogged/stuck concern.',
      med:['Tap/shake as directed so suspension is uniform before administration.','Prime/select site/needle per product and dose; 441 mg may differ from higher doses.','Give as a rapid, continuous injection; avoid pausing/hesitating once started.','If flow is stuck or dose delivery is uncertain, document exactly what happened and notify provider/supervisor.'],
      note:['ARISTADA administration watch: suspension preparation, site/needle selection, and rapid continuous administration reviewed.','If ARISTADA flow resistance/sticking/clogging occurred, dose-delivery status was documented and provider/supervisor notified if uncertain.']},
    initio:{title:'ARISTADA INITIO one-time initiation watch',pill:'initiation',sub:'Confirm INITIO is not treated as maintenance ARISTADA.',
      med:['Confirm Initio vs maintenance Aristada before administration.','Confirm same-day oral aripiprazole / maintenance plan when applicable.','If flow resistance occurs, document dose-delivery status and escalate.'],
      note:['ARISTADA INITIO-specific checks reviewed: one-time initiation/re-initiation role, oral/maintenance plan, and dose delivery documented.']},
    sustenna:{title:'Paliperidone monthly suspension watch',pill:'shake + site',sub:'Mixing, site, and needle are the fast checks.',med:['Shake/mix per kit until uniform and inspect before injecting.','Use product needle/site guidance; initiation may require deltoid dosing.','Document patient response and next monthly plan.'],note:['Paliperidone LAI technique reviewed: suspension mixed/inspected, ordered route/site verified, and patient response documented.']},
    erzofri:{title:'Erzofri suspension watch',pill:'monthly',sub:'Monthly paliperidone helper.',med:['Shake per product directions until uniform and inspect.','Verify start dose/site plan and renal/CYP considerations when provider-relevant.','Document route/site and patient response.'],note:['Erzofri checks reviewed: suspension mixed/inspected, route/site verified, and response documented.']},
    trinza:{title:'Invega Trinza extended-interval check',pill:'q3 mo',sub:'Long interval makes window and prerequisite verification important.',med:['Verify prerequisite Sustenna stability before administration.','Shake/prepare per product and verify deltoid vs gluteal site.','Document next-dose window clearly.'],note:['Invega Trinza checks reviewed: prerequisite therapy, suspension preparation, route/site, and next-dose window documented.']},
    hafyera:{title:'Invega Hafyera gluteal-only check',pill:'q6 mo',sub:'High importance on prerequisites and missed-dose handling.',med:['Verify prerequisite therapy before administration.','Gluteal IM only in this helper; follow product needle guidance.','Document long next-dose window clearly.'],note:['Invega Hafyera checks reviewed: prerequisite therapy, gluteal-only administration, suspension preparation, and next-dose window documented.']},
    maintena:{title:'Abilify Maintena oral-overlap check',pill:'aripiprazole',sub:'Monthly aripiprazole LAI.',med:['Confirm oral tolerability/overlap plan when initiating or restarting.','Verify deltoid vs gluteal site and preparation method.','Document patient response and next monthly plan.'],note:['Abilify Maintena checks reviewed: oral overlap/tolerability when applicable, preparation method, route/site, and response documented.']},
    asimtufii:{title:'Abilify Asimtufii gluteal-only check',pill:'q2 mo',sub:'Two-month aripiprazole LAI.',med:['Confirm gluteal IM site and correct interval.','Verify transition/overlap plan when applicable.','Do not massage site unless directed by product/clinic guidance.'],note:['Abilify Asimtufii checks reviewed: gluteal-only route/site, interval timing, transition/overlap plan, and response documented.']},
    uzedy:{title:'Uzedy SubQ site-response check',pill:'subq',sub:'Subcutaneous risperidone.',med:['Verify SubQ route and abdomen/upper-arm site per order/product guidance.','Rotate sites and avoid rubbing/massaging unless directed.','Document local site response and patient education.'],note:['Uzedy checks reviewed: SubQ route/site, site rotation, local reaction monitoring, and response documented.']},
    vivitrol:{title:'Vivitrol opioid-safety + gluteal check',pill:'safety',sub:'Extra opioid-use/withdrawal screening.',med:['Confirm opioid-free status/withdrawal-risk screening per provider protocol.','Use supplied kit/needle and gluteal site as ordered.','Document pain-treatment counseling/emergency opioid-blockade context when applicable.'],note:['Vivitrol checks reviewed: opioid-use/withdrawal-risk screening, gluteal kit administration, side rotation when applicable, and response documented.']},
    haldol:{title:'Oil-based decanoate response check',pill:'deep IM',sub:'Typical antipsychotic decanoates can feel slower to inject.',med:['Verify deep IM site and office/Z-track technique when ordered.','Inject steadily and document unusual resistance, pain, or site reaction.','Monitor/report EPS, stiffness, restlessness, or severe sedation concerns.'],note:['Haldol decanoate checks reviewed: deep IM/Z-track technique when applicable, site response, EPS education, and response documented.']},
    prolixin:{title:'Oil-based decanoate response check',pill:'deep IM',sub:'Typical antipsychotic decanoate helper.',med:['Verify ordered route/site plan.','Inject steadily and document unusual resistance, pain, or site reaction.','Monitor/report EPS, stiffness, restlessness, or severe sedation concerns.'],note:['Prolixin decanoate checks reviewed: ordered route/site, site response, EPS education, and response documented.']}
  };
  function guide(){ const k=getMedKey(); return Object.assign({},GUIDES.general,GUIDES[k]||{}); }
  const EXTRA_RESP=[
    {k:'flowres', l:'Slow/firm flow, completed', s:'slow or firm medication flow noted during administration; injection completed and patient monitored without immediate adverse reaction'},
    {k:'devicehold', l:'Device/flow concern — provider notified', s:'medication flow/device concern occurred; administration details documented and provider/supervisor notified'},
    {k:'obsok', l:'Observed, no acute reaction', s:'post-injection observation completed without acute adverse reaction'}
  ];
  function ensureResponseChips(){
    try{
      if(typeof RESP==='undefined' || !Array.isArray(RESP)) return;
      EXTRA_RESP.forEach(item=>{ if(!RESP.some(r=>r.k===item.k)){ const i=RESP.findIndex(r=>r.k==='custom'); if(i>=0)RESP.splice(i,0,item); else RESP.push(item); } });
    }catch(e){}
  }
  function selectedResponseLine(){
    let resp=''; try{ resp=(typeof S!=='undefined' && S.resp)||''; }catch(e){}
    if(resp==='flowres') return 'Slow/firm medication flow noted; injection completed and patient monitored without immediate adverse reaction.';
    if(resp==='devicehold') return 'Medication flow/device concern documented; provider/supervisor notified and dose-delivery details should be confirmed before final closeout.';
    if(resp==='obsok') return 'Post-injection observation completed without acute adverse reaction.';
    return '';
  }
  function ensureInlinePanel(){
    const chips=el('respChips'); if(!chips) return null;
    let panel=el('injResponseInline');
    if(!panel){
      panel=document.createElement('div'); panel.id='injResponseInline'; panel.className='inj-response-inline';
      const wrap=chips.closest('.grp'); (wrap&&wrap.parentNode?wrap.parentNode:chips.parentNode).insertBefore(panel, wrap?wrap.nextSibling:chips.nextSibling);
    }
    return panel;
  }
  function setResp(k){
    try{ if(typeof S!=='undefined'){ S.resp=k; const w=el('respCustomWrap'); if(w)w.classList.toggle('hidden',k!=='custom'); } }catch(e){}
    try{ if(typeof renderResp==='function') renderResp(); }catch(e){}
    try{ if(typeof render==='function') render(); }catch(e){}
  }
  function renderInlinePanel(){
    const panel=ensureInlinePanel(); if(!panel) return;
    const g=guide(), med=getMedLabel(), selected=selectedResponseLine();
    const medItems=(g.med||GUIDES.general.med||[]).slice(0,4);
    const gen=(GUIDES.general.general||[]).slice(0,3);
    let resp=''; try{ resp=(typeof S!=='undefined'&&S.resp)||''; }catch(e){}
    panel.innerHTML=`
      <div class="ir-top">
        <div><div class="ir-title">${esc(g.title)}</div><div class="ir-sub">${esc(med?g.sub:'General support visible here; select a medication to personalize it.')}</div></div>
        <div class="ir-pill">${esc(g.pill||'guide')}</div>
      </div>
      <div class="ir-grid">
        <div class="ir-box"><b>General response</b><ul>${gen.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="ir-box"><b>${esc(med?med:'Medication-specific')}</b><ul>${medItems.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
      </div>
      <div class="ir-actions">
        ${EXTRA_RESP.map(r=>`<button type="button" class="ir-mini ${resp===r.k?'on':''}" data-inj-resp="${esc(r.k)}">${esc(r.l)}</button>`).join('')}
      </div>
      ${selected?`<div class="ir-sub" style="margin-top:8px"><b>Note phrase:</b> ${esc(selected)}</div>`:''}
    `;
    panel.querySelectorAll('[data-inj-resp]').forEach(btn=>btn.addEventListener('click',()=>setResp(btn.getAttribute('data-inj-resp'))));
  }
  function appendOutputSupport(){
    const out=el('outPL'); if(!out) return;
    out.querySelectorAll('.inj-response-support').forEach(n=>n.remove());
    const g=guide(), med=getMedLabel();
    const list=[]; const r=selectedResponseLine(); if(r)list.push(r);
    (med?g.med:GUIDES.general.general).slice(0,3).forEach(x=>list.push(x));
    if(!list.length) return;
    out.insertAdjacentHTML('beforeend',`<div class="inj-response-support"><div class="irs-head">Injection response support <span>${esc(g.pill||'guide')}</span></div><ul>${list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`);
    try{
      if(typeof _note!=='undefined' && _note){
        const add=[selectedResponseLine()].concat((g.note||[]).slice(0,2)).filter(Boolean).join('\n');
        if(add && !String(_note.pl||'').includes(add.split('\n')[0])) _note.pl=[_note.pl||'',add].filter(Boolean).join('\n');
      }
    }catch(e){}
  }
  function renderAll(){ ensureResponseChips(); renderInlinePanel(); appendOutputSupport(); }

  const oldRender=typeof render==='function'?render:null;
  if(oldRender){
    render=function(){ const r=oldRender.apply(this,arguments); renderAll(); return r; };
  }
  const oldResp=typeof renderResp==='function'?renderResp:null;
  if(oldResp){
    renderResp=function(){ ensureResponseChips(); const r=oldResp.apply(this,arguments); renderInlinePanel(); return r; };
  }
  ready(function(){ addStyle(); ensureResponseChips(); try{ if(typeof renderResp==='function')renderResp(); }catch(e){} try{ if(typeof render==='function')render(); }catch(e){} renderAll(); });
  try{ window.IPMG_RC_VERSION='RC5.23 Injection Response Visible'; }catch(e){}
})();
/* </script> */

;

/* Legacy runtime block 5: <script id="rc524VitalsLogicScript"> */
/* ===================== RC5.24: literature-supported medication vitals logic =====================
   Goal: vitals appear as an automatic medication/symptom rule, not a staff memory task.
   This patch is UI guidance only and does not replace clinic policy or provider judgment. */
(function(){
  const byId=id=>document.getElementById(id);
  const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const medKey=()=>{try{return (S&&S.med&&S.med.key)||'';}catch(e){return '';}};
  const medLabel=()=>{try{return (S&&S.med&&(S.med.label||S.med.name))||'';}catch(e){return '';}};
  const currentReason=()=>{try{return (S&&S.reason)||'scheduled';}catch(e){return 'scheduled';}};
  const selectedGuards=()=>{try{return Object.keys(S.guard||{}).filter(k=>S.guard[k]);}catch(e){return [];}};
  const enteredVitals=()=>({bp:!!(byId('bp')&&byId('bp').value.trim()),hr:!!(byId('hr')&&byId('hr').value.trim()),temp:!!(byId('temp')&&byId('temp').value.trim())});
  const hasAnyVitals=()=>{const v=enteredVitals();return v.bp||v.hr||v.temp;};
  const hasBpHr=()=>{const v=enteredVitals();return v.bp&&v.hr;};

  const LIT_TRIGGERS=[
    {id:'cvRisk',t:'CV/CVA or BP-risk history',level:'warn',s:'Cardiovascular/cerebrovascular disease or hypotension risk identified; BP/HR or orthostatic vital signs recommended by medication safety guidance.'},
    {id:'dehydration',t:'Dehydration / poor intake / volume risk',level:'warn',s:'Dehydration, poor intake, hypovolemia, or syncope risk identified; BP/HR or orthostatic vital signs recommended before administration.'},
    {id:'antihyp',t:'Antihypertensive / low-BP risk',level:'warn',s:'Antihypertensive use or low-BP risk identified; BP/HR or orthostatic vital signs recommended before administration.'},
    {id:'frail',t:'Elderly / frail / unstable gait',level:'warn',s:'Elderly, frail, or unstable-gait risk identified; BP/HR or orthostatic vital signs recommended before administration.'},
    {id:'doseChange',t:'Dose change / unusual order',level:'warn',s:'Dose change or unusual injection order identified; vitals recommended if medication safety guidance or symptoms support monitoring.'}
  ];
  function addLitTriggers(){
    try{
      if(!Array.isArray(INJ_SAFETY)) return;
      LIT_TRIGGERS.forEach(x=>{if(!INJ_SAFETY.some(g=>g.id===x.id))INJ_SAFETY.push(x);});
    }catch(e){}
  }

  function medRule(k){
    if(['aristada','initio','maintena','asimtufii'].includes(k))return {
      family:'Aripiprazole LAI',kind:'orthostatic',badge:'BP/HR if risk',
      support:'Labeling supports monitoring heart rate and blood pressure in patients vulnerable to orthostatic hypotension/syncope.',
      action:'Do not force vitals for every stable maintenance dose. Obtain BP/HR; consider orthostatics when dizziness/faint/fall concern, CV/CVA disease, dehydration/syncope risk, antihypertensive/low-BP risk, frailty, first/restart/loading, or dose change is present.'
    };
    if(['sustenna','trinza','hafyera','erzofri'].includes(k))return {
      family:'Paliperidone LAI',kind:'orthostatic',badge:'orthostatics if vulnerable',
      support:'Labeling says orthostatic vital signs should be considered in patients vulnerable to hypotension.',
      action:'Obtain BP/HR; consider orthostatics for vulnerable patients, dizziness/faint/fall concern, CV/CVA disease, dehydration/hypovolemia, antihypertensive use, elderly/frail status, first/restart/loading, or dose change.'
    };
    if(k==='uzedy')return {
      family:'Risperidone LAI',kind:'orthostatic',badge:'orthostatics if risk',
      support:'Labeling describes orthostatic hypotension with dizziness, tachycardia, and syncope risk.',
      action:'Obtain BP/HR; consider orthostatics when hypotension risk, dizziness/faint/fall concern, antihypertensive use, renal/hepatic vulnerability, first/restart/loading, or dose change is present.'
    };
    if(k==='haldol')return {
      family:'Haloperidol decanoate',kind:'typical',badge:'vitals expected if risk',
      support:'Typical antipsychotic decanoate workflow: watch for tachycardia/hypotension, falls, EPS/NMS, and cardiac symptoms.',
      action:'BP/HR is recommended when symptomatic, elderly/frail, first/restart/loading/dose change, late/early dose, or if staff has any concern. Orthostatics are preferred for dizziness/faint/fall or low-BP risk.'
    };
    if(k==='prolixin')return {
      family:'Fluphenazine decanoate',kind:'typical',badge:'BP/HR if risk',
      support:'Phenothiazine/typical antipsychotic workflow: watch for postural hypotension, falls, EPS/NMS, and sedation.',
      action:'BP/HR is recommended for older/frail patients, dizziness/faint/fall, antihypertensive/low-BP risk, first/restart/loading/dose change, or staff/provider concern.'
    };
    if(k==='vivitrol')return {
      family:'Vivitrol',kind:'site-withdrawal',badge:'symptom-driven',
      support:'Medication-specific monitoring emphasizes opioid-free/withdrawal screening and severe injection-site reaction recognition.',
      action:'Routine vitals are not automatically required by the medication helper. Obtain vitals/provider review if withdrawal symptoms, dizziness/fainting, allergic reaction concern, patient appears unwell, or severe/worsening injection-site reaction is present.'
    };
    if(k==='other')return {family:'Other injection',kind:'manual',badge:'provider policy',support:'No medication-specific vitals rule is available in this helper.',action:'Follow provider order, clinic policy, and patient symptoms. Vitals are recommended if patient appears unwell or any provider-review trigger is present.'};
    return {family:'Select medication',kind:'none',badge:'auto rule',support:'Pick a medication to show whether literature-supported vitals guidance applies.',action:'Vitals should appear when the selected medication, symptoms, or patient risk factors support BP/HR, orthostatics, or temperature.'};
  }
  function triggerState(){
    const guards=selectedGuards();
    const reason=currentReason();
    const nonRoutine=['initiation','reinit','loading','prn'].includes(reason);
    const risk=guards.some(g=>['dizzy','cardiac','nms','eps','site','opioid','cvRisk','dehydration','antihyp','frail','doseChange','liver'].includes(g));
    const hard=guards.some(g=>['cardiac','nms','opioid'].includes(g));
    const orthRisk=guards.some(g=>['dizzy','cvRisk','dehydration','antihyp','frail'].includes(g));
    const siteRisk=guards.includes('site');
    return {guards,reason,nonRoutine,risk,hard,orthRisk,siteRisk};
  }
  function decision(){
    const k=medKey();
    const rule=medRule(k);
    const t=triggerState();
    let status='consider', title='Vitals guidance', needed=false, required=false;
    let requireTemp=false;
    if(!k){status='neutral';title='Select med for vitals rule';}
    else if(t.hard){status='required';title='Provider review + vitals indicated';needed=true;required=true;}
    else if(k==='vivitrol'){
      if(t.risk){status='required';title='Vitals/provider review triggered';needed=true;required=t.guards.includes('opioid')||t.siteRisk;}
      else {status='ok';title='Vitals not routine for this med';}
    }else if(['haldol'].includes(k)){
      if(t.risk||t.nonRoutine){status='need';title='BP/HR recommended by med context';needed=true;}
      else {status='consider';title='BP/HR if vulnerable or symptomatic';}
    }else if(['prolixin'].includes(k)){
      if(t.risk||t.nonRoutine){status='need';title='BP/HR recommended by med context';needed=true;}
      else {status='consider';title='BP/HR if vulnerable or symptomatic';}
    }else if(rule.kind==='orthostatic'){
      if(t.orthRisk||t.nonRoutine||t.guards.includes('doseChange')){status='need';title='BP/HR recommended; orthostatics if risk';needed=true;}
      else {status='consider';title='Vitals not routine unless vulnerable/symptomatic';}
    }else if(t.risk||t.nonRoutine){status='need';title='Vitals recommended by context';needed=true;}
    if(t.guards.includes('nms'))requireTemp=true;
    return {rule,t,status,title,needed,required,requireTemp};
  }
  function ensurePanel(){
    let panel=byId('vitalsRulePanel');
    if(panel)return panel;
    const temp=byId('temp'); if(!temp)return null;
    const row=temp.closest('.row3')||temp.parentElement;
    if(!row||!row.parentNode)return null;
    panel=document.createElement('div'); panel.id='vitalsRulePanel'; panel.className='vitals-rule-panel';
    row.parentNode.insertBefore(panel,row.nextSibling);
    return panel;
  }
  function updateFieldPrompts(d){
    ['bp','hr','temp'].forEach(id=>{const n=byId(id); if(n)n.classList.remove('vitals-prompt-missing');});
    if(!d.needed&&!d.required)return;
    if(!enteredVitals().bp && byId('bp'))byId('bp').classList.add('vitals-prompt-missing');
    if(!enteredVitals().hr && byId('hr'))byId('hr').classList.add('vitals-prompt-missing');
    if(d.requireTemp && !enteredVitals().temp && byId('temp'))byId('temp').classList.add('vitals-prompt-missing');
  }
  function triggerChips(d){
    const chips=[];
    if(d.t.nonRoutine)chips.push({t:'non-routine dose',on:true});
    if(d.t.orthRisk)chips.push({t:'orthostatic-risk screen',on:true});
    if(d.t.siteRisk)chips.push({t:'site concern',on:true});
    if(d.t.hard)chips.push({t:'hard-stop symptom',on:true,danger:true});
    if(hasBpHr())chips.push({t:'BP/HR captured',ok:true});
    else if(hasAnyVitals())chips.push({t:'partial vitals captured',on:true});
    if(!chips.length)chips.push({t:'routine/asymptomatic',ok:d.status==='ok'||d.status==='consider'});
    return chips.map(c=>`<span class="vr-trigger ${c.ok?'ok':c.danger?'danger':c.on?'on':''}">${safe(c.t)}</span>`).join('');
  }
  function renderVitalsRule(){
    addLitTriggers();
    const panel=ensurePanel(); if(!panel)return;
    const d=decision(), med=medLabel();
    let cls='vitals-rule-panel'; if(d.status==='need')cls+=' need'; if(d.status==='required')cls+=' required'; if(d.status==='ok')cls+=' ok';
    panel.className=cls;
    const action=d.needed||d.required?d.rule.action:d.rule.action;
    const noteLine=d.needed? (d.requireTemp?'Capture BP/HR and temp before proceeding, then route abnormal findings.':'Capture BP/HR before proceeding; use orthostatics when dizziness/faint/fall or low-BP risk is present.') : 'No automatic vitals requirement for a stable, asymptomatic routine dose unless clinic policy/provider order says otherwise.';
    panel.innerHTML=`
      <div class="vr-top">
        <div><div class="vr-title">${safe(d.title)}</div><div class="vr-sub">${safe(med||d.rule.family)} · ${safe(d.rule.family)}</div></div>
        <div class="vr-badge">${safe(d.status==='required'?'required/review':d.status==='need'?'obtain vitals':d.rule.badge)}</div>
      </div>
      <div class="vr-grid">
        <div class="vr-box"><b>Literature-supported rule</b><p>${safe(d.rule.support)}</p></div>
        <div class="vr-box"><b>What staff should do</b><p>${safe(d.required?'Do not administer until provider review/clinic emergency workflow is addressed. '+action:noteLine)}</p></div>
      </div>
      <div class="vr-trigger-row">${triggerChips(d)}</div>`;
    updateFieldPrompts(d);
  }
  function addQaVitalsDecision(){
    try{
      const d=decision();
      if(!S||!S.med)return;
      if(d.required)return {level:'danger',text:'Vitals/provider review triggered by med + symptoms'};
      if(d.needed)return {level:hasBpHr()?'ok':'warn',text:hasBpHr()?'Vitals captured for med-specific risk':'BP/HR recommended by med-specific vitals rule'};
      if(d.rule.kind==='orthostatic')return {level:'info',text:'Vitals only if vulnerable/symptomatic per medication rule'};
      if(d.rule.kind==='site-withdrawal')return {level:'info',text:'Vitals symptom-driven; prioritize withdrawal/site screen'};
    }catch(e){}
    return null;
  }
  const oldRenderInjQa=typeof renderInjQa==='function'?renderInjQa:null;
  if(oldRenderInjQa){
    renderInjQa=function(){
      const r=oldRenderInjQa.apply(this,arguments);
      try{
        const qa=byId('injQa'), item=addQaVitalsDecision();
        if(qa&&item){
          const list=qa.querySelector('.qa-list');
          if(list&&!list.querySelector('[data-rc524-vitals]')){
            const el=document.createElement('span');
            el.setAttribute('data-rc524-vitals','1');
            el.className='qa-chip '+(item.level||'info');
            el.textContent=item.text;
            list.appendChild(el);
          }
        }
      }catch(e){}
      renderVitalsRule();
      return r;
    };
  }
  const oldRender=typeof render==='function'?render:null;
  if(oldRender){
    render=function(){const r=oldRender.apply(this,arguments);renderVitalsRule();return r;};
  }
  const oldSafety=typeof renderInjSafetyChips==='function'?renderInjSafetyChips:null;
  if(oldSafety){
    renderInjSafetyChips=function(){addLitTriggers();const r=oldSafety.apply(this,arguments);renderVitalsRule();return r;};
  }
  function boot(){
    addLitTriggers();
    try{ if(typeof renderInjSafetyChips==='function')renderInjSafetyChips(); }catch(e){}
    try{ if(typeof render==='function')render(); }catch(e){}
    renderVitalsRule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  try{window.IPMG_RC_VERSION='RC5.24 Literature Vitals Logic';}catch(e){}
})();
/* </script> */

;

/* Legacy runtime block 6: <script> */
(function(){
  'use strict';
  const VERSION='RC5.25 Smart Vitals Entry';
  const $id=(id)=>document.getElementById(id);
  const safe=(s)=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const state={recheck:false};
  function num(v){const m=String(v||'').replace(/,/g,'.').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null;}
  function selectedGuardIds(){
    try{
      if(typeof selectedSafetyGuards==='function')return selectedSafetyGuards().map(g=>g.id||g.k||'');
    }catch(e){}
    try{
      if(window.S&&S.guard)return Object.keys(S.guard).filter(k=>S.guard[k]);
    }catch(e){}
    return [];
  }
  function normalizeBp(raw){
    raw=String(raw||'').trim(); if(!raw)return '';
    let m=raw.match(/(\d{2,3})\s*[/\-\s]\s*(\d{2,3})/);
    if(!m){
      const d=raw.replace(/\D/g,'');
      if(d.length===5)m=[null,d.slice(0,3),d.slice(3)];
      else if(d.length===6)m=[null,d.slice(0,3),d.slice(3)];
      else if(d.length===4)m=[null,d.slice(0,2),d.slice(2)];
    }
    if(!m)return raw;
    return `${Number(m[1])}/${Number(m[2])}`;
  }
  function parseBpSmart(v){
    const n=normalizeBp(v); const m=n.match(/^(\d{2,3})\/(\d{2,3})$/);
    if(!m)return null;
    const sys=Number(m[1]), dia=Number(m[2]);
    if(sys<50||sys>260||dia<30||dia>160)return {sys,dia,format:true};
    return {sys,dia};
  }
  function normalizeTemp(raw){
    raw=String(raw||'').trim(); if(!raw)return '';
    const c=/c\b|°c/i.test(raw);
    let n=num(raw); if(n==null)return raw;
    const digits=raw.replace(/\D/g,'');
    if(!c && !raw.includes('.') && digits.length===4 && Number(digits)>=950 && Number(digits)<=1100)n=Number(digits)/10;
    if(!c && !raw.includes('.') && digits.length===3 && Number(digits)>=950 && Number(digits)<=999)n=Number(digits)/10;
    if(c || n<45)n=(n*9/5)+32;
    if(n<80||n>112)return raw;
    return n.toFixed(1);
  }
  function parseTempSmart(v){
    const n=normalizeTemp(v); const t=num(n);
    if(t==null)return null;
    if(t<80||t>112)return {temp:t,format:true};
    return {temp:t};
  }
  function normalizeInt(raw, suffix){
    raw=String(raw||'').trim(); if(!raw)return '';
    const n=num(raw); if(n==null)return raw;
    return String(Math.round(n))+(suffix||'');
  }
  function parseIntSmart(id){
    const n=num($id(id)?.value||'');
    return Number.isFinite(n)?Math.round(n):null;
  }
  function medFamily(){
    try{
      const k=S&&S.med&&S.med.key;
      if(k==='vivitrol')return 'vivitrol';
      if(['haldol','prolixin'].includes(k))return 'typical';
      if(['sustenna','trinza','hafyera','erzofri','uzedy'].includes(k))return 'orthostatic';
      if(['aristada','initio','maintena','asimtufii'].includes(k))return 'orthostatic';
    }catch(e){}
    return 'general';
  }
  function ensureExtraFields(){
    const temp=$id('temp'); if(!temp)return;
    const bp=$id('bp'), hr=$id('hr');
    if(bp){bp.setAttribute('inputmode','numeric');bp.setAttribute('autocomplete','off');bp.placeholder='124/78';bp.title='Type 124/78 or 12478';}
    if(hr){hr.setAttribute('inputmode','numeric');hr.setAttribute('autocomplete','off');hr.placeholder='72';}
    temp.setAttribute('inputmode','decimal');temp.setAttribute('autocomplete','off');temp.placeholder='98.6';temp.title='Type 98.6, 986, 1004, or 37 C';
    if($id('rr')&&$id('spo2'))return;
    const row=temp.closest('.row3')||temp.parentElement;
    if(!row||!row.parentNode)return;
    const extra=document.createElement('div');
    extra.className='row3 vitals-smart-extra';
    extra.id='vitalsSmartExtra';
    extra.innerHTML=`
      <div class="field"><label>Resp <span style="color:var(--ink-faint);font-weight:500">if SOB/sedation</span></label><input id="rr" inputmode="numeric" autocomplete="off" placeholder="16" /></div>
      <div class="field"><label>SpO₂ <span style="color:var(--ink-faint);font-weight:500">if SOB/unwell</span></label><input id="spo2" inputmode="numeric" autocomplete="off" placeholder="98%" /></div>
      <div class="field"><label>Orthostatic / repeat note</label><input id="vitalRepeatNote" placeholder="repeat BP, orthostatic, manual check" /></div>`;
    row.parentNode.insertBefore(extra,row.nextSibling);
  }
  function ensurePanel(){
    ensureExtraFields();
    let panel=$id('vitalsSmartPanel'); if(panel)return panel;
    const extra=$id('vitalsSmartExtra')||$id('temp')?.closest('.row3');
    if(!extra||!extra.parentNode)return null;
    panel=document.createElement('div');
    panel.id='vitalsSmartPanel';
    panel.className='vitals-smart-panel';
    extra.parentNode.insertBefore(panel,extra.nextSibling);
    return panel;
  }
  function classifyVitals(){
    const items=[]; const abnormal=[]; const danger=[]; const prompts=[];
    const guards=selectedGuardIds();
    const needsResp=guards.some(g=>['cardiac','nms'].includes(g));
    const needsTemp=guards.includes('nms');
    const needsBpHr=guards.some(g=>['dizzy','cardiac','cvRisk','dehydration','antihyp','frail','doseChange','nms'].includes(g)) || medFamily()==='typical';
    const bpRaw=$id('bp')?.value.trim()||'', hrRaw=$id('hr')?.value.trim()||'', tempRaw=$id('temp')?.value.trim()||'';
    const rrRaw=$id('rr')?.value.trim()||'', spo2Raw=$id('spo2')?.value.trim()||'';
    const bp=parseBpSmart(bpRaw), hr=parseIntSmart('hr'), temp=parseTempSmart(tempRaw), rr=parseIntSmart('rr'), spo2=parseIntSmart('spo2');
    if(needsBpHr&&!bpRaw)prompts.push({level:'warn',text:'BP is recommended by the med/symptom rule.'});
    if(needsBpHr&&!hrRaw)prompts.push({level:'warn',text:'HR is recommended by the med/symptom rule.'});
    if(needsTemp&&!tempRaw)prompts.push({level:'warn',text:'Temperature is recommended because fever/rigidity/confusion was flagged.'});
    if(needsResp&&!rrRaw)prompts.push({level:'warn',text:'Respiratory rate is useful when SOB/chest symptoms or NMS concern is flagged.'});
    if(needsResp&&!spo2Raw)prompts.push({level:'warn',text:'SpO₂ is useful when SOB/chest symptoms or patient appears unwell.'});
    if(bpRaw){
      if(!bp||bp.format){items.push({level:'warn',text:'BP format/range looks off — re-enter as systolic/diastolic, e.g., 124/78.'});abnormal.push('BP format');}
      else if(bp.sys>=180||bp.dia>=120){items.push({level:'danger',text:`BP ${bp.sys}/${bp.dia} — repeat/confirm and urgent provider review; emergency workflow if symptoms.`});danger.push('BP');}
      else if(bp.sys<80||bp.dia<50){items.push({level:'danger',text:`BP ${bp.sys}/${bp.dia} very low — repeat/confirm and provider review before giving.`});danger.push('BP');}
      else if(bp.sys>=160||bp.dia>=100){items.push({level:'warn',text:`BP ${bp.sys}/${bp.dia} elevated — repeat/confirm before documenting.`});abnormal.push('BP');}
      else if(bp.sys<90||bp.dia<60){items.push({level:'warn',text:`BP ${bp.sys}/${bp.dia} low — repeat/confirm, assess dizziness/fall risk.`});abnormal.push('BP');}
      else items.push({level:'ok',text:`BP ${bp.sys}/${bp.dia} accepted.`});
    }
    if(hrRaw){
      if(hr==null||hr<25||hr>240){items.push({level:'warn',text:'HR format/range looks off — recheck entry.'});abnormal.push('HR format');}
      else if(hr>=120||hr<50){items.push({level:'danger',text:`HR ${hr} — repeat/confirm and provider review.`});danger.push('HR');}
      else if(hr>=100||hr<60){items.push({level:'warn',text:`HR ${hr} — repeat/confirm if symptomatic or unexpected.`});abnormal.push('HR');}
      else items.push({level:'ok',text:`HR ${hr} accepted.`});
    }
    if(tempRaw){
      if(!temp||temp.format){items.push({level:'warn',text:'Temperature format/range looks off — use °F with one decimal, e.g., 98.6.'});abnormal.push('Temp format');}
      else if(temp.temp>=103||temp.temp<=95){items.push({level:'danger',text:`Temp ${temp.temp.toFixed(1)}°F — repeat/confirm and provider review.`});danger.push('Temp');}
      else if(temp.temp>=100.4){items.push({level:'warn',text:`Temp ${temp.temp.toFixed(1)}°F — fever threshold; repeat/confirm and review symptoms.`});abnormal.push('Temp');}
      else if(temp.temp>=99.5){items.push({level:'info',text:`Temp ${temp.temp.toFixed(1)}°F — borderline; recheck if patient feels unwell.`});}
      else items.push({level:'ok',text:`Temp ${temp.temp.toFixed(1)}°F accepted.`});
    }
    if(rrRaw){
      if(rr==null||rr<4||rr>60){items.push({level:'warn',text:'Respiratory rate format/range looks off — recheck entry.'});abnormal.push('RR format');}
      else if(rr<=8||rr>=30){items.push({level:'danger',text:`Resp ${rr}/min — repeat/confirm and provider review.`});danger.push('Resp');}
      else if(rr<12||rr>25){items.push({level:'warn',text:`Resp ${rr}/min — outside usual adult resting range; repeat/confirm if unexpected.`});abnormal.push('Resp');}
      else items.push({level:'ok',text:`Resp ${rr}/min accepted.`});
    }
    if(spo2Raw){
      if(spo2==null||spo2<50||spo2>100){items.push({level:'warn',text:'SpO₂ format/range looks off — enter percent, e.g., 98.'});abnormal.push('SpO₂ format');}
      else if(spo2<92){items.push({level:'danger',text:`SpO₂ ${spo2}% — repeat/confirm and urgent provider review.`});danger.push('SpO₂');}
      else if(spo2<95){items.push({level:'warn',text:`SpO₂ ${spo2}% — repeat/confirm and assess symptoms.`});abnormal.push('SpO₂');}
      else items.push({level:'ok',text:`SpO₂ ${spo2}% accepted.`});
    }
    if(!bpRaw&&!hrRaw&&!tempRaw&&!rrRaw&&!spo2Raw)items.push({level:'info',text:'Vitals are blank. The medication rule decides whether staff should capture them.'});
    return {items,prompts,abnormal,danger,needsBpHr,needsTemp,needsResp};
  }
  function setVitalClasses(){
    ['bp','hr','temp','rr','spo2'].forEach(id=>{const n=$id(id); if(n)n.classList.remove('vital-ok','vital-warn','vital-danger','vital-format');});
    const d=classifyVitals();
    const mark=(id,level)=>{const n=$id(id); if(n)n.classList.add(level==='danger'?'vital-danger':level==='warn'?'vital-warn':'vital-ok');};
    const bp=parseBpSmart($id('bp')?.value||''); if($id('bp')?.value.trim()) mark('bp', !bp||bp.format?'warn':(bp.sys>=180||bp.dia>=120||bp.sys<80||bp.dia<50)?'danger':(bp.sys>=160||bp.dia>=100||bp.sys<90||bp.dia<60)?'warn':'ok');
    const hr=parseIntSmart('hr'); if($id('hr')?.value.trim()) mark('hr', hr==null||hr<25||hr>240?'warn':(hr>=120||hr<50)?'danger':(hr>=100||hr<60)?'warn':'ok');
    const t=parseTempSmart($id('temp')?.value||''); if($id('temp')?.value.trim()) mark('temp', !t||t.format?'warn':(t.temp>=103||t.temp<=95)?'danger':t.temp>=100.4?'warn':'ok');
    const rr=parseIntSmart('rr'); if($id('rr')?.value.trim()) mark('rr', rr==null||rr<4||rr>60?'warn':(rr<=8||rr>=30)?'danger':(rr<12||rr>25)?'warn':'ok');
    const spo2=parseIntSmart('spo2'); if($id('spo2')?.value.trim()) mark('spo2', spo2==null||spo2<50||spo2>100?'warn':spo2<92?'danger':spo2<95?'warn':'ok');
    return d;
  }
  function renderSmartVitalsPanel(){
    const panel=ensurePanel(); if(!panel)return;
    const d=setVitalClasses();
    const all=d.prompts.concat(d.items);
    const hasDanger=all.some(x=>x.level==='danger'), hasWarn=all.some(x=>x.level==='warn');
    panel.className='vitals-smart-panel '+(hasDanger?'danger':hasWarn?'need':'');
    const badge=hasDanger?'provider review':hasWarn?'double-check':'smart entry';
    const body=all.map(x=>`<div class="vitals-smart-item ${safe(x.level||'info')}">${safe(x.text)}</div>`).join('');
    const showRecheck=d.abnormal.length||d.danger.length;
    panel.innerHTML=`
      <div class="vitals-smart-head">
        <div><div class="vitals-smart-title">Smart vitals entry</div><div class="vitals-smart-sub">Auto-formats BP, HR, temp, respirations, and SpO₂; abnormal values prompt a repeat check before documentation.</div></div>
        <div class="vitals-smart-badge">${safe(badge)}</div>
      </div>
      <div class="vitals-smart-list">${body}</div>
      ${showRecheck?`<div class="vitals-recheck-row">
        <button type="button" id="vitalsRecheckChip" class="vitals-recheck-chip ${state.recheck?'on':hasDanger?'danger':'need'}" aria-pressed="${state.recheck?'true':'false'}">${state.recheck?'✓ Recheck documented':'☐ Recheck abnormal vitals'}</button>
        <span style="font-size:11px;color:var(--ink-soft);">Use the repeat note field for manual/orthostatic repeat values when needed.</span>
      </div>`:''}`;
    const chip=$id('vitalsRecheckChip'); if(chip)chip.onclick=()=>{state.recheck=!state.recheck; renderSmartVitalsPanel(); try{if(typeof renderInjQa==='function')renderInjQa();}catch(e){}};
  }
  function normalizeOnBlur(e){
    const el=e&&e.target; if(!el)return;
    if(el.id==='bp')el.value=normalizeBp(el.value);
    if(el.id==='temp')el.value=normalizeTemp(el.value);
    if(el.id==='hr')el.value=normalizeInt(el.value);
    if(el.id==='rr')el.value=normalizeInt(el.value);
    if(el.id==='spo2')el.value=normalizeInt(el.value,'%');
    renderSmartVitalsPanel();
    try{if(typeof render==='function')render();}catch(_){try{if(typeof renderInjQa==='function')renderInjQa();}catch(e){}}
  }
  function addListeners(){
    ensureExtraFields();
    ['bp','hr','temp','rr','spo2','vitalRepeatNote'].forEach(id=>{
      const el=$id(id); if(!el||el.dataset.rc525Vitals)return; el.dataset.rc525Vitals='1';
      el.addEventListener('blur',normalizeOnBlur);
      el.addEventListener('input',()=>{if(id!=='vitalRepeatNote')state.recheck=false;renderSmartVitalsPanel();});
    });
  }
  function extraVitalsText(){
    const parts=[];
    const rr=($id('rr')?.value||'').trim(); const spo2=($id('spo2')?.value||'').trim(); const note=($id('vitalRepeatNote')?.value||'').trim();
    if(rr)parts.push('Resp '+rr.replace(/\s*\/min$/,'')+'/min');
    if(spo2)parts.push('SpO₂ '+spo2.replace(/\s*%?$/,'%'));
    if(note)parts.push('Repeat/orthostatic note: '+note);
    return parts.length?'Additional vitals: '+parts.join(', ')+'.':'';
  }
  function augmentNote(){
    const line=extraVitalsText();
    const out=$id('outAS');
    if(out){const old=out.querySelector('[data-rc525-extra-vitals]'); if(old)old.remove(); if(line){const p=document.createElement('p');p.dataset.rc525ExtraVitals='1';p.textContent=line;out.appendChild(p);}}
    try{ if(window._note&&line&&!window._note.as.includes(line))window._note.as=(window._note.as?window._note.as+'\n':'')+line; }catch(e){}
  }
  const oldVitalSafety=typeof window.vitalSafetyItems==='function'?window.vitalSafetyItems:null;
  window.vitalSafetyItems=function(){
    const items=[];
    const bp=parseBpSmart($id('bp')?.value||''), hr=parseIntSmart('hr'), temp=parseTempSmart($id('temp')?.value||''), rr=parseIntSmart('rr'), spo2=parseIntSmart('spo2');
    if($id('bp')?.value.trim()){
      if(!bp||bp.format)items.push({level:'warn',text:'BP format/range needs recheck'});
      else if(bp.sys>=180||bp.dia>=120)items.push({level:'danger',text:`BP ${bp.sys}/${bp.dia} — repeat/confirm; urgent provider review`});
      else if(bp.sys<80||bp.dia<50)items.push({level:'danger',text:`BP ${bp.sys}/${bp.dia} very low — repeat/confirm; provider review`});
      else if(bp.sys>=160||bp.dia>=100)items.push({level:'warn',text:`BP ${bp.sys}/${bp.dia} elevated — double-check`});
      else if(bp.sys<90||bp.dia<60)items.push({level:'warn',text:`BP ${bp.sys}/${bp.dia} low — double-check`});
      else items.push({level:'ok',text:`BP ${bp.sys}/${bp.dia}`});
    }
    if($id('hr')?.value.trim()){
      if(hr==null||hr<25||hr>240)items.push({level:'warn',text:'HR format/range needs recheck'});
      else if(hr>=120||hr<50)items.push({level:'danger',text:`HR ${hr} — repeat/confirm; provider review`});
      else if(hr>=100||hr<60)items.push({level:'warn',text:`HR ${hr} — double-check if unexpected/symptomatic`});
      else items.push({level:'ok',text:`HR ${hr}`});
    }
    if($id('temp')?.value.trim()){
      if(!temp||temp.format)items.push({level:'warn',text:'Temp format/range needs recheck'});
      else if(temp.temp>=103||temp.temp<=95)items.push({level:'danger',text:`Temp ${temp.temp.toFixed(1)}°F — repeat/confirm; provider review`});
      else if(temp.temp>=100.4)items.push({level:'warn',text:`Temp ${temp.temp.toFixed(1)}°F — fever threshold; double-check`});
      else items.push({level:'ok',text:`Temp ${temp.temp.toFixed(1)}°F`});
    }
    if($id('rr')?.value.trim()){
      if(rr==null||rr<4||rr>60)items.push({level:'warn',text:'Resp format/range needs recheck'});
      else if(rr<=8||rr>=30)items.push({level:'danger',text:`Resp ${rr}/min — repeat/confirm; provider review`});
      else if(rr<12||rr>25)items.push({level:'warn',text:`Resp ${rr}/min — double-check if unexpected/symptomatic`});
      else items.push({level:'ok',text:`Resp ${rr}/min`});
    }
    if($id('spo2')?.value.trim()){
      if(spo2==null||spo2<50||spo2>100)items.push({level:'warn',text:'SpO₂ format/range needs recheck'});
      else if(spo2<92)items.push({level:'danger',text:`SpO₂ ${spo2}% — repeat/confirm; urgent provider review`});
      else if(spo2<95)items.push({level:'warn',text:`SpO₂ ${spo2}% — double-check and assess symptoms`});
      else items.push({level:'ok',text:`SpO₂ ${spo2}%`});
    }
    const d=classifyVitals();
    if((d.abnormal.length||d.danger.length)&&!state.recheck)items.push({level:d.danger.length?'danger':'warn',text:'Abnormal vitals should be repeated/confirmed before final documentation'});
    d.prompts.forEach(p=>items.push(p));
    return items;
  };
  const oldRenderInjQa=typeof window.renderInjQa==='function'?window.renderInjQa:null;
  if(oldRenderInjQa){window.renderInjQa=function(){const r=oldRenderInjQa.apply(this,arguments);renderSmartVitalsPanel();return r;};}
  const oldRender=typeof window.render==='function'?window.render:null;
  if(oldRender){window.render=function(){const r=oldRender.apply(this,arguments);addListeners();renderSmartVitalsPanel();augmentNote();return r;};}
  window.ipmgSmartVitalsSnapshot=()=>({version:1,recheck:!!state.recheck});
  window.restoreSmartVitalsState=data=>{state.recheck=!!(data&&data.recheck);renderSmartVitalsPanel();};
  window.resetSmartVitalsState=()=>{state.recheck=false;renderSmartVitalsPanel();};
  function boot(){ensureExtraFields();addListeners();renderSmartVitalsPanel();augmentNote();try{window.IPMG_RC_VERSION=VERSION;}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
/* </script> */

;

/* Legacy runtime block 7: <script id="rc526InjectionCompactGuidedScript"> */
/* ===================== RC5.26: compact guided injection workflow ===================== */
(function(){
  'use strict';
  const VERSION='RC5.26 Compact Guided Injection';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const by=id=>document.getElementById(id);
  const val=id=>{const n=by(id); return n&&'value' in n?String(n.value||'').trim():'';};
  const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const hasS=()=>{try{return typeof S!=='undefined';}catch(e){return false;}};
  const med=()=>{try{return hasS()?S.med:null;}catch(e){return null;}};
  const sget=(k,f='')=>{try{return hasS()?(S[k]||f):f;}catch(e){return f;}};
  const reasonLabel=()=>{try{const k=sget('reason','scheduled'); const r=(typeof REASONS!=='undefined'&&REASONS||[]).find(x=>x.k===k||x.key===k); return r?(r.l||r.label||k):k;}catch(e){return sget('reason','scheduled');}};
  const intervalLabel=()=>{try{const k=sget('intervalKey',''); const r=(typeof INTERVALS!=='undefined'&&INTERVALS||[]).find(x=>x.k===k||x.key===k); return r?(r.l||r.label||k):k;}catch(e){return sget('intervalKey','');}};
  const respLabel=()=>{try{const k=sget('resp',''); const r=(typeof RESP!=='undefined'&&RESP||[]).find(x=>x.k===k); if(k==='custom')return val('respCustom')||'custom response'; return r?(r.l||r.s||k):k;}catch(e){return '';}};
  const selectedGuards=()=>{try{return typeof selectedSafetyGuards==='function'?selectedSafetyGuards():[];}catch(e){return [];}};
  const abnormalVitalsNeedRecheck=()=>{const p=by('vitalsSmartPanel'); if(!p)return false; const bad=p.classList.contains('need')||p.classList.contains('danger'); const on=!!q('.vitals-recheck-chip.on',p); return bad&&!on;};
  const vitalsDecision=()=>{
    const rule=by('vitalsRulePanel');
    const needed=!!(rule&&(rule.classList.contains('need')||rule.classList.contains('required')));
    const required=!!(rule&&rule.classList.contains('required'));
    const bp=val('bp'), hr=val('hr'), temp=val('temp'), rr=val('rr'), spo2=val('spo2');
    const any=!!(bp||hr||temp||rr||spo2||val('vitalRepeatNote'));
    const hasCore=!!(bp&&hr);
    const missing=needed&&!hasCore;
    const abnormal=abnormalVitalsNeedRecheck();
    return {needed,required,any,hasCore,missing,abnormal,complete:(!needed||hasCore)&&!abnormal};
  };
  const formatDate=s=>{try{return typeof fmtDate==='function'?fmtDate(s):s;}catch(e){return s;}};
  const medLine=()=>{const m=med(); if(!m)return ''; const parts=[m.name||m.label||'Medication', sget('dose'), sget('route'), sget('site')].filter(Boolean); return parts.join(' · ');};

  function ensureFlow(){
    const panel=by('panel-administer'),form=q('#panel-administer .form-col'); if(!panel||!form)return null;
    let flow=by('rc526Flow');
    if(flow){
      const layout=q(':scope > .layout',panel);
      if(layout&&flow.parentElement!==panel)panel.insertBefore(flow,layout);
      return flow;
    }
    flow=document.createElement('div'); flow.id='rc526Flow'; flow.className='rc526-flow';
    const layout=q(':scope > .layout',panel);panel.insertBefore(flow,layout||panel.firstChild);
    return flow;
  }
  function ensureCard(id, selector){
    const card=q(selector); if(!card)return null;
    card.classList.add('inj-card'); card.dataset.rc526Card=id;
    let sum=q('.rc526-summary',card);
    if(!sum){sum=document.createElement('div'); sum.className='rc526-summary'; const head=q('.card-head',card); if(head&&head.parentNode)head.parentNode.insertBefore(sum,head.nextSibling); else card.insertBefore(sum,card.firstChild);}
    const head=q('.card-head',card);
    if(head&&!head.dataset.rc526Click){head.dataset.rc526Click='1'; head.addEventListener('click',()=>{ if(!card.classList.contains('rc526-complete'))return; card.classList.toggle('rc526-open'); card.dataset.rc526Manual=card.classList.contains('rc526-open')?'open':'auto'; });}
    return card;
  }
  function ensureResponseCard(){
    const wrap=by('respChips')&&by('respChips').closest('.card'); if(wrap){wrap.classList.add('card-response','inj-card');}
    return wrap;
  }
  function ensureSafetyGate(){
    const card=q('.card-safety'); if(!card)return null;
    let gate=by('rc526SafetyGate'); if(gate)return gate;
    gate=document.createElement('div'); gate.id='rc526SafetyGate'; gate.className='rc526-gate';
    const head=q('.card-head',card); if(head&&head.parentNode)head.parentNode.insertBefore(gate,head.nextSibling); else card.insertBefore(gate,card.firstChild);
    return gate;
  }
  function sectionStates(){
    const m=med(), vit=vitalsDecision(), guards=selectedGuards();
    const encounterComplete=!!(val('orderingProvider')&&(val('ptName')||val('ptDOB')));
    const medComplete=!!(m&&sget('dose')&&sget('site')&&sget('route')&&sget('intervalKey'));
    const traceComplete=!!(m&&val('lot')&&val('exp'));
    const nonRoutine=!!(hasS()&&S.reason&&S.reason!=='scheduled');
    const guardBlock=guards.length>0;
    const safetyComplete=!!(m&&vit.complete&&!guardBlock);
    const returnComplete=!!(m&&(sget('intervalKey')==='once'||val('nextDate')));
    const responseComplete=!!(m&&val('adminDate')&&val('injAdminTime')&&val('admin')&&sget('resp')&&(sget('resp')!=='custom'||val('respCustom')));
    let safetyLevel='info', safetySummary='Routine/asymptomatic path';
    if(guardBlock){safetyLevel='danger'; safetySummary='Provider-review trigger selected';}
    else if(vit.required||vit.abnormal){safetyLevel='danger'; safetySummary=vit.abnormal?'Abnormal vitals need recheck':'Provider review + vitals indicated';}
    else if(vit.missing){safetyLevel='need'; safetySummary='BP/HR recommended before proceeding';}
    else if(vit.needed&&vit.hasCore){safetyLevel='done'; safetySummary='Vitals captured for med rule';}
    else if(vit.any){safetyLevel='done'; safetySummary='Vitals documented';}
    return [
      {id:'encounter',selector:'.card-encounter',label:'Patient & order',complete:encounterComplete,level:encounterComplete?'done':'need',summary:encounterComplete?`${val('ptName')||'Patient'}${val('ptDOB')?' · DOB '+val('ptDOB'):''}${val('orderingProvider')?' · '+val('orderingProvider'):''}`:'Add patient and ordering provider.'},
      {id:'med',selector:'.card-medication',label:'Medication & site',complete:medComplete,level:medComplete?'done':'need',summary:medComplete?`${medLine()}${intervalLabel()?' · '+intervalLabel():''}`:'Select medication, dose, route, actual site, and ordered interval.'},
      {id:'safety',selector:'.card-safety',label:'Safety',complete:safetyComplete,level:safetyComplete?'done':safetyLevel,summary:safetyComplete?'Review documented — not an authorization.':safetySummary},
      {id:'trace',selector:'.card-trace',label:'Product trace',complete:traceComplete,level:traceComplete?'done':'need',summary:traceComplete?`Lot ${val('lot')} · Exp ${val('exp')}${val('ndc')?' · NDC '+val('ndc'):''}`:'Enter lot and expiration from package.'},
      {id:'response',selector:'.card-response',label:'Administration',complete:responseComplete,level:responseComplete?'done':'need',summary:responseComplete?`${formatDate(val('adminDate'))} · ${respLabel()} · ${val('admin')}`:'Document date/time, response, and administered-by.'},
      {id:'return',selector:'.card-return',label:'Follow-up',complete:returnComplete,level:returnComplete?'done':'need',summary:returnComplete?(sget('intervalKey')==='once'?'One-time dose plan':'Next due '+formatDate(val('nextDate'))):'Set or confirm the next dose plan.'}
    ];
  }
  function flowMode(states){
    const m=med(), guards=selectedGuards(), vit=vitalsDecision();
    const nonRoutine=!!(hasS()&&S.reason&&S.reason!=='scheduled');
    if(!m)return {title:'Pick medication',sub:'The workflow will shrink as each section is completed.'};
    if(guards.length||vit.required||vit.abnormal)return {title:'Guided exception path',sub:'Provider review/vitals concern stays open until resolved.'};
    if(vit.missing)return {title:'Vitals-guided path',sub:'Medication/symptom rule is asking for BP/HR before closeout.'};
    if(nonRoutine)return {title:'Guided non-routine path',sub:`${reasonLabel()} keeps safety/return review visible.`};
    return {title:'Routine injection mode',sub:'Completed sections auto-collapse into editable receipt rows.'};
  }
  function renderFlow(states){
    const flow=ensureFlow(); if(!flow)return;
    const mode=flowMode(states);
    const focused=document.activeElement&&document.activeElement.getAttribute&&document.activeElement.getAttribute('data-rc526-jump')||'';
    const active=(states.find(st=>!st.complete)||{}).id||'';
    flow.innerHTML=`<div class="rc526-mode"><b>${safe(mode.title)}</b><span>${safe(mode.sub)}</span></div>`+
      states.map(st=>`<button type="button" class="rc526-step ${safe(st.level==='done'?'done':st.level==='danger'?'danger':'need')}" data-rc526-jump="${safe(st.id)}" aria-current="${st.id===active?'step':'false'}" aria-label="Open ${safe(st.label)} section — ${st.complete?'complete':'needs attention'}: ${safe(st.summary)}"><span class="n">${safe(st.label)}</span><span class="s">${safe(st.summary)}</span></button>`).join('');
    qa('[data-rc526-jump]',flow).forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.getAttribute('data-rc526-jump'); const card=q(`[data-rc526-card="${CSS.escape(id)}"]`);
      const current=window.__IPMG_RC530__;
      if(current&&typeof current.openInjection==='function')current.openInjection(id,true);
      else if(card){card.classList.add('rc526-open');card.dataset.rc526Manual='open';card.scrollIntoView({behavior:'auto',block:'nearest'});}
    }));
    if(focused){
      const replacement=q(`[data-rc526-jump="${CSS.escape(focused)}"]`,flow);
      if(replacement)requestAnimationFrame(()=>replacement.focus({preventScroll:true}));
    }
  }
  function updateCards(states){
    ensureResponseCard();
    states.forEach(st=>{
      const card=ensureCard(st.id,st.selector); if(!card)return;
      const sum=q('.rc526-summary',card); if(sum)sum.innerHTML=`<span class="edit">click to edit</span><b>${safe(st.label)}:</b> ${safe(st.summary)}`;
      /* RC5.30 owns the current receipt/collapse model. Keep this older pass for
         flow and vitals guidance, but do not let it create a second receipt row. */
      card.classList.remove('rc526-complete','rc526-collapsed','rc526-active','rc526-open');
      card.classList.toggle('rc526-needs',!st.complete);
    });
  }
  function renderSafetyGate(){
    const gate=ensureSafetyGate(); if(!gate)return;
    const m=med(), vit=vitalsDecision(), guards=selectedGuards();
    let cls='clear', badge='review status', title='Safety review status';
    const lines=[];
    if(!m){cls='need';badge='select med';title='Safety gate waiting';lines.push({l:'Select medication to apply site, vitals, and safety rules.',c:'info'});}
    else if(guards.length||vit.required||vit.abnormal){cls='danger';badge='review';title='Provider review gate';}
    else if(vit.missing){cls='need';badge='get vitals';title='Vitals gate';}
    if(m){
      lines.push({l:medLine()||'Medication selected.',c:'info'});
      if(guards.length)lines.push({l:'Provider-review trigger selected: '+guards.map(g=>g.t||g.id||'review').join(', ')+'.',c:'danger'});
      else lines.push({l:'No provider-review trigger selected.',c:'ok'});
      if(vit.required)lines.push({l:'Medication/symptom rule indicates vitals and provider review.',c:'danger'});
      else if(vit.abnormal)lines.push({l:'Abnormal vitals entered; repeat/confirm before final documentation.',c:'danger'});
      else if(vit.missing)lines.push({l:'BP/HR recommended by the medication/symptom rule before proceeding.',c:'warn'});
      else if(vit.needed&&vit.hasCore)lines.push({l:'Vitals captured for the medication/symptom rule.',c:'ok'});
      else lines.push({l:'Vitals not automatically indicated for a stable, asymptomatic routine dose.',c:'ok'});
    }
    const showToggle=!!m&&!vit.needed&&!vit.any;
    const showVitals=!!window.__rc526ShowVitals||vit.needed||vit.any||vit.required||vit.abnormal;
    gate.className='rc526-gate '+cls;
    gate.innerHTML=`
      <div class="rc526-gate-top"><div><div class="rc526-gate-title">${safe(title)}</div><div class="rc526-gate-sub">Exception-based: routine work collapses; warnings stay visible.</div></div><div class="rc526-gate-badge">${safe(badge)}</div></div>
      <div class="rc526-gate-list">${lines.map(x=>`<div class="rc526-gate-item ${safe(x.c||'')}">${safe(x.l)}</div>`).join('')}</div>
      ${showToggle?`<div class="rc526-gate-tools"><button type="button" class="rc526-mini-btn" data-rc526-toggle-vitals>${showVitals?'Hide optional vitals':'Show optional vitals'}</button></div>`:''}`;
    qa('[data-rc526-toggle-vitals]',gate).forEach(b=>b.addEventListener('click',()=>{window.__rc526ShowVitals=!window.__rc526ShowVitals; compactRefresh();}));
  }
  function updateOptionalVitals(){
    const vit=vitalsDecision();
    const show=!!window.__rc526ShowVitals||vit.needed||vit.any||vit.required||vit.abnormal;
    ['bp','hr','temp'].forEach(id=>{const n=by(id); const f=n&&n.closest('.field'); if(f)f.classList.toggle('rc526-hide-optional',!show);});
    const extra=by('vitalsSmartExtra'); if(extra)extra.classList.toggle('rc526-hide-optional',!show);
    const rule=by('vitalsRulePanel'); if(rule)rule.classList.toggle('rc526-hide-optional',!show && (rule.classList.contains('ok')||!med()));
    const smart=by('vitalsSmartPanel'); if(smart)smart.classList.toggle('rc526-hide-optional',!show && !smart.classList.contains('need')&&!smart.classList.contains('danger'));
  }
  let ticking=false;
  function compactRefresh(){
    if(ticking)return; ticking=true;
    requestAnimationFrame(()=>{
      ticking=false;
      ensureResponseCard();
      renderSafetyGate();
      updateOptionalVitals();
      const states=sectionStates();
      renderFlow(states);
      updateCards(states);
      try{window.IPMG_RC_VERSION=VERSION;}catch(e){}
    });
  }
  const oldRender=typeof window.render==='function'?window.render:null;
  if(oldRender){window.render=function(){const r=oldRender.apply(this,arguments); compactRefresh(); return r;};}
  const oldRenderInjQa=typeof window.renderInjQa==='function'?window.renderInjQa:null;
  if(oldRenderInjQa){window.renderInjQa=function(){const r=oldRenderInjQa.apply(this,arguments); compactRefresh(); return r;};}
  function wireInputs(){
    ['ptName','ptDOB','orderingProvider','priorDose','priorSite','ndc','lot','exp','bp','hr','temp','rr','spo2','vitalRepeatNote','adminDate','injAdminTime','nextDate','admin','respCustom'].forEach(id=>{const n=by(id); if(n&&!n.dataset.rc526Refresh){n.dataset.rc526Refresh='1'; n.addEventListener('input',compactRefresh); n.addEventListener('change',compactRefresh);}});
    document.addEventListener('click',e=>{ if(e.target.closest('.chip,.mini,.ir-mini,.vitals-recheck-chip')) setTimeout(compactRefresh,0); },true);
  }
  function boot(){ensureResponseCard();wireInputs();compactRefresh();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
/* </script> */

;

/* Legacy runtime block 8: <script id="rc527UdsMiddleColumnRestoreScript"> */
/* ===================== RC5.27: move guided UDS banner into the form stack ===================== */
(function(){
  'use strict';
  if(window.__IPMG_UDS_MIDDLE_RESTORE_RC527__) return;
  window.__IPMG_UDS_MIDDLE_RESTORE_RC527__=true;
  function restoreUdsMiddle(){
    var panel=document.getElementById('panel-uds');
    if(!panel) return;
    var layout=panel.querySelector(':scope > .layout');
    var form=panel.querySelector('.form-col');
    var preview=panel.querySelector('.preview-col');
    if(!layout||!form) return;

    /* The original bug: banner was a sibling of .form-col, so CSS grid treated it
       as column 1 and pushed .form-col into the right-side column. */
    var misplaced=layout.querySelector(':scope > .uds-guide-banner');
    if(misplaced){
      form.insertBefore(misplaced, form.firstChild);
    }

    form.style.gridColumn='1';
    form.style.gridRow='1';
    form.style.justifySelf='stretch';
    form.style.width='100%';
    form.style.maxWidth='none';

    if(preview){
      preview.style.gridColumn='2';
      preview.style.gridRow='1';
      preview.style.justifySelf='stretch';
      preview.style.width='100%';
    }

    var banner=form.querySelector(':scope > .uds-guide-banner');
    if(banner){
      banner.style.width='100%';
      banner.style.maxWidth='none';
      banner.style.marginBottom='14px';
    }
    Array.prototype.forEach.call(form.children,function(el){
      el.style.maxWidth='none';
      el.style.width='100%';
      el.style.justifySelf='stretch';
    });
    try{
      if(window.IPMGGuided&&window.IPMGGuided.uds&&typeof window.IPMGGuided.uds.refresh==='function'){
        window.IPMGGuided.uds.refresh({keepOpen:true,autoOpen:true});
      }
    }catch(e){}
  }
  function soon(){setTimeout(restoreUdsMiddle,0);setTimeout(restoreUdsMiddle,160);setTimeout(restoreUdsMiddle,500);}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',soon,{once:true}); else soon();
  document.addEventListener('click',function(e){
    if(e.target&&e.target.closest&&e.target.closest('.tab[data-tab="uds"], [data-jump-tab="uds"]')) soon();
  },true);
  try{
    var root=document.getElementById('panel-uds');
    if(root){
      new MutationObserver(function(){restoreUdsMiddle();}).observe(root,{childList:true,subtree:false});
    }
  }catch(e){}
  try{window.IPMG_RC_VERSION='RC5.27 UDS Middle Column Restore';}catch(e){}
})();
/* </script> */

;

/* Legacy runtime block 9: <script> */
/* ===================== RC5.28: collapse artifact polish + natural guided behavior ===================== */
(function(){
  if(window.__IPMG_RC528_COLLAPSE_POLISH__) return;
  window.__IPMG_RC528_COLLAPSE_POLISH__=true;
  var CHEV='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"></path></svg>';
  function closest(el,sel){return el&&el.closest?el.closest(sel):null;}
  function isInteractiveTarget(el){return !!closest(el,'button,input,select,textarea,a,.chip,.mini,.sample-pack-btn,.sample-intent-chip,.sample-sig-btn,.uds-panel,[data-udscopy]');}
  function levelOf(card){
    if(!card) return 'needs';
    if(card.classList.contains('review')) return 'review';
    if(card.classList.contains('done')||card.classList.contains('ready')) return 'ready';
    if(card.classList.contains('needs')) return 'needs';
    var chip=card.querySelector('[data-guided-status]');
    var txt=chip?String(chip.textContent||'').toLowerCase():'';
    if(/review|invalid|do not|provider/.test(txt)) return 'review';
    if(/ready|entered|selected|complete|trace ready|device ready|plan active/.test(txt)) return 'ready';
    return 'needs';
  }
  function polishChevrons(root){
    root=root||document;
    var nodes=root.querySelectorAll('[data-guided-chevron], .sample-guide-chevron, .uds-guide-chevron, .refcard .rh .chev, .kb-card .chev');
    Array.prototype.forEach.call(nodes,function(node){
      if(!node||node.dataset.ipmgChevronPolished==='1') return;
      node.dataset.ipmgChevronPolished='1';
      node.innerHTML=CHEV;
      node.setAttribute('aria-hidden','true');
    });
  }
  function closeCard(card){
    if(!card) return;
    card.classList.remove('open');
    var head=card.querySelector('[data-guided-head]');
    if(head) head.setAttribute('aria-expanded','false');
  }
  function openCard(card){
    if(!card) return;
    var root=card.parentElement;
    if(root){
      Array.prototype.forEach.call(root.querySelectorAll(':scope > .guided-card[data-guide], :scope > .sample-guide-card[data-guide], :scope > .uds-guide-card[data-guide]'),function(other){
        if(other!==card) closeCard(other);
      });
    }
    card.classList.add('open');
    var head=card.querySelector('[data-guided-head]');
    if(head) head.setAttribute('aria-expanded','true');
  }
  function firstFocusable(card){
    if(!card) return null;
    var fields=card.querySelectorAll('.guided-body input:not([type=hidden]):not([disabled]), .guided-body select:not([disabled]), .guided-body textarea:not([disabled])');
    for(var i=0;i<fields.length;i++){
      var el=fields[i];
      var val=('value' in el)?String(el.value||'').trim():'';
      if(!val) return el;
    }
    return fields[0]||null;
  }
  function pulseNeeds(card){
    if(!card) return;
    openCard(card);
    card.classList.remove('ipmg-needs-attention');
    void card.offsetWidth;
    card.classList.add('ipmg-needs-attention');
    setTimeout(function(){card.classList.remove('ipmg-needs-attention');},520);
    var el=firstFocusable(card);
    if(el&&typeof el.focus==='function') setTimeout(function(){try{el.focus({preventScroll:true});}catch(e){try{el.focus();}catch(_){} }},40);
  }
  function refreshContinueState(root){
    root=root||document;
    var cards=root.querySelectorAll('.guided-card[data-guide], .sample-guide-card[data-guide], .uds-guide-card[data-guide]');
    Array.prototype.forEach.call(cards,function(card){
      var btn=card.querySelector('.guided-continue, .sample-guide-continue, .uds-guide-continue');
      if(!btn||btn.classList.contains('secondary')) return;
      var level=levelOf(card);
      var incomplete=level!=='ready';
      btn.classList.toggle('is-disabled',incomplete);
      btn.setAttribute('aria-disabled',String(incomplete));
      btn.title=incomplete?'Complete or resolve this section before continuing.':'Continue to the next unfinished section.';
    });
  }
  function sweep(){polishChevrons(document);refreshContinueState(document);}

  document.addEventListener('click',function(e){
    var btn=closest(e.target,'.guided-continue, .sample-guide-continue, .uds-guide-continue');
    if(btn&&!btn.classList.contains('secondary')){
      var card=closest(btn,'.guided-card[data-guide], .sample-guide-card[data-guide], .uds-guide-card[data-guide]');
      if(card&&levelOf(card)!=='ready'){
        e.preventDefault();
        e.stopImmediatePropagation();
        pulseNeeds(card);
        return false;
      }
    }
    var head=closest(e.target,'[data-guided-head]');
    if(!head||isInteractiveTarget(e.target)) return;
    var card=closest(head,'.guided-card[data-guide], .sample-guide-card[data-guide], .uds-guide-card[data-guide]');
    if(!card) return;
    var open=card.classList.contains('open');
    var tappedChevron=!!closest(e.target,'[data-guided-chevron], .guided-chevron, .sample-guide-chevron, .uds-guide-chevron');
    var level=levelOf(card);
    if(open&&(tappedChevron||level==='ready')){
      e.preventDefault();
      e.stopImmediatePropagation();
      closeCard(card);
      return false;
    }
    if(!open){
      /* Let the built-in guided controller update the official state, but polish immediately. */
      setTimeout(sweep,0);
    }
  },true);

  document.addEventListener('keydown',function(e){
    if(e.key!=='Enter'&&e.key!==' ') return;
    var head=closest(e.target,'[data-guided-head]');
    if(!head) return;
    var card=closest(head,'.guided-card[data-guide], .sample-guide-card[data-guide], .uds-guide-card[data-guide]');
    if(!card) return;
    if(card.classList.contains('open')&&levelOf(card)==='ready'){
      e.preventDefault();
      e.stopImmediatePropagation();
      closeCard(card);
    }
  },true);

  var mo=null;
  function boot(){
    sweep();
    try{
      mo=new MutationObserver(function(){sweep();});
      mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-guided-prepared']});
    }catch(e){}
    ['input','change','click'].forEach(function(ev){
      document.addEventListener(ev,function(){setTimeout(refreshContinueState,80);},true);
    });
    try{window.IPMG_RC_VERSION='RC5.28 Collapse Polish';}catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
/* </script> */

;

/* Legacy runtime block 10: <script id="rc529InjectionSiteBehaviorScript"> */
/* ===================== RC5.29: injection site behavior hardening ===================== */
(function(){
  'use strict';
  const VERSION='RC5.29 Injection Site Behavior';
  const by=id=>document.getElementById(id);
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const hasS=()=>{try{return typeof S!=='undefined';}catch(e){return false;}};
  const norm=site=>{try{return typeof normalizeAdminSite==='function'?normalizeAdminSite(site||''):(site||'');}catch(e){return site||'';}};
  const display=site=>{try{return typeof adminSiteDisplay==='function'?adminSiteDisplay(site):site;}catch(e){return site;}};
  const rule=()=>{try{return typeof medAdminRule==='function'?medAdminRule(S.med,S.dose):{route:[],sites:[]};}catch(e){return {route:[],sites:[]};}};
  const routeFromSite=site=>{try{const m=(ADMIN_SITE_LIBRARY||[]).find(x=>x.id===site);return m&&m.route||'';}catch(e){return '';}};
  const siteTag=mode=>{
    const tag=by('siteAuto'); if(!tag)return;
    tag.classList.remove('site-picked','site-needed');
    if(mode==='picked'){
      tag.textContent='selected'; tag.classList.add('site-picked'); tag.style.display='';
    }else if(mode==='needed'){
      tag.textContent='choose'; tag.classList.add('site-needed'); tag.style.display='';
    }else{
      tag.textContent='manual'; tag.style.display='';
    }
  };
  const openMedicationCard=()=>{
    const card=q('#panel-administer .card-medication');
    if(card){card.dataset.rc526Manual='open';card.classList.add('rc526-open');card.classList.remove('rc526-collapsed');}
  };
  const forceCompactRefresh=()=>{
    try{ if(typeof renderInjQa==='function')renderInjQa(); }catch(e){}
    try{ if(typeof render==='function')render(); }catch(e){}
    try{ if(typeof renderAdminGuide==='function')renderAdminGuide(); }catch(e){}
  };

  function clearSiteIfInvalid(){
    if(!hasS()||!S.med)return;
    const r=rule();
    const current=norm(S.site||'');
    if(current && (r.sites||[]).includes(current)){
      S.site=current;
      siteTag('picked');
      return;
    }
    S.site='';
    const smartSuggestion=typeof window.injectionRecommendedSite==='function'?window.injectionRecommendedSite(r):'';
    S.siteSuggestion=smartSuggestion||(r.sites&&r.sites[0])||'';
    S.adminGuideCollapsed=false;
    siteTag('needed');
  }

  function applyMedDoseRulesNatural(){
    if(!hasS()||!S.med)return;
    const r=rule();
    if(r.route&&r.route.length===1)S.route=r.route[0];
    else if(!S.route&&r.route&&r.route.length)S.route=r.route[0];
    clearSiteIfInvalid();
  }

  function selectMedNatural(m){
    if(!hasS())return;
    S.med=m;
    S.dose='';
    S.site='';
    S.siteSuggestion='';
    S.route=m.route||'';
    S.intervalKey='';
    S.retCustom=false;
    S.adminGuideCollapsed=false;
    S.needleGuideOpen=false;
    S.flags={};
    const tech=by('tech'); if(tech)tech.value=m.tech||'';
    const intAuto=by('intAuto'); if(intAuto)intAuto.style.display='';
    siteTag('needed');
    if(m.ndc){const n=by('ndc'); if(n){n.value=m.ndc;n.classList.add('auto');}}
    const medHdr=by('medHdr'); if(medHdr)medHdr.classList.add('show');
    const medHdrName=by('medHdrName'); if(medHdrName)medHdrName.textContent=m.label;
    const medHdrGen=by('medHdrGen'); if(medHdrGen)medHdrGen.textContent=m.gen||'manual entry';
    const grp=by('medChipsGrp'); if(grp)grp.classList.add('hidden');
    const detail=by('medDetail'); if(detail)detail.classList.remove('hidden');
    const tip=by('medTip'), tipTxt=by('medTipTxt');
    if(tip){ if(m.tip){tip.classList.add('show'); if(tipTxt)tipTxt.textContent=m.tip;} else tip.classList.remove('show'); }
    applyMedDoseRulesNatural();
    openMedicationCard();
    try{renderDoses();}catch(e){}
    try{renderSites();}catch(e){}
    try{renderRoutes();}catch(e){}
    try{renderIntervals();}catch(e){}
    try{renderMedSpec();}catch(e){}
    try{renderInjSafetyChips();}catch(e){}
    try{recalcNext();}catch(e){}
    try{render();}catch(e){}
  }

  function selectAdminSiteNatural(site,allowed=true){
    if(!hasS())return;
    const s=norm(site||'');
    S.site=s;
    const rt=routeFromSite(s);
    if(rt)S.route=rt;
    S.adminGuideCollapsed=!!allowed;
    siteTag('picked');
    openMedicationCard();
    if(!allowed){try{toast('Selected site is outside usual guidance — verify provider direction');}catch(e){}}
    try{renderSites();}catch(e){}
    try{renderRoutes();}catch(e){}
    forceCompactRefresh();
    document.dispatchEvent(new CustomEvent('ipmg:siteconfirmed',{detail:{site:s,allowed:!!allowed,focusAfter:true}}));
  }

  function renderRoutesNatural(){
    const b=by('routeChips');if(!b)return;b.innerHTML='';
    const r=rule();
    const routes=Array.from(new Set([...(r.route||[]), ...((hasS()&&S.med&&S.med.key==='other')?['IM','SubQ','IM (deep)']:[])]));
    routes.forEach(rt=>{
      const chip=chipEl(rt,hasS()&&S.route===rt,'sm',()=>{
        S.route=rt;
        const current=norm(S.site||'');
        if(current && routeFromSite(current) && routeFromSite(current)!==rt){S.site='';S.adminGuideCollapsed=false;siteTag('needed');}
        openMedicationCard();
        try{renderRoutes();}catch(e){}
        try{renderSites();}catch(e){}
        try{render();}catch(e){}
      });
      b.appendChild(chip);
    });
    try{renderAdminGuide();}catch(e){}
  }

  function renderAdminGuideNatural(){
    const r=rule();
    const title=by('adminGuideTitle'),sub=by('adminGuideSub'),pill=by('adminRoutePill'),allowed=by('adminAllowedText'),sel=by('adminSelectedText'),status=by('adminStatusText');
    const summary=by('adminGuideSummary'), summaryLine=by('adminGuideSummaryLine'), summarySub=by('adminGuideSummarySub');
    const routeText=(r.route||[]).join(' / ')||'Route';
    const selected=hasS()?norm(S.site||''):'';
    const suggested=(hasS()&&S.siteSuggestion)||((r.sites&&r.sites[0])||'');
    const medName=hasS()&&S.med?(S.med.label||S.med.name||'Medication'):'Select a medication';
    const doseText=hasS()&&S.dose?` ${S.dose}`:'';
    if(title)title.textContent=medName;
    if(sub)sub.textContent=(r.summary||'')+' '+(r.note||'');
    if(pill)pill.textContent=routeText;
    if(allowed){
      let groupText='Manual site selection';
      try{groupText=(adminAllowedText(r)||'').replace(/^.*?·\s*/,'')||groupText;}catch(e){}
      allowed.innerHTML=`<div class="admin-route-row"><span class="admin-route-badge">${safe(routeText)}</span><span class="smallmuted">Usual route</span></div><div class="admin-site-groups"><b>Usual sites:</b> ${safe(groupText)}</div>`;
    }
    if(sel){
      if(selected){
        sel.innerHTML=`<div class="sel-med">${safe(medName+doseText)}</div><div class="sel-line"><b>${safe(S.route||'route pending')}</b> · ${safe(display(selected))}</div>`;
      }else{
        sel.innerHTML=`<div class="sel-med">${safe(medName+doseText)}</div><div class="sel-line"><b>${safe(S.route||routeText||'route pending')}</b> · site not selected</div><div class="smallmuted">Choose the actual site used. Suggested first option: ${safe(display(suggested)||'—')}.</div>`;
      }
    }
    let statusText='Choose the actual administration site before documenting.';
    let statusClass='warn';
    if(!hasS()||!S.med){statusText='Select medication, route, and site to confirm alignment.';statusClass='';}
    else if(selected){
      try{
        if(siteIsAllowed(selected)){statusClass='ok';statusText='Matches medication guidance. You can still change this site before documenting.';}
        else{statusClass='warn';statusText='Needs confirmation — selected route or site is outside usual guidance for this medication.';}
      }catch(e){}
    }
    if(status){status.className='admin-status';if(statusClass)status.classList.add(statusClass);status.textContent=statusText;}
    if(summaryLine){
      summaryLine.textContent=selected?`${medName}${doseText} · ${S.route||'Route pending'} · ${display(selected)}`:`${medName}${doseText} · choose actual site`;
    }
    if(summarySub)summarySub.textContent=statusText;
    if(summary)summary.classList.toggle('hidden',!selected||!(hasS()&&S.adminGuideCollapsed));
    try{setAdminGuideCollapsed(!!(hasS()&&S.adminGuideCollapsed&&selected));}catch(e){
      const detail=by('adminGuideDetail'); if(detail)detail.classList.toggle('hidden',!!(hasS()&&S.adminGuideCollapsed&&selected));
      if(summary)summary.classList.toggle('hidden',!(hasS()&&S.adminGuideCollapsed&&selected));
    }
    try{renderBodyMap();}catch(e){}
    try{renderNeedleGuide();}catch(e){}
    siteTag(selected?'picked':'needed');
  }

  function markSuggestedOptions(){
    if(!hasS())return;
    const suggested=S.siteSuggestion||'';
    if(!suggested)return;
    qa('#panel-administer .site-option').forEach(btn=>{
      btn.classList.toggle('suggested',btn.dataset.site===suggested&&!S.site);
      const badge=btn.querySelector('.site-option-badge');
      if(badge&&btn.dataset.site===suggested&&!S.site)badge.textContent='suggested';
    });
  }
  const prevRenderBodyMap=window.renderBodyMap;
  if(typeof prevRenderBodyMap==='function'){
    window.renderBodyMap=function(){const r=prevRenderBodyMap.apply(this,arguments);markSuggestedOptions();return r;};
  }

  function install(){
    try{window.applyMedDoseRules=applyMedDoseRulesNatural;applyMedDoseRules=applyMedDoseRulesNatural;}catch(e){window.applyMedDoseRules=applyMedDoseRulesNatural;}
    try{window.selectMed=selectMedNatural;selectMed=selectMedNatural;}catch(e){window.selectMed=selectMedNatural;}
    try{window.selectAdminSite=selectAdminSiteNatural;selectAdminSite=selectAdminSiteNatural;}catch(e){window.selectAdminSite=selectAdminSiteNatural;}
    try{window.renderRoutes=renderRoutesNatural;renderRoutes=renderRoutesNatural;}catch(e){window.renderRoutes=renderRoutesNatural;}
    try{window.renderAdminGuide=renderAdminGuideNatural;renderAdminGuide=renderAdminGuideNatural;}catch(e){window.renderAdminGuide=renderAdminGuideNatural;}

    document.addEventListener('click',e=>{
      const sum=e.target.closest&&e.target.closest('#panel-administer .rc526-summary');
      if(sum){const card=sum.closest('.inj-card');if(card){card.dataset.rc526Manual='open';card.classList.add('rc526-open');card.classList.remove('rc526-collapsed');}}
      const edit=e.target.closest&&e.target.closest('#adminGuideEdit');
      if(edit){openMedicationCard();}
    },true);
    document.addEventListener('focusin',e=>{
      const card=e.target.closest&&e.target.closest('#panel-administer .inj-card');
      if(card){card.dataset.rc526Manual='open';card.classList.add('rc526-open');card.classList.remove('rc526-collapsed');}
    },true);
    document.addEventListener('click',e=>{
      const card=e.target.closest&&e.target.closest('#panel-administer .card-medication');
      if(card&&!e.target.closest('.rc526-summary')){card.dataset.rc526Manual='open';card.classList.add('rc526-open');card.classList.remove('rc526-collapsed');}
    },true);

    try{renderMeds();}catch(e){}
    try{renderSites();}catch(e){}
    try{renderRoutes();}catch(e){}
    try{renderAdminGuide();}catch(e){}
    try{window.IPMG_RC_VERSION=VERSION;}catch(e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
/* </script> */

;

/* Legacy runtime block 11: <script id="rc530UnifiedGuidedLogicScript"> */
/* ===================== RC5.30: unified confirm-first guided logic ===================== */
(function(){
  'use strict';
  const VERSION='RC5.30 Unified Guided Logic';
  const $=id=>document.getElementById(id);
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const text=id=>{const el=$(id);return el&&'value' in el?String(el.value||'').trim():'';};
  const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const rootState=window.__IPMG_RC530__||(window.__IPMG_RC530__={inj:{},uds:{},samples:{},safetyNone:false,manualOpen:{inj:{},uds:{},samples:{}}});
  const hasS=()=>{try{return typeof S!=='undefined';}catch(e){return false;}};
  const hasUDS=()=>{try{return typeof UDS!=='undefined';}catch(e){return false;}};
  const med=()=>{try{return hasS()?S.med:null;}catch(e){return null;}};
  const sget=(k,f='')=>{try{return hasS()?(S[k]||f):f;}catch(e){return f;}};
  const prettyDate=s=>{try{return s&&typeof fmtDate==='function'?fmtDate(s):s;}catch(e){return s||'';}};
  const responseLabel=()=>{try{const k=sget('resp',''); const arr=typeof RESP!=='undefined'?RESP:[]; const hit=arr.find(x=>x.k===k); if(k==='custom')return text('respCustom')||'custom response'; return hit?(hit.l||hit.s||k):k;}catch(e){return '';}};
  const getSafetyGuards=()=>{try{return typeof window.selectedSafetyGuards==='function'?window.selectedSafetyGuards():[];}catch(e){return [];}};
  const counts=()=>{try{const panels=typeof UDS_PANELS!=='undefined'?UDS_PANELS:[]; const res=(UDS&&UDS.results)||{}; return {neg:panels.filter(p=>res[p]==='neg').length,pos:panels.filter(p=>res[p]==='pos').length,invalid:panels.filter(p=>res[p]==='invalid').length,nt:panels.filter(p=>res[p]==='nt').length,tested:panels.filter(p=>res[p]&&res[p]!=='nt').length,total:panels.length};}catch(e){return {neg:0,pos:0,invalid:0,nt:0,tested:0,total:0};}};
  function vDecision(){
    const rule=$('vitalsRulePanel');
    const needed=!!(rule&&(rule.classList.contains('need')||rule.classList.contains('required')));
    const required=!!(rule&&rule.classList.contains('required'));
    const smart=$('vitalsSmartPanel');
    const abnormal=!!(smart&&(smart.classList.contains('need')||smart.classList.contains('danger'))&&!q('.vitals-recheck-chip.on',smart));
    const any=!!(text('bp')||text('hr')||text('temp')||text('rr')||text('spo2')||text('vitalRepeatNote'));
    const hasCore=!!(text('bp')&&text('hr'));
    return {needed,required,abnormal,any,hasCore,missing:needed&&!hasCore,complete:(!needed||hasCore)&&!abnormal};
  }
  function hasReviewTriggers(){return getSafetyGuards().length>0;}
  function panelOf(workflow){return workflow==='inj'?'#panel-administer':workflow==='uds'?'#panel-uds':'#panel-samples';}
  function pulse(el){if(!el)return;el.classList.remove('rc530-pulse');void el.offsetWidth;el.classList.add('rc530-pulse');setTimeout(()=>el.classList.remove('rc530-pulse'),650);}

  const INJ_ORDER=['encounter','med','safety','trace','response','return'];
  const INJ_SELECTORS={encounter:'.card-encounter',med:'.card-medication',trace:'.card-trace',safety:'.card-safety',return:'.card-return',response:'.card-response'};
  function injCard(id){return q(`#panel-administer ${INJ_SELECTORS[id]}`);}
  function ensureInjResponseCard(){const c=$('respChips')&&$('respChips').closest('.card'); if(c)c.classList.add('inj-card','card-response'); return c;}
  function administrationDetailStops(section){try{const disposition=typeof window.ipmgClinicalDispositionSnapshot==='function'?window.ipmgClinicalDispositionSnapshot():null;const requireAdministrationDetail=!disposition||!disposition.kind||disposition.kind==='administered';const detail=typeof window.ipmgInjectionDetailReview==='function'?window.ipmgInjectionDetailReview({requireAdministrationDetail}):null;return detail&&detail.bySection&&Array.isArray(detail.bySection[section])?detail.bySection[section]:[];}catch(e){return [];}}
  function medLine(){const m=med(); if(!m)return ''; const site=sget('site'); const parts=[m.label||m.name||'Medication',sget('dose'),sget('route'),site].filter(Boolean); return parts.join(' · ');}
  function injStatus(id){
    const m=med(); const vit=vDecision(); const guards=getSafetyGuards();
    if(id==='encounter'){
      const ok=!!(text('ptName')&&text('orderingProvider'));
      const miss=[!text('ptName')?'patient':null,!text('orderingProvider')?'ordering provider':null].filter(Boolean);
      return {ok,block:!ok,label:ok?'Confirmed':'Needs info',summary:ok?`${text('ptName')}${text('ptDOB')?' · DOB '+text('ptDOB'):''} · ${text('orderingProvider')}`:`Add ${miss.join(' and ')}.`};
    }
    if(id==='med'){
      const ok=!!(m&&sget('dose')&&sget('route')&&sget('site')&&sget('intervalKey'));
      const miss=[!m?'medication':null,!(sget('dose'))?'dose':null,!(sget('route'))?'route':null,!(sget('site'))?'actual site':null,!(sget('intervalKey'))?'ordered interval':null].filter(Boolean);
      return {ok,block:!ok,label:ok?'Confirmed':'Needs selection',summary:ok?medLine():`Select ${miss.join(', ')}. App suggestions do not select the actual site.`};
    }
    if(id==='trace'){
      const detailStops=administrationDetailStops('trace');
      if(detailStops.length)return {ok:false,block:true,label:'Needs trace',summary:detailStops[0]};
      const ok=!!(text('lot')&&text('exp'));
      return {ok,block:!ok,label:ok?'Trace confirmed':'Needs trace',summary:ok?`Lot ${text('lot')} · Exp ${text('exp')}${text('ndc')?' · NDC '+text('ndc'):''}`:'Enter lot and expiration from the physical product.'};
    }
    if(id==='safety'){
      if(!m)return {ok:false,block:true,label:'Waiting',summary:'Select medication first.'};
      if(!rootState.safetyNone&&!guards.length)return {ok:false,block:true,label:'Not confirmed',summary:'Choose “No acute concerns today” or select a provider-review trigger.'};
      if(vit.missing)return {ok:false,block:true,label:'Vitals needed',summary:'BP/HR recommended by medication/symptom logic before continuing.'};
      if(vit.abnormal)return {ok:false,block:true,label:'Recheck vitals',summary:'Abnormal vitals should be repeated/confirmed before continuing.'};
      if(guards.length)return {ok:true,review:true,label:'Review acknowledged',summary:'Provider-review trigger selected: '+guards.map(g=>g.t||g.id||'review').join(', ')};
      return {ok:true,label:'Safety confirmed',summary:vit.needed?'Vitals captured for rule-supported trigger.':'No acute concerns confirmed; vitals not automatically indicated.'};
    }
    if(id==='return'){
      if(!m)return {ok:false,block:true,label:'Waiting',summary:'Select medication first.'};
      const once=!!(m&&sget('intervalKey')==='once'); const ok=!!(m&&(once||text('nextDate')));
      return {ok,block:!ok,label:ok?'Follow-up confirmed':'Needs date',summary:ok?(once?'One-time/initiation dose — routine interval not required.':'Next due '+prettyDate(text('nextDate'))):'Confirm the next dose date or ordered one-time plan.'};
    }
    if(id==='response'){
      const detailStops=[...administrationDetailStops('return'),...administrationDetailStops('response')];
      if(detailStops.length)return {ok:false,block:true,label:'Needs administration',summary:detailStops[0]};
      const ok=!!(text('adminDate')&&text('admin')&&sget('resp')&&(sget('resp')!=='custom'||text('respCustom')));
      return {ok,block:!ok,label:ok?'Administration confirmed':'Needs administration',summary:ok?`${prettyDate(text('adminDate'))}${text('injAdminTime')?' · '+text('injAdminTime'):''} · ${responseLabel()} · ${text('admin')}`:'Document the administration date/time, patient response, and administered-by.'};
    }
    return {ok:false,block:true,label:'Needs info',summary:'Complete this section.'};
  }
  function ensureInjSafetyChoice(){
    const card=injCard('safety'); if(!card||$('rc530SafetyConfirm'))return;
    const div=document.createElement('div'); div.id='rc530SafetyConfirm'; div.className='rc530-safety-confirm';
    div.innerHTML='<div class="rc530-title">Required staff confirmation</div><button type="button" class="rc530-choice" data-rc530-noacute>No acute concerns today</button><span class="rc530-confirm-note">or select a provider-review trigger below</span>';
    const gate=$('rc526SafetyGate'); const head=q('.card-head',card);
    if(gate) gate.insertAdjacentElement('afterend',div); else if(head) head.insertAdjacentElement('afterend',div); else card.insertBefore(div,card.firstChild);
  }
  function ensureInjFooters(){
    ensureInjResponseCard();
    INJ_ORDER.forEach(id=>{
      const card=injCard(id); if(!card)return;
      card.classList.add('inj-card'); card.dataset.rc530Id=id;
      if(!q(':scope > .rc530-summary',card)){
        const sum=document.createElement('button');sum.type='button';sum.className='rc530-summary';sum.setAttribute('aria-label',`Open ${labelFor(id,'inj')} section`);
        const head=q(':scope > .card-head',card); if(head)head.insertAdjacentElement('afterend',sum); else card.insertBefore(sum,card.firstChild);
        sum.addEventListener('click',()=>openInj(id,true,true));
      }
      if(!q(':scope .rc530-footer',card)){
        const foot=document.createElement('div'); foot.className='rc530-footer';
        foot.innerHTML='<div class="rc530-footnote">Routine sections auto-confirm once their required fields are complete. Open any section to adjust an exception.</div><button type="button" class="rc530-continue" data-rc530-inj-continue="'+safe(id)+'">Continue</button>';
        card.appendChild(foot);
      }
      const head=q(':scope > .card-head',card); if(head&&!head.dataset.rc530Head){head.dataset.rc530Head='1'; head.addEventListener('click',()=>{ if(card.classList.contains('rc530-collapsed'))openInj(id,true);});}
    });
  }
  function setSafetyNone(on){rootState.safetyNone=!!on; if(on){try{ if(hasS()&&S.injSafety) Object.keys(S.injSafety).forEach(k=>S.injSafety[k]=false); if(typeof renderInjSafetyChips==='function')renderInjSafetyChips();}catch(e){}} unconfirm('inj','safety',true); refreshAll();}
  function revealIfNeeded(card){
    const rect=card.getBoundingClientRect(),pad=18;
    if(rect.top>=pad&&rect.bottom<=window.innerHeight-pad)return;
    const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try{card.scrollIntoView({behavior:reduced?'auto':'smooth',block:'nearest'});}catch(e){}
  }
  function openInj(id,manual,focusInside=false){
    const card=injCard(id);if(!card)return;
    if(manual){
      INJ_ORDER.forEach(section=>{rootState.manualOpen.inj[section]=section===id;});
      reconcileInj();
    }else rootState.manualOpen.inj[id]=true;
    card.classList.add('rc530-open');card.classList.remove('rc530-collapsed');card.dataset.rc526Manual='open';card.classList.remove('rc526-collapsed');
    if(manual)revealIfNeeded(card);
    if(focusInside)requestAnimationFrame(()=>{
      const target=q(':scope > .card-head h2,:scope > .card-head h3,:scope > .card-head',card);
      if(target){target.tabIndex=-1;target.focus({preventScroll:true});}
    });
  }
  rootState.openInjection=openInj;
  function closeInj(id){const card=injCard(id); if(!card)return; card.classList.remove('rc530-open'); card.classList.add('rc530-collapsed'); card.dataset.rc526Manual='auto';}
  function firstUnconfirmedInj(){return INJ_ORDER.find(id=>!rootState.inj[id]||injStatus(id).block||injStatus(id).review)||null;}
  function confirmInj(id){
    const st=injStatus(id); const card=injCard(id);
    if(st.block){pulse(card); try{toast(st.summary);}catch(e){} return;}
    rootState.inj[id]=true; rootState.manualOpen.inj[id]=false;
    const next=INJ_ORDER[INJ_ORDER.indexOf(id)+1];
    refreshAll();
    if(next) setTimeout(()=>openInj(next,true),80);
  }
  function reconcileInj(){
    ensureInjSafetyChoice(); ensureInjFooters(); ensureReadyCard('inj');
    const active=firstUnconfirmedInj();
    const manualActive=INJ_ORDER.find(id=>rootState.manualOpen.inj[id])||'';
    INJ_ORDER.forEach(id=>{
      const card=injCard(id); if(!card)return; const st=injStatus(id);
      if(window.IPMG_FAST_REVIEW&&st.ok&&!st.block&&!st.review)rootState.inj[id]=true;
      const confirmed=!!rootState.inj[id]&&!st.block;
      const sum=q(':scope > .rc530-summary',card);
      if(sum){sum.className='rc530-summary '+(st.block?'need':st.review?'review':'ready'); sum.innerHTML=`<span class="edit">edit</span><span class="state">${safe(confirmed?(st.review?'review':'done'):(st.block?'needs info':'confirm'))}</span><b>${safe(labelFor(id,'inj'))}:</b> ${safe(st.summary)}`;}
      const btn=q(':scope .rc530-continue',card); if(btn){btn.textContent=st.review?'Acknowledge & continue':st.block?'Complete required fields':'Confirm & continue'; btn.classList.toggle('warn',!!st.review); btn.classList.toggle('blocked',!!st.block);}
      const shouldCollapse=confirmed&&!st.review&&!rootState.manualOpen.inj[id];
      const shouldOpen=manualActive?id===manualActive:(!confirmed&&id===active)||st.review&&confirmed;
      const queued=!confirmed&&!shouldOpen&&(!!manualActive||id!==active);
      if(sum){
        const stateLabel=confirmed?(st.review?'review required':'complete'):(st.block?'needs attention':'ready to confirm');
        sum.setAttribute('aria-label',`${labelFor(id,'inj')} — ${stateLabel}: ${st.summary}`);
        sum.setAttribute('aria-expanded',String(!!shouldOpen));
        sum.setAttribute('aria-current',id===active?'step':'false');
      }
      card.classList.toggle('rc530-collapsed',!!(shouldCollapse||queued)&&!shouldOpen);
      card.classList.toggle('rc530-open',!!shouldOpen);
      card.classList.toggle('rc530-queued',!!queued);
      card.classList.toggle('rc530-active',id===active&&!confirmed);
      /* RC5.26 previously had a competing card-collapse system. RC5.30 is the
         single receipt owner, so clear every legacy collapse class on each pass. */
      card.classList.remove('rc526-complete','rc526-collapsed','rc526-active','rc526-open');
      card.dataset.rc526Manual='open';
    });
    const no=$('[data-rc530-noacute]'); if(no)no.classList.toggle('on',!!rootState.safetyNone);
    const guards=getSafetyGuards(); if(guards.length&&rootState.safetyNone)rootState.safetyNone=false;
  }

  const GUIDED_ORDER={uds:['encounter','device','results','review','output'],samples:['patient','selected','plan','trace','safety','output']};
  function guidedCard(workflow,id){return q(`${panelOf(workflow)} .guided-card[data-guide="${CSS.escape(id)}"], ${panelOf(workflow)} .sample-guide-card[data-guide="${CSS.escape(id)}"], ${panelOf(workflow)} .uds-guide-card[data-guide="${CSS.escape(id)}"]`);}
  function guidedStatus(workflow,id){
    try{const g=window.IPMGGuided&&(workflow==='uds'?window.IPMGGuided.uds:window.IPMGGuided.samples); if(g&&typeof g.status==='function'){const s=g.status(id); return {level:s.level||'needs',label:s.label||'',summary:s.preview||''};}}catch(e){}
    return {level:'needs',label:'Needs info',summary:'Complete this section.'};
  }
  function guidedCanConfirm(workflow,id){
    const s=guidedStatus(workflow,id); const block=s.level==='needs'; const review=s.level==='review'; return {ok:!block,block,review,label:s.label,summary:s.summary};
  }
  function openGuided(workflow,id){
    const card=guidedCard(workflow,id); if(!card)return;
    const guide=window.IPMGGuided&&(workflow==='uds'?window.IPMGGuided.uds:window.IPMGGuided.samples);
    if(guide&&typeof guide.open==='function'){guide.open(id,false);return;}
    const container=card.parentElement;
    if(container)qa(':scope > .guided-card, :scope > .sample-guide-card, :scope > .uds-guide-card',container).forEach(item=>{
      const open=item===card;item.classList.toggle('open',open);q('[data-guided-head]',item)?.setAttribute('aria-expanded',String(open));
    });
  }
  function closeGuided(workflow,id){const card=guidedCard(workflow,id); if(!card)return; card.classList.remove('open'); const head=q('[data-guided-head]',card); if(head)head.setAttribute('aria-expanded','false');}
  function firstGuided(workflow){const order=GUIDED_ORDER[workflow]||[]; return order.find(id=>id!=='output'&&(!rootState[workflow][id]||guidedCanConfirm(workflow,id).block||guidedCanConfirm(workflow,id).review))||'output';}
  function confirmGuided(workflow,id){
    if(id==='output'){const tray=q(`${panelOf(workflow)} .preview-col`); if(tray)pulse(tray); return;}
    const st=guidedCanConfirm(workflow,id); const card=guidedCard(workflow,id);
    if(st.block){pulse(card); try{toast(st.summary);}catch(e){} return;}
    rootState[workflow][id]=true; rootState.manualOpen[workflow][id]=false;
    closeGuided(workflow,id);
    const order=GUIDED_ORDER[workflow]||[]; const next=order[order.indexOf(id)+1]||'output';
    refreshAll(); setTimeout(()=>openGuided(workflow,next),70);
  }
  function reconcileGuided(workflow){
    const order=GUIDED_ORDER[workflow]||[]; if(!order.length)return;
    ensureReadyCard(workflow);
    const active=firstGuided(workflow);
    order.forEach(id=>{
      const card=guidedCard(workflow,id); if(!card)return; const st=guidedCanConfirm(workflow,id);
      if(window.IPMG_FAST_REVIEW&&id!=='output'&&!st.block&&!st.review)rootState[workflow][id]=true;
      const confirmed=!!rootState[workflow][id]&&!st.block;
      const status=q('[data-guided-status]',card); if(status){
        status.textContent=id==='output'?(st.block?st.label:(st.review?st.label:(allReady(workflow)?'Ready':'Waiting'))):(st.block?st.label:(confirmed?(st.review?'Review':'Confirmed'):'Confirm'));
      }
      /* Review cards are confirmable; keep their custom review styling but let the older
         RC5.28 continue-guard see them as ready once required fields are present. */
      if(id!=='output'){
        card.classList.toggle('done',!st.block);
        card.classList.toggle('needs',!!st.block);
        card.classList.remove('review');
      }
      card.classList.toggle('rc530-needs-confirm',!confirmed&&!st.block&&id!=='output');
      card.classList.toggle('rc530-confirmed',!!confirmed&&!st.review);
      card.classList.toggle('rc530-review-ack',!!confirmed&&!!st.review);
      const btn=q('.guided-continue,.sample-guide-continue,.uds-guide-continue',card);
      if(btn&&!btn.classList.contains('secondary')){
        btn.textContent=st.block?'Complete required fields':st.review?'Acknowledge & continue':confirmed?'Edit / continue':'Confirm & continue';
        btn.classList.toggle('is-disabled',!!st.block);
        btn.classList.toggle('warn',!!st.review);
      }
      const prev=q('[data-guided-preview]',card); if(prev&&id!=='output'){
        const prefix=confirmed?(st.review?'Review acknowledged · ':'Confirmed · '):(st.block?'Needs info · ':'Ready to confirm · ');
        prev.textContent=prefix+(st.summary||'');
      }
    });
    const openCards=order.map(id=>guidedCard(workflow,id)).filter(card=>card&&card.classList.contains('open'));
    if(!openCards.length)openGuided(workflow,active);
    else{
      /* The base guided stack is the only open/close owner. Reconcile data and
         labels here, but keep DOM state and aria-expanded in lockstep. */
      openCards.forEach(card=>q('[data-guided-head]',card)?.setAttribute('aria-expanded','true'));
      if(openCards.length>1){
        const preferred=openCards.find(card=>rootState.manualOpen[workflow][card.dataset.guide])||openCards[0];
        openGuided(workflow,preferred.dataset.guide);
      }
    }
  }
  function labelFor(id,workflow){
    const map={inj:{encounter:'Patient & order',med:'Medication & site',safety:'Safety',trace:'Product trace',response:'Administration',return:'Follow-up'},uds:{encounter:'Collection',device:'Device',results:'Results',review:'Review',output:'Output'},samples:{patient:'Patient',selected:'Sample',plan:'Directions',trace:'Trace',safety:'Counseling',output:'Output'}};
    return (map[workflow]&&map[workflow][id])||id;
  }
  function allReady(workflow){
    const order=workflow==='inj'?INJ_ORDER:(GUIDED_ORDER[workflow]||[]).filter(x=>x!=='output');
    return order.every(id=>workflow==='inj'?rootState.inj[id]&&!injStatus(id).block:(rootState[workflow][id]&&!guidedCanConfirm(workflow,id).block));
  }
  function statusRows(workflow){
    const order=workflow==='inj'?INJ_ORDER:(GUIDED_ORDER[workflow]||[]).filter(x=>x!=='output');
    const rows=order.map(id=>{
      const st=workflow==='inj'?injStatus(id):guidedCanConfirm(workflow,id); const confirmed=!!rootState[workflow][id]&&!st.block;
      return {id,label:labelFor(id,workflow),cls:st.block?'block':st.review?'warn':confirmed?'ok':'warn',text:st.block?st.summary:(confirmed?(st.review?'Review acknowledged':'Confirmed'):'Ready to confirm')};
    });
    if(workflow==='uds'){
      const output=guidedCanConfirm(workflow,'output');
      rows.push({id:'output',label:'Final output',cls:output.block?'block':output.review?'warn':'ok',text:output.block?output.summary:(output.review?'Review before finalizing':'Ready')});
    }
    return rows;
  }
  function ensureReadyCard(workflow){
    const side=q(`${panelOf(workflow)} .preview-col`); if(!side)return;
    let card=$(`rc530Ready_${workflow}`); if(!card){card=document.createElement('div');card.id=`rc530Ready_${workflow}`;card.className='rc530-ready-card'; const target=q(`${panelOf(workflow)} .qa-panel`)||side.firstElementChild; if(target)target.insertAdjacentElement('afterend',card); else side.prepend(card);}    
    const rows=statusRows(workflow); const ready=rows.every(r=>r.cls==='ok'); const review=rows.some(r=>r.cls==='warn')&&!rows.some(r=>r.cls==='block');
    card.className='rc530-ready-card '+(ready?'ready':review?'review':'');
    const title=workflow==='inj'?'Ready to document':workflow==='uds'?'UDS packet readiness':'Sample closeout readiness';
    card.innerHTML=`<div class="head"><div class="title">${safe(title)}</div><div class="badge">${ready?'ready':review?'review':'working'}</div></div><ul>${rows.map(r=>`<li class="${r.cls}"><span class="rc530-ready-copy"><b>${safe(r.label)}</b><span>${safe(r.text)}</span></span></li>`).join('')}</ul>`;
  }
  function unconfirm(workflow,id,downstream){
    const order=workflow==='inj'?INJ_ORDER:(GUIDED_ORDER[workflow]||[]).filter(x=>x!=='output');
    const idx=order.indexOf(id); if(idx<0)return;
    const affected=downstream?order.slice(idx):[id]; affected.forEach(k=>{rootState[workflow][k]=false;});
  }
  function bindInvalidation(){
    const map={
      inj:{encounter:['ptName','ptDOB','orderingProvider','injOrderPurpose'],med:['medChips','doseChips','siteChips','routeChips','intChips','bodyMap','priorDose','priorSite'],trace:['ndc','lot','exp','injProductSource','injProductSourceOther','injPreparation','injPreparationDetail','injWasteToggle','injWasteAmount','injWasteWitness','injProductIssueToggle','injProductIssueDetail','injProductIssueAction','injProductIssueRecipient','injProductIssueNotificationTime','injProductIssueDirection','injProductIssueNextStep'],safety:['attChips','medSpecChips','injSafetyChips','bp','hr','temp','rr','spo2','vitalRepeatNote'],return:['nextDate'],response:['respChips','respCustom','admin','adminDate','injAdminTime','injSecondAdminTime','injVolume','injVolumeUnit','injDevice','injDeviceOther','injSiteCondition','injSiteConditionDetail','injExceptionToggle','injExceptionSummary','injExceptionRecipient','injExceptionTime','injExceptionOutcome']},
      uds:{encounter:['udsPtName','udsDOB','udsCollector','udsDateTime','udsTempChips','udsReasonChips'],device:['udsDevice','udsLot','udsExp','udsControlChips','udsPhoto'],results:['udsResultGrid','udsAllNeg','udsAllNt','udsThcPos','udsClearFlags'],review:['udsValidity','udsConsistent','udsLab','udsComment']},
      samples:{patient:['samplePtName','sampleDOB','samplePrescriber','sampleStaff','sampleDate','samplePurpose','sampleIntentChips'],selected:['sampleMedChips','sampleMedLabel','sampleQty','samplePackageButtons'],plan:['sampleStart','sampleFood','sampleSig','sampleSigSuggestions','sampleDoseRows','sampleTitration'],trace:['sampleLot','sampleExp'],safety:['sampleMedCheck','sampleEdu','sampleExtra']}
    };
    Object.keys(map).forEach(w=>{
      Object.keys(map[w]).forEach(sec=>{
        map[w][sec].forEach(id=>{
          const el=$(id); if(!el||el.dataset.rc530Bound)return; el.dataset.rc530Bound='1';
          const handler=()=>{unconfirm(w,sec,true); if(w==='inj'&&sec==='safety')rootState.safetyNone=false; setTimeout(refreshAll,0);};
          ['input','change'].forEach(ev=>el.addEventListener(ev,handler,true));
          el.addEventListener('click',handler,true);
        });
      });
    });
  }
  function refreshAll(){
    try{reconcileInj();}catch(e){console.warn('RC5.30 inj reconcile',e);}    
    try{reconcileGuided('uds');}catch(e){}
    try{reconcileGuided('samples');}catch(e){}
    try{window.IPMG_RC_VERSION=VERSION;}catch(e){}
  }
  function refreshWorkflow(workflow){
    if(workflow==='inj'){try{reconcileInj();}catch(e){console.warn('RC5.30 inj reconcile',e);}}
    if(workflow==='uds'){try{reconcileGuided('uds');}catch(e){}}
    if(workflow==='samples'){try{reconcileGuided('samples');}catch(e){}}
    try{window.IPMG_RC_VERSION=VERSION;}catch(e){}
  }
  function install(){
    ensureInjResponseCard(); ensureInjSafetyChoice(); ensureInjFooters(); bindInvalidation();
    document.addEventListener('click',e=>{
      const no=e.target.closest&&e.target.closest('[data-rc530-noacute]'); if(no){e.preventDefault(); e.stopImmediatePropagation(); setSafetyNone(!rootState.safetyNone); return false;}
      const inj=e.target.closest&&e.target.closest('[data-rc530-inj-continue]'); if(inj){e.preventDefault(); e.stopImmediatePropagation(); confirmInj(inj.getAttribute('data-rc530-inj-continue')); return false;}
      const guided=e.target.closest&&e.target.closest('.guided-continue,.sample-guide-continue,.uds-guide-continue');
      if(guided&&!guided.classList.contains('secondary')){
        const card=guided.closest('.guided-card[data-guide],.sample-guide-card[data-guide],.uds-guide-card[data-guide]');
        if(card){const wf=card.closest('#panel-uds')?'uds':card.closest('#panel-samples')?'samples':''; if(wf){e.preventDefault(); e.stopImmediatePropagation(); confirmGuided(wf,card.dataset.guide); return false;}}
      }
      const sum=e.target.closest&&e.target.closest('#panel-administer .rc530-summary'); if(sum){const c=sum.closest('.inj-card'); if(c&&c.dataset.rc530Id){openInj(c.dataset.rc530Id,true);}}
      const gHead=e.target.closest&&e.target.closest('#panel-uds [data-guided-head],#panel-samples [data-guided-head]');
      if(gHead&&!e.target.closest('button,input,select,textarea,a,.chip,.mini')){const c=gHead.closest('.guided-card[data-guide],.sample-guide-card[data-guide],.uds-guide-card[data-guide]'); if(c){const wf=c.closest('#panel-uds')?'uds':'samples'; rootState.manualOpen[wf][c.dataset.guide]=true;}}
    },true);
    const refreshTimers={inj:0,uds:0,samples:0};
    ['input','change','click'].forEach(ev=>document.addEventListener(ev,event=>{
      const target=event.target&&event.target.closest&&event.target.closest('#panel-administer,#panel-uds,#panel-samples');if(!target)return;
      const workflow=target.id==='panel-administer'?'inj':target.id==='panel-uds'?'uds':'samples';
      clearTimeout(refreshTimers[workflow]);refreshTimers[workflow]=setTimeout(()=>refreshWorkflow(workflow),45);
    },true));
    const oldRender=window.render; if(typeof oldRender==='function'&&!oldRender.__rc530Wrapped){const wrap=function(){const r=oldRender.apply(this,arguments);setTimeout(refreshAll,0);return r;}; wrap.__rc530Wrapped=true; window.render=wrap;}
    setTimeout(refreshAll,250); setTimeout(refreshAll,850);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
/* </script> */

;

/* Legacy runtime block 12: <script id="rc532InteractionPolishScript"> */
/* RC5.32 — additive micro-interaction feedback. Purely visual: adds a short-lived
   class on real user clicks, never touches existing toggle/copy/navigation logic. */
(function(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var POP_SEL = '.chip.att, .mini, .sample-intent-chip, .forms-kind-grid .chip, .uds-quickbar .mini, .sample-pack-btn';
  var COPY_SEL = '.kb-copy-btn, .mini-copy, .sample-hero-copy, .selector-current-copy, .admin-guide-summary-copy, .needle-guide-copy, [data-copy], [data-sms], .cp';

  function pulse(el, cls){
    if(!el) return;
    el.classList.remove(cls);
    /* force reflow so the animation can replay on rapid repeat clicks */
    void el.offsetWidth;
    el.classList.add(cls);
    var done = function(){ el.classList.remove(cls); el.removeEventListener('animationend', done); };
    el.addEventListener('animationend', done);
    setTimeout(done, 480);
  }

  document.addEventListener('click', function(e){
    var copyEl = e.target.closest && e.target.closest(COPY_SEL);
    if(copyEl){ pulse(copyEl, 'rc532-copied'); return; }
    var popEl = e.target.closest && e.target.closest(POP_SEL);
    if(popEl){ pulse(popEl, 'rc532-pop'); }
  }, false);
})();
/* </script> */

;

/* Legacy runtime block 13: <script id="rc533ValidationFeedbackScript"> */
/* RC5.33 — additive validation feedback. Reads state and adds short-lived visual
   classes only; never blocks, navigates, or alters existing confirm/continue logic. */
(function(){
  /* required field IDs per section, mirrored from rc530 bindInvalidation() */
  var REQ_MAP={
    inj:{encounter:['ptName','ptDOB','orderingProvider'],med:['medChips','doseChips','siteChips','routeChips','intChips','bodyMap'],trace:['ndc','lot','exp'],safety:['attChips','medSpecChips','injSafetyChips','bp','hr','temp','rr','spo2'],'return':['priorDose','adminDate','nextDate'],response:['respChips','respCustom','admin']},
    uds:{encounter:['udsPtName','udsDOB','udsCollector','udsDateTime','udsTempChips','udsReasonChips'],device:['udsDevice','udsLot','udsExp','udsControlChips'],results:['udsResultGrid'],review:['udsValidity','udsConsistent','udsLab']},
    samples:{patient:['samplePtName','sampleDOB','samplePrescriber','sampleStaff','sampleDate','samplePurpose'],selected:['sampleMedChips','sampleQty'],plan:['sampleStart','sampleSig'],trace:['sampleLot','sampleExp'],safety:['sampleMedCheck','sampleEdu']}
  };
  function isReq(el){var w=el.closest('.field,.grp,.uds-group,.uds-panel'); return !!(w&&w.querySelector('.req'));}
  function isEmpty(el){
    var t=el.tagName;
    if(t==='INPUT'||t==='SELECT'||t==='TEXTAREA') return !String(el.value||'').trim();
    return !el.querySelector('.on,.chip.on,.mini.on,.selected,[aria-pressed="true"]');
  }
  function shake(el){ if(!el)return; el.classList.remove('rc533-shake'); void el.offsetWidth; el.classList.add('rc533-shake'); setTimeout(function(){el.classList.remove('rc533-shake');},540); }

  /* --- 1) shake empty required fields on a blocked "Complete required fields" press --- */
  document.addEventListener('click',function(e){
    var btn=e.target.closest&&e.target.closest('.rc530-continue,.guided-continue,.sample-guide-continue,.uds-guide-continue');
    if(!btn) return;
    var blocked=btn.classList.contains('blocked')||btn.classList.contains('is-disabled')||/complete required/i.test(btn.textContent||'');
    if(!blocked) return;
    var wf,sec,card;
    if(btn.dataset.rc530InjContinue!=null){ wf='inj'; sec=btn.dataset.rc530InjContinue; card=btn.closest('.card'); }
    else { card=btn.closest('.guided-card,.sample-guide-card,.uds-guide-card'); sec=card&&card.dataset.guide; wf=btn.closest('#panel-uds')?'uds':btn.closest('#panel-samples')?'samples':null; }
    var ids=(wf&&sec&&REQ_MAP[wf]&&REQ_MAP[wf][sec])||[]; var shaken=0;
    ids.forEach(function(id){
      if(shaken>=5) return;
      var el=document.getElementById(id); if(!el) return;
      if(isReq(el)&&isEmpty(el)){ shake(el); shaken++; }
    });
    if(shaken===0&&card) shake(card); /* fallback: nothing pinpointed, nudge the card */
  },true);

  /* --- 2) soft green settle when a section transitions into confirmed/ready --- */
  function isConfirmed(card){
    if(card.classList.contains('rc530-confirmed')) return true;
    if(card.closest('#panel-administer')&&card.classList.contains('rc530-collapsed')&&!card.classList.contains('needs')&&!card.classList.contains('rc530-active')) return true;
    return false;
  }
  function settle(card){ if(!card)return; card.classList.remove('rc533-settle'); void card.offsetWidth; card.classList.add('rc533-settle'); setTimeout(function(){card.classList.remove('rc533-settle');},680); }
  var SEL='#panel-administer .form-col > .card, #panel-uds .guided-card, #panel-uds .uds-guide-card, #panel-samples .guided-card, #panel-samples .sample-guide-card';
  var confirmed=new WeakSet(), firstPass=true, raf=0;
  function scan(){
    document.querySelectorAll(SEL).forEach(function(card){
      var now=isConfirmed(card), had=confirmed.has(card);
      if(now&&!had){ confirmed.add(card); if(!firstPass) settle(card); }
      else if(!now&&had){ confirmed.delete(card); }
    });
    firstPass=false;
  }
  function start(){
    scan(); /* baseline pass — no settle on already-confirmed defaults */
    var mo=new MutationObserver(function(){ if(raf)return; raf=requestAnimationFrame(function(){raf=0;scan();}); });
    ['panel-administer','panel-uds','panel-samples'].forEach(function(pid){ var p=document.getElementById(pid); if(p)mo.observe(p,{subtree:true,attributes:true,attributeFilter:['class']}); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(start,300);}); else setTimeout(start,300);
})();
/* </script> */

;

/* Legacy runtime block 14: <script id="rc534RightRailScript"> */
/* RC5.34 — loop-safe progress-meter injector for the readiness panels. Reads the
   rc530-generated <li> states and renders an n/total meter; writes only when values
   change, so it never fights the panel's own re-render. */
(function(){
  var raf=0;
  function enhance(){
    document.querySelectorAll('.preview-col .rc530-ready-card').forEach(function(card){
      var lis=card.querySelectorAll('ul li');
      if(!lis.length) return;
      var total=lis.length, ok=0;
      lis.forEach(function(l){ if(l.classList.contains('ok')) ok++; });
      var pct=Math.round(ok/total*100);
      var bar=card.querySelector('.rc534-progress');
      if(!bar){
        bar=document.createElement('div');
        bar.className='rc534-progress';
        bar.innerHTML='<div class="rc534-track"><div class="rc534-fill"></div></div><div class="rc534-count"></div>';
        var head=card.querySelector('.head');
        if(head) head.insertAdjacentElement('afterend',bar); else card.insertBefore(bar,card.firstChild);
      }
      var fill=bar.querySelector('.rc534-fill');
      var w=pct+'%';
      if(fill.style.width!==w) fill.style.width=w;                 /* attr write: not observed */
      var full=(ok===total);
      if(full!==fill.classList.contains('full')) fill.classList.toggle('full',full);
      var label=ok+' / '+total+' ready';
      var countEl=bar.querySelector('.rc534-count');
      if(countEl.textContent!==label) countEl.textContent=label;   /* guarded: only on change */
    });
  }
  function schedule(){ if(raf) return; raf=requestAnimationFrame(function(){raf=0;enhance();}); }
  function start(){
    enhance();
    var mo=new MutationObserver(schedule);
    document.querySelectorAll('.preview-col').forEach(function(c){ mo.observe(c,{childList:true,subtree:true}); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(start,350);}); else setTimeout(start,350);
})();
/* </script> */

;

/* Legacy runtime block 15: <script id="rc535ClinicalSafetyScript"> */
/* ===================== RC5.35: explicit clinical disposition + safe outputs ===================== */
(function(){
  'use strict';
  if(window.__IPMG_RC535_CLINICAL_SAFETY__) return;
  window.__IPMG_RC535_CLINICAL_SAFETY__=true;

  const by=id=>document.getElementById(id);
  const text=id=>{const el=by(id);return el&&'value' in el?String(el.value||'').trim():'';};
  const checked=id=>{const el=by(id);return !!(el&&el.checked);};
  const safe=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={administered:'Administered',held:'Held — not administered',escalated:'Escalated — not administered',provider:'Provider-directed plan — not administered'};
  const state={kind:''};
  let priorFingerprint='';

  function med(){try{return typeof S!=='undefined'&&S.med?S.med:null;}catch(e){return null;}}
  function line(){
    const m=med(); if(!m)return 'Medication not selected';
    return [m.name||m.label||'Medication',typeof S!=='undefined'&&S.dose||'',typeof S!=='undefined'&&S.route||'',typeof S!=='undefined'&&S.site||''].filter(Boolean).join(' · ');
  }
  function uniq(items){return Array.from(new Set(items.filter(Boolean)));}
  function call(fn,fallback){try{return typeof fn==='function'?fn():fallback;}catch(e){return fallback;}}

  function review(options){
    const requireAdministrationDetail=!!(options&&options.requireAdministrationDetail);
    const stops=[],warnings=[]; const m=med();
    if(!m){stops.push('Select the medication before documenting a disposition.');return {stops,warnings};}
    if(!text('ptName'))stops.push('Document the patient name.');
    if(!text('ptDOB'))stops.push('Document the patient date of birth.');
    if(!String(S.dose||'').trim())stops.push('Select or enter the ordered dose.');
    if(!String(S.route||'').trim())stops.push('Document the route used.');
    if(!String(S.site||'').trim())stops.push('Select the injection site used.');
    if(!String(S.intervalKey||'').trim())stops.push('Select the ordered dosing interval.');
    if(!text('orderingProvider'))stops.push('Document the ordering provider.');
    if(!text('adminDate'))stops.push('Document the administration date.');
    if(S.intervalKey!=='once'&&!text('nextDate'))stops.push('Confirm the next-dose date or ordered follow-up plan.');
    if(!text('admin'))stops.push('Document administering staff.');
    if(!String(S.resp||'').trim()||(S.resp==='custom'&&!text('respCustom')))stops.push('Select or enter the observed post-injection response.');
    if(S.reason==='scheduled'&&!text('priorDose'))stops.push('Document the prior-dose date for a scheduled administration.');
    const required=[['id2','Document two-identifier verification.'],['rights','Document medication/order verification.'],['allergy','Document allergy review.'],['consent','Document consent/reaffirmation.'],['screen','Document the pre-injection contraindication screen.'],['hygiene','Document aseptic technique.']];
    required.forEach(([id,msg])=>{if(!S.attest||!S.attest[id])stops.push(msg);});
    if(S.attest&&S.attest.allergy&&!text('allergies'))stops.push('Enter the verified allergy status; do not use a default allergy statement.');
    const safetyState=window.__IPMG_RC530__;
    if(!safetyState||!safetyState.safetyNone)stops.push('Confirm today\'s acute safety screen or document an exception for provider review.');
    (m.flags||[]).forEach(flag=>{
      if(!S.flags||!S.flags[flag]){
        const detail=typeof FLAG!=='undefined'&&FLAG[flag]?FLAG[flag].t:flag;
        stops.push(`Complete medication-specific verification: ${detail}.`);
      }
    });
    if(!text('ndc'))stops.push('Document the medication NDC.');
    if(!text('lot'))stops.push('Document the medication lot.');
    const exp=text('exp');
    if(!exp)stops.push('Document the medication expiration.');
    else if(call(()=>monthExpired(exp,text('adminDate')),false))stops.push('Medication expiration appears past; obtain in-date product before documenting administration.');

    call(()=>selectedSafetyGuards(),[]).forEach(g=>stops.push(`Provider-review trigger selected: ${g.t}. Administration cannot be finalized while this exception remains active.`));
    call(()=>vitalSafetyItems(),[]).filter(i=>i&&i.level==='danger').forEach(i=>stops.push(i.text));
    call(()=>medicationSafetyItems(),[]).filter(i=>i&&i.level==='danger').forEach(i=>stops.push(i.text));
    const timing=call(()=>injectionTiming(),null);
    if(timing&&timing.level==='danger')stops.push(timing.detail||'Injection timing requires provider review before administration.');
    if(timing&&timing.level==='warn'&&/before the prior-dose date/i.test(timing.detail||''))stops.push(timing.detail);
    const vitals=by('vitalsSmartPanel');
    if(vitals&&vitals.classList.contains('danger'))stops.push('Vitals safety panel indicates provider review is required before administration.');

    const administrationDetails=call(()=>typeof window.ipmgInjectionDetailReview==='function'?window.ipmgInjectionDetailReview({requireAdministrationDetail}):{stops:[],warnings:[]},{stops:[],warnings:[]})||{};
    (administrationDetails.stops||[]).forEach(item=>stops.push(item));
    (administrationDetails.warnings||[]).forEach(item=>warnings.push(item));

    const initiation=call(()=>typeof window.ipmgInitiationProtocolReview==='function'?window.ipmgInitiationProtocolReview():{stops:[],warnings:[]},{stops:[],warnings:[]})||{};
    (initiation.stops||[]).forEach(item=>stops.push(item));
    (initiation.warnings||[]).forEach(item=>warnings.push(item));
    call(()=>vitalSafetyItems(),[]).filter(i=>i&&i.level==='warn').forEach(i=>warnings.push(i.text));
    call(()=>medicationSafetyItems(),[]).filter(i=>i&&i.level==='warn').forEach(i=>warnings.push(i.text));
    if(timing&&timing.level==='warn')warnings.push(timing.detail||'Verify injection timing with the active order and current product information.');
    return {stops:uniq(stops),warnings:uniq(warnings)};
  }
  function fields(){return {provider:text('clinicalDispositionProvider'),time:text('clinicalDispositionTime'),outcome:text('clinicalDispositionOutcome')};}
  function documentationDetails(){
    const details=call(()=>typeof window.ipmgInjectionDocumentationDetails==='function'?window.ipmgInjectionDocumentationDetails():{},{});
    return details&&typeof details==='object'?details:{};
  }
  function documentationContextLines(details,includeIssues){
    const source=details&&typeof details==='object'?details:{},lines=[];
    const add=(label,item)=>{const clean=String(item==null?'':item).trim();if(clean)lines.push(label+': '+clean);};
    add('Active-order purpose / encounter context',source.purpose);
    add('Medication source',source.source);
    add('Preparation / reconstitution',source.preparation);
    if(source.waste||source.wasteWitness)lines.push('Medication waste: '+[source.waste,source.wasteWitness?'witnessed by '+source.wasteWitness:''].filter(Boolean).join('; '));
    if(includeIssues){
      add('Product / device issue',source.productIssue);
      add('Product / device issue action',source.productIssueAction);
      add('Product / device issue notification',source.productIssueRecipient);
      add('Product / device issue notification / decision time',source.productIssueNotificationTime);
      add('Product / device issue direction',source.productIssueDirection);
      add('Product / device issue next step',source.productIssueNextStep);
    }
    return lines;
  }
  function optionalDetailStops(){
    const result=call(()=>typeof window.ipmgInjectionDetailReview==='function'?window.ipmgInjectionDetailReview({requireAdministrationDetail:false}):{stops:[]},{stops:[]})||{};
    return Array.isArray(result.stops)?result.stops:[];
  }
  function refreshOutput(){
    try{if(typeof window.render==='function'){window.render();return;}}catch(e){}
    neutralizeIfNeeded();
  }
  function recordLocked(){const panel=by('panel-administer');return !!(panel&&panel.classList.contains('record-readonly'));}
  function canAdminister(){return state.kind==='administered'&&review({requireAdministrationDetail:true}).stops.length===0;}
  function canHandoff(){const f=fields();return !!(state.kind&&state.kind!=='administered'&&f.provider&&f.time&&f.outcome&&!optionalDetailStops().length);}
  function dispositionSnapshot(){const f=fields();return {kind:state.kind||'',provider:f.provider||'',time:f.time||'',outcome:f.outcome||''};}
  function restoreDisposition(data){
    const source=data&&typeof data==='object'?data:{};
    const allowed=['administered','held','escalated','provider'];
    state.kind=allowed.includes(source.kind)?source.kind:'';
    ensure();
    const values={clinicalDispositionProvider:source.provider,clinicalDispositionTime:source.time,clinicalDispositionOutcome:source.outcome};
    Object.entries(values).forEach(([id,value])=>{const input=by(id);if(input)input.value=value==null?'':String(value);});
    priorFingerprint=fingerprint();
    renderDisposition();
    try{if(typeof window.render==='function')window.render();else neutralizeIfNeeded();}catch(e){neutralizeIfNeeded();}
  }

  function ensure(){
    let panel=by('clinicalDisposition'); if(panel)return panel;
    const anchor=document.querySelector('#panel-administer .card-safety'); if(!anchor)return null;
    panel=document.createElement('section');panel.id='clinicalDisposition';panel.className='card inj-card card-disposition';
    panel.innerHTML='<div class="cd-head"><div><div class="cd-title">Clinical disposition <span class="req">*</span></div><div class="cd-sub">Use the checked routine review items as a fast review-by-exception sheet, then make one final documentation choice. An administration note and AVS remain unavailable until a complete administration is documented.</div></div><span class="cd-badge" id="clinicalDispositionBadge">Needs disposition</span></div><div class="cd-options" role="group" aria-label="Clinical disposition"><button type="button" class="cd-choice" data-disposition="administered">Review complete — document administration</button><button type="button" class="cd-choice hold" data-disposition="held">Held</button><button type="button" class="cd-choice escalate" data-disposition="escalated">Escalated</button><button type="button" class="cd-choice provider" data-disposition="provider">Provider-directed plan</button></div><div class="cd-message" id="clinicalDispositionMessage"></div><div class="cd-list" id="clinicalDispositionList"></div><div class="cd-handoff" id="clinicalDispositionHandoff"><div class="cd-handoff-title">Required handoff details for a non-administration disposition</div><div class="cd-handoff-grid"><div class="field"><label>Provider / recipient <span class="req">*</span></label><input id="clinicalDispositionProvider" placeholder="Name and role" autocomplete="off"></div><div class="field"><label>Contact / decision time <span class="req">*</span></label><input id="clinicalDispositionTime" type="datetime-local"></div><div class="field full"><label>Direction / outcome <span class="req">*</span></label><textarea id="clinicalDispositionOutcome" placeholder="Concise direction, follow-up, and where responsibility was handed off"></textarea></div></div></div><div class="cd-foot">If medication was not given, select Held, Escalated, or Provider-directed plan and document the handoff. This tool will log it as <b>Needs review</b>, not as an administration.</div>';
    const status=panel.querySelector('#clinicalDispositionMessage');
    if(status){status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');}
    anchor.insertAdjacentElement('afterend',panel);
    panel.querySelectorAll('[data-disposition]').forEach(btn=>btn.addEventListener('click',()=>choose(btn.dataset.disposition)));
    ['clinicalDispositionProvider','clinicalDispositionTime','clinicalDispositionOutcome'].forEach(id=>{const el=by(id);if(el){['input','change'].forEach(ev=>el.addEventListener(ev,()=>{renderDisposition();refreshOutput();}));}});
    return panel;
  }
  function choose(kind){
    const r=review({requireAdministrationDetail:kind==='administered'});
    if(kind==='administered'&&r.stops.length){toastSafe('Resolve the listed safety or documentation stops before recording administration.');renderDisposition();return;}
    state.kind=kind; renderDisposition();
    try{if(typeof window.render==='function')window.render();else neutralizeIfNeeded();}catch(e){neutralizeIfNeeded();}
  }
  function clearDisposition(notify){
    const p=ensure(); const had=!!state.kind||Object.values(fields()).some(Boolean);
    state.kind=''; ['clinicalDispositionProvider','clinicalDispositionTime','clinicalDispositionOutcome'].forEach(id=>{const el=by(id);if(el)el.value='';});
    if(had&&notify)toastSafe('Clinical disposition reset because material administration details changed.');
    if(p)renderDisposition();
  }
  function renderDisposition(){
    const panel=ensure(); if(!panel)return;
    const r=review({requireAdministrationDetail:!state.kind||state.kind==='administered'}), hasStop=r.stops.length>0, hasHandoff=state.kind&&state.kind!=='administered';
    panel.classList.toggle('cd-blocked',hasStop);
    panel.querySelectorAll('[data-disposition]').forEach(btn=>{
      const k=btn.dataset.disposition; btn.classList.toggle('on',state.kind===k);
      if(k==='administered'){btn.disabled=hasStop;btn.title=hasStop?'Resolve safety/documentation stops before recording administration.':'Record only after the medication was actually administered.';}
    });
    const badge=by('clinicalDispositionBadge');
    if(badge)badge.textContent=canAdminister()?'Administration documented':hasHandoff?(canHandoff()?'Handoff complete':'Handoff details needed'):(hasStop?'Action needed':'Needs disposition');
    const msg=by('clinicalDispositionMessage');
    if(msg)msg.textContent=canAdminister()?'An administration note can be generated from the documented encounter.':hasHandoff?'No injection administration will be documented from this disposition.':hasStop?'Resolve the listed items or choose a non-administration disposition.':'No injection administration is documented until a disposition is selected.';
    const list=by('clinicalDispositionList');
    if(list)list.innerHTML=[...r.stops.map(x=>`<div class="cd-line">${safe(x)}</div>`),...r.warnings.map(x=>`<div class="cd-line warn">${safe(x)}</div>`)].join('');
    const handoff=by('clinicalDispositionHandoff'); if(handoff)handoff.classList.toggle('show',!!hasHandoff);
    const print=by('printAVS'); if(print){print.classList.toggle('clinical-output-pending',!!med()&&!canAdminister());print.title=med()&&!canAdminister()?'Available after an explicit Administered disposition and complete safety record.':print.dataset.clinicalDefaultTitle||print.title;}
  }
  function neutralNote(){
    const r=review({requireAdministrationDetail:false}), f=fields(), decision=state.kind?labels[state.kind]:'No administration disposition documented',details=documentationDetails(),context=documentationContextLines(details);
    const cc=`Injection safety handoff — ${line()}. ${decision}. No injection administration is documented.`;
    const as=[`Disposition: ${decision}.`,`No medication administration is documented by this handoff.`,details.productIssue?`Product / device issue: ${details.productIssue}`:'',details.productIssueAction?`Product / device issue action / disposition: ${details.productIssueAction}`:'',details.productIssueRecipient?`Product / device issue notification: ${details.productIssueRecipient}`:'',details.productIssueNotificationTime?`Product / device issue notification / decision time: ${details.productIssueNotificationTime}`:'',details.productIssueDirection?`Product / device issue direction: ${details.productIssueDirection}`:'',details.productIssueNextStep?`Product / device issue next step: ${details.productIssueNextStep}`:'',...r.stops.map(x=>`Unresolved: ${x}`),...r.warnings.map(x=>`Review item: ${x}`)].filter(Boolean);
    const pl=[`Medication considered: ${line()}.`,...context,f.provider?`Provider / recipient: ${f.provider}.`:'Provider / recipient: not documented.',f.time?`Contact / decision time: ${f.time}.`:'Contact / decision time: not documented.',f.outcome?`Direction / outcome: ${f.outcome}`:'Direction / outcome: not documented.'];
    const ccEl=by('outCC'),asEl=by('outAS'),plEl=by('outPL'),scan=by('scanPrev');
    if(scan)scan.textContent=cc;
    if(ccEl)ccEl.innerHTML=`<p class="preview-line">${safe(cc)}</p><p>Complete the clinical disposition before using an administration output.</p>`;
    if(asEl)asEl.innerHTML=as.map(x=>`<p>${safe(x)}</p>`).join('');
    if(plEl)plEl.innerHTML=pl.map(x=>`<p>${safe(x)}</p>`).join('');
    window._note={cc,as:as.join('\n'),pl:pl.join('\n')};
  }
  function pendingAvs(){
    const sheet=by('avsSheet'); if(!sheet)return;
    sheet.innerHTML=`<div class="beauty-page beauty-avs"><div class="beauty-head"><div class="beauty-kicker">IPMG</div><h1>Injection visit status</h1><p>No medication administration was recorded in this tool.</p></div><div class="beauty-card"><h2>Clinical handoff required</h2><p>Complete the clinical disposition and use the staff handoff note. A patient after-visit summary is not generated for a held, escalated, provider-directed, or incomplete administration record.</p></div></div>`;
  }
  function neutralizeIfNeeded(){if(!canAdminister()){neutralNote();pendingAvs();}}
  function toastSafe(message){try{if(typeof toast==='function')toast(message);}catch(e){}}
  function addHandoffLog(){
    const f=fields(), r=review({requireAdministrationDetail:false}), m=med(),details=documentationDetails(),context=documentationContextLines(details,true);
    if(!m||!canHandoff())return false;
    const ndc=text('ndc'),lot=text('lot'),exp=text('exp');
    const logDetails=['Not administered',`Disposition: ${labels[state.kind]}`,...context,...r.stops.map(x=>`Unresolved: ${x}`),...r.warnings.map(x=>`Review: ${x}`)].filter(Boolean).join(' · ');
    try{
      const entry={type:'injection',status:'needs_review',time:typeof nowStamp==='function'?nowStamp():'',pt:text('ptName')||'—',summary:`${line()} — ${labels[state.kind]} (not administered)`,details:logDetails,trace:[ndc?`NDC ${ndc}`:'',lot?`Lot ${lot}`:'',exp?`Exp ${exp}`:'',details.source?`Source ${details.source}`:'',details.waste?`Waste ${details.waste}`:''].filter(Boolean).join(' · ')||'—',follow:f.outcome,by:f.provider||text('admin')||'—'};
      let saved=false;
      if(typeof appendLogEntry==='function')saved=appendLogEntry(entry)===true;
      else{
        LOG.push(entry);
        saved=typeof saveLog==='function'&&saveLog()===true;
        if(!saved)LOG.pop();
      }
      if(!saved){toastSafe('Safety handoff could not be saved to the activity log in this browser. The encounter remains open.');return false;}
      if(typeof renderLog==='function')renderLog(); if(typeof renderCommandCenter==='function')renderCommandCenter();
      toastSafe('Safety handoff added to activity log as Needs review.'); return true;
    }catch(e){toastSafe('Unable to add the safety handoff to the activity log.');return false;}
  }
  function fingerprint(){
    const m=med(); if(!m)return '';
    return JSON.stringify({patient:text('ptName'),dob:text('ptDOB'),med:m.key||m.name,dose:S.dose||'',route:S.route||'',site:S.site||'',interval:S.intervalKey||'',reason:S.reason||'',flags:S.flags||{},guards:S.guard||{},attest:S.attest||{},prior:text('priorDose'),date:text('adminDate'),next:text('nextDate'),order:text('orderingProvider'),orderPurpose:text('injOrderPurpose'),lot:text('lot'),exp:text('exp'),ndc:text('ndc'),productSource:text('injProductSource'),productSourceOther:text('injProductSourceOther'),preparation:text('injPreparation'),preparationDetail:text('injPreparationDetail'),waste:checked('injWasteToggle'),wasteAmount:text('injWasteAmount'),wasteWitness:text('injWasteWitness'),productIssue:checked('injProductIssueToggle'),productIssueDetail:text('injProductIssueDetail'),productIssueAction:text('injProductIssueAction'),productIssueRecipient:text('injProductIssueRecipient'),productIssueNotificationTime:text('injProductIssueNotificationTime'),productIssueDirection:text('injProductIssueDirection'),productIssueNextStep:text('injProductIssueNextStep'),allergies:text('allergies'),bp:text('bp'),hr:text('hr'),temp:text('temp'),resp:S.resp||'',respCustom:text('respCustom'),staff:text('admin'),adminTime:text('injAdminTime'),secondAdminTime:text('injSecondAdminTime'),volume:text('injVolume'),volumeUnit:text('injVolumeUnit'),device:text('injDevice'),deviceOther:text('injDeviceOther'),siteCondition:text('injSiteCondition'),siteConditionDetail:text('injSiteConditionDetail'),exception:checked('injExceptionToggle'),exceptionSummary:text('injExceptionSummary'),exceptionRecipient:text('injExceptionRecipient'),exceptionTime:text('injExceptionTime'),exceptionOutcome:text('injExceptionOutcome'),initiation:call(()=>typeof window.ipmgInitiationProtocolFingerprint==='function'?window.ipmgInitiationProtocolFingerprint():'','')});
  }
  function syncFingerprint(){
    if(recordLocked())return;
    const next=fingerprint();
    if(priorFingerprint&&next!==priorFingerprint&&state.kind){clearDisposition(true);}
    priorFingerprint=next;
    renderDisposition(); refreshOutput();
  }
  function bindOutputGuards(){
    document.addEventListener('click',function(e){
      const print=e.target&&e.target.closest&&e.target.closest('#printAVS');
      if(print&&med()&&!canAdminister()){e.preventDefault();e.stopImmediatePropagation();toastSafe('Patient AVS is unavailable until an explicit Administered disposition and complete safety record are documented.');return false;}
      const add=e.target&&e.target.closest&&e.target.closest('#addLog');
      if(add&&med()&&!canAdminister()){
        e.preventDefault();e.stopImmediatePropagation();
        if(!state.kind)toastSafe('Select a clinical disposition before adding this encounter to the log.');
        else if(!canHandoff())toastSafe(optionalDetailStops().length?'Complete or clear the selected injection detail before logging this non-administration handoff.':'Complete provider/recipient, contact time, and direction/outcome before logging a non-administration disposition.');
        else addHandoffLog();
        return false;
      }
    },true);
  }
  function wrapRender(){
    const old=window.render;
    if(typeof old==='function'&&!old.__rc535ClinicalSafetyWrap){
      const wrapped=function(){const result=old.apply(this,arguments);renderDisposition();neutralizeIfNeeded();return result;};
      wrapped.__rc535ClinicalSafetyWrap=true; window.render=wrapped; try{render=wrapped;}catch(e){}
    }
    const oldAvs=window.renderAVS;
    if(typeof oldAvs==='function'&&!oldAvs.__rc535ClinicalSafetyWrap){
      const wrappedAvs=function(){if(med()&&!canAdminister())return pendingAvs();return oldAvs.apply(this,arguments);};
      wrappedAvs.__rc535ClinicalSafetyWrap=true; window.renderAVS=wrappedAvs; try{renderAVS=wrappedAvs;}catch(e){}
    }
    const oldReset=window.softReset;
    if(typeof oldReset==='function'&&!oldReset.__rc535ClinicalSafetyWrap){
      const wrappedReset=function(){clearDisposition(false);const result=oldReset.apply(this,arguments);priorFingerprint=fingerprint();return result;};
      wrappedReset.__rc535ClinicalSafetyWrap=true; window.softReset=wrappedReset; try{softReset=wrappedReset;}catch(e){}
    }
  }
  function boot(){
    wrapRender(); ensure(); priorFingerprint=fingerprint(); bindOutputGuards();
    ['input','change','click'].forEach(ev=>document.addEventListener(ev,function(e){
      const target=e.target&&e.target.closest&&e.target.closest('#panel-administer');
      if(!target||e.target.closest('#clinicalDisposition'))return;
      setTimeout(syncFingerprint,0);
    },true));
    window.ipmgClinicalDispositionSnapshot=dispositionSnapshot;
    window.restoreClinicalDisposition=restoreDisposition;
    window.ipmgClinicalDispositionCanFinalize=()=>canAdminister()||canHandoff();
    renderDisposition(); neutralizeIfNeeded(); try{window.IPMG_RC_VERSION='RC5.35 Clinical Disposition Safety Gate';}catch(e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
/* </script> */

;

/* Legacy runtime block 16: <script id="rc536SampleSafetyScript"> */
/* ===================== RC5.36: neutral sample drafts until dispensing is documented ===================== */
(function(){
  'use strict';
  if(window.__IPMG_RC536_SAMPLE_SAFETY__)return;
  window.__IPMG_RC536_SAMPLE_SAFETY__=true;
  const by=id=>document.getElementById(id);
  const val=id=>{const el=by(id);return el&&'value' in el?String(el.value||'').trim():'';};
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uniq=items=>Array.from(new Set(items.filter(Boolean)));
  let lastReady=false;
  function med(){try{return typeof sampleMed==='function'?sampleMed():{};}catch(e){return {};}}
  function medName(){try{return typeof sampleFriendlyMedication==='function'?sampleFriendlyMedication():'Medication sample';}catch(e){return val('sampleMedLabel')||'Medication sample';}}
  function issues(){
    const out=[];
    try{if(typeof sampleTraceIssues==='function')out.push(...sampleTraceIssues());}catch(e){}
    if(!val('samplePtName'))out.push('patient');
    if(!val('sampleDOB'))out.push('DOB');
    if(!val('sampleDate'))out.push('dispense date');
    if(!val('sampleStart'))out.push('start date');
    if(val('sampleMedCheck').toLowerCase()==='not documented')out.push('medication / interaction review');
    if(val('sampleEdu').toLowerCase()==='not documented')out.push('patient education status');
    const m=med();
    if(m&&['lybalvi','cobenfy','fanapt','rexulti'].includes(m.key)&&val('sampleMedCheck')!=='Prescriber reviewed / ok to dispense')out.push(`${m.label} prescriber review`);
    return uniq(out);
  }
  function ready(){return issues().length===0;}
  function draftNote(){
    const missing=issues();
    return [`Sample documentation handoff — ${medName()}.`,`No medication sample dispensing is documented by this draft.`,missing.length?`Complete before dispensing or printing: ${missing.join(', ')}.`:'Complete the dispensing workflow before printing or logging.',`Medication / interaction review: ${val('sampleMedCheck')||'not documented'}. Education: ${val('sampleEdu')||'not documented'}.`].join('\n');
  }
  function pendingPreview(){
    const preview=by('samplePreview'); if(!preview||ready())return;
    const missing=issues();
    preview.innerHTML=`<div class="sample-draft-safety"><h3>Sample documentation draft</h3><div>No medication sample dispensing is documented until the required clinical, traceability, and counseling fields are completed.</div>${missing.length?`<ul>${missing.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>`;
  }
  function refresh(){
    const ok=ready();
    lastReady=ok;
    ['samplePrint','sampleAddLog'].forEach(id=>{const el=by(id);if(!el)return;el.classList.toggle('sample-output-pending',!ok);el.disabled=!ok;el.setAttribute('aria-disabled',String(!ok));el.title=ok?'':`Complete ${issues().join(', ')} before documenting a sample dispense.`;});
    const status=by('sampleReadiness');
    if(status){const old=status.querySelector('.rc536-sample-safety');if(old)old.remove();if(!ok){const note=document.createElement('div');note.className='qa-danger rc536-sample-safety';note.textContent=`No sample dispense record or patient handout may be generated yet: ${issues().join(', ')}.`;status.appendChild(note);}}
  }
  function toastSafe(msg){try{if(typeof toast==='function')toast(msg);}catch(e){}}
  function wrap(){
    const oldNote=window.sampleNoteText;
    if(typeof oldNote==='function'&&!oldNote.__rc536SampleSafetyWrap){const wrapped=function(){return ready()?oldNote.apply(this,arguments):draftNote();};wrapped.__rc536SampleSafetyWrap=true;window.sampleNoteText=wrapped;try{sampleNoteText=wrapped;}catch(e){}}
    const oldRender=window.renderSampleHandout;
    if(typeof oldRender==='function'&&!oldRender.__rc536SampleSafetyWrap){const wrapped=function(){const r=oldRender.apply(this,arguments);refresh();pendingPreview();return r;};wrapped.__rc536SampleSafetyWrap=true;window.renderSampleHandout=wrapped;try{renderSampleHandout=wrapped;}catch(e){}}
    const oldReadiness=window.renderSampleReadiness;
    if(typeof oldReadiness==='function'&&!oldReadiness.__rc536SampleSafetyWrap){const wrapped=function(){const r=oldReadiness.apply(this,arguments);refresh();return r;};wrapped.__rc536SampleSafetyWrap=true;window.renderSampleReadiness=wrapped;try{renderSampleReadiness=wrapped;}catch(e){}}
  }
  function bind(){
    document.addEventListener('click',function(e){
      const target=e.target&&e.target.closest&&e.target.closest('#samplePrint,#sampleAddLog');
      if(!target||ready())return;
      e.preventDefault();e.stopImmediatePropagation();
      toastSafe(`Complete ${issues().join(', ')} before documenting a sample dispense.`);
      pendingPreview();refresh();return false;
    },true);
    ['input','change','click'].forEach(ev=>document.addEventListener(ev,event=>{
      if(!event.target||!event.target.closest||!event.target.closest('#panel-samples'))return;
      setTimeout(()=>{
      const was=lastReady, now=ready();
      if(now&&!was&&typeof window.renderSampleHandout==='function'){window.renderSampleHandout();return;}
      refresh();pendingPreview();
      },0);
    },true));
  }
  function boot(){wrap();bind();refresh();pendingPreview();try{window.IPMG_RC_VERSION='RC5.36 Clinical Disposition + Sample Safety';}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
/* </script> */

;

/* Legacy runtime block 17: <script id="rc537FastReviewScript"> */
/* ===================== RC5.37: visible review-by-exception fast path ===================== */
(function(){
  'use strict';
  if(window.__IPMG_RC537_FAST_REVIEW__)return;
  window.__IPMG_RC537_FAST_REVIEW__=true;
  const by=id=>document.getElementById(id);
  const call=(fn,...args)=>{try{return typeof fn==='function'?fn(...args):undefined;}catch(e){return undefined;}};
  const say=message=>call(window.toast,message);
  function dispatch(el,type){try{el.dispatchEvent(new Event(type,{bubbles:true}));}catch(e){}}
  function refreshInjection(){
    call(window.renderAtt);call(window.renderMedSpec);call(window.renderInjSafetyChips);call(window.renderResp);call(window.render);
  }
  function refreshUds(){
    call(window.renderUdsReasons);call(window.renderUdsTemp);call(window.renderUdsControl);call(window.renderUdsResults);call(window.renderUdsNote);
  }
  function refreshSamples(){call(window.renderSampleHandout);call(window.renderSampleReadiness);call(window.renderCommandCenter);}
  function restoreInjection(){
    if(typeof ATTEST!=='undefined'&&typeof S!=='undefined')ATTEST.forEach(a=>{S.attest[a.id]=!a.off&&a.id!=='prior';});
    if(typeof S!=='undefined')S.resp='well';
    refreshInjection();say('Routine injection checks restored. Confirm the visible checks and uncheck exceptions.');
  }
  function restoreUds(){
    if(typeof UDS!=='undefined'){
      UDS.reason='routine';UDS.temp='acceptable';UDS.control='valid';UDS.validity='acceptable';UDS.consistent='no unexpected';UDS.lab='provider to decide';
      if(typeof UDS_PANELS!=='undefined')UDS_PANELS.forEach(p=>{UDS.results[p]='neg';});
    }
    [['udsValidity','acceptable'],['udsConsistent','no unexpected'],['udsLab','provider to decide']].forEach(([id,value])=>{const el=by(id);if(el)el.value=value;});
    refreshUds();say('Routine UDS screen restored. Change any panel, control, or review exception before output.');
  }
  function restoreSamples(){
    const medCheck=by('sampleMedCheck'),education=by('sampleEdu');
    if(medCheck)medCheck.value='Prescriber reviewed / ok to dispense';
    if(education)education.value='Reviewed with patient';
    refreshSamples();say('Routine sample review restored. Change any item that was not completed.');
  }
  function bar(id,title,detail,buttonText,handler){
    const wrap=document.createElement('div');wrap.className='fast-review';wrap.id=id;
    wrap.innerHTML=`<div class="fast-review-copy"><b>${title}</b><span>${detail}</span></div><button type="button">${buttonText}</button>`;
    wrap.querySelector('button').addEventListener('click',handler);return wrap;
  }
  function addAllergyShortcut(){
    const input=by('allergies');if(!input||by('allergyNkdaShortcut'))return;
    const note=document.createElement('div');note.id='allergyNkdaShortcut';note.className='fast-inline-action';
    note.innerHTML='<span>Verified NKDA?</span><button type="button">Enter NKDA</button>';
    note.querySelector('button').addEventListener('click',()=>{input.value='NKDA';dispatch(input,'input');input.focus();say('NKDA entered. Edit it if the active record shows any allergy or reaction.');});
    input.insertAdjacentElement('afterend',note);
  }
  function ensure(){
    const inj=document.querySelector('#panel-administer .card-safety');
    if(inj&&!by('injFastReview')){
      const header=inj.querySelector('.card-head');
      const item=bar('injFastReview','Quick review — routine injection checks are preselected.','Keep only what you verified today; tap off anything not completed. <span class="fast-review-alert">Allergy status still requires an explicit entry.</span>','Restore routine checks',restoreInjection);
      if(header)header.insertAdjacentElement('afterend',item);else inj.prepend(item);
    }
    const udsQuick=by('udsAllNeg'),udsPatient=by('udsPtName');
    if(udsQuick&&udsPatient&&!by('udsFastReview')){
      const card=udsPatient.closest('.card');const header=card&&card.querySelector('.card-head');
      const item=bar('udsFastReview','Quick review — routine UDS screen is prefilled.','All displayed panels begin negative with acceptable temperature/control. Confirm the selected cup includes them; set non-included panels to Not tested.','Restore routine screen',restoreUds);
      if(header)header.insertAdjacentElement('afterend',item);else card?.prepend(item);
    }
    const sampleCheck=by('sampleMedCheck'),samplePatient=by('samplePtName');
    if(sampleCheck&&samplePatient){
      const item=by('sampleFastReview')||bar('sampleFastReview','Quick review — routine sample checks are preselected.','Change the review or education status for anything not completed before you print or log the dispense.','Restore routine review',restoreSamples);
      const hero=document.querySelector('#panel-samples .sample-module-hero.rc5,#panel-samples .sample-module-hero');
      const card=samplePatient.closest('.card');const header=card&&card.querySelector('.card-head');
      if(hero)hero.insertAdjacentElement('afterend',item);else if(header)header.insertAdjacentElement('afterend',item);else card?.prepend(item);
    }
    addAllergyShortcut();
  }
  function boot(){window.IPMG_FAST_REVIEW=true;ensure();refreshInjection();refreshUds();refreshSamples();try{window.IPMG_RC_VERSION='RC5.37 Fast Review by Exception';}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
/* </script> */

;

/* Legacy runtime block 18: <script id="rc538PremiumPolishScript"> */
/* ===================== RC5.38: fast review polish + safe drafts ===================== */
(function(){
  'use strict';
  if(window.__IPMG_RC538_PREMIUM__)return;
  window.__IPMG_RC538_PREMIUM__=true;
  const by=id=>document.getElementById(id);
  const val=id=>{const el=by(id);return el&&'value' in el?String(el.value||'').trim():'';};
  const safe=v=>String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const uniq=items=>Array.from(new Set((items||[]).filter(Boolean)));
  const call=(fn,...args)=>{try{return typeof fn==='function'?fn(...args):undefined;}catch(e){return undefined;}};
  const say=message=>call(window.toast,message);

  let labelIndex=0;
  function enhanceAccessibility(root=document){
    const scope=root&&root.querySelectorAll?root:document;
    const toast=by('toast');
    if(toast){toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.setAttribute('aria-atomic','true');}
    scope.querySelectorAll('.field').forEach(field=>{
      const label=field.querySelector(':scope > label');
      const control=field.querySelector('input,select,textarea');
      if(label&&control){
        if(!control.id)control.id=`ipmg-field-${++labelIndex}`;
        label.htmlFor=control.id;
        if(label.querySelector('.req'))control.setAttribute('aria-required','true');
      }
    });
    scope.querySelectorAll('input,select,textarea').forEach(control=>{
      const invalid=control.classList.contains('qa-missing')||control.classList.contains('qa-danger');
      if(invalid)control.setAttribute('aria-invalid','true');else control.removeAttribute('aria-invalid');
    });
  }
  function syncTabs(){
    window.IPMGNavigation?.sync();
  }
  function focusCurrentPanel(tabName){
    window.IPMGNavigation?.focusPanel(tabName);
  }
  function templateStates(){
    const inj=by('panel-administer'),uds=by('panel-uds'),samples=by('panel-samples');
    const safety=window.__IPMG_RC530__;
    if(inj)inj.classList.toggle('routine-template',!!(!S.med||!(safety&&safety.safetyNone))&&!inj.classList.contains('record-readonly'));
    if(uds)uds.classList.toggle('routine-template',!!(!val('udsPtName')||!val('udsDOB')||!val('udsDevice')));
    if(samples)samples.classList.toggle('routine-template',!!(!(SAMPLE_STATE&&SAMPLE_STATE.med)));
  }
  document.addEventListener('click',event=>{
    setTimeout(templateStates,0);
  },true);

  const udsProfileState=window.__IPMG_RC538_UDS_PROFILE__||(window.__IPMG_RC538_UDS_PROFILE__={omitted:'',readingsVerified:false});
  if(typeof udsProfileState.readingsVerified!=='boolean')udsProfileState.readingsVerified=false;
  function udsProfile(){
    const device=val('udsDevice');
    if(device==='SAFE life 14-Panel Cup')return {kind:'14',label:'14-panel cup'};
    if(device==='SAFE life 13-Panel Cup')return {kind:'13',label:'13-panel cup'};
    if(device)return {kind:'other',label:device};
    return {kind:'',label:''};
  }
  function udsProfileIssues(){
    const p=udsProfile();
    if(!p.kind)return ['a named cup/device'];
    if(p.kind==='13'&&!udsProfileState.omitted)return ['the one panel not on this 13-panel cup'];
    if(p.kind==='other')return ['the device’s exact panel set'];
    return [];
  }
  function udsReadingVerificationIssues(){
    const profile=udsProfile();
    return (profile.kind==='13'||profile.kind==='14')&&!udsProfileState.readingsVerified?['physical cup and displayed panel readings verified']:[];
  }
  window.ipmgUdsPanelProfileIssues=udsProfileIssues;
    window.ipmgUdsAdditionalOutputIssues=udsReadingVerificationIssues;
    window.ipmgUdsFinalizationIssues=udsOutputIssues;
  function renderUdsProfile(){
    const device=by('udsDevice');if(!device)return;
    let box=by('udsPanelProfile');
    if(!box){box=document.createElement('div');box.id='udsPanelProfile';box.className='uds-panel-profile';const row=device.closest('.row3')||device.parentElement;row.insertAdjacentElement('afterend',box);}
    const p=udsProfile();box.innerHTML='';
    const head=document.createElement('strong');box.appendChild(head);
    const copy=document.createElement('div');box.appendChild(copy);
    if(p.kind==='14'){
      head.textContent='14-panel profile selected';copy.textContent='All displayed panels belong to this named cup. Review the readings, then use the normal result buttons for any exception.';
    }else if(p.kind==='13'){
      head.textContent='13-panel profile needs one quick choice';copy.textContent='Choose the one displayed panel that is not on this physical cup. The other 13 are prefilled as negative for review by exception.';
      const select=document.createElement('select');select.id='udsOmittedPanel';
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Which panel is not on this cup?';select.appendChild(placeholder);
      UDS_PANELS.forEach(panel=>{const option=document.createElement('option');option.value=panel;option.textContent=`${panel} — ${(UDS_PANEL_INFO[panel]||{}).name||panel}`;select.appendChild(option);});
      select.value=udsProfileState.omitted||'';select.addEventListener('change',()=>{udsProfileState.omitted=select.value;applyUdsDeviceProfile();});box.appendChild(select);
    }else if(p.kind==='other'){
      head.textContent='Other cup: document the actual visible panel set';copy.textContent='This stays a clinician handoff / needs-review record until the exact panel set is confirmed. Mark only the readings visible on the physical cup.';
    }else{
      head.textContent='Choose the actual cup first';copy.textContent='A result screen is kept as a draft until the physical point-of-care device is identified.';
    }
    if(p.kind==='13'||p.kind==='14'){
      const confirm=document.createElement('div');confirm.className='uds-profile-confirm';
      const input=document.createElement('input');input.type='checkbox';input.id='udsReadingsVerified';input.checked=!!udsProfileState.readingsVerified;
      const label=document.createElement('label');label.htmlFor=input.id;label.textContent='Physical cup and displayed panel readings verified for this encounter';
      input.addEventListener('change',()=>{udsProfileState.readingsVerified=!!input.checked;call(window.renderUdsNote);});
      confirm.append(input,label);box.appendChild(confirm);
    }
  }
  function applyUdsDeviceProfile(){
    udsProfileState.readingsVerified=false;
    const p=udsProfile();
    if(p.kind==='14')UDS_PANELS.forEach(panel=>{UDS.results[panel]='neg';});
    else if(p.kind==='13'&&udsProfileState.omitted)UDS_PANELS.forEach(panel=>{UDS.results[panel]=panel===udsProfileState.omitted?'nt':'neg';});
    else UDS_PANELS.forEach(panel=>{UDS.results[panel]='nt';});
    renderUdsProfile();call(window.renderUdsResults);call(window.renderUdsNote);
  }
  function udsOutputIssues(){
    const issues=[];
    if(!val('udsPtName'))issues.push('patient');
    if(!val('udsDOB'))issues.push('DOB');
    if(!val('udsDateTime'))issues.push('collection date/time');
    if(!val('udsDevice'))issues.push('cup/device');
    issues.push(...udsProfileIssues());
    issues.push(...udsReadingVerificationIssues());
    const trace=call(window.udsTraceIssues)||[];issues.push(...trace);
    if(val('udsExp')&&call(()=>monthExpired(val('udsExp'),val('udsDateTime')),false))issues.push('an in-date cup');
    const tested=UDS_PANELS.filter(panel=>(UDS.results[panel]||'nt')!=='nt');
    if(!tested.length)issues.push('at least one documented result');
    if(UDS.control!=='valid')issues.push('valid control line');
    if(UDS.temp!=='acceptable')issues.push('acceptable specimen temperature');
    if(UDS.validity!=='acceptable')issues.push('acceptable validity markers');
    return uniq(issues);
  }
  function setActionText(button,text){
    if(!button)return;
    if(!button.dataset.rc538OriginalHtml)button.dataset.rc538OriginalHtml=button.innerHTML;
    if(!button.dataset.rc538OriginalTitle)button.dataset.rc538OriginalTitle=button.title||'';
    button.textContent=text;
  }
  function restoreActionText(button){
    if(!button||!button.dataset.rc538OriginalHtml)return;
    button.innerHTML=button.dataset.rc538OriginalHtml;button.title=button.dataset.rc538OriginalTitle||'';
  }
  function writeUdsDraft(issues){
    const reason=issues.length?issues.join(', '):'required fields';
    const cc=`UDS documentation draft — collection or traceability is incomplete. No finalized screen result is documented.`;
    const as=`Draft status: complete ${reason} before treating this as a finalized point-of-care screen. Any visible result buttons remain staff working notes only.`;
    const pl=`Complete the missing documentation, verify the physical cup profile, then generate the clinician handoff. Do not interpret or release this draft as a final result.`;
    const ccEl=by('udsOutCC'),asEl=by('udsOutAS'),plEl=by('udsOutPL');
    if(by('udsScanPrev'))by('udsScanPrev').textContent=cc;
    if(ccEl)ccEl.innerHTML=`<p class="preview-line">${safe(cc)}</p><p>${safe(`Missing / review: ${reason}.`)}</p>`;
    if(asEl)asEl.innerHTML=`<p>${safe(as)}</p>`;
    if(plEl)plEl.innerHTML=`<p>${safe(pl)}</p>`;
    window._udsNote={cc,as,pl,tebra:[cc,as,pl].join('\n\n'),headline:cc,positives:[],invalids:[],negatives:[],notTested:UDS_PANELS.slice(),attentionLines:[as],followLines:[pl],contextLines:[]};
  }
  function updateUdsOutputs(){
    const issues=udsOutputIssues(),ready=!issues.length;
    ['printUdsReport','printUdsPatient'].forEach(id=>{const button=by(id);if(!button)return;button.disabled=!ready;button.setAttribute('aria-disabled',String(!ready));button.title=ready?'':`Complete ${issues.join(', ')} before printing a finalized UDS output.`;});
    const copy=by('udsCopyAll');if(copy){if(ready)restoreActionText(copy);else setActionText(copy,'Copy draft UDS handoff');}
    const log=by('addUdsLog');if(log){if(ready)restoreActionText(log);else setActionText(log,'Log as needs review');}
    const badge=document.querySelector('#panel-uds .note-top .badge');if(badge){if(!badge.dataset.rc538OriginalText)badge.dataset.rc538OriginalText=badge.textContent||'Live';badge.textContent=ready?badge.dataset.rc538OriginalText:'Draft';badge.classList.toggle('rc538-draft',!ready);}
    let banner=by('udsDraftBanner');if(!ready){if(!banner){banner=document.createElement('div');banner.id='udsDraftBanner';banner.className='uds-draft-banner';const qa=by('udsQa');if(qa)qa.insertAdjacentElement('afterend',banner);}if(banner)banner.innerHTML=`<strong>Draft UDS documentation</strong><div>Complete ${safe(issues.join(', '))} before a finalized result report is available. Copy stays available for a safe staff handoff.</div>`;writeUdsDraft(issues);}else if(banner)banner.remove();
    templateStates();enhanceAccessibility();
  }
  function wrapUds(){
    const old=window.renderUdsNote;
    if(typeof old==='function'&&!old.__rc538PremiumWrap){
      const wrapped=function(){const result=old.apply(this,arguments);renderUdsProfile();updateUdsOutputs();return result;};
      wrapped.__rc538PremiumWrap=true;window.renderUdsNote=wrapped;try{renderUdsNote=wrapped;}catch(e){}
    }
    const reset=window.softResetUds;
    if(typeof reset==='function'&&!reset.__rc538PremiumWrap){
      const wrappedReset=function(){const result=reset.apply(this,arguments);udsProfileState.omitted='';applyUdsDeviceProfile();return result;};
      wrappedReset.__rc538PremiumWrap=true;window.softResetUds=wrappedReset;try{softResetUds=wrappedReset;}catch(e){}
    }
  }
  function bindUds(){
    document.addEventListener('change',event=>{
      const target=event.target;if(!target)return;
      if(target.id==='udsDevice'){udsProfileState.omitted='';applyUdsDeviceProfile();}
      if(target.id==='udsOmittedPanel'){udsProfileState.omitted=target.value;applyUdsDeviceProfile();}
    },true);
    document.addEventListener('click',event=>{
      const reading=event.target&&event.target.closest&&event.target.closest('#udsResultGrid .cup-strip,#udsResultGrid [data-gstate]');
      if(reading)udsProfileState.readingsVerified=false;
      const quick=event.target&&event.target.closest&&event.target.closest('#udsAllNeg,#udsThcPos,[data-gstate="neg"]');
      if(quick&&udsProfileIssues().length){event.preventDefault();event.stopImmediatePropagation();say('Choose the physical cup and its panel profile before applying a bulk UDS result.');}
      const restore=event.target&&event.target.closest&&event.target.closest('#udsFastReview button');
      if(restore)setTimeout(applyUdsDeviceProfile,0);
    },true);
    document.addEventListener('keydown',event=>{
      const reading=event.target&&event.target.closest&&event.target.closest('#udsResultGrid .cup-strip');
      if(reading&&(event.key==='Enter'||event.key===' '))udsProfileState.readingsVerified=false;
    },true);
    ['input','change','click'].forEach(type=>document.addEventListener(type,event=>{
      if(event.target&&event.target.closest&&event.target.closest('#panel-uds'))setTimeout(()=>{call(window.renderUdsNote);},0);
    },true));
  }

  const emptySample=Object.freeze({key:'',label:'',generic:'',className:'',strengths:[],sigOptions:[],defaultSig:'',food:'',purpose:'',guard:'',watch:[],reminders:[]});
  function activeSample(){return SAMPLE_STATE&&SAMPLE_STATE.med?SAMPLE_STATE.med:emptySample;}
  function installSampleSafety(){
    const sampleMedRc538=function(){return activeSample();};
    window.sampleMed=sampleMedRc538;try{sampleMed=sampleMedRc538;}catch(e){}
    const oldSig=window.sampleSigText;
    const safeSig=function(){const entered=val('sampleSig');if(entered)return entered;const med=activeSample();return med.key?(med.defaultSig||''):'';};
    if(typeof oldSig==='function'){window.sampleSigText=safeSig;try{sampleSigText=safeSig;}catch(e){}}
    const oldPackages=window.renderSamplePackageButtons;
    const renderPackages=function(){
      const box=by('samplePackageButtons');if(!box)return;
      if(!activeSample().key){box.innerHTML='<div class="sample-sig-meta">Choose a medication first; package suggestions never imply what was physically handed out.</div>';return;}
      return call(oldPackages);
    };
    window.renderSamplePackageButtons=renderPackages;try{renderSamplePackageButtons=renderPackages;}catch(e){}
    const oldSuggestions=window.renderSampleSigSuggestions;
    const renderSuggestions=function(){
      const box=by('sampleSigSuggestions');if(!box)return;
      if(!activeSample().key){box.innerHTML='<div class="sig-head"><div><div class="sig-title">Directions appear after medication selection</div><div class="sig-help">Choose the medication, then intentionally apply or write the exact prescriber directions.</div></div></div>';renderPackages();return;}
      return call(oldSuggestions);
    };
    window.renderSampleSigSuggestions=renderSuggestions;try{renderSampleSigSuggestions=renderSuggestions;}catch(e){}
    const oldSelect=window.selectSampleMed;
    const select=function(m){
      const result=call(oldSelect,m);if(!m)return result;
      const label=`${m.label||''}${m.generic?` (${m.generic})`:''}`;
      if(by('sampleMedLabel'))by('sampleMedLabel').value=label;
      ['sampleQty','sampleSig','sampleTitration'].forEach(id=>{if(by(id))by(id).value='';});
      if(by('samplePurpose'))by('samplePurpose').value='';
      if(by('sampleFood'))by('sampleFood').value='auto';
      call(window.clearSampleDoseRows);
      const high=['lybalvi','cobenfy','fanapt','rexulti'].includes(m.key);
      if(by('sampleMedCheck'))by('sampleMedCheck').value=high?'not documented':'Prescriber reviewed / ok to dispense';
      if(by('sampleEdu'))by('sampleEdu').value='Reviewed with patient';
      call(window.renderSampleMedChips);renderSuggestions();renderPackages();call(window.renderSampleIntentChips);call(window.renderSamplePackageMeta);call(window.renderSampleHandout);templateStates();
      if(high)say(`${m.label} selected — enter today’s prescriber review before dispensing.`);
      return result;
    };
    if(typeof oldSelect==='function'){window.selectSampleMed=select;try{selectSampleMed=select;}catch(e){}}
    const clear=function(){
      SAMPLE_STATE.med=null;
      ['sampleMedLabel','sampleQty','sampleSig','sampleTitration','sampleExtra'].forEach(id=>{if(by(id))by(id).value='';});
      if(by('samplePurpose'))by('samplePurpose').value='';if(by('sampleFood'))by('sampleFood').value='auto';
      if(by('sampleMedCheck'))by('sampleMedCheck').value='not documented';if(by('sampleEdu'))by('sampleEdu').value='not documented';
      call(window.clearSampleDoseRows);call(window.renderSampleMedChips);renderSuggestions();renderPackages();call(window.renderSampleIntentChips);call(window.renderSamplePackageMeta);call(window.renderSampleHandout);templateStates();
    };
    window.clearSampleSelection=clear;
    const oldReset=window.resetSample;
    if(typeof oldReset==='function'&&!oldReset.__rc538PremiumWrap){const reset=function(){const result=oldReset.apply(this,arguments);clear();return result;};reset.__rc538PremiumWrap=true;window.resetSample=reset;try{resetSample=reset;}catch(e){}}
    document.addEventListener('click',event=>{
      const restore=event.target&&event.target.closest&&event.target.closest('#sampleFastReview button');
      if(restore)setTimeout(()=>{const med=activeSample();if(!med.key){if(by('sampleMedCheck'))by('sampleMedCheck').value='not documented';if(by('sampleEdu'))by('sampleEdu').value='not documented';}else if(['lybalvi','cobenfy','fanapt','rexulti'].includes(med.key)&&by('sampleMedCheck'))by('sampleMedCheck').value='not documented';call(window.renderSampleHandout);},0);
    },true);
    return clear;
  }

  function boot(){
    wrapUds();bindUds();const clearSamples=installSampleSafety();
    enhanceAccessibility();syncTabs();renderUdsProfile();applyUdsDeviceProfile();clearSamples();templateStates();
    const observer=new MutationObserver(()=>{enhanceAccessibility();syncTabs();});observer.observe(document.body,{childList:true,subtree:true});
    ['input','change'].forEach(type=>document.addEventListener(type,()=>setTimeout(templateStates,0),true));
    try{window.IPMG_RC_VERSION='RC5.38 Premium Quick Complete';}catch(e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
/* </script> */

;

/* Legacy runtime block 19: <script id="rc538RecordLifecycleScript"> */
/* ===================== RC5.38: compact injection drafts, locked records, and addenda ===================== */
(function(){
  'use strict';
  if(window.__IPMG_RC538_RECORDS__)return;
  window.__IPMG_RC538_RECORDS__=true;
  const by=id=>document.getElementById(id);
  const val=id=>{const el=by(id);return el&&'value' in el?String(el.value||'').trim():'';};
  const safe=v=>String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const clone=value=>{try{return JSON.parse(JSON.stringify(value));}catch(e){return {};}};
  const mergeObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  function mergePreservingUnknown(previous,next){
    const merged=mergeObject(previous)?clone(previous):{};
    if(!mergeObject(next))return clone(next);
    Object.keys(next).forEach(key=>{
      const priorValue=mergeObject(previous)?previous[key]:undefined,nextValue=next[key];
      merged[key]=mergeObject(priorValue)&&mergeObject(nextValue)
        ?mergePreservingUnknown(priorValue,nextValue)
        :clone(nextValue);
    });
    return merged;
  }
  const call=(fn,...args)=>{try{return typeof fn==='function'?fn(...args):undefined;}catch(e){return undefined;}};
  const say=message=>call(window.toast,message);
  const storageKey='ipmgMedAssistInjectionRecordsV1';
  const fieldIds=['ptName','ptDOB','orderingProvider','injOrderPurpose','ndc','lot','exp','injProductSource','injProductSourceOther','injPreparation','injPreparationDetail','injWasteToggle','injWasteAmount','injWasteWitness','injProductIssueToggle','injProductIssueDetail','injProductIssueAction','injProductIssueRecipient','injProductIssueNotificationTime','injProductIssueDirection','injProductIssueNextStep','allergies','bp','hr','temp','rr','spo2','vitalRepeatNote','tech','priorDose','priorSite','adminDate','injAdminTime','injSecondAdminTime','nextDate','clinic','respCustom','admin','injVolume','injVolumeUnit','injDevice','injDeviceOther','injSiteCondition','injSiteConditionDetail','injExceptionToggle','injExceptionSummary','injExceptionRecipient','injExceptionTime','injExceptionOutcome'];
  let recordsStorageProblem='';
  let records=loadRecords(),activeId='',mode='edit',autoTimer=null,lockRefreshTimer=null,applying=false,saveFeedback='idle',lastPersistOk=true,recordGeneration=0;

  function inspectStoredRecords(){
    let raw='';
    try{raw=window.localStorage.getItem(storageKey)||'';}
    catch(e){return {ok:false,message:'Injection records could not be read from browser storage. Existing data was left unchanged; keep this page open and restore storage access before saving.'};}
    if(!raw)return {ok:true,records:[]};
    let parsed;
    try{parsed=JSON.parse(raw);}
    catch(e){return {ok:false,message:'Stored injection records contain malformed JSON. Existing data was left unchanged; recover or export it before saving.'};}
    if(!Array.isArray(parsed))return {ok:false,message:'Stored injection records are not in the expected list format. Existing data was left unchanged; recover or export it before saving.'};
    const invalid=parsed.some(record=>!record||typeof record!=='object'||Array.isArray(record)||record.type!=='injection'||typeof record.id!=='string'||!record.id.trim());
    if(invalid)return {ok:false,message:'Stored injection records contain an invalid entry. Existing data was left unchanged; recover or export it before saving.'};
    return {ok:true,records:parsed};
  }
  function writeStorage(value){
    try{
      if(typeof SAFE_STORAGE!=='undefined')return SAFE_STORAGE.set(storageKey,value)===true;
      window.localStorage.setItem(storageKey,value);return true;
    }catch(e){return false;}
  }
  function loadRecords(){
    const stored=inspectStoredRecords();
    if(!stored.ok){recordsStorageProblem=stored.message;return [];}
    recordsStorageProblem='';
    return stored.records;
  }
  function persist(){
    const stored=inspectStoredRecords();
    if(!stored.ok){
      recordsStorageProblem=stored.message;lastPersistOk=false;refreshRecordsDrawer();
      return false;
    }
    records.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    lastPersistOk=writeStorage(JSON.stringify(records));
    recordsStorageProblem=lastPersistOk?'':'Injection records could not be written to browser storage. Existing data was left unchanged; keep this page open and restore storage access before saving.';
    refreshRecordsDrawer();
    return lastPersistOk;
  }
  function now(){return new Date().toISOString();}
  function stamp(value){const date=new Date(value||'');if(Number.isNaN(date.getTime()))return 'Saved locally';return date.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
  function makeId(){return `inj_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;}
  function currentRecord(){return records.find(record=>record.id===activeId)||null;}
  function meaningful(){return !!(val('ptName')||val('ptDOB')||val('orderingProvider')||val('lot')||val('ndc')||(S&&S.med)||(S&&S.dose));}
  function draftNeedsPersistence(){const record=currentRecord();return meaningful()||!!(record&&record.status==='draft');}
  function noteSnapshot(){const note=window._note||{};return {cc:String(note.cc||''),as:String(note.as||''),pl:String(note.pl||'')};}
  /* Product/schedule provenance is kept outside visible legacy fields. It is
     documentation context only: the plain #ndc and #nextDate values remain
     the fields used by legacy notes, print, and readiness. */
  function injectionDocumentationMetadata(){
    const raw=window.__IPMG_INJECTION_DOCUMENTATION_METADATA__;
    if(!mergeObject(raw))return {};
    const selection=value=>{
      if(!mergeObject(value))return null;
      const next={};
      if(typeof value.ndc==='string'&&value.ndc)next.ndc=value.ndc;
      ['packageLabel','package','labeler','medicationKey','dose','referenceVersion'].forEach(key=>{if(typeof value[key]==='string'&&value[key].trim())next[key]=value[key].trim();});
      if(['commercial','sample'].includes(value.packageKind))next.packageKind=value.packageKind;
      if(['bundled','remote','custom'].includes(value.source))next.source=value.source;
      return Object.keys(next).length?next:null;
    };
    const next={};
    if(typeof raw.clinicalReferenceVersion==='string'&&raw.clinicalReferenceVersion.trim())next.clinicalReferenceVersion=raw.clinicalReferenceVersion.trim();
    if(mergeObject(raw.ndcSelection)){
      const primary=selection(raw.ndcSelection.primary),pairedSecond=selection(raw.ndcSelection.pairedSecond);
      if(primary||pairedSecond)next.ndcSelection={...(primary?{primary}:{}),...(pairedSecond?{pairedSecond}:{})};
    }
    if(mergeObject(raw.nextDose)){
      const provenance={};
      if(typeof raw.nextDose.value==='string'&&raw.nextDose.value.trim())provenance.value=raw.nextDose.value.trim();
      if(['calculated','manual'].includes(raw.nextDose.source))provenance.source=raw.nextDose.source;
      if(typeof raw.nextDose.calculatedFrom==='string'&&raw.nextDose.calculatedFrom.trim())provenance.calculatedFrom=raw.nextDose.calculatedFrom.trim();
      if(Object.keys(provenance).length)next.nextDose=provenance;
    }
    return next;
  }
  function captureSnapshot(previousSnapshot){
    const fields={};fieldIds.forEach(id=>{const el=by(id);if(el&&'value' in el)fields[id]=el.type==='checkbox'?!!el.checked:el.value;});
    const root=window.__IPMG_RC530__||{};
    const current={
      version:4,medKey:S.med&&S.med.key||'',state:{dose:S.dose||'',site:S.site||'',route:S.route||'',intervalKey:S.intervalKey||'',reason:S.reason||'',resp:S.resp||'',attest:clone(S.attest||{}),flags:clone(S.flags||{}),guard:clone(S.guard||{}),retCustom:!!S.retCustom},
      initiation:clone(call(window.ipmgInitiationProtocolSnapshot)||{}),
      smartVitals:clone(call(window.ipmgSmartVitalsSnapshot)||{}),
      disposition:clone(call(window.ipmgClinicalDispositionSnapshot)||{}),
      fields,safetyNone:!!root.safetyNone,note:noteSnapshot(),documentation:injectionDocumentationMetadata()
    };
    const snapshot=mergePreservingUnknown(previousSnapshot,current);
    snapshot.version=4;
    /* Unlike opaque future fields, this metadata must mirror current staff
       input exactly so a cleared custom NDC cannot leave stale provenance. */
    snapshot.documentation=current.documentation;
    return snapshot;
  }
  function recordSummary(snapshot){
    const med=S.med||MEDS.find(item=>item.key===snapshot.medKey)||{};
    const protocol=call(window.ipmgInitiationProtocolSummary)||'';
    return [med.name||med.label||'Injection',snapshot.state&&snapshot.state.dose||''].filter(Boolean).join(' ')+(protocol?` — ${protocol}`:'');
  }
  function normalizedAttestation(value){
    if(!mergeObject(value))return null;
    const staff=String(value.staff||'').trim(),timestamp=String(value.timestamp||'').trim(),statementVersion=String(value.statementVersion||'').trim();
    const parsed=new Date(timestamp);
    if(!staff||!statementVersion||!timestamp||Number.isNaN(parsed.getTime()))return null;
    return {staff,timestamp:parsed.toISOString(),statementVersion};
  }
  function storedAttestation(value){
    if(!mergeObject(value))return null;
    const staff=String(value.staff||'').trim(),timestamp=String(value.timestamp||'').trim(),statementVersion=String(value.statementVersion||'').trim();
    return staff&&timestamp&&statementVersion?{staff,timestamp,statementVersion}:null;
  }
  function lockAuditEvent(timestamp,attestation,documentation){
    return {
      id:`audit_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      event:'record_locked',
      timestamp,
      staff:attestation&&attestation.staff||'',
      statementVersion:attestation&&attestation.statementVersion||'',
      attestationTimestamp:attestation&&attestation.timestamp||'',
      ...(mergeObject(documentation)&&Object.keys(documentation).length?{documentation:clone(documentation)}:{})
    };
  }
  function upsert(status,options={}){
    const previousRecords=records.slice(),previousActiveId=activeId;
    const existing=currentRecord(),snapshot=captureSnapshot(existing&&existing.snapshot),time=now();
    const patch={
      id:existing&&existing.id||makeId(),type:'injection',status,createdAt:existing&&existing.createdAt||time,updatedAt:time,
      completedAt:status==='completed'?(existing&&existing.completedAt||time):'',patient:{name:val('ptName'),dob:val('ptDOB')},summary:recordSummary(snapshot),snapshot,addenda:clone(existing&&existing.addenda||[])
    };
    if(status==='completed'){
      const audit=Array.isArray(existing&&existing.audit)?clone(existing.audit):[];
      patch.audit=[...audit,lockAuditEvent(time,options.attestation||null,snapshot.documentation)];
      if(options.attestation)patch.attestation={...clone(options.attestation),...(mergeObject(snapshot.documentation)&&Object.keys(snapshot.documentation).length?{documentation:clone(snapshot.documentation)}:{})};
    }
    const record=mergePreservingUnknown(existing,patch);
    const index=records.findIndex(item=>item.id===record.id);if(index>=0)records[index]=record;else records.unshift(record);
    activeId=record.id;
    if(!persist()){
      records=previousRecords;activeId=previousActiveId;refreshRecordsDrawer();
      return null;
    }
    return record;
  }
  function canComplete(){const badge=by('clinicalDispositionBadge');return mode==='edit'&&!!badge&&/Administration documented/i.test(badge.textContent||'');}
  function saveDraft(silent=false,updateUi=true){
    if(mode!=='edit'||!draftNeedsPersistence())return null;
    const hadRecord=!!currentRecord();
    const restoreSaveFocus=!!(document.activeElement&&document.activeElement.matches&&document.activeElement.matches('[data-inj-save]'));
    const record=upsert('draft');
    saveFeedback=record?'saved':'error';
    if(updateUi){
      if(silent&&hadRecord)updateRecordStatus();
      else renderWorkspace({restoreSaveFocus});
    }
    if(!silent)say(record?'Injection draft saved locally.':'Injection draft could not be saved in this browser. Keep this page open and check browser storage access.');
    return record;
  }
  function flushDraft(updateUi=true){
    clearTimeout(autoTimer);autoTimer=null;
    if(applying||mode!=='edit'||!draftNeedsPersistence())return null;
    return saveDraft(true,updateUi);
  }
  function scheduleDraft(){
    if(applying||mode!=='edit')return;
    if(!draftNeedsPersistence()){
      clearTimeout(autoTimer);autoTimer=null;saveFeedback='idle';updateRecordStatus();return;
    }
    saveFeedback='saving';
    updateRecordStatus();
    clearTimeout(autoTimer);autoTimer=setTimeout(()=>saveDraft(true),700);
  }
  function statusCopy(record){
    if(saveFeedback==='error')return {badge:'Save failed',className:'error',detail:recordsStorageProblem||'The latest changes are still visible, but this browser did not accept the local save. Keep this page open and check storage access before switching records.'};
    if(mode==='readonly'&&record)return {badge:'Completed / locked',className:'locked',detail:`Completed ${stamp(record.completedAt||record.updatedAt)}. This snapshot cannot be changed; use a dated addendum for corrections or follow-up.`};
    if(saveFeedback==='saving')return {badge:'Saving…',className:'saving',detail:'Saving the latest encounter changes in this browser.'};
    if(record)return {badge:'Saved',className:'draft saved',detail:`Saved ${stamp(record.updatedAt)} in this browser. Complete and lock after the final clinical disposition is ready.`};
    return {badge:'New draft',className:'',detail:'A local draft begins automatically once you enter encounter details. This is not a replacement for the approved EHR record.'};
  }
  function updateRecordStatus(){
    const workspace=by('injRecordWorkspace'),badge=by('injRecordStatus'),detail=workspace&&workspace.querySelector('.inj-record-status');
    if(!badge||!detail)return;
    const status=statusCopy(currentRecord());
    badge.className=`record-badge ${status.className}`.trim();
    if(badge.textContent!==status.badge)badge.textContent=status.badge;
    if(detail.textContent!==status.detail)detail.textContent=status.detail;
    const complete=workspace.querySelector('[data-inj-complete]'),ready=canComplete();
    if(complete){
      complete.disabled=!ready;
      complete.title=ready?'Lock the completed injection record.':'Finish the clinical disposition and required checks first.';
    }
  }
  function ensureWorkspace(){
    let workspace=by('injRecordWorkspace');if(workspace)return workspace;
    const column=document.querySelector('#panel-administer .preview-col');if(!column)return null;
    workspace=document.createElement('section');workspace.id='injRecordWorkspace';workspace.className='inj-record-workspace';workspace.setAttribute('aria-label','Injection record status');column.insertBefore(workspace,column.firstChild);return workspace;
  }
  function addendaHtml(record){
    const entries=(record.addenda||[]).slice().reverse();
    const list=entries.length?`<div class="record-addenda-list">${entries.map(entry=>`<div class="record-addenda-item"><b>${safe(entry.author||'Staff')}</b> · ${safe(stamp(entry.createdAt))}<br>${safe(entry.text||'').replace(/\n/g,'<br>')}</div>`).join('')}</div>`:'';
    const author=String(call(window.getStoredStaff)||'').trim();
    return `<div class="record-readonly-banner"><b>Read-only completed record.</b> The original encounter snapshot is locked. Add a dated addendum instead of changing the completed documentation.</div><div class="record-addendum"><div class="record-addendum-author"><label for="injAddendumAuthor">Addendum entered by</label><input id="injAddendumAuthor" value="${safe(author)}" placeholder="Current staff name or initials" autocomplete="off"></div><label for="injAddendumText">Dated addendum</label><div class="record-addendum-grid"><textarea id="injAddendumText" placeholder="Clarification, correction, or follow-up. The original completed record remains unchanged."></textarea><button type="button" data-inj-addendum>Save addendum</button></div>${list}</div>`;
  }
  function historyHtml(){
    if(!records.length)return '';
    const rows=records.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,5).map(record=>{
      const active=record.id===activeId?' active':'';const title=record.patient&&record.patient.name||record.summary||'Untitled injection';const meta=`${record.status==='completed'?'Completed':'Draft'} · ${stamp(record.completedAt||record.updatedAt)}`;
      return `<div class="record-row${active}"><div class="record-row-main"><div class="record-row-title">${safe(title)}</div><div class="record-row-meta">${safe(meta)}</div></div><button type="button" class="record-row-action" data-record-open="${safe(record.id)}">${record.status==='completed'?'View':'Edit'}</button></div>`;
    }).join('');
    return `<div class="inj-record-list"><div class="inj-record-list-title">Recent local records</div>${rows}<button type="button" class="record-history-open" data-records-drawer-open>View all local injection records</button></div>`;
  }
  const recordsDrawerState={query:'',filter:'all',lastFocus:null,closing:false};
  const recordsDrawerFilters=[['all','All'],['draft','Drafts'],['completed','Locked'],['addenda','Addenda']];
  let recordsDrawerHideTimer=null;
  function drawerRecordText(record){
    const snapshot=record&&record.snapshot||{},fields=snapshot.fields||{},state=snapshot.state||{};
    const addenda=Array.isArray(record&&record.addenda)?record.addenda:[];
    return [record&&record.patient&&record.patient.name,record&&record.patient&&record.patient.dob,record&&record.summary,record&&record.status,snapshot.medKey,state.dose,state.site,state.route,fields.orderingProvider,fields.injOrderPurpose,fields.ndc,fields.lot,fields.adminDate,fields.injAdminTime,fields.tech,fields.injProductSource,fields.injPreparation,fields.injDevice,fields.injExceptionSummary,fields.injExceptionRecipient,...addenda.map(entry=>[entry&&entry.author,entry&&entry.text].join(' '))].filter(Boolean).join(' ').toLowerCase();
  }
  function drawerRecords(){
    const query=recordsDrawerState.query.trim().toLowerCase();
    return records.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).filter(record=>{
      const matchesFilter=recordsDrawerState.filter==='all'||(recordsDrawerState.filter==='addenda'?Array.isArray(record.addenda)&&record.addenda.length:record.status===recordsDrawerState.filter);
      return matchesFilter&&(!query||drawerRecordText(record).includes(query));
    });
  }
  function drawerMessage(record){
    const addenda=Array.isArray(record.addenda)?record.addenda.length:0;
    const addendumText=addenda?' / '+addenda+' addendum'+(addenda===1?'':'s'):'';
    return record.status==='completed'?'Locked '+stamp(record.completedAt||record.updatedAt)+addendumText:'Draft updated '+stamp(record.updatedAt)+addendumText;
  }
  function ensureRecordsDrawer(){
    const sidebar=document.querySelector('.app-sidebar');
    if(sidebar&&!by('recordsDrawerTrigger')){
      const launcher=document.createElement('section');
      launcher.className='records-launcher';
      launcher.setAttribute('aria-label','Local injection records');
      launcher.innerHTML='<div class="records-launcher-kicker">Records</div><button type="button" class="records-drawer-trigger" id="recordsDrawerTrigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="recordsDrawerLayer"><span class="records-trigger-copy"><b>Injection records</b><small>Search drafts and locked snapshots</small></span><strong class="records-trigger-count" id="recordsDrawerCount">0</strong><span class="records-trigger-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m9 5 7 7-7 7"/></svg></span></button>';
      const staffbar=sidebar.querySelector('.staffbar');
      if(staffbar)sidebar.insertBefore(launcher,staffbar);else sidebar.appendChild(launcher);
      by('recordsDrawerTrigger')?.addEventListener('click',openRecordsDrawer);
    }
    let layer=by('recordsDrawerLayer');
    if(!layer&&window.IPMG_RECORDS_WINDOW_OWNED)return null;
    if(!layer){
      layer=document.createElement('div');
      layer.id='recordsDrawerLayer';
      layer.className='records-drawer-layer';
      layer.hidden=true;
      layer.innerHTML='<div class="records-drawer-scrim" data-records-close aria-hidden="true"></div><section class="records-drawer" role="dialog" aria-modal="true" aria-labelledby="recordsDrawerTitle"><div class="records-drawer-head"><div><div class="records-drawer-kicker">Local workspace</div><h2 id="recordsDrawerTitle">Injection records</h2><p>Search local drafts and locked encounter snapshots.</p></div><button type="button" class="records-drawer-close" data-records-close aria-label="Close injection records"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="records-drawer-search"><label class="records-sr-only" for="recordsDrawerSearch">Search local injection records</label><input id="recordsDrawerSearch" type="search" placeholder="Patient, DOB, medication, NDC, or lot" autocomplete="off"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg></span></div><div class="records-drawer-filters" role="group" aria-label="Filter injection records">'+recordsDrawerFilters.map(item=>'<button type="button" data-records-filter="'+item[0]+'" aria-pressed="'+(item[0]==='all'?'true':'false')+'">'+item[1]+'</button>').join('')+'</div><div class="records-drawer-status" id="recordsDrawerStatus" role="status" aria-live="polite"></div><div class="records-drawer-results" id="recordsDrawerResults"></div><div class="records-drawer-foot"><p>Saved only in this browser. Locked records remain read-only.</p><button type="button" class="records-drawer-new" data-records-new>+ New injection</button></div></section>';
      document.body.appendChild(layer);
      by('recordsDrawerSearch')?.addEventListener('input',event=>{recordsDrawerState.query=event.target.value||'';renderRecordsDrawer();});
      layer.querySelectorAll('[data-records-filter]').forEach(button=>button.addEventListener('click',()=>{recordsDrawerState.filter=button.dataset.recordsFilter||'all';renderRecordsDrawer();}));
      layer.querySelectorAll('[data-records-close]').forEach(button=>button.addEventListener('click',()=>closeRecordsDrawer(true)));
      by('recordsDrawerResults')?.addEventListener('click',event=>{const button=event.target&&event.target.closest&&event.target.closest('[data-records-open]');if(button)openDrawerRecord(button.dataset.recordsOpen);});
      layer.querySelector('[data-records-new]')?.addEventListener('click',newDrawerInjection);
      document.addEventListener('keydown',handleRecordsDrawerKeys);
    }
    return layer;
  }
  function updateRecordsLauncher(){
    const count=by('recordsDrawerCount'),trigger=by('recordsDrawerTrigger');
    if(count)count.textContent=String(records.length);
    if(trigger)trigger.setAttribute('aria-label','Open '+records.length+' local injection record'+(records.length===1?'':'s'));
  }
  function renderRecordsDrawer(){
    const layer=ensureRecordsDrawer(),results=by('recordsDrawerResults'),status=by('recordsDrawerStatus');
    if(!layer||!results||!status)return;
    const visible=drawerRecords(),total=records.length;
    updateRecordsLauncher();
    layer.querySelectorAll('[data-records-filter]').forEach(button=>{const active=button.dataset.recordsFilter===recordsDrawerState.filter;button.classList.toggle('on',active);button.setAttribute('aria-pressed',String(active));});
    status.textContent=visible.length===total?String(total)+' local record'+(total===1?'':'s'):String(visible.length)+' of '+String(total)+' local record'+(total===1?'':'s');
    results.innerHTML=visible.length?visible.map(record=>{
      const title=record.patient&&record.patient.name||record.summary||'Untitled injection';
      const summary=record.summary||'No medication selected';
      const locked=record.status==='completed',action=locked?'View locked snapshot':'Resume draft';
      return '<button type="button" class="records-drawer-row '+(locked?'locked':'draft')+'" data-records-open="'+safe(record.id)+'" aria-label="'+safe(action+' for '+title)+'"><span class="records-drawer-row-top"><span class="records-drawer-row-title">'+safe(title)+'</span><span class="records-drawer-row-badge '+(locked?'locked':'draft')+'">'+(locked?'Locked':'Draft')+'</span></span><span class="records-drawer-row-summary">'+safe(summary)+'</span><span class="records-drawer-row-meta">'+safe(drawerMessage(record))+'</span><span class="records-drawer-row-action">'+safe(action)+' <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m9 5 7 7-7 7"/></svg></span></button>';
    }).join(''):'<div class="records-drawer-empty"><b>No matching local injection records.</b><span>Try another patient, medication, traceability field, or filter.</span></div>';
  }
  const recordsChangeHandlers=[];
  function refreshRecordsDrawer(){
    ensureRecordsDrawer();
    renderRecordsDrawer();
    recordsChangeHandlers.forEach(handler=>{try{handler();}catch(error){}});
  }
  function openRecordsDrawer(){
    const layer=ensureRecordsDrawer();if(!layer)return;
    clearTimeout(recordsDrawerHideTimer);
    recordsDrawerState.closing=false;
    recordsDrawerState.lastFocus=document.activeElement;
    layer.hidden=false;layer.style.pointerEvents='';layer.removeAttribute('aria-hidden');
    const dialog=layer.querySelector('[role="dialog"]');if(dialog)dialog.inert=false;
    const shell=document.querySelector('.cd2004-shell')||document.querySelector('.app-shell');if(shell)shell.inert=true;
    document.body.classList.add('records-drawer-open');
    by('recordsDrawerTrigger')?.setAttribute('aria-expanded','true');
    renderRecordsDrawer();
    requestAnimationFrame(()=>layer.classList.add('is-open'));
    setTimeout(()=>by('recordsDrawerSearch')?.focus(),30);
  }
  function closeRecordsDrawer(restoreFocus=true,afterClose=null){
    const layer=by('recordsDrawerLayer');if(!layer||layer.hidden)return;
    const reduced=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches),duration=reduced?0:160;
    recordsDrawerState.closing=true;
    layer.classList.remove('is-open');document.body.classList.remove('records-drawer-open');
    layer.setAttribute('aria-hidden','true');layer.style.pointerEvents='none';
    const dialog=layer.querySelector('[role="dialog"]');if(dialog)dialog.inert=true;
    const shell=document.querySelector('.cd2004-shell')||document.querySelector('.app-shell');
    by('recordsDrawerTrigger')?.setAttribute('aria-expanded','false');
    clearTimeout(recordsDrawerHideTimer);recordsDrawerHideTimer=setTimeout(()=>{
      layer.hidden=true;recordsDrawerState.closing=false;if(shell)shell.inert=false;
      if(restoreFocus){
        const target=recordsDrawerState.lastFocus&&document.contains(recordsDrawerState.lastFocus)?recordsDrawerState.lastFocus:by('recordsDrawerTrigger');
        if(target&&typeof target.focus==='function')target.focus({preventScroll:true});
      }
      if(typeof afterClose==='function')afterClose();
    },duration);
  }
  function handleRecordsDrawerKeys(event){
    const layer=by('recordsDrawerLayer');if(!layer||layer.hidden||recordsDrawerState.closing||!layer.classList.contains('is-open'))return;
    if(event.key==='Escape'){event.preventDefault();closeRecordsDrawer();return;}
    if(event.key!=='Tab')return;
    const focusable=[...layer.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href]')].filter(node=>node.offsetParent!==null);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(!layer.contains(document.activeElement)){event.preventDefault();first.focus();return;}
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  function openDrawerRecord(id){
    if(!records.some(record=>record.id===id))return;
    closeRecordsDrawer(false,()=>{
      window.IPMGNavigation?.activate('administer',{resetScroll:true});
      if(openRecord(id)!==false){
        const workspace=by('injRecordWorkspace');if(workspace){workspace.tabIndex=-1;workspace.focus({preventScroll:true});}
      }
    });
  }
  function newDrawerInjection(){
    closeRecordsDrawer(false,()=>{
      window.IPMGNavigation?.activate('administer',{resetScroll:true});
      if(newInjection()!==false)by('ptName')?.focus({preventScroll:true});
    });
  }
  function attestationSummary(){
    const record=currentRecord(),snapshot=record&&record.snapshot||{},fields=snapshot.fields||{},state=snapshot.state||{};
    const liveMedication=S&&S.med&&S.med.name||S&&S.med&&S.med.label||'';
    const savedMedication=record&&record.summary||'';
    const badge=by('clinicalDispositionBadge');
    const disposition=String(badge&&badge.textContent||'').trim();
    const status=statusCopy(record);
    const lifecycle=saveFeedback==='error'?'error':saveFeedback==='saving'?'saving':mode==='readonly'?'locked':record?'draft':'new';
    return {
      lifecycle,
      canAttest:mode==='edit'&&canComplete(),
      activeRecordId:record&&record.id||'',
      patient:{name:val('ptName')||record&&record.patient&&record.patient.name||'',dob:val('ptDOB')||record&&record.patient&&record.patient.dob||''},
      localRecord:record&&record.id||'Unsaved local draft',
      medication:liveMedication||savedMedication||snapshot.medKey||'',
      disposition:disposition||String(state.reason||fields.injExceptionSummary||''),
      staff:String(call(window.getStoredStaff)||val('tech')||'').trim(),
      timestamp:now(),
      attestation:storedAttestation(record&&record.attestation)||undefined,
      detail:status.detail
    };
  }
  /* Record lifecycle for the typed records window. openRecord() restores a
     v4 snapshot into the encounter form - the one path by which a draft is
     resumed or a locked record viewed - so it is exposed rather than
     re-derived. */
  window.IPMGRecords={
    /* Deliberately not openDrawerRecord/newDrawerInjection: those route through
       closeRecordsDrawer(), which early-returns when no legacy layer exists and
       so never runs its afterClose callback - the part that actually restores
       the record. The typed window closes itself, then calls the same proven
       openRecord()/newInjection() those callbacks call. */
    open:id=>{
      if(!records.some(record=>record.id===id))return false;
      window.IPMGNavigation?.activate('administer',{resetScroll:true});
      if(openRecord(id)!==false){
        const workspace=by('injRecordWorkspace');
        if(workspace){workspace.tabIndex=-1;workspace.focus({preventScroll:true});}
        return true;
      }
      return false;
    },
    create:()=>{
      window.IPMGNavigation?.activate('administer',{resetScroll:true});
      const created=newInjection();
      if(created!==false)by('ptName')?.focus({preventScroll:true});
      return created!==false;
    },
    /* Discard is intentionally separate from create(): create() saves any
       meaningful current work first, while discard removes only an editable
       local draft after the visible workstation has obtained confirmation. */
    discard:()=>discardInjectionDraft(),
    attestAndLock:attestation=>{
      const normalized=normalizedAttestation(attestation);
      if(!normalized){
        say('Enter the documenting staff member and accept the current local attestation statement before locking this record.');
        return false;
      }
      return completeRecord(normalized,{showCompletion:false});
    },
    attestationSummary:()=>attestationSummary(),
    state:()=>{
      const record=currentRecord(),status=statusCopy(record);
      const lifecycle=saveFeedback==='error'?'error':saveFeedback==='saving'?'saving':mode==='readonly'?'locked':record?'draft':'new';
      return {lifecycle,canDiscard:mode==='edit'&&draftNeedsPersistence(),activeRecordId:record&&record.id||'',detail:status.detail};
    },
    list:()=>records.slice(),
    count:()=>records.length,
    onChange:handler=>{if(typeof handler==='function')recordsChangeHandlers.push(handler);},
  };
  function renderWorkspace(options={}){
    const workspace=ensureWorkspace();if(!workspace)return;
    const restoreSaveFocus=!!options.restoreSaveFocus;
    const record=currentRecord(),status=statusCopy(record),complete=canComplete();
    const draftText=record&&record.status==='draft'?'Save draft':'Save draft';
    workspace.innerHTML=`<div class="inj-record-head"><div><div class="inj-record-kicker">Injection record</div><div class="inj-record-title">Fast, persistent encounter state</div><div class="inj-record-sub">Draft as you go. Complete once, then keep the locked snapshot read-only.</div></div><span class="record-badge ${status.className}" id="injRecordStatus" role="status" aria-live="polite" aria-atomic="true">${safe(status.badge)}</span></div><div class="inj-record-actions"><button type="button" class="inj-record-btn" data-inj-save ${mode==='readonly'?'disabled':''}>${draftText}</button><button type="button" class="inj-record-btn complete" data-inj-complete ${complete?'':'disabled'} title="${complete?'Lock the completed injection record.':'Finish the clinical disposition and required checks first.'}">Complete &amp; lock</button><button type="button" class="inj-record-btn icon" data-inj-new title="Start a new injection" aria-label="Start a new injection">+</button></div><div class="inj-record-status">${safe(status.detail)}</div>${mode==='readonly'&&record?addendaHtml(record):''}${historyHtml()}`;
    workspace.querySelector('[data-inj-save]')?.addEventListener('click',()=>saveDraft(false));
    workspace.querySelector('[data-inj-complete]')?.addEventListener('click',()=>completeRecord());
    workspace.querySelector('[data-inj-new]')?.addEventListener('click',newInjection);
    workspace.querySelectorAll('[data-record-open]').forEach(button=>button.addEventListener('click',()=>openRecord(button.dataset.recordOpen)));
    workspace.querySelector('[data-records-drawer-open]')?.addEventListener('click',openRecordsDrawer);
    workspace.querySelector('[data-inj-addendum]')?.addEventListener('click',saveAddendum);
    applyRecordLock();
    if(restoreSaveFocus)requestAnimationFrame(()=>workspace.querySelector('[data-inj-save]')?.focus({preventScroll:true}));
  }
  function applyRecordLock(){
    const panel=by('panel-administer'),locked=mode==='readonly'&&!!currentRecord();if(!panel)return;
    panel.classList.toggle('record-readonly',locked);panel.setAttribute('aria-readonly',String(locked));
    panel.querySelectorAll('input,select,textarea,button').forEach(control=>{
      const allow=['copyAll','printAVS','injWorksheetPrint','injWorksheetBlank'].includes(control.id)||
        !!control.closest('#injRecordWorkspace,#rc526Flow')||
        control.matches('.rc530-summary,.rc526-summary,.inj-detail-toggle,.needle-guide-toggle,.smsbtn')||
        control.id==='adminGuideEdit';
      if(locked&&!allow){if(!('rc538WasDisabled' in control.dataset))control.dataset.rc538WasDisabled=control.disabled?'1':'0';control.disabled=true;control.setAttribute('aria-disabled','true');}
      if(!locked&&('rc538WasDisabled' in control.dataset)){control.disabled=control.dataset.rc538WasDisabled==='1';delete control.dataset.rc538WasDisabled;if(!control.disabled)control.removeAttribute('aria-disabled');}
    });
    panel.querySelectorAll('.form-col [role="button"],.form-col [tabindex],.form-col #medClear,.form-col [data-site]').forEach(control=>{
      if(locked){
        if(!('rc538TabIndex' in control.dataset))control.dataset.rc538TabIndex=control.hasAttribute('tabindex')?control.getAttribute('tabindex'):'none';
        control.tabIndex=-1;control.setAttribute('aria-disabled','true');
      }else if('rc538TabIndex' in control.dataset){
        const previous=control.dataset.rc538TabIndex;
        if(previous==='none')control.removeAttribute('tabindex');else control.setAttribute('tabindex',previous);
        delete control.dataset.rc538TabIndex;control.removeAttribute('aria-disabled');
      }
    });
    clearTimeout(lockRefreshTimer);
    lockRefreshTimer=setTimeout(()=>call(window.IPMGSmartWorkspace&&window.IPMGSmartWorkspace.refresh),120);
  }
  function showLockedOutput(record){
    const note=record.snapshot&&record.snapshot.note||{};const cc=note.cc||`${record.summary||'Injection'} completed.`;const as=note.as||'Completed injection record — read-only snapshot.';const pl=note.pl||'Use a dated addendum for any correction or follow-up.';
    if(by('scanPrev'))by('scanPrev').textContent=cc;
    if(by('outCC'))by('outCC').innerHTML=`<p class="preview-line">${safe(cc)}</p>`;
    if(by('outAS'))by('outAS').innerHTML=safe(as).split('\n').map(line=>`<p>${line}</p>`).join('');
    if(by('outPL'))by('outPL').innerHTML=safe(pl).split('\n').map(line=>`<p>${line}</p>`).join('');
    window._note={cc,as,pl};
    const badge=by('clinicalDispositionBadge');if(badge)badge.textContent='Record locked';
    const message=by('clinicalDispositionMessage');if(message)message.textContent=`Completed ${stamp(record.completedAt||record.updatedAt)}. This read-only snapshot is preserved locally.`;
    const list=by('clinicalDispositionList');if(list)list.innerHTML='';
    const noteBadge=document.querySelector('#panel-administer .note-top .badge');if(noteBadge)noteBadge.textContent='Locked';
  }
  function restoreSnapshot(record){
    const snap=record&&record.snapshot||{};const state=snap.state||{};applying=true;mode='edit';applyRecordLock();
    call(window.softReset);
    window.__IPMG_INJECTION_DOCUMENTATION_METADATA__=clone(snap.documentation||{});
    const med=MEDS.find(item=>item.key===snap.medKey);if(med)call(window.selectMed,med);
    S.dose=state.dose||'';S.site=state.site||'';S.route=state.route||'';S.intervalKey=state.intervalKey||'';S.reason=state.reason||'scheduled';S.resp=state.resp||'well';S.attest=clone(state.attest||{});S.flags=clone(state.flags||{});S.guard=clone(state.guard||{});S.retCustom=!!state.retCustom;
    call(window.restoreInitiationProtocol,snap.initiation||{});
    Object.entries(snap.fields||{}).forEach(([id,value])=>{const el=by(id);if(el&&'value' in el){if(el.type==='checkbox')el.checked=!!value;else el.value=value==null?'':value;}});
    if(window.__IPMG_RC530__)window.__IPMG_RC530__.safetyNone=!!snap.safetyNone;
    call(window.restoreSmartVitalsState,snap.smartVitals||{});
    call(window.renderReasons);call(window.renderMeds);call(window.renderDoses);call(window.renderIntervals);call(window.renderMedSpec);call(window.renderInjSafetyChips);call(window.renderAtt);call(window.renderResp);call(window.renderSites);call(window.renderRoutes);call(window.recalcNext);call(window.render);
    Object.entries(snap.fields||{}).forEach(([id,value])=>{const el=by(id);if(el&&'value' in el){if(el.type==='checkbox')el.checked=!!value;else el.value=value==null?'':value;}});
    call(window.restoreClinicalDisposition,snap.disposition||{});
    applying=false;
  }
  function blockForPendingAddendum(){
    const input=by('injAddendumText');
    if(mode!=='readonly'||!input||!String(input.value||'').trim())return false;
    say('Save or clear the pending addendum before leaving this locked record.');
    requestAnimationFrame(()=>input.focus({preventScroll:true}));
    return true;
  }
  function openRecord(id){
    let record=records.find(item=>item.id===id);if(!record)return;
    if(blockForPendingAddendum())return false;
    if(mode==='edit'&&draftNeedsPersistence()&&!flushDraft(false)){
      saveFeedback='error';renderWorkspace();
      say('The current draft could not be saved, so the app kept it open instead of switching records.');
      return false;
    }
    record=records.find(item=>item.id===id);if(!record)return false;
    recordGeneration++;
    activeId=record.id;restoreSnapshot(record);
    mode=record.status==='completed'?'readonly':'edit';
    saveFeedback='idle';
    if(mode==='readonly')showLockedOutput(record);
    renderWorkspace();applyRecordLock();call(window.IPMGSmartWorkspace&&window.IPMGSmartWorkspace.refresh);
    say(mode==='readonly'?'Completed injection record opened read-only.':'Injection draft opened for editing.');
    return true;
  }
  function completeRecord(attestation=null,options={}){
    if(!canComplete()){say('Finish the final clinical disposition and required checks before locking this injection record.');renderWorkspace();return false;}
    clearTimeout(autoTimer);autoTimer=null;
    call(window.render);const record=upsert('completed',{attestation});
    if(!record){
      saveFeedback='error';renderWorkspace();
      say('The completed record could not be saved, so it remains editable and was not locked.');
      return false;
    }
    try{if(window.recordInjectionSite&&S&&S.site)window.recordInjectionSite(val('ptName'),S.site,val('ptDOB'),{medKey:S.med&&S.med.key||'',route:S.route||'',adminDate:val('adminDate'),recordId:record.id});}catch(error){}
    mode='readonly';saveFeedback='idle';showLockedOutput(record);renderWorkspace();applyRecordLock();call(window.IPMGSmartWorkspace&&window.IPMGSmartWorkspace.refresh);
    if(options.showCompletion!==false)showCompletion(record);
    say('Injection record completed and locked.');
    return true;
  }
  function resetToBlankInjection(){
    recordGeneration++;activeId='';mode='edit';saveFeedback='idle';applying=true;call(window.softReset);window.__IPMG_INJECTION_DOCUMENTATION_METADATA__={};call(window.render);applying=false;renderWorkspace();applyRecordLock();call(window.IPMGSmartWorkspace&&window.IPMGSmartWorkspace.refresh);
  }
  function discardInjectionDraft(){
    if(blockForPendingAddendum())return false;
    if(mode!=='edit'){
      say('Completed injection records are locked and cannot be discarded. Start a new injection instead.');
      return false;
    }
    const record=currentRecord();
    if(!draftNeedsPersistence()){
      say('There is no local injection draft to discard.');
      return false;
    }
    if(record&&record.status!=='draft'){
      say('Only editable local drafts can be discarded. Completed records remain locked.');
      return false;
    }
    clearTimeout(autoTimer);autoTimer=null;
    if(record){
      const previousRecords=records.slice(),previousActiveId=activeId;
      records=records.filter(item=>item.id!==record.id);activeId='';
      if(!persist()){
        records=previousRecords;activeId=previousActiveId;saveFeedback='error';renderWorkspace();
        say('The local injection draft could not be discarded because browser storage did not accept the change. It is still open.');
        return false;
      }
    }
    resetToBlankInjection();
    say(record?'Local injection draft discarded. A blank injection is ready.':'Entered injection details discarded. A blank injection is ready.');
    return true;
  }
  function newInjection(){
    if(blockForPendingAddendum())return false;
    if(mode==='edit'&&draftNeedsPersistence()&&!flushDraft(false)){
      saveFeedback='error';renderWorkspace();
      say('The current draft could not be saved, so the app kept it open instead of starting a new injection.');
      return false;
    }
    resetToBlankInjection();say('New injection started. Any previous work remains available as a draft.');
    return true;
  }
  function saveAddendum(){
    const record=currentRecord(),text=val('injAddendumText');if(!record||record.status!=='completed')return;
    if(!text){say('Enter the addendum before saving it.');return;}
    const staff=val('injAddendumAuthor')||String(call(window.getStoredStaff)||'').trim();
    if(!staff){say('Enter the current staff member adding this addendum.');by('injAddendumAuthor')?.focus();return;}
    const updated={...record,addenda:[...(Array.isArray(record.addenda)?record.addenda:[]),{id:`add_${Date.now()}`,createdAt:now(),author:staff,text}],updatedAt:now()};
    records=records.map(item=>item.id===record.id?updated:item);
    if(!persist()){
      records=records.map(item=>item.id===record.id?record:item);saveFeedback='error';refreshRecordsDrawer();renderWorkspace();
      const input=by('injAddendumText');if(input){input.value=text;requestAnimationFrame(()=>input.focus({preventScroll:true}));}
      say('The addendum could not be saved. Its text is still here; check browser storage access and try again.');
      return;
    }
    saveFeedback='idle';renderWorkspace();say('Dated addendum saved to the locked record.');
  }
  function showCompletion(record){
    const previous=by('injCompletionOverlay');if(previous&&typeof previous._ipmgClose==='function')previous._ipmgClose(false);else previous?.remove();
    const restoreTarget=by('injRecordWorkspace'),shell=document.querySelector('.cd2004-shell')||document.querySelector('.app-shell');
    const overlay=document.createElement('div');overlay.id='injCompletionOverlay';overlay.className='inj-completion-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','injCompletionTitle');overlay.setAttribute('aria-describedby','injCompletionDescription');
    const snapshot=record&&record.snapshot||{},state=snapshot.state||{},fields=snapshot.fields||{},initiation=snapshot.initiation||{},second=initiation.second||{};
    const patient=record&&record.patient&&record.patient.name||'Patient not entered';
    const medication=record&&record.summary||'Injection';
    const site=state.site||'Documented in record';
    const lockedAt=stamp(record&&record.completedAt||record&&record.updatedAt);
    const paired=!!(initiation.protocol&&second.given&&(second.dose||second.site));
    const primaryDetails=[state.dose,state.route||'IM',site,fields.injAdminTime?`at ${fields.injAdminTime}`:''].filter(Boolean).join(' · ');
    const primaryTrace=[fields.ndc?`NDC ${fields.ndc}`:'',fields.lot?`Lot ${fields.lot}`:'',fields.exp?`Exp ${fields.exp}`:''].filter(Boolean).join(' · ');
    const secondProduct=initiation.protocol==='maintena-1day'?'Abilify Maintena':initiation.protocol==='asimtufii-1day'?'Abilify Maintena':initiation.protocol==='aristada-initio-sameday'?(snapshot.medKey==='initio'?'First ARISTADA maintenance dose':'ARISTADA INITIO'):'Component 2';
    const secondDetails=[second.dose,'IM',second.site,fields.injSecondAdminTime?`at ${fields.injSecondAdminTime}`:''].filter(Boolean).join(' · ');
    const secondTrace=[second.ndc?`NDC ${second.ndc}`:'',second.lot?`Lot ${second.lot}`:'',second.exp?`Exp ${second.exp}`:''].filter(Boolean).join(' · ');
    const primaryReceipt=paired?`<div><span>Component 1</span><b>${safe(primaryDetails||'Documented in record')}</b></div><div><span>Component 1 trace</span><b>${safe(primaryTrace||'Documented in record')}</b></div>`:`<div><span>Actual site</span><b>${safe(site)}</b></div>`;
    const pairedReceipt=paired?`<div><span>Component 2 · ${safe(secondProduct)}</span><b>${safe(secondDetails||'Documented in record')}</b></div><div><span>Component 2 trace</span><b>${safe(secondTrace||'Documented in record')}</b></div>`:'';
    overlay.innerHTML=`<div class="inj-completion-card"><div class="inj-completion-ring" aria-hidden="true"></div><h2 id="injCompletionTitle">Injection record complete</h2><p id="injCompletionDescription">The encounter is locked as a read-only local snapshot. A dated addendum can be added later without changing the original.</p><div class="inj-completion-receipt ${paired?'paired':''}" aria-label="Completed injection receipt"><div><span>Patient</span><b>${safe(patient)}</b></div><div><span>Medication</span><b>${safe(medication)}</b></div>${primaryReceipt}${pairedReceipt}<div><span>Record status</span><b>Locked · ${safe(lockedAt)}</b></div></div><button type="button">View locked record</button></div>`;
    const button=overlay.querySelector('button');
    let closing=false;
    const onKey=event=>{
      if(event.key==='Escape'){event.preventDefault();close();return;}
      if(event.key==='Tab'){event.preventDefault();button.focus();}
    };
    const close=(restoreFocus=true)=>{
      if(closing)return;closing=true;overlay.classList.add('is-closing');
      const reduced=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches),duration=reduced?0:160;
      document.removeEventListener('keydown',onKey,true);
      setTimeout(()=>{
        overlay.remove();document.body.classList.remove('inj-completion-open');if(shell)shell.inert=false;
        if(restoreFocus&&restoreTarget&&document.contains(restoreTarget)){restoreTarget.tabIndex=-1;restoreTarget.focus({preventScroll:true});}
      },duration);
    };
    overlay._ipmgClose=close;
    overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    button.addEventListener('click',()=>close());
    if(shell)shell.inert=true;document.body.classList.add('inj-completion-open');
    document.body.appendChild(overlay);document.addEventListener('keydown',onKey,true);
    setTimeout(()=>button.focus(),20);
  }
  function logSignature(type){
    if(type==='injection')return ['injection',activeId||'new',val('ptName'),S.med&&S.med.key||'',S.dose||'',val('lot'),val('exp'),val('adminDate'),val('injAdminTime'),val('injSecondAdminTime')].join('|');
    if(type==='uds')return ['uds',val('udsPtName'),val('udsDOB'),val('udsDevice'),val('udsLot'),val('udsExp'),val('udsDateTime')].join('|');
    if(type==='sample')return ['sample',val('samplePtName'),val('sampleDOB'),val('sampleMedLabel'),val('sampleLot'),val('sampleExp'),typeof window.samplePackageTraceText==='function'?window.samplePackageTraceText():'',val('sampleDate')].join('|');
    return ['forms',val('formsPtName'),val('formsDOB'),val('formsDate'),val('formsDue'),String(FORMS&&FORMS.type||'')].join('|');
  }
  function bindLogDedup(){
    document.addEventListener('click',event=>{
      const button=event.target&&event.target.closest&&event.target.closest('#addLog,#addUdsLog,#sampleAddLog,#formsAddLog');if(!button)return;
      const type=button.id==='addLog'?'injection':button.id==='addUdsLog'?'uds':button.id==='sampleAddLog'?'sample':'forms';const signature=logSignature(type);const count=LOG.length;
      if(LOG.some(entry=>entry&&entry._rc538Signature===signature)){event.preventDefault();event.stopImmediatePropagation();say('That encounter is already in today’s activity log.');return;}
      setTimeout(()=>{if(LOG.length<=count)return;const entry=LOG[LOG.length-1];if(entry&&entry.type===type){entry._rc538Signature=signature;call(window.saveLog);}},0);
    },true);
  }
  window.ipmgInjectionRecordGeneration=()=>recordGeneration;
  window.ipmgRefreshInjectionRecordStatus=()=>{try{updateRecordStatus();}catch(e){}};
  function boot(){
    ensureRecordsDrawer();renderWorkspace();refreshRecordsDrawer();bindLogDedup();
    document.addEventListener('click',event=>{
      if(mode!=='readonly')return;
      const reviewOnly=event.target&&event.target.closest&&event.target.closest('#panel-administer .rc530-summary,#panel-administer .rc526-summary,#panel-administer .inj-detail-toggle,#panel-administer .needle-guide-toggle,#panel-administer .smsbtn,#panel-administer #adminGuideEdit');
      if(reviewOnly)return;
      const interactive=event.target&&event.target.closest&&event.target.closest('#panel-administer .form-col input,#panel-administer .form-col select,#panel-administer .form-col textarea,#panel-administer .form-col button,#panel-administer .form-col [role="button"],#panel-administer .form-col #medClear,#panel-administer .form-col [data-site]');
      if(!interactive)return;
      event.preventDefault();event.stopImmediatePropagation();say('This completed record is read-only. Use a dated addendum for any correction or follow-up.');
    },true);
    ['input','change'].forEach(type=>document.addEventListener(type,event=>{
      if(event.target&&event.target.closest&&event.target.closest('#panel-administer')&&!event.target.closest('#injRecordWorkspace'))setTimeout(scheduleDraft,0);
    },true));
    document.addEventListener('click',event=>{
      const target=event.target&&event.target.closest&&event.target.closest('#panel-administer .form-col button,#panel-administer .form-col [role="button"],#panel-administer .form-col #medClear');
      if(!target||target.closest('#injRecordWorkspace')||target.matches('.rc530-summary,.rc526-summary,.inj-detail-toggle,.needle-guide-toggle,.smsbtn,#adminGuideEdit')||target.closest('.rc530-summary,.rc526-summary,.inj-detail-toggle,.needle-guide-toggle,.smsbtn'))return;
      setTimeout(scheduleDraft,0);
    },true);
    const panel=by('panel-administer');if(panel){const observer=new MutationObserver(()=>{if(mode==='readonly')applyRecordLock();});observer.observe(panel,{childList:true,subtree:true});}
    window.addEventListener('beforeunload',event=>{if(mode==='readonly'&&val('injAddendumText')){event.preventDefault();event.returnValue='';}});
    window.addEventListener('pagehide',()=>flushDraft(false));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)flushDraft(false);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
/* </script> */

;

/* Legacy runtime block 20: <script id="rc539InitiationProtocolsScript"> */
/* ===================== RC5.39: order-verified LAI initiation paths ===================== */
(function(){
  'use strict';
  if(window.__IPMG_RC539_INITIATION__)return;
  window.__IPMG_RC539_INITIATION__=true;
  const by=id=>document.getElementById(id);
  const safe=value=>String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clone=value=>{try{return JSON.parse(JSON.stringify(value));}catch(e){return {};}};
  const call=(fn,...args)=>{try{return typeof fn==='function'?fn(...args):undefined;}catch(e){return undefined;}};
  const allIm=['R deltoid','L deltoid','R ventrogluteal','L ventrogluteal','R dorsogluteal','L dorsogluteal'];
  const relevantKeys=['aristada','initio','maintena','asimtufii','sustenna'];
  const value=id=>{const el=by(id);return el&&'value' in el?String(el.value||'').trim():'';};

  function blankState(){return {version:1,protocol:'',planVerified:false,oralStatus:'',providerNote:'',sustennaOrder:'',day1Date:'',second:{dose:'',site:'',ndc:'',lot:'',exp:'',given:false,orderVerified:false,note:''}};}
  let state=blankState();
  function appState(){try{return typeof S!=='undefined'?S:null;}catch(e){return null;}}
  function med(){const current=appState();return current&&current.med||null;}
  function medKey(){const current=med();return current&&current.key||'';}
  function isRelevant(){return relevantKeys.includes(medKey());}
  function displayDate(date){try{return typeof fmtDate==='function'?fmtDate(date):date||'';}catch(e){return date||'';}}
  function dateParts(iso){const p=String(iso||'').split('-').map(Number);return p.length===3&&p[0]&&p[1]&&p[2]?p:null;}
  function addCalendarDays(iso,days){const p=dateParts(iso);if(!p)return '';const d=new Date(Date.UTC(p[0],p[1]-1,p[2]+Number(days||0)));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;}
  function dateDifference(a,b){const ap=dateParts(a),bp=dateParts(b);if(!ap||!bp)return null;return Math.round((Date.UTC(bp[0],bp[1]-1,bp[2])-Date.UTC(ap[0],ap[1]-1,ap[2]))/86400000);}
  function day8Window(day1){if(!dateParts(day1))return null;const target=addCalendarDays(day1,7);return {target,early:addCalendarDays(target,-4),late:addCalendarDays(target,4),monthly:addCalendarDays(day1,35)};}
  function siteMuscleKey(site){const text=String(site||'').toLowerCase().trim();const side=/^r\b/.test(text)?'right':/^l\b/.test(text)?'left':'';if(text.includes('deltoid'))return `${side}-deltoid`;if(text.includes('gluteal'))return `${side}-gluteal`;return text;}
  function protocolOptions(key=medKey()){
    const common=[];
    if(key==='maintena')return [
      {id:'maintena-1day',title:'1-day initiation',sub:'Two separate IM injections today plus a single oral aripiprazole dose.'},
      {id:'maintena-14day',title:'14-day oral plan',sub:'One injection today with the ordered 14-day oral continuation.'},
      {id:'maintena-provider',title:'Restart / provider plan',sub:'Use for a provider-directed or nonstandard initiation/restart plan.'}
    ];
    if(key==='asimtufii')return [
      {id:'asimtufii-1day',title:'1-day initiation',sub:'Asimtufii plus separate Maintena IM component and one oral dose.'},
      {id:'asimtufii-14day',title:'14-day oral plan',sub:'One Asimtufii injection with the ordered 14-day oral continuation.'},
      {id:'asimtufii-provider',title:'Restart / transition plan',sub:'Use for provider-directed restart, transition, or adjusted initiation.'}
    ];
    if(key==='aristada'||key==='initio')return [
      {id:'aristada-initio-sameday',title:'INITIO + first ARISTADA today',sub:'Two same-encounter IM components plus one oral aripiprazole dose.'},
      {id:'aristada-21day',title:'21-day oral plan',sub:'First ARISTADA injection with the ordered 21-day oral continuation.'},
      {id:'aristada-provider',title:'Staged / re-initiation plan',sub:'Use if components are on different dates or the provider has a specific restart plan.'}
    ];
    if(key==='sustenna')return [
      {id:'sustenna-day1',title:'Day 1 initiation',sub:'Sets a staff-facing Day 8 scheduling target from today’s recorded date.'},
      {id:'sustenna-day8',title:'Day 8 initiation',sub:'Calculates the Day 8 target and the permitted ±4-day timing window.'},
      {id:'sustenna-provider',title:'Re-initiation / provider plan',sub:'For missed-dose or nonstandard pathways; no regimen is calculated.'}
    ];
    return common;
  }
  function config(){
    const key=medKey(),id=state.protocol;
    const dual={kind:'dual',oralLabel:'Required oral aripiprazole dose',secondarySites:allIm.slice()};
    if(id==='maintena-1day')return {...dual,title:'Abilify Maintena 1-day initiation',summary:'Label reference: two separate ABILIFY MAINTENA IM injections on Day 1 plus one oral aripiprazole 20 mg dose. Do not use the same muscle for both injections.',primaryLabel:'Injection 1 — Abilify Maintena (main medication fields)',secondaryProduct:'Injection 2 — Abilify Maintena',secondaryGuide:'Use the matching ordered pair: 400 mg + 400 mg, or the adjusted 300 mg + 300 mg pathway.',oralLabel:'Single oral aripiprazole 20 mg dose'};
    if(id==='asimtufii-1day')return {...dual,title:'Abilify Asimtufii 1-day initiation',summary:'Label reference: one gluteal ASIMTUFII injection, a separate Maintena injection, and one oral aripiprazole 20 mg dose. Do not use the same muscle.',primaryLabel:'Injection 1 — Abilify Asimtufii (main medication fields)',secondaryProduct:'Injection 2 — Abilify Maintena',secondaryGuide:'Use the ordered pair: 960 mg + Maintena 400 mg, or adjusted 720 mg + Maintena 300 mg.',oralLabel:'Single oral aripiprazole 20 mg dose'};
    if(id==='aristada-initio-sameday'){
      const initioFirst=key==='initio';
      return {...dual,title:'Aristada INITIO + first ARISTADA, same encounter',summary:'Label reference: ARISTADA INITIO 675 mg, one oral aripiprazole 30 mg dose, and the first ARISTADA injection. When concomitant, do not use the same deltoid or gluteal muscle.',primaryLabel:initioFirst?'Injection 1 — ARISTADA INITIO (main medication fields)':'Injection 1 — first ARISTADA (main medication fields)',secondaryProduct:initioFirst?'Injection 2 — first ARISTADA maintenance dose':'Injection 2 — ARISTADA INITIO',secondaryGuide:initioFirst?'Enter the exact ordered ARISTADA maintenance dose.':'Label reference is INITIO 675 mg; enter the actual product/dose used.',oralLabel:'Single oral aripiprazole 30 mg dose'};
    }
    if(id==='maintena-14day')return {kind:'oral',title:'Abilify Maintena 14-day oral initiation',summary:'One Abilify Maintena injection with the ordered 14 consecutive days of oral aripiprazole or the current oral antipsychotic.',oralLabel:'14-day oral continuation documented'};
    if(id==='asimtufii-14day')return {kind:'oral',title:'Abilify Asimtufii 14-day oral initiation',summary:'One gluteal Asimtufii injection with the ordered 14 consecutive days of oral aripiprazole or current oral antipsychotic.',oralLabel:'14-day oral continuation documented'};
    if(id==='aristada-21day')return {kind:'oral',title:'Aristada 21-day oral initiation',summary:'First ARISTADA injection with the ordered 21 consecutive days of oral aripiprazole.',oralLabel:'21-day oral continuation documented'};
    if(id==='maintena-provider'||id==='asimtufii-provider'||id==='aristada-provider'||id==='sustenna-provider')return {kind:'provider',title:(protocolOptions().find(item=>item.id===id)||{}).title||'Provider-directed plan',summary:'This is a non-calculating path. Record the active provider direction and verify it against the current PI and clinic policy.'};
    if(id==='sustenna-day1')return {kind:'sustenna-day1',title:'Invega Sustenna Day 1 initiation',summary:'Day 1 uses the documented administration date to set a staff-facing Day 8 target. Both initiation injections are deltoid per the current label.'};
    if(id==='sustenna-day8')return {kind:'sustenna-day8',title:'Invega Sustenna Day 8 initiation',summary:'Uses the recorded Day 1 date to calculate the Day 8 target and ±4-day timing window. It does not calculate doses, renal assessment, or missed-dose re-initiation.'};
    return null;
  }
  function protocolUsesOral(c=config()){return !!c&&(c.kind==='dual'||c.kind==='oral');}
  function syncMedicationFlags(){
    const current=med(),c=config(),app=appState();if(!current||!app)return;
    if(['aristada','maintena'].includes(current.key)&&state.protocol){app.flags.oralOverlap=protocolUsesOral(c)?!!state.oralStatus:false;}
    if(current.key==='sustenna'&&state.protocol){app.flags.invegaInit=!!state.planVerified;}
  }
  function setProtocolReason(){
    const c=config(),app=appState();if(!c||!app)return;
    app.reason=c.kind==='provider'?'reinit':'initiation';
    if(['maintena','sustenna'].includes(medKey()))app.intervalKey='q4wk';
    if(medKey()==='asimtufii')app.intervalKey='q8wk';
    if(medKey()==='initio')app.intervalKey='once';
  }
  function applyInitiationSchedule(){
    const c=config(),admin=value('adminDate'),next=by('nextDate'),app=appState();if(!c||!next||!app)return;
    if(c.kind==='sustenna-day1'&&admin){next.value=addCalendarDays(admin,7);app.retCustom=true;call(window.renderReturn);}
    if(c.kind==='sustenna-day8'&&state.day1Date){next.value=addCalendarDays(state.day1Date,35);app.retCustom=true;call(window.renderReturn);}
  }
  function updateReturnGuidance(){
    const c=config(),admin=value('adminDate'),win=by('retWin');if(!c||!win)return;
    if(c.kind==='sustenna-day1'&&admin){const target=addCalendarDays(admin,7);win.innerHTML=`Initiation schedule: <b>Day 8 target ${safe(displayDate(target))}</b>. Confirm the active order/current PI; this does not determine the Day 8 dose.`;}
    if(c.kind==='sustenna-day8'){
      const timing=day8Window(state.day1Date);if(timing)win.innerHTML=`Initiation schedule: next monthly target <b>${safe(displayDate(timing.monthly))}</b> (5 weeks after documented Day 1). Confirm the active order/current PI.`;
    }
  }
  function pairedPrimaryAllowed(){
    const key=medKey(),protocol=state.protocol;
    if(protocol==='maintena-1day')return key==='maintena';
    if(protocol==='asimtufii-1day')return key==='asimtufii';
    if(protocol==='aristada-initio-sameday')return key==='aristada'||key==='initio';
    return true;
  }
  function pairedSecondMedication(){
    const key=medKey(),protocol=state.protocol;
    const secondKey=protocol==='maintena-1day'?'maintena':protocol==='asimtufii-1day'?'maintena':protocol==='aristada-initio-sameday'?(key==='initio'?'aristada':key==='aristada'?'initio':''):'';
    return secondKey&&Array.isArray(MEDS)?MEDS.find(item=>item.key===secondKey)||null:null;
  }
  function review(){
    const stops=[],warnings=[],current=med(),c=config();
    if(!current||!state.protocol||!c)return {stops,warnings};
    if(!state.planVerified)stops.push('Confirm the active provider initiation/re-initiation order and current product information in the initiation workspace.');
    if(c.kind==='dual'){
      const second=state.second||{};
      const secondMedication=pairedSecondMedication();
      if(!pairedPrimaryAllowed())stops.push('The selected paired-injection protocol does not match the primary medication.');
      if(!state.oralStatus)stops.push(`Document the ${c.oralLabel.toLowerCase()} as administered today or verified in the active record.`);
      if(!second.given)stops.push('Confirm that the second injection component was actually administered today, or use the staged/provider-directed pathway.');
      if(!second.orderVerified)stops.push('Confirm the second injection product and exact dose against the active order.');
      if(!String(second.dose||'').trim())stops.push('Document the exact ordered dose for injection component 2.');
      if(!String(second.site||'').trim())stops.push('Select the actual site for injection component 2.');
      if(!String(second.ndc||'').trim())stops.push('Document the NDC for injection component 2.');
      if(!String(second.lot||'').trim())stops.push('Document the lot for injection component 2.');
      if(!String(second.exp||'').trim())stops.push('Document the expiration for injection component 2.');
      else if(typeof monthExpired==='function'&&monthExpired(second.exp,value('adminDate')))stops.push('Injection component 2 expiration appears past; obtain in-date product before documenting administration.');
      if(secondMedication&&String(second.dose||'').trim()&&Array.isArray(secondMedication.doses)&&!secondMedication.doses.includes(String(second.dose).trim()))stops.push(`Injection component 2 dose is outside the cataloged ${secondMedication.label} dose options; verify the active order and selected protocol.`);
      const primaryDose=String((appState()||{}).dose||'').trim(),secondDose=String(second.dose||'').trim();
      if(state.protocol==='maintena-1day'&&primaryDose&&secondDose&&primaryDose!==secondDose)stops.push('The Abilify Maintena 1-day pathway requires matching paired doses: 400 mg + 400 mg, or the ordered adjusted 300 mg + 300 mg pathway. Verify the active order and current product information.');
      if(state.protocol==='asimtufii-1day'&&primaryDose&&secondDose&&!((primaryDose==='960 mg'&&secondDose==='400 mg')||(primaryDose==='720 mg'&&secondDose==='300 mg')))stops.push('The Abilify Asimtufii 1-day pathway requires Asimtufii 960 mg + Abilify Maintena 400 mg, or the ordered adjusted 720 mg + 300 mg pathway. Verify the active order and current product information.');
      const secondRule=secondMedication&&typeof medAdminRule==='function'?medAdminRule(secondMedication,String(second.dose||'').trim()):null;
      if(secondRule&&String(second.site||'').trim()&&Array.isArray(secondRule.sites)&&!secondRule.sites.includes(String(second.site).trim()))stops.push(`Injection component 2 site is outside the cataloged ${secondMedication.label} guidance for the documented dose.`);
      const primaryMuscle=siteMuscleKey((appState()||{}).site),secondaryMuscle=siteMuscleKey(second.site);
      if(primaryMuscle&&secondaryMuscle&&primaryMuscle===secondaryMuscle)stops.push('The paired injection components are assigned to the same muscle group. Select a separate muscle/site for injection component 2.');
    }
    if(c.kind==='oral'&&!state.oralStatus)stops.push(`Document the ${c.oralLabel.toLowerCase()} as administered today or verified in the active record.`);
    if(c.kind==='provider'&&!String(state.providerNote||'').trim())stops.push('Document the provider-directed initiation/re-initiation instruction or timing plan.');
    if(c.kind==='sustenna-day1'||c.kind==='sustenna-day8'){
      if(!state.sustennaOrder)stops.push('Select the ordered Invega Sustenna initiation category for this encounter.');
      if(!/deltoid/i.test(String((appState()||{}).site||'')))stops.push('Invega Sustenna Day 1 and Day 8 initiation injections require a documented deltoid site; verify the active order/current PI.');
    }
    if(c.kind==='sustenna-day8'){
      if(!state.day1Date)stops.push('Enter the documented Invega Sustenna Day 1 date to calculate the Day 8 window.');
      const admin=value('adminDate'),timing=day8Window(state.day1Date);
      if(state.day1Date&&admin){
        const fromDay1=dateDifference(state.day1Date,admin),early=dateDifference(state.day1Date,timing&&timing.early),late=dateDifference(state.day1Date,timing&&timing.late);
        if(fromDay1!==null&&fromDay1<0)stops.push('The documented administration date is before Day 1; verify the dates.');
        else if(fromDay1!==null&&early!==null&&late!==null&&(fromDay1<early||fromDay1>late))stops.push('This Day 8 administration date falls outside the calculated ±4-day window. Use the current missed-dose/re-initiation PI and provider/pharmacist direction instead of this Day 8 path.');
      }
    }
    if(c.kind==='sustenna-provider'&&!String(state.providerNote||'').trim())stops.push('Document the provider-directed Invega Sustenna re-initiation or nonstandard plan.');
    return {stops:Array.from(new Set(stops)),warnings:Array.from(new Set(warnings))};
  }
  function referenceText(){
    const order=state.sustennaOrder;
    if(order==='standard')return 'Order cross-check: standard label initiation is 234 mg on Day 1 and 156 mg on Day 8, both deltoid.';
    if(order==='mild')return 'Order cross-check: mild renal impairment label initiation is 156 mg on Day 1 and 117 mg on Day 8, both deltoid.';
    if(order==='other')return 'Provider-directed order selected. This tool does not calculate dose, renal adjustment, or re-initiation dosing.';
    return 'Select the order category for an order cross-check. This tool never determines dose or renal adjustment.';
  }
  function optionHtml(option){return `<button type="button" class="initiation-path ${state.protocol===option.id?'on':''}" data-init-protocol="${safe(option.id)}" aria-pressed="${state.protocol===option.id?'true':'false'}"><b>${safe(option.title)}</b><span>${safe(option.sub)}</span></button>`;}
  function oralHtml(c){return `<div class="initiation-oral"><div class="initiation-oral-top"><b>${safe(c.oralLabel)}</b><span>Required for the selected pathway</span></div><div class="initiation-oral-options"><button type="button" class="initiation-mini-choice ${state.oralStatus==='administered'?'on':''}" data-init-oral="administered" aria-pressed="${state.oralStatus==='administered'?'true':'false'}">Administered today</button><button type="button" class="initiation-mini-choice ${state.oralStatus==='verified'?'on':''}" data-init-oral="verified" aria-pressed="${state.oralStatus==='verified'?'true':'false'}">Verified in active record / eMAR</button></div></div>`;}
  function dualHtml(c){const second=state.second||{};return `<div class="initiation-flow"><div class="initiation-component primary"><div class="initiation-component-top"><b>${safe(c.primaryLabel)}</b><span>Use the main dose, actual site, NDC, lot, and expiration fields.</span></div><div class="initiation-component-copy">Do not combine the paired injections into one traceability record.</div></div><div class="initiation-component"><div class="initiation-component-top"><b>${safe(c.secondaryProduct)}</b><span>${safe(c.secondaryGuide)}</span></div><div class="initiation-fields"><div class="field"><label for="initSecondDose">Exact dose <span class="req">*</span></label><input id="initSecondDose" value="${safe(second.dose)}" placeholder="Per active order" autocomplete="off"></div><div class="field"><label for="initSecondSite">Actual site <span class="req">*</span></label><select id="initSecondSite"><option value="">Select site</option>${c.secondarySites.map(site=>`<option value="${safe(site)}" ${second.site===site?'selected':''}>${safe((typeof adminSiteDisplay==='function'?adminSiteDisplay(site):site))}</option>`).join('')}</select></div><div class="field"><label for="initSecondNdc">NDC <span class="req">*</span></label><input id="initSecondNdc" class="mono" value="${safe(second.ndc)}" placeholder="Read vial / kit" autocomplete="off"></div><div class="field"><label for="initSecondLot">Lot <span class="req">*</span></label><input id="initSecondLot" class="mono" value="${safe(second.lot)}" placeholder="Read vial / kit" autocomplete="off"></div><div class="field"><label for="initSecondExp">Exp <span class="req">*</span></label><input id="initSecondExp" class="mono" type="month" value="${safe(second.exp)}"></div></div><div class="initiation-checks"><div class="initiation-check"><input id="initSecondOrderVerified" type="checkbox" ${second.orderVerified?'checked':''}><label for="initSecondOrderVerified">Exact product and dose verified against the active order</label></div><div class="initiation-check"><input id="initSecondGiven" type="checkbox" ${second.given?'checked':''}><label for="initSecondGiven">Injection component 2 was actually administered today</label></div></div><div class="initiation-provider-note"><label for="initSecondNote">Component 2 note <span class="auto-tag">optional</span></label><input id="initSecondNote" value="${safe(second.note)}" placeholder="Preparation, delivery, or clarification"></div></div>${oralHtml(c)}</div>`;}
  function sustennaHtml(c){const timing=day8Window(state.day1Date),admin=value('adminDate');let dayPart='';if(c.kind==='sustenna-day1'){const target=admin?addCalendarDays(admin,7):'';dayPart=`<div class="initiation-date-result ${target?'':'blocked'}"><div class="initiation-date-label">Day 8 scheduling target</div><strong>${target?safe(displayDate(target)):'Enter the administered date'}</strong><span>${target?'Calculated from the Day 1 administration date. The calculator is scheduling support only.':'The Day 1 administration date is required before a target can be shown.'}</span></div>`;}else if(c.kind==='sustenna-day8'){const status=timing&&admin?dateDifference(state.day1Date,admin):null;const inWindow=timing&&admin&&admin>=timing.early&&admin<=timing.late;dayPart=`<div class="initiation-day-grid"><div class="field"><label for="initDay1Date">Documented Day 1 date <span class="req">*</span></label><input id="initDay1Date" type="date" value="${safe(state.day1Date)}"></div><div class="initiation-date-result ${timing&&admin&&!inWindow?'blocked':''}"><div class="initiation-date-label">Day 8 calculator</div><strong>${timing?`Target ${safe(displayDate(timing.target))}`:'Enter Day 1 date'}</strong><span>${timing?`Window: ${safe(displayDate(timing.early))} to ${safe(displayDate(timing.late))} (target ±4 days). ${admin?(inWindow?`This administration is ${status} day(s) after Day 1 and is within the displayed window.`:`This administration is outside the displayed window; use the provider/current missed-dose plan.`):'Enter the administration date to check this encounter.'}`:''}</span></div></div>`;}
    return `<div class="initiation-sustenna"><div class="initiation-reference"><b>Ordered initiation category <span class="req">*</span></b><div class="initiation-order-options"><button type="button" class="initiation-mini-choice ${state.sustennaOrder==='standard'?'on':''}" data-init-sustenna-order="standard" aria-pressed="${state.sustennaOrder==='standard'?'true':'false'}">Standard order</button><button type="button" class="initiation-mini-choice ${state.sustennaOrder==='mild'?'on':''}" data-init-sustenna-order="mild" aria-pressed="${state.sustennaOrder==='mild'?'true':'false'}">Mild renal order</button><button type="button" class="initiation-mini-choice ${state.sustennaOrder==='other'?'on':''}" data-init-sustenna-order="other" aria-pressed="${state.sustennaOrder==='other'?'true':'false'}">Other provider order</button></div><p>${safe(referenceText())}</p><p class="warn">This is an order cross-check only. It does not calculate dose, renal function, missed-dose, or re-initiation regimens.</p></div>${dayPart}</div>`;}
  function providerHtml(){return `<div class="initiation-provider-note"><label for="initProviderNote">Provider-directed initiation / re-initiation instruction <span class="req">*</span></label><textarea id="initProviderNote" placeholder="Concise active order, timing plan, and any provider/pharmacist direction">${safe(state.providerNote)}</textarea></div>`;}
  function readinessHtml(){if(!state.protocol)return '';const r=review();if(!r.stops.length)return '<div class="initiation-ready">Protocol fields complete. Finish the general encounter and safety review before documenting administration.</div>';return `<div class="initiation-ready blocked">${safe(`${r.stops.length} protocol item${r.stops.length===1?'':'s'} still need documentation.`)}</div>`;}
  function ensureCard(){let card=by('initiationProtocolCard');if(card)return card;const anchor=document.querySelector('#panel-administer .card-medication');if(!anchor)return null;card=document.createElement('section');card.id='initiationProtocolCard';card.className='card inj-card initiation-card';card.setAttribute('aria-label','Initiation protocol workspace');anchor.insertAdjacentElement('afterend',card);return card;}
  function renderCard(){const card=ensureCard(),panel=by('panel-administer');if(!card)return;if(!isRelevant()){card.hidden=true;if(panel)panel.classList.remove('initiation-day8');return;}const c=config(),options=protocolOptions();card.hidden=false;if(panel)panel.classList.toggle('initiation-day8',!!c&&c.kind==='sustenna-day8');const selected=c?`<div class="initiation-work"><div class="initiation-guidance"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><div><strong>${safe(c.title)}.</strong> ${safe(c.summary)}</div></div><div class="initiation-cert"><input id="initPlanVerified" type="checkbox" ${state.planVerified?'checked':''}><label for="initPlanVerified">Active provider initiation/re-initiation order and current product information verified for this encounter <span class="req">*</span></label></div>${c.kind==='dual'?dualHtml(c):c.kind==='oral'?oralHtml(c):c.kind==='provider'?providerHtml(c):sustennaHtml(c)}${readinessHtml()}</div>`:'';card.innerHTML=`<div class="initiation-head"><div><div class="initiation-kicker">Staff-only protocol support</div><h2>Initiation &amp; paired-injection path</h2><div class="initiation-sub">Select a path only when today is an initiation, restart, or loading encounter. Leaving it unselected preserves the fast routine-maintenance workflow.</div></div><span class="initiation-source">Order verified</span></div><div class="initiation-paths">${options.map(optionHtml).join('')}</div>${selected||'<div class="initiation-empty"><b>Routine maintenance?</b> No initiation path is selected. Choose a path above only if this encounter needs a start, restart, or Day 8 initiation record.</div>'}${state.protocol?'<div style="margin-top:8px"><button type="button" class="initiation-clear" data-init-clear>Clear initiation selection</button></div>':''}`;bindCard(card);updateReturnGuidance();}
  function refreshUi(){syncMedicationFlags();call(window.renderReasons);call(window.renderIntervals);call(window.renderMedSpec);call(window.renderReturn);call(window.render);}
  function clearSecondAdministrationTime(){const input=by('injSecondAdminTime');if(input)input.value='';}
  function setProtocol(id){if(!protocolOptions().some(option=>option.id===id)||id===state.protocol)return;clearSecondAdministrationTime();state=blankState();state.protocol=id;setProtocolReason();syncMedicationFlags();applyInitiationSchedule();refreshUi();}
  function resetState(){clearSecondAdministrationTime();state=blankState();syncMedicationFlags();}
  function updateFromControl(control){if(!control)return;const id=control.id,second=state.second||{};if(id==='initPlanVerified')state.planVerified=!!control.checked;if(id==='initSecondDose')second.dose=control.value;if(id==='initSecondSite')second.site=control.value;if(id==='initSecondNdc')second.ndc=control.value;if(id==='initSecondLot')second.lot=control.value;if(id==='initSecondExp')second.exp=control.value;if(id==='initSecondOrderVerified')second.orderVerified=!!control.checked;if(id==='initSecondGiven')second.given=!!control.checked;if(id==='initSecondNote')second.note=control.value;if(id==='initProviderNote')state.providerNote=control.value;if(id==='initDay1Date')state.day1Date=control.value;state.second=second;syncMedicationFlags();}
  let protocolFocusTimer=0;
  function restoreProtocolFocus(selector){
    if(!selector)return;
    const apply=()=>{const target=document.querySelector(selector);if(target)target.focus({preventScroll:true});};
    requestAnimationFrame(apply);
    clearTimeout(protocolFocusTimer);protocolFocusTimer=setTimeout(apply,140);
  }
  function bindCard(card){
    card.addEventListener('click',event=>{
      const path=event.target&&event.target.closest&&event.target.closest('[data-init-protocol]');
      if(path){event.preventDefault();const id=path.dataset.initProtocol;setProtocol(id);restoreProtocolFocus(`[data-init-protocol="${CSS.escape(id)}"]`);return;}
      const oral=event.target&&event.target.closest&&event.target.closest('[data-init-oral]');
      if(oral){event.preventDefault();const id=oral.dataset.initOral;state.oralStatus=id;refreshUi();restoreProtocolFocus(`[data-init-oral="${CSS.escape(id)}"]`);return;}
      const order=event.target&&event.target.closest&&event.target.closest('[data-init-sustenna-order]');
      if(order){event.preventDefault();const id=order.dataset.initSustennaOrder;state.sustennaOrder=id;refreshUi();restoreProtocolFocus(`[data-init-sustenna-order="${CSS.escape(id)}"]`);return;}
      const clear=event.target&&event.target.closest&&event.target.closest('[data-init-clear]');
      if(clear){event.preventDefault();resetState();refreshUi();restoreProtocolFocus('[data-init-protocol]');}
    });
    card.addEventListener('input',event=>{updateFromControl(event.target);});
    card.addEventListener('change',event=>{
      const focusId=event.target&&event.target.id||'';
      updateFromControl(event.target);
      if(focusId==='initDay1Date')applyInitiationSchedule();
      renderCard();call(window.render);
      if(focusId)restoreProtocolFocus(`#${CSS.escape(focusId)}`);
    });
  }
  function narrative(){const c=config(),current=med(),app=appState()||{};if(!c||!current)return {assessment:[],plan:[]};const assessment=[],plan=[];if(c.kind==='dual'){const second=state.second||{};assessment.push(`${c.title}: active provider plan verified; ${c.oralLabel.toLowerCase()} ${state.oralStatus==='administered'?'documented as administered today':'verified in the active record'}; paired injection components documented separately.`);plan.push(`Initiation components: #1 ${current.name||current.label} ${String(app.dose||'').trim()} IM ${String(app.site||'').trim()}; #2 ${c.secondaryProduct.replace(/^Injection 2 —\s*/,'')} ${second.dose} IM ${second.site}.`);plan.push(`Component 2 traceability: NDC ${second.ndc}; Lot ${second.lot}; Exp ${second.exp}.`);if(second.note)plan.push(`Component 2 note: ${second.note}`);}else if(c.kind==='oral'){assessment.push(`${c.title}: active provider plan verified; ${c.oralLabel.toLowerCase()} ${state.oralStatus==='administered'?'documented as administered today':'verified in the active record'}.`);}else if(c.kind==='provider'){assessment.push(`${c.title}: active provider plan verified.`);plan.push(`Provider-directed initiation/re-initiation plan: ${state.providerNote}`);}else if(c.kind==='sustenna-day1'){const target=value('adminDate')?addCalendarDays(value('adminDate'),7):'';assessment.push(`Invega Sustenna Day 1 initiation: active provider order/current PI verified; ordered category ${state.sustennaOrder||'not documented'}; deltoid initiation site documented.`);if(target)plan.push(`Day 8 scheduling target: ${displayDate(target)}. Staff-facing timing support only; dose, renal status, and re-initiation decisions remain order/PI based.`);}else if(c.kind==='sustenna-day8'){const timing=day8Window(state.day1Date);assessment.push(`Invega Sustenna Day 8 initiation: active provider order/current PI verified; documented Day 1 ${displayDate(state.day1Date)}; deltoid initiation site documented.`);if(timing)plan.push(`Day 8 timing: target ${displayDate(timing.target)}; displayed window ${displayDate(timing.early)} to ${displayDate(timing.late)}. This tool did not calculate dose, renal adjustment, or re-initiation.`);}return {assessment,plan};}
  function appendNarrativeToNote(){const badge=by('clinicalDispositionBadge');if(!badge||!/Administration documented/i.test(badge.textContent||''))return;const extra=narrative();if(!extra.assessment.length&&!extra.plan.length)return;const note=window._note||{cc:'',as:'',pl:''};note.as=[note.as,...extra.assessment].filter(Boolean).join('\n');note.pl=[note.pl,...extra.plan].filter(Boolean).join('\n');window._note=note;const assessment=by('outAS'),plan=by('outPL');if(assessment)extra.assessment.forEach(line=>{const p=document.createElement('p');p.className='initiation-note-line';p.textContent=line;assessment.appendChild(p);});if(plan)extra.plan.forEach(line=>{const p=document.createElement('p');p.className='initiation-note-line';p.textContent=line;plan.appendChild(p);});}
  function logData(){const c=config(),current=med();if(!c||!current)return {details:[],trace:[],follow:''};const details=[`Initiation: ${c.title}`],trace=[];let follow='';if(c.kind==='dual'){const second=state.second||{};details.push(`#2 ${c.secondaryProduct.replace(/^Injection 2 —\s*/,'')} ${second.dose} IM ${second.site}`);trace.push(`#2 NDC ${second.ndc}`,`#2 Lot ${second.lot}`,`#2 Exp ${second.exp}`);}
    if(c.kind==='sustenna-day1'&&value('adminDate'))follow=`Day 8 target ${displayDate(addCalendarDays(value('adminDate'),7))}`;
    if(c.kind==='sustenna-day8'){const timing=day8Window(state.day1Date);if(timing)follow=`Monthly target ${displayDate(timing.monthly)} (5 wk after Day 1)`;}
    return {details:details.filter(Boolean),trace:trace.filter(Boolean),follow};}
  function worksheetHtml(){
    const c=config(),current=med(),app=appState()||{};if(!c||!current)return '';
    const row=(label,content)=>`<div class="iw-protocol-row"><b>${safe(label)}:</b> ${safe(content||'Not documented')}</div>`;
    const primary=[current.name||current.label||'Injection 1',String(app.dose||'').trim(),String(app.route||'IM').trim(),String(app.site||'').trim()].filter(Boolean).join(' · ');
    const primaryTrace=[value('ndc')?`NDC ${value('ndc')}`:'',value('lot')?`Lot ${value('lot')}`:'',value('exp')?`Exp ${value('exp')}`:''].filter(Boolean).join(' · ');
    const oral=state.oralStatus==='administered'?'Administered today':state.oralStatus==='verified'?'Verified in active record / eMAR':'Not documented';
    const category={standard:'Standard order',mild:'Mild renal order',other:'Other provider order'}[state.sustennaOrder]||'Not documented';
    const rows=[row('Initiation path',c.title),row('Active provider order / current PI',state.planVerified?'Verified':'Not documented')];
    if(c.kind==='dual'){
      const second=state.second||{};
      rows.push(row('Injection 1',primary),row('Injection 1 traceability',primaryTrace),row('Injection 2',[c.secondaryProduct.replace(/^Injection 2 [^A-Za-z0-9]*\s*/,''),second.dose,'IM',second.site].filter(Boolean).join(' · ')),row('Injection 2 traceability',[second.ndc?`NDC ${second.ndc}`:'',second.lot?`Lot ${second.lot}`:'',second.exp?`Exp ${second.exp}`:''].filter(Boolean).join(' · ')),row(c.oralLabel,oral));
    }else if(c.kind==='oral')rows.push(row('Injection',primary),row(c.oralLabel,oral));
    else if(c.kind==='provider')rows.push(row('Provider-directed instruction',state.providerNote));
    else if(c.kind==='sustenna-day1'){
      const target=value('adminDate')?addCalendarDays(value('adminDate'),7):'';
      rows.push(row('Ordered initiation category',category),row('Injection',primary),row('Day 8 scheduling target',target?displayDate(target):''));
    }else if(c.kind==='sustenna-day8'){
      const timing=day8Window(state.day1Date);
      rows.push(row('Ordered initiation category',category),row('Injection',primary),row('Documented Day 1',state.day1Date?displayDate(state.day1Date):''),row('Day 8 target / window',timing?`${displayDate(timing.target)} · ${displayDate(timing.early)} to ${displayDate(timing.late)}`:''),row('Monthly target',timing?`${displayDate(timing.monthly)} (5 weeks after Day 1)`:''));
    }
    return `<section class="iw-protocol-summary"><div class="iw-protocol-title">Initiation protocol snapshot</div>${rows.join('')}</section>`;
  }
  function snapshot(){return clone(state);}
  function restore(data){const next=blankState(),source=data&&typeof data==='object'?data:{};next.protocol=String(source.protocol||'');next.planVerified=!!source.planVerified;next.oralStatus=String(source.oralStatus||'');next.providerNote=String(source.providerNote||'');next.sustennaOrder=String(source.sustennaOrder||'');next.day1Date=String(source.day1Date||'');const second=source.second&&typeof source.second==='object'?source.second:{};next.second={...next.second,dose:String(second.dose||''),site:String(second.site||''),ndc:String(second.ndc||''),lot:String(second.lot||''),exp:String(second.exp||''),given:!!second.given,orderVerified:!!second.orderVerified,note:String(second.note||'')};state=protocolOptions().some(option=>option.id===next.protocol)?next:blankState();syncMedicationFlags();renderCard();}
  function wrapFunctions(){const previousSelect=window.selectMed;if(typeof previousSelect==='function'&&!previousSelect.__rc539InitiationWrap){const wrapped=function(){resetState();const result=previousSelect.apply(this,arguments);renderCard();return result;};wrapped.__rc539InitiationWrap=true;window.selectMed=wrapped;try{selectMed=wrapped;}catch(e){}}const previousReset=window.softReset;if(typeof previousReset==='function'&&!previousReset.__rc539InitiationWrap){const wrappedReset=function(){resetState();const result=previousReset.apply(this,arguments);renderCard();return result;};wrappedReset.__rc539InitiationWrap=true;window.softReset=wrappedReset;try{softReset=wrappedReset;}catch(e){}}const previousRender=window.render;if(typeof previousRender==='function'&&!previousRender.__rc539InitiationWrap){const wrappedRender=function(){syncMedicationFlags();const result=previousRender.apply(this,arguments);renderCard();appendNarrativeToNote();return result;};wrappedRender.__rc539InitiationWrap=true;window.render=wrappedRender;try{render=wrappedRender;}catch(e){}}}
  window.ipmgInitiationProtocolReview=review;
  window.ipmgInitiationProtocolFingerprint=()=>state.protocol?JSON.stringify({med:medKey(),state:snapshot()}):'';
  window.ipmgInitiationProtocolSnapshot=snapshot;
  window.restoreInitiationProtocol=restore;
  window.ipmgInitiationProtocolSummary=()=>{const c=config();return c&&c.title||'';};
  window.ipmgInitiationProtocolLog=logData;
  window.ipmgInitiationProtocolWorksheet=worksheetHtml;
  window.ipmgInitiationProtocolSiteMuscleKey=siteMuscleKey;
  function boot(){let lastMedKey=medKey();wrapFunctions();document.addEventListener('click',event=>{const trigger=event.target&&event.target.closest&&event.target.closest('#medChips,#medClear');if(!trigger)return;setTimeout(()=>{const nextKey=medKey();if(nextKey!==lastMedKey){state=blankState();lastMedKey=nextKey;syncMedicationFlags();renderCard();}},0);},true);document.addEventListener('change',event=>{if(event.target&&event.target.id==='adminDate'&&config()&&(config().kind==='sustenna-day1'||config().kind==='sustenna-day8')){applyInitiationSchedule();setTimeout(renderCard,0);}},true);renderCard();try{window.IPMG_RC_VERSION='RC5.39 Initiation Protocols';}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
/* </script> */

;

/* Legacy runtime block 21: <script id="rc542SampleTraceabilityScript"> */
/* ===================== RC5.42: distinct sample package trace + final review ===================== */
(function(){
  'use strict';
  if(window.__IPMG_RC542_SAMPLE_TRACEABILITY__)return;
  window.__IPMG_RC542_SAMPLE_TRACEABILITY__=true;
  const by=id=>document.getElementById(id);
  const val=id=>{const el=by(id);return el&&'value' in el?String(el.value||'').trim():'';};
  const safe=value=>String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const uniq=items=>Array.from(new Set((items||[]).filter(Boolean)));
  const call=(fn,args)=>{try{return typeof fn==='function'?fn.apply(null,args||[]):undefined;}catch(error){return undefined;}};
  function stateRoot(){
    try{if(typeof SAMPLE_STATE!=='undefined'&&SAMPLE_STATE)return SAMPLE_STATE;}catch(error){}
    return window;
  }
  function traceState(){
    const root=stateRoot();
    if(!root.packageTraceability||typeof root.packageTraceability!=='object')root.packageTraceability={packages:{},review:{confirmedAt:'',fingerprint:''},sequence:0};
    const state=root.packageTraceability;
    if(!state.packages||typeof state.packages!=='object')state.packages={};
    if(!state.review||typeof state.review!=='object')state.review={confirmedAt:'',fingerprint:''};
    if(!Number.isFinite(state.sequence))state.sequence=0;
    return state;
  }
  function monthExpired(month){
    if(!month)return false;
    const documented=val('sampleDate');
    try{if(typeof window.monthExpired==='function')return !!window.monthExpired(month,documented);}catch(error){}
    const now=documented?new Date(documented+'T00:00:00'):new Date();
    const current=String(now.getFullYear())+'-'+String(now.getMonth()+1).padStart(2,'0');
    return month<current;
  }
  function localDay(value){
    const date=value instanceof Date?value:new Date(value||'');
    if(Number.isNaN(date.getTime()))return '';
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function rowId(row){
    if(!row)return '';
    let id=row.getAttribute('data-sample-package-trace');
    const state=traceState();
    if(!id){
      state.sequence+=1;
      id='sample-package-'+Date.now().toString(36)+'-'+state.sequence;
      row.setAttribute('data-sample-package-trace',id);
    }
    if(!state.packages[id])state.packages[id]={lot:'',exp:''};
    return id;
  }
  function additionalPackageEntries(){
    const state=traceState();
    return Array.from(document.querySelectorAll('#sampleDoseRows .sample-dose-row')).filter(row=>String(row.querySelector('[data-dose-qty]')?.value||'').trim()).map((row,index)=>{
      const quantity=(row.querySelector('[data-dose-qty]')?.value||'').trim();
      const id=rowId(row),data=state.packages[id]||{};
      const strength=(row.querySelector('[data-dose-strength]')?.value||'').trim()||val('sampleMedLabel')||'Additional sample';
      return {id,primary:false,index:index+2,label:'Added package '+String(index+2),strength,quantity,lot:String(data.lot||''),exp:String(data.exp||'')};
    });
  }
  function samplePackageTraceEntries(){
    const entries=[];
    const primaryQty=val('sampleQty');
    if(primaryQty||val('sampleLot')||val('sampleExp'))entries.push({id:'primary',primary:true,index:1,label:'Primary package',strength:val('sampleMedLabel')||'Sample medication',quantity:primaryQty||'not documented',lot:val('sampleLot'),exp:val('sampleExp')});
    return entries.concat(additionalPackageEntries());
  }
  function samplePackageTraceIssues(){
    const issues=[];
    additionalPackageEntries().forEach(entry=>{
      if(!entry.lot)issues.push(entry.label+' lot');
      if(!entry.exp)issues.push(entry.label+' expiration');
      if(monthExpired(entry.exp))issues.push(entry.label+' expired');
    });
    return uniq(issues);
  }
  function packageTraceText(){
    const entries=samplePackageTraceEntries();
    if(!entries.length)return 'not documented';
    return entries.map(entry=>entry.label+': '+entry.strength+'; '+entry.quantity+'; Lot '+(entry.lot||'not documented')+'; Exp '+(entry.exp||'not documented')).join(' | ');
  }
  function reviewFingerprint(){
    const plan=Array.from(document.querySelectorAll('#sampleDoseRows .sample-dose-row')).map(row=>({
      strength:(row.querySelector('[data-dose-strength]')?.value||'').trim(),
      quantity:(row.querySelector('[data-dose-qty]')?.value||'').trim(),
      days:(row.querySelector('[data-dose-days]')?.value||'').trim(),
      sig:(row.querySelector('[data-dose-sig]')?.value||'').trim()
    }));
    return JSON.stringify({
      patient:val('samplePtName'),dob:val('sampleDOB'),prescriber:val('samplePrescriber'),staff:val('sampleStaff'),date:val('sampleDate'),
      medication:val('sampleMedLabel'),quantity:val('sampleQty'),start:val('sampleStart'),sig:val('sampleSig'),titration:val('sampleTitration'),
      purpose:val('samplePurpose'),food:val('sampleFood'),medicationReview:val('sampleMedCheck'),education:val('sampleEdu'),extra:val('sampleExtra'),handoutStatus:val('sampleHandoutStatus'),followUp:val('sampleFollowUp'),
      plan,packages:samplePackageTraceEntries().map(entry=>({id:entry.id,strength:entry.strength,quantity:entry.quantity,lot:entry.lot,exp:entry.exp}))
    });
  }
  function reviewCurrent(){
    const review=traceState().review;
    return !!(review.confirmedAt&&localDay(review.confirmedAt)===localDay(new Date())&&review.fingerprint&&review.fingerprint===reviewFingerprint());
  }
  function confirmationTime(){
    const stamp=traceState().review.confirmedAt;
    if(!stamp)return '';
    try{return new Date(stamp).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}catch(error){return '';}
  }
  function reviewLine(){
    const staff=val('sampleStaff')||'staff not documented';
    const time=confirmationTime();
    return 'Final dispense review confirmed today by '+staff+(time?' at '+time:'')+'.';
  }
  function updateReviewUI(){
    const card=by('sampleReviewedTodayCard'),button=by('sampleReviewedToday'),status=by('sampleReviewedTodayStatus');
    const current=reviewCurrent();
    if(card)card.classList.toggle('is-confirmed',current);
    if(button){
      button.classList.toggle('is-confirmed',current);
      button.setAttribute('aria-pressed',String(current));
      const title=button.querySelector('b'),detail=button.querySelector('small');
      if(title)title.textContent=current?'Reviewed today':'Mark reviewed today';
      if(detail)detail.textContent=current?'Current entry confirmed':'One-tap final confirmation';
    }
    if(status)status.textContent=current?reviewLine()+' It resets if the patient, plan, package trace, or counseling changes.':'Not confirmed yet - final outputs remain a documentation draft.';
  }
  function markReviewStale(){
    const review=traceState().review;
    if(review.confirmedAt||review.fingerprint){review.confirmedAt='';review.fingerprint='';}
    updateReviewUI();
  }
  function resetPackageTrace(clearPrimary){
    const state=traceState();
    state.packages={};
    if(clearPrimary){const lot=by('sampleLot'),exp=by('sampleExp');if(lot)lot.value='';if(exp)exp.value='';}
    markReviewStale();
  }
  function clearPrimaryTrace(){
    const lot=by('sampleLot'),exp=by('sampleExp');
    if(lot)lot.value='';
    if(exp)exp.value='';
    markReviewStale();
  }
  function refreshOutputs(){
    updateReviewUI();
    if(typeof window.renderSampleHandout==='function')call(window.renderSampleHandout);
    else if(typeof window.renderSampleReadiness==='function')call(window.renderSampleReadiness);
  }
  function traceStateLabel(entry){
    if(monthExpired(entry.exp))return {text:'Expired - do not dispense',kind:'expired'};
    if(!entry.lot||!entry.exp)return {text:'Needs lot and expiration',kind:'needs'};
    return {text:'Trace complete',kind:'ok'};
  }
  function makeTraceField(labelText,field,entry){
    const wrap=document.createElement('label');wrap.className='field';
    const label=document.createElement('span');label.textContent=labelText;wrap.appendChild(label);
    const input=document.createElement('input');input.className='mono';input.setAttribute('data-sample-package-trace-field',field);input.setAttribute('data-sample-package-trace-id',entry.id);
    if(field==='exp')input.type='month';
    else input.placeholder='Lot';
    input.value=entry[field]||'';
    wrap.appendChild(input);return wrap;
  }
  function renderPackageTraceability(){
    const list=by('samplePackageTraceList');if(!list)return;
    const entries=additionalPackageEntries();
    list.textContent='';
    if(!entries.length){
      const empty=document.createElement('div');empty.className='sample-package-trace-empty';empty.textContent='Added physical packages will appear here with their own lot and expiration. Dose-only steps without a package do not create another trace row.';
      list.appendChild(empty);return;
    }
    entries.forEach(entry=>{
      const state=traceStateLabel(entry),row=document.createElement('div');
      row.className='sample-package-trace-row '+(state.kind==='ok'?'':state.kind==='expired'?'expired-trace':'needs-trace');
      row.setAttribute('data-sample-package-trace-row',entry.id);
      const label=document.createElement('div');label.className='sample-package-trace-label';
      const title=document.createElement('b');title.textContent=entry.label;
      const detail=document.createElement('span');detail.textContent=entry.strength+' - '+entry.quantity;
      const flag=document.createElement('span');flag.className='sample-trace-state '+state.kind;flag.textContent=state.text;
      label.append(title,detail,flag);row.appendChild(label);
      row.appendChild(makeTraceField('Lot #','lot',entry));
      row.appendChild(makeTraceField('Expiration','exp',entry));
      list.appendChild(row);
    });
  }
  function copyPrimaryTrace(){
    const lot=val('sampleLot'),exp=val('sampleExp'),entries=additionalPackageEntries();
    if(!entries.length){toastSafe('Add a physical package before copying traceability.');return;}
    if(!lot||!exp){toastSafe('Enter the primary package lot and expiration first.');return;}
    const state=traceState();
    entries.forEach(entry=>{state.packages[entry.id]={lot,exp};});
    markReviewStale();renderPackageTraceability();refreshOutputs();
    toastSafe('Primary lot and expiration copied. Confirm each added package label matches before final review.');
  }
  function toastSafe(message){try{if(typeof window.toast==='function')window.toast(message);}catch(error){}}
  const baseSampleTraceIssues=window.sampleTraceIssues;
  function wrappedSampleTraceIssues(){
    const base=call(baseSampleTraceIssues,arguments);
    const issues=Array.isArray(base)?base.slice():[];
    issues.push.apply(issues,samplePackageTraceIssues());
    if(!reviewCurrent())issues.push('final dispense review confirmation');
    return uniq(issues);
  }
  window.samplePackageTraceEntries=samplePackageTraceEntries;
  window.samplePackageTraceIssues=samplePackageTraceIssues;
  window.samplePackageTraceText=packageTraceText;
  window.sampleReviewConfirmationCurrent=reviewCurrent;
  window.sampleTraceIssues=wrappedSampleTraceIssues;try{sampleTraceIssues=wrappedSampleTraceIssues;}catch(error){}
  // Write-only bridge: the additional-package lot/exp fields are keyed by an
  // auto-generated data-sample-package-trace id, not a plain DOM field id,
  // so setLegacyFieldValue() can't target them. Callers are expected to have
  // already tagged the corresponding #sampleDoseRows row with this same id
  // (see the Samples legacy mirror), matching exactly what the dynamically
  // rendered #samplePackageTraceList input handler does on user input.
  window.ipmgSetSamplePackageTrace=(id,lot,exp)=>{
    if(!id)return;
    const state=traceState();
    state.packages[id]={lot:lot||'',exp:exp||''};
    markReviewStale();renderPackageTraceability();refreshOutputs();
  };
  function wrapDoseRows(){
    const oldAdd=window.addSampleDoseRow;
    if(typeof oldAdd==='function'&&!oldAdd.__rc542PackageTraceWrap){
      const wrapped=function(){
        const before=document.querySelectorAll('#sampleDoseRows .sample-dose-row').length;
        const result=oldAdd.apply(this,arguments);
        Array.from(document.querySelectorAll('#sampleDoseRows .sample-dose-row')).slice(before).forEach(rowId);
        markReviewStale();renderPackageTraceability();refreshOutputs();return result;
      };
      wrapped.__rc542PackageTraceWrap=true;window.addSampleDoseRow=wrapped;try{addSampleDoseRow=wrapped;}catch(error){}
    }
    const oldClear=window.clearSampleDoseRows;
    if(typeof oldClear==='function'&&!oldClear.__rc542PackageTraceWrap){
      const wrapped=function(){const result=oldClear.apply(this,arguments);resetPackageTrace(false);renderPackageTraceability();return result;};
      wrapped.__rc542PackageTraceWrap=true;window.clearSampleDoseRows=wrapped;try{clearSampleDoseRows=wrapped;}catch(error){}
    }
  }
  function wrapIdentityChanges(){
    const oldSelect=window.selectSampleMed;
    if(typeof oldSelect==='function'&&!oldSelect.__rc542PackageTraceWrap){
      const wrapped=function(){resetPackageTrace(true);const result=oldSelect.apply(this,arguments);renderPackageTraceability();refreshOutputs();return result;};
      wrapped.__rc542PackageTraceWrap=true;window.selectSampleMed=wrapped;try{selectSampleMed=wrapped;}catch(error){}
    }
    const oldOption=window.applySampleSigOption;
    if(typeof oldOption==='function'&&!oldOption.__rc542PackageTraceWrap){
      const wrapped=function(){const result=oldOption.apply(this,arguments);resetPackageTrace(true);renderPackageTraceability();refreshOutputs();return result;};
      wrapped.__rc542PackageTraceWrap=true;window.applySampleSigOption=wrapped;try{applySampleSigOption=wrapped;}catch(error){}
    }
    const oldTemplate=window.rc5ApplySampleTemplate;
    if(typeof oldTemplate==='function'&&!oldTemplate.__rc542PackageTraceWrap){
      const wrapped=function(){const result=oldTemplate.apply(this,arguments);resetPackageTrace(true);renderPackageTraceability();refreshOutputs();return result;};
      wrapped.__rc542PackageTraceWrap=true;window.rc5ApplySampleTemplate=wrapped;try{rc5ApplySampleTemplate=wrapped;}catch(error){}
    }
    const oldReset=window.resetSample;
    if(typeof oldReset==='function'&&!oldReset.__rc542PackageTraceWrap){
      const wrapped=function(){const result=oldReset.apply(this,arguments);resetPackageTrace(true);renderPackageTraceability();refreshOutputs();return result;};
      wrapped.__rc542PackageTraceWrap=true;window.resetSample=wrapped;try{resetSample=wrapped;}catch(error){}
    }
    const oldClearSelection=window.clearSampleSelection;
    if(typeof oldClearSelection==='function'&&!oldClearSelection.__rc542PackageTraceWrap){
      const wrapped=function(){const result=oldClearSelection.apply(this,arguments);resetPackageTrace(true);renderPackageTraceability();refreshOutputs();return result;};
      wrapped.__rc542PackageTraceWrap=true;window.clearSampleSelection=wrapped;try{clearSampleSelection=wrapped;}catch(error){}
    }
    const oldPackage=window.addSamplePackageOption;
    if(typeof oldPackage==='function'&&!oldPackage.__rc542PackageTraceWrap){
      const wrapped=function(){
        const before=val('sampleQty'),result=oldPackage.apply(this,arguments),after=val('sampleQty');
        if(!before&&after)clearPrimaryTrace();else markReviewStale();
        renderPackageTraceability();refreshOutputs();return result;
      };
      wrapped.__rc542PackageTraceWrap=true;window.addSamplePackageOption=wrapped;try{addSamplePackageOption=wrapped;}catch(error){}
    }
  }
  function wrapOutputs(){
    const oldNote=window.sampleNoteText;
    if(typeof oldNote==='function'&&!oldNote.__rc542PackageTraceWrap){
      const wrapped=function(){
        const note=String(oldNote.apply(this,arguments)||'');
        if(/No medication sample dispensing is documented by this draft\./i.test(note))return note;
        return note+'\\n\\nPackage trace manifest:\\n'+samplePackageTraceEntries().map(entry=>entry.label+': '+entry.strength+'; '+entry.quantity+'; Lot '+(entry.lot||'not documented')+'; Exp '+(entry.exp||'not documented')+'.').join('\\n')+'\\n'+reviewLine();
      };
      wrapped.__rc542PackageTraceWrap=true;window.sampleNoteText=wrapped;try{sampleNoteText=wrapped;}catch(error){}
    }
    const oldSheet=window.renderSampleSheet;
    if(typeof oldSheet==='function'&&!oldSheet.__rc542PackageTraceWrap){
      const wrapped=function(){
        const result=oldSheet.apply(this,arguments),trace=document.querySelector('#sampleSheet .beauty-trace');
        if(trace){trace.textContent='';const strong=document.createElement('b');strong.textContent='Sample tracking: ';trace.appendChild(strong);trace.appendChild(document.createTextNode(packageTraceText()));}
        return result;
      };
      wrapped.__rc542PackageTraceWrap=true;window.renderSampleSheet=wrapped;try{renderSampleSheet=wrapped;}catch(error){}
    }
    const oldWorksheet=window.renderSampleWorksheet;
    if(typeof oldWorksheet==='function'&&!oldWorksheet.__rc542PackageTraceWrap){
      const wrapped=function(blank){
        const result=oldWorksheet.apply(this,arguments);
        if(!blank){
          const root=by('sampleWorksheetSheet'),staff=root&&root.querySelector('.sw-section.staff');
          if(root&&staff&&!root.querySelector('.rc542-trace-manifest')){
            const field=document.createElement('div');field.className='sw-field tall rc542-trace-manifest filled';
            const key=document.createElement('span');key.className='k';key.textContent='Package trace manifest';
            const value=document.createElement('span');value.className='v';value.textContent=packageTraceText();
            field.append(key,value);
            const grid=staff.querySelector('.sw-grid');if(grid)grid.insertAdjacentElement('afterend',field);else staff.appendChild(field);
          }
        }
        return result;
      };
      wrapped.__rc542PackageTraceWrap=true;window.renderSampleWorksheet=wrapped;try{renderSampleWorksheet=wrapped;}catch(error){}
    }
  }
  function replaceSampleLog(){
    const old=by('sampleAddLog');if(!old||old.dataset.rc542PackageTrace)return;
    const button=old.cloneNode(true);button.dataset.rc542PackageTrace='1';old.parentNode.replaceChild(button,old);
    button.addEventListener('click',function(){
      if(button.disabled)return;
      const issues=wrappedSampleTraceIssues();
      if(issues.length){toastSafe('Complete '+issues.join(', ')+' before documenting a sample dispense.');refreshOutputs();return;}
      try{
        if(typeof LOG==='undefined')return;
        const detail=[call(window.sampleSigText)||val('sampleSig'),call(window.sampleDosePlanText),reviewLine()].filter(Boolean).join(' | ');
        const entry={type:'sample',status:'completed',time:typeof nowStamp==='function'?nowStamp():'',pt:val('samplePtName')||'—',summary:call(window.sampleFriendlyMedication)||val('sampleMedLabel')||'Sample',details:detail,trace:packageTraceText(),follow:val('samplePurpose')||'Sample dispensed',by:val('sampleStaff')||'—'};
        const saved=typeof window.appendLogEntry==='function'?window.appendLogEntry(entry):false;
        if(!saved){toastSafe('Sample could not be saved to the activity log in this browser.');return;}
        call(window.renderLog);call(window.renderCommandCenter);toastSafe('Sample added to activity log');
      }catch(error){toastSafe('Unable to add the sample to the activity log.');}
    });
  }
  function bind(){
    const list=by('samplePackageTraceList');
    if(list&&!list.dataset.rc542PackageTrace){
      list.dataset.rc542PackageTrace='1';
      ['input','change'].forEach(type=>list.addEventListener(type,event=>{
        const input=event.target&&event.target.closest&&event.target.closest('[data-sample-package-trace-field]');if(!input)return;
        const id=input.getAttribute('data-sample-package-trace-id'),field=input.getAttribute('data-sample-package-trace-field');
        if(!id||!field)return;
        const state=traceState();state.packages[id]=state.packages[id]||{lot:'',exp:''};state.packages[id][field]=input.value||'';
        markReviewStale();refreshOutputs();
        const row=list.querySelector('[data-sample-package-trace-row="'+id+'"]');if(row){const entry=additionalPackageEntries().find(item=>item.id===id);const current=entry&&traceStateLabel(entry);row.classList.toggle('needs-trace',!!current&&current.kind==='needs');row.classList.toggle('expired-trace',!!current&&current.kind==='expired');const flag=row.querySelector('.sample-trace-state');if(flag&&current){flag.className='sample-trace-state '+current.kind;flag.textContent=current.text;}}
      }));
    }
    const copyButton=by('sampleTraceCopyPrimary');if(copyButton&&!copyButton.dataset.rc542PackageTrace){copyButton.dataset.rc542PackageTrace='1';copyButton.addEventListener('click',copyPrimaryTrace);}
    const reviewButton=by('sampleReviewedToday');if(reviewButton&&!reviewButton.dataset.rc542PackageTrace){
      reviewButton.dataset.rc542PackageTrace='1';reviewButton.addEventListener('click',function(){
        const traceIssues=uniq((baseSampleTraceIssues&&call(baseSampleTraceIssues))||[]).concat(samplePackageTraceIssues());
        if(traceIssues.length){toastSafe('Finish '+uniq(traceIssues).join(', ')+' before confirming the final review.');return;}
        const review=traceState().review;review.confirmedAt=new Date().toISOString();review.fingerprint=reviewFingerprint();updateReviewUI();refreshOutputs();toastSafe('Final sample review confirmed for the current entry.');
      });
    }
    const primaryQty=by('sampleQty');if(primaryQty&&!primaryQty.dataset.rc542PackageTrace){
      primaryQty.dataset.rc542PackageTrace='1';primaryQty.addEventListener('input',function(){clearPrimaryTrace();refreshOutputs();});
    }
    const rows=by('sampleDoseRows');if(rows&&!rows.dataset.rc542PackageTrace){
      rows.dataset.rc542PackageTrace='1';
      ['input','change'].forEach(type=>rows.addEventListener(type,event=>{
        const row=event.target&&event.target.closest&&event.target.closest('.sample-dose-row');if(!row)return;
        const input=event.target;
        if(input&&input.matches&&input.matches('[data-dose-strength],[data-dose-qty]')){const id=rowId(row);traceState().packages[id]={lot:'',exp:''};renderPackageTraceability();}
        markReviewStale();refreshOutputs();
      }));
      const observer=new MutationObserver(function(){setTimeout(function(){renderPackageTraceability();},0);});observer.observe(rows,{childList:true});
    }
    document.addEventListener('input',event=>{if(event.target&&event.target.closest&&event.target.closest('#panel-samples')&&!event.target.closest('#samplePackageTraceList'))markReviewStale();},true);
    document.addEventListener('change',event=>{if(event.target&&event.target.closest&&event.target.closest('#panel-samples')&&!event.target.closest('#samplePackageTraceList'))markReviewStale();},true);
    document.addEventListener('click',event=>{
      const target=event.target&&event.target.closest&&event.target.closest('#sampleQtyClear,#sampleQtyMinus,#sampleQtyPlus,#sampleAddDose,.sample-dose-remove,[data-pack-opt],[data-sig-opt],[data-rc5-template]');
      if(!target)return;
      setTimeout(function(){
        if(target.id==='sampleQtyClear')clearPrimaryTrace();else markReviewStale();
        renderPackageTraceability();refreshOutputs();
      },0);
    },true);
  }
  function boot(){
    wrapDoseRows();wrapIdentityChanges();wrapOutputs();bind();replaceSampleLog();renderPackageTraceability();updateReviewUI();refreshOutputs();
    try{window.IPMG_RC_VERSION='RC5.42 Package Traceability + Final Review';}catch(error){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
/* </script> */

;

/* Legacy runtime block 22: <script id="rc543InjectionDocumentationScript"> */
/* ===================== RC5.43: state-aware injection documentation ===================== */
(function(){
  'use strict';
  if(window.__IPMG_RC543_INJECTION_DOCUMENTATION__)return;
  window.__IPMG_RC543_INJECTION_DOCUMENTATION__=true;

  const by=id=>document.getElementById(id);
  const value=id=>{const el=by(id);return el&&'value' in el?String(el.value||'').trim():'';};
  const checked=id=>!!(by(id)&&by(id).checked);
  const uniq=list=>Array.from(new Set((list||[]).filter(Boolean)));
  const hasMedication=()=>{try{return typeof S!=='undefined'&&!!S.med;}catch(error){return false;}};
  const initiationProtocolKey=()=>{try{const snapshot=typeof window.ipmgInitiationProtocolSnapshot==='function'?window.ipmgInitiationProtocolSnapshot():{};return String(snapshot&&snapshot.protocol||'');}catch(error){return '';}};
  const pairedInitiation=()=>['maintena-1day','asimtufii-1day','aristada-initio-sameday'].includes(initiationProtocolKey());
  const hasValue=ids=>ids.some(id=>{const el=by(id);return !!(el&&(el.type==='checkbox'?el.checked:value(id)));});
  const normalize=value=>String(value==null?'':value).replace(/\r\n/g,'\n').replace(/\s+\n/g,'\n').trim();
  const sentence=value=>{const text=normalize(value);return !text||/[.!?]$/.test(text)?text:text+'.';};
  const withoutTerminal=value=>normalize(value).replace(/[.!?]+$/,'');
  function appendNarrative(out,heading,raw,indent){
    const lines=linesOf(raw);if(!lines.length)return;
    out.push(heading);lines.forEach(line=>out.push((indent||'  ↳ ')+sentence(line)));
  }
  const divider='────────────────────────────────';

  const allFieldIds=['injOrderPurpose','injProductSource','injProductSourceOther','injPreparation','injPreparationDetail','injWasteToggle','injWasteAmount','injWasteWitness','injProductIssueToggle','injProductIssueDetail','injProductIssueAction','injProductIssueRecipient','injProductIssueNotificationTime','injProductIssueDirection','injProductIssueNextStep','injAdminTime','injSecondAdminTime','injVolume','injVolumeUnit','injDevice','injDeviceOther','injSiteCondition','injSiteConditionDetail','injExceptionToggle','injExceptionSummary','injExceptionRecipient','injExceptionTime','injExceptionOutcome'];

  function setHidden(id,hidden){const el=by(id);if(el)el.hidden=!!hidden;}
  function setDisclosure(toggleId,fieldsId,open){
    const toggle=by(toggleId),fields=by(fieldsId);if(!toggle||!fields)return;
    fields.hidden=!open;toggle.setAttribute('aria-expanded',String(!!open));
  }
  function payload(){
    const source=value('injProductSource');
    const preparation=value('injPreparation');
    const device=value('injDevice');
    const siteCondition=value('injSiteCondition');
    return {
      purpose:value('injOrderPurpose'),
      time:value('injAdminTime'),
      secondTime:pairedInitiation()?value('injSecondAdminTime'):'',
      volume:value('injVolume'),
      unit:value('injVolumeUnit'),
      device:device==='Other'?value('injDeviceOther'):device,
      siteCondition:siteCondition==='Other'?value('injSiteConditionDetail'):siteCondition,
      source:source==='Other'?value('injProductSourceOther'):source,
      preparation:preparation==='Other'?value('injPreparationDetail'):preparation,
      waste:checked('injWasteToggle')?value('injWasteAmount'):'',
      wasteWitness:checked('injWasteToggle')?value('injWasteWitness'):'',
      productIssue:checked('injProductIssueToggle')?value('injProductIssueDetail'):'',
      productIssueAction:checked('injProductIssueToggle')?value('injProductIssueAction'):'',
      productIssueRecipient:checked('injProductIssueToggle')?value('injProductIssueRecipient'):'',
      productIssueNotificationTime:checked('injProductIssueToggle')?value('injProductIssueNotificationTime'):'',
      productIssueDirection:checked('injProductIssueToggle')?value('injProductIssueDirection'):'',
      productIssueNextStep:checked('injProductIssueToggle')?value('injProductIssueNextStep'):'',
      exception:checked('injExceptionToggle'),
      exceptionSummary:value('injExceptionSummary'),
      exceptionRecipient:value('injExceptionRecipient'),
      exceptionTime:value('injExceptionTime'),
      exceptionOutcome:value('injExceptionOutcome')
    };
  }
  function detailReview(options){
    const requireAdministrationDetail=!options||options.requireAdministrationDetail!==false;
    const bySection={trace:[],return:[],response:[]};
    const push=(section,message)=>bySection[section].push(message);
    const details=payload();
    if(requireAdministrationDetail&&hasMedication()&&!details.time)push('return','Document the actual administration time.');
    if(requireAdministrationDetail&&pairedInitiation()&&!details.secondTime)push('response','Document the actual administration time for paired injection component 2.');
    if((details.volume&&!details.unit)||(!details.volume&&details.unit))push('response','Document both the administration amount and its unit, or clear the partial value.');
    if(value('injDevice')==='Other'&&!value('injDeviceOther'))push('response','Describe the other delivery device selected.');
    if(value('injSiteCondition')==='Other'&&!value('injSiteConditionDetail'))push('response','Describe the documented site condition.');
    if(value('injProductSource')==='Other'&&!value('injProductSourceOther'))push('trace','Document the other medication source.');
    if(value('injPreparation')==='Other'&&!value('injPreparationDetail'))push('trace','Document the preparation or reconstitution detail.');
    if(checked('injWasteToggle')){
      if(!value('injWasteAmount'))push('trace','Document the medication waste amount and unit.');
      if(!value('injWasteWitness'))push('trace','Document the waste witness.');
    }
    if(checked('injProductIssueToggle')){
      if(!value('injProductIssueDetail'))push('trace','Describe the product or device issue.');
      if(!value('injProductIssueAction'))push('trace','Document the action or disposition for the product/device issue.');
      if(!value('injProductIssueRecipient'))push('trace','Document who was notified about the product/device issue, or why notification was not needed.');
      if(!value('injProductIssueNotificationTime'))push('trace','Document the product/device issue notification or decision time.');
      if(!value('injProductIssueDirection'))push('trace','Document the direction received for the product/device issue.');
      if(!value('injProductIssueNextStep'))push('trace','Document the next step, owner, and timing for the product/device issue.');
    }
    if(details.exception&&!requireAdministrationDetail){
      push('response','Administration exception / escalation is only for an administered encounter. Clear it before documenting a non-administration handoff.');
    }else if(details.exception){
      if(!details.exceptionSummary)push('response','Describe what changed or was observed for the administration exception.');
      if(!details.exceptionRecipient)push('response','Document who was notified, or why notification was not needed.');
      if(!details.exceptionTime)push('response','Document the notification or decision time.');
      if(!details.exceptionOutcome)push('response','Document the direction, action, and next step for the administration exception.');
    }
    const stops=uniq([].concat(bySection.trace,bySection.return,bySection.response));
    return {stops,warnings:[],bySection};
  }
  window.ipmgInjectionDetailReview=detailReview;
  window.ipmgInjectionDocumentationDetails=payload;

  let priorInitiationProtocol='';
  function syncConditionalUi(forceClose){
    const protocol=initiationProtocolKey();
    if(protocol!==priorInitiationProtocol){
      if(priorInitiationProtocol&&by('injSecondAdminTime'))by('injSecondAdminTime').value='';
      priorInitiationProtocol=protocol;
    }
    setHidden('injProductSourceOtherWrap',value('injProductSource')!=='Other');
    setHidden('injPreparationDetailWrap',value('injPreparation')!=='Other');
    setHidden('injWasteFields',!checked('injWasteToggle'));
    setHidden('injProductIssueFields',!checked('injProductIssueToggle'));
    setHidden('injDeviceOtherWrap',value('injDevice')!=='Other');
    setHidden('injSiteConditionDetailWrap',value('injSiteCondition')!=='Other');
    setHidden('injSecondAdminTimeWrap',!pairedInitiation());
    setHidden('injExceptionFields',!checked('injExceptionToggle'));
    if(forceClose){
      setDisclosure('injHandlingToggle','injHandlingFields',false);
      setDisclosure('injAdminDetailToggle','injAdminDetailFields',false);
      return;
    }
    if(hasValue(['injProductSource','injProductSourceOther','injPreparation','injPreparationDetail','injWasteToggle','injWasteAmount','injWasteWitness','injProductIssueToggle','injProductIssueDetail','injProductIssueAction','injProductIssueRecipient','injProductIssueNotificationTime','injProductIssueDirection','injProductIssueNextStep']))setDisclosure('injHandlingToggle','injHandlingFields',true);
    if(hasValue(['injVolume','injVolumeUnit','injDevice','injDeviceOther','injSiteCondition','injSiteConditionDetail']))setDisclosure('injAdminDetailToggle','injAdminDetailFields',true);
    if(pairedInitiation())setDisclosure('injAdminDetailToggle','injAdminDetailFields',true);
  }
  function setInvalid(id,on){try{if(typeof setFieldQa==='function')setFieldQa(id,on?'warn':null);}catch(error){}const el=by(id);if(el)el.setAttribute('aria-invalid',on?'true':'false');}
  function requiresAdministrationDetail(){
    try{const disposition=typeof window.ipmgClinicalDispositionSnapshot==='function'?window.ipmgClinicalDispositionSnapshot():null;return !disposition||!disposition.kind||disposition.kind==='administered';}catch(error){return true;}
  }
  function reflectValidation(){
    const requireAdministrationDetail=requiresAdministrationDetail(),review=detailReview({requireAdministrationDetail}),details=payload(),trace=review.bySection.trace,response=review.bySection.response;
    setInvalid('injAdminTime',requireAdministrationDetail&&hasMedication()&&!details.time);
    setInvalid('injSecondAdminTime',requireAdministrationDetail&&pairedInitiation()&&!details.secondTime);
    const partialVolume=!!((details.volume&&!details.unit)||(!details.volume&&details.unit));
    setInvalid('injVolume',partialVolume);setInvalid('injVolumeUnit',partialVolume);
    setInvalid('injDeviceOther',value('injDevice')==='Other'&&!value('injDeviceOther'));
    setInvalid('injSiteConditionDetail',value('injSiteCondition')==='Other'&&!value('injSiteConditionDetail'));
    setInvalid('injProductSourceOther',value('injProductSource')==='Other'&&!value('injProductSourceOther'));
    setInvalid('injPreparationDetail',value('injPreparation')==='Other'&&!value('injPreparationDetail'));
    setInvalid('injWasteAmount',checked('injWasteToggle')&&!value('injWasteAmount'));
    setInvalid('injWasteWitness',checked('injWasteToggle')&&!value('injWasteWitness'));
    setInvalid('injProductIssueDetail',checked('injProductIssueToggle')&&!value('injProductIssueDetail'));
    setInvalid('injProductIssueAction',checked('injProductIssueToggle')&&!value('injProductIssueAction'));
    setInvalid('injProductIssueRecipient',checked('injProductIssueToggle')&&!value('injProductIssueRecipient'));
    setInvalid('injProductIssueNotificationTime',checked('injProductIssueToggle')&&!value('injProductIssueNotificationTime'));
    setInvalid('injProductIssueDirection',checked('injProductIssueToggle')&&!value('injProductIssueDirection'));
    setInvalid('injProductIssueNextStep',checked('injProductIssueToggle')&&!value('injProductIssueNextStep'));
    setInvalid('injExceptionToggle',!requireAdministrationDetail&&details.exception);
    setInvalid('injExceptionSummary',checked('injExceptionToggle')&&!value('injExceptionSummary'));
    setInvalid('injExceptionRecipient',checked('injExceptionToggle')&&!value('injExceptionRecipient'));
    setInvalid('injExceptionTime',checked('injExceptionToggle')&&!value('injExceptionTime'));
    setInvalid('injExceptionOutcome',checked('injExceptionToggle')&&!value('injExceptionOutcome'));
    return {trace,response};
  }

  function formatTime(raw){
    const match=/^(\d{1,2}):(\d{2})$/.exec(String(raw||''));
    if(!match)return String(raw||'');
    const hour=Number(match[1]),minute=match[2],suffix=hour>=12?'PM':'AM',twelve=hour%12||12;
    return twelve+':'+minute+' '+suffix;
  }
  function formatDateTime(raw){
    const date=new Date(String(raw||''));
    if(Number.isNaN(date.getTime()))return String(raw||'');
    return date.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  }
  function linesOf(raw){return String(raw==null?'':raw).replace(/\r\n/g,'\n').split('\n').map(line=>line.trim()).filter(Boolean);}
  function prefixedLines(raw,prefix,continuation){
    const lines=linesOf(raw),out=[];
    lines.forEach((line,index)=>out.push((index&&continuation?continuation:prefix)+line));
    return out;
  }
  function formatCc(raw,details,administered){
    const lines=linesOf(raw);if(!lines.length)return '';
    const out=[lines.shift()];
    if(lines.length){out.push('');lines.forEach(line=>out.push('↳ '+line));}
    if(administered&&details.purpose){out.push('');out.push('→ Verified active-order purpose / encounter context: '+sentence(details.purpose));}
    return out.join('\n');
  }
  function formatAssessment(raw,details,administered){
    const out=prefixedLines(raw,'• ','• ');
    if(administered&&details.exception&&details.exceptionSummary){
      if(out.length)out.push('');
      appendNarrative(out,'! Administration exception / escalation:',details.exceptionSummary,'  ↳ ');
    }
    return out.join('\n');
  }
  function formatNeutralPlan(raw){
    const lines=linesOf(raw);return lines.map((line,index)=>(index?'• ':'→ ')+line).join('\n');
  }
  function startsAny(line,patterns){return patterns.some(pattern=>pattern.test(line));}
  function formatPlan(raw,details,administered){
    if(!administered)return formatNeutralPlan(raw);
    const source=linesOf(raw),out=[],support=[],trace=[],continuity=[],initiation=[];
    let administration='';
    source.forEach(line=>{
      if(!administration&&/^Administered\s+(?!by\b)/i.test(line)){administration=line;return;}
      if(/^Medication details:/i.test(line)){trace.push(line.replace(/^Medication details:\s*/i,''));return;}
      if(startsAny(line,[/^Next dose due /i,/^Ordering provider:/i,/^Administered by /i])){continuity.push(line);return;}
      if(startsAny(line,[/^Initiation components:/i,/^Component 2 traceability:/i,/^Component 2 note:/i,/^Day 8 scheduling target:/i,/^Day 8 timing:/i,/^Provider-directed initiation/i])){initiation.push(line);return;}
      support.push(line);
    });
    if(administration){
      const time=details.time?' · actual administration time: '+formatTime(details.time):'';
      out.push('→ '+withoutTerminal(administration)+time+'.');
    }
    support.forEach(line=>out.push('  ↳ '+line));
    const administrationDetail=[];
    if(details.volume&&details.unit)administrationDetail.push('Administration amount: '+details.volume+' '+details.unit);
    if(details.device)administrationDetail.push('Delivery device: '+details.device);
    if(details.siteCondition)administrationDetail.push('Site condition: '+details.siteCondition);
    if(administrationDetail.length)out.push('  ↳ '+administrationDetail.map(withoutTerminal).join(' · ')+'.');
    if(initiation.length){
      if(out.length)out.push(divider);
      out.push('→ Initiation / paired components');
      initiation.forEach(line=>out.push('  ↳ '+line));
      if(details.secondTime)out.push('  ↳ Component 2 actual administration time: '+formatTime(details.secondTime)+'.');
    }
    const handlingExists=!!(details.source||details.preparation||details.waste||details.wasteWitness||details.productIssue||details.productIssueAction||details.productIssueRecipient||details.productIssueNotificationTime||details.productIssueDirection||details.productIssueNextStep);
    if(trace.length||handlingExists){
      if(out.length)out.push(divider);
      out.push('• Traceability');
      trace.forEach(line=>out.push('  ↳ '+line));
      if(details.source)out.push('  ↳ Product source: '+sentence(details.source));
      if(details.preparation)out.push('  ↳ Preparation / reconstitution: '+sentence(details.preparation));
      if(details.waste||details.wasteWitness)out.push('  ↳ Waste: '+[details.waste,details.wasteWitness?'witnessed by '+details.wasteWitness:''].filter(Boolean).map(withoutTerminal).join(' · ')+'.');
      if(details.productIssue)appendNarrative(out,'  ! Product/device issue:',details.productIssue,'    ↳ ');
      if(details.productIssueAction)appendNarrative(out,'  → Action / disposition:',details.productIssueAction,'    ↳ ');
      if(details.productIssueRecipient)out.push('  • Notification: '+withoutTerminal(details.productIssueRecipient)+(details.productIssueNotificationTime?' · '+formatDateTime(details.productIssueNotificationTime):'')+'.');
      else if(details.productIssueNotificationTime)out.push('  • Notification / decision time: '+formatDateTime(details.productIssueNotificationTime)+'.');
      if(details.productIssueDirection)appendNarrative(out,'  → Direction received:',details.productIssueDirection,'    ↳ ');
      if(details.productIssueNextStep)appendNarrative(out,'  → Next step:',details.productIssueNextStep,'    ↳ ');
    }
    if(continuity.length){
      if(out.length)out.push(divider);
      out.push('→ Continuity');
      continuity.forEach(line=>out.push('  ↳ '+line));
    }
    if(details.exception){
      if(out.length)out.push(divider);
      out.push('! Administration exception / escalation');
      if(details.exceptionRecipient)out.push('  • Notification: '+withoutTerminal(details.exceptionRecipient)+(details.exceptionTime?' · '+formatDateTime(details.exceptionTime):'')+'.');
      else if(details.exceptionTime)out.push('  • Notification / decision time: '+formatDateTime(details.exceptionTime)+'.');
      if(details.exceptionOutcome)appendNarrative(out,'  → Direction, action, and next step:',details.exceptionOutcome,'    ↳ ');
    }
    if(!out.length)return formatNeutralPlan(raw);
    return out.join('\n');
  }
  function noteBlock(line){
    if(/Traceability|Product source|Preparation|Waste|Product\/device|Action \/ disposition/i.test(line))return /Product source|Preparation|Waste|Product\/device|Action \/ disposition/i.test(line)?'handling':'traceability';
    if(/exception|Notification|Direction, action/i.test(line))return 'exception';
    if(/Continuity|Next dose|Ordering provider|Administered by/i.test(line))return 'continuity';
    return 'administration';
  }
  function writePreview(id,text){
    const root=by(id);if(!root||!text)return;
    root.replaceChildren();
    String(text).split('\n').forEach(line=>{
      const p=document.createElement('p');
      if(!line){p.className='tebra-note-spacer';p.setAttribute('aria-hidden','true');p.textContent='\u00a0';}
      else{
        p.textContent=line;p.dataset.noteBlock=noteBlock(line);
        if(line===divider)p.className='tebra-note-divider';
        else if(/^→ /.test(line))p.className='tebra-note-arrow';
        else if(/^(  |    )↳/.test(line))p.className='tebra-note-indent';
        else if(/^! |^  ! /.test(line))p.className='tebra-note-exception';
        else if(/^• |^  • /.test(line))p.className='tebra-note-bullet';
      }
      root.appendChild(p);
    });
  }
  function administered(){const badge=by('clinicalDispositionBadge');return !!(badge&&/Administration documented/i.test(badge.textContent||''));}
  function locked(){const panel=by('panel-administer');return !!(panel&&panel.classList.contains('record-readonly'));}
  function renderFormattedNote(){
    if(locked())return;
    const raw=window._note||{};if(!raw.cc&&!raw.as&&!raw.pl)return;
    const isAdministered=administered(),details=payload();
    const note={
      cc:formatCc(raw.cc,details,isAdministered),
      as:formatAssessment(raw.as,details,isAdministered),
      pl:formatPlan(raw.pl,details,isAdministered)
    };
    window._note=note;
    writePreview('outCC',note.cc);
    writePreview('outAS',note.as);
    writePreview('outPL',note.pl);
  }

  function bind(){
    const renderNow=()=>{syncConditionalUi(false);reflectValidation();try{if(typeof window.render==='function')window.render();}catch(error){}};
    allFieldIds.forEach(id=>{
      const field=by(id);if(!field||field.dataset.rc543Bound)return;
      field.dataset.rc543Bound='1';field.addEventListener('input',renderNow);field.addEventListener('change',renderNow);
    });
    [['injHandlingToggle','injHandlingFields'],['injAdminDetailToggle','injAdminDetailFields']].forEach(pair=>{
      const toggle=by(pair[0]);if(!toggle||toggle.dataset.rc543Bound)return;
      toggle.dataset.rc543Bound='1';toggle.addEventListener('click',event=>{event.preventDefault();const fields=by(pair[1]);setDisclosure(pair[0],pair[1],!!(fields&&fields.hidden));});
    });
  }
  function wrapRender(){
    const previous=window.render;
    if(typeof previous==='function'&&!previous.__rc543InjectionDocumentationWrap){
      const wrapped=function(){if(locked())return window._note||{};const result=previous.apply(this,arguments);syncConditionalUi(false);reflectValidation();renderFormattedNote();return result;};
      wrapped.__rc543InjectionDocumentationWrap=true;window.render=wrapped;try{render=wrapped;}catch(error){}
    }
    const previousReset=window.softReset;
    if(typeof previousReset==='function'&&!previousReset.__rc543InjectionDocumentationWrap){
      const wrappedReset=function(){const result=previousReset.apply(this,arguments);syncConditionalUi(true);reflectValidation();return result;};
      wrappedReset.__rc543InjectionDocumentationWrap=true;window.softReset=wrappedReset;try{softReset=wrappedReset;}catch(error){}
    }
  }
  function appendWorksheetDetail(blank){
    if(blank)return;
    const root=by('injWorksheetSheet'),target=root&&root.querySelector('.iw-section.doc');if(!target)return;
    target.querySelectorAll('.rc543-inj-worksheet-detail').forEach(node=>node.remove());
    const details=payload(),items=[];
    if(details.time)items.push('Actual administration time: '+formatTime(details.time));
    if(details.secondTime)items.push('Component 2 actual administration time: '+formatTime(details.secondTime));
    if(details.volume&&details.unit)items.push('Administration amount: '+details.volume+' '+details.unit);
    if(details.device)items.push('Delivery device: '+details.device);
    if(details.siteCondition)items.push('Site condition: '+details.siteCondition);
    if(details.source)items.push('Product source: '+details.source);
    if(details.exception&&details.exceptionSummary)items.push('Exception / escalation: '+details.exceptionSummary);
    if(!items.length)return;
    const note=document.createElement('div');note.className='iw-quiet rc543-inj-worksheet-detail';note.textContent='Encounter detail: '+items.map(sentence).join(' ');
    const quiet=target.querySelector('.iw-quiet');if(quiet)quiet.insertAdjacentElement('beforebegin',note);else target.appendChild(note);
  }
  function wrapWorksheet(){
    const previous=window.renderInjectionWorksheet;
    if(typeof previous==='function'&&!previous.__rc543InjectionDocumentationWrap){
      const wrapped=function(blank){const result=previous.apply(this,arguments);appendWorksheetDetail(!!blank);return result;};
      wrapped.__rc543InjectionDocumentationWrap=true;window.renderInjectionWorksheet=wrapped;
    }
  }
  function boot(){
    wrapRender();wrapWorksheet();bind();syncConditionalUi(false);reflectValidation();
    try{if(typeof window.render==='function')window.render();}catch(error){}
    try{window.IPMG_RC_VERSION='RC5.43 Structured Injection Documentation';}catch(error){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
/* </script> */

;

/* Legacy runtime block 23: <script id="rc545SmartClinicalWorkspaceScript"> */
/* ===================== RC5.45: smart, efficient clinical workspace =====================
   The form responds to prior answers, preserves explicit clinical choice, and keeps
   the active documentation task close to the information that informs it. */
(function(){
  'use strict';
  if(window.__IPMG_RC545_SMART_WORKSPACE__)return;
  window.__IPMG_RC545_SMART_WORKSPACE__=true;

  const by=id=>document.getElementById(id);
  const qs=(selector,root=document)=>root&&root.querySelector?root.querySelector(selector):null;
  const text=(selector,value,root=document)=>{const node=qs(selector,root);if(node&&value&&node.textContent!==value)node.textContent=value;return node;};
  const fieldFor=id=>by(id)?.closest('.field')||null;
  const cleanEmptyWrap=node=>{if(node&&node.children.length===0)node.remove();};

  function setFieldLabel(id,html){
    const field=fieldFor(id),label=field&&qs(':scope > label',field);
    if(label)label.innerHTML=html;
  }

  function moveProgressRail(){
    const panel=by('panel-administer'),flow=by('rc526Flow'),layout=panel&&qs(':scope > .layout',panel);
    if(panel&&flow&&layout&&flow.parentElement!==panel)panel.insertBefore(flow,layout);
  }

  function buildPriorContext(){
    const detail=by('medDetail'),siteGroup=detail&&qs('.admin-site-grp',detail);
    if(!detail||!siteGroup)return null;
    let context=by('injPriorContext');
    if(!context){
      context=document.createElement('section');
      context.id='injPriorContext';
      context.className='inj-prior-context';
      context.setAttribute('aria-labelledby','injPriorContextTitle');
      context.innerHTML='<div class="inj-prior-context-head"><div><h3 class="inj-prior-context-title" id="injPriorContextTitle">Prior administration context</h3><div class="inj-prior-context-copy" id="injPriorContextCopy" aria-live="polite">Previous dose details can check timing and recommend a valid alternate site. The actual site is always selected separately.</div></div><span class="inj-prior-context-badge" id="injPriorContextBadge">Optional · smart helper</span></div><div class="inj-prior-context-fields"></div>';
      detail.insertBefore(context,siteGroup);
    }
    const fields=qs('.inj-prior-context-fields',context);
    ['priorDose','priorSite'].forEach(id=>{
      const field=fieldFor(id);
      if(field&&fields&&field.parentElement!==fields){const old=field.parentElement;field.removeAttribute('style');fields.appendChild(field);cleanEmptyWrap(old);}
    });
    const timing=by('injTiming');
    if(timing&&timing.parentElement!==context){const old=timing.parentElement;context.appendChild(timing);cleanEmptyWrap(old);}
    setFieldLabel('priorDose','Previous dose date <span class="auto-tag">Optional</span>');
    setFieldLabel('priorSite','Previous injection site <span class="auto-tag">Optional</span>');
    return context;
  }

  function buildAdministrationCore(){
    const card=qs('#panel-administer .card-response');
    if(!card)return null;
    let core=by('injAdministrationCore');
    if(!core){
      core=document.createElement('section');
      core.id='injAdministrationCore';
      core.className='inj-administration-core';
      core.setAttribute('aria-labelledby','injAdministrationCoreTitle');
      core.innerHTML='<h3 class="inj-administration-core-title" id="injAdministrationCoreTitle">Administration facts</h3><div class="inj-administration-core-sub" id="injAdministrationCoreSub" aria-live="polite">Date, actual time, and staff attribution stay together.</div>';
      const patientResponse=by('respChips')?.closest('.grp');
      card.insertBefore(core,patientResponse||card.querySelector('.inj-detail-disclosure')||null);
    }
    ['adminDate','injAdminTime','admin'].forEach(id=>{
      const field=fieldFor(id);
      if(field&&field.parentElement!==core){const old=field.parentElement;field.removeAttribute('style');core.appendChild(field);cleanEmptyWrap(old);}
    });
    setFieldLabel('adminDate','Administration date <span class="req">*</span>');
    setFieldLabel('injAdminTime','Actual administration time <span class="req">*</span>');
    setFieldLabel('admin','Administered by <span class="req">*</span>');
    return core;
  }

  function setCardHeading(selector,title,hint){
    const card=qs(selector);
    if(!card)return;
    text('.card-head h2',title,card);
    text('.card-head .hint',hint,card);
  }

  function setModuleCopy(){
    document.title='IPMG MA Workstation';
    text('.home-title','Medical assistant workspace.');
    text('.home-subtitle','Fast documentation for injections, UDS, samples, forms, and daily closeout.');
    text('#panel-administer .inj-modern-hero .eyebrow','Injection documentation');
    text('#panel-administer .inj-modern-hero h2','Injection documentation, from order to closeout.');
    text('#panel-administer .inj-modern-hero p','Medication-aware guidance, focused safety checks, product traceability, and a Tebra-ready note in one efficient workflow.');
    text('#panel-uds .uds-modern-hero h2','Point-of-care UDS, documented with clear guardrails.');
    text('#panel-uds .uds-modern-hero p','Capture the exact device and result, surface reconciliation needs, and produce a clean handoff without slowing the visit.');
    text('#panel-samples .sample-hero-title','Document exactly what was dispensed.');
    text('#panel-samples .sample-hero-copy','Package-level traceability, patient instructions, and a deliberate final review for a complete sample handoff.');
  }

  function reorderInjectionCards(){
    const form=qs('#panel-administer .form-col');
    if(!form)return;
    const order=[
      qs('.card-encounter',form),
      qs('.card-medication',form),
      qs('.initiation-card',form),
      qs('.card-safety',form),
      qs('.card-trace',form),
      qs('.card-response',form),
      qs('.card-return',form),
      by('clinicalDisposition')
    ].filter(Boolean);
    if(!order.length)return;
    if(form.firstElementChild!==order[0])form.insertBefore(order[0],form.firstElementChild);
    order.slice(1).forEach((card,index)=>{
      const previous=order[index];
      if(previous.nextElementSibling!==card)previous.insertAdjacentElement('afterend',card);
    });
  }

  function smartSiteCopy(){
    const copy=by('injPriorContextCopy'),badge=by('injPriorContextBadge');
    if(!copy||!badge)return;
    const write=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
    let prior=null,recommended='';
    try{prior=window.injectionSiteRotationContext?.()||null;}catch(error){}
    try{recommended=window.injectionRecommendedSite?.()||'';}catch(error){}
    const hasDate=!!by('priorDose')?.value;
    if(prior&&recommended){
      write(copy,`Previous site: ${prior.site}${prior.whenShort?` · ${prior.whenShort}`:''}. A valid alternate is ${recommended}; confirm the actual site after administration.`);
      write(badge,`Suggests ${recommended}`);
      badge.classList.add('is-smart');
    }else if(prior){
      write(copy,'The previous site is recorded, but the selected medication and route do not provide a distinct alternate. Choose today’s actual allowed site.');
      write(badge,'Review site options');
      badge.classList.add('is-smart');
    }else if(hasDate){
      write(copy,'Previous dose timing is available. Add the previous injection site to enable medication-aware rotation guidance.');
      write(badge,'Add site for rotation');
      badge.classList.add('is-smart');
    }else{
      write(copy,'Previous dose details can check timing and recommend a valid alternate site. The actual site is always selected separately.');
      write(badge,'Optional · smart helper');
      badge.classList.remove('is-smart');
    }
  }

  function smartAdministrationCopy(){
    const sub=by('injAdministrationCoreSub');
    if(!sub)return;
    const state=typeof S!=='undefined'&&S?S:{},med=state.med||null;
    let next='';
    if(med&&state.site){
      next=[med.name||med.label,state.dose,state.route,state.site].filter(Boolean).join(' · ')+' — record the actual date, time, response, and staff attribution.';
    }else if(med){
      next='Choose an allowed actual site in Medication & site; administration facts will stay grouped here for closeout.';
    }else{
      next='Medication and site choices will carry forward here. Record the actual date, time, response, and staff attribution.';
    }
    if(sub.textContent!==next)sub.textContent=next;
  }

  function syncLockedWorkspaceCopy(){
    const panel=by('panel-administer');
    if(!panel)return;
    const locked=panel.classList.contains('record-readonly');
    panel.querySelectorAll('.rc530-summary .edit').forEach(node=>{const value=locked?'view':'edit';if(node.textContent!==value)node.textContent=value;});
    const guideEdit=by('adminGuideEdit');
    if(guideEdit)guideEdit.textContent=locked?'View details':'Review / change';
    if(locked){
      text('#rc526Flow .rc526-mode b','Locked injection record');
      text('#rc526Flow .rc526-mode span','Sections remain available for review. Use a dated addendum for any correction or follow-up.');
    }else{
      text('#rc526Flow .rc526-mode b','Routine injection mode');
      text('#rc526Flow .rc526-mode span','Completed sections auto-collapse into editable receipt rows.');
    }
  }

  function refineHeadings(){
    setCardHeading('#panel-administer .card-encounter','1 · Patient & order','Identify the patient and verify the active order context.');
    setCardHeading('#panel-administer .card-medication','2 · Medication & site','Medication, prior administration, and route rules guide today’s site choice.');
    setCardHeading('#panel-administer .card-safety','3 · Safety review','Routine items are preselected; remove anything not verified and surface exceptions.');
    setCardHeading('#panel-administer .card-trace','4 · Product traceability','Capture the exact product used; open handling details only when they apply.');
    setCardHeading('#panel-administer .card-response','5 · Administration & response','Record the actual administration facts, tolerance, and any exception.');
    setCardHeading('#panel-administer .card-return','6 · Follow-up & next dose','Use the medication interval to calculate the next dose, then confirm or adjust.');
  }

  function applyWorkspace(){
    moveProgressRail();
    buildPriorContext();
    buildAdministrationCore();
    reorderInjectionCards();
    refineHeadings();
    setModuleCopy();
    smartSiteCopy();
    smartAdministrationCopy();
    syncLockedWorkspaceCopy();
  }

  let refreshTimer=0;
  function scheduleWorkspace(){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(applyWorkspace,0);
  }

  document.addEventListener('ipmg:siteconfirmed',event=>{
    const allowed=event.detail?.allowed!==false,summary=by('adminGuideSummary'),guide=by('adminGuide');
    if(!summary||!guide)return;
    summary.classList.remove('is-confirming');guide.classList.remove('is-warning');
    requestAnimationFrame(()=>{
      (allowed?summary:guide).classList.add(allowed?'is-confirming':'is-warning');
      if(event.detail?.focusAfter){
        const target=allowed?by('adminGuideEdit'):by('adminStatusText');
        if(target){if(!target.matches('button,input,select,textarea,a[href]'))target.tabIndex=-1;target.focus({preventScroll:true});}
      }
      setTimeout(()=>{summary.classList.remove('is-confirming');guide.classList.remove('is-warning');},400);
    });
  });
  document.addEventListener('click',event=>{
    if(event.target&&event.target.closest&&event.target.closest('#panel-administer'))scheduleWorkspace();
  },true);
  ['input','change'].forEach(type=>document.addEventListener(type,event=>{
    if(event.target&&event.target.closest&&event.target.closest('#panel-administer'))scheduleWorkspace();
  },true));

  function boot(){applyWorkspace();setTimeout(applyWorkspace,80);window.IPMG_RC_VERSION='RC5.45 Mature Clinical Workspace';}
  window.IPMGSmartWorkspace={refresh:applyWorkspace,smartSiteCopy,smartAdministrationCopy};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

/* Read-only compatibility bridge for the typed clinical coordinator. */
(()=>{
  const clinicalClone=value=>{try{return JSON.parse(JSON.stringify(value));}catch(error){return {};}};
  window.ipmgLegacyClinicalStateSnapshot=()=>clinicalClone({
    version:1,
    injection:{
      medicationKey:S&&S.med&&S.med.key||'',
      customMedication:S&&S.med&&S.med.key==='other'?(S.med.name||S.med.label||'Other'):'',
      dose:S&&S.dose||'',
      site:S&&S.site||'',
      route:S&&S.route||'',
      intervalKey:S&&S.intervalKey||'',
      reason:S&&S.reason||'scheduled',
      response:S&&S.resp||'',
      attestations:S&&S.attest||{},
      verifications:S&&S.flags||{},
      safetyConcerns:S&&S.guard||{},
      initiation:typeof window.ipmgInitiationProtocolSnapshot==='function'?window.ipmgInitiationProtocolSnapshot():{},
      disposition:typeof window.ipmgClinicalDispositionSnapshot==='function'?window.ipmgClinicalDispositionSnapshot():{},
      documentation:window.__IPMG_INJECTION_DOCUMENTATION_METADATA__||{}
    },
    uds:{
      reason:UDS&&UDS.reason||'routine',
      temperature:UDS&&UDS.temp||'acceptable',
      control:UDS&&UDS.control||'valid',
      results:UDS&&UDS.results||{},
      validity:UDS&&UDS.validity||'acceptable',
      medicationAlignment:UDS&&UDS.consistent||'no unexpected',
      labPlan:UDS&&UDS.lab||'provider to decide'
    },
    samples:{
      medicationKey:SAMPLE_STATE&&SAMPLE_STATE.med&&SAMPLE_STATE.med.key||''
    },
    forms:{
      requestType:FORMS&&FORMS.type||'work',
      status:FORMS&&FORMS.status||'received',
      letterType:LETTER&&LETTER.type||'dx'
    }
  });
})();
/* Write-only compatibility bridge: lets a typed presentation panel keep the
   legacy FORMS/LETTER chip state (not plain DOM field values) in sync when
   it is the authoritative UI for a workflow. Does not affect print output. */
(()=>{
  window.ipmgSetFormsChipState=(patch)=>{
    if(!patch)return;
    if(patch.requestType&&FORM_TYPES.some(x=>x.k===patch.requestType))FORMS.type=patch.requestType;
    if(patch.status&&FORM_STATUS.some(x=>x.k===patch.status))FORMS.status=patch.status;
    if(patch.letterType&&LETTER_TYPES.some(x=>x.k===patch.letterType))LETTER.type=patch.letterType;
    renderFormsTypeGrid();renderFormsStatusChips();renderLetterTypeChips();renderForms();
  };
})();
/* Write-only compatibility bridge for the UDS chip/photo state — UDS.reason,
   UDS.temp, UDS.control, UDS.results, and UDS.photoData are internal state,
   not backed by a plain DOM field value, plus the dynamically-injected
   13-panel-cup omitted-panel/readings-verified profile. Does not affect
   print output. */
(()=>{
  const RESULT_STATES=['neg','pos','invalid','nt'];
  window.ipmgSetUdsChipState=(patch)=>{
    if(!patch)return;
    if(patch.reason&&UDS_REASONS.some(x=>x.k===patch.reason))UDS.reason=patch.reason;
    if(patch.temp&&UDS_TEMP.some(x=>x.k===patch.temp))UDS.temp=patch.temp;
    if(patch.control&&UDS_CONTROL.some(x=>x.k===patch.control))UDS.control=patch.control;
    if(patch.results&&typeof patch.results==='object'){
      UDS_PANELS.forEach(panel=>{
        const state=patch.results[panel];
        if(RESULT_STATES.includes(state))UDS.results[panel]=state;
      });
    }
    if(typeof patch.photoData==='string')UDS.photoData=patch.photoData;
    const profile=window.__IPMG_RC538_UDS_PROFILE__||(window.__IPMG_RC538_UDS_PROFILE__={omitted:'',readingsVerified:false});
    if('omittedPanel' in patch)profile.omitted=UDS_PANELS.includes(patch.omittedPanel)?patch.omittedPanel:'';
    if('readingsVerified' in patch)profile.readingsVerified=Boolean(patch.readingsVerified);
    if('customPanelSetVerified' in patch)profile.customPanelSetVerified=Boolean(patch.customPanelSetVerified);
    if(typeof renderUdsReasons==='function')renderUdsReasons();
    if(typeof renderUdsTemp==='function')renderUdsTemp();
    if(typeof renderUdsControl==='function')renderUdsControl();
    if(typeof renderUdsResults==='function')renderUdsResults();
    if(typeof renderUdsNote==='function')renderUdsNote();
  };
})();
/* Write-only compatibility bridge for the Samples chip state -
   SAMPLE_STATE.med isn't backed by a plain DOM field value. The typed panel
   computes and writes its own auto-filled label/purpose/sig/titration/food/
   quantity fields directly (setLegacyFieldValue), so this only updates the
   selected-medication reference itself, not selectSampleMed()'s auto-fill
   side effects (which would clobber those already-written fields). Does not
   affect print output. */
(()=>{
  window.ipmgSetSamplesChipState=(patch)=>{
    if(!patch||!('medicationKey' in patch))return;
    const key=patch.medicationKey||'';
    SAMPLE_STATE.med=key?SAMPLE_MEDS.find(m=>m.key===key)||null:null;
    if(typeof renderSampleMedChips==='function')renderSampleMedChips();
  };
})();
/* Write-only compatibility bridge for the injection S-chip state
   (medication/dose/site/route/interval/reason/response/attestations/
   verifications/safety-triggers) and the acute-safety-screen flag — none
   of these are backed by a plain DOM field value. The initiation-protocol
   and clinical-disposition modules already expose their own write bridges
   (window.restoreInitiationProtocol / window.restoreClinicalDisposition,
   built for the records-drawer draft restore), reused here rather than
   duplicated. Does not affect print output. */
(()=>{
  const ATTEST_KEYS=['id2','rights','allergy','consent','prior','screen','hygiene'];
  const VERIFICATION_KEYS=['opioidFree','naltrexHS','suppliedNeedle','resuspend','invegaInit','oralOverlap','stabilized','paliperidoneTolerability','aripiprazoleTolerability','glutealOnly','noMassage','deepZtrack'];
  const SAFETY_KEYS=['dizzy','cardiac','nms','eps','site','opioid','liver'];
  const clone=value=>{try{return JSON.parse(JSON.stringify(value));}catch(e){return {};}};
  window.ipmgSetInjectionChipState=(patch)=>{
    if(!patch)return;
    if('medicationKey' in patch){
      const key=patch.medicationKey||'';
      const current=(S.med&&S.med.key)||'';
      const customName=key==='other'?String(patch.customMedication||'').trim():'';
      if(key!==current||(key==='other'&&customName&&S.med&&S.med.name!==customName)){
        const found=key?MEDS.find(m=>m.key===key):null;
        const entry=found&&key==='other'&&customName?{...found,name:customName,label:customName}:found;
        if(entry){
          selectMed(entry);
        }else{
          S.med=null;S.dose='';S.flags={};S.adminGuideCollapsed=false;S.needleGuideOpen=false;
          $('medHdr').classList.remove('show');$('medChipsGrp').classList.remove('hidden');
          $('medDetail').classList.add('hidden');$('medSpecWrap').classList.remove('show');$('medTip').classList.remove('show');
        }
      }
    }
    if(typeof patch.dose==='string')S.dose=patch.dose;
    if(typeof patch.site==='string')S.site=patch.site;
    if(typeof patch.route==='string')S.route=patch.route;
    if(typeof patch.intervalKey==='string')S.intervalKey=patch.intervalKey;
    if(patch.reason&&REASONS.some(x=>x.k===patch.reason))S.reason=patch.reason;
    if(patch.response&&RESP.some(x=>x.k===patch.response))S.resp=patch.response;
    if(patch.attestations&&typeof patch.attestations==='object'){
      ATTEST_KEYS.forEach(key=>{if(key in patch.attestations)S.attest[key]=Boolean(patch.attestations[key]);});
    }
    if(patch.verifications&&typeof patch.verifications==='object'){
      const flags={};
      VERIFICATION_KEYS.forEach(key=>{flags[key]=Boolean(patch.verifications[key]);});
      S.flags=flags;
    }
    if(patch.safetyConcerns&&typeof patch.safetyConcerns==='object'){
      const guard={};
      SAFETY_KEYS.forEach(key=>{guard[key]=Boolean(patch.safetyConcerns[key]);});
      S.guard=guard;
    }
    if('acuteSafetyScreenConfirmed' in patch){
      const store=window.__IPMG_RC530__||(window.__IPMG_RC530__={});
      store.safetyNone=Boolean(patch.acuteSafetyScreenConfirmed);
    }
    if('documentation' in patch){
      /* Typed panels own this small provenance object. Keep it outside old
         field values so legacy print/readiness retains its established input
         contract while draft/lock snapshots can restore it losslessly. */
      window.__IPMG_INJECTION_DOCUMENTATION_METADATA__=clone(patch.documentation||{});
    }
    renderReasons();renderMeds();renderDoses();renderIntervals();renderMedSpec();renderInjSafetyChips();renderAtt();renderResp();renderSites();renderRoutes();recalcNext();render();
    if(patch.initiation&&typeof window.restoreInitiationProtocol==='function')window.restoreInitiationProtocol(patch.initiation);
    if(patch.disposition&&typeof window.restoreClinicalDisposition==='function')window.restoreClinicalDisposition(patch.disposition);
    // restoreClinicalDisposition()/restoreInitiationProtocol() set fields
    // directly and don't dispatch input/change events, so the delegated
    // #panel-administer listener that normally calls scheduleDraft() (and
    // so refreshes the record workspace's Complete & lock button) never
    // fires for them. Refresh it explicitly.
    if(typeof window.ipmgRefreshInjectionRecordStatus==='function')window.ipmgRefreshInjectionRecordStatus();
  };
})();
/* </script> */
