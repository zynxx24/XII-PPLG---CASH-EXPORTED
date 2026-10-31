/*
 * XII PPLG Cash Management — App shell (router + navigasi)
 * Tiap halaman ada di js/pages/*.js dan mendaftar ke objek `Pages`.
 */

const NAV = [
    ['dashboard', 'Dashboard'],
    ['payments', 'Kas'],
    ['recap', 'Tunggakan'],
    ['fines', 'Denda'],
    ['donations', 'Donatur'],
    ['expenses', 'Pengeluaran'],
    ['reports', 'Laporan'],
    ['settings', 'Pengaturan']
];

let currentPage = 'dashboard';

document.addEventListener('DOMContentLoaded', () => {
    if (!API.getToken()) localStorage.setItem('role', 'user');
    buildNav();
    navigateTo(location.hash.slice(1) || 'dashboard');
    API.getFines().then(f => updateNavBadge('fines', f.filter(x => !x.paid).length)).catch(() => { });
});

window.addEventListener('hashchange', () => {
    const page = location.hash.slice(1);
    if (page && page !== currentPage) navigateTo(page);
});

function buildNav() {
    const admin = API.isAdmin();
    document.getElementById('nav').innerHTML = NAV
        .filter(([id]) => Pages[id] && (!Pages[id].admin || admin))
        .map(([id, label]) => `<a data-page="${id}" onclick="navigateTo('${id}')">${label}</a>`)
        .join('');

    document.getElementById('user-slot').innerHTML = admin
        ? `<button class="btn btn-sm" onclick="logout()" title="Keluar">Admin · Keluar</button>`
        : `<a class="btn btn-sm" href="admin.html">Masuk</a>`;
}

function updateNavBadge(page, count) {
    const a = document.querySelector(`.nav a[data-page="${page}"]`);
    if (!a) return;
    let dot = a.querySelector('.dot');
    if (!count) { if (dot) dot.remove(); return; }
    if (!dot) a.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
    a.querySelector('.dot').textContent = count;
}

function navigateTo(page) {
    const p = Pages[page];
    if (!p || (p.admin && !API.isAdmin())) page = 'dashboard';
    currentPage = page;
    if (location.hash.slice(1) !== page) history.replaceState(null, '', '#' + page);

    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
    const active = document.querySelector('.nav a.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    document.getElementById('page-title').textContent = Pages[page].title;
    document.getElementById('page-subtitle').textContent = Pages[page].subtitle || '';
    document.getElementById('global-search').value = '';
    renderPage(page);
}

async function renderPage(page) {
    const el = document.getElementById('content-area');
    const fresh = el.dataset.page !== page;
    if (fresh) el.innerHTML = '<div class="loading">Memuat…</div>';
    try {
        const tmp = document.createElement('div');
        await Pages[page].render(tmp);
        if (currentPage !== page) return; // user sudah pindah halaman
        el.dataset.page = page;
        el.replaceChildren(...tmp.childNodes);
        if (fresh) el.classList.remove('fade-in'), void el.offsetWidth, el.classList.add('fade-in');
        Pages[page].mounted && Pages[page].mounted();
    } catch (err) {
        el.innerHTML = ui.empty('⚠️', esc(err.message));
    }
}

function handleSearch(q) {
    q = q.toLowerCase();
    if (q) document.querySelectorAll('#content-area .more').forEach(b => b.click());
    document.querySelectorAll('#content-area [data-search]').forEach(r => {
        r.style.display = !q || r.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

async function logout() {
    try { await API.logout(); } catch (e) { }
    localStorage.clear();
    location.href = 'admin.html';
}
