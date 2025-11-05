// Enemy factory, spawners, and safe death/explosion handling.

export function applyTier(e, level){
  const tier=Math.floor((level-1)/3);
  if(tier>0){ e.hp = Math.round(e.hp*(1+0.35*tier)); e.speed = (e.speed||0) + 0.15*tier; if(e.shootCD) e.shootCD = Math.max(280, e.shootCD - 80*tier); }
  if(tier>0 && Math.random()<0.25){ e.elite=true; e.hp = Math.round(e.hp*1.25); if(e.shootCD) e.shootCD = Math.max(240, e.shootCD-120); e.speed += 0.2; }
  return e;
}

export function makeEnemy(kind,x,y, level){
  let e;
  if(kind==='ghoul') e = {type:'enemy', etype:'ghoul', x,y, r:12, hp:2+Math.floor(level/2), speed:1.7+level*0.04, t:0};
  else if(kind==='archer') e = {type:'enemy', etype:'archer', x,y, r:13, hp:3+Math.floor(level/2), speed:1.2+level*0.03, t:0, shootCD:randInt(700,1100)};
  else if(kind==='turret') e = {type:'enemy', etype:'turret', x,y, r:14, hp:4+Math.floor(level/1.5), speed:0, t:0, shootCD:800};
  else if(kind==='charger') e = {type:'enemy', etype:'charger', x,y, r:13, hp:3+Math.floor(level/2), speed:1.0+level*0.02, t:0, dashCD:1400, dashT:0, vx:0, vy:0};
  else if(kind==='warlock') e = {type:'enemy', etype:'warlock', x,y, r:14, hp:5+Math.floor(level/2), speed:0.9+level*0.02, t:0, shootCD:650};
  else if(kind==='sniper') e = {type:'enemy', etype:'sniper', x,y, r:12, hp:3+Math.floor(level/2), speed:1.0+level*0.02, t:0, shootCD:1400};
  else if(kind==='bomber') e = {type:'enemy', etype:'bomber', x,y, r:12, hp:2+Math.floor(level/3), speed:1.6+level*0.03, t:0, fuse:0};
  else if(kind==='boss') e = {type:'enemy', etype:'boss', x,y, r:24, hp: 80 + level*20, speed:0.8+level*0.02, t:0, phase:0, shootCD:700};
  else e = {type:'enemy', etype:'ghoul', x,y, r:12, hp:3, speed:1.5, t:0};
  return applyTier(e, level);
}

function randInt(a,b){ return (Math.random()*((b+1)-a)+a)|0; }

// Spawn waves — these helpers push into state.entities using makeEnemy and randomRoomEdgePoint prop
export function spawnCombatWave(state, randomRoomEdgePoint){
  const tier = Math.floor((state.floor-1)/3);
  const n = 5 + Math.floor(state.floor*1.2) + randInt(0,3) + tier;
  for(let i=0;i<n;i++){
    const base = ['ghoul','archer','turret','charger'];
    const extra = state.floor>=3 ? ['warlock','sniper','bomber'] : [];
    const kind = (base.concat(extra))[ (Math.random()* (base.length+extra.length) )|0 ];
    const pos = randomRoomEdgePoint();
    state.entities.push(makeEnemy(kind,pos.x,pos.y,state.floor));
  }
}

export function spawnBoss(state, canvas){
  const pos = {x: canvas.width/2, y: canvas.height/2};
  state.entities.push(makeEnemy('boss', pos.x, pos.y, state.floor));
}

// Explosion: damage nearby enemies. This function is careful about removals.
export function explode(state, x, y){
  state.effects.push({type:'boom', x,y, r:10, life:260});
  // collect entities that fall to zero or below
  const toKill = [];
  for(let i=state.entities.length-1;i>=0;i--){
    const e = state.entities[i];
    if(!e || e._dead) continue; // skip already-processed dead entities
    const dx = e.x - x, dy = e.y - y;
    if(dx*dx + dy*dy < (110*110)){
      e.hp -= 2;
      if(e.hp <= 0){
        // mark for removal but don't remove while iterating state.entities (avoid nested splices)
        e._dead = true;
        toKill.push(e);
      }
    }
  }
  // process the deaths after the scan (this may chain more explosions)
  for(const ent of toKill){
    onEnemyDie(state, ent);
  }
}

export function onEnemyDie(state, entity){
  // guard: only process once
  if(!entity || entity._processedDead) return;
  entity._processedDead = true;
  // ensure it's removed only if still present
  const idx = state.entities.indexOf(entity);
  if(idx !== -1){
    // bomber triggers explosion on death (chain) but we mark _processedDead so it's safe
    if(entity.etype === 'bomber'){
      // create explosion at bomber position (do not call onEnemyDie recursively here)
      explode(state, entity.x, entity.y);
    }
    // 5% chance to drop heart
    if(Math.random() < 0.05){
      if(typeof entity.x === 'number' && typeof entity.y === 'number'){
        state.pickups.push({type:'heart', x: entity.x, y: entity.y, r:8, t:0});
      }
    }
    // remove entity
    state.entities.splice(idx, 1);
    if(state.room && state.room.entities){
      state.room.entities = state.entities.map(o=>({...o}));
    }
    state.score += entity.etype==='boss'?200: (entity.etype==='turret'?14: (entity.etype==='archer'||entity.etype==='sniper'?12: (entity.etype==='warlock'?16:10)));
  }
}

// Safe removal: remove by reference so nested splices don't break loops that pass stale indices.
export function onEnemyDie(state, entity){
  // If entity not found (already removed), ignore.
  const idx = state.entities.indexOf(entity);
  if(idx === -1) return;
  // Bomber explosion chains
  if(entity.etype === 'bomber'){
    explode(state, entity.x, entity.y);
  }
  if(Math.random() < 0.05){
    // heart drop
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