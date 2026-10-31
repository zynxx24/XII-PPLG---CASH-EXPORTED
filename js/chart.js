/*
 * Grafik garis saldo — ringan, tanpa library.
 * points: [{ date, value }]
 */
function drawLineChart(canvas, points) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { width: w, height: h } = canvas.getBoundingClientRect();
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const font = '11px Inter, system-ui, sans-serif';
    if (points.length < 2) {
        ctx.fillStyle = '#8a90a0';
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.fillText('Belum cukup transaksi untuk grafik', w / 2, h / 2);
        return;
    }

    const pad = { l: 44, r: 24, t: 12, b: 24 };
    const gw = w - pad.l - pad.r, gh = h - pad.t - pad.b;
    let min = Math.min(...points.map(p => p.value)), max = Math.max(...points.map(p => p.value));
    if (min === max) { min -= 10000; max += 10000; }
    const span = max - min;
    min -= span * 0.08; max += span * 0.12;

    const x = i => pad.l + gw * i / (points.length - 1);
    const y = v => pad.t + gh - (v - min) / (max - min) * gh;

    // Grid + Y labels
    ctx.font = font;
    ctx.fillStyle = '#8a90a0';
    ctx.textAlign = 'right';
    ctx.strokeStyle = '#eceef2';
    ctx.lineWidth = 1;
    for (let r = 0; r <= 3; r++) {
        const v = min + (max - min) * r / 3, yy = Math.round(y(v)) + .5;
        ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
        ctx.fillText(rpShort(v), pad.l - 8, yy + 4);
    }

    // X labels (maks 5)
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.ceil(points.length / 5));
    points.forEach((p, i) => {
        if (i % step === 0 || i === points.length - 1) {
            ctx.textAlign = i === points.length - 1 ? 'right' : i === 0 ? 'left' : 'center';
            ctx.fillText(p.date ? fmtDateShort(p.date) : 'Awal', i === points.length - 1 ? w - 2 : x(i), h - 6);
        }
    });

    // Area
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + gh);
    grad.addColorStop(0, 'rgba(47,107,255,.14)');
    grad.addColorStop(1, 'rgba(47,107,255,0)');
    ctx.beginPath();
    ctx.moveTo(x(0), pad.t + gh);
    points.forEach((p, i) => ctx.lineTo(x(i), y(p.value)));
    ctx.lineTo(x(points.length - 1), pad.t + gh);
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(x(i), y(p.value)) : ctx.moveTo(x(i), y(p.value)));
    ctx.strokeStyle = '#2f6bff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Titik terakhir
    const lx = x(points.length - 1), ly = y(points[points.length - 1].value);
    ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(47,107,255,.18)'; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fillStyle = '#2f6bff'; ctx.fill();

    // Garis nol
    if (min < 0 && max > 0) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(229,72,77,.5)';
        ctx.beginPath(); ctx.moveTo(pad.l, y(0)); ctx.lineTo(w - pad.r, y(0)); ctx.stroke();
        ctx.setLineDash([]);
    }
}
