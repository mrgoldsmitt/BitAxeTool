"""Intelligent thermal governor, safe voltage-frequency scaling, and watchdog engine for Bitaxe miners."""

import asyncio
import time
import logging
from typing import Dict, Optional, Callable, List, Any
from app.models import MinerConfig, MinerTelemetry, LogEntry
from app.bitaxe_client import BitAxeClient
from app.hardware_profiles import get_profile_for_model, find_safe_voltage_for_freq

logger = logging.getLogger("BitAxeTool.tuner")


class MinerWorker:
    """Manages an isolated monitoring and auto-tuning loop for a single Bitaxe miner."""

    def __init__(self, config: MinerConfig, log_callback: Callable[[LogEntry], None]):
        self.config = config
        self.log_callback = log_callback
        self.client = BitAxeClient(config.ip, timeout=3.5)
        self.telemetry = MinerTelemetry(ip=config.ip)

        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._flatline_history: List[float] = []
        # Allow a short stabilization window on fresh startup before first tune
        self._last_tune_time: float = time.time() - max(0, config.tuning_cooldown - 12.0)
        self._last_telemetry_log_time: float = 0.0
        self._last_applied_freq: Optional[int] = None
        self._last_applied_volt: Optional[int] = None
        self._profile = get_profile_for_model(config.model or config.asic_model)

        # Hardware option caches
        self._supported_freqs: List[int] = []
        self._supported_volts: List[int] = []

        # Timed test mode state
        self._test_mode: bool = False
        self._test_end_time: Optional[float] = None
        self._test_duration_minutes: int = 5
        self._test_freq: Optional[int] = None
        self._test_volt: Optional[int] = None

    def start_manual_test(self, frequency: int, voltage: int, duration_minutes: int = 5) -> None:
        """Start a timed manual tuning test."""
        self._test_mode = True
        self._test_duration_minutes = duration_minutes
        self._test_freq = frequency
        self._test_volt = voltage
        if duration_minutes > 0:
            self._test_end_time = time.time() + (duration_minutes * 60.0)
        else:
            self._test_end_time = None
        self._last_applied_freq = frequency
        self._last_applied_volt = voltage
        self.telemetry.test_mode = True
        self.telemetry.test_freq = frequency
        self.telemetry.test_volt = voltage
        self.telemetry.test_remaining_seconds = int(duration_minutes * 60) if duration_minutes > 0 else None
        self.telemetry.governor_status = "TEST_MODE"
        self.telemetry.governor_message = f"Test aktiv: {frequency} MHz @ {voltage} mV ({duration_minutes} Min)"
        self.log(f"Test-Einstellung aktiviert: {frequency} MHz @ {voltage} mV für {duration_minutes} Min.", "info")

    def stop_manual_test(self) -> None:
        """Stop active manual test and return control to the autotuner governor."""
        if self._test_mode:
            self._test_mode = False
            self._test_end_time = None
            self._test_freq = None
            self._test_volt = None
            self.telemetry.test_mode = False
            self.telemetry.test_remaining_seconds = None
            self.telemetry.test_freq = None
            self.telemetry.test_volt = None
            self._last_tune_time = time.time()
            self.telemetry.governor_status = "STABILIZING"
            self.telemetry.governor_message = "Test-Einstellung beendet. Autotuning wieder aktiv."
            self.log("Test-Einstellung beendet. Autotuner übernimmt wieder die Regelung.", "info")

    def start(self) -> None:
        """Start the worker's asynchronous loop."""
        if self._running and self._task and not self._task.done():
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())

    def stop(self) -> None:
        """Stop the worker loop cleanly."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()

    def update_config(self, new_config: MinerConfig) -> None:
        """Update tuning parameters dynamically."""
        self.config = new_config
        self._profile = get_profile_for_model(new_config.model or new_config.asic_model)
        self.telemetry.frequency_options = self.get_available_frequencies()
        self.telemetry.voltage_options = self.get_available_voltages()
        self.log("Konfiguration dynamisch aktualisiert.", "info")

    def log(self, message: str, level: str = "info") -> None:
        """Helper to send timestamped logs to central sink."""
        entry = LogEntry(
            timestamp=time.strftime("%H:%M:%S"),
            level=level,
            miner_ip=self.config.ip,
            message=message
        )
        self.log_callback(entry)

    def get_available_frequencies(self) -> List[int]:
        """Return full calibrated frequency ladder honoring min_freq and max_freq."""
        steps = set()

        # 1. Calibrated tiers from profile (e.g. 450, 475, ..., 950)
        if self._profile and self._profile.scaling_tiers:
            for tier in self._profile.scaling_tiers:
                if self.config.min_freq <= tier.frequency <= self.config.max_freq:
                    steps.add(tier.frequency)

        # 2. AxeOS preset dropdown options
        if self._supported_freqs:
            for f in self._supported_freqs:
                if self.config.min_freq <= f <= self.config.max_freq:
                    steps.add(f)

        # 3. Grid steps based on config.freq_step
        step = max(5, self.config.freq_step or 25)
        f = self.config.min_freq
        while f <= self.config.max_freq:
            steps.add(f)
            f += step

        # 4. Include current frequency
        if self.telemetry.frequency:
            steps.add(self.telemetry.frequency)

        return sorted(list(steps))

    def get_available_voltages(self) -> List[int]:
        """Return full voltage ladder honoring min_voltage and max_voltage."""
        volts = set()

        # 1. From profile calibrated scaling tiers
        if self._profile and self._profile.scaling_tiers:
            for tier in self._profile.scaling_tiers:
                if self.config.min_voltage <= tier.voltage <= self.config.max_voltage:
                    volts.add(tier.voltage)

        # 2. From AxeOS options
        if self._supported_volts:
            for v in self._supported_volts:
                if self.config.min_voltage <= v <= self.config.max_voltage:
                    volts.add(v)

        # 3. Grid steps
        step = max(5, self.config.voltage_step or 10)
        v = self.config.min_voltage
        while v <= self.config.max_voltage:
            volts.add(v)
            v += step

        # 4. Include current voltage
        if self.telemetry.voltage:
            volts.add(self.telemetry.voltage)

        return sorted(list(volts))

    async def _initialize_hardware_profiles(self) -> None:
        """Query /api/system/asic to get official hardware frequency and voltage steps."""
        asic_info = await self.client.get_asic_settings()
        if asic_info:
            freq_opts = asic_info.get("frequencyOptions", [])
            volt_opts = asic_info.get("voltageOptions", [])
            if freq_opts:
                self._supported_freqs = sorted([int(f) for f in freq_opts if int(f) > 0])
            if volt_opts:
                self._supported_volts = sorted([int(v) for v in volt_opts if int(v) > 0])

            model_name = asic_info.get("deviceModel") or asic_info.get("ASICModel")
            if model_name and (self.config.model == "Unknown" or not self.config.model):
                self.config.model = model_name
                self._profile = get_profile_for_model(model_name)
                self.log(f"Hardware erkannt: {model_name}.", "info")

        self.telemetry.frequency_options = self.get_available_frequencies()
        self.telemetry.voltage_options = self.get_available_voltages()

    async def _loop(self) -> None:
        """Main worker control cycle."""
        self.log(f"Autotuner initialisiert für {self.config.nickname or self.config.ip}", "info")
        await self._initialize_hardware_profiles()

        while self._running:
            try:
                info = await self.client.get_system_info()
                now = time.time()

                if not info or not isinstance(info, dict):
                    self.telemetry.connected = False
                    self.telemetry.governor_status = "OFFLINE"
                    self.telemetry.governor_message = "Miner nicht erreichbar. Neuer Versuch..."
                    await asyncio.sleep(self.config.monitor_interval)
                    continue

                # Parse Telemetry
                self._update_telemetry(info, now)

                # Periodic Telemetry Log to disk / UI (every ~30s)
                if now - self._last_telemetry_log_time >= 30.0:
                    self._log_telemetry_summary()
                    self._last_telemetry_log_time = now

                # Execute Watchdogs & Tuning
                if self.config.enabled:
                    await self._evaluate_governor(now)
                else:
                    self.telemetry.governor_status = "PAUSED"
                    self.telemetry.governor_message = "Autotuning ist für diesen Miner pausiert."

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.log(f"Fehler im Regelungszyklus: {str(e)}", "error")

            await asyncio.sleep(self.config.monitor_interval)

        self.telemetry.governor_status = "STOPPED"
        self.log("Worker gestoppt.", "warning")

    def _update_telemetry(self, info: Dict[str, Any], now: float) -> None:
        """Extract and compute performance metrics from AxeOS payload."""
        self.telemetry.connected = True
        self.telemetry.last_seen = now

        # Parse temperature (chip temp)
        t = info.get("temp")
        if t is None:
            t = info.get("chipTemp")
        self.telemetry.temp = float(t) if t is not None else None

        # Parse VR temperature
        vr = info.get("vrTemp")
        if vr is None:
            vr = info.get("vr_temp")
        self.telemetry.vr_temp = float(vr) if vr is not None else None

        # Parse Hashrate
        hr = info.get("hashRate")
        if hr is None:
            hr = info.get("hashrate")
        self.telemetry.hash_rate = float(hr) if hr is not None else 0.0

        # Parse Expected Hashrate
        exp_hr = info.get("expectedHashrate")
        if exp_hr is None:
            exp_hr = info.get("expected_hashrate")
        self.telemetry.expected_hash_rate = float(exp_hr) if exp_hr is not None else None

        # Parse Power
        p = info.get("power")
        if p is None:
            p = info.get("powerConsumption")
        self.telemetry.power = float(p) if p is not None else None

        # Parse Frequency
        freq = info.get("frequency")
        if freq is None:
            freq = info.get("freq")
        if freq is not None and int(freq) > 0:
            self.telemetry.frequency = int(freq)
            self._last_applied_freq = int(freq)

        # Parse Voltage (Core Voltage in mV)
        volt = info.get("coreVoltage")
        if volt is None:
            volt = info.get("core_voltage")
        if volt is not None and int(volt) > 0:
            self.telemetry.voltage = int(volt)
            self._last_applied_volt = int(volt)

        # Fan & Error stats
        self.telemetry.fanspeed = float(info.get("fanspeed", 0.0)) if info.get("fanspeed") is not None else None
        self.telemetry.fanrpm = int(info.get("fanrpm", 0)) if info.get("fanrpm") is not None else None
        self.telemetry.shares_accepted = int(info.get("sharesAccepted", 0))
        self.telemetry.shares_rejected = int(info.get("sharesRejected", 0))
        self.telemetry.error_percentage = float(info.get("errorPercentage", 0.0))
        self.telemetry.uptime_seconds = int(info.get("uptimeSeconds", 0))
        self.telemetry.overheat_mode = int(info.get("overheat_mode", 0))
        self.telemetry.best_diff = int(info.get("bestDiff", 0))
        self.telemetry.best_session_diff = int(info.get("bestSessionDiff", 0))

        # Efficiency in Joules / Terahash: (Power Watts / (Hashrate GH/s / 1000))
        if self.telemetry.power and self.telemetry.hash_rate and self.telemetry.hash_rate > 10:
            self.telemetry.efficiency_j_th = round(self.telemetry.power / (self.telemetry.hash_rate / 1000.0), 2)
        else:
            self.telemetry.efficiency_j_th = None

        # Ensure frequency and voltage option lists are populated
        if not self.telemetry.frequency_options:
            self.telemetry.frequency_options = self.get_available_frequencies()
        if not self.telemetry.voltage_options:
            self.telemetry.voltage_options = self.get_available_voltages()

    def _log_telemetry_summary(self) -> None:
        """Record periodic snapshot of miner values for tracking."""
        name = self.config.nickname or self.config.ip
        hr = f"{self.telemetry.hash_rate:.0f} GH/s" if self.telemetry.hash_rate else "-- GH/s"
        temp = f"{self.telemetry.temp:.1f}°C" if self.telemetry.temp is not None else "--"
        vr = f"VR: {self.telemetry.vr_temp:.1f}°C" if self.telemetry.vr_temp is not None else "VR: --"
        power = f"{self.telemetry.power:.1f}W" if self.telemetry.power is not None else "-- W"
        freq = f"{self.telemetry.frequency} MHz" if self.telemetry.frequency else "-- MHz"
        volt = f"{self.telemetry.voltage} mV" if self.telemetry.voltage else "-- mV"
        eff = f"{self.telemetry.efficiency_j_th} J/TH" if self.telemetry.efficiency_j_th else "-- J/TH"
        status = self.telemetry.governor_status

        msg = f"[TELEMETRIE] {name} | {hr} | Chip: {temp} | {vr} | {power} | {freq} @ {volt} | {eff} | {status}"
        self.log(msg, "telemetry")

    async def _evaluate_governor(self, now: float) -> None:
        """Adaptive closed-loop thermal and electrical governor."""
        temp = self.telemetry.temp
        vr_temp = self.telemetry.vr_temp
        power = self.telemetry.power
        hash_rate = self.telemetry.hash_rate or 0.0

        # Determine current operating frequency and voltage safely
        current_freq = self.telemetry.frequency or self._last_applied_freq or self.config.min_freq
        current_volt = self.telemetry.voltage or self._last_applied_volt or self.config.min_voltage

        # 1. Flatline / Freeze Watchdog
        if self.config.flatline_watchdog:
            self._flatline_history.append(hash_rate)
            if len(self._flatline_history) > self.config.flatline_cycles:
                self._flatline_history.pop(0)

            # Trigger only if all recorded cycles are 0 (or < 5 GH/s)
            if len(self._flatline_history) >= self.config.flatline_cycles and all(h < 5.0 for h in self._flatline_history):
                self.log(f"KRITISCH: Hashrate für {self.config.flatline_cycles} Zyklen eingefroren (0 GH/s). Automatischer Neustart wird eingeleitet!", "error")
                self.telemetry.governor_status = "RESTARTING"
                self.telemetry.governor_message = "Hashrate eingefroren. Miner führt Neustart durch..."
                await self.client.restart()
                self._flatline_history.clear()
                self._last_tune_time = now + 45.0
                await asyncio.sleep(45)  # Allow miner to reboot
                return

        # 2. Hard Limits: Emergency Safety Throttle (Over-temp, VR over-temp, or Power limit exceeded)
        is_over_temp = temp is not None and temp > 10.0 and temp >= self.config.max_temp
        is_over_vr = vr_temp is not None and vr_temp > 10.0 and vr_temp >= self.config.max_vr_temp
        is_over_power = power is not None and power >= self.config.max_watts

        if is_over_temp or is_over_vr:
            reason = []
            if is_over_temp:
                reason.append(f"Chip-Temperatur {temp:.1f}°C >= Limit {self.config.max_temp:.1f}°C")
            if is_over_vr:
                reason.append(f"VR-Temperatur {vr_temp:.1f}°C >= Limit {self.config.max_vr_temp:.1f}°C")

            self.telemetry.governor_status = "EMERGENCY_THROTTLE"
            self.telemetry.governor_message = f"Thermische Notdrosselung aktiv: {', '.join(reason)}"

            # Step frequency down with minimum stabilization cooldown (15s) to avoid crashing the ASIC PLL
            if now - self._last_tune_time >= 15.0:
                new_freq = self._get_next_lower_frequency(current_freq)
                new_volt = self._get_safe_voltage(new_freq)

                if new_freq < current_freq or new_volt < current_volt:
                    self.log(f"Thermische Notdrosselung ({', '.join(reason)}): Reduziere Takt auf {new_freq} MHz @ {new_volt} mV", "warning")
                    ok, msg = await self.client.apply_tuning(new_freq, new_volt)
                    if ok:
                        self._last_applied_freq = new_freq
                        self._last_applied_volt = new_volt
                        self.telemetry.frequency = new_freq
                        self.telemetry.voltage = new_volt
                    self._last_tune_time = now
                else:
                    self.log(f"Bereits auf Minimaltakt ({new_freq} MHz). Kühlung oder Lüfter prüfen!", "error")
            return

        if is_over_power:
            reason = [f"Leistung {power:.1f}W >= Limit {self.config.max_watts:.1f}W"]
            self.telemetry.governor_status = "POWER_THROTTLE"
            self.telemetry.governor_message = f"Leistungs-Drosselung aktiv: {', '.join(reason)}"

            # Step frequency down with minimum stabilization cooldown (15s)
            if now - self._last_tune_time >= 15.0:
                new_freq = self._get_next_lower_frequency(current_freq)
                new_volt = self._get_safe_voltage(new_freq)

                if new_freq < current_freq or new_volt < current_volt:
                    self.log(f"Leistungs-Drosselung ({', '.join(reason)}): Reduziere Takt auf {new_freq} MHz @ {new_volt} mV", "info")
                    ok, msg = await self.client.apply_tuning(new_freq, new_volt)
                    if ok:
                        self._last_applied_freq = new_freq
                        self._last_applied_volt = new_volt
                        self.telemetry.frequency = new_freq
                        self.telemetry.voltage = new_volt
                    self._last_tune_time = now
                else:
                    self.log(f"Bereits auf Minimaltakt ({new_freq} MHz). Netzteil prüfen!", "error")
            return

        # 2b. Timed Manual Test Mode: hold test clock/voltage until expired or canceled
        if self._test_mode:
            if self._test_end_time and now >= self._test_end_time:
                # Timer expired! Return control to autotuner
                self._test_mode = False
                self._test_end_time = None
                self._test_freq = None
                self._test_volt = None
                self.telemetry.test_mode = False
                self.telemetry.test_remaining_seconds = None
                self.telemetry.test_freq = None
                self.telemetry.test_volt = None
                self._last_tune_time = now
                self.telemetry.governor_status = "STABILIZING"
                self.telemetry.governor_message = f"Test ({self._test_duration_minutes} Min) beendet. Autotuner übernimmt wieder."
                self.log(f"Test-Einstellung nach {self._test_duration_minutes} Minuten abgelaufen. Autotuner übernimmt wieder die Regelung.", "info")
            else:
                remaining_sec = int(self._test_end_time - now) if self._test_end_time else 0
                self.telemetry.test_mode = True
                self.telemetry.test_remaining_seconds = remaining_sec
                self.telemetry.test_freq = self._test_freq
                self.telemetry.test_volt = self._test_volt
                self.telemetry.governor_status = "TEST_MODE"
                mins = remaining_sec // 60
                secs = remaining_sec % 60
                time_str = f"{mins}:{secs:02d} Min" if self._test_end_time else "unbegrenzt"
                self.telemetry.governor_message = f"Test aktiv: {self._test_freq} MHz @ {self._test_volt} mV (noch {time_str})"
                # Hold test parameters without autotuner override
                return

        # 2b. Excessive ASIC error rate safeguard (overclock instability / runaway)
        err_pct = self.telemetry.error_percentage
        uptime_s = self.telemetry.uptime_seconds or 0
        # Allow at least 300s (5 minutes) for startup work queue to dilute initial boot PLL errors
        if uptime_s >= 300 and err_pct is not None and err_pct > 15.0:
            if now - self._last_tune_time >= self.config.tuning_cooldown:
                new_freq = self._get_next_lower_frequency(current_freq)
                new_volt = self._get_safe_voltage(new_freq)
                if new_freq < current_freq:
                    self.log(
                        f"ASIC-Fehlerrate zu hoch ({err_pct:.1f}% > 15.0%). "
                        f"Reduziere Takt auf {new_freq} MHz @ {new_volt} mV zur Stabilisierung",
                        "warning"
                    )
                    ok, msg = await self.client.apply_tuning(new_freq, new_volt)
                    if ok:
                        self._last_applied_freq = new_freq
                        self._last_applied_volt = new_volt
                        self.telemetry.frequency = new_freq
                        self.telemetry.voltage = new_volt
                    self._last_tune_time = now
                    self.telemetry.governor_status = "STABILIZING"
                    self.telemetry.governor_message = f"Hohe Fehlerrate ({err_pct:.1f}%). Takt auf {new_freq} MHz gesenkt."
                    return
                else:
                    self.telemetry.governor_status = "MIN_CLOCK"
                    self.telemetry.governor_message = f"ASIC-Fehlerrate hoch ({err_pct:.1f}%), aber bereits auf Minimaltakt ({current_freq} MHz)."
                    return

        # 3. Symmetrical Deadband around Target Temperature
        upper_bound = self.config.target_temp + self.config.temp_tolerance
        # Lower sweet spot boundary: tight deadband (max 1.0°C below target) so cold-running miners
        # (e.g. Noctua setups) don't get stuck prematurely below target when power/clock headroom exists.
        lower_sweet_spot = max(self.config.target_temp - 1.0, self.config.target_temp - self.config.temp_tolerance)
        lower_bound = self.config.target_temp - self.config.temp_tolerance

        # Check if below configured minimum frequency
        if current_freq < self.config.min_freq:
            if temp is not None and temp >= self.config.max_temp:
                self.telemetry.governor_status = "EMERGENCY_THROTTLE"
                self.telemetry.governor_message = f"Notfall-Temperatur ({temp:.1f}°C >= {self.config.max_temp:.1f}°C)! Takt kann nicht auf Mindesttakt gehoben werden."
                return
            if power is not None and power >= self.config.max_watts:
                self.telemetry.governor_status = "POWER_THROTTLE"
                self.telemetry.governor_message = f"Leistungsgrenze ({power:.1f}W >= {self.config.max_watts:.1f}W)! Takt kann nicht auf Mindesttakt gehoben werden."
                return
            if now - self._last_tune_time >= self.config.tuning_cooldown:
                target_step = self._get_next_higher_frequency(current_freq)
                target_volt = self._get_safe_voltage(target_step)
                self.log(f"Takt ({current_freq} MHz) unter Mindesttakt ({self.config.min_freq} MHz). Hebe an auf {target_step} MHz @ {target_volt} mV", "info")
                ok, msg = await self.client.apply_tuning(target_step, target_volt)
                if ok:
                    self._last_applied_freq = target_step
                    self._last_applied_volt = target_volt
                    self.telemetry.frequency = target_step
                    self.telemetry.voltage = target_volt
                self._last_tune_time = now
                self.telemetry.governor_status = "RAMPING_UP"
                self.telemetry.governor_message = f"Takt angehoben auf {target_step} MHz @ {target_volt} mV (Ziel: Mindesttakt {self.config.min_freq} MHz)."
                return

        # 4. Over Target Band (Warm, but below hard emergency max_temp)
        if temp is not None and temp > 10.0 and temp > upper_bound:
            if now - self._last_tune_time < self.config.tuning_cooldown:
                self.telemetry.governor_status = "STABILIZING"
                remaining = int(self.config.tuning_cooldown - (now - self._last_tune_time))
                self.telemetry.governor_message = f"Kühlt ab: {temp:.1f}°C > {upper_bound:.1f}°C. Warte Stabilisierung ab ({remaining}s)"
                return

            new_freq = self._get_next_lower_frequency(current_freq)
            new_volt = self._get_safe_voltage(new_freq)
            if new_freq < current_freq or new_volt < current_volt:
                self.log(f"Temperatur {temp:.1f}°C über Zielband ({upper_bound:.1f}°C). Senke vorsichtig auf {new_freq} MHz @ {new_volt} mV", "info")
                ok, msg = await self.client.apply_tuning(new_freq, new_volt)
                if ok:
                    self._last_applied_freq = new_freq
                    self._last_applied_volt = new_volt
                    self.telemetry.frequency = new_freq
                    self.telemetry.voltage = new_volt
                self._last_tune_time = now
                self.telemetry.governor_status = "COOLING_DOWN"
                self.telemetry.governor_message = f"Takt gesenkt auf {new_freq} MHz @ {new_volt} mV zur Abkühlung."
            else:
                self.telemetry.governor_status = "MIN_CLOCK"
                self.telemetry.governor_message = f"Bereits auf Minimaltakt ({current_freq} MHz). Kühlung prüfen!"
            return

        # 5. Under Target Sweet Spot (Cool, thermal headroom available to ramp up)
        if temp is not None and temp > 10.0 and temp < lower_sweet_spot:
            # Check maximum configured clock limit
            if current_freq >= self.config.max_freq:
                self.telemetry.governor_status = "MAX_CLOCK"
                self.telemetry.governor_message = f"Maximaler konfigurierter Takt ({current_freq} MHz) erreicht."
                return

            # Check electrical headroom (leave at least 1.5W margin before max_watts to prevent oscillation)
            if power is not None and power >= (self.config.max_watts - 1.5):
                self.telemetry.governor_status = "POWER_LIMITED"
                self.telemetry.governor_message = f"Leistungsgrenze ({power:.1f}W / {self.config.max_watts:.1f}W) erreicht. Halte Takt."
                return

            # Check VR headroom (leave at least 3°C margin before max_vr_temp)
            if vr_temp is not None and vr_temp >= (self.config.max_vr_temp - 3.0):
                self.telemetry.governor_status = "VR_LIMITED"
                self.telemetry.governor_message = f"VR-Temperaturgrenze ({vr_temp:.1f}°C / {self.config.max_vr_temp:.1f}°C) erreicht. Halte Takt."
                return

            # Check excessive ASIC error percentage
            if self.telemetry.error_percentage and self.telemetry.error_percentage > 30.0:
                self.telemetry.governor_status = "STABILIZING"
                self.telemetry.governor_message = f"ASIC-Fehlerrate ({self.telemetry.error_percentage:.1f}%) erhöht. Halte Takt zur Stabilisierung."
                return

            # Check stabilization cooldown before stepping up
            if now - self._last_tune_time < self.config.tuning_cooldown:
                self.telemetry.governor_status = "STABILIZING"
                remaining = int(self.config.tuning_cooldown - (now - self._last_tune_time))
                self.telemetry.governor_message = f"Thermischer Spielraum ({temp:.1f}°C < {lower_sweet_spot:.1f}°C). Stabilisiere ({remaining}s)"
                return

            # All checks passed: Step up frequency safely
            new_freq = self._get_next_higher_frequency(current_freq)
            new_volt = self._get_safe_voltage(new_freq)

            if new_freq > current_freq:
                self.log(f"Thermischer Spielraum vorhanden ({temp:.1f}°C < {lower_sweet_spot:.1f}°C). Erhöhe Takt auf {new_freq} MHz @ {new_volt} mV (Ziel: {self.config.target_temp:.1f}°C)", "info")
                ok, msg = await self.client.apply_tuning(new_freq, new_volt)
                if ok:
                    self._last_applied_freq = new_freq
                    self._last_applied_volt = new_volt
                    self.telemetry.frequency = new_freq
                    self.telemetry.voltage = new_volt
                    self._last_tune_time = now
                    self.telemetry.governor_status = "RAMPING_UP"
                    self.telemetry.governor_message = f"Takt gesteigert auf {new_freq} MHz @ {new_volt} mV."
                else:
                    self.log(f"Tuning-Fehler beim Setzen von {new_freq} MHz: {msg}", "error")
                    self.telemetry.governor_status = "ERROR"
                    self.telemetry.governor_message = f"Fehler beim Anwenden: {msg}"
            else:
                self.telemetry.governor_status = "MAX_CLOCK"
                self.telemetry.governor_message = f"Höchster verfügbarer Takt ({current_freq} MHz) erreicht."
            return

        # Optimal target equilibrium: temp is within sweet spot band [lower_sweet_spot, upper_bound]
        if temp is not None and temp > 10.0 and lower_sweet_spot <= temp <= upper_bound:
            self.telemetry.governor_status = "OPTIMAL"
            self.telemetry.governor_message = f"Optimal: {temp:.1f}°C liegt im Zielband ({lower_sweet_spot:.1f}°C - {upper_bound:.1f}°C)"
            return

    def _get_next_higher_frequency(self, current_freq: int) -> int:
        """Find the next safe frequency step upwards."""
        freqs = self.get_available_frequencies()
        for f in freqs:
            if f > current_freq and f <= self.config.max_freq:
                return f
        if current_freq < self.config.max_freq:
            step = max(5, self.config.freq_step or 25)
            return min(self.config.max_freq, current_freq + step)
        return min(current_freq, self.config.max_freq)

    def _get_next_lower_frequency(self, current_freq: int) -> int:
        """Find the next safe frequency step downwards."""
        freqs = self.get_available_frequencies()
        for f in reversed(freqs):
            if f < current_freq and f >= self.config.min_freq:
                return f
        return max(current_freq, self.config.min_freq)

    def _get_safe_voltage(self, freq: int) -> int:
        """Calculate optimal voltage for target frequency obeying user limits."""
        if self.config.enforce_safe_tiers and self._profile and self._profile.scaling_tiers:
            calc_volt = find_safe_voltage_for_freq(freq, self._profile.scaling_tiers, self.config.min_voltage)
        else:
            calc_volt = self.config.min_voltage

        return max(self.config.min_voltage, min(calc_volt, self.config.max_voltage))


class TunerManager:
    """Orchestrates all miner workers and manages global event dispatching."""

    def __init__(self, log_sink: Callable[[LogEntry], None]):
        self.log_sink = log_sink
        self.workers: Dict[str, MinerWorker] = {}

    def sync_miners(self, configs: List[MinerConfig]) -> None:
        """Synchronize active workers with current miner configurations."""
        active_ips = {m.ip for m in configs}

        # Remove workers no longer in config
        for ip in list(self.workers.keys()):
            if ip not in active_ips:
                self.workers[ip].stop()
                del self.workers[ip]

        # Add or update workers
        for cfg in configs:
            if cfg.ip in self.workers:
                self.workers[cfg.ip].update_config(cfg)
            else:
                worker = MinerWorker(cfg, self.log_sink)
                self.workers[cfg.ip] = worker
                worker.start()

    def get_all_telemetry(self) -> List[MinerTelemetry]:
        """Collect current telemetry snapshots across all miners."""
        return [w.telemetry for w in self.workers.values()]

    def start_manual_test(self, ip: str, frequency: int, voltage: int, duration_minutes: int = 5) -> bool:
        """Activate timed manual test mode on a specific miner worker."""
        worker = self.workers.get(ip)
        if worker:
            worker.start_manual_test(frequency, voltage, duration_minutes)
            return True
        return False

    def stop_manual_test(self, ip: str) -> bool:
        """Stop timed manual test mode and return control to the autotuner."""
        worker = self.workers.get(ip)
        if worker:
            worker.stop_manual_test()
            return True
        return False

    def stop_all(self) -> None:
        """Stop all background workers cleanly."""
        for worker in self.workers.values():
            worker.stop()
        self.workers.clear()
