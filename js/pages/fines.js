/*
 * XII PPLG Cash Management - Fines Page
 */

/* ======= Fines ======= */
async function renderFines(el) {
    const [fines, members] = await Promise.all([API.getFines(), API.getMembers()]);
    membersCache = members;
    const isAdmin = API.isAdmin();

    fines.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    let totalFine = 0, unpaidFine = 0;
    fines.forEach(f => {
        totalFine += f.amount || 0;
        if (!f.paid) unpaidFine += f.amount || 0;
    });

    let html = '<div class="page-content">';
    html += `<div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
        <div class="stat-card red">
            <div class="stat-header"><div class="stat-icon">⚠️</div><span class="stat-label">Total Denda</span></div>
            <div class="stat-value">${formatRupiah(totalFine)}</div>
            <div class="stat-sub">${fines.length} denda</div>
        </div>
        <div class="stat-card orange">
            <div class="stat-header"><div class="stat-icon">⏳</div><span class="stat-label">Belum Dibayar</span></div>
            <div class="stat-value">${formatRupiah(unpaidFine)}</div>
        </div>
        <div class="stat-card green">
            <div class="stat-header"><div class="stat-icon">✅</div><span class="stat-label">Sudah Dibayar</span></div>
            <div class="stat-value">${formatRupiah(totalFine - unpaidFine)}</div>
        </div>
    </div>`;

    html += '<div class="card"><div class="card-header"><h2>📋 Daftar Denda</h2><div class="card-actions">';
    if (isAdmin) {
        html += `<button class="btn btn-primary btn-sm" onclick="showAddFine()">+ Tambah Denda</button>`;
    }
    html += '</div></div>';

    if (fines.length === 0) {
        html += '<div class="card-body"><div class="empty-state"><div class="empty-icon">✅</div><p>Tidak ada denda</p></div></div>';
    } else {
        html += '<div class="card-body no-padding"><table class="data-table"><thead><tr><th>No</th><th>Nama</th><th>Alasan</th><th>Nominal</th><th>Tanggal</th><th>Status</th>';
        if (isAdmin) html += '<th>Aksi</th>';
        html += '</tr></thead><tbody>';

        fines.forEach((f, i) => {
            const memberName = getMemberName(f.member_id, members);
            const isOverdue = !f.paid;
            html += `<tr class="${isOverdue ? 'fine-overdue' : ''}">
                <td class="row-number">${i + 1}</td>
                <td class="member-name">${memberName}</td>
                <td>${f.reason || '-'}</td>
                <td><span class="fine-amount">${formatRupiah(f.amount || 0)}</span></td>
                <td>${f.date ? formatDate(f.date) : '-'}</td>
                <td>${f.paid ? '<span class="badge badge-success">Lunas</span>' : '<span class="badge badge-danger">Belum</span>'}</td>`;
            if (isAdmin) {
                html += `<td><div style="display:flex;gap:4px;">
                    <button class="btn btn-ghost btn-sm" onclick="showEditFine(${f.id})">✏️</button>
                    ${!f.paid ? `<button class="btn btn-success btn-sm" onclick="markFinePaid(${f.id})">Bayar</button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteFine(${f.id})">Hapus</button>
                </div></td>`;
            }
            html += '</tr>';
        });

        html += '</tbody></table></div>';
    }
    html += '</div></div>';
    el.innerHTML = html;

    window._finesCache = fines;

    const badge = document.getElementById('fine-badge');
    if (fines.filter(f => !f.paid).length > 0) {
        badge.textContent = fines.filter(f => !f.paid).length;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}

function showAddFine() {
    const members = membersCache || [];
    let opts = members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

    openModal('Tambah Denda', `
        <div class="form-group">
            <label class="form-label">Nama Siswa</label>
            <select class="form-select" id="fine-member">${opts}</select>
        </div>
        <div class="form-group">
            <label class="form-label">Alasan Denda</label>
            <input type="text" class="form-input" id="fine-reason" placeholder="Contoh: Telat push commit, rusak kabel LAN">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="fine-amount" placeholder="0" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="fine-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-danger btn-sm" onclick="confirmAddFine()">Simpan Denda</button>
    `);
}

function showEditFine(id) {
    const f = (window._finesCache || []).find(x => x.id === id);
    if (!f) return;
    const members = membersCache || [];
    let opts = members.map(m => `<option value="${m.id}" ${m.id === f.member_id ? 'selected' : ''}>${m.name}</option>`).join('');

    openModal('Edit Denda', `
        <div class="form-group">
            <label class="form-label">Nama Siswa</label>
            <select class="form-select" id="fine-member">${opts}</select>
        </div>
        <div class="form-group">
            <label class="form-label">Alasan Denda</label>
            <input type="text" class="form-input" id="fine-reason" value="${f.reason || ''}">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="fine-amount" value="${f.amount || 0}" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="fine-date" value="${f.date || ''}">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-danger btn-sm" onclick="confirmEditFine(${id}, ${f.paid ? 'true' : 'false'})">Simpan</button>
    `);
}

async function confirmAddFine() {
    const member_id = parseInt(document.getElementById('fine-member').value);
    const reason = document.getElementById('fine-reason').value.trim();
    const amount = parseInt(document.getElementById('fine-amount').value) || 0;
    const date = document.getElementById('fine-date').value;

    if (!reason) { showToast('Alasan wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.addFine({ member_id, reason, amount, date, paid: false });
        closeModal();
        showToast('Denda berhasil ditambah', 'success');
        renderPage('fines');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function confirmEditFine(id, wasPaid) {
    const member_id = parseInt(document.getElementById('fine-member').value);
    const reason = document.getElementById('fine-reason').value.trim();
    const amount = parseInt(document.getElementById('fine-amount').value) || 0;
    const date = document.getElementById('fine-date').value;

    if (!reason) { showToast('Alasan wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.deleteFine(id);
        await API.addFine({ member_id, reason, amount, date, paid: wasPaid });
        closeModal();
        showToast('Denda berhasil diperbarui', 'success');
        renderPage('fines');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function markFinePaid(id) {
    try {
        const fines = await API.getFines();
        const fine = fines.find(f => f.id === id);
        if (fine) {
            await API.deleteFine(id);
            fine.paid = true;
            delete fine.id;
            await API.addFine(fine);
        }
        showToast('Denda ditandai lunas', 'success');
        renderPage('fines');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteFine(id) {
    if (!confirm('Hapus denda ini?')) return;
    try {
        await API.deleteFine(id);
        showToast('Denda dihapus', 'success');
        renderPage('fines');
    } catch (err) {
        showToast(err.message, 'error');
    }
}
