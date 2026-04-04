/**
 * Dashboard UI Component (Optional DevTools Overlay)
 * Handles injection and UI interaction. Only talks to `window.PLC`.
 */
const DashboardUI = {
    template: `
    <div id="magic-dashboard" class="modal hidden">
        <div class="modal-content glass">
            <header class="modal-header">
                <h2>⚡ CONTROL DASHBOARD (F9)</h2>
                <button id="close-modal" class="close-btn">&times;</button>
            </header>
            
            <nav class="modal-tabs">
                <button class="tab-link active" data-tab="tab-settings">CONNECTION</button>
                <button class="tab-link" data-tab="tab-inputs">INPUTS (TO PLC)</button>
                <button class="tab-link" data-tab="tab-outputs">OUTPUTS (FROM PLC)</button>
                <button class="tab-link" data-tab="tab-debug">DEBUG / MONITOR</button>
            </nav>

            <div class="tab-content active" id="tab-settings">
                <div class="config-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                    <div class="input-group" style="grid-column: span 2;">
                        <label>WebSocket Address</label>
                        <input type="text" id="dash-ws-address">
                    </div>
                    <div class="input-group">
                        <label>Transmission Rate (ms)</label>
                        <input type="number" id="dash-tx-rate" min="1" max="1000">
                    </div>
                    <div class="input-group">
                        <label>WatchDog Timeout (ms)</label>
                        <input type="number" id="dash-wd-timeout" min="3" max="3000">
                    </div>
                    <div class="io-actions" style="grid-column: span 2; margin-bottom: 0.5rem;">
                        <button id="btn-ws-connect" class="primary-btn" style="background: var(--success); color: #000;">🚀 CONNECT SIMULATION</button>
                        <button id="btn-ws-disconnect" class="secondary-btn">🛑 DISCONNECT</button>
                    </div>
                    <div class="io-actions" style="grid-column: span 2;">
                        <button id="btn-save-project" class="primary-btn">📁 SAVE PROJECT (JSON)</button>
                        <button id="btn-load-project" class="secondary-btn">📂 LOAD PROJECT (JSON)</button>
                        <input type="file" id="load-project-file" class="hidden" accept=".json">
                    </div>
                </div>
            </div>

            <div class="tab-content" id="tab-inputs">
                <div class="io-editor" id="inputs-editor"></div>
                <div class="io-actions">
                    <button id="btn-gen-inputs-st" class="secondary-btn">Generate (Inputs.st)</button>
                    <button id="btn-save-inputs-st" class="secondary-btn">Save to File</button>
                </div>
            </div>

            <div class="tab-content" id="tab-outputs">
                <div class="io-editor" id="outputs-editor"></div>
                <div class="io-actions">
                    <button id="btn-gen-outputs-st" class="secondary-btn">Generate (Outputs.st)</button>
                    <button id="btn-save-outputs-st" class="secondary-btn">Save to File</button>
                </div>
            </div>

            <div class="tab-content" id="tab-debug">
                <div class="debug-monitor">
                    <div class="monitor-column">
                        <h4>TX (To PLC)</h4>
                        <div id="monitor-inputs" class="monitor-grid"></div>
                    </div>
                    <div class="monitor-column">
                        <h4>RX (From PLC)</h4>
                        <div id="monitor-outputs" class="monitor-grid"></div>
                    </div>
                </div>
            </div>

            <footer class="modal-footer">
                <pre id="st-code-preview" class="code-box-mini">// ST Code will appear here...</pre>
                <button id="dash-copy-st" class="copy-btn-mini">COPY</button>
            </footer>
        </div>
    </div>
    `,

    init() {
        if (!window.PLC) return console.error("Dashboard requires PLC Link Core (plc-core.js)");
        document.body.insertAdjacentHTML('beforeend', this.template);
        this.setupListeners();
        this.loadFormFromConfig();
        
        // Setup hooks into PLC for UI updates
        PLC.onConnect(() => {
            const btn = document.getElementById('btn-ws-connect');
            btn.innerText = '🟩 CONNECTED'; 
            btn.style.opacity = '1';
        });
        PLC.onDisconnect(() => {
            const btn = document.getElementById('btn-ws-connect');
            btn.innerText = '🚀 CONNECT SIMULATION'; 
            btn.style.opacity = '1';
        });
        PLC.onUpdate(() => this.updateMonitorValues());
    },

    loadFormFromConfig() {
        document.getElementById('dash-ws-address').value = PLC.config.url;
        document.getElementById('dash-tx-rate').value = PLC.config.txRate;
        document.getElementById('dash-wd-timeout').value = PLC.config.wdTimeout;
    },

    saveFormToConfig() {
        PLC.config.url = document.getElementById('dash-ws-address').value;
        PLC.config.txRate = parseInt(document.getElementById('dash-tx-rate').value) || 10;
        PLC.config.wdTimeout = parseInt(document.getElementById('dash-wd-timeout').value) || 100;
    },

    setupListeners() {
        const modal = document.getElementById('magic-dashboard');
        const stPreview = document.getElementById('st-code-preview');

        const toggle = () => {
            modal.classList.toggle('hidden');
            if (!modal.classList.contains('hidden')) {
                this.renderEditors();
                this.renderMonitor();
            }
        };

        window.addEventListener('keydown', (e) => {
            if (e.key === 'F9') { e.preventDefault(); toggle(); }
        });

        document.getElementById('close-modal').onclick = toggle;

        document.querySelectorAll('.tab-link').forEach(link => {
            link.onclick = () => {
                document.querySelectorAll('.tab-link, .tab-content').forEach(el => el.classList.remove('active'));
                link.classList.add('active');
                const target = document.getElementById(link.dataset.tab);
                target.classList.add('active');
                if (link.dataset.tab === 'tab-debug') this.renderMonitor();
            };
        });

        document.getElementById('btn-gen-inputs-st').onclick = () => { stPreview.innerText = PLC.inputHandler.generateST('ST_SimulationInputs'); };
        document.getElementById('btn-gen-outputs-st').onclick = () => { stPreview.innerText = PLC.outputHandler.generateST('ST_SimulationOutputs'); };
        
        document.getElementById('btn-save-inputs-st').onclick = () => this.saveToFile(PLC.inputHandler.generateST('ST_SimulationInputs'), 'Inputs.st');
        document.getElementById('btn-save-outputs-st').onclick = () => this.saveToFile(PLC.outputHandler.generateST('ST_SimulationOutputs'), 'Outputs.st');

        document.getElementById('dash-copy-st').onclick = () => {
            navigator.clipboard.writeText(stPreview.innerText);
            alert('ST Code copied to clipboard!');
        };

        // Connection
        document.getElementById('btn-ws-connect').onclick = () => {
            const btn = document.getElementById('btn-ws-connect');
            btn.innerText = '⏳ CONNECTING...'; btn.style.opacity = '0.5';
            this.saveFormToConfig();
            PLC.connect();
        };
        document.getElementById('btn-ws-disconnect').onclick = () => PLC.disconnect();

        // Project JSON
        document.getElementById('btn-save-project').onclick = () => {
            this.saveFormToConfig();
            this.saveToFile(PLC.exportConfig(), 'simulation_project.json');
        };
        
        document.getElementById('btn-load-project').onclick = () => document.getElementById('load-project-file').click();
        document.getElementById('load-project-file').onchange = (e) => {
            if (e.target.files.length > 0) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    if (PLC.loadConfig(ev.target.result)) {
                        this.loadFormFromConfig();
                        this.renderEditors();
                        this.renderMonitor();
                        alert('Project loaded successfully!');
                    }
                };
                reader.readAsText(e.target.files[0]);
            }
        };
    },

    // --- UI Rendering ---

    renderEditors() {
        const render = (handler, containerId) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            
            const header = document.createElement('div');
            header.className = 'io-row header';
            header.innerHTML = `<span>Name</span><span>Type</span><span>Len</span><span>Action</span>`;
            container.appendChild(header);

            handler.signals.forEach((sig, i) => {
                const div = document.createElement('div');
                div.className = 'io-row';
                div.innerHTML = `
                    <span>${sig.name}</span>
                    <span>${sig.type}</span>
                    <span>${sig.type === 'STRING' ? sig.length : '-'}</span>
                    ${i > 0 ? `<button data-action="del" data-prefix="${handler.prefix}" data-name="${sig.name}" class="del-btn">&times;</button>` : '<span>---</span>'}
                `;
                container.appendChild(div);
            });

            const addRow = document.createElement('div');
            addRow.className = 'io-row add-row';
            addRow.innerHTML = `
                <input type="text" id="add-${handler.prefix}-name" placeholder="Signal Name..." style="flex: 2">
                <select id="add-${handler.prefix}-type" style="flex: 1">
                    <option value="BIT">BIT</option><option value="INT">INT</option>
                    <option value="UINT">UINT</option><option value="REAL">REAL</option>
                    <option value="DINT">DINT</option><option value="BYTE">BYTE</option><option value="STRING">STRING</option>
                </select>
                <input type="number" id="add-${handler.prefix}-len" value="20" style="flex: 0.5" disabled>
                <button data-action="add" data-prefix="${handler.prefix}" class="primary-btn">+</button>
            `;
            container.appendChild(addRow);
        };
        
        render(PLC.inputHandler, 'inputs-editor');
        render(PLC.outputHandler, 'outputs-editor');

        // Bind dynamic buttons
        document.querySelectorAll('button[data-action="del"]').forEach(btn => {
            btn.onclick = () => {
                const prefix = btn.dataset.prefix;
                const name = btn.dataset.name;
                if (prefix === 'Inputs') PLC.inputHandler.removeSignal(name);
                else PLC.outputHandler.removeSignal(name);
                this.renderEditors();
            }
        });

        document.querySelectorAll('button[data-action="add"]').forEach(btn => {
            btn.onclick = () => {
                const prefix = btn.dataset.prefix;
                const name = document.getElementById(`add-${prefix}-name`).value.trim();
                const type = document.getElementById(`add-${prefix}-type`).value;
                const len = document.getElementById(`add-${prefix}-len`).value;
                if (!name) return alert('Name Required');
                
                if (prefix === 'Inputs') PLC.inputHandler.addSignal(name, type, len);
                else PLC.outputHandler.addSignal(name, type, len);
                
                this.renderEditors();
            }
        });

        // Type -> Length dependency
        ['Inputs', 'Outputs'].forEach(prefix => {
            const typeSel = document.getElementById(`add-${prefix}-type`);
            const lenInp = document.getElementById(`add-${prefix}-len`);
            if (typeSel && lenInp) {
                typeSel.onchange = () => { lenInp.disabled = (typeSel.value !== 'STRING'); };
            }
        });
    },

    renderMonitor() {
        const renderList = (handler, proxyObj, containerId, isInput) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            
            handler.signals.forEach((sig) => {
                const div = document.createElement('div');
                div.className = 'monitor-item';
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.style.alignItems = 'center';
                
                const elementId = `mon-${handler.prefix}-${sig.name}`;
                let inputHtml = '';
                
                if (sig.type === 'BIT') {
                    inputHtml = `<input type="checkbox" id="${elementId}" ${isInput ? '' : 'disabled'}>`;
                } else {
                    inputHtml = `<input type="text" id="${elementId}" ${isInput ? '' : 'disabled'}>`;
                }

                div.innerHTML = `<label>${sig.name}</label>${inputHtml}`;
                container.appendChild(div);

                // Add direct listener to modify proxy immediately
                if (isInput) {
                    const el = container.querySelector(`#${elementId}`);
                    if (sig.type === 'BIT') {
                        el.onchange = () => proxyObj[sig.name] = el.checked;
                    } else {
                        el.oninput = () => proxyObj[sig.name] = el.value;
                    }
                }
            });
        };
        
        renderList(PLC.inputHandler, PLC.Inputs, 'monitor-inputs', true);
        renderList(PLC.outputHandler, PLC.Outputs, 'monitor-outputs', false);
        this.updateMonitorValues(); // initial paint
    },

    updateMonitorValues() {
        [PLC.inputHandler, PLC.outputHandler].forEach(handler => {
            handler.signals.forEach((sig) => {
                const el = document.getElementById(`mon-${handler.prefix}-${sig.name}`);
                if (!el || el === document.activeElement) return;
                
                if (sig.type === 'BIT') el.checked = !!sig.value;
                else el.value = sig.value || 0;
            });
        });
    },

    async saveToFile(content, filename) {
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
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
            }
        }
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
};

document.addEventListener('DOMContentLoaded', () => DashboardUI.init());
