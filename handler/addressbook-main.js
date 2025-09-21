// XML parsing temporarily disabled
var xh = require("../libs/xmlhelper");
var redis = require('../libs/redis');
var VCARDS = require('../libs/db').VCARDS;
var ADDRESSBOOKS = require('../libs/db').ADDRESSBOOKS;
var ADDRESSBOOKCHANGES = require('../libs/db').ADDRESSBOOKCHANGES;
var addressbookRead = require('./addressbook-read');
var addressbookDel = require('./addressbook-del');
var addressbookMove = require('./addressbook-move');
module.exports = {
    propfind: addressbookRead.propfind,
    proppatch: proppatch,
    report: addressbookRead.report,
    options: options,
    put: put,
    get: addressbookRead.gett,
    delete: addressbookDel.del,
    move: addressbookMove.move
};
function put(comm)
{
    LSE_Logger.debug(`[Fennel-NG CardDAV] addressbook.put called`);
    var vcardUri = comm.getFilenameFromPath(false);
    var addressbookUri = comm.getPathElement(3);
    var username = comm.getUser().getUserName();
    var body = comm.getReqBody();
    var match = body.search(/X-ADDRESSBOOKSERVER-KIND:group/);
    var isGroup = (match >= 0);
    LSE_Logger.debug(`[Fennel-NG CardDAV] Putting vCard: ${vcardUri} to addressbook: ${addressbookUri}, isGroup: ${isGroup}`);
    ADDRESSBOOKS.findOne({ where: {principaluri: 'principals/' + username, uri: addressbookUri} }).then(function(adb)
    {
        if(!adb)
        {
            LSE_Logger.warn(`[Fennel-NG CardDAV] Addressbook not found: ${addressbookUri}`);
            comm.setResponseCode(404);
            comm.flushResponse();
            return;
        }
        var ifNoneMatch = comm.getHeader('If-None-Match');
        var now = Math.floor(Date.now() / 1000);
        var etag = generateETag(body);
        var size = Buffer.byteLength(body, 'utf8');
        var defaults = {
            addressbookid: adb.id,
            carddata: body,
            uri: vcardUri,
            lastmodified: now,
            etag: etag,
            size: size
        };
        return VCARDS.findOne({ where: {addressbookid: adb.id, uri: vcardUri}}).then(function(existingVCard)
        {
            if(existingVCard && ifNoneMatch && ifNoneMatch === "*")
            {
                LSE_Logger.debug(`[Fennel-NG CardDAV] If-None-Match matches, returning 412 for: ${vcardUri}`);
                comm.setStandardHeaders();
                comm.setHeader("ETag", `"${existingVCard.etag}"`);
                comm.setResponseCode(412);
                comm.appendResBody(xh.getXMLHead());
                comm.appendResBody("<d:error xmlns:d=\"DAV:\">");
                comm.appendResBody("<d:precondition-failed>An If-None-Match header was specified, but the ETag matched (or * was specified).</d:precondition-failed>");
                comm.appendResBody("</d:error>");
                comm.flushResponse();
                return;
            }
            var isCreating = !existingVCard;
            var operation = isCreating ? 1 : 2;
            return redis.incrementAddressbookSyncToken(addressbookUri, username).then(function(newSyncToken)
            {
                LSE_Logger.debug(`[Fennel-NG CardDAV] Updated sync token: ${newSyncToken} for addressbook: ${addressbookUri}`);
                if(existingVCard)
                {
                    existingVCard.carddata = body;
                    existingVCard.lastmodified = now;
                    existingVCard.etag = etag;
                    existingVCard.size = size;
                    return existingVCard.save();
                }
                else
                {
                    return VCARDS.create(defaults);
                }
            }).then(function(vcard)
            {
                return ADDRESSBOOKCHANGES.create({
                    uri: vcardUri,
                    synctoken: newSyncToken,
                    addressbookid: adb.id,
                    operation: operation
                }).then(function()
                {
                    LSE_Logger.info(`[Fennel-NG CardDAV] ${isCreating ? 'Created' : 'Updated'} vCard: ${vcardUri}`);
                    comm.setStandardHeaders();
                    comm.setHeader("ETag", `"${etag}"`);
                    comm.setHeader("Last-Modified", new Date(now * 1000).toUTCString());
                    comm.setResponseCode(isCreating ? 201 : 200);
                    comm.flushResponse();
                });
            });
        });
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG CardDAV] Error in put: ${error.message}`);
        comm.setResponseCode(500);
        comm.flushResponse();
    });
}
function proppatch(comm)
{
    LSE_Logger.debug(`[Fennel-NG CardDAV] addressbook.proppatch called`);
    comm.setStandardHeaders();
    comm.setResponseCode(200);
    comm.appendResBody(xh.getXMLHead());
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = handler/addressbook-main.js; // XML parsing disabled
    if(!node)
    {
        LSE_Logger.warn(`[Fennel-NG CardDAV] No property update node found in proppatch`);
        comm.setResponseCode(400);
        comm.flushResponse();
        return;
    }
    var childs = []; // XML disabled
    var addressbookUri = comm.getPathElement(3);
    var username = comm.getUser().getUserName();
    var response = "";
    ADDRESSBOOKS.findOne({ where: {principaluri: 'principals/' + username, uri: addressbookUri} }).then(function(adb)
    {
        if(!adb)
        {
            LSE_Logger.warn(`[Fennel-NG CardDAV] Addressbook not found for proppatch: ${addressbookUri}`);
            var len = childs.length;
            for (var i=0; i < len; ++i)
            {
                var child = childs[i];
                var name = child.name();
                if(name && name !== 'text')
                {
                    response += `<${name}/>`;
                }
            }
            comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">");
            comm.appendResBody("<d:response>");
            comm.appendResBody("<d:href>" + comm.getURL() + "</d:href>");
            comm.appendResBody("<d:propstat>");
            comm.appendResBody("<d:prop>");
            comm.appendResBody(response);
            comm.appendResBody("</d:prop>");
            comm.appendResBody("<d:status>HTTP/1.1 403 Forbidden</d:status>");
            comm.appendResBody("</d:propstat>");
            comm.appendResBody("</d:response>");
            comm.appendResBody("</d:multistatus>");
            comm.flushResponse();
            return;
        }
        var updated = false;
        var len = childs.length;
        for (var i=0; i < len; ++i)
        {
            var child = childs[i];
            var name = child.name();
            switch(name)
            {
                case 'displayname':
                    adb.displayname = child.text();
                    response += "<d:displayname/>";
                    updated = true;
                    LSE_Logger.debug(`[Fennel-NG CardDAV] Updated displayname to: ${child.text()}`);
                    break;
                case 'description':
                    adb.description = child.text();
                    response += "<card:description/>";
                    updated = true;
                    LSE_Logger.debug(`[Fennel-NG CardDAV] Updated description`);
                    break;
                default:
                    if(name && name !== 'text')
                    {
                        response += `<${name}/>`;
                        LSE_Logger.warn(`[Fennel-NG CardDAV] Unhandled proppatch property: ${name}`);
                    }
                    break;
            }
        }
        var savePromise = updated ? adb.save() : Promise.resolve();
        return savePromise.then(function()
        {
            if(updated)
            {
                return redis.incrementAddressbookSyncToken(addressbookUri, username).then(function(newSyncToken)
                {
                    LSE_Logger.info(`[Fennel-NG CardDAV] Addressbook properties updated, sync token: ${newSyncToken}`);
                });
            }
            return Promise.resolve();
        }).then(function()
        {
            comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">");
            comm.appendResBody("<d:response>");
            comm.appendResBody("<d:href>" + comm.getURL() + "</d:href>");
            comm.appendResBody("<d:propstat>");
            comm.appendResBody("<d:prop>");
            comm.appendResBody(response);
            comm.appendResBody("</d:prop>");
            comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>");
            comm.appendResBody("</d:propstat>");
            comm.appendResBody("</d:response>");
            comm.appendResBody("</d:multistatus>");
            comm.flushResponse();
        });
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG CardDAV] Error in proppatch: ${error.message}`);
        comm.setResponseCode(500);
        comm.flushResponse();
    });
}
function options(comm)
{
    LSE_Logger.debug(`[Fennel-NG CardDAV] addressbook.options called`);
    comm.setHeader("Content-Type", "text/html");
    comm.setHeader("Server", "Fennel-NG");
    comm.setHeader("DAV", "1, 3, extended-mkcol, addressbook, access-control");
    comm.setHeader("Allow", "OPTIONS, PROPFIND, HEAD, GET, REPORT, PROPPATCH, PUT, DELETE, POST, COPY, MOVE");
    comm.setResponseCode(200);
    comm.flushResponse();
}
function generateETag(content)
{
    var crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
}

