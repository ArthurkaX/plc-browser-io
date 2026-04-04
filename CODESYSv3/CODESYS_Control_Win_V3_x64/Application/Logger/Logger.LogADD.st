(*
Add new record in logfile
Component: STRING from Component. Example: Component:= Component.user_action
LogClass: cmplog.LogClass. Example: LogClass:=cmplog.LogClass.LOG_ERROR
Message: STRING. Write here your Log Message.
*)

// LOG-file path: /var/opt/codesys/codesyscontrol.log

METHOD LogADD : BOOL
VAR_INPUT
	Component : STRING;
	LogClass  : UDINT;
	Message   : STRING := 'something happened';
END_VAR

// === IMPLEMENTATION ===
Component_Manager.CMAddComponent2(Component, 16#01, ADR(udiCmpId), ADR(cmResult));

CmpLog.LogAdd2(cmplog.LogConstants.STD_LOGGER, udiCmpID, LogClass, cmpErrors.Errors.ERR_FAILED, 0, Message);