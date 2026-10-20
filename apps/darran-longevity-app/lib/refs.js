import { esc } from "@corvic/live";

const PM = "https://pubmed.ncbi.nlm.nih.gov/";
// Every PMID below was returned by a live PubMed (NCBI E-utilities) lookup while this app was built.
// key: [pmid, "Author Year \u00b7 Journal", "title"]
export const R = {
  tirz1: ["35658024", "Jastreboff 2022 \u00b7 NEJM", "Tirzepatide once weekly for the treatment of obesity (SURMOUNT-1)"],
  tirzBody: ["39996356", "Look 2025 \u00b7 Diabetes Obes Metab", "Body composition changes during weight reduction with tirzepatide in SURMOUNT-1"],
  mets: ["19805654", "Alberti 2009 \u00b7 Circulation", "Harmonizing the metabolic syndrome: joint interim statement"],
  escEas: ["31504418", "Mach 2020 \u00b7 Eur Heart J", "2019 ESC/EAS guidelines for the management of dyslipidaemias"],
  ldlCausal: ["28444290", "Ference 2017 \u00b7 Eur Heart J", "LDL cause atherosclerotic cardiovascular disease: EAS consensus panel"],
  lpa: ["36036785", "Kronenberg 2022 \u00b7 Eur Heart J", "Lipoprotein(a) in ASCVD and aortic stenosis: EAS consensus statement"],
  apob: ["33736827", "Johannesen 2021 \u00b7 JACC", "ApoB and non-HDL-C better reflect residual risk than LDL-C"],
  crf: ["30646252", "Mandsager 2018 \u00b7 JAMA Netw Open", "Cardiorespiratory fitness and long-term mortality"],
  ewgsop: ["30312372", "Cruz-Jentoft 2019 \u00b7 Age Ageing", "Sarcopenia: revised European consensus"],
  sarcOb: ["35196654", "Donini 2022 \u00b7 Obes Facts", "Sarcopenic obesity: ESPEN/EASO consensus definition"],
  dash: ["9099655", "Appel 1997 \u00b7 NEJM", "Effects of dietary patterns on blood pressure (DASH)"],
  dashNa: ["11136953", "Sacks 2001 \u00b7 NEJM", "Reduced dietary sodium and the DASH diet"],
  sprint: ["26551272", "SPRINT 2015 \u00b7 NEJM", "Intensive vs standard blood-pressure control"],
  escEsh: ["30165516", "2018 \u00b7 Eur Heart J", "2018 ESC/ESH guidelines for arterial hypertension"],
  potassium: ["32500831", "2020 \u00b7 J Am Heart Assoc", "Potassium intake and blood pressure: dose-response meta-analysis"],
  alcoholCut: ["11711507", "2001 \u00b7 Hypertension", "Effects of alcohol reduction on blood pressure: meta-analysis of RCTs"],
  alcoholHtn: ["38864208", "Cecchini 2024 \u00b7 Hypertension", "Alcohol intake and risk of hypertension: dose-response meta-analysis"],
  slowBreath: ["35601033", "2022 \u00b7 Health Sci Rep", "Device and non-device guided slow breathing to reduce BP: systematic review"],
  homeBp: ["26103131", "2015 \u00b7 J Hypertens", "Home vs ambulatory BP monitoring for white-coat and masked hypertension"],
  obHtn: ["25767285", "2015 \u00b7 Circ Res", "Obesity-induced hypertension: neurohumoral and renal mechanisms"],
  vat: ["31301983", "Neeland 2019 \u00b7 Lancet Diabetes Endocrinol", "Visceral and ectopic fat, atherosclerosis and cardiometabolic disease"],
  vatEx: ["38031812", "Chen 2024 \u00b7 Obes Rev", "Exercise types and visceral adipose tissue: network meta-analysis of 84 RCTs"],
  vatDose: ["36669870", "Recchia 2023 \u00b7 Br J Sports Med", "Dose-response of exercise and caloric restriction on visceral fat"],
  rtFat: ["34536199", "Wewege 2022 \u00b7 Sports Med", "Resistance training, body fat and visceral fat in healthy adults"],
  homa: ["3899825", "Matthews 1985 \u00b7 Diabetologia", "Homeostasis model assessment (HOMA)"],
  tgHdl: ["16054467", "McLaughlin 2005 \u00b7 Am J Cardiol", "Simple ways to identify insulin-resistant individuals (TG/HDL)"],
  dpp: ["11832527", "Knowler 2002 \u00b7 NEJM", "Diabetes Prevention Program: lifestyle vs metformin"],
  tre: ["29754952", "Sutton 2018 \u00b7 Cell Metab", "Early time-restricted feeding improves insulin sensitivity and BP"],
  protein: ["28698222", "Morton 2018 \u00b7 Br J Sports Med", "Protein supplementation and resistance-training gains in muscle"],
  rtSarcOb: ["40586735", "Chen 2025 \u00b7 J Nurs Res", "Resistance exercise in older adults with sarcopenic obesity"],
  glp1Lean: ["41877354", "Eisa 2026 \u00b7 Diabetes Obes Metab", "Lean mass changes with incretin therapy vs lifestyle: meta-analysis"],
  glp1Bone: ["41951103", "2026 \u00b7 Endocrinol Metab (Seoul)", "Beyond weight loss: skeletal considerations in obesity treatment"],
  boneRt: ["35608815", "O'Bryan 2022 \u00b7 Sports Med", "Progressive resistance training for muscle strength and BMD"],
  strength: ["35228201", "2022 \u00b7 Br J Sports Med", "Muscle-strengthening activities and mortality"],
  hiit: ["30733142", "Wen 2019 \u00b7 J Sci Med Sport", "HIIT protocols and VO2max improvement: meta-analysis"],
  rhr: ["26598376", "Zhang 2016 \u00b7 CMAJ", "Resting heart rate and mortality: meta-analysis"],
  cac: ["33947652", "2021 \u00b7 BMJ", "Coronary artery calcium score in primary prevention"],
  dietFat: ["28620111", "Sacks 2017 \u00b7 Circulation", "Dietary fats and cardiovascular disease: AHA advisory"],
  medDiet: ["30864165", "2019 \u00b7 Cochrane", "Mediterranean-style diet for CVD prevention"],
  omega3: ["35647665", "Zhang 2022 \u00b7 J Am Heart Assoc", "Omega-3 intake and blood pressure: dose-response meta-analysis"],
  magnesium: ["27402922", "Zhang 2016 \u00b7 Hypertension", "Magnesium supplementation and blood pressure"],
  sleepBp: ["30451942", "Li 2019 \u00b7 J Hum Hypertens", "Sleep duration and hypertension: dose-response meta-analysis"],
  retinaCvd: ["31015713", "2018 \u00b7 Nat Biomed Eng", "Prediction of cardiovascular risk factors from retinal fundus photographs"],
  retinalAge: ["35042683", "Zhu 2023 \u00b7 Br J Ophthalmol", "Retinal age gap as a predictive biomarker for mortality"],
  glaucBp: ["24879946", "Zhao 2014 \u00b7 Am J Ophthalmol", "Blood pressure and primary open-angle glaucoma: meta-analysis"],
  glaucLipid: ["30897618", "Wang 2019 \u00b7 Invest Ophthalmol Vis Sci", "Hyperlipidemia, blood lipids and glaucoma risk: meta-analysis"],
  biotin: ["28973622", "Li 2017 \u00b7 JAMA", "Biotin ingestion and hormone / non-hormone immunoassay performance"],
  biotinThy: ["29982406", "2018 \u00b7 Endocr Rev", "Interferences with thyroid function immunoassays"],
  biotinEta: ["42466561", "2026 \u00b7 Eur Thyroid J", "ETA guideline on immunoassay interference in thyroid function tests"],
  testoDiurnal: ["19088162", "Brambilla 2009 \u00b7 J Clin Endocrinol Metab", "Diurnal variation in serum testosterone in men"],
  testoWeight: ["23482592", "2013 \u00b7 Eur J Endocrinol", "Weight loss reverts obesity-associated hypogonadotropic hypogonadism"],
  vitD: ["38828931", "2024 \u00b7 J Clin Endocrinol Metab", "Vitamin D for the prevention of disease: Endocrine Society guideline"],
  vitDtox: ["30294301", "2018 \u00b7 Front Endocrinol", "Vitamin D toxicity: a clinical perspective"],
  hepA: ["30383742", "2018 \u00b7 MMWR", "ACIP recommendations for hepatitis A vaccine use"],
  gliomaGwas: ["19578367", "Shete 2009 \u00b7 Nat Genet", "GWAS identifies five susceptibility loci for glioma (incl. TERT region)"],
  bccGwas: ["25855136", "Stacey 2015 \u00b7 Nat Commun", "New basal cell carcinoma susceptibility loci"],
  skinPrs: ["30908599", "Roberts 2019 \u00b7 Br J Dermatol", "GWAS and polygenic risk scores for skin cancer: clinically useful yet?"],
  alcoholCancer: ["25422909", "Bagnardi 2015 \u00b7 Br J Cancer", "Alcohol consumption and site-specific cancer risk: dose-response meta-analysis"],
  aldh2: ["37795758", "2023 \u00b7 Cancer Med", "Oesophageal SCC risk and ALDH2/ADH1B polymorphisms"],
  sauna: ["25705824", "Laukkanen 2015 \u00b7 JAMA Intern Med", "Sauna bathing and fatal cardiovascular and all-cause mortality"],
  saunaRev: ["30077204", "2018 \u00b7 Mayo Clin Proc", "Cardiovascular and other health benefits of sauna bathing"],
  eecp: ["37876280", "Yin 2023 \u00b7 Scand Cardiovasc J", "Enhanced external counterpulsation and endothelial function: meta-analysis"],
  eecpCochrane: ["20166092", "Amin 2010 \u00b7 Cochrane", "Enhanced external counterpulsation for chronic angina pectoris"],
  hbot: ["33206062", "Hachmo 2020 \u00b7 Aging (Albany NY)", "Hyperbaric oxygen increases telomere length and decreases immunosenescence"],
  nmn: ["33888596", "Yoshino 2021 \u00b7 Science", "NMN increases muscle insulin sensitivity in prediabetic women"],
  nadRev: ["41655607", "2026 \u00b7 Ageing Res Rev", "NAD+ supplementation for anti-aging: PRISMA systematic review"],
  enema: ["32899046", "Son 2020 \u00b7 Medicine (Baltimore)", "Safety and effectiveness of self-administered coffee enema: systematic review of case reports"],
  ozone: ["36726625", "2022 \u00b7 Front Public Health", "Ozone treatment as integrative medicine: evidence and gap map"],
  nk: ["38383621", "2024 \u00b7 Nature", "Natural killer cell therapies"],
  handgrip: ["26558836", "2017 · J Sports Med Phys Fitness", "Isometric handgrip training and resting blood pressure in adults: meta-analysis of RCTs"],
  handgripK: ["20009767", "2010 · J Hypertens", "Isometric handgrip exercise and resting blood pressure: meta-analysis of RCTs"],
  handgripDia: ["34140663", "2021 · Hypertens Res", "Isometric handgrip training and resting systolic / diastolic pressure and heart-rate variability: meta-analysis"],
  isoHtn: ["36853479", "2023 · Curr Hypertens Rep", "Isometric resistance training to manage hypertension: systematic review and meta-analysis"],
  exBp: ["37491419", "2023 · Br J Sports Med", "Exercise training and resting blood pressure: pairwise and network meta-analysis of RCTs"],
  bfrOlder: ["30306467", "2019 · Sports Med", "Blood-flow-restriction training, muscular strength and hypertrophy in older individuals: meta-analysis"],
  bfrLow: ["21922259", "2012 · Eur J Appl Physiol", "Low-intensity blood-flow-restriction training: a meta-analysis"],
  bfrBone: ["42838305", "2026 · Adv Med Sci", "Blood-flow restriction with resistance training: bone-health biomarkers and bone mineral density (systematic review)"],
  k2Bone: ["36033779", "2022 · Front Public Health", "Vitamin K2 for postmenopausal osteoporosis: systematic review and meta-analysis"],
  kdBone: ["32219282", "2020 · Food Funct", "Vitamin K and vitamin D combined and human bone quality: meta-analysis of RCTs"],
  k2Vasc: ["37252246", "2023 · Front Nutr", "Vitamin K supplementation and vascular calcification: systematic review and meta-analysis of RCTs"],
  blueGlasses: ["34030534", "2021 · Chronobiol Int", "Evening wear of blue-blocking glasses for sleep and mood disorders: systematic review"],
  blueCochrane: ["37593770", "2023 · Cochrane", "Blue-light filtering spectacle lenses for visual performance, sleep and macular health in adults"],
  satFatCochrane: ["32428300", "2020 · Cochrane", "Reduction in saturated fat intake for cardiovascular disease"],
  ketoLdl: ["37600438", "2023 · Cureus", "Extreme hypercholesterolemia following a ketogenic diet (case report)"],
  sodiumBmj: ["32094151", "2020 · BMJ", "Dose and duration of dietary sodium reduction and blood pressure: systematic review and meta-analysis of randomised trials"],
  sodiumCirc: ["33586450", "2021 · Circulation", "Blood-pressure effects of sodium reduction: dose-response meta-analysis of experimental studies"],
  hungryRunners: ["37052052", "2023 · Eur J Transl Myol", "Low energy availability in male endurance athletes: performance and testosterone"],
  ivc: ["36882644", "2023 \u00b7 Ann Intensive Care", "Intravenous vitamin C monotherapy in critically ill patients: meta-analysis"],
  pemfBpMayo: ["31394939", "2020 \u00b7 Blood Press", "PEMF therapy, blood pressure and circulating nitric oxide: double-blind randomized study in metabolic syndrome"],
  pemfHtn: ["32401418", "2020 \u00b7 J Clin Hypertens", "PEMF therapy, vascular function and blood pressure in hypertensive individuals"],
  pemfOA: ["32251502", "2020 \u00b7 Phys Ther", "PEMF therapy for pain, stiffness, function and quality of life in osteoarthritis: meta-analysis"],
  pemfOA2: ["38610722", "2024 \u00b7 J Clin Med", "Current evidence using pulsed electromagnetic fields in osteoarthritis: systematic review"],
  pemfLbp: ["35077249", "2022 \u00b7 Clin Rehabil", "PEMF for pain and physical function in low back pain: systematic review and meta-analysis"],
  pemfOsteo: ["35864717", "2022 \u00b7 Bioelectromagnetics", "PEMF for postmenopausal osteoporosis: systematic review and meta-analysis of RCTs"],
  pemfFx: ["39387850", "2024 \u00b7 Eur J Phys Rehabil Med", "Pulsed electromagnetic fields and bone fractures: systematic review update"],
  pbmUmbrella: ["40770824", "2025 \u00b7 Syst Rev", "Photobiomodulation and multiple health outcomes: umbrella review of randomized clinical trials"],
  pbmObesity: ["40217252", "2025 \u00b7 BMC Complement Med Ther", "Photobiomodulation in obese patients: systematic review and meta-analysis of RCTs"],
  pbmCirc: ["41423522", "2025 \u00b7 Lasers Med Sci", "Low-level laser therapy for reducing body circumferences: systematic review"],
  pbmMuscle: ["38150056", "2023 \u00b7 Lasers Med Sci", "Photobiomodulation and functional performance of healthy individuals: systematic review with meta-analysis"],
  pbmKoa: ["31662383", "2019 \u00b7 BMJ Open", "Low-level laser therapy for pain and disability in knee osteoarthritis: meta-analysis of placebo-controlled RCTs"],
  pbmKoa2: ["38775202", "2024 \u00b7 Phys Ther", "Photobiomodulation for pain and disability in knee osteoarthritis: systematic review with meta-analysis"],
  pbmDose: ["22461763", "2011 \u00b7 Dose Response", "Biphasic dose response in low level light therapy: an update"],
  pbmSkin: ["24286286", "2014 \u00b7 Photomed Laser Surg", "Controlled trial of red and near-infrared light for fine lines, wrinkles, roughness and collagen density"],
  pbmEye: ["38180093", "2024 \u00b7 Ophthalmic Physiol Opt", "Red light instruments for myopia exceed safety limits"],
  aerobicDose: ["37872373", "2024 · Hypertens Res", "Aerobic exercise and blood pressure in hypertension: dose-response meta-analysis (largest drop at about 150 min/week)"],
  aerobicNma: ["37491419", "2023 · Br J Sports Med", "Exercise training and resting blood pressure: network meta-analysis of RCTs (isometric ranked highest)"],
  saunaBmc: ["30486813", "2018 · BMC Med", "Sauna bathing frequency and duration and fatal cardiovascular events: prospective cohort"],
  red670a: ["34819619", "2021 · Sci Rep", "Single 670 nm exposures and a week of improved colour-contrast sensitivity in ageing adults"],
  red670b: ["32596723", "2020 · J Gerontol A", "670 nm light and aged human visual decline (adults aged 28–72)"],
  rtVolume: ["27433992", "2017 · J Sports Sci", "Weekly resistance-training volume and muscle growth: dose-response meta-analysis"],
  cwiHyp: ["26174323", "2015 · J Physiol", "Post-exercise cold-water immersion blunts anabolic signalling and strength-training adaptations"],
  lightSleepSr: ["30670164", "2019 · Sleep Health", "Amount and timing of light and sleep outcomes: systematic review"],
  roomLight: ["21193540", "2011 · J Clin Endocrinol Metab", "Room light before bedtime suppresses melatonin onset and shortens melatonin duration"],
  caffeine6h: ["24235903", "2013 · J Clin Sleep Med", "Caffeine taken 0, 3 or 6 hours before bed and sleep disturbance"],
  ebvNpcMeta: ["39244576", "Liu 2024 \u00b7 BMC Cancer", "Serological diagnostic value of EBV-related IgA antibody panels for nasopharyngeal carcinoma: diagnostic test accuracy meta-analysis"],
  ebvSg: ["31705522", "Tay 2020 \u00b7 Int J Cancer", "EBV serology vs serum cell-free DNA as screening tools for nasopharyngeal cancer: Singapore NPC screening cohort"],
  ebvSg2: ["27143706", "Tay 2016 \u00b7 Otolaryngol Head Neck Surg", "Role of Epstein-Barr virus DNA load and serology as screening tools for nasopharyngeal carcinoma"],
  ca199Asym: ["19162573", "Kim 2009 \u00b7 Dig Liver Dis", "How do we interpret an elevated carbohydrate antigen 19-9 level in asymptomatic subjects?"],
  ceaLiver: ["38690060", "Dilek 2024 \u00b7 World J Gastrointest Surg", "Carcinoembryonic antigen in the diagnosis, treatment and follow-up of focal liver lesions"],
  gbPolyp: ["34918177", "Foley 2022 \u00b7 Eur Radiol", "Management and follow-up of gallbladder polyps: updated joint guidelines (ESGAR, EAES, EFISDS, ESGE)"],
  bosniak: ["36573917", "Couture 2023 \u00b7 J Urol", "Evolution of Bosniak IIF renal cysts and impact of the 2019 Bosniak classification"],
  hemangMgmt: ["35705835", "Aziz 2022 \u00b7 J Gastrointest Surg", "A comprehensive review of hepatic haemangioma management"],
  hemangImg: ["38541175", "Kaca\u0142a 2024 \u00b7 Medicina (Kaunas)", "Hepatic haemangioma: review of imaging and therapeutic strategies"],
  av1: ["35379649", "Liu 2022 \u00b7 BMJ Open", "Prognostic significance of first-degree atrioventricular block in a large Asian population: prospective cohort"],
  creatMuscle: ["38898741", "Groothof 2024 \u00b7 J Cachexia Sarcopenia Muscle", "Creatinine, cystatin C, muscle mass and mortality: primary and replication cohorts"],
  migraineMri: ["32585532", "Alturkustani 2020 \u00b7 Clin Neurol Neurosurg", "Significant incidental brain MRI findings in migraine headache patients: retrospective cross-sectional study"],
  biaDxa: ["31469766", "Brewer 2019 \u00b7 J Strength Cond Res", "Appendicular body composition analysis: validity of bioelectrical impedance analysis compared with DXA"],
  proteinMeta: ["35187864", "Nunes 2022 \u00b7 J Cachexia Sarcopenia Muscle", "Protein intake to support muscle mass and function in healthy adults: systematic review and meta-analysis"],
  hdlHigh: ["35583863", "Liu 2022 \u00b7 JAMA Cardiol", "HDL cholesterol levels and adverse cardiovascular outcomes in high-risk populations"]
};

