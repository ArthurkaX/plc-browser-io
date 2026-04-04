FUNCTION_BLOCK Logger
VAR_INPUT
END_VAR
VAR_OUTPUT
END_VAR
VAR
	message  : STRING;
	udiCmpId : UDINT; 
	cmResult : Component_Manager.SysTypes.RTS_IEC_RESULT;	
END_VAR

// === IMPLEMENTATION ===
//Register components
CMAddComponent2( pszComponent := LogComponent.RTM
               , udiVersion   := 16#01
               , udiCmpId     := ADR(udiCmpId)
               , pResult      := ADR(cmResult));

CMAddComponent2( pszComponent := LogComponent.WS
               , udiVersion   := 16#01
               , udiCmpId     := ADR(udiCmpId)
               , pResult      := ADR(cmResult));