/*
 * XII PPLG Cash Management - Main Application
 * SPA Router, Page Renderers, and Interactions
 */

/* ======= State ======= */
let currentPage = 'dashboard';
let membersCache = null;
let paymentsCache = null;

/* ======= BI/PKL Exemptions ======= */
// Siswa yang sedang BI/PKL tidak wajib bayar kas selama periode tersebut
const KAS_EXEMPTIONS = [
    { memberId: 2, reason: 'BI/PKL', from: '2026-07-01', until: '2026-09-20' }
];

function isExempt(memberId, dateStr) {
    return KAS_EXEMPTIONS.find(e => e.memberId === memberId && (!e.from || dateStr >= e.from) && (!e.until || dateStr <= e.until));
}

/* ======= Initialization ======= */
document.addEventListener('DOMContentLoaded', () => {
    let token = API.getToken();
    if (!token) {
        localStorage.setItem('role', 'user');
        localStorage.setItem('name', 'Siswa');
    }
    setupUI();
    navigateTo('dashboard');
});

function setupUI() {
    const role = API.getRole();
    const name = localStorage.getItem('member_name') || 'User';

    document.getElementById('user-name').textContent = name;
    document.getElementById('user-role').textContent = role === 'admin' ? 'Administrator' : 'Siswa';
    document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();

    if (role === 'admin') {
        document.getElementById('admin-nav').style.display = 'block';
    }
}

/* ======= Navigation ======= */
function navigateTo(page) {
    currentPage = page;

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });

    const titles = {
        dashboard: ['Dashboard', 'Ringkasan pembukuan kas kelas'],
        payments: ['Pembayaran Kas', 'Kelola pembayaran kas bulanan'],
        recap: ['Rekap Tunggakan', 'Rekap siswa yang belum bayar kas per bulan'],
        donations: ['Donatur', 'Daftar donasi dan donatur'],
        fines: ['Denda', 'Daftar denda siswa'],
        expenses: ['Pengeluaran', 'Daftar pengeluaran dan belanja kelas'],
        levies: ['Pungutan', 'Pungutan mendadak & terjadwal'],
        reports: ['Laporan PDF', 'Unduh laporan keuangan kas kelas'],
        settings: ['Pengaturan', 'Konfigurasi sistem kas'],
        security: ['Security', 'Monitor keamanan server']
    };

    const [title, subtitle] = titles[page] || ['', ''];
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-subtitle').textContent = subtitle;

    // Close mobile sidebar
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');

    renderPage(page);
}

async function renderPage(page) {
    const content = document.getElementById('content-area');
    content.innerHTML = '<div class="loading">Memuat data...</div>';

    try {
        switch (page) {
            case 'dashboard': await renderDashboard(content); break;
            case 'payments': await renderPayments(content); break;
            case 'recap': await renderRecap(content); break;
            case 'donations': await renderDonations(content); break;
            case 'fines': await renderFines(content); break;
            case 'expenses': await renderExpenses(content); break;
            case 'levies': await renderLevies(content); break;
            case 'reports': await renderReports(content); break;
            case 'settings': await renderSettings(content); break;
            case 'security': await renderSecurity(content); break;
        }
    } catch (err) {
        content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
    }
}

/* ======= Dashboard ======= */
async function renderDashboard(el) {
    // Collect all data in parallel for complete stats and charting
    const [data, members, payments, donations, fines, expenses, config] = await Promise.all([
        API.getDashboard(),
        API.getMembers(),
        API.getPayments(),
        API.getDonations(),
        API.getFines(),
        API.getExpenses(),
        API.getConfig()
    ]);

    membersCache = members;

    // Cache server date for use across pages (payment page etc.)
    if (data.server_date) window._serverDate = data.server_date;

    // Calculate total net revenues from other files for reassurance
    let totalExpense = 0;
    expenses.forEach(e => totalExpense += e.amount || 0);

    /* Construct Historical Timeline data for trading line chart */
    const txMap = {};

    // 1. Initial/Previous Balance Starting Point
    const timeline = [];
    const prevBalance = data.previous_balance || 0;

    // Helper to register income/expense on date keys
    const regTx = (dateStr, income, expense) => {
        if (!dateStr) return;
        const normDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
        if (!txMap[normDate]) txMap[normDate] = { income: 0, expense: 0 };
        txMap[normDate].income += income;
        txMap[normDate].expense += expense;
    };

    // 2. Add cash payments income
    const kasAmount = data.kas_amount || 5000;
    if (payments && payments.dates && payments.records) {
        payments.dates.forEach(date => {
            let totalDateIncome = 0;
            members.forEach(m => {
                const mid = String(m.id);
                if (payments.records[mid] && payments.records[mid][date] === true) {
                    totalDateIncome += kasAmount;
                }
            });
            regTx(date, totalDateIncome, 0);
        });
    }

    // 3. Add donations income
    if (donations) {
        donations.forEach(d => {
            regTx(d.date, d.amount || 0, 0);
        });
    }

    // 4. Add paid fines income
    if (fines) {
        fines.forEach(f => {
            if (f.paid) {
                regTx(f.date, f.amount || 0, 0);
            }
        });
    }

    // 5. Add expenses
    if (expenses) {
        expenses.forEach(e => {
            regTx(e.date, 0, e.amount || 0);
        });
    }

    // Convert map to chronological timeline points
    const sortedDates = Object.keys(txMap).sort();
    let currentBalance = prevBalance;
    let cumulIncome = prevBalance;
    let cumulExpense = 0;

    // Add initial point
    timeline.push({
        date: 'Awal',
        balance: prevBalance,
        cumulIncome: prevBalance,
        cumulExpense: 0
    });

    sortedDates.forEach(date => {
        cumulIncome += txMap[date].income;
        cumulExpense += txMap[date].expense;
        currentBalance = cumulIncome - cumulExpense;
        timeline.push({
            date: date,
            balance: currentBalance,
            cumulIncome: cumulIncome,
            cumulExpense: cumulExpense
        });
    });

    // Compute weekly candlestick data
    const rawTxs = [];

    // 1. Add payments
    if (payments && payments.dates && payments.records) {
        payments.dates.forEach(date => {
            let totalDateIncome = 0;
            members.forEach(m => {
                const mid = String(m.id);
                if (payments.records[mid] && payments.records[mid][date] === true) {
                    totalDateIncome += kasAmount;
                }
            });
            if (totalDateIncome > 0) {
                rawTxs.push({ date: date, amount: totalDateIncome, type: 'income' });
            }
        });
    }

    // 2. Add donations
    if (donations) {
        donations.forEach(d => {
            rawTxs.push({ date: d.date, amount: d.amount || 0, type: 'income' });
        });
    }

    // 3. Add paid fines
    if (fines) {
        fines.forEach(f => {
            if (f.paid) {
                rawTxs.push({ date: f.date, amount: f.amount || 0, type: 'income' });
            }
        });
    }

    // 4. Add expenses
    if (expenses) {
        expenses.forEach(e => {
            rawTxs.push({ date: e.date, amount: e.amount || 0, type: 'expense' });
        });
    }

    // Sort globally
    rawTxs.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Trace running balances & find highest/lowest
    let runningBalance = prevBalance;
    let highestPeak = prevBalance;
    let highestPeakDate = 'Awal';
    let lowestBottom = prevBalance;
    let lowestBottomDate = 'Awal';

    const txsWithBalance = rawTxs.map(tx => {
        if (tx.type === 'income') {
            runningBalance += tx.amount;
        } else {
            runningBalance -= tx.amount;
        }
        if (runningBalance > highestPeak) {
            highestPeak = runningBalance;
            highestPeakDate = tx.date;
        }
        if (runningBalance < lowestBottom) {
            lowestBottom = runningBalance;
            lowestBottomDate = tx.date;
        }
        return {
            ...tx,
            balance: runningBalance
        };
    });

    // Group into weekly candles (Monday-start)
    const candles = [];
    if (txsWithBalance.length > 0) {
        const weeklyGroups = {};
        txsWithBalance.forEach(tx => {
            const mon = getMonday(tx.date);
            if (mon) {
                if (!weeklyGroups[mon]) weeklyGroups[mon] = [];
                weeklyGroups[mon].push(tx);
            }
        });

        const sortedMondays = Object.keys(weeklyGroups).sort();
        const startMonStr = sortedMondays[0];
        const endMonStr = getMonday(new Date().toISOString().split('T')[0]);

        // Generate consecutive weeks
        const mondayList = [];
        let currMon = new Date(startMonStr);
        const endMon = new Date(endMonStr);
        while (currMon <= endMon) {
            const yyyy = currMon.getFullYear();
            const mm = String(currMon.getMonth() + 1).padStart(2, '0');
            const dd = String(currMon.getDate()).padStart(2, '0');
            mondayList.push(`${yyyy}-${mm}-${dd}`);
            currMon.setDate(currMon.getDate() + 7);
        }

        let lastClose = prevBalance;
        mondayList.forEach(mon => {
            const txsInWeek = weeklyGroups[mon] || [];
            let open = lastClose;
            let close = lastClose;
            let high = lastClose;
            let low = lastClose;

            if (txsInWeek.length > 0) {
                const balances = txsInWeek.map(t => t.balance);
                high = Math.max(open, ...balances);
                low = Math.min(open, ...balances);
                close = txsInWeek[txsInWeek.length - 1].balance;
            }

            candles.push({
                date: mon,
                open,
                close,
                high,
                low
            });
            lastClose = close;
        });
    }

    // Cache to window properties for chart switcher
    window.currentDashboardTimeline = timeline;
    window.currentDashboardCandles = candles;
    // Extract the latest payment date details
    let latestPaymentHeaderHtml = '';
    let latestPaymentTableHtml = '<p class="text-muted" style="padding: 20px; text-align: center;">Belum ada record pembayaran kas kelas.</p>';

    if (payments && payments.dates && payments.dates.length > 0) {
        const serverDate = data.server_date || new Date().toISOString().split('T')[0];
        const validDates = payments.dates.filter(d => d <= serverDate);
        const latestPeriodDate = validDates.length > 0 ? validDates[validDates.length - 1] : payments.dates[payments.dates.length - 1];
        latestPaymentHeaderHtml = `
            <div class="table-header-detail">
                <span class="period-title">Periode Terbaru: <span class="badge badge-info">${formatMonthYear(latestPeriodDate)}</span></span>
                <span class="period-status">Pemasukan periode ini: <span class="text-success">${formatRupiah(data.latest_paid * kasAmount)}</span></span>
            </div>`;

        let rowsHtml = '';
        members.forEach((m, idx) => {
            const mid = String(m.id);
            const isPaid = payments.records[mid] && payments.records[mid][latestPeriodDate] === true;
            const exempt = isExempt(m.id, latestPeriodDate);
            let statusHtml;
            if (isPaid) {
                statusHtml = '<span class="status-marker status-paid">✓ Lunas</span>';
            } else if (exempt) {
                statusHtml = '<span class="status-marker" style="background: rgba(139,92,246,0.15); color: #8b5cf6;">— ' + exempt.reason + '</span>';
            } else {
                statusHtml = '<span class="status-marker status-unpaid">✗ Belum</span>';
            }
            rowsHtml += `
                <tr>
                    <td class="row-number">${idx + 1}</td>
                    <td class="member-name">${m.name}</td>
                    <td style="text-align: center;">${statusHtml}</td>
                    <td style="text-align: right;">${formatRupiah(isPaid ? kasAmount : 0)}</td>
                </tr>`;
        });

        latestPaymentTableHtml = `
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>Nama Siswa</th>
                            <th style="text-align: center;">Centang Kas</th>
                            <th style="text-align: right;">Jumlah Bayar</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>`;
    }

    el.innerHTML = `
        <div class="page-content">
            <!-- Premium Brand Header with WebP Logo -->
            <div class="dashboard-banner">
                <img src="/asset/webp/PPLG-LOGO.webp" alt="PPLG Logo" class="dashboard-banner-logo">
                <div class="dashboard-banner-text">
                    <h2>KAS KELAS XII PPLG</h2>
                    <p>Sistem Pengelolaan Keuangan & Transparansi Anggaran Kelas</p>
                </div>
            </div>

            <!-- Financial Cards Summary -->
            <div class="stat-grid">
                <div class="stat-card blue">
                    <div class="stat-header">
                        <div class="stat-icon">💰</div>
                        <span class="stat-label">Saldo Kas (Buku)</span>
                    </div>
                    <div class="stat-value">${formatRupiah(data.total_balance)}</div>
                    <div class="stat-sub">
                        Fisik: ${formatRupiah(config.real_balance || 0)} | 
                        Selisih: ${(() => {
            const diff = (config.real_balance || 0) - data.total_balance;
            return diff > 0 ? `+${formatRupiah(diff)}` : (diff < 0 ? `-${formatRupiah(Math.abs(diff))}` : 'Rp 0');
        })()}
                    </div>
                </div>
                <div class="stat-card green">
                    <div class="stat-header">
                        <div class="stat-icon">💳</div>
                        <span class="stat-label">Pemasukan Kas</span>
                    </div>
                    <div class="stat-value">${formatRupiah(data.total_kas_income)}</div>
                    <div class="stat-sub">${data.total_payments} iuran @ ${formatRupiah(data.kas_amount)}</div>
                </div>
                <div class="stat-card orange">
                    <div class="stat-header">
                        <div class="stat-icon">🎁</div>
                        <span class="stat-label">Total Donasi</span>
                    </div>
                    <div class="stat-value">${formatRupiah(data.total_donation_amount)}</div>
                    <div class="stat-sub">${data.total_donation_count} donatur masuk</div>
                </div>
                <div class="stat-card purple-card">
                    <div class="stat-header">
                        <div class="stat-icon">💸</div>
                        <span class="stat-label">Total Pengeluaran</span>
                    </div>
                    <div class="stat-value">${formatRupiah(totalExpense)}</div>
                    <div class="stat-sub">${expenses ? expenses.length : 0} nota pengeluaran</div>
                </div>
                <div class="stat-card red">
                    <div class="stat-header">
                        <div class="stat-icon">⚠️</div>
                        <span class="stat-label">Denda Belum Bayar</span>
                    </div>
                    <div class="stat-value">${formatRupiah(data.unpaid_fine_amount)}</div>
                    <div class="stat-sub">${data.total_fine_count} total kasus denda</div>
                </div>
            </div>

            <!-- Chart and Payment Ticks Row -->
            <div class="dashboard-row">
                <!-- Trading Line Chart Column -->
                <div class="card chart-card">
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <h2 id="chart-card-title">📈 Grafik Perkembangan Saldo Kas (Trading Line)</h2>
                        <select id="chart-type-select" class="form-select" style="width: auto; padding: 4px 8px; font-size: 13px; background-color: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border); border-radius: var(--radius-sm);" onchange="switchChartType(this.value)">
                            <option value="line">Garis Saldo (Trading Line)</option>
                            <option value="candle">Candlestick Mingguan</option>
                        </select>
                    </div>
                    <div class="card-body chart-body-wrapper">
                        <canvas id="dashboardChart" style="width:100%; height:280px; display:block;"></canvas>
                        <div id="candle-info-wrapper" style="display:none; margin-top:12px; padding-top:12px; border-top:1px solid var(--border); font-size:12px; color:var(--text-secondary); justify-content:space-between; flex-wrap:wrap; gap:8px; width: 100%;">
                            <div>🔺 <strong>Puncak Tertinggi:</strong> <span id="highest-peak-val" class="text-success" style="font-weight:700;">-</span> (<span id="highest-peak-date">-</span>)</div>
                            <div>🔻 <strong>Titik Terendah:</strong> <span id="lowest-bottom-val" class="text-danger" style="font-weight:700;">-</span> (<span id="lowest-bottom-date">-</span>)</div>
                        </div>
                    </div>
                </div>

                <!-- Latest Ticks Status Column -->
                <div class="card table-card">
                    <div class="card-header">
                        <div style="width:100%">
                            <h2>📋 Ticks Pembayaran Kas Terbaru</h2>
                            ${latestPaymentHeaderHtml}
                        </div>
                    </div>
                    <div class="card-body no-padding limit-height">
                        ${latestPaymentTableHtml}
                    </div>
                </div>
            </div>
        </div>`;

    // Populate Candlestick Peak and Bottom details
    setTimeout(() => {
        const peakValEl = document.getElementById('highest-peak-val');
        const peakDateEl = document.getElementById('highest-peak-date');
        const bottomValEl = document.getElementById('lowest-bottom-val');
        const bottomDateEl = document.getElementById('lowest-bottom-date');
        if (peakValEl) {
            peakValEl.textContent = formatRupiah(highestPeak);
            peakDateEl.textContent = highestPeakDate === 'Awal' ? 'Saldo Awal' : formatMonthYear(highestPeakDate);
            bottomValEl.textContent = formatRupiah(lowestBottom);
            bottomDateEl.textContent = lowestBottomDate === 'Awal' ? 'Saldo Awal' : formatMonthYear(lowestBottomDate);
        }

        // Draw default chart
        const selectEl = document.getElementById('chart-type-select');
        const type = selectEl ? selectEl.value : 'line';
        window.switchChartType(type);
    }, 100);
}

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

    // Calculate min-width: 40px(No) + 180px(Name) + dates*80px + 80px(Status) + some padding
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

    // Add scroll slider control and nav buttons
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

    // Set up scroll synchronization after rendering is complete
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

    // Check if table actually overflows horizontally
    const maxScroll = wrapper.scrollWidth - wrapper.clientWidth;
    if (maxScroll <= 0) {
        if (container) container.style.display = 'none';
        return;
    } else {
        if (container) container.style.display = 'flex';
    }

    slider.max = maxScroll;
    slider.value = wrapper.scrollLeft;

    // Sync slider drag to table scroll
    slider.addEventListener('input', () => {
        wrapper.scrollLeft = slider.value;
    });

    // Sync table scroll back to slider
    wrapper.addEventListener('scroll', () => {
        slider.value = wrapper.scrollLeft;
    });

    // Update on window resize since wrapper clientWidth changes
    window.addEventListener('resize', () => {
        const newMaxScroll = wrapper.scrollWidth - wrapper.clientWidth;
        slider.max = newMaxScroll > 0 ? newMaxScroll : 0;
        if (newMaxScroll <= 0) {
            if (container) container.style.display = 'none';
        } else {
            if (container) container.style.display = 'flex';
        }
    }, { passive: true });
};


