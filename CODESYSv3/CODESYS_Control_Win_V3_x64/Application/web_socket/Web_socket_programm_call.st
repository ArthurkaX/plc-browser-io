PROGRAM Web_socket_programm_call
VAR
	fbWS          : FB_WebSocket_Server;
	xStart        : BOOL := TRUE;          // Set TRUE to start server
	xSendTrigger  : BOOL;                  // Rising edge to send data
	xSendLast     : BOOL;
	
	// Auto-echo mode: echo received data back to client
	xAutoEcho     : BOOL := TRUE;
END_VAR

// === IMPLEMENTATION ===
// ===== WebSocket Server =====
fbWS(
	xEnable      := xStart,
	ipAddr       := GVL_WebSocket.sServerAddr,
	uiPort       := GVL_WebSocket.uiServerPort,
	sSendPayload := GVL_WebSocket.sSendData,
	xSendTrigger := GVL_WebSocket.xSendTrigger
);

// ===== Update global status =====
GVL_WebSocket.xServerRunning   := fbWS.xRunning;
GVL_WebSocket.xClientConnected := fbWS.xClientConnected;
GVL_WebSocket.xHandshakeDone   := fbWS.xHandshakeOK;
GVL_WebSocket.uiDebugState     := fbWS.eState;
GVL_WebSocket.sLastError       := fbWS.sError;

// ===== Handle received data =====
IF fbWS.xNewDataReceived THEN
	GVL_WebSocket.sReceivedData     := fbWS.sReceivedPayload;
	GVL_WebSocket.xNewDataReceived  := TRUE;
	
	// PLC Logging for visibility
	LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO, 
		Message:= CONCAT('PLC received: ', fbWS.sReceivedPayload));
	
	// Auto-echo if enabled
	IF xAutoEcho THEN
		GVL_WebSocket.sSendData := fbWS.sReceivedPayload;
		GVL_WebSocket.xSendTrigger := TRUE;
	END_IF;
ELSE
	GVL_WebSocket.xNewDataReceived := FALSE;
END_IF;

// Reset trigger in GVL after FB picked it up
IF GVL_WebSocket.xSendTrigger THEN
	GVL_WebSocket.xSendTrigger := FALSE;
END_IF;