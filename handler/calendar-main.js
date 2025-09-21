var xml = require("libxmljs");
var moment = require('moment');
var xh = require("../libs/xmlhelper");
var LSE_logger = require('LSE_logger');
var redis = require('../libs/redis');
var CALENDAROBJECTS = require('../libs/db').CALENDAROBJECTS;
var CALENDARS = require('../libs/db').CALENDARS;
var CALENDARCHANGES = require('../libs/db').CALENDARCHANGES;
var calendarRead = require('./calendar-read');
var calendarDel = require('./calendar-del');
var calendarMove = require('./calendar-move');
var calendarUtil = require('./calendar-util');
module.exports = {
    propfind: calendarRead.propfind,
    proppatch: proppatch,
    report: calendarRead.report,
    options: options,
    makeCalendar: makeCalendar,
    put: put,
    get: calendarRead.gett,
    delete: calendarDel.del,
    move: calendarMove.move
};
function put(comm)
{
    LSE_logger.debug(`[Fennel-NG CalDAV] calendar.put called`);
    var eventUri = comm.getFilenameFromPath(false);
    var calendarUri = comm.getCalIdFromURL();
    var body = comm.getReqBody();
    var parser = require('../libs/parser');
    var pbody = parser.parseICS(body);
    var dtStart = moment(pbody.VCALENDAR.VEVENT.DTSTART);
    var dtEnd = moment(pbody.VCALENDAR.VEVENT.DTEND);
    var eventUID = pbody.VCALENDAR.VEVENT.UID;
    CALENDARS.findOne({ where: {uri: calendarUri} }).then(function(calendar) {
        if (!calendar) {
            LSE_logger.warn(`[Fennel-NG CalDAV] Calendar not found: ${calendarUri}`);
            comm.setResponseCode(404);
            comm.flushResponse();
            return;
        }
        var currentTime = Math.floor(Date.now() / 1000);
        var etag = require('crypto').createHash('md5').update(body + currentTime).digest('hex');
        var defaults = {
            calendarid: calendar.id,
            calendardata: Buffer.from(body),
            uri: eventUri,
            lastmodified: currentTime,
            etag: etag,
            size: body.length,
            componenttype: 'VEVENT',
            firstoccurence: dtStart.unix(),
            lastoccurence: dtEnd.unix(),
            uid: eventUID
        };
        CALENDAROBJECTS.findOrCreate({where: {uri: eventUri, calendarid: calendar.id}, defaults: defaults}).spread(function(calendarObject, created) {
            if (created) {
                LSE_logger.debug(`[Fennel-NG CalDAV] Created calendar object: ${eventUri}`);
            } else {
                var ifNoneMatch = comm.getHeader('If-None-Match');
                if (ifNoneMatch && ifNoneMatch === "*") {
                    LSE_logger.debug(`[Fennel-NG CalDAV] If-None-Match matches, return status code 412`);
                    comm.setStandardHeaders();
                    comm.setHeader("ETag", etag);
                    comm.setResponseCode(412);
                    comm.appendResBody(xh.getXMLHead());
                    comm.appendResBody("<d:error xmlns:d=\"DAV:\" xmlns:s=\"http://swordlord.org/ns\">");
                    comm.appendResBody("<s:exception>Fennel\\DAV\\Exception\\PreconditionFailed</s:exception>");
                    comm.appendResBody("<s:message>An If-None-Match header was specified, but the ETag matched (or * was specified).</s:message>");
                    comm.appendResBody("<s:header>If-None-Match</s:header>");
                    comm.appendResBody("</d:error>");
                    comm.flushResponse();
                    return;
                } else {
                    calendarObject.calendardata = Buffer.from(body);
                    calendarObject.lastmodified = currentTime;
                    calendarObject.etag = etag;
                    calendarObject.size = body.length;
                    calendarObject.firstoccurence = dtStart.unix();
                    calendarObject.lastoccurence = dtEnd.unix();
                    LSE_logger.debug(`[Fennel-NG CalDAV] Updated calendar object: ${eventUri}`);
                }
            }
            calendarObject.save().then(function() {
                LSE_logger.info(`[Fennel-NG CalDAV] calendar object saved`);
                updateCalendarSyncToken(calendar.id).then(function(newSyncToken) {
                    LSE_logger.info(`[Fennel-NG CalDAV] synctoken updated to: ${newSyncToken}`);
                    redis.set(`fennel:sync:cal:${calendar.id}`, newSyncToken);
                    redis.set(`fennel:etag:event:${eventUri}`, etag);
                    comm.setStandardHeaders();
                    comm.setHeader("ETag", etag);
                    comm.setResponseCode(created ? 201 : 200);
                    comm.flushResponse();
                }).catch(function(error) {
                    LSE_logger.error(`[Fennel-NG CalDAV] Error updating sync token: ${error}`);
                    comm.setResponseCode(500);
                    comm.flushResponse();
                });
            }).catch(function(error) {
                LSE_logger.error(`[Fennel-NG CalDAV] Error saving calendar object: ${error}`);
                comm.setResponseCode(500);
                comm.flushResponse();
            });
        }).catch(function(error) {
            LSE_logger.error(`[Fennel-NG CalDAV] Error creating/finding calendar object: ${error}`);
            comm.setResponseCode(500);
            comm.flushResponse();
        });
    }).catch(function(error) {
        LSE_logger.error(`[Fennel-NG CalDAV] Error finding calendar: ${error}`);
        comm.setResponseCode(500);
        comm.flushResponse();
    });
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
function makeCalendar(comm)
{
    LSE_logger.debug(`[Fennel-NG CalDAV] calendar.makeCalendar called`);
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = xmlDoc.get('/B:mkcalendar/A:set/A:prop', {
        A: 'DAV:',
        B: "urn:ietf:params:xml:ns:caldav",
        C: 'http://calendarserver.org/ns/',
        D: "http://apple.com/ns/ical/",
        E: "http://me.com/_namespace/"
    });
    var childs = node.childNodes();
    var timezone = '';
    var calendarorder = 0;
    var components = 'VEVENT';
    var calendarcolor = '#44A703FF';
    var displayname = 'New Calendar';
    var len = childs.length;
    if(len > 0)
    {
        for (var i=0; i < len; ++i)
        {
            var child = childs[i];
            var name = child.name();
            switch(name)
            {
                case 'calendar-color':
                    calendarcolor = child.text();
                    break;
                case 'displayname':
                    displayname = child.text();
                    break;
                case 'calendar-order':
                    calendarorder = parseInt(child.text()) || 0;
                    break;
                case 'supported-calendar-component-set':
                    components = "VEVENT";
                    break;
                case 'calendar-timezone':
                    timezone = child.text();
                    break;
                default:
                    if(name != 'text') LSE_logger.warn(`[Fennel-NG CalDAV] CAL-MK: not handled: ${name}`);
                    break;
            }
        }
        var username = comm.getUser().getUserName();
        var principalUri = 'principals/' + username;
        var calendarUri = comm.getCalIdFromURL();
        var defaults = {
            principaluri: principalUri,
            synctoken: 1,
            components: components,
            displayname: displayname,
            uri: calendarUri,
            description: 'Calendar created by Fennel-NG',
            calendarorder: calendarorder,
            calendarcolor: calendarcolor,
            timezone: timezone,
            transparent: 0,
            shared: 0
        };
        CALENDARS.findOrCreate({ where: {principaluri: principalUri, uri: calendarUri}, defaults: defaults }).spread(function(calendar, created) {
            if(created) {
                LSE_logger.debug(`[Fennel-NG CalDAV] Created CALENDAR: ${JSON.stringify(calendar, null, 4)}`);
                redis.set(`fennel:sync:cal:${calendar.id}`, calendar.synctoken);
            } else {
                LSE_logger.debug(`[Fennel-NG CalDAV] Calendar already exists: ${calendarUri}`);
            }
            calendar.save().then(function() {
                LSE_logger.info(`[Fennel-NG CalDAV] calendar saved`);
            });
            comm.setStandardHeaders();
            comm.setResponseCode(201);
            comm.flushResponse();
        }).catch(function(error) {
            LSE_logger.error(`[Fennel-NG CalDAV] Error creating calendar: ${error}`);
            comm.setResponseCode(500);
            comm.flushResponse();
        });
    }
    else
    {
        comm.setResponseCode(400);
        comm.flushResponse();
    }
}
function options(comm)
{
    LSE_logger.debug(`[Fennel-NG CalDAV] calendar.options called`);
    comm.pushOptionsResponse();
}
function proppatch(comm)
{
    LSE_logger.debug(`[Fennel-NG CalDAV] calendar.proppatch called`);
    comm.setStandardHeaders();
    comm.setResponseCode(200);
    comm.appendResBody(xh.getXMLHead());
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = xmlDoc.get('/A:propertyupdate/A:set/A:prop', {
        A: 'DAV:',
        B: "urn:ietf:params:xml:ns:caldav",
        C: 'http://calendarserver.org/ns/',
        D: "http://apple.com/ns/ical/",
        E: "http://me.com/_namespace/"
    });
    var childs = node.childNodes();
    var isRoot = true;
    if(comm.getUrlElementSize() > 4)
    {
        var lastPathElement = comm.getFilenameFromPath(false);
        if(comm.stringEndsWith(lastPathElement, '.ics'))
        {
            isRoot = false;
        }
    }
    var response = "";
    if(isRoot)
    {
        var calendarUri = comm.getCalIdFromURL();
        var username = comm.getUser().getUserName();
        var principalUri = 'principals/' + username;
        CALENDARS.findOne({ where: {principaluri: principalUri, uri: calendarUri} }).then(function(calendar) {
            if(calendar === null) {
                LSE_logger.warn(`[Fennel-NG CalDAV] Calendar not found`);
                var len = childs.length;
                for (var i=0; i < len; ++i) {
                    var child = childs[i];
                    var name = child.name();
                    switch(name) {
                        case 'default-alarm-vevent-date':
                            response += "<cal:default-alarm-vevent-date/>";
                            LSE_logger.info(`[Fennel-NG CalDAV] proppatch default-alarm-vevent-date not handled yet`);
                            break;
                        case 'default-alarm-vevent-datetime':
                            response += "<cal:default-alarm-vevent-datetime/>";
                            LSE_logger.info(`[Fennel-NG CalDAV] proppatch default-alarm-vevent-datetime not handled yet`);
                            break;
                        default:
                            if(name != 'text') LSE_logger.warn(`[Fennel-NG CalDAV] CAL-PP: not handled: ${name}`);
                            break;
                    }
                }
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">\r\n");
                comm.appendResBody("	<d:response>\r\n");
                comm.appendResBody("		<d:href>" + comm.getURL() + "</d:href>\r\n");
                comm.appendResBody("		<d:propstat>\r\n");
                comm.appendResBody("			<d:prop>\r\n");
                comm.appendResBody(response);
                comm.appendResBody("			</d:prop>\r\n");
                comm.appendResBody("			<d:status>HTTP/1.1 403 Forbidden</d:status>\r\n");
                comm.appendResBody("		</d:propstat>\r\n");
                comm.appendResBody("	</d:response>\r\n");
                comm.appendResBody("</d:multistatus>\r\n");
            } else {
                var len = childs.length;
                for (var i=0; i < len; ++i) {
                    var child = childs[i];
                    var name = child.name();
                    switch(name) {
                        case 'default-alarm-vevent-date':
                            response += "<cal:default-alarm-vevent-date/>";
                            LSE_logger.info(`[Fennel-NG CalDAV] proppatch default-alarm-vevent-date not handled yet`);
                            break;
                        case 'default-alarm-vevent-datetime':
                            response += "<cal:default-alarm-vevent-datetime/>";
                            LSE_logger.info(`[Fennel-NG CalDAV] proppatch default-alarm-vevent-datetime not handled yet`);
                            break;
                        case 'displayname':
                            response += "<cal:displayname>" + child.text() + "</cal:displayname>";
                            calendar.displayname = child.text();
                            break;
                        case 'calendar-timezone':
                            response += "<cal:calendar-timezone/>";
                            calendar.timezone = child.text();
                            break;
                        case 'calendar-color':
                            response += "<ical:calendar-color>" + child.text() + "</ical:calendar-color>";
                            calendar.calendarcolor = child.text();
                            break;
                        case 'calendar-order':
                            response += "<ical:calendar-order/>";
                            calendar.calendarorder = parseInt(child.text()) || 0;
                            break;
                        default:
                            if(name != 'text') LSE_logger.warn(`[Fennel-NG CalDAV] CAL-PP: not handled: ${name}`);
                            break;
                    }
                }
                calendar.save().then(function() {
                    updateCalendarSyncToken(calendar.id).then(function(newSyncToken) {
                        redis.set(`fennel:sync:cal:${calendar.id}`, newSyncToken);
                        LSE_logger.info(`[Fennel-NG CalDAV] calendar saved and sync token updated`);
                    });
                });
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">\r\n");
                comm.appendResBody("	<d:response>\r\n");
                comm.appendResBody("		<d:href>" + comm.getURL() + "</d:href>\r\n");
                comm.appendResBody("		<d:propstat>\r\n");
                comm.appendResBody("			<d:prop>\r\n");
                comm.appendResBody(response);
                comm.appendResBody("			</d:prop>\r\n");
                comm.appendResBody("			<d:status>HTTP/1.1 200 OK</d:status>\r\n");
                comm.appendResBody("		</d:propstat>\r\n");
                comm.appendResBody("	</d:response>\r\n");
                comm.appendResBody("</d:multistatus>\r\n");
            }
            comm.flushResponse();
        });
    }
}
