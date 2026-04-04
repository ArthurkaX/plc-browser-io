FUNCTION StartDone : DWORD
VAR_IN_OUT
	EventPrm: CmpApp.EVTPARAM_CmpApp;
END_VAR
VAR
END_VAR

// === IMPLEMENTATION ===
// Init logger component
LogComponent.Logger();

// Initialization Started
LogComponent.Logger.LogADD(Component:= LogComponent.RTM , LogClass:= cmplog.LogClass.LOG_INFO, Message:= 'Initialization started ');






// Initialization Ended
LogComponent.Logger.LogADD(Component:= LogComponent.RTM , LogClass:= cmplog.LogClass.LOG_INFO, Message:= 'Initialization ended');