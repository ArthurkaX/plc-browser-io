/**
 * Dashboard UI Component
 * Handles injection and UI interaction of the F9 Dashboard.
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
                        <input type="text" id="dash-ws-address" value="ws://localhost:8080">
                    </div>
                    <div class="input-group">
                        <label>Transmission Rate (ms)</label>
                        <input type="number" id="dash-tx-rate" value="10" min="1" max="1000">
                    </div>
                    <div class="input-group">
                        <label>WatchDog Timeout (ms)</label>
                        <input type="number" id="dash-wd-timeout" value="100" min="3" max="3000">
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
                <pre id="st-code-preview" class="code-box-mini">// Code will appear here...</pre>
                <button id="dash-copy-st" class="copy-btn-mini">COPY</button>
            </footer>
        </div>
    </div>
    `,

    init() {
        document.body.insertAdjacentHTML('beforeend', this.template);
        this.setupListeners();
    },

    setupListeners() {
        const modal = document.getElementById('magic-dashboard');
        const stPreview = document.getElementById('st-code-preview');

        const toggle = () => {
            modal.classList.toggle('hidden');
            if (!modal.classList.contains('hidden')) {
                window.renderEditors(); // Defined in io-config.js
                window.renderMonitor(); // Defined in io-config.js
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
                document.getElementById(link.dataset.tab).classList.add('active');
            };
        });

        // Delegate actions to io-config.js logic
        document.getElementById('btn-gen-inputs-st').onclick = () => { 
            stPreview.innerText = window.inputHandler.generateST('ST_SimulationInputs'); 
        };
        document.getElementById('btn-gen-outputs-st').onclick = () => { 
            stPreview.innerText = window.outputHandler.generateST('ST_SimulationOutputs'); 
        };

        document.getElementById('btn-save-inputs-st').onclick = () => {
            window.saveToFile(window.inputHandler.generateST('ST_SimulationInputs'), 'Inputs.st');
        };
        document.getElementById('btn-save-outputs-st').onclick = () => {
            window.saveToFile(window.outputHandler.generateST('ST_SimulationOutputs'), 'Outputs.st');
        };

        document.getElementById('dash-copy-st').onclick = () => {
            navigator.clipboard.writeText(stPreview.innerText);
            alert('ST Code copied to clipboard!');
        };

        // Connection Logic
        document.getElementById('btn-ws-connect').onclick = () => window.startSimulation();
        document.getElementById('btn-ws-disconnect').onclick = () => window.stopSimulation();

        // Project Save/Load Logic
        document.getElementById('btn-save-project').onclick = () => window.exportProjectJSON();
        document.getElementById('btn-load-project').onclick = () => document.getElementById('load-project-file').click();
        document.getElementById('load-project-file').onchange = (e) => {
            if (e.target.files.length > 0) window.importProjectJSON(e.target.files[0]);
        };
    }
};

document.addEventListener('DOMContentLoaded', () => DashboardUI.init());
