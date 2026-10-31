/* ======= Pengeluaran ======= */
Pages.expenses = {
    title: 'Pengeluaran',
    subtitle: 'Belanja dan penggunaan uang kas',

    async render(el) {
        const items = (await API.getExpenses()).sort(byDateDesc);
        this.items = items;
        const admin = API.isAdmin();

        const rows = items.map(e => ui.row({
            lead: '<span class="tx-icon out">🧾</span>',
            title: esc(e.description || '-'),
            meta: fmtDate(e.date),
            amount: '−' + rp(e.amount),
            amountClass: 'bad',
            actions: admin ? ui.iconBtn('✎', `Pages.expenses.edit(${e.id})`, 'Edit') + ui.iconBtn('✕', `Pages.expenses.remove(${e.id})`, 'Hapus', 'danger') : ''
        }));

        el.innerHTML = `<div class="stack">
            <div class="stats">${ui.stat('Total pengeluaran', rp(sum(items)), `${items.length} nota`, 'tone-warn', '🧾')}</div>
            ${ui.panel('Daftar pengeluaran', ui.list(rows) || ui.empty('🧾', 'Belum ada pengeluaran'),
                { actions: admin ? `<button class="btn btn-primary btn-sm" onclick="Pages.expenses.edit()">+ Pengeluaran</button>` : '' })}
        </div>`;
    },

    edit(id) {
        const e = this.items.find(x => x.id === id) || { date: today() };
        formModal(id ? 'Edit pengeluaran' : 'Tambah pengeluaran', [
            { id: 'description', label: 'Keterangan', value: e.description || '', placeholder: 'Contoh: beli sapu, spidol' },
            { id: 'amount', label: 'Nominal (Rp)', type: 'number', value: e.amount || '', attrs: 'min="0"' },
            { id: 'date', label: 'Tanggal', type: 'date', value: e.date || '' }
        ], async v => {
            if (!v.description) { toast('Keterangan wajib diisi', 'error'); return false; }
            if (v.amount <= 0) { toast('Nominal harus lebih dari 0', 'error'); return false; }
            await act(async () => {
                if (id) await API.deleteExpense(id);
                await API.addExpense(v);
            }, id ? 'Pengeluaran diperbarui' : 'Pengeluaran ditambahkan');
        });
    },

    remove(id) {
        if (confirm('Hapus nota pengeluaran ini?')) act(() => API.deleteExpense(id), 'Pengeluaran dihapus');
    }
};
