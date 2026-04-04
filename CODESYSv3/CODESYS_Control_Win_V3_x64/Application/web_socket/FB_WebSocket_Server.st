FUNCTION_BLOCK FB_WebSocket_Server
VAR_INPUT
	xEnable      : BOOL;
	ipAddr       : NBS.IP_ADDR;
	uiPort       : UINT := 8080;
	sSendPayload : STRING(20) := '';
	xSendTrigger : BOOL;
	xDebug       : BOOL := TRUE;
END_VAR

VAR_OUTPUT
	xRunning         : BOOL;
	xClientConnected : BOOL;
	xHandshakeOK     : BOOL;
	sReceivedPayload : STRING(20);
	xNewDataReceived : BOOL;
	eState           : E_WS_State;
	sError           : STRING(80);
END_VAR

VAR
	fbServer     : NBS.TCP_Server;
	fbConnection : NBS.TCP_Connection;
	fbRead       : NBS.TCP_Read;
	fbWrite      : NBS.TCP_Write;

	eStep          : E_WS_State := E_WS_State.IDLE;
	eStepAfterSend : E_WS_State;

	abRecvBuf    : ARRAY [0..2047] OF BYTE;
	abSendBuf    : ARRAY [0..2047] OF BYTE;
	uiRecvLen    : UINT;
	uiSendLen    : UINT;

	stFrame      : ST_WS_Frame;
	abFrameBuf   : ARRAY [0..1023] OF BYTE;
	uiFrameLen   : UINT;

	sClientKey   : STRING(40);
	sAcceptKey   : STRING(40);
	sResponse    : STRING(255);
	uiResponseLen: UINT;

	abPayloadOut : ARRAY [0..31] OF BYTE;

	i     : INT;
	dwOff : DWORD;
	pByte : POINTER TO BYTE;
	pStr  : POINTER TO BYTE;

	xSendTrigLast : BOOL;
	xEnableLast   : BOOL;
	xSendPending  : BOOL;
	sLogMsg       : STRING(255);
END_VAR

// === IMPLEMENTATION ===
// ALWAYS call maintenance blocks if server is starting or running
IF eStep <> E_WS_State.IDLE THEN
	fbServer(xEnable := TRUE, ipAddr := ipAddr, uiPort := uiPort);
	fbConnection(xEnable := TRUE, hServer := fbServer.hServer);
END_IF;

// Trigger detection
IF xSendTrigger AND NOT xSendTrigLast THEN
	xSendPending := TRUE;
END_IF;
xSendTrigLast := xSendTrigger;

// Global disable
IF NOT xEnable AND eStep <> E_WS_State.IDLE AND eStep <> E_WS_State.CLOSING THEN
	sError := 'User disabled server';
	eStep := E_WS_State.WS_SEND_CLOSE;
END_IF;

xNewDataReceived := FALSE;

CASE eStep OF
// ... (IDLE, SERVER_STARTING etc)
E_WS_State.IDLE:
	xRunning := FALSE;
	xClientConnected := FALSE;
	xHandshakeOK := FALSE;
	sError := '';
	IF xEnable THEN
		eStep := E_WS_State.SERVER_STARTING;
	END_IF;
// ...
E_WS_State.SERVER_STARTING:
	IF fbServer.xError THEN
		sError := 'TCP_Server failed';
		eStep := E_WS_State.ERROR;
	ELSIF fbServer.hServer <> 0 THEN
		xRunning := TRUE;
		eStep := E_WS_State.CONN_WAITING;
	END_IF;
// ...
E_WS_State.CONN_WAITING:
	IF fbConnection.xActive THEN
		xClientConnected := TRUE;
		eStep := E_WS_State.HANDSHAKE_READ;
	ELSIF fbConnection.xError THEN
		sError := 'TCP_Connection error';
		eStep := E_WS_State.ERROR;
	END_IF;


// --------------------------------------------------
E_WS_State.HANDSHAKE_READ:
	fbRead(
		xEnable     := TRUE,
		hConnection := fbConnection.hConnection,
		szSize      := SIZEOF(abRecvBuf),
		pData       := ADR(abRecvBuf)
	);
	IF fbRead.xReady AND fbRead.szCount > 0 THEN
		uiRecvLen := TO_UINT(fbRead.szCount);
		fbRead(xEnable := FALSE);
		eStep := E_WS_State.HANDSHAKE_PARSE;
	ELSIF fbRead.xError THEN
		sError := 'Handshake read error';
		eStep := E_WS_State.CLOSING;
	END_IF;

