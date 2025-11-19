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
  const minimapCanvas = document.getElementById('minimap');
  const minimapCx = minimapCanvas.getContext('2d');
  const HUD = {
    hearts: document.getElementById('hearts'),
    ammo: document.getElementById('ammo'),
    level: document.getElementById('level'),
    score: document.getElementById('score'),
    reloadFill: document.getElementById('reloadFill'),
    itemListContent: document.getElementById('itemListContent'),
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
      player:  './assets/knight.png',
      ghoul:   './assets/ghoul.png',
      archer:  './assets/skeleton.png',
      turret:  './assets/slime.png',
      charger: './assets/charger.png',
      warlock: './assets/warlock.png',
      sniper:  './assets/sniper.png',
      bomber:  './assets/bomber.png',
      boss:    './assets/boss.png',
      wall:    './assets/wall.png',
      // Optional UI pickups (only if you add the files):
      heart:   './assets/heart.png',
      item:    './assets/item.png',
      stairs:  './assets/stairs.png',
      menu:    './assets/menu.png',
      // Optional projectile:
      bullet:  './assets/bullet.png',
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
    lockDoors:false, toast:null, itemPool:[], clearProjectilesTimer:0, resetTimer:0,

  };
  state.newRun = newRun; // function defined later
  initControls(canvas, state);

  // ===== World/Rooms =====
  const ROOM_W = 1000, ROOM_H = 580;
  const ROOM_ORIGIN = {x:(canvas.width-ROOM_W)/2, y:(canvas.height-ROOM_H)/2};
  const DOOR_W = 100, DOOR_H = 25;
  const MAX_FLOORS = 15;

  const RT = { START:'start', COMBAT:'combat', TREASURE:'treasure', BOSS:'boss', SPIKES:'spikes', LASER:'laser', CRUSHER:'crusher', MAZE:'maze' };

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
    // place treasure and challenge rooms
    const maxTreasures = Math.min((Math.random() < 0.15 ? 2 : 1), state.itemPool.length); // 15% chance for 2 treasures
    let placed=0; for(let tries=0; tries<200 && placed<maxTreasures; tries++){
      const r = pick(rooms);
      const cell = grid[r.y][r.x];
      if(cell.type===RT.COMBAT){ cell.type=RT.TREASURE; placed++; }
    }
    // Add challenge rooms (10% spawn rate)
    for(const r of rooms){
      if(grid[r.y][r.x].type === RT.COMBAT && Math.random() < 0.10){
        const challengeTypes = [RT.SPIKES, RT.LASER, RT.CRUSHER, RT.MAZE];
        grid[r.y][r.x].type = pick(challengeTypes);
      }
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
    state.entities = []; state.ebullets = []; state.bullets = []; state.beams = []; state.effects = []; state.pickups = []; state.clearProjectilesTimer = 0;
    state.room = cell; if(state.room && typeof state.room.t!=='number') state.room.t = 0;
    
    // Initialize challenge room obstacles
    state.roomState = { obstacles: null, trapTimer: 0 };
    if(cell && (cell.type === RT.SPIKES || cell.type === RT.LASER || cell.type === RT.CRUSHER || cell.type === RT.MAZE)) {
      state.roomState.obstacles = [];
      
      if(cell.type === RT.SPIKES) {
        // Random square spike patches
        for(let i = 0; i < 8; i++) {
          const size = 30 + Math.random() * 20;
          state.roomState.obstacles.push({
            type: 'spike',
            x: ROOM_ORIGIN.x + Math.random() * (ROOM_W - 80) + 40,
            y: ROOM_ORIGIN.y + Math.random() * (ROOM_H - 80) + 40,
            w: size,
            h: size,
            active: Math.random() > 0.5,
            timer: Math.random() * 2000
          });
        }
      } else if(cell.type === RT.LASER) {
        // Laser grid pattern
        for(let i = 0; i < 4; i++) {
          state.roomState.obstacles.push({
            type: 'laser',
            x1: ROOM_ORIGIN.x + 50,
            y1: ROOM_ORIGIN.y + 100 + i * 120,
            x2: ROOM_ORIGIN.x + ROOM_W - 50,
            y2: ROOM_ORIGIN.y + 100 + i * 120,
            active: i % 2 === 0,
            timer: i * 500
          });
        }
      } else if(cell.type === RT.CRUSHER) {
        // Moving crusher blocks with random movement
        for(let i = 0; i < 3; i++) {
          state.roomState.obstacles.push({
            type: 'crusher',
            x: ROOM_ORIGIN.x + 100 + i * 300,
            y: ROOM_ORIGIN.y + 100 + Math.random() * 300,
            w: 60,
            h: 60,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            timer: i * 1000,
            changeTimer: 0
          });
        }
      } else if(cell.type === RT.MAZE) {
        // Maze walls
        const walls = [
          {x: ROOM_ORIGIN.x + 150, y: ROOM_ORIGIN.y + 50, w: 20, h: 200},
          {x: ROOM_ORIGIN.x + 350, y: ROOM_ORIGIN.y + 200, w: 20, h: 250},
          {x: ROOM_ORIGIN.x + 550, y: ROOM_ORIGIN.y + 80, w: 20, h: 180},
          {x: ROOM_ORIGIN.x + 750, y: ROOM_ORIGIN.y + 300, w: 20, h: 200},
          {x: ROOM_ORIGIN.x + 200, y: ROOM_ORIGIN.y + 350, w: 200, h: 20},
          {x: ROOM_ORIGIN.x + 500, y: ROOM_ORIGIN.y + 450, w: 300, h: 20}
        ];
        state.roomState.obstacles = walls.map(w => ({...w, type: 'wall'}));
      }
    }
    
    if(cell){ cell.visited = true; }
    if(cell){
      if(cell.entities){ state.entities = cell.entities.map(e=>({...e})); }
      if(cell.pickups){ state.pickups = cell.pickups.map(p=>({...p})); }
      if(!cell.spawned){
        if(cell.type===RT.COMBAT){ spawnCombatWave(state, randomRoomEdgePoint); cell.spawned=true; }
        if(cell.type===RT.TREASURE && !cell.treasureTaken){ spawnTreasure(state, canvas); cell.spawned=true; }
        if(cell.type===RT.BOSS){ spawnBoss(state, canvas); cell.spawned=true; }
        // Challenge rooms also spawn enemies
        if(cell.type===RT.SPIKES || cell.type===RT.LASER || cell.type===RT.CRUSHER || cell.type===RT.MAZE){ 
          spawnCombatWave(state, randomRoomEdgePoint); 
          cell.spawned=true; 
        }
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
      type:'player', x,y, r:20, speed:2.8,
      vx:0, vy:0,
      hearts:50, maxHearts:50,
      invuln:0,
      rollCD:0, rolling:0,
      angle:0,
      rollAngle:0,
      clipSize:6, ammo:6, reloadTime:520, reloading:0,
      fireCD:0, fireDelay:375, bulletSpeed:5.8, bulletSpread:0.05,
      items:[],
      // Laser charge system
      laserCharge:0, laserMaxCharge:2000, laserCharging:false, laserBeam:null,
      mods:{ 
        triple:false, laser:false, pierce:false, explosive:false, rapid:0, speed:0, ricochet:false, 
        damage:0, range:0, knockback:1, doubleShot:false, bulletSize:1, invulnTime:1, multiBounce:1,
        heartRegen:false, ghostBullets:false, scatterShot:false, accuracy:0, fragileDamage:false,
        lifeSteal:false, explodeOnHit:false, randomDamage:false, homing:false, spiralShot:false,
        bulletTime:false, magneticBullets:false, poisonShots:false, iceShots:false, fireShots:false,
        berserker:false, shotgun:false, boomerang:false, armorPierce:false, knockbackResist:false
      },
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
      if(input.shoot) {
        shootPlayer(p);
      } else if(p.mods.laser && p.laserCharging) {
        // Stop laser charging if not shooting
        p.laserCharging = false;
      }
    }
  }

  function shootPlayer(p){
    if(p.reloading>0 || p.fireCD>0 || p.ammo<=0) return;
    p.ammo--; p.fireCD = p.fireDelay;
    
    // Determine bullet count and spread
    let count = 1;
    let spread = 0.05;
    
    if(p.mods.shotgun) { count = 8; spread = 0.6; }
    else if(p.mods.scatterShot) { count = 5; spread = 0.4; }
    else if(p.mods.triple) { count = 3; spread = 0.18; }
    else if(p.mods.doubleShot) { count = 2; spread = 0.1; }
    
    const types = { laser: p.mods.laser };
    const accuracy = p.mods.accuracy || 0;
    
    for(let i=0;i<count;i++){
      const off = (count===1)?0 : (-spread + i*(spread*2)/(count-1));
      const ang = p.angle + off + (Math.random()-0.5) * accuracy;
      
      // Calculate damage (with random damage modifier)
      let damage = 1 + (p.mods.damage || 0);
      if(p.mods.randomDamage) damage = Math.ceil(Math.random() * 4);
      
      // Calculate bullet size
      const bulletSize = 6 * (p.mods.bulletSize || 1);
      
      // Calculate bounces
      let bounces = 0;
      if(p.mods.ricochet) bounces = p.mods.multiBounce || 1;
      
      if(types.laser){
        // Laser charge system - start charging instead of immediate fire
        p.laserCharging = true;
      } else {
        const bullet = {
          x:p.x, y:p.y, r:bulletSize, 
          vx:Math.cos(ang)*p.bulletSpeed, vy:Math.sin(ang)*p.bulletSpeed, 
          life:900*(1+(p.mods.range||0)*0.25), 
          pierce:p.mods.pierce, explosive:p.mods.explosive, 
          bounces:bounces, dmg:damage, hits:new Set(), 
          type:'playerbullet', angle:ang,
          // New modifiers
          homing: p.mods.homing,
          spiral: p.mods.spiralShot,
          poison: p.mods.poisonShots,
          ice: p.mods.iceShots,
          fire: p.mods.fireShots,
          boomerang: p.mods.boomerang,
          ghost: p.mods.ghostBullets
        };
        state.bullets.push(bullet);
      }
    }
    if(p.ammo===0) startReload(p);
  }

  function startReload(p){ if(p.reloading<=0){ p.reloading=p.reloadTime; if(HUD.reloadFill) HUD.reloadFill.style.width='0%'; } }
  function dropHeart(x,y){ state.pickups.push({type:'heart', x,y, r:8, t:0}); }

  // ===== Game Flow =====
  function newRun(){
    state.idle=false; state.dead=false; state.win=false; showOverlay(false); restartBtn.hidden=true; startBtn.hidden=true;
    state.time=0; state.floor=1; state.score=0; state.entities=[]; state.bullets=[]; state.ebullets=[]; state.pickups=[]; state.beams=[]; state.effects=[]; state.toast=null; state.clearProjectilesTimer=0; state.resetTimer=0;
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
    
    // Update challenge room obstacles
    if(state.roomState?.obstacles) {
      state.roomState.trapTimer += dt;
      
      for(const obs of state.roomState.obstacles) {
        if(obs.type === 'spike') {
          obs.timer += dt;
          if(obs.timer >= 2000) {
            obs.active = !obs.active;
            obs.timer = 0;
          }
          
          // Square spike damage to player - check collision with player radius
          if(obs.active) {
            if(p.x + p.r > obs.x - obs.w/2 && p.x - p.r < obs.x + obs.w/2 && 
               p.y + p.r > obs.y - obs.h/2 && p.y - p.r < obs.y + obs.h/2) {
              if(p.invulnTime <= 0) {
                p.hearts--;
                p.invulnTime = 1000 * (p.mods.invulnTime || 1);
                console.log('Spike hit! Hearts:', p.hearts);
                if(p.hearts <= 0) gameOver();
              }
            }
          }
        } else if(obs.type === 'laser') {
          obs.timer += dt;
          if(obs.timer >= 3000) {
            obs.active = !obs.active;
            obs.timer = 0;
          }
          
          // Laser damage to player
          if(obs.active) {
            const distance = lineToPointDistance(obs.x1, obs.y1, obs.x2, obs.y2, p.x, p.y);
            if(distance < p.r + 10) { // Increased detection radius
              if(p.invulnTime <= 0) {
                p.hearts--;
                p.invulnTime = 1000 * (p.mods.invulnTime || 1);
                console.log('Laser hit! Hearts:', p.hearts, 'Distance:', distance);
                if(p.hearts <= 0) gameOver();
              }
            }
          }
        } else if(obs.type === 'crusher') {
          obs.timer += dt;
          obs.changeTimer += dt;
          
          // Random direction change every 2 seconds
          if(obs.changeTimer >= 2000) {
            obs.vx = (Math.random() - 0.5) * 4;
            obs.vy = (Math.random() - 0.5) * 4;
            obs.changeTimer = 0;
          }
          
          // Move crusher
          obs.x += obs.vx;
          obs.y += obs.vy;
          
          // Bounce off walls
          if(obs.x <= ROOM_ORIGIN.x + 50 || obs.x >= ROOM_ORIGIN.x + ROOM_W - obs.w - 50) {
            obs.vx *= -1;
            obs.x = Math.max(ROOM_ORIGIN.x + 50, Math.min(ROOM_ORIGIN.x + ROOM_W - obs.w - 50, obs.x));
          }
          if(obs.y <= ROOM_ORIGIN.y + 50 || obs.y >= ROOM_ORIGIN.y + ROOM_H - obs.h - 50) {
            obs.vy *= -1;
            obs.y = Math.max(ROOM_ORIGIN.y + 50, Math.min(ROOM_ORIGIN.y + ROOM_H - obs.h - 50, obs.y));
          }
          
          // Crusher damage and collision with player
          if(p.x + p.r > obs.x && p.x - p.r < obs.x + obs.w && p.y + p.r > obs.y && p.y - p.r < obs.y + obs.h) {
            if(p.invulnTime <= 0) {
              p.hearts--;
              p.invulnTime = 1000 * (p.mods.invulnTime || 1);
              if(p.hearts <= 0) gameOver();
            }
            
            // Push player away from crusher
            const pushX = (p.x < obs.x + obs.w/2) ? -1 : 1;
            const pushY = (p.y < obs.y + obs.h/2) ? -1 : 1;
            p.x += pushX * 8;
            p.y += pushY * 8;
          }
        }
      }
    }

    const ix = (input.d - input.a), iy = (input.s - input.w);
    let mag = Math.hypot(ix, iy); let vx=0, vy=0; if(mag>0){ vx = (ix/mag) * p.speed; vy = (iy/mag) * p.speed; }

    if(p.rollCD>0) p.rollCD -= dt;
    if(p.rolling>0){ 
      p.rolling -= dt; 
      p.invuln = p.rolling; 
      const newX = p.x + Math.cos(p.rollAngle) * 6.5;
      const newY = p.y + Math.sin(p.rollAngle) * 6.5;
      if(!checkMazeCollision(newX, newY, p.r)) {
        p.x = newX;
        p.y = newY;
      }
    } else { 
      const newX = p.x + vx;
      const newY = p.y + vy;
      if(!checkMazeCollision(newX, newY, p.r)) {
        p.x = newX;
        p.y = newY;
      }
    }

    confineToRoom(p);

    if(input.roll && p.rollCD<=0 && p.rolling<=0){ 
      p.rolling = 320; 
      p.rollCD = 900; 
      p.invuln=320; 
      // Store the direction of movement for the roll
      if(mag > 0) {
        p.rollAngle = Math.atan2(iy, ix);
      } else {
        // If not moving, roll in the direction you're aiming
        p.rollAngle = p.angle;
      }
    }
    if(p.invuln>0) p.invuln -= dt; if(p.fireCD>0) p.fireCD -= dt;
    if(p.hitFlash > 0) p.hitFlash -= dt;

    // Passive item effects
    if(p.mods.heartRegen && Math.random() < 0.001 && p.hearts < p.maxHearts){
      p.hearts++;
    }
    
    // Berserker mode - faster when low HP
    if(p.mods.berserker && p.hearts <= 1){
      p.speed = Math.max(p.speed, 4.5);
      p.fireDelay = Math.max(p.fireDelay * 0.7, 50);
    }

    // Laser charge system
    if(p.mods.laser){
      if(p.laserCharging){
        p.laserCharge += dt;
        if(p.laserCharge >= p.laserMaxCharge){
          // Fire the laser beam
          const damage = 3 + (p.mods.damage || 0);
          p.laserBeam = {
            x: p.x, y: p.y, angle: p.angle, 
            life: 1500, // Longer duration
            tickTimer: 0, tickRate: 100, // Tick damage every 100ms
            damage: damage, hits: new Set()
          };
          state.beams.push(p.laserBeam);
          p.laserCharge = 0;
          p.laserCharging = false;
        }
      } else {
        // Decay charge when not charging
        p.laserCharge = Math.max(0, p.laserCharge - dt * 2);
      }
    }

    if(p.reloading>0){ p.reloading -= dt; const pct = 1 - clamp(p.reloading / p.reloadTime, 0,1); if(HUD.reloadFill) HUD.reloadFill.style.width=(pct*100).toFixed(0)+'%'; if(p.reloading<=0){ p.ammo = p.clipSize; } }
    else if(input.reload && p.ammo < p.clipSize){ startReload(p); }
    
    // Handle reset timer (hold T for 3 seconds to reset)
    if(input.reset){
      state.resetTimer += dt;
      if(state.resetTimer >= 3000){
        // Reset the game
        state.resetTimer = 0;
        newRun();
        return;
      }
    } else {
      state.resetTimer = 0;
    }

    playerAimAndFire(p);

    for(let i=state.bullets.length-1;i>=0;i--){ const b=state.bullets[i]; 
      
      // Special bullet behaviors
      if(b.homing && state.entities.length > 0){
        // Find closest enemy for homing
        let closest = null, closestDist = Infinity;
        for(const e of state.entities){
          if(e._dead) continue;
          const dist = Math.hypot(b.x - e.x, b.y - e.y);
          if(dist < closestDist){ closest = e; closestDist = dist; }
        }
        if(closest){
          const toTarget = Math.atan2(closest.y - b.y, closest.x - b.x);
          const currentAngle = Math.atan2(b.vy, b.vx);
          const angleDiff = toTarget - currentAngle;
          const turnRate = 0.05; // How fast bullets turn
          const newAngle = currentAngle + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnRate);
          const speed = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(newAngle) * speed;
          b.vy = Math.sin(newAngle) * speed;
        }
      }
      
      if(b.spiral){
        // Add spiral motion
        const spiralForce = 0.1;
        const perpX = -b.vy * spiralForce;
        const perpY = b.vx * spiralForce;
        b.vx += perpX;
        b.vy += perpY;
      }
      
      if(b.boomerang && b.life < 600){
        // Start returning to player
        const toPlayer = Math.atan2(p.y - b.y, p.x - b.x);
        const speed = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(toPlayer) * speed;
        b.vy = Math.sin(toPlayer) * speed;
      }
      
      b.x+=b.vx; b.y+=b.vy; b.life -= dt; 
      
      // Handle ghost bullets - wrap around room edges
      if(b.ghost && outOfRoom(b.x, b.y)) {
        if(b.x < ROOM_ORIGIN.x) b.x = ROOM_ORIGIN.x + ROOM_W - 10;
        else if(b.x > ROOM_ORIGIN.x + ROOM_W) b.x = ROOM_ORIGIN.x + 10;
        if(b.y < ROOM_ORIGIN.y) b.y = ROOM_ORIGIN.y + ROOM_H - 10;
        else if(b.y > ROOM_ORIGIN.y + ROOM_H) b.y = ROOM_ORIGIN.y + 10;
        continue;
      }
      
      if(b.life<=0 || outOfRoom(b.x,b.y)){ if(b.bounces>0){ b.bounces--; if(b.x<ROOM_ORIGIN.x||b.x>ROOM_ORIGIN.x+ROOM_W) b.vx*=-1; if(b.y<ROOM_ORIGIN.y||b.y>ROOM_ORIGIN.y+ROOM_H) b.vy*=-1; b.life=300; } else { state.bullets.splice(i,1); } continue; } }
    for(let i=state.beams.length-1;i>=0;i--){ const bm=state.beams[i]; bm.life -= dt; if(bm.life<=0){ state.beams.splice(i,1); } }

    // --- bullets -> enemies collision (prevent multi-hits) ---
    for(let j=state.bullets.length-1;j>=0;j--){
      const b=state.bullets[j];
      if(!b) continue;
      
      for(let i=state.entities.length-1;i>=0;i--){
        const e = state.entities[i];
        if(!e || e._dead) continue;
        if(b.hits && b.hits.has(e)) continue;
        
        if(dist2(b.x,b.y,e.x,e.y) < (b.r+e.r)*(b.r+e.r)){
          // Handle bullet bouncing off enemies
          if(b.bounces > 0 && !b.hits.has(e)){
            const dx = b.x - e.x, dy = b.y - e.y;
            const norm = Math.hypot(dx, dy) || 1;
            const nx = dx / norm, ny = dy / norm;
            const dot = b.vx * nx + b.vy * ny;
            b.vx -= 2 * dot * nx;
            b.vy -= 2 * dot * ny;
            b.bounces--;
            b.life = Math.max(b.life, 300);
            // Move bullet away from enemy to prevent sticking
            b.x = e.x + nx * (b.r + e.r + 2);
            b.y = e.y + ny * (b.r + e.r + 2);
            break; // Don't apply damage when bouncing
          }
          
          if(b.hits) b.hits.add(e);
          
          // Apply knockback
          const knockbackForce = 5 * (p.mods.knockback || 1);
          const dx = e.x - b.x, dy = e.y - b.y;
          const dist = Math.hypot(dx, dy) || 1;
          e.x += (dx / dist) * knockbackForce;
          e.y += (dy / dist) * knockbackForce;
          
          // Keep enemy in room bounds
          e.x = clamp(e.x, ROOM_ORIGIN.x + e.r, ROOM_ORIGIN.x + ROOM_W - e.r);
          e.y = clamp(e.y, ROOM_ORIGIN.y + e.r, ROOM_ORIGIN.y + ROOM_H - e.r);
          
          // Add hit flash
          e.hitFlash = 150; // Flash for 150ms
          
          // Handle Shield Guardian's shield system
          let damage = b.dmg || 1;
          if(e.etype === 'boss5' && e.shieldHP > 0){
            e.shieldHP -= damage;
            if(e.shieldHP < 0){
              damage = -e.shieldHP; // Overflow damage goes to HP
              e.shieldHP = 0;
              e.hp -= damage;
            }
            // Shield absorbs all damage
          } else {
            e.hp -= damage;
          }
          
          // Apply damage over time effects
          if(b.poison){
            if(!e.poison) e.poison = { damage: 1, duration: 3000, tickTimer: 0 };
            else { e.poison.duration = 3000; e.poison.damage = Math.max(e.poison.damage, 1); }
          }
          if(b.fire){
            if(!e.fire) e.fire = { damage: 2, duration: 2000, tickTimer: 0 };
            else { e.fire.duration = 2000; e.fire.damage = Math.max(e.fire.damage, 2); }
          }
          if(b.ice){
            if(!e.ice) e.ice = { slowFactor: 0.5, duration: 2500 };
            else e.ice.duration = 2500;
          }
          
          if(b.explosive){ explode(state,b.x,b.y); }
          
          if(e.hp<=0){
            e._dead = true;
            
            // Life steal modifier
            if(p.mods.lifeSteal && p.hearts < p.maxHearts){
              p.hearts++;
            }
            
            onEnemyDie(state, e);
          }
          
          // For non-piercing bullets, remove bullet and stop checking other enemies
          if(!b.pierce){
            state.bullets.splice(j,1);
            break; // Stop checking other enemies for this bullet
          }
        }
      }
    }

    // enemies (movement + behavior)
    for(let i=state.entities.length-1;i>=0;i--){ const e = state.entities[i]; e.t += dt;
      // Update hit flash timer
      if(e.hitFlash > 0) e.hitFlash -= dt;
      
      // Process damage over time effects
      if(e.poison){
        e.poison.tickTimer -= dt;
        if(e.poison.tickTimer <= 0){
          e.poison.tickTimer = 500; // Tick every 0.5 seconds
          e.hp -= e.poison.damage;
          e.hitFlash = 100;
          e.dotFlash = { type: 'poison', timer: 100 }; // Purple flash
          if(e.hp <= 0) { e._dead = true; onEnemyDie(state, e); }
        }
        e.poison.duration -= dt;
        if(e.poison.duration <= 0) delete e.poison;
      }
      
      if(e.fire){
        e.fire.tickTimer -= dt;
        if(e.fire.tickTimer <= 0){
          e.fire.tickTimer = 400; // Tick every 0.4 seconds
          e.hp -= e.fire.damage;
          e.hitFlash = 100;
          e.dotFlash = { type: 'fire', timer: 100 }; // Orange flash
          if(e.hp <= 0) { e._dead = true; onEnemyDie(state, e); }
        }
        e.fire.duration -= dt;
        if(e.fire.duration <= 0) delete e.fire;
      }
      
      if(e.ice){
        e.ice.duration -= dt;
        if(e.ice.duration <= 0) delete e.ice;
      }
      
      // Update DOT flash timer
      if(e.dotFlash) {
        e.dotFlash.timer -= dt;
        if(e.dotFlash.timer <= 0) delete e.dotFlash;
      }
      
      const dx = p.x - e.x, dy = p.y - e.y; const m = Math.hypot(dx,dy)||1;
      
      // Apply ice slow effect
      const speedMultiplier = e.ice ? e.ice.slowFactor : 1;
      
      if(e.etype==='ghoul'){ e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier; keepEnemyInBounds(e); }
      else if(e.etype==='archer'){ e.x += (dx/m)*e.speed*0.7*speedMultiplier; e.y += (dy/m)*e.speed*0.7*speedMultiplier; keepEnemyInBounds(e); e.shootCD -= dt; if(e.shootCD<=0){ e.shootCD = rndi(1000,1500); const base = Math.atan2(dy,dx); const a = base + rnd(-0.08,0.08); const sp=2.4; state.ebullets.push({x:e.x,y:e.y,r:5,vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:3200, angle:a, type:'arrow'}); } }
      else if(e.etype==='turret'){ e.shootCD -= dt; if(e.shootCD<=0){ e.shootCD = 1200; const n=10; const base = state.time*0.004; for(let k=0;k<n;k++){ const a=base+(k/n)*TWO_PI; const sp=1.9; state.ebullets.push({x:e.x,y:e.y,r:6,vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:3600, type:'slime'}); } } }
      else if(e.etype==='charger'){ e.dashCD -= dt; if(e.dashCD<=0){ e.dashCD=1200; const a=Math.atan2(dy,dx); e.vx=Math.cos(a)*3.6*speedMultiplier; e.vy=Math.sin(a)*3.6*speedMultiplier; e.dashT=240; } if(e.dashT>0){ e.x+=e.vx; e.y+=e.vy; keepEnemyInBounds(e); e.dashT-=dt; } else { e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier; keepEnemyInBounds(e); } }
      else if(e.etype==='warlock'){ e.x += (dx/m)*e.speed*0.6*speedMultiplier; e.y += (dy/m)*e.speed*0.6*speedMultiplier; keepEnemyInBounds(e); e.shootCD -= dt; if(e.shootCD<=0){ e.shootCD=1000; const base=Math.atan2(dy,dx); for(let k=-2;k<=2;k++){ const a=base + k*0.12; state.ebullets.push({x:e.x,y:e.y,r:5,vx:Math.cos(a)*3.2, vy:Math.sin(a)*3.2, life:3600}); } } }
      else if(e.etype==='sniper'){ const desired=220; const d=Math.hypot(dx,dy); if(d<desired){ e.x -= (dx/m)*e.speed*speedMultiplier; e.y -= (dy/m)*e.speed*speedMultiplier; } else { e.x += (dx/m)*e.speed*0.3*speedMultiplier; e.y += (dy/m)*e.speed*0.3*speedMultiplier; } keepEnemyInBounds(e); e.shootCD -= dt; if(e.shootCD<=0){ e.shootCD=2000; const a=Math.atan2(dy,dx); state.ebullets.push({x:e.x,y:e.y,r:5,vx:Math.cos(a)*4.8, vy:Math.sin(a)*4.8, life:4000}); } }
      else if(e.etype==='bomber'){ e.fuse+=dt; e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier; keepEnemyInBounds(e); if(Math.hypot(dx,dy)<35){ explode(state,e.x,e.y,'enemy'); onEnemyDie(state, e); e._dead=true; } }
      // === BOSS AI SYSTEM ===
      else if(e.etype==='boss1'){ // Orbital Cannon - shoots rotating bullet rings
        e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier; 
        e.shootCD -= dt; e.orbitAngle += dt * 0.002; 
        // Store orbital angle for visual display
        if(!e.orbitDisplay) e.orbitDisplay = true;
        if(e.shootCD<=0){ e.shootCD = 1200; const n=12; for(let k=0;k<n;k++){ const a=e.orbitAngle+(k/n)*TWO_PI; state.ebullets.push({x:e.x,y:e.y,r:5,vx:Math.cos(a)*2.5, vy:Math.sin(a)*2.5, life:4500}); } }
      }
      else if(e.etype==='boss2'){ // Berserker Dasher - charges at player with burst attacks
        e.dashCD -= dt; 
        if(e.dashCD<=0){ 
          e.dashCD=2000; 
          const a=Math.atan2(dy,dx); 
          e.vx=Math.cos(a)*4.5*speedMultiplier; 
          e.vy=Math.sin(a)*4.5*speedMultiplier; 
          e.dashT=800; 
          e.dashTrail = []; // Initialize dash trail
        }
        if(e.dashT>0){ 
          // Add trail positions during dash
          if(!e.dashTrail) e.dashTrail = [];
          e.dashTrail.push({x: e.x, y: e.y, life: 300});
          e.x+=e.vx; e.y+=e.vy; e.dashT-=dt; 
          if(e.dashT<=0){ for(let k=0;k<8;k++){ const a=(k/8)*TWO_PI; state.ebullets.push({x:e.x,y:e.y,r:6,vx:Math.cos(a)*3.0, vy:Math.sin(a)*3.0, life:3000}); } } 
        } 
        else { e.x += (dx/m)*e.speed*0.5*speedMultiplier; e.y += (dy/m)*e.speed*0.5*speedMultiplier; }
      }
      else if(e.etype==='boss3'){ // Necromancer - summons minions and shoots spreads
        e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier;
        e.shootCD -= dt; e.minionCD -= dt;
        if(e.shootCD<=0){ e.shootCD = 800; const base=Math.atan2(dy,dx); for(let k=-3;k<=3;k++){ const a=base + k*0.15; state.ebullets.push({x:e.x,y:e.y,r:5,vx:Math.cos(a)*2.8, vy:Math.sin(a)*2.8, life:4000}); } }
        if(e.minionCD<=0 && e.minions<3){ 
          e.minionCD=3000; 
          e.minions++; 
          const angle=Math.random()*TWO_PI; 
          const dist=80; 
          // Show summoning ritual effect
          e.summoningRitual = {angle: angle, dist: dist, timer: 600};
          setTimeout(() => {
            state.entities.push(makeEnemy('ghoul', e.x+Math.cos(angle)*dist, e.y+Math.sin(angle)*dist, 1));
          }, 600);
        }
        
        // Show summoning ritual warning when cooldown is low
        if(e.minionCD > 0 && e.minionCD < 1000 && e.minions < 3) {
          if(!e.ritualWarning) e.ritualWarning = true;
        } else {
          e.ritualWarning = false;
        }
      }
      else if(e.etype==='boss4'){ // Shadow Teleporter - teleports around and shoots bursts
        e.shootCD -= dt; e.teleportCD -= dt;
        if(e.teleportCD<=0){ 
          e.teleportCD=2500; 
          // Store old position for teleport effect
          e.teleportEffect = {oldX: e.x, oldY: e.y, timer: 200};
          const newX=ROOM_ORIGIN.x+Math.random()*ROOM_W; const newY=ROOM_ORIGIN.y+Math.random()*ROOM_H; 
          e.x=newX; e.y=newY; 
        }
        if(e.shootCD<=0){ e.shootCD = 600; for(let k=0;k<6;k++){ const a=Math.random()*TWO_PI; state.ebullets.push({x:e.x,y:e.y,r:4,vx:Math.cos(a)*3.5, vy:Math.sin(a)*3.5, life:3500}); } }
        e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier;
      }
      else if(e.etype==='boss5'){ // Shield Guardian - has regenerating shield and heavy attacks
        e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier;
        e.shootCD -= dt; e.shieldCD -= dt;
        if(e.shieldCD<=0 && e.shieldHP<=0){ e.shieldCD=4000; e.shieldHP=20; }
        if(e.shootCD<=0){ e.shootCD = 1000; const n=16; const base=state.time*0.002; for(let k=0;k<n;k++){ const a=base+(k/n)*TWO_PI; state.ebullets.push({x:e.x,y:e.y,r:6,vx:Math.cos(a)*2.0, vy:Math.sin(a)*2.0, life:5000}); } }
      }
      else if(e.etype==='boss6'){ // Elemental Mage - cycles through fire/ice/poison attacks
        e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier;
        e.shootCD -= dt; e.waveCD -= dt;
        if(e.shootCD<=0){ e.shootCD = 700; const base=Math.atan2(dy,dx); const element = e.phase%3; for(let k=-1;k<=1;k++){ const a=base + k*0.2; const bullet = {x:e.x,y:e.y,r:5,vx:Math.cos(a)*2.6, vy:Math.sin(a)*2.6, life:4200}; if(element===1) bullet.fire=true; else if(element===2) bullet.ice=true; state.ebullets.push(bullet); } }
        if(e.waveCD<=0){ e.waveCD=3500; e.phase++; const n=20; for(let k=0;k<n;k++){ const a=(k/n)*TWO_PI; state.ebullets.push({x:e.x,y:e.y,r:4,vx:Math.cos(a)*1.8, vy:Math.sin(a)*1.8, life:6000}); } }
      }
      else if(e.etype==='boss7'){ // Spiral Destroyer - creates spiral bullet patterns
        e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier;
        e.shootCD -= dt; e.spiralAngle += dt * 0.008;
        if(e.shootCD<=0){ e.shootCD = 900; for(let k=0;k<3;k++){ const a=e.spiralAngle + k*(TWO_PI/3); state.ebullets.push({x:e.x,y:e.y,r:5,vx:Math.cos(a)*2.8, vy:Math.sin(a)*2.8, life:4800}); } }
      }
      else if(e.etype==='boss8'){ // Bomber Lord - creates explosive projectiles
        e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier;
        e.shootCD -= dt; e.bombCD -= dt;
        if(e.shootCD<=0){ e.shootCD = 1100; const base=Math.atan2(dy,dx); for(let k=-2;k<=2;k++){ const a=base + k*0.18; state.ebullets.push({x:e.x,y:e.y,r:7,vx:Math.cos(a)*2.2, vy:Math.sin(a)*2.2, life:3800, explosive:true}); } }
        if(e.bombCD<=0){ 
          e.bombCD=2000; 
          // Create explosion warning indicator
          const bombX = e.x+Math.random()*100-50;
          const bombY = e.y+Math.random()*100-50;
          e.explosionWarning = {x: bombX, y: bombY, timer: 500}; // Show warning for 500ms
          setTimeout(() => explode(state, bombX, bombY, 'enemy'), 500);
        }
      }
      else if(e.etype==='boss9'){ // Speed Demon - very fast with rapid weak shots
        e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier;
        e.shootCD -= dt; e.cloneCD -= dt;
        if(e.shootCD<=0){ e.shootCD = 500; const a=Math.atan2(dy,dx)+Math.random()*0.6-0.3; state.ebullets.push({x:e.x,y:e.y,r:3,vx:Math.cos(a)*4.0, vy:Math.sin(a)*4.0, life:2500}); }
        if(e.cloneCD<=0 && e.clones<2){ e.cloneCD=4000; e.clones++; state.entities.push(makeEnemy('archer', e.x+Math.random()*60-30, e.y+Math.random()*60-30, 1)); }
      }
      else if(e.etype==='boss10'){ // Laser Reflector - shoots lasers and reflects player bullets
        e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier;
        e.shootCD -= dt; e.laserCD -= dt;
        if(e.shootCD<=0){ e.shootCD = 800; const base=Math.atan2(dy,dx); state.ebullets.push({x:e.x,y:e.y,r:4,vx:Math.cos(base)*3.8, vy:Math.sin(base)*3.8, life:4500}); }
        if(e.laserCD<=0){ e.laserCD=3000; state.beams.push({x:e.x,y:e.y, angle:Math.atan2(dy,dx), life:800, pierce:true, damage:2, hits:new Set()}); }
      }
      else if(e.etype==='finalboss'){ // FINAL BOSS - multi-phase ultimate enemy
        e.phaseTimer += dt; e.shootCD -= dt; e.specialCD -= dt;
        const phaseHP = [0.75, 0.5, 0.25]; const currentPhase = phaseHP.findIndex(threshold => e.hp/e.maxHP > threshold) + 1;
        if(currentPhase !== e.phase){ e.phase = currentPhase; e.phaseTimer = 0; e.specialCD = 0; }
        
        if(e.phase === 1){ // Phase 1: Basic attacks
          if(e.shootCD<=0){ e.shootCD = 600; const n=8; const base=state.time*0.004; for(let k=0;k<n;k++){ const a=base+(k/n)*TWO_PI; state.ebullets.push({x:e.x,y:e.y,r:5,vx:Math.cos(a)*2.5, vy:Math.sin(a)*2.5, life:5000}); } }
        } else if(e.phase === 2){ // Phase 2: Adds minion spawning
          if(e.shootCD<=0){ e.shootCD = 500; const base=Math.atan2(dy,dx); for(let k=-4;k<=4;k++){ const a=base + k*0.12; state.ebullets.push({x:e.x,y:e.y,r:6,vx:Math.cos(a)*3.0, vy:Math.sin(a)*3.0, life:4500}); } }
          if(e.specialCD<=0){ e.specialCD=3000; for(let i=0;i<2;i++){ const angle=Math.random()*TWO_PI; const dist=100; state.entities.push(makeEnemy('warlock', e.x+Math.cos(angle)*dist, e.y+Math.sin(angle)*dist, 2)); } }
        } else { // Phase 3: Enraged - everything faster and more dangerous
          if(!e.enraged){ e.enraged=true; e.speed*=1.5; }
          if(e.shootCD<=0){ e.shootCD = 300; const n=12; const base=state.time*0.008; for(let k=0;k<n;k++){ const a=base+(k/n)*TWO_PI; state.ebullets.push({x:e.x,y:e.y,r:7,vx:Math.cos(a)*3.5, vy:Math.sin(a)*3.5, life:6000}); } }
          if(e.specialCD<=0){ e.specialCD=1500; explode(state, e.x+Math.random()*150-75, e.y+Math.random()*150-75, 'enemy'); }
        }
        e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier;
      }
      // Fallback for old boss type
      else if(e.etype==='boss'){ e.shootCD -= dt; if(e.shootCD<=0){ e.shootCD = 1000; if((e.phase++%2)===0){ const n=18; const base=state.time*0.003; for(let k=0;k<n;k++){ const a=base+(k/n)*TWO_PI; state.ebullets.push({x:e.x,y:e.y,r:4,vx:Math.cos(a)*2.2, vy:Math.sin(a)*2.2, life:4000}); } } else { const base=Math.atan2(dy,dx); for(let k=-2;k<=2;k++){ const a=base + k*0.12; state.ebullets.push({x:e.x,y:e.y,r:4,vx:Math.cos(a)*2.8, vy:Math.sin(a)*2.8, life:3400}); } } } e.x += (dx/m)*e.speed*speedMultiplier; e.y += (dy/m)*e.speed*speedMultiplier; }



      // --- beam collisions (lasers) ---
      if(!e._dead){
        for(const bm of state.beams){
          const L=900; const ex = bm.x + Math.cos(bm.angle)*L; const ey = bm.y + Math.sin(bm.angle)*L;
          if(lineCircle(bm.x,bm.y,ex,ey,e.x,e.y,e.r)){
            // Handle tick damage for sustained laser beams
            if(bm.tickTimer !== undefined){
              bm.tickTimer += dt;
              if(bm.tickTimer >= bm.tickRate){
                // Handle Shield Guardian's shield for laser damage too
                let damage = bm.damage || 1;
                if(e.etype === 'boss5' && e.shieldHP > 0){
                  e.shieldHP -= damage;
                  if(e.shieldHP < 0){
                    damage = -e.shieldHP;
                    e.shieldHP = 0;
                    e.hp -= damage;
                  }
                } else {
                  e.hp -= damage;
                }
                bm.tickTimer = 0;
                // Visual feedback for laser damage
                e.hitFlash = 150;
                canvas.style.filter = 'hue-rotate(120deg) saturate(150%)';
                setTimeout(() => { if(canvas) canvas.style.filter = 'none'; }, 100);
              }
            } else {
              // One-time damage for old laser system
              if(bm.hits && bm.hits.has(e)) continue;
              if(bm.hits) bm.hits.add(e);
              // Handle Shield Guardian's shield for old laser system too
              let damage = bm.damage || 1;
              if(e.etype === 'boss5' && e.shieldHP > 0){
                e.shieldHP -= damage;
                if(e.shieldHP < 0){
                  damage = -e.shieldHP;
                  e.shieldHP = 0;
                  e.hp -= damage;
                }
              } else {
                e.hp -= damage;
              }
            }
            
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
          let damage = p.mods.fragileDamage ? 2 : 1;
          p.hearts -= damage;
          p.invuln = 600 * (p.mods.invulnTime || 1);
          
          // Explode on hit modifier
          if(p.mods.explodeOnHit){
            explode(state, p.x, p.y);
          }
          
          // Add hit flash
          p.hitFlash = 150;
          
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
      if(dist2(b.x,b.y,p.x,p.y) < (b.r+p.r)*(b.r+p.r)){
        // Always remove bullet when it hits player
        state.ebullets.splice(i,1);
        
        // Only apply damage if player is not invulnerable
        if(p.invuln<=0){
          let damage = p.mods.fragileDamage ? 2 : 1;
          p.hearts -= damage; 
          p.invuln = 500 * (p.mods.invulnTime || 1); 
          
          // Explode on hit modifier
          if(p.mods.explodeOnHit){
            explode(state, p.x, p.y);
          }
          
          // Add hit flash
          p.hitFlash = 150;
          
          if(p.hearts<=0){ state.dead=true; endRun('You fell in the depths'); }
        }
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
      if(state.entities.length===0){
        // Start timer to clear projectiles if not already started
        if(state.clearProjectilesTimer <= 0){
          state.clearProjectilesTimer = 500; // 0.5 seconds
        }
      }
      
      // Handle projectile clearing timer
      if(state.clearProjectilesTimer > 0){
        state.clearProjectilesTimer -= dt;
        if(state.clearProjectilesTimer <= 0){
          state.ebullets = []; // Clear all enemy projectiles
        }
      }
      
      if(state.entities.length===0 && state.ebullets.length===0){ 
        state.lockDoors=false; 
        state.room.cleared=true; 
        state.clearProjectilesTimer = 0; // Reset timer
        if(state.room.type===RT.BOSS){ state.pickups.push({type:'stairs', x:canvas.width/2, y:canvas.height/2, r:14}); } 
      }
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
      // Calculate angle from enemy to player (opposite direction to face the player)
      const angleToPlayer = state.player ? Math.atan2(state.player.y-e.y, state.player.x-e.x) : 0;
      // Flip sprite if facing left (sprites face right by default, flip at PI/2 to PI*1.5)
      const shouldFlip = angleToPlayer > Math.PI/2 || angleToPlayer < -Math.PI/2;
      const displayAngle = shouldFlip ? angleToPlayer + Math.PI : angleToPlayer;
      
      // Apply flash effects for enemies
      if(e.hitFlash > 0) {
        if(e.dotFlash && e.dotFlash.type === 'poison'){
          // Purple flash for poison
          cx.filter = 'hue-rotate(270deg) saturate(300%) brightness(150%) contrast(150%)';
        } else if(e.dotFlash && e.dotFlash.type === 'fire'){
          // Orange flash for fire
          cx.filter = 'hue-rotate(30deg) saturate(300%) brightness(150%) contrast(150%)';
        } else {
          // Regular red flash for normal damage
          cx.filter = 'hue-rotate(0deg) saturate(300%) brightness(150%) sepia(100%) contrast(150%)';
        }
      }
      
      const used = drawSprite(e.sprite || e.etype, e.x, e.y, e.r, displayAngle);
      
      // Reset filter after enemy sprite
      if(e.hitFlash > 0) {
        cx.filter = 'none';
      }
      if(!used){
        // fallback vector
        cx.save(); cx.translate(e.x,e.y);
        const isBoss = e.etype.includes('boss') || e.etype === 'finalboss';
        let color = isBoss? '#f06c6c' : e.etype==='turret'? '#a48df2' : e.etype==='archer'||e.etype==='sniper'? '#87c1ff' : e.etype==='warlock'? '#ffb86b' : e.etype==='bomber'? '#ffd263' : '#c7d2e0'; 
        if(e.etype === 'finalboss') color = '#8B0000'; // Dark red for final boss
        if(e.elite){ color = '#ff6b81'; }
        // Apply flash effects for vector enemies
        if(e.hitFlash > 0) { 
          if(e.dotFlash && e.dotFlash.type === 'poison'){
            color = '#aa44ff'; // Purple for poison
          } else if(e.dotFlash && e.dotFlash.type === 'fire'){
            color = '#ff8844'; // Orange for fire
          } else {
            color = '#ff4444'; // Red for normal damage
          }
        }
        cx.fillStyle=color; cx.beginPath(); cx.arc(0,0,e.r,0,TWO_PI); cx.fill();
        cx.restore();
        
        // hp ring (only show for vector fallback enemies without sprites)
        cx.save();
        cx.translate(e.x,e.y);
        cx.strokeStyle='#2b394d'; cx.lineWidth=4; cx.beginPath(); cx.arc(0,0,e.r+5,0,TWO_PI); cx.stroke();
        let baseMax;
        if(e.etype === 'finalboss') baseMax = 200+state.floor*30;
        else if(e.etype === 'boss1') baseMax = 60+state.floor*12;
        else if(e.etype === 'boss2') baseMax = 55+state.floor*10;
        else if(e.etype === 'boss3') baseMax = 70+state.floor*15;
        else if(e.etype === 'boss4') baseMax = 45+state.floor*8;
        else if(e.etype === 'boss5') baseMax = 80+state.floor*18;
        else if(e.etype === 'boss6') baseMax = 50+state.floor*11;
        else if(e.etype === 'boss7') baseMax = 65+state.floor*13;
        else if(e.etype === 'boss8') baseMax = 75+state.floor*16;
        else if(e.etype === 'boss9') baseMax = 40+state.floor*9;
        else if(e.etype === 'boss10') baseMax = 55+state.floor*12;
        else if(e.etype === 'boss') baseMax = 50+state.floor*15; // Fallback
        else if(e.etype==='turret') baseMax = 4+Math.floor(state.floor/1.5);
        else if(e.etype==='archer'||e.etype==='sniper') baseMax = 3+Math.floor(state.floor/2);
        else if(e.etype==='warlock') baseMax = 5+Math.floor(state.floor/2);
        else baseMax = 2+Math.floor(state.floor/2);
        
        // Store max HP for final boss phase calculations
        if(!e.maxHP) e.maxHP = baseMax;
        const hpPct=clamp(e.hp/baseMax,0,1); cx.strokeStyle='#a1cdfc'; cx.beginPath(); cx.arc(0,0,e.r+5,-Math.PI/2,-Math.PI/2 + hpPct*TWO_PI); cx.stroke();
        
        // Special visual indicators for boss types
        if(e.etype === 'boss5' && e.shield > 0) {
          // Shield Guardian: Draw shield aura
          const time = Date.now() * 0.003;
          cx.strokeStyle = `rgba(100, 149, 237, ${0.5 + Math.sin(time) * 0.3})`;
          cx.lineWidth = 3;
          cx.beginPath();
          cx.arc(0, 0, e.r + 15, 0, TWO_PI);
          cx.stroke();
          
          // Shield strength indicator
          const shieldPct = e.shield / 30;
          cx.strokeStyle = '#4169E1';
          cx.lineWidth = 6;
          cx.beginPath();
          cx.arc(0, 0, e.r + 15, -Math.PI/2, -Math.PI/2 + shieldPct * TWO_PI);
          cx.stroke();
        }
        
        if(e.etype === 'boss1' && e.orbitDisplay) {
          // Orbital Cannon: Show trajectory preview lines
          cx.strokeStyle = 'rgba(255, 100, 100, 0.3)';
          cx.lineWidth = 2;
          const n = 12;
          for(let k = 0; k < n; k++) {
            const a = e.orbitAngle + (k/n) * TWO_PI;
            cx.beginPath();
            cx.moveTo(0, 0);
            cx.lineTo(Math.cos(a) * 60, Math.sin(a) * 60);
            cx.stroke();
          }
        }
        
        if(e.etype === 'boss2' && e.dashTrail && e.dashTrail.length > 0) {
          // Berserker Dasher: Show dash trail
          for(let i = e.dashTrail.length - 1; i >= 0; i--) {
            const trail = e.dashTrail[i];
            trail.life -= 16; // Approximate frame time
            if(trail.life <= 0) {
              e.dashTrail.splice(i, 1);
              continue;
            }
            const alpha = trail.life / 300;
            cx.fillStyle = `rgba(255, 69, 0, ${alpha * 0.6})`;
            cx.beginPath();
            const trailX = trail.x - e.x;
            const trailY = trail.y - e.y;
            cx.arc(trailX, trailY, e.r * alpha, 0, TWO_PI);
            cx.fill();
          }
        }
        
        if(e.etype === 'boss4' && e.teleportEffect) {
          // Shadow Teleporter: Show teleport effect
          e.teleportEffect.timer -= 16; // Approximate frame time
          if(e.teleportEffect.timer > 0) {
            const alpha = e.teleportEffect.timer / 200;
            cx.strokeStyle = `rgba(128, 0, 128, ${alpha})`;
            cx.lineWidth = 3;
            cx.setLineDash([5, 5]);
            cx.beginPath();
            const oldScreenX = e.teleportEffect.oldX - e.x;
            const oldScreenY = e.teleportEffect.oldY - e.y;
            cx.moveTo(oldScreenX, oldScreenY);
            cx.lineTo(0, 0);
            cx.stroke();
            cx.setLineDash([]); // Reset line dash
          } else {
            delete e.teleportEffect;
          }
        }
        
        if(e.etype === 'finalboss') {
          // Final boss: Phase indicators
          const phase1 = e.hp > e.maxHP * 0.66;
          const phase2 = e.hp > e.maxHP * 0.33 && e.hp <= e.maxHP * 0.66;
          const phase3 = e.hp <= e.maxHP * 0.33;
          
          // Phase glow
          if(phase1) {
            cx.shadowColor = '#8B0000';
            cx.shadowBlur = 20;
          } else if(phase2) {
            cx.shadowColor = '#FF4500';
            cx.shadowBlur = 25;
          } else if(phase3) {
            cx.shadowColor = '#FF0000';
            cx.shadowBlur = 30;
          }
          
          // Draw phase indicator ring
          const phaseColor = phase1 ? '#8B0000' : phase2 ? '#FF4500' : '#FF0000';
          cx.strokeStyle = phaseColor;
          cx.lineWidth = 4;
          cx.beginPath();
          cx.arc(0, 0, e.r + 25, 0, TWO_PI);
          cx.stroke();
          
          cx.shadowBlur = 0; // Reset shadow
        }
        
        if(e.etype === 'boss8' && e.explosionWarning) {
          // Bomber Lord: Show explosion warning
          e.explosionWarning.timer -= 16; // Approximate frame time
          if(e.explosionWarning.timer > 0) {
            const alpha = Math.sin((500 - e.explosionWarning.timer) * 0.02) * 0.5 + 0.5; // Pulsing effect
            cx.strokeStyle = `rgba(255, 165, 0, ${alpha})`;
            cx.lineWidth = 4;
            cx.beginPath();
            const warningX = e.explosionWarning.x - e.x;
            const warningY = e.explosionWarning.y - e.y;
            cx.arc(warningX, warningY, 30, 0, TWO_PI);
            cx.stroke();
            
            // Inner danger indicator
            cx.fillStyle = `rgba(255, 69, 0, ${alpha * 0.3})`;
            cx.beginPath();
            cx.arc(warningX, warningY, 25, 0, TWO_PI);
            cx.fill();
          } else {
            delete e.explosionWarning;
          }
        }
        
        if(e.etype === 'boss3') {
          // Necromancer: Show summoning ritual and warning effects
          if(e.summoningRitual) {
            e.summoningRitual.timer -= 16;
            if(e.summoningRitual.timer > 0) {
              const progress = (600 - e.summoningRitual.timer) / 600;
              const ritualX = Math.cos(e.summoningRitual.angle) * e.summoningRitual.dist;
              const ritualY = Math.sin(e.summoningRitual.angle) * e.summoningRitual.dist;
              
              // Summoning circle
              cx.strokeStyle = `rgba(128, 0, 128, ${progress})`;
              cx.lineWidth = 3;
              cx.beginPath();
              cx.arc(ritualX, ritualY, 25 * progress, 0, TWO_PI);
              cx.stroke();
              
              // Inner pentagram effect
              cx.strokeStyle = `rgba(75, 0, 130, ${progress * 0.8})`;
              cx.lineWidth = 2;
              for(let i = 0; i < 5; i++) {
                const angle1 = (i * 2 * Math.PI / 5) - Math.PI/2;
                const angle2 = ((i + 2) * 2 * Math.PI / 5) - Math.PI/2;
                cx.beginPath();
                cx.moveTo(ritualX + Math.cos(angle1) * 15 * progress, ritualY + Math.sin(angle1) * 15 * progress);
                cx.lineTo(ritualX + Math.cos(angle2) * 15 * progress, ritualY + Math.sin(angle2) * 15 * progress);
                cx.stroke();
              }
            } else {
              delete e.summoningRitual;
            }
          }
          
          // Show ritual warning glow
          if(e.ritualWarning) {
            const glowAlpha = Math.sin(Date.now() * 0.01) * 0.3 + 0.4;
            cx.shadowColor = '#8A2BE2';
            cx.shadowBlur = 15;
            cx.strokeStyle = `rgba(138, 43, 226, ${glowAlpha})`;
            cx.lineWidth = 2;
            cx.beginPath();
            cx.arc(0, 0, e.r + 20, 0, TWO_PI);
            cx.stroke();
            cx.shadowBlur = 0;
          }
        }
        
        cx.restore();
      }
    }

    // enemy bullets
    // If you added a bullet PNG, uncomment the sprite drawer here:
    // for(const b of state.ebullets){ if(!drawSprite('bullet', b.x, b.y, b.r)) { cx.fillStyle='#f6a38a'; cx.beginPath(); cx.arc(b.x,b.y,b.r,0,TWO_PI); cx.fill(); } }
    for(const b of state.ebullets){ 
      cx.save();
      cx.translate(b.x, b.y);
      
      if(b.type === 'arrow'){
        // Draw arrow shape for archer bullets
        cx.rotate(b.angle);
        cx.shadowColor = '#d4af37';
        cx.shadowBlur = 4;
        
        // Arrow shaft
        cx.fillStyle = '#8B4513';
        cx.fillRect(-8, -1, 12, 2);
        
        // Arrow head
        cx.fillStyle = '#C0C0C0';
        cx.beginPath();
        cx.moveTo(4, 0);
        cx.lineTo(-2, -4);
        cx.lineTo(-1, 0);
        cx.lineTo(-2, 4);
        cx.closePath();
        cx.fill();
        
        // Arrow fletching
        cx.fillStyle = '#654321';
        cx.fillRect(-8, -2, 3, 1);
        cx.fillRect(-8, 1, 3, 1);
      } else if(b.type === 'slime'){
        // Draw green slime balls for turret/slime enemies
        cx.shadowColor = '#32cd32';
        cx.shadowBlur = 8;
        cx.fillStyle = '#90EE90';
        cx.beginPath(); 
        cx.arc(0, 0, b.r+1, 0, TWO_PI); 
        cx.fill();
        cx.shadowBlur = 0;
        cx.fillStyle = '#32cd32';
        cx.beginPath(); 
        cx.arc(0, 0, b.r-1, 0, TWO_PI); 
        cx.fill();
        // Add slime shine effect
        cx.fillStyle = '#98fb98';
        cx.beginPath();
        cx.arc(-1, -1, b.r/3, 0, TWO_PI);
        cx.fill();
      } else if(b.type === 'knightbullet'){
        // Draw bullet shape for knight bullets
        cx.rotate(b.angle);
        cx.shadowColor = '#ffa500';
        cx.shadowBlur = 6;
        
        // Bullet body (elongated)
        cx.fillStyle = '#DAA520';
        cx.fillRect(-6, -2, 10, 4);
        
        // Bullet tip (pointed)
        cx.fillStyle = '#B8860B';
        cx.beginPath();
        cx.moveTo(4, 0);
        cx.lineTo(7, -2);
        cx.lineTo(7, 2);
        cx.closePath();
        cx.fill();
        
        // Bullet base
        cx.fillStyle = '#CD853F';
        cx.fillRect(-6, -1.5, 2, 3);
      } else {
        // Regular circular bullets for other enemies
        cx.shadowColor = '#f6a38a';
        cx.shadowBlur = 6;
        cx.fillStyle = '#ff8a6a';
        cx.beginPath(); 
        cx.arc(0, 0, b.r+1, 0, TWO_PI); 
        cx.fill();
        cx.shadowBlur = 0;
        cx.fillStyle = '#f6a38a';
        cx.beginPath(); 
        cx.arc(0, 0, b.r, 0, TWO_PI); 
        cx.fill();
      }
      
      cx.restore();
    }

    // player
    const p = state.player; if(p){
      cx.save();
      // Fading animation during dash
      if(p.rolling > 0) {
        // Create a pulsing fade effect during the roll
        const rollProgress = 1 - (p.rolling / 320);
        cx.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin(rollProgress * Math.PI * 4));
      }
      
      // Draw sprite aligned to aim direction
      if(!drawSprite(p.sprite || 'player', p.x, p.y, p.r, p.angle)){
        // fallback vector player
        cx.translate(p.x,p.y); 
        if(p.invuln>0 && p.rolling<=0){ 
          cx.globalAlpha = 0.6 + 0.4*Math.sin(state.time*0.02);
          // Flash red when hit
          const flashIntensity = Math.sin(state.time*0.03);
          cx.filter = `hue-rotate(${flashIntensity * 180}deg) saturate(${1.5 + flashIntensity * 0.5})`;
        }
        cx.fillStyle = '#e8eef7'; cx.beginPath(); cx.arc(0,0,p.r,0,TWO_PI); cx.fill(); cx.strokeStyle = '#0b0f15'; cx.lineWidth = 3; cx.beginPath(); cx.arc(0,0,p.r-4, p.angle-0.4, p.angle+0.4); cx.stroke(); cx.save(); cx.rotate(p.angle); cx.fillStyle = '#a1cdfc'; cx.fillRect(8,-2, 14,4); cx.restore();
        if(p.invuln>0 && p.rolling<=0){ cx.filter = 'none'; }
      } else {
        // For sprite-based player, apply red flash effect
        if(p.invuln>0 && p.rolling<=0){
          const flashIntensity = Math.sin(state.time*0.03);
          cx.filter = `hue-rotate(${flashIntensity * 180}deg) saturate(${1.5 + flashIntensity * 0.5}) brightness(${1.2 + flashIntensity * 0.3})`;
          if(!drawSprite(p.sprite || 'player', p.x, p.y, p.r, p.angle)){
            // Fallback if sprite fails to load during invuln
            cx.save();
            cx.translate(p.x,p.y);
            cx.globalAlpha = 0.6 + 0.4*Math.sin(state.time*0.02);
            cx.fillStyle = '#ff6b6b';
            cx.beginPath(); cx.arc(0,0,p.r,0,TWO_PI); cx.fill();
            cx.restore();
          }
          cx.filter = 'none';
        }
      }
      cx.restore();
    }

    // Laser charge meter (around player)
    if(state.player && state.player.mods.laser && (state.player.laserCharging || state.player.laserCharge > 0)){
      const p = state.player;
      const chargePercent = p.laserCharge / p.laserMaxCharge;
      const radius = p.r + 15;
      
      cx.save();
      cx.translate(p.x, p.y);
      
      // Background circle
      cx.strokeStyle = '#2a3a4a';
      cx.lineWidth = 6;
      cx.beginPath();
      cx.arc(0, 0, radius, 0, TWO_PI);
      cx.stroke();
      
      // Charge progress
      if(chargePercent > 0){
        cx.strokeStyle = chargePercent >= 1 ? '#FFD700' : '#7de38b';
        cx.lineWidth = 4;
        cx.beginPath();
        cx.arc(0, 0, radius, -Math.PI/2, -Math.PI/2 + chargePercent * TWO_PI);
        cx.stroke();
        
        // Pulse effect when fully charged
        if(chargePercent >= 1){
          cx.shadowColor = '#FFD700';
          cx.shadowBlur = 15;
          cx.strokeStyle = '#FFD700';
          cx.lineWidth = 2;
          cx.globalAlpha = 0.5 + 0.5 * Math.sin(state.time * 0.01);
          cx.beginPath();
          cx.arc(0, 0, radius + 5, 0, TWO_PI);
          cx.stroke();
        }
      }
      cx.restore();
    }

    // beams
    for(const bm of state.beams){ 
      const L=900; const ex = bm.x + Math.cos(bm.angle)*L; const ey = bm.y + Math.sin(bm.angle)*L; 
      cx.save(); 
      // Enhanced laser beam rendering for sustained beams
      const alpha = bm.tickTimer !== undefined ? Math.min(1, bm.life/1500) : bm.life/120;
      cx.globalAlpha = alpha;
      cx.strokeStyle = bm.tickTimer !== undefined ? '#FFD700' : '#7de38b';
      cx.lineWidth = bm.tickTimer !== undefined ? 8 : 3;
      cx.shadowColor = bm.tickTimer !== undefined ? '#FFD700' : '#7de38b';
      cx.shadowBlur = bm.tickTimer !== undefined ? 20 : 5;
      cx.beginPath(); 
      cx.moveTo(bm.x,bm.y); 
      cx.lineTo(ex,ey); 
      cx.stroke(); 
      cx.restore(); 
    }

    // bullets
    // If you added a bullet PNG, you can draw it here similarly. Default circle:
    for(const b of state.bullets){ 
      cx.save();
      cx.translate(b.x, b.y);
      
      if(b.type === 'playerbullet'){
        // Draw bullet shape for player bullets
        cx.rotate(b.angle);
        cx.shadowColor = '#a1cdfc';
        cx.shadowBlur = 8;
        
        // Bullet body (elongated)
        cx.fillStyle = '#E6E6FA';
        cx.fillRect(-6, -2, 10, 4);
        
        // Bullet tip (pointed)
        cx.fillStyle = '#ffffff';
        cx.beginPath();
        cx.moveTo(4, 0);
        cx.lineTo(7, -2);
        cx.lineTo(7, 2);
        cx.closePath();
        cx.fill();
        
        // Bullet base
        cx.fillStyle = '#a1cdfc';
        cx.fillRect(-6, -1.5, 2, 3);
      } else {
        // Fallback circular bullets
        cx.shadowColor = '#a1cdfc';
        cx.shadowBlur = 8;
        cx.fillStyle = '#ffffff';
        cx.beginPath(); 
        cx.arc(0, 0, b.r, 0, TWO_PI); 
        cx.fill();
        cx.shadowBlur = 0;
        cx.fillStyle = '#a1cdfc';
        cx.beginPath(); 
        cx.arc(0, 0, b.r-1, 0, TWO_PI); 
        cx.fill();
      }
      
      cx.restore();
    }

    // UI hints
    if(state.room && state.room.type===RT.TREASURE){ cx.save(); cx.fillStyle='#f5d76e'; cx.font='700 16px system-ui'; cx.textAlign='center'; cx.fillText('Treasure Room', canvas.width/2, ROOM_ORIGIN.y-16); cx.restore(); }
    if(state.room && state.room.type===RT.BOSS){ cx.save(); cx.fillStyle='#f06c6c'; cx.font='700 16px system-ui'; cx.textAlign='center'; cx.fillText('Boss Room', canvas.width/2, ROOM_ORIGIN.y-16); cx.restore(); }
    if(state.room && state.room.type===RT.SPIKES){ cx.save(); cx.fillStyle='#ff6b47'; cx.font='700 16px system-ui'; cx.textAlign='center'; cx.fillText('Spike Trap Room', canvas.width/2, ROOM_ORIGIN.y-16); cx.restore(); }
    if(state.room && state.room.type===RT.LASER){ cx.save(); cx.fillStyle='#00bfff'; cx.font='700 16px system-ui'; cx.textAlign='center'; cx.fillText('Laser Grid Room', canvas.width/2, ROOM_ORIGIN.y-16); cx.restore(); }
    if(state.room && state.room.type===RT.CRUSHER){ cx.save(); cx.fillStyle='#8b4513'; cx.font='700 16px system-ui'; cx.textAlign='center'; cx.fillText('Crusher Room', canvas.width/2, ROOM_ORIGIN.y-16); cx.restore(); }
    if(state.room && state.room.type===RT.MAZE){ cx.save(); cx.fillStyle='#9370db'; cx.font='700 16px system-ui'; cx.textAlign='center'; cx.fillText('Maze Room', canvas.width/2, ROOM_ORIGIN.y-16); cx.restore(); }
    
    // Draw challenge room obstacles
    if(state.roomState?.obstacles) {
      for(const obs of state.roomState.obstacles) {
        cx.save();
        if(obs.type === 'spike') {
          // Draw square spike base
          cx.fillStyle = obs.active ? '#ff0000' : '#8b0000';
          cx.shadowBlur = obs.active ? 15 : 0;
          cx.shadowColor = '#ff0000';
          cx.fillRect(obs.x - obs.w/2, obs.y - obs.h/2, obs.w, obs.h);
          
          // Draw spike texture
          cx.fillStyle = obs.active ? '#ffff00' : '#666666';
          cx.font = '20px monospace';
          cx.textAlign = 'center';
          cx.textBaseline = 'middle';
          
          // Draw multiple rows of spike symbols
          const rows = Math.floor(obs.h / 15);
          for(let row = 0; row < rows; row++) {
            const y = obs.y - obs.h/2 + 15 + row * 15;
            cx.fillText('^^^', obs.x, y);
          }
        } else if(obs.type === 'laser') {
          if(obs.active) {
            cx.strokeStyle = '#00ffff';
            cx.lineWidth = 8;
            cx.shadowBlur = 10;
            cx.shadowColor = '#00ffff';
            cx.beginPath();
            cx.moveTo(obs.x1, obs.y1);
            cx.lineTo(obs.x2, obs.y2);
            cx.stroke();
          } else {
            cx.strokeStyle = '#004444';
            cx.lineWidth = 2;
            cx.setLineDash([5, 5]);
            cx.beginPath();
            cx.moveTo(obs.x1, obs.y1);
            cx.lineTo(obs.x2, obs.y2);
            cx.stroke();
            cx.setLineDash([]);
          }
        } else if(obs.type === 'crusher') {
          cx.fillStyle = '#654321';
          cx.shadowBlur = 5;
          cx.shadowColor = '#000000';
          cx.fillRect(obs.x, obs.y, obs.w, obs.h);
          
          // Danger stripes
          cx.fillStyle = '#ffff00';
          for(let i = 0; i < obs.w; i += 20) {
            cx.fillRect(obs.x + i, obs.y, 10, obs.h);
          }
        } else if(obs.type === 'wall') {
          cx.fillStyle = '#696969';
          cx.fillRect(obs.x, obs.y, obs.w, obs.h);
          
          // Wall texture
          cx.strokeStyle = '#404040';
          cx.lineWidth = 2;
          for(let i = 0; i < obs.w; i += 30) {
            cx.beginPath();
            cx.moveTo(obs.x + i, obs.y);
            cx.lineTo(obs.x + i, obs.y + obs.h);
            cx.stroke();
          }
        }
        cx.restore();
      }
    }
    
    // Reset progress circle
    if(state.resetTimer > 0){
      const progress = state.resetTimer / 3000;
      const centerX = canvas.width - 60;
      const centerY = 60;
      const radius = 25;
      
      cx.save();
      // Background circle
      cx.strokeStyle = '#333';
      cx.lineWidth = 4;
      cx.beginPath();
      cx.arc(centerX, centerY, radius, 0, TWO_PI);
      cx.stroke();
      
      // Progress arc
      cx.strokeStyle = '#ff4444';
      cx.lineWidth = 4;
      cx.beginPath();
      cx.arc(centerX, centerY, radius, -Math.PI/2, -Math.PI/2 + progress * TWO_PI);
      cx.stroke();
      
      // Reset text
      cx.fillStyle = '#ff4444';
      cx.font = '12px system-ui';
      cx.textAlign = 'center';
      cx.fillText('RESET', centerX, centerY + 4);
      cx.restore();
    }

    // Minimap
    drawMiniMap();

    // Toast (item pickup)
    if(state.toast){ cx.save(); cx.globalAlpha = clamp(state.toast.t/2200, 0, 1); cx.fillStyle='#0f1620cc'; cx.strokeStyle='#243142'; cx.lineWidth=2; const pad=10; cx.font='700 14px system-ui'; const w = Math.min(520, cx.measureText(state.toast.text).width + pad*2); const x=(canvas.width-w)/2, y=20; cx.fillRect(x,y,w,30); cx.strokeRect(x,y,w,30); cx.fillStyle='#f5d76e'; cx.textAlign='center'; cx.fillText(state.toast.text, x+w/2, y+20); cx.restore(); }
  }

  function drawRoomFrame(){
    const x=ROOM_ORIGIN.x, y=ROOM_ORIGIN.y, w=ROOM_W, h=ROOM_H;
    drawWallBorder(x, y, w, h);
  }

  function drawWallBorder(x, y, w, h){
    const wallSize = 32; // Size of each wall tile
    const horizontalWallWidth = 64; // Longer tiles for top/bottom walls
    const verticalWallHeight = 32; // Keep same height for left/right walls
    
    // Draw complete border by drawing all four sides with proper coverage
    
    // Top wall - fewer, longer tiles
    for(let i = 0; i < w; i += horizontalWallWidth){
      const tileWidth = Math.min(horizontalWallWidth, w - i);
      const tileIndex = Math.floor(i / horizontalWallWidth);
      drawWallTile(x + i, y, tileWidth, wallSize, tileIndex % 2 === 1, false);
    }
    
    // Bottom wall - fewer, longer tiles  
    for(let i = 0; i < w; i += horizontalWallWidth){
      const tileWidth = Math.min(horizontalWallWidth, w - i);
      const tileIndex = Math.floor(i / horizontalWallWidth);
      drawWallTile(x + i, y + h - wallSize, tileWidth, wallSize, tileIndex % 2 === 0, true);
    }
    
    // Left wall - same height tiles
    for(let i = 0; i < h; i += verticalWallHeight){
      const tileHeight = Math.min(verticalWallHeight, h - i);
      const tileIndex = Math.floor(i / verticalWallHeight);
      drawWallTile(x, y + i, wallSize, tileHeight, false, tileIndex % 2 === 1);
    }
    
    // Right wall - same height tiles
    for(let i = 0; i < h; i += verticalWallHeight){
      const tileHeight = Math.min(verticalWallHeight, h - i);
      const tileIndex = Math.floor(i / verticalWallHeight);
      drawWallTile(x + w - wallSize, y + i, wallSize, tileHeight, true, tileIndex % 2 === 0);
    }
  }

  function drawWallTile(x, y, w, h, flipX = false, flipY = false){
    const img = Assets.images.wall;
    if(img){
      cx.save();
      cx.translate(x + w/2, y + h/2);
      if(flipX) cx.scale(-1, 1);
      if(flipY) cx.scale(1, -1);
      cx.drawImage(img, -w/2, -h/2, w, h);
      cx.restore();
    } else {
      // Fallback to original border style if wall image not loaded
      cx.save();
      cx.fillStyle = '#1a2332';
      cx.fillRect(x, y, w, h);
      cx.restore();
    }
  }

  function neighborCell(side){ if(!state.room || !state.map) return null; const x=state.room.x, y=state.room.y; if(side==='up'&&y>0) return state.map.grid[y-1][x]; if(side==='down'&&y<state.map.H-1) return state.map.grid[y+1][x]; if(side==='left'&&x>0) return state.map.grid[y][x-1]; if(side==='right'&&x<state.map.W-1) return state.map.grid[y][x+1]; return null; }

  function doorColorFor(cell){ if(!cell) return '#7de38b'; if(cell.type===RT.TREASURE) return '#f5d76e'; if(cell.type===RT.BOSS) return '#f06c6c'; return '#7de38b'; }

  function drawDoors(){
    const c=state.room; if(!c) return; const x=ROOM_ORIGIN.x, y=ROOM_ORIGIN.y, w=ROOM_W, h=ROOM_H;
    const wallThickness = 32;
    cx.save();
    
    const upN=neighborCell('up'), dnN=neighborCell('down'), lfN=neighborCell('left'), rtN=neighborCell('right');
    const upCol = state.lockDoors? '#8B4513' : '#0f1419'; // Brown locked door or dark open doorway
    const dnCol = state.lockDoors? '#8B4513' : '#0f1419';
    const lfCol = state.lockDoors? '#8B4513' : '#0f1419';
    const rtCol = state.lockDoors? '#8B4513' : '#0f1419';

    // Draw doorways as dark recesses that go through the wall
    if(c.doors.up){ 
      cx.fillStyle=upCol; 
      cx.fillRect(x+w/2-DOOR_W/2, y, DOOR_W, wallThickness);
      // Add door frame
      cx.strokeStyle = '#0a0f14';
      cx.lineWidth = 2;
      cx.strokeRect(x+w/2-DOOR_W/2, y, DOOR_W, wallThickness);
      // Add lock symbol if locked
      if(state.lockDoors) drawLockSymbol(x+w/2, y+wallThickness/2);
      if(upN && upN.type===RT.BOSS){ glowDoor(x+w/2-DOOR_W/2, y, DOOR_W, wallThickness); } 
    }
    
    if(c.doors.down){ 
      cx.fillStyle=dnCol; 
      cx.fillRect(x+w/2-DOOR_W/2, y+h-wallThickness, DOOR_W, wallThickness);
      // Add door frame
      cx.strokeStyle = '#0a0f14';
      cx.lineWidth = 2;
      cx.strokeRect(x+w/2-DOOR_W/2, y+h-wallThickness, DOOR_W, wallThickness);
      // Add lock symbol if locked
      if(state.lockDoors) drawLockSymbol(x+w/2, y+h-wallThickness/2);
      if(dnN && dnN.type===RT.BOSS){ glowDoor(x+w/2-DOOR_W/2, y+h-wallThickness, DOOR_W, wallThickness); } 
    }
    
    if(c.doors.left){ 
      cx.fillStyle=lfCol; 
      cx.fillRect(x, y+h/2-DOOR_W/2, wallThickness, DOOR_W);
      // Add door frame
      cx.strokeStyle = '#0a0f14';
      cx.lineWidth = 2;
      cx.strokeRect(x, y+h/2-DOOR_W/2, wallThickness, DOOR_W);
      // Add lock symbol if locked
      if(state.lockDoors) drawLockSymbol(x+wallThickness/2, y+h/2);
      if(lfN && lfN.type===RT.BOSS){ glowDoor(x, y+h/2-DOOR_W/2, wallThickness, DOOR_W); } 
    }
    
    if(c.doors.right){ 
      cx.fillStyle=rtCol; 
      cx.fillRect(x+w-wallThickness, y+h/2-DOOR_W/2, wallThickness, DOOR_W);
      // Add door frame
      cx.strokeStyle = '#0a0f14';
      cx.lineWidth = 2;
      cx.strokeRect(x+w-wallThickness, y+h/2-DOOR_W/2, wallThickness, DOOR_W);
      // Add lock symbol if locked
      if(state.lockDoors) drawLockSymbol(x+w-wallThickness/2, y+h/2);
      if(rtN && rtN.type===RT.BOSS){ glowDoor(x+w-wallThickness, y+h/2-DOOR_W/2, wallThickness, DOOR_W); } 
    }
    
    cx.restore();
  }

  function drawLockSymbol(centerX, centerY) {
    cx.save();
    cx.fillStyle = '#FFD700'; // Gold color for lock
    cx.strokeStyle = '#B8860B'; // Dark gold outline
    cx.lineWidth = 1.5;
    
    // Draw lock body (rectangle)
    const lockSize = 8;
    cx.fillRect(centerX - lockSize/2, centerY - lockSize/4, lockSize, lockSize/2);
    cx.strokeRect(centerX - lockSize/2, centerY - lockSize/4, lockSize, lockSize/2);
    
    // Draw lock shackle (semicircle)
    cx.beginPath();
    cx.arc(centerX, centerY - lockSize/4, lockSize/3, Math.PI, 0);
    cx.stroke();
    
    cx.restore();
  }

  function glowDoor(x,y,w,h){ cx.save(); cx.globalAlpha=0.35; cx.fillStyle='#f06c6c'; cx.fillRect(x-6,y-6,w+12,h+12); cx.restore(); }

  function tryChangeRoom(){
    if(state.lockDoors) { return; }
    if(!state.room || !state.map) return;
    if(!state.player) return;
    const p=state.player; const x=ROOM_ORIGIN.x, y=ROOM_ORIGIN.y, w=ROOM_W, h=ROOM_H;
    const wallThickness = 32;
    const triggerZone = 25; // Distance from wall edge to trigger transition
    
    const atUpDoor = state.room.doors.up && Math.abs(p.x-(x+w/2))<DOOR_W/2 && p.y < y + wallThickness + triggerZone;
    const atDownDoor = state.room.doors.down && Math.abs(p.x-(x+w/2))<DOOR_W/2 && p.y > y + h - wallThickness - triggerZone;
    const atLeftDoor = state.room.doors.left && Math.abs(p.y-(y+h/2))<DOOR_W/2 && p.x < x + wallThickness + triggerZone;
    const atRightDoor = state.room.doors.right && Math.abs(p.y-(y+h/2))<DOOR_W/2 && p.x > x + w - wallThickness - triggerZone;
    if(atUpDoor){ const next = state.map.grid[state.room.y-1][state.room.x]; saveCurrentRoomState(); enterRoom(next); p.y = y + h - wallThickness - p.r - 5; }
    else if(atDownDoor){ const next = state.map.grid[state.room.y+1][state.room.x]; saveCurrentRoomState(); enterRoom(next); p.y = y + wallThickness + p.r + 5; }
    else if(atLeftDoor){ const next = state.map.grid[state.room.y][state.room.x-1]; saveCurrentRoomState(); enterRoom(next); p.x = x + w - wallThickness - p.r - 5; }
    else if(atRightDoor){ const next = state.map.grid[state.room.y][state.room.x+1]; saveCurrentRoomState(); enterRoom(next); p.x = x + wallThickness + p.r + 5; }
  }

  function drawMiniMap(){
    if(!state.map || !state.room) return;
    
    // Clear the minimap canvas
    minimapCx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    
    const cellSize = 20;
    const mapW = state.map.W * cellSize;
    const mapH = state.map.H * cellSize;
    
    // Center the map on the minimap canvas
    const offsetX = (minimapCanvas.width - mapW) / 2;
    const offsetY = (minimapCanvas.height - mapH) / 2;
    
    minimapCx.save();
    
    // Helper to check if a room should be visible
    const isVisible = (c) => {
      if(!c) return false;
      // Show if visited
      if(c.visited) return true;
      // Show if adjacent to current room
      if(!state.room) return false;
      const dx = Math.abs(c.x - state.room.x);
      const dy = Math.abs(c.y - state.room.y);
      return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
    };
    
    for(let gy=0; gy<state.map.H; gy++){
      for(let gx=0; gx<state.map.W; gx++){
        const c = state.map.grid[gy][gx]; 
        if(!c || !isVisible(c)) continue; 
        const rx = offsetX + gx*cellSize;
        const ry = offsetY + gy*cellSize;
        
        minimapCx.fillStyle = c.type===RT.BOSS? '#f06c6c' : (c.type===RT.TREASURE? '#f5d76e' : (c.type===RT.START? '#a1cdfc' : '#9db0c7'));
        minimapCx.globalAlpha = c.visited? 1.0 : 0.5;
        minimapCx.fillRect(rx, ry, cellSize-2, cellSize-2);
        
        if(state.room && c.x===state.room.x && c.y===state.room.y){ 
          minimapCx.globalAlpha = 1; 
          minimapCx.strokeStyle = '#ffffff'; 
          minimapCx.lineWidth = 3; 
          minimapCx.strokeRect(rx-1, ry-1, cellSize, cellSize); 
        }
      }
    }
    minimapCx.restore();
  }

  function lineCircle(x1,y1,x2,y2,cx0,cy0,r){
    const dx=x2-x1, dy=y2-y1; const l2=dx*dx+dy*dy; if(l2===0) return false; let t=((cx0-x1)*dx+(cy0-y1)*dy)/l2; t=clamp(t,0,1); const px=x1+t*dx, py=y1+t*dy; const d2=dist2(px,py,cx0,cy0); return d2<=r*r;
  }

  function outOfRoom(x,y){ return x<ROOM_ORIGIN.x || x>ROOM_ORIGIN.x+ROOM_W || y<ROOM_ORIGIN.y || y>ROOM_ORIGIN.y+ROOM_H; }
  
  function keepEnemyInBounds(e) {
    const padding = e.r + 2;
    if(e.x < ROOM_ORIGIN.x + padding) e.x = ROOM_ORIGIN.x + padding;
    if(e.x > ROOM_ORIGIN.x + ROOM_W - padding) e.x = ROOM_ORIGIN.x + ROOM_W - padding;
    if(e.y < ROOM_ORIGIN.y + padding) e.y = ROOM_ORIGIN.y + padding;
    if(e.y > ROOM_ORIGIN.y + ROOM_H - padding) e.y = ROOM_ORIGIN.y + ROOM_H - padding;
  }
  
  function lineToPointDistance(x1, y1, x2, y2, px, py) {
    const dx = x2 - x1, dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if(length === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
    const projection = { x: x1 + t * dx, y: y1 + t * dy };
    return Math.hypot(px - projection.x, py - projection.y);
  }
  
  function checkMazeCollision(newX, newY, playerRadius) {
    if(!state.roomState?.obstacles) return false;
    
    for(const obs of state.roomState.obstacles) {
      if(obs.type === 'wall') {
        // Check collision with wall rectangle
        if(newX + playerRadius > obs.x && newX - playerRadius < obs.x + obs.w &&
           newY + playerRadius > obs.y && newY - playerRadius < obs.y + obs.h) {
          return true;
        }
      }
    }
    return false;
  }
  
  function keepEnemyInBounds(e) {
    const padding = e.r + 2;
    if(e.x < ROOM_ORIGIN.x + padding) e.x = ROOM_ORIGIN.x + padding;
    if(e.x > ROOM_ORIGIN.x + ROOM_W - padding) e.x = ROOM_ORIGIN.x + ROOM_W - padding;
    if(e.y < ROOM_ORIGIN.y + padding) e.y = ROOM_ORIGIN.y + padding;
    if(e.y > ROOM_ORIGIN.y + ROOM_H - padding) e.y = ROOM_ORIGIN.y + ROOM_H - padding;
  }
  function confineToRoom(o){ 
    const wallThickness = 32;
    const c = state.room;
    
    // Check if player is in a doorway area - if so, allow them to pass through
    const inUpDoor = c && c.doors.up && Math.abs(o.x - (ROOM_ORIGIN.x + ROOM_W/2)) < DOOR_W/2;
    const inDownDoor = c && c.doors.down && Math.abs(o.x - (ROOM_ORIGIN.x + ROOM_W/2)) < DOOR_W/2;
    const inLeftDoor = c && c.doors.left && Math.abs(o.y - (ROOM_ORIGIN.y + ROOM_H/2)) < DOOR_W/2;
    const inRightDoor = c && c.doors.right && Math.abs(o.y - (ROOM_ORIGIN.y + ROOM_H/2)) < DOOR_W/2;
    
    // Normal wall boundaries
    let minX = ROOM_ORIGIN.x + wallThickness + o.r;
    let maxX = ROOM_ORIGIN.x + ROOM_W - wallThickness - o.r;
    let minY = ROOM_ORIGIN.y + wallThickness + o.r;
    let maxY = ROOM_ORIGIN.y + ROOM_H - wallThickness - o.r;
    
    // Extend boundaries at doorways to allow passage
    if(inUpDoor) minY = ROOM_ORIGIN.y + o.r;
    if(inDownDoor) maxY = ROOM_ORIGIN.y + ROOM_H - o.r;
    if(inLeftDoor) minX = ROOM_ORIGIN.x + o.r;
    if(inRightDoor) maxX = ROOM_ORIGIN.x + ROOM_W - o.r;
    
    o.x = clamp(o.x, minX, maxX); 
    o.y = clamp(o.y, minY, maxY); 
  }

  function updateHUD(){ 
    const p = state.player; 
    if(!p) return; 
    const rt = state.room? state.room.type : '—'; 
    const label = rt===RT.START?'Start': rt===RT.TREASURE?'Treasure': rt===RT.BOSS?'Boss':'Combat'; 
    if(HUD.hearts) HUD.hearts.textContent = '❤'.repeat(p.hearts) + ' '.repeat(Math.max(0,p.maxHearts-p.hearts)); 
    if(HUD.ammo) HUD.ammo.textContent = `${p.ammo} / ${p.clipSize}`; 
    if(HUD.level) HUD.level.textContent = `Floor ${state.floor} — ${label}`; 
    if(HUD.score) HUD.score.textContent = `Score ${state.score}`;
    
    // Update item list
    if(HUD.itemListContent && p.items) {
      if(p.items.length === 0) {
        HUD.itemListContent.innerHTML = '<div style="color:#9db0c7;font-size:12px;font-style:italic;">No items yet</div>';
      } else {
        HUD.itemListContent.innerHTML = p.items.map(itemId => {
          const itemData = ItemPoolMaster.find(item => item.id === itemId);
          if(!itemData) return '';
          return `<div class="itemEntry"><div class="itemName">${itemData.name}</div><div class="itemDesc">${itemData.desc}</div></div>`;
        }).filter(s => s).join('');
      }
    }
  }

  function updateMenu(dt) {
    // Update menu button position - larger for full window
    state.menuButton.w = 250;
    state.menuButton.h = 60;
    state.menuButton.x = canvas.width / 2 - state.menuButton.w / 2;
    state.menuButton.y = canvas.height / 2 + 50;
    
    // Check if mouse is hovering over button
    if(input.mouseX >= state.menuButton.x && input.mouseX <= state.menuButton.x + state.menuButton.w &&
       input.mouseY >= state.menuButton.y && input.mouseY <= state.menuButton.y + state.menuButton.h) {
      state.menuButton.hovered = true;
      canvas.style.cursor = 'pointer';
    } else {
      state.menuButton.hovered = false;
      canvas.style.cursor = 'default';
    }
  }
  
  function updateFade(dt) {
    state.fadeTimer += dt;
    
    if(state.gameState === 'fadeOut') {
      state.fadeAlpha = Math.min(1, state.fadeTimer / 500); // 0.5 second fade out
      if(state.fadeAlpha >= 1) {
        state.gameState = 'loading';
        state.fadeTimer = 0;
      }
    } else if(state.gameState === 'fadeIn') {
      state.fadeAlpha = Math.max(0, 1 - (state.fadeTimer / 500)); // 0.5 second fade in
      if(state.fadeAlpha <= 0) {
        state.gameState = 'playing';
      }
    }
  }
  
  function drawMenu() {
    cx.fillStyle = '#000000';
    cx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw menu background image to cover entire window
    const img = Assets.images['menu'];
    if(img) {
      // Scale image to cover entire canvas
      const scaleX = canvas.width / img.width;
      const scaleY = canvas.height / img.height;
      const scale = Math.max(scaleX, scaleY); // Cover entire area
      const width = img.width * scale;
      const height = img.height * scale;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;
      cx.drawImage(img, x, y, width, height);
    } else {
      // Fallback if menu sprite not loaded - cover full window
      cx.fillStyle = '#1a1a2e';
      cx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Gradient background as fallback covering full window
      const gradient = cx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height));
      gradient.addColorStop(0, '#2d1b69');
      gradient.addColorStop(1, '#0f0f23');
      cx.fillStyle = gradient;
      cx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Draw "Iron Resolve" title - centered for full window
    cx.save();
    cx.fillStyle = '#ffffff';
    cx.strokeStyle = '#ff6b6b';
    cx.lineWidth = 4;
    cx.font = '700 64px system-ui';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    const titleY = canvas.height / 2 - 80;
    cx.strokeText('Iron Resolve', canvas.width / 2, titleY);
    cx.fillText('Iron Resolve', canvas.width / 2, titleY);
    cx.restore();
    
    // Draw start button
    cx.save();
    const btn = state.menuButton;
    
    // Button background
    cx.fillStyle = btn.hovered ? '#ff8888' : '#ff6b6b';
    cx.strokeStyle = '#ffffff';
    cx.lineWidth = 3;
    cx.fillRect(btn.x, btn.y, btn.w, btn.h);
    cx.strokeRect(btn.x, btn.y, btn.w, btn.h);
    
    // Button text - larger for full window display
    cx.fillStyle = '#ffffff';
    cx.font = '700 28px system-ui';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('Start Game', btn.x + btn.w / 2, btn.y + btn.h / 2);
    cx.restore();
  }
  
  function drawFade() {
    cx.save();
    cx.fillStyle = `rgba(0, 0, 0, ${state.fadeAlpha})`;
    cx.fillRect(0, 0, canvas.width, canvas.height);
    cx.restore();
  }
  
  function drawLoading() {
    cx.fillStyle = '#000000';
    cx.fillRect(0, 0, canvas.width, canvas.height);
    
    cx.save();
    cx.fillStyle = '#ffffff';
    cx.font = '700 32px system-ui';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('Loading...', canvas.width / 2, canvas.height / 2);
    cx.restore();
  }
  
  function updateInstructions(dt) {
    // Instructions screen - can start game with any key press or mouse click
  }
  
  function drawInstructions() {
    // Draw menu background image to cover entire window
    const img = Assets.images['menu'];
    if(img) {
      // Scale image to cover entire canvas
      const scaleX = canvas.width / img.width;
      const scaleY = canvas.height / img.height;
      const scale = Math.max(scaleX, scaleY); // Cover entire area
      const width = img.width * scale;
      const height = img.height * scale;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;
      cx.drawImage(img, x, y, width, height);
    } else {
      // Fallback dark background
      cx.fillStyle = '#0a0a0a';
      cx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // This will draw the original instruction screen content over the background
    draw(); // This draws the original instruction screen
  }
  
  function initializeGame() {
    // Initialize all game systems here
    if(state.idle) {
      state.newRun();
    }
  }

  let last=performance.now();
  let accumulator = 0;
  const FIXED_TIMESTEP = 12.5; // 80 FPS fixed timestep
  function loop(t){ 
    const frameTime = Math.min(t-last, 250); // Cap frame time to prevent spiral of death
    last = t;
    accumulator += frameTime;
    
    // Normal game loop
    while(accumulator >= FIXED_TIMESTEP) {
      if(!state.idle && !state.dead && !state.win){ 
        try { 
          update(FIXED_TIMESTEP); 
          tryChangeRoom(); 
        } catch(err){ 
          console.error('Update error:', err); 
        } 
      }
      accumulator -= FIXED_TIMESTEP;
    }
    draw();
    
    requestAnimationFrame(loop); 
  }
  requestAnimationFrame(loop);

  // preload sprites in the background (game will draw vector fallbacks until ready)
  loadAssets();
  


  // expose some things for console debugging (optional)
  window.__game = { state, input, Assets };
})();
