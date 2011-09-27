
/*!
 * socket.io-node
 * Copyright(c) 2011 Iris Couch <us@iriscouch.com>
 * MIT Licensed
 */

/**
 * Module requirements.
 */

var qs = require('querystring')
  , URL = require('url')
  , assert = require('assert')
  , parser = require('../parser')
  , follow = require('follow')
  , request = require('request')
  , Transport = require('../transport')
  , EventEmitter = process.EventEmitter
  ;

var util = require('util')
  , puts = util.puts
  , I = util.inspect
  ;

/**
 * Export the constructor.
 */

exports = module.exports = CouchDB;

/**
 * CouchDB interface constructor.
 *
 * @api public
 */

function CouchDB (mng, data, req) {
  // Establish the CouchDB monitor.
  var self = this;

  self.client = new Client();
  self.client.on('data', function(packet) {
    puts("DATA: " + I(packet));
    self.onMessage(parser.decodePacket(packet));
  });
  self.client.on('ping', function() {
    puts("PING for " + self.id);
    self.client.write('\u008a\u0000');
  });
  self.client.on('close', function() {
    puts('CLOSE for ' + self.id);
    self.end();
  });
  self.client.on('error', function(reason) {
    self.log.warn(self.name + ' client error: ' + reason);
    self.end();
  });

  Transport.call(this, mng, data, req);
};

/**
 * Inherits from Transport.
 */

CouchDB.prototype.__proto__ = Transport.prototype;

/**
 * Transport name
 *
 * @api public
 */

CouchDB.prototype.name = 'couchdb';

/**
 * Listens for new configuration changes of the Manager
 * this way we can connect to the correct couch.
 *
 * @param {Manager} Manager instance.
 * @api private
 */

var server;

CouchDB.init = function (manager) {
  puts('COUCHDB init');
  var subkeys = ['url', 'username', 'password', 'resource'];
  subkeys.forEach(function(subkey) {
    manager.on('set:couchdb '+subkey, function(value, key) {
      if(using_couch() && server && server[subkey] !== value) {
        manager.log.debug('Reconnecting to CouchDB for config change: ' + key);
        connect();
      }
    })
  })

  manager.on('set:transports', function(value, key) {
    if(server && !using_couch())
      server.close();
    else if(!server && using_couch())
      connect();
  })

  if(using_couch())
    connect();

  function using_couch() {
    return !!~ manager.get('transports').indexOf('couchdb');
  }

  function connect() {
    if(server)
      server.close();

    server = new Server({
        'url'     : manager.get('couchdb url')
      , 'username': manager.get('couchdb username')
      , 'password': manager.get('couchdb password')
      , 'resource': manager.get('couchdb resource')
      , 'log'     : manager.log
      });

    server.start(function(er) {
      if(er)
        throw er;
    });
  }
};

/**
 * Called when the socket connects.
 *
 * @api private
 */

CouchDB.prototype.onSocketConnect = function() {
  var self = this;

  puts('SOCKETCONNECT: ' + self.id);

  this.socket.on('data', function (data) {
    self.parser.add(data);
  });
};

/**
 * Writes to the socket.
 *
 * @api private
 */

CouchDB.prototype.write = function (data) {
  puts("WRITE: " + I(data));
  throw new Error("Not implemented: write " + this.id);
  if (this.open) {
    //this.socket.write(buf, 'binary');
    //this.log.debug(this.name + ' writing', data);
  }
};

/**
 * Writes a payload.
 *
 * @api private
 */

CouchDB.prototype.payload = function (msgs) {
  for (var i = 0, l = msgs.length; i < l; i++) {
    this.write(msgs[i]);
  }

  return this;
};

/**
 * Closes the connection.
 *
 * @api private
 */

CouchDB.prototype.doClose = function () {
  throw new Error("Not implemented: doClose");
};



/**
 * Frames data prior to write.
 *
 * @api private
 */

CouchDB.prototype.doWrite = function (data) {
  HTTPPolling.prototype.doWrite.call(this);

  var origin = this.req.headers.origin
    , headers = {
          'Content-Type': 'text/plain; charset=UTF-8'
        , 'Content-Length': data === undefined ? 0 : Buffer.byteLength(data)
        , 'Connection': 'Keep-Alive'
      };

  if (origin) {
    // https://developer.mozilla.org/En/HTTP_Access_Control
    headers['Access-Control-Allow-Origin'] = '*';

    if (this.req.headers.cookie) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
  }

  this.response.writeHead(200, headers);
  this.response.write(data);
  this.log.debug(this.name + ' writing', data);
};

/**
 * Handles a request.
 *
 * @api private
 */

