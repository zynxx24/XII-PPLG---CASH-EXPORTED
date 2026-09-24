/*
 * XII PPLG Cash Management - Dashboard Page
 */

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
