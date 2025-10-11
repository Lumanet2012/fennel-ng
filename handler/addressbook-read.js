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
var addressbookUtil = require('./addressbook-util');
module.exports = {
    propfind: propfind,
    report: report,
    gett: gett
};
function propfind(comm)
{
    LSE_Logger.debug(`[Fennel-NG CardDAV] addressbook.propfind called`);
    comm.setstandardheaders();
    comm.setdavheaders();
    comm.setresponsecode(207);
    comm.appendresbody(xh.getXMLHead());
    var response = "";
    var body = comm.getreqbody();
    var xmlDoc = xml.parseXml(body);
    var node = xmlDoc.propfind;
    var childs = node && node.prop ? Object.keys(node.prop) : [];
    var isRoot = true;
    if(comm.geturlelementsize() > 4)
    {
        isRoot = false;
    }
    var username = comm.getUser().getusername();
    if(isRoot === true)
    {
        response += returnPropfindRootProps(comm, childs);
        var defaults = {
            uri: 'default',
            principaluri: 'principals/' + username,
            displayname: 'Contacts',
            synctoken: 0
        };
        ADDRESSBOOKS.findOrCreate({where: {principaluri: 'principals/' + username, uri: defaults.uri}, defaults: defaults }).then(function(adb, created)
        {
            return redis.getAddressbookSyncToken(adb.uri, username).then(function(redisSyncToken)
            {
                if(redisSyncToken)
                {
                    adb.synctoken = parseInt(redisSyncToken);
                    LSE_Logger.debug(`[Fennel-NG CardDAV] Using Redis sync token: ${adb.synctoken} for addressbook ${adb.uri}`);
                }
                return VCARDS.findAndCountAll({ where: {addressbookid: adb.id}});
            }).then(function(rsVCARDS)
            {
                response += returnPropfindProps(comm, childs, adb, rsVCARDS);
                if(created)
                {
                    return adb.save().then(function()
                    {
                        LSE_Logger.info(`[Fennel-NG CardDAV] Created new addressbook: ${adb.uri}`);
                        return redis.setAddressbookSyncToken(adb.uri, username, adb.synctoken);
                    });
                }
                return Promise.resolve();
            }).then(function()
            {
                comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n");
                comm.appendresbody(response);
                comm.appendresbody("</d:multistatus>\r\n");
                comm.flushresponse();
            }).catch(function(error)
            {
                LSE_Logger.error(`[Fennel-NG CardDAV] Error in propfind root: ${error.message}`);
                comm.setresponsecode(500);
                comm.flushresponse();
            });
        });
    }
    else
    {
        var adbUri = comm.getPathElement(3);
        ADDRESSBOOKS.findOne({ where: {principaluri: 'principals/' + username, uri: adbUri} }).then(function(adb)
        {
            if(!adb)
            {
                LSE_Logger.warn(`[Fennel-NG CardDAV] Addressbook not found: ${adbUri}`);
                comm.setresponsecode(404);
                comm.flushresponse();
                return;
            }
            return redis.getAddressbookSyncToken(adb.uri, username).then(function(redisSyncToken)
            {
                if(redisSyncToken)
                {
                    adb.synctoken = parseInt(redisSyncToken);
                    LSE_Logger.debug(`[Fennel-NG CardDAV] Using Redis sync token: ${adb.synctoken} for addressbook ${adb.uri}`);
                }
                return VCARDS.findAndCountAll({ where: {addressbookid: adb.id}});
            }).then(function(rsVCARDS)
            {
                response += returnPropfindProps(comm, childs, adb, rsVCARDS);
                comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n");
                comm.appendresbody(response);
                comm.appendresbody("</d:multistatus>\r\n");
                comm.flushresponse();
            });
        }).catch(function(error)
        {
            LSE_Logger.error(`[Fennel-NG CardDAV] Error in propfind specific: ${error.message}`);
            comm.setresponsecode(500);
            comm.flushresponse();
        });
    }
}
function returnPropfindRootProps(comm, nodes)
{
    var response = "<d:response><d:href>" + comm.geturl() + "</d:href>";
    response += "<d:propstat>";
    response += "<d:prop>";
    var responseEtag = "";
    var username = comm.getUser().getusername();
    var len = nodes.length;
    for (var i=0; i < len; ++i)
    {
        var child = nodes[i];
        switch(child)
        {
            case 'add-member':
                response += "";
                break;
            case 'bulk-requests':
                response += "";
                break;
            case 'current-user-privilege-set':
                response += getcurrentuserprivilegeset();
                break;
            case 'displayname':
                response += "<d:displayname>Contacts</d:displayname>\r\n";
                break;
            case 'max-image-size':
                response += "";
                break;
            case 'max-resource-size':
                response += "";
                break;
            case 'me-card':
                response += "";
                break;
            case 'owner':
                response += "<d:owner><d:href>" + comm.getfullurl("/p/" + username + "/") + "</d:href></d:owner>\r\n";
                break;
            case 'push-transports':
                response += "";
                break;
            case 'pushkey':
                response += "";
                break;
            case 'quota-available-bytes':
                response += "";
                break;
            case 'quota-used-bytes':
                response += "";
                break;
            case 'resource-id':
                response += "";
                break;
            case 'resourcetype':
                response += "<d:resourcetype><d:collection/></d:resourcetype>\r\n";
                break;
            case 'supported-report-set':
                response += getSupportedReportSet();
                break;
            case 'sync-token':
                response += "";
                break;
            case 'getctag':
                response += "";
                break;
            case 'getetag':
                break;
            default:
                if(child != 'text') LSE_Logger.warn(`[Fennel-NG CardDAV] CARD-PropFind Root not handled: ${child}`);
                break;
        }
    }
    response += "</d:prop>\r\n";
    response += "<d:status>HTTP/1.1 200 OK</d:status>\r\n";
    response += "</d:propstat>\r\n";
    response += "</d:response>\r\n";
    return response;
}
function returnPropfindProps(comm, nodes, adb, rsVCARD)
{
    var username = comm.getUser().getusername();
    var response = "<d:response><d:href>" + comm.getfullurl("/card/" + username + "/" + adb.uri + "/") + "</d:href>";
    response += "<d:propstat>";
    response += "<d:prop>";
    var responseEtag = "";
    var len = nodes.length;
    for (var i=0; i < len; ++i)
    {
        var child = nodes[i];
        switch(child)
        {
            case 'add-member':
                response += "";
                break;
            case 'bulk-requests':
                response += "";
                break;
            case 'current-user-privilege-set':
                response += getcurrentuserprivilegeset();
                break;
            case 'displayname':
                response += "<d:displayname>" + adb.displayname + "</d:displayname>\r\n";
                break;
            case 'max-image-size':
                response += "";
                break;
            case 'max-resource-size':
                response += "";
                break;
            case 'me-card':
                response += "";
                break;
            case 'owner':
                response += "<d:owner><d:href>" + comm.getfullurl("/p/" + username + "/") + "</d:href></d:owner>\r\n";
                break;
            case 'push-transports':
                response += "";
                break;
            case 'pushkey':
                response += "";
                break;
            case 'quota-available-bytes':
                response += "";
                break;
            case 'quota-used-bytes':
                response += "";
                break;
            case 'resource-id':
                response += "";
                break;
            case 'resourcetype':
                response += "<d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>\r\n";
                break;
            case 'supported-report-set':
                response += getSupportedReportSet();
                break;
            case 'sync-token':
                response += "<d:sync-token>" + comm.getfullurl("/sync/addressbook/" + adb.synctoken) + "</d:sync-token>\r\n";
                break;
            case 'getctag':
                response += "<cs:getctag>" + comm.getfullurl("/sync/addressbook/" + adb.synctoken) + "</cs:getctag>\r\n";
                break;
            case 'getetag':
                responseEtag += returnADBETag(comm, rsVCARD);
                break;
            default:
                if(child != 'text') LSE_Logger.warn(`[Fennel-NG CardDAV] CARD-PropFind not handled: ${child}`);
                break;
        }
    }
    response += "</d:prop>\r\n";
    response += "<d:status>HTTP/1.1 200 OK</d:status>\r\n";
    response += "</d:propstat>\r\n";
    response += "</d:response>\r\n";
    if(responseEtag.length > 0)
    {
        response += responseEtag;
    }
    return response;
}
function returnADBETag(comm, rsVCARD)
{
    var response = "";
    for (var j=0; j < rsVCARD.count; ++j)
    {
        var vcard = rsVCARD.rows[j];
        var date = Date.parse(vcard.lastmodified || vcard.updatedAt);
        response += "<d:response>\r\n";
        response += "<d:href>" + comm.geturl() + vcard.uri + "</d:href>\r\n";
        response += "<d:propstat>\r\n";
        response += "<d:prop>\r\n";
        response += "<d:getetag>\"" + Number(date) + "\"</d:getetag>\r\n";
        response += "</d:prop>\r\n";
        response += "<d:status>HTTP/1.1 200 OK</d:status>\r\n";
        response += "</d:propstat>\r\n";
        response += "</d:response>\r\n";
    }
    return response;
}
function gett(comm)
{
    LSE_Logger.debug(`[Fennel-NG CardDAV] addressbook.get called`);
    var vcardUri = comm.getFilenameFromPath(true);
    var username = comm.getUser().getusername();
    var addressbookUri = comm.getPathElement(3);
    ADDRESSBOOKS.findOne({ where: {principaluri: 'principals/' + username, uri: addressbookUri} }).then(function(adb)
    {
        if(!adb)
        {
            LSE_Logger.warn(`[Fennel-NG CardDAV] Addressbook not found: ${addressbookUri}`);
            comm.setresponsecode(404);
            comm.flushresponse();
            return;
        }
        return VCARDS.findOne({ where: {addressbookid: adb.id, uri: vcardUri + '.vcf'}});
    }).then(function(vcard)
    {
        if(!vcard)
        {
            LSE_Logger.warn(`[Fennel-NG CardDAV] VCard not found: ${vcardUri}`);
            comm.setresponsecode(404);
        }
        else
        {
            comm.setHeader("Content-Type", "text/vcard; charset=utf-8");
            var content = vcard.carddata || vcard.content;
            comm.appendresbody(content);
            LSE_Logger.debug(`[Fennel-NG CardDAV] Retrieved vcard: ${vcardUri}`);
        }
        comm.flushresponse();
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG CardDAV] Error in get: ${error.message}`);
        comm.setresponsecode(500);
        comm.flushresponse();
    });
}
function report(comm)
{
    LSE_Logger.debug(`[Fennel-NG CardDAV] addressbook.report called`);
    comm.setstandardheaders();
    comm.setresponsecode(200);
    comm.appendresbody(xh.getXMLHead());
    var body = comm.getreqbody();
    var xmlDoc = xml.parseXml(body);
    var rootKeys = Object.keys(xmlDoc);
    var rootName = rootKeys[0];
    switch(rootName)
    {
        case 'addressbook-multiget':
            handleReportAddressbookMultiget(comm);
            break;
        case 'sync-collection':
            handleReportSyncCollection(comm);
            break;
        default:
            if(rootName != 'text') LSE_Logger.warn(`[Fennel-NG CardDAV] Report not handled: ${rootName}`);
            comm.flushresponse();
            break;
    }
}
function handleReportAddressbookMultiget(comm)
{
    var body = comm.getreqbody();
    var xmlDoc = xml.parseXml(body);
    var multigetNode = xmlDoc['addressbook-multiget'];
    if(multigetNode != undefined)
    {
        var childs = multigetNode ? Object.keys(multigetNode) : [];
        var arrHrefs = [];
        var len = childs.length;
        for (var i=0; i < len; ++i)
        {
            var child = childs[i];
            switch(child)
            {
                case 'prop':
                    break;
                case 'href':
                    var hrefValue = multigetNode.href;
                    if(Array.isArray(hrefValue)) {
                        arrHrefs = arrHrefs.concat(hrefValue.map(parseHrefToVCARDId));
                    } else {
                        arrHrefs.push(parseHrefToVCARDId(hrefValue));
                    }
                    break;
                default:
                    if(child != 'text') LSE_Logger.warn(`[Fennel-NG CardDAV] Multiget not handled: ${child}`);
                    break;
            }
        }
        handleReportHrefs(comm, arrHrefs);
    }
    else
    {
        comm.flushresponse();
    }
}
function handleReportSyncCollection(comm)
{
    var body = comm.getreqbody();
    var xmlDoc = xml.parseXml(body);
    var username = comm.getUser().getusername();
    var addressbookUri = comm.getPathElement(3);
    var syncTokenNode = xmlDoc['sync-token'];
    var requestedSyncToken = 0;
    if(syncTokenNode)
    {
        var tokenUrl = syncTokenNode;
        var tokenMatch = tokenUrl.match(/\/(\d+)$/);
        if(tokenMatch)
        {
            requestedSyncToken = parseInt(tokenMatch[1]);
        }
    }
    ADDRESSBOOKS.findOne({ where: {principaluri: 'principals/' + username, uri: addressbookUri} }).then(function(adb)
    {
        if(!adb)
        {
            LSE_Logger.warn(`[Fennel-NG CardDAV] Addressbook not found for sync: ${addressbookUri}`);
            comm.setresponsecode(404);
            comm.flushresponse();
            return;
        }
        return redis.getAddressbookSyncToken(adb.uri, username).then(function(redisSyncToken)
        {
            var currentSyncToken = redisSyncToken ? parseInt(redisSyncToken) : adb.synctoken;
            if(requestedSyncToken > currentSyncToken)
            {
                LSE_Logger.warn(`[Fennel-NG CardDAV] Invalid sync token requested: ${requestedSyncToken} > ${currentSyncToken}`);
                comm.setresponsecode(409);
                comm.flushresponse();
                return;
            }
            return ADDRESSBOOKCHANGES.findAll({
                where: {
                    addressbookid: adb.id,
                    synctoken: { $gt: requestedSyncToken }
                },
                order: [['synctoken', 'ASC']]
            }).then(function(changes)
            {
                var response = "";
                for(var i = 0; i < changes.length; i++)
                {
                    var change = changes[i];
                    response += "<d:response>\r\n";
                    response += "<d:href>" + comm.geturl() + change.uri + "</d:href>\r\n";
                    if(change.operation === 1)
                    {
                        response += "<d:status>HTTP/1.1 200 OK</d:status>\r\n";
                    }
                    else if(change.operation === 3)
                    {
                        response += "<d:status>HTTP/1.1 404 Not Found</d:status>\r\n";
                    }
                    response += "</d:response>\r\n";
                }
                comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n");
                comm.appendresbody(response);
                comm.appendresbody("<d:sync-token>" + comm.getfullurl("/sync/addressbook/" + currentSyncToken) + "</d:sync-token>\r\n");
                comm.appendresbody("</d:multistatus>\r\n");
                comm.flushresponse();
                LSE_Logger.debug(`[Fennel-NG CardDAV] Sync collection completed: ${changes.length} changes`);
            });
        });
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG CardDAV] Error in sync collection: ${error.message}`);
        comm.setresponsecode(500);
        comm.flushresponse();
    });
}
function parseHrefToVCARDId(href)
{
    var e = href.split("/");
    var id = e[e.length - 1];
    return id.substr(0, id.length - 4);
}
function handleReportHrefs(comm, arrVCARDIds)
{
    var username = comm.getUser().getusername();
    var addressbookUri = comm.getPathElement(3);
    ADDRESSBOOKS.findOne({ where: {principaluri: 'principals/' + username, uri: addressbookUri} }).then(function(adb)
    {
        if(!adb)
        {
            LSE_Logger.warn(`[Fennel-NG CardDAV] Addressbook not found for hrefs: ${addressbookUri}`);
            comm.setresponsecode(404);
            comm.flushresponse();
            return;
        }
        var vcardUris = arrVCARDIds.map(function(id) { return id + '.vcf'; });
        return VCARDS.findAll({ where: {addressbookid: adb.id, uri: vcardUris}});
    }).then(function(vcards)
    {
        var response = "";
        for (var i=0; i < vcards.length; ++i)
        {
            var vcard = vcards[i];
            var date = Date.parse(vcard.lastmodified || vcard.updatedAt);
            var content = vcard.carddata || vcard.content;
            content = content.replace(/&/g,'&amp;');
            content = content.replace(/\r\n|\r|\n/g,'&#13;\r\n');
            response += "<d:response>\r\n";
            response += "<d:href>" + comm.geturl() + vcard.uri + "</d:href>\r\n";
            response += "<d:propstat><d:prop>\r\n";
            response += "<card:address-data>" + content + "</card:address-data>\r\n";
            response += "<d:getetag>\"" + Number(date) + "\"</d:getetag>\r\n";
            response += "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>\r\n";
            response += "</d:response>\r\n";
        }
        comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n");
        comm.appendresbody(response);
        comm.appendresbody("</d:multistatus>\r\n");
        comm.flushresponse();
        LSE_Logger.debug(`[Fennel-NG CardDAV] Multiget completed: ${vcards.length} vcards`);
    }).catch(function(error)
    {
        LSE_Logger.error(`[Fennel-NG CardDAV] Error in report hrefs: ${error.message}`);
        comm.setresponsecode(500);
        comm.flushresponse();
    });
}
function getSupportedReportSet()
{
    var response = "";
    response += "<d:supported-report-set>\r\n";
    response += "<d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>\r\n";
    response += "<d:supported-report><d:report><d:expand-property/></d:report></d:supported-report>\r\n";
    response += "<d:supported-report><d:report><d:principal-property-search/></d:report></d:supported-report>\r\n";
    response += "<d:supported-report><d:report><d:principal-search-property-set/></d:report></d:supported-report>\r\n";
    response += "</d:supported-report-set>";
    return response;
}
function getcurrentuserprivilegeset()
{
    var response = "";
    response += "<d:current-user-privilege-set>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><cal:read-free-busy/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-acl/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-content/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-properties/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:bind/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:unbind/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:unlock/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read-acl/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read-current-user-privilege-set/></d:privilege>\r\n";
    response += "</d:current-user-privilege-set>\r\n";
    return response;
}