CouchDB.prototype.handleRequest = function (req) {
  this.log.debug([ this.name
                 , this.id
                 , req.method
                 , req.url
                 ].join(' '));

  if (req.method != 'GET') {
    req.res.writeHead(400, {'Content-Length': 1});
    return req.res.end('0');
  }

  if (req.method == 'GET') {
    this.response = req.res;
    return Transport.protot
  }
};


/** CouchDB server
 *
 * @api private
 */

function Server (opts) {
  var self = this;
  EventEmitter.call(self);

  for (var key in opts)
    self[key] = opts[key];
}

/**
 * Inherits from EventEmitter.
 */

Server.prototype.__proto__ = EventEmitter.prototype;

/**
 * Make an HTTP request to a path on the CouchDB server.
 *
 * @api private
 */

Server.prototype.req = function(opts, callback) {
  var self = this;
  assert.equal('function', typeof callback, 'Need callback parameter');

  if(typeof opts === 'string')
    opts = {'uri':opts};

  opts = JSON.parse(JSON.stringify(opts));
  opts.headers = opts.headers || {};
  opts.headers.accept = opts.headers.accept || 'application/json';

  if(opts.method !== 'GET')
    opts.headers['content-type'] = 'application/json';

  var method = opts.method || 'GET';
  var path   = opts.uri || opts.url || '/';

  delete opts.uri;
  delete opts.url;
  opts.uri = self.url.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');

  self.log.debug(method + ' ' + opts.uri);
  return request(opts, function(er, resp, body) {
    if(!er) {
      try             { body = JSON.parse(body)  }
      catch (json_er) { return callback(json_er) }
    }

    var key;
    if((resp.statusCode < 200 || resp.statusCode > 299) && body.error) {
      er = new Error('CouchDB request error: ' + body.error);
      for (var key in body)
        er[key] = body[key];
      return callback(er);
    }

    return callback(er, resp, body);
  })
};

/**
 * Start watching the CouchDB server.
 *
 * @api public
 */

Server.prototype.start = function(callback) {
  var self = this;

  assert.equal('string', typeof self.url     , 'Required option: url');
  assert.equal('string', typeof self.username, 'Required option: username');
  assert.equal('string', typeof self.password, 'Required option: password');
  assert.equal('string', typeof self.resource, 'Required option: resource');

  self.log = self.log || function(msg) { console.log(msg) };

  var url = URL.parse(self.url);
  delete url.host;
  delete url.auth;
  if(self.username !== '' && self.password !== '')
    url.auth = self.username + ':' + self.password;
  self.url = URL.format(url);

  self.log.debug('Confirming CouchDB');
  self.req('/', function(er, resp, body) {
    if(er)
      return callback(er);

    if(body.couchdb !== 'Welcome')
      retur callback(new Error('Cannot confirm CouchDB server: ' + self.url));

    self.log.debug('Confirming CouchDB admin credentials');
    self.req('/_session', function(er, resp, body) {
      if(er)
        return callback(er);

      if(!~ body.userCtx.roles.indexOf('_admin'))
        return callback(new Error('Must be CouchDB server admin'));

      self.prep(function(er) {
        if(er)
          return callback(er);
        self.listen(callback);
      })
    })
  })
};

/**
 * Prepare the resource to accept connection requests.
 *
 * @api private
 */

Server.prototype.prep = function(callback) {
  var self = this;
  self.log.debug('Preparing CouchDB socket.io resource');

  self.req({method:'PUT', uri:self.resource}, function(er, resp, body) {
    if(er && er.error !== 'file_exists')
      return callback(er);

    if(er.error === 'file_exists')
      self.log.debug('CouchDB resource already exists');

    var ddoc = { "_id": "_design/socket_io_server" };

    var url = self.resource + '/' + ddoc._id;
    self.req(url, function(er, resp, body) {
      if(er && er.error !== 'not_found')
        return callback(er);
      else if(er && er.error === 'not_found')
        delete ddoc._rev;
      else
        ddoc._rev = body._rev;

      ddoc.validate_doc_update = server_validator.toString();

      var req = {method:'PUT', uri:url, body:JSON.stringify(ddoc)};
      self.req(req, function(er, resp, body) {
        if(er)
          return callback(er);
        self.log.debug('CouchDB socket.io resource prepared');

        ddoc._rev = body.rev;
        return callback();
      })
    })
  })
};

/**
 * Listen for connection requests.
 *
 * @api private
 */

Server.prototype.listen = function(callback) {
  var self = this;
  self.log.debug('Listening for CouchDB connections');

  // TODO
};

/**
 * Data validator for the public connection DB
 *
 * Example document:
 * { "_id": "socket.io/1/$uuid"
 * , "state": "opening"
 * , "members": {"names": ["jhs"]}
 * , "created_at": "2011-09-27T01:11:01.098Z"
 * , "updated_at": "2011-09-27T01:11:01.098Z"
 * }
 */

