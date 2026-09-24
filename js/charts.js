/*
 * XII PPLG Cash Management - Charts
 * Trading Line Chart & Candlestick Chart
 */

/* ======= Candlestick Helper ======= */
function getMonday(dateStr) {
    if (!dateStr || dateStr === 'Awal') return null;
    const parts = dateStr.includes('T') ? dateStr.split('T')[0].split('-') : dateStr.split('-');
    if (parts.length < 3) return null;
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    const d = new Date(year, month, day);

    const dayOfWeek = d.getDay();
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));

    const yyyy = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/* ======= Chart Type Switcher ======= */
window.switchChartType = function (type) {
    const titleEl = document.getElementById('chart-card-title');
    const infoEl = document.getElementById('candle-info-wrapper');

    if (type === 'candle') {
        if (titleEl) titleEl.textContent = '🕯️ Grafik Perkembangan Saldo Kas (Candlestick Mingguan)';
        if (infoEl) infoEl.style.display = 'flex';
        drawCandlestickChart('dashboardChart', window.currentDashboardCandles || []);
    } else {
        if (titleEl) titleEl.textContent = '📈 Grafik Perkembangan Saldo Kas (Trading Line)';
        if (infoEl) infoEl.style.display = 'none';
        drawTradingChart('dashboardChart', window.currentDashboardTimeline || []);
    }
};

