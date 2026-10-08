import { createViewer } from './viewer.js';
import { esc, navHtml, loadProject } from './projects.js';
import { furnishingLayout } from './furnishing.js';
const furnishingState={deskWidth:1.4,cutaway:true};
let library;
const state = {width:10,height:3,cutaway:false,labels:true,grid:true,doors:true};
let stateProject='';
export function loadThree(){
 if(window.THREE) return Promise.resolve();
 if(library) return library;
 library = new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/0.158.0/three.min.js';
  script.onload=()=>window.THREE?resolve():reject(new Error('The 3D library did not initialize.'));
  script.onerror=()=>{script.remove();reject(new Error('The 3D library could not load. Check your connection and try again.'));};
  document.head.appendChild(script);
 }).catch(error=>{library=null;throw error;});
 return library;
}
const icon = '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="M13 2 24 8v11l-11 6L2 19V8L13 2Z M2 8l11 6 11-6 M13 14v11 M7.5 5 19 11v7" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
export async function renderStudio(ctx, plan, furnishing=false){
 const root=ctx.content;
 let project;
 try{project=await loadProject(ctx,ctx.route.params.id);}catch(error){
  if(ctx.signal.aborted)return;
  root.innerHTML='<div class="studio"><p class="proj-note" role="alert">'+esc(error.message)+' <a href="home">Back to projects</a></p></div>';ctx.reportError(error);return;
 }
 if(ctx.signal.aborted)return;
 if(stateProject!==project.id){stateProject=project.id;state.width=project.width;state.height=project.height;state.cutaway=false;furnishingState.deskWidth=1.4;furnishingState.cutaway=true;}
 root.innerHTML=`<div class="studio">
 <header class="masthead"><div class="identity"><span class="brand-mark">${icon}</span><div><span class="eyebrow">${esc(project.eyebrow)}</span><h1>${esc(project.name)}<span class="title-dot">.</span></h1></div></div>${navHtml(project, plan?'plan':furnishing?'furnishing':'home')}<div class="concept"><span></span>Concept model</div></header>
 <div class="notice"><span class="notice-icon">i</span><p><strong>Proportions from the drawing. Dimensions are assumed.</strong> The uploaded plan has no scale or height annotations. This model is for spatial exploration, not construction.</p></div>
 ${furnishing?'<div class="furnishing-banner"><strong>10 engineers · 10 workstations</strong><span>Proposed arrangement · five facing pairs in the upper open area</span></div>':''}
 <main class="workspace ${plan?'plan-workspace':''} ${furnishing?'furnished-workspace':''}">
 <aside class="settings"><details class="settings-disclosure" open><summary class="settings-summary">Model controls <span>Dimensions & display</span></summary><div class="settings-content"><section class="section intro"><span class="eyebrow">${plan?'02 / PLAN STUDY':'01 / VOLUME STUDY'}</span><h2>${plan?'Read the layout':'Explore the space'}</h2><p>${plan?'Compare the traced footprint with the original schematic.':'An open-roof architectural model, traced from your uploaded schematic.'}</p></section>
 ${furnishing?'<section class="section furnishing-brief"><span class="eyebrow">03 / FURNISHING PROPOSAL</span><h2>A bench for your team</h2><p>Ten individual desks, task chairs and monitors. The lower suite stays unfurnished.</p><label for="desk-size">Desk width</label><select id="desk-size" disabled><option value="1.2">Compact · 1.2 m</option><option value="1.4">Standard · 1.4 m</option><option value="1.6">Generous · 1.6 m</option></select><p>Fixed 0.70 m depth · 0.735 m desktop center height. Furniture stays full-size when the suite scale changes.</p><div id="layout-fit" class="layout-fit" role="status">Checking assumed layout…</div><details class="furniture-schedule"><summary>Furniture schedule</summary><dl><dt>Individual desks</dt><dd>10</dd><dt>Task chairs</dt><dd>10</dd><dt>Monitor / keyboard sets</dt><dd>10</dd><dt>Central desk screens</dt><dd>5</dd></dl><p>Design proposal only; no products selected or costs estimated. Verify real room measurements, door routes, accessibility, power and data before purchase.</p></details></section>':''}
 <fieldset class="section model-controls" disabled><legend>Model assumptions</legend><label class="slider-label" for="model-width">Overall width <output id="width-value">10.0 m</output></label><input id="model-width" type="range" min="${Math.min(5,project.width)}" max="${Math.max(20,Math.ceil(project.width*2))}" step="0.5" value="${state.width}"><p class="help">Scales the complete layout proportionally. No width is specified in the source.</p><label class="slider-label" for="model-height">Wall height <output id="height-value">3.0 m</output></label><input id="model-height" type="range" min="2.4" max="${Math.max(4.5,project.height)}" step="0.1" value="${state.height}"><p class="help">An illustrative height, not a measurement.</p><div class="envelope"><span>Assumed model envelope</span><strong id="envelope">—</strong></div></fieldset>
 <fieldset class="section model-controls" disabled><legend>Display</legend>${!plan?'<label class="toggle-row"><span>Cutaway walls<small>Lower walls to reveal the interior</small></span><input type="checkbox" id="cutaway" '+((furnishing?furnishingState.cutaway:state.cutaway)?'checked':'')+'></label>':''}<label class="toggle-row"><span>Area labels<small>Descriptive, not source room names</small></span><input id="labels" type="checkbox" ${state.labels?'checked':''}></label><label class="toggle-row"><span>Door swings</span><input id="doors" type="checkbox" ${state.doors?'checked':''}></label><label class="toggle-row"><span>Reference grid</span><input id="grid" type="checkbox" ${state.grid?'checked':''}></label></fieldset>
 <section class="section legend"><span class="eyebrow">MODEL KEY</span><div><i class="swatch wall"></i>Traced walls & partitions</div><div><i class="swatch marked"></i>Blue marks · meaning unspecified</div><div><i class="swatch block"></i>Heavy blocks · role unspecified</div></section>
 <section class="section notes"><details><summary>What is assumed?</summary><p>All physical dimensions are illustrative: overall width ${project.width} m and wall height ${project.height} m initially, wall thickness 0.15 m, door height 2.1 m, and counter height 0.9 m.</p><p>Wall positions, recesses, door swings, blue segments, heavy blocks, and the sink symbol were manually traced from the single drawing. The traced centerlines and openings are approximate.</p><p>No window, material, structural, or ceiling specifications are given. Blue marks are not classified as glazing. Heavy blocks are shown at wall height for illustration only. Area names are descriptive interpretations.</p><p>${project.sample?'Changing controls affects this session only. The source is a one-time reconstruction of Exhibit A suite 530.pdf; it does not auto-update from later uploads.':'Changing controls affects this session only. Saved width and height live in this project\'s Setup; edit the trace there to change the geometry.'}</p></details></section>
 </div></details></aside>
 <section class="model-panel" aria-label="${plan?'Floor plan':'3D model'} viewer"><div class="panel-heading"><div><span class="view-badge">${plan?'ORTHOGRAPHIC / TOP':'AXONOMETRIC / 3D'}</span><span class="panel-caption">${plan?'Traced floor plan':furnishing?'10-engineer furniture proposal':'White architectural model'}</span></div><span class="roof-note">${plan?'Drawing top ↑ · not verified north':'Roof omitted for visibility'}</span></div><button class="touch-interact" type="button" aria-pressed="false">Interact with model</button><div class="viewport" id="viewport"><div class="viewer-status" role="status">Preparing your spatial model…</div></div><div class="view-toolbar" aria-label="Camera controls" hidden><button type="button" id="zoom-out" aria-label="Zoom out" title="Zoom out">−</button><button type="button" id="zoom-in" aria-label="Zoom in" title="Zoom in">+</button><span class="toolbar-divider"></span>${!plan?'<button type="button" id="rotate" title="Rotate 45 degrees" aria-label="Rotate 45 degrees">↻</button>':''}<button type="button" id="reset" class="fit-button">Fit view</button></div><div class="interaction-hint"><span class="mouse-hint">${plan?'Drag to pan · Scroll to zoom':'Drag to orbit · Shift-drag to pan · Scroll to zoom'}</span><span class="touch-hint">Tap Interact to ${plan?'pan':'rotate'} · Pinch to zoom</span></div></section>
 ${plan&&project.planUrl?'<aside class="source-panel"><span class="eyebrow">SOURCE / 01</span><h2>Original schematic</h2><p>'+esc(project.sourceName)+'</p><button class="source-preview" type="button" aria-label="Enlarge original schematic"><img src="'+esc(project.planUrl)+'" alt="Original suite floor plan with an elongated stepped perimeter, interior partitions, four door swings, a sink, and two blue-marked segments."><span>Enlarge drawing ↗</span></button><p class="source-note">Single-page drawing. No dimensions, scale, legend, or ceiling height supplied.</p><div class="evidence-note"><strong>Read together</strong><p>The model preserves the outline and relative placement of features. The source remains the reference for unlabelled symbols.</p></div></aside>':''}
 </main>
 <footer class="studio-footer"><span><span class="status-dot"></span>${esc(project.footer)}</span><span>Approximate geometry · Unverified scale · Not for construction</span></footer>
 <dialog class="source-dialog"><div class="dialog-head"><strong>Exhibit A · Original schematic</strong><div class="dialog-actions"><button type="button" class="magnify-source" aria-pressed="false">Magnify</button><button type="button" class="close-source" aria-label="Close original schematic">Close ×</button></div></div><div class="source-scroll"><img src="${esc(project.planUrl)}" alt="Full original schematic"></div></dialog>
 </div>`;
 const q=s=>root.querySelector(s), on=(el,type,fn)=>el.addEventListener(type,fn,{signal:ctx.signal});
 const dialog=q('.source-dialog');
 const narrow=window.matchMedia('(max-width: 760px)'), touch=window.matchMedia('(pointer: coarse)');
 const disclosure=q('.settings-disclosure'), panel=q('.model-panel'), interact=q('.touch-interact');
 disclosure.open=!narrow.matches;
 on(narrow,'change',e=>{disclosure.open=!e.matches;});
 function setInteraction(active){panel.classList.toggle('is-interacting',active);interact.setAttribute('aria-pressed',String(active));interact.textContent=active?'Done · scroll page':'Interact with model';q('.touch-hint').textContent=active?(plan?'Drag to pan · Pinch to zoom':'Drag to rotate · Two fingers to pan / zoom'):`Tap Interact to ${plan?'pan':'rotate'} · Pinch to zoom`;}
 function setTouch(){panel.classList.toggle('touch-device',touch.matches);setInteraction(false);}
 setTouch();on(touch,'change',setTouch);on(interact,'click',()=>setInteraction(!panel.classList.contains('is-interacting')));
 on(q('.magnify-source'),'click',e=>{const enlarged=q('.source-scroll').classList.toggle('magnified');e.currentTarget.textContent=enlarged?'Fit drawing':'Magnify';e.currentTarget.setAttribute('aria-pressed',String(enlarged));});
 if(plan&&q('.source-preview')){q('.dialog-head strong').textContent=project.sourceName+' \u00b7 Original';on(q('.source-preview'),'click',()=>dialog.showModal());on(q('.close-source'),'click',()=>dialog.close());on(dialog,'click',e=>{if(e.target===dialog)dialog.close();});}
 let viewer;
 try{
  const rows=project.rows;
  await loadThree();
  if(ctx.signal.aborted)return;
  if(!project.traced)throw new Error('This project has no traced floor plan yet. Open Setup to upload a plan image and trace its outline.');
  q('.viewer-status').remove();
  viewer=createViewer(q('#viewport'),rows,{...state,plan,furnishing,deskWidth:furnishingState.deskWidth,cutaway:furnishing?furnishingState.cutaway:state.cutaway});
  const updateFit=()=>{if(!furnishing)return;const layout=furnishingLayout(rows,state.width,furnishingState.deskWidth);const el=q('#layout-fit');el.classList.toggle('fit-warning',!layout.meetsTargets);el.replaceChildren();const title=document.createElement('strong');title.textContent=layout.meetsTargets?'Within illustrative spacing targets':'Spacing targets not met at this scale';const text=document.createElement('p');text.textContent=`Approximate side space behind chair zones: ${layout.sideClearance.toFixed(2)} m. End space: ${layout.endClearance.toFixed(2)} m. Design targets: 1.20 m sides / 1.00 m ends. These are rectangular model checks, not verified routes or code compliance.`;el.append(title,text);};
  if(furnishing){q('#desk-size').value=String(furnishingState.deskWidth);q('#desk-size').disabled=false;on(q('#desk-size'),'change',e=>{furnishingState.deskWidth=Number(e.target.value);viewer.setOptions({deskWidth:furnishingState.deskWidth});updateFit();});updateFit();}
  root.querySelectorAll('.model-controls').forEach(el=>el.disabled=false);
  q('.view-toolbar').hidden=false;
  const outline=rows.filter(r=>r.kind==='outline');
  const ratio=(Math.max(...outline.map(r=>r.y1))-Math.min(...outline.map(r=>r.y1)))/(Math.max(...outline.map(r=>r.x1))-Math.min(...outline.map(r=>r.x1)));
  const showValues=()=>{q('#width-value').textContent=state.width.toFixed(1)+' m';q('#height-value').textContent=state.height.toFixed(1)+' m';q('#envelope').textContent=state.width.toFixed(1)+' × '+(state.width*ratio).toFixed(1)+' m';};
  showValues();
  for(const [id,key] of [['model-width','width'],['model-height','height']])on(q('#'+id),'input',e=>{state[key]=Number(e.target.value);showValues();viewer.setOptions({[key]:state[key]});updateFit();});
  for(const key of ['cutaway','labels','doors','grid'])if(q('#'+key))on(q('#'+key),'change',e=>{const value=e.target.checked;if(furnishing&&key==='cutaway')furnishingState.cutaway=value;else state[key]=value;viewer.setOptions({[key]:value});});
  on(q('#zoom-in'),'click',()=>viewer.zoom(1.2));on(q('#zoom-out'),'click',()=>viewer.zoom(1/1.2));
  on(q('#reset'),'click',()=>viewer.reset());if(!plan)on(q('#rotate'),'click',()=>viewer.rotate(Math.PI/4));
 }catch(error){
  if(ctx.signal.aborted)return;
  const status=document.createElement('div');status.className='viewer-status error';status.setAttribute('role','alert');status.textContent=error.message;
  q('#viewport').replaceChildren(status);ctx.reportError(error);
 }
 return ()=>{viewer?.dispose();dialog.close();};
}
