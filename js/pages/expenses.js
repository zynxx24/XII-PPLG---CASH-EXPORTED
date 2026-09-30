/*
 * XII PPLG Cash Management - Expenses Page
 */

/* ======= Expenses ======= */
async function renderExpenses(el) {
    const expenses = await API.getExpenses();
    const isAdmin = API.isAdmin();

    expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    let totalExpense = 0;
    expenses.forEach(e => totalExpense += e.amount || 0);

    let html = '<div class="page-content">';
    html += `<div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
        <div class="stat-card purple-card">
            <div class="stat-header"><div class="stat-icon">💸</div><span class="stat-label">Total Pengeluaran</span></div>
            <div class="stat-value">${formatRupiah(totalExpense)}</div>
            <div class="stat-sub">${expenses.length} nota pengeluaran</div>
        </div>
    </div>`;

    html += '<div class="card"><div class="card-header"><h2>📋 Daftar Pengeluaran Kas</h2><div class="card-actions">';
    if (isAdmin) {
        html += `<button class="btn btn-primary btn-sm" onclick="showAddExpense()">+ Tambah Pengeluaran</button>`;
    }
    html += '</div></div>';

    if (expenses.length === 0) {
        html += '<div class="card-body"><div class="empty-state"><div class="empty-icon">💸</div><p>Belum ada pengeluaran kas</p></div></div>';
    } else {
        html += '<div class="card-body no-padding"><table class="data-table"><thead><tr><th>No</th><th>Deskripsi / Penggunaan</th><th>Tanggal</th><th>Nominal</th>';
        if (isAdmin) html += '<th>Aksi</th>';
        html += '</tr></thead><tbody>';

        expenses.forEach((e, i) => {
            html += `<tr>
                <td class="row-number">${i + 1}</td>
                <td class="member-name">${e.description || '-'}</td>
                <td>${e.date ? formatDate(e.date) : '-'}</td>
                <td><span class="expense-amount">${formatRupiah(e.amount || 0)}</span></td>`;
            if (isAdmin) {
                html += `<td><div style="display:flex;gap:4px;">
                    <button class="btn btn-ghost btn-sm" onclick="showEditExpense(${e.id})">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id})">Hapus</button>
                </div></td>`;
            }
            html += '</tr>';
        });

        html += '</tbody></table></div>';
    }
    html += '</div></div>';
    el.innerHTML = html;

    window._expensesCache = expenses;
}

function showAddExpense() {
    openModal('Tambah Pengeluaran', `
        <div class="form-group">
            <label class="form-label">Deskripsi / Penggunaan</label>
            <input type="text" class="form-input" id="expense-description" placeholder="Contoh: Beli sapu, spidol kelas">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="expense-amount" placeholder="0" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="expense-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-danger btn-sm" onclick="confirmAddExpense()">Simpan Pengeluaran</button>
    `);
}

function showEditExpense(id) {
    const e = (window._expensesCache || []).find(x => x.id === id);
    if (!e) return;
    openModal('Edit Pengeluaran', `
        <div class="form-group">
            <label class="form-label">Deskripsi / Penggunaan</label>
            <input type="text" class="form-input" id="expense-description" value="${e.description || ''}">
        </div>
        <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input type="number" class="form-input" id="expense-amount" value="${e.amount || 0}" min="0">
        </div>
        <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input type="date" class="form-input" id="expense-date" value="${e.date || ''}">
        </div>
    `, `
        <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
        <button class="btn btn-danger btn-sm" onclick="confirmEditExpense(${id})">Simpan</button>
    `);
}

async function confirmAddExpense() {
    const description = document.getElementById('expense-description').value.trim();
    const amount = parseInt(document.getElementById('expense-amount').value) || 0;
    const date = document.getElementById('expense-date').value;

    if (!description) { showToast('Deskripsi wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.addExpense({ description, amount, date });
        closeModal();
        showToast('Pengeluaran berhasil ditambah', 'success');
        renderPage('expenses');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function confirmEditExpense(id) {
    const description = document.getElementById('expense-description').value.trim();
    const amount = parseInt(document.getElementById('expense-amount').value) || 0;
    const date = document.getElementById('expense-date').value;

    if (!description) { showToast('Deskripsi wajib diisi', 'error'); return; }
    if (amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }

    try {
        await API.deleteExpense(id);
        await API.addExpense({ description, amount, date });
        closeModal();
        showToast('Pengeluaran berhasil diperbarui', 'success');
        renderPage('expenses');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteExpense(id) {
    if (!confirm('Hapus nota pengeluaran ini?')) return;
    try {
        await API.deleteExpense(id);
        showToast('Pengeluaran dihapus', 'success');
        renderPage('expenses');
    } catch (err) {
        showToast(err.message, 'error');
    }
}
