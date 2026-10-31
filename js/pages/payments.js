/* ======= Pembayaran Kas =======
 * Dua tampilan:
 *  - "Per tanggal": kartu siswa untuk satu tanggal (cepat dicentang, enak di HP)
 *  - "Tabel": semua tanggal sekaligus
 */
Pages.payments = {
    title: 'Pembayaran Kas',
    subtitle: 'Status kas mingguan tiap siswa',
    view: 'date',
    filter: 'all',
    date: null,

    async render(el) {
        const [payments, members] = await Promise.all([API.getPayments(), API.getMembers()]);
        State.members = members;
        State.payments = payments;
        payments.dates = payments.dates || [];
        payments.records = payments.records || {};
        const admin = API.isAdmin();

        if (!payments.dates.length) {
            el.innerHTML = ui.panel('Pembayaran kas', ui.empty('📅', 'Belum ada tanggal kas'), { actions: admin ? this.addBtn : '' });
            return;
        }
        if (!payments.dates.includes(this.date)) this.date = latestDate(payments.dates);

        const tabs = `<div class="tabs">
            <button class="${this.view === 'date' ? 'active' : ''}" onclick="Pages.payments.setView('date')">Per tanggal</button>
            <button class="${this.view === 'table' ? 'active' : ''}" onclick="Pages.payments.setView('table')">Tabel semua</button>
        </div>`;

        el.innerHTML = `<div class="stack">
            <div class="toolbar">${tabs}${admin ? this.addBtn : ''}</div>
            ${this.view === 'date' ? this.dateView(payments, members, admin) : this.tableView(payments, members, admin)}
        </div>`;
    },

    setView(v) { this.view = v; renderPage('payments'); },
    setDate(d) { if (d) { this.date = d; renderPage('payments'); } },
    setFilter(f) { this.filter = f; renderPage('payments'); },

    /* ---- Tampilan per tanggal ---- */
    dateView({ dates, records }, members, admin) {
        const d = this.date;
        const status = m => isPaid(records, m.id, d) ? 'paid' : isExempt(m.id, d) ? 'exempt' : 'unpaid';
        const unpaid = members.filter(m => status(m) === 'unpaid');
        const done = members.length - unpaid.length;
        this.reminder = reminderText(`Belum bayar kas ${fmtDate(d)}`, unpaid);

        const recent = dates.slice(-6).reverse();
        const datePicker = `<div class="date-picker">
            ${recent.map(x => `<button class="date-chip ${x === d ? 'active' : ''}" onclick="Pages.payments.setDate('${x}')"><b>${parseInt(x.slice(8))}</b>${MONTHS_SHORT[parseInt(x.slice(5, 7)) - 1]}</button>`).join('')}
            <select class="input date-select" onchange="Pages.payments.setDate(this.value)">
                <option value="">Tanggal lain…</option>
                ${dates.slice().reverse().map(x => `<option value="${x}">${fmtDate(x)}</option>`).join('')}
            </select>
        </div>`;

        const shown = members.filter(m => this.filter === 'all' || (this.filter === 'unpaid') === (status(m) === 'unpaid'));
        const cards = shown.map(m => {
            const st = status(m);
            const label = st === 'paid' ? '✓ Lunas' : st === 'exempt' ? isExempt(m.id, d).reason : 'Belum';
            const click = admin && st !== 'exempt' ? `Pages.payments.toggle(${m.id},'${d}',${st !== 'paid'})` : `Member.open(${m.id})`;
            return `<button class="pay-card ${st}" data-search onclick="${click}">
                ${avatar(m.name, m.id)}
                <span class="pay-name">${esc(m.name)}</span>
                <span class="pay-status">${label}</span>
            </button>`;
        }).join('');

        const filters = [['all', `Semua ${members.length}`], ['unpaid', `Belum ${unpaid.length}`], ['paid', `Lunas ${done}`]]
            .map(([k, l]) => `<button class="${this.filter === k ? 'active' : ''}" onclick="Pages.payments.setFilter('${k}')">${l}</button>`).join('');

        const actions = (unpaid.length ? `<button class="btn btn-sm" onclick="copyText(Pages.payments.reminder, 'Daftar disalin — tempel di grup WA')">📋 Salin WA</button>` : '')
            + (admin ? `<button class="btn btn-sm btn-danger" onclick="Pages.payments.removeDate('${d}')">Hapus tanggal</button>` : '');

        return `
            ${datePicker}
            <div class="panel"><div class="panel-body">${ui.progress(done, members.length, fmtDate(d))}</div></div>
            ${ui.panel(`<div class="tabs small">${filters}</div>`,
                `<div class="panel-body">
                    <p class="hint">${admin ? 'Klik kartu untuk centang / batal centang.' : 'Klik nama untuk melihat riwayat lengkap.'}</p>
                    <div class="pay-grid">${cards || '<span class="muted">Tidak ada</span>'}</div>
                </div>`, { actions })}`;
    },

    /* ---- Tampilan tabel ---- */
    tableView({ dates, records }, members, admin) {
        const head = dates.map(d => `<th><a class="date-head" onclick="Pages.payments.view='date';Pages.payments.setDate('${d}')"><b>${parseInt(d.slice(8))}</b>${MONTHS_SHORT[parseInt(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}</a></th>`).join('');

        const rows = members.map(m => {
            let done = 0;
            const cells = dates.map(d => {
                const ex = isExempt(m.id, d), paid = isPaid(records, m.id, d);
                if (paid || ex) done++;
                if (ex) return `<td class="cell"><span class="exempt" title="${ex.reason} s.d. ${fmtDate(ex.until)}">—</span></td>`;
                if (!admin) return `<td class="cell">${paid ? '<span class="paid-mark">✓</span>' : '<span class="unpaid-mark"></span>'}</td>`;
                return `<td class="cell"><input type="checkbox" class="tick" ${paid ? 'checked' : ''} onchange="Pages.payments.toggle(${m.id},'${d}',this.checked,true)"></td>`;
            }).join('');
            const pct = Math.round(done / dates.length * 100);
            return `<tr data-search><td class="name">${nameLink(m.id, m.name)}</td>${cells}<td class="cell status"><span class="badge ${pct === 100 ? 'ok' : pct < 50 ? 'bad' : 'warn'}">${done}/${dates.length}</span></td></tr>`;
        }).join('');

        return ui.panel('Semua tanggal', `<div class="grid-scroll" id="grid-scroll"><table class="grid">
            <thead><tr><th class="name">Nama siswa</th>${head}<th class="status">Total</th></tr></thead>
            <tbody>${rows}</tbody></table></div>`, { meta: `${dates.length} tanggal · klik tanggal untuk detail` });
    },

    /* Tabel mulai dari tanggal terbaru (kanan) */
    mounted() {
        const toEnd = () => {
            const s = document.getElementById('grid-scroll');
            if (s) s.scrollLeft = s.scrollWidth;
        };
        requestAnimationFrame(toEnd);
        if (document.fonts) document.fonts.ready.then(toEnd);
    },

    addBtn: `<button class="btn btn-primary btn-sm" onclick="Pages.payments.addDate()">+ Tanggal kas</button>`,

    save: () => API.savePayments(State.payments),

    addDate() {
        formModal('Tambah tanggal kas', [{ id: 'date', label: 'Tanggal', type: 'date', value: today() }], async ({ date }) => {
            const p = State.payments;
            if (!date) { toast('Pilih tanggal', 'error'); return false; }
            if (p.dates.includes(date)) { toast('Tanggal sudah ada', 'error'); return false; }
            p.dates.push(date);
            p.dates.sort();
            this.date = date;
            this.view = 'date';
            await act(this.save, 'Tanggal ditambahkan');
        }, 'Tambah');
    },

    async toggle(memberId, date, checked, inTable = false) {
        const r = State.payments.records;
        (r[memberId] = r[memberId] || {})[date] = checked;
        try {
            await this.save();
            if (!inTable) renderPage('payments');
        } catch (err) {
            toast(err.message, 'error');
            renderPage('payments');
        }
    },

    removeDate(date) {
        if (!confirm(`Hapus tanggal ${fmtDate(date)}? Semua centang di tanggal ini ikut terhapus.`)) return;
        const p = State.payments;
        p.dates = p.dates.filter(d => d !== date);
        Object.values(p.records).forEach(r => delete r[date]);
        this.date = null;
        act(this.save, 'Tanggal dihapus');
    }
};
