// enemies.js — Enemy factory, spawners, and safe death/explosion handling.
// Now assigns a `sprite` key for each enemy matching your PNG name in /assets/.

export function applyTier(e, level){
  const tier=Math.floor((level-1)/3);
  if(tier>0){ e.hp = Math.round(e.hp*(1+0.35*tier)); e.speed = (e.speed||0) + 0.15*tier; if(e.shootCD) e.shootCD = Math.max(280, e.shootCD - 80*tier); }
  if(tier>0 && Math.random()<0.25){ e.elite=true; e.hp = Math.round(e.hp*1.25); if(e.shootCD) e.shootCD = Math.max(240, e.shootCD-120); e.speed += 0.2; }
  return e;
}

export function makeEnemy(kind,x,y, level){
  let e;
  if(kind==='ghoul')   e = {type:'enemy', etype:'ghoul',   sprite:'ghoul',   x,y, r:18, hp:2+Math.floor(level/2), speed:2.0+level*0.05, t:0};
  else if(kind==='archer') e = {type:'enemy', etype:'archer', sprite:'archer', x,y, r:18, hp:3+Math.floor(level/2), speed:1.4+level*0.04, t:0, shootCD:randInt(1000,1500)};
  else if(kind==='turret') e = {type:'enemy', etype:'turret', sprite:'turret', x,y, r:18, hp:4+Math.floor(level/1.5), speed:0, t:0, shootCD:2400};
  else if(kind==='charger')e = {type:'enemy', etype:'charger',sprite:'charger',x,y, r:28, hp:3+Math.floor(level/2), speed:1.2+level*0.025, t:0, dashCD:1400, dashT:0, vx:0, vy:0};
  else if(kind==='warlock')e = {type:'enemy', etype:'warlock', sprite:'warlock',x,y, r:14, hp:5+Math.floor(level/2), speed:1.1+level*0.025, t:0, shootCD:1000};
  else if(kind==='sniper') e = {type:'enemy', etype:'sniper', sprite:'sniper', x,y, r:12, hp:3+Math.floor(level/2), speed:1.2+level*0.025, t:0, shootCD:2000};
  else if(kind==='bomber') e = {type:'enemy', etype:'bomber', sprite:'bomber', x,y, r:12, hp:2+Math.floor(level/3), speed:1.8+level*0.035, t:0, fuse:0};
  // Boss types - 10 different bosses plus final boss
  else if(kind==='boss1')  e = {type:'enemy', etype:'boss1',  sprite:'boss', x,y, r:28, hp: 60 + level*12, speed:0.8+level*0.02, t:0, shootCD:1200, orbitAngle:0}; // Orbital Cannon
  else if(kind==='boss2')  e = {type:'enemy', etype:'boss2',  sprite:'boss', x,y, r:26, hp: 55 + level*10, speed:1.2+level*0.03, t:0, dashCD:2000, dashT:0, vx:0, vy:0}; // Berserker Dasher
  else if(kind==='boss3')  e = {type:'enemy', etype:'boss3',  sprite:'boss', x,y, r:30, hp: 70 + level*15, speed:0.5+level*0.01, t:0, shootCD:800, minionCD:3000, minions:0}; // Necromancer
  else if(kind==='boss4')  e = {type:'enemy', etype:'boss4',  sprite:'boss', x,y, r:24, hp: 45 + level*8, speed:1.5+level*0.04, t:0, shootCD:600, teleportCD:2500}; // Shadow Teleporter
  else if(kind==='boss5')  e = {type:'enemy', etype:'boss5',  sprite:'boss', x,y, r:32, hp: 80 + level*18, speed:0.6+level*0.015, t:0, shootCD:1000, shieldHP:20, shieldCD:4000}; // Shield Guardian
  else if(kind==='boss6')  e = {type:'enemy', etype:'boss6',  sprite:'boss', x,y, r:25, hp: 50 + level*11, speed:1.0+level*0.025, t:0, shootCD:700, waveCD:3500, phase:0}; // Elemental Mage
  else if(kind==='boss7')  e = {type:'enemy', etype:'boss7',  sprite:'boss', x,y, r:27, hp: 65 + level*13, speed:0.9+level*0.02, t:0, shootCD:900, spiralAngle:0}; // Spiral Destroyer
  else if(kind==='boss8')  e = {type:'enemy', etype:'boss8',  sprite:'boss', x,y, r:29, hp: 75 + level*16, speed:0.7+level*0.018, t:0, shootCD:1100, bombCD:2000}; // Bomber Lord
  else if(kind==='boss9')  e = {type:'enemy', etype:'boss9',  sprite:'boss', x,y, r:23, hp: 40 + level*9, speed:1.8+level*0.05, t:0, shootCD:500, cloneCD:4000, clones:0}; // Speed Demon
  else if(kind==='boss10') e = {type:'enemy', etype:'boss10', sprite:'boss', x,y, r:26, hp: 55 + level*12, speed:1.1+level*0.03, t:0, shootCD:800, laserCD:3000, reflecting:false}; // Laser Reflector
  else if(kind==='finalboss') e = {type:'enemy', etype:'finalboss', sprite:'boss', x,y, r:40, hp: 200 + level*30, speed:0.8+level*0.02, t:0, phase:1, phaseTimer:0, shootCD:600, specialCD:2000, enraged:false}; // Final Boss
  else if(kind==='boss')   e = {type:'enemy', etype:'boss1',  sprite:'boss', x,y, r:28, hp: 60 + level*12, speed:0.8+level*0.02, t:0, shootCD:1200, orbitAngle:0}; // Default fallback
  else e = {type:'enemy', etype:'ghoul', sprite:'ghoul', x,y, r:18, hp:3, speed:1.5, t:0};
  return applyTier(e, level);
}

