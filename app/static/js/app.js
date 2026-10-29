/**
 * BitAxeTool v2.3.0 - Modern iOS Liquid Glass Controller & Reactive Dashboard
 */

let socket = null;
let reconnectTimer = null;
let chartInstance = null;
let metricHistoryChartInstance = null;
let knownMiners = [];
let activeEditingIp = null;
let allLogs = [];
let currentLogFilter = "all";
let isMouseOverLogs = false;
let isChartVisible = true;
let currentTelemetry = [];
let lastTelemetryTimestamp = Date.now();
let activeHistoryMetric = "hashrate";
let activeHistoryHours = 24;

// Metric configuration for 24h history graphs
const METRIC_CONFIG = {
    hashrate: {
        title: "Total Hash Rate",
        unit: "TH/s",
        color: "#2997ff",
        bgGradient: "rgba(41, 151, 255, 0.15)",
        field: "hashrate_th",
        decimals: 3
    },
    power: {
        title: "Total Power",
        unit: "W",
        color: "#ff9500",
        bgGradient: "rgba(255, 149, 0, 0.15)",
        field: "power",
        decimals: 1
    },
    temp_asic: {
        title: "Avg ASIC Temperatur",
        unit: "°C",
        color: "#ff453a",
        bgGradient: "rgba(255, 69, 58, 0.15)",
        field: "temp_asic",
        decimals: 1
    },
    temp_vr: {
        title: "Avg VRM Temperatur",
        unit: "°C",
        color: "#ff9f0a",
        bgGradient: "rgba(255, 159, 10, 0.15)",
        field: "temp_vr",
        decimals: 1
    },
    efficiency: {
        title: "Avg Effizienz",
        unit: "J/TH",
        color: "#bf5af2",
        bgGradient: "rgba(191, 90, 242, 0.15)",
        field: "efficiency",
        decimals: 2
    },
    miners_count: {
        title: "Online Miners",
        unit: "Geräte",
        color: "#30d158",
        bgGradient: "rgba(48, 209, 88, 0.15)",
        field: "miners_count",
        decimals: 0
    }
};

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    initChart();
    initWebSocket();
    loadMiners();
    loadNetworkInfo();
    setupEventListeners();
    loadNotificationSettings();
    registerServiceWorker();

    // Start live relative timer ("Updated X secs ago")
    setInterval(updateRelativeTime, 1000);
});

// --- WebSocket Connection & Real-Time Streaming ---

function initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/live`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("WebSocket verbunden: Live-Stream aktiv.");
        updateConnectionStatus(true);
        if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
        }
    };

    socket.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === "init") {
                if (msg.telemetry) renderTelemetry(msg.telemetry);
                if (msg.logs) {
                    allLogs = msg.logs;
                    renderFilteredLogs();
                }
            } else if (msg.type === "telemetry") {
                renderTelemetry(msg.data);
            } else if (msg.type === "log") {
                handleIncomingLog(msg.data);
            }
        } catch (e) {
            console.error("Fehler beim Parsen der WebSocket-Nachricht:", e);
        }
    };

    socket.onclose = () => {
        updateConnectionStatus(false);
        if (!reconnectTimer) {
            reconnectTimer = setInterval(initWebSocket, 2500);
        }
    };

    socket.onerror = (err) => {
        console.warn("WebSocket-Fehler:", err);
        socket.close();
    };
}

function updateConnectionStatus(connected) {
    const badge = document.getElementById("connection-badge");
    if (!badge) return;
    if (connected) {
        badge.textContent = "LIVE";
        badge.className = "ios-status-pill live";
        badge.title = "Echtzeit-Verbindung aktiv";
    } else {
        badge.textContent = "OFFLINE";
        badge.className = "ios-status-pill offline";
        badge.title = "Verbindung getrennt - verbinde neu...";
    }
}

// --- Live Telemetry Rendering & 6 Metric Cards ---

function renderTelemetry(telemetryList) {
    if (!telemetryList || !Array.isArray(telemetryList)) return;
    currentTelemetry = telemetryList;
    lastTelemetryTimestamp = Date.now();
    updateRelativeTime();

    // 1. Compute Global Aggregates
    let totalHashrate = 0;
    let totalWatts = 0;
    let sumAsicTemp = 0;
    let countAsicTemp = 0;
    let sumVrTemp = 0;
    let countVrTemp = 0;
    let onlineCount = 0;

    telemetryList.forEach(t => {
        if (t.connected) {
            onlineCount++;
            if (t.hash_rate && t.hash_rate > 0) totalHashrate += t.hash_rate;
            if (t.power && t.power > 0) totalWatts += t.power;
            if (t.temp && t.temp > 0) {
                sumAsicTemp += t.temp;
                countAsicTemp++;
            }
            if (t.vr_temp && t.vr_temp > 0) {
                sumVrTemp += t.vr_temp;
                countVrTemp++;
            }
        }
    });

    const avgAsicTemp = countAsicTemp > 0 ? (sumAsicTemp / countAsicTemp) : 0;
    const avgVrTemp = countVrTemp > 0 ? (sumVrTemp / countVrTemp) : 0;

    // 2. Populate 6 Metric Cards
    const elHash = document.getElementById("kpi-total-hashrate");
    const elWatts = document.getElementById("kpi-total-watts");
    const elAsicTemp = document.getElementById("kpi-max-temp");
    const elVrTemp = document.getElementById("kpi-avg-vr-temp");
    const elEff = document.getElementById("kpi-total-efficiency");
    const elCount = document.getElementById("kpi-miner-count");

    if (elHash) {
        elHash.textContent = (totalHashrate >= 1000) 
            ? (totalHashrate / 1000).toFixed(3) + " TH/s" 
            : Math.round(totalHashrate) + " GH/s";
    }
    if (elWatts) elWatts.textContent = totalWatts.toFixed(1) + " W";
    if (elAsicTemp) elAsicTemp.textContent = (avgAsicTemp > 0 ? avgAsicTemp.toFixed(1) : "--") + "°C";
    if (elVrTemp) elVrTemp.textContent = (avgVrTemp > 0 ? avgVrTemp.toFixed(1) : "--") + "°C";
    if (elCount) elCount.textContent = `${onlineCount}/${telemetryList.length}`;

    if (elEff) {
        if (totalHashrate > 50 && totalWatts > 0) {
            const eff = totalWatts / (totalHashrate / 1000.0);
            elEff.textContent = eff.toFixed(2) + " J/TH";
        } else {
            elEff.textContent = "-- J/TH";
        }
    }

    // 3. Update Live Line Chart
    if (isChartVisible) {
        updateChartData(totalHashrate, avgAsicTemp);
    }

    // 4. Update Miner Cards
    telemetryList.forEach(t => {
        updateMinerCard(t);
    });

    // 5. Smart Notification Triggers
    checkNotificationTriggers(telemetryList);
}

// Format difficulty hashes (e.g. 25020000000 -> 25.02 G)
function formatDifficulty(diff) {
    if (!diff || diff <= 0) return "--";
    if (typeof diff === "string") {
        if (diff.includes("G") || diff.includes("M") || diff.includes("T") || diff.includes("K")) return diff;
        diff = parseFloat(diff);
        if (isNaN(diff)) return "--";
    }
    if (diff >= 1e12) return (diff / 1e12).toFixed(2) + " T";
    if (diff >= 1e9) return (diff / 1e9).toFixed(2) + " G";
    if (diff >= 1e6) return (diff / 1e6).toFixed(2) + " M";
    if (diff >= 1e3) return (diff / 1e3).toFixed(2) + " K";
    return diff.toString();
}

function updateRelativeTime() {
    const el = document.getElementById("last-updated-text");
    if (!el) return;
    const diffSecs = Math.max(0, Math.floor((Date.now() - lastTelemetryTimestamp) / 1000));
    if (diffSecs <= 1) {
        el.textContent = "Updated just now";
    } else {
        el.textContent = `Updated ${diffSecs} secs ago`;
    }
}

function updateMinerCard(telemetry) {
    const safeId = telemetry.ip.replace(/\./g, "-");
    const card = document.getElementById(`miner-card-${safeId}`);
    if (!card) return;

    // Update Status Dot
    const dot = card.querySelector(".status-dot");
    if (dot) {
        if (!telemetry.connected) {
            dot.className = "status-dot offline";
        } else if (telemetry.governor_status === "EMERGENCY_THROTTLE") {
            dot.className = "status-dot throttling";
        } else {
            dot.className = "status-dot";
        }
    }

    // Update Governor Status & Message
    const govStatus = card.querySelector(".gov-status");
    const govMsg = card.querySelector(".gov-msg");

    if (govStatus) {
        const statusText = telemetry.governor_status || "IDLE";
        govStatus.textContent = statusText;
        govStatus.className = `gov-status ${statusText.toLowerCase()}`;
    }

    if (govMsg) {
        govMsg.textContent = telemetry.governor_message || "";
        govMsg.title = telemetry.governor_message || "";
    }

    // 1. Hashrate Tile
    const hrVal = card.querySelector(".card-val-hash");
    const hrSub = card.querySelector(".card-sub-hash");
    if (hrVal) {
        if (telemetry.hash_rate && telemetry.hash_rate > 0) {
            hrVal.textContent = (telemetry.hash_rate >= 1000) 
                ? (telemetry.hash_rate / 1000).toFixed(2) + " TH/s" 
                : Math.round(telemetry.hash_rate) + " GH/s";
        } else {
            hrVal.textContent = "--";
        }
    }
    if (hrSub && telemetry.expected_hash_rate) {
        const pct = telemetry.hash_rate ? Math.round((telemetry.hash_rate / telemetry.expected_hash_rate) * 100) : 0;
        hrSub.textContent = `Soll: ${Math.round(telemetry.expected_hash_rate)} GH/s • ${pct}%`;
    }

    // 2. Temperature Tile
    const tempVal = card.querySelector(".card-val-temp");
    const tempSub = card.querySelector(".card-sub-temp");
    if (tempVal) {
        if (telemetry.temp !== null && telemetry.temp !== undefined) {
            tempVal.textContent = `${telemetry.temp.toFixed(1)}°C`;
            tempVal.className = `metric-quad-value ${getTempColorClass(telemetry.temp)}`;
        } else {
            tempVal.textContent = "--";
            tempVal.className = "metric-quad-value";
        }
    }
    if (tempSub) {
        const vrStr = telemetry.vr_temp !== null && telemetry.vr_temp !== undefined ? `VR: ${telemetry.vr_temp.toFixed(1)}°C` : "VR: --";
        const fanStr = telemetry.fanspeed !== null && telemetry.fanspeed !== undefined ? `Lüfter: ${Math.round(telemetry.fanspeed)}%` : "";
        tempSub.textContent = fanStr ? `${vrStr} • ${fanStr}` : vrStr;
    }

    // 3. Frequency & Voltage Tile
    const freqVal = card.querySelector(".card-val-freq");
    const freqSub = card.querySelector(".card-sub-freq");
    if (freqVal) {
        freqVal.textContent = telemetry.frequency ? `${telemetry.frequency} MHz` : "--";
    }
    if (freqSub) {
        freqSub.textContent = telemetry.voltage ? `${telemetry.voltage} mV Kernspannung` : "-- mV";
    }

    // 4. Power & Efficiency Tile
    const pwrVal = card.querySelector(".card-val-power");
    const pwrSub = card.querySelector(".card-sub-power");
    if (pwrVal) {
        pwrVal.textContent = telemetry.power ? `${telemetry.power.toFixed(1)} W` : "--";
    }
    if (pwrSub) {
        pwrSub.textContent = telemetry.efficiency_j_th ? `${telemetry.efficiency_j_th} J/TH Effizienz` : "-- J/TH";
    }

    // 5. Best Difficulty directly on Miner Card
    const bestDiffVal = card.querySelector(".card-val-best-diff");
    const sessionDiffVal = card.querySelector(".card-val-session-diff");
    if (bestDiffVal) {
        bestDiffVal.textContent = formatDifficulty(telemetry.best_diff);
    }
    if (sessionDiffVal) {
        sessionDiffVal.textContent = formatDifficulty(telemetry.best_session_diff);
    }
}

function getTempColorClass(temp) {
    if (!temp) return "";
    if (temp >= 68) return "temp-danger";
    if (temp >= 64) return "temp-warn";
    return "temp-cool";
}

// --- 24h Metric History Popup Modal & Charts ---

async function openMetricHistoryModal(metricKey) {
    activeHistoryMetric = metricKey || "hashrate";
    const cfg = METRIC_CONFIG[activeHistoryMetric];
    if (!cfg) return;

    const titleEl = document.getElementById("history-modal-title");
    if (titleEl) {
        titleEl.innerHTML = `
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${cfg.color}; box-shadow: 0 0 8px ${cfg.color};"></span>
            ${cfg.title} (Verlauf)
        `;
    }

    openModal("modal-metric-history");
    await loadMetricHistory(activeHistoryMetric, activeHistoryHours);
}

async function loadMetricHistory(metricKey, hours = 24) {
    activeHistoryMetric = metricKey;
    activeHistoryHours = hours;
    const cfg = METRIC_CONFIG[metricKey];
    if (!cfg) return;

    // Update active filter button
    document.querySelectorAll(".range-btn").forEach(btn => {
        if (parseInt(btn.getAttribute("data-hours")) === hours) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    try {
        const res = await fetch(`/api/telemetry/history?hours=${hours}`);
        if (!res.ok) return;
        const data = await res.json();
        const points = data.points || [];

        if (points.length === 0) return;

        const values = points.map(p => p[cfg.field]);
        const labels = points.map(p => p.time);

        const curVal = values[values.length - 1];
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const avgVal = values.reduce((a, b) => a + b, 0) / values.length;

        const elCur = document.getElementById("history-stat-current");
        const elMin = document.getElementById("history-stat-min");
        const elAvg = document.getElementById("history-stat-avg");
        const elMax = document.getElementById("history-stat-max");

        if (elCur) elCur.textContent = `${curVal.toFixed(cfg.decimals)} ${cfg.unit}`;
        if (elMin) elMin.textContent = `${minVal.toFixed(cfg.decimals)} ${cfg.unit}`;
        if (elAvg) elAvg.textContent = `${avgVal.toFixed(cfg.decimals)} ${cfg.unit}`;
        if (elMax) elMax.textContent = `${maxVal.toFixed(cfg.decimals)} ${cfg.unit}`;

        renderMetricHistoryChart(labels, values, cfg);
    } catch (e) {
        console.error("Fehler beim Laden der Metrik-Historie:", e);
    }
}

function renderMetricHistoryChart(labels, values, cfg) {
    const canvas = document.getElementById("metricHistoryCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (metricHistoryChartInstance) {
        metricHistoryChartInstance.destroy();
    }

    metricHistoryChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: cfg.title,
                data: values,
                borderColor: cfg.color,
                backgroundColor: cfg.bgGradient,
                fill: true,
                tension: 0.35,
                borderWidth: 2.2,
                pointRadius: values.length > 50 ? 0 : 3,
                pointHoverRadius: 5,
                pointBackgroundColor: cfg.color
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            scales: {
                x: {
                    grid: { color: "rgba(255, 255, 255, 0.05)" },
                    ticks: {
                        color: "#8e8e93",
                        font: { size: 10 },
                        maxTicksLimit: 7
                    }
                },
                y: {
                    grid: { color: "rgba(255, 255, 255, 0.05)" },
                    ticks: {
                        color: "#8e8e93",
                        font: { size: 10 },
                        callback: (val) => `${val} ${cfg.unit}`
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "rgba(28, 28, 30, 0.95)",
                    borderColor: "rgba(255, 255, 255, 0.15)",
                    borderWidth: 1,
                    titleColor: "#ffffff",
                    bodyColor: cfg.color,
                    titleFont: { size: 11 },
                    bodyFont: { size: 13, weight: "bold" },
                    callbacks: {
                        label: (ctx) => ` ${ctx.parsed.y.toFixed(cfg.decimals)} ${cfg.unit}`
                    }
                }
            }
        }
    });
}

// --- Live Telemetry Chart ---

function initChart() {
    const ctx = document.getElementById("telemetryChart");
    if (!ctx) return;

    const maxPoints = 40;
    const labels = Array(maxPoints).fill("");
    const hashrateData = Array(maxPoints).fill(null);
    const tempData = Array(maxPoints).fill(null);

    chartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Gesamthashrate (GH/s)",
                    data: hashrateData,
                    borderColor: "#2997ff",
                    backgroundColor: "rgba(41, 151, 255, 0.08)",
                    borderWidth: 2.2,
                    tension: 0.35,
                    fill: true,
                    yAxisID: "y-hash"
                },
                {
                    label: "Durchschnittstemperatur (°C)",
                    data: tempData,
                    borderColor: "#ff453a",
                    backgroundColor: "transparent",
                    borderWidth: 1.8,
                    borderDash: [4, 4],
                    tension: 0.3,
                    fill: false,
                    yAxisID: "y-temp"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: "index", intersect: false },
            scales: {
                x: { display: false },
                "y-hash": {
                    type: "linear",
                    position: "left",
                    grid: { color: "rgba(255, 255, 255, 0.06)" },
                    ticks: { color: "#8e8e93", font: { size: 10 } }
                },
                "y-temp": {
                    type: "linear",
                    position: "right",
                    grid: { display: false },
                    min: 30,
                    max: 85,
                    ticks: { color: "#ff453a", font: { size: 10 } }
                }
            },
            plugins: {
                legend: {
                    labels: { color: "#ffffff", boxWidth: 12, font: { size: 11, weight: "bold" } }
                }
            }
        }
    });
}

function updateChartData(hashrate, temp) {
    if (!chartInstance) return;

    const dHash = chartInstance.data.datasets[0].data;
    const dTemp = chartInstance.data.datasets[1].data;

    dHash.push(hashrate > 0 ? Math.round(hashrate) : 0);
    dTemp.push(temp > 0 ? Number(temp.toFixed(1)) : null);

    if (dHash.length > 40) {
        dHash.shift();
        dTemp.shift();
    }

    chartInstance.update();
}

function toggleChartSection() {
    const sec = document.getElementById("section-charts");
    const btn = document.getElementById("btn-toggle-chart");
    if (!sec || !btn) return;

    isChartVisible = !isChartVisible;
    if (isChartVisible) {
        sec.style.display = "flex";
        btn.innerHTML = `
            <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"></path></svg>
            Ausblenden
        `;
    } else {
        sec.style.display = "none";
        btn.innerHTML = `
            <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
            Einblenden
        `;
    }
}

// --- Real-Time Log Engine with Instant Streaming & Filters ---

function handleIncomingLog(logEntry) {
    allLogs.push(logEntry);
    if (allLogs.length > 500) {
        allLogs.shift();
    }

    if (logMatchesFilter(logEntry, currentLogFilter)) {
        const win = document.getElementById("log-window");
        if (win) {
            appendLogEntry(win, logEntry);
            if (!isMouseOverLogs) {
                win.scrollTop = win.scrollHeight;
            }
        }
    }
}

function logMatchesFilter(log, filter) {
    if (filter === "all") return true;
    if (filter === "warning") {
        return log.level === "warning" || log.level === "error";
    }
    if (filter === "telemetry") {
        return log.level === "telemetry";
    }
    if (filter === "governor") {
        return log.level !== "telemetry";
    }
    return true;
}

function setLogFilter(filter) {
    currentLogFilter = filter;
    document.querySelectorAll(".log-filter-btn").forEach(btn => {
        if (btn.getAttribute("data-filter") === filter) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    renderFilteredLogs();
}

function renderFilteredLogs() {
    const win = document.getElementById("log-window");
    if (!win) return;

    win.innerHTML = "";
    const filtered = allLogs.filter(l => logMatchesFilter(l, currentLogFilter));
    filtered.forEach(log => {
        appendLogEntry(win, log);
    });
    win.scrollTop = win.scrollHeight;
}

function appendLogEntry(container, log) {
    const div = document.createElement("div");
    div.className = "log-entry";
    div.innerHTML = `
        <span class="log-time">[${log.timestamp}]</span>
        ${log.miner_ip ? `<span class="log-ip">[${log.miner_ip}]</span>` : ""}
        <span class="log-msg log-level-${log.level}">${escapeHtml(log.message)}</span>
    `;
    container.appendChild(div);
}

function downloadLogFile() {
    window.open("/api/logs/download", "_blank");
}

async function clearLogs() {
    try {
        await fetch("/api/logs/clear", { method: "POST" });
        allLogs = [];
        renderFilteredLogs();
    } catch (e) {
        console.error("Fehler beim Leeren des Logs:", e);
    }
}

// --- Miners Management & Clean Card Layout ---

async function loadMiners() {
    try {
        const res = await fetch("/api/miners");
        if (res.ok) {
            knownMiners = await res.json();
            renderMinerCards(knownMiners);
        }
    } catch (e) {
        console.error("Fehler beim Laden der Miner:", e);
    }
}

function renderMinerCards(miners) {
    const container = document.getElementById("miners-grid");
    if (!container) return;

    if (miners.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-glass-bright);">
                <p style="color: var(--text-muted); font-size: 1.05rem; margin-bottom: 14px;">Noch keine Bitaxe-Miner eingerichtet.</p>
                <button onclick="openScanModal()" class="btn btn-primary">
                    <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    Netzwerk automatisch scannen
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = miners.map(m => createMinerCardHtml(m)).join("");
}

function createMinerCardHtml(miner) {
    const safeId = miner.ip.replace(/\./g, "-");
    return `
    <div class="miner-card" id="miner-card-${safeId}">
        <div class="miner-header">
            <div class="miner-identity">
                <span class="status-dot"></span>
                <div class="miner-titles">
                    <div class="miner-name">${escapeHtml(miner.nickname || miner.ip)}</div>
                    <div class="miner-ip">${miner.ip}</div>
                </div>
            </div>
            <div class="miner-header-right">
                <span class="miner-badge-model">${escapeHtml(miner.model || miner.asic_model)}</span>
                <label class="switch-label" style="margin: 0;" title="Autotuning aktivieren / pausieren">
                    <input type="checkbox" ${miner.enabled ? 'checked' : ''} onchange="toggleMinerAutotune('${miner.ip}', this.checked)" class="switch-input">
                    <span class="switch-slider"></span>
                </label>
            </div>
        </div>

        <div class="governor-banner">
            <span class="gov-status optimal">INITIALISIERUNG</span>
            <span class="gov-msg">Warte auf erste Telemetrie-Messung...</span>
        </div>

        <!-- Best Difficulty Row directly on Miner Card -->
        <div class="miner-diff-bar">
            <div class="miner-diff-header">
                <svg class="ios-mini-icon" viewBox="0 0 24 24" fill="#ffd60a">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                </svg>
                <span class="diff-title">Best Difficulty</span>
            </div>
            <div class="miner-diff-tags">
                <span class="diff-tag">All-Time: <strong class="card-val-best-diff">--</strong></span>
                <span class="diff-bullet">•</span>
                <span class="diff-tag">Boot: <strong class="card-val-session-diff">--</strong></span>
            </div>
        </div>

        <!-- 4 Clean Metric Tiles with Pure Inline SVGs -->
        <div class="metrics-quad">
            <div class="metric-quad-item">
                <div class="metric-quad-header">
                    <span class="metric-quad-title">
                        <svg class="ios-mini-icon accent-cyan" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                        Hashrate
                    </span>
                </div>
                <div class="metric-quad-value card-val-hash">--</div>
                <div class="metric-quad-sub card-sub-hash">Warte auf Messung...</div>
            </div>

            <div class="metric-quad-item">
                <div class="metric-quad-header">
                    <span class="metric-quad-title">
                        <svg class="ios-mini-icon accent-red" viewBox="0 0 24 24" fill="currentColor"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0zM11.5 3.5a1 1 0 0 1 2 0v7h-2V3.5z"></path></svg>
                        Temperatur
                    </span>
                </div>
                <div class="metric-quad-value card-val-temp">--</div>
                <div class="metric-quad-sub card-sub-temp">Ziel: ${miner.target_temp}°C (±${miner.temp_tolerance}°C)</div>
            </div>

            <div class="metric-quad-item">
                <div class="metric-quad-header">
                    <span class="metric-quad-title">
                        <svg class="ios-mini-icon accent-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line></svg>
                        Takt &amp; Kern
                    </span>
                </div>
                <div class="metric-quad-value card-val-freq">--</div>
                <div class="metric-quad-sub card-sub-freq">Bereich: ${miner.min_freq} - ${miner.max_freq} MHz</div>
            </div>

            <div class="metric-quad-item">
                <div class="metric-quad-header">
                    <span class="metric-quad-title">
                        <svg class="ios-mini-icon accent-purple" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l3-3m5.2 2.8A9 9 0 103.8 13.8M12 7v1"></path></svg>
                        Leistung &amp; Effizienz
                    </span>
                </div>
                <div class="metric-quad-value card-val-power">--</div>
                <div class="metric-quad-sub card-sub-power">Max: ${miner.max_watts} W</div>
            </div>
        </div>

        <!-- Sleek Responsive Action Toolbar with Pure Inline SVGs -->
        <div class="card-actions">
            <button onclick="openEditModal('${miner.ip}')" class="btn btn-secondary btn-sm" title="Regelungsparameter &amp; Schwellen anpassen">
                <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                Optionen
            </button>
            <button onclick="openManualTuneModal('${miner.ip}')" class="btn btn-secondary btn-sm" title="Manuellen Frequenz- und Spannungstest ausführen">
                <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                Takt-Test
            </button>
            <button onclick="openOtaModal('${miner.ip}')" class="btn btn-secondary btn-sm" title="AxeOS Firmware Over-The-Air aktualisieren">
                <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                Update
            </button>
            <button onclick="restartMiner('${miner.ip}')" class="btn btn-secondary btn-sm" title="Miner neu starten">
                <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"></path><path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                Reboot
            </button>
            <button onclick="openMinerWebUI('${miner.ip}')" class="btn btn-secondary btn-sm" title="AxeOS Weboberfläche im Browser öffnen">
                <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                AxeOS
            </button>
        </div>
    </div>
    `;
}

function openMinerWebUI(ip) {
    window.open(`http://${ip}`, "_blank");
}

