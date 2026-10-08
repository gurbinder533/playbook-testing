// Navigation is for this inferred model only, not an accessibility/egress assessment.
export function createWalkControls({T,camera,canvas,group,furniture,polygon,getYaw,turn,draw,enterInterior,getView}){
 const radius=.18,eye=1.6,speed=1.25;
 const keys=new Set(),buttons=new Map(),listeners=[],cells=new Map();
 let running=false,frame=0,last=0,disposed=false,blocked=false,enabled=true;
 const on=(el,type,fn,options)=>{el.addEventListener(type,fn,options);listeners.push(()=>el.removeEventListener(type,fn,options));};
 group.updateMatrixWorld(true);
 group.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const bound=new T.Box3().setFromObject(mesh);
  if(bound.max.y<.2||bound.min.y>1.75)return;
  let node=mesh,isFurniture=false;while(node){if(node===furniture){isFurniture=true;break;}node=node.parent;}
  const box={minX:bound.min.x,maxX:bound.max.x,minZ:bound.min.z,maxZ:bound.max.z,isFurniture};
  for(let x=Math.floor(box.minX-radius);x<=Math.floor(box.maxX+radius);x++)for(let z=Math.floor(box.minZ-radius);z<=Math.floor(box.maxZ+radius);z++){
   const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(box);
  }
 });
 function inside(x,z){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)yes=!yes;
 }return yes;}
 function clear(x,z){
  for(const [dx,dz] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]])if(!inside(x+dx,z+dz))return false;
  for(const b of cells.get(Math.floor(x)+','+Math.floor(z))||[]){
   if(b.isFurniture&&!furniture.visible)continue;
   const nx=Math.max(b.minX,Math.min(x,b.maxX)),nz=Math.max(b.minZ,Math.min(z,b.maxZ));
   if((x-nx)**2+(z-nz)**2<radius*radius)return false;
  }return true;
 }
 function publish(reason=''){
  canvas.dataset.walking=String(running);canvas.dataset.cameraX=camera.position.x.toFixed(4);canvas.dataset.cameraZ=camera.position.z.toFixed(4);canvas.dataset.eyeHeight=camera.position.y.toFixed(2);
  canvas.dispatchEvent(new CustomEvent('walkstatus',{detail:{active:running,blocked,view:getView(),message:reason||(blocked?'Obstacle ahead — turn or step sideways.':running?'Walk with W/A/S/D or hold the arrows. Drag to look.':'Paused. Click Walk to continue.')}}));
 }
 function stop(){keys.clear();buttons.clear();running=false;last=0;cancelAnimationFrame(frame);frame=0;blocked=false;publish();}
 function start(focus=true){
  if(disposed||!enabled)return false;
  if(getView()==='overview')enterInterior();
  camera.position.y=eye;
  if(!clear(camera.position.x,camera.position.z)){
   let found=false;const ox=camera.position.x,oz=camera.position.z;
   for(let r=.1;r<=2&&!found;r+=.1)for(let a=0;a<32;a++){const t=a*Math.PI/16,x=ox+Math.cos(t)*r,z=oz+Math.sin(t)*r;if(clear(x,z)){camera.position.x=x;camera.position.z=z;found=true;break;}}
   if(!found){publish('No clear starting position here. Choose another camera position.');return false;}
  }
  running=true;blocked=false;draw();publish();if(focus)canvas.focus({preventScroll:true});return true;
 }
 const map={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyQ:'turnLeft',KeyE:'turnRight'};
 function active(){return new Set([...keys].map(k=>map[k]).filter(Boolean).concat([...buttons.values()]));}
 function schedule(){if(!frame&&!disposed){if(!last)last=performance.now();frame=requestAnimationFrame(tick);}}
 function tick(time){
  frame=0;if(!running||disposed)return;
  const dt=Math.min(.5,last?Math.max(0,(time-last)/1000):1/60);last=time;const dirs=active();
  if(!dirs.size){last=0;return;}
  if(dirs.has('turnLeft'))turn(1.2*dt);if(dirs.has('turnRight'))turn(-1.2*dt);
  let f=Number(dirs.has('forward'))-Number(dirs.has('back')),s=Number(dirs.has('right'))-Number(dirs.has('left'));const length=Math.hypot(f,s);let hit=false;
  if(length){f/=length;s/=length;const yaw=getYaw(),distance=speed*dt;
   const dx=(Math.sin(yaw)*f+Math.cos(yaw)*s)*distance,dz=(-Math.cos(yaw)*f+Math.sin(yaw)*s)*distance;
   // Small steps plus axis sliding prevent tunnelling and let the camera follow walls.
   const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.045));let moved=0;
   for(let i=0;i<steps;i++){if(clear(camera.position.x+dx/steps,camera.position.z)){camera.position.x+=dx/steps;moved+=Math.abs(dx/steps);}else hit=true;
    if(clear(camera.position.x,camera.position.z+dz/steps)){camera.position.z+=dz/steps;moved+=Math.abs(dz/steps);}else hit=true;}
   camera.position.y=eye;hit=hit&&moved<distance*.5;
  }
  const changed=hit!==blocked;blocked=hit;canvas.dataset.cameraX=camera.position.x.toFixed(4);canvas.dataset.cameraZ=camera.position.z.toFixed(4);canvas.dataset.eyeHeight=camera.position.y.toFixed(2);
  if(changed)publish();draw();schedule();
 }
 on(canvas,'keydown',e=>{if(map[e.code]){e.preventDefault();if(!running&&!start())return;keys.add(e.code);schedule();}else if(e.code==='Escape'){e.preventDefault();stop();}});
 function flush(){if(running&&last&&active().size){cancelAnimationFrame(frame);frame=0;tick(performance.now());}}
 on(window,'keyup',e=>{if(keys.has(e.code))flush();keys.delete(e.code);});on(window,'blur',stop);
 on(canvas,'blur',()=>{keys.clear();});on(document,'visibilitychange',()=>{if(document.hidden)stop();});
 publish('Click Walk, then use W/A/S/D or the movement arrows.');
 return {start,stop,clear,reset(){stop();publish('View reset. Click Walk to explore.');},setEnabled(value){enabled=value;if(!value)stop();},press(id,direction){if(!running&&!start(false))return;buttons.set(id,direction);schedule();},release(id){if(buttons.has(id))flush();buttons.delete(id);},getState(){return {active:running,blocked,x:camera.position.x,z:camera.position.z,eye:camera.position.y};},dispose(){stop();disposed=true;listeners.forEach(fn=>fn());}};
}
