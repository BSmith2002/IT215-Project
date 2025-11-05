// main.js — ES module entry for the bullethell game, now with PNG sprites.
// Put your PNGs in /assets/, e.g. /assets/player.png, /assets/ghoul.png, etc.

import { input, initControls } from './controls.js';
import { resetItemPool, giveItem, spawnTreasure, ItemPoolMaster } from './items.js';
import { makeEnemy, spawnCombatWave, spawnBoss, explode, onEnemyDie } from './enemies.js';

(function(){
  // ===== Utilities =====
  const TWO_PI = Math.PI*2;
  const rnd = (a,b)=>Math.random()*(b-a)+a;
  const rndi = (a,b)=> (Math.random()*((b+1)-a)+a)|0;
  const clamp = (v,a,b)=>Math.max(a, Math.min(b, v));
  const dist2=(x1,y1,x2,y2)=>{const dx=x2-x1, dy=y2-y1; return dx*dx+dy*dy};
  const pick = arr=> arr[(Math.random()*arr.length)|0];
  const shuffle = (arr)=>{ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } return a; };

  // ===== Canvas & HUD =====
  const canvas = document.getElementById('game');
  const cx = canvas.getContext('2d');
  const HUD = {
    hearts: document.getElementById('hearts'),
    ammo: document.getElementById('ammo'),
    level: document.getElementById('level'),
    score: document.getElementById('score'),
    reloadFill: document.getElementById('reloadFill'),
  };
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const title = document.getElementById('title');
  const subtitle = document.getElementById('subtitle');
  function showOverlay(show){ overlay.hidden = !show; overlay.style.display = show ? 'grid':'none'; }

  // ===== Asset Loader (PNG sprites) =====
  // Place files in /assets/ with these names (change paths if you like).
  const Assets = {
    paths: {
      player:  '/assets/knight.png',
      ghoul:   '/assets/zombie.png',
      archer:  '/assets/archer.png',
      turret:  '/assets/slime.png',
      charger: '/assets/charger.png',
      warlock: '/assets/warlock.png',
      sniper:  '/assets/sniper.png',
      bomber:  '/assets/bomber.png',
      boss:    '/assets/boss.png',
      // Optional UI pickups (only if you add the files):
      heart:   '/assets/heart.png',
      item:    '/assets/item.png',
      stairs:  '/assets/stairs.png',
      // Optional projectile:
      bullet:  '/assets/bullet.png',
    },
    images: {}, ready: false
  };
  function loadAssets(){
    const entries = Object.entries(Assets.paths);
    const jobs = entries.map(([key,src])=> new Promise((res,rej)=>{
      const img = new Image();
      img.onload = ()=>{ Assets.images[key]=img; res(); };
      img.onerror = ()=>{ console.warn('Sprite failed to load:', src); res(); }; // don't block game if missing
      img.src = src;
    }));
    return Promise.all(jobs).then(()=>{ Assets.ready = true; });
  }
  // Helper: draw centered sprite scaled to diameter ~ 2*r, with optional rotation (radians)
  function drawSprite(key, x, y, r, rot=0){
    const img = Assets.images[key];
    if(!img){ return false; }
    const targetSize = Math.max(2*r, 8); // keep visible even for tiny radii
    const w = targetSize, h = targetSize;
    cx.save();
    cx.translate(x, y);
    if(rot) cx.rotate(rot);
    // Anchor center
    cx.drawImage(img, -w/2, -h/2, w, h);
    cx.restore();
    return true;
  }

  // ===== Game State & Controls =====
  const state = {
    idle:true, time:0, floor:1, score:0, dead:false, win:false,
    map:null, room:null, player:null,
    bullets:[], ebullets:[], beams:[], pickups:[], entities:[], effects:[],
    lockDoors:false, toast:null, itemPool:[],
  };
  state.newRun = newRun; // function defined later
  initControls(canvas, state);

  // ===== World/Rooms =====
  const ROOM_W = 860, ROOM_H = 460;
  const ROOM_ORIGIN = {x:(canvas.width-ROOM_W)/2, y:(canvas.height-ROOM_H)/2};
  const DOOR_W = 80, DOOR_H = 20;
  const MAX_FLOORS = 15;

  const RT = { START:'start', COMBAT:'combat', TREASURE:'treasure', BOSS:'boss' };

  function makeGrid(w,h,fill=null){ const a=[]; for(let y=0;y<h;y++){ const r=new Array(w).fill(null); a.push(r); } return a; }

  function genFloor(level){
    const W=7,H=7; const grid = makeGrid(W,H);
    let cxg=3, cy=3; const rooms=[{x:cxg,y:cy}]; grid[cy][cxg] = {type:RT.START, visited:false, cleared:false, doors:{up:0,down:0,left:0,right:0}};
    let steps = rndi(14,22);
    while(steps>0){
      const dir = pick(['up','down','left','right']);
      let nx=cxg, ny=cy; if(dir==='up') ny--; if(dir==='down') ny++; if(dir==='left') nx--; if(dir==='right') nx++;
      if(nx<0||ny<0||nx>=W||ny>=H) continue; cxg=nx; cy=ny; steps--;
      if(!grid[cy][cxg]){ grid[cy][cxg] = {type:RT.COMBAT, visited:false, cleared:false, doors:{up:0,down:0,left:0,right:0}}; rooms.push({x:cxg,y:cy}); }
    }
    const minRooms = 12;
    let created = rooms.length;
    for(let tries=0; created<minRooms && tries<200; tries++){
      const r = pick(rooms); const dirs=['up','down','left','right']; const dir=pick(dirs);
      let nx=r.x, ny=r.y; if(dir==='up') ny--; if(dir==='down') ny++; if(dir==='left') nx--; if(dir==='right') nx++;
      if(nx<0||ny<0||nx>=W||ny>=H) continue; if(!grid[ny][nx]){ grid[ny][nx]={type:RT.COMBAT, visited:false, cleared:false, doors:{up:0,down:0,left:0,right:0}}; rooms.push({x:nx,y:ny}); created++; }
    }
    // place boss farthest from start
    let far=null, farD=-1; for(const r of rooms){ const d=Math.abs(r.x-3)+Math.abs(r.y-3); if(d>farD){ farD=d; far=r; } }
    grid[far.y][far.x].type = RT.BOSS;
    const maxTreasures = Math.min(rndi(1,2), state.itemPool.length);
    let placed=0; for(let tries=0; tries<200 && placed<maxTreasures; tries++){
      const r = pick(rooms);
      const cell = grid[r.y][r.x];
      if(cell.type===RT.COMBAT){ cell.type=RT.TREASURE; placed++; }
    }
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const c=grid[y][x]; if(!c) continue;
      c.doors.up = (y>0 && grid[y-1][x])?1:0;
      c.doors.down= (y<H-1 && grid[y+1][x])?1:0;
      c.doors.left= (x>0 && grid[y][x-1])?1:0;
      c.doors.right=(x<W-1 && grid[y][x+1])?1:0;
      c.x=x; c.y=y; c.t=0; c.spawned=false; c.entities=null; c.pickups=null; c.treasureTaken=false;
    }
    return {grid, W, H, sx:3, sy:3};
  }

  function saveCurrentRoomState(){
    const c = state.room; if(!c) return;
    c.entities = state.entities.map(e=>({...e}));
    c.pickups = state.pickups.map(p=>({...p}));
    c.cleared = (c.cleared || (state.entities.length===0 && state.ebullets.length===0 && c.type!==RT.TREASURE));
  }

  function enterRoom(cell){
    state.entities = []; state.ebullets = []; state.bullets = []; state.beams = []; state.effects = []; state.pickups = [];
    state.room = cell; if(state.room && typeof state.room.t!=='number') state.room.t = 0;
    if(cell){ cell.visited = true; }
    if(cell){
      if(cell.entities){ state.entities = cell.entities.map(e=>({...e})); }
      if(cell.pickups){ state.pickups = cell.pickups.map(p=>({...p})); }
      if(!cell.spawned){
        if(cell.type===RT.COMBAT){ spawnCombatWave(state, randomRoomEdgePoint); cell.spawned=true; }
        if(cell.type===RT.TREASURE && !cell.treasureTaken){ spawnTreasure(state, canvas); cell.spawned=true; }
        if(cell.type===RT.BOSS){ spawnBoss(state, canvas); cell.spawned=true; }
      }
    }
    state.lockDoors = !!(cell && !cell.cleared && (cell.type===RT.COMBAT || cell.type===RT.BOSS) && state.entities.length>0);
    updateHUD();
  }

  function difficultyTier(){ return Math.floor((state.floor-1)/3); }

  function randomRoomEdgePoint(){
    const pad=60; const side = pick(['up','down','left','right']);
    if(side==='up') return {x:rnd(ROOM_ORIGIN.x+pad, ROOM_ORIGIN.x+ROOM_W-pad), y:ROOM_ORIGIN.y+40};
    if(side==='down') return {x:rnd(ROOM_ORIGIN.x+pad, ROOM_ORIGIN.x+ROOM_W-pad), y:ROOM_ORIGIN.y+ROOM_H-40};
    if(side==='left') return {x:ROOM_ORIGIN.x+40, y:rnd(ROOM_ORIGIN.y+pad, ROOM_ORIGIN.y+ROOM_H-pad)};
    return {x:ROOM_ORIGIN.x+ROOM_W-40, y:rnd(ROOM_ORIGIN.y+pad, ROOM_ORIGIN.y+ROOM_H-pad)};
  }

  // ===== Player & Items =====
  function makePlayer(x,y){
    return {
      type:'player', x,y, r:13, speed:2.6,
      vx:0, vy:0,
      hearts:5, maxHearts:5,
      invuln:0,
      rollCD:0, rolling:0,
      angle:0,
      clipSize:6, ammo:6, reloadTime:520, reloading:0,
      fireCD:0, fireDelay:140, bulletSpeed:6.0, bulletSpread:0.05,
      items:[],
      mods:{ triple:false, laser:false, pierce:false, explosive:false, rapid:0, speed:0, ricochet:false, damage:1, range:1 },
      sprite:'player', // <-- use player.png
    };
  }

  function giveItemWrapper(p, item){
    giveItem(state, p, item);
  }

  // ===== Shooting & Player Aim (kept in main) =====
  function playerAimAndFire(p){
    const ax = (input.arRight - input.arLeft); const ay = (input.arDown - input.arUp);
    const usingArrows = (ax!==0 || ay!==0);
    if(usingArrows){ p.angle = Math.atan2(ay, ax); if(p.angle!==p.angle) p.angle = 0; shootPlayer(p); } 
    else {
      p.angle = Math.atan2(input.my - p.y, input.mx - p.x);
      if(input.shoot) shootPlayer(p);
    }
  }

  function shootPlayer(p){
    if(p.reloading>0 || p.fireCD>0 || p.ammo<=0) return;
    p.ammo--; p.fireCD = p.fireDelay;
    const count = p.mods.triple ? 3 : 1;
    const spread = p.mods.triple ? 0.18 : 0.05;
    const types = { laser: p.mods.laser };
    for(let i=0;i<count;i++){
      const off = (count===1)?0 : (-spread + i*(spread*2)/(count-1));
      const ang = p.angle + off;
      if(types.laser){
        state.beams.push({x:p.x,y:p.y, angle:ang, life:120, pierce:true, damage:1+p.mods.damage, hits:new Set()});
      } else {
        state.bullets.push({x:p.x, y:p.y, r:4, vx:Math.cos(ang)*p.bulletSpeed, vy:Math.sin(ang)*p.bulletSpeed, life:900*(1+p.mods.range*0.25), pierce:p.mods.pierce, explosive:p.mods.explosive, bounces:p.mods.ricochet?1:0, dmg:1+p.mods.damage, hits:new Set()});
      }
    }
    if(p.ammo===0) startReload(p);
  }

  function startReload(p){ if(p.reloading<=0){ p.reloading=p.reloadTime; if(HUD.reloadFill) HUD.reloadFill.style.width='0%'; } }
  function dropHeart(x,y){ state.pickups.push({type:'heart', x,y, r:8, t:0}); }

  // ===== Game Flow =====
  function newRun(){
    state.idle=false; state.dead=false; state.win=false; showOverlay(false); restartBtn.hidden=true; startBtn.hidden=true;
    state.time=0; state.floor=1; state.score=0; state.entities=[]; state.bullets=[]; state.ebullets=[]; state.pickups=[]; state.beams=[]; state.effects=[]; state.toast=null;
    state.player = makePlayer(canvas.width/2, canvas.height/2);
    resetItemPool(state);
    state.map = genFloor(state.floor);
    const startCell = state.map.grid[state.map.sy][state.map.sx];
    enterRoom(startCell);
    updateHUD();
  }

  function endRun(text){ showOverlay(true); title.textContent=text; subtitle.textContent=`Score ${state.score} — Reached Floor ${state.floor}`; restartBtn.hidden=false; startBtn.hidden=true; }

  startBtn.addEventListener('click', (e)=>{ e.preventDefault(); newRun(); });
  restartBtn.addEventListener('click', (e)=>{ e.preventDefault(); newRun(); });

  // ===== Update Loop =====
  function update(dt){
    state.time += dt; const p = state.player; if(!p) return; if(!state.room) return;
    if(typeof state.room.t!=='number') state.room.t = 0; else state.room.t += dt;

    const ix = (input.d - input.a), iy = (input.s - input.w);
    let mag = Math.hypot(ix, iy); let vx=0, vy=0; if(mag>0){ vx = (ix/mag) * p.speed; vy = (iy/mag) * p.speed; }

    if(p.rollCD>0) p.rollCD -= dt;
    if(p.rolling>0){ p.rolling -= dt; p.invuln = 50; p.x += Math.cos(p.angle) * 4.0; p.y += Math.sin(p.angle) * 4.0; } else { p.x += vx; p.y += vy; }

    confineToRoom(p);

    if(input.roll && p.rollCD<=0 && p.rolling<=0){ p.rolling = 260; p.rollCD = 900; p.invuln=180; }
    if(p.invuln>0) p.invuln -= dt; if(p.fireCD>0) p.fireCD -= dt;

    if(p.reloading>0){ p.reloading -= dt; const pct = 1 - clamp(p.reloading / p.reloadTime, 0,1); if(HUD.reloadFill) HUD.reloadFill.style.width=(pct*100).toFixed(0)+'%'; if(p.reloading<=0){ p.ammo = p.clipSize; } }
    else if(input.reload && p.ammo < p.clipSize){ startReload(p); }

    playerAimAndFire(p);

    for(let i=state.bullets.length-1;i>=0;i--){ const b=state.bullets[i]; b.x+=b.vx; b.y+=b.vy; b.life -= dt; if(b.life<=0 || outOfRoom(b.x,b.y)){ if(b.bounces>0){ b.bounces--; if(b.x<ROOM_ORIGIN.x||b.x>ROOM_ORIGIN.x+ROOM_W) b.vx*=-1; if(b.y<ROOM_ORIGIN.y||b.y>ROOM_ORIGIN.y+ROOM_H) b.vy*=-1; b.life=300; } else { state.bullets.splice(i,1); } continue; } }
    for(let i=state.beams.length-1;i>=0;i--){ const bm=state.beams[i]; bm.life -= dt; if(bm.life<=0){ state.beams.splice(i,1); } }

    // enemies (movement + behavior)
    for(let i=state.entities.length-1;i>=0;i--){ const e = state.entities[i]; e.t += dt;
      const dx = p.x - e.x, dy = p.y - e.y; const m = Math.hypot(dx,dy)||1;
      if(e.etype==='ghoul'){ e.x += (dx/m)*e.speed; e.y += (dy/m)*e.speed; }
      else if(e.etype==='archer'){ e.x += (dx/m)*e.speed*0.7; e.y += (dy/m)*e.speed*0.7; e.shootCD -= dt; if(e.shootCD<=0){ e.shootCD = rndi(700,1100); const base = Math.atan2(dy,dx); const a = base + rnd(-0.08,0.08); const sp=2.6; state.ebullets.push({x:e.x,y:e.y,r:4,vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:3200}); } }
      else if(e.etype==='turret'){ e.shootCD -= dt; if(e.shootCD<=0){ e.shootCD = 800; const n=10; const base = state.time*0.004; for(let k=0;k<n;k++){ const a=base+(k/n)*TWO_PI; const sp=2.0; state.ebullets.push({x:e.x,y:e.y,r:4,vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:3600}); } } }
      else if(e.etype==='charger'){ e.dashCD -= dt; if(e.dashCD<=0){ e.dashCD=1200; const a=Math.atan2(dy,dx); e.vx=Math.cos(a)*4.0; e.vy=Math.sin(a)*4.0; e.dashT=240; } if(e.dashT>0){ e.x+=e.vx; e.y+=e.vy; e.dashT-=dt; } else { e.x += (dx/m)*e.speed; e.y += (dy/m)*e.speed; } }
      else if(e.etype==='warlock'){ e.x += (dx/m)*e.speed*0.6; e.y += (dy/m)*e.speed*0.6; e.shootCD -= dt; if(e.shootCD<=0){ e.shootCD=650; const base=Math.atan2(dy,dx); for(let k=-2;k<=2;k++){ const a=base + k*0.12; state.ebullets.push({x:e.x,y:e.y,r:4,vx:Math.cos(a)*2.8, vy:Math.sin(a)*2.8, life:3600}); } } }
      else if(e.etype==='sniper'){ const desired=220; const d=Math.hypot(dx,dy); if(d<desired){ e.x -= (dx/m)*e.speed; e.y -= (dy/m)*e.speed; } else { e.x += (dx/m)*e.speed*0.3; e.y += (dy/m)*e.speed*0.3; } e.shootCD -= dt; if(e.shootCD<=0){ e.shootCD=1200; const a=Math.atan2(dy,dx); state.ebullets.push({x:e.x,y:e.y,r:4,vx:Math.cos(a)*4.2, vy:Math.sin(a)*4.2, life:4000}); } }
      else if(e.etype==='bomber'){ e.fuse+=dt; e.x += (dx/m)*e.speed; e.y += (dy/m)*e.speed; if(Math.hypot(dx,dy)<35){ explode(state,e.x,e.y); onEnemyDie(state, e); e._dead=true; } }
      else if(e.etype==='boss'){ e.shootCD -= dt; if(e.shootCD<=0){ e.shootCD = 600; if((e.phase++%2)===0){ const n=18; const base=state.time*0.003; for(let k=0;k<n;k++){ const a=base+(k/n)*TWO_PI; state.ebullets.push({x:e.x,y:e.y,r:4,vx:Math.cos(a)*2.2, vy:Math.sin(a)*2.2, life:4000}); } } else { const base=Math.atan2(dy,dx); for(let k=-2;k<=2;k++){ const a=base + k*0.12; state.ebullets.push({x:e.x,y:e.y,r:4,vx:Math.cos(a)*2.8, vy:Math.sin(a)*2.8, life:3400}); } } } e.x += (dx/m)*e.speed; e.y += (dy/m)*e.speed; }

      // --- bullets -> enemy ---
      if(!e._dead){
        for(let j=state.bullets.length-1;j>=0;j--){
          const b=state.bullets[j];
          if(b.hits && b.hits.has(e)) continue;
          if(dist2(b.x,b.y,e.x,e.y) < (b.r+e.r)*(b.r+e.r)){
            if(b.hits) b.hits.add(e);
            e.hp -= (b.dmg||1);
            if(!b.pierce){ state.bullets.splice(j,1); }
            if(b.explosive){ explode(state,b.x,b.y); }
            if(e.hp<=0){
              e._dead = true;
              onEnemyDie(state, e);
              break;
            }
          }
        }
      }

      // --- beam collisions (lasers) ---
      if(!e._dead){
        for(const bm of state.beams){
          if(bm.hits && bm.hits.has(e)) continue;
          const L=900; const ex = bm.x + Math.cos(bm.angle)*L; const ey = bm.y + Math.sin(bm.angle)*L;
          if(lineCircle(bm.x,bm.y,ex,ey,e.x,e.y,e.r)){
            if(bm.hits) bm.hits.add(e);
            e.hp -= (bm.damage||1);
            if(e.hp<=0){
              e._dead = true;
              onEnemyDie(state, e);
            }
          }
        }
      }

      // --- enemy melee -> player ---
      if(!e._dead && p && p.invuln<=0){
        if(dist2(e.x,e.y,p.x,p.y) < (e.r + p.r)*(e.r + p.r)){
          p.hearts -= 1;
          p.invuln = 600;
          if(p.hearts <= 0){
            state.dead = true;
            endRun('You fell in the depths');
          }
        }
      }

      // prune if dead
      if(e._dead){ state.entities.splice(i,1); continue; }
    }

    // enemy bullets -> player
    for(let i=state.ebullets.length-1;i>=0;i--){ const b=state.ebullets[i]; b.x+=b.vx; b.y+=b.vy; b.life -= dt; if(b.life<=0 || outOfRoom(b.x,b.y)){ state.ebullets.splice(i,1); continue; }
      if(p.invuln<=0 && dist2(b.x,b.y,p.x,p.y) < (b.r+p.r)*(b.r+p.r)){
        p.hearts -= 1; p.invuln=600; state.ebullets.splice(i,1); if(p.hearts<=0){ state.dead=true; endRun('You fell in the depths'); }
      }
    }

    // pickups
    for(let i=state.pickups.length-1;i>=0;i--){ const pk=state.pickups[i]; pk.t=(pk.t||0)+dt; if(dist2(pk.x,pk.y,p.x,p.y) < (pk.r+p.r)*(pk.r+p.r)){
        if(pk.type==='heart' && p.hearts<p.maxHearts){ p.hearts++; state.pickups.splice(i,1); }
        else if(pk.type==='item'){ giveItem(state, p, pk.item); state.pickups.splice(i,1); if(state.room) state.room.treasureTaken=true; }
        else if(pk.type==='stairs'){ if(p.mods.healOnBoss){ p.hearts = p.maxHearts; } nextFloor(); state.pickups.splice(i,1); return; }
      }
    }

    if(state.room && (state.room.type===RT.COMBAT || state.room.type===RT.BOSS)){
      if(state.entities.length===0 && state.ebullets.length===0){ state.lockDoors=false; state.room.cleared=true; if(state.room.type===RT.BOSS){ state.pickups.push({type:'stairs', x:canvas.width/2, y:canvas.height/2, r:14}); } }
      else { state.lockDoors=true; }
    } else { state.lockDoors=false; }

    if(state.toast){ state.toast.t -= dt; if(state.toast.t<=0) state.toast=null; }

    updateHUD();
  }

  function nextFloor(){
    saveCurrentRoomState();
    state.floor++;
    if(state.floor>MAX_FLOORS){ state.win=true; endRun('You conquered the Lich-King!'); return; }
    resetItemPool(state);
    state.map = genFloor(state.floor);
    const startCell = state.map.grid[state.map.sy][state.map.sx];
    state.player.x = canvas.width/2; state.player.y = canvas.height/2;
    enterRoom(startCell);
  }

  function draw(){
    cx.clearRect(0,0,canvas.width,canvas.height);

    // Floor & walls
    drawRoomFrame();

    // Doors (color-coded by destination)
    drawDoors();

    // effects (explosions)
    for(let i=state.effects.length-1;i>=0;i--){ const ef=state.effects[i]; ef.life-=16; ef.r+=2; cx.save(); cx.globalAlpha=ef.life/260; cx.strokeStyle='#ffd263'; cx.lineWidth=3; cx.beginPath(); cx.arc(ef.x,ef.y,ef.r,0,TWO_PI); cx.stroke(); cx.restore(); if(ef.life<=0) state.effects.splice(i,1); }

    // pickups (use PNGs if provided, fall back to vector)
    for(const pk of state.pickups){
      if(pk.type==='heart'){
        if(!drawSprite('heart', pk.x, pk.y, pk.r)) {
          cx.save(); cx.translate(pk.x, pk.y); cx.fillStyle = '#ff6b81'; cx.beginPath(); const r=8; cx.moveTo(0, r/2);
          cx.bezierCurveTo(r, -r/2, r*1.2, r, 0, r*1.4); cx.bezierCurveTo(-r*1.2, r, -r, -r/2, 0, r/2); cx.fill(); cx.restore();
        }
      } else if(pk.type==='item'){
        if(!drawSprite('item', pk.x, pk.y, pk.r)){
          cx.save(); cx.translate(pk.x,pk.y); cx.fillStyle='#f5d76e'; cx.beginPath(); cx.arc(0,0,10,0,TWO_PI); cx.fill(); cx.fillStyle='#0b0f15'; cx.font='bold 12px system-ui'; cx.textAlign='center'; cx.fillText('★',0,4); cx.restore();
        }
      } else if(pk.type==='stairs'){
        if(!drawSprite('stairs', pk.x, pk.y, pk.r)){
          cx.save(); cx.translate(pk.x,pk.y); cx.fillStyle='#7de38b'; cx.beginPath(); cx.moveTo(-10,10); cx.lineTo(0,-10); cx.lineTo(10,10); cx.closePath(); cx.fill(); cx.restore();
        }
      }
    }

    // enemies (sprite if available, else circle)
    for(const e of state.entities){
      const angleToPlayer = state.player ? Math.atan2(state.player.y-e.y, state.player.x-e.x) : 0;
      const used = drawSprite(e.sprite || e.etype, e.x, e.y, e.r, angleToPlayer);
      if(!used){
        // fallback vector
        cx.save(); cx.translate(e.x,e.y);
        let color = e.etype==='boss'? '#f06c6c' : e.etype==='turret'? '#a48df2' : e.etype==='archer'||e.etype==='sniper'? '#87c1ff' : e.etype==='warlock'? '#ffb86b' : e.etype==='bomber'? '#ffd263' : '#c7d2e0'; if(e.elite){ color = '#ff6b81'; }
        cx.fillStyle=color; cx.beginPath(); cx.arc(0,0,e.r,0,TWO_PI); cx.fill();
        cx.restore();
      }
      // hp ring (keep UI ring even with sprites)
      cx.save();
      cx.translate(e.x,e.y);
      cx.strokeStyle='#2b394d'; cx.lineWidth=4; cx.beginPath(); cx.arc(0,0,e.r+5,0,TWO_PI); cx.stroke();
      const baseMax = (e.etype==='boss')?(80+state.floor*20): (e.etype==='turret'?(4+Math.floor(state.floor/1.5)):(e.etype==='archer'||e.etype==='sniper'?(3+Math.floor(state.floor/2)):(e.etype==='warlock'? (5+Math.floor(state.floor/2)) : (2+Math.floor(state.floor/2)))));
      const hpPct=clamp(e.hp/baseMax,0,1); cx.strokeStyle='#a1cdfc'; cx.beginPath(); cx.arc(0,0,e.r+5,-Math.PI/2,-Math.PI/2 + hpPct*TWO_PI); cx.stroke();
      cx.restore();
    }

    // enemy bullets
    // If you added a bullet PNG, uncomment the sprite drawer here:
    // for(const b of state.ebullets){ if(!drawSprite('bullet', b.x, b.y, b.r)) { cx.fillStyle='#f6a38a'; cx.beginPath(); cx.arc(b.x,b.y,b.r,0,TWO_PI); cx.fill(); } }
    cx.fillStyle = '#f6a38a'; for (const b of state.ebullets){ cx.beginPath(); cx.arc(b.x,b.y,b.r,0,TWO_PI); cx.fill(); }

    // player
    const p = state.player; if(p){
      // Draw sprite aligned to aim direction
      if(!drawSprite(p.sprite || 'player', p.x, p.y, p.r, p.angle)){
        // fallback vector player
        cx.save(); cx.translate(p.x,p.y); if(p.invuln>0){ cx.globalAlpha = 0.6 + 0.4*Math.sin(state.time*0.02); }
        cx.fillStyle = '#e8eef7'; cx.beginPath(); cx.arc(0,0,p.r,0,TWO_PI); cx.fill(); cx.strokeStyle = '#0b0f15'; cx.lineWidth = 3; cx.beginPath(); cx.arc(0,0,p.r-4, p.angle-0.4, p.angle+0.4); cx.stroke(); cx.save(); cx.rotate(p.angle); cx.fillStyle = '#a1cdfc'; cx.fillRect(8,-2, 14,4); cx.restore(); cx.restore();
      }
    }

    // beams
    for(const bm of state.beams){ const L=900; const ex = bm.x + Math.cos(bm.angle)*L; const ey = bm.y + Math.sin(bm.angle)*L; cx.save(); cx.globalAlpha = bm.life/120; cx.strokeStyle='#7de38b'; cx.lineWidth=3; cx.beginPath(); cx.moveTo(bm.x,bm.y); cx.lineTo(ex,ey); cx.stroke(); cx.restore(); }

    // bullets
    // If you added a bullet PNG, you can draw it here similarly. Default circle:
    cx.fillStyle = '#a1cdfc'; for(const b of state.bullets){ cx.beginPath(); cx.arc(b.x,b.y,b.r,0,TWO_PI); cx.fill(); }

    // UI hints
    if(state.room && state.room.type===RT.TREASURE){ cx.save(); cx.fillStyle='#f5d76e'; cx.font='700 16px system-ui'; cx.textAlign='center'; cx.fillText('Treasure Room', canvas.width/2, ROOM_ORIGIN.y-16); cx.restore(); }
    if(state.room && state.room.type===RT.BOSS){ cx.save(); cx.fillStyle='#f06c6c'; cx.font='700 16px system-ui'; cx.textAlign='center'; cx.fillText('Boss Room', canvas.width/2, ROOM_ORIGIN.y-16); cx.restore(); }

    // Minimap
    drawMiniMap();

    // Toast (item pickup)
    if(state.toast){ cx.save(); cx.globalAlpha = clamp(state.toast.t/2200, 0, 1); cx.fillStyle='#0f1620cc'; cx.strokeStyle='#243142'; cx.lineWidth=2; const pad=10; cx.font='700 14px system-ui'; const w = Math.min(520, cx.measureText(state.toast.text).width + pad*2); const x=(canvas.width-w)/2, y=20; cx.fillRect(x,y,w,30); cx.strokeRect(x,y,w,30); cx.fillStyle='#f5d76e'; cx.textAlign='center'; cx.fillText(state.toast.text, x+w/2, y+20); cx.restore(); }
  }

  function drawRoomFrame(){
    const x=ROOM_ORIGIN.x, y=ROOM_ORIGIN.y, w=ROOM_W, h=ROOM_H;
    cx.save();
    cx.globalAlpha = 0.08; cx.strokeStyle = '#9db0c7'; cx.lineWidth = 1; const s=40; for(let gx=x;gx<x+w;gx+=s){ cx.beginPath(); cx.moveTo(gx,y); cx.lineTo(gx,y+h); cx.stroke(); } for(let gy=y;gy<y+h;gy+=s){ cx.beginPath(); cx.moveTo(x,gy); cx.lineTo(x+w,gy); cx.stroke(); }
    cx.globalAlpha = 1; cx.strokeStyle = '#243142'; cx.lineWidth = 8; cx.strokeRect(x,y,w,h);
    cx.restore();
  }

  function neighborCell(side){ if(!state.room || !state.map) return null; const x=state.room.x, y=state.room.y; if(side==='up'&&y>0) return state.map.grid[y-1][x]; if(side==='down'&&y<state.map.H-1) return state.map.grid[y+1][x]; if(side==='left'&&x>0) return state.map.grid[y][x-1]; if(side==='right'&&x<state.map.W-1) return state.map.grid[y][x+1]; return null; }

  function doorColorFor(cell){ if(!cell) return '#7de38b'; if(cell.type===RT.TREASURE) return '#f5d76e'; if(cell.type===RT.BOSS) return '#f06c6c'; return '#7de38b'; }

  function drawDoors(){
    const c=state.room; if(!c) return; const x=ROOM_ORIGIN.x, y=ROOM_ORIGIN.y, w=ROOM_W, h=ROOM_H;
    cx.save();
    cx.lineWidth=2; cx.strokeStyle = '#243142';
    const upN=neighborCell('up'), dnN=neighborCell('down'), lfN=neighborCell('left'), rtN=neighborCell('right');
    const upCol = state.lockDoors? '#4b1f1f' : doorColorFor(upN);
    const dnCol = state.lockDoors? '#4b1f1f' : doorColorFor(dnN);
    const lfCol = state.lockDoors? '#4b1f1f' : doorColorFor(lfN);
    const rtCol = state.lockDoors? '#4b1f1f' : doorColorFor(rtN);

    if(c.doors.up){ cx.fillStyle=upCol; cx.fillRect(x+w/2-DOOR_W/2, y-4, DOOR_W, 8); if(upN && upN.type===RT.BOSS){ glowDoor(x+w/2-DOOR_W/2, y-4, DOOR_W, 8); } }
    if(c.doors.down){ cx.fillStyle=dnCol; cx.fillRect(x+w/2-DOOR_W/2, y+h-4, DOOR_W, 8); if(dnN && dnN.type===RT.BOSS){ glowDoor(x+w/2-DOOR_W/2, y+h-4, DOOR_W, 8); } }
    if(c.doors.left){ cx.fillStyle=lfCol; cx.fillRect(x-4, y+h/2-DOOR_W/2, 8, DOOR_W); if(lfN && lfN.type===RT.BOSS){ glowDoor(x-4, y+h/2-DOOR_W/2, 8, DOOR_W); } }
    if(c.doors.right){ cx.fillStyle=rtCol; cx.fillRect(x+w-4, y+h/2-DOOR_W/2, 8, DOOR_W); if(rtN && rtN.type===RT.BOSS){ glowDoor(x+w-4, y+h/2-DOOR_W/2, 8, DOOR_W); } }
    cx.restore();
  }
  function glowDoor(x,y,w,h){ cx.save(); cx.globalAlpha=0.35; cx.fillStyle='#f06c6c'; cx.fillRect(x-6,y-6,w+12,h+12); cx.restore(); }

  function tryChangeRoom(){
    if(state.lockDoors) { return; }
    if(!state.room || !state.map) return;
    if(!state.player) return;
    const p=state.player; const x=ROOM_ORIGIN.x, y=ROOM_ORIGIN.y, w=ROOM_W, h=ROOM_H;
    const near = 28;
    const atUpDoor = state.room.doors.up && Math.abs(p.x-(x+w/2))<DOOR_W/2 && p.y<y+near;
    const atDownDoor = state.room.doors.down && Math.abs(p.x-(x+w/2))<DOOR_W/2 && p.y>y+h-near;
    const atLeftDoor = state.room.doors.left && Math.abs(p.y-(y+h/2))<DOOR_W/2 && p.x<x+near;
    const atRightDoor = state.room.doors.right && Math.abs(p.y-(y+h/2))<DOOR_W/2 && p.x>x+w-near;
    if(atUpDoor){ const next = state.map.grid[state.room.y-1][state.room.x]; saveCurrentRoomState(); enterRoom(next); p.y = y+h-40; }
    else if(atDownDoor){ const next = state.map.grid[state.room.y+1][state.room.x]; saveCurrentRoomState(); enterRoom(next); p.y = y+40; }
    else if(atLeftDoor){ const next = state.map.grid[state.room.y][state.room.x-1]; saveCurrentRoomState(); enterRoom(next); p.x = x+w-40; }
    else if(atRightDoor){ const next = state.map.grid[state.room.y][state.room.x+1]; saveCurrentRoomState(); enterRoom(next); p.x = x+40; }
  }

  function drawMiniMap(){
    if(!state.map) return; const cellSize=9, pad=6; const mapW=state.map.W*cellSize, mapH=state.map.H*cellSize; const x = canvas.width - mapW - pad - 10; const y = 10;
    cx.save(); cx.globalAlpha=0.9; cx.fillStyle='#0f1620cc'; cx.strokeStyle='#243142'; cx.lineWidth=2; cx.fillRect(x-6,y-6,mapW+12,mapH+12); cx.strokeRect(x-6,y-6,mapW+12,mapH+12);
    for(let gy=0; gy<state.map.H; gy++){
      for(let gx=0; gx<state.map.W; gx++){
        const c = state.map.grid[gy][gx]; if(!c) continue; const rx=x+gx*cellSize, ry=y+gy*cellSize;
        cx.fillStyle = c.type===RT.BOSS? '#f06c6c' : (c.type===RT.TREASURE? '#f5d76e' : (c.type===RT.START? '#a1cdfc' : '#9db0c7'));
        cx.globalAlpha = c.visited? 1.0 : 0.35;
        cx.fillRect(rx,ry,cellSize-1,cellSize-1);
        if(state.room && c.x===state.room.x && c.y===state.room.y){ cx.globalAlpha=1; cx.strokeStyle='#ffffff'; cx.lineWidth=2; cx.strokeRect(rx-1,ry-1,cellSize+1,cellSize+1); }
      }
    }
    cx.restore();
  }

  function lineCircle(x1,y1,x2,y2,cx0,cy0,r){
    const dx=x2-x1, dy=y2-y1; const l2=dx*dx+dy*dy; if(l2===0) return false; let t=((cx0-x1)*dx+(cy0-y1)*dy)/l2; t=clamp(t,0,1); const px=x1+t*dx, py=y1+t*dy; const d2=dist2(px,py,cx0,cy0); return d2<=r*r;
  }

  function outOfRoom(x,y){ return x<ROOM_ORIGIN.x || x>ROOM_ORIGIN.x+ROOM_W || y<ROOM_ORIGIN.y || y>ROOM_ORIGIN.y+ROOM_H; }
  function confineToRoom(o){ o.x = clamp(o.x, ROOM_ORIGIN.x+10, ROOM_ORIGIN.x+ROOM_W-10); o.y = clamp(o.y, ROOM_ORIGIN.y+10, ROOM_ORIGIN.y+ROOM_H-10); }

  function updateHUD(){ const p = state.player; if(!p) return; const rt = state.room? state.room.type : '—'; const label = rt===RT.START?'Start': rt===RT.TREASURE?'Treasure': rt===RT.BOSS?'Boss':'Combat'; if(HUD.hearts) HUD.hearts.textContent = '❤'.repeat(p.hearts) + ' '.repeat(Math.max(0,p.maxHearts-p.hearts)); if(HUD.ammo) HUD.ammo.textContent = `${p.ammo} / ${p.clipSize}`; if(HUD.level) HUD.level.textContent = `Floor ${state.floor} — ${label}`; if(HUD.score) HUD.score.textContent = `Score ${state.score}`; }

  let last=performance.now();
  function loop(t){ const dt = clamp(t-last, 0, 40); last=t; if(!state.idle && !state.dead && !state.win){ try { update(dt); tryChangeRoom(); } catch(err){ console.error('Update error:', err); } }
    draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  // preload sprites in the background (game will draw vector fallbacks until ready)
  loadAssets();

  // expose some things for console debugging (optional)
  window.__game = { state, input, Assets };
})();
