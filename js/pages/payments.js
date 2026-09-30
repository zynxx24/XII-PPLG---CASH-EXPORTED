/*
 * XII PPLG Cash Management - Payments Page
 */

/* ======= Payments ======= */
async function renderPayments(el) {
    const [payments, members] = await Promise.all([API.getPayments(), API.getMembers()]);
    membersCache = members;
    paymentsCache = payments;

    const dates = payments.dates || [];
    const records = payments.records || {};
    const isAdmin = API.isAdmin();

    let html = '<div class="page-content">';

    // Progress bar for latest date
    if (dates.length > 0) {
        const serverDate = (window._serverDate) || new Date().toISOString().split('T')[0];
        const validDates = dates.filter(d => d <= serverDate);
        const latestDate = validDates.length > 0 ? validDates[validDates.length - 1] : dates[dates.length - 1];
        let paidCount = 0;
        members.forEach(m => {
            const mid = String(m.id);
            if ((records[mid] && records[mid][latestDate]) || isExempt(m.id, latestDate)) paidCount++;
        });
        const pct = Math.round(paidCount / members.length * 100);
        html += `
        <div class="progress-container">
            <div class="progress-header">
                <span class="progress-label">Pembayaran ${formatMonthYear(latestDate)}</span>
                <span class="progress-value">${paidCount}/${members.length} (${pct}%)</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>`;
    }

    html += '<div class="card"><div class="card-header"><h2>📋 Daftar Pembayaran Kas</h2><div class="card-actions">';

    if (isAdmin) {
        html += `<button class="btn btn-primary btn-sm" onclick="addPaymentDate()">+ Tambah Tanggal</button>`;
    }

    // Calculate min-width
    const tableMinWidth = 40 + 180 + (dates.length * 80) + 80 + 20;
    html += `</div></div><div class="card-body no-padding"><div class="table-wrapper"><table class="data-table" style="min-width:${tableMinWidth}px"><thead><tr>`;
    html += '<th class="sticky-col sticky-col-no">No</th><th class="sticky-col sticky-col-name">Nama Siswa</th>';

    dates.forEach((d, i) => {
        let deleteBtn = '';
        if (isAdmin) {
            deleteBtn = `<button class="btn-delete-date" onclick="deletePaymentDate('${d}')" title="Hapus tanggal">🗑</button>`;
        }
        html += `<th class="check-cell"><div class="date-header-wrapper"><div class="date-header"><div class="date-day">${formatDateShort(d)}</div><div class="date-month">${formatMonthShort(d)}</div></div>${deleteBtn}</div></th>`;
    });

    // Summary column
    html += '<th>Status</th></tr></thead><tbody>';

    members.forEach((m, idx) => {
        const mid = String(m.id);
        const memberRec = records[mid] || {};
        let paidDates = 0;

        html += `<tr><td class="row-number sticky-col sticky-col-no">${idx + 1}</td><td class="member-name sticky-col sticky-col-name">${m.name}</td>`;

        dates.forEach(d => {
            const paid = memberRec[d] === true;
            const exempt = isExempt(m.id, d);
            if (paid || exempt) paidDates++;
            if (exempt) {
                html += `<td class="check-cell" style="text-align:center;"><span style="color:#8b5cf6; font-weight:700; font-size:14px;" title="${exempt.reason} (sampai ${formatDate(exempt.until)})">—</span></td>`;
            } else {
                html += `<td class="check-cell"><input type="checkbox" class="payment-check" data-member="${mid}" data-date="${d}" ${paid ? 'checked' : ''} ${isAdmin ? '' : 'disabled'} onchange="togglePayment('${mid}','${d}',this.checked)"></td>`;
            }
        });

        // Status badge
        const allPaid = dates.length > 0 && paidDates === dates.length;
        const nonePaid = paidDates === 0;
        if (dates.length === 0) {
            html += '<td><span class="badge badge-info">-</span></td>';
        } else if (allPaid) {
            html += '<td><span class="badge badge-success">✓ Lunas</span></td>';
        } else if (nonePaid) {
            html += '<td><span class="badge badge-danger">Belum</span></td>';
        } else {
            html += `<td><span class="badge badge-warning">${paidDates}/${dates.length}</span></td>`;
        }

        html += '</tr>';
    });

    html += '</tbody></table></div>';

    // Scroll slider control
    html += `
    <div class="table-scroll-slider-container" id="payment-scroll-container" style="display: none; align-items: center; gap: 12px; padding: 12px var(--space-lg); background: var(--bg-secondary); border-top: 1px solid var(--border); border-bottom-left-radius: var(--radius-md); border-bottom-right-radius: var(--radius-md);">
        <button class="btn btn-ghost btn-sm" style="padding: 4px 8px; font-size: 12px; border: 1px solid var(--border);" onclick="scrollTableStep('left')">◀</button>
        <span style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">Geser Tabel</span>
        <input type="range" class="table-scroll-slider" id="table-scroll-slider" min="0" max="100" value="0" style="flex: 1; accent-color: var(--primary); height: 6px; border-radius: 3px; cursor: pointer; background: var(--bg-input); outline: none; border: none;">
        <button class="btn btn-ghost btn-sm" style="padding: 4px 8px; font-size: 12px; border: 1px solid var(--border);" onclick="scrollTableStep('right')">▶</button>
    </div>
    `;

    html += '</div></div></div>';
    el.innerHTML = html;

    // Set up scroll synchronization after rendering
    setTimeout(() => {
        setupTableScrollSync();
    }, 50);
}

