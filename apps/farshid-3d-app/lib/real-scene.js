import { furnishingLayout } from './furnishing.js';
import { createWalkControls } from './walk-controls.js';

// Photo-guided finishes; positions and dimensions remain an explicit concept.
export function createRealScene(host, rows, options={}) {
 const T=window.THREE;
 if(!T)throw new Error('The 3D library could not be loaded.');
 const opts={lights:true,blinds:true,furniture:true,...options};
 const outline=rows.filter(r=>r.kind==='outline').sort((a,b)=>a.id-b.id);
 const minX=Math.min(...outline.map(r=>r.x1)),maxX=Math.max(...outline.map(r=>r.x1));
 const minZ=Math.min(...outline.map(r=>r.y1)),maxZ=Math.max(...outline.map(r=>r.y1));
 const scale=10/(maxX-minX),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,H=3;
 const point=(x,z)=>new T.Vector3((x-cx)*scale,0,(z-cz)*scale);
 const scene=new T.Scene();scene.background=new T.Color('#dfe7e9');
 const camera=new T.PerspectiveCamera(64,1,.035,150);
 const coarse=matchMedia('(pointer:coarse)').matches;
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
 const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','Walkable photo-guided office. W A S D or arrow keys to move, Q E to turn, drag to look, Escape to pause, Home to reset.');canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none';host.appendChild(canvas);
 const textures=[],geometries=new Set(),materials=new Set(),listeners=[];
 const group=new T.Group();scene.add(group);const furniture=new T.Group(),ceiling=new T.Group(),blinds=new T.Group(),lamps=new T.Group();group.add(furniture,ceiling,blinds,lamps);
 let disposed=false,raf=0,current='workspace',yaw=0,pitch=0,fov=64,walker;
 const on=(el,type,fn,options)=>{el.addEventListener(type,fn,options);listeners.push(()=>el.removeEventListener(type,fn,options));};
 let seed=8121;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
 function texture(kind){
  const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');
  if(kind==='carpet'){
   ctx.fillStyle='#777773';ctx.fillRect(0,0,512,512);
   for(let x=0;x<512;x++){const v=89+Math.floor(random()*54);ctx.strokeStyle=`rgb(${v},${v+2},${v})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}
   for(let i=0;i<30000;i++){const v=90+Math.floor(random()*76);ctx.fillStyle=`rgba(${v},${v},${v},.24)`;ctx.fillRect(random()*512,random()*512,1,2+random()*6);}
   ctx.fillStyle='#363a3815';ctx.fillRect(0,0,2,512);ctx.fillRect(0,0,512,2);
  }else if(kind==='ceiling'){
   ctx.fillStyle='#eeeeea';ctx.fillRect(0,0,512,512);
   for(let i=0;i<5000;i++){ctx.fillStyle=`rgba(87,87,75,${random()*.06})`;ctx.fillRect(random()*512,random()*512,1,1);}
   ctx.fillStyle='#a8aba6';ctx.fillRect(0,0,3,512);ctx.fillRect(0,0,512,3);ctx.fillRect(0,256,512,3);
  }else if(kind==='wood'){
   ctx.fillStyle='#a78662';ctx.fillRect(0,0,512,512);
   for(let i=0;i<1200;i++){const x=random()*512;ctx.strokeStyle=`rgba(75,40,19,${random()*.2})`;ctx.lineWidth=.3+random();ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+10,130,x-10,360,x+random()*10,512);ctx.stroke();}
  }else if(kind==='mesh'){
   ctx.fillStyle='#777f7a';ctx.fillRect(0,0,512,512);ctx.fillStyle='#303b36';for(let x=0;x<512;x+=8)for(let y=0;y<512;y+=8)ctx.fillRect(x,y,5,5);
  }else if(kind==='shadow'){
   const g=ctx.createRadialGradient(256,256,15,256,256,256);g.addColorStop(0,'rgba(0,0,0,.3)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,512,512);
  }
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);textures.push(map);return map;
 }
 const carpetMap=texture('carpet');carpetMap.repeat.set(1.8,1.8);
 const ceilingMap=texture('ceiling');ceilingMap.repeat.set(1/1.2,1/1.2);
 const woodMap=texture('wood'),meshMap=texture('mesh');meshMap.repeat.set(2,2);
 const shadowMap=texture('shadow');
 function mat(color,roughness=.7,extra={}){const m=new T.MeshStandardMaterial({color,roughness,envMapIntensity:.28,...extra});materials.add(m);return m;}
 const plaster=mat('#e6e2d9',.9),black=mat('#202824',.36,{metalness:.3}),white=mat('#e8e8df',.42),metal=mat('#bac3c3',.26,{metalness:.88}),carpet=mat('#a5a59b',.98,{map:carpetMap,bumpMap:carpetMap,bumpScale:.008}),ceilingMat=mat('#f4f2e8',.96,{map:ceilingMap,side:T.DoubleSide}),wood=mat('#d7c4a8',.47,{map:woodMap}),leather=mat('#222b27',.66),seat=mat('#6b7670',.9,{map:meshMap}),quartz=mat('#4b514e',.35),screen=mat('#121c22',.22,{metalness:.15,emissive:'#223343',emissiveIntensity:.11});
 const glass=new T.MeshPhysicalMaterial({color:'#c1d9d7',roughness:.08,metalness:.05,transparent:true,opacity:.085,envMapIntensity:.25,depthWrite:false,side:T.DoubleSide,clearcoat:1});materials.add(glass);
 function mesh(geo,material,parent=group){geometries.add(geo);const obj=new T.Mesh(geo,material);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;}
 function box(w,h,d,x,y,z,material,parent=group){const o=mesh(new T.BoxGeometry(w,h,d),material,parent);o.position.set(x,y,z);return o;}
 function round(w,h,d,r,x,y,z,material,parent=furniture){
  const s=new T.Shape();r=Math.min(r,w/2,h/2);s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:2,steps:1,curveSegments:5});g.translate(0,0,-d/2);const o=mesh(g,material,parent);o.position.set(x,y,z);return o;
 }
 function cylinder(r1,r2,h,x,y,z,material,parent=furniture){const o=mesh(new T.CylinderGeometry(r1,r2,h,16),material,parent);o.position.set(x,y,z);return o;}
 function rod(a,b,r,material,parent=furniture){const d=b.clone().sub(a);const o=mesh(new T.CylinderGeometry(r,r,d.length(),10),material,parent);o.position.copy(a.clone().add(b).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;}
 function wall(a,b,height,material=plaster,thick=.15,bottom=0,parent=group){const d=b.clone().sub(a);const o=box(d.length(),height,thick,(a.x+b.x)/2,bottom+height/2,(a.z+b.z)/2,material,parent);o.rotation.y=-Math.atan2(d.z,d.x);return o;}
 function shade(x,z,w,d){const m=new T.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,color:0x111411,opacity:.65});materials.add(m);const o=mesh(new T.PlaneGeometry(w,d),m,furniture);o.rotation.x=-Math.PI/2;o.position.set(x,.008,z);o.castShadow=false;}
 const floorShape=new T.Shape();outline.forEach((r,i)=>{const p=point(r.x1,r.y1);if(i===0)floorShape.moveTo(p.x,-p.z);else floorShape.lineTo(p.x,-p.z);});floorShape.closePath();
 const floor=mesh(new T.ShapeGeometry(floorShape),carpet);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
 const roof=mesh(new T.ShapeGeometry(floorShape),ceilingMat,ceiling);roof.rotation.x=-Math.PI/2;roof.position.y=H;roof.castShadow=false;
 function glazing(a,b,exterior=false){
  wall(a,b,H,glass,.025);wall(a,b,.06,black,.07,0);wall(a,b,.06,black,.07,H-.06);
  const length=a.distanceTo(b),n=Math.max(1,Math.round(length/1.2));
  for(let i=0;i<=n;i++){const p=a.clone().lerp(b,i/n);box(.055,H,.055,p.x,H/2,p.z,black);}
  if(exterior){
   const count=Math.ceil(length/.13),d=b.clone().sub(a).normalize();
   for(let i=0;i<count;i++){const p=a.clone().lerp(b,(i+.5)/count);const slat=box(.115,H-.24,.008,p.x,H/2,p.z,white,blinds);slat.rotation.y=-Math.atan2(d.z,d.x)+.62;slat.castShadow=false;}
   // Neutral daylight outside; no invented city/photo panorama.
   const sky=mat('#c1d7df',1,{emissive:'#b7d1de',emissiveIntensity:.42,side:T.DoubleSide});const backdrop=wall(a,b,H+.8,sky,.01,-.2);backdrop.castShadow=false;
   const normal=new T.Vector3(-d.z,0,d.x);backdrop.position.addScaledVector(normal,-.22);
  }
 }
 for(const r of rows){
  const a=point(r.x1,r.y1),b=point(r.x2,r.y2);
  if(r.kind==='wall'||r.kind==='marked'){
   if(r.label==='Upper boundary')glazing(a,b,true);
   else if(r.label==='Right boundary'){
    const partition=rows.find(s=>s.label==='Upper partition');const split=point(r.x1,partition?partition.y1:r.y1+650);glazing(a,split,true);wall(split,b,H);
   }else if(r.kind==='marked'||['Upper partition','Lower partition','Lower enclosure wall'].includes(r.label))glazing(a,b,false);
   else{wall(a,b,H);wall(a,b,.09,black,.165);}
  }
  if(r.kind==='block')box(Math.abs(b.x-a.x),H,Math.abs(b.z-a.z),(a.x+b.x)/2,H/2,(a.z+b.z)/2,plaster);
  if(r.kind==='door'){
   const radius=a.distanceTo(b),vertical=Math.abs(b.z-a.z)>Math.abs(b.x-a.x);const end=vertical?a.clone().add(new T.Vector3(radius,0,0)):a.clone().add(new T.Vector3(0,0,radius));
   wall(a,end,2.2,glass,.028);wall(a,end,.055,black,.05,2.15);wall(a,end,.055,black,.05,0);box(.05,2.2,.05,a.x,1.1,a.z,black);box(.05,2.2,.05,end.x,1.1,end.z,black);
   const handle=a.clone().lerp(end,.8);cylinder(.018,.018,.3,handle.x,1.0,handle.z+.05,metal,group);if(H>2.2)wall(a,b,H-2.2,plaster,.15,2.2);
  }
 }
 const layout=furnishingLayout(rows,10,1.4);
 function deskStation(desk){
  const {x,z,side,width,depth}=desk;
  const top=round(depth,.04,width,.018,x,.745,z,white);top.name='Proposed workstation '+desk.id;
  for(const dz of [-width/2+.2,width/2-.2]){box(.085,.65,.085,x,.385,z+dz,white,furniture);round(.65,.05,.08,.02,x,.055,z+dz,white);}
  const monitorX=x-side*.18;
  round(.035,.34,.59,.018,monitorX,1.08,z,black);box(.004,.30,.55,monitorX+side*.021,1.08,z,screen,furniture);
  rod(new T.Vector3(monitorX,.775,z),new T.Vector3(monitorX,1.04,z),.022,metal);round(.20,.018,.22,.01,monitorX,.777,z,metal);
  box(.14,.016,.38,x+side*.18,.778,z,black,furniture);
  for(let i=0;i<12;i++)box(.095,.002,.002,x+side*.18,.787,z-.16+i*.028,mat('#636c6a',.6),furniture);
  const mouse=mesh(new T.SphereGeometry(.028,12,8),black,furniture);mouse.scale.set(1,.35,1.6);mouse.position.set(x+side*.17,.79,z+.3);
  cylinder(.035,.029,.085,x+side*.05,.808,z-width*.36,white);
  const chairX=x+side*.85;
  round(.49,.08,.49,.035,chairX,.45,z,seat);
  const back=round(.04,.52,.49,.065,chairX+side*.24,.72,z,seat);back.rotation.z=side*.07;
  for(const dz of [-.27,.27]){box(.3,.035,.045,chairX,.65,z+dz,black,furniture);rod(new T.Vector3(chairX,.47,z+dz),new T.Vector3(chairX,.64,z+dz),.015,metal);}
  cylinder(.027,.035,.34,chairX,.24,z,metal);
  for(let i=0;i<5;i++){const t=i*Math.PI*2/5,ex=chairX+Math.cos(t)*.31,ez=z+Math.sin(t)*.31;rod(new T.Vector3(chairX,.12,z),new T.Vector3(ex,.075,ez),.021,metal);const wheel=cylinder(.035,.035,.048,ex,.044,ez,black);wheel.rotation.z=Math.PI/2;}
  shade(chairX,z,.95,.95);shade(x,z,.9,1.55);
 }
 layout.desks.forEach(deskStation);
 // Photo-inspired shared table and mobile whiteboard in the lower open zone.
 const lower=point(866,1530);
 round(2.15,.055,1.05,.025,lower.x,.74,lower.z,wood);
 for(const dx of [-.88,.88])for(const dz of [-.39,.39])box(.065,.70,.065,lower.x+dx,.365,lower.z+dz,black,furniture);
 for(const dz of [-.88,.88])for(const dx of [-.64,.64]){
  round(.5,.10,.49,.04,lower.x+dx,.46,lower.z+dz,mat('#c2c2b7',.94));round(.5,.48,.055,.07,lower.x+dx,.72,lower.z+dz+(dz>0?.23:-.23),white);
  for(const lx of [-.18,.18])for(const lz of [-.18,.18])rod(new T.Vector3(lower.x+dx+lx,.43,lower.z+dz+lz),new T.Vector3(lower.x+dx+lx*1.2,.035,lower.z+dz+lz*1.2),.016,black);
 }
 const board=point(1038,1386);box(1.35,.88,.04,board.x,1.36,board.z,white,furniture);for(const dx of [-.58,.58]){box(.03,1.78,.03,board.x+dx,.9,board.z,metal,furniture);box(.06,.04,.55,board.x+dx,.045,board.z,metal,furniture);}box(1.40,.025,.08,board.x,.9,board.z,metal,furniture);
 const counter=rows.find(r=>r.kind==='counter');
 if(counter){
  const a=point(counter.x1,counter.y1),b=point(counter.x2,counter.y2),x=(a.x+b.x)/2,z=(a.z+b.z)/2,w=Math.abs(a.x-b.x),d=Math.abs(a.z-b.z);
  box(w,.84,d,x,.43,z,white,furniture);box(w+.03,.04,d+.03,x,.88,z,quartz,furniture);
  for(let i=0;i<3;i++){const zz=a.z+(i+.5)*d/3;box(.015,.72,d/3-.025,b.x+.01,.48,zz,white,furniture);rod(new T.Vector3(b.x+.03,.62,zz-.12),new T.Vector3(b.x+.03,.62,zz+.12),.009,metal);}
  box(w*.8,.68,d,x,1.96,z,white,furniture);
  const sink=rows.find(r=>r.kind==='sink');if(sink){const s=point(sink.x1,sink.y1),e=point(sink.x2,sink.y2);box(Math.abs(e.x-s.x),.015,Math.abs(e.z-s.z),(s.x+e.x)/2,.91,(s.z+e.z)/2,metal,furniture);cylinder(.013,.013,.26,a.x+.12,1.05,(s.z+e.z)/2,metal);rod(new T.Vector3(a.x+.12,1.18,(s.z+e.z)/2),new T.Vector3(a.x+.27,1.18,(s.z+e.z)/2),.012,metal);}
  round(.31,.32,.36,.028,x,1.08,z+.45,metal);box(.02,.18,.28,x+.16,1.08,z+.45,black,furniture);cylinder(.07,.06,.12,x,1.30,z+.45,black);cylinder(.04,.032,.09,x+.18,.95,z+.46,white);
 }
 // Black leather lounge seating, inferred placement beside the lower open area.
 const sofa=point(496,1703);
 round(.76,.26,1.9,.065,sofa.x,.31,sofa.z,leather);round(.12,.65,1.94,.055,sofa.x-.34,.55,sofa.z,leather);
 for(const dz of [-.94,.94])round(.78,.40,.15,.04,sofa.x,.46,sofa.z+dz,leather);
 for(let i=0;i<3;i++){round(.62,.13,.55,.055,sofa.x+.02,.48,sofa.z+(i-1)*.59,leather);round(.12,.40,.55,.04,sofa.x-.24,.77,sofa.z+(i-1)*.59,leather);}
 shade(sofa.x,sofa.z,1.4,2.6);
 cylinder(.28,.28,.03,sofa.x+.92,.54,sofa.z,white);cylinder(.035,.035,.5,sofa.x+.92,.275,sofa.z,white);cylinder(.23,.23,.025,sofa.x+.92,.025,sofa.z,white);
 function plant(x,z,height=1.45){
  cylinder(.18,.13,.34,x,.17,z,mat('#aaa394',.94));cylinder(.13,.13,.008,x,.345,z,mat('#3c3528',1));rod(new T.Vector3(x,.3,z),new T.Vector3(x,height,z),.013,mat('#645647',.9));
  for(let i=0;i<22;i++){const angle=i*2.4,yy=.55+i/22*(height-.5),radius=.18+random()*.25;const end=new T.Vector3(x+Math.cos(angle)*radius,yy,z+Math.sin(angle)*radius);rod(new T.Vector3(x,yy-.1,z),end,.005,mat('#536243',.9));const leaf=mesh(new T.SphereGeometry(1,8,6),mat(i%2?'#4c6750':'#718063',.82),furniture);leaf.scale.set(.11,.018,.22);leaf.position.copy(end);leaf.rotation.set(.2,angle,.2);}
 }
 const upperLeft=point(650,216);plant(upperLeft.x,upperLeft.z,1.55);plant(sofa.x+.94,sofa.z,.58);
 // Ceiling grid and warm luminous troffers seen in the photographs.
 const practicals=[];
 const zones=[{x:layout.centerX,z:layout.centerZ,length:9.2,width:6.5},{x:lower.x,z:lower.z,length:6,width:6}];
 const lampMat=mat('#fff3cf',.4,{emissive:'#ffe5ab',emissiveIntensity:2.5});
 for(const zone of zones){for(const xx of [-1.7,1.7])for(let i=0;i<3;i++){
  const z=zone.z+(i-1)*zone.length/3.1,x=zone.x+xx;
  box(.60,.035,1.2,x,H-.025,z,metal,lamps);const panel=box(.54,.015,1.12,x,H-.047,z,lampMat,lamps);panel.castShadow=false;
  if(i===1){const glow=new T.PointLight('#ffe9c4',15,10,2);glow.position.set(x,H-.18,z);lamps.add(glow);practicals.push(glow);}
 }}
 const hemi=new T.HemisphereLight('#e6f0ff','#8f8778',.75);scene.add(hemi);
 const sun=new T.DirectionalLight('#fff0d9',1.7);sun.position.set(12,9,-13);sun.target.position.set(0,0,-4);sun.castShadow=true;sun.shadow.mapSize.set(coarse?1024:2048,coarse?1024:2048);Object.assign(sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:.1,far:70});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;scene.add(sun,sun.target);
 const fill=new T.DirectionalLight('#c7e3f7',.6);fill.position.set(-5,3,-16);scene.add(fill);
 const envScene=new T.Scene();envScene.background=new T.Color('#d7ddd9');
 const envMat=new T.MeshBasicMaterial({color:'#ffffff',side:T.BackSide});const envBox=new T.Mesh(new T.BoxGeometry(20,10,30),envMat);envScene.add(envBox);
 const pmrem=new T.PMREMGenerator(renderer),envTarget=pmrem.fromScene(envScene,.08);scene.environment=envTarget.texture;pmrem.dispose();envBox.geometry.dispose();envMat.dispose();
 const top=point(620,170),right=point(1120,810);
 const presets={
  workspace:{pos:[top.x+.80,1.6,right.z-.28],look:[layout.centerX+.20,1.05,layout.centerZ-2.4],fov:66},
  windows:{pos:[right.x-.65,1.6,layout.centerZ-3.1],look:[layout.centerX,1.15,layout.centerZ+.9],fov:68},
  lounge:{pos:[lower.x+1.5,1.6,lower.z+1.7],look:[sofa.x+.3,1.1,sofa.z-1],fov:65},
  kitchenette:{pos:[lower.x,1.6,lower.z-.5],look:[point(435,1370).x,1.3,point(435,1370).z],fov:64},
  overview:{pos:[-17,24,22],look:[0,0,0],fov:45}
 };
 function update(){const dir=new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));camera.lookAt(camera.position.clone().add(dir));camera.fov=fov;camera.updateProjectionMatrix();}
 function draw(){if(!disposed&&!raf)raf=requestAnimationFrame(()=>{raf=0;update();renderer.render(scene,camera);});}
 function setView(name){walker?.stop();const preset=presets[name]||presets.workspace;current=name;camera.position.set(...preset.pos);const d=new T.Vector3(...preset.look).sub(camera.position).normalize();yaw=Math.atan2(d.x,-d.z);pitch=Math.asin(d.y);fov=preset.fov;ceiling.visible=name!=='overview';lamps.visible=opts.lights&&name!=='overview';draw();}
 function resize(){const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;draw();}
 const pointers=new Map();let pinch=0;
 on(canvas,'pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.focus({preventScroll:true});pinch=0;});
 on(canvas,'pointermove',e=>{if(!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const ps=[...pointers.values()];if(ps.length===2){const d=Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y);if(pinch)fov=Math.max(35,Math.min(90,fov*pinch/Math.max(d,1)));pinch=d;}else{yaw-=(e.clientX-old.x)*.004;pitch=Math.max(-1.35,Math.min(1.35,pitch+(e.clientY-old.y)*.003));}draw();});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])on(canvas,event,e=>{pointers.delete(e.pointerId);pinch=0;});
 on(canvas,'wheel',e=>{e.preventDefault();fov=Math.max(35,Math.min(90,fov+e.deltaY*.025));draw();},{passive:false});
 on(canvas,'keydown',e=>{if(!['Home','+','-','='].includes(e.key))return;e.preventDefault();if(e.key==='Home')setView(current);if(['+','='].includes(e.key))fov=Math.max(35,fov-4);if(e.key==='-')fov=Math.min(90,fov+4);draw();});
 const observer=new ResizeObserver(resize);observer.observe(host);furniture.visible=opts.furniture;blinds.visible=opts.blinds;resize();setView('workspace');
 walker=createWalkControls({T,camera,canvas,group,furniture,polygon:outline.map(r=>point(r.x1,r.y1)),getYaw:()=>yaw,turn:delta=>{yaw+=delta;},draw,enterInterior:()=>setView('workspace'),getView:()=>current});
 on(canvas,'walkstatus',e=>{renderer.setPixelRatio(e.detail.active?.8:Math.min(devicePixelRatio||1,1.5));resize();});
 return {setView,startWalk:(focus=true)=>walker.start(focus),stopWalk:()=>walker.stop(),setWalkEnabled:value=>walker.setEnabled(value),pressMove:(id,direction)=>walker.press(id,direction),releaseMove:id=>walker.release(id),navigationState:()=>walker.getState(),reset(){setView(current);walker.reset();},zoom(factor){fov=Math.max(35,Math.min(90,fov/factor));draw();},setOption(key,value){opts[key]=value;if(key==='furniture'){furniture.visible=value;renderer.shadowMap.needsUpdate=true;}if(key==='blinds')blinds.visible=value;if(key==='lights')lamps.visible=value&&current!=='overview';draw();},dispose(){if(disposed)return;walker?.dispose();disposed=true;cancelAnimationFrame(raf);observer.disconnect();listeners.forEach(fn=>fn());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());sun.shadow.map?.dispose();envTarget.dispose();renderer.dispose();canvas.remove();}};
}
