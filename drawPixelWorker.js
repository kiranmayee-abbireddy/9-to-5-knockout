// Draw a pixelated office worker (bot or player)
function drawPixelWorker(entity) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // Bobbing animation
  let t = Date.now()/200 + (entity.isBot ? entity.x : 0);
  let bob = Math.floor(Math.abs(Math.sin(t))*2);
  // Body (shirt)
  ctx.fillStyle = entity.isBot ? entity.color : '#1976d2';
  ctx.fillRect(Math.round(entity.x-12), Math.round(entity.y-8+bob), 24, 18);
  // Head
  ctx.fillStyle = '#ffe0b2';
  ctx.fillRect(Math.round(entity.x-10), Math.round(entity.y-22+bob), 20, 14);
  // Eyes (pixel face)
  ctx.fillStyle = '#222';
  ctx.fillRect(Math.round(entity.x-5), Math.round(entity.y-18+bob), 3, 3);
  ctx.fillRect(Math.round(entity.x+2), Math.round(entity.y-18+bob), 3, 3);
  // Mouth
  ctx.fillStyle = '#a67c52';
  ctx.fillRect(Math.round(entity.x-2), Math.round(entity.y-12+bob), 5, 2);
  // Arms (simple block arms)
  ctx.fillStyle = entity.isBot ? entity.color : '#1976d2';
  ctx.fillRect(Math.round(entity.x-15), Math.round(entity.y-6+bob), 5, 13);
  ctx.fillRect(Math.round(entity.x+10), Math.round(entity.y-6+bob), 5, 13);
  // Legs
  ctx.fillStyle = '#444';
  ctx.fillRect(Math.round(entity.x-7), Math.round(entity.y+10+bob), 5, 10);
  ctx.fillRect(Math.round(entity.x+2), Math.round(entity.y+10+bob), 5, 10);
  // Health bar (pixel style)
  let hp = Math.max(0, entity.health/entity.maxHealth);
  ctx.fillStyle = '#d32f2f';
  ctx.fillRect(Math.round(entity.x-12), Math.round(entity.y-26+bob), 24, 4);
  ctx.fillStyle = '#66bb6a';
  ctx.fillRect(Math.round(entity.x-12), Math.round(entity.y-26+bob), Math.round(24*hp), 4);
  ctx.restore();
}
