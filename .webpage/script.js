/**
 * PLC Simulation Engine & Connection Manager
 * Orchestrates the binary sync loop between Dashboard and PLC.
 */
const SimulationEngine = {
    socket: null,
    intervalId: null,
    isConnected: false,

    async connect() {
        const settings = window.getCommSettings();
        if (this.socket) this.disconnect();
        
        console.log(`Connecting to ${settings.url}...`);
        
        try {
            this.socket = new WebSocket(settings.url);
            this.socket.binaryType = 'arraybuffer';

            this.socket.onopen = () => {
                this.isConnected = true;
                console.log('✅ Simulation Connected');
                this.startLoop(settings.txRate);
            };

            this.socket.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    window.outputHandler.unpackPayload(event.data);
                    window.renderMonitor(); // Update UI with fresh PLC data
                }
            };

            this.socket.onclose = () => {
                this.disconnect();
                console.log('🔌 Simulation Disconnected');
            };

            this.socket.onerror = (err) => {
                console.error('❌ WebSocket Error:', err);
                this.disconnect();
            };
        } catch (e) {
            console.error('Connection Exception:', e);
        }
    },

    disconnect() {
        this.isConnected = false;
        if (this.intervalId) clearInterval(this.intervalId);
        if (this.socket) {
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