// Non-PubMed primary sources for the three named biohackers (shown as source links, not literature).
export const SRC = {
  attiaZ2: ["https://peterattiamd.com/exercising-for-longevity-peter-on-zone-2-and-zone-5-training", "Peter Attia \u2014 Zone 2 and Zone 5 training"],
  attiaAma: ["https://peterattiamd.com/ama79/", "Peter Attia \u2014 AMA #79 cardiorespiratory training"],
  attiaApob: ["https://peterattiamd.com/early-and-aggressive-lowering-of-apob", "Peter Attia \u2014 early, aggressive apoB lowering"],
  attiaApob2: ["https://peterattiamd.com/measuring-cardiovascular-disease-risk-and-the-importance-of-apob-part-1/", "Peter Attia \u2014 measuring CV risk and apoB"],
  attiaEx: ["https://peterattiamd.com/exercising-for-longevity/", "Peter Attia \u2014 strength, stability, zone 2, zone 5"],
  bjProto: ["https://blueprint.bryanjohnson.com/pages/blueprint-protocol", "Bryan Johnson \u2014 Blueprint protocol"],
  bjSleep: ["https://protocol.bryanjohnson.com/sleep/", "Bryan Johnson \u2014 sleep protocol"],
  bjMorning: ["https://blueprint.bryanjohnson.com/blogs/news/morning-routine", "Bryan Johnson \u2014 morning routine (exercise and strength work)"],
  bjLaws: ["https://blueprint.bryanjohnson.com/blogs/news/the-three-power-laws-of-health", "Bryan Johnson \u2014 three power laws of health"],
  aeonLi: ["https://linkedin.com/in/pavelaeon", "Pavel Aeon \u2014 profile: BDM Method (breathe, dance, meditate)"],
  aeonPod: ["https://podcastrex.com/shows/live-beyond-the-norms/the-inner-work-that-biohacking-and-supplements-cannot-fix-pavel-aeon", "Pavel Aeon \u2014 podcast: wake up, clean up, power up, rest up"],
  aeonPress: ["https://www.clarionledger.com/press-release/story/128685/biohackers-world-los-angeles-2026-highlights-the-rise-of-experiential-wellness/", "Pavel Aeon \u2014 'System Reset Protocol' (breathwork, sound, meditation)"],
  aspreyBp: ["https://daveasprey.com/manage-your-blood-pressure/", "Dave Asprey — Biohacking your blood pressure (handgrip, breathwork, magnesium, sleep)"],
  aspreyZona: ["https://daveasprey.com/zona-mackay-rippey-853/", "Dave Asprey — Zona Plus handgrip biofeedback (ep. 853)"],
  aspreySalt: ["https://daveasprey.com/salt/", "Dave Asprey — Salt re-examined"],
  aspreyStrength: ["https://daveasprey.com/stop-lifting-weights-to-get-stronger-and-what-to-do-instead/", "Dave Asprey — Stop lifting weights to get stronger"],
  aspreyBfr: ["https://daveasprey.com/1346-sten-stray-gunderson/", "Dave Asprey — Blood-flow restriction with Dr Sten Stray-Gundersen (ep. 1346)"],
  aspreyHarlow: ["https://daveasprey.com/1402-will-harlow", "Dave Asprey — Resistance training after 50 (ep. 1402)"],
  aspreySleep: ["https://daveasprey.com/getting-serious-about-sleep/", "Dave Asprey — Getting serious about sleep"],
  aspreyBook: ["https://daveasprey.com/super-human", "Dave Asprey — Super Human (book): diet, sleep, light, exercise"],
  aspreyPemf: ["https://daveasprey.com/pemf-therapy/", "Dave Asprey \u2014 The science behind PEMF therapy (2018 article)"],
  aspreyPemfEp: ["https://daveasprey.com/1376-boncharge/", "Dave Asprey \u2014 ep. 1376: red light vs near-infrared, PEMF mats"],
  aspreyRlt: ["https://daveasprey.com/health-benefits-red-light-therapy/", "Dave Asprey \u2014 Health benefits of red light therapy"],
  aspreyLaser: ["https://daveasprey.com/laser", "Dave Asprey \u2014 Laser therapy for biohacking (630\u2013850 nm)"],
  bjRlt: ["https://protocol.bryanjohnson.com/", "Bryan Johnson \u2014 Blueprint protocol: red and near-infrared sessions, red-light cap"],
  hubFit: ["https://www.hubermanlab.com/episode/science-supported-tools-to-accelerate-your-fitness-goals", "Andrew Huberman — Science-supported tools to accelerate your fitness goals (Zone 2 minutes, resistance volume)"],
  hubFitToolkit: ["https://hubermanlab.com/fitness-toolkit-protocol-and-tools-to-optimize-physical-health/", "Andrew Huberman — Fitness toolkit (60–75 min Zone 2 jogging, HIIT)"],
  hubFoundational: ["https://hubermanlab.com/foundational-fitness-protocol", "Andrew Huberman — Foundational fitness protocol (resistance schedules A and B)"],
  hubGalpin: ["https://www.hubermanlab.com/episode/dr-andy-galpin-optimal-protocols-to-build-strength-and-grow-muscles", "Andrew Huberman × Andy Galpin — Optimal protocols to build strength and grow muscles"],
  hubFitTopic: ["https://www.hubermanlab.com/topics/fitness-and-workout-routines", "Andrew Huberman — Fitness and workout routines (protein, cold-exposure caveat)"],
  hubSleep: ["https://www.hubermanlab.com/newsletter/toolkit-for-sleep", "Andrew Huberman — Toolkit for sleep"],
  hubLightNews: ["https://www.hubermanlab.com/newsletter/using-light-for-health", "Andrew Huberman — Using light for health (morning sunlight, red light at night)"],
  hubLightEp: ["https://www.hubermanlab.com/episode/using-light-sunlight-blue-light-and-red-light-to-optimize-health", "Andrew Huberman — Using light (sunlight, blue light and red light) to optimize health"],
  hubHeat: ["https://www.hubermanlab.com/episode/the-science-and-health-benefits-of-deliberate-heat-exposure", "Andrew Huberman — The science and health benefits of deliberate heat exposure"],
  hubAttia: ["https://www.hubermanlab.com/episode/dr-peter-attia-improve-vitality-emotional-and-physical-health-and-lifespan", "Andrew Huberman × Peter Attia — episode with chapters on blood-pressure testing, LDL and ApoB"]
};

