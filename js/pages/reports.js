/* ======= Laporan PDF ======= */
Pages.reports = {
    title: 'Laporan PDF',
    subtitle: 'Pratinjau laporan keuangan, lalu cetak / simpan sebagai PDF',

    async render(el) {
        const [data, members, payments, donations, fines, expenses, config] = await Promise.all([
            API.getDashboard(), API.getMembers(), API.getPayments(),
            API.getDonations(), API.getFines(), API.getExpenses(), API.getConfig()
        ]);
        if (data.server_date) State.serverDate = data.server_date;
        State.members = members;

        const kas = data.kas_amount || 5000;
        const records = payments.records || {};
        const d = {
            members, records, donations, fines, expenses,
            kasIncome: sum(payments.dates || [], dt => members.filter(m => isPaid(records, m.id, dt)).length * kas),
            donationTotal: sum(donations),
            finePaid: sum(fines.filter(f => f.paid)),
            expenseTotal: sum(expenses),
            balance: data.total_balance || 0,
            real: config.real_balance || 0,
            paymentsCount: data.total_payments || 0,
            months: groupByMonth(payments.dates || [], true),
            period: fmtMonth(serverDate().slice(0, 7))
        };

        el.innerHTML = `<div class="stack">
            <div class="panel no-print"><div class="panel-body" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
                <span class="muted">Berisi cover, ringkasan, rincian sumber dana, transaksi terbaru, rekap per tanggal, dan lembar pengesahan.</span>
                <button class="btn btn-primary" onclick="window.print()">Cetak / Unduh PDF</button>
            </div></div>
            <div class="report-wrap"><div class="report" id="printable-report">
                ${this.cover(d)}${this.toc()}${this.summary(d)}${this.sources(d)}${this.recent(d)}${this.recap(d)}${this.signatures()}
            </div></div>
        </div>`;
    },

    cover: d => `<section class="cover">
        <div style="font-size:52px">💰</div>
        <div style="width:70px;height:4px;background:#2f6bff;border-radius:2px;margin:18px auto 28px"></div>
        <h1 style="font-size:30px;font-weight:800;letter-spacing:-1px">LAPORAN KEUANGAN</h1>
        <div style="font-size:18px;font-weight:700;color:#2f6bff;letter-spacing:2px;margin-top:4px">KAS KELAS XII PPLG</div>
        <p style="font-size:13px;color:#64748b;margin-top:14px">Periode: Januari – ${d.period}</p>
        <div style="margin-top:44px;padding:18px 40px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Saldo Kas Tercatat</div>
            <div style="font-size:26px;font-weight:800;color:#1e40af;margin-top:6px">${rp(d.balance)}</div>
        </div>
        <div style="margin-top:auto;padding-top:60px;color:#94a3b8;line-height:1.6">
            SMK NEGERI 2 KUTA SELATAN<br>
            Jl. Pura Pengulapan Desa Ungasan, Kecamatan Kuta Selatan, Kabupaten Badung, Provinsi Bali<br>
            Tahun Ajaran 2026/2027
        </div>
    </section>`,

    toc: () => `<section>
        <h1 style="font-size:20px;font-weight:800;border-bottom:3px solid #2f6bff;padding-bottom:12px">DAFTAR ISI</h1>
        <div class="toc" style="margin-top:24px">
            <div>Pasal I — Ringkasan Keuangan</div>
            <div>Pasal II — Rincian Sumber Keuangan</div>
            <div>Pasal III — Transaksi Terbaru</div>
            <div>Pasal IV — Rekap Pembayaran Kas</div>
        </div>
        <div class="note"><b>Catatan:</b> Laporan ini digenerate otomatis oleh sistem manajemen kas kelas XII PPLG berdasarkan pencatatan digital hingga ${fmtDate(serverDate())}. Rekonsiliasi dan verifikasi menjadi tanggung jawab bendahara dan wali kelas.</div>
    </section>`,

    summary(d) {
        const diff = d.real - d.balance;
        const card = (label, value, color) => `<div class="r-card"><span>${label}</span><div style="color:${color}">${value}</div></div>`;
        return `<section>
            <h2>Pasal I — Ringkasan Keuangan</h2><p>Ikhtisar kondisi keuangan kas kelas XII PPLG</p>
            <div class="r-cards">
                ${card('Total Pemasukan', rp(d.kasIncome + d.donationTotal + d.finePaid), '#15803d')}
                ${card('Total Pengeluaran', rp(d.expenseTotal), '#dc2626')}
                ${card('Saldo Bersih', rp(d.balance), '#1e40af')}
            </div>
            <h3>Verifikasi Saldo</h3>
            <div class="r-cards">
                ${card('Saldo Buku', rp(d.balance), '#1e293b')}
                ${card('Saldo Fisik', rp(d.real), '#1e293b')}
                ${card('Selisih', rpSigned(diff), diff === 0 ? '#64748b' : diff > 0 ? '#10b981' : '#ef4444')}
            </div>
        </section>`;
    },

    sources: d => `<section>
        <h2>Pasal II — Rincian Sumber Keuangan</h2><p>Uraian pemasukan dari kas, donasi, dan denda</p>
        <table>
            <thead><tr><th>Sumber</th><th style="text-align:right">Jumlah</th></tr></thead>
            <tbody>
                <tr><td>Pembayaran kas mingguan (${d.paymentsCount} transaksi)</td><td class="right">${rp(d.kasIncome)}</td></tr>
                <tr><td>Sumbangan donatur (${d.donations.length} donatur)</td><td class="right">${rp(d.donationTotal)}</td></tr>
                <tr><td>Denda terbayar (${d.fines.filter(f => f.paid).length} denda)</td><td class="right">${rp(d.finePaid)}</td></tr>
                <tr><td>Total pengeluaran (${d.expenses.length} nota)</td><td class="right" style="color:#ef4444">−${rp(d.expenseTotal)}</td></tr>
                <tr style="background:#f0f5ff;font-weight:800;color:#1e40af"><td>SALDO BERSIH</td><td class="right">${rp(d.balance)}</td></tr>
            </tbody>
        </table>
    </section>`,

    recent(d) {
        const list = (items, label, sign, color) => items.slice().sort(byDateDesc).slice(0, 7).map(x => `
            <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dashed #e2e8f0">
                <div><b>${esc(x[label])}</b><div style="color:#64748b;font-size:9px">${fmtDate(x.date)}</div></div>
                <b style="color:${color}">${sign}${rp(x.amount)}</b>
            </div>`).join('') || '<div style="color:#64748b;padding:10px 0">Tidak ada data</div>';
        return `<section>
            <h2>Pasal III — Transaksi Terbaru</h2><p>Pengeluaran dan donasi terakhir</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px">
                <div><h3 style="margin-top:0">Pengeluaran</h3>${list(d.expenses, 'description', '−', '#ef4444')}</div>
                <div><h3 style="margin-top:0">Donatur</h3>${list(d.donations, 'name', '+', '#10b981')}</div>
            </div>
        </section>`;
    },

    recap(d) {
        const months = Object.keys(d.months).sort();
        const body = !months.length ? '<p style="color:#64748b">Belum ada data pembayaran.</p>' : months.map(ym => `
            <h3 style="background:#f1f5f9;padding:8px 12px;border-radius:6px;border-left:4px solid #2f6bff">${fmtMonth(ym)}</h3>
            ${d.months[ym].map(dt => {
                const done = d.members.filter(m => isPaid(d.records, m.id, dt) || isExempt(m.id, dt)).length;
                return `<div style="margin:10px 0 14px">
                    <b>${fmtDate(dt)}</b> <span style="color:${done === d.members.length ? '#10b981' : '#ef4444'}">(${done}/${d.members.length} lunas)</span>
                    <table style="font-size:10px;margin-top:4px"><thead><tr><th style="width:30px">No</th><th>Nama Siswa</th><th style="width:80px;text-align:center">Status</th></tr></thead><tbody>
                    ${d.members.map((m, i) => {
                        const ex = isExempt(m.id, dt), paid = isPaid(d.records, m.id, dt);
                        const [txt, col] = paid ? ['✓ Lunas', '#10b981'] : ex ? ['— ' + ex.reason, '#8b5cf6'] : ['✗ Belum', '#ef4444'];
                        return `<tr><td>${i + 1}</td><td>${esc(m.name)}</td><td style="text-align:center;font-weight:600;color:${col}">${txt}</td></tr>`;
                    }).join('')}
                    </tbody></table></div>`;
            }).join('')}`).join('');
        return `<section><h2>Pasal IV — Rekap Pembayaran Kas</h2><p>Status pembayaran per tanggal hingga ${d.period}</p>${body}</section>`;
    },

    signatures: () => `<section style="min-height:297mm;display:flex;flex-direction:column">
        <h2>Lembar Pengesahan</h2><p>Laporan ini disahkan oleh pihak-pihak yang bertanggung jawab</p>
        <div style="padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;line-height:1.8">
            Dengan ini kami menyatakan bahwa laporan keuangan kas kelas XII PPLG ini disusun berdasarkan data pencatatan digital dalam sistem manajemen kas kelas, mencakup seluruh pemasukan dan pengeluaran hingga ${fmtDate(serverDate())}.
        </div>
        <div class="signs">
            <div><p>Mengetahui,<br><strong>Wali Kelas XII PPLG</strong></p><b>( I Ketut Restu Wiranata )</b><div style="font-size:10px;color:#64748b">NIP. ___________________</div></div>
            <div><p>Dibuat oleh,<br><strong>Bendahara Kelas</strong></p><b>( Gde Agus Wira D. P. )</b><div style="font-size:10px;color:#64748b">Siswa XII PPLG</div></div>
        </div>
        <div style="margin-top:auto;border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;font-size:10px;color:#94a3b8">
            Dokumen ini digenerasi secara elektronik oleh portal manajemen keuangan XII PPLG.
        </div>
    </section>`
};
