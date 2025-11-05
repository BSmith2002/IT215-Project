// Item definitions and helpers
const shuffle = (arr)=>{ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } return a; };

export const ItemPoolMaster = [
  { id:'triple', name:'Tri-Grace', desc:'Shoot 3 projectiles', apply:(p)=>{ p.mods.triple=true; } },
  { id:'laser', name:'Saint Beam', desc:'You now shoot lasers (pierce)', apply:(p)=>{ p.mods.laser=true; p.mods.pierce=true; } },
  { id:'pierce', name:'Lance Point', desc:'Projectiles pierce', apply:(p)=>{ p.mods.pierce=true; } },
  { id:'explosive', name:"Alchemist's Round", desc:'Shots explode on hit', apply:(p)=>{ p.mods.explosive=true; } },
  { id:'rapid', name:'Clockwork Trigger', desc:'Faster fire rate', apply:(p)=>{ p.mods.rapid++; p.fireDelay = Math.max(70, p.fireDelay-25); } },
  { id:'boots', name:'Sabaton Dash', desc:'Increased movement speed', apply:(p)=>{ p.mods.speed++; p.speed += 0.25; } },
  { id:'heartUp', name:'Bigger Body', desc:'+1 maximum heart', apply:(p)=>{ p.maxHearts = Math.min(8, p.maxHearts+1); p.hearts = Math.min(p.maxHearts, p.hearts+1); } },
  { id:'ricochet', name:'Mirror Shot', desc:'Projectiles bounce once', apply:(p)=>{ p.mods.ricochet=true; } },
  { id:'bigClip', name:'Bandolier', desc:'+2 to clip size', apply:(p)=>{ p.clipSize+=2; p.ammo+=2; } },
  { id:'range', name:'Long Barrel', desc:'Bullets last longer', apply:(p)=>{ p.mods.range++; } },
  { id:'damage', name:'Knight Oath', desc:'+1 damage per hit', apply:(p)=>{ p.mods.damage++; } },
  { id:'healOnBoss', name:'Royal Favor', desc:'Heal fully after a boss', apply:(p)=>{ p.mods.healOnBoss=true; } },
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