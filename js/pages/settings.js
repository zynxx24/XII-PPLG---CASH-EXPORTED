/* ======= Pengaturan & Keamanan (admin) ======= */
Pages.settings = {
    title: 'Pengaturan',
    subtitle: 'Konfigurasi kas dan status server',
    admin: true,

    async render(el) {
        const [c, s] = await Promise.all([API.getConfig(), API.getSecurity().catch(() => null)]);
        const f = (id, label, value, type = 'number') => ui.field(label, ui.input(id, { type, value }));

        el.innerHTML = `<div class="stack">
            ${ui.panel('Kas', `<div class="panel-body">
                <div class="form-grid">
                    ${f('cfg-kas', 'Nominal kas per minggu (Rp)', c.kas_amount || 5000)}
                    ${f('cfg-prev', 'Sisa kas sebelumnya (Rp)', c.previous_balance || 0)}
                    ${f('cfg-real', 'Saldo fisik di peti kas (Rp)', c.real_balance || 0)}
                    ${f('cfg-class', 'Nama kelas', c.class_name || 'XII PPLG', 'text')}
                    ${f('cfg-year', 'Tahun ajaran', c.year || '2026/2027', 'text')}
                </div>
                <div class="form-foot"><button class="btn btn-primary" onclick="Pages.settings.save()">Simpan</button></div>
            </div>`)}
            ${s ? this.security(s) : ''}
        </div>`;
    },

    save() {
        const v = id => document.getElementById(id).value.trim();
        act(() => API.saveConfig({
            kas_amount: parseInt(v('cfg-kas')) || 5000,
            previous_balance: parseInt(v('cfg-prev')) || 0,
            real_balance: parseInt(v('cfg-real')) || 0,
            class_name: v('cfg-class') || 'XII PPLG',
            year: v('cfg-year') || '2026/2027'
        }), 'Pengaturan disimpan');
    },

    security(s) {
        const cpu = s.cpu_usage || 0;
        const banned = (s.banned_ips || []).map(b => ui.row({ title: esc(b.ip), meta: `diblokir ${b.remaining} detik lagi`, badge: '<span class="badge bad">Banned</span>' }));
        return ui.panel('Keamanan server', `
            <div class="panel-body"><div class="stats">
                ${ui.stat('Total request', s.total_requests || 0)}
                ${ui.stat('Diblokir', s.blocked_requests || 0, '', 'tone-bad')}
                ${ui.stat('IP terpantau', s.tracked_ips || 0, '', 'tone-purple')}
                ${ui.stat('CPU', cpu.toFixed(1) + '%', `batas ${s.cpu_threshold || 90}% · rate ${s.rate_limit || 100}/${s.rate_window || 10}s`, cpu > 70 ? 'tone-bad' : 'tone-ok')}
            </div></div>
            ${ui.list(banned)}`,
            { actions: `<button class="btn btn-sm" onclick="renderPage('settings')">Refresh</button>` });
    }
};
