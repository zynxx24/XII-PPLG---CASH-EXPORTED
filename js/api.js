/*
 * XII PPLG Cash Management - API Client
 */
const API = {
    baseUrl: '',

    getToken() {
        return localStorage.getItem('token') || '';
    },

    getRole() {
        return localStorage.getItem('role') || 'user';
    },

    isAdmin() {
        return this.getRole() === 'admin';
    },

    async request(method, path, body = null) {
        const opts = {
            method,
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Content-Type': 'application/json'
            }
        };
        if (body) opts.body = JSON.stringify(body);

        try {
            const res = await fetch(`${this.baseUrl}${path}`, opts);
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 403 && this.isAdmin()) {
                    alert('Sesi admin telah berakhir. Silakan login ulang.');
                    localStorage.clear();
                    window.location.href = '/admin';
                    return;
                }
                throw new Error(data.error || 'Request failed');
            }
            return data;
        } catch (err) {
            // Fallback to static mode if backend is unreachable or method is GET
            if (method === 'GET') {
                const staticData = await this.getStaticData(path);
                if (staticData !== null) return staticData;
            }
            if (err.message === 'Failed to fetch') {
                throw new Error('Tidak dapat terhubung ke server (Mode Read-Only Statis Aktif)');
            }
            throw err;
        }
    },

    async getStaticData(path) {
        const keyMap = {
            '/api/config': 'config',
            '/api/members': 'members',
            '/api/payments': 'payments',
            '/api/donations': 'donations',
            '/api/fines': 'fines',
            '/api/expenses': 'expenses',
            '/api/levies': 'levies',
            '/api/security': 'security'
        };

        if (path === '/api/dashboard') {
            return this.calculateStaticDashboard();
        }

        const key = keyMap[path];
        if (window._embeddedData && key && window._embeddedData[key] !== undefined) {
            return window._embeddedData[key];
        }

        if (key) {
            try {
                const res = await fetch(`./data/${key}.json`);
                if (res.ok) return await res.json();
            } catch (e) {
                // Ignore static fetch error
            }
        }

        return null;
    },

    async calculateStaticDashboard() {
        const [config, payments, donations, fines, expenses, members] = await Promise.all([
            this.getStaticData('/api/config'),
            this.getStaticData('/api/payments'),
            this.getStaticData('/api/donations'),
            this.getStaticData('/api/fines'),
            this.getStaticData('/api/expenses'),
            this.getStaticData('/api/members')
        ]);

        const kas_amount = (config && config.kas_amount) || 5000;
        const previous_balance = (config && config.previous_balance) || 0;

        let total_payments = 0;
        let total_payment_dates = payments && payments.dates ? payments.dates.length : 0;
        let total_members = members ? members.length : 33;

        if (payments && payments.records) {
            Object.values(payments.records).forEach(rec => {
                Object.values(rec).forEach(val => {
                    if (val === true) total_payments++;
                });
            });
        }

        const total_kas_income = total_payments * kas_amount;
        const total_donation_amount = (donations || []).reduce((sum, d) => sum + (d.amount || 0), 0);
        const total_donation_count = (donations || []).length;

        let total_fine_amount = 0;
        let unpaid_fine_amount = 0;
        (fines || []).forEach(f => {
            total_fine_amount += (f.amount || 0);
            if (!f.paid) unpaid_fine_amount += (f.amount || 0);
        });

        const paid_fine_amount = total_fine_amount - unpaid_fine_amount;
        const total_expense_amount = (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
        const total_expense_count = (expenses || []).length;

        const total_balance = previous_balance + total_kas_income + total_donation_amount + paid_fine_amount - total_expense_amount;
        const server_date = new Date().toISOString().split('T')[0];

        let latest_paid = 0;
        if (payments && payments.dates && payments.dates.length > 0) {
            const latest_date = payments.dates.filter(d => d <= server_date).slice(-1)[0];
            if (latest_date && payments.records) {
                Object.values(payments.records).forEach(rec => {
                    if (rec[latest_date] === true) latest_paid++;
                });
            }
        }

        return {
            total_balance,
            previous_balance,
            kas_amount,
            total_kas_income,
            total_payments,
            total_payment_dates,
            total_members,
            total_donation_amount,
            total_donation_count,
            total_fine_amount,
            total_fine_count: (fines || []).length,
            unpaid_fine_amount,
            paid_fine_amount,
            total_expense_amount,
            total_expense_count,
            latest_paid,
            server_date
        };
    },

    get(path) { return this.request('GET', path); },
    post(path, body) { return this.request('POST', path, body); },
    del(path) { return this.request('DELETE', path); },

    /* Endpoints */
    getDashboard() { return this.get('/api/dashboard'); },
    getMembers() { return this.get('/api/members'); },
    getPayments() { return this.get('/api/payments'); },
    savePayments(data) { return this.post('/api/payments', data); },
    getDonations() { return this.get('/api/donations'); },
    addDonation(data) { return this.post('/api/donations', data); },
    deleteDonation(id) { return this.del(`/api/donations/${id}`); },
    getFines() { return this.get('/api/fines'); },
    addFine(data) { return this.post('/api/fines', data); },
    deleteFine(id) { return this.del(`/api/fines/${id}`); },
    getExpenses() { return this.get('/api/expenses'); },
    addExpense(data) { return this.post('/api/expenses', data); },
    deleteExpense(id) { return this.del(`/api/expenses/${id}`); },
    getConfig() { return this.get('/api/config'); },
    saveConfig(data) { return this.post('/api/config', data); },
    getSecurity() { return this.get('/api/security'); },
    getLevies() { return this.get('/api/levies'); },
    addLevy(data) { return this.post('/api/levies', data); },
    updateLevy(id, data) { return this.request('PUT', `/api/levies/${id}`, data); },
    deleteLevy(id) { return this.del(`/api/levies/${id}`); },
    toggleLevyPayment(levyId, memberId) { return this.post(`/api/levies/${levyId}/pay`, { member_id: memberId }); },
    logout() { return this.post('/api/logout'); }
};
