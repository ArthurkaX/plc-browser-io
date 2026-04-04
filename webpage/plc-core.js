/**
 * PLC Browser Core
 * Agnostic, high-performance Data Engine for PLC synchronization.
 * Does not depend on UI/DOM.
 */

class IOHandler {
    constructor(prefix = 'Inputs') {
        this.prefix = prefix;
        this.signals = [{ name: `uiWatchdog_${prefix}`, type: 'BYTE', value: 0 }];
        this.types = {
            'BIT': { size: 1, isBit: true, align: 1 },
            'BYTE': { size: 8, isBit: false, align: 1 },
            'INT': { size: 16, isBit: false, align: 2 },
            'UINT': { size: 16, isBit: false, align: 2 },
            'DINT': { size: 32, isBit: false, align: 4 },
            'REAL': { size: 32, isBit: false, align: 4 },
            'STRING': { size: null, isBit: false, align: 1 },
        };
    }

    addSignal(name, type, length = 20, comment = '') {
        if (!this.signals.find(s => s.name === name)) {
            this.signals.push({ name, type, length: parseInt(length), value: 0, comment: comment || '' });
            this.sortSignals();
        }
    }

    removeSignal(name) {
        if (name.startsWith('uiWatchdog')) return; // Protected
        this.signals = this.signals.filter(s => s.name !== name);
    }

    packPayload() {
        const size = this.calculateTotalSize();
        const buffer = new ArrayBuffer(size);
        const view = new DataView(buffer);
        let bitCount = 0;
        let currentByte = 0;

        this.signals.forEach(sig => {
            const info = this.types[sig.type];
            if (bitCount > 0 && !info.isBit) { currentByte++; bitCount = 0; }
            if (!info.isBit) currentByte += (info.align - (currentByte % info.align)) % info.align;

            const val = sig.value || 0;
            switch(sig.type) {
                case 'BIT':
                    if (val) view.setUint8(currentByte, view.getUint8(currentByte) | (1 << bitCount));
                    bitCount++;
                    if (bitCount === 8) { bitCount = 0; currentByte++; }
                    break;
                case 'BYTE': view.setUint8(currentByte++, val); break;
                case 'INT':  view.setInt16(currentByte, val, true); currentByte += 2; break;
                case 'UINT': view.setUint16(currentByte, val, true); currentByte += 2; break;
                case 'DINT': view.setInt32(currentByte, val, true); currentByte += 4; break;
                case 'REAL': view.setFloat32(currentByte, val, true); currentByte += 4; break;
                case 'STRING':
                    const enc = new TextEncoder();
                    const bytes = enc.encode(String(val));
                    for(let i=0; i < Math.min(bytes.length, sig.length); i++) {
                        view.setUint8(currentByte + i, bytes[i]);
                    }
                    view.setUint8(currentByte + sig.length, 0);
                    currentByte += (sig.length + 1);
                    break;
            }
        });
        return buffer;
    }

    unpackPayload(buffer) {
        if (buffer.byteLength < 1) return;
        const view = new DataView(buffer);
        let bitCount = 0;
        let currentByte = 0;

        this.signals.forEach(sig => {
            const info = this.types[sig.type];
            if (bitCount > 0 && !info.isBit) { currentByte++; bitCount = 0; }
            if (!info.isBit) currentByte += (info.align - (currentByte % info.align)) % info.align;

            if (currentByte >= buffer.byteLength) return;

            switch(sig.type) {
                case 'BIT':
                    sig.value = (view.getUint8(currentByte) & (1 << bitCount)) !== 0;
                    bitCount++;
                    if (bitCount === 8) { bitCount = 0; currentByte++; }
                    break;
                case 'BYTE': sig.value = view.getUint8(currentByte++); break;
                case 'INT':  sig.value = view.getInt16(currentByte, true); currentByte += 2; break;
                case 'UINT': sig.value = view.getUint16(currentByte, true); currentByte += 2; break;
                case 'DINT': sig.value = view.getInt32(currentByte, true); currentByte += 4; break;
                case 'REAL': sig.value = view.getFloat32(currentByte, true); currentByte += 4; break;
                case 'STRING':
                    let s = "";
                    for(let i=0; i < sig.length; i++) {
                        const b = view.getUint8(currentByte + i);
                        if (b === 0) break;
                        s += String.fromCharCode(b);
                    }
                    sig.value = s;
                    currentByte += (sig.length + 1);
                    break;
            }
        });
    }

