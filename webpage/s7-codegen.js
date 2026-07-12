/**
 * s7-codegen.js — Siemens S7-1500 (TIA Portal) SCL generator.
 *
 * Takes the same signal lists the browser uses (window.PLC IOHandlers) and emits
 * the SHAPE-SPECIFIC blocks of PLC_Browser_IO.scl:
 *     UDT_App_Inputs / UDT_App_Outputs   (typed view)
 *     FC_WS_MapInputs / FC_WS_MapOutputs (little-endian pack/unpack)
 *     DB_WS_Input / DB_WS_Output         (wire-image size + typed view)
 * ...and, via genFullScl(), splices them into the fixed engine template
 * (window.S7_ENGINE_SCL) to produce a complete, import-ready .scl.
 *
 * The byte layout matches plc-core.js exactly (watchdog first, then fields by
 * descending alignment, S7 padding). The per-field SCL matches the hand-written
 * bridge in PLCSIM-Advanced-v5/PLC_Browser_IO.scl. No DOM; usable in the browser
 * and in Node (for tests).
 */
(function (root) {
  'use strict';

  var TYPES = {
    BIT:  { isBit: true,  align: 1, bytes: 0, scl: 'Bool' },
    BYTE: { isBit: false, align: 1, bytes: 1, scl: 'Byte' },
    INT:  { isBit: false, align: 2, bytes: 2, scl: 'Int' },
    UINT: { isBit: false, align: 2, bytes: 2, scl: 'UInt' },
    DINT: { isBit: false, align: 4, bytes: 4, scl: 'DInt' },
    REAL: { isBit: false, align: 4, bytes: 4, scl: 'Real' },
    STRING: { isBit: false, align: 1, bytes: null, scl: null } // Array[0..len] of Char
  };

  function hx(n) { return '16#' + (n & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }

  // Replicate plc-core.js sortSignals(): watchdog first, then stable sort by
  // descending alignment. Returns a NEW array (does not mutate).
  function sortSignals(signals) {
    var wd = null, rest = [];
    signals.forEach(function (s) {
      if (s.name && s.name.indexOf('uiWatchdog') === 0) wd = s; else rest.push(s);
    });
    rest = rest.slice().sort(function (a, b) {
      var aa = (TYPES[a.type] || { align: 1 }).align;
      var ab = (TYPES[b.type] || { align: 1 }).align;
      return ab - aa; // stable in modern JS engines
    });
    return wd ? [wd].concat(rest) : rest;
  }

  // Walk the layout the way plc-core.js packPayload() does; annotate each signal
  // with { off, bit, byteLen }. Returns { fields, size }.
  function layout(signals) {
    var sorted = sortSignals(signals);
    var bitCount = 0, cur = 0, fields = [];
    sorted.forEach(function (sig) {
      var info = TYPES[sig.type];
      if (!info) return;
      if (bitCount > 0 && !info.isBit) { cur++; bitCount = 0; }
      if (!info.isBit) cur += (info.align - (cur % info.align)) % info.align;

      var f = { name: sig.name, type: sig.type, length: parseInt(sig.length) || 0,
                comment: sig.comment || '', off: cur, bit: 0, byteLen: 0 };
      if (info.isBit) {
        f.bit = bitCount;
        bitCount++;
        if (bitCount === 8) { bitCount = 0; cur++; }
        f.byteLen = 0;
      } else if (sig.type === 'STRING') {
        f.byteLen = f.length + 1;      // chars + NUL
        cur += f.byteLen;
      } else {
        f.byteLen = info.bytes;
        cur += info.bytes;
      }
      fields.push(f);
    });
    var size = bitCount > 0 ? cur + 1 : cur;
    return { fields: fields, size: size };
  }

  // ---------- UDT ----------
  function genUDT(signals, typeName, dirLabel) {
    var lay = layout(signals);
    var out = [];
    out.push('// --- ' + typeName + '.scl ---');
    out.push('TYPE "' + typeName + '"');
    out.push('VERSION : 1.0');
    out.push('//  GENERATED typed view of the ' + dirLabel + ' dataset (offsets = wire layout).');
    out.push('//  Do not hand-edit; regenerate from the webpage when the dataset changes.');
    out.push('   STRUCT');
    lay.fields.forEach(function (f) {
      var cmt = f.comment ? '  ' + f.comment : '';
      if (f.type === 'STRING') {
        out.push('      ' + f.name + ' : Array[0..' + f.length + '] of Char;'
          + pad(f.name, 22) + '// offset ' + f.off + ' (' + f.length + ' chars + NUL)' + cmt);
      } else if (f.type === 'BIT') {
        out.push('      ' + f.name + ' : Bool;' + pad(f.name, 22)
          + '// offset ' + f.off + '.' + f.bit + cmt);
      } else {
        out.push('      ' + f.name + ' : ' + TYPES[f.type].scl + ';'
          + pad(f.name, 22) + '// offset ' + f.off + cmt);
      }
    });
    out.push('   END_STRUCT;');
    out.push('END_TYPE');
    return out.join('\n');
  }

  function pad(name, col) {
    var n = col - name.length;
    return n > 0 ? ' '.repeat(n) : ' ';
  }

  // ---------- MapInputs (raw -> app, little-endian) ----------
  function genMapInputs(signals, udtName) {
    var lay = layout(signals);
    var need = tempsNeeded(lay.fields);
    var out = [];
    out.push('// --- FC_WS_MapInputs.scl ---');
    out.push('FUNCTION "FC_WS_MapInputs" : Void');
    out.push("{ S7_Optimized_Access := 'TRUE' }");
    out.push('VERSION : 1.0');
    out.push('//  GENERATED. UNPACK the little-endian Browser->PLC byte image into typed data.');
    out.push('VAR_IN_OUT');
    out.push('   raw : Array[*] of Byte;');
    out.push('   app : "' + udtName + '";');
    out.push('END_VAR');
    out.push('VAR_TEMP');
    if (need.i)  out.push('   i  : Int;');
    if (need.w)  out.push('   w  : Word;');
    if (need.dw) out.push('   dw : DWord;');
    out.push('END_VAR');
    out.push('BEGIN');
    lay.fields.forEach(function (f) {
      var o = f.off;
      switch (f.type) {
        case 'BYTE':
          out.push('   app.' + f.name + ' := raw[' + o + '];');
          break;
        case 'BIT':
          out.push('   app.' + f.name + ' := (raw[' + o + '] AND ' + hx(1 << f.bit) + ') <> 0;');
          break;
        case 'INT':
          out.push('   w := BYTE_TO_WORD(raw[' + o + ']) OR SHL(IN := BYTE_TO_WORD(raw[' + (o + 1) + ']), N := 8);');
          out.push('   app.' + f.name + ' := WORD_TO_INT(w);');
          break;
        case 'UINT':
          out.push('   w := BYTE_TO_WORD(raw[' + o + ']) OR SHL(IN := BYTE_TO_WORD(raw[' + (o + 1) + ']), N := 8);');
          out.push('   app.' + f.name + ' := WORD_TO_UINT(w);');
          break;
        case 'DINT':
          out.push('   dw := ' + leDword(o) + ';');
          out.push('   app.' + f.name + ' := DWORD_TO_DINT(dw);');
          break;
        case 'REAL':
          out.push('   dw := ' + leDword(o) + ';');
          out.push('   app.' + f.name + ' := DWORD_TO_REAL(dw);');
          break;
        case 'STRING':
          out.push('   FOR i := 0 TO ' + f.length + ' DO app.' + f.name + '[i] := BYTE_TO_CHAR(raw[' + o + ' + i]); END_FOR;');
          break;
      }
    });
    out.push('END_FUNCTION');
    return out.join('\n');
  }

  function leDword(o) {
    return 'BYTE_TO_DWORD(raw[' + o + ']) OR SHL(IN := BYTE_TO_DWORD(raw[' + (o + 1) + ']), N := 8)\n'
      + '      OR SHL(IN := BYTE_TO_DWORD(raw[' + (o + 2) + ']), N := 16) OR SHL(IN := BYTE_TO_DWORD(raw[' + (o + 3) + ']), N := 24)';
  }

  // ---------- MapOutputs (app -> raw, little-endian) ----------
  function genMapOutputs(signals, udtName) {
    var lay = layout(signals);
    var need = tempsNeeded(lay.fields);
    var out = [];
    out.push('// --- FC_WS_MapOutputs.scl ---');
    out.push('FUNCTION "FC_WS_MapOutputs" : Void');
    out.push("{ S7_Optimized_Access := 'TRUE' }");
    out.push('VERSION : 1.0');
    out.push('//  GENERATED. PACK typed data into the little-endian PLC->Browser byte image.');
    out.push('//  Byte 0 (watchdog) is overwritten by FB_WS_Bridge each scan.');
    out.push('VAR_IN_OUT');
    out.push('   app : "' + udtName + '";');
    out.push('   raw : Array[*] of Byte;');
    out.push('END_VAR');
    out.push('VAR_TEMP');
    if (need.i)    out.push('   i    : Int;');
    if (need.bOut) out.push('   bOut : Byte;');
    if (need.dint) { out.push('   t    : DInt;'); out.push('   bb   : DInt;'); }
    if (need.dw)   out.push('   dw   : DWord;');
    if (need.uiv)  out.push('   uiv  : UInt;');
    if (need.real) {
      out.push('   rr   : Real;');
      out.push('   frac : Real;');
      out.push('   sgn  : DInt;');
      out.push('   ex   : DInt;');
      out.push('   mn   : DInt;');
    }
    out.push('END_VAR');
    out.push('BEGIN');
    out.push('   // zero the image first (guarantees clean padding + string NUL terminators)');
    out.push('   FOR i := 0 TO ' + (lay.size - 1) + ' DO raw[i] := 0; END_FOR;');

    // group consecutive BITs by byte offset so one raw[] write covers a whole byte
    var i = 0;
    while (i < lay.fields.length) {
      var f = lay.fields[i];
      var o = f.off;
      if (f.type === 'BIT') {
        var group = [f];
        var j = i + 1;
        while (j < lay.fields.length && lay.fields[j].type === 'BIT' && lay.fields[j].off === o) {
          group.push(lay.fields[j]); j++;
        }
        out.push('   bOut := 0;');
        group.forEach(function (g) {
          out.push('   IF app.' + g.name + ' THEN bOut := bOut OR ' + hx(1 << g.bit) + '; END_IF;');
        });
        out.push('   raw[' + o + '] := bOut;');
        i = j;
        continue;
      }
      switch (f.type) {
        case 'BYTE':
          out.push('   raw[' + o + '] := app.' + f.name + ';');
          break;
        case 'INT':
          out.push('   uiv := INT_TO_UINT(app.' + f.name + ');');
          out.push('   dw  := "FC_U2D"(UINT_TO_UDINT(uiv));');
          out.push('   raw[' + o + ']   := DWORD_TO_BYTE(dw AND 16#FF);');
          out.push('   raw[' + (o + 1) + '] := DWORD_TO_BYTE(SHR(IN := dw, N := 8) AND 16#FF);');
          break;
        case 'UINT':
          out.push('   dw := "FC_U2D"(UINT_TO_UDINT(app.' + f.name + '));');
          out.push('   raw[' + o + ']   := DWORD_TO_BYTE(dw AND 16#FF);');
          out.push('   raw[' + (o + 1) + '] := DWORD_TO_BYTE(SHR(IN := dw, N := 8) AND 16#FF);');
          break;
        case 'DINT':
          out.push('   t := app.' + f.name + ';');
          for (var b = 0; b < 4; b++) {
            var last = (b === 3);
            out.push('   bb := t MOD 256; IF bb < 0 THEN bb := bb + 256; END_IF; raw[' + (o + b)
              + '] := INT_TO_BYTE(DINT_TO_INT(bb));' + (last ? '' : ' t := (t - bb) / 256;'));
          }
          break;
        case 'REAL':
          out.push(realBlock(f.name, o));
          break;
        case 'STRING':
          out.push('   FOR i := 0 TO ' + f.length + ' DO raw[' + o + ' + i] := CHAR_TO_BYTE(app.' + f.name + '[i]); END_FOR;');
          break;
      }
      i++;
    }
    out.push('END_FUNCTION');
    return out.join('\n');
  }

  function realBlock(name, o) {
    return [
      '   rr := app.' + name + ';',
      '   IF rr = 0.0 THEN',
      '      sgn := 0; ex := 0; mn := 0;',
      '   ELSE',
      '      IF rr < 0.0 THEN sgn := 1; rr := rr * (-1.0); ELSE sgn := 0; END_IF;',
      '      ex := 127;',
      '      WHILE rr >= 2.0 DO rr := rr / 2.0; ex := ex + 1; END_WHILE;',
      '      WHILE rr < 1.0  DO rr := rr * 2.0; ex := ex - 1; END_WHILE;',
      '      frac := rr - 1.0;',
      '      mn := 0;',
      '      FOR i := 1 TO 23 DO',
      '         frac := frac * 2.0;',
      '         IF frac >= 1.0 THEN mn := mn * 2 + 1; frac := frac - 1.0;',
      '         ELSE mn := mn * 2; END_IF;',
      '      END_FOR;',
      '      IF ex < 1   THEN ex := 0;   mn := 0; END_IF;',
      '      IF ex > 254 THEN ex := 255; mn := 0; END_IF;',
      '   END_IF;',
      '   raw[' + o + ']   := INT_TO_BYTE(DINT_TO_INT(mn MOD 256));',
      '   raw[' + (o + 1) + '] := INT_TO_BYTE(DINT_TO_INT((mn / 256) MOD 256));',
      '   raw[' + (o + 2) + '] := INT_TO_BYTE(DINT_TO_INT((ex MOD 2) * 128 + (mn / 65536)));',
      '   raw[' + (o + 3) + '] := INT_TO_BYTE(DINT_TO_INT(sgn * 128 + ex / 2));'
    ].join('\n');
  }

  function tempsNeeded(fields) {
    var n = { i: false, w: false, dw: false, bOut: false, dint: false, uiv: false, real: false };
    fields.forEach(function (f) {
      if (f.type === 'STRING') n.i = true;
      if (f.type === 'INT') { n.w = true; n.dw = true; n.uiv = true; }
      if (f.type === 'UINT') { n.w = true; n.dw = true; }
      if (f.type === 'DINT') { n.dw = true; n.dint = true; }
      if (f.type === 'REAL') { n.dw = true; n.real = true; n.i = true; }
      if (f.type === 'BIT') n.bOut = true;
    });
    return n;
  }

  // ---------- Data blocks ----------
  function genDBs(inSize, outSize) {
    return [
      '// --- DB_WS_Output.scl ---',
      'DATA_BLOCK "DB_WS_Output"',
      "{ S7_Optimized_Access := 'FALSE' }",
      'VERSION : 1.0',
      '//  PLC -> Browser. Raw is the wire image the bridge ships (auto-sized).',
      '   STRUCT',
      '      Raw : Array[0..' + (outSize - 1) + '] of Byte;        // wire image (' + outSize + ' B)',
      '      App : "UDT_App_Outputs";',
      '   END_STRUCT;',
      'BEGIN',
      'END_DATA_BLOCK',
      '',
      '',
      '// --- DB_WS_Input.scl ---',
      'DATA_BLOCK "DB_WS_Input"',
      "{ S7_Optimized_Access := 'FALSE' }",
      'VERSION : 1.0',
      '//  Browser -> PLC. Raw is the wire image the bridge receives (auto-sized).',
      '   STRUCT',
      '      Raw : Array[0..' + (inSize - 1) + '] of Byte;        // wire image (' + inSize + ' B)',
      '      App : "UDT_App_Inputs";',
      '   END_STRUCT;',
      'BEGIN',
      'END_DATA_BLOCK'
    ].join('\n');
  }

  // ---------- Assembly ----------
  // inSignals  = Browser -> PLC list  (UDT_App_Inputs)
  // outSignals = PLC -> Browser list  (UDT_App_Outputs)
  function genShapeBlocks(inSignals, outSignals) {
    var inLay = layout(inSignals), outLay = layout(outSignals);
    return [
      genUDT(inSignals, 'UDT_App_Inputs', 'Browser -> PLC'),
      genUDT(outSignals, 'UDT_App_Outputs', 'PLC -> Browser'),
      genMapInputs(inSignals, 'UDT_App_Inputs'),
      genMapOutputs(outSignals, 'UDT_App_Outputs'),
      genDBs(inLay.size, outLay.size)
    ].join('\n\n\n');
  }

  function genFullScl(inSignals, outSignals, engineTemplate) {
    var tmpl = engineTemplate || root.S7_ENGINE_SCL;
    if (!tmpl) throw new Error('S7_ENGINE_SCL template not loaded');
    var marker = '// {{GENERATED_SHAPE_BLOCKS}}';
    if (tmpl.indexOf(marker) < 0) throw new Error('injection marker missing in engine template');
    return tmpl.replace(marker, genShapeBlocks(inSignals, outSignals));
  }

  var api = {
    TYPES: TYPES, sortSignals: sortSignals, layout: layout,
    genUDT: genUDT, genMapInputs: genMapInputs, genMapOutputs: genMapOutputs,
    genDBs: genDBs, genShapeBlocks: genShapeBlocks, genFullScl: genFullScl
  };

  root.S7Codegen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
