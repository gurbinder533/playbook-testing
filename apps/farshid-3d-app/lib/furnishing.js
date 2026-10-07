// Proposed furniture dimensions are design choices, not measurements from Exhibit A.
export function furnishingLayout(rows, overallWidth, deskWidth=1.4){
 const outline=rows.filter(r=>r.kind==='outline');
 const minX=Math.min(...outline.map(r=>r.x1)),maxX=Math.max(...outline.map(r=>r.x1));
 const minY=Math.min(...outline.map(r=>r.y1)),maxY=Math.max(...outline.map(r=>r.y1));
 const scale=overallWidth/(maxX-minX),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const top=rows.find(r=>r.label==='Upper boundary');
 const door=rows.find(r=>r.kind==='door'&&r.label==='Upper door');
 if(!top||!door)throw new Error('The upper work area cannot be located in the drawing.');
 const left=Math.min(top.x1,top.x2),right=Math.max(top.x1,top.x2),start=Math.min(top.y1,top.y2),end=Math.min(door.y1,door.y2);
 const x=((left+right)/2-cx)*scale,z=((start+end)/2-cy)*scale;
 const rowPitch=deskWidth+.05,depth=.7,chairZone=.85;
 const desks=Array.from({length:10},(_,i)=>({id:i+1,x:x+(i%2===0?-1:1)*(depth/2+.025),z:z+(Math.floor(i/2)-2)*rowPitch,side:i%2===0?-1:1,width:deskWidth,depth}));
 const benchLength=5*deskWidth+.2;
 const sideClearance=((right-left)*scale-(depth*2+.05+chairZone*2))/2-.075;
 const endClearance=((end-start)*scale-benchLength)/2-.075;
 return {desks,centerX:x,centerZ:z,benchLength,sideClearance,endClearance,meetsTargets:sideClearance>=1.2&&endClearance>=1.0};
}