async function addPaymentDate() {
    openModal('Tambah Tanggal Pembayaran', `
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="new-payment-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-primary btn-sm" onclick="confirmAddDate()">Tambah</button>
    `);
}

async function confirmAddDate() {
    const dateInput = document.getElementById('new-payment-date');
    const date = dateInput.value;
    if (!date) { showToast('Pilih tanggal', 'error'); return; }

    if (!paymentsCache.dates) paymentsCache.dates = [];
    if (paymentsCache.dates.includes(date)) {
        showToast('Tanggal sudah ada', 'error');
        return;
    }

    paymentsCache.dates.push(date);
    paymentsCache.dates.sort();

    try {
        await API.savePayments(paymentsCache);
        closeModal();
        showToast('Tanggal berhasil ditambah', 'success');
        renderPage('payments');
    } catch (err) {
        showToast(err.message, 'error');
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
        // Revert
        renderPage('payments');
    }
}

async function deletePaymentDate(date) {
    if (!confirm(`Hapus tanggal pembayaran ${formatDate(date)}? Semua data pembayaran pada tanggal ini akan hilang.`)) return;

    if (!paymentsCache.dates) return;
    paymentsCache.dates = paymentsCache.dates.filter(d => d !== date);

    // Remove from all member records
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

/* ======= Donations ======= */
async function renderDonations(el) {
    const donations = await API.getDonations();
    const isAdmin = API.isAdmin();

    // Sort newest first
    donations.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    let totalDonation = 0;
    donations.forEach(d => totalDonation += d.amount || 0);

    let html = '<div class="page-content">';
    html += `<div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
        <div class="stat-card green">
            <div class="stat-header"><div class="stat-icon">🎁</div><span class="stat-label">Total Donasi</span></div>
            <div class="stat-value">${formatRupiah(totalDonation)}</div>
            <div class="stat-sub">${donations.length} donatur</div>
        </div>
    </div>`;

    html += '<div class="card"><div class="card-header"><h2>📋 Daftar Donasi</h2><div class="card-actions">';
    if (isAdmin) {
        html += `<button class="btn btn-primary btn-sm" onclick="showAddDonation()">+ Tambah Donasi</button>`;
    }
    html += '</div></div>';

    if (donations.length === 0) {
        html += '<div class="card-body"><div class="empty-state"><div class="empty-icon">🎁</div><p>Belum ada donasi</p></div></div>';
    } else {
        html += '<div class="card-body no-padding"><table class="data-table"><thead><tr><th>No</th><th>Nama Donatur</th><th>Tanggal</th><th>Nominal</th><th>Catatan</th>';
        if (isAdmin) html += '<th>Aksi</th>';
        html += '</tr></thead><tbody>';

        donations.forEach((d, i) => {
            html += `<tr>
                <td class="row-number">${i + 1}</td>
                <td class="member-name">${d.name || '-'}</td>
                <td>${d.date ? formatDate(d.date) : '-'}</td>
                <td><span class="donation-amount">${formatRupiah(d.amount || 0)}</span></td>
                <td>${d.note || '-'}</td>`;
            if (isAdmin) {
                html += `<td><div style="display:flex;gap:4px;">
                    <button class="btn btn-ghost btn-sm" onclick="showEditDonation(${d.id})">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteDonation(${d.id})">Hapus</button>
                </div></td>`;
            }
            html += '</tr>';
        });

        html += '</tbody></table></div>';
    }
    html += '</div></div>';
    el.innerHTML = html;

    // Cache for edit
    window._donationsCache = donations;
}

function showAddDonation() {
    openModal('Tambah Donasi', `
        <div class="form-group">
            <label class="form-label">Nama Donatur</label>
            <input type="text" class="form-input" id="donation-name" placeholder="Nama donatur">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="donation-amount" placeholder="0" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="donation-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
            <label class="form-label">Catatan</label>
            <input type="text" class="form-input" id="donation-note" placeholder="Catatan (opsional)">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-success btn-sm" onclick="confirmAddDonation()">Simpan</button>
    `);
}

function showEditDonation(id) {
    const d = (window._donationsCache || []).find(x => x.id === id);
    if (!d) return;
    openModal('Edit Donasi', `
        <div class="form-group">
            <label class="form-label">Nama Donatur</label>
            <input type="text" class="form-input" id="donation-name" value="${d.name || ''}">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="donation-amount" value="${d.amount || 0}" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="donation-date" value="${d.date || ''}">
        </div>
        <div class="form-group">
            <label class="form-label">Catatan</label>
            <input type="text" class="form-input" id="donation-note" value="${d.note || ''}">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-success btn-sm" onclick="confirmEditDonation(${id})">Simpan</button>
    `);
}

async function confirmAddDonation() {
    const name = document.getElementById('donation-name').value.trim();
    const amount = parseInt(document.getElementById('donation-amount').value) || 0;
    const date = document.getElementById('donation-date').value;
    const note = document.getElementById('donation-note').value.trim();

    if (!name) { showToast('Nama donatur wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.addDonation({ name, amount, date, note });
        closeModal();
        showToast('Donasi berhasil ditambah', 'success');
        renderPage('donations');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function confirmEditDonation(id) {
    const name = document.getElementById('donation-name').value.trim();
    const amount = parseInt(document.getElementById('donation-amount').value) || 0;
    const date = document.getElementById('donation-date').value;
    const note = document.getElementById('donation-note').value.trim();

    if (!name) { showToast('Nama donatur wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.deleteDonation(id);
        await API.addDonation({ name, amount, date, note });
        closeModal();
        showToast('Donasi berhasil diperbarui', 'success');
        renderPage('donations');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteDonation(id) {
    if (!confirm('Hapus donasi ini?')) return;
    try {
        await API.deleteDonation(id);
        showToast('Donasi dihapus', 'success');
        renderPage('donations');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ======= Auto Sync Fines ======= */
async function syncAutoFines() {
    try {
        const [payments, members, config, fines] = await Promise.all([
            API.getPayments(),
            API.getMembers(),
            API.getConfig(),
            API.getFines()
        ]);

        const FINE_PER_MONTH = 5000;
        const dates = payments.dates || [];
        const records = payments.records || {};
        const serverDate = window._serverDate || new Date().toISOString().split('T')[0];
        const serverMonth = serverDate.substring(0, 7);

        const validDates = dates.filter(d => d <= serverDate);

        const monthGroups = {};
        validDates.forEach(d => {
            const ym = d.substring(0, 7);
            if (ym < serverMonth) {
                if (!monthGroups[ym]) monthGroups[ym] = [];
                monthGroups[ym].push(d);
            }
        });

        const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

        const nowParts = serverDate.split('-');
        const nowYear = parseInt(nowParts[0]);
        const nowMonth = parseInt(nowParts[1]);

        for (const ym of Object.keys(monthGroups)) {
            const monthDates = monthGroups[ym];
            const ymParts = ym.split('-');
            const debtYear = parseInt(ymParts[0]);
            const debtMonth = parseInt(ymParts[1]);
            const monthsLate = (nowYear - debtYear) * 12 + (nowMonth - debtMonth);

            const monthLabel = `${monthNames[debtMonth - 1]} ${debtYear}`;
            const reason = `Denda Kas ${monthLabel}`;

            for (const m of members) {
                const mid = String(m.id);
                let unpaidWeeks = 0;
                monthDates.forEach(d => {
                    if (!records[mid] || records[mid][d] !== true) {
                        if (!isExempt(m.id, d)) {
                            unpaidWeeks++;
                        }
                    }
                });

                if (unpaidWeeks > 0 && monthsLate >= 2) {
                    const fineAmount = (monthsLate - 1) * FINE_PER_MONTH;
                    const existing = fines.find(f => f.member_id === m.id && (f.month === ym || f.reason === reason));
                    if (!existing && API.isAdmin()) {
                        await API.addFine({
                            member_id: m.id,
                            reason: reason,
                            amount: fineAmount,
                            date: serverDate,
                            paid: false,
                            month: ym,
                            auto_generated: true
                        });
                        fines.push({ member_id: m.id, reason, amount: fineAmount, date: serverDate, paid: false, month: ym, auto_generated: true });
                    } else if (existing && !existing.paid && existing.amount !== fineAmount && API.isAdmin()) {
                        await API.deleteFine(existing.id);
                        await API.addFine({
                            member_id: m.id,
                            reason: reason,
                            amount: fineAmount,
                            date: serverDate,
                            paid: false,
                            month: ym,
                            auto_generated: true
                        });
                    }
                } else if (unpaidWeeks === 0 && API.isAdmin()) {
                    const existing = fines.find(f => f.member_id === m.id && (f.month === ym || f.reason === reason) && f.auto_generated && !f.paid);
                    if (existing) {
                        await API.deleteFine(existing.id);
                    }
                }
            }
        }
    } catch (err) {
        console.error('Failed to sync auto fines:', err);
    }
}

/* ======= Fines ======= */
async function renderFines(el) {
    await syncAutoFines();
    const [fines, members] = await Promise.all([API.getFines(), API.getMembers()]);
    membersCache = members;
    const isAdmin = API.isAdmin();

    // Sort newest first
    fines.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    let totalFine = 0, unpaidFine = 0;
    fines.forEach(f => {
        totalFine += f.amount || 0;
        if (!f.paid) unpaidFine += f.amount || 0;
    });

    let html = '<div class="page-content">';
    html += `<div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
        <div class="stat-card red">
            <div class="stat-header"><div class="stat-icon">⚠️</div><span class="stat-label">Total Denda</span></div>
            <div class="stat-value">${formatRupiah(totalFine)}</div>
            <div class="stat-sub">${fines.length} denda</div>
        </div>
        <div class="stat-card orange">
            <div class="stat-header"><div class="stat-icon">⏳</div><span class="stat-label">Belum Dibayar</span></div>
            <div class="stat-value">${formatRupiah(unpaidFine)}</div>
        </div>
        <div class="stat-card green">
            <div class="stat-header"><div class="stat-icon">✅</div><span class="stat-label">Sudah Dibayar</span></div>
            <div class="stat-value">${formatRupiah(totalFine - unpaidFine)}</div>
        </div>
    </div>`;

    html += '<div class="card"><div class="card-header"><h2>📋 Daftar Denda</h2><div class="card-actions">';
    if (isAdmin) {
        html += `<button class="btn btn-primary btn-sm" onclick="showAddFine()">+ Tambah Denda</button>`;
    }
    html += '</div></div>';

    if (fines.length === 0) {
        html += '<div class="card-body"><div class="empty-state"><div class="empty-icon">✅</div><p>Tidak ada denda</p></div></div>';
    } else {
        html += '<div class="card-body no-padding"><table class="data-table"><thead><tr><th>No</th><th>Nama</th><th>Alasan</th><th>Nominal</th><th>Tanggal</th><th>Status</th>';
        if (isAdmin) html += '<th>Aksi</th>';
        html += '</tr></thead><tbody>';

        fines.forEach((f, i) => {
            const memberName = getMemberName(f.member_id, members);
            const isOverdue = !f.paid;
            html += `<tr class="${isOverdue ? 'fine-overdue' : ''}">
                <td class="row-number">${i + 1}</td>
                <td class="member-name">${memberName}</td>
                <td>${f.reason || '-'}</td>
                <td><span class="fine-amount">${formatRupiah(f.amount || 0)}</span></td>
                <td>${f.date ? formatDate(f.date) : '-'}</td>
                <td>${f.paid ? '<span class="badge badge-success">Lunas</span>' : '<span class="badge badge-danger">Belum</span>'}</td>`;
            if (isAdmin) {
                html += `<td><div style="display:flex;gap:4px;">
                    <button class="btn btn-ghost btn-sm" onclick="showEditFine(${f.id})">✏️</button>
                    ${!f.paid ? `<button class="btn btn-success btn-sm" onclick="markFinePaid(${f.id})">Bayar</button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteFine(${f.id})">Hapus</button>
                </div></td>`;
            }
            html += '</tr>';
        });

        html += '</tbody></table></div>';
    }
    html += '</div></div>';
    el.innerHTML = html;

    // Cache for edit
    window._finesCache = fines;

    // Update badge
    const badge = document.getElementById('fine-badge');
    if (fines.filter(f => !f.paid).length > 0) {
        badge.textContent = fines.filter(f => !f.paid).length;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}

function showAddFine() {
    const members = membersCache || [];
    let opts = members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

    openModal('Tambah Denda', `
        <div class="form-group">
            <label class="form-label">Nama Siswa</label>
            <select class="form-select" id="fine-member">${opts}</select>
        </div>
        <div class="form-group">
            <label class="form-label">Alasan Denda</label>
            <input type="text" class="form-input" id="fine-reason" placeholder="Contoh: Telat push commit, rusak kabel LAN">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="fine-amount" placeholder="0" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="fine-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-danger btn-sm" onclick="confirmAddFine()">Simpan Denda</button>
    `);
}

function showEditFine(id) {
    const f = (window._finesCache || []).find(x => x.id === id);
    if (!f) return;
    const members = membersCache || [];
    let opts = members.map(m => `<option value="${m.id}" ${m.id === f.member_id ? 'selected' : ''}>${m.name}</option>`).join('');

    openModal('Edit Denda', `
        <div class="form-group">
            <label class="form-label">Nama Siswa</label>
            <select class="form-select" id="fine-member">${opts}</select>
        </div>
        <div class="form-group">
            <label class="form-label">Alasan Denda</label>
            <input type="text" class="form-input" id="fine-reason" value="${f.reason || ''}">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="fine-amount" value="${f.amount || 0}" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="fine-date" value="${f.date || ''}">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-danger btn-sm" onclick="confirmEditFine(${id}, ${f.paid ? 'true' : 'false'})">Simpan</button>
    `);
}

async function confirmAddFine() {
    const member_id = parseInt(document.getElementById('fine-member').value);
    const reason = document.getElementById('fine-reason').value.trim();
    const amount = parseInt(document.getElementById('fine-amount').value) || 0;
    const date = document.getElementById('fine-date').value;

    if (!reason) { showToast('Alasan wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.addFine({ member_id, reason, amount, date, paid: false });
        closeModal();
        showToast('Denda berhasil ditambah', 'success');
        renderPage('fines');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function confirmEditFine(id, wasPaid) {
    const member_id = parseInt(document.getElementById('fine-member').value);
    const reason = document.getElementById('fine-reason').value.trim();
    const amount = parseInt(document.getElementById('fine-amount').value) || 0;
    const date = document.getElementById('fine-date').value;

    if (!reason) { showToast('Alasan wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.deleteFine(id);
        await API.addFine({ member_id, reason, amount, date, paid: wasPaid });
        closeModal();
        showToast('Denda berhasil diperbarui', 'success');
        renderPage('fines');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function markFinePaid(id) {
    try {
        const fines = await API.getFines();
        const fine = fines.find(f => f.id === id);
        if (fine) {
            await API.deleteFine(id);
            fine.paid = true;
            delete fine.id;
            await API.addFine(fine);
        }
        showToast('Denda ditandai lunas', 'success');
        renderPage('fines');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteFine(id) {
    if (!confirm('Hapus denda ini?')) return;
    try {
        await API.deleteFine(id);
        showToast('Denda dihapus', 'success');
        renderPage('fines');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ======= Settings ======= */
async function renderSettings(el) {
    if (!API.isAdmin()) {
        el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><p>Hanya admin yang dapat mengakses pengaturan</p></div>';
        return;
    }

    const config = await API.getConfig();

    el.innerHTML = `
        <div class="page-content">
            <div class="card" style="margin-bottom:24px">
                <div class="card-header"><h2>⚙️ Pengaturan Kas</h2></div>
                <div class="card-body">
                    <div class="settings-grid">
                        <div class="settings-item">
                            <label>Nominal Kas per Periode (Rp)</label>
                            <div class="settings-input">
                                <input type="number" id="cfg-kas-amount" value="${config.kas_amount || 5000}" min="0">
                            </div>
                        </div>
                        <div class="settings-item">
                            <label>Sisa Kas Sebelumnya (Rp)</label>
                            <div class="settings-input">
                                <input type="number" id="cfg-prev-balance" value="${config.previous_balance || 0}" min="0">
                            </div>
                        </div>
                        <div class="settings-item">
                            <label>Saldo Fisik / Real di Peti Kas (Rp)</label>
                            <div class="settings-input">
                                <input type="number" id="cfg-real-balance" value="${config.real_balance || 0}" min="0">
                            </div>
                        </div>
                        <div class="settings-item">
                            <label>Nama Kelas</label>
                            <div class="settings-input">
                                <input type="text" id="cfg-class-name" value="${config.class_name || 'XII PPLG'}">
                            </div>
                        </div>
                        <div class="settings-item">
                            <label>Tahun Ajaran</label>
                            <div class="settings-input">
                                <input type="text" id="cfg-year" value="${config.year || '2026/2027'}">
                            </div>
                        </div>
                    </div>
                    <div style="margin-top:24px; display:flex; justify-content:flex-end;">
                        <button class="btn btn-primary" onclick="saveSettings()">💾 Simpan Pengaturan</button>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header"><h2>🔐 Ubah Password Admin</h2></div>
                <div class="card-body">
                    <div class="settings-grid">
                        <div class="settings-item">
                            <label>Password Baru</label>
                            <div class="settings-input">
                                <input type="password" id="cfg-new-password" placeholder="Masukkan password baru">
                            </div>
                        </div>
                    </div>
                    <div style="margin-top:24px; display:flex; justify-content:flex-end;">
                        <button class="btn btn-primary" onclick="changePassword()">🔑 Ubah Password</button>
                    </div>
                </div>
            </div>
        </div>`;
}

async function saveSettings() {
    const data = {
        kas_amount: parseInt(document.getElementById('cfg-kas-amount').value) || 5000,
        previous_balance: parseInt(document.getElementById('cfg-prev-balance').value) || 0,
        real_balance: parseInt(document.getElementById('cfg-real-balance').value) || 0,
        class_name: document.getElementById('cfg-class-name').value.trim() || 'XII PPLG',
        year: document.getElementById('cfg-year').value.trim() || '2026/2027'
    };

    try {
        await API.saveConfig(data);
        showToast('Pengaturan berhasil disimpan', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function changePassword() {
    const newPwd = document.getElementById('cfg-new-password').value;
    if (!newPwd || newPwd.length < 4) {
        showToast('Password minimal 4 karakter', 'error');
        return;
    }
    // Note: In a production app, password change would be a dedicated endpoint
    // For this prototype, we show success
    showToast('Fitur ubah password — hubungi developer', 'info');
}

/* ======= Security ======= */
async function renderSecurity(el) {
    if (!API.isAdmin()) {
        el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><p>Akses ditolak</p></div>';
        return;
    }

    const stats = await API.getSecurity();

    let bannedHtml = '';
    if (stats.banned_ips && stats.banned_ips.length > 0) {
        bannedHtml = '<div style="margin-top:24px"><h3 style="margin-bottom:12px; font-size:14px; color:var(--danger)">🚫 IP Terblokir</h3><table class="data-table"><thead><tr><th>IP Address</th><th>Sisa Ban (detik)</th></tr></thead><tbody>';
        stats.banned_ips.forEach(b => {
            bannedHtml += `<tr><td>${b.ip}</td><td>${b.remaining}s</td></tr>`;
        });
        bannedHtml += '</tbody></table></div>';
    }

    el.innerHTML = `
        <div class="page-content">
            <div class="card">
                <div class="card-header">
                    <h2>🛡️ Security Monitor</h2>
                    <button class="btn btn-ghost btn-sm" onclick="renderPage('security')">🔄 Refresh</button>
                </div>
                <div class="card-body">
                    <div class="security-grid">
                        <div class="security-stat">
                            <div class="stat-number">${stats.total_requests || 0}</div>
                            <div class="stat-desc">Total Requests</div>
                        </div>
                        <div class="security-stat">
                            <div class="stat-number" style="color:var(--danger)">${stats.blocked_requests || 0}</div>
                            <div class="stat-desc">Blocked Requests</div>
                        </div>
                        <div class="security-stat">
                            <div class="stat-number">${stats.tracked_ips || 0}</div>
                            <div class="stat-desc">Tracked IPs</div>
                        </div>
                        <div class="security-stat">
                            <div class="stat-number" style="color:${(stats.cpu_usage || 0) > 70 ? 'var(--danger)' : 'var(--success)'}">${(stats.cpu_usage || 0).toFixed(1)}%</div>
                            <div class="stat-desc">CPU Usage</div>
                        </div>
                    </div>
                    <div style="margin-top:24px">
                        <div class="settings-grid">
                            <div class="settings-item">
                                <label>Rate Limit</label>
                                <div style="font-size:20px;font-weight:700;color:var(--primary)">${stats.rate_limit || 100} req / ${stats.rate_window || 10}s</div>
                            </div>
                            <div class="settings-item">
                                <label>CPU Threshold</label>
                                <div style="font-size:20px;font-weight:700;color:var(--warning)">${stats.cpu_threshold || 90}%</div>
                                <div style="font-size:12px;color:var(--text-muted)">Server auto-shutdown jika terlampaui</div>
                            </div>
                        </div>
                    </div>
                    ${bannedHtml}
                </div>
            </div>
        </div>`;
}

/* ======= Expenses ======= */
async function renderExpenses(el) {
    const expenses = await API.getExpenses();
    const isAdmin = API.isAdmin();

    // Sort newest first
    expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    let totalExpense = 0;
    expenses.forEach(e => totalExpense += e.amount || 0);

    let html = '<div class="page-content">';
    html += `<div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
        <div class="stat-card purple-card">
            <div class="stat-header"><div class="stat-icon">💸</div><span class="stat-label">Total Pengeluaran</span></div>
            <div class="stat-value">${formatRupiah(totalExpense)}</div>
            <div class="stat-sub">${expenses.length} nota pengeluaran</div>
        </div>
    </div>`;

    html += '<div class="card"><div class="card-header"><h2>📋 Daftar Pengeluaran Kas</h2><div class="card-actions">';
    if (isAdmin) {
        html += `<button class="btn btn-primary btn-sm" onclick="showAddExpense()">+ Tambah Pengeluaran</button>`;
    }
    html += '</div></div>';

    if (expenses.length === 0) {
        html += '<div class="card-body"><div class="empty-state"><div class="empty-icon">💸</div><p>Belum ada pengeluaran kas</p></div></div>';
    } else {
        html += '<div class="card-body no-padding"><table class="data-table"><thead><tr><th>No</th><th>Deskripsi / Penggunaan</th><th>Tanggal</th><th>Nominal</th>';
        if (isAdmin) html += '<th>Aksi</th>';
        html += '</tr></thead><tbody>';

        expenses.forEach((e, i) => {
            html += `<tr>
                <td class="row-number">${i + 1}</td>
                <td class="member-name">${e.description || '-'}</td>
                <td>${e.date ? formatDate(e.date) : '-'}</td>
                <td><span class="expense-amount">${formatRupiah(e.amount || 0)}</span></td>`;
            if (isAdmin) {
                html += `<td><div style="display:flex;gap:4px;">
                    <button class="btn btn-ghost btn-sm" onclick="showEditExpense(${e.id})">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id})">Hapus</button>
                </div></td>`;
            }
            html += '</tr>';
        });

        html += '</tbody></table></div>';
    }
    html += '</div></div>';
    el.innerHTML = html;

    // Cache for edit
    window._expensesCache = expenses;
}

function showAddExpense() {
    openModal('Tambah Pengeluaran', `
        <div class="form-group">
            <label class="form-label">Deskripsi / Penggunaan</label>
            <input type="text" class="form-input" id="expense-description" placeholder="Contoh: Beli sapu, spidol kelas">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="expense-amount" placeholder="0" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="expense-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-danger btn-sm" onclick="confirmAddExpense()">Simpan Pengeluaran</button>
    `);
}

function showEditExpense(id) {
    const e = (window._expensesCache || []).find(x => x.id === id);
    if (!e) return;
    openModal('Edit Pengeluaran', `
        <div class="form-group">
            <label class="form-label">Deskripsi / Penggunaan</label>
            <input type="text" class="form-input" id="expense-description" value="${e.description || ''}">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="expense-amount" value="${e.amount || 0}" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="expense-date" value="${e.date || ''}">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-danger btn-sm" onclick="confirmEditExpense(${id})">Simpan</button>
    `);
}

async function confirmAddExpense() {
    const description = document.getElementById('expense-description').value.trim();
    const amount = parseInt(document.getElementById('expense-amount').value) || 0;
    const date = document.getElementById('expense-date').value;

    if (!description) { showToast('Deskripsi wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.addExpense({ description, amount, date });
        closeModal();
        showToast('Pengeluaran berhasil ditambah', 'success');
        renderPage('expenses');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function confirmEditExpense(id) {
    const description = document.getElementById('expense-description').value.trim();
    const amount = parseInt(document.getElementById('expense-amount').value) || 0;
    const date = document.getElementById('expense-date').value;

    if (!description) { showToast('Deskripsi wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.deleteExpense(id);
        await API.addExpense({ description, amount, date });
        closeModal();
        showToast('Pengeluaran berhasil diperbarui', 'success');
        renderPage('expenses');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteExpense(id) {
    if (!confirm('Hapus nota pengeluaran ini?')) return;
    try {
        await API.deleteExpense(id);
        showToast('Pengeluaran dihapus', 'success');
        renderPage('expenses');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ======= Trading Line Chart Drawing ======= */
function drawTradingChart(canvasId, timeline) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI display
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Set width and height attributes in CSS pixels vs device pixels
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Settings
    const paddingLeft = 65;
    const paddingRight = 20;
    const paddingTop = 25;
    const paddingBottom = 40;
    const graphWidth = width - paddingLeft - paddingRight;
    const graphHeight = height - paddingTop - paddingBottom;

    ctx.clearRect(0, 0, width, height);

    if (timeline.length < 2) {
        // Fallback for single data point
        ctx.fillStyle = '#64748b';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Menunggu perkembangan transaksi kas...', width / 2, height / 2);
        return;
    }
    // Determine Y range
    let minVal = Infinity;
    let maxVal = -Infinity;
    timeline.forEach(p => {
        if (p.balance < minVal) minVal = p.balance;
        if (p.balance > maxVal) maxVal = p.balance;
    });

    // Make Y axis responsive
    if (minVal === maxVal) {
        minVal -= 10000;
        maxVal += 10000;
    } else {
        const diff = maxVal - minVal;
        minVal = minVal - diff * 0.1;
        maxVal = maxVal + diff * 0.15;
    }

    // Grid rendering parameters
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

    // Plot Points X-coordinates
    const pts = timeline.length;
    const stepX = graphWidth / (pts - 1);

    // Coordinate maps
    const pointsX = [];
    const pointsY = [];

    // Vertical grid lines and date labels
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

    // 1. Draw glowing background gradient
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

    // 2. Draw Main Glow Line
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

    // 3. Draw Dots and Pulsations
    for (let i = 0; i < pts; i++) {
        // Draw pulse glow outer dot for latest point
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

    // 4. Draw zero-line if data crosses zero
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

function formatRupiahShort(num) {
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 1000000) return sign + 'Rp ' + (abs / 1000000).toFixed(1) + 'jt';
    if (abs >= 1000) return sign + 'Rp ' + (abs / 1000).toFixed(0) + 'rb';
    return sign + 'Rp ' + abs;
}

function formatDateShortLabel(dateStr) {
    if (!dateStr || dateStr === 'Awal') return 'Awal';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    const mIdx = parseInt(parts[1]) - 1;
    return `${parts[2]} ${months[mIdx]}`;
}

/* ======= Utilities ======= */
function formatRupiah(num) {
    return 'Rp ' + (num || 0).toLocaleString('id-ID');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatMonthYear(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length < 2) return dateStr;
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const mIdx = parseInt(parts[1]) - 1;
    return `${monthNames[mIdx]} ${parts[0]}`;
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.getDate();
}

function formatMonthShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    return months[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2);
}

function getMemberName(id, members) {
    const m = (members || membersCache || []).find(m => m.id === id);
    return m ? m.name : 'Unknown';
}

/* ======= Modal ======= */
function openModal(title, bodyHtml, footerHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml || '';
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('modal-overlay')) return;
    document.getElementById('modal-overlay').classList.remove('active');
}

/* ======= Toast ======= */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* ======= Sidebar Toggle (Mobile) ======= */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
}

/* ======= Rekap Tunggakan (Unpaid Recap) ======= */
async function renderRecap(el) {
    await syncAutoFines();
    const [payments, members, config] = await Promise.all([
        API.getPayments(),
        API.getMembers(),
        API.getConfig()
    ]);
    membersCache = members;

    const kasAmount = (config && config.kas_amount) || 5000;
    const FINE_PER_MONTH = 5000; // Denda Rp5.000 per bulan telat
    const dates = payments.dates || [];
    const records = payments.records || {};
    const serverDate = window._serverDate || new Date().toISOString().split('T')[0];
    const serverMonth = serverDate.substring(0, 7); // "2026-07"

    // Filter dates <= server date
    const validDates = dates.filter(d => d <= serverDate);

    // Group dates by month (only months BEFORE current server month)
    const monthGroups = {};
    validDates.forEach(d => {
        const ym = d.substring(0, 7); // "2026-01"
        if (ym < serverMonth) {
            if (!monthGroups[ym]) monthGroups[ym] = [];
            monthGroups[ym].push(d);
        }
    });

    const sortedMonths = Object.keys(monthGroups).sort().reverse(); // newest first

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    let html = '<div class="page-content">';

    if (sortedMonths.length === 0) {
        html += '<div class="empty-state"><div class="empty-icon">📊</div><p>Belum ada data pembayaran untuk direkap.</p></div>';
    } else {
        // Summary stat cards
        let totalUnpaidGlobal = 0;
        let totalUnpaidMembersGlobal = 0;
        const monthData = [];

        sortedMonths.forEach(ym => {
            const monthDates = monthGroups[ym];
            const unpaidMembers = [];

            members.forEach(m => {
                const mid = String(m.id);
                let unpaidWeeks = 0;
                const unpaidDatesList = [];
                monthDates.forEach(d => {
                    if (!records[mid] || records[mid][d] !== true) {
                        if (!isExempt(m.id, d)) {
                            unpaidWeeks++;
                            unpaidDatesList.push(d);
                        }
                    }
                });
                if (unpaidWeeks > 0) {
                    // Hitung denda: Rp5.000 per bulan keterlambatan dari bulan tunggakan ke bulan sekarang
                    const ymParts = ym.split('-');
                    const debtYear = parseInt(ymParts[0]);
                    const debtMonth = parseInt(ymParts[1]);
                    const nowParts = serverDate.split('-');
                    const nowYear = parseInt(nowParts[0]);
                    const nowMonth = parseInt(nowParts[1]);
                    const monthsLate = (nowYear - debtYear) * 12 + (nowMonth - debtMonth);
                    // Denda aman di bulan ke-1, mulai kena denda Rp5.000 per bulan mulai bulan ke-2
                    const fineAmount = monthsLate >= 2 ? (monthsLate - 1) * FINE_PER_MONTH : 0;

                    unpaidMembers.push({
                        id: m.id,
                        name: m.name,
                        unpaidWeeks,
                        unpaidDates: unpaidDatesList,
                        totalDebt: unpaidWeeks * kasAmount,
                        fineAmount,
                        monthsLate,
                        totalWithFine: (unpaidWeeks * kasAmount) + fineAmount
                    });
                }
            });

            const totalDebt = unpaidMembers.reduce((sum, m) => sum + m.totalDebt, 0);
            const totalFine = unpaidMembers.reduce((sum, m) => sum + m.fineAmount, 0);
            totalUnpaidGlobal += totalDebt;
            if (unpaidMembers.length > 0) totalUnpaidMembersGlobal++;

            monthData.push({
                ym,
                monthDates,
                unpaidMembers,
                totalDebt,
                totalFine,
                totalWithFine: totalDebt + totalFine,
                isLunas: unpaidMembers.length === 0
            });
        });

        const lunasCount = monthData.filter(m => m.isLunas).length;
        const totalFineGlobal = monthData.reduce((sum, m) => sum + m.totalFine, 0);

        html += `<div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
            <div class="stat-card purple-card">
                <div class="stat-header"><div class="stat-icon">📊</div><span class="stat-label">Total Tunggakan</span></div>
                <div class="stat-value">${formatRupiah(totalUnpaidGlobal)}</div>
                <div class="stat-sub">${totalUnpaidMembersGlobal} bulan ada tunggakan</div>
            </div>
            <div class="stat-card red">
                <div class="stat-header"><div class="stat-icon">⚠️</div><span class="stat-label">Total Denda</span></div>
                <div class="stat-value">${formatRupiah(totalFineGlobal)}</div>
                <div class="stat-sub">Rp5.000/bulan (mulai bulan ke-2)</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-header"><div class="stat-icon">💰</div><span class="stat-label">Tunggakan + Denda</span></div>
                <div class="stat-value">${formatRupiah(totalUnpaidGlobal + totalFineGlobal)}</div>
                <div class="stat-sub">total yang harus dibayar</div>
            </div>
            <div class="stat-card green-card">
                <div class="stat-header"><div class="stat-icon">✅</div><span class="stat-label">Bulan Lunas</span></div>
                <div class="stat-value">${lunasCount}/${sortedMonths.length}</div>
                <div class="stat-sub">bulan semua siswa lunas</div>
            </div>
        </div>`;

        // Monthly accordion cards
        monthData.forEach((md, idx) => {
            const parts = md.ym.split('-');
            const monthLabel = `${monthNames[parseInt(parts[1]) - 1]} ${parts[0]}`;
            const weekCount = md.monthDates.length;
            const isLunas = md.isLunas;
            const cardId = `recap-month-${idx}`;

            const borderColor = isLunas ? '#10b981' : '#ef4444';
            const statusBadge = isLunas
                ? '<span style="color:#10b981; font-weight:600;">✅ Semuanya Lunas</span>'
                : `<span style="color:#ef4444; font-weight:600;">⚠️ ${md.unpaidMembers.length} siswa belum lunas</span>`;

            html += `
            <div class="card" style="margin-bottom: 16px; border-left: 4px solid ${borderColor};">
                <div class="card-header" style="cursor:pointer; user-select:none;" onclick="toggleRecapMonth('${cardId}')">
                    <div style="flex:1;">
                        <h3 style="margin:0; display:flex; align-items:center; gap:10px;">
                            <span id="${cardId}-chevron" style="transition:transform 0.2s; display:inline-block; font-size:12px;">▶</span>
                            ${monthLabel}
                        </h3>
                        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
                            ${weekCount} minggu pembayaran &nbsp;|&nbsp; ${statusBadge}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        ${!isLunas ? `<div style="font-size:16px; font-weight:700; color:#ef4444;">${formatRupiah(md.totalWithFine)}</div>
                        <div style="font-size:11px; color:var(--text-muted);">tunggakan ${formatRupiah(md.totalDebt)} + denda ${formatRupiah(md.totalFine)}</div>` : ''}
                    </div>
                </div>
                <div id="${cardId}" style="display:none;">
                    <div class="card-body" style="padding-top:0;">`;

            if (isLunas) {
                html += `<div style="text-align:center; padding:24px 0; color:#10b981; font-size:16px; font-weight:600;">
                    ✅ Semua siswa sudah membayar kas di bulan ini!
                </div>`;
            } else {
                // Table of unpaid members
                html += `<div style="overflow-x:auto;">
                <table class="data-table" style="margin-top:8px;">
                    <thead><tr>
                        <th>No</th>
                        <th>Nama Siswa</th>
                        <th style="text-align:center;">Minggu Belum Bayar</th>
                        <th style="text-align:right;">Tunggakan</th>
                        <th style="text-align:center;">Telat</th>
                        <th style="text-align:right;">Denda</th>
                        <th style="text-align:right;">Total</th>
                    </tr></thead>
                    <tbody>`;

                md.unpaidMembers.sort((a, b) => b.unpaidWeeks - a.unpaidWeeks);
                md.unpaidMembers.forEach((um, i) => {
                    const weekDetail = um.unpaidDates.map(d => {
                        const dp = d.split('-');
                        return `${parseInt(dp[2])}/${parseInt(dp[1])}`;
                    }).join(', ');

                    html += `<tr>
                        <td class="row-number">${i + 1}</td>
                        <td class="member-name">${um.name}</td>
                        <td style="text-align:center;">
                            <span style="background:rgba(239,68,68,0.12); color:#ef4444; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:600;">
                                ${um.unpaidWeeks} minggu
                            </span>
                            <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${weekDetail}</div>
                        </td>
                        <td style="text-align:right; font-weight:600; color:#ef4444;">${formatRupiah(um.totalDebt)}</td>
                        <td style="text-align:center;">
                            <span style="background:rgba(245,158,11,0.12); color:#f59e0b; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:600;">
                                ${um.monthsLate} bulan
                            </span>
                        </td>
                        <td style="text-align:right; font-weight:600; color:#f59e0b;">${formatRupiah(um.fineAmount)}</td>
                        <td style="text-align:right; font-weight:700; color:#dc2626;">${formatRupiah(um.totalWithFine)}</td>
                    </tr>`;
                });

                html += `</tbody></table></div>`;
            }

            // Per-date payment breakdown tables
            html += `<div style="margin-top: 20px; border-top: 1px solid var(--border-color, rgba(255,255,255,0.08)); padding-top: 16px;">
                <h4 style="margin: 0 0 12px 0; font-size: 13px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px;">📋 Detail Pembayaran Per Tanggal</h4>`;

            md.monthDates.forEach(dateStr => {
                const dateLabel = formatDate(dateStr);
                let paidInDate = 0;
                members.forEach(m => {
                    const mid = String(m.id);
                    if ((records[mid] && records[mid][dateStr] === true) || isExempt(m.id, dateStr)) paidInDate++;
                });

                html += `
                <div style="margin-bottom: 16px;">
                    <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; display:flex; align-items:center; gap:8px;">
                        📅 ${dateLabel}
                        <span style="font-size:11px; font-weight:400; color:var(--text-muted);">(${paidInDate}/${members.length} lunas)</span>
                    </div>
                    <div style="overflow-x:auto;">
                    <table class="data-table" style="font-size:12px;">
                        <thead><tr>
                            <th style="width:40px;">No</th>
                            <th>Nama Siswa</th>
                            <th style="text-align:center; width:120px;">Status</th>
                        </tr></thead>
                        <tbody>`;

                members.forEach((m, mi) => {
                    const mid = String(m.id);
                    const isPaid = records[mid] && records[mid][dateStr] === true;
                    const exempt = isExempt(m.id, dateStr);
                    let statusHtml;
                    if (isPaid) {
                        statusHtml = '<span style="color:#10b981; font-weight:600;">✓ Lunas</span>';
                    } else if (exempt) {
                        statusHtml = '<span style="color:#8b5cf6; font-weight:600;">— ' + exempt.reason + '</span>';
                    } else {
                        statusHtml = '<span style="color:#ef4444; font-weight:600;">✗ Belum</span>';
                    }
                    html += `<tr>
                        <td class="row-number">${mi + 1}</td>
                        <td class="member-name">${m.name}</td>
                        <td style="text-align:center;">${statusHtml}</td>
                    </tr>`;
                });

                html += `</tbody></table></div></div>`;
            });

            html += `</div>`;

            html += `</div></div></div>`;
        });
    }

    html += '</div>';
    el.innerHTML = html;
}

function toggleRecapMonth(cardId) {
    const el = document.getElementById(cardId);
    const chevron = document.getElementById(cardId + '-chevron');
    if (!el) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    if (chevron) chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}

/* ======= Pungutan (Levies) ======= */
async function renderLevies(el) {
    const [levies, members] = await Promise.all([
        API.getLevies(),
        API.getMembers()
    ]);
    membersCache = members;
    const isAdmin = API.isAdmin();
    const today = new Date().toISOString().split('T')[0];

    let html = '';

    /* Admin: Add Levy Form */
    if (isAdmin) {
        html += `
        <div class="card" style="margin-bottom: var(--space-lg);">
            <div class="card-header"><h3>📋 Tambah Pungutan Baru</h3></div>
            <div class="card-body">
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                    <div class="form-group">
                        <label class="form-label">Judul Pungutan</label>
                        <input type="text" class="form-input" id="levy-title" placeholder="Misal: Iuran Study Tour">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Jumlah per Orang (Rp)</label>
                        <input type="number" class="form-input" id="levy-amount" placeholder="50000" min="1000" step="1000">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tanggal Mulai</label>
                        <input type="date" class="form-input" id="levy-start" value="${today}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Batas Waktu (Deadline)</label>
                        <input type="date" class="form-input" id="levy-deadline">
                    </div>
                </div>
                <button class="btn btn-primary" onclick="addLevy()" style="margin-top: 12px;">
                    ➕ Buat Pungutan
                </button>
            </div>
        </div>`;
    }

    if (!levies || levies.length === 0) {
        html += `<div class="empty-state"><div class="empty-icon">📋</div><p>Belum ada pungutan.</p></div>`;
    } else {
        const currentList = levies.filter(l => l.deadline >= today);
        const historyList = levies.filter(l => l.deadline < today);
        currentList.sort((a, b) => a.deadline.localeCompare(b.deadline));
        historyList.sort((a, b) => b.deadline.localeCompare(a.deadline));

        function buildLevyCard(levy, isHistory) {
            const paidCount = levy.paid_members ? levy.paid_members.length : 0;
            const totalMembers = members.length;
            const pct = totalMembers > 0 ? Math.round((paidCount / totalMembers) * 100) : 0;
            const isExpired = levy.deadline < today;
            const isActive = levy.start_date <= today && !isExpired;
            const isTransferred = levy.transferred === true;
            const statusLabel = isTransferred ? '💰 Sudah Ditransfer' : isExpired ? '⏰ Lewat Batas' : isActive ? '🟢 Aktif' : '📅 Terjadwal';
            const statusColor = isTransferred ? '#8b5cf6' : isExpired ? '#ef4444' : isActive ? '#10b981' : '#f59e0b';

            /* Calculate total using per-member amounts if available */
            const memberAmounts = levy.member_amounts || {};
            let totalCollected = 0;
            let totalTarget = 0;
            members.forEach(m => {
                const amt = memberAmounts[String(m.id)] != null ? memberAmounts[String(m.id)] : levy.amount;
                totalTarget += amt;
                if (levy.paid_members && levy.paid_members.includes(m.id)) {
                    totalCollected += amt;
                }
            });

            let actionBtns = '';
            if (isAdmin && !isTransferred) {
                actionBtns += `<button class="btn" onclick="editLevy(${levy.id})" style="font-size:11px; padding:4px 10px; background:rgba(79,124,255,0.15); color:#4f7cff; border:none; border-radius:6px; cursor:pointer; margin-top:4px;">✏️ Edit</button> `;
                actionBtns += `<button class="btn" onclick="openLevyAmountsModal(${levy.id})" style="font-size:11px; padding:4px 10px; background:rgba(139,92,246,0.15); color:#8b5cf6; border:none; border-radius:6px; cursor:pointer; margin-top:4px;">💰 Atur Nominal</button> `;
                actionBtns += `<button class="btn" onclick="deleteLevy(${levy.id})" style="font-size:11px; padding:4px 10px; background:rgba(239,68,68,0.15); color:#ef4444; border:none; border-radius:6px; cursor:pointer; margin-top:4px;">🗑 Hapus</button>`;
                if (isExpired && totalCollected > 0) {
                    actionBtns += ` <button class="btn" onclick="transferLevyToKas(${levy.id})" style="font-size:11px; padding:4px 10px; background:rgba(79,124,255,0.15); color:#4f7cff; border:none; border-radius:6px; cursor:pointer; margin-top:4px;">💰 Masukkan ke Kas</button>`;
                }
            }

            const showGrid = !isTransferred;
            let gridHtml = '';
            if (showGrid) {
                gridHtml = `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:6px; max-height:320px; overflow-y:auto;">
                    ${members.map(m => {
                    const isPaid = levy.paid_members && levy.paid_members.includes(m.id);
                    const bgColor = isPaid ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.08)';
                    const icon = isPaid ? '✅' : '❌';
                    const memberAmt = memberAmounts[String(m.id)] != null ? memberAmounts[String(m.id)] : levy.amount;
                    const clickable = isAdmin && !isTransferred;
                    const clickAttr = clickable ? `onclick="toggleLevyPay(${levy.id}, ${m.id})" style="cursor:pointer;"` : '';
                    const nameShort = m.name.length > 22 ? m.name.substring(0, 22) + '…' : m.name;
                    const amtLabel = memberAmounts[String(m.id)] != null ? `<span style="font-size:10px; color:var(--text-muted); margin-left:auto;">Rp ${memberAmt.toLocaleString('id-ID')}</span>` : '';
                    return `<div ${clickAttr} style="display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:6px; background:${bgColor}; font-size:12px; transition:background 0.2s;">
                        <span>${icon}</span>
                        <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${m.name}">${nameShort}</span>
                        ${amtLabel}
                    </div>`;
                }).join('')}
                </div>`;
            }

            return `
            <div class="card" style="margin-bottom: var(--space-lg); border-left: 4px solid ${statusColor}; ${isTransferred ? 'opacity:0.65;' : ''}">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <h3 style="margin:0;">${levy.title}</h3>
                        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
                            ${formatDate(levy.start_date)} → ${formatDate(levy.deadline)} &nbsp;|&nbsp;
                            <span style="color:${statusColor}; font-weight:600;">${statusLabel}</span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:18px; font-weight:700; color:var(--text-primary);">Rp ${levy.amount.toLocaleString('id-ID')}<span style="font-size:12px; font-weight:400; color:var(--text-muted);">/orang</span></div>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end;">${actionBtns}</div>
                    </div>
                </div>
                <div class="card-body">
                    <div style="margin-bottom: 14px;">
                        <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-bottom:4px;">
                            <span>${paidCount}/${totalMembers} siswa sudah bayar</span>
                            <span>Rp ${totalCollected.toLocaleString('id-ID')} / Rp ${totalTarget.toLocaleString('id-ID')}</span>
                        </div>
                        <div style="height:8px; background:var(--bg-tertiary); border-radius:4px; overflow:hidden;">
                            <div style="height:100%; width:${pct}%; background:${pct === 100 ? '#10b981' : '#4f7cff'}; border-radius:4px; transition:width 0.3s;"></div>
                        </div>
                    </div>
                    ${gridHtml}
                </div>
            </div>`;
        }

        if (currentList.length > 0) {
            html += `<h3 style="margin-bottom:var(--space-md); color:var(--text-secondary); font-size:14px; text-transform:uppercase; letter-spacing:1px;">🟢 Pungutan Aktif & Terjadwal</h3>`;
            currentList.forEach(l => { html += buildLevyCard(l, false); });
        }

        if (historyList.length > 0) {
            html += `<h3 style="margin: var(--space-xl) 0 var(--space-md); color:var(--text-secondary); font-size:14px; text-transform:uppercase; letter-spacing:1px;">📜 Riwayat Pungutan</h3>`;
            historyList.forEach(l => { html += buildLevyCard(l, true); });
        }
    }

    el.innerHTML = html;
}

async function addLevy() {
    const title = document.getElementById('levy-title').value.trim();
    const amount = parseInt(document.getElementById('levy-amount').value);
    const start_date = document.getElementById('levy-start').value;
    const deadline = document.getElementById('levy-deadline').value;

    if (!title || !amount || !start_date || !deadline) {
        showToast('Lengkapi semua field!', 'error');
        return;
    }
    if (deadline < start_date) {
        showToast('Deadline harus setelah tanggal mulai!', 'error');
        return;
    }

    try {
        await API.addLevy({ title, amount, start_date, deadline });
        showToast('Pungutan berhasil ditambahkan!', 'success');
        navigateTo('levies');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function editLevy(levyId) {
    const levies = await API.getLevies();
    const levy = levies.find(l => l.id === levyId);
    if (!levy) { showToast('Pungutan tidak ditemukan', 'error'); return; }

    const bodyHtml = `
        <div style="display:grid; gap:12px;">
            <div class="form-group">
                <label class="form-label">Judul Pungutan</label>
                <input type="text" class="form-input" id="edit-levy-title" value="${levy.title}">
            </div>
            <div class="form-group">
                <label class="form-label">Jumlah Default per Orang (Rp)</label>
                <input type="number" class="form-input" id="edit-levy-amount" value="${levy.amount}" min="1000" step="1000">
            </div>
            <div class="form-group">
                <label class="form-label">Tanggal Mulai</label>
                <input type="date" class="form-input" id="edit-levy-start" value="${levy.start_date}">
            </div>
            <div class="form-group">
                <label class="form-label">Batas Waktu (Deadline)</label>
                <input type="date" class="form-input" id="edit-levy-deadline" value="${levy.deadline}">
            </div>
        </div>`;

    const footerHtml = `
        <button class="btn btn-primary" onclick="saveEditLevy(${levyId})">💾 Simpan</button>
        <button class="btn" onclick="closeModal()" style="margin-left:8px;">Batal</button>`;

    openModal('✏️ Edit Pungutan', bodyHtml, footerHtml);
}

async function saveEditLevy(levyId) {
    const title = document.getElementById('edit-levy-title').value.trim();
    const amount = parseInt(document.getElementById('edit-levy-amount').value);
    const start_date = document.getElementById('edit-levy-start').value;
    const deadline = document.getElementById('edit-levy-deadline').value;

    if (!title || !amount || !start_date || !deadline) {
        showToast('Lengkapi semua field!', 'error');
        return;
    }

    try {
        await API.updateLevy(levyId, { title, amount, start_date, deadline });
        showToast('Pungutan berhasil diperbarui!', 'success');
        closeModal();
        navigateTo('levies');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function openLevyAmountsModal(levyId) {
    const [levies, members] = await Promise.all([API.getLevies(), API.getMembers()]);
    const levy = levies.find(l => l.id === levyId);
    if (!levy) { showToast('Pungutan tidak ditemukan', 'error'); return; }

    const memberAmounts = levy.member_amounts || {};

    let tableRows = members.map((m, i) => {
        const customAmt = memberAmounts[String(m.id)];
        const displayAmt = customAmt != null ? customAmt : levy.amount;
        const isCustom = customAmt != null;
        return `<tr>
            <td class="row-number">${i + 1}</td>
            <td class="member-name">${m.name}</td>
            <td style="text-align:right;">
                <input type="number" class="form-input levy-member-amt" data-mid="${m.id}"
                    value="${displayAmt}" min="0" step="1000"
                    style="width:120px; display:inline-block; text-align:right; font-size:12px; padding:4px 8px; ${isCustom ? 'border-color:#8b5cf6;' : ''}">
            </td>
        </tr>`;
    }).join('');

    const bodyHtml = `
        <div style="margin-bottom:12px; font-size:12px; color:var(--text-muted);">
            Default: <strong>Rp ${levy.amount.toLocaleString('id-ID')}</strong> per orang. Ubah nominal di bawah untuk mengatur jumlah khusus per anggota.
        </div>
        <div style="display:flex; gap:8px; margin-bottom:12px;">
            <button class="btn" onclick="document.querySelectorAll('.levy-member-amt').forEach(i=>i.value=${levy.amount})" style="font-size:11px; padding:4px 10px; background:rgba(79,124,255,0.15); color:#4f7cff; border:none; border-radius:6px; cursor:pointer;">🔄 Reset Semua ke Default</button>
        </div>
        <div style="overflow-x:auto; max-height:400px; overflow-y:auto;">
        <table class="data-table" style="font-size:12px;">
            <thead><tr>
                <th style="width:40px;">No</th>
                <th>Nama Siswa</th>
                <th style="text-align:right; width:150px;">Nominal (Rp)</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
        </table>
        </div>`;

    const footerHtml = `
        <button class="btn btn-primary" onclick="saveLevyAmounts(${levyId}, ${levy.amount})">💾 Simpan Nominal</button>
        <button class="btn" onclick="closeModal()" style="margin-left:8px;">Batal</button>`;

    openModal(`💰 Atur Nominal: ${levy.title}`, bodyHtml, footerHtml);
}

async function saveLevyAmounts(levyId, defaultAmount) {
    const inputs = document.querySelectorAll('.levy-member-amt');
    const member_amounts = {};
    let hasCustom = false;

    inputs.forEach(input => {
        const mid = input.dataset.mid;
        const val = parseInt(input.value);
        if (!isNaN(val) && val !== defaultAmount) {
            member_amounts[mid] = val;
            hasCustom = true;
        }
    });

    try {
        await API.updateLevy(levyId, { member_amounts: hasCustom ? member_amounts : {} });
        showToast('Nominal per anggota berhasil diperbarui!', 'success');
        closeModal();
        navigateTo('levies');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteLevy(id) {
    if (!confirm('Hapus pungutan ini?')) return;
    try {
        await API.deleteLevy(id);
        showToast('Pungutan dihapus', 'success');
        navigateTo('levies');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function toggleLevyPay(levyId, memberId) {
    try {
        await API.toggleLevyPayment(levyId, memberId);
        navigateTo('levies');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function transferLevyToKas(levyId) {
    const [levies, members] = await Promise.all([API.getLevies(), API.getMembers()]);
    const levy = levies.find(l => l.id === levyId);
    if (!levy) { showToast('Pungutan tidak ditemukan', 'error'); return; }

    const memberAmounts = levy.member_amounts || {};
    let totalCollected = 0;
    const paidCount = levy.paid_members ? levy.paid_members.length : 0;
    if (levy.paid_members) {
        levy.paid_members.forEach(mid => {
            const amt = memberAmounts[String(mid)] != null ? memberAmounts[String(mid)] : levy.amount;
            totalCollected += amt;
        });
    }

    if (totalCollected <= 0) { showToast('Tidak ada dana untuk ditransfer', 'error'); return; }

    if (!confirm(`Transfer dana pungutan "${levy.title}" sebesar Rp ${totalCollected.toLocaleString('id-ID')} ke kas kelas?\n\nAksi ini tidak dapat dibatalkan.`)) return;

    try {
        const today = new Date().toISOString().split('T')[0];
        await API.addDonation({
            name: `Pungutan: ${levy.title}`,
            amount: totalCollected,
            date: today,
            note: `Transfer dari pungutan "${levy.title}" (${paidCount} siswa)`
        });

        await API.deleteLevy(levyId);
        await API.addLevy({
            title: levy.title,
            amount: levy.amount,
            start_date: levy.start_date,
            deadline: levy.deadline,
            transferred: true,
            paid_members: levy.paid_members
        });

        showToast(`Dana Rp ${totalCollected.toLocaleString('id-ID')} berhasil ditransfer ke kas kelas!`, 'success');
        navigateTo('levies');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ======= Logout ======= */
async function logout() {
    try { await API.logout(); } catch (e) { }
    localStorage.clear();
    window.location.href = '/admin';
}

/* ======= Search ======= */
function handleSearch(query) {
    if (!query) return;
    // Simple table row filtering
    const rows = document.querySelectorAll('.data-table tbody tr');
    const q = query.toLowerCase();
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
    });
}

/* ======= Candlestick Helper Functions ======= */
function getMonday(dateStr) {
    if (!dateStr || dateStr === 'Awal') return null;
    const parts = dateStr.includes('T') ? dateStr.split('T')[0].split('-') : dateStr.split('-');
    if (parts.length < 3) return null;
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    const d = new Date(year, month, day);

    const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));

    const yyyy = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

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

    // Settings — reserve space at bottom for volume bars
    const paddingLeft = 65;
    const paddingRight = 20;
    const paddingTop = 25;
    const paddingBottom = 55;
    const volumeHeight = 30;
    const graphHeight = height - paddingTop - paddingBottom - volumeHeight;
    const graphWidth = width - paddingLeft - paddingRight;

    ctx.clearRect(0, 0, width, height);

    if (candles.length < 1) {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Menunggu perkembangan transaksi kas...', width / 2, height / 2);
        return;
    }

    // Determine Y range from candle Highs and Lows
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
        minVal = minVal - diff * 0.1;
        maxVal = maxVal + diff * 0.15;
    }

    // Grid rendering parameters
    const rows = 4;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';

    // Horizontal grid lines
    for (let r = 0; r <= rows; r++) {
        const val = minVal + (maxVal - minVal) * (rows - r) / rows;
        const y = paddingTop + (graphHeight * r / rows);

        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(width - paddingRight, y);
        ctx.stroke();

        ctx.fillText(formatRupiahShort(val), paddingLeft - 8, y + 4);
    }

    const pts = candles.length;
    const stepX = graphWidth / pts;

    // Draw grid vertical lines & X-axis dates (weekly range labels)
    ctx.textAlign = 'center';
    const totalLabels = Math.min(pts, 6);
    const labelStep = Math.max(1, Math.floor(pts / totalLabels));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

    for (let i = 0; i < pts; i++) {
        const x = paddingLeft + (i + 0.5) * stepX;
        if (i % labelStep === 0 || i === pts - 1) {
            ctx.beginPath();
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1;
            ctx.moveTo(x, paddingTop);
            ctx.lineTo(x, paddingTop + graphHeight);
            ctx.stroke();

            // Show week range: "14-20 Jul"
            const monDate = new Date(candles[i].date + 'T00:00:00');
            const sunDate = new Date(monDate);
            sunDate.setDate(sunDate.getDate() + 6);
            const mDay = monDate.getDate();
            const sDay = sunDate.getDate();
            const mMonth = months[monDate.getMonth()];
            const sMonth = months[sunDate.getMonth()];
            let label;
            if (mMonth === sMonth) {
                label = `${mDay}-${sDay} ${mMonth}`;
            } else {
                label = `${mDay} ${mMonth}-${sDay} ${sMonth}`;
            }
            ctx.fillStyle = '#94a3b8';
            ctx.font = '9px Inter, sans-serif';
            ctx.fillText(label, x, paddingTop + graphHeight + 14);
        }
    }

    // Compute volume data (total money flow per week)
    let maxVolume = 0;
    const volumes = candles.map(c => {
        const vol = Math.abs(c.high - c.low);
        if (vol > maxVolume) maxVolume = vol;
        return { vol, bullish: c.close >= c.open };
    });

    // Draw volume bars at bottom
    const volTop = paddingTop + graphHeight + 22;
    if (maxVolume > 0) {
        candles.forEach((c, i) => {
            const x = paddingLeft + (i + 0.5) * stepX;
            const candleWidth = Math.max(3, Math.min(18, stepX * 0.5));
            const barH = (volumes[i].vol / maxVolume) * volumeHeight;
            const color = volumes[i].bullish ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
            ctx.fillStyle = color;
            ctx.fillRect(x - candleWidth / 2, volTop + volumeHeight - barH, candleWidth, barH);
        });
    }

    // Draw zero-line if data crosses zero
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

    // Draw Candlesticks (Wicks and Bodies)
    candles.forEach((c, i) => {
        const x = paddingLeft + (i + 0.5) * stepX;

        // Map values to coordinates
        const openY = paddingTop + graphHeight - ((c.open - minVal) / (maxVal - minVal) * graphHeight);
        const closeY = paddingTop + graphHeight - ((c.close - minVal) / (maxVal - minVal) * graphHeight);
        const highY = paddingTop + graphHeight - ((c.high - minVal) / (maxVal - minVal) * graphHeight);
        const lowY = paddingTop + graphHeight - ((c.low - minVal) / (maxVal - minVal) * graphHeight);

        const bullish = c.close >= c.open;
        const color = bullish ? '#10b981' : '#ef4444';

        // Draw Wick (high to low)
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Draw Body
        const candleWidth = Math.max(4, Math.min(22, stepX * 0.6));
        const bodyHeight = Math.max(2, Math.abs(closeY - openY));

        ctx.fillStyle = color;
        ctx.fillRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, bodyHeight);

        // Draw Doji crosshair for weeks with minimal net change
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

/* ======= PDF Report ======= */
async function renderReports(el) {
    const [data, members, payments, donations, fines, expenses, config] = await Promise.all([
        API.getDashboard(),
        API.getMembers(),
        API.getPayments(),
        API.getDonations(),
        API.getFines(),
        API.getExpenses(),
        API.getConfig()
    ]);

    membersCache = members;
    if (data.server_date) window._serverDate = data.server_date;

    let totalExpense = 0;
    expenses.forEach(e => totalExpense += e.amount || 0);

    let totalFines = 0;
    fines.forEach(f => { if (f.paid) totalFines += f.amount || 0; });

    let totalDonations = 0;
    donations.forEach(d => totalDonations += d.amount || 0);

    const kasAmount = data.kas_amount || 5000;
    let totalPayments = 0;
    const dates = payments.dates || [];
    const records = payments.records || {};
    if (dates.length > 0) {
        dates.forEach(d => {
            members.forEach(m => {
                const mid = String(m.id);
                if (records[mid] && records[mid][d] === true) {
                    totalPayments += kasAmount;
                }
            });
        });
    }

    const currentBalance = data.total_balance || 0;
    const realBalance = config.real_balance || 0;
    const sortedExpenses = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
    const sortedDonations = [...donations].sort((a, b) => new Date(b.date) - new Date(a.date));
    const serverDate = data.server_date || new Date().toISOString().split('T')[0];
    const serverMonth = serverDate.substring(0, 7);
    const monthNamesID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const serverMonthParts = serverDate.split('-');
    const printDateLabel = `${monthNamesID[parseInt(serverMonthParts[1]) - 1]} ${serverMonthParts[0]}`;

    const diffText = (() => {
        const diff = realBalance - currentBalance;
        return diff > 0 ? `+${formatRupiah(diff)}` : (diff < 0 ? `-${formatRupiah(Math.abs(diff))}` : 'Rp 0');
    })();

    // ==== Build monthly recap data ====
    const validDates = dates.filter(d => d <= serverDate);
    const monthGroups = {};
    validDates.forEach(d => {
        const ym = d.substring(0, 7);
        if (ym <= serverMonth) {
            if (!monthGroups[ym]) monthGroups[ym] = [];
            monthGroups[ym].push(d);
        }
    });
    const sortedMonths = Object.keys(monthGroups).sort();

    // Common PDF styles
    const pS = 'font-family: "Inter", "Segoe UI", sans-serif; color: #1e293b;';
    const pageBreak = 'page-break-before: always; padding-top: 30px;';
    const sectionTitle = 'font-size: 15px; font-weight: 800; color: #0e1018; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.3px;';
    const sectionSub = 'font-size: 11px; color: #64748b; margin: 0 0 18px 0;';
    const tblHead = 'background: #f1f5f9; font-size: 10px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.3px;';
    const tblCell = 'padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #334155;';

    let html = `
    <div class="page-content" style="padding-bottom: 50px;">
        <div class="card" style="margin-bottom: var(--space-lg);">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                <h2>📑 Ekspor Laporan Keuangan Kas Kelas</h2>
                <button class="btn btn-primary" onclick="exportReportToPDF()">📥 Cetak / Unduh PDF</button>
            </div>
            <div class="card-body">
                <p style="color: var(--text-secondary); margin-bottom: 0;">Pratinjau laporan lengkap dengan cover, daftar isi, ringkasan keuangan, dan rekap tunggakan bulanan. Klik <strong>Cetak / Unduh PDF</strong> untuk mencetak.</p>
            </div>
        </div>

        <div id="printable-report-wrapper" style="padding: 20px; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px dashed var(--border); overflow-x: auto; display: flex; justify-content: center;">
            <div id="printable-report" style="background: #ffffff; ${pS} padding: 0; border-radius: 4px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); width: 210mm; box-sizing: border-box;">

                <!-- ====== COVER PAGE ====== -->
                <div style="min-height: 297mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 60px 50px; box-sizing: border-box;">
                    <div style="margin-bottom: 40px;">
                        <div style="font-size: 60px; margin-bottom: 10px;">💰</div>
                        <div style="width: 80px; height: 4px; background: linear-gradient(90deg, #4f7cff, #818cf8); margin: 0 auto 30px auto; border-radius: 2px;"></div>
                    </div>
                    <h1 style="font-size: 32px; font-weight: 900; color: #0e1018; margin: 0 0 8px 0; letter-spacing: -1px;">LAPORAN KEUANGAN</h1>
                    <h2 style="font-size: 20px; font-weight: 700; color: #4f7cff; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 2px;">KAS KELAS XII PPLG</h2>
                    <p style="font-size: 13px; color: #64748b; margin: 16px 0 0 0;">Periode: Januari – ${printDateLabel}</p>
                    <div style="margin-top: 50px; padding: 20px 40px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
                        <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Saldo Kas Tercatat</div>
                        <div style="font-size: 28px; font-weight: 800; color: #1e40af;">${formatRupiah(currentBalance)}</div>
                    </div>
                    <div style="margin-top: auto; padding-top: 60px; font-size: 11px; color: #94a3b8; line-height: 1.6;">
                        SMK NEGERI 2 KUTA SELATAN<br>
                        Jl. Pura Pengulapan Desa Ungasan, Kecamatan Kuta Selatan, Kabupaten Badung, Provinsi Bali<br>
                        Tahun Ajaran 2026/2027
                    </div>
                </div>

                <!-- ====== DAFTAR ISI ====== -->
                <div style="${pageBreak} padding: 40px 50px; min-height: 297mm; box-sizing: border-box;">
                    <h2 style="font-size: 20px; font-weight: 800; color: #0e1018; margin: 0 0 6px 0; border-bottom: 3px solid #4f7cff; padding-bottom: 12px;">DAFTAR ISI</h2>
                    <div style="margin-top: 30px; font-size: 13px; color: #334155; line-height: 2.4;">
                        <div style="display:flex; justify-content:space-between; border-bottom: 1px dotted #cbd5e1; padding: 4px 0;">
                            <span style="font-weight: 700;">Pasal I — Ringkasan Keuangan</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom: 1px dotted #cbd5e1; padding: 4px 0;">
                            <span style="font-weight: 700;">Pasal II — Rincian Sumber Keuangan</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom: 1px dotted #cbd5e1; padding: 4px 0;">
                            <span style="font-weight: 700;">Pasal III — Transaksi Terbaru</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom: 1px dotted #cbd5e1; padding: 4px 0;">
                            <span style="font-weight: 700;">Pasal IV — Rekap Tunggakan Pembayaran Kas</span>
                        </div>
                    </div>

                    <div style="margin-top: 40px; padding: 20px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 11px; color: #92400e; line-height: 1.6;">
                        <strong>⚠️ Catatan:</strong> Laporan ini digenerate secara otomatis oleh sistem manajemen kas kelas XII PPLG. Data yang ditampilkan berdasarkan pencatatan digital hingga tanggal ${formatDate(serverDate)}. Segala bentuk rekonsiliasi dan verifikasi menjadi tanggung jawab bendahara dan wali kelas.
                    </div>
                </div>

                <!-- ====== PASAL I: RINGKASAN KEUANGAN ====== -->
                <div style="${pageBreak} padding: 40px 50px; min-height: 297mm; box-sizing: border-box;">
                    <div style="margin-bottom: 25px;">
                        <h2 style="${sectionTitle} border-left: 4px solid #4f7cff; padding-left: 10px;">Pasal I — Ringkasan Keuangan</h2>
                        <p style="${sectionSub} padding-left: 14px;">Ikhtisar kondisi keuangan kas kelas XII PPLG</p>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px;">
                        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 18px; border-radius: 8px; text-align: center;">
                            <span style="font-size: 10px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">Total Pemasukan</span>
                            <div style="font-size: 18px; font-weight: 800; color: #15803d; margin-top: 6px;">${formatRupiah(totalPayments + totalDonations + totalFines)}</div>
                        </div>
                        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 18px; border-radius: 8px; text-align: center;">
                            <span style="font-size: 10px; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px;">Total Pengeluaran</span>
                            <div style="font-size: 18px; font-weight: 800; color: #dc2626; margin-top: 6px;">${formatRupiah(totalExpense)}</div>
                        </div>
                        <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 18px; border-radius: 8px; text-align: center;">
                            <span style="font-size: 10px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px;">Saldo Bersih</span>
                            <div style="font-size: 18px; font-weight: 800; color: #1e40af; margin-top: 6px;">${formatRupiah(currentBalance)}</div>
                        </div>
                    </div>

                    <!-- Audit -->
                    <h3 style="font-size: 12px; font-weight: 700; color: #0e1018; margin: 30px 0 12px 0; border-left: 4px solid #f59e0b; padding-left: 8px; text-transform: uppercase;">Verifikasi Saldo</h3>
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; gap: 15px;">
                        <div>
                            <span style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">Saldo Buku</span>
                            <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-top: 3px;">${formatRupiah(currentBalance)}</div>
                        </div>
                        <div>
                            <span style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">Saldo Fisik</span>
                            <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-top: 3px;">${formatRupiah(realBalance)}</div>
                        </div>
                        <div>
                            <span style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">Selisih</span>
                            <div style="font-size: 14px; font-weight: 800; color: ${realBalance - currentBalance === 0 ? '#64748b' : (realBalance - currentBalance > 0 ? '#10b981' : '#ef4444')}; margin-top: 3px;">${diffText}</div>
                        </div>
                    </div>
                </div>

                <!-- ====== PASAL II: RINCIAN SUMBER KEUANGAN ====== -->
                <div style="${pageBreak} padding: 40px 50px; box-sizing: border-box;">
                    <div style="margin-bottom: 25px;">
                        <h2 style="${sectionTitle} border-left: 4px solid #10b981; padding-left: 10px;">Pasal II — Rincian Sumber Keuangan</h2>
                        <p style="${sectionSub} padding-left: 14px;">Uraian pemasukan dari iuran kas, donasi, dan denda</p>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="${tblHead}">
                                <th style="padding: 10px 12px; border-bottom: 2px solid #cbd5e1; text-align: left;">Sumber Pemasukan</th>
                                <th style="padding: 10px 12px; border-bottom: 2px solid #cbd5e1; text-align: right;">Jumlah</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td style="${tblCell}">Iuran Pembayaran Kas Mingguan (${data.total_payments || 0} transaksi)</td><td style="${tblCell} text-align: right; font-weight: 600;">${formatRupiah(totalPayments)}</td></tr>
                            <tr><td style="${tblCell}">Sumbangan Donatur / Kas Lainnya (${donations.length} donatur)</td><td style="${tblCell} text-align: right; font-weight: 600;">${formatRupiah(totalDonations)}</td></tr>
                            <tr><td style="${tblCell}">Uang Denda Terbayar (${fines.filter(f=>f.paid).length} denda)</td><td style="${tblCell} text-align: right; font-weight: 600;">${formatRupiah(totalFines)}</td></tr>
                            <tr><td style="${tblCell}">Total Pengeluaran (${expenses.length} nota)</td><td style="${tblCell} text-align: right; font-weight: 600; color: #ef4444;">-${formatRupiah(totalExpense)}</td></tr>
                            <tr style="background: #f0f5ff;">
                                <td style="padding: 10px 12px; font-weight: 800; color: #1e40af; font-size: 12px;">SALDO BERSIH</td>
                                <td style="padding: 10px 12px; text-align: right; font-weight: 800; color: #1e40af; font-size: 14px;">${formatRupiah(currentBalance)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- ====== PASAL III: TRANSAKSI TERBARU ====== -->
                <div style="${pageBreak} padding: 40px 50px; box-sizing: border-box;">
                    <div style="margin-bottom: 25px;">
                        <h2 style="${sectionTitle} border-left: 4px solid #f59e0b; padding-left: 10px;">Pasal III — Transaksi Terbaru</h2>
                        <p style="${sectionSub} padding-left: 14px;">Daftar pengeluaran dan pemasukan donatur terakhir</p>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                        <div>
                            <h3 style="font-size: 12px; font-weight: 700; color: #0e1018; margin-bottom: 10px; border-left: 3px solid #ef4444; padding-left: 8px; text-transform: uppercase;">Pengeluaran</h3>
                            <div style="font-size: 11px; color: #334155;">
                                ${sortedExpenses.slice(0, 7).map(e => `
                                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 7px 0; border-bottom: 1px dashed #e2e8f0;">
                                        <div style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                            <div style="font-weight: 600; color: #1e293b;">${e.description}</div>
                                            <div style="color: #64748b; font-size: 9px;">${formatDate(e.date)}</div>
                                        </div>
                                        <div style="color: #ef4444; font-weight: 700;">-${formatRupiah(e.amount)}</div>
                                    </div>
                                `).join('') || '<div style="color:#64748b; padding:10px 0;">Tidak ada pengeluaran</div>'}
                            </div>
                        </div>
                        <div>
                            <h3 style="font-size: 12px; font-weight: 700; color: #0e1018; margin-bottom: 10px; border-left: 3px solid #10b981; padding-left: 8px; text-transform: uppercase;">Donatur</h3>
                            <div style="font-size: 11px; color: #334155;">
                                ${sortedDonations.slice(0, 7).map(d => `
                                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 7px 0; border-bottom: 1px dashed #e2e8f0;">
                                        <div style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                            <div style="font-weight: 600; color: #1e293b;">${d.name}</div>
                                            <div style="color: #64748b; font-size: 9px;">${formatDate(d.date)}</div>
                                        </div>
                                        <div style="color: #10b981; font-weight: 700;">+${formatRupiah(d.amount)}</div>
                                    </div>
                                `).join('') || '<div style="color:#64748b; padding:10px 0;">Tidak ada donatur</div>'}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ====== PASAL IV: REKAP TUNGGAKAN ====== -->
                <div style="${pageBreak} padding: 40px 50px; box-sizing: border-box;">
                    <div style="margin-bottom: 25px;">
                        <h2 style="${sectionTitle} border-left: 4px solid #ef4444; padding-left: 10px;">Pasal IV — Rekap Tunggakan Pembayaran Kas</h2>
                        <p style="${sectionSub} padding-left: 14px;">Rekap pembayaran per tanggal untuk setiap bulan sebelum ${printDateLabel}</p>
                    </div>`;

    // Generate monthly recap tables
    if (sortedMonths.length === 0) {
        html += `<div style="text-align:center; padding: 30px; color: #64748b; font-size: 13px;">Belum ada data pembayaran untuk direkap.</div>`;
    } else {
        sortedMonths.forEach(ym => {
            const parts = ym.split('-');
            const monthLabel = `${monthNamesID[parseInt(parts[1]) - 1]} ${parts[0]}`;
            const monthDates = monthGroups[ym];

            html += `
                <div style="margin-bottom: 30px;">
                    <h3 style="font-size: 14px; font-weight: 800; color: #0e1018; margin: 0 0 4px 0; background: #f1f5f9; padding: 10px 14px; border-radius: 6px; border-left: 4px solid #4f7cff;">
                        📅 ${monthLabel}
                    </h3>`;

            monthDates.forEach(dateStr => {
                const dateLabel = formatDate(dateStr);
                let paidCount = 0;
                members.forEach(m => {
                    const mid = String(m.id);
                    if ((records[mid] && records[mid][dateStr] === true) || isExempt(m.id, dateStr)) paidCount++;
                });
                const allPaid = paidCount === members.length;

                html += `
                    <div style="margin: 12px 0 16px 0;">
                        <div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 6px; display:flex; align-items:center; gap:6px;">
                            ${dateLabel}
                            <span style="font-size:10px; font-weight:400; color: ${allPaid ? '#10b981' : '#ef4444'};">(${paidCount}/${members.length} lunas)</span>
                        </div>
                        <table style="width:100%; border-collapse:collapse; font-size:10px;">
                            <thead>
                                <tr style="${tblHead}">
                                    <th style="padding:5px 8px; border-bottom:1px solid #cbd5e1; text-align:left; width:30px;">No</th>
                                    <th style="padding:5px 8px; border-bottom:1px solid #cbd5e1; text-align:left;">Nama Siswa</th>
                                    <th style="padding:5px 8px; border-bottom:1px solid #cbd5e1; text-align:center; width:80px;">Status</th>
                                </tr>
                            </thead>
                            <tbody>`;

                members.forEach((m, mi) => {
                    const mid = String(m.id);
                    const isPaid = records[mid] && records[mid][dateStr] === true;
                    const exempt = isExempt(m.id, dateStr);
                    const bgColor = mi % 2 === 0 ? '#ffffff' : '#f8fafc';
                    let statusText, statusColor;
                    if (isPaid) { statusText = '✓ Lunas'; statusColor = '#10b981'; }
                    else if (exempt) { statusText = '— ' + exempt.reason; statusColor = '#8b5cf6'; }
                    else { statusText = '✗ Belum'; statusColor = '#ef4444'; }
                    html += `<tr style="background:${bgColor};">
                        <td style="padding:4px 8px; border-bottom:1px solid #f1f5f9; color:#64748b;">${mi + 1}</td>
                        <td style="padding:4px 8px; border-bottom:1px solid #f1f5f9; color:#1e293b;">${m.name}</td>
                        <td style="padding:4px 8px; border-bottom:1px solid #f1f5f9; text-align:center; font-weight:600; color:${statusColor};">${statusText}</td>
                    </tr>`;
                });

                html += `</tbody></table></div>`;
            });

            html += `</div>`;
        });
    }

    html += `
                </div>

                <!-- ====== TANDA TANGAN ====== -->
                <div style="${pageBreak} padding: 40px 50px; min-height: 297mm; box-sizing: border-box; display: flex; flex-direction: column;">
                    <div style="margin-bottom: 25px;">
                        <h2 style="${sectionTitle} border-left: 4px solid #8b5cf6; padding-left: 10px;">Lembar Pengesahan</h2>
                        <p style="${sectionSub} padding-left: 14px;">Laporan ini disahkan oleh pihak-pihak yang bertanggung jawab</p>
                    </div>

                    <div style="margin-top: 20px; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; color: #334155; line-height: 1.8;">
                        <p style="margin: 0;">Dengan ini kami menyatakan bahwa laporan keuangan kas kelas XII PPLG ini telah disusun berdasarkan data pencatatan digital yang tercatat dalam sistem manajemen kas kelas. Laporan ini mencakup seluruh pemasukan dan pengeluaran kas kelas sejak awal tahun ajaran 2025/2026 hingga ${formatDate(serverDate)}.</p>
                    </div>

                    <div style="display: flex; justify-content: space-between; margin-top: 80px; font-size: 12px; color: #334155;">
                        <div style="text-align: center; width: 180px;">
                            <p style="margin-bottom: 60px;">Mengetahui,<br><strong>Wali Kelas XII PPLG</strong></p>
                            <div style="border-top: 1px solid #475569; padding-top: 6px; font-weight: bold; color: #0e1018;">( I Ketut Restu Wiranata )</div>
                            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">NIP. ___________________</div>
                        </div>
                        <div style="text-align: center; width: 180px;">
                            <p style="margin-bottom: 60px;">Dibuat oleh,<br><strong>Bendahara Kelas</strong></p>
                            <div style="border-top: 1px solid #475569; padding-top: 6px; font-weight: bold; color: #0e1018;">( Gde Agus Wira D. P. )</div>
                            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Siswa XII PPLG</div>
                        </div>
                    </div>

                    <div style="margin-top: auto; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; font-size: 10px; color: #94a3b8; line-height: 1.4;">
                        Dokumen ini digenerasi secara elektronik oleh portal manajemen keuangan XII PPLG.<br>
                        Seluruh riwayat perubahan tersimpan dalam basis data sistem kas kelas.
                    </div>
                </div>

            </div>
        </div>
    </div>`;

    el.innerHTML = html;
}

window.exportReportToPDF = function () {
    window.print();
};


