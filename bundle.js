require=(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (global){(function (){
/* global exports:true, module:true, require:true, define:true, global:true */

(function (root, name, factory) {
  'use strict';

  // Used to determine if values are of the language type `Object`
  var objectTypes = {
        'function': true
      , 'object': true
    }
    // Detect free variable `exports`
    , freeExports = objectTypes[typeof exports] && exports && !exports.nodeType && exports
    // Detect free variable `module`
    , freeModule = objectTypes[typeof module] && module && !module.nodeType && module
    // Detect free variable `global`, from Node.js or Browserified code, and
    // use it as `window`
    , freeGlobal = freeExports && freeModule && typeof global === 'object' && global
    // Detect the popular CommonJS extension `module.exports`
    , moduleExports = freeModule && freeModule.exports === freeExports && freeExports;

  /* istanbul ignore else */
  if (freeGlobal && (freeGlobal.global === freeGlobal ||
                     /* istanbul ignore next */ freeGlobal.window === freeGlobal ||
                     /* istanbul ignore next */ freeGlobal.self === freeGlobal)) {
    root = freeGlobal;
  }

  // Some AMD build optimizers, like r.js, check for specific condition
  // patterns like the following:
  /* istanbul ignore if */
  if (typeof define === 'function' &&
      /* istanbul ignore next */ typeof define.amd === 'object' &&
      /* istanbul ignore next */ define.amd) {
    // defined as an anonymous module.
    define(['exports'], factory);
    // In case the source has been processed and wrapped in a define module use
    // the supplied `exports` object.
    if (freeExports && moduleExports) factory(freeModule.exports);
  }
  // check for `exports` after `define` in case a build optimizer adds an
  // `exports` object
  else /* istanbul ignore else */ if (freeExports && freeModule) {
    // in Node.js or RingoJS v0.8.0+
    /* istanbul ignore else */
    if (moduleExports) factory(freeModule.exports);
    // in Narwhal or RingoJS v0.7.0-
    else factory(freeExports);
  }
  // in a browser or Rhino
  else {
    factory((root[name] = {}));
  }
}(this, 'luaparse', function (exports) {
  'use strict';

  exports.version = '0.2.1';

  var input, options, length, features;

  // Options can be set either globally on the parser object through
  // defaultOptions, or during the parse call.
  var defaultOptions = exports.defaultOptions = {
    // Explicitly tell the parser when the input ends.
      wait: false
    // Store comments as an array in the chunk object.
    , comments: true
    // Track identifier scopes by adding an isLocal attribute to each
    // identifier-node.
    , scope: false
    // Store location information on each syntax node as
    // `loc: { start: { line, column }, end: { line, column } }`.
    , locations: false
    // Store the start and end character locations on each syntax node as
    // `range: [start, end]`.
    , ranges: false
    // A callback which will be invoked when a syntax node has been completed.
    // The node which has been created will be passed as the only parameter.
    , onCreateNode: null
    // A callback which will be invoked when a new scope is created.
    , onCreateScope: null
    // A callback which will be invoked when the current scope is destroyed.
    , onDestroyScope: null
    // A callback which will be invoked when a local variable is declared in the current scope.
    // The variable's name will be passed as the only parameter
    , onLocalDeclaration: null
    // The version of Lua targeted by the parser (string; allowed values are
    // '5.1', '5.2', '5.3').
    , luaVersion: '5.1'
    // Whether to allow code points outside the Basic Latin block in identifiers
    , extendedIdentifiers: false
  };

  // The available tokens expressed as enum flags so they can be checked with
  // bitwise operations.

  var EOF = 1, StringLiteral = 2, Keyword = 4, Identifier = 8
    , NumericLiteral = 16, Punctuator = 32, BooleanLiteral = 64
    , NilLiteral = 128, VarargLiteral = 256;

  exports.tokenTypes = { EOF: EOF, StringLiteral: StringLiteral
    , Keyword: Keyword, Identifier: Identifier, NumericLiteral: NumericLiteral
    , Punctuator: Punctuator, BooleanLiteral: BooleanLiteral
    , NilLiteral: NilLiteral, VarargLiteral: VarargLiteral
  };

  // As this parser is a bit different from luas own, the error messages
  // will be different in some situations.

  var errors = exports.errors = {
      unexpected: 'unexpected %1 \'%2\' near \'%3\''
    , expected: '\'%1\' expected near \'%2\''
    , expectedToken: '%1 expected near \'%2\''
    , unfinishedString: 'unfinished string near \'%1\''
    , malformedNumber: 'malformed number near \'%1\''
    , invalidVar: 'invalid left-hand side of assignment near \'%1\''
    , decimalEscapeTooLarge: 'decimal escape too large near \'%1\''
    , invalidEscape: 'invalid escape sequence near \'%1\''
    , hexadecimalDigitExpected: 'hexadecimal digit expected near \'%1\''
    , braceExpected: 'missing \'%1\' near \'%2\''
    , tooLargeCodepoint: 'UTF-8 value too large near \'%1\''
    , unfinishedLongString: 'unfinished long string (starting at line %1) near \'%2\''
    , unfinishedLongComment: 'unfinished long comment (starting at line %1) near \'%2\''
    , ambiguousSyntax: 'ambiguous syntax (function call x new statement) near \'%1\''
  };

  // ### Abstract Syntax Tree
  //
  // The default AST structure is inspired by the Mozilla Parser API but can
  // easily be customized by overriding these functions.

  var ast = exports.ast = {
      labelStatement: function(label) {
      return {
          type: 'LabelStatement'
        , label: label
      };
    }

    , breakStatement: function() {
      return {
          type: 'BreakStatement'
      };
    }

    , gotoStatement: function(label) {
      return {
          type: 'GotoStatement'
        , label: label
      };
    }

    , returnStatement: function(args) {
      return {
          type: 'ReturnStatement'
        , 'arguments': args
      };
    }

    , ifStatement: function(clauses) {
      return {
          type: 'IfStatement'
        , clauses: clauses
      };
    }
    , ifClause: function(condition, body) {
      return {
          type: 'IfClause'
        , condition: condition
        , body: body
      };
    }
    , elseifClause: function(condition, body) {
      return {
          type: 'ElseifClause'
        , condition: condition
        , body: body
      };
    }
    , elseClause: function(body) {
      return {
          type: 'ElseClause'
        , body: body
      };
    }

    , whileStatement: function(condition, body) {
      return {
          type: 'WhileStatement'
        , condition: condition
        , body: body
      };
    }

    , doStatement: function(body) {
      return {
          type: 'DoStatement'
        , body: body
      };
    }

    , repeatStatement: function(condition, body) {
      return {
          type: 'RepeatStatement'
        , condition: condition
        , body: body
      };
    }

    , localStatement: function(variables, init) {
      return {
          type: 'LocalStatement'
        , variables: variables
        , init: init
      };
    }

    , assignmentStatement: function(variables, init) {
      return {
          type: 'AssignmentStatement'
        , variables: variables
        , init: init
      };
    }

    , callStatement: function(expression) {
      return {
          type: 'CallStatement'
        , expression: expression
      };
    }

    , functionStatement: function(identifier, parameters, isLocal, body) {
      return {
          type: 'FunctionDeclaration'
        , identifier: identifier
        , isLocal: isLocal
        , parameters: parameters
        , body: body
      };
    }

    , forNumericStatement: function(variable, start, end, step, body) {
      return {
          type: 'ForNumericStatement'
        , variable: variable
        , start: start
        , end: end
        , step: step
        , body: body
      };
    }

    , forGenericStatement: function(variables, iterators, body) {
      return {
          type: 'ForGenericStatement'
        , variables: variables
        , iterators: iterators
        , body: body
      };
    }

    , chunk: function(body) {
      return {
          type: 'Chunk'
        , body: body
      };
    }

    , identifier: function(name) {
      return {
          type: 'Identifier'
        , name: name
      };
    }

    , literal: function(type, value, raw) {
      type = (type === StringLiteral) ? 'StringLiteral'
        : (type === NumericLiteral) ? 'NumericLiteral'
        : (type === BooleanLiteral) ? 'BooleanLiteral'
        : (type === NilLiteral) ? 'NilLiteral'
        : 'VarargLiteral';

      return {
          type: type
        , value: value
        , raw: raw
      };
    }

    , tableKey: function(key, value) {
      return {
          type: 'TableKey'
        , key: key
        , value: value
      };
    }
    , tableKeyString: function(key, value) {
      return {
          type: 'TableKeyString'
        , key: key
        , value: value
      };
    }
    , tableValue: function(value) {
      return {
          type: 'TableValue'
        , value: value
      };
    }


    , tableConstructorExpression: function(fields) {
      return {
          type: 'TableConstructorExpression'
        , fields: fields
      };
    }
    , binaryExpression: function(operator, left, right) {
      var type = ('and' === operator || 'or' === operator) ?
        'LogicalExpression' :
        'BinaryExpression';

      return {
          type: type
        , operator: operator
        , left: left
        , right: right
      };
    }
    , unaryExpression: function(operator, argument) {
      return {
          type: 'UnaryExpression'
        , operator: operator
        , argument: argument
      };
    }
    , memberExpression: function(base, indexer, identifier) {
      return {
          type: 'MemberExpression'
        , indexer: indexer
        , identifier: identifier
        , base: base
      };
    }

    , indexExpression: function(base, index) {
      return {
          type: 'IndexExpression'
        , base: base
        , index: index
      };
    }

    , callExpression: function(base, args) {
      return {
          type: 'CallExpression'
        , base: base
        , 'arguments': args
      };
    }

    , tableCallExpression: function(base, args) {
      return {
          type: 'TableCallExpression'
        , base: base
        , 'arguments': args
      };
    }

    , stringCallExpression: function(base, argument) {
      return {
          type: 'StringCallExpression'
        , base: base
        , argument: argument
      };
    }

    , comment: function(value, raw) {
      return {
          type: 'Comment'
        , value: value
        , raw: raw
      };
    }
  };

  // Wrap up the node object.

  function finishNode(node) {
    // Pop a `Marker` off the location-array and attach its location data.
    if (trackLocations) {
      var location = locations.pop();
      location.complete();
      location.bless(node);
    }
    if (options.onCreateNode) options.onCreateNode(node);
    return node;
  }


  // Helpers
  // -------

  var slice = Array.prototype.slice
    , toString = Object.prototype.toString
    , indexOf = function indexOf(array, element) {
      for (var i = 0, length = array.length; i < length; ++i) {
        if (array[i] === element) return i;
      }
      return -1;
    };

  // Iterate through an array of objects and return the index of an object
  // with a matching property.

  function indexOfObject(array, property, element) {
    for (var i = 0, length = array.length; i < length; ++i) {
      if (array[i][property] === element) return i;
    }
    return -1;
  }

  // A sprintf implementation using %index (beginning at 1) to input
  // arguments in the format string.
  //
  // Example:
  //
  //     // Unexpected function in token
  //     sprintf('Unexpected %2 in %1.', 'token', 'function');

  function sprintf(format) {
    var args = slice.call(arguments, 1);
    format = format.replace(/%(\d)/g, function (match, index) {
      return '' + args[index - 1] || /* istanbul ignore next */ '';
    });
    return format;
  }

  // Returns a new object with the properties from all objectes passed as
  // arguments. Last argument takes precedence.
  //
  // Example:
  //
  //     this.options = extend(options, { output: false });

  function extend() {
    var args = slice.call(arguments)
      , dest = {}
      , src, prop;

    for (var i = 0, length = args.length; i < length; ++i) {
      src = args[i];
      for (prop in src)
        /* istanbul ignore else */
        if (src.hasOwnProperty(prop)) {
          dest[prop] = src[prop];
        }
    }
    return dest;
  }

  // ### Error functions

  // XXX: Eliminate this function and change the error type to be different from SyntaxError.
  // This will unfortunately be a breaking change, because some downstream users depend
  // on the error thrown being an instance of SyntaxError. For example, the Ace editor:
  // <https://github.com/ajaxorg/ace/blob/4c7e5eb3f5d5ca9434847be51834a4e41661b852/lib/ace/mode/lua_worker.js#L55>

  function fixupError(e) {
    /* istanbul ignore if */
    if (!Object.create)
      return e;
    return Object.create(e, {
      'line': { 'writable': true, value: e.line },
      'index': { 'writable': true, value: e.index },
      'column': { 'writable': true, value: e.column }
    });
  }

  // #### Raise an exception.
  //
  // Raise an exception by passing a token, a string format and its paramters.
  //
  // The passed tokens location will automatically be added to the error
  // message if it exists, if not it will default to the lexers current
  // position.
  //
  // Example:
  //
  //     // [1:0] expected [ near (
  //     raise(token, "expected %1 near %2", '[', token.value);

  function raise(token) {
    var message = sprintf.apply(null, slice.call(arguments, 1))
      , error, col;

    if ('undefined' !== typeof token.line) {
      col = token.range[0] - token.lineStart;
      error = fixupError(new SyntaxError(sprintf('[%1:%2] %3', token.line, col, message)));
      error.line = token.line;
      error.index = token.range[0];
      error.column = col;
    } else {
      col = index - lineStart + 1;
      error = fixupError(new SyntaxError(sprintf('[%1:%2] %3', line, col, message)));
      error.index = index;
      error.line = line;
      error.column = col;
    }
    throw error;
  }

  // #### Raise an unexpected token error.
  //
  // Example:
  //
  //     // expected <name> near '0'
  //     raiseUnexpectedToken('<name>', token);

  function raiseUnexpectedToken(type, token) {
    raise(token, errors.expectedToken, type, token.value);
  }

  // #### Raise a general unexpected error
  //
  // Usage should pass either a token object or a symbol string which was
  // expected. We can also specify a nearby token such as <eof>, this will
  // default to the currently active token.
  //
  // Example:
  //
  //     // Unexpected symbol 'end' near '<eof>'
  //     unexpected(token);
  //
  // If there's no token in the buffer it means we have reached <eof>.

  function unexpected(found) {
    var near = lookahead.value;
    if ('undefined' !== typeof found.type) {
      var type;
      switch (found.type) {
        case StringLiteral:   type = 'string';      break;
        case Keyword:         type = 'keyword';     break;
        case Identifier:      type = 'identifier';  break;
        case NumericLiteral:  type = 'number';      break;
        case Punctuator:      type = 'symbol';      break;
        case BooleanLiteral:  type = 'boolean';     break;
        case NilLiteral:
          return raise(found, errors.unexpected, 'symbol', 'nil', near);
      }
      return raise(found, errors.unexpected, type, found.value, near);
    }
    return raise(found, errors.unexpected, 'symbol', found, near);
  }

  // Lexer
  // -----
  //
  // The lexer, or the tokenizer reads the input string character by character
  // and derives a token left-right. To be as efficient as possible the lexer
  // prioritizes the common cases such as identifiers. It also works with
  // character codes instead of characters as string comparisons was the
  // biggest bottleneck of the parser.
  //
  // If `options.comments` is enabled, all comments encountered will be stored
  // in an array which later will be appended to the chunk object. If disabled,
  // they will simply be disregarded.
  //
  // When the lexer has derived a valid token, it will be returned as an object
  // containing its value and as well as its position in the input string (this
  // is always enabled to provide proper debug messages).
  //
  // `lex()` starts lexing and returns the following token in the stream.

  var index
    , token
    , previousToken
    , lookahead
    , comments
    , tokenStart
    , line
    , lineStart;

  exports.lex = lex;

  function lex() {
    skipWhiteSpace();

    // Skip comments beginning with --
    while (45 === input.charCodeAt(index) &&
           45 === input.charCodeAt(index + 1)) {
      scanComment();
      skipWhiteSpace();
    }
    if (index >= length) return {
        type : EOF
      , value: '<eof>'
      , line: line
      , lineStart: lineStart
      , range: [index, index]
    };

    var charCode = input.charCodeAt(index)
      , next = input.charCodeAt(index + 1);

    // Memorize the range index where the token begins.
    tokenStart = index;
    if (isIdentifierStart(charCode)) return scanIdentifierOrKeyword();

    switch (charCode) {
      case 39: case 34: // '"
        return scanStringLiteral();

      case 48: case 49: case 50: case 51: case 52: case 53:
      case 54: case 55: case 56: case 57: // 0-9
        return scanNumericLiteral();

      case 46: // .
        // If the dot is followed by a digit it's a float.
        if (isDecDigit(next)) return scanNumericLiteral();
        if (46 === next) {
          if (46 === input.charCodeAt(index + 2)) return scanVarargLiteral();
          return scanPunctuator('..');
        }
        return scanPunctuator('.');

      case 61: // =
        if (61 === next) return scanPunctuator('==');
        return scanPunctuator('=');

      case 62: // >
        if (features.bitwiseOperators)
          if (62 === next) return scanPunctuator('>>');
        if (61 === next) return scanPunctuator('>=');
        return scanPunctuator('>');

      case 60: // <
        if (features.bitwiseOperators)
          if (60 === next) return scanPunctuator('<<');
        if (61 === next) return scanPunctuator('<=');
        return scanPunctuator('<');

      case 126: // ~
        if (61 === next) return scanPunctuator('~=');
        if (!features.bitwiseOperators)
          break;
        return scanPunctuator('~');

      case 58: // :
        if (features.labels)
          if (58 === next) return scanPunctuator('::');
        return scanPunctuator(':');

      case 91: // [
        // Check for a multiline string, they begin with [= or [[
        if (91 === next || 61 === next) return scanLongStringLiteral();
        return scanPunctuator('[');

      case 47: // /
        // Check for integer division op (//)
        if (features.integerDivision)
          if (47 === next) return scanPunctuator('//');
        return scanPunctuator('/');

      case 38: case 124: // & |
        if (!features.bitwiseOperators)
          break;

        /* fall through */
      case 42: case 94: case 37: case 44: case 123: case 125:
      case 93: case 40: case 41: case 59: case 35: case 45:
      case 43: // * ^ % , { } ] ( ) ; # - +
        return scanPunctuator(input.charAt(index));
    }

    return unexpected(input.charAt(index));
  }

  // Whitespace has no semantic meaning in lua so simply skip ahead while
  // tracking the encounted newlines. Any kind of eol sequence is counted as a
  // single line.

  function consumeEOL() {
    var charCode = input.charCodeAt(index)
      , peekCharCode = input.charCodeAt(index + 1);

    if (isLineTerminator(charCode)) {
      // Count \n\r and \r\n as one newline.
      if (10 === charCode && 13 === peekCharCode) ++index;
      if (13 === charCode && 10 === peekCharCode) ++index;
      ++line;
      lineStart = ++index;

      return true;
    }
    return false;
  }

  function skipWhiteSpace() {
    while (index < length) {
      var charCode = input.charCodeAt(index);
      if (isWhiteSpace(charCode)) {
        ++index;
      } else if (!consumeEOL()) {
        break;
      }
    }
  }

  function encodeUTF8(codepoint) {
    if (codepoint < 0x80) {
      return String.fromCharCode(codepoint);
    } else if (codepoint < 0x800) {
      return String.fromCharCode(
        0xc0 |  (codepoint >>  6)        ,
        0x80 | ( codepoint        & 0x3f)
      );
    } else if (codepoint < 0x10000) {
      return String.fromCharCode(
        0xe0 |  (codepoint >> 12)        ,
        0x80 | ((codepoint >>  6) & 0x3f),
        0x80 | ( codepoint        & 0x3f)
      );
    } else if (codepoint < 0x110000) {
      return String.fromCharCode(
        0xf0 |  (codepoint >> 18)        ,
        0x80 | ((codepoint >> 12) & 0x3f),
        0x80 | ((codepoint >>  6) & 0x3f),
        0x80 | ( codepoint        & 0x3f)
      );
    } else {
      return null;
    }
  }

  // This function takes a JavaScript string, encodes it in WTF-8 and
  // reinterprets the resulting code units as code points; i.e. it encodes
  // the string in what was the original meaning of WTF-8.
  //
  // For a detailed rationale, see the README.md file, section
  // "Note on character encodings".

  function fixupHighCharacters(s) {
    return s.replace(/[\ud800-\udbff][\udc00-\udfff]|[^\x00-\x7f]/g, function (m) {
      if (m.length === 1)
        return encodeUTF8(m.charCodeAt(0));
      return encodeUTF8(0x10000 + (((m.charCodeAt(0) & 0x3ff) << 10) | (m.charCodeAt(1) & 0x3ff)));
    });
  }

  // Identifiers, keywords, booleans and nil all look the same syntax wise. We
  // simply go through them one by one and defaulting to an identifier if no
  // previous case matched.

  function scanIdentifierOrKeyword() {
    var value, type;

    // Slicing the input string is prefered before string concatenation in a
    // loop for performance reasons.
    while (isIdentifierPart(input.charCodeAt(++index)));
    value = input.slice(tokenStart, index);

    // Decide on the token type and possibly cast the value.
    if (isKeyword(value)) {
      type = Keyword;
    } else if ('true' === value || 'false' === value) {
      type = BooleanLiteral;
      value = ('true' === value);
    } else if ('nil' === value) {
      type = NilLiteral;
      value = null;
    } else {
      type = Identifier;
    }

    return {
        type: type
      , value: value
      , line: line
      , lineStart: lineStart
      , range: [tokenStart, index]
    };
  }

  // Once a punctuator reaches this function it should already have been
  // validated so we simply return it as a token.

  function scanPunctuator(value) {
    index += value.length;
    return {
        type: Punctuator
      , value: value
      , line: line
      , lineStart: lineStart
      , range: [tokenStart, index]
    };
  }

  // A vararg literal consists of three dots.

  function scanVarargLiteral() {
    index += 3;
    return {
        type: VarargLiteral
      , value: '...'
      , line: line
      , lineStart: lineStart
      , range: [tokenStart, index]
    };
  }

  // Find the string literal by matching the delimiter marks used.

  function scanStringLiteral() {
    var delimiter = input.charCodeAt(index++)
      , beginLine = line
      , beginLineStart = lineStart
      , stringStart = index
      , string = ''
      , charCode;

    while (index < length) {
      charCode = input.charCodeAt(index++);
      if (delimiter === charCode) break;
      if (92 === charCode) { // backslash
        string += fixupHighCharacters(input.slice(stringStart, index - 1)) + readEscapeSequence();
        stringStart = index;
      }
      // EOF or `\n` terminates a string literal. If we haven't found the
      // ending delimiter by now, raise an exception.
      else if (index >= length || isLineTerminator(charCode)) {
        string += input.slice(stringStart, index - 1);
        raise({}, errors.unfinishedString, string + String.fromCharCode(charCode));
      }
    }
    string += fixupHighCharacters(input.slice(stringStart, index - 1));

    return {
        type: StringLiteral
      , value: string
      , line: beginLine
      , lineStart: beginLineStart
      , lastLine: line
      , lastLineStart: lineStart
      , range: [tokenStart, index]
    };
  }

  // Expect a multiline string literal and return it as a regular string
  // literal, if it doesn't validate into a valid multiline string, throw an
  // exception.

  function scanLongStringLiteral() {
    var beginLine = line
      , beginLineStart = lineStart
      , string = readLongString(false);
    // Fail if it's not a multiline literal.
    if (false === string) raise(token, errors.expected, '[', token.value);

    return {
        type: StringLiteral
      , value: fixupHighCharacters(string)
      , line: beginLine
      , lineStart: beginLineStart
      , lastLine: line
      , lastLineStart: lineStart
      , range: [tokenStart, index]
    };
  }

  // Numeric literals will be returned as floating-point numbers instead of
  // strings. The raw value should be retrieved from slicing the input string
  // later on in the process.
  //
  // If a hexadecimal number is encountered, it will be converted.

  function scanNumericLiteral() {
    var character = input.charAt(index)
      , next = input.charAt(index + 1);

    var value = ('0' === character && 'xX'.indexOf(next || null) >= 0) ?
      readHexLiteral() : readDecLiteral();

    return {
        type: NumericLiteral
      , value: value
      , line: line
      , lineStart: lineStart
      , range: [tokenStart, index]
    };
  }

  // Lua hexadecimals have an optional fraction part and an optional binary
  // exoponent part. These are not included in JavaScript so we will compute
  // all three parts separately and then sum them up at the end of the function
  // with the following algorithm.
  //
  //     Digit := toDec(digit)
  //     Fraction := toDec(fraction) / 16 ^ fractionCount
  //     BinaryExp := 2 ^ binaryExp
  //     Number := ( Digit + Fraction ) * BinaryExp

  function readHexLiteral() {
    var fraction = 0 // defaults to 0 as it gets summed
      , binaryExponent = 1 // defaults to 1 as it gets multiplied
      , binarySign = 1 // positive
      , digit, fractionStart, exponentStart, digitStart;

    digitStart = index += 2; // Skip 0x part

    // A minimum of one hex digit is required.
    if (!isHexDigit(input.charCodeAt(index)))
      raise({}, errors.malformedNumber, input.slice(tokenStart, index));

    while (isHexDigit(input.charCodeAt(index))) ++index;
    // Convert the hexadecimal digit to base 10.
    digit = parseInt(input.slice(digitStart, index), 16);

    // Fraction part i optional.
    if ('.' === input.charAt(index)) {
      fractionStart = ++index;

      while (isHexDigit(input.charCodeAt(index))) ++index;
      fraction = input.slice(fractionStart, index);

      // Empty fraction parts should default to 0, others should be converted
      // 0.x form so we can use summation at the end.
      fraction = (fractionStart === index) ? 0
        : parseInt(fraction, 16) / Math.pow(16, index - fractionStart);
    }

    // Binary exponents are optional
    if ('pP'.indexOf(input.charAt(index) || null) >= 0) {
      ++index;

      // Sign part is optional and defaults to 1 (positive).
      if ('+-'.indexOf(input.charAt(index) || null) >= 0)
        binarySign = ('+' === input.charAt(index++)) ? 1 : -1;

      exponentStart = index;

      // The binary exponent sign requires a decimal digit.
      if (!isDecDigit(input.charCodeAt(index)))
        raise({}, errors.malformedNumber, input.slice(tokenStart, index));

      while (isDecDigit(input.charCodeAt(index))) ++index;
      binaryExponent = input.slice(exponentStart, index);

      // Calculate the binary exponent of the number.
      binaryExponent = Math.pow(2, binaryExponent * binarySign);
    }

    return (digit + fraction) * binaryExponent;
  }

  // Decimal numbers are exactly the same in Lua and in JavaScript, because of
  // this we check where the token ends and then parse it with native
  // functions.

  function readDecLiteral() {
    while (isDecDigit(input.charCodeAt(index))) ++index;
    // Fraction part is optional
    if ('.' === input.charAt(index)) {
      ++index;
      // Fraction part defaults to 0
      while (isDecDigit(input.charCodeAt(index))) ++index;
    }
    // Exponent part is optional.
    if ('eE'.indexOf(input.charAt(index) || null) >= 0) {
      ++index;
      // Sign part is optional.
      if ('+-'.indexOf(input.charAt(index) || null) >= 0) ++index;
      // An exponent is required to contain at least one decimal digit.
      if (!isDecDigit(input.charCodeAt(index)))
        raise({}, errors.malformedNumber, input.slice(tokenStart, index));

      while (isDecDigit(input.charCodeAt(index))) ++index;
    }

    return parseFloat(input.slice(tokenStart, index));
  }

  function readUnicodeEscapeSequence() {
    var sequenceStart = index++;

    if (input.charAt(index++) !== '{')
      raise({}, errors.braceExpected, '{', '\\' + input.slice(sequenceStart, index));
    if (!isHexDigit(input.charCodeAt(index)))
      raise({}, errors.hexadecimalDigitExpected, '\\' + input.slice(sequenceStart, index));

    while (input.charCodeAt(index) === 0x30) ++index;
    var escStart = index;

    while (isHexDigit(input.charCodeAt(index))) {
      ++index;
      if (index - escStart > 6)
        raise({}, errors.tooLargeCodepoint, '\\' + input.slice(sequenceStart, index));
    }

    var b = input.charAt(index++);
    if (b !== '}') {
      if ((b === '"') || (b === "'"))
        raise({}, errors.braceExpected, '}', '\\' + input.slice(sequenceStart, index--));
      else
        raise({}, errors.hexadecimalDigitExpected, '\\' + input.slice(sequenceStart, index));
    }

    var codepoint = parseInt(input.slice(escStart, index - 1), 16);

    codepoint = encodeUTF8(codepoint);
    if (codepoint === null) {
      raise({}, errors.tooLargeCodepoint, '\\' + input.slice(sequenceStart, index));
    }
    return codepoint;
  }

  // Translate escape sequences to the actual characters.
  function readEscapeSequence() {
    var sequenceStart = index;
    switch (input.charAt(index)) {
      // Lua allow the following escape sequences.
      case 'a': ++index; return '\x07';
      case 'n': ++index; return '\n';
      case 'r': ++index; return '\r';
      case 't': ++index; return '\t';
      case 'v': ++index; return '\x0b';
      case 'b': ++index; return '\b';
      case 'f': ++index; return '\f';

      // Backslash at the end of the line. We treat all line endings as equivalent,
      // and as representing the [LF] character (code 10). Lua 5.1 through 5.3
      // have been verified to behave the same way.
      case '\r':
      case '\n':
        consumeEOL();
        return '\n';

      case '0': case '1': case '2': case '3': case '4':
      case '5': case '6': case '7': case '8': case '9':
        // \ddd, where ddd is a sequence of up to three decimal digits.
        while (isDecDigit(input.charCodeAt(index)) && index - sequenceStart < 3) ++index;

        var ddd = parseInt(input.slice(sequenceStart, index), 10);
        if (ddd > 255) {
          raise({}, errors.decimalEscapeTooLarge, '\\' + ddd);
        }
        return String.fromCharCode(ddd);

      case 'z':
        if (features.skipWhitespaceEscape) {
          ++index;
          skipWhiteSpace();
          return '';
        }

        /* fall through */
      case 'x':
        if (features.hexEscapes) {
          // \xXX, where XX is a sequence of exactly two hexadecimal digits
          if (isHexDigit(input.charCodeAt(index + 1)) &&
              isHexDigit(input.charCodeAt(index + 2))) {
            index += 3;
            return String.fromCharCode(parseInt(input.slice(sequenceStart + 1, index), 16));
          }
          raise({}, errors.hexadecimalDigitExpected, '\\' + input.slice(sequenceStart, index + 2));
        }

        /* fall through */
      case 'u':
        if (features.unicodeEscapes) {
          return readUnicodeEscapeSequence();
        }

        /* fall through */
      default:
        if (features.strictEscapes)
          raise({}, errors.invalidEscape, '\\' + input.slice(sequenceStart, index + 1));

        /* fall through */
      case '\\': case '"': case "'":
        return input.charAt(index++);
    }
  }

  // Comments begin with -- after which it will be decided if they are
  // multiline comments or not.
  //
  // The multiline functionality works the exact same way as with string
  // literals so we reuse the functionality.

  function scanComment() {
    tokenStart = index;
    index += 2; // --

    var character = input.charAt(index)
      , content = ''
      , isLong = false
      , commentStart = index
      , lineStartComment = lineStart
      , lineComment = line;

    if ('[' === character) {
      content = readLongString(true);
      // This wasn't a multiline comment after all.
      if (false === content) content = character;
      else isLong = true;
    }
    // Scan until next line as long as it's not a multiline comment.
    if (!isLong) {
      while (index < length) {
        if (isLineTerminator(input.charCodeAt(index))) break;
        ++index;
      }
      if (options.comments) content = input.slice(commentStart, index);
    }

    if (options.comments) {
      var node = ast.comment(content, input.slice(tokenStart, index));

      // `Marker`s depend on tokens available in the parser and as comments are
      // intercepted in the lexer all location data is set manually.
      if (options.locations) {
        node.loc = {
            start: { line: lineComment, column: tokenStart - lineStartComment }
          , end: { line: line, column: index - lineStart }
        };
      }
      if (options.ranges) {
        node.range = [tokenStart, index];
      }
      if (options.onCreateNode) options.onCreateNode(node);
      comments.push(node);
    }
  }

  // Read a multiline string by calculating the depth of `=` characters and
  // then appending until an equal depth is found.

  function readLongString(isComment) {
    var level = 0
      , content = ''
      , terminator = false
      , character, stringStart, firstLine = line;

    ++index; // [

    // Calculate the depth of the comment.
    while ('=' === input.charAt(index + level)) ++level;
    // Exit, this is not a long string afterall.
    if ('[' !== input.charAt(index + level)) return false;

    index += level + 1;

    // If the first character is a newline, ignore it and begin on next line.
    if (isLineTerminator(input.charCodeAt(index))) consumeEOL();

    stringStart = index;
    while (index < length) {
      // To keep track of line numbers run the `consumeEOL()` which increments
      // its counter.
      while (isLineTerminator(input.charCodeAt(index))) consumeEOL();

      character = input.charAt(index++);

      // Once the delimiter is found, iterate through the depth count and see
      // if it matches.
      if (']' === character) {
        terminator = true;
        for (var i = 0; i < level; ++i) {
          if ('=' !== input.charAt(index + i)) terminator = false;
        }
        if (']' !== input.charAt(index + level)) terminator = false;
      }

      // We reached the end of the multiline string. Get out now.
      if (terminator) {
        content += input.slice(stringStart, index - 1);
        index += level + 1;
        return content;
      }
    }

    raise({}, isComment ?
              errors.unfinishedLongComment :
              errors.unfinishedLongString,
          firstLine, '<eof>');
  }

  // ## Lex functions and helpers.

  // Read the next token.
  //
  // This is actually done by setting the current token to the lookahead and
  // reading in the new lookahead token.

  function next() {
    previousToken = token;
    token = lookahead;
    lookahead = lex();
  }

  // Consume a token if its value matches. Once consumed or not, return the
  // success of the operation.

  function consume(value) {
    if (value === token.value) {
      next();
      return true;
    }
    return false;
  }

  // Expect the next token value to match. If not, throw an exception.

  function expect(value) {
    if (value === token.value) next();
    else raise(token, errors.expected, value, token.value);
  }

  // ### Validation functions

  function isWhiteSpace(charCode) {
    return 9 === charCode || 32 === charCode || 0xB === charCode || 0xC === charCode;
  }

  function isLineTerminator(charCode) {
    return 10 === charCode || 13 === charCode;
  }

  function isDecDigit(charCode) {
    return charCode >= 48 && charCode <= 57;
  }

  function isHexDigit(charCode) {
    return (charCode >= 48 && charCode <= 57) || (charCode >= 97 && charCode <= 102) || (charCode >= 65 && charCode <= 70);
  }

  // From [Lua 5.2](http://www.lua.org/manual/5.2/manual.html#8.1) onwards
  // identifiers cannot use 'locale-dependent' letters (i.e. dependent on the C locale).
  // On the other hand, LuaJIT allows arbitrary octets ≥ 128 in identifiers.

  function isIdentifierStart(charCode) {
    if ((charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122) || 95 === charCode)
      return true;
    if (options.extendedIdentifiers && charCode >= 128)
      return true;
    return false;
  }

  function isIdentifierPart(charCode) {
    if ((charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122) || 95 === charCode || (charCode >= 48 && charCode <= 57))
      return true;
    if (options.extendedIdentifiers && charCode >= 128)
      return true;
    return false;
  }

  // [3.1 Lexical Conventions](http://www.lua.org/manual/5.2/manual.html#3.1)
  //
  // `true`, `false` and `nil` will not be considered keywords, but literals.

  function isKeyword(id) {
    switch (id.length) {
      case 2:
        return 'do' === id || 'if' === id || 'in' === id || 'or' === id;
      case 3:
        return 'and' === id || 'end' === id || 'for' === id || 'not' === id;
      case 4:
        if ('else' === id || 'then' === id)
          return true;
        if (features.labels && !features.contextualGoto)
          return ('goto' === id);
        return false;
      case 5:
        return 'break' === id || 'local' === id || 'until' === id || 'while' === id;
      case 6:
        return 'elseif' === id || 'repeat' === id || 'return' === id;
      case 8:
        return 'function' === id;
    }
    return false;
  }

  function isUnary(token) {
    if (Punctuator === token.type) return '#-~'.indexOf(token.value) >= 0;
    if (Keyword === token.type) return 'not' === token.value;
    return false;
  }

  // @TODO this needs to be rethought.
  function isCallExpression(expression) {
    switch (expression.type) {
      case 'CallExpression':
      case 'TableCallExpression':
      case 'StringCallExpression':
        return true;
    }
    return false;
  }

  // Check if the token syntactically closes a block.

  function isBlockFollow(token) {
    if (EOF === token.type) return true;
    if (Keyword !== token.type) return false;
    switch (token.value) {
      case 'else': case 'elseif':
      case 'end': case 'until':
        return true;
      default:
        return false;
    }
  }

  // Scope
  // -----

  // Store each block scope as a an array of identifier names. Each scope is
  // stored in an FILO-array.
  var scopes
    // The current scope index
    , scopeDepth
    // A list of all global identifier nodes.
    , globals;

  // Create a new scope inheriting all declarations from the previous scope.
  function createScope() {
    var scope = Array.apply(null, scopes[scopeDepth++]);
    scopes.push(scope);
    if (options.onCreateScope) options.onCreateScope();
  }

  // Exit and remove the current scope.
  function destroyScope() {
    var scope = scopes.pop();
    scopeDepth--;
    if (options.onDestroyScope) options.onDestroyScope();
  }

  // Add identifier name to the current scope if it doesnt already exist.
  function scopeIdentifierName(name) {
    if (options.onLocalDeclaration) options.onLocalDeclaration(name);
    if (-1 !== indexOf(scopes[scopeDepth], name)) return;
    scopes[scopeDepth].push(name);
  }

  // Add identifier to the current scope
  function scopeIdentifier(node) {
    scopeIdentifierName(node.name);
    attachScope(node, true);
  }

  // Attach scope information to node. If the node is global, store it in the
  // globals array so we can return the information to the user.
  function attachScope(node, isLocal) {
    if (!isLocal && -1 === indexOfObject(globals, 'name', node.name))
      globals.push(node);

    node.isLocal = isLocal;
  }

  // Is the identifier name available in this scope.
  function scopeHasName(name) {
    return (-1 !== indexOf(scopes[scopeDepth], name));
  }

  // Location tracking
  // -----------------
  //
  // Locations are stored in FILO-array as a `Marker` object consisting of both
  // `loc` and `range` data. Once a `Marker` is popped off the list an end
  // location is added and the data is attached to a syntax node.

  var locations = []
    , trackLocations;

  function createLocationMarker() {
    return new Marker(token);
  }

  function Marker(token) {
    if (options.locations) {
      this.loc = {
          start: {
            line: token.line
          , column: token.range[0] - token.lineStart
        }
        , end: {
            line: 0
          , column: 0
        }
      };
    }
    if (options.ranges) this.range = [token.range[0], 0];
  }

  // Complete the location data stored in the `Marker` by adding the location
  // of the *previous token* as an end location.
  Marker.prototype.complete = function() {
    if (options.locations) {
      this.loc.end.line = previousToken.lastLine || previousToken.line;
      this.loc.end.column = previousToken.range[1] - (previousToken.lastLineStart || previousToken.lineStart);
    }
    if (options.ranges) {
      this.range[1] = previousToken.range[1];
    }
  };

  Marker.prototype.bless = function (node) {
    if (this.loc) {
      var loc = this.loc;
      node.loc = {
        start: {
          line: loc.start.line,
          column: loc.start.column
        },
        end: {
          line: loc.end.line,
          column: loc.end.column
        }
      };
    }
    if (this.range) {
      node.range = [
        this.range[0],
        this.range[1]
      ];
    }
  };

  // Create a new `Marker` and add it to the FILO-array.
  function markLocation() {
    if (trackLocations) locations.push(createLocationMarker());
  }

  // Push an arbitrary `Marker` object onto the FILO-array.
  function pushLocation(marker) {
    if (trackLocations) locations.push(marker);
  }

  // Parse functions
  // ---------------

  // Chunk is the main program object. Syntactically it's the same as a block.
  //
  //     chunk ::= block

  function parseChunk() {
    next();
    markLocation();
    if (options.scope) createScope();
    var body = parseBlock();
    if (options.scope) destroyScope();
    if (EOF !== token.type) unexpected(token);
    // If the body is empty no previousToken exists when finishNode runs.
    if (trackLocations && !body.length) previousToken = token;
    return finishNode(ast.chunk(body));
  }

  // A block contains a list of statements with an optional return statement
  // as its last statement.
  //
  //     block ::= {stat} [retstat]

  function parseBlock(terminator) {
    var block = []
      , statement;

    while (!isBlockFollow(token)) {
      // Return has to be the last statement in a block.
      if ('return' === token.value) {
        block.push(parseStatement());
        break;
      }
      statement = parseStatement();
      consume(';');
      // Statements are only added if they are returned, this allows us to
      // ignore some statements, such as EmptyStatement.
      if (statement) block.push(statement);
    }

    // Doesn't really need an ast node
    return block;
  }

  // There are two types of statements, simple and compound.
  //
  //     statement ::= break | goto | do | while | repeat | return
  //          | if | for | function | local | label | assignment
  //          | functioncall | ';'

  function parseStatement() {
    markLocation();
    if (Keyword === token.type) {
      switch (token.value) {
        case 'local':    next(); return parseLocalStatement();
        case 'if':       next(); return parseIfStatement();
        case 'return':   next(); return parseReturnStatement();
        case 'function': next();
          var name = parseFunctionName();
          return parseFunctionDeclaration(name);
        case 'while':    next(); return parseWhileStatement();
        case 'for':      next(); return parseForStatement();
        case 'repeat':   next(); return parseRepeatStatement();
        case 'break':    next(); return parseBreakStatement();
        case 'do':       next(); return parseDoStatement();
        case 'goto':     next(); return parseGotoStatement();
      }
    }

    if (features.contextualGoto &&
        token.type === Identifier && token.value === 'goto' &&
        lookahead.type === Identifier && lookahead.value !== 'goto') {
      next(); return parseGotoStatement();
    }

    if (Punctuator === token.type) {
      if (consume('::')) return parseLabelStatement();
    }
    // Assignments memorizes the location and pushes it manually for wrapper
    // nodes. Additionally empty `;` statements should not mark a location.
    if (trackLocations) locations.pop();

    // When a `;` is encounted, simply eat it without storing it.
    if (features.emptyStatement) {
      if (consume(';')) return;
    }

    return parseAssignmentOrCallStatement();
  }

  // ## Statements

  //     label ::= '::' Name '::'

  function parseLabelStatement() {
    var name = token.value
      , label = parseIdentifier();

    if (options.scope) {
      scopeIdentifierName('::' + name + '::');
      attachScope(label, true);
    }

    expect('::');
    return finishNode(ast.labelStatement(label));
  }

  //     break ::= 'break'

  function parseBreakStatement() {
    return finishNode(ast.breakStatement());
  }

  //     goto ::= 'goto' Name

  function parseGotoStatement() {
    var name = token.value
      , label = parseIdentifier();

    return finishNode(ast.gotoStatement(label));
  }

  //     do ::= 'do' block 'end'

  function parseDoStatement() {
    if (options.scope) createScope();
    var body = parseBlock();
    if (options.scope) destroyScope();
    expect('end');
    return finishNode(ast.doStatement(body));
  }

  //     while ::= 'while' exp 'do' block 'end'

  function parseWhileStatement() {
    var condition = parseExpectedExpression();
    expect('do');
    if (options.scope) createScope();
    var body = parseBlock();
    if (options.scope) destroyScope();
    expect('end');
    return finishNode(ast.whileStatement(condition, body));
  }

  //     repeat ::= 'repeat' block 'until' exp

  function parseRepeatStatement() {
    if (options.scope) createScope();
    var body = parseBlock();
    expect('until');
    var condition = parseExpectedExpression();
    if (options.scope) destroyScope();
    return finishNode(ast.repeatStatement(condition, body));
  }

  //     retstat ::= 'return' [exp {',' exp}] [';']

  function parseReturnStatement() {
    var expressions = [];

    if ('end' !== token.value) {
      var expression = parseExpression();
      if (null != expression) expressions.push(expression);
      while (consume(',')) {
        expression = parseExpectedExpression();
        expressions.push(expression);
      }
      consume(';'); // grammar tells us ; is optional here.
    }
    return finishNode(ast.returnStatement(expressions));
  }

  //     if ::= 'if' exp 'then' block {elif} ['else' block] 'end'
  //     elif ::= 'elseif' exp 'then' block

  function parseIfStatement() {
    var clauses = []
      , condition
      , body
      , marker;

    // IfClauses begin at the same location as the parent IfStatement.
    // It ends at the start of `end`, `else`, or `elseif`.
    if (trackLocations) {
      marker = locations[locations.length - 1];
      locations.push(marker);
    }
    condition = parseExpectedExpression();
    expect('then');
    if (options.scope) createScope();
    body = parseBlock();
    if (options.scope) destroyScope();
    clauses.push(finishNode(ast.ifClause(condition, body)));

    if (trackLocations) marker = createLocationMarker();
    while (consume('elseif')) {
      pushLocation(marker);
      condition = parseExpectedExpression();
      expect('then');
      if (options.scope) createScope();
      body = parseBlock();
      if (options.scope) destroyScope();
      clauses.push(finishNode(ast.elseifClause(condition, body)));
      if (trackLocations) marker = createLocationMarker();
    }

    if (consume('else')) {
      // Include the `else` in the location of ElseClause.
      if (trackLocations) {
        marker = new Marker(previousToken);
        locations.push(marker);
      }
      if (options.scope) createScope();
      body = parseBlock();
      if (options.scope) destroyScope();
      clauses.push(finishNode(ast.elseClause(body)));
    }

    expect('end');
    return finishNode(ast.ifStatement(clauses));
  }

  // There are two types of for statements, generic and numeric.
  //
  //     for ::= Name '=' exp ',' exp [',' exp] 'do' block 'end'
  //     for ::= namelist 'in' explist 'do' block 'end'
  //     namelist ::= Name {',' Name}
  //     explist ::= exp {',' exp}

  function parseForStatement() {
    var variable = parseIdentifier()
      , body;

    // The start-identifier is local.

    if (options.scope) {
      createScope();
      scopeIdentifier(variable);
    }

    // If the first expression is followed by a `=` punctuator, this is a
    // Numeric For Statement.
    if (consume('=')) {
      // Start expression
      var start = parseExpectedExpression();
      expect(',');
      // End expression
      var end = parseExpectedExpression();
      // Optional step expression
      var step = consume(',') ? parseExpectedExpression() : null;

      expect('do');
      body = parseBlock();
      expect('end');
      if (options.scope) destroyScope();

      return finishNode(ast.forNumericStatement(variable, start, end, step, body));
    }
    // If not, it's a Generic For Statement
    else {
      // The namelist can contain one or more identifiers.
      var variables = [variable];
      while (consume(',')) {
        variable = parseIdentifier();
        // Each variable in the namelist is locally scoped.
        if (options.scope) scopeIdentifier(variable);
        variables.push(variable);
      }
      expect('in');
      var iterators = [];

      // One or more expressions in the explist.
      do {
        var expression = parseExpectedExpression();
        iterators.push(expression);
      } while (consume(','));

      expect('do');
      body = parseBlock();
      expect('end');
      if (options.scope) destroyScope();

      return finishNode(ast.forGenericStatement(variables, iterators, body));
    }
  }

  // Local statements can either be variable assignments or function
  // definitions. If a function definition is found, it will be delegated to
  // `parseFunctionDeclaration()` with the isLocal flag.
  //
  // This AST structure might change into a local assignment with a function
  // child.
  //
  //     local ::= 'local' 'function' Name funcdecl
  //        | 'local' Name {',' Name} ['=' exp {',' exp}]

  function parseLocalStatement() {
    var name;

    if (Identifier === token.type) {
      var variables = []
        , init = [];

      do {
        name = parseIdentifier();

        variables.push(name);
      } while (consume(','));

      if (consume('=')) {
        do {
          var expression = parseExpectedExpression();
          init.push(expression);
        } while (consume(','));
      }

      // Declarations doesn't exist before the statement has been evaluated.
      // Therefore assignments can't use their declarator. And the identifiers
      // shouldn't be added to the scope until the statement is complete.
      if (options.scope) {
        for (var i = 0, l = variables.length; i < l; ++i) {
          scopeIdentifier(variables[i]);
        }
      }

      return finishNode(ast.localStatement(variables, init));
    }
    if (consume('function')) {
      name = parseIdentifier();

      if (options.scope) {
        scopeIdentifier(name);
        createScope();
      }

      // MemberExpressions are not allowed in local function statements.
      return parseFunctionDeclaration(name, true);
    } else {
      raiseUnexpectedToken('<name>', token);
    }
  }

  function validateVar(node) {
    // @TODO we need something not dependent on the exact AST used. see also isCallExpression()
    if (node.inParens || (['Identifier', 'MemberExpression', 'IndexExpression'].indexOf(node.type) === -1)) {
      raise(token, errors.invalidVar, token.value);
    }
  }

  //     assignment ::= varlist '=' explist
  //     var ::= Name | prefixexp '[' exp ']' | prefixexp '.' Name
  //     varlist ::= var {',' var}
  //     explist ::= exp {',' exp}
  //
  //     call ::= callexp
  //     callexp ::= prefixexp args | prefixexp ':' Name args

  function parseAssignmentOrCallStatement() {
    // Keep a reference to the previous token for better error messages in case
    // of invalid statement
    var previous = token
      , expression, marker;

    if (trackLocations) marker = createLocationMarker();
    expression = parsePrefixExpression();

    if (null == expression) return unexpected(token);
    if (',='.indexOf(token.value) >= 0) {
      var variables = [expression]
        , init = []
        , exp;

      validateVar(expression);
      while (consume(',')) {
        exp = parsePrefixExpression();
        if (null == exp) raiseUnexpectedToken('<expression>', token);
        validateVar(exp);
        variables.push(exp);
      }
      expect('=');
      do {
        exp = parseExpectedExpression();
        init.push(exp);
      } while (consume(','));

      pushLocation(marker);
      return finishNode(ast.assignmentStatement(variables, init));
    }
    if (isCallExpression(expression)) {
      pushLocation(marker);
      return finishNode(ast.callStatement(expression));
    }
    // The prefix expression was neither part of an assignment or a
    // callstatement, however as it was valid it's been consumed, so raise
    // the exception on the previous token to provide a helpful message.
    return unexpected(previous);
  }



  // ### Non-statements

  //     Identifier ::= Name

  function parseIdentifier() {
    markLocation();
    var identifier = token.value;
    if (Identifier !== token.type) raiseUnexpectedToken('<name>', token);
    next();
    return finishNode(ast.identifier(identifier));
  }

  // Parse the functions parameters and body block. The name should already
  // have been parsed and passed to this declaration function. By separating
  // this we allow for anonymous functions in expressions.
  //
  // For local functions there's a boolean parameter which needs to be set
  // when parsing the declaration.
  //
  //     funcdecl ::= '(' [parlist] ')' block 'end'
  //     parlist ::= Name {',' Name} | [',' '...'] | '...'

  function parseFunctionDeclaration(name, isLocal) {
    var parameters = [];
    expect('(');

    // The declaration has arguments
    if (!consume(')')) {
      // Arguments are a comma separated list of identifiers, optionally ending
      // with a vararg.
      while (true) {
        if (Identifier === token.type) {
          var parameter = parseIdentifier();
          // Function parameters are local.
          if (options.scope) scopeIdentifier(parameter);

          parameters.push(parameter);

          if (consume(',')) continue;
          else if (consume(')')) break;
        }
        // No arguments are allowed after a vararg.
        else if (VarargLiteral === token.type) {
          parameters.push(parsePrimaryExpression());
          expect(')');
          break;
        } else {
          raiseUnexpectedToken('<name> or \'...\'', token);
        }
      }
    }

    var body = parseBlock();
    expect('end');
    if (options.scope) destroyScope();

    isLocal = isLocal || false;
    return finishNode(ast.functionStatement(name, parameters, isLocal, body));
  }

  // Parse the function name as identifiers and member expressions.
  //
  //     Name {'.' Name} [':' Name]

  function parseFunctionName() {
    var base, name, marker;

    if (trackLocations) marker = createLocationMarker();
    base = parseIdentifier();

    if (options.scope) {
      attachScope(base, scopeHasName(base.name));
      createScope();
    }

    while (consume('.')) {
      pushLocation(marker);
      name = parseIdentifier();
      base = finishNode(ast.memberExpression(base, '.', name));
    }

    if (consume(':')) {
      pushLocation(marker);
      name = parseIdentifier();
      base = finishNode(ast.memberExpression(base, ':', name));
      if (options.scope) scopeIdentifierName('self');
    }

    return base;
  }

  //     tableconstructor ::= '{' [fieldlist] '}'
  //     fieldlist ::= field {fieldsep field} fieldsep
  //     field ::= '[' exp ']' '=' exp | Name = 'exp' | exp
  //
  //     fieldsep ::= ',' | ';'

  function parseTableConstructor() {
    var fields = []
      , key, value;

    while (true) {
      markLocation();
      if (Punctuator === token.type && consume('[')) {
        key = parseExpectedExpression();
        expect(']');
        expect('=');
        value = parseExpectedExpression();
        fields.push(finishNode(ast.tableKey(key, value)));
      } else if (Identifier === token.type) {
        if ('=' === lookahead.value) {
          key = parseIdentifier();
          next();
          value = parseExpectedExpression();
          fields.push(finishNode(ast.tableKeyString(key, value)));
        } else {
          value = parseExpectedExpression();
          fields.push(finishNode(ast.tableValue(value)));
        }
      } else {
        if (null == (value = parseExpression())) {
          locations.pop();
          break;
        }
        fields.push(finishNode(ast.tableValue(value)));
      }
      if (',;'.indexOf(token.value) >= 0) {
        next();
        continue;
      }
      break;
    }
    expect('}');
    return finishNode(ast.tableConstructorExpression(fields));
  }

  // Expression parser
  // -----------------
  //
  // Expressions are evaluated and always return a value. If nothing is
  // matched null will be returned.
  //
  //     exp ::= (unop exp | primary | prefixexp ) { binop exp }
  //
  //     primary ::= nil | false | true | Number | String | '...'
  //          | functiondef | tableconstructor
  //
  //     prefixexp ::= (Name | '(' exp ')' ) { '[' exp ']'
  //          | '.' Name | ':' Name args | args }
  //

  function parseExpression() {
    var expression = parseSubExpression(0);
    return expression;
  }

  // Parse an expression expecting it to be valid.

  function parseExpectedExpression() {
    var expression = parseExpression();
    if (null == expression) raiseUnexpectedToken('<expression>', token);
    else return expression;
  }


  // Return the precedence priority of the operator.
  //
  // As unary `-` can't be distinguished from binary `-`, unary precedence
  // isn't described in this table but in `parseSubExpression()` itself.
  //
  // As this function gets hit on every expression it's been optimized due to
  // the expensive CompareICStub which took ~8% of the parse time.

  function binaryPrecedence(operator) {
    var charCode = operator.charCodeAt(0)
      , length = operator.length;

    if (1 === length) {
      switch (charCode) {
        case 94: return 12; // ^
        case 42: case 47: case 37: return 10; // * / %
        case 43: case 45: return 9; // + -
        case 38: return 6; // &
        case 126: return 5; // ~
        case 124: return 4; // |
        case 60: case 62: return 3; // < >
      }
    } else if (2 === length) {
      switch (charCode) {
        case 47: return 10; // //
        case 46: return 8; // ..
        case 60: case 62:
            if('<<' === operator || '>>' === operator) return 7; // << >>
            return 3; // <= >=
        case 61: case 126: return 3; // == ~=
        case 111: return 1; // or
      }
    } else if (97 === charCode && 'and' === operator) return 2;
    return 0;
  }

  // Implement an operator-precedence parser to handle binary operator
  // precedence.
  //
  // We use this algorithm because it's compact, it's fast and Lua core uses
  // the same so we can be sure our expressions are parsed in the same manner
  // without excessive amounts of tests.
  //
  //     exp ::= (unop exp | primary | prefixexp ) { binop exp }

  function parseSubExpression(minPrecedence) {
    var operator = token.value
    // The left-hand side in binary operations.
      , expression, marker;

    if (trackLocations) marker = createLocationMarker();

    // UnaryExpression
    if (isUnary(token)) {
      markLocation();
      next();
      var argument = parseSubExpression(10);
      if (argument == null) raiseUnexpectedToken('<expression>', token);
      expression = finishNode(ast.unaryExpression(operator, argument));
    }
    if (null == expression) {
      // PrimaryExpression
      expression = parsePrimaryExpression();

      // PrefixExpression
      if (null == expression) {
        expression = parsePrefixExpression();
      }
    }
    // This is not a valid left hand expression.
    if (null == expression) return null;

    var precedence;
    while (true) {
      operator = token.value;

      precedence = (Punctuator === token.type || Keyword === token.type) ?
        binaryPrecedence(operator) : 0;

      if (precedence === 0 || precedence <= minPrecedence) break;
      // Right-hand precedence operators
      if ('^' === operator || '..' === operator) precedence--;
      next();
      var right = parseSubExpression(precedence);
      if (null == right) raiseUnexpectedToken('<expression>', token);
      // Push in the marker created before the loop to wrap its entirety.
      if (trackLocations) locations.push(marker);
      expression = finishNode(ast.binaryExpression(operator, expression, right));

    }
    return expression;
  }

  //     prefixexp ::= prefix {suffix}
  //     prefix ::= Name | '(' exp ')'
  //     suffix ::= '[' exp ']' | '.' Name | ':' Name args | args
  //
  //     args ::= '(' [explist] ')' | tableconstructor | String

  function parsePrefixExpression() {
    var base, name, marker;

    if (trackLocations) marker = createLocationMarker();

    // The prefix
    if (Identifier === token.type) {
      name = token.value;
      base = parseIdentifier();
      // Set the parent scope.
      if (options.scope) attachScope(base, scopeHasName(name));
    } else if (consume('(')) {
      base = parseExpectedExpression();
      expect(')');
      base.inParens = true; // XXX: quick and dirty. needed for validateVar
    } else {
      return null;
    }

    // The suffix
    var expression, identifier;
    while (true) {
      if (Punctuator === token.type) {
        switch (token.value) {
          case '[':
            pushLocation(marker);
            next();
            expression = parseExpectedExpression();
            expect(']');
            base = finishNode(ast.indexExpression(base, expression));
            break;
          case '.':
            pushLocation(marker);
            next();
            identifier = parseIdentifier();
            base = finishNode(ast.memberExpression(base, '.', identifier));
            break;
          case ':':
            pushLocation(marker);
            next();
            identifier = parseIdentifier();
            base = finishNode(ast.memberExpression(base, ':', identifier));
            // Once a : is found, this has to be a CallExpression, otherwise
            // throw an error.
            pushLocation(marker);
            base = parseCallExpression(base);
            break;
          case '(': case '{': // args
            pushLocation(marker);
            base = parseCallExpression(base);
            break;
          default:
            return base;
        }
      } else if (StringLiteral === token.type) {
        pushLocation(marker);
        base = parseCallExpression(base);
      } else {
        break;
      }
    }

    return base;
  }

  //     args ::= '(' [explist] ')' | tableconstructor | String

  function parseCallExpression(base) {
    if (Punctuator === token.type) {
      switch (token.value) {
        case '(':
          if (!features.emptyStatement) {
            if (token.line !== previousToken.line)
              raise({}, errors.ambiguousSyntax, token.value);
          }
          next();

          // List of expressions
          var expressions = [];
          var expression = parseExpression();
          if (null != expression) expressions.push(expression);
          while (consume(',')) {
            expression = parseExpectedExpression();
            expressions.push(expression);
          }

          expect(')');
          return finishNode(ast.callExpression(base, expressions));

        case '{':
          markLocation();
          next();
          var table = parseTableConstructor();
          return finishNode(ast.tableCallExpression(base, table));
      }
    } else if (StringLiteral === token.type) {
      return finishNode(ast.stringCallExpression(base, parsePrimaryExpression()));
    }

    raiseUnexpectedToken('function arguments', token);
  }

  //     primary ::= String | Numeric | nil | true | false
  //          | functiondef | tableconstructor | '...'

  function parsePrimaryExpression() {
    var literals = StringLiteral | NumericLiteral | BooleanLiteral | NilLiteral | VarargLiteral
      , value = token.value
      , type = token.type
      , marker;

    if (trackLocations) marker = createLocationMarker();

    if (type & literals) {
      pushLocation(marker);
      var raw = input.slice(token.range[0], token.range[1]);
      next();
      return finishNode(ast.literal(type, value, raw));
    } else if (Keyword === type && 'function' === value) {
      pushLocation(marker);
      next();
      if (options.scope) createScope();
      return parseFunctionDeclaration(null);
    } else if (consume('{')) {
      pushLocation(marker);
      return parseTableConstructor();
    }
  }

  // Parser
  // ------

  // Export the main parser.
  //
  //   - `wait` Hold parsing until end() is called. Defaults to false
  //   - `comments` Store comments. Defaults to true.
  //   - `scope` Track identifier scope. Defaults to false.
  //   - `locations` Store location information. Defaults to false.
  //   - `ranges` Store the start and end character locations. Defaults to
  //     false.
  //   - `onCreateNode` Callback which will be invoked when a syntax node is
  //     created.
  //   - `onCreateScope` Callback which will be invoked when a new scope is
  //     created.
  //   - `onDestroyScope` Callback which will be invoked when the current scope
  //     is destroyed.
  //
  // Example:
  //
  //     var parser = require('luaparser');
  //     parser.parse('i = 0');

  exports.parse = parse;

  var versionFeatures = {
    '5.1': {
    },
    '5.2': {
      labels: true,
      emptyStatement: true,
      hexEscapes: true,
      skipWhitespaceEscape: true,
      strictEscapes: true
    },
    '5.3': {
      labels: true,
      emptyStatement: true,
      hexEscapes: true,
      skipWhitespaceEscape: true,
      strictEscapes: true,
      unicodeEscapes: true,
      bitwiseOperators: true,
      integerDivision: true
    },
    'LuaJIT': {
      // XXX: LuaJIT language features may depend on compilation options; may need to
      // rethink how to handle this. Specifically, there is a LUAJIT_ENABLE_LUA52COMPAT
      // that removes contextual goto. Maybe add 'LuaJIT-5.2compat' as well?
      labels: true,
      contextualGoto: true,
      hexEscapes: true,
      skipWhitespaceEscape: true,
      strictEscapes: true,
      unicodeEscapes: true
    }
  };

  function parse(_input, _options) {
    if ('undefined' === typeof _options && 'object' === typeof _input) {
      _options = _input;
      _input = undefined;
    }
    if (!_options) _options = {};

    input = _input || '';
    options = extend(defaultOptions, _options);

    // Rewind the lexer
    index = 0;
    line = 1;
    lineStart = 0;
    length = input.length;
    // When tracking identifier scope, initialize with an empty scope.
    scopes = [[]];
    scopeDepth = 0;
    globals = [];
    locations = [];

    if (!(features = versionFeatures[options.luaVersion])) {
      throw new Error(sprintf("Lua version '%1' not supported", options.luaVersion));
    }

    if (options.comments) comments = [];
    if (!options.wait) return end();
    return exports;
  }

  // Write to the source code buffer without beginning the parse.
  exports.write = write;

  function write(_input) {
    input += String(_input);
    length = input.length;
    return exports;
  }

  // Send an EOF and begin parsing.
  exports.end = end;

  function end(_input) {
    if ('undefined' !== typeof _input) write(_input);

    // Ignore shebangs.
    if (input && input.substr(0, 2) === '#!') input = input.replace(/^.*/, function (line) {
      return line.replace(/./g, ' ');
    });

    length = input.length;
    trackLocations = options.locations || options.ranges;
    // Initialize with a lookahead token.
    lookahead = lex();

    var chunk = parseChunk();
    if (options.comments) chunk.comments = comments;
    if (options.scope) chunk.globals = globals;

    /* istanbul ignore if */
    if (locations.length > 0)
      throw new Error('Location tracking failed. This is most likely a bug in luaparse');

    return chunk;
  }

}));
/* vim: set sw=2 ts=2 et tw=79 : */

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],2:[function(require,module,exports){
/*!

 diff v4.0.1

Software License Agreement (BSD License)

Copyright (c) 2009-2015, Kevin Decker <kpdecker@gmail.com>

All rights reserved.

Redistribution and use of this software in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above
  copyright notice, this list of conditions and the
  following disclaimer.

* Redistributions in binary form must reproduce the above
  copyright notice, this list of conditions and the
  following disclaimer in the documentation and/or other
  materials provided with the distribution.

* Neither the name of Kevin Decker nor the names of its
  contributors may be used to endorse or promote products
  derived from this software without specific prior
  written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
@license
*/
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = global || self, factory(global.Diff = {}));
}(this, function (exports) { 'use strict';

  function Diff() {}
  Diff.prototype = {
    diff: function diff(oldString, newString) {
      var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      var callback = options.callback;

      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      this.options = options;
      var self = this;

      function done(value) {
        if (callback) {
          setTimeout(function () {
            callback(undefined, value);
          }, 0);
          return true;
        } else {
          return value;
        }
      } // Allow subclasses to massage the input prior to running


      oldString = this.castInput(oldString);
      newString = this.castInput(newString);
      oldString = this.removeEmpty(this.tokenize(oldString));
      newString = this.removeEmpty(this.tokenize(newString));
      var newLen = newString.length,
          oldLen = oldString.length;
      var editLength = 1;
      var maxEditLength = newLen + oldLen;
      var bestPath = [{
        newPos: -1,
        components: []
      }]; // Seed editLength = 0, i.e. the content starts with the same values

      var oldPos = this.extractCommon(bestPath[0], newString, oldString, 0);

      if (bestPath[0].newPos + 1 >= newLen && oldPos + 1 >= oldLen) {
        // Identity per the equality and tokenizer
        return done([{
          value: this.join(newString),
          count: newString.length
        }]);
      } // Main worker method. checks all permutations of a given edit length for acceptance.


      function execEditLength() {
        for (var diagonalPath = -1 * editLength; diagonalPath <= editLength; diagonalPath += 2) {
          var basePath = void 0;

          var addPath = bestPath[diagonalPath - 1],
              removePath = bestPath[diagonalPath + 1],
              _oldPos = (removePath ? removePath.newPos : 0) - diagonalPath;

          if (addPath) {
            // No one else is going to attempt to use this value, clear it
            bestPath[diagonalPath - 1] = undefined;
          }

          var canAdd = addPath && addPath.newPos + 1 < newLen,
              canRemove = removePath && 0 <= _oldPos && _oldPos < oldLen;

          if (!canAdd && !canRemove) {
            // If this path is a terminal then prune
            bestPath[diagonalPath] = undefined;
            continue;
          } // Select the diagonal that we want to branch from. We select the prior
          // path whose position in the new string is the farthest from the origin
          // and does not pass the bounds of the diff graph


          if (!canAdd || canRemove && addPath.newPos < removePath.newPos) {
            basePath = clonePath(removePath);
            self.pushComponent(basePath.components, undefined, true);
          } else {
            basePath = addPath; // No need to clone, we've pulled it from the list

            basePath.newPos++;
            self.pushComponent(basePath.components, true, undefined);
          }

          _oldPos = self.extractCommon(basePath, newString, oldString, diagonalPath); // If we have hit the end of both strings, then we are done

          if (basePath.newPos + 1 >= newLen && _oldPos + 1 >= oldLen) {
            return done(buildValues(self, basePath.components, newString, oldString, self.useLongestToken));
          } else {
            // Otherwise track this path as a potential candidate and continue.
            bestPath[diagonalPath] = basePath;
          }
        }

        editLength++;
      } // Performs the length of edit iteration. Is a bit fugly as this has to support the
      // sync and async mode which is never fun. Loops over execEditLength until a value
      // is produced.


      if (callback) {
        (function exec() {
          setTimeout(function () {
            // This should not happen, but we want to be safe.

            /* istanbul ignore next */
            if (editLength > maxEditLength) {
              return callback();
            }

            if (!execEditLength()) {
              exec();
            }
          }, 0);
        })();
      } else {
        while (editLength <= maxEditLength) {
          var ret = execEditLength();

          if (ret) {
            return ret;
          }
        }
      }
    },
    pushComponent: function pushComponent(components, added, removed) {
      var last = components[components.length - 1];

      if (last && last.added === added && last.removed === removed) {
        // We need to clone here as the component clone operation is just
        // as shallow array clone
        components[components.length - 1] = {
          count: last.count + 1,
          added: added,
          removed: removed
        };
      } else {
        components.push({
          count: 1,
          added: added,
          removed: removed
        });
      }
    },
    extractCommon: function extractCommon(basePath, newString, oldString, diagonalPath) {
      var newLen = newString.length,
          oldLen = oldString.length,
          newPos = basePath.newPos,
          oldPos = newPos - diagonalPath,
          commonCount = 0;

      while (newPos + 1 < newLen && oldPos + 1 < oldLen && this.equals(newString[newPos + 1], oldString[oldPos + 1])) {
        newPos++;
        oldPos++;
        commonCount++;
      }

      if (commonCount) {
        basePath.components.push({
          count: commonCount
        });
      }

      basePath.newPos = newPos;
      return oldPos;
    },
    equals: function equals(left, right) {
      if (this.options.comparator) {
        return this.options.comparator(left, right);
      } else {
        return left === right || this.options.ignoreCase && left.toLowerCase() === right.toLowerCase();
      }
    },
    removeEmpty: function removeEmpty(array) {
      var ret = [];

      for (var i = 0; i < array.length; i++) {
        if (array[i]) {
          ret.push(array[i]);
        }
      }

      return ret;
    },
    castInput: function castInput(value) {
      return value;
    },
    tokenize: function tokenize(value) {
      return value.split('');
    },
    join: function join(chars) {
      return chars.join('');
    }
  };

  function buildValues(diff, components, newString, oldString, useLongestToken) {
    var componentPos = 0,
        componentLen = components.length,
        newPos = 0,
        oldPos = 0;

    for (; componentPos < componentLen; componentPos++) {
      var component = components[componentPos];

      if (!component.removed) {
        if (!component.added && useLongestToken) {
          var value = newString.slice(newPos, newPos + component.count);
          value = value.map(function (value, i) {
            var oldValue = oldString[oldPos + i];
            return oldValue.length > value.length ? oldValue : value;
          });
          component.value = diff.join(value);
        } else {
          component.value = diff.join(newString.slice(newPos, newPos + component.count));
        }

        newPos += component.count; // Common case

        if (!component.added) {
          oldPos += component.count;
        }
      } else {
        component.value = diff.join(oldString.slice(oldPos, oldPos + component.count));
        oldPos += component.count; // Reverse add and remove so removes are output first to match common convention
        // The diffing algorithm is tied to add then remove output and this is the simplest
        // route to get the desired output with minimal overhead.

        if (componentPos && components[componentPos - 1].added) {
          var tmp = components[componentPos - 1];
          components[componentPos - 1] = components[componentPos];
          components[componentPos] = tmp;
        }
      }
    } // Special case handle for when one terminal is ignored (i.e. whitespace).
    // For this case we merge the terminal into the prior string and drop the change.
    // This is only available for string mode.


    var lastComponent = components[componentLen - 1];

    if (componentLen > 1 && typeof lastComponent.value === 'string' && (lastComponent.added || lastComponent.removed) && diff.equals('', lastComponent.value)) {
      components[componentLen - 2].value += lastComponent.value;
      components.pop();
    }

    return components;
  }

  function clonePath(path) {
    return {
      newPos: path.newPos,
      components: path.components.slice(0)
    };
  }

  var characterDiff = new Diff();
  function diffChars(oldStr, newStr, options) {
    return characterDiff.diff(oldStr, newStr, options);
  }

  function generateOptions(options, defaults) {
    if (typeof options === 'function') {
      defaults.callback = options;
    } else if (options) {
      for (var name in options) {
        /* istanbul ignore else */
        if (options.hasOwnProperty(name)) {
          defaults[name] = options[name];
        }
      }
    }

    return defaults;
  }

  //
  // Ranges and exceptions:
  // Latin-1 Supplement, 0080–00FF
  //  - U+00D7  × Multiplication sign
  //  - U+00F7  ÷ Division sign
  // Latin Extended-A, 0100–017F
  // Latin Extended-B, 0180–024F
  // IPA Extensions, 0250–02AF
  // Spacing Modifier Letters, 02B0–02FF
  //  - U+02C7  ˇ &#711;  Caron
  //  - U+02D8  ˘ &#728;  Breve
  //  - U+02D9  ˙ &#729;  Dot Above
  //  - U+02DA  ˚ &#730;  Ring Above
  //  - U+02DB  ˛ &#731;  Ogonek
  //  - U+02DC  ˜ &#732;  Small Tilde
  //  - U+02DD  ˝ &#733;  Double Acute Accent
  // Latin Extended Additional, 1E00–1EFF

  var extendedWordChars = /^[A-Za-z\xC0-\u02C6\u02C8-\u02D7\u02DE-\u02FF\u1E00-\u1EFF]+$/;
  var reWhitespace = /\S/;
  var wordDiff = new Diff();

  wordDiff.equals = function (left, right) {
    if (this.options.ignoreCase) {
      left = left.toLowerCase();
      right = right.toLowerCase();
    }

    return left === right || this.options.ignoreWhitespace && !reWhitespace.test(left) && !reWhitespace.test(right);
  };

  wordDiff.tokenize = function (value) {
    var tokens = value.split(/(\s+|[()[\]{}'"]|\b)/); // Join the boundary splits that we do not consider to be boundaries. This is primarily the extended Latin character set.

    for (var i = 0; i < tokens.length - 1; i++) {
      // If we have an empty string in the next field and we have only word chars before and after, merge
      if (!tokens[i + 1] && tokens[i + 2] && extendedWordChars.test(tokens[i]) && extendedWordChars.test(tokens[i + 2])) {
        tokens[i] += tokens[i + 2];
        tokens.splice(i + 1, 2);
        i--;
      }
    }

    return tokens;
  };

  function diffWords(oldStr, newStr, options) {
    options = generateOptions(options, {
      ignoreWhitespace: true
    });
    return wordDiff.diff(oldStr, newStr, options);
  }
  function diffWordsWithSpace(oldStr, newStr, options) {
    return wordDiff.diff(oldStr, newStr, options);
  }

  var lineDiff = new Diff();

  lineDiff.tokenize = function (value) {
    var retLines = [],
        linesAndNewlines = value.split(/(\n|\r\n)/); // Ignore the final empty token that occurs if the string ends with a new line

    if (!linesAndNewlines[linesAndNewlines.length - 1]) {
      linesAndNewlines.pop();
    } // Merge the content and line separators into single tokens


    for (var i = 0; i < linesAndNewlines.length; i++) {
      var line = linesAndNewlines[i];

      if (i % 2 && !this.options.newlineIsToken) {
        retLines[retLines.length - 1] += line;
      } else {
        if (this.options.ignoreWhitespace) {
          line = line.trim();
        }

        retLines.push(line);
      }
    }

    return retLines;
  };

  function diffLines(oldStr, newStr, callback) {
    return lineDiff.diff(oldStr, newStr, callback);
  }
  function diffTrimmedLines(oldStr, newStr, callback) {
    var options = generateOptions(callback, {
      ignoreWhitespace: true
    });
    return lineDiff.diff(oldStr, newStr, options);
  }

  var sentenceDiff = new Diff();

  sentenceDiff.tokenize = function (value) {
    return value.split(/(\S.+?[.!?])(?=\s+|$)/);
  };

  function diffSentences(oldStr, newStr, callback) {
    return sentenceDiff.diff(oldStr, newStr, callback);
  }

  var cssDiff = new Diff();

  cssDiff.tokenize = function (value) {
    return value.split(/([{}:;,]|\s+)/);
  };

  function diffCss(oldStr, newStr, callback) {
    return cssDiff.diff(oldStr, newStr, callback);
  }

  function _typeof(obj) {
    if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
      _typeof = function (obj) {
        return typeof obj;
      };
    } else {
      _typeof = function (obj) {
        return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
      };
    }

    return _typeof(obj);
  }

  function _toConsumableArray(arr) {
    return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread();
  }

  function _arrayWithoutHoles(arr) {
    if (Array.isArray(arr)) {
      for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) arr2[i] = arr[i];

      return arr2;
    }
  }

  function _iterableToArray(iter) {
    if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter);
  }

  function _nonIterableSpread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance");
  }

  var objectPrototypeToString = Object.prototype.toString;
  var jsonDiff = new Diff(); // Discriminate between two lines of pretty-printed, serialized JSON where one of them has a
  // dangling comma and the other doesn't. Turns out including the dangling comma yields the nicest output:

  jsonDiff.useLongestToken = true;
  jsonDiff.tokenize = lineDiff.tokenize;

  jsonDiff.castInput = function (value) {
    var _this$options = this.options,
        undefinedReplacement = _this$options.undefinedReplacement,
        _this$options$stringi = _this$options.stringifyReplacer,
        stringifyReplacer = _this$options$stringi === void 0 ? function (k, v) {
      return typeof v === 'undefined' ? undefinedReplacement : v;
    } : _this$options$stringi;
    return typeof value === 'string' ? value : JSON.stringify(canonicalize(value, null, null, stringifyReplacer), stringifyReplacer, '  ');
  };

  jsonDiff.equals = function (left, right) {
    return Diff.prototype.equals.call(jsonDiff, left.replace(/,([\r\n])/g, '$1'), right.replace(/,([\r\n])/g, '$1'));
  };

  function diffJson(oldObj, newObj, options) {
    return jsonDiff.diff(oldObj, newObj, options);
  } // This function handles the presence of circular references by bailing out when encountering an
  // object that is already on the "stack" of items being processed. Accepts an optional replacer

  function canonicalize(obj, stack, replacementStack, replacer, key) {
    stack = stack || [];
    replacementStack = replacementStack || [];

    if (replacer) {
      obj = replacer(key, obj);
    }

    var i;

    for (i = 0; i < stack.length; i += 1) {
      if (stack[i] === obj) {
        return replacementStack[i];
      }
    }

    var canonicalizedObj;

    if ('[object Array]' === objectPrototypeToString.call(obj)) {
      stack.push(obj);
      canonicalizedObj = new Array(obj.length);
      replacementStack.push(canonicalizedObj);

      for (i = 0; i < obj.length; i += 1) {
        canonicalizedObj[i] = canonicalize(obj[i], stack, replacementStack, replacer, key);
      }

      stack.pop();
      replacementStack.pop();
      return canonicalizedObj;
    }

    if (obj && obj.toJSON) {
      obj = obj.toJSON();
    }

    if (_typeof(obj) === 'object' && obj !== null) {
      stack.push(obj);
      canonicalizedObj = {};
      replacementStack.push(canonicalizedObj);

      var sortedKeys = [],
          _key;

      for (_key in obj) {
        /* istanbul ignore else */
        if (obj.hasOwnProperty(_key)) {
          sortedKeys.push(_key);
        }
      }

      sortedKeys.sort();

      for (i = 0; i < sortedKeys.length; i += 1) {
        _key = sortedKeys[i];
        canonicalizedObj[_key] = canonicalize(obj[_key], stack, replacementStack, replacer, _key);
      }

      stack.pop();
      replacementStack.pop();
    } else {
      canonicalizedObj = obj;
    }

    return canonicalizedObj;
  }

  var arrayDiff = new Diff();

  arrayDiff.tokenize = function (value) {
    return value.slice();
  };

  arrayDiff.join = arrayDiff.removeEmpty = function (value) {
    return value;
  };

  function diffArrays(oldArr, newArr, callback) {
    return arrayDiff.diff(oldArr, newArr, callback);
  }

  function parsePatch(uniDiff) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var diffstr = uniDiff.split(/\r\n|[\n\v\f\r\x85]/),
        delimiters = uniDiff.match(/\r\n|[\n\v\f\r\x85]/g) || [],
        list = [],
        i = 0;

    function parseIndex() {
      var index = {};
      list.push(index); // Parse diff metadata

      while (i < diffstr.length) {
        var line = diffstr[i]; // File header found, end parsing diff metadata

        if (/^(\-\-\-|\+\+\+|@@)\s/.test(line)) {
          break;
        } // Diff index


        var header = /^(?:Index:|diff(?: -r \w+)+)\s+(.+?)\s*$/.exec(line);

        if (header) {
          index.index = header[1];
        }

        i++;
      } // Parse file headers if they are defined. Unified diff requires them, but
      // there's no technical issues to have an isolated hunk without file header


      parseFileHeader(index);
      parseFileHeader(index); // Parse hunks

      index.hunks = [];

      while (i < diffstr.length) {
        var _line = diffstr[i];

        if (/^(Index:|diff|\-\-\-|\+\+\+)\s/.test(_line)) {
          break;
        } else if (/^@@/.test(_line)) {
          index.hunks.push(parseHunk());
        } else if (_line && options.strict) {
          // Ignore unexpected content unless in strict mode
          throw new Error('Unknown line ' + (i + 1) + ' ' + JSON.stringify(_line));
        } else {
          i++;
        }
      }
    } // Parses the --- and +++ headers, if none are found, no lines
    // are consumed.


    function parseFileHeader(index) {
      var fileHeader = /^(---|\+\+\+)\s+(.*)$/.exec(diffstr[i]);

      if (fileHeader) {
        var keyPrefix = fileHeader[1] === '---' ? 'old' : 'new';
        var data = fileHeader[2].split('\t', 2);
        var fileName = data[0].replace(/\\\\/g, '\\');

        if (/^".*"$/.test(fileName)) {
          fileName = fileName.substr(1, fileName.length - 2);
        }

        index[keyPrefix + 'FileName'] = fileName;
        index[keyPrefix + 'Header'] = (data[1] || '').trim();
        i++;
      }
    } // Parses a hunk
    // This assumes that we are at the start of a hunk.


    function parseHunk() {
      var chunkHeaderIndex = i,
          chunkHeaderLine = diffstr[i++],
          chunkHeader = chunkHeaderLine.split(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      var hunk = {
        oldStart: +chunkHeader[1],
        oldLines: +chunkHeader[2] || 1,
        newStart: +chunkHeader[3],
        newLines: +chunkHeader[4] || 1,
        lines: [],
        linedelimiters: []
      };
      var addCount = 0,
          removeCount = 0;

      for (; i < diffstr.length; i++) {
        // Lines starting with '---' could be mistaken for the "remove line" operation
        // But they could be the header for the next file. Therefore prune such cases out.
        if (diffstr[i].indexOf('--- ') === 0 && i + 2 < diffstr.length && diffstr[i + 1].indexOf('+++ ') === 0 && diffstr[i + 2].indexOf('@@') === 0) {
          break;
        }

        var operation = diffstr[i].length == 0 && i != diffstr.length - 1 ? ' ' : diffstr[i][0];

        if (operation === '+' || operation === '-' || operation === ' ' || operation === '\\') {
          hunk.lines.push(diffstr[i]);
          hunk.linedelimiters.push(delimiters[i] || '\n');

          if (operation === '+') {
            addCount++;
          } else if (operation === '-') {
            removeCount++;
          } else if (operation === ' ') {
            addCount++;
            removeCount++;
          }
        } else {
          break;
        }
      } // Handle the empty block count case


      if (!addCount && hunk.newLines === 1) {
        hunk.newLines = 0;
      }

      if (!removeCount && hunk.oldLines === 1) {
        hunk.oldLines = 0;
      } // Perform optional sanity checking


      if (options.strict) {
        if (addCount !== hunk.newLines) {
          throw new Error('Added line count did not match for hunk at line ' + (chunkHeaderIndex + 1));
        }

        if (removeCount !== hunk.oldLines) {
          throw new Error('Removed line count did not match for hunk at line ' + (chunkHeaderIndex + 1));
        }
      }

      return hunk;
    }

    while (i < diffstr.length) {
      parseIndex();
    }

    return list;
  }

  // Iterator that traverses in the range of [min, max], stepping
  // by distance from a given start position. I.e. for [0, 4], with
  // start of 2, this will iterate 2, 3, 1, 4, 0.
  function distanceIterator (start, minLine, maxLine) {
    var wantForward = true,
        backwardExhausted = false,
        forwardExhausted = false,
        localOffset = 1;
    return function iterator() {
      if (wantForward && !forwardExhausted) {
        if (backwardExhausted) {
          localOffset++;
        } else {
          wantForward = false;
        } // Check if trying to fit beyond text length, and if not, check it fits
        // after offset location (or desired location on first iteration)


        if (start + localOffset <= maxLine) {
          return localOffset;
        }

        forwardExhausted = true;
      }

      if (!backwardExhausted) {
        if (!forwardExhausted) {
          wantForward = true;
        } // Check if trying to fit before text beginning, and if not, check it fits
        // before offset location


        if (minLine <= start - localOffset) {
          return -localOffset++;
        }

        backwardExhausted = true;
        return iterator();
      } // We tried to fit hunk before text beginning and beyond text length, then
      // hunk can't fit on the text. Return undefined

    };
  }

  function applyPatch(source, uniDiff) {
    var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    if (typeof uniDiff === 'string') {
      uniDiff = parsePatch(uniDiff);
    }

    if (Array.isArray(uniDiff)) {
      if (uniDiff.length > 1) {
        throw new Error('applyPatch only works with a single input.');
      }

      uniDiff = uniDiff[0];
    } // Apply the diff to the input


    var lines = source.split(/\r\n|[\n\v\f\r\x85]/),
        delimiters = source.match(/\r\n|[\n\v\f\r\x85]/g) || [],
        hunks = uniDiff.hunks,
        compareLine = options.compareLine || function (lineNumber, line, operation, patchContent) {
      return line === patchContent;
    },
        errorCount = 0,
        fuzzFactor = options.fuzzFactor || 0,
        minLine = 0,
        offset = 0,
        removeEOFNL,
        addEOFNL;
    /**
     * Checks if the hunk exactly fits on the provided location
     */


    function hunkFits(hunk, toPos) {
      for (var j = 0; j < hunk.lines.length; j++) {
        var line = hunk.lines[j],
            operation = line.length > 0 ? line[0] : ' ',
            content = line.length > 0 ? line.substr(1) : line;

        if (operation === ' ' || operation === '-') {
          // Context sanity check
          if (!compareLine(toPos + 1, lines[toPos], operation, content)) {
            errorCount++;

            if (errorCount > fuzzFactor) {
              return false;
            }
          }

          toPos++;
        }
      }

      return true;
    } // Search best fit offsets for each hunk based on the previous ones


    for (var i = 0; i < hunks.length; i++) {
      var hunk = hunks[i],
          maxLine = lines.length - hunk.oldLines,
          localOffset = 0,
          toPos = offset + hunk.oldStart - 1;
      var iterator = distanceIterator(toPos, minLine, maxLine);

      for (; localOffset !== undefined; localOffset = iterator()) {
        if (hunkFits(hunk, toPos + localOffset)) {
          hunk.offset = offset += localOffset;
          break;
        }
      }

      if (localOffset === undefined) {
        return false;
      } // Set lower text limit to end of the current hunk, so next ones don't try
      // to fit over already patched text


      minLine = hunk.offset + hunk.oldStart + hunk.oldLines;
    } // Apply patch hunks


    var diffOffset = 0;

    for (var _i = 0; _i < hunks.length; _i++) {
      var _hunk = hunks[_i],
          _toPos = _hunk.oldStart + _hunk.offset + diffOffset - 1;

      diffOffset += _hunk.newLines - _hunk.oldLines;

      if (_toPos < 0) {
        // Creating a new file
        _toPos = 0;
      }

      for (var j = 0; j < _hunk.lines.length; j++) {
        var line = _hunk.lines[j],
            operation = line.length > 0 ? line[0] : ' ',
            content = line.length > 0 ? line.substr(1) : line,
            delimiter = _hunk.linedelimiters[j];

        if (operation === ' ') {
          _toPos++;
        } else if (operation === '-') {
          lines.splice(_toPos, 1);
          delimiters.splice(_toPos, 1);
          /* istanbul ignore else */
        } else if (operation === '+') {
          lines.splice(_toPos, 0, content);
          delimiters.splice(_toPos, 0, delimiter);
          _toPos++;
        } else if (operation === '\\') {
          var previousOperation = _hunk.lines[j - 1] ? _hunk.lines[j - 1][0] : null;

          if (previousOperation === '+') {
            removeEOFNL = true;
          } else if (previousOperation === '-') {
            addEOFNL = true;
          }
        }
      }
    } // Handle EOFNL insertion/removal


    if (removeEOFNL) {
      while (!lines[lines.length - 1]) {
        lines.pop();
        delimiters.pop();
      }
    } else if (addEOFNL) {
      lines.push('');
      delimiters.push('\n');
    }

    for (var _k = 0; _k < lines.length - 1; _k++) {
      lines[_k] = lines[_k] + delimiters[_k];
    }

    return lines.join('');
  } // Wrapper that supports multiple file patches via callbacks.

  function applyPatches(uniDiff, options) {
    if (typeof uniDiff === 'string') {
      uniDiff = parsePatch(uniDiff);
    }

    var currentIndex = 0;

    function processIndex() {
      var index = uniDiff[currentIndex++];

      if (!index) {
        return options.complete();
      }

      options.loadFile(index, function (err, data) {
        if (err) {
          return options.complete(err);
        }

        var updatedContent = applyPatch(data, index, options);
        options.patched(index, updatedContent, function (err) {
          if (err) {
            return options.complete(err);
          }

          processIndex();
        });
      });
    }

    processIndex();
  }

  function structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
    if (!options) {
      options = {};
    }

    if (typeof options.context === 'undefined') {
      options.context = 4;
    }

    var diff = diffLines(oldStr, newStr, options);
    diff.push({
      value: '',
      lines: []
    }); // Append an empty value to make cleanup easier

    function contextLines(lines) {
      return lines.map(function (entry) {
        return ' ' + entry;
      });
    }

    var hunks = [];
    var oldRangeStart = 0,
        newRangeStart = 0,
        curRange = [],
        oldLine = 1,
        newLine = 1;

    var _loop = function _loop(i) {
      var current = diff[i],
          lines = current.lines || current.value.replace(/\n$/, '').split('\n');
      current.lines = lines;

      if (current.added || current.removed) {
        var _curRange;

        // If we have previous context, start with that
        if (!oldRangeStart) {
          var prev = diff[i - 1];
          oldRangeStart = oldLine;
          newRangeStart = newLine;

          if (prev) {
            curRange = options.context > 0 ? contextLines(prev.lines.slice(-options.context)) : [];
            oldRangeStart -= curRange.length;
            newRangeStart -= curRange.length;
          }
        } // Output our changes


        (_curRange = curRange).push.apply(_curRange, _toConsumableArray(lines.map(function (entry) {
          return (current.added ? '+' : '-') + entry;
        }))); // Track the updated file position


        if (current.added) {
          newLine += lines.length;
        } else {
          oldLine += lines.length;
        }
      } else {
        // Identical context lines. Track line changes
        if (oldRangeStart) {
          // Close out any changes that have been output (or join overlapping)
          if (lines.length <= options.context * 2 && i < diff.length - 2) {
            var _curRange2;

            // Overlapping
            (_curRange2 = curRange).push.apply(_curRange2, _toConsumableArray(contextLines(lines)));
          } else {
            var _curRange3;

            // end the range and output
            var contextSize = Math.min(lines.length, options.context);

            (_curRange3 = curRange).push.apply(_curRange3, _toConsumableArray(contextLines(lines.slice(0, contextSize))));

            var hunk = {
              oldStart: oldRangeStart,
              oldLines: oldLine - oldRangeStart + contextSize,
              newStart: newRangeStart,
              newLines: newLine - newRangeStart + contextSize,
              lines: curRange
            };

            if (i >= diff.length - 2 && lines.length <= options.context) {
              // EOF is inside this hunk
              var oldEOFNewline = /\n$/.test(oldStr);
              var newEOFNewline = /\n$/.test(newStr);
              var noNlBeforeAdds = lines.length == 0 && curRange.length > hunk.oldLines;

              if (!oldEOFNewline && noNlBeforeAdds) {
                // special case: old has no eol and no trailing context; no-nl can end up before adds
                curRange.splice(hunk.oldLines, 0, '\\ No newline at end of file');
              }

              if (!oldEOFNewline && !noNlBeforeAdds || !newEOFNewline) {
                curRange.push('\\ No newline at end of file');
              }
            }

            hunks.push(hunk);
            oldRangeStart = 0;
            newRangeStart = 0;
            curRange = [];
          }
        }

        oldLine += lines.length;
        newLine += lines.length;
      }
    };

    for (var i = 0; i < diff.length; i++) {
      _loop(i);
    }

    return {
      oldFileName: oldFileName,
      newFileName: newFileName,
      oldHeader: oldHeader,
      newHeader: newHeader,
      hunks: hunks
    };
  }
  function createTwoFilesPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
    var diff = structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options);
    var ret = [];

    if (oldFileName == newFileName) {
      ret.push('Index: ' + oldFileName);
    }

    ret.push('===================================================================');
    ret.push('--- ' + diff.oldFileName + (typeof diff.oldHeader === 'undefined' ? '' : '\t' + diff.oldHeader));
    ret.push('+++ ' + diff.newFileName + (typeof diff.newHeader === 'undefined' ? '' : '\t' + diff.newHeader));

    for (var i = 0; i < diff.hunks.length; i++) {
      var hunk = diff.hunks[i];
      ret.push('@@ -' + hunk.oldStart + ',' + hunk.oldLines + ' +' + hunk.newStart + ',' + hunk.newLines + ' @@');
      ret.push.apply(ret, hunk.lines);
    }

    return ret.join('\n') + '\n';
  }
  function createPatch(fileName, oldStr, newStr, oldHeader, newHeader, options) {
    return createTwoFilesPatch(fileName, fileName, oldStr, newStr, oldHeader, newHeader, options);
  }

  function arrayEqual(a, b) {
    if (a.length !== b.length) {
      return false;
    }

    return arrayStartsWith(a, b);
  }
  function arrayStartsWith(array, start) {
    if (start.length > array.length) {
      return false;
    }

    for (var i = 0; i < start.length; i++) {
      if (start[i] !== array[i]) {
        return false;
      }
    }

    return true;
  }

  function calcLineCount(hunk) {
    var _calcOldNewLineCount = calcOldNewLineCount(hunk.lines),
        oldLines = _calcOldNewLineCount.oldLines,
        newLines = _calcOldNewLineCount.newLines;

    if (oldLines !== undefined) {
      hunk.oldLines = oldLines;
    } else {
      delete hunk.oldLines;
    }

    if (newLines !== undefined) {
      hunk.newLines = newLines;
    } else {
      delete hunk.newLines;
    }
  }
  function merge(mine, theirs, base) {
    mine = loadPatch(mine, base);
    theirs = loadPatch(theirs, base);
    var ret = {}; // For index we just let it pass through as it doesn't have any necessary meaning.
    // Leaving sanity checks on this to the API consumer that may know more about the
    // meaning in their own context.

    if (mine.index || theirs.index) {
      ret.index = mine.index || theirs.index;
    }

    if (mine.newFileName || theirs.newFileName) {
      if (!fileNameChanged(mine)) {
        // No header or no change in ours, use theirs (and ours if theirs does not exist)
        ret.oldFileName = theirs.oldFileName || mine.oldFileName;
        ret.newFileName = theirs.newFileName || mine.newFileName;
        ret.oldHeader = theirs.oldHeader || mine.oldHeader;
        ret.newHeader = theirs.newHeader || mine.newHeader;
      } else if (!fileNameChanged(theirs)) {
        // No header or no change in theirs, use ours
        ret.oldFileName = mine.oldFileName;
        ret.newFileName = mine.newFileName;
        ret.oldHeader = mine.oldHeader;
        ret.newHeader = mine.newHeader;
      } else {
        // Both changed... figure it out
        ret.oldFileName = selectField(ret, mine.oldFileName, theirs.oldFileName);
        ret.newFileName = selectField(ret, mine.newFileName, theirs.newFileName);
        ret.oldHeader = selectField(ret, mine.oldHeader, theirs.oldHeader);
        ret.newHeader = selectField(ret, mine.newHeader, theirs.newHeader);
      }
    }

    ret.hunks = [];
    var mineIndex = 0,
        theirsIndex = 0,
        mineOffset = 0,
        theirsOffset = 0;

    while (mineIndex < mine.hunks.length || theirsIndex < theirs.hunks.length) {
      var mineCurrent = mine.hunks[mineIndex] || {
        oldStart: Infinity
      },
          theirsCurrent = theirs.hunks[theirsIndex] || {
        oldStart: Infinity
      };

      if (hunkBefore(mineCurrent, theirsCurrent)) {
        // This patch does not overlap with any of the others, yay.
        ret.hunks.push(cloneHunk(mineCurrent, mineOffset));
        mineIndex++;
        theirsOffset += mineCurrent.newLines - mineCurrent.oldLines;
      } else if (hunkBefore(theirsCurrent, mineCurrent)) {
        // This patch does not overlap with any of the others, yay.
        ret.hunks.push(cloneHunk(theirsCurrent, theirsOffset));
        theirsIndex++;
        mineOffset += theirsCurrent.newLines - theirsCurrent.oldLines;
      } else {
        // Overlap, merge as best we can
        var mergedHunk = {
          oldStart: Math.min(mineCurrent.oldStart, theirsCurrent.oldStart),
          oldLines: 0,
          newStart: Math.min(mineCurrent.newStart + mineOffset, theirsCurrent.oldStart + theirsOffset),
          newLines: 0,
          lines: []
        };
        mergeLines(mergedHunk, mineCurrent.oldStart, mineCurrent.lines, theirsCurrent.oldStart, theirsCurrent.lines);
        theirsIndex++;
        mineIndex++;
        ret.hunks.push(mergedHunk);
      }
    }

    return ret;
  }

  function loadPatch(param, base) {
    if (typeof param === 'string') {
      if (/^@@/m.test(param) || /^Index:/m.test(param)) {
        return parsePatch(param)[0];
      }

      if (!base) {
        throw new Error('Must provide a base reference or pass in a patch');
      }

      return structuredPatch(undefined, undefined, base, param);
    }

    return param;
  }

  function fileNameChanged(patch) {
    return patch.newFileName && patch.newFileName !== patch.oldFileName;
  }

  function selectField(index, mine, theirs) {
    if (mine === theirs) {
      return mine;
    } else {
      index.conflict = true;
      return {
        mine: mine,
        theirs: theirs
      };
    }
  }

  function hunkBefore(test, check) {
    return test.oldStart < check.oldStart && test.oldStart + test.oldLines < check.oldStart;
  }

  function cloneHunk(hunk, offset) {
    return {
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart + offset,
      newLines: hunk.newLines,
      lines: hunk.lines
    };
  }

  function mergeLines(hunk, mineOffset, mineLines, theirOffset, theirLines) {
    // This will generally result in a conflicted hunk, but there are cases where the context
    // is the only overlap where we can successfully merge the content here.
    var mine = {
      offset: mineOffset,
      lines: mineLines,
      index: 0
    },
        their = {
      offset: theirOffset,
      lines: theirLines,
      index: 0
    }; // Handle any leading content

    insertLeading(hunk, mine, their);
    insertLeading(hunk, their, mine); // Now in the overlap content. Scan through and select the best changes from each.

    while (mine.index < mine.lines.length && their.index < their.lines.length) {
      var mineCurrent = mine.lines[mine.index],
          theirCurrent = their.lines[their.index];

      if ((mineCurrent[0] === '-' || mineCurrent[0] === '+') && (theirCurrent[0] === '-' || theirCurrent[0] === '+')) {
        // Both modified ...
        mutualChange(hunk, mine, their);
      } else if (mineCurrent[0] === '+' && theirCurrent[0] === ' ') {
        var _hunk$lines;

        // Mine inserted
        (_hunk$lines = hunk.lines).push.apply(_hunk$lines, _toConsumableArray(collectChange(mine)));
      } else if (theirCurrent[0] === '+' && mineCurrent[0] === ' ') {
        var _hunk$lines2;

        // Theirs inserted
        (_hunk$lines2 = hunk.lines).push.apply(_hunk$lines2, _toConsumableArray(collectChange(their)));
      } else if (mineCurrent[0] === '-' && theirCurrent[0] === ' ') {
        // Mine removed or edited
        removal(hunk, mine, their);
      } else if (theirCurrent[0] === '-' && mineCurrent[0] === ' ') {
        // Their removed or edited
        removal(hunk, their, mine, true);
      } else if (mineCurrent === theirCurrent) {
        // Context identity
        hunk.lines.push(mineCurrent);
        mine.index++;
        their.index++;
      } else {
        // Context mismatch
        conflict(hunk, collectChange(mine), collectChange(their));
      }
    } // Now push anything that may be remaining


    insertTrailing(hunk, mine);
    insertTrailing(hunk, their);
    calcLineCount(hunk);
  }

  function mutualChange(hunk, mine, their) {
    var myChanges = collectChange(mine),
        theirChanges = collectChange(their);

    if (allRemoves(myChanges) && allRemoves(theirChanges)) {
      // Special case for remove changes that are supersets of one another
      if (arrayStartsWith(myChanges, theirChanges) && skipRemoveSuperset(their, myChanges, myChanges.length - theirChanges.length)) {
        var _hunk$lines3;

        (_hunk$lines3 = hunk.lines).push.apply(_hunk$lines3, _toConsumableArray(myChanges));

        return;
      } else if (arrayStartsWith(theirChanges, myChanges) && skipRemoveSuperset(mine, theirChanges, theirChanges.length - myChanges.length)) {
        var _hunk$lines4;

        (_hunk$lines4 = hunk.lines).push.apply(_hunk$lines4, _toConsumableArray(theirChanges));

        return;
      }
    } else if (arrayEqual(myChanges, theirChanges)) {
      var _hunk$lines5;

      (_hunk$lines5 = hunk.lines).push.apply(_hunk$lines5, _toConsumableArray(myChanges));

      return;
    }

    conflict(hunk, myChanges, theirChanges);
  }

  function removal(hunk, mine, their, swap) {
    var myChanges = collectChange(mine),
        theirChanges = collectContext(their, myChanges);

    if (theirChanges.merged) {
      var _hunk$lines6;

      (_hunk$lines6 = hunk.lines).push.apply(_hunk$lines6, _toConsumableArray(theirChanges.merged));
    } else {
      conflict(hunk, swap ? theirChanges : myChanges, swap ? myChanges : theirChanges);
    }
  }

  function conflict(hunk, mine, their) {
    hunk.conflict = true;
    hunk.lines.push({
      conflict: true,
      mine: mine,
      theirs: their
    });
  }

  function insertLeading(hunk, insert, their) {
    while (insert.offset < their.offset && insert.index < insert.lines.length) {
      var line = insert.lines[insert.index++];
      hunk.lines.push(line);
      insert.offset++;
    }
  }

  function insertTrailing(hunk, insert) {
    while (insert.index < insert.lines.length) {
      var line = insert.lines[insert.index++];
      hunk.lines.push(line);
    }
  }

  function collectChange(state) {
    var ret = [],
        operation = state.lines[state.index][0];

    while (state.index < state.lines.length) {
      var line = state.lines[state.index]; // Group additions that are immediately after subtractions and treat them as one "atomic" modify change.

      if (operation === '-' && line[0] === '+') {
        operation = '+';
      }

      if (operation === line[0]) {
        ret.push(line);
        state.index++;
      } else {
        break;
      }
    }

    return ret;
  }

  function collectContext(state, matchChanges) {
    var changes = [],
        merged = [],
        matchIndex = 0,
        contextChanges = false,
        conflicted = false;

    while (matchIndex < matchChanges.length && state.index < state.lines.length) {
      var change = state.lines[state.index],
          match = matchChanges[matchIndex]; // Once we've hit our add, then we are done

      if (match[0] === '+') {
        break;
      }

      contextChanges = contextChanges || change[0] !== ' ';
      merged.push(match);
      matchIndex++; // Consume any additions in the other block as a conflict to attempt
      // to pull in the remaining context after this

      if (change[0] === '+') {
        conflicted = true;

        while (change[0] === '+') {
          changes.push(change);
          change = state.lines[++state.index];
        }
      }

      if (match.substr(1) === change.substr(1)) {
        changes.push(change);
        state.index++;
      } else {
        conflicted = true;
      }
    }

    if ((matchChanges[matchIndex] || '')[0] === '+' && contextChanges) {
      conflicted = true;
    }

    if (conflicted) {
      return changes;
    }

    while (matchIndex < matchChanges.length) {
      merged.push(matchChanges[matchIndex++]);
    }

    return {
      merged: merged,
      changes: changes
    };
  }

  function allRemoves(changes) {
    return changes.reduce(function (prev, change) {
      return prev && change[0] === '-';
    }, true);
  }

  function skipRemoveSuperset(state, removeChanges, delta) {
    for (var i = 0; i < delta; i++) {
      var changeContent = removeChanges[removeChanges.length - delta + i].substr(1);

      if (state.lines[state.index + i] !== ' ' + changeContent) {
        return false;
      }
    }

    state.index += delta;
    return true;
  }

  function calcOldNewLineCount(lines) {
    var oldLines = 0;
    var newLines = 0;
    lines.forEach(function (line) {
      if (typeof line !== 'string') {
        var myCount = calcOldNewLineCount(line.mine);
        var theirCount = calcOldNewLineCount(line.theirs);

        if (oldLines !== undefined) {
          if (myCount.oldLines === theirCount.oldLines) {
            oldLines += myCount.oldLines;
          } else {
            oldLines = undefined;
          }
        }

        if (newLines !== undefined) {
          if (myCount.newLines === theirCount.newLines) {
            newLines += myCount.newLines;
          } else {
            newLines = undefined;
          }
        }
      } else {
        if (newLines !== undefined && (line[0] === '+' || line[0] === ' ')) {
          newLines++;
        }

        if (oldLines !== undefined && (line[0] === '-' || line[0] === ' ')) {
          oldLines++;
        }
      }
    });
    return {
      oldLines: oldLines,
      newLines: newLines
    };
  }

  // See: http://code.google.com/p/google-diff-match-patch/wiki/API
  function convertChangesToDMP(changes) {
    var ret = [],
        change,
        operation;

    for (var i = 0; i < changes.length; i++) {
      change = changes[i];

      if (change.added) {
        operation = 1;
      } else if (change.removed) {
        operation = -1;
      } else {
        operation = 0;
      }

      ret.push([operation, change.value]);
    }

    return ret;
  }

  function convertChangesToXML(changes) {
    var ret = [];

    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];

      if (change.added) {
        ret.push('<ins>');
      } else if (change.removed) {
        ret.push('<del>');
      }

      ret.push(escapeHTML(change.value));

      if (change.added) {
        ret.push('</ins>');
      } else if (change.removed) {
        ret.push('</del>');
      }
    }

    return ret.join('');
  }

  function escapeHTML(s) {
    var n = s;
    n = n.replace(/&/g, '&amp;');
    n = n.replace(/</g, '&lt;');
    n = n.replace(/>/g, '&gt;');
    n = n.replace(/"/g, '&quot;');
    return n;
  }

  /* See LICENSE file for terms of use */

  exports.Diff = Diff;
  exports.diffChars = diffChars;
  exports.diffWords = diffWords;
  exports.diffWordsWithSpace = diffWordsWithSpace;
  exports.diffLines = diffLines;
  exports.diffTrimmedLines = diffTrimmedLines;
  exports.diffSentences = diffSentences;
  exports.diffCss = diffCss;
  exports.diffJson = diffJson;
  exports.diffArrays = diffArrays;
  exports.structuredPatch = structuredPatch;
  exports.createTwoFilesPatch = createTwoFilesPatch;
  exports.createPatch = createPatch;
  exports.applyPatch = applyPatch;
  exports.applyPatches = applyPatches;
  exports.parsePatch = parsePatch;
  exports.merge = merge;
  exports.convertChangesToDMP = convertChangesToDMP;
  exports.convertChangesToXML = convertChangesToXML;
  exports.canonicalize = canonicalize;

  Object.defineProperty(exports, '__esModule', { value: true });

}));

},{}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const docBuilder_1 = require("./docBuilder");
const util_1 = require("./util");
var CommentType;
(function (CommentType) {
    CommentType[CommentType["Leading"] = 0] = "Leading";
    CommentType[CommentType["Trailing"] = 1] = "Trailing";
    CommentType[CommentType["Dangling"] = 2] = "Dangling";
    CommentType[CommentType["DanglingStatement"] = 3] = "DanglingStatement";
})(CommentType || (CommentType = {}));
function getChildrenOfNode(node) {
    const keys = Object.keys(node);
    const children = [];
    function addChild(n) {
        if (n && typeof (n.type) === 'string' && n.type !== 'Comment') {
            let idx;
            for (idx = children.length - 1; idx >= 0; --idx) {
                if (util_1.locStart(children[idx]) <= util_1.locStart(n) &&
                    util_1.locEnd(children[idx]) <= util_1.locEnd(node)) {
                    break;
                }
            }
            children.splice(idx + 1, 0, n);
        }
    }
    ;
    for (const key of keys) {
        const val = node[key];
        if (Array.isArray(val)) {
            val.forEach(addChild);
        }
        else if (val) {
            addChild(val);
        }
    }
    return children;
}
function attachComments(ast, options) {
    for (const comment of ast.comments) {
        decorateComment(ast, comment);
        const precedingNode = comment.precedingNode;
        const enclosingNode = comment.enclosingNode;
        const followingNode = comment.followingNode;
        if (util_1.hasNewLine(options.sourceText, util_1.locStart(comment), { searchBackwards: true })) {
            if (handleStatementsWithNoBodyComments(enclosingNode, comment) ||
                handleFunctionBodyComments(precedingNode, enclosingNode, comment) ||
                handleIfStatementsWithNoBodyComments(precedingNode, enclosingNode, followingNode, comment)) {
            }
            else if (followingNode) {
                addLeadingComment(followingNode, comment);
            }
            else if (precedingNode) {
                addTrailingComment(precedingNode, comment);
            }
            else if (enclosingNode) {
                addDanglingComment(enclosingNode, comment);
            }
            else {
                addDanglingComment(ast, comment);
            }
        }
        else {
            if (handleExpressionBeginComments(precedingNode, enclosingNode, comment) ||
                handleDanglingIfStatementsWithNoBodies(precedingNode, enclosingNode, comment)) {
            }
            else if (precedingNode) {
                addTrailingComment(precedingNode, comment);
            }
            else if (followingNode) {
                addLeadingComment(followingNode, comment);
            }
            else if (enclosingNode) {
                addDanglingComment(enclosingNode, comment);
            }
            else {
                addDanglingComment(ast, comment);
            }
        }
    }
}
exports.attachComments = attachComments;
function injectShebang(ast, options) {
    if (!options.sourceText.startsWith('#!')) {
        return;
    }
    const endLine = options.sourceText.indexOf('\n');
    const raw = options.sourceText.slice(0, endLine);
    const shebang = options.sourceText.slice(2, endLine);
    ast.comments.push({
        type: 'Comment',
        loc: {
            start: {
                line: 1,
                column: 0
            },
            end: {
                line: 1,
                column: endLine
            }
        },
        range: [0, endLine],
        raw,
        value: shebang
    });
}
exports.injectShebang = injectShebang;
function printDanglingComments(path, sameIndent = false) {
    const node = path.getValue();
    if (!node || !node.attachedComments) {
        return '';
    }
    const parts = [];
    path.forEach((commentPath) => {
        const comment = commentPath.getValue();
        if (comment.commentType === CommentType.Dangling) {
            parts.push(comment.raw);
        }
    }, 'attachedComments');
    if (parts.length === 0) {
        return '';
    }
    if (sameIndent) {
        return docBuilder_1.join(docBuilder_1.hardline, parts);
    }
    return docBuilder_1.indent(docBuilder_1.concat([docBuilder_1.hardline, docBuilder_1.join(docBuilder_1.hardline, parts)]));
}
exports.printDanglingComments = printDanglingComments;
function printDanglingStatementComments(path) {
    const node = path.getValue();
    if (!node || !node.attachedComments) {
        return '';
    }
    const parts = [];
    path.forEach((commentPath) => {
        const comment = commentPath.getValue();
        if (comment.commentType === CommentType.DanglingStatement) {
            parts.push(' ');
            parts.push(comment.raw);
        }
    }, 'attachedComments');
    if (parts.length === 0) {
        return '';
    }
    return docBuilder_1.concat(parts);
}
exports.printDanglingStatementComments = printDanglingStatementComments;
function printLeadingComment(path, options) {
    const comment = path.getValue();
    const isBlockComment = comment.raw.startsWith('--[[');
    if (isBlockComment) {
        return docBuilder_1.concat([
            comment.raw,
            util_1.hasNewLine(options.sourceText, util_1.locEnd(comment)) ? docBuilder_1.hardline : ' '
        ]);
    }
    const parts = [];
    parts.push(comment.raw);
    parts.push(docBuilder_1.hardline);
    if (util_1.isNextLineEmpty(options.sourceText, util_1.locEnd(comment))) {
        parts.push(docBuilder_1.hardline);
    }
    return docBuilder_1.concat(parts);
}
function printTrailingComment(path, options) {
    const comment = path.getValue();
    if (util_1.hasNewLine(options.sourceText, util_1.locStart(comment), { searchBackwards: true })) {
        const previousLineEmpty = util_1.isPreviousLineEmpty(options.sourceText, util_1.locStart(comment));
        return docBuilder_1.concat([docBuilder_1.hardline, previousLineEmpty ? docBuilder_1.hardline : '', comment.raw]);
    }
    if (comment.raw.startsWith('--[[')) {
        return docBuilder_1.concat([' ', comment.raw]);
    }
    const parts = [];
    if (util_1.isNextLineEmpty(options.sourceText, util_1.locStart(comment), { searchBackwards: true })) {
        parts.push(docBuilder_1.hardline);
    }
    parts.push(' ');
    parts.push(comment.raw);
    parts.push(docBuilder_1.breakParent);
    return docBuilder_1.lineSuffix(docBuilder_1.concat(parts));
}
function printComments(path, options, print) {
    const node = path.getValue();
    const printed = print(path);
    const comments = node.attachedComments;
    if (!comments || comments.length === 0) {
        return printed;
    }
    const leadingParts = [];
    const trailingParts = [printed];
    path.forEach((commentPath) => {
        const comment = commentPath.getValue();
        const commentType = comment.commentType;
        switch (commentType) {
            case CommentType.Leading:
                leadingParts.push(printLeadingComment(path, options));
                break;
            case CommentType.Trailing:
                trailingParts.push(printTrailingComment(path, options));
                break;
        }
    }, 'attachedComments');
    return docBuilder_1.concat(leadingParts.concat(trailingParts));
}
exports.printComments = printComments;
function decorateComment(node, comment) {
    const childNodes = getChildrenOfNode(node);
    let precedingNode = null;
    let followingNode = null;
    let left = 0;
    let right = childNodes.length;
    while (left < right) {
        const middle = Math.floor((left + right) / 2);
        const childNode = childNodes[middle];
        if (util_1.locStart(childNode) - util_1.locStart(comment) <= 0 &&
            util_1.locEnd(comment) - util_1.locEnd(childNode) <= 0) {
            comment.enclosingNode = childNode;
            decorateComment(childNode, comment);
            return;
        }
        if (util_1.locEnd(childNode) - util_1.locStart(comment) <= 0) {
            precedingNode = childNode;
            left = middle + 1;
            continue;
        }
        if (util_1.locEnd(comment) - util_1.locStart(childNode) <= 0) {
            followingNode = childNode;
            right = middle;
            continue;
        }
    }
    if (precedingNode) {
        comment.precedingNode = precedingNode;
    }
    if (followingNode) {
        comment.followingNode = followingNode;
    }
}
function addComment(node, comment) {
    const comments = node.attachedComments || (node.attachedComments = []);
    comments.push(comment);
}
function addLeadingComment(node, comment) {
    comment.commentType = CommentType.Leading;
    addComment(node, comment);
}
function addDanglingComment(node, comment) {
    comment.commentType = CommentType.Dangling;
    addComment(node, comment);
}
function addDanglingStatementComment(node, comment) {
    comment.commentType = CommentType.DanglingStatement;
    addComment(node, comment);
}
function addTrailingComment(node, comment) {
    comment.commentType = CommentType.Trailing;
    addComment(node, comment);
}
function handleStatementsWithNoBodyComments(enclosingNode, comment) {
    if (!enclosingNode || enclosingNode.body == null) {
        return false;
    }
    if (enclosingNode.body.length === 0) {
        addDanglingComment(enclosingNode, comment);
        return true;
    }
    return false;
}
function handleFunctionBodyComments(precedingNode, enclosingNode, comment) {
    if (!enclosingNode || enclosingNode.type !== 'FunctionDeclaration' || enclosingNode.body.length > 0) {
        return false;
    }
    if (enclosingNode.parameters.length > 0 &&
        enclosingNode.parameters[enclosingNode.parameters.length - 1] === precedingNode) {
        addDanglingComment(enclosingNode, comment);
        return true;
    }
    if (precedingNode && precedingNode.type === 'Identifier') {
        addDanglingComment(enclosingNode, comment);
        return true;
    }
    return false;
}
function handleIfStatementsWithNoBodyComments(precedingNode, enclosingNode, followingNode, comment) {
    if (!enclosingNode || enclosingNode.type !== 'IfStatement') {
        return false;
    }
    if (followingNode && (followingNode.type === 'ElseifClause' || followingNode.type === 'ElseClause')) {
        addDanglingComment(precedingNode, comment);
        return true;
    }
    if (precedingNode && precedingNode.type === 'ElseClause') {
        addDanglingComment(precedingNode, comment);
        return true;
    }
    return false;
}
function handleExpressionBeginComments(precedingNode, enclosingNode, comment) {
    if (comment.raw.startsWith('--[[')) {
        return false;
    }
    if (!enclosingNode) {
        return false;
    }
    switch (enclosingNode.type) {
        case 'WhileStatement':
            if (precedingNode === enclosingNode.condition) {
                addDanglingStatementComment(enclosingNode, comment);
                return true;
            }
            break;
        case 'DoStatement':
        case 'RepeatStatement':
            if (precedingNode == null) {
                addDanglingStatementComment(enclosingNode, comment);
                return true;
            }
            break;
        case 'FunctionDeclaration':
            if ((enclosingNode.parameters.length &&
                precedingNode === enclosingNode.parameters[enclosingNode.parameters.length - 1]) ||
                (precedingNode === enclosingNode.identifier)) {
                addDanglingStatementComment(enclosingNode, comment);
                return true;
            }
            break;
        case 'ForNumericStatement':
            if (precedingNode === enclosingNode.end || precedingNode === enclosingNode.step) {
                addDanglingStatementComment(enclosingNode, comment);
                return true;
            }
            break;
        case 'ForGenericStatement':
            if (precedingNode === enclosingNode.iterators[enclosingNode.iterators.length - 1]) {
                addDanglingStatementComment(enclosingNode, comment);
                return true;
            }
            break;
        case 'IfClause':
        case 'ElseifClause':
            if (precedingNode === enclosingNode.condition &&
                comment.loc.start.column > precedingNode.loc.start.column) {
                addDanglingStatementComment(enclosingNode, comment);
                return true;
            }
            break;
        case 'ElseClause':
            if (precedingNode == null) {
                addDanglingStatementComment(enclosingNode, comment);
                return true;
            }
            break;
    }
    return false;
}
function handleDanglingIfStatementsWithNoBodies(precedingNode, enclosingNode, comment) {
    if (!precedingNode || !enclosingNode) {
        return false;
    }
    if (enclosingNode.type !== 'IfStatement') {
        return false;
    }
    switch (precedingNode.type) {
        case 'IfClause':
        case 'ElseifClause':
        case 'ElseClause':
            if (precedingNode.body.length === 0) {
                addDanglingStatementComment(precedingNode, comment);
                return true;
            }
            break;
    }
    return false;
}

},{"./docBuilder":4,"./util":10}],4:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function concat(parts) {
    return {
        type: 'concat',
        parts
    };
}
exports.concat = concat;
function join(separator, parts) {
    const result = [];
    parts.forEach((val, i) => {
        if (i > 0) {
            result.push(separator);
        }
        result.push(val);
    });
    return concat(result);
}
exports.join = join;
exports.line = {
    type: 'line',
    hard: false,
    soft: false
};
exports.hardline = {
    type: 'line',
    hard: true,
    soft: false
};
exports.softline = {
    type: 'line',
    hard: false,
    soft: true
};
function indent(content) {
    return {
        type: 'indent',
        content
    };
}
exports.indent = indent;
function lineSuffix(content) {
    return {
        type: 'lineSuffix',
        content
    };
}
exports.lineSuffix = lineSuffix;
function group(content, willBreak = false) {
    return {
        type: 'group',
        content,
        willBreak
    };
}
exports.group = group;
exports.breakParent = {
    type: 'breakParent'
};
function isEmpty(instruction) {
    return typeof (instruction) === 'string' && instruction.length === 0;
}
exports.isEmpty = isEmpty;

},{}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Mode;
(function (Mode) {
    Mode[Mode["Flat"] = 0] = "Flat";
    Mode[Mode["Break"] = 1] = "Break";
})(Mode || (Mode = {}));
;
function printDocToString(doc, options) {
    const state = {
        options,
        indentation: 0,
        currentLineLength: 0,
        mode: Mode.Break,
        lineSuffixes: [],
        renderedText: ''
    };
    printDocToStringWithState(doc, state);
    return state.renderedText;
}
exports.printDocToString = printDocToString;
function canFitOnSingleLine(doc, state) {
    function fits(text) {
        if (state.currentLineLength + text.length <= state.options.lineWidth) {
            state.currentLineLength += text.length;
            return true;
        }
        return false;
    }
    if (typeof (doc) === 'string') {
        return fits(doc);
    }
    switch (doc.type) {
        case 'concat':
            return doc.parts.every((part) => canFitOnSingleLine(part, state));
        case 'indent':
            state.indentation++;
            if (canFitOnSingleLine(doc.content, state)) {
                state.indentation--;
                return true;
            }
            state.indentation--;
            return false;
        case 'group':
            if (doc.willBreak) {
                state.mode = Mode.Break;
            }
            return canFitOnSingleLine(doc.content, state);
        case 'line':
            if (state.mode === Mode.Flat) {
                if (!doc.hard) {
                    if (!doc.soft) {
                        return fits(' ');
                    }
                    return true;
                }
            }
            state.currentLineLength = state.indentation;
            return true;
        case 'lineSuffix':
            return true;
    }
    return false;
}
function printDocToStringWithState(doc, state) {
    if (typeof (doc) === 'string') {
        state.renderedText += doc;
        state.currentLineLength += doc.length;
    }
    else {
        switch (doc.type) {
            case 'concat':
                for (const part of doc.parts) {
                    printDocToStringWithState(part, state);
                }
                break;
            case 'line':
                if (state.mode === Mode.Flat) {
                    if (!doc.hard) {
                        if (!doc.soft) {
                            state.renderedText += ' ';
                            state.currentLineLength += 1;
                        }
                        break;
                    }
                }
                if (state.lineSuffixes.length > 0) {
                    const suffixes = [...state.lineSuffixes];
                    state.lineSuffixes.length = 0;
                    for (const suffix of suffixes) {
                        printDocToStringWithState(suffix.content, state);
                    }
                }
                if (state.renderedText.length > 0) {
                    state.renderedText = state.renderedText.replace(/[^\S\n]*$/, '');
                }
                const renderedIndentation = state.options.useTabs
                    ? '\t'.repeat(state.indentation)
                    : ' '.repeat(state.indentation * state.options.indentCount);
                state.renderedText += '\n' + renderedIndentation;
                state.currentLineLength = renderedIndentation.length;
                break;
            case 'indent':
                {
                    state.indentation++;
                    printDocToStringWithState(doc.content, state);
                    state.indentation--;
                    break;
                }
            case 'lineSuffix':
                state.lineSuffixes.push(doc);
                break;
            case 'group':
                const canFit = canFitOnSingleLine(doc, Object.assign({}, state, { mode: Mode.Flat }));
                const oldMode = state.mode;
                if (!doc.willBreak && canFit) {
                    state.mode = Mode.Flat;
                }
                else {
                    state.mode = Mode.Break;
                }
                printDocToStringWithState(doc.content, state);
                state.mode = oldMode;
                break;
        }
    }
}

},{}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function visitInstructions(insn, onEnter, onExit) {
    let abort = false;
    const visitInstruction = (ins) => {
        if (onEnter(ins)) {
            abort = true;
            return;
        }
        if (abort) {
            return;
        }
        if (typeof ins === 'string') {
            return;
        }
        switch (ins.type) {
            case 'concat':
                ins.parts.forEach(visitInstruction);
                break;
            case 'indent':
            case 'group':
            case 'lineSuffix':
                visitInstruction(ins.content);
                break;
        }
        if (onExit) {
            onExit(ins);
        }
    };
    visitInstruction(insn);
}
function any(insn, callback) {
    let result = false;
    visitInstructions(insn, (instruction) => {
        if (callback(instruction)) {
            result = true;
            return true;
        }
        return false;
    });
    return result;
}
function willBreak(insn) {
    return any(insn, (instruction) => {
        if (typeof instruction === 'string') {
            return false;
        }
        switch (instruction.type) {
            case 'line':
                if (instruction.hard) {
                    return true;
                }
                break;
            case 'group':
                if (instruction.willBreak) {
                    return true;
                }
        }
        return false;
    });
}
exports.willBreak = willBreak;
function breakParentGroup(stack) {
    if (stack.length > 0) {
        stack[stack.length - 1].willBreak = true;
    }
}
function propagateBreaks(insn) {
    const groupStack = [];
    visitInstructions(insn, (instruction) => {
        if (typeof instruction === 'string') {
            return false;
        }
        switch (instruction.type) {
            case 'breakParent':
                breakParentGroup(groupStack);
                break;
            case 'group':
                groupStack.push(instruction);
                break;
        }
        return false;
    }, (instruction) => {
        if (typeof instruction === 'string') {
            return false;
        }
        if (instruction.type === 'group') {
            const group = groupStack.pop();
            if (group && group.willBreak) {
                breakParentGroup(groupStack);
            }
        }
        return false;
    });
}
exports.propagateBreaks = propagateBreaks;

},{}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
class FastPath {
    constructor(ast) {
        this.stack = [ast];
    }
    getValue() {
        return this.stack[this.stack.length - 1];
    }
    getNodeAtDepth(depth) {
        for (let i = this.stack.length - 1; i >= 0; i -= 2) {
            const value = this.stack[i];
            if (util_1.isNode(value) && --depth < 0) {
                return value;
            }
        }
        return null;
    }
    getParent(depth = 0) {
        return this.getNodeAtDepth(depth + 1);
    }
    call(callback, field) {
        const node = this.getValue();
        const origLength = this.stack.length;
        this.stack.push(field, node[field]);
        const result = callback(this);
        this.stack.length = origLength;
        return result;
    }
    forEach(callback, field = null) {
        let value = this.getValue();
        const origLength = this.stack.length;
        if (field) {
            value = value[field];
            this.stack.push(value);
        }
        for (let i = 0; i < value.length; ++i) {
            this.stack.push(i, value[i]);
            callback(this, i);
            this.stack.length -= 2;
        }
        this.stack.length = origLength;
    }
    map(callback, field) {
        const node = this.getValue()[field];
        if (!Array.isArray(node)) {
            return [];
        }
        const result = [];
        const origLength = this.stack.length;
        this.stack.push(field, node);
        node.forEach((val, i) => {
            this.stack.push(i, val);
            result.push(callback(this, i));
            this.stack.length -= 2;
        });
        this.stack.length = origLength;
        return result;
    }
    needsParens() {
        const parent = this.getParent();
        const value = this.getValue();
        let inParens = false;
        switch (value.type) {
            case 'FunctionDeclaration':
            case 'Chunk':
            case 'Identifier':
            case 'BooleanLiteral':
            case 'NilLiteral':
            case 'NumericLiteral':
            case 'StringLiteral':
            case 'VarargLiteral':
            case 'TableConstructorExpression':
            case 'BinaryExpression':
            case 'LogicalExpression':
            case 'UnaryExpression':
            case 'MemberExpression':
            case 'IndexExpression':
            case 'CallExpression':
            case 'TableCallExpression':
            case 'StringCallExpression':
                inParens = value.inParens || false;
        }
        if (parent) {
            if (value.type === 'UnaryExpression' && parent.type === 'UnaryExpression') {
                inParens = true;
            }
        }
        return inParens;
    }
}
exports.FastPath = FastPath;

},{"./util":10}],8:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var WriteMode;
(function (WriteMode) {
    WriteMode["StdOut"] = "stdout";
    WriteMode["Replace"] = "replace";
    WriteMode["Diff"] = "diff";
})(WriteMode = exports.WriteMode || (exports.WriteMode = {}));
exports.defaultOptions = {
    sourceText: '',
    lineWidth: 120,
    indentCount: 4,
    useTabs: false,
    linebreakMultipleAssignments: false,
    quotemark: 'double',
    writeMode: WriteMode.StdOut
};
function getStringQuotemark(quotemark) {
    return quotemark === 'single' ? '\'' : '"';
}
exports.getStringQuotemark = getStringQuotemark;
function getAlternativeStringQuotemark(quotemark) {
    return quotemark === 'single' ? '"' : '\'';
}
exports.getAlternativeStringQuotemark = getAlternativeStringQuotemark;

},{}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fastPath_1 = require("./fastPath");
const docBuilder_1 = require("./docBuilder");
const docUtils_1 = require("./docUtils");
const comments_1 = require("./comments");
const util_1 = require("./util");
const options_1 = require("./options");
function printStatementSequence(path, options, print) {
    const printed = [];
    path.forEach((statementPath) => {
        const parts = [print(statementPath)];
        if (util_1.isNextLineEmpty(options.sourceText, util_1.locEnd(statementPath.getValue())) && !isLastStatement(path)) {
            parts.push(docBuilder_1.hardline);
        }
        printed.push(docBuilder_1.concat(parts));
    });
    return docBuilder_1.join(docBuilder_1.hardline, printed);
}
function printIndentedStatementList(path, options, print, field) {
    const printedBody = path.call((bodyPath) => {
        return printStatementSequence(bodyPath, options, print);
    }, field);
    return docBuilder_1.indent(docBuilder_1.concat([docBuilder_1.hardline, printedBody]));
}
function printDanglingStatementComment(path) {
    const comments = path.getValue().attachedComments;
    if (!comments) {
        return '';
    }
    return docBuilder_1.concat([comments_1.printDanglingStatementComments(path), comments_1.printDanglingComments(path)]);
}
function makeStringLiteral(raw, quotemark) {
    const preferredQuoteCharacter = options_1.getStringQuotemark(quotemark);
    const alternativeQuoteCharacter = options_1.getAlternativeStringQuotemark(quotemark === 'single' ? 'single' : 'double');
    const newString = raw.replace(/\\([\s\S])|(['"])/g, (match, escaped, quote) => {
        if (escaped === alternativeQuoteCharacter) {
            return escaped;
        }
        if (quote === preferredQuoteCharacter) {
            return '\\' + quote;
        }
        return match;
    });
    return preferredQuoteCharacter + newString + preferredQuoteCharacter;
}
function printStringLiteral(path, options) {
    const literal = path.getValue();
    if (literal.type !== 'StringLiteral') {
        throw new Error('printStringLiteral: Expected StringLiteral, got ' + literal.type);
    }
    if (literal.raw.startsWith('[[') || literal.raw.startsWith('[=')) {
        return literal.raw;
    }
    const raw = literal.raw.slice(1, -1);
    let preferredQuotemark = options.quotemark;
    const preferredQuoteCharacter = options_1.getStringQuotemark(preferredQuotemark);
    if (raw.includes(preferredQuoteCharacter)) {
        preferredQuotemark = preferredQuotemark === 'single' ? 'double' : 'single';
    }
    return makeStringLiteral(raw, preferredQuotemark);
}
function isLastStatement(path) {
    const parent = path.getParent();
    const node = path.getValue();
    const body = parent.body;
    return body && body[body.length - 1] === node;
}
function printNodeNoParens(path, options, print) {
    const value = path.getValue();
    if (!value) {
        return '';
    }
    const parts = [];
    const node = value;
    switch (node.type) {
        case 'Chunk':
            parts.push(path.call((bodyPath) => {
                return printStatementSequence(bodyPath, options, print);
            }, 'body'));
            parts.push(comments_1.printDanglingComments(path, true));
            if (node.body.length || node.attachedComments) {
                parts.push(docBuilder_1.hardline);
            }
            return docBuilder_1.concat(parts);
        case 'LabelStatement':
            return docBuilder_1.concat(['::', path.call(print, 'label'), '::']);
        case 'GotoStatement':
            return docBuilder_1.concat(['goto ', path.call(print, 'label')]);
        case 'BreakStatement':
            return 'break';
        case 'ReturnStatement':
            parts.push('return');
            if (node.arguments.length > 0) {
                parts.push(' ');
                parts.push(docBuilder_1.join(', ', path.map(print, 'arguments')));
            }
            return docBuilder_1.concat(parts);
        case 'WhileStatement':
            parts.push('while ');
            parts.push(path.call(print, 'condition'));
            parts.push(' do');
            parts.push(printDanglingStatementComment(path));
            if (node.body.length) {
                parts.push(printIndentedStatementList(path, options, print, 'body'));
            }
            parts.push(docBuilder_1.concat([docBuilder_1.hardline, 'end']));
            return docBuilder_1.concat(parts);
        case 'DoStatement':
            parts.push('do');
            parts.push(printDanglingStatementComment(path));
            if (node.body.length) {
                parts.push(printIndentedStatementList(path, options, print, 'body'));
            }
            parts.push(docBuilder_1.concat([docBuilder_1.hardline, 'end']));
            return docBuilder_1.concat(parts);
        case 'RepeatStatement':
            parts.push('repeat');
            parts.push(printDanglingStatementComment(path));
            if (node.body.length) {
                parts.push(printIndentedStatementList(path, options, print, 'body'));
            }
            parts.push(docBuilder_1.concat([docBuilder_1.hardline, 'until ']));
            parts.push(path.call(print, 'condition'));
            return docBuilder_1.concat(parts);
        case 'LocalStatement':
        case 'AssignmentStatement':
            {
                const left = [];
                if (node.type === 'LocalStatement') {
                    left.push('local ');
                }
                const shouldBreak = options.linebreakMultipleAssignments;
                left.push(docBuilder_1.indent(docBuilder_1.join(docBuilder_1.concat([
                    ',',
                    shouldBreak ? docBuilder_1.hardline : docBuilder_1.line
                ]), path.map(print, 'variables'))));
                let operator = '';
                const right = [];
                if (node.init.length) {
                    operator = ' =';
                    if (node.init.length > 1) {
                        right.push(docBuilder_1.indent(docBuilder_1.join(docBuilder_1.concat([',', docBuilder_1.line]), path.map(print, 'init'))));
                    }
                    else {
                        right.push(docBuilder_1.join(docBuilder_1.concat([',', docBuilder_1.line]), path.map(print, 'init')));
                    }
                }
                const canBreakLine = node.init.some(n => n != null &&
                    n.type !== 'TableConstructorExpression' &&
                    n.type !== 'FunctionDeclaration');
                return docBuilder_1.group(docBuilder_1.concat([
                    docBuilder_1.group(docBuilder_1.concat(left)),
                    docBuilder_1.group(docBuilder_1.concat([
                        operator,
                        canBreakLine ? docBuilder_1.indent(docBuilder_1.line) : ' ',
                        docBuilder_1.concat(right)
                    ]))
                ]));
            }
        case 'CallStatement':
            return path.call(print, 'expression');
        case 'FunctionDeclaration':
            if (node.isLocal) {
                parts.push('local ');
            }
            parts.push('function');
            if (node.identifier) {
                parts.push(' ', path.call(print, 'identifier'));
            }
            parts.push(docBuilder_1.concat([
                '(',
                docBuilder_1.group(docBuilder_1.indent(docBuilder_1.concat([
                    docBuilder_1.softline,
                    docBuilder_1.join(docBuilder_1.concat([',', docBuilder_1.line]), path.map(print, 'parameters'))
                ]))),
                ')'
            ]));
            parts.push(printDanglingStatementComment(path));
            if (node.body.length) {
                parts.push(printIndentedStatementList(path, options, print, 'body'));
            }
            parts.push(docBuilder_1.hardline, 'end');
            return docBuilder_1.concat(parts);
        case 'ForNumericStatement':
            parts.push('for ');
            parts.push(path.call(print, 'variable'));
            parts.push(' = ');
            parts.push(path.call(print, 'start'));
            parts.push(', ');
            parts.push(path.call(print, 'end'));
            if (node.step) {
                parts.push(', ');
                parts.push(path.call(print, 'step'));
            }
            parts.push(' do');
            parts.push(printDanglingStatementComment(path));
            if (node.body.length) {
                parts.push(printIndentedStatementList(path, options, print, 'body'));
            }
            parts.push(docBuilder_1.concat([docBuilder_1.hardline, 'end']));
            return docBuilder_1.concat(parts);
        case 'ForGenericStatement':
            parts.push('for ');
            parts.push(docBuilder_1.join(', ', path.map(print, 'variables')));
            parts.push(' in ');
            parts.push(docBuilder_1.join(', ', path.map(print, 'iterators')));
            parts.push(' do');
            parts.push(printDanglingStatementComment(path));
            if (node.body.length) {
                parts.push(printIndentedStatementList(path, options, print, 'body'));
            }
            parts.push(docBuilder_1.concat([docBuilder_1.hardline, 'end']));
            return docBuilder_1.concat(parts);
        case 'IfStatement':
            const printed = [];
            path.forEach((statementPath) => {
                printed.push(print(statementPath));
            }, 'clauses');
            parts.push(docBuilder_1.join(docBuilder_1.hardline, printed));
            parts.push(docBuilder_1.concat([docBuilder_1.hardline, 'end']));
            return docBuilder_1.concat(parts);
        case 'IfClause':
            parts.push(docBuilder_1.concat([
                'if ',
                docBuilder_1.group(docBuilder_1.concat([
                    docBuilder_1.indent(docBuilder_1.concat([
                        docBuilder_1.softline,
                        path.call(print, 'condition')
                    ])),
                    docBuilder_1.softline
                ])),
                ' then'
            ]));
            parts.push(printDanglingStatementComment(path));
            if (node.body.length) {
                parts.push(printIndentedStatementList(path, options, print, 'body'));
            }
            return docBuilder_1.concat(parts);
        case 'ElseifClause':
            parts.push(docBuilder_1.concat([
                'elseif ',
                docBuilder_1.group(docBuilder_1.concat([
                    docBuilder_1.indent(docBuilder_1.concat([
                        docBuilder_1.softline,
                        path.call(print, 'condition')
                    ])),
                    docBuilder_1.softline
                ])),
                ' then'
            ]));
            parts.push(printDanglingStatementComment(path));
            if (node.body.length) {
                parts.push(printIndentedStatementList(path, options, print, 'body'));
            }
            return docBuilder_1.concat(parts);
        case 'ElseClause':
            parts.push('else');
            parts.push(printDanglingStatementComment(path));
            if (node.body.length) {
                parts.push(printIndentedStatementList(path, options, print, 'body'));
            }
            return docBuilder_1.concat(parts);
        case 'BooleanLiteral':
            return node.raw;
        case 'NilLiteral':
            return 'nil';
        case 'NumericLiteral':
            return node.raw;
        case 'StringLiteral':
            return printStringLiteral(path, options);
        case 'VarargLiteral':
            return '...';
        case 'Identifier':
            return node.name;
        case 'BinaryExpression':
        case 'LogicalExpression':
            const parent = path.getParent();
            const shouldGroup = parent.type !== node.type &&
                node.left.type !== node.type &&
                node.right.type !== node.type;
            const right = docBuilder_1.concat([
                node.operator,
                docBuilder_1.line,
                path.call(print, 'right')
            ]);
            return docBuilder_1.group(docBuilder_1.concat([
                path.call(print, 'left'),
                docBuilder_1.indent(docBuilder_1.concat([
                    ' ', shouldGroup ? docBuilder_1.group(right) : right
                ]))
            ]));
        case 'UnaryExpression':
            parts.push(node.operator);
            if (node.operator === 'not') {
                parts.push(' ');
            }
            parts.push(path.call(print, 'argument'));
            return docBuilder_1.concat(parts);
        case 'MemberExpression':
            return docBuilder_1.concat([
                path.call(print, 'base'),
                node.indexer,
                path.call(print, 'identifier')
            ]);
        case 'IndexExpression':
            return docBuilder_1.concat([
                path.call(print, 'base'),
                '[',
                docBuilder_1.group(docBuilder_1.concat([
                    docBuilder_1.indent(docBuilder_1.concat([docBuilder_1.softline, path.call(print, 'index')])),
                    docBuilder_1.softline
                ])),
                ']'
            ]);
        case 'CallExpression':
            const printedCallExpressionArgs = path.map(print, 'arguments');
            return docBuilder_1.concat([
                path.call(print, 'base'),
                docBuilder_1.group(docBuilder_1.concat([
                    '(',
                    docBuilder_1.indent(docBuilder_1.concat([docBuilder_1.softline, docBuilder_1.join(docBuilder_1.concat([',', docBuilder_1.line]), printedCallExpressionArgs)])),
                    docBuilder_1.softline,
                    ')'
                ]), printedCallExpressionArgs.some(docUtils_1.willBreak))
            ]);
        case 'TableCallExpression':
            parts.push(path.call(print, 'base'));
            parts.push(' ');
            parts.push(path.call(print, 'arguments'));
            return docBuilder_1.concat(parts);
        case 'StringCallExpression':
            parts.push(path.call(print, 'base'));
            parts.push(' ');
            parts.push(path.call(print, 'argument'));
            return docBuilder_1.concat(parts);
        case 'TableConstructorExpression':
            if (node.fields.length === 0) {
                return '{}';
            }
            const fields = [];
            let separatorParts = [];
            path.forEach(childPath => {
                fields.push(docBuilder_1.concat(separatorParts));
                fields.push(docBuilder_1.group(print(childPath)));
                separatorParts = [',', docBuilder_1.line];
            }, 'fields');
            const shouldBreak = util_1.hasNewLineInRange(options.sourceText, node.range[0], node.range[1]);
            return docBuilder_1.group(docBuilder_1.concat([
                '{',
                docBuilder_1.indent(docBuilder_1.concat([docBuilder_1.softline, docBuilder_1.concat(fields)])),
                docBuilder_1.softline,
                '}'
            ]), shouldBreak);
        case 'TableKeyString':
            return docBuilder_1.concat([
                path.call(print, 'key'),
                ' = ',
                path.call(print, 'value')
            ]);
        case 'TableKey':
            return docBuilder_1.concat([
                '[', path.call(print, 'key'), ']',
                ' = ',
                path.call(print, 'value')
            ]);
        case 'TableValue':
            return path.call(print, 'value');
    }
    throw new Error('Unhandled AST node: ' + node.type);
}
function printNode(path, options, print) {
    const printed = printNodeNoParens(path, options, print);
    const parts = [];
    const needsParens = path.needsParens();
    if (needsParens) {
        parts.push('(');
    }
    parts.push(printed);
    if (needsParens) {
        parts.push(')');
    }
    return docBuilder_1.concat(parts);
}
function buildDocFromAst(ast, options) {
    const printNodeWithComments = (path) => {
        return comments_1.printComments(path, options, p => printNode(p, options, printNodeWithComments));
    };
    const doc = printNodeWithComments(new fastPath_1.FastPath(ast));
    docUtils_1.propagateBreaks(doc);
    return doc;
}
exports.buildDocFromAst = buildDocFromAst;

},{"./comments":3,"./docBuilder":4,"./docUtils":6,"./fastPath":7,"./options":8,"./util":10}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function locStart(node) {
    return node.range[0];
}
exports.locStart = locStart;
function locEnd(node) {
    return node.range[1];
}
exports.locEnd = locEnd;
function isNode(value) {
    if (!value || typeof (value.type) !== 'string') {
        return false;
    }
    switch (value.type) {
        case 'LabelStatement':
        case 'BreakStatement':
        case 'GotoStatement':
        case 'ReturnStatement':
        case 'IfStatement':
        case 'IfClause':
        case 'ElseifClause':
        case 'ElseClause':
        case 'WhileStatement':
        case 'DoStatement':
        case 'RepeatStatement':
        case 'LocalStatement':
        case 'AssignmentStatement':
        case 'CallStatement':
        case 'FunctionDeclaration':
        case 'ForNumericStatement':
        case 'ForGenericStatement':
        case 'Chunk':
        case 'Identifier':
        case 'BooleanLiteral':
        case 'NilLiteral':
        case 'NumericLiteral':
        case 'StringLiteral':
        case 'VarargLiteral':
        case 'TableKey':
        case 'TableKeyString':
        case 'TableValue':
        case 'TableConstructorExpression':
        case 'BinaryExpression':
        case 'LogicalExpression':
        case 'UnaryExpression':
        case 'MemberExpression':
        case 'IndexExpression':
        case 'CallExpression':
        case 'TableCallExpression':
        case 'StringCallExpression':
        case 'Comment':
            return true;
        default:
            return false;
    }
}
exports.isNode = isNode;
;
function skipOnce(text, idx, sequences, searchOptions = {}) {
    let skipCount = 0;
    sequences.forEach(seq => {
        const searchText = searchOptions.searchBackwards
            ? text.substring(idx - seq.length, idx)
            : text.substring(idx, idx + seq.length);
        if (searchText === seq) {
            skipCount = seq.length;
            return;
        }
    });
    return idx + (searchOptions.searchBackwards ? -skipCount : skipCount);
}
exports.skipOnce = skipOnce;
function skipMany(text, idx, sequences, searchOptions = {}) {
    let oldIdx = null;
    while (oldIdx !== idx) {
        oldIdx = idx;
        idx = skipOnce(text, idx, sequences, searchOptions);
    }
    return idx;
}
exports.skipMany = skipMany;
function skipNewLine(text, idx, searchOptions = {}) {
    return skipOnce(text, idx, ['\n', '\r\n'], searchOptions);
}
exports.skipNewLine = skipNewLine;
function skipSpaces(text, idx, searchOptions = {}) {
    return skipMany(text, idx, [' ', '\t'], searchOptions);
}
exports.skipSpaces = skipSpaces;
function skipToLineEnd(text, idx, searchOptions = {}) {
    return skipMany(text, skipSpaces(text, idx), [';'], searchOptions);
}
exports.skipToLineEnd = skipToLineEnd;
function hasNewLine(text, idx, searchOptions = {}) {
    const endOfLineIdx = skipSpaces(text, idx, searchOptions);
    const nextLineIdx = skipNewLine(text, endOfLineIdx, searchOptions);
    return endOfLineIdx !== nextLineIdx;
}
exports.hasNewLine = hasNewLine;
function hasNewLineInRange(text, start, end) {
    return text.substr(start, end - start).indexOf('\n') !== -1;
}
exports.hasNewLineInRange = hasNewLineInRange;
function isPreviousLineEmpty(text, idx) {
    idx = skipSpaces(text, idx, { searchBackwards: true });
    idx = skipNewLine(text, idx, { searchBackwards: true });
    idx = skipSpaces(text, idx, { searchBackwards: true });
    const previousLine = skipNewLine(text, idx, { searchBackwards: true });
    return idx !== previousLine;
}
exports.isPreviousLineEmpty = isPreviousLineEmpty;
function skipTrailingComment(text, idx) {
    if (text.charAt(idx) === '-' && text.charAt(idx + 1) === '-') {
        idx += 2;
        while (idx >= 0 && idx < text.length) {
            if (text.charAt(idx) === '\n') {
                return idx;
            }
            if (text.charAt(idx) === '\r' && text.charAt(idx + 1) === '\n') {
                return idx;
            }
            idx++;
        }
    }
    return idx;
}
exports.skipTrailingComment = skipTrailingComment;
function isNextLineEmpty(text, idx, searchOptions = {
    searchBackwards: false
}) {
    idx = skipToLineEnd(text, idx, searchOptions);
    let oldIdx = null;
    while (idx !== oldIdx) {
        oldIdx = idx;
        idx = skipSpaces(text, idx, searchOptions);
    }
    idx = skipTrailingComment(text, idx);
    idx = skipNewLine(text, idx, searchOptions);
    return hasNewLine(text, idx);
}
exports.isNextLineEmpty = isNextLineEmpty;

},{}],"lua-fmt-ext":[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const comments_1 = require("./comments");
const printer_1 = require("./printer");
const docPrinter_1 = require("./docPrinter");
const options_1 = require("./options");
const luaparse_1 = require("@bilabila/luaparse");
const diff_1 = require("diff");
var options_2 = require("./options");
exports.defaultOptions = options_2.defaultOptions;
exports.WriteMode = options_2.WriteMode;
function formatText(text, userOptions) {
    const ast = luaparse_1.parse(text, {
        comments: true,
        locations: true,
        ranges: true,
        luaVersion: '5.3',
        extendedIdentifiers: true
    });
    ast.range[0] = 0;
    ast.range[1] = text.length;
    const mergedOptions = Object.assign({}, options_1.defaultOptions, userOptions);
    const options = Object.assign({}, mergedOptions, { sourceText: text });
    comments_1.injectShebang(ast, options);
    comments_1.attachComments(ast, options);
    const doc = printer_1.buildDocFromAst(ast, options);
    const formattedText = docPrinter_1.printDocToString(doc, options);
    return formattedText;
}
exports.formatText = formatText;
function producePatch(filename, originalDocument, formattedDocument) {
    return diff_1.createPatch(filename, originalDocument, formattedDocument, 'original', 'formatted');
}
exports.producePatch = producePatch;

},{"./comments":3,"./docPrinter":5,"./options":8,"./printer":9,"@bilabila/luaparse":1,"diff":2}]},{},[]);
