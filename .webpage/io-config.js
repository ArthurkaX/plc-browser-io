/**
 * IO Logic Layer
 * Pure logic for handling IO structures, alignment, and ST generation.
 */
class IOHandler {
    constructor(prefix = 'Inputs') {
        this.prefix = prefix;
        this.signals = [{ name: `uiWatchdog_${prefix}`, type: 'BYTE' }];
        this.MAX_PACKET_SIZE = 1000;
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

    addSignal(name, type, length = 20) {
        this.signals.push({ name, type, length: parseInt(length) });
    }

    removeSignal(index) {
        if (index === 0) return; // Don't remove watchdog
        this.signals.splice(index, 1);
        window.renderEditors();
    }

    /**
     * SORTING STRATEGY: Big-to-Small (Minimize slack)
     * Keeps watchdog at index 0, then sorts by alignment (4, then 2, then 1).
     */
    sortSignals() {
        const watchdog = this.signals[0];
        const rest = this.signals.slice(1);
        
        rest.sort((a, b) => {
            const alignA = this.types[a.type].align || 1;
            const alignB = this.types[b.type].align || 1;
            
            // Primary sort by alignment (Large to Small)
            if (alignA !== alignB) return alignB - alignA;
            
            // Secondary sort for same alignment (e.g. DINT vs REAL) - keep original order
            return 0;
        });

        this.signals = [watchdog, ...rest];
    }

    generateST(structName) {
        this.sortSignals(); // Always sort before generation
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

            if (io.type === 'STRING') {
                st += `    ${io.name} : STRING(${io.length}); // Offset: ${currentByte}\n`;
            } else {
                st += `    ${io.name} : ${io.type}; // Offset: ${currentByte}${typeInfo.isBit ? '.' + bitCount : ''}\n`;
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

// Global Instances
window.inputHandler = new IOHandler('Inputs');
window.outputHandler = new IOHandler('Outputs');

// Helper Functions exposed to UI
window.renderEditors = () => {
    const render = (handler, containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        
        // Header
        const header = document.createElement('div');
        header.className = 'io-row header';
        header.innerHTML = `<span>Name</span><span>Type</span><span>Len</span><span>Action</span>`;
        container.appendChild(header);

        // Signal Rows
        handler.signals.forEach((sig, i) => {
            const div = document.createElement('div');
            div.className = 'io-row';
            div.innerHTML = `
                <span>${sig.name}</span>
                <span>${sig.type}</span>
                <span>${sig.type === 'STRING' ? sig.length : '-'}</span>
                ${i > 0 ? `<button onclick="window.removeSignal('${handler.prefix}', ${i})" class="del-btn">&times;</button>` : '<span>---</span>'}
            `;
            container.appendChild(div);
        });

        // "Add New" Inline Row
        const addRow = document.createElement('div');
        addRow.className = 'io-row add-row';
        addRow.innerHTML = `
            <input type="text" id="add-${handler.prefix}-name" placeholder="Signal Name..." style="flex: 2">
            <select id="add-${handler.prefix}-type" style="flex: 1" onchange="window.updateLenInput('${handler.prefix}')">
                <option value="BIT">BIT</option>
                <option value="INT">INT</option>
                <option value="UINT">UINT</option>
                <option value="REAL">REAL</option>
                <option value="DINT">DINT</option>
                <option value="BYTE">BYTE</option>
                <option value="STRING">STRING</option>
            </select>
            <input type="number" id="add-${handler.prefix}-len" value="20" style="flex: 0.5" disabled>
            <button onclick="window.addHandlerSignal('${handler.prefix}')" class="primary-btn">+</button>
        `;
        container.appendChild(addRow);
    };
    render(window.inputHandler, 'inputs-editor');
    render(window.outputHandler, 'outputs-editor');
};

window.updateLenInput = (prefix) => {
    const typeSelect = document.getElementById(`add-${prefix}-type`);
    const lenInput = document.getElementById(`add-${prefix}-len`);
    if (typeSelect && lenInput) {
        lenInput.disabled = (typeSelect.value !== 'STRING');
    }
};

window.addHandlerSignal = (prefix) => {
    const handler = prefix === 'Inputs' ? window.inputHandler : window.outputHandler;
    const name = document.getElementById(`add-${prefix}-name`).value.trim();
    const type = document.getElementById(`add-${prefix}-type`).value;
    const len = document.getElementById(`add-${prefix}-len`).value;
    
    if (!name) return alert('Name Required');
    
    handler.addSignal(name, type, len);
    window.renderEditors();
};

window.saveToFile = async (content, filename) => {
    // 1. Try to use modern File System Access API for "Save As" dialog
    if ('showSaveFilePicker' in window) {
        try {
            const isJson = filename.endsWith('.json');
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: isJson ? 'JSON Project' : 'CODESYS ST File',
                    accept: { [isJson ? 'application/json' : 'text/plain']: [isJson ? '.json' : '.st'] }
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            return; // Success
        } catch (err) {
            if (err.name === 'AbortError') return; // User cancelled
            console.warn('File System Access API failed:', err);
        }
    }

    // 2. Fallback: Standard Blob/Download (often goes straight to Downloads)
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

window.renderMonitor = () => {
    const renderList = (handler, containerId, isInput) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        handler.signals.forEach(sig => {
            const div = document.createElement('div');
            div.className = 'monitor-item';
            div.innerHTML = `
                <label style="font-size:0.7rem; margin-bottom:0;">${sig.name}</label>
                ${sig.type === 'BIT' ? `<input type="checkbox" ${isInput ? '' : 'disabled'}>` : `<input type="text" value="0" ${isInput ? '' : 'disabled'} style="width:70px; padding: 0.2rem; font-size: 0.8rem;">`}
            `;
            container.appendChild(div);
        });
    };
    renderList(window.inputHandler, 'monitor-inputs', true);
    renderList(window.outputHandler, 'monitor-outputs', false);
};

// Global Communication Settings Accessor
window.getCommSettings = () => {
    return {
        url: document.getElementById('dash-ws-address')?.value || 'ws://localhost:8080',
        txRate: parseInt(document.getElementById('dash-tx-rate')?.value) || 10,
        wdTimeout: parseInt(document.getElementById('dash-wd-timeout')?.value) || 100
    };
};

window.exportProjectJSON = () => {
    // Clean up signals: only include length for STRING types
    const cleanSignals = (signals) => signals.map(sig => {
        const cleaned = { name: sig.name, type: sig.type };
        if (sig.type === 'STRING') cleaned.length = sig.length;
        return cleaned;
    });

    const config = {
        connection: window.getCommSettings(),
        inputs: cleanSignals(window.inputHandler.signals),
        outputs: cleanSignals(window.outputHandler.signals)
    };
    window.saveToFile(JSON.stringify(config, null, 2), 'simulation_project.json');
};

window.importProjectJSON = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const config = JSON.parse(e.target.result);
            if (config.connection) {
                document.getElementById('dash-ws-address').value = config.connection.url || 'ws://localhost:8080';
                document.getElementById('dash-tx-rate').value = config.connection.txRate || 10;
                document.getElementById('dash-wd-timeout').value = config.connection.wdTimeout || 100;
            }
            if (config.inputs) window.inputHandler.signals = config.inputs;
            if (config.outputs) window.outputHandler.signals = config.outputs;
            
            window.renderEditors();
            window.renderMonitor();
            alert('Project loaded successfully!');
        } catch (err) {
            alert('Error loading JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
};