    calculateTotalSize() {
        let bitCount = 0;
        let currentByte = 0;
        this.signals.forEach(sig => {
            const info = this.types[sig.type];
            if (bitCount > 0 && !info.isBit) { currentByte++; bitCount = 0; }
            if (!info.isBit) currentByte += (info.align - (currentByte % info.align)) % info.align;
            
            if (info.isBit) {
                bitCount++;
                if (bitCount === 8) { bitCount = 0; currentByte++; }
            } else {
                currentByte += (sig.type === 'STRING' ? sig.length + 1 : info.size / 8);
            }
        });
        return bitCount > 0 ? currentByte + 1 : currentByte;
    }

    sortSignals() {
        const wdIndex = this.signals.findIndex(s => s.name.startsWith('uiWatchdog'));
        let watchdog = null;
        let rest = this.signals;
        
        if (wdIndex !== -1) {
            watchdog = this.signals[wdIndex];
            rest = this.signals.filter((_, i) => i !== wdIndex);
        } else {
            // Auto-restore watchdog if it was accidentally missing from JSON
            watchdog = { name: `uiWatchdog_${this.prefix}`, type: 'BYTE', value: 0 };
        }

        rest.sort((a, b) => {
            const alignA = this.types[a.type]?.align || 1;
            const alignB = this.types[b.type]?.align || 1;
            if (alignA !== alignB) return alignB - alignA;
            return 0;
        });
        
        this.signals = [watchdog, ...rest];
    }

    generateST(structName) {
        this.sortSignals();
        const name = structName || `ST_Simulation${this.prefix}`;
        let st = `TYPE ${name} :\nSTRUCT\n`;
        let bitCount = 0;
        let currentByte = 0;

        this.signals.forEach((io) => {
            const typeInfo = this.types[io.type];
            if (!typeInfo) return;
            const align = typeInfo.align;

            if (bitCount > 0 && !typeInfo.isBit) {
                while (bitCount < 8) {
                    st += `    _spare_b${currentByte}_bit${bitCount} : BIT;\n`;
                    bitCount++;
                }
                bitCount = 0;
                currentByte++;
            }

            if (!typeInfo.isBit) {
                const paddingNeeded = (align - (currentByte % align)) % align;
                for (let i = 0; i < paddingNeeded; i++) {
                    st += `    _spare_byte_${currentByte} : BYTE;\n`;
                    currentByte++;
                }
            }

            const commentPart = io.comment ? ` //${io.comment}` : '';
            if (io.type === 'STRING') {
                st += `    ${io.name} : STRING(${io.length}); // Offset: ${currentByte}${commentPart}\n`;
            } else {
                st += `    ${io.name} : ${io.type}; // Offset: ${currentByte}${typeInfo.isBit ? '.' + bitCount : ''}${commentPart}\n`;
            }

            if (typeInfo.isBit) {
                bitCount++;
                if (bitCount === 8) { bitCount = 0; currentByte++; }
            } else {
                currentByte += (io.type === 'STRING' ? io.length + 1 : typeInfo.size / 8);
            }
        });

        if (bitCount > 0) {
            while (bitCount < 8) { st += `    _spare_f_bit${bitCount} : BIT;\n`; bitCount++; }
            currentByte++;
        }

        st += `END_STRUCT\nEND_TYPE`;
        return st;
    }
}

class PLCLink {
    constructor() {
        this.config = { url: 'ws://localhost:8080', txRate: 10, wdTimeout: 100 };
        this.inputHandler = new IOHandler('Inputs');
        this.outputHandler = new IOHandler('Outputs');
        
        // ES6 Proxies for elegant API: PLC.Inputs.Sensor1 = true;
        this.Inputs = this._createProxy(this.inputHandler);
        this.Outputs = this._createProxy(this.outputHandler);

        this.socket = null;
        this.worker = null;
        this.isConnected = false;
        this.isConnecting = false;
        
        // Event callbacks
        this.onUpdateCallbacks = [];
        this.onConnectCallbacks = [];
        this.onDisconnectCallbacks = [];
    }

