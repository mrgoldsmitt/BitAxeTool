/**
 * BitAxeTool v2.1.0 - Modern iOS Liquid Glass Controller & Reactive Dashboard
 */

let socket = null;
let reconnectTimer = null;
let chartInstance = null;
let knownMiners = [];
let activeEditingIp = null;
let allLogs = [];
let currentLogFilter = "all";
let isMouseOverLogs = false;
let isChartVisible = true;
let currentTelemetry = [];
let selectedDiffMinerIndex = 0;
let lastTelemetryTimestamp = Date.now();

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

// --- Live Telemetry Rendering & iOS Liquid Glass Grid ---

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

    // 3. Render Best Difficulty Card
    renderBestDifficultyCard(telemetryList);

    // 4. Update Live Line Chart
    if (isChartVisible) {
        updateChartData(totalHashrate, avgAsicTemp);
    }

    // 5. Update Miner Cards
    telemetryList.forEach(t => {
        updateMinerCard(t);
    });

    // 6. Smart Notification Triggers
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

function renderBestDifficultyCard(telemetryList) {
    if (!telemetryList || telemetryList.length === 0) return;

    if (selectedDiffMinerIndex >= telemetryList.length) {
        selectedDiffMinerIndex = 0;
    }

    const currentMiner = telemetryList[selectedDiffMinerIndex];
    const minerCfg = knownMiners.find(m => m.ip === currentMiner.ip);
    const minerName = (minerCfg && minerCfg.nickname) ? minerCfg.nickname : (currentMiner.ip || "Bitaxe");

    const elName = document.getElementById("best-diff-miner-name");
    const elAllTime = document.getElementById("best-diff-all-time");
    const elSession = document.getElementById("best-diff-session");
    const elDots = document.getElementById("best-diff-pagination");

    if (elName) elName.textContent = minerName;
    if (elAllTime) elAllTime.textContent = formatDifficulty(currentMiner.best_diff);
    if (elSession) elSession.textContent = formatDifficulty(currentMiner.best_session_diff);

    if (elDots && telemetryList.length > 1) {
        elDots.innerHTML = telemetryList.map((_, idx) => `
            <span class="dot ${idx === selectedDiffMinerIndex ? 'active' : ''}" onclick="selectBestDiffMiner(${idx})" title="Miner wechseln"></span>
        `).join("");
    }
}

function selectBestDiffMiner(index) {
    selectedDiffMinerIndex = index;
    if (currentTelemetry.length > 0) {
        renderBestDifficultyCard(currentTelemetry);
    }
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
}

