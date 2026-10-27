/**
 * BitAxeTool v2.1.0 - Reactive Dashboard, Realtime Log Streaming & Governor Controller
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

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    initChart();
    initWebSocket();
    loadMiners();
    loadNetworkInfo();
    setupEventListeners();
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
        badge.title = "Echtzeit-Verbindung aktiv";
        badge.style.color = "var(--accent-green)";
        badge.style.borderColor = "rgba(16, 185, 129, 0.3)";
        badge.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
    } else {
        badge.textContent = "OFFLINE";
        badge.title = "Verbindung getrennt - verbinde neu...";
        badge.style.color = "var(--accent-red)";
        badge.style.borderColor = "rgba(239, 68, 68, 0.3)";
        badge.style.backgroundColor = "rgba(239, 68, 68, 0.12)";
    }
}

// --- Live Telemetry Rendering ---

function renderTelemetry(telemetryList) {
    if (!telemetryList || !Array.isArray(telemetryList)) return;

    // 1. Compute Global Aggregates
    let totalHashrate = 0;
    let totalWatts = 0;
    let maxTemp = 0;
    let onlineCount = 0;

    telemetryList.forEach(t => {
        if (t.connected) {
            onlineCount++;
            if (t.hash_rate) totalHashrate += t.hash_rate;
            if (t.power) totalWatts += t.power;
            if (t.temp && t.temp > maxTemp) maxTemp = t.temp;
        }
    });

    const elHash = document.getElementById("kpi-total-hashrate");
    const elWatts = document.getElementById("kpi-total-watts");
    const elTemp = document.getElementById("kpi-max-temp");
    const elEff = document.getElementById("kpi-total-efficiency");
    const elCount = document.getElementById("kpi-miner-count");

    if (elHash) {
        elHash.textContent = (totalHashrate >= 1000) 
            ? (totalHashrate / 1000).toFixed(2) + " TH/s" 
            : Math.round(totalHashrate) + " GH/s";
    }
    if (elWatts) elWatts.textContent = totalWatts.toFixed(1) + " W";
    if (elTemp) elTemp.textContent = (maxTemp > 0 ? maxTemp.toFixed(1) : "--") + " °C";
    if (elCount) elCount.textContent = `${onlineCount} / ${telemetryList.length}`;

    if (elEff) {
        if (totalHashrate > 50 && totalWatts > 0) {
            const eff = totalWatts / (totalHashrate / 1000.0);
            elEff.textContent = eff.toFixed(1) + " J/TH";
        } else {
            elEff.textContent = "-- J/TH";
        }
    }

    // 2. Update Live Line Chart
    if (isChartVisible) {
        updateChartData(totalHashrate, maxTemp);
    }

    // 3. Update Miner Cards
    telemetryList.forEach(t => {
        updateMinerCard(t);
    });
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
            tempVal.textContent = `${telemetry.temp.toFixed(1)} °C`;
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
                    borderColor: "#F59E0B",
                    backgroundColor: "rgba(245, 158, 11, 0.08)",
                    borderWidth: 2.2,
                    tension: 0.35,
                    fill: true,
                    yAxisID: "y-hash"
                },
                {
                    label: "Höchsttemperatur (°C)",
                    data: tempData,
                    borderColor: "#EF4444",
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
                    grid: { color: "#1F2937" },
                    ticks: { color: "#9CA3AF", font: { size: 10 } }
                },
                "y-temp": {
                    type: "linear",
                    position: "right",
                    grid: { display: false },
                    min: 30,
                    max: 85,
                    ticks: { color: "#EF4444", font: { size: 10 } }
                }
            },
            plugins: {
                legend: {
                    labels: { color: "#E5E7EB", boxWidth: 12, font: { size: 11, weight: "bold" } }
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
        btn.textContent = "📊 Diagramm ausblenden";
    } else {
        sec.style.display = "none";
        btn.textContent = "📊 Diagramm einblenden";
    }
}

// --- Real-Time Log Engine with Instant Streaming & Filters ---

function handleIncomingLog(logEntry) {
    allLogs.push(logEntry);
    if (allLogs.length > 500) {
        allLogs.shift();
    }

    // Check if entry passes active filter
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
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
                <p style="color: var(--text-muted); font-size: 1.05rem; margin-bottom: 14px;">Noch keine Bitaxe-Miner eingerichtet.</p>
                <button onclick="openScanModal()" class="btn btn-primary">Netzwerk automatisch nach Bitaxe-Geräten durchsuchen</button>
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

        <!-- 4 Clean Tiles Layout -->
        <div class="metrics-quad">
            <div class="metric-quad-item">
                <div class="metric-quad-header">
                    <span class="metric-quad-title">⚡ Hashrate</span>
                </div>
                <div class="metric-quad-value card-val-hash">--</div>
                <div class="metric-quad-sub card-sub-hash">Warte auf Messung...</div>
            </div>

            <div class="metric-quad-item">
                <div class="metric-quad-header">
                    <span class="metric-quad-title">🌡️ Temperatur</span>
                </div>
                <div class="metric-quad-value card-val-temp">--</div>
                <div class="metric-quad-sub card-sub-temp">Ziel: ${miner.target_temp}°C (±${miner.temp_tolerance}°C)</div>
            </div>

            <div class="metric-quad-item">
                <div class="metric-quad-header">
                    <span class="metric-quad-title">⚙️ Takt & Kern</span>
                </div>
                <div class="metric-quad-value card-val-freq">--</div>
                <div class="metric-quad-sub card-sub-freq">Bereich: ${miner.min_freq} - ${miner.max_freq} MHz</div>
            </div>

            <div class="metric-quad-item">
                <div class="metric-quad-header">
                    <span class="metric-quad-title">🔋 Leistung & Effizienz</span>
                </div>
                <div class="metric-quad-value card-val-power">--</div>
                <div class="metric-quad-sub card-sub-power">Max: ${miner.max_watts} W</div>
            </div>
        </div>

        <!-- Sleek Responsive 2x2/4x1 Action Toolbar -->
        <div class="card-actions">
            <button onclick="openEditModal('${miner.ip}')" class="btn btn-secondary btn-sm" title="Regelungsparameter & Schwellen anpassen">
                ⚙️ Einstellungen
            </button>
            <button onclick="openManualTuneModal('${miner.ip}')" class="btn btn-secondary btn-sm" title="Manuellen Frequenz- und Spannungstest ausführen">
                ⚡ Schnelltest
            </button>
            <button onclick="restartMiner('${miner.ip}')" class="btn btn-secondary btn-sm text-rose-400" title="Miner neu starten">
                🔄 Reboot
            </button>
            <button onclick="openMinerWebUI('${miner.ip}')" class="btn btn-secondary btn-sm" title="AxeOS Weboberfläche im Browser öffnen">
                🌐 Web-UI
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

// Preset Handlers (Calibrated for real headroom)
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
                <div class="discovered-item">
                    <div class="discovered-info">
                        <strong>${escapeHtml(m.hostname || m.ip)}</strong>
                        <span style="font-size: 0.78rem; color: var(--text-muted); font-family: monospace;">${m.ip} • ${escapeHtml(m.model)}</span>
                        <span style="font-size: 0.75rem; color: var(--accent-gold);">${m.hash_rate ? Math.round(m.hash_rate) + ' GH/s @ ' + m.frequency + ' MHz' : 'Bereit'}</span>
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
    // Replace headers
    html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");
    // Replace bold
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Replace code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Replace bullet points
    html = html.replace(/^\- (.*$)/gim, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/gim, "<ul>$1</ul>");
    // Line breaks
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
