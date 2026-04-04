PROGRAM Web_socket_programm_call
VAR
	fbWS          : FB_WebSocket_Server;
	xStart        : BOOL := TRUE;          // Set TRUE to start server
	
	stSimInputs   : ST_SimulationInputs;  // Data FROM Browser
	stSimOutputs  : ST_SimulationOutputs; // Data TO Browser
	
	// Watchdog logic
	uiLastWD      : BYTE;
	tonWD         : TON;
	xCommError    : BOOL;
	
	// Cyclic transmission
	tonSend       : TON;
END_VAR

// === IMPLEMENTATION ===

// 1. Increment Watchdog for Browser
stSimOutputs.uiWatchdog_Outputs := stSimOutputs.uiWatchdog_Outputs + 1;

// 2. Monitoring Watchdog from Browser
IF stSimInputs.uiWatchdog_Inputs <> uiLastWD THEN
	uiLastWD := stSimInputs.uiWatchdog_Inputs;
	tonWD(IN := FALSE); // Reset timer
END_IF;

tonWD(IN := TRUE, PT := T#1000MS); // Default 1s, can be changed based on JSON
xCommError := tonWD.Q;

// 3. Cyclic Send (target 10ms)
tonSend(IN := NOT tonSend.Q, PT := T#10MS);

// 4. WebSocket Server Call
fbWS(
	xEnable      := xStart,
	ipAddr       := GVL_WebSocket.sServerAddr,
	uiPort       := GVL_WebSocket.uiServerPort,
	pSendData    := ADR(stSimOutputs),
	uiSendSize   := SIZEOF(stSimOutputs),
	xSendTrigger := tonSend.Q,
	pRecvData    := ADR(stSimInputs),
	uiRecvSize   := SIZEOF(stSimInputs)
);

// 5. Global Status Update
GVL_WebSocket.xServerRunning   := fbWS.xRunning;
GVL_WebSocket.xClientConnected := fbWS.xClientConnected;
GVL_WebSocket.xHandshakeDone   := fbWS.xHandshakeOK;
GVL_WebSocket.uiDebugState     := fbWS.eState;
GVL_WebSocket.sLastError       := fbWS.sError;

IF fbWS.xNewDataReceived THEN
	GVL_WebSocket.xNewDataReceived  := TRUE;
	// Log for confirmation (optional, might be heavy at 10ms)
	// LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO, Message:= 'Data Sync OK');
ELSE
	GVL_WebSocket.xNewDataReceived := FALSE;
END_IF;