    _createProxy(handler) {
        return new Proxy({}, {
            get: (target, prop) => {
                const sig = handler.signals.find(s => s.name === prop);
                return sig ? sig.value : undefined;
            },
            set: (target, prop, value) => {
                const sig = handler.signals.find(s => s.name === prop);
                if (sig) {
                    if (sig.type === 'BIT') sig.value = !!value;
                    else if (sig.type === 'STRING') sig.value = String(value);
                    else sig.value = Number(value);
                    return true;
                }
                console.warn(`[PLC] Attempted to set undefined signal: ${prop}`);
                return false;
            }
        });
    }

    /** Register callback that triggers after every received packet */
    onUpdate(cb) { this.onUpdateCallbacks.push(cb); }
    onConnect(cb) { this.onConnectCallbacks.push(cb); }
    onDisconnect(cb) { this.onDisconnectCallbacks.push(cb); }

    connect(configOverrides) {
        if (this.isConnecting || this.isConnected) return;
        this.isConnecting = true;
        if (configOverrides) Object.assign(this.config, configOverrides);
        
        this.socket = new WebSocket(this.config.url);
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = () => {
            this.isConnected = true;
            this.isConnecting = false;
            this.onConnectCallbacks.forEach(cb => cb());
            this.startLoop(this.config.txRate);
        };

        this.socket.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                this.outputHandler.unpackPayload(event.data);
                this.onUpdateCallbacks.forEach(cb => cb());
            }
        };

        this.socket.onclose = () => this.disconnect();
        this.socket.onerror = () => this.disconnect();
    }

    disconnect() {
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.isConnecting = false;

        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.onerror = null;
            this.socket.close();
            this.socket = null;
        }

        if (wasConnected) {
            this.onDisconnectCallbacks.forEach(cb => cb());
        }
    }

    startLoop(rate) {
        if (this.worker) this.worker.terminate();
        
        // Timer Worker to bypass inactive tab throttling
        const workerCode = `
            let timerId = null;
            self.onmessage = function(e) {
                if (e.data.command === 'start') {
                    if (timerId) clearInterval(timerId);
                    timerId = setInterval(() => self.postMessage('tick'), e.data.rate);
                } else if (e.data.command === 'stop') {
                    if (timerId) clearInterval(timerId);
                    timerId = null;
                }
            };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        
        this.worker.onmessage = () => this.sync();
        this.worker.postMessage({ command: 'start', rate: rate });
    }

    sync() {
        if (!this.isConnected || !this.socket) return;
        
        // Auto-increment Watchdog
        this.Inputs.uiWatchdog_Inputs = (this.Inputs.uiWatchdog_Inputs + 1) % 255;
        
        // Pack & Send Inputs
        const buffer = this.inputHandler.packPayload();
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(buffer);
        }
    }

    exportConfig() {
        const clean = (signals) => signals.map(sig => {
            const obj = { name: sig.name, type: sig.type };
            if (sig.type === 'STRING') obj.length = sig.length;
            if (sig.comment) obj.comment = sig.comment;
            return obj;
        });
        return JSON.stringify({
            connection: this.config,
            inputs: clean(this.inputHandler.signals),
            outputs: clean(this.outputHandler.signals)
        }, null, 2);
    }

    loadConfig(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.connection) Object.assign(this.config, data.connection);
            if (data.inputs) {
                this.inputHandler.signals = data.inputs.map(s => ({...s, value: 0, comment: s.comment || ''}));
                this.inputHandler.sortSignals();
            }
            if (data.outputs) {
                this.outputHandler.signals = data.outputs.map(s => ({...s, value: 0, comment: s.comment || ''}));
                this.outputHandler.sortSignals();
            }
            return true;
        } catch (e) {
            console.error("Failed to load PLC config", e);
            return false;
        }
    }
}

// Instantiate Global API
window.PLC = new PLCLink();
