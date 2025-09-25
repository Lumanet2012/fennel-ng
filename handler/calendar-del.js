var config = require('../config').config;
var redis = require('../libs/redis');
var CALENDAROBJECTS = require('../libs/db').CALENDAROBJECTS;
var CALENDARS = require('../libs/db').CALENDARS;
function del(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.delete called`);
    comm.setHeader("Content-Type", "text/html");
    comm.setHeader("Server", "Fennel-NG");
    comm.setResponseCode(204);
    var isRoot = true;
    if(comm.getUrlElementSize() > 4)
    {
        var lastPathElement = comm.getFilenameFromPath(false);
        if(comm.stringEndsWith(lastPathElement, '.ics'))
        {
            isRoot = false;
        }
    }
    if(isRoot === true)
    {
        var calendarUri = comm.getPathElement(3);
        var username = comm.getusername();
        var principalUri = 'principals/' + username;
        CALENDARS.findOne({ where: {principaluri: principalUri, uri: calendarUri} }).then(function(calendar)
        {
            if(calendar === null)
            {
                LSE_Logger.warn(`[Fennel-NG CalDAV] err: could not find calendar`);
            }
            else
            {
                var calendarId = calendar.id;
                calendar.destroy().then(function()
                {
                    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar deleted`);
                    redis.del(`fennel:sync:cal:${calendarId}`);
                })
            }
            comm.flushResponse();
        });
    }
    else
    {
        var eventUri = comm.getFilenameFromPath(false);
        CALENDAROBJECTS.findOne({ where: {uri: eventUri}}).then(function(calendarObject)
        {
            if(calendarObject === null)
            {
                LSE_Logger.warn(`[Fennel-NG CalDAV] err: could not find calendar object`);
            }
            else
            {
                var calendarId = calendarObject.calendarid;
                calendarObject.destroy().then(function()
                {
                    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar object deleted`);
                    updateCalendarSyncToken(calendarId).then(function(newSyncToken) {
                        redis.set(`fennel:sync:cal:${calendarId}`, newSyncToken);
                        redis.del(`fennel:etag:event:${eventUri}`);
                        LSE_Logger.info(`[Fennel-NG CalDAV] sync token updated after deletion`);
                    });
                })
            }
            comm.flushResponse();
        });
    }
}
function updateCalendarSyncToken(calendarId)
{
    return new Promise(function(resolve, reject) {
        CALENDARS.findOne({ where: {id: calendarId} }).then(function(calendar) {
            if (!calendar) {
                reject(new Error('Calendar not found'));
                return;
            }
            calendar.increment('synctoken', { by: 1 }).then(function() {
                resolve(calendar.synctoken + 1);
            }).catch(reject);
        }).catch(reject);
    });
}
module.exports = {
    del: del
};
