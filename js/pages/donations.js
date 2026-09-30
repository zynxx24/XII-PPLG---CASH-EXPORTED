/*
 * XII PPLG Cash Management - Donations Page
 */

/* ======= Donations ======= */
async function renderDonations(el) {
    const donations = await API.getDonations();
    const isAdmin = API.isAdmin();

    donations.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    let totalDonation = 0;
    donations.forEach(d => totalDonation += d.amount || 0);

    let html = '<div class="page-content">';
    html += `<div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
        <div class="stat-card green">
            <div class="stat-header"><div class="stat-icon">🎁</div><span class="stat-label">Total Donasi</span></div>
            <div class="stat-value">${formatRupiah(totalDonation)}</div>
            <div class="stat-sub">${donations.length} donatur</div>
        </div>
    </div>`;

    html += '<div class="card"><div class="card-header"><h2>📋 Daftar Donasi</h2><div class="card-actions">';
    if (isAdmin) {
        html += `<button class="btn btn-primary btn-sm" onclick="showAddDonation()">+ Tambah Donasi</button>`;
    }
    html += '</div></div>';

    if (donations.length === 0) {
        html += '<div class="card-body"><div class="empty-state"><div class="empty-icon">🎁</div><p>Belum ada donasi</p></div></div>';
    } else {
        html += '<div class="card-body no-padding"><table class="data-table"><thead><tr><th>No</th><th>Nama Donatur</th><th>Tanggal</th><th>Nominal</th><th>Catatan</th>';
        if (isAdmin) html += '<th>Aksi</th>';
        html += '</tr></thead><tbody>';

        donations.forEach((d, i) => {
            html += `<tr>
                <td class="row-number">${i + 1}</td>
                <td class="member-name">${d.name || '-'}</td>
                <td>${d.date ? formatDate(d.date) : '-'}</td>
                <td><span class="donation-amount">${formatRupiah(d.amount || 0)}</span></td>
                <td>${d.note || '-'}</td>`;
            if (isAdmin) {
                html += `<td><div style="display:flex;gap:4px;">
                    <button class="btn btn-ghost btn-sm" onclick="showEditDonation(${d.id})">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteDonation(${d.id})">Hapus</button>
                </div></td>`;
            }
            html += '</tr>';
        });

        html += '</tbody></table></div>';
    }
    html += '</div></div>';
    el.innerHTML = html;

    window._donationsCache = donations;
}

function showAddDonation() {
    openModal('Tambah Donasi', `
        <div class="form-group">
            <label class="form-label">Nama Donatur</label>
            <input type="text" class="form-input" id="donation-name" placeholder="Nama donatur">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="donation-amount" placeholder="0" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="donation-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
            <label class="form-label">Catatan</label>
            <input type="text" class="form-input" id="donation-note" placeholder="Catatan (opsional)">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-success btn-sm" onclick="confirmAddDonation()">Simpan</button>
    `);
}

function showEditDonation(id) {
    const d = (window._donationsCache || []).find(x => x.id === id);
    if (!d) return;
    openModal('Edit Donasi', `
        <div class="form-group">
            <label class="form-label">Nama Donatur</label>
            <input type="text" class="form-input" id="donation-name" value="${d.name || ''}">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="donation-amount" value="${d.amount || 0}" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="donation-date" value="${d.date || ''}">
        </div>
        <div class="form-group">
            <label class="form-label">Catatan</label>
            <input type="text" class="form-input" id="donation-note" value="${d.note || ''}">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-success btn-sm" onclick="confirmEditDonation(${id})">Simpan</button>
    `);
}

async function confirmAddDonation() {
    const name = document.getElementById('donation-name').value.trim();
    const amount = parseInt(document.getElementById('donation-amount').value) || 0;
    const date = document.getElementById('donation-date').value;
    const note = document.getElementById('donation-note').value.trim();

    if (!name) { showToast('Nama donatur wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.addDonation({ name, amount, date, note });
        closeModal();
        showToast('Donasi berhasil ditambah', 'success');
        renderPage('donations');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function confirmEditDonation(id) {
    const name = document.getElementById('donation-name').value.trim();
    const amount = parseInt(document.getElementById('donation-amount').value) || 0;
    const date = document.getElementById('donation-date').value;
    const note = document.getElementById('donation-note').value.trim();

    if (!name) { showToast('Nama donatur wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.deleteDonation(id);
        await API.addDonation({ name, amount, date, note });
        closeModal();
        showToast('Donasi berhasil diperbarui', 'success');
        renderPage('donations');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteDonation(id) {
    if (!confirm('Hapus donasi ini?')) return;
    try {
        await API.deleteDonation(id);
        showToast('Donasi dihapus', 'success');
        renderPage('donations');
    } catch (err) {
        showToast(err.message, 'error');
    }
}
