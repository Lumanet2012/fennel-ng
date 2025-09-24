const { XMLParser } = require('fast-xml-parser');
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseAttributeValue: true
});
var xml = {
    parseXml: function(body) {
        return parser.parse(body);
    }
};
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
    var addressbookUri = comm.getCalIdFromURL();
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
                comm.appendResBody("<d:error xmlns:d=\"DAV:\">\r\n");
                comm.appendResBody("<d:precondition-failed>An If-None-Match header was specified, but the ETag matched (or * was specified).</d:precondition-failed>\r\n");
                comm.appendResBody("</d:error>\r\n");
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
    if(!body || body.trim().length === 0) {
        comm.setResponseCode(400);
        comm.flushResponse();
        return;
    }
    try {
        var xmlDoc = xml.parseXml(body);
        var propUpdate = xmlDoc.propertyupdate;
        if(!propUpdate || !propUpdate.set || !propUpdate.set.prop) {
            LSE_Logger.warn(`[Fennel-NG CardDAV] No property update node found in proppatch`);
            comm.setResponseCode(400);
            comm.flushResponse();
            return;
        }
        var props = propUpdate.set.prop;
        var addressbookUri = comm.getCalIdFromURL();
        var username = comm.getUser().getUserName();
        var response = "";
        ADDRESSBOOKS.findOne({ where: {principaluri: 'principals/' + username, uri: addressbookUri} }).then(function(adb)
        {
            if(!adb)
            {
                LSE_Logger.warn(`[Fennel-NG CardDAV] Addressbook not found for proppatch: ${addressbookUri}`);
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n");
                comm.appendResBody("<d:response>\r\n");
                comm.appendResBody("<d:href>" + comm.getURL() + "</d:href>");
                comm.appendResBody("<d:propstat>\r\n");
                comm.appendResBody("<d:prop>\r\n");
                if(props.displayname) response += "<d:displayname/>";
                if(props.description) response += "<card:description/>";
                comm.appendResBody(response);
                comm.appendResBody("</d:prop>\r\n");
                comm.appendResBody("<d:status>HTTP/1.1 403 Forbidden</d:status>\r\n");
                comm.appendResBody("</d:propstat>\r\n");
                comm.appendResBody("</d:response>\r\n");
                comm.appendResBody("</d:multistatus>\r\n");
                comm.flushResponse();
                return;
            }
            var updated = false;
            if(props.displayname) {
                adb.displayname = props.displayname;
                response += "<d:displayname/>";
                updated = true;
                LSE_Logger.debug(`[Fennel-NG CardDAV] Updated displayname to: ${props.displayname}`);
            }
            if(props.description) {
                adb.description = props.description;
                response += "<card:description/>";
                updated = true;
                LSE_Logger.debug(`[Fennel-NG CardDAV] Updated description`);
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
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n");
                comm.appendResBody("<d:response>\r\n");
                comm.appendResBody("<d:href>" + comm.getURL() + "</d:href>\r\n");
                comm.appendResBody("<d:propstat>\r\n");
                comm.appendResBody("<d:prop>\r\n");
                comm.appendResBody(response);
                comm.appendResBody("</d:prop>\r\n");
                comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>\r\n");
                comm.appendResBody("</d:propstat>\r\n");
                comm.appendResBody("</d:response>\r\n");
                comm.appendResBody("</d:multistatus>\r\n");
                comm.flushResponse();
            });
        }).catch(function(error)
        {
            LSE_Logger.error(`[Fennel-NG CardDAV] Error in proppatch: ${error.message}`);
            comm.setResponseCode(500);
            comm.flushResponse();
        });
    } catch(error) {
        LSE_Logger.error(`[Fennel-NG CardDAV] Error parsing proppatch XML: ${error.message}`);
        comm.setResponseCode(400);
        comm.flushResponse();
    }
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
