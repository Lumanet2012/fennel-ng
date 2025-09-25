var config = require('../config').config;
var redis = require('../libs/redis');
var VCARDS = require('../libs/db').VCARDS;
var ADDRESSBOOKS = require('../libs/db').ADDRESSBOOKS;
var ADDRESSBOOKCHANGES = require('../libs/db').ADDRESSBOOKCHANGES;
module.exports = {
    del: del
};
function del(comm)
{
    LSE_Logger.debug(`[Fennel-NG CardDAV] addressbook.delete called`);
    comm.setHeader("Content-Type", "text/html");
    comm.setHeader("Server", "Fennel-NG");
    comm.setResponseCode(204);
    var isRoot = true;
    if(comm.getUrlElementSize() > 4)
    {
        var lastPathElement = comm.getFilenameFromPath(false);
        if(comm.stringEndsWith(lastPathElement, '.vcf'))
        {
            isRoot = false;
        }
    }
    var username = comm.getusername();
    if(isRoot === true)
    {
        var addressbookUri = comm.getPathElement(3);
        LSE_Logger.debug(`[Fennel-NG CardDAV] Deleting addressbook: ${addressbookUri}`);
        ADDRESSBOOKS.findOne({ where: {principaluri: 'principals/' + username, uri: addressbookUri} }).then(function(adb)
        {
            if(adb === null)
            {
                LSE_Logger.warn(`[Fennel-NG CardDAV] Could not find addressbook with URI: ${addressbookUri}`);
                comm.setResponseCode(404);
                comm.flushResponse();
                return;
            }
            return redis.incrementAddressbookSyncToken(adb.uri, username).then(function(newSyncToken)
            {
                LSE_Logger.debug(`[Fennel-NG CardDAV] Updated sync token for addressbook deletion: ${newSyncToken}`);
                return ADDRESSBOOKCHANGES.create({
                    uri: adb.uri,
                    synctoken: newSyncToken,
                    addressbookid: adb.id,
                    operation: 3
                });
            }).then(function()
            {
                return VCARDS.destroy({ where: {addressbookid: adb.id} });
            }).then(function(deletedVCards)
            {
                LSE_Logger.info(`[Fennel-NG CardDAV] Deleted ${deletedVCards} vCards from addressbook: ${addressbookUri}`);
                return adb.destroy();
            }).then(function()
            {
                LSE_Logger.info(`[Fennel-NG CardDAV] Successfully deleted addressbook: ${addressbookUri}`);
                return redis.deleteAddressbookSyncToken(adb.uri, username);
            }).then(function()
            {
                comm.flushResponse();
            });
        }).catch(function(error)
        {
            LSE_Logger.error(`[Fennel-NG CardDAV] Error deleting addressbook: ${error.message}`);
            comm.setResponseCode(500);
            comm.flushResponse();
        });
    }
    else
    {
        var vcardUri = comm.getFilenameFromPath(true);
        var addressbookUri = comm.getPathElement(3);
        LSE_Logger.debug(`[Fennel-NG CardDAV] Deleting vCard: ${vcardUri} from addressbook: ${addressbookUri}`);
        ADDRESSBOOKS.findOne({ where: {principaluri: 'principals/' + username, uri: addressbookUri} }).then(function(adb)
        {
            if(!adb)
            {
                LSE_Logger.warn(`[Fennel-NG CardDAV] Addressbook not found: ${addressbookUri}`);
                comm.setResponseCode(404);
                comm.flushResponse();
                return;
            }
            return VCARDS.findOne({ where: {addressbookid: adb.id, uri: vcardUri + '.vcf'}});
        }).then(function(vcard)
        {
            if(!vcard)
            {
                LSE_Logger.warn(`[Fennel-NG CardDAV] VCard not found: ${vcardUri}`);
                comm.setResponseCode(404);
                comm.flushResponse();
                return;
            }
            return redis.incrementAddressbookSyncToken(addressbookUri, username).then(function(newSyncToken)
            {
                LSE_Logger.debug(`[Fennel-NG CardDAV] Updated sync token for vCard deletion: ${newSyncToken}`);
                return ADDRESSBOOKCHANGES.create({
                    uri: vcard.uri,
                    synctoken: newSyncToken,
                    addressbookid: vcard.addressbookid,
                    operation: 3
                });
            }).then(function()
            {
                return vcard.destroy();
            }).then(function()
            {
                LSE_Logger.info(`[Fennel-NG CardDAV] Successfully deleted vCard: ${vcardUri}`);
                comm.flushResponse();
            });
        }).catch(function(error)
        {
            LSE_Logger.error(`[Fennel-NG CardDAV] Error deleting vCard: ${error.message}`);
            comm.setResponseCode(500);
            comm.flushResponse();
        });
    }
}

