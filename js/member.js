/* ======= Detail siswa (modal) =======
 * Dipanggil dari mana saja lewat Member.open(id) — cek kas pribadi tiap siswa.
 */
const Member = {
    async open(id) {
        const [payments, members, config] = await Promise.all([API.getPayments(), API.getMembers(), API.getConfig()]);
        State.members = members;
        const m = members.find(x => x.id === id);
        if (!m) return;

        const kas = config.kas_amount || 5000;
        const records = payments.records || {};
        const dates = (payments.dates || []).filter(d => d <= serverDate());
        const paid = dates.filter(d => isPaid(records, id, d));
        const missed = dates.filter(d => !isPaid(records, id, d) && !isExempt(id, d));
        const owed = missed.length * kas;

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
                <div><b class="${owed ? 'bad' : ''}">${rp(owed)}</b><span>tunggakan</span></div>
            </div>
            ${missed.length ? `<div class="field"><label>Tanggal belum bayar</label><div class="chips">${missed.map(d => `<span class="chip bad">${fmtDateShort(d)} ${d.slice(2, 4)}</span>`).join('')}</div></div>` : ''}
            <div class="field"><label>Riwayat <span class="legend"><i class="ok"></i>lunas <i class="no"></i>belum <i class="ex"></i>dispensasi</span></label>
                <div class="calendar">${calendar || '<span class="muted">Belum ada data</span>'}</div>
            </div>
            `;

        this.msg = `Halo ${m.name}, kas kelas XII PPLG kamu masih kurang ${rp(owed)} (${missed.length} minggu). Mohon segera dilunasi ya 🙏`;
        const footer = owed ? `<button class="btn" onclick="copyText(Member.msg, 'Pesan disalin')">Salin pesan WA</button>` : '';
        openModal('Status kas siswa', body, footer + `<button class="btn btn-primary" onclick="closeModal()">Tutup</button>`);
    }
};
