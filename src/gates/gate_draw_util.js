import {pitch, rad} from "../draw/config.js"
import { getGateStyle } from "../draw/gate_style.js";

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {undefined|!number} x
 * @param {undefined|!number} y
 */
function draw_x_control(ctx, x, y) {
    if (x === undefined || y === undefined) {
        return;
    }

    ctx.strokeStyle = 'black';
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y - rad);
    ctx.lineTo(x, y + rad);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - rad, y);
    ctx.lineTo(x + rad, y);
    ctx.stroke();
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {undefined|!number} x
 * @param {undefined|!number} y
 */
function draw_y_control(ctx, x, y) {
    if (x === undefined || y === undefined) {
        return;
    }
    ctx.strokeStyle = 'black';
    ctx.fillStyle = '#AAA';
    ctx.beginPath();
    ctx.moveTo(x, y + rad);
    ctx.lineTo(x + rad, y - rad);
    ctx.lineTo(x - rad, y - rad);
    ctx.lineTo(x, y + rad);
    ctx.stroke();
    ctx.fill();
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {undefined|!number} x
 * @param {undefined|!number} y
 */
function draw_z_control(ctx, x, y) {
    if (x === undefined || y === undefined) {
        return;
    }
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 2 * Math.PI);
    ctx.fill();
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {undefined|!number} x
 * @param {undefined|!number} y
 */
function draw_xswap_control(ctx, x, y) {
    if (x === undefined || y === undefined) {
        return;
    }
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    let r = rad * 0.4;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.stroke();
    ctx.moveTo(x - r, y + r);
    ctx.lineTo(x + r, y - r);
    ctx.stroke();
    ctx.lineWidth = 1;
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {undefined|!number} x
 * @param {undefined|!number} y
 */
function draw_zswap_control(ctx, x, y) {
    if (x === undefined || y === undefined) {
        return;
    }
    ctx.fillStyle = 'black';
    ctx.strokeStyle = 'black';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    let r = rad * 0.4;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.stroke();
    ctx.moveTo(x - r, y + r);
    ctx.lineTo(x + r, y - r);
    ctx.stroke();
    ctx.lineWidth = 1;
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {undefined|!number} x
 * @param {undefined|!number} y
 */
function draw_iswap_control(ctx, x, y) {
    if (x === undefined || y === undefined) {
        return;
    }
    ctx.fillStyle = '#888';
    ctx.strokeStyle = '#222';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    let r = rad * 0.4;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'black';
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.stroke();
    ctx.moveTo(x - r, y + r);
    ctx.lineTo(x + r, y - r);
    ctx.stroke();
    ctx.lineWidth = 1;
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {undefined|!number} x
 * @param {undefined|!number} y
 */
function draw_swap_control(ctx, x, y) {
    if (x === undefined || y === undefined) {
        return;
    }
    let r = rad / 3;
    ctx.strokeStyle = 'black';
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.stroke();
    ctx.moveTo(x - r, y + r);
    ctx.lineTo(x + r, y - r);
    ctx.stroke();
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {undefined|!number} x
 * @param {undefined|!number} y
 */
function stroke_degenerate_connector(ctx, x, y) {
    if (x === undefined || y === undefined) {
        return;
    }
    let r = rad * 1.1;
    ctx.strokeRect(x - r, y - r, r * 2, r * 2);
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {undefined|!number} x1
 * @param {undefined|!number} y1
 * @param {undefined|!number} x2
 * @param {undefined|!number} y2
 */
/**
 * Strokes a connector from (x1,y1) to (x2,y2).
 * Backward compatible default behavior (no options) matches previous drooping bezier for long spans.
 *
 * @param {!CanvasRenderingContext2D} ctx
 * @param {number|undefined} x1
 * @param {number|undefined} y1
 * @param {number|undefined} x2
 * @param {number|undefined} y2
 * @param {{droop?:number, color?:string, thickness?:number, cap?:CanvasLineCap, straightThreshold?:number}=} opts
 */
function stroke_connector_to(ctx, x1, y1, x2, y2, opts) {
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
        stroke_degenerate_connector(ctx, x1, y1);
        stroke_degenerate_connector(ctx, x2, y2);
        return;
    }
    // Ensure ordering (for consistent control point computation)
    if (x2 < x1 || (x2 === x1 && y2 < y1)) {
        stroke_connector_to(ctx, x2, y2, x1, y1, opts);
        return;
    }

    const droop = typeof opts?.droop === 'number' && isFinite(opts.droop) ? opts.droop : undefined;
    const thickness = typeof opts?.thickness === 'number' && isFinite(opts.thickness) ? Math.max(0.5, Math.min(16, opts.thickness)) : undefined;
    const color = typeof opts?.color === 'string' ? opts.color : undefined;
    const cap = opts?.cap;
    const straightThreshold = typeof opts?.straightThreshold === 'number' && isFinite(opts.straightThreshold)
        ? opts.straightThreshold
        : pitch * 1.1;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const d = Math.sqrt(dx*dx + dy*dy) || 1;

    // Unit along and perpendicular (scaled by base magnitude)
    const base = 14; // matches legacy curve offset magnitude
    const ux = (dx / d) * base;
    const uy = (dy / d) * base;
    let px = uy;
    let py = -ux;
    // Apply droop scaling when provided; default preserves legacy droop (1)
    const droopScale = droop === undefined ? 1 : droop;
    px *= droopScale;
    py *= droopScale;

    // Save styles if overriding.
    const needSave = (thickness !== undefined) || (color !== undefined) || (cap !== undefined);
    if (needSave) ctx.save();
    try {
        if (thickness !== undefined) ctx.lineWidth = thickness;
        if (color !== undefined) ctx.strokeStyle = color;
        if (cap !== undefined) ctx.lineCap = cap;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        if (d < straightThreshold || droopScale === 0) {
            ctx.lineTo(x2, y2);
        } else {
            ctx.bezierCurveTo(x1 + ux + px, y1 + uy + py, x2 - ux + px, y2 - uy + py, x2, y2);
        }
        ctx.stroke();
    } finally {
        if (needSave) ctx.restore();
    }
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {undefined|!number} x1
 * @param {undefined|!number} y1
 * @param {undefined|!number} x2
 * @param {undefined|!number} y2
 */
function draw_connector(ctx, x1, y1, x2, y2) {
    const prevW = ctx.lineWidth;
    const prevS = ctx.strokeStyle;
    // Base style
    let color = 'black';
    let thickness = 2;
    // Apply global gate style if present
    try {
        const s = getGateStyle();
        if (typeof s.colour === 'string' && s.colour.length) color = s.colour;
        if (typeof s.thickness === 'number' && isFinite(s.thickness)) thickness = s.thickness;
        ctx.lineWidth = thickness;
        ctx.strokeStyle = color;
        stroke_connector_to(ctx, x1, y1, x2, y2, {
            droop: (typeof s.droop === 'number' && isFinite(s.droop)) ? s.droop : undefined,
            color,
            thickness,
        });
    } finally {
        ctx.strokeStyle = prevS;
        ctx.lineWidth = prevW;
    }
}

export {
    draw_x_control,
    draw_y_control,
    draw_z_control,
    draw_swap_control,
    draw_iswap_control,
    stroke_connector_to,
    draw_connector,
    draw_xswap_control,
    draw_zswap_control,
};
