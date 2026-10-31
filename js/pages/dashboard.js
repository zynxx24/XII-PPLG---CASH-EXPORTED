/* ======= Dashboard ======= */
Pages.dashboard = {
    title: 'Dashboard',
    subtitle: 'Ringkasan kas kelas XII PPLG',

    async render(el) {
        const [data, members, payments, donations, fines, expenses, config] = await Promise.all([
            API.getDashboard(), API.getMembers(), API.getPayments(),
            API.getDonations(), API.getFines(), API.getExpenses(), API.getConfig()
        ]);
        if (data.server_date) State.serverDate = data.server_date;
        State.members = members;

        const kas = data.kas_amount || 5000;
        const real = config.real_balance || 0;
        const diff = real - data.total_balance;
        const ledger = buildLedger({ payments, members, donations, fines, expenses, kasAmount: kas });
        this.series = balanceSeries(ledger, data.previous_balance || 0);

        const month = serverDate().slice(0, 7);
        const thisMonth = ledger.filter(t => t.date.startsWith(month));
        const inMonth = sum(thisMonth.filter(t => t.amount > 0));
        const outMonth = -sum(thisMonth.filter(t => t.amount < 0));

        el.innerHTML = `
        <div class="stack">
            <div class="hero-grid">
                <div class="hero">
                    <div class="hero-label">Saldo kas saat ini</div>
                    <div class="hero-value num">${rp(data.total_balance)}</div>
                    <div class="hero-meta">
                        <div><span>Bulan ini masuk</span><b class="num">+${rp(inMonth)}</b></div>
                        <div><span>Bulan ini keluar</span><b class="num">−${rp(outMonth)}</b></div>
                        <div><span>Saldo fisik</span><b class="num">${rp(real)}${diff ? ` <small>(${rpSigned(diff)})</small>` : ' ✓'}</b></div>
                    </div>
                </div>
                ${this.lookup(members)}
            </div>

            <div class="stats">
                ${ui.stat('Pemasukan kas', rp(data.total_kas_income), `${data.total_payments}× bayar @ ${rp(kas)}`, 'tone-ok', '💳')}
                ${ui.stat('Donasi', rp(data.total_donation_amount), `${data.total_donation_count} donatur`, 'tone-purple', '🎁')}
                ${ui.stat('Pengeluaran', rp(data.total_expense_amount), `${data.total_expense_count} nota`, 'tone-warn', '🧾')}
                ${ui.stat('Denda belum bayar', rp(data.unpaid_fine_amount), `${fines.filter(f => !f.paid).length} denda aktif`, 'tone-bad', '⏰')}
            </div>

            <div class="cols">
                ${ui.panel('Perkembangan saldo', '<div class="panel-body"><canvas class="chart" id="balance-chart"></canvas></div>')}
                ${this.latestPanel(payments, members)}
            </div>

            <div class="cols cols-even">
                ${this.recentPanel(ledger)}
                ${this.debtorsPanel(payments, members, kas)}
            </div>
        </div>`;
    },

    mounted() {
        const draw = () => drawLineChart(document.getElementById('balance-chart'), this.series);
        draw();
        window.onresize = () => currentPage === 'dashboard' && draw();
    },

    /* Cek kas saya: siswa cari namanya sendiri */
    lookup(members) {
        return `<div class="lookup">
            <div class="lookup-title">🔎 Cek kas kamu</div>
            <p>Ketik nama untuk melihat status pembayaran, tunggakan, dan denda.</p>
            <input class="input" list="member-list" id="lookup-input" placeholder="Ketik nama…" oninput="Pages.dashboard.pick(this.value)">
            <datalist id="member-list">${members.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist>
        </div>`;
    },

    pick(value) {
        const m = State.members.find(x => x.name.toLowerCase() === value.trim().toLowerCase());
        if (m) { document.getElementById('lookup-input').value = ''; Member.open(m.id); }
    },

    /* Kas periode terbaru: progress + siapa yang belum bayar */
    latestPanel(payments, members) {
        const dates = payments.dates || [];
        if (!dates.length) return ui.panel('Kas minggu ini', ui.empty('📭', 'Belum ada tanggal kas'));

        const d = latestDate(dates);
        const records = payments.records || {};
        const unpaid = members.filter(m => !isPaid(records, m.id, d) && !isExempt(m.id, d));
        const done = members.length - unpaid.length;
        this.reminder = reminderText(`Belum bayar kas ${fmtDate(d)}`, unpaid);

        const body = `<div class="panel-body">
            ${ui.progress(done, members.length, fmtDate(d))}
            <div style="margin-top:16px">
                ${unpaid.length
                    ? `<div class="row-meta" style="margin-bottom:8px">Belum bayar (${unpaid.length})</div>
                       <div class="chips">${unpaid.slice(0, 8).map(m => `<a class="chip bad" data-search onclick="Member.open(${m.id})">${esc(m.name)}</a>`).join('')}${unpaid.length > 8 ? `<a class="chip" onclick="navigateTo('payments')">+${unpaid.length - 8} lainnya</a>` : ''}</div>`
                    : '<div class="ok" style="font-weight:600">🎉 Semua sudah bayar</div>'}
            </div>
        </div>`;
        return ui.panel('Kas minggu ini', body, {
            actions: (unpaid.length ? `<button class="btn btn-sm" onclick="copyText(Pages.dashboard.reminder, 'Daftar disalin — tempel di grup WA')">📋 Salin WA</button>` : '')
                + `<button class="btn btn-sm" onclick="navigateTo('payments')">Buka</button>`
        });
    },

    recentPanel(ledger) {
        const icons = { kas: '💳', donasi: '🎁', denda: '⏰', keluar: '🧾' };
        const rows = ledger.slice().reverse().slice(0, 6).map(t => `<li class="row">
            <span class="tx-icon ${t.amount < 0 ? 'out' : 'in'}">${icons[t.kind]}</span>
            <div class="row-main"><div class="row-title">${esc(t.label)}</div><div class="row-meta">${fmtDate(t.date)}</div></div>
            <div class="row-amount num ${t.amount < 0 ? 'bad' : 'ok'}">${t.amount < 0 ? '−' : '+'}${rp(Math.abs(t.amount))}</div>
        </li>`);
        return ui.panel('Transaksi terbaru', rows.length ? `<ul class="list">${rows.join('')}</ul>` : ui.empty('📭', 'Belum ada transaksi'));
    },

    /* Siswa dengan tunggakan terbesar (bulan-bulan yang sudah lewat) */
    debtorsPanel(payments, members, kas) {
        const totals = {};
        buildRecap(payments, members, kas).forEach(mo => mo.unpaid.forEach(u => {
            const t = totals[u.id] = totals[u.id] || { id: u.id, name: u.name, weeks: 0, total: 0 };
            t.weeks += u.missed.length;
            t.total += u.total;
        }));
        const top = Object.values(totals).sort((a, b) => b.total - a.total);
        this.debtReminder = reminderText('Tunggakan kas XII PPLG (termasuk denda)', top.map(t => ({ name: t.name, amount: t.total })));

        const max = top.length ? top[0].total : 1;
        const rows = top.slice(0, 6).map(t => `<li class="row clickable" onclick="Member.open(${t.id})">
            ${avatar(t.name, t.id)}
            <div class="row-main"><div class="row-title">${esc(t.name)}</div>
                <div class="bar"><span style="width:${Math.round(t.total / max * 100)}%"></span></div></div>
            <div class="row-amount num bad">${rp(t.total)}</div>
        </li>`);
        return ui.panel('Tunggakan terbesar', rows.length ? `<ul class="list">${rows.join('')}</ul>` : ui.empty('🎉', 'Tidak ada tunggakan'), {
            meta: top.length ? `${top.length} siswa` : '',
            actions: top.length ? `<button class="btn btn-sm" onclick="copyText(Pages.dashboard.debtReminder, 'Daftar tunggakan disalin')">📋 Salin WA</button><button class="btn btn-sm" onclick="navigateTo('recap')">Semua</button>` : ''
        });
    }
};
