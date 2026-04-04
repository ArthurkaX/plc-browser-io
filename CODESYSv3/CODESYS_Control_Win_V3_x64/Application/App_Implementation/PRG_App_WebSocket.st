// ==============================================================================
// EXAMPLE INTEGRATION: WebSocket Application Data Sync
// ==============================================================================
// This program demonstrates how to link the generic FB_WebSocket_Server to your
// specific project data (in this case, the `IO` global variable list).
// 
// Instructions for users:
// 1. Copy the `WebSocket_Core` folder to your project.
// 2. Adjust or rewrite this program (e.g. PRG_App_WebSocket) to point
//    the pSendData and pRecvData pointers to your own data structures.
// 3. Implement your own flow control (e.g. 10ms cyclic send and Watchdog).
// ==============================================================================

PROGRAM PRG_App_WebSocket
VAR
	fbWS          : FB_WebSocket_Server;
	xStart        : BOOL := TRUE;          // Set TRUE to start server
	
	// LOCAL structures removed to use GLOBAL IO.input and IO.output
	
	// Watchdog logic (local tracking)
	uiLastWD      : BYTE;
	tonWD         : TON;
	xCommError    : BOOL;
	
	// Cyclic transmission
	tonSend       : TON;
END_VAR

// === IMPLEMENTATION ===
// 1. Increment Watchdog for Browser (FROM PLC TO JS)
IO.output.uiWatchdog_Outputs := IO.output.uiWatchdog_Outputs + 1;

// 2. Monitoring Watchdog from Browser (FROM JS TO PLC)
IF IO.input.uiWatchdog_Inputs <> uiLastWD THEN
	uiLastWD := IO.input.uiWatchdog_Inputs;
	tonWD(IN := FALSE); // Reset timer
END_IF;

tonWD(IN := TRUE, PT := T#1000MS); // Watchdog threshold
xCommError := tonWD.Q;

// 3. Cyclic Send (10ms check)
tonSend(IN := NOT tonSend.Q, PT := T#10MS);

// 4. WebSocket Server Call - DIRECTly using Global IO
fbWS(
	xEnable      := xStart,
	ipAddr       := GVL_WebSocket.sServerAddr,
	uiPort       := GVL_WebSocket.uiServerPort,
	pSendData    := ADR(IO.output),
	uiSendSize   := SIZEOF(IO.output),
	xSendTrigger := tonSend.Q,
	pRecvData    := ADR(IO.input),
	uiRecvSize   := SIZEOF(IO.input)
);

// 5. Global Status Update
GVL_WebSocket.xServerRunning   := fbWS.xRunning;
GVL_WebSocket.xClientConnected := fbWS.xClientConnected;
GVL_WebSocket.xHandshakeDone   := fbWS.xHandshakeOK;
GVL_WebSocket.uiDebugState     := fbWS.eState;
GVL_WebSocket.sLastError       := fbWS.sError;

IF fbWS.xNewDataReceived THEN
	GVL_WebSocket.xNewDataReceived  := TRUE;
ELSE
	GVL_WebSocket.xNewDataReceived := FALSE;
END_IF;