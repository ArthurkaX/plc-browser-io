/**
 * dashboard-s7.js — TIA Portal / S7-1500 variant of the control dashboard.
 *
 * Same signal editors / live monitor / connection controls as the CODESYS
 * dashboard, but the generator button produces a COMPLETE, import-ready
 * PLC_Browser_IO.scl (engine + your dataset) via S7Codegen.genFullScl().
 *
 * Talks only to window.PLC (plc-core.js). Load order in the HTML:
 *   plc-core.js, s7-engine-template.js, s7-codegen.js, dashboard-s7.js
 */
const DashboardS7 = {
  template: `
  <div id="s7-dashboard" class="modal hidden">
    <div class="modal-content glass">
      <header class="modal-header">
        <h2>⚡ S7-1500 / TIA PORTAL — DASHBOARD (F9)</h2>
        <button id="s7-close" class="close-btn">&times;</button>
      </header>

      <nav class="modal-tabs">
        <button class="tab-link active" data-tab="s7-tab-settings">CONNECTION</button>
        <button class="tab-link" data-tab="s7-tab-inputs">INPUTS (TO PLC)</button>
        <button class="tab-link" data-tab="s7-tab-outputs">OUTPUTS (FROM PLC)</button>
        <button class="tab-link" data-tab="s7-tab-debug">DEBUG / MONITOR</button>
        <button class="tab-link" data-tab="s7-tab-export">EXPORT SCL</button>
      </nav>

      <div class="tab-content active" id="s7-tab-settings">
        <div class="config-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem;">
          <div class="input-group" style="grid-column:span 2;">
            <label>WebSocket Address (ws://&lt;PLC_IP&gt;:8082)</label>
            <input type="text" id="s7-ws-address">
          </div>
          <div class="input-group">
            <label>Transmission Rate (ms)</label>
            <input type="number" id="s7-tx-rate" min="1" max="1000">
          </div>
          <div class="input-group">
            <label>WatchDog Timeout (ms)</label>
            <input type="number" id="s7-wd-timeout" min="3" max="3000">
          </div>
          <div class="io-actions" style="grid-column:span 2; margin-bottom:0.5rem;">
            <button id="s7-connect" class="primary-btn" style="background:var(--success); color:#000;">🚀 CONNECT SIMULATION</button>
            <button id="s7-disconnect" class="secondary-btn">🛑 DISCONNECT</button>
          </div>
          <div class="io-actions" style="grid-column:span 2;">
            <button id="s7-save-project" class="primary-btn">📁 SAVE PROJECT (JSON)</button>
            <button id="s7-load-project" class="secondary-btn">📂 LOAD PROJECT (JSON)</button>
            <input type="file" id="s7-load-file" class="hidden" accept=".json">
          </div>
        </div>
      </div>

      <div class="tab-content" id="s7-tab-inputs">
        <div class="io-editor" id="s7-inputs-editor"></div>
      </div>

      <div class="tab-content" id="s7-tab-outputs">
        <div class="io-editor" id="s7-outputs-editor"></div>
      </div>

      <div class="tab-content" id="s7-tab-debug">
        <div class="debug-monitor">
          <div class="monitor-column">
            <h4>TX (To PLC)</h4>
            <div id="s7-monitor-inputs" class="monitor-grid"></div>
          </div>
          <div class="monitor-column">
            <h4>RX (From PLC)</h4>
            <div id="s7-monitor-outputs" class="monitor-grid"></div>
          </div>
        </div>
      </div>

      <div class="tab-content" id="s7-tab-export">
        <div class="io-actions" style="margin-bottom:0.75rem;">
          <button id="s7-gen" class="primary-btn" style="background:var(--success); color:#000;">⚙️ GENERATE PLC_Browser_IO.scl</button>
          <button id="s7-download" class="secondary-btn" disabled>⬇️ DOWNLOAD .scl</button>
          <button id="s7-copy" class="secondary-btn" disabled>📋 COPY</button>
        </div>
        <p style="opacity:.7; font-size:.85rem; margin:.25rem 0 .5rem;">
          One import-ready source: fixed WebSocket engine + your dataset (UDT_App_*, FC_WS_Map*, DB sizes).
          In TIA: add as external source → <em>Generate blocks from source</em> → set the configured
          TCP connection's Local ID in OB "Main". Watchdog fields are added automatically.
        </p>
        <pre id="s7-code" class="code-box-mini" style="max-height:42vh; overflow:auto; white-space:pre;">// Press GENERATE to build PLC_Browser_IO.scl ...</pre>
      </div>

      <footer class="modal-footer">
        <span style="opacity:.6; font-size:.8rem;">Browser ⇄ S7-1500 over RFC 6455 WebSocket · little-endian wire</span>
      </footer>
    </div>
  </div>
  `,

  _scl: null,

  init() {
    if (!window.PLC) return console.error("Dashboard requires plc-core.js");
    if (!window.S7Codegen) return console.error("Dashboard requires s7-codegen.js");
    document.body.insertAdjacentHTML("beforeend", this.template);
    this.setupListeners();
    this.loadFormFromConfig();

    PLC.onConnect(() => this.setConnBtn("🟩 CONNECTED", "var(--success)"));
    PLC.onDisconnect(() => this.setConnBtn("🚀 CONNECT SIMULATION", ""));
    PLC.onUpdate(() => this.updateMonitorValues());

    this.loadDefaultConfig();
  },

  setConnBtn(text, bg) {
    const b = document.getElementById("s7-connect");
    if (!b) return;
    b.innerText = text; b.style.opacity = "1"; b.style.background = bg;
  },

  async loadDefaultConfig() {
    try {
      const res = await fetch("config/simulation_project.json");
      if (!res.ok) return console.log("[S7] no default config (status " + res.status + ")");
      if (PLC.loadConfig(await res.text())) {
        this.loadFormFromConfig();
        this.renderEditors();
        this.renderMonitor();
        this.setConnBtn("⏳ CONNECTING...", "");
        document.getElementById("s7-connect").style.opacity = "0.5";
        PLC.connect();
      }
    } catch (err) {
      console.warn("[S7] auto-load skipped (likely file://; use a local server).", err);
      if (location.protocol === "file:") {
        const b = document.getElementById("s7-connect");
        b.style.border = "2px solid orange";
        b.title = "Auto-load disabled on file:// — serve the folder with a local web server.";
      }
    }
  },

  loadFormFromConfig() {
    document.getElementById("s7-ws-address").value = PLC.config.url;
    document.getElementById("s7-tx-rate").value = PLC.config.txRate;
    document.getElementById("s7-wd-timeout").value = PLC.config.wdTimeout;
  },

  saveFormToConfig() {
    PLC.config.url = document.getElementById("s7-ws-address").value;
    PLC.config.txRate = parseInt(document.getElementById("s7-tx-rate").value) || 10;
    PLC.config.wdTimeout = parseInt(document.getElementById("s7-wd-timeout").value) || 100;
  },

  setupListeners() {
    const modal = document.getElementById("s7-dashboard");
    const toggle = () => {
      modal.classList.toggle("hidden");
      if (!modal.classList.contains("hidden")) { this.renderEditors(); this.renderMonitor(); }
    };
    window.addEventListener("keydown", (e) => { if (e.key === "F9") { e.preventDefault(); toggle(); } });
    document.getElementById("s7-close").onclick = toggle;

    document.querySelectorAll("#s7-dashboard .tab-link").forEach((link) => {
      link.onclick = () => {
        modal.querySelectorAll(".tab-link, .tab-content").forEach((el) => el.classList.remove("active"));
        link.classList.add("active");
        document.getElementById(link.dataset.tab).classList.add("active");
        if (link.dataset.tab === "s7-tab-debug") this.renderMonitor();
      };
    });

    // ---- Generate / Download / Copy ----
    document.getElementById("s7-gen").onclick = () => {
      try {
        this._scl = S7Codegen.genFullScl(PLC.inputHandler.signals, PLC.outputHandler.signals);
        document.getElementById("s7-code").innerText = this._scl;
        document.getElementById("s7-download").disabled = false;
        document.getElementById("s7-copy").disabled = false;
      } catch (err) {
        document.getElementById("s7-code").innerText = "// Generation error: " + err.message;
        console.error(err);
      }
    };
    document.getElementById("s7-download").onclick = () => {
      if (this._scl) this.saveToFile(this._scl, "PLC_Browser_IO.scl");
    };
    document.getElementById("s7-copy").onclick = () => {
      if (this._scl) { navigator.clipboard.writeText(this._scl); alert("PLC_Browser_IO.scl copied to clipboard!"); }
    };

    // ---- Connection ----
    document.getElementById("s7-connect").onclick = () => {
      this.setConnBtn("⏳ CONNECTING...", ""); document.getElementById("s7-connect").style.opacity = "0.5";
      this.saveFormToConfig(); PLC.connect();
    };
    document.getElementById("s7-disconnect").onclick = () => PLC.disconnect();

    // ---- Project JSON ----
    document.getElementById("s7-save-project").onclick = () => {
      this.saveFormToConfig(); this.saveToFile(PLC.exportConfig(), "simulation_project.json");
    };
    document.getElementById("s7-load-project").onclick = () => document.getElementById("s7-load-file").click();
    document.getElementById("s7-load-file").onchange = (e) => {
      if (!e.target.files.length) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (PLC.loadConfig(ev.target.result)) {
          this.loadFormFromConfig(); this.renderEditors(); this.renderMonitor();
          alert("Project loaded.");
        }
      };
      reader.readAsText(e.target.files[0]);
    };
  },

  // ---- Editors (input/output signal lists) ----
  renderEditors() {
    const render = (handler, containerId) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = "";
      const header = document.createElement("div");
      header.className = "io-row header";
      header.innerHTML = `<span>Name</span><span>Type</span><span>Len</span><span>Comment</span><span>Action</span>`;
      container.appendChild(header);

      handler.signals.forEach((sig, i) => {
        const div = document.createElement("div");
        div.className = "io-row";
        if (i === 0) { // watchdog (protected)
          div.innerHTML = `<span>${sig.name}</span><span>${sig.type}</span><span>-</span><span>watchdog (auto)</span><span>🔒</span>`;
          container.appendChild(div); return;
        }
        div.innerHTML = `
          <input type="text" class="edit-name" value="${sig.name}">
          <select class="edit-type">
            ${["BIT","INT","UINT","REAL","DINT","BYTE","STRING"].map(t => `<option value="${t}" ${sig.type===t?"selected":""}>${t}</option>`).join("")}
          </select>
          <input type="number" class="edit-len" value="${sig.length || 20}" ${sig.type==="STRING"?"":"disabled"}>
          <input type="text" class="edit-comment" value="${sig.comment || ""}" placeholder="Comment">
          <button data-action="del" data-prefix="${handler.prefix}" data-name="${sig.name}" class="del-btn">&times;</button>`;
        div.querySelector(".edit-name").onchange = (e) => { const v = e.target.value.trim(); if (v) { sig.name = v; div.querySelector(".del-btn").dataset.name = v; } };
        div.querySelector(".edit-type").onchange = (e) => { sig.type = e.target.value; handler.sortSignals(); this.renderEditors(); };
        div.querySelector(".edit-len").onchange = (e) => { sig.length = parseInt(e.target.value) || 20; };
        div.querySelector(".edit-comment").onchange = (e) => { sig.comment = e.target.value.trim(); };
        container.appendChild(div);
      });

      const addRow = document.createElement("div");
      addRow.className = "io-row add-row";
      addRow.innerHTML = `
        <input type="text" id="s7-add-${handler.prefix}-name" placeholder="Signal Name..." style="flex:2">
        <select id="s7-add-${handler.prefix}-type" style="flex:1">
          ${["BIT","INT","UINT","REAL","DINT","BYTE","STRING"].map(t => `<option value="${t}">${t}</option>`).join("")}
        </select>
        <input type="number" id="s7-add-${handler.prefix}-len" value="20" style="flex:0.5" disabled>
        <input type="text" id="s7-add-${handler.prefix}-comment" placeholder="Comment..." style="flex:2">
        <button data-action="add" data-prefix="${handler.prefix}" class="primary-btn">+</button>`;
      container.appendChild(addRow);
    };

    render(PLC.inputHandler, "s7-inputs-editor");
    render(PLC.outputHandler, "s7-outputs-editor");

    document.querySelectorAll('#s7-dashboard button[data-action="del"]').forEach((btn) => {
      btn.onclick = () => {
        (btn.dataset.prefix === "Inputs" ? PLC.inputHandler : PLC.outputHandler).removeSignal(btn.dataset.name);
        this.renderEditors();
      };
    });
    document.querySelectorAll('#s7-dashboard button[data-action="add"]').forEach((btn) => {
      btn.onclick = () => {
        const p = btn.dataset.prefix;
        const name = document.getElementById(`s7-add-${p}-name`).value.trim();
        const type = document.getElementById(`s7-add-${p}-type`).value;
        const len = document.getElementById(`s7-add-${p}-len`).value;
        const comment = document.getElementById(`s7-add-${p}-comment`).value.trim();
        if (!name) return alert("Name required");
        (p === "Inputs" ? PLC.inputHandler : PLC.outputHandler).addSignal(name, type, len, comment);
        this.renderEditors();
      };
    });
    ["Inputs", "Outputs"].forEach((p) => {
      const ts = document.getElementById(`s7-add-${p}-type`), li = document.getElementById(`s7-add-${p}-len`);
      if (ts && li) ts.onchange = () => { li.disabled = ts.value !== "STRING"; };
    });
  },

  // ---- Live monitor ----
  renderMonitor() {
    const renderList = (handler, proxyObj, containerId, isInput) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = "";
      handler.signals.forEach((sig) => {
        const div = document.createElement("div");
        div.className = "monitor-item";
        div.style.cssText = "display:flex; justify-content:space-between; align-items:center;";
        const id = `s7mon-${handler.prefix}-${sig.name}`;
        const inp = sig.type === "BIT"
          ? `<input type="checkbox" id="${id}" ${isInput ? "" : "disabled"}>`
          : `<input type="text" id="${id}" ${isInput ? "" : "disabled"}>`;
        div.innerHTML = `<label>${sig.name}</label>${inp}`;
        container.appendChild(div);
        if (isInput) {
          const el = container.querySelector(`#${CSS.escape(id)}`);
          if (sig.type === "BIT") el.onchange = () => proxyObj[sig.name] = el.checked;
          else el.oninput = () => proxyObj[sig.name] = el.value;
        }
      });
    };
    renderList(PLC.inputHandler, PLC.Inputs, "s7-monitor-inputs", true);
    renderList(PLC.outputHandler, PLC.Outputs, "s7-monitor-outputs", false);
    this.updateMonitorValues();
  },

  updateMonitorValues() {
    [PLC.inputHandler, PLC.outputHandler].forEach((handler) => {
      handler.signals.forEach((sig) => {
        const el = document.getElementById(`s7mon-${handler.prefix}-${sig.name}`);
        if (!el || el === document.activeElement) return;
        if (sig.type === "BIT") el.checked = !!sig.value; else el.value = sig.value || 0;
      });
    });
  },

  async saveToFile(content, filename) {
    if ("showSaveFilePicker" in window) {
      try {
        const ext = filename.slice(filename.lastIndexOf("."));
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: ext === ".json" ? "JSON Project" : ext === ".scl" ? "TIA SCL source" : "Text", accept: { "text/plain": [ext] } }],
        });
        const w = await handle.createWritable(); await w.write(content); await w.close();
        return;
      } catch (err) { if (err.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
};

document.addEventListener("DOMContentLoaded", () => DashboardS7.init());
