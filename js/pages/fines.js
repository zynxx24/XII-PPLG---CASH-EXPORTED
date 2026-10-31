/* ======= Denda ======= */
Pages.fines = {
    title: 'Denda',
    subtitle: 'Denda keterlambatan kas dan pelanggaran',

    async render(el) {
        await syncAutoFines();
        const [fines, members] = await Promise.all([API.getFines(), API.getMembers()]);
        State.members = members;
        this.items = fines.sort((a, b) => (a.paid - b.paid) || byDateDesc(a, b)); // belum lunas dulu
        const admin = API.isAdmin();

        const unpaid = fines.filter(f => !f.paid);
        updateNavBadge('fines', unpaid.length);

        const rows = this.items.map(f => ui.row({
            lead: avatar(memberName(f.member_id), f.member_id),
            title: nameLink(f.member_id, memberName(f.member_id)),
            meta: `${esc(f.reason || '-')} · ${fmtDate(f.date)}`,
            badge: f.paid ? '<span class="badge ok">Lunas</span>' : '<span class="badge bad">Belum</span>',
            amount: rp(f.amount),
            actions: admin ? (f.paid ? '' : ui.iconBtn('✓', `Pages.fines.markPaid(${f.id})`, 'Tandai lunas', 'good'))
                + ui.iconBtn('✎', `Pages.fines.edit(${f.id})`, 'Edit')
                + ui.iconBtn('✕', `Pages.fines.remove(${f.id})`, 'Hapus', 'danger') : ''
        }));

        el.innerHTML = `<div class="stack">
            <div class="stats">
                ${ui.stat('Belum dibayar', rp(sum(unpaid)), `${unpaid.length} denda`, 'tone-bad', '⏰')}
                ${ui.stat('Sudah dibayar', rp(sum(fines) - sum(unpaid)), `${fines.length - unpaid.length} denda`, 'tone-ok', '✅')}
            </div>
            ${ui.panel('Daftar denda', ui.list(rows, 10) || ui.empty('✅', 'Tidak ada denda'),
                { actions: admin ? `<button class="btn btn-primary btn-sm" onclick="Pages.fines.edit()">+ Denda</button>` : '' })}
        </div>`;
    },

    edit(id) {
        const f = this.items.find(x => x.id === id) || { date: today(), member_id: (State.members[0] || {}).id };
        formModal(id ? 'Edit denda' : 'Tambah denda', [
            { id: 'member_id', label: 'Siswa', value: f.member_id, options: State.members.map(m => ({ value: m.id, label: m.name })) },
            { id: 'reason', label: 'Alasan', value: f.reason || '', placeholder: 'Contoh: telat kumpul tugas' },
            { id: 'amount', label: 'Nominal (Rp)', type: 'number', value: f.amount || '', attrs: 'min="0"' },
            { id: 'date', label: 'Tanggal', type: 'date', value: f.date || '' }
        ], async v => {
            if (!v.reason) { toast('Alasan wajib diisi', 'error'); return false; }
            if (v.amount <= 0) { toast('Nominal harus lebih dari 0', 'error'); return false; }
            await act(async () => {
                if (id) await API.deleteFine(id);
                await API.addFine({ ...v, paid: !!f.paid });
            }, id ? 'Denda diperbarui' : 'Denda ditambahkan');
        });
    },

    markPaid(id) {
        const f = this.items.find(x => x.id === id);
        if (!f) return;
        act(async () => {
            const { id: _, ...rest } = f;
            await API.deleteFine(id);
            await API.addFine({ ...rest, paid: true });
        }, 'Denda ditandai lunas');
    },

    remove(id) {
        if (confirm('Hapus denda ini?')) act(() => API.deleteFine(id), 'Denda dihapus');
    }
};
