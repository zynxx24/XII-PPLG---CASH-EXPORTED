/*
 * XII PPLG Cash Management — Core helpers
 * Format, UI kecil (modal/toast), dan perhitungan kas yang dipakai banyak halaman.
 */

const Pages = {};               // diisi oleh js/pages/*.js
const State = { members: [], payments: null, serverDate: null };

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

/* Siswa BI/PKL tidak wajib bayar kas selama periode tersebut */
const KAS_EXEMPTIONS = [
    { memberId: 2, reason: 'BI/PKL', from: '2026-07-01', until: '2026-09-20' }
];

function isExempt(memberId, dateStr) {
    return KAS_EXEMPTIONS.find(e => e.memberId === memberId && (!e.from || dateStr >= e.from) && (!e.until || dateStr <= e.until));
}

/* ======= Format ======= */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = n => 'Rp ' + (n || 0).toLocaleString('id-ID');
const rpSigned = n => (n > 0 ? '+' : n < 0 ? '−' : '') + rp(Math.abs(n));
const rpShort = n => {
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace('.0', '') + 'jt';
    if (a >= 1e3) return s + Math.round(a / 1e3) + 'rb';
    return s + a;
};
const today = () => new Date().toISOString().split('T')[0];
const serverDate = () => State.serverDate || today();

function fmtDate(d) {
    if (!d) return '-';
    const [y, m, day] = d.split('T')[0].split('-');
    return `${parseInt(day)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}
function fmtDateShort(d) {
    if (!d) return '-';
    const [, m, day] = d.split('-');
    return `${parseInt(day)} ${MONTHS_SHORT[parseInt(m) - 1]}`;
}
function fmtMonth(ym) {
    const [y, m] = ym.split('-');
    return `${MONTHS[parseInt(m) - 1]} ${y}`;
}
function memberName(id) {
    const m = State.members.find(m => m.id === id);
    return m ? m.name : 'Unknown';
}
const sum = (arr, f = x => x.amount || 0) => arr.reduce((s, x) => s + f(x), 0);
const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');

/* ======= Kas calculations ======= */
const isPaid = (records, mid, date) => !!(records[String(mid)] && records[String(mid)][date] === true);

/* Tanggal kas terakhir yang sudah lewat (<= hari ini) */
function latestDate(dates) {
    const valid = dates.filter(d => d <= serverDate());
    return valid.length ? valid[valid.length - 1] : dates[dates.length - 1];
}

/* Kelompokkan tanggal per bulan. includeCurrent=false → hanya bulan yang sudah lewat. */
function groupByMonth(dates, includeCurrent = false) {
    const sd = serverDate(), cur = sd.slice(0, 7), groups = {};
    dates.filter(d => d <= sd).forEach(d => {
        const ym = d.slice(0, 7);
        if (includeCurrent ? ym <= cur : ym < cur) (groups[ym] = groups[ym] || []).push(d);
    });
    return groups;
}

/* Rekap tunggakan per bulan (bulan lalu saja), terbaru dulu */
function buildRecap(payments, members, kasAmount) {
    const records = payments.records || {};
    const groups = groupByMonth(payments.dates || []);
    return Object.keys(groups).sort().reverse().map(ym => {
        const dates = groups[ym];
        const unpaid = members.map(m => {
            const missed = dates.filter(d => !isPaid(records, m.id, d) && !isExempt(m.id, d));
            if (!missed.length) return null;
            const debt = missed.length * kasAmount;
            return { id: m.id, name: m.name, missed, debt, total: debt };
        }).filter(Boolean).sort((a, b) => b.missed.length - a.missed.length);
        return {
            ym, dates, unpaid,
            debt: sum(unpaid, u => u.debt),
            total: sum(unpaid, u => u.debt)
        };
    });
}

/* Semua transaksi (pemasukan +, pengeluaran −) untuk grafik saldo */
function buildLedger({ payments, members, donations, expenses, kasAmount }) {
    const tx = [];
    const records = payments.records || {};
    (payments.dates || []).forEach(d => {
        const n = members.filter(m => isPaid(records, m.id, d)).length;
        if (n) tx.push({ date: d, amount: n * kasAmount, label: `Kas mingguan · ${n} siswa`, kind: 'kas' });
    });
    donations.forEach(d => tx.push({ date: d.date, amount: d.amount || 0, label: `Donasi · ${d.name || '-'}`, kind: 'donasi' }));
    expenses.forEach(e => tx.push({ date: e.date, amount: -(e.amount || 0), label: e.description || 'Pengeluaran', kind: 'keluar' }));
    return tx.filter(t => t.date).map(t => ({ ...t, date: t.date.split('T')[0] })).sort((a, b) => a.date.localeCompare(b.date));
}

/* Saldo kumulatif per tanggal */
function balanceSeries(ledger, start) {
    const byDate = {};
    ledger.forEach(t => byDate[t.date] = (byDate[t.date] || 0) + t.amount);
    let bal = start;
    return [{ date: null, value: start }, ...Object.keys(byDate).sort().map(d => ({ date: d, value: bal += byDate[d] }))];
}

/* ======= Small UI pieces ======= */
const ui = {
    stat: (label, value, sub = '', tone = '', icon = '') =>
        `<div class="stat ${tone}">${icon ? `<div class="stat-icon">${icon}</div>` : ''}<div><div class="stat-label">${label}</div><div class="stat-value num">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div></div>`,

    panel: (title, body, { actions = '', meta = '' } = {}) =>
        `<section class="panel"><div class="panel-head"><h2>${title}${meta ? ` <span class="muted">· ${meta}</span>` : ''}</h2><div class="panel-actions">${actions}</div></div>${body}</section>`,

    empty: (icon, text) => `<div class="empty"><div class="empty-icon">${icon}</div>${text}</div>`,

    row: ({ title, meta = '', amount = '', amountClass = '', badge = '', actions = '', lead = '' }) =>
        `<li class="row" data-search>${lead}<div class="row-main"><div class="row-title">${title}</div>${meta ? `<div class="row-meta">${meta}</div>` : ''}</div>${badge}${amount !== '' ? `<div class="row-amount num ${amountClass}">${amount}</div>` : ''}${actions ? `<div class="row-actions">${actions}</div>` : ''}</li>`,

    /* Daftar dengan tombol "lihat semua" bila lebih dari `limit` item */
    list(items, limit = 8) {
        if (!items.length) return '';
        const id = 'l' + Math.random().toString(36).slice(2, 8);
        const hidden = items.length > limit;
        return `<ul class="list" id="${id}">${items.map((r, i) => i >= limit ? r.replace('class="row"', 'class="row" hidden') : r).join('')}</ul>` +
            (hidden ? `<button class="more" onclick="showAll('${id}', this)">Lihat semua (${items.length})</button>` : '');
    },

    progress(done, total, label) {
        const pct = total ? Math.round(done / total * 100) : 0;
        return `<div class="progress-line"><span>${label}</span><b class="num">${done}/${total} · ${pct}%</b></div><div class="progress"><span style="width:${pct}%"></span></div>`;
    },

    field: (label, input) => `<div class="field"><label>${label}</label>${input}</div>`,
    input: (id, { type = 'text', value = '', placeholder = '', attrs = '' } = {}) =>
        `<input class="input" id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${attrs}>`,

    iconBtn: (icon, onclick, title, cls = '') => `<button class="icon-btn ${cls}" title="${title}" onclick="${onclick}">${icon}</button>`
};

function showAll(id, btn) {
    document.querySelectorAll(`#${id} [hidden]`).forEach(el => el.hidden = false);
    btn.remove();
}