function randInt(a,b){ return (Math.random()*((b+1)-a)+a)|0; }

// Spawn waves — these helpers push into state.entities using makeEnemy and randomRoomEdgePoint prop
export function spawnCombatWave(state, randomRoomEdgePoint){
  const tier = Math.floor((state.floor-1)/3);
  const n = 5 + Math.floor(state.floor*1.2) + randInt(0,3) + tier;
  for(let i=0;i<n;i++){
    const base = ['ghoul','archer','charger'];
    const lessCommon = ['turret'];
    const extra = state.floor>=3 ? ['warlock','sniper','bomber'] : [];
    
    // 70% chance for base enemies, 30% chance for turret
    let kind;
    if(Math.random() < 0.7) {
      const pool = base.concat(extra);
      kind = pool[(Math.random()*pool.length)|0];
    } else {
      kind = 'turret';
    }
    
    const pos = randomRoomEdgePoint();
    state.entities.push(makeEnemy(kind,pos.x,pos.y,state.floor));
  }
}

export function spawnBoss(state, canvas){
  const pos = {x: canvas.width/2, y: canvas.height/2};
  
  // Final boss appears after floor 5
  if(state.floor > 5){
    state.entities.push(makeEnemy('finalboss', pos.x, pos.y, state.floor));
  } else {
    // Random boss from 1-10
    const bossNum = Math.floor(Math.random() * 10) + 1;
    const bossType = 'boss' + bossNum;
    state.entities.push(makeEnemy(bossType, pos.x, pos.y, state.floor));
  }
}

// Explosion: damage nearby enemies. This function is careful about removals.
// source: 'player' = player-caused explosion, 'enemy' = enemy-caused explosion
export function explode(state, x, y, source = 'player'){
  state.effects.push({type:'boom', x,y, r:10, life:260});
  
  // Only damage enemies if this is a player-caused explosion
  if(source === 'player') {
    const toKill = [];
    for(let i=state.entities.length-1;i>=0;i--){
      const e = state.entities[i];
      if(!e || e._dead) continue;
      const dx = e.x - x, dy = e.y - y;
      if(dx*dx + dy*dy < (110*110)){
        e.hp -= 2;
        // Add hit flash
        e.hitFlash = 150;
        if(e.hp <= 0){
          e._dead = true;
          toKill.push(e);
        }
      }
    }
    for(const ent of toKill){
      onEnemyDie(state, ent);
    }
  }
}

export function onEnemyDie(state, entity){
  if(!entity || entity._processedDead) return;
  entity._processedDead = true;
  const idx = state.entities.indexOf(entity);
  if(idx !== -1){
    if(entity.etype === 'bomber'){
      explode(state, entity.x, entity.y, 'enemy'); // Visual explosion only
    }
    if(Math.random() < 0.05){
      if(typeof entity.x === 'number' && typeof entity.y === 'number'){
        state.pickups.push({type:'heart', x: entity.x, y: entity.y, r:8, t:0});
      }
    }
    state.entities.splice(idx, 1);
    if(state.room && state.room.entities){
      state.room.entities = state.entities.map(o=>({...o}));
    }
    state.score += entity.etype==='boss'?200: (entity.etype==='turret'?14: (entity.etype==='archer'||entity.etype==='sniper'?12: (entity.etype==='warlock'?16:10)));
  }
}
