# PLC Browser IO — S7-1500 bridge (TIA V18 / PLCSIM Advanced)

> Part of [PLC Browser IO](../ReadMe.md).

Turns an S7-1500 into an RFC 6455 **WebSocket server**. A browser connects to
`ws://<PLC_IP>:8082` and exchanges typed I/O with the CPU every scan — one CPU,
one `.scl` file, no gateway.

The transport is generic: it ships whatever bytes are in the output image and
receives into the input image, sized automatically. You describe the dataset in
the web page; it generates the matching source. Change the data -> regenerate ->
re-import. The fixed engine never changes.

Two files live here: `PLC_Browser_IO.scl` (the whole bridge — import as one
external source) and this guide.

---

## 1. Commissioning (once)

1. **Add the TCP connection by hand** — it is *not* created from code
   (`TCON`/`TDISCON` don't work on PLCSIM, see §3).
   - Open **Devices & networks -> Network view -> Connections**, pick **TCP
     connection** in the dropdown, and drag from the CPU to itself (a local,
     unspecified-partner connection). Or configure it inline from the
     `TRCV`/`TSEND` block's **Properties -> Connection parameters**.
   - Set **Establishment: passive** (the CPU listens), **Partner: unspecified**
     (any browser may connect), and a **local port**.
   - **Any free port works.** The example uses **8082**. Avoid ports the CPU
     already occupies — **102** (ISO-on-TCP / S7 comms & PG/HMI) and **80 / 8080**
     (the web server). Whatever you pick must match `ws://<PLC_IP>:<port>`.
   - Note the connection's **Local ID** (TIA's default is `16#0100`).
2. **Import** `PLC_Browser_IO.scl` as an external source -> *Generate blocks from
   source* -> compile -> download, CPU in RUN. (Optionally set the generated
   blocks to the **8080+** number range so they don't clash with your program.)
3. In OB `Main`, set `ConnectionID` to that Local ID.
4. Point the browser at `ws://<PLC_IP>:8082`.

> For a steadier ~10 ms cadence, call OB `Main`'s body from a cyclic-interrupt OB
> (OB30 @ 10 ms) instead of OB1. Each frame takes ~2-3 scans — still hundreds of
> frames/second either way.

---

## 2. Changing the dataset

Open `webpage/s7-1500.html` via a local server (see the main README — not
`file://`). Press `F9`, edit the **INPUTS / OUTPUTS** lists (add/remove/rename
fields, set types; the watchdog byte is added automatically), then **EXPORT SCL
-> Generate PLC_Browser_IO.scl -> Download**.

The download is complete and import-ready: the fixed engine **plus** your dataset
baked in. Only the dataset-specific part is regenerated; the engine stays put.
Re-import as in §1. The example ships matching `webpage/config/simulation_project.json`
(39-byte input image, 59-byte output image), so it runs out of the box.

**Wire contract** (the generator guarantees it matches the browser's packing):
- Byte order on the wire is **little-endian**; the map functions convert per field.
- Field order: **watchdog byte first**, then fields by descending alignment
  (4-byte -> 2-byte -> 1-byte / bits), with S7 alignment padding.
- Strings are C-style: *N* chars + one `NUL` (`Array[0..N] of Char`).

---

## 3. PLCSIM notes (why it's built this way)

Three PLCSIM/TIA traps this design avoids on purpose — each cost real debugging:

- **Transport:** `TRCV_C`/`TSEND_C` (compact) hold a permanent `16#80C4` on
  PLCSIM and never finish the handshake. Only a **configured connection + basic
  `TRCV`/`TSEND` by ID** works. No programmatic `TCON`/`TDISCON`.
- **`CASE` labels:** in external-source SCL, local `CONST` identifiers used as
  `CASE` labels compile but **never match at runtime**. The engine uses numeric
  literals on purpose — don't "clean this up".
- **`TSEND` re-arm:** `TSEND` starts a job only on a **rising edge of `REQ`**.
  Under continuous traffic, re-asserting `REQ` right after `DONE` keeps it high
  and the block sticks at `16#7000`. The engine forces one `REQ=0` scan between
  sends to guarantee a fresh edge.

---

## 4. Live diagnostics

Watch `DB_WS_Bridge.diag` (type `UDT_WS_Status`) online:

| Field | Meaning |
|-------|---------|
| `uiState` | `0` idle - `20` handshake-recv - `30` handshake-send - `40` connected - `60` disconnect |
| `xHandshakeDone`, `xClientConnected` | link up |
| `udiRxFrames`, `udiTxFrames` | frames received / sent |
| `udiReconnects`, `udiProtocolErrors`, `udiTransportErr` | health counters |
| `wTrcvStatus`, `wTsendStatus` | live OUC status words |
| `asTrace[0..15]` | rolling event log (newest = `asTrace[(uiTraceIdx-1) MOD 16]`) |

A healthy link pushes hundreds of frames/second each way, with the output
watchdog byte cycling.
