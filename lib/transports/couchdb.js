
/*!
 * socket.io-node
 * Copyright(c) 2011 Iris Couch <us@iriscouch.com>
 * MIT Licensed
 */

/**
 * Module requirements.
 */

var HTTPPolling = require('./http-polling');

/**
 * Export the constructor.
 */

exports = module.exports = CouchDB;

/**
 * Ajax polling transport.
 *
 * @api public
 */

function CouchDB (mng, data, req) {
  HTTPPolling.call(this, mng, data, req);
};

/**
 * Inherits from Transport.
 */

CouchDB.prototype.__proto__ = HTTPPolling.prototype;

/**
 * Transport name
 *
 * @api public
 */

CouchDB.prototype.name = 'couchdb';

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
