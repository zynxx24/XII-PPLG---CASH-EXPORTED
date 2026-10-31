/* ======= Laporan PDF =======
 * Dua mode:
 *  - Semua periode : arus kas per bulan + matriks siswa × bulan
 *  - Per bulan     : ringkasan bulan itu + centang per tanggal + transaksi bulan itu
 */
Pages.reports = {
    title: 'Laporan PDF',
    subtitle: 'Pilih periode, cek pratinjau, lalu cetak / simpan sebagai PDF',
    period: 'all',

    async render(el) {
        const [data, members, payments, donations, expenses, config] = await Promise.all([
            API.getDashboard(), API.getMembers(), API.getPayments(),
            API.getDonations(), API.getExpenses(), API.getConfig()
        ]);
        if (data.server_date) State.serverDate = data.server_date;
        State.members = members;

        const kas = data.kas_amount || 5000;
        const records = payments.records || {};
        const dates = (payments.dates || []).filter(d => d <= serverDate());
        const ledger = buildLedger({ payments: { ...payments, dates }, members, donations, expenses, kasAmount: kas });
        const start = data.previous_balance || 0;

        // Semua bulan yang punya aktivitas
        const monthKeys = [...new Set([...dates, ...ledger.map(t => t.date)].map(d => d.slice(0, 7)))].sort();
        let running = start;
        const months = monthKeys.map(ym => {
            const tx = ledger.filter(t => t.date.startsWith(ym));
            const kasIn = sum(tx.filter(t => t.kind === 'kas'));
            const donIn = sum(tx.filter(t => t.kind === 'donasi'));
            const out = -sum(tx.filter(t => t.kind === 'keluar'));
            const open = running;
            running += kasIn + donIn - out;
            return { ym, kasIn, donIn, out, open, close: running, dates: dates.filter(d => d.startsWith(ym)) };
        });
        if (this.period !== 'all' && !monthKeys.includes(this.period)) this.period = 'all';

        const ctx = {
            kas, records, members, donations, expenses, ledger, months, dates, start,
            balance: data.total_balance || 0,
            real: config.real_balance || 0,
            year: config.year || '2026/2027',
            className: config.class_name || 'XII PPLG'
        };
        this.series = balanceSeries(ledger, start);

        const options = [['all', 'Seluruh periode'], ...monthKeys.slice().reverse().map(ym => [ym, fmtMonth(ym)])]
            .map(([v, l]) => `<option value="${v}" ${v === this.period ? 'selected' : ''}>${l}</option>`).join('');

        const pages = this.period === 'all'
            ? [this.cover(ctx, 'Seluruh Periode', `${fmtMonth(monthKeys[0] || serverDate().slice(0, 7))} – ${fmtMonth(serverDate().slice(0, 7))}`, ctx.balance),
               this.summaryAll(ctx), this.flowTable(ctx), this.matrix(ctx), this.debtors(ctx), this.txList(ctx, ctx.ledger), this.signatures(ctx)]
            : this.monthPages(ctx, months.find(m => m.ym === this.period));

        el.innerHTML = `<div class="stack">
            <div class="panel no-print"><div class="panel-body report-bar">
                <div>
                    <label class="muted" style="font-size:12px">Periode laporan</label>
                    <select class="input" style="width:220px;display:block;margin-top:4px" onchange="Pages.reports.period=this.value;renderPage('reports')">${options}</select>
                </div>
                <div class="muted" style="flex:1;font-size:12px">${this.period === 'all'
                    ? 'Berisi ringkasan, arus kas per bulan, rekap pembayaran tiap siswa per bulan, daftar tunggakan, semua transaksi, dan lembar pengesahan.'
                    : 'Laporan bulanan: ringkasan bulan ini, centang kas per tanggal, transaksi bulan ini, dan lembar pengesahan.'}</div>
                <button class="btn btn-primary" onclick="window.print()">🖨️ Cetak / Simpan PDF</button>
            </div></div>
            <div class="report-wrap"><div class="report" id="printable-report">${pages.join('')}</div></div>
        </div>`;
    },

    mounted() {
        const c = document.getElementById('report-chart');
        if (c) drawLineChart(c, this.series);
    },

    /* ---------- Bagian-bagian laporan ---------- */
    head: (ctx, title) => `<div class="r-head"><span>Laporan Kas Kelas ${esc(ctx.className)}</span><span>${title}</span></div>`,

    cover: (ctx, label, range, balance) => `<section class="cover">
        <img src="asset/webp/PPLG-LOGO.webp" alt="" style="width:110px;height:110px;object-fit:contain">
        <div style="width:70px;height:4px;background:linear-gradient(90deg,#2f6bff,#8b5cf6);border-radius:2px;margin:26px auto"></div>
        <h1 style="font-size:30px;font-weight:800;letter-spacing:-1px">LAPORAN KEUANGAN</h1>
        <div style="font-size:18px;font-weight:700;color:#2f6bff;letter-spacing:2px;margin-top:4px">KAS KELAS ${esc(ctx.className)}</div>
        <p style="font-size:13px;color:#64748b;margin-top:14px">${label} · ${range}</p>
        <div style="margin-top:40px;padding:18px 40px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Saldo Kas</div>
            <div style="font-size:26px;font-weight:800;color:#1e40af;margin-top:6px">${rp(balance)}</div>
        </div>
        <div style="margin-top:auto;padding-top:60px;color:#94a3b8;line-height:1.6">
            SMK NEGERI 2 KUTA SELATAN<br>
            Jl. Pura Pengulapan Desa Ungasan, Kecamatan Kuta Selatan, Kabupaten Badung, Provinsi Bali<br>
            Tahun Ajaran ${esc(ctx.year)} · dicetak ${fmtDate(serverDate())}
        </div>
    </section>`,

    cards: items => `<div class="r-cards" style="grid-template-columns:repeat(${items.length},1fr)">${items.map(([l, v, c]) => `<div class="r-card"><span>${l}</span><div style="color:${c}">${v}</div></div>`).join('')}</div>`,

    summaryAll(ctx) {
        const kasIn = sum(ctx.months, m => m.kasIn), donIn = sum(ctx.months, m => m.donIn), out = sum(ctx.months, m => m.out);
        const diff = ctx.real - ctx.balance;
        const totalSlots = ctx.dates.length * ctx.members.length;
        const paidSlots = sum(ctx.dates, d => ctx.members.filter(m => isPaid(ctx.records, m.id, d) || isExempt(m.id, d)).length);
        return `<section>${this.head(ctx, 'Ringkasan')}
            <h2>I. Ringkasan Keuangan</h2><p>Kondisi kas kelas hingga ${fmtDate(serverDate())}</p>
            ${this.cards([['Saldo awal', rp(ctx.start), '#1e293b'], ['Total pemasukan', rp(kasIn + donIn), '#15803d'], ['Total pengeluaran', rp(out), '#dc2626'], ['Saldo akhir', rp(ctx.balance), '#1e40af']])}
            <table>
                <thead><tr><th>Sumber</th><th class="right">Jumlah</th></tr></thead>
                <tbody>
                    <tr><td>Saldo awal / sisa kas sebelumnya</td><td class="right">${rp(ctx.start)}</td></tr>
                    <tr><td>Kas mingguan (${kasIn / ctx.kas} pembayaran @ ${rp(ctx.kas)})</td><td class="right" style="color:#15803d">+${rp(kasIn)}</td></tr>
                    <tr><td>Donasi (${ctx.donations.length} donatur)</td><td class="right" style="color:#15803d">+${rp(donIn)}</td></tr>
                    <tr><td>Pengeluaran (${ctx.expenses.length} nota)</td><td class="right" style="color:#dc2626">−${rp(out)}</td></tr>
                    <tr class="r-total"><td>SALDO AKHIR (BUKU)</td><td class="right">${rp(ctx.balance)}</td></tr>
                    <tr><td>Saldo fisik di peti kas</td><td class="right">${rp(ctx.real)}</td></tr>
                    <tr><td>Selisih fisik − buku</td><td class="right" style="color:${diff === 0 ? '#64748b' : diff > 0 ? '#15803d' : '#dc2626'}">${diff === 0 ? 'Sesuai ✓' : rpSigned(diff)}</td></tr>
                </tbody>
            </table>
            <h3>Kepatuhan bayar kas</h3>
            <div class="r-progress"><span style="width:${totalSlots ? Math.round(paidSlots / totalSlots * 100) : 0}%"></span></div>
            <p style="margin:6px 0 0;color:#64748b">${paidSlots} dari ${totalSlots} pembayaran mingguan sudah lunas (${totalSlots ? Math.round(paidSlots / totalSlots * 100) : 0}%).</p>
        </section>`;
    },

    flowTable(ctx) {
        return `<section>${this.head(ctx, 'Arus kas')}
            <h2>II. Arus Kas per Bulan</h2><p>Pemasukan, pengeluaran, dan saldo di akhir setiap bulan</p>
            <table>
                <thead><tr><th>Bulan</th><th class="right">Saldo awal</th><th class="right">Kas</th><th class="right">Donasi</th><th class="right">Pengeluaran</th><th class="right">Saldo akhir</th></tr></thead>
                <tbody>${ctx.months.map(m => `<tr>
                    <td><b>${fmtMonth(m.ym)}</b></td>
                    <td class="right">${rp(m.open)}</td>
                    <td class="right" style="color:#15803d">${m.kasIn ? '+' + rp(m.kasIn) : '-'}</td>
                    <td class="right" style="color:#15803d">${m.donIn ? '+' + rp(m.donIn) : '-'}</td>
                    <td class="right" style="color:#dc2626">${m.out ? '−' + rp(m.out) : '-'}</td>
                    <td class="right"><b>${rp(m.close)}</b></td></tr>`).join('')}
                    <tr class="r-total"><td>TOTAL</td><td class="right">${rp(ctx.start)}</td>
                        <td class="right">+${rp(sum(ctx.months, m => m.kasIn))}</td><td class="right">+${rp(sum(ctx.months, m => m.donIn))}</td>
                        <td class="right">−${rp(sum(ctx.months, m => m.out))}</td><td class="right">${rp(ctx.balance)}</td></tr>
                </tbody>
            </table>
            <h3 style="margin-top:28px">Grafik perkembangan saldo</h3>
            <canvas id="report-chart" style="width:100%;height:230px;display:block"></canvas>
        </section>`;
    },

    /* Siswa × bulan: berapa minggu lunas dari total minggu */
    matrix(ctx) {
        const months = ctx.months.filter(m => m.dates.length);
        const rows = ctx.members.map((m, i) => {
            let paid = 0, missed = 0;
            const cells = months.map(mo => {
                const ok = mo.dates.filter(d => isPaid(ctx.records, m.id, d) || isExempt(m.id, d)).length;
                paid += mo.dates.filter(d => isPaid(ctx.records, m.id, d)).length;
                missed += mo.dates.length - ok;
                return `<td class="center ${ok === mo.dates.length ? 'c-ok' : ok === 0 ? 'c-no' : 'c-part'}">${ok}/${mo.dates.length}</td>`;
            }).join('');
            return `<tr><td>${i + 1}</td><td class="r-name">${esc(m.name)}</td>${cells}<td class="right">${rp(paid * ctx.kas)}</td><td class="right" style="color:${missed ? '#dc2626' : '#15803d'}">${missed ? rp(missed * ctx.kas) : 'Lunas'}</td></tr>`;
        }).join('');
        return `<section>${this.head(ctx, 'Rekap siswa')}
            <h2>III. Rekap Pembayaran per Siswa</h2><p>Jumlah minggu lunas / total minggu di tiap bulan (dispensasi BI/PKL dihitung lunas)</p>
            <table class="r-matrix">
                <thead><tr><th>No</th><th>Nama siswa</th>${months.map(mo => `<th class="center">${MONTHS_SHORT[parseInt(mo.ym.slice(5)) - 1]}</th>`).join('')}<th class="right">Dibayar</th><th class="right">Tunggakan</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="r-legend"><i class="c-ok"></i> lunas semua <i class="c-part"></i> sebagian <i class="c-no"></i> belum sama sekali</p>
        </section>`;
    },

    debtors(ctx) {
        const list = ctx.members.map(m => {
            const missed = ctx.dates.filter(d => !isPaid(ctx.records, m.id, d) && !isExempt(m.id, d));
            return { m, missed };
        }).filter(x => x.missed.length).sort((a, b) => b.missed.length - a.missed.length);
        return `<section>${this.head(ctx, 'Tunggakan')}
            <h2>IV. Daftar Tunggakan</h2><p>Siswa dengan minggu belum dibayar hingga ${fmtDate(serverDate())} (termasuk bulan berjalan)</p>
            ${list.length ? `<table class="r-compact">
                <thead><tr><th>No</th><th>Nama siswa</th><th class="center">Minggu</th><th>Bulan tertunggak</th><th class="right">Jumlah</th></tr></thead>
                <tbody>${list.map((x, i) => `<tr><td>${i + 1}</td><td class="r-name">${esc(x.m.name)}</td><td class="center">${x.missed.length}</td>
                    <td style="color:#64748b">${[...new Set(x.missed.map(d => MONTHS_SHORT[parseInt(d.slice(5, 7)) - 1]))].join(', ')}</td>
                    <td class="right" style="color:#dc2626">${rp(x.missed.length * ctx.kas)}</td></tr>`).join('')}
                <tr class="r-total"><td colspan="4">TOTAL TUNGGAKAN (${list.length} siswa)</td><td class="right">${rp(sum(list, x => x.missed.length * ctx.kas))}</td></tr>
                </tbody></table>` : '<p style="color:#15803d;font-weight:700">Semua siswa sudah lunas. 🎉</p>'}
        </section>`;
    },

    /* Semua transaksi non-kas (donasi & pengeluaran) + total kas per bulan */
    txList(ctx, ledger) {
        return `<section>${this.head(ctx, 'Transaksi')}
            <h2>V. Rincian Transaksi</h2><p>Seluruh donasi dan pengeluaran, urut tanggal</p>
            ${this.txTable(ledger)}
        </section>`;
    },

    txTable(ledger) {
        const tx = ledger.filter(t => t.kind !== 'kas');
        return `${tx.length ? `<table>
                <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Jenis</th><th class="right">Masuk</th><th class="right">Keluar</th></tr></thead>
                <tbody>${tx.map(t => `<tr><td style="white-space:nowrap">${fmtDate(t.date)}</td><td>${esc(t.label.replace('Donasi · ', ''))}</td>
                    <td>${t.kind === 'donasi' ? 'Donasi' : 'Pengeluaran'}</td>
                    <td class="right" style="color:#15803d">${t.amount > 0 ? rp(t.amount) : ''}</td>
                    <td class="right" style="color:#dc2626">${t.amount < 0 ? rp(-t.amount) : ''}</td></tr>`).join('')}
                <tr class="r-total"><td colspan="3">TOTAL</td><td class="right">${rp(sum(tx.filter(t => t.amount > 0)))}</td><td class="right">${rp(-sum(tx.filter(t => t.amount < 0)))}</td></tr>
                </tbody></table>` : '<p style="color:#64748b">Tidak ada donasi atau pengeluaran.</p>'}`;
    },

    /* ---------- Laporan bulanan ---------- */
    monthPages(ctx, mo) {
        const label = fmtMonth(mo.ym);
        const rows = ctx.members.map((m, i) => {
            let n = 0;
            const cells = mo.dates.map(d => {
                const ex = isExempt(m.id, d), ok = isPaid(ctx.records, m.id, d);
                if (ok) n++;
                return `<td class="center ${ok ? 'c-ok' : ex ? 'c-ex' : 'c-no'}">${ok ? '✓' : ex ? '—' : '✗'}</td>`;
            }).join('');
            return `<tr><td>${i + 1}</td><td class="r-name">${esc(m.name)}</td>${cells}<td class="right">${rp(n * ctx.kas)}</td></tr>`;
        }).join('');
        const perDate = mo.dates.map(d => ctx.members.filter(m => isPaid(ctx.records, m.id, d)).length);

        return [
            this.cover(ctx, 'Laporan Bulanan', label, mo.close),
            `<section>${this.head(ctx, label)}
                <h2>I. Ringkasan ${label}</h2><p>Perubahan saldo kas selama bulan ${label}</p>
                ${this.cards([['Saldo awal bulan', rp(mo.open), '#1e293b'], ['Pemasukan', rp(mo.kasIn + mo.donIn), '#15803d'], ['Pengeluaran', rp(mo.out), '#dc2626'], ['Saldo akhir bulan', rp(mo.close), '#1e40af']])}
                <table><tbody>
                    <tr><td>Kas mingguan (${mo.dates.length} minggu)</td><td class="right" style="color:#15803d">+${rp(mo.kasIn)}</td></tr>
                    <tr><td>Donasi</td><td class="right" style="color:#15803d">+${rp(mo.donIn)}</td></tr>
                    <tr><td>Pengeluaran</td><td class="right" style="color:#dc2626">−${rp(mo.out)}</td></tr>
                    <tr class="r-total"><td>Perubahan saldo</td><td class="right">${rpSigned(mo.kasIn + mo.donIn - mo.out)}</td></tr>
                </tbody></table>
                <h3 style="margin-top:28px">Donasi & pengeluaran ${label}</h3>
                ${this.txTable(ctx.ledger.filter(t => t.date.startsWith(mo.ym)))}
            </section>`,
            mo.dates.length ? `<section>${this.head(ctx, label)}
                <h2>II. Pembayaran Kas ${label}</h2><p>✓ lunas · ✗ belum · — dispensasi (BI/PKL)</p>
                <table class="r-matrix">
                    <thead><tr><th>No</th><th>Nama siswa</th>${mo.dates.map(d => `<th class="center">${fmtDateShort(d)}</th>`).join('')}<th class="right">Jumlah</th></tr></thead>
                    <tbody>${rows}
                        <tr class="r-total"><td colspan="2">Siswa bayar</td>${perDate.map(n => `<td class="center">${n}</td>`).join('')}<td class="right">${rp(mo.kasIn)}</td></tr>
                    </tbody>
                </table>
            </section>` : '',
            this.signatures(ctx)
        ];
    },

    signatures: ctx => `<section>
        <h2>Lembar Pengesahan</h2><p>Laporan ini disahkan oleh pihak-pihak yang bertanggung jawab</p>
        <div style="padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;line-height:1.8">
            Dengan ini kami menyatakan bahwa laporan keuangan kas kelas ${esc(ctx.className)} ini disusun berdasarkan data pencatatan digital dalam sistem manajemen kas kelas, mencakup seluruh pemasukan dan pengeluaran hingga ${fmtDate(serverDate())}.
        </div>
        <p style="text-align:right;margin:40px 0 0;font-size:12px;color:#1e293b">Kuta Selatan, ${fmtDate(serverDate())}</p>
        <div class="signs" style="margin-top:20px">
            <div><p>Mengetahui,<br><strong>Wali Kelas ${esc(ctx.className)}</strong></p><b>( I Ketut Restu Wiranata )</b><div style="font-size:10px;color:#64748b">NIP. ___________________</div></div>
            <div><p>Dibuat oleh,<br><strong>Bendahara Kelas</strong></p><b>( Gde Agus Wira D. P. )</b><div style="font-size:10px;color:#64748b">Siswa ${esc(ctx.className)}</div></div>
        </div>
        <div style="margin-top:60px;border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;font-size:10px;color:#94a3b8">
            Dokumen ini digenerasi secara elektronik oleh portal manajemen keuangan ${esc(ctx.className)}.
        </div>
    </section>`
};