var server_validator = function(newDoc, oldDoc, userCtx, secObj) {
  var id_re = /^socket\.io\/1\/([0-9a-f]{32})$/;
  var ts_re = /^(\d\d\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)\.(\d\d\d)Z$/;

  assert_re(id_re, newDoc._id, 'Bad document ID: ' + newDoc._id);
  assert_re(ts_re, newDoc.created_at,
            'Bad create timestamp: ' + newDoc.created_at);
  assert_re(ts_re, newDoc.updated_at,
            'Bad update timestamp: ' + newDoc.updated_at);

  var good_fields = [ '_id'
                    , '_rev'
                    , 'state'
                    , 'members'
                    , 'updated_at'
                    , 'created_at'
                    ];

  for (var key in newDoc)
    assert_ok(~ good_fields.indexOf(key), 'Invalid field: ' + key);

  var created_at, updated_at;
  try       { created_at = JSON.parse(newDoc.created_at)          }
  catch (e) { thr0w('Bad create timestamp: ' + newDoc.created_at) }
  try       { updated_at = JSON.parse(newDoc.updated_at)          }
  catch (e) { thr0w('Bad update timestamp: ' + newDoc.updated_at) }

  if(oldDoc)
    assert_ok(updated_at > created_at,
              'Create timestamp must precede update timestamp');
  else
    assert_eq(oldDoc.created_at, newDoc.created_at,
              'Create and update timestamps must match');

  var members = newDoc.members || {};
  members.names = members.names || [];
  members.roles = members.roles || [];

  assert_ok(members.names.length <= 1, 'Invalid members.names');
  if(members.names.length > 0)
    assert_eq(userCtx.name, members.names[0],
              'Member name must be you: ' + userCtx.name);

  var i, role;
  for(var i = 0; i < members.roles.length; i++) {
    role = members.roles[i];
    assert_ok(~ userCtx.roles.indexOf(role),
              'You must have role "'+role+'" to set members.roles');
  }

  //var good_states = ["opening", "open", "closing", "closed"];
  if(!oldDoc)
    assert_eq('opening', newDoc.state,
                 'New doc state must be "opening"');

  //
  // Utilities
  //

  function assert_ok(val, str) {
    if(!val)
      thr0w(str);
  }

  function assert_eq(expected, val, str) {
    assert_ok(expected === val, str);
  }

  function assert_re(expected, val, str) {
    var match = val.match(expected);
    assert_ok(match, str);
    return match;
  }

  function thr0w(message) {
    throw {"forbidden": message || "Invalid update"};
  }
};

/**
 * CouchDB client
 *
 * @api public
 */
 
function Client () {
  var self = this;
  EventEmitter.call(self);

  this.state = {
    activeFragmentedOperation: null,
    lastFragment: false,
    masked: false,
    opcode: 0
  };
  this.overflow = null;
  this.expectOffset = 0;
  this.expectBuffer = null;
  this.expectHandler = null;
  this.currentMessage = '';

  var self = this;  
  this.opcodeHandlers = {
    // text
    '1': function(data) {
      var finish = function(mask, data) {
        self.currentMessage += self.unmask(mask, data);
        if (self.state.lastFragment) {
          self.emit('data', self.currentMessage);
          self.currentMessage = '';
        }
        self.endPacket();
      }

      var expectData = function(length) {
        if (self.state.masked) {
          self.expect('Mask', 4, function(data) {
            var mask = data;
            self.expect('Data', length, function(data) {
              finish(mask, data);
            });
          });
        }
        else {
          self.expect('Data', length, function(data) { 
            finish(null, data);
          });
        } 
      }

      // decode length
      var firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        expectData(firstLength);
      }
      else if (firstLength == 126) {
        self.expect('Length', 2, function(data) {
          expectData(util.unpack(data));
        });
      }
      else if (firstLength == 127) {
        self.expect('Length', 8, function(data) {
          if (util.unpack(data.slice(0, 4)) != 0) {
            self.error('packets with length spanning more than 32 bit is currently not supported');
            return;
          }
          var lengthBytes = data.slice(4); // note: cap to 32 bit length
          expectData(util.unpack(data));
        });
      }      
    },
    // close
    '8': function(data) {
      self.emit('close');
      self.reset();
    },
    // ping
    '9': function(data) {
      if (self.state.lastFragment == false) {
        self.error('fragmented ping is not supported');
        return;
      }
      
      var finish = function(mask, data) {
        self.emit('ping', self.unmask(mask, data));
        self.endPacket();
      }

      var expectData = function(length) {
        if (self.state.masked) {
          self.expect('Mask', 4, function(data) {
            var mask = data;
            self.expect('Data', length, function(data) {
              finish(mask, data);
            });
          });
        }
        else {
          self.expect('Data', length, function(data) { 
            finish(null, data);
          });
        } 
      }

      // decode length
      var firstLength = data[1] & 0x7f;
      if (firstLength == 0) {
        finish(null, null);        
      }
      else if (firstLength < 126) {
        expectData(firstLength);
      }
      else if (firstLength == 126) {
        self.expect('Length', 2, function(data) {
          expectData(util.unpack(data));
        });
      }
      else if (firstLength == 127) {
        self.expect('Length', 8, function(data) {
          expectData(util.unpack(data));
        });
      }      
    }
  }

  this.expect('Opcode', 2, this.processPacket);  
};

