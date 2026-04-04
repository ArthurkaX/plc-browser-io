/**
 * Advanced IO Handler & Dashboard Manager
 * Manages separate Input/Output structures, F9 Dashboard, and ST generation.
 */
class IOHandler {
    constructor(prefix = 'Inputs') {
        this.prefix = prefix;
        this.signals = [
            { name: `uiWatchdog_${prefix}`, type: 'BYTE' }
        ];
        this.MAX_PACKET_SIZE = 1000;
        this.types = {
            'BIT':    { size: 1,  isBit: true,  align: 1 },
            'BYTE':   { size: 8,  isBit: false, align: 1 },
            'INT':    { size: 16, isBit: false, align: 2 },
            'UINT':   { size: 16, isBit: false, align: 2 },
            'DINT':   { size: 32, isBit: false, align: 4 },
            'REAL':   { size: 32, isBit: false, align: 4 },
            'STRING': { size: null, isBit: false, align: 1 },
        };
    }

    addSignal(name, type, length = 20) {
        this.signals.push({ name, type, length: parseInt(length) });
    }

    removeSignal(index) {
        if (index === 0) return; // Don't remove watchdog
        this.signals.splice(index, 1);
    }

    generateST(structName) {
        const name = structName || `ST_Simulation${this.prefix}`;
        let st = `TYPE ${name} :\nSTRUCT\n`;
        let bitCount = 0;
        let currentByte = 0;

        this.signals.forEach((io) => {
            const typeInfo = this.types[io.type];
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

const inputHandler = new IOHandler('Inputs');
const outputHandler = new IOHandler('Outputs');

// Dashboard Logic
const modal = document.getElementById('magic-dashboard');
const stPreview = document.getElementById('st-code-preview');

function toggleModal() {
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) {
        renderEditors();
        renderMonitor();
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'F9') {
        e.preventDefault();
        toggleModal();
    }
});

document.getElementById('close-modal').onclick = toggleModal;

// Tab Switching
document.querySelectorAll('.tab-link').forEach(link => {
    link.onclick = () => {
        document.querySelectorAll('.tab-link, .tab-content').forEach(el => el.classList.remove('active'));
        link.classList.add('active');
        document.getElementById(link.dataset.tab).classList.add('active');
    };
});

// Render Editor UI
function renderEditors() {
    const render = (handler, containerId) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        handler.signals.forEach((sig, i) => {
            const div = document.createElement('div');
            div.className = 'monitor-item';
            div.innerHTML = `
                <span>${sig.name} (${sig.type}${sig.type === 'STRING' ? '('+sig.length+')':''})</span>
                ${i > 0 ? `<button onclick="removeSignal('${handler.prefix}', ${i})" style="color:red; background:none; border:none; cursor:pointer;">&times;</button>` : ''}
            `;
            container.appendChild(div);
        });
    };
    render(inputHandler, 'inputs-editor');
    render(outputHandler, 'outputs-editor');
}

window.removeSignal = (prefix, index) => {
    const handler = prefix === 'Inputs' ? inputHandler : outputHandler;
    handler.removeSignal(index);
    renderEditors();
};

// Add Signal Logic
function promptAddSignal(prefix) {
    const name = prompt(`Enter ${prefix} Signal Name:`);
    if (!name) return;
    const type = prompt(`Enter Type (BIT, BYTE, INT, UINT, REAL, STRING):`, 'BIT').toUpperCase();
    let length = 20;
    if (type === 'STRING') length = prompt('Enter String Length:', 20);
    
    const handler = prefix === 'Inputs' ? inputHandler : outputHandler;
    try {
        handler.addSignal(name, type, length);
        renderEditors();
    } catch(e) { alert(e.message); }
}

document.getElementById('btn-add-input').onclick = () => promptAddSignal('Inputs');
document.getElementById('btn-add-output').onclick = () => promptAddSignal('Outputs');

// ST Gen & Save
document.getElementById('btn-gen-inputs-st').onclick = () => { stPreview.innerText = inputHandler.generateST(); };
document.getElementById('btn-gen-outputs-st').onclick = () => { stPreview.innerText = outputHandler.generateST(); };

function saveToFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

document.getElementById('btn-save-inputs-st').onclick = () => saveToFile(inputHandler.generateST(), 'Inputs.st');
document.getElementById('btn-save-outputs-st').onclick = () => saveToFile(outputHandler.generateST(), 'Outputs.st');

document.getElementById('dash-copy-st').onclick = () => {
    navigator.clipboard.writeText(stPreview.innerText);
    alert('ST Copied!');
};

// Live Monitoring (Placeholder for now, connected later to real WebSocket data)
function renderMonitor() {
    const renderList = (handler, containerId, isInput) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        handler.signals.forEach(sig => {
            const div = document.createElement('div');
            div.className = 'monitor-item';
            div.innerHTML = `
                <label>${sig.name}</label>
                ${sig.type === 'BIT' ? `<input type="checkbox" ${isInput ? '' : 'disabled'}>` : `<input type="text" value="0" ${isInput ? '' : 'disabled'} style="width:60px">`}
            `;
            container.appendChild(div);
        });
    };
    renderList(inputHandler, 'monitor-inputs', true);
    renderList(outputHandler, 'monitor-outputs', false);
}
