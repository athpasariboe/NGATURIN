// ========================================
// GOAL SAVER - STATE
// ========================================

let userGoals = [];
let activeGoalId = null;

const API_URL = "http://127.0.0.1:8000/api";


// ========================================
// GET TOKEN
// ========================================

function getToken() {
    return localStorage.getItem("token");
}


// ========================================
// FORMAT NUMBER
// ========================================

function formatNumber(num) {
    return Math.round(num).toLocaleString("id-ID");
}

// ========================================
// FORMAT RUPIAH INPUT
// Example: 1000000 → 1.000.000
// ========================================
function formatRupiahInput(value) {

    // Remove all non-numeric characters
    let number = value.replace(/\D/g, "");

    // Add dot separator every 3 digits
    return number.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}


// ========================================
// CALCULATE SAVINGS PLAN
// ========================================

function calculateSavings() {

    const raw = document.getElementById("targetAmount").value;
    const targetAmount = Number(raw.replace(/\./g, ""));
    const deadline = document.getElementById("deadline").value;

    if (!targetAmount || !deadline) {
        document.getElementById("calculationDisplay").classList.remove("active");
        return;
    }

    const today = new Date();
    const deadlineDate = new Date(deadline);

    today.setHours(0,0,0,0);
    deadlineDate.setHours(0,0,0,0);

    const diffTime = deadlineDate - today;
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 0) {
        alert("Deadline must be in the future");
        return;
    }

    const daily = targetAmount / daysRemaining;
    const weekly = daily * 7;
    const monthly = daily * 30;

    let html = "";

    html += `📅 Save Rp ${formatNumber(daily)} per day<br>`;

    if (daysRemaining > 7) {
        html += `📅 Save Rp ${formatNumber(weekly)} per week<br>`;
    }

    if (daysRemaining > 30) {
        html += `📅 Save Rp ${formatNumber(monthly)} per month`;
    }

    document.getElementById("calculationDisplay").innerHTML =
        `<h4 style="color: var(--color-primary); margin-bottom:8px;">💡 Your Recommended Savings Plan</h4>${html}`;

    document.getElementById("calculationDisplay").classList.add("active");
}


// ========================================
// CREATE GOAL
// ========================================

document.getElementById("createGoalForm")
.addEventListener("submit", async function(e){

    e.preventDefault();

    const goalName = document.getElementById("goalName").value;
    // Remove dot separator before converting to number
    const rawTarget = document.getElementById("targetAmount").value;

    // Convert formatted string to number
    const targetAmount = Number(rawTarget.replace(/\./g, ""));

    try{

        const response = await fetch(`${API_URL}/goals`,{

            method:"POST",

            headers:{
                "Content-Type":"application/json",
                "Authorization":"Bearer "+getToken()
            },

            body:JSON.stringify({
                title:goalName,
                target_amount:targetAmount
            })

        });

        if(!response.ok){
            throw new Error("Failed to create goal");
        }

        alert("Goal created successfully!");

        document.getElementById("createGoalForm").reset();

        loadGoals();

    }
    catch(error){

        console.error(error);
        alert("Error creating goal");

    }

});


// ========================================
// LOAD GOALS
// ========================================

async function loadGoals(){

    try{

        const response = await fetch(`${API_URL}/goals`,{

            method:"GET",

            headers:{
                "Authorization":"Bearer "+getToken()
            }

        });

        const goals = await response.json();

        userGoals = goals;

        renderGoals();

    }
    catch(error){

        console.error(error);

    }

}


// ========================================
// RENDER GOALS
// ========================================

function renderGoals(){

    const goalsList = document.getElementById("goalsList");

    if(userGoals.length === 0){

        goalsList.innerHTML = `
        <p style="text-align:center;color:var(--color-text-light)">
        No goals yet. Create your first goal!
        </p>
        `;

        updateDashboardSummary();

        return;
    }

    goalsList.innerHTML = userGoals.map(goal=>{

        const saved = goal.current_amount || 0;

        const progress = Math.min((saved / goal.target_amount) * 100, 100);

        return `

<div class="goal-item">

<div class="goal-info">

<h4>${goal.title}</h4>

<div class="goal-meta">
🎯 Rp ${formatNumber(goal.target_amount)}
</div>

<div class="progress-bar">

<div class="progress-fill"
style="width:${progress}%">

${Math.round(progress)}%

</div>

</div>

<p>Saved: Rp ${formatNumber(saved)}</p>
${progress >= 100 ? `
<div class="goal-complete">
    🎉 Goal Completed!
</div>
` : ""}

<div class="savings-history">

<h5>History</h5>

<div id="history-${goal.id}">
Loading history...
</div>

</div>
</div>

<div class="goal-actions">

${progress < 100 ? `
<button class="btn btn-primary btn-small"
onclick="openSavingsModal('${goal.id}')">
💰 Add Savings
</button>
` : `
<button class="btn btn-primary btn-small" disabled>
✔ Completed
</button>
`}

<button class="btn btn-secondary btn-small"
onclick="openDeleteModal('${goal.id}')">
🗑 Delete
</button>

</div>

</div>
`;

    }).join("");
    updateDashboardSummary();
    userGoals.forEach(goal => {
    loadSavingsHistory(goal.id);
});

}

// DASHBOARD SUMMARY

function updateDashboardSummary(){

    let totalSaved = 0;
    let completed = 0;

    userGoals.forEach(goal=>{

        const saved = goal.current_amount || 0;

        totalSaved += saved;

        if(saved >= goal.target_amount){
            completed++;
        }

    });

    document.getElementById("totalSaved").innerText =
        "Rp " + formatNumber(totalSaved);

    document.getElementById("totalGoals").innerText =
        userGoals.length;

    document.getElementById("completedGoals").innerText =
        completed;

}