// Reference articles and practice summaries from four major academic health centres. Every link was found by web search;
// all but the Johns Hopkins pages marked `true` (blocked automated checks, HTTP 403) were fetched and confirmed to load.
// key: [url, institution, title, couldNotAutoCheck]
export const AHC = {
  mayoBp10: ["https://www.mayoclinic.org/diseases-conditions/high-blood-pressure/in-depth/high-blood-pressure/art-20046974", "Mayo Clinic", "10 ways to manage high blood pressure without medicine"],
  mayoHomeBp: ["https://www.mayoclinic.org/diseases-conditions/high-blood-pressure/in-depth/high-blood-pressure/art-20047889", "Mayo Clinic", "Get the most out of home blood pressure monitoring"],
  mayoDash: ["https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/dash-diet/art-20048456", "Mayo Clinic", "DASH diet: healthy eating to lower your blood pressure"],
  mayoStrength: ["https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/strength-training/art-20046670", "Mayo Clinic", "Strength training: get stronger, leaner, healthier"],
  mayoGlaucoma: ["https://www.mayoclinic.org/diseases-conditions/glaucoma/symptoms-causes/syc-20372839", "Mayo Clinic", "Glaucoma: symptoms and causes"],
  mayoGlaucomaDx: ["https://www.mayoclinic.org/diseases-conditions/glaucoma/diagnosis-treatment/drc-20372846", "Mayo Clinic", "Glaucoma: diagnosis and treatment"],
  mayoBiotinLab: ["https://www.mayocliniclabs.com/test-catalog/overview/606867/biotin-serum", "Mayo Clinic", "Mayo Clinic Laboratories: biotin, serum (assay interference)"],
  mayoPemfBp: ["https://mayoclinic.elsevierpure.com/en/publications/the-impact-of-pulsed-electromagnetic-field-therapy-on-blood-press/", "Mayo Clinic", "PEMF therapy and blood pressure in metabolic syndrome (Mayo research portal)"],
  ccPemf: ["https://my.clevelandclinic.org/health/treatments/pulsed-electromagnetic-field-pemf-therapy", "Cleveland Clinic", "PEMF (pulsed electromagnetic field) therapy: what it is"],
  ccRlt: ["https://my.clevelandclinic.org/health/articles/22114-red-light-therapy", "Cleveland Clinic", "Red light therapy: benefits, side effects and uses"],
  ccLed: ["https://my.clevelandclinic.org/health/treatments/22146-led-light-therapy", "Cleveland Clinic", "LED light therapy: how it works, colours, benefits and risks"],
  ccVisceral: ["https://my.clevelandclinic.org/health/diseases/24147-visceral-fat", "Cleveland Clinic", "What is visceral fat and how to get rid of it"],
  ccBelly: ["https://health.clevelandclinic.org/tips-for-losing-belly-fat", "Cleveland Clinic", "How to lose belly fat"],
  ccApob: ["https://my.clevelandclinic.org/health/diagnostics/24992-apolipoprotein-b-test", "Cleveland Clinic", "Apolipoprotein B (ApoB) test"],
  ccLpa: ["https://my.clevelandclinic.org/health/articles/25226-lipoprotein-a", "Cleveland Clinic", "Lipoprotein (a): levels and testing"],
  ccSauna: ["https://health.clevelandclinic.org/sauna-benefits", "Cleveland Clinic", "Get your sweat on: the benefits of a sauna"],
  ccBiotin: ["https://health.clevelandclinic.org/biotin-side-effects", "Cleveland Clinic", "Biotin side effects: can you take too much?"],
  ccGlaucoma: ["https://my.clevelandclinic.org/health/diseases/4212-glaucoma", "Cleveland Clinic", "Glaucoma: what it is, symptoms, causes, types and treatment"],
  jhDash: ["https://www.hopkinsmedicine.org/health/wellness-and-prevention/low-sodium-diet-and-lifestyle-changes-for-high-blood-pressure", "Johns Hopkins", "Low sodium diet and lifestyle changes for high blood pressure", true],
  jhHtn: ["https://www.hopkinsmedicine.org/health/conditions-and-diseases/high-blood-pressure-hypertension", "Johns Hopkins", "High blood pressure / hypertension", true],
  jhCalcium: ["https://www.hopkinsmedicine.org/imaging/exams-and-procedures/screenings/cardiac-ct", "Johns Hopkins", "Cardiac CT calcium score", true],
  jhHepA: ["https://www.hopkinsmedicine.org/health/conditions-and-diseases/hepatitis/hepatitis-a/hepatitis-a-and-e-treatment", "Johns Hopkins", "Hepatitis A and E treatment (includes vaccination guidance)", true],
  jhGlp1: ["https://hub.jhu.edu/magazine/2026/fall/glp-1-drugs-weight-loss-benefits-and-risks/", "Johns Hopkins", "GLP-1 drugs and the new way to lose weight (JHU Hub)", true],
  jhSarc: ["https://pure.johnshopkins.edu/en/publications/sarcopenia-in-older-adults-3/", "Johns Hopkins", "Sarcopenia in older adults (Johns Hopkins authors)"],
  jhPemf: ["https://pure.johnshopkins.edu/en/publications/evidence-based-use-of-pulsed-electromagnetic-field-therapy-in-cli", "Johns Hopkins", "Evidence-based use of PEMF therapy in clinical plastic surgery (Johns Hopkins authors)"],
  hvDash: ["https://www.health.harvard.edu/diet-and-nutrition/a-guide-to-the-dash-diet", "Harvard Health", "A guide to the DASH diet"],
  hvBp: ["https://www.health.harvard.edu/healthy-aging-and-longevity/take-back-your-blood-pressure-control", "Harvard Health", "Take back your blood pressure control!"],
  hvPotassium: ["https://www.health.harvard.edu/diseases-and-conditions/raising-potassium-intake-might-lower-high-blood-pressure", "Harvard Health", "Raising potassium intake might lower high blood pressure"],
  hvChol: ["https://www.health.harvard.edu/heart-health/11-foods-that-lower-cholesterol-4BTQX4EV", "Harvard Health", "11 foods that lower cholesterol"],
  hvLdl: ["https://www.health.harvard.edu/heart-health/how-low-should-ldl-cholesterol-go", "Harvard Health", "How low should LDL cholesterol go?"],
  hvRlt: ["https://www.health.harvard.edu/skin-and-hair-health/red-light-therapy-for-skin-care", "Harvard Health", "Red light therapy for skin care"],
  mayoHemang: ["https://www.mayoclinic.org/diseases-conditions/liver-hemangioma/symptoms-causes/syc-20354234", "Mayo Clinic", "Liver hemangioma: symptoms and causes"],
  ccHemang: ["https://my.clevelandclinic.org/health/diseases/17784-liver-hemangioma", "Cleveland Clinic", "Liver hemangioma: what it is, causes, symptoms and treatment"],
  ccGbPolyp: ["https://my.clevelandclinic.org/health/diseases/21821-gallbladder-polyps", "Cleveland Clinic", "Gallbladder polyps: what they are, symptoms and causes"],
  mayoKidneyCyst: ["https://www.mayoclinic.org/diseases-conditions/kidney-cysts/symptoms-causes/syc-20374134", "Mayo Clinic", "Kidney cysts: symptoms and causes"],
  hvLed: ["https://www.health.harvard.edu/diseases-and-conditions/led-lights-are-they-a-cure-for-your-skin-woes", "Harvard Health", "LED lights: are they a cure for your skin woes?"]
};