window.scrollTableStep = function (direction) {
    const wrapper = document.querySelector('.table-wrapper');
    if (wrapper) {
        const step = 200;
        wrapper.scrollBy({
            left: direction === 'left' ? -step : step,
            behavior: 'smooth'
        });
    }
};

window.setupTableScrollSync = function () {
    const wrapper = document.querySelector('.table-wrapper');
    const slider = document.getElementById('table-scroll-slider');
    const container = document.getElementById('payment-scroll-container');
    if (!wrapper || !slider) return;

    const maxScroll = wrapper.scrollWidth - wrapper.clientWidth;
    if (maxScroll <= 0) {
        if (container) container.style.display = 'none';
        return;
    } else {
        if (container) container.style.display = 'flex';
    }

    slider.max = maxScroll;
    slider.value = wrapper.scrollLeft;

    slider.addEventListener('input', () => {
        wrapper.scrollLeft = slider.value;
    });

    wrapper.addEventListener('scroll', () => {
        slider.value = wrapper.scrollLeft;
    });
};

async function addPaymentDate() {
    const dateStr = prompt('Masukkan tanggal pembayaran (YYYY-MM-DD):');
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        if (dateStr !== null) showToast('Format tanggal tidak valid (YYYY-MM-DD)', 'error');
        return;
    }

    if (!paymentsCache.dates) paymentsCache.dates = [];
    if (paymentsCache.dates.includes(dateStr)) {
        showToast('Tanggal sudah ada', 'error');
        return;
    }

    paymentsCache.dates.push(dateStr);
    paymentsCache.dates.sort();

    try {
        await API.savePayments(paymentsCache);
        showToast('Tanggal pembayaran ditambahkan', 'success');
        renderPage('payments');
    } catch (err) {
        showToast(err.message, 'error');
        renderPage('payments');
    }
}

async function togglePayment(memberId, date, checked) {
    if (!paymentsCache.records) paymentsCache.records = {};
    if (!paymentsCache.records[memberId]) paymentsCache.records[memberId] = {};
    paymentsCache.records[memberId][date] = checked;

    try {
        await API.savePayments(paymentsCache);
    } catch (err) {
        showToast(err.message, 'error');
        renderPage('payments');
    }
}

async function deletePaymentDate(date) {
    if (!confirm(`Hapus tanggal pembayaran ${formatDate(date)}? Semua data pembayaran pada tanggal ini akan hilang.`)) return;

    if (!paymentsCache.dates) return;
    paymentsCache.dates = paymentsCache.dates.filter(d => d !== date);

    if (paymentsCache.records) {
        Object.keys(paymentsCache.records).forEach(mid => {
            delete paymentsCache.records[mid][date];
        });
    }

    try {
        await API.savePayments(paymentsCache);
        showToast('Tanggal pembayaran dihapus', 'success');
        renderPage('payments');
    } catch (err) {
        showToast(err.message, 'error');
        renderPage('payments');
    }
}
