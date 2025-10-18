const fastxmlparser=require('fast-xml-parser');
const parser=new fastxmlparser.XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text",parseAttributeValue:true,removeNSPrefix:true});
const xml={parsexml:function(body){return parser.parse(body);}};
var config = require('../config').config;
var xh = require("../libs/xmlhelper");
var redis = require('../libs/redis');
var vcards = require('../libs/db').vcards;
var addressbooks = require('../libs/db').addressbooks;
var addressbookchanges = require('../libs/db').addressbookchanges;
var addressbookRead = require('./addressbook-read');
var addressbookDel = require('./addressbook-del');
var addressbookMove = require('./addressbook-move');
function put(comm)
{
    LSE_Logger.debug(`[Fennel-NG CardDAV] addressbook.put called`);
    var vcardUri = comm.getFilenameFromPath(false);
    var addressbookUri = comm.getCalIdFromURL();
    var username = comm.getusername();
    var body = comm.getreqbody();
    var match = body.search(/X-ADDRESSBOOKSERVER-KIND:group/);
    var isGroup = (match >= 0);
    LSE_Logger.debug(`[Fennel-NG CardDAV] Putting vCard: ${vcardUri} to addressbook: ${addressbookUri}, isGroup: ${isGroup}`);
    addressbooks.findone({ where: {principaluri: 'principals/' + username, uri: addressbookUri} }).then(function(adb)
    {
        if(!adb)
        {
            LSE_Logger.warn(`[Fennel-NG CardDAV] Addressbook not found: ${addressbookUri}`);
            comm.setresponsecode(404);
            comm.flushresponse();
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
        return vcards.findone({ where: {addressbookid: adb.id, uri: vcardUri}}).then(function(existingVCard)
        {
            if(existingVCard && ifNoneMatch && ifNoneMatch === "*")
            {
                LSE_Logger.debug(`[Fennel-NG CardDAV] If-None-Match matches, returning 412 for: ${vcardUri}`);
                comm.setstandardheaders();
                comm.setHeader("ETag", `"${existingVCard.etag}"`);
                comm.setresponsecode(412);
                comm.appendresbody(xh.getxmlhead());
                comm.appendresbody("<d:error xmlns:d=\"DAV:\">" + config.xml_lineend);
                comm.appendresbody("<d:precondition-failed>An If-None-Match header was specified, but the ETag matched (or * was specified).</d:precondition-failed>" + config.xml_lineend);
                comm.appendresbody("</d:error>" + config.xml_lineend);
                comm.flushresponse();
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
                    return vcards.create(defaults);
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
                    comm.setstandardheaders();
                    comm.setHeader("ETag", `"${etag}"`);
                    comm.setHeader("Last-Modified", new Date(now * 1000).toUTCString());
                    comm.setresponsecode(isCreating ? 201 : 200);
                    comm.flushresponse();
                });
            });
        });
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG CardDAV] Error in put: ${error.message}`);
        comm.setresponsecode(500);
        comm.flushresponse();
    });
}
function proppatch(comm)
{
    LSE_Logger.debug(`[Fennel-NG CardDAV] addressbook.proppatch called`);
    comm.setstandardheaders();
    comm.setresponsecode(200);
    comm.appendresbody(xh.getxmlhead());
    var body = comm.getreqbody();
    if(!body || body.trim().length === 0) {
        comm.setresponsecode(400);
        comm.flushresponse();
        return;
    }
    try {
        var xmlDoc = xml.parsexml(body);
        var propUpdate = xmlDoc.propertyupdate;
        if(!propUpdate || !propUpdate.set || !propUpdate.set.prop) {
            LSE_Logger.warn(`[Fennel-NG CardDAV] No property update node found in proppatch`);
            comm.setresponsecode(400);
            comm.flushresponse();
            return;
        }
        var props = propUpdate.set.prop;
        var addressbookUri = comm.getCalIdFromURL();
        var username = comm.getusername();
        var response = "";
        addressbooks.findone({ where: {principaluri: 'principals/' + username, uri: addressbookUri} }).then(function(adb)
        {
            if(!adb)
            {
                LSE_Logger.warn(`[Fennel-NG CardDAV] Addressbook not found for proppatch: ${addressbookUri}`);
                comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend);
                comm.appendresbody("<d:response>" + config.xml_lineend);
                comm.appendresbody("<d:href>" + comm.geturl() + "</d:href>");
                comm.appendresbody("<d:propstat>" + config.xml_lineend);
                comm.appendresbody("<d:prop>" + config.xml_lineend);
                if(props.displayname) response += "<d:displayname/>";
                if(props.description) response += "<card:description/>";
                comm.appendresbody(response);
                comm.appendresbody("</d:prop>" + config.xml_lineend);
                comm.appendresbody("<d:status>HTTP/1.1 403 Forbidden</d:status>" + config.xml_lineend);
                comm.appendresbody("</d:propstat>" + config.xml_lineend);
                comm.appendresbody("</d:response>" + config.xml_lineend);
                comm.appendresbody("</d:multistatus>" + config.xml_lineend);
                comm.flushresponse();
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
                comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend);
                comm.appendresbody("<d:response>" + config.xml_lineend);
                comm.appendresbody("<d:href>" + comm.geturl() + "</d:href>" + config.xml_lineend);
                comm.appendresbody("<d:propstat>" + config.xml_lineend);
                comm.appendresbody("<d:prop>" + config.xml_lineend);
                comm.appendresbody(response);
                comm.appendresbody("</d:prop>" + config.xml_lineend);
                comm.appendresbody("<d:status>HTTP/1.1 200 OK</d:status>" + config.xml_lineend);
                comm.appendresbody("</d:propstat>" + config.xml_lineend);
                comm.appendresbody("</d:response>" + config.xml_lineend);
                comm.appendresbody("</d:multistatus>" + config.xml_lineend);
                comm.flushresponse();
            });
        }).catch(function(error)
        {
            LSE_Logger.error(`[Fennel-NG CardDAV] Error in proppatch: ${error.message}`);
            comm.setresponsecode(500);
            comm.flushresponse();
        });
    } catch(error) {
        LSE_Logger.error(`[Fennel-NG CardDAV] Error parsing proppatch XML: ${error.message}`);
        comm.setresponsecode(400);
        comm.flushresponse();
    }
}
function options(comm)
{
    LSE_Logger.debug(`[Fennel-NG CardDAV] addressbook.options called`);
    comm.setHeader("Content-Type", "text/html");
    comm.setHeader("Server", "Fennel-NG");
    comm.setHeader("DAV", "1, 3, extended-mkcol, addressbook, access-control");
    comm.setHeader("Allow", "OPTIONS, PROPFIND, HEAD, GET, REPORT, PROPPATCH, PUT, DELETE, POST, COPY, MOVE");
    comm.setresponsecode(200);
    comm.flushresponse();
}
function generateETag(content)
{
    var crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
}
module.exports = {
    propfind: addressbookRead.propfind,
    proppatch: proppatch,
    report: addressbookRead.report,
    options: options,
    put: put,
    get: addressbookRead.gett,
    delete: addressbookDel.del,
    move: addressbookMove.move
}
