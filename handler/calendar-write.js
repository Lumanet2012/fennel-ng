var config = require('../config').config;
var xh = require("../libs/xmlhelper");
var redis = require('../libs/redis');
var CALENDAROBJECTS = require('../libs/db').CALENDAROBJECTS;
var CALENDARS = require('../libs/db').CALENDARS;
var icsparser = require('../libs/ics-main');
function put(comm)
{
    LSE_Logger.info(`[Fennel-NG CalDAV] put called`);
    var username = comm.getusername();
    var caldav_username = comm.getcaldav_username();
    var principaluri = 'principals/' + caldav_username;
    var calendaruri = comm.getCalIdFromURL();
    var eventuri = comm.getFilenameFromPath(false);
    var calendardata = comm.getReqBody();
    LSE_Logger.debug(`[Fennel-NG CalDAV] received ${calendardata.length} bytes of calendar data`);
    var parsedics = icsparser.parseics(calendardata);
    if(!parsedics) {
        LSE_Logger.error(`[Fennel-NG CalDAV] failed to parse ics data`);
        comm.setStandardHeaders();
        comm.setResponseCode(400);
        comm.appendResBody("Invalid iCalendar data");
        comm.flushResponse();
        return;
    }
    CALENDARS.findOne({ where: {principaluri: principaluri, uri: calendaruri}}).then(function(calendar) {
        if(!calendar) {
            LSE_Logger.error(`[Fennel-NG CalDAV] calendar not found: ${calendaruri} for principal: ${principaluri}`);
            comm.setStandardHeaders();
            comm.setResponseCode(404);
            comm.flushResponse();
            return;
        }
        var eventuid = icsparser.extractuid(parsedics);
        var componenttype = icsparser.extractcomponenttype(parsedics);
        var firstoccurrence = icsparser.extractfirstoccurrence(parsedics);
        var lastoccurrence = icsparser.extractlastoccurrence(parsedics);
        var etag = require('crypto').createHash('md5').update(calendardata).digest('hex');
        var size = Buffer.byteLength(calendardata, 'utf8');
        var now = Math.floor(Date.now() / 1000);
        LSE_Logger.debug(`[Fennel-NG CalDAV] extracted data - uid: ${eventuid}, type: ${componenttype}, first: ${firstoccurrence}, last: ${lastoccurrence}`);
        var ifnonematch = comm.getHeader('If-None-Match');
        var ifmatch = comm.getHeader('If-Match');
        CALENDAROBJECTS.findOne({ where: {calendarid: calendar.id, uri: eventuri}}).then(function(existingcalendarobject) {
            var iscreating = !existingcalendarobject;
            if(ifnonematch && ifnonematch === "*" && existingcalendarobject) {
                LSE_Logger.debug(`[Fennel-NG CalDAV] If-None-Match precondition failed for: ${eventuri}`);
                comm.setStandardHeaders();
                comm.setHeader("ETag", `"${existingcalendarobject.etag}"`);
                comm.setResponseCode(412);
                comm.appendResBody(xh.getXMLHead());
                comm.appendResBody("<d:error xmlns:d=\"DAV:\">" + config.xml_lineend);
                comm.appendResBody("<d:precondition-failed>An If-None-Match header was specified, but the ETag matched (or * was specified).</d:precondition-failed>" + config.xml_lineend);
                comm.appendResBody("</d:error>" + config.xml_lineend);
                comm.flushResponse();
                return;
            }
            if(ifmatch && existingcalendarobject && ifmatch !== `"${existingcalendarobject.etag}"`) {
                LSE_Logger.debug(`[Fennel-NG CalDAV] If-Match precondition failed for: ${eventuri}`);
                comm.setStandardHeaders();
                comm.setHeader("ETag", `"${existingcalendarobject.etag}"`);
                comm.setResponseCode(412);
                comm.appendResBody(xh.getXMLHead());
                comm.appendResBody("<d:error xmlns:d=\"DAV:\">" + config.xml_lineend);
                comm.appendResBody("<d:precondition-failed>An If-Match header was specified, but the ETag did not match.</d:precondition-failed>" + config.xml_lineend);
                comm.appendResBody("</d:error>" + config.xml_lineend);
                comm.flushResponse();
                return;
            }
            var calendarobjectdata = {
                calendardata: calendardata,
                uri: eventuri,
                calendarid: calendar.id,
                lastmodified: now,
                etag: etag,
                size: size,
                componenttype: componenttype,
                firstoccurence: firstoccurrence,
                lastoccurence: lastoccurrence,
                uid: eventuid
            };
            var savepromise;
            if(existingcalendarobject) {
                Object.assign(existingcalendarobject, calendarobjectdata);
                savepromise = existingcalendarobject.save();
            } else {
                savepromise = CALENDAROBJECTS.create(calendarobjectdata);
            }
            return savepromise.then(function(calendarobject) {
                return updatecalendarsynctoken(calendar.id).then(function(newsynctoken) {
                    LSE_Logger.info(`[Fennel-NG CalDAV] ${iscreating ? 'created' : 'updated'} calendar object: ${eventuri}, sync token: ${newsynctoken}`);
                    redis.setCalendarSyncToken(calendaruri, username, newsynctoken);
                    comm.setStandardHeaders();
                    comm.setHeader("ETag", `"${etag}"`);
                    comm.setHeader("Last-Modified", new Date(now * 1000).toUTCString());
                    comm.setResponseCode(iscreating ? 201 : 200);
                    comm.flushResponse();
                });
            });
        });
    }).catch(function(error) {
        LSE_Logger.error(`[Fennel-NG CalDAV] error in put: ${error.message}`);
        comm.setResponseCode(500);
        comm.flushResponse();
    });
}
function proppatch(comm)
{
    LSE_Logger.info(`[Fennel-NG CalDAV] proppatch called`);
    comm.setStandardHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\">" + config.xml_lineend);
    comm.appendResBody("<d:response>" + config.xml_lineend);
    comm.appendResBody("<d:href>" + comm.getURL() + "</d:href>" + config.xml_lineend);
    comm.appendResBody("<d:propstat>" + config.xml_lineend);
    comm.appendResBody("<d:status>HTTP/1.1 403 Forbidden</d:status>" + config.xml_lineend);
    comm.appendResBody("</d:propstat>" + config.xml_lineend);
    comm.appendResBody("</d:response>" + config.xml_lineend);
    comm.appendResBody("</d:multistatus>" + config.xml_lineend);
    comm.flushResponse();
}
function mkcalendar(comm)
{
    LSE_Logger.info(`[Fennel-NG CalDAV] mkcalendar called`);
    var caldav_username = comm.getcaldav_username();
    var principaluri = 'principals/' + caldav_username;
    var calendaruri = comm.getCalIdFromURL();
    var displayname = calendaruri;
    var calendarcolor = "#0066CC";
    var calendarorder = 1;
    var description = "";
    var timezone = "";
    var components = "VEVENT,VTODO,VJOURNAL";
    var body = comm.getReqBody();
    if(body && body.length > 0) {
        try {
            var xmlDoc = require("../libs/xmlhelper").parseXml(body);
            if(xmlDoc && xmlDoc.mkcalendar && xmlDoc.mkcalendar.set && xmlDoc.mkcalendar.set.prop) {
                var props = xmlDoc.mkcalendar.set.prop;
                if(props.displayname) {
                    displayname = props.displayname;
                }
                if(props['calendar-color']) {
                    calendarcolor = props['calendar-color'];
                }
                if(props['calendar-order']) {
                    calendarorder = parseInt(props['calendar-order']) || 1;
                }
                if(props['calendar-description']) {
                    description = props['calendar-description'];
                }
                if(props['calendar-timezone']) {
                    timezone = props['calendar-timezone'];
                }
            }
        } catch(e) {
            LSE_Logger.warn(`[Fennel-NG CalDAV] failed to parse mkcalendar xml: ${e.message}`);
        }
    }
    CALENDARS.findOne({ where: {principaluri: principaluri, uri: calendaruri}}).then(function(existingcalendar) {
        if(existingcalendar) {
            LSE_Logger.warn(`[Fennel-NG CalDAV] calendar already exists: ${calendaruri}`);
            comm.setStandardHeaders();
            comm.setResponseCode(405);
            comm.flushResponse();
            return;
        }
        var calendardata = {
            principaluri: principaluri,
            displayname: displayname,
            uri: calendaruri,
            description: description,
            calendarorder: calendarorder,
            calendarcolor: calendarcolor,
            timezone: timezone,
            components: components,
            synctoken: 1
        };
        return CALENDARS.create(calendardata).then(function(calendar) {
            LSE_Logger.info(`[Fennel-NG CalDAV] created calendar: ${calendaruri} for principal: ${principaluri}`);
            comm.setStandardHeaders();
            comm.setResponseCode(201);
            comm.flushResponse();
        });
    }).catch(function(error) {
        LSE_Logger.error(`[Fennel-NG CalDAV] error in mkcalendar: ${error.message}`);
        comm.setResponseCode(500);
        comm.flushResponse();
    });
}
function updatecalendarsynctoken(calendarid)
{
    return new Promise(function(resolve, reject) {
        CALENDARS.findOne({ where: {id: calendarid} }).then(function(calendar) {
            if (!calendar) {
                reject(new Error('calendar not found'));
                return;
            }
            calendar.increment('synctoken', { by: 1 }).then(function() {
                resolve(calendar.synctoken + 1);
            }).catch(reject);
        }).catch(reject);
    });
}
module.exports = {
    put: put,
    proppatch: proppatch,
    mkcalendar: mkcalendar
};
