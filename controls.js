export const input = { w:0, a:0, s:0, d:0, shoot:false, mx:0, my:0, mouseX:0, mouseY:0, mouseClicked:false, roll:false, reload:false, arUp:0, arDown:0, arLeft:0, arRight:0 };

export function initControls(canvas, state) {
  canvas.addEventListener('mousemove', e=>{
    const r = canvas.getBoundingClientRect();
    input.mx = e.clientX - r.left;
    input.my = e.clientY - r.top;
    input.mouseX = input.mx;
    input.mouseY = input.my;
  });
  
  canvas.addEventListener('mousedown', (e)=> {
    input.shoot = true;
    

  });
  
  canvas.addEventListener('mouseup', ()=> input.shoot = false);

  window.addEventListener('keydown', e=>{
    if(e.code==='KeyW') input.w=1; else if(e.code==='KeyA') input.a=1; else if(e.code==='KeyS') input.s=1; else if(e.code==='KeyD') input.d=1;
    else if(e.code==='ArrowUp') input.arUp=1; else if(e.code==='ArrowDown') input.arDown=1; else if(e.code==='ArrowLeft') input.arLeft=1; else if(e.code==='ArrowRight') input.arRight=1;
    else if(e.code==='Space') input.roll=true; else if(e.code==='KeyR') input.reload=true;
    else if(e.code==='KeyT') input.reset=true;
    else if(e.code==='Enter') { if(state.dead || state.win || state.idle) state.newRun(); }
  });
  window.addEventListener('keyup', e=>{
    if(e.code==='KeyW') input.w=0; else if(e.code==='KeyA') input.a=0; else if(e.code==='KeyS') input.s=0; else if(e.code==='KeyD') input.d=0;
    else if(e.code==='ArrowUp') input.arUp=0; else if(e.code==='ArrowDown') input.arDown=0; else if(e.code==='ArrowLeft') input.arLeft=0; else if(e.code==='ArrowRight') input.arRight=0;
    else if(e.code==='Space') input.roll=false; else if(e.code==='KeyR') input.reload=false;
    else if(e.code==='KeyT') input.reset=false;
  });
}