function getTempColorClass(temp) {
    if (!temp) return "";
    if (temp >= 68) return "temp-danger";
    if (temp >= 64) return "temp-warn";
    return "temp-cool";
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
    const secBestDiff = document.getElementById("section-best-diff");
    const secMiners = document.getElementById("section-miners");
    const secCharts = document.getElementById("section-charts");
    const secLogs = document.getElementById("section-logs");

    if (tab === "dashboard") {
        if (secKpis) secKpis.style.display = "grid";
        if (secBestDiff) secBestDiff.style.display = "flex";
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
    if (el) el.classList.add("active");
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
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

function openEditModal(ip) {
    activeEditingIp = ip;
    const miner = knownMiners.find(m => m.ip === ip);
    if (!miner) return;

    document.getElementById("edit-ip-display").textContent = `${miner.nickname || miner.ip} (${miner.ip})`;
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

    openModal("modal-edit-miner");
}

async function saveMinerSettings(e) {
    e.preventDefault();
    if (!activeEditingIp) return;

    const payload = {
        target_temp: parseFloat(document.getElementById("edit-target-temp").value),
        temp_tolerance: parseFloat(document.getElementById("edit-temp-tolerance").value),
        max_temp: parseFloat(document.getElementById("edit-max-temp").value),
        max_vr_temp: parseFloat(document.getElementById("edit-max-vr-temp").value),
        max_watts: parseFloat(document.getElementById("edit-max-watts").value),
        min_freq: parseInt(document.getElementById("edit-min-freq").value),
        max_freq: parseInt(document.getElementById("edit-max-freq").value),
        freq_step: parseInt(document.getElementById("edit-freq-step").value),
        min_voltage: parseInt(document.getElementById("edit-min-volt").value),
        max_voltage: parseInt(document.getElementById("edit-max-volt").value),
        voltage_step: parseInt(document.getElementById("edit-volt-step").value),
        tuning_cooldown: parseInt(document.getElementById("edit-cooldown").value),
        flatline_watchdog: document.getElementById("edit-flatline-toggle").checked,
        enabled: document.getElementById("edit-enabled-toggle").checked
    };

    try {
        const res = await fetch(`/api/miners/${activeEditingIp}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            closeModal("modal-edit-miner");
            await loadMiners();
        } else {
            alert("Fehler beim Speichern der Einstellungen.");
        }
    } catch (e) {
        alert("Netzwerkfehler beim Speichern.");
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

// --- Changelog Modal ---

async function openChangelogModal() {
    const content = document.getElementById("changelog-content");
    openModal("modal-changelog");
    try {
        const res = await fetch("/api/changelog");
        if (res.ok) {
            const text = await res.text();
            content.innerHTML = parseSimpleMarkdown(text);
        } else {
            content.innerHTML = "<p>Changelog konnte nicht geladen werden.</p>";
        }
    } catch (e) {
        content.innerHTML = "<p>Fehler beim Abrufen des Changelogs.</p>";
    }
}

function parseSimpleMarkdown(md) {
    let html = escapeHtml(md);
    html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
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

function updateNotificationPermissionStatus() {
    const textEl = document.getElementById("notif-perm-text");
    const btn = document.getElementById("btn-request-notif");
    const badgeDot = document.getElementById("notif-badge-dot");
    const dockDot = document.getElementById("dock-notif-dot");

    if (!("Notification" in window)) {
        if (textEl) {
            textEl.textContent = "Nicht vom Browser unterstützt";
            textEl.style.color = "var(--text-muted)";
        }
        if (btn) btn.style.display = "none";
        return;
    }

    const perm = Notification.permission;
    if (perm === "granted") {
        if (textEl) {
            textEl.textContent = "Aktiviert ✓";
            textEl.style.color = "var(--accent-green)";
        }
        if (btn) {
            btn.innerHTML = `✓ Benachrichtigungen aktiv`;
            btn.disabled = true;
            btn.className = "btn btn-secondary btn-sm";
        }
        if (badgeDot) badgeDot.style.display = "none";
        if (dockDot) dockDot.style.display = "none";
    } else if (perm === "denied") {
        if (textEl) {
            textEl.textContent = "Im Browser blockiert ✗";
            textEl.style.color = "var(--accent-red)";
        }
        if (btn) {
            btn.textContent = "In Browsereinstellungen gesperrt";
            btn.disabled = true;
            btn.className = "btn btn-secondary btn-sm";
        }
        if (badgeDot) badgeDot.style.display = "block";
        if (dockDot) dockDot.style.display = "block";
    } else {
        if (textEl) {
            textEl.textContent = "Noch nicht erlaubt";
            textEl.style.color = "var(--accent-orange)";
        }
        if (btn) {
            btn.innerHTML = `
                <svg class="ios-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                Benachrichtigungen im Browser erlauben
            `;
            btn.disabled = false;
            btn.className = "btn btn-primary btn-sm";
        }
        if (badgeDot) badgeDot.style.display = "block";
        if (dockDot) dockDot.style.display = "block";
    }
}

async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        alert("Dieser Browser unterstützt leider keine Web-Benachrichtigungen.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        updateNotificationPermissionStatus();
        if (permission === "granted") {
            playAlertSound("info");
            sendNotification(
                "BitAxe Benachrichtigungen aktiv",
                "Du erhältst ab sofort sofortige Alarme bei Überhitzung, Ausfällen oder Taktänderungen deiner Miner.",
                "welcome",
                false
            );
        }
    } catch (e) {
        console.warn("Fehler bei Notification.requestPermission:", e);
    }
}

function openNotificationModal() {
    loadNotificationSettings();
    openModal("modal-notifications");
}

function playAlertSound(type = "info") {
    if (!notifSettings.sound) return;
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
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
            osc.start(now);
            osc.stop(now + 0.45);
            if (navigator.vibrate) navigator.vibrate([250, 100, 250]);
        } else {
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
            if (navigator.vibrate) navigator.vibrate(120);
        }
    } catch (e) {}
}

function sendNotification(title, body, tag, isCritical = false) {
    playAlertSound(isCritical ? "danger" : "info");

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
    if ("Notification" in window && Notification.permission !== "granted") {
        requestNotificationPermission();
        return;
    }
    sendNotification(
        "BitAxe Test-Alarm",
        "Test erfolgreich! Benachrichtigungen und Vibrationen funktionieren einwandfrei auf deinem Gerät.",
        "test-" + Date.now(),
        false
    );
}

function checkNotificationTriggers(telemetryList) {
    if (!telemetryList || !Array.isArray(telemetryList)) return;
    const now = Date.now();

    telemetryList.forEach(t => {
        const ip = t.ip;
        const prev = previousMinerStates[ip];
        const minerCfg = knownMiners.find(m => m.ip === ip);
        const name = (minerCfg && minerCfg.nickname) ? minerCfg.nickname : ip;

        if (prev) {
            // 1. Überhitzung / Notdrosselung
            if (notifSettings.overheat) {
                const isThrottling = t.governor_status === "EMERGENCY_THROTTLE";
                const isOverMax = t.temp && minerCfg && minerCfg.max_temp && (t.temp >= minerCfg.max_temp);
                if (isThrottling || isOverMax) {
                    const alertKey = `overheat-${ip}`;
                    if (!lastAlertTimestamps[alertKey] || (now - lastAlertTimestamps[alertKey] > 120000)) {
                        lastAlertTimestamps[alertKey] = now;
                        sendNotification(
                            `ALARM: ${name} überhitzt!`,
                            `Chip-Temperatur liegt bei ${t.temp ? t.temp.toFixed(1) : '--'}°C. Notdrosselung aktiv!`,
                            alertKey,
                            true
                        );
                    }
                }
            }

            // 2. VR-Temperatur (Spannungswandler)
            if (notifSettings.vr && t.vr_temp && minerCfg && minerCfg.max_vr_temp) {
                if (t.vr_temp >= (minerCfg.max_vr_temp - 2.0)) {
                    const alertKey = `vr-${ip}`;
                    if (!lastAlertTimestamps[alertKey] || (now - lastAlertTimestamps[alertKey] > 120000)) {
                        lastAlertTimestamps[alertKey] = now;
                        sendNotification(
                            `VR-WARNUNG: ${name}`,
                            `Spannungswandler erreicht kritische ${t.vr_temp.toFixed(1)}°C (Limit: ${minerCfg.max_vr_temp}°C)!`,
                            alertKey,
                            true
                        );
                    }
                }
            }

            // 3. Miner Offline / Ausfall
            if (notifSettings.offline) {
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
            if (notifSettings.reboot) {
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
            if (notifSettings.tuning) {
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
