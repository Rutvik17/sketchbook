/**
 * The hand's tools, drawn where they are working: a yellow pencil while a
 * drawing is sketched, a brush while it is painted. Every film on the site
 * shows its making with these two.
 */

export function drawPencil(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.7);
  // Graphite point, sharpened wood, the yellow barrel, the ferrule, the eraser.
  ctx.fillStyle = '#2b2a30';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(4, -2);
  ctx.lineTo(4, 2);
  ctx.fill();
  ctx.fillStyle = '#e9c9a0';
  ctx.beginPath();
  ctx.moveTo(4, -2);
  ctx.lineTo(16, -5);
  ctx.lineTo(16, 5);
  ctx.lineTo(4, 2);
  ctx.fill();
  ctx.fillStyle = '#e5b43a';
  ctx.fillRect(16, -5, 78, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(16, 1.5, 78, 3.5);
  ctx.fillStyle = '#b8b8b0';
  ctx.fillRect(94, -5, 8, 10);
  ctx.fillStyle = '#e48a8a';
  ctx.fillRect(102, -5, 9, 10);
  ctx.restore();
}

export function drawBrush(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.save();
  // The brush dabs: a small circle of movement while the wash goes down.
  ctx.translate(x + Math.sin(t * 9) * 3, y + Math.cos(t * 7) * 2);
  ctx.rotate(-0.55);
  ctx.fillStyle = '#3a2f2a';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(5, -4, 14, -3.5);
  ctx.lineTo(14, 3.5);
  ctx.quadraticCurveTo(5, 4, 0, 0);
  ctx.fill();
  ctx.fillStyle = '#c9c4b8';
  ctx.fillRect(14, -3.5, 12, 7);
  ctx.fillStyle = '#8a3b2c';
  ctx.beginPath();
  ctx.moveTo(26, -3);
  ctx.lineTo(110, -2);
  ctx.lineTo(110, 2);
  ctx.lineTo(26, 3);
  ctx.fill();
  ctx.restore();
}
