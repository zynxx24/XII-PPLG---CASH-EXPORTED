/*
 * XII PPLG Cash Management - Utilities
 * Format helpers, Modal, Toast, Sidebar, Search
 */

/* ======= Formatting ======= */
function formatRupiah(num) {
    return 'Rp ' + (num || 0).toLocaleString('id-ID');
}

function formatRupiahShort(num) {
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 1000000) return sign + 'Rp ' + (abs / 1000000).toFixed(1) + 'jt';
    if (abs >= 1000) return sign + 'Rp ' + (abs / 1000).toFixed(0) + 'rb';
    return sign + 'Rp ' + abs;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatMonthYear(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length < 2) return dateStr;
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const mIdx = parseInt(parts[1]) - 1;
    return `${monthNames[mIdx]} ${parts[0]}`;
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.getDate();
}

function formatMonthShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    return months[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2);
}

function formatDateShortLabel(dateStr) {
    if (!dateStr || dateStr === 'Awal') return 'Awal';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    const mIdx = parseInt(parts[1]) - 1;
    return `${parts[2]} ${months[mIdx]}`;
}

function getMemberName(id, members) {
    const m = (members || membersCache || []).find(m => m.id === id);
    return m ? m.name : 'Unknown';
}

/* ======= Modal ======= */
function openModal(title, bodyHtml, footerHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml || '';
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('modal-overlay')) return;
    document.getElementById('modal-overlay').classList.remove('active');
}

/* ======= Toast ======= */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* ======= Sidebar Toggle (Mobile) ======= */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
}

/* ======= Search ======= */
function handleSearch(query) {
    if (!query) return;
    const rows = document.querySelectorAll('.data-table tbody tr');
    const q = query.toLowerCase();
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
    });
}

/* ======= Logout ======= */
async function logout() {
    try { await API.logout(); } catch (e) { }
    localStorage.clear();
    window.location.href = '/admin';
}
