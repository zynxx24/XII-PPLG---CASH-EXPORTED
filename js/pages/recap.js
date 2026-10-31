/* ======= Rekap Tunggakan ======= */
Pages.recap = {
    title: 'Rekap Tunggakan',
    subtitle: 'Siswa yang belum lunas kas per bulan',

    async render(el) {
        const [payments, members, config] = await Promise.all([API.getPayments(), API.getMembers(), API.getConfig()]);
        State.members = members;

        const months = buildRecap(payments, members, config.kas_amount || 5000);
        if (!months.length) {
            el.innerHTML = ui.empty('📊', 'Belum ada bulan yang bisa direkap');
            return;
        }

        const debt = sum(months, m => m.debt);
        const owing = new Set(months.flatMap(m => m.unpaid.map(u => u.id))).size;
        const clean = months.filter(m => !m.unpaid.length).length;

        el.innerHTML = `<div class="stack">
            <div class="stats">
                ${ui.stat('Tunggakan', rp(debt), 'kas belum dibayar', 'tone-warn', '📉')}
                ${ui.stat('Siswa menunggak', `${owing}/${members.length}`, 'punya minggu belum bayar', 'tone-bad', '👥')}
                ${ui.stat('Bulan lunas', `${clean}/${months.length}`, 'semua siswa bayar', 'tone-ok', '✅')}
            </div>
            <div>${months.map((m, i) => this.month(m, i === 0)).join('')}</div>
        </div>`;
    },

    month(m, open) {
        const ok = !m.unpaid.length;
        const summary = `<summary>
            <div class="month-title">${fmtMonth(m.ym)}<small>${m.dates.length} minggu · ${ok ? 'semua lunas' : `${m.unpaid.length} siswa belum lunas`}</small></div>
            ${ok ? '<span class="badge ok">Lunas</span>' : `<span class="num bad" style="font-weight:600">${rp(m.total)}</span>`}
        </summary>`;

        (this.msgs = this.msgs || {})[m.ym] = reminderText(`Tunggakan kas ${fmtMonth(m.ym)}`, m.unpaid.map(u => ({ name: u.name, amount: u.total })));
        const body = ok
            ? ui.empty('✅', 'Semua siswa sudah bayar bulan ini')
            : `<div class="month-bar"><span class="muted">Total tunggakan ${rp(m.debt)}</span><button class="btn btn-sm" onclick="copyText(Pages.recap.msgs['${m.ym}'], 'Daftar disalin — tempel di grup WA')">📋 Salin WA</button></div>` + ui.list(m.unpaid.map(u => ui.row({
                lead: avatar(u.name, u.id),
                title: nameLink(u.id, u.name),
                meta: `${u.missed.length} minggu (${u.missed.map(fmtDateShort).join(', ')})`,
                amount: rp(u.total),
                amountClass: 'bad'
            })), 10);

        return `<details class="month" ${open && !ok ? 'open' : ''}>${summary}${body}</details>`;
    }
};
