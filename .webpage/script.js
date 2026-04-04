/**
 * PLC Simulation Engine & Connection Manager
 * Orchestrates the binary sync loop between Dashboard and PLC.
 */
const SimulationEngine = {
    socket: null,
    intervalId: null,
    isConnected: false,

    async connect() {
        if (this.isConnecting || this.isConnected) return;
        this.isConnecting = true;
        
        const btn = document.getElementById('btn-ws-connect');
        if (btn) { btn.innerText = '⏳ CONNECTING...'; btn.style.opacity = '0.5'; }

        const settings = window.getCommSettings();
        this.disconnect();
        
        try {
            this.socket = new WebSocket(settings.url);
            this.socket.binaryType = 'arraybuffer';

            this.socket.onopen = () => {
                this.isConnected = true;
                this.isConnecting = false;
                if (btn) { btn.innerText = '🟩 CONNECTED'; btn.style.background = 'var(--success)'; btn.style.opacity = '1'; }
                this.startLoop(settings.txRate);
            };

            this.socket.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    window.outputHandler.unpackPayload(event.data);
                    window.updateMonitorValues();
                }
            };

            this.socket.onclose = () => {
                this.disconnect();
            };

            this.socket.onerror = () => {
                this.disconnect();
            };
        } catch (e) {
            this.disconnect();
        }
    },

    disconnect() {
        this.isConnected = false;
        this.isConnecting = false;
        const btn = document.getElementById('btn-ws-connect');
        if (btn) { btn.innerText = '🚀 CONNECT SIMULATION'; btn.style.background = ''; btn.style.opacity = '1'; }

        if (this.intervalId) clearInterval(this.intervalId);
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.onerror = null;
            this.socket.close();
            this.socket = null;
        }
    },

    startLoop(rate) {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => {
            this.sync();
        }, rate);
    },

    sync() {
        if (!this.isConnected || !this.socket) return;

        // 1. Auto-increment Watchdog
        const wd = window.inputHandler.signals[0];
        if (wd) wd.value = (Number(wd.value || 0) + 1) % 255;
        window.updateMonitorValues(); // Show WD activity

        // 2. Pack & Send Inputs (To PLC)
        const buffer = window.inputHandler.packPayload();
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(buffer);
        }
    }
};

// Bind to Dashboard (Optional: Add a Connect button or auto-connect)
// For now, we add logic to handle settings changes
document.addEventListener('DOMContentLoaded', () => {
    // Initial UI render
    window.renderEditors();
    window.renderMonitor();
});

// Expose connect/disconnect to the Dashboard UI
window.startSimulation = () => SimulationEngine.connect();
window.stopSimulation = () => SimulationEngine.disconnect();
