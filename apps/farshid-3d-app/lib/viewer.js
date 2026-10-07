import { furnishingLayout } from './furnishing.js';
export function createViewer(container, rows, options={}) {
 const T=window.THREE;
 if(!T) throw new Error('The 3D library is unavailable.');
 const opt={width:10,height:3,cutaway:false,labels:true,grid:true,doors:true,plan:false,...options};
 const outline=rows.filter(r=>r.kind==='outline').sort((a,b)=>a.id-b.id);
 if(outline.length<3)throw new Error('The drawing does not contain a usable outline.');
 const minX=Math.min(...outline.map(r=>r.x1)),maxX=Math.max(...outline.map(r=>r.x1)),minY=Math.min(...outline.map(r=>r.y1)),maxY=Math.max(...outline.map(r=>r.y1));
 const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
 const scene=new T.Scene();scene.background=new T.Color('#f1f3ee');
 const camera=new T.OrthographicCamera(-10,10,10,-10,.01,500);
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false});
 const touchDevice=window.matchMedia('(pointer: coarse)').matches;
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,touchDevice?1.5:2));renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label',opt.plan?'Interactive top-down floor plan. Drag to pan and use plus or minus to zoom.':'Interactive 3D model. Drag to orbit, shift-drag to pan, use plus or minus to zoom.');canvas.style.cssText='display:block;width:100%;height:100%;touch-action:none';container.appendChild(canvas);
 const overlay=document.createElement('div');overlay.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';container.appendChild(overlay);
 scene.add(new T.HemisphereLight(0xffffff,0xa5b0a0,2.1));
 const light=new T.DirectionalLight(0xfffcf4,2.5);light.position.set(-14,28,12);light.castShadow=true;light.shadow.mapSize.set(touchDevice?1024:2048,touchDevice?1024:2048);light.shadow.camera.left=-35;light.shadow.camera.right=35;light.shadow.camera.top=35;light.shadow.camera.bottom=-35;light.shadow.bias=-.0004;light.shadow.normalBias=.04;scene.add(light);
 const fill=new T.DirectionalLight(0xffffff,.75);fill.position.set(15,9,-15);scene.add(fill);
 let model,grid,ground,labels=[],disposed=false,raf=0,w=1,h=1,yaw=-.62,elevation=.93,zoomLevel=1,baseSpan=30;
 const target=new T.Vector3();const listeners=[];
 const scale=()=>opt.width/(maxX-minX);
 const coord=(x,y)=>new T.Vector3((x-centerX)*scale(),0,(y-centerY)*scale());
 const addEvent=(el,type,fn,settings)=>{el.addEventListener(type,fn,settings);listeners.push(()=>el.removeEventListener(type,fn,settings));};
 function release(group){if(!group)return;group.traverse(node=>{node.geometry?.dispose();if(node.material){for(const m of Array.isArray(node.material)?node.material:[node.material])m.dispose();}});scene.remove(group);}
 function box(sx,sy,sz,x,y,z,color='#fcfcf8',edges=true){
  const mesh=new T.Mesh(new T.BoxGeometry(Math.max(.025,sx),Math.max(.025,sy),Math.max(.025,sz)),new T.MeshStandardMaterial({color,roughness:.87}));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;model.add(mesh);
  if(edges){const e=new T.LineSegments(new T.EdgesGeometry(mesh.geometry),new T.LineBasicMaterial({color:0x758074,transparent:true,opacity:opt.plan?.65:.23}));mesh.add(e);}
  return mesh;
 }
 function wall(a,b,height,color,thickness=.15,bottom=0){const delta=b.clone().sub(a),len=delta.length();const mesh=box(len,height,thickness,(a.x+b.x)/2,bottom+height/2,(a.z+b.z)/2,color);mesh.rotation.y=-Math.atan2(delta.z,delta.x);return mesh;}
 function build(){
  release(model);release(grid);release(ground);overlay.replaceChildren();labels=[];model=new T.Group();scene.add(model);
  const shape=new T.Shape();outline.forEach((r,i)=>{const p=coord(r.x1,r.y1);if(i===0)shape.moveTo(p.x,-p.z);else shape.lineTo(p.x,-p.z);});shape.closePath();
  const floor=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:false}),new T.MeshStandardMaterial({color:'#e3e7db',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.16;floor.receiveShadow=true;model.add(floor);
  const wallHeight=opt.cutaway&&!opt.plan?Math.min(.75,opt.height):opt.height;
  for(const r of rows){
   const a=coord(r.x1,r.y1),b=coord(r.x2,r.y2);
   if(r.kind==='wall'||r.kind==='marked')wall(a,b,wallHeight,r.kind==='marked'?'#b3d3de':'#fdfdfa');
   if(r.kind==='block'||r.kind==='counter'||r.kind==='sink'){
    const height=r.kind==='block'?wallHeight:r.kind==='counter'?.9:.025;
    box(Math.abs(b.x-a.x),height,Math.abs(b.z-a.z),(a.x+b.x)/2,r.kind==='sink'?.915:height/2,(a.z+b.z)/2,r.kind==='block'?'#d6dbd2':r.kind==='sink'?'#8faaa5':'#f5f5ed');
   }
   if(r.kind==='door'&&opt.doors){
    const radius=a.distanceTo(b);const vertical=Math.abs(b.z-a.z)>Math.abs(b.x-a.x);const end=vertical?a.clone().add(new T.Vector3(radius,0,0)):a.clone().add(new T.Vector3(0,0,radius));
    wall(a,end,opt.cutaway&&!opt.plan?Math.min(.6,wallHeight):Math.min(2.1,opt.height),'#e7e9df',.045);
    if(!opt.cutaway&&opt.height>2.1)wall(a,b,opt.height-2.1,'#fdfdfa',.15,2.1);
    let from=Math.atan2(b.z-a.z,b.x-a.x),to=Math.atan2(end.z-a.z,end.x-a.x);while(to-from>Math.PI)to-=Math.PI*2;while(to-from < -Math.PI)to+=Math.PI*2;
    const pts=Array.from({length:33},(_,i)=>{const angle=from+(to-from)*i/32;return new T.Vector3(a.x+Math.cos(angle)*radius,.04,a.z+Math.sin(angle)*radius);});
    const arc=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineDashedMaterial({color:0x81958a,dashSize:.07,gapSize:.05}));arc.computeLineDistances();model.add(arc);
   }
   if(r.kind==='label'&&!(opt.furnishing&&r.label==='Upper open area')){
    const el=document.createElement('div');el.className='model-label';el.textContent=r.label||'';el.style.cssText='position:absolute;left:0;top:0;white-space:nowrap;font-size:10px;font-weight:500;color:#597065;background:rgba(250,252,246,.84);border:1px solid rgba(176,190,167,.4);padding:5px 8px;border-radius:5px;box-shadow:0 2px 8px #40583205;transform:translate(-50%,-50%);';overlay.appendChild(el);a.y=.15;labels.push({el,position:a});
   }
  }
  if(opt.furnishing){
   const layout=furnishingLayout(rows,opt.width,opt.deskWidth||1.4);
   for(const desk of layout.desks){
    const {x,z,side,width,depth,id}=desk;
    const top=box(depth,.045,width,x,.735,z,'#d9c7a8');top.name='Desk '+id;
    for(const dx of [-depth/2+.07,depth/2-.07])for(const dz of [-width/2+.09,width/2-.09])box(.045,.71,.045,x+dx,.355,z+dz,'#edf0e9',false);
    const mx=x-side*.22;
    box(.035,.33,.54,mx,.995,z,'#364a45');
    box(.035,.14,.035,mx,.805,z,'#6e7d74',false);
    box(.16,.02,.23,mx,.775,z,'#6e7d74',false);
    box(.14,.018,.39,x+side*.13,.77,z,'#eff1ea',false);
    const chairX=x+side*.85;
    box(.51,.09,.53,chairX,.455,z,'#617c72');
    box(.075,.48,.5,chairX+side*.23,.69,z,'#617c72');
    box(.055,.36,.055,chairX,.225,z,'#63746a',false);
    box(.52,.05,.06,chairX,.05,z,'#63746a',false);box(.06,.05,.52,chairX,.05,z,'#63746a',false);
    const el=document.createElement('div');el.className='model-label desk-label';el.textContent='E'+String(id).padStart(2,'0');el.style.cssText='position:absolute;pointer-events:none;transform:translate(-50%,-50%);border-radius:4px;padding:3px 5px;background:#365c4ee8;color:white;font-size:10px;';overlay.appendChild(el);labels.push({el,position:new T.Vector3(x,.83,z)});
   }
   // Low central acoustic screens; proposed, not existing construction.
   for(let i=0;i<5;i++)box(.025,.32,(opt.deskWidth||1.4)-.1,layout.centerX,.92,layout.centerZ+(i-2)*((opt.deskWidth||1.4)+.05),'#afbbb0');
  }
  const size=Math.max(opt.width,(maxY-minY)*scale())*2.5;
  ground=new T.Mesh(new T.PlaneGeometry(size,size),new T.MeshStandardMaterial({color:'#f1f3ee',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.19;ground.receiveShadow=true;scene.add(ground);
  grid=new T.GridHelper(Math.ceil(size),Math.ceil(size),0xcdd5c6,0xe0e5da);grid.position.y=-.178;grid.material.transparent=true;grid.material.opacity=.5;grid.visible=opt.grid;scene.add(grid);
  fitSpan();draw();
 }
 function updateCamera(){
  const radius=60;
  if(opt.plan){camera.up.set(0,0,-1);camera.position.copy(target).add(new T.Vector3(0,radius,0));}
  else{camera.up.set(0,1,0);camera.position.copy(target).add(new T.Vector3(Math.sin(yaw)*Math.cos(elevation)*radius,Math.sin(elevation)*radius,Math.cos(yaw)*Math.cos(elevation)*radius));}
  camera.lookAt(target);camera.updateMatrixWorld();
  const span=baseSpan/zoomLevel,aspect=w/h;camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
 }
 function fitSpan(){
  updateCamera();const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
  let lowX=Infinity,highX=-Infinity,lowY=Infinity,highY=-Infinity;
  for(const r of outline){for(const y of [0,opt.height]){const p=coord(r.x1,r.y1);p.y=y;const x=p.dot(right),v=p.dot(up);lowX=Math.min(lowX,x);highX=Math.max(highX,x);lowY=Math.min(lowY,v);highY=Math.max(highY,v);}}
  baseSpan=Math.max((highX-lowX)/(w/h),highY-lowY)*1.33;
 }
 function paint(){raf=0;if(disposed)return;updateCamera();renderer.render(scene,camera);for(const item of labels){const p=item.position.clone().project(camera);item.el.style.display=opt.labels&&p.z>=-1&&p.z<=1?'block':'none';item.el.style.left=(p.x*.5+.5)*w+'px';item.el.style.top=(-p.y*.5+.5)*h+'px';}}
 function draw(){if(!disposed&&!raf)raf=requestAnimationFrame(paint);}
 function resize(){w=Math.max(container.clientWidth,1);h=Math.max(container.clientHeight,1);renderer.setSize(w,h,false);fitSpan();draw();}
 function zoom(factor){zoomLevel=Math.max(.35,Math.min(6,zoomLevel*factor));draw();}
 function rotate(delta){if(!opt.plan){yaw+=delta;draw();}}
 function reset(){yaw=-.62;elevation=.93;zoomLevel=1;target.set(0,opt.plan?0:opt.height*.25,0);fitSpan();draw();}
 function pan(dx,dy){updateCamera();const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,1);target.addScaledVector(right,-dx*baseSpan/zoomLevel/h);target.addScaledVector(up,dy*baseSpan/zoomLevel/h);draw();}
 const pointers=new Map();let gesture;
 function pointerDown(e){canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture=null;}
 function pointerMove(e){if(!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const arr=[...pointers.values()];if(arr.length===2){const mid={x:(arr[0].x+arr[1].x)/2,y:(arr[0].y+arr[1].y)/2,d:Math.hypot(arr[1].x-arr[0].x,arr[1].y-arr[0].y)};if(gesture){pan(mid.x-gesture.x,mid.y-gesture.y);if(gesture.d>0)zoom(mid.d/gesture.d);}gesture=mid;return;}gesture=null;const dx=e.clientX-old.x,dy=e.clientY-old.y;if(opt.plan||e.shiftKey||e.buttons===2)pan(dx,dy);else{yaw-=dx*.008;elevation=Math.min(1.45,Math.max(.18,elevation+dy*.006));draw();}}
 function pointerUp(e){pointers.delete(e.pointerId);gesture=null;}
 addEvent(canvas,'pointerdown',pointerDown);addEvent(canvas,'pointermove',pointerMove);addEvent(canvas,'pointerup',pointerUp);addEvent(canvas,'pointercancel',pointerUp);addEvent(canvas,'lostpointercapture',pointerUp);
 addEvent(canvas,'contextmenu',e=>e.preventDefault());addEvent(canvas,'wheel',e=>{e.preventDefault();zoom(Math.exp(-Math.max(-200,Math.min(200,e.deltaY))*.002));},{passive:false});
 addEvent(canvas,'keydown',e=>{if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))e.preventDefault();if(e.key==='+'||e.key==='=')zoom(1.15);if(e.key==='-')zoom(1/1.15);if(e.key==='Home')reset();if(e.key==='ArrowLeft')opt.plan?pan(25,0):rotate(-.15);if(e.key==='ArrowRight')opt.plan?pan(-25,0):rotate(.15);if(e.key==='ArrowUp')opt.plan?pan(0,25):(elevation=Math.min(1.45,elevation+.1),draw());if(e.key==='ArrowDown')opt.plan?pan(0,-25):(elevation=Math.max(.18,elevation-.1),draw());});
 const observer=new ResizeObserver(resize);observer.observe(container);
 w=Math.max(container.clientWidth,1);h=Math.max(container.clientHeight,1);renderer.setSize(w,h,false);build();reset();
 return {zoom,rotate,reset,setOptions(partial){Object.assign(opt,partial);if(Object.keys(partial).some(k=>['width','height','cutaway','doors','furnishing','deskWidth'].includes(k)))build();else{grid.visible=opt.grid;draw();}},dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();listeners.forEach(fn=>fn());release(model);release(grid);release(ground);light.shadow.map?.dispose();renderer.dispose();canvas.remove();overlay.remove();}};
}
