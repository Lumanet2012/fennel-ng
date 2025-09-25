var config = require('../config').config;
var redis = require('../libs/redis');
var VCARDS = require('../libs/db').VCARDS;
var ADDRESSBOOKS = require('../libs/db').ADDRESSBOOKS;
var ADDRESSBOOKCHANGES = require('../libs/db').ADDRESSBOOKCHANGES;
module.exports = {
    move: move
};
function move(comm)
{
    LSE_Logger.debug(`[Fennel-NG CardDAV] addressbook.move called`);
    comm.setStandardHeaders();
    var vcardUri = comm.getFilenameFromPath(true);
    var sourceAddressbookUri = comm.getPathElement(3);
    var username = comm.getusername();
    var destination = "";
    var req = comm.getReq();
    var headers = req.headers;
    for(var header in headers)
    {
        if(header === "destination")
        {
            destination = req.headers[header];
        }
    }
    if(destination.length === 0)
    {
        LSE_Logger.warn(`[Fennel-NG CardDAV] No destination header provided for move operation`);
        comm.setResponseCode(400);
        comm.flushResponse();
        return;
    }
    var aURL = destination.split("/");
    var targetAddressbookUri = aURL[aURL.length - 2];
    var targetVCardUri = aURL[aURL.length - 1];
    LSE_Logger.debug(`[Fennel-NG CardDAV] Moving vCard: ${vcardUri} from ${sourceAddressbookUri} to ${targetAddressbookUri}`);
    var sourceAddressbook;
    var targetAddressbook;
    var vcardToMove;
    ADDRESSBOOKS.findOne({ where: {principaluri: 'principals/' + username, uri: sourceAddressbookUri} }).then(function(sourceAdb)
    {
        if(!sourceAdb)
        {
            LSE_Logger.warn(`[Fennel-NG CardDAV] Source addressbook not found: ${sourceAddressbookUri}`);
            comm.setResponseCode(404);
            comm.flushResponse();
            return Promise.reject(new Error('Source addressbook not found'));
        }
        sourceAddressbook = sourceAdb;
        return ADDRESSBOOKS.findOne({ where: {principaluri: 'principals/' + username, uri: targetAddressbookUri} });
    }).then(function(targetAdb)
    {
        if(!targetAdb)
        {
            LSE_Logger.warn(`[Fennel-NG CardDAV] Target addressbook not found: ${targetAddressbookUri}`);
            comm.setResponseCode(404);
            comm.flushResponse();
            return Promise.reject(new Error('Target addressbook not found'));
        }
        targetAddressbook = targetAdb;
        return VCARDS.findOne({ where: {addressbookid: sourceAddressbook.id, uri: vcardUri + '.vcf'}});
    }).then(function(vcard)
    {
        if(!vcard)
        {
            LSE_Logger.warn(`[Fennel-NG CardDAV] VCard not found for move: ${vcardUri}`);
            comm.setResponseCode(404);
            comm.flushResponse();
            return Promise.reject(new Error('VCard not found'));
        }
        vcardToMove = vcard;
        return redis.incrementAddressbookSyncToken(sourceAddressbookUri, username);
    }).then(function(sourceSyncToken)
    {
        LSE_Logger.debug(`[Fennel-NG CardDAV] Updated source sync token: ${sourceSyncToken}`);
        return ADDRESSBOOKCHANGES.create({
            uri: vcardToMove.uri,
            synctoken: sourceSyncToken,
            addressbookid: sourceAddressbook.id,
            operation: 3
        });
    }).then(function()
    {
        return redis.incrementAddressbookSyncToken(targetAddressbookUri, username);
    }).then(function(targetSyncToken)
    {
        LSE_Logger.debug(`[Fennel-NG CardDAV] Updated target sync token: ${targetSyncToken}`);
        var now = Math.floor(Date.now() / 1000);
        vcardToMove.addressbookid = targetAddressbook.id;
        vcardToMove.uri = targetVCardUri;
        vcardToMove.lastmodified = now;
        vcardToMove.etag = generateETag(vcardToMove.carddata || vcardToMove.content);
        return vcardToMove.save();
    }).then(function()
    {
        return ADDRESSBOOKCHANGES.create({
            uri: vcardToMove.uri,
            synctoken: targetSyncToken,
            addressbookid: targetAddressbook.id,
            operation: 1
        });
    }).then(function()
    {
        LSE_Logger.info(`[Fennel-NG CardDAV] Successfully moved vCard: ${vcardUri} from ${sourceAddressbookUri} to ${targetAddressbookUri}`);
        var date = new Date();
        comm.setHeader("ETag", vcardToMove.etag);
        comm.setHeader("Last-Modified", new Date(vcardToMove.lastmodified * 1000).toUTCString());
        comm.setResponseCode(201);
        comm.flushResponse();
    }).catch(function(error)
    {
        if(error.message !== 'Source addressbook not found' && 
           error.message !== 'Target addressbook not found' && 
           error.message !== 'VCard not found')
        {
            LSE_Logger.error(`[Fennel-NG CardDAV] Error moving vCard: ${error.message}`);
            comm.setResponseCode(500);
            comm.flushResponse();
        }
    });
}
function generateETag(content)
{
    var crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
}