// ---- Relevance gate: a reference is shown only when the topic it supports exists in THIS patient's records. ----
// The library below is a catalogue of possible references (examples from other patients). Topic-specific entries carry a rule here; keys without a rule are general and always allowed.
let CTX = null;
const has = (re) => !!CTX && CTX.events.some((e) => re.test(`${e.title || ""} ${e.detail || ""}`));
const ser = (...ks) => !!CTX && ks.some((k) => (CTX.series[k] || []).length > 0);
const RULES = [
  [/^(retinaCvd|retinalAge|glaucBp|glaucLipid|mayoGlaucoma|mayoGlaucomaDx|ccGlaucoma)$/, () => !!CTX && CTX.events.some((e) => e.type === "retina")],
  [/^(biotin|biotinThy|biotinEta|ccBiotin|mayoBiotinLab)$/, () => has(/biotin/i) || (!!CTX && (CTX.series.ft4 || []).length > 0 && (CTX.series.tsh || []).length > 0 && CTX.discordantThyroid)],
  [/^(testoDiurnal|testoWeight)$/, () => ser("testosterone")],
  [/^(glp1Lean|glp1Bone|tirz1|tirzBody|jhGlp1)$/, () => has(/tirzepatide|semaglutide|mounjaro|ozempic|wegovy|liraglutide/i)],
  [/^(sauna|saunaRev|saunaBmc|ccSauna)$/, () => has(/sauna/i)],
  [/^(pemf\w*|ccPemf|mayoPemfBp|jhPemf)$/, () => has(/pemf|pulsed electromagnetic/i)],
  [/^(pbm\w*|red670\w*|ccRlt|ccLed|hvRlt|hvLed)$/, () => has(/red.?light|photobiomod|near.?infrared|light therapy/i)],
  [/^(eecp|eecpCochrane)$/, () => has(/eecp|counterpulsation/i)],
  [/^(hbot)$/, () => has(/hyperbaric|hbot/i)],
  [/^(nmn|nadRev)$/, () => has(/nad\+?|nmn/i)],
  [/^(enema)$/, () => has(/enema|colon hydrotherapy/i)],
  [/^(ozone)$/, () => has(/ozone/i)],
  [/^(nk)$/, () => has(/natural killer|\bNK\b/)],
  [/^(ivc)$/, () => has(/vitamin c|myers|glutathione/i)],
  [/^(gliomaGwas|bccGwas|skinPrs|aldh2)$/, () => !!CTX && (CTX.kinds.gene_grid || []).length > 0],
  [/^(alcoholCancer)$/, () => !!CTX && ((CTX.kinds.gene_grid || []).length > 0 || has(/alcohol/i))],
  [/^(hungryRunners)$/, () => ser("testosterone")],
  [/^(k2Bone|kdBone|k2Vasc)$/, () => ser("vitd", "dexa_tscore", "pth")],
  [/^(hepA|jhHepA)$/, () => has(/hepatitis a|hav igg/i)],
  [/^(vitD|vitDtox)$/, () => ser("vitd")],
  [/^(apob|lpa|cac|ccApob|ccLpa|jhCalcium)$/, () => ser("ldl", "chol_total", "apob", "lpa", "cac")],
  [/^(blueGlasses|blueCochrane|lightSleepSr|roomLight|caffeine6h|sleepBp)$/, () => ser("bp_sys", "bp_dia", "rhr")],
  [/^(tirz\w*)$/, () => false]
];
export function setCiteContext(st) { CTX = st; }
// Marker / topic relevance for analysis-level references: a reference about blood pressure, lipids, body fat, muscle, fitness or vitamin D is shown only when THIS person has a
// flagged marker in that area (st.flagged) or an unresolved clinician / imaging finding on that topic (st.openTopics). Without a rule here a reference is general and always allowed.
const BPm = ["bp_sys", "bp_dia"], LIPm = ["ldl", "chol_total", "nonhdl", "apob", "lpa"], FATm = ["dexa_vat", "vfa", "waist", "dexa_fat_pct", "trunk_fat_pct", "android_gynoid", "whr", "bmi"], MUSm = ["almi", "ffmi", "dexa_lean", "grip", "dexa_tscore"], FITm = ["rhr", "vo2max"];
const REFREL = {};
const rel = (keys, m, t) => keys.forEach((k) => { REFREL[k] = { m, t }; });
rel(["escEsh", "homeBp", "dash", "dashNa", "sodiumBmj", "sodiumCirc", "potassium", "alcoholCut", "alcoholHtn", "slowBreath", "sleepBp", "magnesium", "handgrip", "handgripK", "handgripDia", "isoHtn", "exBp", "aerobicDose", "aerobicNma"], BPm, ["bp"]);
rel(["obHtn"], [...BPm, ...FATm], ["bp"]);
rel(["ldlCausal", "escEas", "apob", "lpa", "cac", "dietFat", "medDiet", "satFatCochrane", "ketoLdl", "omega3"], LIPm, ["lipids"]);
rel(["vat", "vatEx", "vatDose", "rtFat"], FATm, []);
rel(["ewgsop", "sarcOb", "rtSarcOb", "protein", "proteinMeta", "rtVolume", "strength", "boneRt", "cwiHyp", "biaDxa"], MUSm, ["bodycomp"]);
rel(["crf", "hiit", "rhr"], [...FITm, ...BPm], []);
rel(["vitD", "vitDtox", "k2Bone", "kdBone", "k2Vasc"], ["vitd"], ["vitd"]);
rel(["mayoBp10", "mayoHomeBp", "mayoDash", "hvDash", "hvBp", "hvPotassium", "jhDash", "jhHtn"], BPm, ["bp"]);
rel(["ccApob", "ccLpa", "jhCalcium", "hvLdl", "hvChol"], LIPm, ["lipids"]);
rel(["ccVisceral", "ccBelly"], FATm, []);
rel(["mayoStrength", "jhSarc"], MUSm, ["bodycomp"]);
function relOk(k) {
  const r = REFREL[k];
  if (!r || !CTX) return true;
  if (r.m && CTX.flagged && r.m.some((x) => CTX.flagged.has(x))) return true;
  if (r.t && CTX.openTopics && r.t.some((t) => CTX.openTopics.has(t))) return true;
  return false;
}
let PAGEMODE = false;
export function ruleOk(k) {
  for (const [re, f] of RULES) if (re.test(k)) { try { if (!f()) return false; } catch (_) { /* keep */ } break; }
  return true;
}
/** A reference is shown only if its topic exists in THIS person's records (ruleOk) and, for marker-specific references, this person has a flagged marker or an open clinician/imaging finding in that area (relOk). */
export function citeOk(k) { return ruleOk(k) && (PAGEMODE || relOk(k)); }

