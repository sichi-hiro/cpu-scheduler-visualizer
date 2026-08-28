document.addEventListener('DOMContentLoaded', () => {
  const PROCESS_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
  let processCount = 0;

  // Form Controls
  const algorithmSelect = document.getElementById('algorithm-select');
  const quantumGroup = document.getElementById('quantum-group');
  const processList = document.getElementById('process-list');
  const addProcessBtn = document.getElementById('add-process-btn');
  const runBtn = document.getElementById('run-btn');
  const simulationSection = document.getElementById('simulation-section');

  // Simulation Controls & Displays
  const playBtn = document.getElementById('play-btn');
  const stepBtn = document.getElementById('step-btn');
  const resetBtn = document.getElementById('reset-btn');
  const speedSlider = document.getElementById('speed-slider');
  const speedLabel = document.getElementById('speed-label');
  const clockDisplay = document.getElementById('clock-display');
  const activeCpu = document.getElementById('active-cpu');
  const readyQueueEl = document.getElementById('ready-queue');
  const chartEl = document.getElementById('gantt-chart');
  const timelineEl = document.getElementById('gantt-timeline');
  const metricsBody = document.getElementById('metrics-body');

  // Toggle Quantum input visibility based on algorithm
  algorithmSelect.addEventListener('change', () => {
    quantumGroup.style.display = algorithmSelect.value === 'RR' ? 'flex' : 'none';
  });

  // Adjust simulation tick speed dynamically
  speedSlider.addEventListener('input', (e) => {
    speedLabel.innerText = `${e.target.value}ms`;
    if (isRunning) {
      clearInterval(timer);
      timer = setInterval(stepSimulation, parseInt(speedSlider.value, 10));
    }
  });

  // Dynamic process row creation
  function addProcessRow(pid = `P${processCount + 1}`, at = 0, bt = 4) {
    processCount++;
    const tr = document.createElement('tr');
    tr.id = `row-${pid}`;
    tr.innerHTML = `
      <td><strong>${pid}</strong></td>
      <td><input type="number" class="input-at" min="0" value="${at}" /></td>
      <td><input type="number" class="input-bt" min="1" value="${bt}" /></td>
      <td><button class="btn danger" type="button" onclick="removeProcess('${tr.id}')">Delete</button></td>
    `;
    processList.appendChild(tr);
  }

  window.removeProcess = function (rowId) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
  };

  addProcessBtn.addEventListener('click', () => addProcessRow());

  // Default initial processes
  addProcessRow('P1', 0, 5);
  addProcessRow('P2', 1, 3);
  addProcessRow('P3', 2, 8);
  addProcessRow('P4', 3, 6);

  // -------------------------------------------------------------
  // SIMULATION ENGINE (Step Generator)
  // -------------------------------------------------------------

  let simSteps = [];
  let currentStepIdx = 0;
  let isRunning = false;
  let timer = null;
  let totalSimTime = 0;

  runBtn.addEventListener('click', () => {
    loadSimulation();
  });

  function loadSimulation() {
    pauseSimulation();
    currentStepIdx = 0;
    simSteps = [];

    const baseProcesses = [];
    const rows = processList.querySelectorAll('tr');
    rows.forEach((row) => {
      const pid = row.cells[0].innerText.trim();
      const at = parseInt(row.querySelector('.input-at').value, 10) || 0;
      const bt = parseInt(row.querySelector('.input-bt').value, 10) || 1;
      baseProcesses.push({ id: pid, at, bt });
    });

    if (baseProcesses.length === 0) return;

    const algo = algorithmSelect.value;
    const quantum = parseInt(document.getElementById('time-quantum').value, 10) || 2;

    simSteps = generateSimulationSteps(baseProcesses, algo, quantum);
    totalSimTime = simSteps.length > 0 ? simSteps[simSteps.length - 1].time : 0;

    simulationSection.style.display = 'block';
    renderStep(0);
  }

  function generateSimulationSteps(inputProcesses, algo, quantum) {
    const processes = inputProcesses.map((p) => ({
      id: p.id,
      at: p.at,
      bt: p.bt,
      remaining: p.bt,
      ct: 0,
      tat: 0,
      wt: 0,
    }));

    const steps = [];
    let time = 0;
    let readyQueue = [];
    let activeProcess = null;
    let currentSlice = 0;
    let completed = 0;
    const total = processes.length;
    let historyGantt = [];
    const queuedSet = new Set();

    while (completed < total) {
      // 1. Arriving processes at current time
      processes.forEach((p) => {
        if (p.at <= time && !queuedSet.has(p.id)) {
          readyQueue.push(p);
          queuedSet.add(p.id);
        }
      });

      // 2. Pick next process if CPU is free
      if (!activeProcess && readyQueue.length > 0) {
        activeProcess = readyQueue.shift();
        currentSlice = 0;
      }

      const runningId = activeProcess ? activeProcess.id : 'IDLE';

      // 3. Record Gantt chart timeline block
      if (historyGantt.length === 0 || historyGantt[historyGantt.length - 1].id !== runningId) {
        historyGantt.push({ id: runningId, start: time, end: time + 1 });
      } else {
        historyGantt[historyGantt.length - 1].end = time + 1;
      }

      // 4. Advance clock by 1 unit
      time++;

      if (activeProcess) {
        activeProcess.remaining--;
        currentSlice++;

        if (activeProcess.remaining === 0) {
          activeProcess.ct = time;
          activeProcess.tat = activeProcess.ct - activeProcess.at;
          activeProcess.wt = activeProcess.tat - activeProcess.bt;
          completed++;
          activeProcess = null;
          currentSlice = 0;
        } else if (algo === 'RR' && currentSlice === quantum) {
          // Check for arrivals before rotating the current process back to the queue
          processes.forEach((p) => {
            if (p.at <= time && !queuedSet.has(p.id)) {
              readyQueue.push(p);
              queuedSet.add(p.id);
            }
          });
          readyQueue.push(activeProcess);
          activeProcess = null;
          currentSlice = 0;
        }
      }

      // Save complete snapshot
      steps.push({
        time: time,
        activeId: runningId,
        readyQueue: readyQueue.map((p) => p.id),
        processes: JSON.parse(JSON.stringify(processes)),
        gantt: JSON.parse(JSON.stringify(historyGantt)),
        completedCount: completed,
      });
    }

    return steps;
  }

  // -------------------------------------------------------------
  // RENDER ENGINE
  // -------------------------------------------------------------

  function renderStep(idx) {
    if (idx < 0 || idx >= simSteps.length) return;
    const state = simSteps[idx];

    // Clock
    clockDisplay.innerText = state.time;

    // CPU Core
    if (state.activeId === 'IDLE') {
      activeCpu.className = 'cpu-slot empty';
      activeCpu.innerText = 'IDLE';
      activeCpu.style.backgroundColor = '';
    } else {
      activeCpu.className = 'cpu-slot active';
      activeCpu.innerText = state.activeId;
      const colorIndex = parseInt(state.activeId.replace(/\D/g, ''), 10) % PROCESS_COLORS.length;
      activeCpu.style.backgroundColor = PROCESS_COLORS[colorIndex] || '#10b981';
    }

    // Ready Queue
    readyQueueEl.innerHTML = '';
    if (state.readyQueue.length === 0) {
      readyQueueEl.innerHTML = '<em>Queue Empty</em>';
    } else {
      state.readyQueue.forEach((pid) => {
        const qDiv = document.createElement('div');
        qDiv.classList.add('queue-item');
        const colorIndex = parseInt(pid.replace(/\D/g, ''), 10) % PROCESS_COLORS.length;
        qDiv.style.backgroundColor = PROCESS_COLORS[colorIndex] || '#3b82f6';
        qDiv.innerText = pid;
        readyQueueEl.appendChild(qDiv);
      });
    }

    // Gantt Chart
    chartEl.innerHTML = '';
    timelineEl.innerHTML = '';

    state.gantt.forEach((block, bIdx) => {
      const duration = block.end - block.start;
      const widthPct = (duration / totalSimTime) * 100;

      const b = document.createElement('div');
      b.classList.add('gantt-block');
      if (block.id === 'IDLE') {
        b.classList.add('idle');
        b.innerText = 'Idle';
      } else {
        b.innerText = block.id;
        const colorIndex = parseInt(block.id.replace(/\D/g, ''), 10) % PROCESS_COLORS.length;
        b.style.backgroundColor = PROCESS_COLORS[colorIndex] || '#3b82f6';
      }
      b.style.width = `${widthPct}%`;
      chartEl.appendChild(b);

      if (bIdx === 0) addTimeMarker(timelineEl, block.start, 0);
      addTimeMarker(timelineEl, block.end, (block.end / totalSimTime) * 100);
    });

    // Metrics Table
    metricsBody.innerHTML = '';
    let totalTAT = 0;
    let totalWT = 0;
    let finishedCount = 0;

    state.processes.forEach((p) => {
      const isDone = p.remaining === 0;
      if (isDone) {
        totalTAT += p.tat;
        totalWT += p.wt;
        finishedCount++;
      }
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${p.id}</strong></td>
        <td>${p.at}</td>
        <td>${p.bt}</td>
        <td>${p.remaining}</td>
        <td>${isDone ? p.ct : '-'}</td>
        <td>${isDone ? p.tat : '-'}</td>
        <td>${isDone ? p.wt : '-'}</td>
      `;
      metricsBody.appendChild(tr);
    });

    // Summary Cards
    if (finishedCount === state.processes.length) {
      const avgTat = (totalTAT / finishedCount).toFixed(2);
      const avgWt = (totalWT / finishedCount).toFixed(2);
      const totalIdle = state.gantt
        .filter((b) => b.id === 'IDLE')
        .reduce((sum, b) => sum + (b.end - b.start), 0);
      const util = (((state.time - totalIdle) / state.time) * 100).toFixed(1);

      document.getElementById('avg-tat').innerText = `${avgTat} ms`;
      document.getElementById('avg-wt').innerText = `${avgWt} ms`;
      document.getElementById('cpu-util').innerText = `${util}%`;
    } else {
      document.getElementById('avg-tat').innerText = '-';
      document.getElementById('avg-wt').innerText = '-';
      document.getElementById('cpu-util').innerText = '-';
    }
  }

  function addTimeMarker(container, timeValue, leftPct) {
    const marker = document.createElement('span');
    marker.classList.add('gantt-time');
    marker.innerText = timeValue;
    marker.style.left = `${leftPct}%`;
    container.appendChild(marker);
  }

  // -------------------------------------------------------------
  // SIMULATION CONTROLS
  // -------------------------------------------------------------

  function stepSimulation() {
    if (currentStepIdx < simSteps.length - 1) {
      currentStepIdx++;
      renderStep(currentStepIdx);
    } else {
      pauseSimulation();
    }
  }

  function startSimulation() {
    if (currentStepIdx >= simSteps.length - 1) {
      currentStepIdx = 0;
    }
    isRunning = true;
    playBtn.innerText = '⏸ Pause';
    timer = setInterval(stepSimulation, parseInt(speedSlider.value, 10));
  }

  function pauseSimulation() {
    isRunning = false;
    playBtn.innerText = '▶ Play';
    clearInterval(timer);
  }

  playBtn.addEventListener('click', () => {
    if (isRunning) {
      pauseSimulation();
    } else {
      startSimulation();
    }
  });

  stepBtn.addEventListener('click', () => {
    pauseSimulation();
    stepSimulation();
  });

  resetBtn.addEventListener('click', () => {
    pauseSimulation();
    currentStepIdx = 0;
    renderStep(0);
  });
});