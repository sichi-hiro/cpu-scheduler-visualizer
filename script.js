// Color palette generator for processes
const PROCESS_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
];

let processCount = 0;

// UI Elements
const algorithmSelect = document.getElementById("algorithm-select");
const quantumGroup = document.getElementById("quantum-group");
const processList = document.getElementById("process-list");
const addProcessBtn = document.getElementById("add-process-btn");
const runBtn = document.getElementById("run-btn");
const resultsSection = document.getElementById("results-section");

// Algorithm Switch
algorithmSelect.addEventListener("change", () => {
  quantumGroup.style.display = algorithmSelect.value === "RR" ? "flex" : "none";
});

// Add Process Row
function addProcessRow(pid = `P${processCount + 1}`, at = 0, bt = 4) {
  processCount++;
  const tr = document.createElement("tr");
  tr.id = `row-${pid}`;
  tr.innerHTML = `
    <td><strong>${pid}</strong></td>
    <td><input type="number" class="input-at" min="0" value="${at}" /></td>
    <td><input type="number" class="input-bt" min="1" value="${bt}" /></td>
    <td><button class="btn danger" onclick="removeProcess('${tr.id}')">Delete</button></td>
  `;
  processList.appendChild(tr);
}

window.removeProcess = function (rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
};

addProcessBtn.addEventListener("click", () => addProcessRow());

// Initialize default data
addProcessRow("P1", 0, 5);
addProcessRow("P2", 1, 3);
addProcessRow("P3", 2, 8);
addProcessRow("P4", 3, 6);

// Simulation Trigger
runBtn.addEventListener("click", () => {
  const processes = [];
  const rows = processList.querySelectorAll("tr");

  rows.forEach((row) => {
    const pid = row.cells[0].innerText.trim();
    const at = parseInt(row.querySelector(".input-at").value, 10) || 0;
    const bt = parseInt(row.querySelector(".input-bt").value, 10) || 1;
    processes.push({ id: pid, at, bt, remainingBt: bt });
  });

  if (processes.length === 0) return;

  const algo = algorithmSelect.value;
  let scheduleResult;

  if (algo === "FCFS") {
    scheduleResult = runFCFS(processes);
  } else if (algo === "RR") {
    const quantum =
      parseInt(document.getElementById("time-quantum").value, 10) || 2;
    scheduleResult = runRR(processes, quantum);
  }

  renderResults(scheduleResult);
});

// --- Scheduling Algorithms ---

function runFCFS(processes) {
  // Sort by Arrival Time
  const list = [...processes].sort((a, b) => a.at - b.at);
  const gantt = [];
  let currentTime = 0;
  let totalIdleTime = 0;

  list.forEach((p) => {
    if (currentTime < p.at) {
      gantt.push({ id: "IDLE", start: currentTime, end: p.at });
      totalIdleTime += p.at - currentTime;
      currentTime = p.at;
    }
    const start = currentTime;
    currentTime += p.bt;
    gantt.push({ id: p.id, start, end: currentTime });
    p.ct = currentTime;
    p.tat = p.ct - p.at;
    p.wt = p.tat - p.bt;
  });

  return { processes: list, gantt, totalTime: currentTime, totalIdleTime };
}

function runRR(processes, quantum) {
  const list = processes.map((p) => ({ ...p, ct: 0, tat: 0, wt: 0 }));
  const sorted = [...list].sort((a, b) => a.at - b.at);
  const gantt = [];
  const readyQueue = [];

  let currentTime = 0;
  let completed = 0;
  let totalIdleTime = 0;
  let i = 0;

  while (completed < sorted.length) {
    // Add arriving processes to ready queue
    while (i < sorted.length && sorted[i].at <= currentTime) {
      readyQueue.push(sorted[i]);
      i++;
    }

    if (readyQueue.length === 0) {
      if (i < sorted.length) {
        const nextArrival = sorted[i].at;
        gantt.push({ id: "IDLE", start: currentTime, end: nextArrival });
        totalIdleTime += nextArrival - currentTime;
        currentTime = nextArrival;
        continue;
      }
      break;
    }

    const currentProcess = readyQueue.shift();
    const executeTime = Math.min(currentProcess.remainingBt, quantum);
    const start = currentTime;
    currentTime += executeTime;
    currentProcess.remainingBt -= executeTime;

    gantt.push({ id: currentProcess.id, start, end: currentTime });

    // Check for arrivals during this execution slice
    while (i < sorted.length && sorted[i].at <= currentTime) {
      readyQueue.push(sorted[i]);
      i++;
    }

    if (currentProcess.remainingBt > 0) {
      readyQueue.push(currentProcess);
    } else {
      completed++;
      currentProcess.ct = currentTime;
      currentProcess.tat = currentProcess.ct - currentProcess.at;
      currentProcess.wt = currentProcess.tat - currentProcess.bt;
    }
  }

  return { processes: sorted, gantt, totalTime: currentTime, totalIdleTime };
}

// --- Render Engine ---

function renderResults({ processes, gantt, totalTime, totalIdleTime }) {
  resultsSection.style.display = "block";

  // 1. Render Gantt Chart
  const chartEl = document.getElementById("gantt-chart");
  const timelineEl = document.getElementById("gantt-timeline");
  chartEl.innerHTML = "";
  timelineEl.innerHTML = "";

  gantt.forEach((block, idx) => {
    const duration = block.end - block.start;
    const widthPct = (duration / totalTime) * 100;

    const blockDiv = document.createElement("div");
    blockDiv.classList.add("gantt-block");
    if (block.id === "IDLE") {
      blockDiv.classList.add("idle");
      blockDiv.innerText = "Idle";
    } else {
      blockDiv.innerText = block.id;
      const colorIndex =
        parseInt(block.id.replace(/\D/g, ""), 10) % PROCESS_COLORS.length;
      blockDiv.style.backgroundColor = PROCESS_COLORS[colorIndex] || "#3b82f6";
    }
    blockDiv.style.width = `${widthPct}%`;
    chartEl.appendChild(blockDiv);

    // Add starting time marker
    if (idx === 0) {
      addTimeMarker(timelineEl, block.start, 0);
    }
    addTimeMarker(timelineEl, block.end, (block.end / totalTime) * 100);
  });

  // 2. Render Performance Metrics Table
  const tbody = document.getElementById("metrics-body");
  tbody.innerHTML = "";

  let totalTAT = 0;
  let totalWT = 0;

  processes.forEach((p) => {
    totalTAT += p.tat;
    totalWT += p.wt;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${p.id}</strong></td>
      <td>${p.at}</td>
      <td>${p.bt}</td>
      <td>${p.ct}</td>
      <td>${p.tat}</td>
      <td>${p.wt}</td>
    `;
    tbody.appendChild(tr);
  });

  // 3. Render Summary Stats
  const avgTat = (totalTAT / processes.length).toFixed(2);
  const avgWt = (totalWT / processes.length).toFixed(2);
  const cpuUtilization = (
    ((totalTime - totalIdleTime) / totalTime) *
    100
  ).toFixed(1);

  document.getElementById("avg-tat").innerText = `${avgTat} ms`;
  document.getElementById("avg-wt").innerText = `${avgWt} ms`;
  document.getElementById("cpu-util").innerText = `${cpuUtilization}%`;
}

function addTimeMarker(container, timeValue, leftPct) {
  const marker = document.createElement("span");
  marker.classList.add("gantt-time");
  marker.innerText = timeValue;
  marker.style.left = `${leftPct}%`;
  container.appendChild(marker);
}
