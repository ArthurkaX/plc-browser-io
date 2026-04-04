{attribute 'qualified_only'}
VAR_GLOBAL
	// ===== WebSocket Server Configuration =====
	uiServerPort       : UINT := 8080;                // TCP listening port
	sServerAddr        : NBS.IP_ADDR := (sAddr := '0.0.0.0'); // Listen on all interfaces
	
	// ===== Global Status =====
	xServerRunning     : BOOL := FALSE;
	xClientConnected   : BOOL := FALSE;
	xHandshakeDone     : BOOL := FALSE;
	xNewDataReceived   : BOOL := FALSE;                        // Flag: new data received this cycle
	sLastError         : STRING(80) := '';
	
	// ===== Debug =====
	uiDebugState       : UINT := 0;
END_VAR