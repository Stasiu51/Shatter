import { rad } from '../draw/config.js';
import { draw_x_control, draw_y_control, draw_z_control, draw_swap_control, draw_iswap_control, draw_xswap_control, draw_zswap_control } from '../gates/gate_draw_util.js';

function createCanvas(sz = 32) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = Math.ceil(sz * dpr);
  c.height = Math.ceil(sz * dpr);
  const ctx = c.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);
  return { canvas: c, ctx, sz, dpr };
}

function center(ctx, sz) {
  ctx.save();
  ctx.translate(sz/2, sz/2);
}

function finishCenter(ctx) { ctx.restore(); }

function drawSquareWithLabel(ctx, label) {
  ctx.fillStyle = '#aaa';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.fillRect(-rad, -rad, 2*rad, 2*rad);
  ctx.strokeRect(-rad, -rad, 2*rad, 2*rad);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(label, 0, 0);
}

function drawFirstGlyph(ctx, gateId) {
  switch (gateId) {
    case 'CX': case 'CY': case 'CZ':
      draw_z_control(ctx, 0, 0); break;
    case 'XCX': case 'XCY':
      draw_x_control(ctx, 0, 0); break;
    case 'YCY':
      draw_y_control(ctx, 0, 0); break;
    case 'SWAP':
      draw_swap_control(ctx, 0, 0); break;
    case 'ISWAP': case 'ISWAP_DAG':
      draw_iswap_control(ctx, 0, 0); break;
    case 'CXSWAP': case 'CZSWAP':
      if (gateId === 'CXSWAP') draw_zswap_control(ctx, 0, 0); else draw_zswap_control(ctx, 0, 0);
      break;
    default:
      drawSquareWithLabel(ctx, (gateId || 'G').slice(0,2));
  }
}

function drawSecondGlyph(ctx, gateId) {
  switch (gateId) {
    case 'CX':
      draw_x_control(ctx, 0, 0); break;
    case 'CY':
      draw_y_control(ctx, 0, 0); break;
    case 'CZ':
      draw_z_control(ctx, 0, 0); break;
    case 'XCX':
      draw_x_control(ctx, 0, 0); break;
    case 'XCY':
      draw_y_control(ctx, 0, 0); break;
    case 'YCY':
      draw_y_control(ctx, 0, 0); break;
    case 'SWAP':
      draw_swap_control(ctx, 0, 0); break;
    case 'ISWAP': case 'ISWAP_DAG':
      draw_iswap_control(ctx, 0, 0); break;
    case 'CXSWAP':
      draw_xswap_control(ctx, 0, 0); break;
    case 'CZSWAP':
      draw_zswap_control(ctx, 0, 0); break;
    default:
      drawSquareWithLabel(ctx, (gateId || 'G').slice(0,2));
  }
}

function drawSingleGlyph(ctx, gateId) {
  const main = gateId.startsWith('SQRT_') ? '√' + gateId.split('_')[1]?.[0] : gateId[0];
  drawSquareWithLabel(ctx, main || 'G');
}

export function buildCursorFor({ gateId, phase }) {
  const { canvas, ctx, sz, dpr } = createCanvas(32);
  center(ctx, sz);
  // Crosshair at hotspot
  ctx.save();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  const arm = 4;
  ctx.beginPath();
  ctx.moveTo(-arm, 0); ctx.lineTo(arm, 0);
  ctx.moveTo(0, -arm); ctx.lineTo(0, arm);
  ctx.stroke();
  ctx.restore();

  // Gate icon below crosshair
  const SCALE = 0.30;
  const OFFSET_Y = 8;
  ctx.save();
  ctx.translate(0, OFFSET_Y);
  ctx.scale(SCALE, SCALE);
  try {
    if (phase === 'first') drawFirstGlyph(ctx, gateId);
    else if (phase === 'second') drawSecondGlyph(ctx, gateId);
    else if (phase === 'multi') drawSquareWithLabel(ctx, 'MPP');
    else drawSingleGlyph(ctx, gateId);
  } finally { ctx.restore(); }
  finishCenter(ctx);
  const url = canvas.toDataURL('image/png');
  const hx = Math.round((sz/2) * dpr), hy = Math.round((sz/2) * dpr);
  return { url, hx, hy };
}

