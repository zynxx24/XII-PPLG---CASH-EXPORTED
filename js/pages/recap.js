/* ======= Rekap Tunggakan ======= */
Pages.recap = {
    title: 'Rekap Tunggakan',
    subtitle: 'Siswa yang belum lunas per bulan · denda Rp5.000/bulan mulai bulan ke-2',

    async render(el) {
        await syncAutoFines();
        const [payments, members, config] = await Promise.all([API.getPayments(), API.getMembers(), API.getConfig()]);
        State.members = members;

        const months = buildRecap(payments, members, config.kas_amount || 5000);
        if (!months.length) {
            el.innerHTML = ui.empty('📊', 'Belum ada bulan yang bisa direkap');
            return;
        }

        const debt = sum(months, m => m.debt), fine = sum(months, m => m.fine);
        const clean = months.filter(m => !m.unpaid.length).length;

        el.innerHTML = `<div class="stack">
            <div class="stats">
                ${ui.stat('Tunggakan', rp(debt), 'kas belum dibayar', 'tone-warn', '📉')}
                ${ui.stat('Denda', rp(fine), 'Rp5.000/bulan', 'tone-bad', '⏰')}
                ${ui.stat('Total harus dibayar', rp(debt + fine), 'tunggakan + denda', 'tone-purple', '💰')}
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
            : `<div class="month-bar"><span class="muted">Tunggakan ${rp(m.debt)} + denda ${rp(m.fine)}</span><button class="btn btn-sm" onclick="copyText(Pages.recap.msgs['${m.ym}'], 'Daftar disalin — tempel di grup WA')">📋 Salin WA</button></div>` + ui.list(m.unpaid.map(u => ui.row({
                lead: avatar(u.name, u.id),
                title: nameLink(u.id, u.name),
                meta: `${u.missed.length} minggu (${u.missed.map(fmtDateShort).join(', ')}) · tunggakan ${rp(u.debt)}${u.fine ? ` + denda ${rp(u.fine)}` : ''}`,
                amount: rp(u.total),
                amountClass: 'bad'
            })), 10);

        return `<details class="month" ${open && !ok ? 'open' : ''}>${summary}${body}</details>`;
    }
};