/** Chips for academic-health-centre articles (Mayo Clinic, Cleveland Clinic, Johns Hopkins, Harvard Health). */
export function ahc(...keys) {
  const out = keys.filter((k) => AHC[k] && citeOk(k)).map((k) => { const [u, inst, t, un] = AHC[k]; return `<a class="cite" href="${u}" target="_blank" rel="noopener" title="${esc(t)}${un ? " (blocked automated link checks)" : ""}">${esc(inst)}<i>${esc(t.length > 36 ? t.slice(0, 35) + "\u2026" : t)}</i></a>`; });
  return out.length ? `<span class="cites ahc">${out.join("")}</span>` : "";
}

export const pmUrl = (k) => PM + R[k][0] + "/";

/** Inline citation chips that link to the live PubMed record. */
export function cite(...keys) {
  const out = keys.filter((k) => R[k] && citeOk(k)).map((k) => `<a class="cite" href="${PM}${R[k][0]}/" target="_blank" rel="noopener" title="${esc(R[k][2])} \u2014 PMID ${R[k][0]}">${esc(R[k][1].split(" \u00b7 ")[0])}<i>PMID ${R[k][0]}</i></a>`);
  return out.length ? `<span class="cites">${out.join("")}</span>` : "";
}
/** Chips for a reference a page draws next to a chart it shows: topic relevance applies, marker-flag relevance does not. */
export function citePage(...keys) { PAGEMODE = true; try { return cite(...keys); } finally { PAGEMODE = false; } }
export function src(...keys) {
  return `<span class="cites src">${keys.filter((k) => SRC[k] && citeOk(k)).map((k) => `<a class="cite" href="${SRC[k][0]}" target="_blank" rel="noopener" title="${esc(SRC[k][1])}">${esc(SRC[k][1].split(" \u2014 ")[0])}<i>${esc(SRC[k][1].split(" \u2014 ")[1] || "")}</i></a>`).join("")}</span>`;
}