/**
 * Inherits from EventEmitter.
 */

Client.prototype.__proto__ = EventEmitter.prototype;

if(false) {

/**
 * Add new data to the parser.
 *
 * @api public
 */

Parser.prototype.add = function(data) {
  if (this.expectBuffer == null) {
    this.addToOverflow(data);
    return;
  }
  var toRead = Math.min(data.length, this.expectBuffer.length - this.expectOffset);
  data.copy(this.expectBuffer, this.expectOffset, 0, toRead);
  this.expectOffset += toRead;
  if (toRead < data.length) {
    // at this point the overflow buffer shouldn't at all exist
    this.overflow = new Buffer(data.length - toRead);
    data.copy(this.overflow, 0, toRead, toRead + this.overflow.length);
  }
  if (this.expectOffset == this.expectBuffer.length) {
    var bufferForHandler = this.expectBuffer;
    this.expectBuffer = null;
    this.expectOffset = 0;
    this.expectHandler.call(this, bufferForHandler);
  }
}

/**
 * Adds a piece of data to the overflow.
 *
 * @api private
 */

Parser.prototype.addToOverflow = function(data) {
  if (this.overflow == null) this.overflow = data;
  else {
    var prevOverflow = this.overflow;
    this.overflow = new Buffer(this.overflow.length + data.length);
    prevOverflow.copy(this.overflow, 0);
    data.copy(this.overflow, prevOverflow.length);
  }  
}

/**
 * Waits for a certain amount of bytes to be available, then fires a callback.
 *
 * @api private
 */

Parser.prototype.expect = function(what, length, handler) {
  this.expectBuffer = new Buffer(length);
  this.expectOffset = 0;
  this.expectHandler = handler;
  if (this.overflow != null) {
    var toOverflow = this.overflow;
    this.overflow = null;
    this.add(toOverflow);
  }
}

/**
 * Start processing a new packet.
 *
 * @api private
 */

Parser.prototype.processPacket = function (data) {
  if ((data[0] & 0x70) != 0) this.error('reserved fields not empty');
  this.state.lastFragment = (data[0] & 0x80) == 0x80; 
  this.state.masked = (data[1] & 0x80) == 0x80;
  var opcode = data[0] & 0xf;
  if (opcode == 0) {
    // continuation frame
    if (this.state.opcode != 1 || this.state.opcode != 2) {
      this.error('continuation frame cannot follow current opcode')
      return;
    }
  }
  else this.state.opcode = opcode;
  this.state.opcode = data[0] & 0xf;
  var handler = this.opcodeHandlers[this.state.opcode];
  if (typeof handler == 'undefined') this.error('no handler for opcode ' + this.state.opcode);
  else handler(data);
}

/**
 * Endprocessing a packet.
 *
 * @api private
 */

Parser.prototype.endPacket = function() {
  this.expectOffset = 0;
  this.expectBuffer = null;
  this.expectHandler = null;
  if (this.state.lastFragment && this.state.opcode == this.state.activeFragmentedOperation) {
    // end current fragmented operation
    this.state.activeFragmentedOperation = null;
  }
  this.state.lastFragment = false;
  this.state.opcode = this.state.activeFragmentedOperation != null ? this.state.activeFragmentedOperation : 0;
  this.state.masked = false;
  this.expect('Opcode', 2, this.processPacket);  
}

/**
 * Reset the parser state.
 *
 * @api private
 */

Parser.prototype.reset = function() {
  this.state = {
    activeFragmentedOperation: null,
    lastFragment: false,
    masked: false,
    opcode: 0
  };
  this.expectOffset = 0;
  this.expectBuffer = null;
  this.expectHandler = null;
  this.overflow = null;
  this.currentMessage = '';
}

/**
 * Unmask received data.
 *
 * @api private
 */

Parser.prototype.unmask = function (mask, buf) {
  if (mask != null) {
    for (var i = 0, ll = buf.length; i < ll; i++) {
      buf[i] ^= mask[i % 4];
    }    
  }
  return buf != null ? buf.toString('utf8') : '';
}

/**
 * Handles an error
 *
 * @api private
 */

Parser.prototype.error = function (reason) {
  this.reset();
  this.emit('error', reason);
  return this;
};

} // if false