// ========================================
// MODAL CONTROL
// ========================================

function openSavingsModal(goalId){

    activeGoalId = goalId;

    const goal = userGoals.find(g => g.id === goalId);

    const remaining = goal.target_amount - (goal.current_amount || 0);

    const input = document.getElementById("savingsAmount");
    const errorBox = document.getElementById("savingsError");

    errorBox.innerText = "";

    input.placeholder = "Max: Rp " + formatNumber(remaining);

    document.getElementById("savingsModal").style.display = "flex";

    input.focus();
}

//    document.getElementById("savingsAmount").focus();

function closeSavingsModal(){

    document.getElementById("savingsModal").style.display = "none";

    document.getElementById("savingsAmount").value = "";
    document.getElementById("savingsError").innerText = "";

}


// ========================================
// SUBMIT SAVINGS
// ========================================

async function submitSavings(){
    
    // Get formatted value from input
    const rawValue = document.getElementById("savingsAmount").value;

    // Convert to number by removing dots
    const amount = Number(rawValue.replace(/\./g, ""));
    const errorBox = document.getElementById("savingsError");

    errorBox.innerText = "";

    if(!rawValue || amount <= 0)
    if(amount <= 0){
        errorBox.innerText = "Enter a valid amount";
        return;
    }

    const goal = userGoals.find(g => g.id === activeGoalId);

    const saved = goal.current_amount || 0;
    const remaining = goal.target_amount - saved;

    if(amount > remaining){
        errorBox.innerText =
            "Maximum allowed: Rp " + formatNumber(remaining);
        return;
    }

    try{

        const response = await fetch(
            `${API_URL}/goals/${activeGoalId}`,
            {
                method:"PUT",
                headers:{
                    "Content-Type":"application/json",
                    "Authorization":"Bearer "+getToken()
                },
                body: JSON.stringify({
                    amount: amount
                })
            }
        );

        if(!response.ok){
            throw new Error("Update failed");
        }

        closeSavingsModal();
        loadGoals();

    }
    catch(error){
        console.error(error);
        alert("Error updating savings");
    }

    if(!goal){
    console.error("Goal not found");
    return;
}

}

document.getElementById("savingsAmount")
.addEventListener("keydown", function(e){
    if(e.key === "Enter"){
        submitSavings();
    }
});

// ========================================
// FORMAT TARGET AMOUNT INPUT
// Automatically formats input while typing
// ========================================
document.getElementById("targetAmount")
.addEventListener("input", function(){

    // Format the input value into Rupiah format
    this.value = formatRupiahInput(this.value);

});

// ========================================
// FORMAT SAVINGS INPUT
// Formats savings input inside modal
// ========================================
document.getElementById("savingsAmount")
.addEventListener("input", function(){

    // Format input into Rupiah format
    this.value = formatRupiahInput(this.value);

    const errorBox = document.getElementById("savingsError");
    errorBox.innerText = "";

});

// ========================================
// AUTO LOAD
// ========================================

loadGoals();

// ========================================
// DELETE MODAL CONTROL
// ========================================

function openDeleteModal(goalId){

    activeGoalId = goalId;

    document.getElementById("deleteModal").style.display = "flex";

}

function closeDeleteModal(){

    document.getElementById("deleteModal").style.display = "none";

}

// ========================================
// CONFIRM DELETE GOAL
// ========================================

async function confirmDeleteGoal(){

    try{

        const response = await fetch(
            `${API_URL}/goals/${activeGoalId}`,
            {
                method: "DELETE",
                headers:{
                    "Authorization":"Bearer "+getToken()
                }
            }
        );

        if(!response.ok){
            throw new Error("Delete failed");
        }

        closeDeleteModal();

        loadGoals();

    }
    catch(error){

        console.error(error);
        alert("Error deleting goal");

    }

}

// LOAD SAVINGS HISTORY

async function loadSavingsHistory(goalId){

    try{

        const response = await fetch(
            `${API_URL}/goals/${goalId}/savings`,
            {
                headers:{
                    "Authorization":"Bearer "+getToken()
                }
            }
        );

        const savings = await response.json();

        const container = document.getElementById(`history-${goalId}`);

        if(!container){
            return;
        }

        if(savings.length === 0){

            container.innerHTML = `<p>No savings yet</p>`;
            return;

        }

    const today = new Date();
today.setHours(0,0,0,0);

const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

let grouped = {
    today: [],
    yesterday: [],
    older: []
};

savings.forEach(s => {

    const date = new Date(s.created_at + "Z");

    const savingDate = new Date(date);
    savingDate.setHours(0,0,0,0);

    const formattedTime = date.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit"
    });

    const item = `
        <div class="saving-item">
            💰 + Rp ${formatNumber(s.amount)}
            <span class="saving-date">${formattedTime}</span>
        </div>
    `;

    if(savingDate.getTime() === today.getTime()){
        grouped.today.push(item);
    }
    else if(savingDate.getTime() === yesterday.getTime()){
        grouped.yesterday.push(item);
    }
    else{
        grouped.older.push(item);
    }

});

let html = "";

if(grouped.today.length){
    html += `<h6 class="history-title">Today</h6>` + grouped.today.join("");
}

if(grouped.yesterday.length){
    html += `<h6 class="history-title">Yesterday</h6>` + grouped.yesterday.join("");
}

if(grouped.older.length){
    html += `<h6 class="history-title">Older</h6>` + grouped.older.join("");
}

container.innerHTML = html;

    }
    catch(error){

        console.error(error);

    }

}