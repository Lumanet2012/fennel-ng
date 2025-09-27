var config = require('../config').config;
var xh = require("../libs/xmlhelper");
var redis = require('../libs/redis');
var CALENDAROBJECTS = require('../libs/db').CALENDAROBJECTS;
var CALENDARS = require('../libs/db').CALENDARS;
function proppatch(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.proppatch called`);
    comm.setStandardHeaders();
    comm.setResponseCode(200);
    comm.appendResBody(xh.getXMLHead());
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\">\r\n");
    comm.appendResBody("<d:response>\r\n");
    comm.appendResBody("<d:href>" + comm.getURL() + "</d:href>\r\n");
    comm.appendResBody("<d:propstat>\r\n");
    comm.appendResBody("<d:prop/>\r\n");
    comm.appendResBody("<d:status>HTTP/1.1 403 Forbidden</d:status>\r\n");
    comm.appendResBody("</d:propstat>\r\n");
    comm.appendResBody("</d:response>\r\n");
    comm.appendResBody("</d:multistatus>\r\n");
    comm.flushResponse();
}
function put(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.put called`);
    var username = comm.getusername();
    var caldav_username = comm.getcaldav_username();
    var principalUri = 'principals/' + caldav_username;
    var calendarUri = comm.getCalIdFromURL();
    var eventUri = comm.getFilenameFromPath(false);
    var calendarData = comm.getReqBody();
    CALENDARS.findOne({ where: {principaluri: principalUri, uri: calendarUri} }).then(function(calendar) {
        if(!calendar) {
            LSE_Logger.error(`[Fennel-NG CalDAV] Calendar not found: ${calendarUri}`);
            comm.setResponseCode(404);
            comm.flushResponse();
            return;
        }
        var eventUid = extractUidFromCalendarData(calendarData);
        var componentType = extractComponentTypeFromCalendarData(calendarData);
        var firstOccurrence = extractFirstOccurrence(calendarData);
        var lastOccurrence = extractLastOccurrence(calendarData);
        var etag = require('crypto').createHash('md5').update(calendarData).digest('hex');
        var size = Buffer.byteLength(calendarData, 'utf8');
        var now = Math.floor(Date.now() / 1000);
        var ifNoneMatch = comm.getHeader('If-None-Match');
        var ifMatch = comm.getHeader('If-Match');
        CALENDAROBJECTS.findOne({ where: {calendarid: calendar.id, uri: eventUri}}).then(function(existingCalendarObject) {
            var isCreating = !existingCalendarObject;
            if(ifNoneMatch && ifNoneMatch === "*" && existingCalendarObject) {
                LSE_Logger.debug(`[Fennel-NG CalDAV] If-None-Match precondition failed for: ${eventUri}`);
                comm.setStandardHeaders();
                comm.setHeader("ETag", `"${existingCalendarObject.etag}"`);
                comm.setResponseCode(412);
                comm.appendResBody(xh.getXMLHead());
                comm.appendResBody("<d:error xmlns:d=\"DAV:\">" + config.xml_lineend);
                comm.appendResBody("<d:precondition-failed>An If-None-Match header was specified, but the ETag matched (or * was specified).</d:precondition-failed>" + config.xml_lineend);
                comm.appendResBody("</d:error>" + config.xml_lineend);
                comm.flushResponse();
                return;
            }
            if(ifMatch && existingCalendarObject && ifMatch !== `"${existingCalendarObject.etag}"`) {
                LSE_Logger.debug(`[Fennel-NG CalDAV] If-Match precondition failed for: ${eventUri}`);
                comm.setStandardHeaders();
                comm.setResponseCode(412);
                comm.appendResBody(xh.getXMLHead());
                comm.appendResBody("<d:error xmlns:d=\"DAV:\">" + config.xml_lineend);
                comm.appendResBody("<d:precondition-failed>If-Match header specified, but ETag didn't match</d:precondition-failed>" + config.xml_lineend);
                comm.appendResBody("</d:error>" + config.xml_lineend);
                comm.flushResponse();
                return;
            }
            var calendarObjectData = {
                calendardata: calendarData,
                uri: eventUri,
                calendarid: calendar.id,
                lastmodified: now,
                etag: etag,
                size: size,
                componenttype: componentType,
                firstoccurence: firstOccurrence,
                lastoccurence: lastOccurrence,
                uid: eventUid
            };
            var savePromise;
            if(existingCalendarObject) {
                Object.assign(existingCalendarObject, calendarObjectData);
                savePromise = existingCalendarObject.save();
            } else {
                savePromise = CALENDAROBJECTS.create(calendarObjectData);
            }
            return savePromise.then(function(calendarObject) {
                return updateCalendarSyncToken(calendar.id).then(function(newSyncToken) {
                    LSE_Logger.info(`[Fennel-NG CalDAV] ${isCreating ? 'Created' : 'Updated'} calendar object: ${eventUri}, sync token: ${newSyncToken}`);
                    redis.setCalendarSyncToken(calendarUri, username, newSyncToken);
                    comm.setStandardHeaders();
                    comm.setHeader("ETag", `"${etag}"`);
                    comm.setHeader("Last-Modified", new Date(now * 1000).toUTCString());
                    comm.setResponseCode(isCreating ? 201 : 200);
                    comm.flushResponse();
                });
            });
        });
    }).catch(function(error) {
        LSE_Logger.error(`[Fennel-NG CalDAV] Error in put: ${error.message}`);
        comm.setResponseCode(500);
        comm.flushResponse();
    });
}
function mkcalendar(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.mkcalendar called`);
    var calendarUri = comm.getCalIdFromURL();
    var username = comm.getUser().getUserName();
    var body = comm.getReqBody();
    var displayname = 'New Calendar';
    var description = 'Calendar created via MKCALENDAR';
    if(body && body.length > 0)
    {
        try {
            var xmlDoc = xml.parseXml(body);
            var mkcalendar = xmlDoc['mkcalendar'] || xmlDoc['cal:mkcalendar'];
            if(mkcalendar && mkcalendar.set && mkcalendar.set.prop)
            {
                var props = mkcalendar.set.prop;
                if(props.displayname) {
                    displayname = props.displayname;
                }
                if(props['calendar-description']) {
                    description = props['calendar-description'];
                }
            }
        } catch(error) {
            LSE_Logger.warn(`[Fennel-NG CalDAV] Error parsing MKCALENDAR body: ${error.message}`);
        }
    }
    var calendarData = {
        principaluri: 'principals/' + username,
        synctoken: 1,
        components: 'VEVENT,VTODO',
        displayname: displayname,
        uri: calendarUri,
        description: description,
        calendarorder: 0,
        calendarcolor: '#3174ad'
    };
    CALENDARS.create(calendarData).then(function(calendar) {
        LSE_Logger.info(`[Fennel-NG CalDAV] Created calendar: ${calendarUri} for user: ${username}`);
        comm.setStandardHeaders();
        comm.setResponseCode(201);
        comm.flushResponse();
    }).catch(function(error) {
        LSE_Logger.error(`[Fennel-NG CalDAV] Error creating calendar: ${error.message}`);
        if(error.name === 'SequelizeUniqueConstraintError') {
            comm.setResponseCode(409);
            comm.flushResponse();
        } else {
            comm.setResponseCode(500);
            comm.flushResponse();
        }
    });
}
function extractUidFromCalendarData(calendarData)
{
    var uidMatch = calendarData.match(/UID:(.+?)(?:\r?\n)/);
    return uidMatch ? uidMatch[1].trim() : null;
}
function extractComponentTypeFromCalendarData(calendarData)
{
    var componentMatch = calendarData.match(/BEGIN:(VEVENT|VTODO|VJOURNAL)/);
    return componentMatch ? componentMatch[1] : 'VEVENT';
}
function extractFirstOccurrence(calendarData)
{
    var dtStartMatch = calendarData.match(/DTSTART[^:]*:(\d{8}T\d{6}Z?)/);
    if(dtStartMatch) {
        var dateStr = dtStartMatch[1];
        var year = parseInt(dateStr.substr(0, 4));
        var month = parseInt(dateStr.substr(4, 2)) - 1;
        var day = parseInt(dateStr.substr(6, 2));
        var hour = parseInt(dateStr.substr(9, 2));
        var minute = parseInt(dateStr.substr(11, 2));
        var second = parseInt(dateStr.substr(13, 2));
        return Math.floor(new Date(year, month, day, hour, minute, second).getTime() / 1000);
    }
    return Math.floor(Date.now() / 1000);
}
function extractLastOccurrence(calendarData)
{
    var dtEndMatch = calendarData.match(/DTEND[^:]*:(\d{8}T\d{6}Z?)/);
    if(dtEndMatch) {
        var dateStr = dtEndMatch[1];
        var year = parseInt(dateStr.substr(0, 4));
        var month = parseInt(dateStr.substr(4, 2)) - 1;
        var day = parseInt(dateStr.substr(6, 2));
        var hour = parseInt(dateStr.substr(9, 2));
        var minute = parseInt(dateStr.substr(11, 2));
        var second = parseInt(dateStr.substr(13, 2));
        return Math.floor(new Date(year, month, day, hour, minute, second).getTime() / 1000);
    }
    return Math.floor(Date.now() / 1000) + 3600;
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
    put: put
};