/* ======= Trading Line Chart ======= */
function drawTradingChart(canvasId, timeline) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    const paddingLeft = 65;
    const paddingRight = 20;
    const paddingTop = 25;
    const paddingBottom = 40;
    const graphWidth = width - paddingLeft - paddingRight;
    const graphHeight = height - paddingTop - paddingBottom;

    ctx.clearRect(0, 0, width, height);

    if (timeline.length < 2) {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Menunggu perkembangan transaksi kas...', width / 2, height / 2);
        return;
    }

    let minVal = Infinity;
    let maxVal = -Infinity;
    timeline.forEach(p => {
        if (p.balance < minVal) minVal = p.balance;
        if (p.balance > maxVal) maxVal = p.balance;
    });

    if (minVal === maxVal) {
        minVal -= 10000;
        maxVal += 10000;
    } else {
        const diff = maxVal - minVal;
        minVal = minVal - diff * 0.1;
        maxVal = maxVal + diff * 0.15;
    }

    const rows = 4;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';

    for (let r = 0; r <= rows; r++) {
        const val = minVal + (maxVal - minVal) * (rows - r) / rows;
        const y = paddingTop + (graphHeight * r / rows);

        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(width - paddingRight, y);
        ctx.stroke();

        ctx.fillText(formatRupiahShort(val), paddingLeft - 8, y + 4);
    }

    const pts = timeline.length;
    const stepX = graphWidth / (pts - 1);

    const pointsX = [];
    const pointsY = [];

    ctx.textAlign = 'center';
    const totalLabels = Math.min(pts, 6);
    const labelStep = Math.max(1, Math.floor(pts / totalLabels));

    for (let i = 0; i < pts; i++) {
        const x = paddingLeft + i * stepX;
        const ratio = (timeline[i].balance - minVal) / (maxVal - minVal);
        const y = paddingTop + graphHeight - (ratio * graphHeight);
        pointsX.push(x);
        pointsY.push(y);

        if (i % labelStep === 0 || i === pts - 1) {
            ctx.beginPath();
            ctx.moveTo(x, paddingTop);
            ctx.lineTo(x, paddingTop + graphHeight);
            ctx.stroke();

            ctx.fillText(formatDateShortLabel(timeline[i].date), x, paddingTop + graphHeight + 18);
        }
    }

    // Glowing background gradient
    ctx.beginPath();
    ctx.moveTo(paddingLeft, paddingTop + graphHeight);
    for (let i = 0; i < pts; i++) {
        ctx.lineTo(pointsX[i], pointsY[i]);
    }
    ctx.lineTo(paddingLeft + graphWidth, paddingTop + graphHeight);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + graphHeight);
    areaGrad.addColorStop(0, 'rgba(79, 124, 255, 0.15)');
    areaGrad.addColorStop(1, 'rgba(79, 124, 255, 0.00)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Main Glow Line
    ctx.beginPath();
    ctx.moveTo(pointsX[0], pointsY[0]);
    for (let i = 1; i < pts; i++) {
        ctx.lineTo(pointsX[i], pointsY[i]);
    }
    ctx.strokeStyle = '#4f7cff';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Dots
    for (let i = 0; i < pts; i++) {
        if (i === pts - 1) {
            ctx.beginPath();
            ctx.arc(pointsX[i], pointsY[i], 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(79, 124, 255, 0.4)';
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(pointsX[i], pointsY[i], 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#4f7cff';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
    }

    // Zero-line
    if (minVal < 0 && maxVal > 0) {
        const zeroY = paddingTop + graphHeight - ((0 - minVal) / (maxVal - minVal) * graphHeight);
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.moveTo(paddingLeft, zeroY);
        ctx.lineTo(width - paddingRight, zeroY);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('Rp 0', paddingLeft - 8, zeroY + 4);
    }
}

/* ======= Candlestick Chart ======= */
function drawCandlestickChart(canvasId, candles) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    const paddingLeft = 65;
    const paddingRight = 20;
    const paddingTop = 25;
    const paddingBottom = 40;
    const graphWidth = width - paddingLeft - paddingRight;
    const graphHeight = height - paddingTop - paddingBottom;

    ctx.clearRect(0, 0, width, height);

    if (candles.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Belum ada data candlestick...', width / 2, height / 2);
        return;
    }

    let minVal = Infinity;
    let maxVal = -Infinity;
    candles.forEach(c => {
        if (c.low < minVal) minVal = c.low;
        if (c.high > maxVal) maxVal = c.high;
    });

    if (minVal === maxVal) {
        minVal -= 10000;
        maxVal += 10000;
    } else {
        const diff = maxVal - minVal;
        minVal -= diff * 0.1;
        maxVal += diff * 0.15;
    }

    const stepX = graphWidth / candles.length;

    // Grid
    const rows = 4;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';

    for (let r = 0; r <= rows; r++) {
        const val = minVal + (maxVal - minVal) * (rows - r) / rows;
        const y = paddingTop + (graphHeight * r / rows);
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(width - paddingRight, y);
        ctx.stroke();
        ctx.fillText(formatRupiahShort(val), paddingLeft - 8, y + 4);
    }

    // Date labels
    ctx.textAlign = 'center';
    const totalLabels = Math.min(candles.length, 8);
    const labelStep = Math.max(1, Math.floor(candles.length / totalLabels));

    candles.forEach((c, i) => {
        if (i % labelStep === 0 || i === candles.length - 1) {
            const x = paddingLeft + (i + 0.5) * stepX;
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(formatDateShortLabel(c.date), x, paddingTop + graphHeight + 18);
        }
    });

    // Zero-line
    if (minVal < 0 && maxVal > 0) {
        const zeroY = paddingTop + graphHeight - ((0 - minVal) / (maxVal - minVal) * graphHeight);
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.moveTo(paddingLeft, zeroY);
        ctx.lineTo(width - paddingRight, zeroY);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('Rp 0', paddingLeft - 8, zeroY + 4);
    }

    // Candlesticks
    candles.forEach((c, i) => {
        const x = paddingLeft + (i + 0.5) * stepX;

        const openY = paddingTop + graphHeight - ((c.open - minVal) / (maxVal - minVal) * graphHeight);
        const closeY = paddingTop + graphHeight - ((c.close - minVal) / (maxVal - minVal) * graphHeight);
        const highY = paddingTop + graphHeight - ((c.high - minVal) / (maxVal - minVal) * graphHeight);
        const lowY = paddingTop + graphHeight - ((c.low - minVal) / (maxVal - minVal) * graphHeight);

        const bullish = c.close >= c.open;
        const color = bullish ? '#10b981' : '#ef4444';

        // Wick
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Body
        const candleWidth = Math.max(4, Math.min(22, stepX * 0.6));
        const bodyHeight = Math.max(2, Math.abs(closeY - openY));

        ctx.fillStyle = color;
        ctx.fillRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, bodyHeight);

        // Doji
        if (Math.abs(c.close - c.open) < (maxVal - minVal) * 0.005) {
            const midY = (openY + closeY) / 2;
            ctx.beginPath();
            ctx.moveTo(x - candleWidth / 2 - 2, midY);
            ctx.lineTo(x + candleWidth / 2 + 2, midY);
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    });
}
