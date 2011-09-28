# CouchDB Transport for Socket.IO

The CouchDB transport allows Socket.IO applications to run directly against CouchDB rather than a NodeJS server.

With only a config change, Socket.IO browsers and servers communite *indirectly* through CouchDB rather than *directly* through TCP (HTTP, websockets, whatever).

## Why?

This is the traditional 3-tier web architecture:

    Browser <-->        <--> NodeJS client to some web API
    Browser <--> NodeJS <--> NodeJS client to some database
    Browser <-->        <--> NodeJS client to SMTP gateway

I think we all see the problem here. Your NodeJS code had better get it right, or there will be Hell to pay!

This is the more modern, more robust, 2.1-tier Couch app architecture:

    Browser <-->         <--> Ruby devop maintenance (cron)
    iOS app <--> CouchDB <--> NodeJS realtime event handling
    Mac app <-->         <--> Java search engine, ElasticSearch

CouchDB is a *domain-specific database*. It is inconvenient for most things but very good at a few things:

1. Being up all the time
1. Being simple (HTTP, JSON, Javascript)
1. Being event-driven

Me, I want my application's linchpin to be simple, highly-available, and event-oriented. Then I can build complex features on that substrate. The *application core* is the database state and browser. When peripheral components fail, the user experience is a downgrad rather than a disaster.

In other words, a 2.1-tier Couch app is a [SLEEP][syncable]y architecture (Syncable Lightweight Event-Emitting Persistence).

[syncable]: http://syncable.org/

## Known Issues

Two more dependencies: `request` and `follow`.

socket.io is still listening on a port even though it needn't if the only transport is couchdb.

Not hooking into the `authorization` callback.

The `/1` couch attachment to simulate a handshake is a bit crazy. It also duplicates some manager code to produce the handshake string.

I had to modify `Socket.prototype.handshake` and add special handling just for the couchdb transport. That seems wrong. In general, it seems `transports` would either be *only* couchdb, or else never include CouchDB.
