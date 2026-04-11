// ==============================
// 🔐 AUTH HELPER
// ==============================
function getToken() {
    return localStorage.getItem("token");
}

// ==============================
// 🌐 API BASE URL
// ==============================
const API_BASE = "https://ngaturin-kappa.vercel.app/api";


// ==============================
// 📦 GLOBAL STATE
// ==============================
var pockets = [];
var currentTxType = 'in';
var selectedPocketId = null;
var editingPocketId = null; // for edit/delete mode


// ==============================
// 🌐 API — LOAD TRANSACTIONS
// ==============================
async function loadTransactionsForPocket(pocketId) {
    if (getToken() === "guest-token") {
        // Return dummy transactions based on pocket for guest mode
        return [
            { id: "tx1", pocket_id: pocketId, amount: 500000, type: "in", note: "Initial Savings", created_at: new Date().toISOString() },
            { id: "tx2", pocket_id: pocketId, amount: 150000, type: "out", note: "Snacks", created_at: new Date().toISOString() }
        ];
    }

    try {
        const res = await fetch(`${API_BASE}/pockets/${pocketId}/transactions`, {
            headers: {
                Authorization: "Bearer " + getToken()
            }
        });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}


// ==============================
// 🌐 API — LOAD POCKETS
// ==============================
async function loadPockets() {
    if (getToken() === "guest-token") {
        // Guest mode dummy data
        if (pockets.length === 0) {
            pockets = [
                { id: "g1", name: "Vacation Fund", icon: "bi-airplane-fill", color: "#6C63FF", current: 350000, target: 5000000 },
                { id: "g2", name: "Emergency", icon: "bi-safe-fill", color: "#6C63FF", current: 1000000, target: 10000000 }
            ];
            for (let p of pockets) {
                p.transactions = await loadTransactionsForPocket(p.id);
            }
        }
        renderPockets();
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/pockets`, {
            headers: {
                Authorization: "Bearer " + getToken()
            }
        });

        if (!res.ok) throw new Error("Failed to load pockets");
        pockets = await res.json();

        // attach transactions
        for (let p of pockets) {
            p.transactions = await loadTransactionsForPocket(p.id);
        }

        renderPockets();
    } catch (e) {
        console.error(e);
        showToastMsg("Error loading pockets", "error");
    }
}


// ==============================
// 🚀 PAGE INIT
// ==============================
document.addEventListener('DOMContentLoaded', async function () {

    if (!isLoggedIn()) {
        window.location.href = "login.html";
        return;
    }

    await loadPockets();
    renderPocketSelector();
    updateStats();
    initEmojiPicker();

    // Set default date to today
    const dateInput = document.getElementById('txDate');
    if(dateInput) {
        dateInput.valueAsDate = new Date();
    }
});


// ==============================
// 💸 SUBMIT TRANSACTION
// ==============================
async function submitTransaction() {

    if (!selectedPocketId) {
        showToastMsg("Select a pocket first", "error");
        return;
    }

    const amount = Number(document.getElementById('txAmount').value);
    const note = document.getElementById('txNote').value;
    const txDate = document.getElementById('txDate') ? document.getElementById('txDate').value : new Date().toISOString();

    if (!amount || amount <= 0) {
        showToastMsg("Invalid amount", "error");
        return;
    }

    if (getToken() === "guest-token") {
        const p = pockets.find(x => x.id === selectedPocketId);
        if (p) {
            if (currentTxType === 'in') p.current += amount;
            else if (currentTxType === 'out') {
                if (p.current < amount) {
                    showToastMsg("Insufficient funds", "error");
                    return;
                }
                p.current -= amount;
            }
            if(!p.transactions) p.transactions = [];
            p.transactions.unshift({
                id: "gtx" + Date.now(),
                amount: amount,
                type: currentTxType,
                note: note,
                created_at: txDate ? new Date(txDate).toISOString() : new Date().toISOString(),
                pocket_id: selectedPocketId
            });
        }
        
        showToastMsg("Transaction recorded! (Guest Mode)", "success");
        document.getElementById('txAmount').value = '';
        document.getElementById('txNote').value = '';
        renderPockets();
        renderPocketSelector();
        updateStats();
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/transactions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + getToken()
            },
            body: JSON.stringify({
                pocket_id: selectedPocketId,
                amount: amount,
                type: currentTxType,
                note: note,
                created_at: txDate ? new Date(txDate).toISOString() : null
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Transaction failed");
        }

        showToastMsg("Transaction recorded!", "success");

        // clear form
        document.getElementById('txAmount').value = '';
        document.getElementById('txNote').value = '';

        // reload data
        await loadPockets();
        renderPocketSelector();
        updateStats();

    } catch (error) {
        console.error(error);
        showToastMsg(error.message, "error");
    }
}


// ==============================
// 💰 FORMAT CURRENCY
// ==============================
function formatIDR(number) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(number);
}


// ==============================
// 📊 STATS
// ==============================
function updateStats() {

    let totalIncome = 0;
    let totalExpense = 0;
    let totalFunds = 0;

    pockets.forEach(p => {
        totalFunds += p.current;

        (p.transactions || []).forEach(tx => {
            // Include tx.type "in" as income and "out" as expense
            if (tx.type === "in") totalIncome += tx.amount;
            else if (tx.type === "out") totalExpense += Math.abs(tx.amount);
        });
    });

    document.getElementById('totalSaved').textContent = formatIDR(totalFunds);
    document.getElementById('totalIncome').textContent = formatIDR(totalIncome);
    document.getElementById('totalExpense').textContent = formatIDR(totalExpense);
    document.getElementById('totalPockets').textContent = pockets.length;
}


// ==============================
// 🎯 RENDER POCKETS
// ==============================
function renderIcon(icon) {
    if (!icon) icon = 'bi-wallet-fill';
    if (icon.startsWith('data:') || icon.startsWith('http')) {
        return `<img src="${icon}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    }
    if (icon.startsWith('bi-')) {
        return `<i class="bi ${icon}"></i>`;
    }
    return icon;
}

function renderPockets() {

    const grid = document.getElementById('pocketsGrid');
    if (!grid) return;

    if (pockets.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--color-text-light);">
                <div style="font-size: 2.5rem; margin-bottom: 12px;"><i class="bi bi-wallet2"></i></div>
                <h3 style="margin-bottom: 8px;">No wallets yet</h3>
                <p style="font-size: 0.9rem;">Click <strong>"+ New Pocket"</strong> to create one!</p>
            </div>
        `;
        renderGlobalTransactions();
        return;
    }

    grid.innerHTML = pockets.map(p => {
        return `
        <div class="pocket-card" onclick="editPocket('${p.id}')" style="padding: 16px; text-align: center;">
            <div class="pocket-icon" style="background: ${p.color || '#f5f5f5'}20; width: 48px; height: 48px; font-size: 1.4rem; margin: 0 auto 12px;">
                ${renderIcon(p.icon)}
            </div>
            <h3 style="font-size: 0.95rem; margin-bottom: 4px; color: #555;">${p.name}</h3>
            <p style="font-size: 1.2rem; font-weight: 800; color: var(--color-dark); margin-bottom: 0;">${formatIDR(p.current)}</p>
        </div>
        `;
    }).join('');

    renderGlobalTransactions();
}

// ==============================
// 🎯 RENDER GLOBAL TRANSACTIONS
// ==============================
function renderGlobalTransactions() {
    const list = document.getElementById('globalTxList');
    if (!list) return;

    // Aggregate all transactions
    let allTxns = [];
    pockets.forEach(p => {
        if (p.transactions) {
            p.transactions.forEach(tx => {
                // Keep reference to pocket name for display
                allTxns.push({ ...tx, pocket_name: p.name });
            });
        }
    });

    // Sort descending by date
    allTxns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (allTxns.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: #aaa; padding: 40px 0;">No transactions recorded yet.</div>`;
        return;
    }

    // Group by Date for better visual (optional, but let's just make a nice list)
    list.innerHTML = allTxns.map(tx => {
        const date = new Date(tx.created_at || new Date()).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
        const isInc = tx.type === 'in';
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
                <div style="display: flex; gap: 12px; align-items: center;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: ${isInc ? '#f0fdf4' : '#fef2f2'}; color: ${isInc ? '#16a34a' : '#dc2626'}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                        <i class="bi ${isInc ? 'bi-arrow-down-left' : 'bi-arrow-up-right'}"></i>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #333; font-size: 0.95rem;">${tx.note || (isInc ? 'Income' : 'Expense')}</div>
                        <div style="font-size: 0.8rem; color: #888;">${tx.pocket_name} • ${date}</div>
                    </div>
                </div>
                <div style="font-weight: 700; color: ${isInc ? '#16a34a' : '#dc2626'};">
                    ${isInc ? '+' : '-'}${formatIDR(tx.amount)}
                </div>
            </div>
        `;
    }).join('');
}


// ==============================
// 🎯 SELECT POCKET (for transactions)
// ==============================
function selectPocketChip(id) {
    selectedPocketId = id;

    // Update UI
    document.querySelectorAll('.pocket-chip').forEach(chip => {
        chip.classList.remove('selected');
    });
    const selected = document.querySelector(`.pocket-chip[data-id="${id}"]`);
    if (selected) selected.classList.add('selected');
}


// ==============================
// 🎯 RENDER POCKET SELECTOR
// ==============================
function renderPocketSelector() {

    const container = document.getElementById('pocketSelector');
    if (!container) return;

    if (pockets.length === 0) {
        container.innerHTML = `<p style="color:#aaa; font-size:0.85rem; grid-column: 1/-1;">No pockets yet. Create one first!</p>`;
        return;
    }

    container.innerHTML = pockets.map(p => {
        const isSelected = selectedPocketId === p.id;
        return `
        <div class="pocket-chip ${isSelected ? 'selected' : ''}" data-id="${p.id}" onclick="selectPocketChip('${p.id}')">
            <div class="pocket-chip-icon" style="background: ${p.color || '#f5f5f5'}20;">
                ${renderIcon(p.icon)}
            </div>
            <span>${p.name}</span>
        </div>
    `}).join('');
}


// ==============================
// 🔀 SET TRANSACTION TYPE
// ==============================
function setTxType(type) {
    currentTxType = type;

    const btnIn = document.getElementById('btnIn');
    const btnOut = document.getElementById('btnOut');
    const submitBtn = document.getElementById('submitTxBtn');

    btnIn.className = 'type-btn' + (type === 'in' ? ' active-in' : '');
    btnOut.className = 'type-btn' + (type === 'out' ? ' active-out' : '');

    if (type === 'in') {
        submitBtn.className = 'submit-btn btn-in';
        submitBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Add Funds';
    } else {
        submitBtn.className = 'submit-btn btn-out';
        submitBtn.innerHTML = '<i class="bi bi-dash-circle"></i> Spend';
    }
}


// ==============================
// ➕ ADD POCKET MODAL
// ==============================
function showAddPocketModal() {
    editingPocketId = null;
    document.getElementById('modalTitle').textContent = 'Add Wallet';
    document.getElementById('editPocketName').value = '';
    document.getElementById('editPocketIcon').value = 'bi-wallet-fill';
    document.getElementById('iconPreview').innerHTML = '<i class="bi bi-wallet-fill" style="font-size:1.4rem;"></i>';
    document.getElementById('deleteBtn').style.display = 'none';
    document.getElementById('editModal').style.display = 'flex';

    // Reset icon picker selection
    document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('selected'));
    const defaultIcon = document.querySelector('.icon-option[data-icon="bi-wallet-fill"]');
    if (defaultIcon) defaultIcon.classList.add('selected');
}


// ==============================
// ✏️ EDIT POCKET (click on card)
// ==============================
function editPocket(pocketId) {
    const pocket = pockets.find(p => p.id === pocketId);
    if (!pocket) return;

    editingPocketId = pocketId;
    document.getElementById('modalTitle').textContent = 'Edit Wallet';
    document.getElementById('editPocketName').value = pocket.name;
    document.getElementById('editPocketIcon').value = pocket.icon || 'bi-wallet-fill';
    document.getElementById('deleteBtn').style.display = 'block';
    document.getElementById('editModal').style.display = 'flex';

    // Update icon preview
    const icon = pocket.icon || 'bi-wallet-fill';
    document.getElementById('iconPreview').innerHTML = renderIcon(icon);
}


// ==============================
// 💾 SAVE POCKET (create or update)
// ==============================
async function savePocket() {
    const name = document.getElementById('editPocketName').value.trim();
    const icon = document.getElementById('editPocketIcon').value;
    if (getToken() === "guest-token") {
        if (editingPocketId) {
            const p = pockets.find(x => x.id === editingPocketId);
            if (p) {
                p.name = name;
                p.icon = icon;
            }
            showToastMsg("Wallet updated! (Guest Mode)", "success");
        } else {
            pockets.push({
                id: "gp" + Date.now(),
                name: name,
                icon: icon,
                current: 0,
                color: "#6C63FF",
                transactions: []
            });
            showToastMsg("Wallet created! (Guest Mode)", "success");
        }
        document.getElementById('editModal').style.display = 'none';
        renderPockets();
        renderPocketSelector();
        updateStats();
        return;
    }

    try {
        if (editingPocketId) {
            // UPDATE
            const res = await fetch(`${API_BASE}/pockets/${editingPocketId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer " + getToken()
                },
                body: JSON.stringify({
                    name: name,
                    icon: icon
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to update wallet");
            }

            showToastMsg("Wallet updated!", "success");
        } else {
            // CREATE
            const res = await fetch(`${API_BASE}/pockets`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer " + getToken()
                },
                body: JSON.stringify({
                    name: name,
                    icon: icon
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to create wallet");
            }

            showToastMsg("Wallet created!", "success");
        }

        document.getElementById('editModal').style.display = 'none';

        // Reload
        await loadPockets();
        renderPocketSelector();
        updateStats();

    } catch (error) {
        console.error(error);
        showToastMsg(error.message, "error");
    }
}


// ==============================
// 🗑 DELETE POCKET
// ==============================
function openConfirmDelete() {
    if (!editingPocketId) return;
    document.getElementById('confirmDeleteModal').style.display = 'flex';
}

async function proceedDelete() {
    if (!editingPocketId) return;
    document.getElementById('confirmDeleteModal').style.display = 'none';

    if (getToken() === "guest-token") {
        pockets = pockets.filter(p => p.id !== editingPocketId);
        showToastMsg("Pocket deleted (Guest Mode)", "success");
        document.getElementById('editModal').style.display = 'none';
        if (selectedPocketId === editingPocketId) selectedPocketId = null;
        renderPockets();
        renderPocketSelector();
        updateStats();
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/pockets/${editingPocketId}`, {
            method: "DELETE",
            headers: {
                Authorization: "Bearer " + getToken()
            }
        });

        if (!res.ok) {
            throw new Error("Failed to delete pocket");
        }

        showToastMsg("Pocket deleted", "success");
        document.getElementById('editModal').style.display = 'none';

        // Reset selection if deleted pocket was selected
        if (selectedPocketId === editingPocketId) {
            selectedPocketId = null;
        }

        await loadPockets();
        renderPocketSelector();
        updateStats();

    } catch (error) {
        console.error(error);
        showToastMsg(error.message, "error");
    }
}


// ==============================
// 😊 EMOJI PICKER
// ==============================
const ICON_LIST = [
    // Uang & Tabungan
    {icon: 'bi-wallet-fill', label: 'Wallet'},
    {icon: 'bi-cash-stack', label: 'Cash'},
    {icon: 'bi-credit-card-fill', label: 'Card'},
    {icon: 'bi-bank', label: 'Bank'},
    {icon: 'bi-piggy-bank-fill', label: 'Piggy'},
    {icon: 'bi-safe-fill', label: 'Safe'},
    // Makan & Minum
    {icon: 'bi-cup-hot-fill', label: 'Coffee'},
    {icon: 'bi-egg-fried', label: 'Food'},
    // Belanja
    {icon: 'bi-cart-fill', label: 'Cart'},
    {icon: 'bi-bag-fill', label: 'Shopping'},
    {icon: 'bi-basket-fill', label: 'Grocery'},
    {icon: 'bi-gift-fill', label: 'Gift'},
    // Transportasi
    {icon: 'bi-car-front-fill', label: 'Car'},
    {icon: 'bi-fuel-pump-fill', label: 'Fuel'},
    {icon: 'bi-bicycle', label: 'Bike'},
    {icon: 'bi-bus-front-fill', label: 'Bus'},
    {icon: 'bi-airplane-fill', label: 'Travel'},
    // Rumah & Tagihan
    {icon: 'bi-house-fill', label: 'Home'},
    {icon: 'bi-lightning-fill', label: 'Electric'},
    {icon: 'bi-wifi', label: 'Internet'},
    {icon: 'bi-tools', label: 'Repair'},
    {icon: 'bi-droplet-fill', label: 'Water'},
    // Hiburan
    {icon: 'bi-controller', label: 'Gaming'},
    {icon: 'bi-film', label: 'Movie'},
    {icon: 'bi-music-note-beamed', label: 'Music'},
    {icon: 'bi-tv-fill', label: 'TV'},
    // Pendidikan & Kesehatan
    {icon: 'bi-book-fill', label: 'Book'},
    {icon: 'bi-mortarboard-fill', label: 'Education'},
    {icon: 'bi-heart-pulse-fill', label: 'Health'},
    {icon: 'bi-hospital-fill', label: 'Hospital'},
    // Lainnya
    {icon: 'bi-phone-fill', label: 'Phone'},
    {icon: 'bi-laptop-fill', label: 'Laptop'},
    {icon: 'bi-person-fill', label: 'Personal'},
    {icon: 'bi-star-fill', label: 'Star'},
    {icon: 'bi-gem', label: 'Premium'},
    {icon: 'bi-trophy-fill', label: 'Goals'},
];

function initEmojiPicker() {
    const grid = document.getElementById('iconPickerGrid');
    if (!grid) return;

    grid.innerHTML = ICON_LIST.map(item => `
        <div class="icon-option" data-icon="${item.icon}" onclick="selectIcon('${item.icon}')" title="${item.label}">
            <i class="bi ${item.icon}"></i>
        </div>
    `).join('');
}

function selectIcon(iconClass) {
    document.getElementById('editPocketIcon').value = iconClass;
    document.getElementById('iconPreview').innerHTML = `<i class="bi ${iconClass}" style="font-size:1.4rem;"></i>`;

    document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('selected'));
    const selected = document.querySelector(`.icon-option[data-icon="${iconClass}"]`);
    if (selected) selected.classList.add('selected');
}


// ==============================
// 📷 ICON TABS (Emoji / Upload)
// ==============================
function switchIconTab(tab) {
    const panelEmoji = document.getElementById('panelEmoji');
    const panelUpload = document.getElementById('panelUpload');
    const tabEmoji = document.getElementById('tabEmoji');
    const tabUpload = document.getElementById('tabUpload');

    if (tab === 'emoji') {
        panelEmoji.style.display = 'block';
        panelUpload.style.display = 'none';
        tabEmoji.style.background = 'var(--color-primary)';
        tabEmoji.style.color = 'white';
        tabEmoji.style.borderColor = 'var(--color-primary)';
        tabUpload.style.background = 'white';
        tabUpload.style.color = '#555';
        tabUpload.style.borderColor = '#ddd';
    } else {
        panelEmoji.style.display = 'none';
        panelUpload.style.display = 'block';
        tabUpload.style.background = 'var(--color-primary)';
        tabUpload.style.color = 'white';
        tabUpload.style.borderColor = 'var(--color-primary)';
        tabEmoji.style.background = 'white';
        tabEmoji.style.color = '#555';
        tabEmoji.style.borderColor = '#ddd';
    }
}

function handleIconUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const dataUrl = e.target.result;
        document.getElementById('editPocketIcon').value = dataUrl;
        document.getElementById('iconPreview').innerHTML =
            `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
    };
    reader.readAsDataURL(file);
}


// ==============================
// 📊 RECAP MODAL
// ==============================
function showRecapModal() {
    const modal = document.getElementById('recapModal');
    const content = document.getElementById('wrappedContent');

    let totalIn = 0;
    let totalOut = 0;
    let totalCurrent = 0;

    let walletRows = '';
    let allTxns = [];

    // Calculate Wallet Balances & aggregate transactions
    pockets.forEach(p => {
        totalCurrent += p.current;
        walletRows += `
            <tr>
                <td style="padding: 10px; text-align: left; border: 1px solid #e2e8f0; color: #334155;">
                    <i class="bi ${p.icon}" style="margin-right: 8px; color: #64748b;"></i> ${p.name}
                </td>
                <td style="padding: 10px; text-align: right; border: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">
                    ${formatIDR(p.current)}
                </td>
            </tr>
        `;

        // Collate transactions
        if (p.transactions) {
            p.transactions.forEach(tx => {
                allTxns.push({ ...tx, pocket_name: p.name });
                if (tx.type === 'in') totalIn += tx.amount;
                else if (tx.type === 'out') totalOut += Math.abs(tx.amount);
            });
        }
    });

    const net = totalIn - totalOut;
    const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const printedDate = new Date().toLocaleString();

    // Sort transactions by date (Desc)
    allTxns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    let transactionRows = '';
    if (allTxns.length === 0) {
        transactionRows = `<tr><td colspan="4" style="padding: 20px; text-align: center; border: 1px solid #e2e8f0; color: #94a3b8;">No transactions found for this period.</td></tr>`;
    } else {
        transactionRows = allTxns.map(tx => {
            const txDate = new Date(tx.created_at || new Date()).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
            const isInc = tx.type === 'in';
            return `
                <tr>
                    <td style="padding: 10px; text-align: left; border: 1px solid #e2e8f0; color: #475569; font-size: 11px;">${txDate}</td>
                    <td style="padding: 10px; text-align: left; border: 1px solid #e2e8f0; color: #334155;">${tx.pocket_name}</td>
                    <td style="padding: 10px; text-align: left; border: 1px solid #e2e8f0; color: #334155;">${tx.note || (isInc ? 'Income' : 'Expense')}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid #e2e8f0; color: ${isInc ? '#16a34a' : '#dc2626'}; font-weight: 600;">
                        ${isInc ? '+' : '-'}${formatIDR(tx.amount)}
                    </td>
                </tr>
            `;
        }).join('');
    }


    content.innerHTML = `
        <div style="font-family: 'Inter', sans-serif; width: 100%;">
            <!-- HEADER -->
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px;">
                <h1 style="font-size: 28px; color: #0f172a; margin: 0; font-weight: 800; letter-spacing: -0.5px;">Ngaturin</h1>
                <h2 style="font-size: 14px; color: #64748b; margin: 5px 0 0; letter-spacing: 2px;">ACCOUNT STATEMENT</h2>
                <p style="font-size: 13px; color: #94a3b8; margin: 8px 0 0;">Statement Period: <strong>${month}</strong></p>
            </div>

            <!-- SUMMARY SECTION -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 30px; padding: 25px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
                <div style="text-align: center; flex: 1;">
                    <p style="font-size: 11px; color: #64748b; margin: 0 0 5px; font-weight: 600; letter-spacing: 1px;">TOTAL INCOME</p>
                    <p style="font-size: 20px; font-weight: 700; color: #16a34a; margin: 0;">${formatIDR(totalIn)}</p>
                </div>
                <div style="text-align: center; flex: 1; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 0 20px;">
                    <p style="font-size: 11px; color: #64748b; margin: 0 0 5px; font-weight: 600; letter-spacing: 1px;">TOTAL EXPENSE</p>
                    <p style="font-size: 20px; font-weight: 700; color: #dc2626; margin: 0;">${formatIDR(totalOut)}</p>
                </div>
                <div style="text-align: center; flex: 1;">
                    <p style="font-size: 11px; color: #64748b; margin: 0 0 5px; font-weight: 600; letter-spacing: 1px;">NET CASH FLOW</p>
                    <p style="font-size: 20px; font-weight: 700; color: ${net >= 0 ? '#16a34a' : '#dc2626'}; margin: 0;">${formatIDR(net)}</p>
                </div>
            </div>

            <!-- WALLET SUMMARY -->
            <h3 style="font-size: 14px; color: #0f172a; margin-bottom: 12px; font-weight: 700; text-transform: uppercase;">Wallet Balances</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 13px;">
                <thead>
                    <tr style="background: #f1f5f9; color: #475569;">
                        <th style="padding: 12px; text-align: left; border: 1px solid #e2e8f0; font-weight: 600;">Fund Source / Wallet</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #e2e8f0; font-weight: 600;">Ending Balance</th>
                    </tr>
                </thead>
                <tbody>
                    ${walletRows || `<tr><td colspan="2" style="padding: 10px; border: 1px solid #e2e8f0; color:#94a3b8; text-align:center;">No active wallets</td></tr>`}
                </tbody>
                <tfoot>
                    <tr style="background: #f8fafc;">
                        <td style="padding: 12px; text-align: left; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">Total Available Assets</td>
                        <td style="padding: 12px; text-align: right; border: 1px solid #e2e8f0; font-weight: 800; color: #2563eb; font-size: 15px;">${formatIDR(totalCurrent)}</td>
                    </tr>
                </tfoot>
            </table>

            <!-- TRANSACTIONS LEDGER -->
            <h3 style="font-size: 14px; color: #0f172a; margin-bottom: 12px; font-weight: 700; text-transform: uppercase;">Transaction Ledger</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background: #f1f5f9; color: #475569;">
                        <th style="padding: 12px; text-align: left; border: 1px solid #e2e8f0; font-weight: 600;">Date</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #e2e8f0; font-weight: 600;">Wallet</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #e2e8f0; font-weight: 600;">Description</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #e2e8f0; font-weight: 600;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactionRows}
                </tbody>
            </table>

            <!-- FOOTER -->
            <div style="margin-top: 60px; padding-top: 20px; border-top: 1px dashed #cbd5e1; text-align: center; font-size: 10px; color: #94a3b8;">
                <p style="margin: 0 0 4px;">This statement is generated automatically by Ngaturin App and serves as a digital record of reported transactions.</p>
                <p style="margin: 0;">Printed on: ${printedDate}</p>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeRecapModal() {
    document.getElementById('recapModal').style.display = 'none';
}

function downloadPDF() {
    const element = document.getElementById('wrappedContent');
    const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Temporarily adjust styles for pure PDF layout if necessary
    const opt = {
        margin:       [0.4, 0.4, 0.4, 0.4],
        filename:     `Ngaturin-Account-Statement-${month}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        showToastMsg("PDF Generated Successfully", "success");
    }).catch(err => {
        console.error(err);
        showToastMsg("Failed to generate PDF", "error");
    });
}


// ==============================
// 🔔 TOAST
// ==============================
function showToastMsg(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type;

    // Show
    setTimeout(() => toast.classList.add('show'), 10);

    // Hide after 3s
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}