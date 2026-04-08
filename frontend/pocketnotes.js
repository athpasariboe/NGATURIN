// ==============================
// 🔐 AUTH HELPER
// ==============================
function getToken() {
    return localStorage.getItem("token");
}


// ==============================
// 📦 GLOBAL STATE
// ==============================
var pockets = [];
var currentTxType = 'in';
var selectedPocketId = null;


// ==============================
// 🌐 API — LOAD TRANSACTIONS
// ==============================
async function loadTransactionsForPocket(pocketId) {
    const res = await fetch(`http://127.0.0.1:8000/api/pockets/${pocketId}/transactions`, {
        headers: {
            Authorization: "Bearer " + getToken()
        }
    });

    return await res.json();
}


// ==============================
// 🌐 API — LOAD POCKETS
// ==============================
async function loadPockets() {

    const res = await fetch("http://127.0.0.1:8000/api/pockets", {
        headers: {
            Authorization: "Bearer " + getToken()
        }
    });

    pockets = await res.json();

    // attach transactions
    for (let p of pockets) {
        p.transactions = await loadTransactionsForPocket(p.id);
    }

    console.log("FINAL DATA:", pockets);

    renderPockets();
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
});


// ==============================
// 💸 SUBMIT TRANSACTION
// ==============================
async function submitTransaction() {

    if (!selectedPocketId) {
        alert("Select a pocket first");
        return;
    }

    const amount = Number(document.getElementById('txAmount').value);
    const note = document.getElementById('txNote').value;

    if (!amount || amount <= 0) {
        alert("Invalid amount");
        return;
    }

    await fetch("http://127.0.0.1:8000/api/transactions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken()
        },
        body: JSON.stringify({
            pocket_id: selectedPocketId,
            amount: amount,
            type: currentTxType,
            note: note
        })
    });

    // clear form
    document.getElementById('txAmount').value = '';
    document.getElementById('txNote').value = '';

    // reload data
    await loadPockets();
    renderPocketSelector();
    updateStats();
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
            if (tx.amount > 0) totalIncome += tx.amount;
            else totalExpense += Math.abs(tx.amount);
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
function renderPockets() {

    const grid = document.getElementById('pocketsGrid');
    if (!grid) return;

    grid.innerHTML = pockets.map(p => {

        const percentage = p.target
            ? Math.min(100, Math.round((p.current / p.target) * 100))
            : 0;

        const txns = (p.transactions || []).slice(-3).reverse();

        return `
        <div class="pocket-card">
            <h3>${p.name}</h3>
            <p>${formatIDR(p.current)}</p>
            <p>${percentage}%</p>

            ${txns.length
                ? txns.map(tx => `
                    <div>
                        ${tx.note} (${formatIDR(tx.amount)})
                    </div>
                `).join('')
                : "<small>No transactions</small>"
            }
        </div>
        `;
    }).join('');
}


// ==============================
// 🎯 SELECT POCKET
// ==============================
function selectPocketChip(id) {
    selectedPocketId = id;
}


// ==============================
// 🎯 RENDER SELECTOR
// ==============================
function renderPocketSelector() {

    const container = document.getElementById('pocketSelector');
    if (!container) return;

    container.innerHTML = pockets.map(p => `
        <button onclick="selectPocketChip('${p.id}')">
            ${p.name}
        </button>
    `).join('');
}