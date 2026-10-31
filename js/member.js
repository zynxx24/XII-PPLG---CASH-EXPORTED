/* ======= Detail siswa (modal) =======
 * Dipanggil dari mana saja lewat Member.open(id) — cek kas pribadi tiap siswa.
 */
const Member = {
    async open(id) {
        const [payments, members, fines, config] = await Promise.all([API.getPayments(), API.getMembers(), API.getFines(), API.getConfig()]);
        State.members = members;
        const m = members.find(x => x.id === id);
        if (!m) return;

        const kas = config.kas_amount || 5000;
        const records = payments.records || {};
        const dates = (payments.dates || []).filter(d => d <= serverDate());
        const paid = dates.filter(d => isPaid(records, id, d));
        const missed = dates.filter(d => !isPaid(records, id, d) && !isExempt(id, d));
        const myFines = fines.filter(f => f.member_id === id);
        const unpaidFines = myFines.filter(f => !f.paid);
        const owed = missed.length * kas + sum(unpaidFines);

        // Kalender titik per bulan
        const months = {};
        dates.forEach(d => (months[d.slice(0, 7)] = months[d.slice(0, 7)] || []).push(d));
        const calendar = Object.keys(months).sort().reverse().map(ym => `
            <div class="cal-row">
                <span class="cal-month">${MONTHS_SHORT[parseInt(ym.slice(5)) - 1]} ${ym.slice(2, 4)}</span>
                <span class="cal-dots">${months[ym].map(d => {
                    const ex = isExempt(id, d), ok = isPaid(records, id, d);
                    return `<i class="${ok ? 'ok' : ex ? 'ex' : 'no'}" title="${fmtDate(d)} · ${ok ? 'lunas' : ex ? ex.reason : 'belum'}"></i>`;
                }).join('')}</span>
            </div>`).join('');

        const body = `
            <div class="member-head">
                ${avatar(m.name, id, 'lg')}
                <div>
                    <div class="member-name">${esc(m.name)}</div>
                    ${owed ? `<span class="badge bad">Kurang ${rp(owed)}</span>` : '<span class="badge ok">Semua lunas 🎉</span>'}
                </div>
            </div>
            <div class="mini-stats">
                <div><b class="ok">${paid.length}</b><span>minggu lunas</span></div>
                <div><b class="${missed.length ? 'bad' : ''}">${missed.length}</b><span>minggu belum</span></div>
                <div><b class="${unpaidFines.length ? 'warn' : ''}">${rp(sum(unpaidFines))}</b><span>denda aktif</span></div>
            </div>
            ${missed.length ? `<div class="field"><label>Tanggal belum bayar</label><div class="chips">${missed.map(d => `<span class="chip bad">${fmtDateShort(d)} ${d.slice(2, 4)}</span>`).join('')}</div></div>` : ''}
            <div class="field"><label>Riwayat <span class="legend"><i class="ok"></i>lunas <i class="no"></i>belum <i class="ex"></i>dispensasi</span></label>
                <div class="calendar">${calendar || '<span class="muted">Belum ada data</span>'}</div>
            </div>
            ${myFines.length ? `<div class="field"><label>Denda</label>${myFines.map(f => `<div class="mini-row"><span>${esc(f.reason)}</span><span class="num ${f.paid ? 'ok' : 'bad'}">${rp(f.amount)} · ${f.paid ? 'lunas' : 'belum'}</span></div>`).join('')}</div>` : ''}`;

        this.msg = `Halo ${m.name}, kas kelas XII PPLG kamu masih kurang ${rp(owed)} (${missed.length} minggu${unpaidFines.length ? ' + denda' : ''}). Mohon segera dilunasi ya 🙏`;
        const footer = owed ? `<button class="btn" onclick="copyText(Member.msg, 'Pesan disalin')">Salin pesan WA</button>` : '';
        openModal('Status kas siswa', body, footer + `<button class="btn btn-primary" onclick="closeModal()">Tutup</button>`);
    }
};
