// Item definitions and helpers
const shuffle = (arr)=>{ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } return a; };

export const ItemPoolMaster = [
  // Original items
  { id:'triple', name:'Tri-Grace', desc:'Shoot 3 projectiles + accuracy boost', apply:(p)=>{ p.mods.triple=true; p.mods.accuracy = (p.mods.accuracy||0) - 0.2; } },
  { id:'laser', name:'Saint Beam', desc:'Charge up devastating laser beams', apply:(p)=>{ p.mods.laser=true; p.laserMaxCharge = Math.max(1200, p.laserMaxCharge-400); } },
  { id:'pierce', name:'Lance Point', desc:'Projectiles pierce + damage boost', apply:(p)=>{ p.mods.pierce=true; p.mods.damage = (p.mods.damage||0) + 1; } },
  { id:'explosive', name:"Alchemist's Round", desc:'Shots explode on hit + knockback boost', apply:(p)=>{ p.mods.explosive=true; p.mods.knockback = (p.mods.knockback||1) + 0.8; } },
  { id:'rapid', name:'Clockwork Trigger', desc:'Faster fire rate + bullet speed', apply:(p)=>{ p.mods.rapid++; p.fireDelay = Math.max(150, p.fireDelay-60); p.bulletSpeed += 0.8; } },
  { id:'boots', name:'Sabaton Dash', desc:'Increased movement speed', apply:(p)=>{ p.mods.speed++; p.speed += 0.25; } },
  { id:'heartUp', name:'Bigger Body', desc:'+1 maximum heart', apply:(p)=>{ p.maxHearts = Math.min(8, p.maxHearts+1); p.hearts = Math.min(p.maxHearts, p.hearts+1); } },
  { id:'ricochet', name:'Mirror Shot', desc:'Projectiles bounce once', apply:(p)=>{ p.mods.ricochet=true; } },
  { id:'bigClip', name:'Bandolier', desc:'+2 to clip size', apply:(p)=>{ p.clipSize+=2; p.ammo+=2; } },
  { id:'range', name:'Long Barrel', desc:'Bullets last longer', apply:(p)=>{ p.mods.range++; } },
  { id:'damage', name:'Knight Oath', desc:'+1 damage per hit', apply:(p)=>{ p.mods.damage++; } },
  { id:'knockback', name:'Force Gauntlets', desc:'Bullets knock enemies back further', apply:(p)=>{ p.mods.knockback = (p.mods.knockback||1) + 1.5; } },
  { id:'healOnBoss', name:'Royal Favor', desc:'Heal fully after a boss', apply:(p)=>{ p.mods.healOnBoss=true; } },

  // New pure positive items
  { id:'biggerKnockback', name:'Titan Fist', desc:'Massive knockback power', apply:(p)=>{ p.mods.knockback = (p.mods.knockback||1) + 2.5; } },
  { id:'swiftness', name:'Swift Boots', desc:'Increased movement speed + reload speed', apply:(p)=>{ p.speed += 0.4; p.reloadTime = Math.max(200, p.reloadTime-100); } },
  { id:'bulletSpeed', name:'Velocity Chamber', desc:'Bullets travel faster', apply:(p)=>{ p.bulletSpeed += 1.8; } },
  { id:'doubleShot', name:'Twin Barrels', desc:'Fire 2 bullets at once', apply:(p)=>{ p.mods.doubleShot=true; } },
  { id:'biggerBullets', name:'Heavy Rounds', desc:'Larger bullet size', apply:(p)=>{ p.mods.bulletSize = (p.mods.bulletSize||1) + 0.4; } },
  { id:'invulnTime', name:'Divine Shield', desc:'Longer invulnerability after hit', apply:(p)=>{ p.mods.invulnTime = (p.mods.invulnTime||1) + 0.5; } },
  { id:'multiRicochet', name:'Chaos Shot', desc:'Bullets bounce 3 times', apply:(p)=>{ p.mods.ricochet=true; p.mods.multiBounce=3; } },
  { id:'heartRegen', name:'Living Armor', desc:'Slowly regenerate health', apply:(p)=>{ p.mods.heartRegen=true; } },
  { id:'ghostBullets', name:'Spectral Rounds', desc:'Bullets wrap around room edges + huge range boost', apply:(p)=>{ p.mods.ghostBullets=true; p.mods.range = (p.mods.range||0) + 3; } },
  { id:'rapidReload', name:'Quick Hands', desc:'Faster reload speed', apply:(p)=>{ p.reloadTime = Math.max(300, p.reloadTime-200); } },

  // Combination items (positive + negative tradeoffs)
  { id:'soyMilk', name:'Soy Milk', desc:'Very fast fire rate, huge clip, but less damage', apply:(p)=>{ p.fireDelay = Math.max(80, p.fireDelay-120); p.mods.damage = Math.max(-1, (p.mods.damage||0) - 1); p.clipSize += 15; p.ammo += 15; p.bulletSpeed += 0.5; } },
  { id:'glassCanon', name:'Glass Canon', desc:'+3 damage but -2 max hearts', apply:(p)=>{ p.mods.damage = (p.mods.damage||0) + 3; p.maxHearts = Math.max(1, p.maxHearts-2); p.hearts = Math.min(p.hearts, p.maxHearts); } },
  { id:'berserker', name:'Berserker Rage', desc:'Faster movement and fire rate when low HP', apply:(p)=>{ p.mods.berserker=true; } },
  { id:'heavyShot', name:'Heavy Shot', desc:'More damage, range and knockback but slower fire rate', apply:(p)=>{ p.mods.damage = (p.mods.damage||0) + 2; p.mods.knockback = (p.mods.knockback||1) + 1.5; p.mods.range = (p.mods.range||0) + 1; p.fireDelay += 60; } },
  { id:'scatterShot', name:'Scatter Shot', desc:'Fire 5 bullets in spread + range/speed boost', apply:(p)=>{ p.mods.scatterShot=true; p.mods.accuracy = (p.mods.accuracy||0) - 0.3; p.mods.range = (p.mods.range||0) + 1; p.bulletSpeed += 1.2; } },
  { id:'fragileSpeed', name:'Fragile Speed', desc:'Much faster movement but take double damage', apply:(p)=>{ p.speed += 0.8; p.mods.fragileDamage=true; } },
  { id:'bigClipSlow', name:'Drum Magazine', desc:'Huge clip size but slower reload', apply:(p)=>{ p.clipSize += 8; p.ammo += 8; p.reloadTime += 400; } },
  { id:'lifeSteal', name:'Vampire Rounds', desc:'Heal when killing enemies but lower max HP', apply:(p)=>{ p.mods.lifeSteal=true; p.maxHearts = Math.max(1, p.maxHearts-1); p.hearts = Math.min(p.hearts, p.maxHearts); } },
  { id:'explodeOnHit', name:'Martyrdom', desc:'Explode when taking damage, damaging nearby enemies', apply:(p)=>{ p.mods.explodeOnHit=true; } },
  { id:'randomDamage', name:'Chaos Dice', desc:'Random damage (1-4) per shot', apply:(p)=>{ p.mods.randomDamage=true; } },

  // Unique mechanic items
  { id:'homingShots', name:'Seeking Rounds', desc:'Bullets home toward enemies + range boost', apply:(p)=>{ p.mods.homing=true; p.mods.range = (p.mods.range||0) + 1; } },
  { id:'spiralShot', name:'Spiral Artillery', desc:'Bullets curve in spirals + speed/range boost', apply:(p)=>{ p.mods.spiralShot=true; p.bulletSpeed += 1.5; p.mods.range = (p.mods.range||0) + 1; } },
  { id:'precisionScope', name:'Precision Scope', desc:'Perfect accuracy + range boost', apply:(p)=>{ p.mods.accuracy = -0.8; p.mods.range = (p.mods.range||0) + 1; } },
  { id:'wideShot', name:'Spread Cannon', desc:'Bullets are wider + piercing effect', apply:(p)=>{ p.mods.bulletSize = (p.mods.bulletSize||1) + 0.6; p.mods.pierce=true; } },
  { id:'poisonShots', name:'Toxic Rounds', desc:'Bullets poison enemies over time', apply:(p)=>{ p.mods.poisonShots=true; } },
  { id:'iceShots', name:'Frost Bullets', desc:'Bullets slow enemies on hit', apply:(p)=>{ p.mods.iceShots=true; } },
  { id:'fireShots', name:'Inferno Rounds', desc:'Bullets burn enemies for extra damage', apply:(p)=>{ p.mods.fireShots=true; } },
  { id:'phaseShift', name:'Phase Shift', desc:'Temporary invulnerability after taking damage', apply:(p)=>{ p.mods.invulnTime = (p.mods.invulnTime||1) + 1.0; } },
  { id:'retaliationAura', name:'Retaliation Aura', desc:'Explode when hit + knockback resistance', apply:(p)=>{ p.mods.explodeOnHit=true; p.mods.knockbackResist=true; } },
  { id:'penetratingShot', name:'Armor Piercer', desc:'Bullets ignore enemy defenses + damage boost', apply:(p)=>{ p.mods.armorPierce=true; p.mods.damage = (p.mods.damage||0) + 1; } },

  // Extreme combination items
  { id:'oneHitWonder', name:'One Hit Wonder', desc:'Massive damage but only 1 HP', apply:(p)=>{ p.mods.damage = (p.mods.damage||0) + 8; p.maxHearts = 1; p.hearts = 1; } },
  { id:'machineGun', name:'Machine Gun', desc:'Extremely fast fire + huge ammo but tiny damage', apply:(p)=>{ p.fireDelay = 45; p.mods.damage = Math.max(-3, (p.mods.damage||0) - 3); p.mods.rapid += 3; p.clipSize += 25; p.ammo += 25; } },
  { id:'sniper', name:'Sniper Rifle', desc:'Huge damage and range but very slow fire', apply:(p)=>{ p.mods.damage = (p.mods.damage||0) + 4; p.mods.range += 2; p.fireDelay += 100; p.bulletSpeed += 2; } },
  { id:'shotgun', name:'Shotgun Blast', desc:'Fire 8 bullets + knockback but short range', apply:(p)=>{ p.mods.shotgun=true; p.mods.range = Math.max(-1, (p.mods.range||0) - 1); p.mods.knockback = (p.mods.knockback||1) + 1; } },
  { id:'boomerang', name:'Boomerang Bullets', desc:'Bullets return + piercing + extended range', apply:(p)=>{ p.mods.boomerang=true; p.fireDelay += 40; p.mods.pierce=true; p.mods.range = (p.mods.range||0) + 2; p.bulletSpeed += 1.0; } },
];

export function resetItemPool(state){
  state.itemPool = shuffle(ItemPoolMaster);
}

export function giveItem(state, p, item){
  p.items.push(item.id);
  item.apply(p);
  state.toast = { text:`${item.name}: ${item.desc}`, t:2200 };
}

export function spawnTreasure(state, canvas){
  if(state.itemPool.length===0){
    state.pickups.push({type:'heart', x: canvas.width/2, y: canvas.height/2, r:14});
    return;
  }
  const item = state.itemPool.pop();
  const c = {type:'item', x: canvas.width/2, y: canvas.height/2, r:14, taken:false, item};
  state.pickups.push(c);
}