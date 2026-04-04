{attribute 'qualified_only'}
VAR_GLOBAL
	// ===== WebSocket Server Configuration =====
	uiServerPort       : UINT := 8080;                // TCP listening port
	sServerAddr        : NBS.IP_ADDR := (sAddr := '0.0.0.0'); // Listen on all interfaces
	
	// ===== Application data (20-byte exchange) =====
	sSendData          : STRING(20) := 'Hello from PLC!     '; // Data to send to browser
	sReceivedData      : STRING(20) := '';                     // Last data received from browser
	xNewDataReceived   : BOOL := FALSE;                        // Flag: new data received
	xSendTrigger       : BOOL := FALSE;                        // Force send sSendData to client
	
	// ===== Status =====
	xServerRunning     : BOOL := FALSE;
	xClientConnected   : BOOL := FALSE;
	xHandshakeDone     : BOOL := FALSE;
	sLastError         : STRING(80) := '';
	
	// ===== Debug =====
	uiDebugState       : UINT := 0;
	sDebugInfo         : STRING(255) := '';
END_VAR