// --------------------------------------------------
E_WS_State.HANDSHAKE_PARSE:
	sClientKey := FC_ExtractWSKey(pData := ADR(abRecvBuf), uiDataLen := uiRecvLen);
	IF LEN(sClientKey) = 0 THEN
		sError := 'No WS key found';
		eStep := E_WS_State.CLOSING;
	ELSE
		sAcceptKey := FC_WS_BuildAcceptKey(sClientKey := sClientKey, xDebug := xDebug);
		sResponse := 'HTTP/1.1 101 Switching Protocols$0D$0A';
		sResponse := CONCAT(sResponse, 'Upgrade: websocket$0D$0A');
		sResponse := CONCAT(sResponse, 'Connection: Upgrade$0D$0A');
		sResponse := CONCAT(sResponse, 'Sec-WebSocket-Accept: ');
		sResponse := CONCAT(sResponse, sAcceptKey);
		sResponse := CONCAT(sResponse, '$0D$0A$0D$0A');
		
		uiResponseLen := INT_TO_UINT(LEN(sResponse));
		pStr := ADR(sResponse);
		FOR i := 0 TO UINT_TO_INT(uiResponseLen) - 1 DO
			abSendBuf[i] := pStr[i];
		END_FOR;
		uiSendLen := uiResponseLen;
		eStep := E_WS_State.HANDSHAKE_SEND;
	END_IF;

// --------------------------------------------------
E_WS_State.HANDSHAKE_SEND:
	fbWrite(
		xExecute    := TRUE,
		hConnection := fbConnection.hConnection,
		szSize      := TO_UDINT(uiSendLen),
		pData       := ADR(abSendBuf)
	);
	IF fbWrite.xDone THEN
		fbWrite(xExecute := FALSE);
		eStep := E_WS_State.WS_CONNECTED;
	ELSIF fbWrite.xError THEN
		sError := 'Handshake send failed';
		eStep := E_WS_State.CLOSING;
	END_IF;

// --------------------------------------------------
E_WS_State.WS_CONNECTED:
	xHandshakeOK := TRUE;
	IF NOT fbConnection.xActive THEN
		sError := 'Connection lost';
		eStep := E_WS_State.CLOSING;
	END_IF;

// --------------------------------------------------
E_WS_State.WS_SEND_CLOSE:
	// Build Close frame (opcode 0x8)
	uiFrameLen := FC_WS_BuildFrame(
		eOpcode := E_WS_Opcode.CLOSE,
		pPayload := ADR(abFrameBuf), // empty payload
		uiPayloadLen := 0,
		xFin := TRUE,
		abOutBuf := abFrameBuf
	);
	
	FOR i := 0 TO UINT_TO_INT(uiFrameLen) - 1 DO
		abSendBuf[i] := abFrameBuf[i];
	END_FOR;
	uiSendLen := uiFrameLen;
	
	LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO, 
		Message:= 'WS Send: Close frame');

	fbWrite(
		xExecute := TRUE,
		hConnection := fbConnection.hConnection,
		szSize := TO_UDINT(uiSendLen),
		pData := ADR(abSendBuf)
	);
	
	IF fbWrite.xDone THEN
		fbWrite(xExecute := FALSE);
		eStep := E_WS_State.CLOSING;
	ELSIF fbWrite.xError THEN
		fbWrite(xExecute := FALSE);
		eStep := E_WS_State.CLOSING; // Close anyway on error
	END_IF;

// --------------------------------------------------
E_WS_State.CLOSING:
	fbRead(xEnable := FALSE);
	fbWrite(xExecute := FALSE);
	fbConnection(xEnable := FALSE);
	fbServer(xEnable := FALSE);
	eStep := E_WS_State.IDLE;

// --------------------------------------------------
E_WS_State.ERROR:
	xRunning := FALSE;
	IF NOT xEnable THEN
		eStep := E_WS_State.IDLE;
	END_IF;

END_CASE;

