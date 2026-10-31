/* ======= Donatur ======= */
Pages.donations = {
    title: 'Donatur',
    subtitle: 'Sumbangan yang masuk ke kas kelas',

    async render(el) {
        const items = (await API.getDonations()).sort(byDateDesc);
        this.items = items;
        const admin = API.isAdmin();

        const rows = items.map(d => ui.row({
            lead: '<span class="tx-icon in">🎁</span>',
            title: esc(d.name || '-'),
            meta: fmtDate(d.date) + (d.note && d.note !== '-' ? ' · ' + esc(d.note) : ''),
            amount: '+' + rp(d.amount),
            amountClass: 'ok',
            actions: admin ? ui.iconBtn('✎', `Pages.donations.edit(${d.id})`, 'Edit') + ui.iconBtn('✕', `Pages.donations.remove(${d.id})`, 'Hapus', 'danger') : ''
        }));

        el.innerHTML = `<div class="stack">
            <div class="stats">${ui.stat('Total donasi', rp(sum(items)), `${items.length} donatur`, 'tone-purple', '🎁')}</div>
            ${ui.panel('Daftar donasi', ui.list(rows) || ui.empty('🎁', 'Belum ada donasi'),
                { actions: admin ? `<button class="btn btn-primary btn-sm" onclick="Pages.donations.edit()">+ Donasi</button>` : '' })}
        </div>`;
    },

    edit(id) {
        const d = this.items.find(x => x.id === id) || { date: today() };
        formModal(id ? 'Edit donasi' : 'Tambah donasi', [
            { id: 'name', label: 'Nama donatur', value: d.name || '' },
            { id: 'amount', label: 'Nominal (Rp)', type: 'number', value: d.amount || '', attrs: 'min="0"' },
            { id: 'date', label: 'Tanggal', type: 'date', value: d.date || '' },
            { id: 'note', label: 'Catatan', value: d.note || '', placeholder: 'opsional' }
        ], async v => {
            if (!v.name) { toast('Nama donatur wajib diisi', 'error'); return false; }
            if (v.amount <= 0) { toast('Nominal harus lebih dari 0', 'error'); return false; }
            await act(async () => {
                if (id) await API.deleteDonation(id);
                await API.addDonation(v);
            }, id ? 'Donasi diperbarui' : 'Donasi ditambahkan');
        });
    },

    remove(id) {
        if (confirm('Hapus donasi ini?')) act(() => API.deleteDonation(id), 'Donasi dihapus');
    }
};
