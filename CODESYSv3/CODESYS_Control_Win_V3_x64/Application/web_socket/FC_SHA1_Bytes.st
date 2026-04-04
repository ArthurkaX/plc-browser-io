FUNCTION FC_SHA1_Bytes : BOOL
VAR_INPUT
	pData   : POINTER TO BYTE;  // Pointer to input data
	udiLen  : UDINT;            // Length of input data
END_VAR
VAR_IN_OUT
	abHash  : ARRAY [0..19] OF BYTE;  // Output: 20-byte SHA-1 hash
END_VAR
VAR
	hash    : ARRAY [0..4] OF DWORD;
	w       : ARRAY [0..79] OF DWORD;
	block   : UDINT;
	pos     : UDINT;
	n       : INT;
	n1      : INT;
	a       : DWORD;
	b       : DWORD;
	c       : DWORD;
	d       : DWORD;
	e       : DWORD;
	f       : DWORD;
	k       : DWORD;
	x       : DWORD;
	z       : INT;
	abBuf   : ARRAY [0..63] OF BYTE;
	copyLen : UDINT;
	pSrc    : POINTER TO BYTE;
	pad_done : BOOL;
	totalBlocks : UDINT;
	bytesInLastBlock : UDINT;
	i       : UDINT;
END_VAR

(*
	Synchronous SHA-1 hash computation.
	Based on OSCAT SHA1_STREAM, refactored for single-call usage.
	Used for WebSocket handshake accept key.
*)

// === IMPLEMENTATION ===
// Initialize hash values (SHA-1 constants)
hash[0] := DWORD#16#67452301;
hash[1] := DWORD#16#EFCDAB89;
hash[2] := DWORD#16#98BADCFE;
hash[3] := DWORD#16#10325476;
hash[4] := DWORD#16#C3D2E1F0;

// Calculate number of 64-byte blocks needed
// Message + 1 byte (0x80) + padding + 8 bytes (length)
bytesInLastBlock := (udiLen MOD 64);
IF bytesInLastBlock > 55 THEN
	totalBlocks := (udiLen / 64) + 2;
ELSE
	totalBlocks := (udiLen / 64) + 1;
END_IF;

pos := 0;

FOR block := 0 TO totalBlocks - 1 DO
	// Fill buffer for this block
	FOR n := 0 TO 63 DO
		IF pos + INT_TO_UDINT(n) < udiLen THEN
			// Copy from source data
			abBuf[n] := pData[UDINT_TO_DINT(pos) + n];
		ELSIF pos + INT_TO_UDINT(n) = udiLen AND NOT pad_done THEN
			abBuf[n] := 16#80;
			pad_done := TRUE;
		ELSE
			abBuf[n] := 0;
		END_IF;
	END_FOR;
	
	// Last block: append bit length in last 8 bytes (big-endian)
	// bitcount = udiLen * 8 = udiLen << 3
	// bytes [56..59] are already 0 (zeroed in loop above)
	// bytes [60..63] encode bits [31..0] of the bit count:
	IF block = totalBlocks - 1 THEN
		abBuf[60] := DWORD_TO_BYTE(SHR(UDINT_TO_DWORD(udiLen), 21)); // bits 31:24 of bitcount
		abBuf[61] := DWORD_TO_BYTE(SHR(UDINT_TO_DWORD(udiLen), 13)); // bits 23:16 of bitcount
		abBuf[62] := DWORD_TO_BYTE(SHR(UDINT_TO_DWORD(udiLen), 5));  // bits 15:8 of bitcount
		abBuf[63] := DWORD_TO_BYTE(SHL(UDINT_TO_DWORD(udiLen), 3));  // bits 7:0 of bitcount
	END_IF;
	
	pos := pos + 64;
	
	// Convert byte buffer to 16 DWORDs (big-endian)
	z := 0;
	FOR n1 := 0 TO 15 DO
		w[n1] := SHL(BYTE_TO_DWORD(abBuf[z]), 24)
			OR SHL(BYTE_TO_DWORD(abBuf[z+1]), 16)
			OR SHL(BYTE_TO_DWORD(abBuf[z+2]), 8)
			OR BYTE_TO_DWORD(abBuf[z+3]);
		z := z + 4;
	END_FOR;
	
	// Extend 16 words to 80 words
	FOR n := 16 TO 79 DO
		w[n] := ROL(w[n-3] XOR w[n-8] XOR w[n-14] XOR w[n-16], 1);
	END_FOR;
	
	// Initialize working variables
	a := hash[0];
	b := hash[1];
	c := hash[2];
	d := hash[3];
	e := hash[4];
	
	// Main loop
	FOR n := 0 TO 79 DO
		IF n <= 19 THEN
			f := (b AND c) OR (NOT(b) AND d);
			k := DWORD#16#5A827999;
		ELSIF n <= 39 THEN
			f := b XOR c XOR d;
			k := DWORD#16#6ED9EBA1;
		ELSIF n <= 59 THEN
			f := (b AND c) OR (b AND d) OR (c AND d);
			k := DWORD#16#8F1BBCDC;
		ELSE
			f := b XOR c XOR d;
			k := DWORD#16#CA62C1D6;
		END_IF;
		
		x := ROL(a, 5) + f + e + k + w[n];
		e := d;
		d := c;
		c := ROL(b, 30);
		b := a;
		a := x;
	END_FOR;
	
	// Add to hash
	hash[0] := hash[0] + a;
	hash[1] := hash[1] + b;
	hash[2] := hash[2] + c;
	hash[3] := hash[3] + d;
	hash[4] := hash[4] + e;
END_FOR;

// Convert hash DWORDs to byte array (big-endian)
z := 0;
FOR n := 0 TO 4 DO
	FOR n1 := 0 TO 3 DO
		hash[n] := ROL(hash[n], 8);
		abHash[z] := DWORD_TO_BYTE(hash[n]);
		z := z + 1;
	END_FOR;
END_FOR;

FC_SHA1_Bytes := TRUE;