async function toggleMinerAutotune(ip, enabled) {
    try {
        await fetch(`/api/miners/${ip}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: enabled })
        });
        await loadMiners();
    } catch (e) {
        console.error("Fehler beim Umschalten des Autotuners:", e);
    }
}

// --- Tab Switching & Navigation ---

function switchTab(tab) {
    document.querySelectorAll(".ios-dock-item").forEach(item => {
        if (item.getAttribute("data-tab") === tab) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    const secKpis = document.getElementById("section-kpis");
    const secMiners = document.getElementById("section-miners");
    const secCharts = document.getElementById("section-charts");
    const secLogs = document.getElementById("section-logs");

    if (tab === "dashboard") {
        if (secKpis) secKpis.style.display = "grid";
        if (secMiners) secMiners.style.display = "block";
        if (secCharts) secCharts.style.display = "none";
        if (secLogs) secLogs.style.display = "none";
        window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (tab === "charts") {
        if (secCharts) {
            secCharts.style.display = "flex";
            secCharts.scrollIntoView({ behavior: "smooth" });
        }
    } else if (tab === "miners") {
        if (secMiners) {
            secMiners.style.display = "block";
            secMiners.scrollIntoView({ behavior: "smooth" });
        }
    } else if (tab === "alarm") {
        openNotificationModal();
    } else if (tab === "settings") {
        openSettingsMenuModal();
    }
}

function openSettingsMenuModal() {
    openModal("modal-menu");
}

function refreshDashboard() {
    loadMiners();
    loadNetworkInfo();
    const btn = document.getElementById("btn-refresh");
    if (btn) {
        btn.style.transform = "rotate(360deg)";
        setTimeout(() => { btn.style.transform = ""; }, 500);
    }
}

// --- Modals and Controls ---

function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add("active");
        document.body.classList.add("modal-open");
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove("active");
        const anyActive = document.querySelector(".modal-overlay.active");
        if (!anyActive) {
            document.body.classList.remove("modal-open");
        }
    }
}

function switchMinerEditTab(tabName) {
    const tabs = ["tuning", "pools", "hardware", "alarms"];
    tabs.forEach(t => {
        const btn = document.getElementById(`tabbtn-miner-${t}`);
        const pane = document.getElementById(`pane-miner-${t}`);
        if (btn) btn.classList.toggle("active", t === tabName);
        if (pane) pane.style.display = (t === tabName) ? "block" : "none";
    });
    const scrollBody = document.getElementById("edit-miner-scroll-body");
    if (scrollBody) scrollBody.scrollTop = 0;
}

function toggleFanManualInputs(isAuto) {
    const row = document.getElementById("fan-manual-row");
    if (row) {
        row.style.opacity = isAuto ? "0.45" : "1";
    }
}

function openAddMinerModal() {
    document.getElementById("form-add-ip").value = "";
    document.getElementById("form-add-nick").value = "";
    openModal("modal-add-miner");
}

async function submitAddMiner(e) {
    e.preventDefault();
    const ip = document.getElementById("form-add-ip").value.trim();
    const nickname = document.getElementById("form-add-nick").value.trim();
    const model = document.getElementById("form-add-model").value;

    if (!ip) return;

    try {
        const res = await fetch("/api/miners", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ip, nickname, model })
        });
        if (res.ok) {
            closeModal("modal-add-miner");
            await loadMiners();
        } else {
            const err = await res.json();
            alert(`Fehler: ${err.detail || "Miner konnte nicht hinzugefügt werden."}`);
        }
    } catch (e) {
        alert("Verbindungsfehler beim Hinzufügen des Miners.");
    }
}

async function openEditModal(ip) {
    activeEditingIp = ip;
    const miner = knownMiners.find(m => m.ip === ip);
    if (!miner) return;

    // Reset to first tab
    switchMinerEditTab("tuning");

    document.getElementById("edit-ip-display").textContent = `${miner.nickname || miner.ip} (${miner.ip}) • ${miner.model || miner.asic_model}`;
    document.getElementById("edit-target-temp").value = miner.target_temp;
    document.getElementById("edit-temp-tolerance").value = miner.temp_tolerance;
    document.getElementById("edit-max-temp").value = miner.max_temp;
    document.getElementById("edit-max-vr-temp").value = miner.max_vr_temp;
    document.getElementById("edit-max-watts").value = miner.max_watts;

    document.getElementById("edit-min-freq").value = miner.min_freq;
    document.getElementById("edit-max-freq").value = miner.max_freq;
    document.getElementById("edit-freq-step").value = miner.freq_step;

    document.getElementById("edit-min-volt").value = miner.min_voltage;
    document.getElementById("edit-max-volt").value = miner.max_voltage;
    document.getElementById("edit-volt-step").value = miner.voltage_step;

    document.getElementById("edit-cooldown").value = miner.tuning_cooldown;
    document.getElementById("edit-flatline-toggle").checked = miner.flatline_watchdog;
    document.getElementById("edit-enabled-toggle").checked = miner.enabled;

    // Multi-miner broadcast info calculation
    const sameModelMiners = knownMiners.filter(m => (m.asic_model && m.asic_model === miner.asic_model) || (m.model && m.model === miner.model));
    const modelName = miner.model || miner.asic_model || "dieses Modells";
    const labelEl = document.getElementById("edit-apply-same-model-label");
    const hintEl = document.getElementById("edit-apply-same-model-hint");
    if (labelEl) {
        labelEl.textContent = `Auf alle ${sameModelMiners.length} ${modelName}-Miner anwenden`;
    }
    if (hintEl) {
        hintEl.textContent = `Übernimmt geänderte Tuning-, Pool- und Hardware-Parameter synchron auf alle ${sameModelMiners.length} erkannten Geräte dieses Typs.`;
    }
    const applyCheckbox = document.getElementById("edit-apply-same-model");
    if (applyCheckbox) applyCheckbox.checked = false;

    // Default / cached values for AxeOS fields
    document.getElementById("edit-stratum-url").value = miner.stratum_url || "";
    document.getElementById("edit-stratum-port").value = miner.stratum_port || "";
    document.getElementById("edit-stratum-user").value = miner.stratum_user || "";
    document.getElementById("edit-stratum-pass").value = "";
    document.getElementById("edit-stratum-diff").value = "";

    document.getElementById("edit-fallback-url").value = miner.fallback_stratum_url || "";
    document.getElementById("edit-fallback-port").value = miner.fallback_stratum_port || "";
    document.getElementById("edit-fallback-user").value = miner.fallback_stratum_user || "";
    document.getElementById("edit-fallback-pass").value = "";
    document.getElementById("edit-fallback-diff").value = "";

    document.getElementById("edit-hostname").value = miner.hostname || "";
    document.getElementById("edit-autofan-toggle").checked = miner.autofanspeed === 1;
    document.getElementById("edit-fanspeed").value = miner.fanspeed || 100;
    document.getElementById("edit-min-fanspeed").value = 25;
    document.getElementById("edit-invertscreen-toggle").checked = false;
    document.getElementById("edit-display-timeout").value = 0;

    // Per-device Alarm Settings
    const alarmEnabledEl = document.getElementById("edit-alarm-enabled");
    if (alarmEnabledEl) alarmEnabledEl.checked = miner.alarm_enabled !== false;

    const alarmTempEl = document.getElementById("edit-alarm-temp-threshold");
    if (alarmTempEl) alarmTempEl.value = (miner.alarm_temp_threshold != null) ? miner.alarm_temp_threshold : (miner.max_temp || 70.0);

    const alarmVrEl = document.getElementById("edit-alarm-vr-threshold");
    if (alarmVrEl) alarmVrEl.value = (miner.alarm_vr_threshold != null) ? miner.alarm_vr_threshold : (miner.max_vr_temp ? (miner.max_vr_temp - 2.0) : 86.0);

    const alarmOfflineEl = document.getElementById("edit-alarm-offline");
    if (alarmOfflineEl) alarmOfflineEl.checked = miner.alarm_offline !== false;

    const alarmRebootEl = document.getElementById("edit-alarm-reboot");
    if (alarmRebootEl) alarmRebootEl.checked = miner.alarm_reboot !== false;

    openModal("modal-edit-miner");

    // Fetch live system info directly from miner via backend proxy
    try {
        const res = await fetch(`/api/miners/${ip}/system_info`);
        if (res.ok) {
            const info = await res.json();
            if (info.stratumURL) document.getElementById("edit-stratum-url").value = info.stratumURL;
            if (info.stratumPort) document.getElementById("edit-stratum-port").value = info.stratumPort;
            if (info.stratumUser) document.getElementById("edit-stratum-user").value = info.stratumUser;
            if (info.stratumSuggestedDifficulty) document.getElementById("edit-stratum-diff").value = info.stratumSuggestedDifficulty;

            if (info.fallbackStratumURL) document.getElementById("edit-fallback-url").value = info.fallbackStratumURL;
            if (info.fallbackStratumPort) document.getElementById("edit-fallback-port").value = info.fallbackStratumPort;
            if (info.fallbackStratumUser) document.getElementById("edit-fallback-user").value = info.fallbackStratumUser;
            if (info.fallbackStratumSuggestedDifficulty) document.getElementById("edit-fallback-diff").value = info.fallbackStratumSuggestedDifficulty;

            const activePoolText = document.getElementById("pool-active-text");
            if (activePoolText) {
                if (info.isUsingFallbackStratum === 1) {
                    activePoolText.textContent = "Achtung: Miner nutzt aktuell den Fallback-Pool!";
                    activePoolText.style.color = "var(--accent-orange)";
                } else {
                    activePoolText.textContent = "Miner verbindet sich regulär mit dem primären Pool.";
                    activePoolText.style.color = "var(--accent-green)";
                }
            }

            if (info.hostname) document.getElementById("edit-hostname").value = info.hostname;
            const autoFan = !!info.autofanspeed;
            document.getElementById("edit-autofan-toggle").checked = autoFan;
            toggleFanManualInputs(autoFan);
            if (info.fanspeed !== undefined) document.getElementById("edit-fanspeed").value = info.fanspeed;
            if (info.minFanSpeed !== undefined) document.getElementById("edit-min-fanspeed").value = info.minFanSpeed;
            if (info.invertscreen !== undefined) document.getElementById("edit-invertscreen-toggle").checked = !!info.invertscreen;
            if (info.displayTimeout !== undefined) document.getElementById("edit-display-timeout").value = info.displayTimeout;
        }
    } catch (e) {
        console.warn("Konnte Live-AxeOS-Info für", ip, "nicht laden:", e);
    }
}

async function saveMinerSettings(e) {
    e.preventDefault();
    if (!activeEditingIp) return;

    const btnSave = document.getElementById("btn-save-miner-settings");
    const origHtml = btnSave ? btnSave.innerHTML : "Speichern";
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">Wird gespeichert...</span>`;
    }

    const payload = {
        // Governor & Thermal (with fallback defaults if blank)
        target_temp: parseFloat(document.getElementById("edit-target-temp").value) || 62.0,
        temp_tolerance: parseFloat(document.getElementById("edit-temp-tolerance").value) || 2.0,
        max_temp: parseFloat(document.getElementById("edit-max-temp").value) || 72.0,
        max_vr_temp: parseFloat(document.getElementById("edit-max-vr-temp").value) || 88.0,
        max_watts: parseFloat(document.getElementById("edit-max-watts").value) || 26.0,
        min_freq: parseInt(document.getElementById("edit-min-freq").value) || 450,
        max_freq: parseInt(document.getElementById("edit-max-freq").value) || 750,
        freq_step: parseInt(document.getElementById("edit-freq-step").value) || 25,
        min_voltage: parseInt(document.getElementById("edit-min-volt").value) || 1050,
        max_voltage: parseInt(document.getElementById("edit-max-volt").value) || 1250,
        voltage_step: parseInt(document.getElementById("edit-volt-step").value) || 10,
        tuning_cooldown: parseInt(document.getElementById("edit-cooldown").value) || 30,
        flatline_watchdog: document.getElementById("edit-flatline-toggle").checked,
        enabled: document.getElementById("edit-enabled-toggle").checked,

        // Per-device Alarm settings
        alarm_enabled: document.getElementById("edit-alarm-enabled") ? document.getElementById("edit-alarm-enabled").checked : true,
        alarm_temp_threshold: parseFloat(document.getElementById("edit-alarm-temp-threshold").value) || 70.0,
        alarm_vr_threshold: parseFloat(document.getElementById("edit-alarm-vr-threshold").value) || 86.0,
        alarm_offline: document.getElementById("edit-alarm-offline") ? document.getElementById("edit-alarm-offline").checked : true,
        alarm_reboot: document.getElementById("edit-alarm-reboot") ? document.getElementById("edit-alarm-reboot").checked : true,

        // Multi-miner broadcast option
        apply_to_same_model: document.getElementById("edit-apply-same-model") ? document.getElementById("edit-apply-same-model").checked : false,

        // AxeOS Stratum Pools
        stratumURL: document.getElementById("edit-stratum-url").value.trim(),
        stratumPort: document.getElementById("edit-stratum-port").value ? parseInt(document.getElementById("edit-stratum-port").value) : null,
        stratumUser: document.getElementById("edit-stratum-user").value.trim(),
        stratumPassword: document.getElementById("edit-stratum-pass").value.trim() || undefined,
        stratumSuggestedDifficulty: document.getElementById("edit-stratum-diff").value ? parseInt(document.getElementById("edit-stratum-diff").value) : null,

        // AxeOS Fallback Pool
        fallbackStratumURL: document.getElementById("edit-fallback-url").value.trim(),
        fallbackStratumPort: document.getElementById("edit-fallback-port").value ? parseInt(document.getElementById("edit-fallback-port").value) : null,
        fallbackStratumUser: document.getElementById("edit-fallback-user").value.trim(),
        fallbackStratumPassword: document.getElementById("edit-fallback-pass").value.trim() || undefined,
        fallbackStratumSuggestedDifficulty: document.getElementById("edit-fallback-diff").value ? parseInt(document.getElementById("edit-fallback-diff").value) : null,

        // Hardware & Display
        hostname: document.getElementById("edit-hostname").value.trim() || undefined,
        autofanspeed: document.getElementById("edit-autofan-toggle").checked ? 1 : 0,
        fanspeed: document.getElementById("edit-fanspeed").value ? parseInt(document.getElementById("edit-fanspeed").value) : 100,
        minFanSpeed: document.getElementById("edit-min-fanspeed").value ? parseInt(document.getElementById("edit-min-fanspeed").value) : 25,
        invertscreen: document.getElementById("edit-invertscreen-toggle").checked ? 1 : 0,
        displayTimeout: document.getElementById("edit-display-timeout").value ? parseInt(document.getElementById("edit-display-timeout").value) : 0
    };

    try {
        const res = await fetch(`/api/miners/${activeEditingIp}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const data = await res.json();
            closeModal("modal-edit-miner");
            await loadMiners();
            console.log("Speichern erfolgreich:", data);
        } else {
            const err = await res.json();
            alert(`Fehler beim Speichern: ${err.detail || "Unbekannter Fehler"}`);
        }
    } catch (e) {
        alert("Netzwerkfehler beim Speichern der Miner-Einstellungen.");
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = origHtml;
        }
    }
}

async function deleteActiveMiner() {
    if (!activeEditingIp) return;
    if (!confirm(`Möchtest du den Miner ${activeEditingIp} wirklich aus BitAxeTool entfernen?`)) return;

    try {
        const res = await fetch(`/api/miners/${activeEditingIp}`, { method: "DELETE" });
        if (res.ok) {
            closeModal("modal-edit-miner");
            await loadMiners();
        }
    } catch (e) {
        alert("Fehler beim Löschen des Miners.");
    }
}

// Preset Handlers
function applyPreset(name) {
    const presetButtons = {
        eco: document.getElementById("preset-btn-eco"),
        balanced: document.getElementById("preset-btn-balanced"),
        oc: document.getElementById("preset-btn-oc")
    };
    Object.keys(presetButtons).forEach(k => {
        if (presetButtons[k]) presetButtons[k].classList.toggle("active", k === name);
    });

    if (name === "eco") {
        document.getElementById("edit-target-temp").value = 56.0;
        document.getElementById("edit-temp-tolerance").value = 2.0;
        document.getElementById("edit-max-temp").value = 65.0;
        document.getElementById("edit-min-freq").value = 450;
        document.getElementById("edit-max-freq").value = 525;
        document.getElementById("edit-max-watts").value = 16.0;
    } else if (name === "balanced") {
        document.getElementById("edit-target-temp").value = 62.0;
        document.getElementById("edit-temp-tolerance").value = 2.0;
        document.getElementById("edit-max-temp").value = 70.0;
        document.getElementById("edit-min-freq").value = 475;
        document.getElementById("edit-max-freq").value = 675;
        document.getElementById("edit-max-watts").value = 24.0;
    } else if (name === "oc") {
        document.getElementById("edit-target-temp").value = 66.0;
        document.getElementById("edit-temp-tolerance").value = 2.0;
        document.getElementById("edit-max-temp").value = 72.0;
        document.getElementById("edit-min-freq").value = 525;
        document.getElementById("edit-max-freq").value = 775;
        document.getElementById("edit-max-watts").value = 28.0;
    }

    // Visual feedback highlight
    ["edit-target-temp", "edit-max-temp", "edit-min-freq", "edit-max-freq", "edit-max-watts"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.borderColor = "var(--accent-cyan)";
            setTimeout(() => { if (el) el.style.borderColor = ""; }, 800);
        }
    });
}

// --- Manual Tuning ---

function openManualTuneModal(ip) {
    activeEditingIp = ip;
    document.getElementById("manual-tune-ip").textContent = ip;
    document.getElementById("manual-tune-freq").value = 550;
    document.getElementById("manual-tune-volt").value = 1100;
    openModal("modal-manual-tune");
}

async function submitManualTune(e) {
    e.preventDefault();
    if (!activeEditingIp) return;

    const freq = parseInt(document.getElementById("manual-tune-freq").value);
    const volt = parseInt(document.getElementById("manual-tune-volt").value);

    try {
        const res = await fetch(`/api/miner/${activeEditingIp}/tune`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frequency: freq, voltage: volt })
        });
        const data = await res.json();
        alert(data.message || "Taktbefehl übermittelt.");
        closeModal("modal-manual-tune");
    } catch (e) {
        alert("Fehler bei manueller Takteinstellung.");
    }
}

// --- Action Commands ---

async function restartMiner(ip) {
    if (!confirm(`Soll der Miner ${ip} jetzt neu gestartet werden?`)) return;
    try {
        const res = await fetch(`/api/miner/${ip}/restart`, { method: "POST" });
        const data = await res.json();
        alert(data.message || "Neustart ausgeführt.");
    } catch (e) {
        alert("Fehler beim Neustart-Befehl.");
    }
}

// --- Network Scanner ---

function openScanModal() {
    document.getElementById("scan-results").innerHTML = "";
    document.getElementById("scan-spinner").style.display = "none";
    document.getElementById("btn-start-scan").disabled = false;
    openModal("modal-scan");
}

async function startNetworkScan() {
    const spinner = document.getElementById("scan-spinner");
    const resultsContainer = document.getElementById("scan-results");
    const btn = document.getElementById("btn-start-scan");

    spinner.style.display = "flex";
    resultsContainer.innerHTML = "";
    btn.disabled = true;

    try {
        const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const data = await res.json();
        spinner.style.display = "none";
        btn.disabled = false;

        if (data.miners && data.miners.length > 0) {
            resultsContainer.innerHTML = data.miners.map(m => `
                <div class="discovered-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--bg-surface); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); margin-bottom: 8px;">
                    <div class="discovered-info">
                        <strong>${escapeHtml(m.hostname || m.ip)}</strong>
                        <div style="font-size: 0.76rem; color: var(--text-muted); font-family: monospace;">${m.ip} • ${escapeHtml(m.model)}</div>
                        <div style="font-size: 0.74rem; color: var(--accent-cyan);">${m.hash_rate ? Math.round(m.hash_rate) + ' GH/s @ ' + m.frequency + ' MHz' : 'Bereit'}</div>
                    </div>
                    <button onclick="addDiscoveredMiner('${m.ip}', '${escapeHtml(m.hostname)}', '${escapeHtml(m.model)}')" class="btn btn-primary btn-sm">+ Hinzufügen</button>
                </div>
            `).join("");
        } else {
            resultsContainer.innerHTML = `<p style="color: var(--text-muted); padding: 12px; text-align: center;">Keine neuen Bitaxe-Miner im lokalen Subnetz (${data.subnet}) gefunden.</p>`;
        }
    } catch (e) {
        spinner.style.display = "none";
        btn.disabled = false;
        resultsContainer.innerHTML = `<p style="color: var(--accent-red); padding: 12px;">Suchfehler: ${e.message}</p>`;
    }
}

async function addDiscoveredMiner(ip, hostname, model) {
    try {
        const res = await fetch("/api/miners", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ip, nickname: hostname, model })
        });
        if (res.ok) {
            alert(`Miner ${hostname || ip} erfolgreich hinzugefügt!`);
            closeModal("modal-scan");
            await loadMiners();
        }
    } catch (e) {
        alert("Fehler beim Hinzufügen.");
    }
}

// --- Network & QR Code & Port info ---

async function loadNetworkInfo() {
    try {
        const res = await fetch("/api/network-info");
        if (res.ok) {
            const data = await res.json();
            const el = document.getElementById("qr-lan-url");
            if (el) el.textContent = data.lan_url;

            const portBadge = document.getElementById("port-badge");
            if (portBadge && data.port) {
                portBadge.textContent = `Port: ${data.port}`;
                portBadge.style.display = "inline-block";
            }
        }
    } catch (e) {
        console.error("Network info error:", e);
    }
}

function openQrModal() {
    const img = document.getElementById("qr-code-img");
    if (img) img.src = `/api/qrcode?t=${Date.now()}`;
    openModal("modal-qr");
}

// --- About, Changelog & License Modal ---

let isLicenseLoaded = false;
let isChangelogLoaded = false;

function switchAboutTab(tabName) {
    const tabs = ["changelog", "license", "about"];
    tabs.forEach(t => {
        const btn = document.getElementById(`tabbtn-${t}`);
        const pane = document.getElementById(`tabpane-${t}`);
        if (btn) btn.classList.toggle("active", t === tabName);
        if (pane) pane.style.display = (t === tabName) ? "block" : "none";
    });

    if (tabName === "license" && !isLicenseLoaded) {
        loadLicenseText();
    } else if (tabName === "changelog" && !isChangelogLoaded) {
        loadChangelogText();
    }
}

async function openAboutModal(initialTab = "changelog") {
    openModal("modal-changelog");
    switchAboutTab(initialTab);
    if (!isChangelogLoaded) {
        await loadChangelogText();
    }
}

function openChangelogModal() {
    openAboutModal("changelog");
}

async function loadChangelogText() {
    const content = document.getElementById("changelog-content");
    if (!content) return;
    try {
        const res = await fetch("/api/changelog");
        if (res.ok) {
            const text = await res.text();
            content.innerHTML = parseSimpleMarkdown(text);
            isChangelogLoaded = true;
        } else {
            content.innerHTML = "<p style='color: var(--accent-orange);'>Changelog konnte nicht geladen werden.</p>";
        }
    } catch (e) {
        content.innerHTML = "<p style='color: var(--accent-red);'>Fehler beim Abrufen des Changelogs.</p>";
    }
}

async function loadLicenseText() {
    const licBox = document.getElementById("license-full-text");
    if (!licBox) return;
    try {
        const res = await fetch("/api/license");
        if (res.ok) {
            licBox.textContent = await res.text();
            isLicenseLoaded = true;
        } else {
            licBox.textContent = "Creative Commons Lizenztext (CC BY-NC 4.0) konnte nicht geladen werden.";
        }
    } catch (e) {
        licBox.textContent = "Netzwerkfehler beim Laden des Lizenztexts.";
    }
}

function parseSimpleMarkdown(md) {
    let html = escapeHtml(md);
    html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--accent-cyan); text-decoration: underline;">$1</a>');
    html = html.replace(/^\- (.*$)/gim, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/gim, "<ul>$1</ul>");
    html = html.replace(/\n\n/g, "<br><br>");
    return html;
}

// --- Utilities & Listeners ---

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setupEventListeners() {
    const formAdd = document.getElementById("form-add-miner");
    if (formAdd) formAdd.addEventListener("submit", submitAddMiner);

    const formEdit = document.getElementById("form-edit-miner");
    if (formEdit) formEdit.addEventListener("submit", saveMinerSettings);

    const formManual = document.getElementById("form-manual-tune");
    if (formManual) formManual.addEventListener("submit", submitManualTune);

    // Direct event bindings for Miner Settings Tabs
    ["tuning", "pools", "hardware"].forEach(t => {
        const btn = document.getElementById(`tabbtn-miner-${t}`);
        if (btn) {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                switchMinerEditTab(t);
            });
        }
    });

    // Direct event bindings for Miner Quick Presets
    ["eco", "balanced", "oc"].forEach(p => {
        const btn = document.getElementById(`preset-btn-${p}`);
        if (btn) {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                applyPreset(p);
            });
        }
    });

    const logWin = document.getElementById("log-window");
    if (logWin) {
        logWin.addEventListener("mouseenter", () => { isMouseOverLogs = true; });
        logWin.addEventListener("mouseleave", () => { isMouseOverLogs = false; });
    }
}

// --- Progressive Web App & Smartphone Notification Engine ---

const NOTIF_STORAGE_KEY = "bitaxe_notif_settings";
let notifSettings = {
    overheat: true,
    vr: true,
    offline: true,
    reboot: true,
    tuning: true,
    sound: true
};

let previousMinerStates = {};
let lastAlertTimestamps = {};
let audioCtx = null;

function loadNotificationSettings() {
    try {
        const saved = localStorage.getItem(NOTIF_STORAGE_KEY);
        if (saved) {
            notifSettings = { ...notifSettings, ...JSON.parse(saved) };
        }
    } catch (e) {}

    const chkOverheat = document.getElementById("notif-opt-overheat");
    const chkVr = document.getElementById("notif-opt-vr");
    const chkOffline = document.getElementById("notif-opt-offline");
    const chkReboot = document.getElementById("notif-opt-reboot");
    const chkTuning = document.getElementById("notif-opt-tuning");
    const chkSound = document.getElementById("notif-opt-sound");

    if (chkOverheat) chkOverheat.checked = notifSettings.overheat;
    if (chkVr) chkVr.checked = notifSettings.vr;
    if (chkOffline) chkOffline.checked = notifSettings.offline;
    if (chkReboot) chkReboot.checked = notifSettings.reboot;
    if (chkTuning) chkTuning.checked = notifSettings.tuning;
    if (chkSound) chkSound.checked = notifSettings.sound;

    updateNotificationPermissionStatus();
}

function saveNotificationSettings() {
    const chkOverheat = document.getElementById("notif-opt-overheat");
    const chkVr = document.getElementById("notif-opt-vr");
    const chkOffline = document.getElementById("notif-opt-offline");
    const chkReboot = document.getElementById("notif-opt-reboot");
    const chkTuning = document.getElementById("notif-opt-tuning");
    const chkSound = document.getElementById("notif-opt-sound");

    if (chkOverheat) notifSettings.overheat = chkOverheat.checked;
    if (chkVr) notifSettings.vr = chkVr.checked;
    if (chkOffline) notifSettings.offline = chkOffline.checked;
    if (chkReboot) notifSettings.reboot = chkReboot.checked;
    if (chkTuning) notifSettings.tuning = chkTuning.checked;
    if (chkSound) notifSettings.sound = chkSound.checked;

    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifSettings));
}

let toastTimer = null;
function showToastBanner(title, body) {
    const banner = document.getElementById("ios-toast-banner");
    if (!banner) return;
    const titleEl = document.getElementById("toast-title");
    const bodyEl = document.getElementById("toast-body");
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = body;
    banner.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        hideToastBanner();
    }, 4500);
}

function hideToastBanner() {
    const banner = document.getElementById("ios-toast-banner");
    if (banner) banner.classList.remove("show");
}

function updateNotificationPermissionStatus() {
    const textEl = document.getElementById("notif-perm-text");
    const subhintEl = document.getElementById("notif-perm-subhint");
    const btn = document.getElementById("btn-request-notif");
    const badgeDot = document.getElementById("notif-badge-dot");
    const dockDot = document.getElementById("dock-notif-dot");

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = (window.navigator.standalone === true) || window.matchMedia('(display-mode: standalone)').matches;

    if (!("Notification" in window)) {
        if (textEl) {
            textEl.textContent = isIOS ? "Nur als Home-Screen App" : "Nicht vom Browser unterstützt";
            textEl.style.color = "var(--text-muted)";
        }
        if (subhintEl) {
            subhintEl.style.display = "block";
            subhintEl.textContent = isIOS 
                ? "Auf dem iPhone erfordert Apple das Hinzufügen zum Home-Bildschirm (Teilen -> Zum Home-Bildschirm), um Mitteilungen zu erlauben."
                : "Dieser Browser unterstützt die Push-Mitteilungs-API leider nicht.";
        }
        if (btn) {
            btn.innerHTML = `<svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> Anleitung für iPhone &amp; Safari`;
            btn.disabled = false;
            btn.className = "btn btn-secondary btn-sm";
            btn.onclick = () => openNotificationHelpModal();
        }
        return;
    }

    if (isIOS && !isStandalone) {
        if (textEl) {
            textEl.textContent = "Home-Bildschirm erforderlich";
            textEl.style.color = "var(--accent-orange)";
        }
        if (subhintEl) {
            subhintEl.style.display = "block";
            subhintEl.innerHTML = "<strong>iOS-Vorgabe:</strong> Apple unterstützt Sperrbildschirm-Mitteilungen auf iPhones nur, wenn die App zum Home-Bildschirm hinzugefügt wurde. In normalen Safari-Tabs gibt es dafür <em>keinen</em> Schalter.";
            subhintEl.style.color = "var(--text-muted)";
        }
        if (btn) {
            btn.innerHTML = `
                <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                Anleitung: Als Home-Screen App einrichten
            `;
            btn.disabled = false;
            btn.className = "btn btn-secondary btn-sm";
            btn.onclick = () => openNotificationHelpModal();
        }
        if (badgeDot) badgeDot.style.display = "block";
        if (dockDot) dockDot.style.display = "block";
        return;
    }

    const perm = Notification.permission;
    if (perm === "granted") {
        if (textEl) {
            textEl.textContent = "Aktiviert ✓";
            textEl.style.color = "var(--accent-green)";
        }
        if (subhintEl) {
            subhintEl.style.display = "block";
            subhintEl.textContent = "Mitteilungen sind aktiv! Du wirst bei kritischen Ereignissen sofort alarmiert.";
            subhintEl.style.color = "var(--accent-green)";
        }
        if (btn) {
            btn.innerHTML = `<svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Mitteilungen aktiv (Testen)`;
            btn.disabled = false;
            btn.className = "btn btn-secondary btn-sm";
            btn.onclick = () => sendTestNotification();
        }
        if (badgeDot) badgeDot.style.display = "none";
        if (dockDot) dockDot.style.display = "none";
    } else if (perm === "denied") {
        if (textEl) {
            textEl.textContent = "Im Browser blockiert ✗";
            textEl.style.color = "var(--accent-red)";
        }
        if (subhintEl) {
            subhintEl.style.display = "block";
            subhintEl.innerHTML = isIOS
                ? "<strong>Hinweis für Safari:</strong> Apple sperrt Web-Push im normalen Tab. Tippe auf die Anleitung, um die Freigabe in wenigen Schritten zu aktivieren."
                : "Mitteilungen wurden im Browser abgelehnt. Tippe auf die Anleitung, um sie in den Browsereinstellungen freizugeben.";
            subhintEl.style.color = "var(--text-muted)";
        }
        if (btn) {
            btn.innerHTML = `
                <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                Anleitung: So aktivierst du Mitteilungen
            `;
            btn.disabled = false;
            btn.className = "btn btn-secondary btn-sm";
            btn.onclick = () => openNotificationHelpModal();
        }
        if (badgeDot) badgeDot.style.display = "block";
        if (dockDot) dockDot.style.display = "block";
    } else {
        if (textEl) {
            textEl.textContent = "Noch nicht erlaubt";
            textEl.style.color = "var(--accent-orange)";
        }
        if (subhintEl) {
            subhintEl.style.display = "none";
        }
        if (btn) {
            btn.innerHTML = `
                <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                Benachrichtigungen im Browser erlauben
            `;
            btn.disabled = false;
            btn.className = "btn btn-primary btn-sm";
            btn.onclick = () => requestNotificationPermission();
        }
        if (badgeDot) badgeDot.style.display = "block";
        if (dockDot) dockDot.style.display = "block";
    }
}

function openNotificationHelpModal() {
    openModal("modal-notification-help");
}

async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        openNotificationHelpModal();
        return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = (window.navigator.standalone === true) || window.matchMedia('(display-mode: standalone)').matches;

    if (isIOS && !isStandalone) {
        openNotificationHelpModal();
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        updateNotificationPermissionStatus();
        if (permission === "granted") {
            playAlertSound("info");
            showToastBanner("Mitteilungen aktiviert", "Du erhältst ab sofort Live-Alarme bei kritischen Ereignissen.");
            sendNotification(
                "BitAxe Benachrichtigungen aktiv",
                "Du erhältst ab sofort sofortige Alarme bei Überhitzung, Ausfällen oder Taktänderungen deiner Miner.",
                "welcome",
                false
            );
        } else if (permission === "denied") {
            openNotificationHelpModal();
        }
    } catch (e) {
        console.warn("Fehler bei Notification.requestPermission:", e);
        openNotificationHelpModal();
    }
}

function openNotificationModal() {
    loadNotificationSettings();
    openModal("modal-notifications");
}

function playAlertSound(type = "info") {
    if (!notifSettings.sound && type !== "danger") return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === "danger") {
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(660, now + 0.12);
            osc.frequency.setValueAtTime(880, now + 0.24);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
            osc.start(now);
            osc.stop(now + 0.45);
            if (navigator.vibrate) navigator.vibrate([250, 100, 250]);
        } else {
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
            if (navigator.vibrate) navigator.vibrate(120);
        }
    } catch (e) {
        console.warn("Audio playback issue:", e);
    }
}

function sendNotification(title, body, tag, isCritical = false) {
    playAlertSound(isCritical ? "danger" : "info");
    showToastBanner(title, body);

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: "SHOW_NOTIFICATION",
            title: title,
            options: {
                body: body,
                tag: tag,
                icon: "/static/icons/icon-192.png",
                badge: "/static/icons/favicon-32.png",
                requireInteraction: isCritical
            }
        });
    } else if ("Notification" in window && Notification.permission === "granted") {
        try {
            new Notification(title, {
                body: body,
                tag: tag,
                icon: "/static/icons/icon-192.png",
                requireInteraction: isCritical
            });
        } catch (e) {}
    }
}

function sendTestNotification() {
    saveNotificationSettings();
    playAlertSound("danger");
    showToastBanner("BitAxe Test-Alarm", "Akustischer Warnton und Vibration aktiv!");

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = (window.navigator.standalone === true) || window.matchMedia('(display-mode: standalone)').matches;
    const hasPush = ("Notification" in window && Notification.permission === "granted");

    if (hasPush) {
        sendNotification(
            "BitAxe Test-Alarm",
            "Test erfolgreich! Benachrichtigungen und Warntöne funktionieren einwandfrei.",
            "test-" + Date.now(),
            false
        );
    }

    const detailEl = document.getElementById("test-push-status-detail");
    const cardEl = document.getElementById("test-push-status-card");
    if (detailEl && cardEl) {
        if (hasPush) {
            cardEl.className = "test-check-item success";
            const icon = cardEl.querySelector(".test-check-icon");
            if (icon) {
                icon.className = "test-check-icon accent-green";
                icon.textContent = "✓";
            }
            detailEl.innerHTML = "<strong>Sperrbildschirm-Push aktiv:</strong> Benachrichtigungen sind vollständig eingerichtet und funktionieren.";
        } else {
            cardEl.className = "test-check-item notice";
            const icon = cardEl.querySelector(".test-check-icon");
            if (icon) {
                icon.className = "test-check-icon accent-orange";
                icon.textContent = "ℹ";
            }
            if (isIOS) {
                if (!isStandalone) {
                    detailEl.innerHTML = "Im normalen Safari-Tab sperrt Apple Push-Mitteilungen für den Sperrbildschirm. Es gibt in den Safari-Einstellungen dafür <strong>keinen</strong> Schalter.<br><br><strong>Lösung in 10 Sekunden:</strong> Einmal unten auf <em>Teilen &rarr; „Zum Home-Bildschirm“</em> tippen und die BitAxe-App über das Icon auf dem Home-Bildschirm starten!";
                } else {
                    detailEl.innerHTML = "Die App ist auf dem Home-Bildschirm installiert, aber Mitteilungen wurden noch nicht freigegeben.<br><br>Tippe auf <em>„Anleitung öffnen“</em> oder im Alarm-Menü auf <em>„Mitteilungen erlauben“</em>.";
                }
            } else {
                detailEl.innerHTML = "Web-Push-Benachrichtigungen sind im Browser noch nicht aktiviert oder blockiert.<br><br>Tippe auf <em>„Anleitung öffnen“</em>, um Mitteilungen im Browser zu erlauben.";
            }
        }
    }

    openModal("modal-test-alarm-result");
}

function checkNotificationTriggers(telemetryList) {
    if (!telemetryList || !Array.isArray(telemetryList)) return;
    const now = Date.now();

    telemetryList.forEach(t => {
        const ip = t.ip;
        const prev = previousMinerStates[ip];
        const minerCfg = knownMiners.find(m => m.ip === ip);
        const name = (minerCfg && minerCfg.nickname) ? minerCfg.nickname : ip;

        // Check if alarms are explicitly disabled for this specific miner
        const alarmsActive = (!minerCfg || minerCfg.alarm_enabled !== false);

        if (prev && alarmsActive) {
            // 1. Überhitzung / Notdrosselung
            if (notifSettings.overheat) {
                const alarmThreshold = (minerCfg && minerCfg.alarm_temp_threshold != null)
                    ? minerCfg.alarm_temp_threshold
                    : (minerCfg && minerCfg.max_temp ? minerCfg.max_temp : 70.0);

                // Safe threshold check: Temperature must be >= threshold AND safely >= 65.0°C.
                // 58°C or anything below 65°C is completely normal operating temperature and NEVER an overheat alarm!
                const isActualOverheat = t.temp && (t.temp >= alarmThreshold) && (t.temp >= 65.0);
                const isThermalEmergency = (t.governor_status === "EMERGENCY_THROTTLE") && (t.temp && t.temp >= 65.0);

                if (isActualOverheat || isThermalEmergency) {
                    const alertKey = `overheat-${ip}`;
                    if (!lastAlertTimestamps[alertKey] || (now - lastAlertTimestamps[alertKey] > 120000)) {
                        lastAlertTimestamps[alertKey] = now;
                        sendNotification(
                            `ALARM: ${name} überhitzt!`,
                            `Chip-Temperatur liegt bei ${t.temp ? t.temp.toFixed(1) : '--'}°C (Schwelle: ${alarmThreshold.toFixed(1)}°C). Notdrosselung aktiv!`,
                            alertKey,
                            true
                        );
                    }
                }
            }

            // 2. VR-Temperatur (Spannungswandler)
            if (notifSettings.vr && t.vr_temp) {
                const vrThreshold = (minerCfg && minerCfg.alarm_vr_threshold != null)
                    ? minerCfg.alarm_vr_threshold
                    : (minerCfg && minerCfg.max_vr_temp ? (minerCfg.max_vr_temp - 2.0) : 86.0);

                if (t.vr_temp >= vrThreshold) {
                    const alertKey = `vr-${ip}`;
                    if (!lastAlertTimestamps[alertKey] || (now - lastAlertTimestamps[alertKey] > 120000)) {
                        lastAlertTimestamps[alertKey] = now;
                        sendNotification(
                            `VR-WARNUNG: ${name}`,
                            `Spannungswandler erreicht kritische ${t.vr_temp.toFixed(1)}°C (Limit: ${vrThreshold.toFixed(1)}°C)!`,
                            alertKey,
                            true
                        );
                    }
                }
            }

            // 3. Miner Offline / Ausfall
            if (notifSettings.offline && (!minerCfg || minerCfg.alarm_offline !== false)) {
                if (prev.connected === true && t.connected === false) {
                    sendNotification(
                        `AUSFALL: ${name} ist OFFLINE!`,
                        `Der Miner unter ${ip} antwortet nicht mehr im Netzwerk.`,
                        `offline-${ip}`,
                        true
                    );
                } else if (prev.connected === false && t.connected === true) {
                    sendNotification(
                        `ONLINE: ${name} ist wieder da!`,
                        `Verbindung zu ${ip} wiederhergestellt. Hashrate: ${Math.round(t.hash_rate || 0)} GH/s.`,
                        `online-${ip}`,
                        false
                    );
                }
            }

            // 4. Flatline Watchdog Reboot
            if (notifSettings.reboot && (!minerCfg || minerCfg.alarm_reboot !== false)) {
                if (t.governor_status === "RESTARTING" && prev.governor_status !== "RESTARTING") {
                    sendNotification(
                        `WATCHDOG: ${name} startet neu`,
                        `0 GH/s Hashrate-Freeze erkannt. Automatischer Neustart wird durchgeführt.`,
                        `reboot-${ip}`,
                        true
                    );
                }
            }

            // 5. Auto-Tuning Taktsteigerung
            if (notifSettings.tuning && (minerCfg && minerCfg.alarm_tuning === true)) {
                if (t.frequency && prev.frequency && t.frequency > prev.frequency) {
                    sendNotification(
                        `TUNING: ${name} gesteigert`,
                        `Takt erfolgreich auf ${t.frequency} MHz @ ${t.voltage || '--'} mV erhöht.`,
                        `tuning-${ip}`,
                        false
                    );
                }
            }
        }

        // Save state snapshot for next cycle
        previousMinerStates[ip] = {
            connected: t.connected,
            temp: t.temp,
            vr_temp: t.vr_temp,
            frequency: t.frequency,
            governor_status: t.governor_status
        };
    });
}

function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("/sw.js")
                .then(reg => {
                    console.log("[PWA] Service Worker aktiv, Scope:", reg.scope);
                })
                .catch(err => {
                    console.warn("[PWA] Service Worker Fehler:", err);
                });
        });
    }
}

// ==========================================
// --- Firmware OTA Update System (v2.3.5) ---
// ==========================================
let otaLatestRelease = null;
let otaSelectedFile = null;
let otaCurrentSource = 'github'; // 'github' or 'upload'

async function openOtaModal(targetIp = 'all') {
    const modal = document.getElementById('modal-ota-update');
    if (!modal) return;

    // Populate select with current known miners
    const select = document.getElementById('ota-target-select');
    if (select) {
        select.innerHTML = '<option value="all">⚡ Alle aktiven Miner (Rolling Update)</option>';
        if (knownMiners && knownMiners.length > 0) {
            knownMiners.forEach(m => {
                const name = m.nickname || m.hostname || m.ip;
                const opt = document.createElement('option');
                opt.value = m.ip;
                opt.textContent = `${name} (${m.ip})`;
                select.appendChild(opt);
            });
        }
        select.value = targetIp || 'all';
    }

    // Reset view
    otaSelectedFile = null;
    const fileNameEl = document.getElementById('ota-file-name');
    if (fileNameEl) {
        fileNameEl.textContent = "Klicken, um esp-miner.bin oder www.bin auszuwählen";
    }
    const progSec = document.getElementById('ota-progress-section');
    if (progSec) progSec.style.display = 'none';

    const startBtn = document.getElementById('btn-ota-start');
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            Firmware-Update starten
        `;
    }

    switchOtaSource('github');
    modal.classList.add('active');

    // Fetch latest GitHub release info
    fetchLatestOtaRelease();
}

function switchOtaSource(source) {
    otaCurrentSource = source;
    const btnGithub = document.getElementById('btn-ota-source-github');
    const btnUpload = document.getElementById('btn-ota-source-upload');
    const panelGithub = document.getElementById('ota-source-github-panel');
    const panelUpload = document.getElementById('ota-source-upload-panel');

    if (source === 'github') {
        if (btnGithub) btnGithub.classList.add('active');
        if (btnUpload) btnUpload.classList.remove('active');
        if (panelGithub) panelGithub.style.display = 'block';
        if (panelUpload) panelUpload.style.display = 'none';
    } else {
        if (btnGithub) btnGithub.classList.remove('active');
        if (btnUpload) btnUpload.classList.add('active');
        if (panelGithub) panelGithub.style.display = 'none';
        if (panelUpload) panelUpload.style.display = 'block';
    }
}

async function fetchLatestOtaRelease() {
    const verEl = document.getElementById('ota-github-version');
    const descEl = document.getElementById('ota-github-desc');
    const badgeEl = document.getElementById('ota-github-badge');
    if (verEl) verEl.textContent = "Prüfe GitHub...";
    if (badgeEl) badgeEl.textContent = "Suche...";

    try {
        const res = await fetch('/api/ota/latest');
        const data = await res.json();
        if (data.success) {
            otaLatestRelease = data;
            if (verEl) verEl.textContent = `AxeOS ${data.version}`;
            if (badgeEl) {
                badgeEl.textContent = "Aktuell";
                badgeEl.className = "badge badge-success";
            }
            const sizeMb = data.size ? (data.size / (1024 * 1024)).toFixed(2) + " MB" : "2.7 MB";
            if (descEl) {
                descEl.innerHTML = `Offizielles Release: <strong>${data.name || data.version}</strong> (Datei: <code>esp-miner.bin</code>, ${sizeMb})<br><span style="color:#30d158; font-weight:500;">✓ Bereit für 1-Klick OTA Flash</span>`;
            }
        } else {
            if (verEl) verEl.textContent = "GitHub API nicht erreichbar";
            if (badgeEl) {
                badgeEl.textContent = "Offline";
                badgeEl.className = "badge badge-warning";
            }
            if (descEl) descEl.textContent = data.error || "GitHub Release-Prüfung fehlgeschlagen. Bitte eigene Datei hochladen.";
        }
    } catch (e) {
        if (verEl) verEl.textContent = "Fehler bei Versionsprüfung";
        if (badgeEl) {
            badgeEl.textContent = "Fehler";
            badgeEl.className = "badge badge-danger";
        }
        if (descEl) descEl.textContent = "Verbindung zu GitHub fehlgeschlagen. Bitte manuellen Upload nutzen.";
    }
}

function handleOtaFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        otaSelectedFile = file;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        const nameEl = document.getElementById('ota-file-name');
        if (nameEl) {
            nameEl.innerHTML = `<strong>${file.name}</strong> (${sizeMb} MB ausgewählt)`;
        }
    }
}