// ==================================================
// FULL-DUPLEX DATA EXCHANGE (Runs when connected)
// ==================================================
IF eStep = E_WS_State.WS_CONNECTED THEN
	
	// --- 1. RECEIVER ---
	fbRead(
		xEnable := TRUE,
		hConnection := fbConnection.hConnection,
		szSize := SIZEOF(abRecvBuf),
		pData := ADR(abRecvBuf)
	);
	
	IF fbRead.xReady AND fbRead.szCount > 0 THEN
		uiRecvLen := TO_UINT(fbRead.szCount);
		
		IF xDebug THEN
			// Log raw bytes for debugging
			sLogMsg := CONCAT('RX raw: len=', TO_STRING(uiRecvLen));
			sLogMsg := CONCAT(sLogMsg, CONCAT(' b0=', TO_STRING(abRecvBuf[0])));
			sLogMsg := CONCAT(sLogMsg, CONCAT(' b1=', TO_STRING(abRecvBuf[1])));
			LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO, Message:= sLogMsg);
		END_IF;
		
		IF FC_WS_ParseFrame(pData := ADR(abRecvBuf), uiDataLen := uiRecvLen, stFrame := stFrame) THEN
			IF xDebug THEN
				sLogMsg := CONCAT('Parsed opcode=', TO_STRING(stFrame.eOpcode));
				sLogMsg := CONCAT(sLogMsg, CONCAT(' payloadLen=', TO_STRING(stFrame.udiPayloadLen)));
				LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO, Message:= sLogMsg);
			END_IF;
			
			CASE stFrame.eOpcode OF
				E_WS_Opcode.TEXT:
					pStr := ADR(sReceivedPayload);
					FOR i := 0 TO MIN(UDINT_TO_INT(stFrame.udiPayloadLen) - 1, 19) DO
						pStr[i] := stFrame.abPayload[i];
					END_FOR;
					pStr[MIN(UDINT_TO_INT(stFrame.udiPayloadLen), 20)] := 0;
					
					LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO, 
						Message:= CONCAT('WS Recv: [', CONCAT(sReceivedPayload, ']')));
					xNewDataReceived := TRUE;
					
				E_WS_Opcode.CLOSE:
					IF xDebug THEN
						LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_WARNING, 
							Message:= 'Got CLOSE frame from client');
					END_IF;
					sError := 'Client requested close';
					fbRead(xEnable := FALSE);
					eStep := E_WS_State.WS_SEND_CLOSE;
					
				E_WS_Opcode.PING:
					IF xDebug THEN
						LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO, 
							Message:= 'Got PING frame');
					END_IF;
			END_CASE;
		ELSE
			IF xDebug THEN
				LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_WARNING, 
					Message:= CONCAT('ParseFrame FAILED, len=', TO_STRING(uiRecvLen)));
			END_IF;
		END_IF;
	ELSIF fbRead.xError THEN
		IF xDebug THEN
			sLogMsg := CONCAT('fbRead ERROR eError=', TO_STRING(fbRead.eError));
			LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_ERROR, Message:= sLogMsg);
		END_IF;
		sError := 'Read error';
		eStep := E_WS_State.CLOSING;
	END_IF;

	// --- 2. TRANSMITTER ---
	IF xSendPending AND NOT fbWrite.xBusy THEN
		pStr := ADR(sSendPayload);
		FOR i := 0 TO 19 DO
			IF i < LEN(sSendPayload) THEN
				abPayloadOut[i] := pStr[i];
			ELSE
				abPayloadOut[i] := 16#20; // Space pad
			END_IF;
		END_FOR;
		
		uiFrameLen := FC_WS_BuildFrame(
			eOpcode := E_WS_Opcode.TEXT,
			pPayload := ADR(abPayloadOut),
			uiPayloadLen := 20,
			xFin := TRUE,
			abOutBuf := abFrameBuf
		);
		
		FOR i := 0 TO UINT_TO_INT(uiFrameLen) - 1 DO
			abSendBuf[i] := abFrameBuf[i];
		END_FOR;
		uiSendLen := uiFrameLen;
		
		fbWrite(xExecute := TRUE, hConnection := fbConnection.hConnection, szSize := uiSendLen, pData := ADR(abSendBuf));
		xSendPending := FALSE;
		
		LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO, 
			Message:= CONCAT('WS Send: [', CONCAT(sSendPayload, ']')));
			
	ELSIF fbWrite.xDone OR fbWrite.xError THEN
		fbWrite(xExecute := FALSE);
	ELSE
		fbWrite();
	END_IF;

END_IF;

eState := eStep;
// Update GVL info
GVL_WebSocket.sDebugInfo := CONCAT('Step: ', TO_STRING(eStep));
GVL_WebSocket.sDebugInfo := CONCAT(GVL_WebSocket.sDebugInfo, ' | Cnt: ');
GVL_WebSocket.sDebugInfo := CONCAT(GVL_WebSocket.sDebugInfo, TO_STRING(fbConnection.xActive));