/* ======= Modal ======= */
function openModal(title, bodyHtml, footerHtml = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml;
    document.getElementById('modal-overlay').classList.add('active');
    const first = document.querySelector('#modal-body .input');
    if (first) first.focus();
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('modal-overlay')) return;
    document.getElementById('modal-overlay').classList.remove('active');
}

/* Form modal sederhana: fields = [{id,label,type,value,placeholder,options}] */
function formModal(title, fields, onSave, saveLabel = 'Simpan') {
    const body = fields.map(f => ui.field(f.label, f.options
        ? `<select class="input" id="${f.id}">${f.options.map(o => `<option value="${o.value}" ${o.value === f.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
        : ui.input(f.id, f))).join('');
    window._modalSave = async () => {
        const v = {};
        fields.forEach(f => {
            const raw = document.getElementById(f.id).value;
            v[f.id] = f.type === 'number' || f.options ? (parseInt(raw) || 0) : raw.trim();
        });
        try {
            if (await onSave(v) === false) return;
            closeModal();
        } catch (err) {
            toast(err.message, 'error');
        }
    };
    openModal(title, body, `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="_modalSave()">${saveLabel}</button>`);
}

/* ======= Toast ======= */
function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2600);
}

/* Jalankan aksi lalu render ulang halaman, tampilkan toast */
async function act(fn, msg, page = currentPage) {
    try {
        await fn();
        if (msg) toast(msg, 'success');
        renderPage(page);
    } catch (err) {
        toast(err.message, 'error');
    }
}

/* ======= Avatar & util tambahan ======= */
const AVATAR_COLORS = ['#2f6bff', '#12a46b', '#d98a0b', '#7c5cff', '#e5484d', '#0ea5b7', '#db2777', '#4f46e5'];
function avatar(name, id = 0, size = '') {
    const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    return `<span class="avatar ${size}" style="background:${AVATAR_COLORS[id % AVATAR_COLORS.length]}">${esc(initials)}</span>`;
}

/* Nama yang bisa diklik → buka detail siswa */
const nameLink = (id, name) => `<a class="name-link" onclick="event.stopPropagation();Member.open(${id})">${esc(name)}</a>`;

async function copyText(text, msg = 'Disalin ke clipboard') {
    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast(msg, 'success');
}

/* Pesan pengingat WhatsApp untuk yang belum bayar */
function reminderText(title, people) {
    return `*${title}*\n\n` + people.map((p, i) => `${i + 1}. ${p.name}${p.amount ? ` — ${rp(p.amount)}` : ''}`).join('\n') +
        `\n\nMohon segera melunasi kas ke bendahara ya 🙏`;
}