async function startOtaUpdate() {
    const targetSelect = document.getElementById('ota-target-select');
    const targetIp = targetSelect ? targetSelect.value : 'all';
    const progressSection = document.getElementById('ota-progress-section');
    const progressTitle = document.getElementById('ota-progress-title');
    const progressFill = document.getElementById('ota-progress-fill');
    const progressPct = document.getElementById('ota-progress-pct');
    const resultsList = document.getElementById('ota-results-list');
    const startBtn = document.getElementById('btn-ota-start');
    const cancelBtn = document.getElementById('btn-ota-cancel');

    const targetName = targetIp === 'all' ? "ALLE aktiven Miner" : `Miner ${targetIp}`;
    if (!confirm(`Soll das Firmware-Update für ${targetName} jetzt wirklich gestartet werden?\n\nDie Geräte werden nacheinander geflasht und neu gestartet.`)) {
        return;
    }

    if (progressSection) progressSection.style.display = 'block';
    if (resultsList) resultsList.innerHTML = '<div style="font-size:12px; color:var(--ios-text-secondary); padding: 4px;">Initialisiere Flash-Vorgang...</div>';
    if (progressTitle) progressTitle.textContent = "Firmware-Flash läuft...";
    if (progressFill) progressFill.style.width = '15%';
    if (progressPct) progressPct.textContent = '15%';
    if (startBtn) startBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    try {
        let res;
        if (otaCurrentSource === 'github') {
            if (progressTitle) progressTitle.textContent = "Lade Firmware von GitHub herunter...";
            if (progressFill) progressFill.style.width = '30%';
            if (progressPct) progressPct.textContent = '30%';

            res = await fetch('/api/ota/update-from-github', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_ip: targetIp })
            });
        } else {
            if (!otaSelectedFile) {
                alert("Bitte wählen Sie zuerst eine .bin Datei aus!");
                if (progressSection) progressSection.style.display = 'none';
                if (startBtn) startBtn.disabled = false;
                if (cancelBtn) cancelBtn.disabled = false;
                return;
            }
            if (progressTitle) progressTitle.textContent = `Übertrage ${otaSelectedFile.name}...`;
            if (progressFill) progressFill.style.width = '30%';
            if (progressPct) progressPct.textContent = '30%';

            res = await fetch(`/api/ota/upload?target_ip=${encodeURIComponent(targetIp)}&filename=${encodeURIComponent(otaSelectedFile.name)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: otaSelectedFile
            });
        }

        if (progressFill) progressFill.style.width = '85%';
        if (progressPct) progressPct.textContent = '85%';
        if (progressTitle) progressTitle.textContent = "Verarbeite Rückmeldung der Miner...";

        const data = await res.json();
        if (progressFill) progressFill.style.width = '100%';
        if (progressPct) progressPct.textContent = '100%';

        if (res.ok && data.status === 'complete') {
            if (progressTitle) progressTitle.textContent = data.summary || "Update abgeschlossen!";
            if (resultsList) {
                resultsList.innerHTML = '';
                (data.results || []).forEach(r => {
                    const item = document.createElement('div');
                    item.style.padding = '8px 10px';
                    item.style.borderRadius = '8px';
                    item.style.background = r.success ? 'rgba(52, 199, 89, 0.12)' : 'rgba(255, 69, 58, 0.12)';
                    item.style.border = `1px solid ${r.success ? 'rgba(52, 199, 89, 0.3)' : 'rgba(255, 69, 58, 0.3)'}`;
                    item.style.fontSize = '12px';
                    item.innerHTML = `
                        <div style="font-weight:600; display:flex; justify-content:space-between;">
                            <span>${r.hostname || r.ip} (${r.ip})</span>
                            <span style="color:${r.success ? '#30d158' : 'var(--ios-accent-red)'}">
                                ${r.success ? '✓ Erfolgreich' : '✗ Fehlgeschlagen'}
                            </span>
                        </div>
                        <div style="color:var(--ios-text-secondary); margin-top:3px;">
                            Version: ${r.old_version} &rarr; <strong>${r.new_version}</strong> • ${r.message}
                        </div>
                    `;
                    resultsList.appendChild(item);
                });
            }
            if (typeof showDynamicIsland === "function") {
                showDynamicIsland("Firmware-Update", data.summary, "success");
            }
        } else {
            if (progressTitle) progressTitle.textContent = "Update fehlgeschlagen";
            if (progressFill) progressFill.style.background = "var(--ios-accent-red)";
            if (resultsList) {
                resultsList.innerHTML = `<div style="color:var(--ios-accent-red); font-size:12px; padding: 4px;">Fehler: ${data.detail || "Unbekannter Fehler"}</div>`;
            }
            if (typeof showDynamicIsland === "function") {
                showDynamicIsland("Fehler", data.detail || "Update fehlgeschlagen", "error");
            }
        }
    } catch (e) {
        if (progressTitle) progressTitle.textContent = "Netzwerkfehler beim Update";
        if (progressFill) progressFill.style.background = "var(--ios-accent-red)";
        if (resultsList) {
            resultsList.innerHTML = `<div style="color:var(--ios-accent-red); font-size:12px; padding: 4px;">Verbindungsfehler: ${e.message}</div>`;
        }
        if (typeof showDynamicIsland === "function") {
            showDynamicIsland("Netzwerkfehler", e.message, "error");
        }
    } finally {
        if (cancelBtn) {
            cancelBtn.disabled = false;
            cancelBtn.textContent = "Schließen";
        }
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = "Erneut ausführen";
        }
        await loadMiners();
    }
}
