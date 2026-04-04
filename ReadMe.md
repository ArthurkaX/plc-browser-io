# ⚡ PLC Browser IO (Simulation Bridge)

A high-performance bridge for interconnecting Web-based process simulations with PLC (Programmable Logic Controllers) via WebSockets.

## 🎯 Project Goal

The main objective is to provide a simple, lightweight, and extremely fast interface for simulating industrial processes. By running the "physics" or "process logic" in a web browser using JavaScript and connecting it to a real or virtual PLC, developers can test control algorithms without expensive hardware setups or complex simulation software.

### Key Components
- **Web Simulation Engine**: Vanilla JS/HTML5 for process visualization and logic.
- **Communication Layer**: RFC 6455 WebSocket Server implemented directly inside the PLC.
- **Data Exchange**: Binary-packed byte arrays for maximum efficiency and predictable latency.
- **Code Generation**: Automated generation of CODESYS/TIA Portal variable declarations (ST) from JavaScript IO definitions.

---

## 🚀 Core Concepts

### 1. The Binary "Memory Image"
Instead of high-overhead JSON or XML, data is exchanged as a raw `Uint8Array`. Both sides (JS and PLC) agree on a memory map.

- **Data Layout**: Signals are packed sequentially into bytes.
  - `Bool` -> 1 bit (packed into bytes) or 1 byte (simplified).
  - `Int/Real` -> 2/4 bytes (Little Endian).
- **JS side**: Uses standard `DataView` or specialized buffers for efficient packing.
- **PLC side**: Accesses data via pointers or overlays (`UNION` / `STRUCT` with `AT` addresses).

### 2. High-Speed Synchronization
*   **Target Latency**: 10ms update rate.
*   **Frequency Control**: Adjustable polling/push interval on both sides.
*   **Bidirectional**: Full-duplex communication allows simultaneous reading of inputs and writing of outputs.
*   **Performance**: Binary frames minimize CPU usage on the PLC side, leaving more cycles for control logic.

### 3. "JS-First" IO Declaration & ST Generation
The simulation driving the IO map approach:
1.  **Define** sensors/actuators in JavaScript (e.g., `Sim.addIO('StartButton', 'BIT')`).
2.  **Simulation logic** interacts with these variables through bitmasks or a custom `IOHandler`.
3.  **Generate** button: Produces a Structured Text (ST) `STRUCT` where bits are packed correctly:
    ```st
    TYPE ST_SimulationInputs :
    STRUCT
        xStartButton : BIT;
        xStopButton  : BIT;
        _spare1      : BIT; // Auto-aligned to byte boundary
        _spare2      : BIT;
        _spare3      : BIT;
        _spare4      : BIT;
        _spare5      : BIT;
        _spare6      : BIT;
        iSensorValue : INT; // Starts at next byte
    END_STRUCT
    END_TYPE
    ```
4.  **Copy-Paste**: Import the type into CODESYS and use it to overlay the received buffer.

---

## 🛠 Project Structure

- `/CODESYSv3`: Implementation of the WebSocket server for CODESYS (V3.5).
  - `FB_WebSocket_Server`: The main block handling handshakes and framing.
  - `GVL_WebSocket`: Global variables for communication buffers.
- `/.webpage`: The web-based frontend.
  - `index.html`: Dashboard for connection and monitoring.
  - `script.js`: WebSocket client logic and data handling.
- `/.python`: Helper scripts for code generation and CI/CD.

---

## 📈 Roadmap

- [x] CODESYS V3.5 WebSocket Server (Baseline)
- [x] Basic Web Client interface
- [ ] **Binary Packing Engine**: Implementation of the `BitPacked` protocol for signals.
- [ ] **10ms Cycle Optimization**: Benchmarking and jitter reduction.
- [ ] **ST Code Generator**: Exporting IO maps from JS to CODESYS Structured Text.
- [ ] **TIA Portal Support**: Porting the WebSocket server to Siemens S7-1500 (LHTTP).

---

## 🚦 Getting Started

1.  **PLC Setup**: Load the project from `CODESYSv3` into your CODESYS environment (Control Win V3 or hardware).
2.  **Web Client**: Open `/.webpage/index.html` in any modern browser.
3.  **Connect**: Enter the PLC IP address and port (default 8080) and hit "Connect".

---

*“Bridging the gap between modern web technologies and industrial automation.”*
