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
var calendarUtil = require('./calendar-util');
var calendarRead = require('./calendar-read');
var calendarDel = require('./calendar-del');
var calendarMove = require('./calendar-move');
var db = require('../libs/db');
var CALENDARS = db.CALENDARS;
var CALENDAROBJECTS = db.CALENDAROBJECTS;
var moment = require('moment');
var uuid = require('uuid');
var xh = require('../libs/xmlhelper');
function handleRoot(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.handleRoot called`);
    if(comm.getReq().method == 'PROPFIND')
    {
        handlePropfindForUser(comm);
    }
    else if(comm.getReq().method == 'REPORT')
    {
        report(comm);
    }
    else if(comm.getReq().method == 'OPTIONS')
    {
        options(comm);
    }
    else
    {
        LSE_Logger.warn(`[Fennel-NG CalDAV] Method not handled: ${comm.getReq().method}`);
        comm.setResponseCode(405);
        comm.flushResponse();
    }
}
function handleCalendar(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.handleCalendar called`);
    var method = comm.getReq().method;
    switch(method)
    {
        case 'PROPFIND':
            calendarRead.propfind(comm);
            break;
        case 'PUT':
            put(comm);
            break;
        case 'DELETE':
            calendarDel.del(comm);
            break;
        case 'MOVE':
            calendarMove.move(comm);
            break;
        case 'REPORT':
            calendarRead.report(comm);
            break;
        case 'MKCALENDAR':
            makeCalendar(comm);
            break;
        case 'OPTIONS':
            options(comm);
            break;
        case 'PROPPATCH':
            proppatch(comm);
            break;
        default:
            LSE_Logger.warn(`[Fennel-NG CalDAV] Method not handled: ${method}`);
            comm.setResponseCode(405);
            comm.flushResponse();
            break;
    }
}
function put(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.put called`);
    var username = comm.getUser().getUserName();
    var principalUri = 'principals/' + username;
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
        CALENDAROBJECTS.findOrCreate({
            where: { uri: eventUri, calendarid: calendar.id },
            defaults: {
                calendardata: calendarData,
                uri: eventUri,
                calendarid: calendar.id,
                lastmodified: Math.floor(Date.now() / 1000),
                etag: etag,
                size: calendarData.length,
                componenttype: componentType,
                firstoccurence: firstOccurrence,
                lastoccurence: lastOccurrence,
                uid: eventUid
            }
        }).then(function(result) {
            var calendarObject = result[0];
            var created = result[1];
            if(!created) {
                calendarObject.calendardata = calendarData;
                calendarObject.lastmodified = Math.floor(Date.now() / 1000);
                calendarObject.etag = etag;
                calendarObject.size = calendarData.length;
                calendarObject.componenttype = componentType;
                calendarObject.firstoccurence = firstOccurrence;
                calendarObject.lastoccurence = lastOccurrence;
                calendarObject.uid = eventUid;
                calendarObject.save().then(function() {
                    updateCalendarSyncToken(calendar.id).then(function() {
                        LSE_Logger.info(`[Fennel-NG CalDAV] Calendar object updated: ${eventUri}`);
                        comm.setResponseCode(200);
                        comm.flushResponse();
                    });
                });
            } else {
                updateCalendarSyncToken(calendar.id).then(function() {
                    LSE_Logger.info(`[Fennel-NG CalDAV] Calendar object created: ${eventUri}`);
                    comm.setResponseCode(created ? 201 : 200);
                    comm.flushResponse();
                }).catch(function(error) {
                    LSE_Logger.error(`[Fennel-NG CalDAV] Error updating sync token: ${error}`);
                    comm.setResponseCode(500);
                    comm.flushResponse();
                });
            }
        }).catch(function(error) {
            LSE_Logger.error(`[Fennel-NG CalDAV] Error creating/finding calendar object: ${error}`);
            comm.setResponseCode(500);
            comm.flushResponse();
        });
    }).catch(function(error) {
        LSE_Logger.error(`[Fennel-NG CalDAV] Error finding calendar: ${error}`);
        comm.setResponseCode(500);
        comm.flushResponse();
    });
}
function extractUidFromCalendarData(calendarData)
{
    var matches = calendarData.match(/UID:([^\r\n]+)/i);
    return matches ? matches[1] : uuid.v4();
}
function extractComponentTypeFromCalendarData(calendarData)
{
    var matches = calendarData.match(/BEGIN:(VEVENT|VTODO|VJOURNAL)/i);
    return matches ? matches[1] : 'VEVENT';
}
function extractFirstOccurrence(calendarData)
{
    var matches = calendarData.match(/DTSTART[^:]*:([^\r\n]+)/i);
    if(matches) {
        try {
            var dateStr = matches[1];
            if(dateStr.includes('T')) {
                return moment(dateStr, 'YYYYMMDD[T]HHmmss[Z]').unix();
            } else {
                return moment(dateStr, 'YYYYMMDD').unix();
            }
        } catch(e) {
            return Math.floor(Date.now() / 1000);
        }
    }
    return Math.floor(Date.now() / 1000);
}
function extractLastOccurrence(calendarData)
{
    var matches = calendarData.match(/DTEND[^:]*:([^\r\n]+)/i);
    if(matches) {
        try {
            var dateStr = matches[1];
            if(dateStr.includes('T')) {
                return moment(dateStr, 'YYYYMMDD[T]HHmmss[Z]').unix();
            } else {
                return moment(dateStr, 'YYYYMMDD').unix();
            }
        } catch(e) {
            return Math.floor(Date.now() / 1000) + 3600;
        }
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
function makeCalendar(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.makeCalendar called`);
    var body = comm.getReqBody();
    var timezone = '';
    var calendarorder = 0;
    var components = 'VEVENT';
    var calendarcolor = '#44A703FF';
    var displayname = 'New Calendar';
    if(body && body.trim().length > 0) {
        try {
            var xmlDoc = xml.parseXml(body);
            if(xmlDoc && xmlDoc.mkcalendar && xmlDoc.mkcalendar.set && xmlDoc.mkcalendar.set.prop) {
                var props = xmlDoc.mkcalendar.set.prop;
                if(props.displayname) {
                    displayname = props.displayname;
                }
                if(props['calendar-color']) {
                    calendarcolor = props['calendar-color'];
                }
                if(props['calendar-order']) {
                    calendarorder = parseInt(props['calendar-order']) || 0;
                }
                if(props['supported-calendar-component-set']) {
                    components = 'VEVENT,VTODO';
                }
                if(props['calendar-timezone']) {
                    timezone = props['calendar-timezone'];
                }
            }
        } catch(error) {
            LSE_Logger.warn(`[Fennel-NG CalDAV] Error parsing MKCALENDAR XML: ${error.message}`);
        }
    }
    var username = comm.getUser().getUserName();
    var principalUri = 'principals/' + username;
    var calendarUri = comm.getCalIdFromURL();
    CALENDARS.create({
        principaluri: principalUri,
        synctoken: 1,
        components: components,
        displayname: displayname,
        uri: calendarUri,
        description: `Calendar for ${username}`,
        calendarorder: calendarorder,
        calendarcolor: calendarcolor,
        timezone: timezone,
        transparent: 0,
        shared: null
    }).then(function(calendar) {
        LSE_Logger.info(`[Fennel-NG CalDAV] Calendar created: ${calendarUri}`);
        comm.setResponseCode(201);
        comm.flushResponse();
    }).catch(function(error) {
        LSE_Logger.error(`[Fennel-NG CalDAV] Error creating calendar: ${error}`);
        if(error.name === 'SequelizeUniqueConstraintError') {
            comm.setResponseCode(405);
        } else {
            comm.setResponseCode(500);
        }
        comm.flushResponse();
    });
}
function options(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.options called`);
    comm.pushOptionsResponse();
}
function proppatch(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.proppatch called`);
    comm.setStandardHeaders();
    comm.setResponseCode(200);
    comm.appendResBody(xh.getXMLHead());
    var body = comm.getReqBody();
    var response = "";
    var isRoot = true;
    if(comm.getUrlElementSize() > 4)
    {
        var lastPathElement = comm.getFilenameFromPath(false);
        if(comm.stringEndsWith(lastPathElement, '.ics'))
        {
            isRoot = false;
        }
    }
    if(isRoot)
    {
        var calendarUri = comm.getCalIdFromURL();
        var username = comm.getUser().getUserName();
        var principalUri = 'principals/' + username;
        CALENDARS.findOne({ where: {principaluri: principalUri, uri: calendarUri} }).then(function(calendar) {
            if(calendar === null) {
                LSE_Logger.warn(`[Fennel-NG CalDAV] Calendar not found for PROPPATCH`);
                response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\">";
                response += "<d:response>";
                response += "<d:href>" + comm.getURL() + "</d:href>";
                response += "<d:propstat>";
                response += "<d:status>HTTP/1.1 404 Not Found</d:status>";
                response += "</d:propstat>";
                response += "</d:response>";
                response += "</d:multistatus>";
                comm.appendResBody(response);
                comm.flushResponse();
                return;
            }
            response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\">";
            response += "<d:response>";
            response += "<d:href>" + comm.getURL() + "</d:href>";
            response += "<d:propstat>";
            response += "<d:prop>";
            if(body && body.trim().length > 0) {
                try {
                    var xmlDoc = xml.parseXml(body);
                    if(xmlDoc && xmlDoc.propertyupdate && xmlDoc.propertyupdate.set && xmlDoc.propertyupdate.set.prop) {
                        var props = xmlDoc.propertyupdate.set.prop;
                        var updated = false;
                        if(props.displayname && props.displayname !== calendar.displayname) {
                            calendar.displayname = props.displayname;
                            updated = true;
                        }
                        if(props['calendar-color'] && props['calendar-color'] !== calendar.calendarcolor) {
                            calendar.calendarcolor = props['calendar-color'];
                            updated = true;
                        }
                        if(props['calendar-order'] && parseInt(props['calendar-order']) !== calendar.calendarorder) {
                            calendar.calendarorder = parseInt(props['calendar-order']);
                            updated = true;
                        }
                        if(updated) {
                            calendar.save();
                        }
                    }
                } catch(error) {
                    LSE_Logger.warn(`[Fennel-NG CalDAV] Error parsing PROPPATCH XML: ${error.message}`);
                }
            }
            response += "</d:prop>";
            response += "<d:status>HTTP/1.1 200 OK</d:status>";
            response += "</d:propstat>";
            response += "</d:response>";
            response += "</d:multistatus>";
            comm.appendResBody(response);
            comm.flushResponse();
        }).catch(function(error) {
            LSE_Logger.error(`[Fennel-NG CalDAV] Database error in PROPPATCH: ${error}`);
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
function handlePropfindForUser(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForUser called`);
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    var response = "";
    response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">";
    response += getCalendarRootNodeResponse(comm, []);
    var username = comm.getUser().getUserName();
    var userPrincipalUri = 'principals/' + username;
    LSE_Logger.debug(`[Fennel-NG CalDAV] Finding calendars for user: ${userPrincipalUri}`);
    CALENDARS.findAll({ where: {principaluri: userPrincipalUri}, order: [['calendarorder', 'ASC']] }).then(function(calendars)
    {
        LSE_Logger.debug(`[Fennel-NG CalDAV] Found ${calendars.length} calendars for user ${username}`);
        for (var i=0; i < calendars.length; ++i)
        {
            var calendar = calendars[i];
            LSE_Logger.debug(`[Fennel-NG CalDAV] Processing calendar ${i}: ${JSON.stringify({id: calendar.id, uri: calendar.uri, displayname: calendar.displayname, components: calendar.components})}`);
            LSE_Logger.debug(`[Fennel-NG CalDAV] Calendar components type: ${typeof calendar.components}, value: ${calendar.components}`);
            LSE_Logger.debug(`[Fennel-NG CalDAV] Calendar components Buffer check: ${Buffer.isBuffer(calendar.components)}`);
            try {
                response += returnCalendar(comm, calendar, []);
                LSE_Logger.debug(`[Fennel-NG CalDAV] Successfully processed calendar ${calendar.uri}`);
            } catch (error) {
                LSE_Logger.error(`[Fennel-NG CalDAV] Error processing calendar ${calendar.uri}: ${error.message}`);
                LSE_Logger.error(`[Fennel-NG CalDAV] Calendar object: ${JSON.stringify(calendar.dataValues || calendar)}`);
                LSE_Logger.error(`[Fennel-NG CalDAV] Stack trace: ${error.stack}`);
                throw error;
            }
        }
        response += calendarUtil.returnOutbox(comm);
        response += calendarUtil.returnNotifications(comm);
        response += "</d:multistatus>";
        comm.appendResBody(response);
        comm.flushResponse();
        LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForUser completed successfully`);
    }).catch(function(error) {
        LSE_Logger.error(`[Fennel-NG CalDAV] Error finding calendars: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG CalDAV] Stack trace: ${error.stack}`);
        comm.setResponseCode(500);
        comm.flushResponse();
    });
}
function getCalendarRootNodeResponse(comm, childs)
{
    var username = comm.getUser().getUserName();
    var response = "";
    response += "<d:response>";
    response += "<d:href>" + comm.getFullURL(comm.getURL()) + "</d:href>";
    response += "<d:propstat>";
    response += "<d:prop>";
    response += "<d:displayname>Calendar Home</d:displayname>";
    response += "<d:owner><d:href>" + comm.getPrincipalURL(username) + "</d:href></d:owner>";
    response += "<d:resourcetype><d:collection/></d:resourcetype>";
    response += calendarUtil.getSupportedReportSet(true);
    response += calendarUtil.getCurrentUserPrivilegeSet();
    response += "</d:prop>";
    response += "<d:status>HTTP/1.1 200 OK</d:status>";
    response += "</d:propstat>";
    response += "</d:response>";
    return response;
}
function returnCalendar(comm, calendar, childs)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] returnCalendar called for calendar: ${calendar.uri}`);
    LSE_Logger.debug(`[Fennel-NG CalDAV] Calendar components at start of returnCalendar: type=${typeof calendar.components}, value="${calendar.components}", isBuffer=${Buffer.isBuffer(calendar.components)}`);
    var username = comm.getUser().getUserName();
    var response = "";
    response += "<d:response>";
    response += "<d:href>" + comm.getCalendarURL(username, calendar.uri) + "</d:href>";
    response += "<d:propstat>";
    response += "<d:prop>";
    response += "<d:displayname>" + (calendar.displayname || 'Calendar') + "</d:displayname>";
    response += "<d:owner><d:href>" + comm.getPrincipalURL(username) + "</d:href></d:owner>";
    response += "<d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>";
    response += "<cal:supported-calendar-component-set>";
    var components;
    if (Buffer.isBuffer(calendar.components)) {
        LSE_Logger.debug(`[Fennel-NG CalDAV] Converting Buffer to string for components`);
        components = calendar.components.toString('utf8');
        LSE_Logger.debug(`[Fennel-NG CalDAV] Converted components: "${components}"`);
    } else if (typeof calendar.components === 'string') {
        components = calendar.components;
        LSE_Logger.debug(`[Fennel-NG CalDAV] Using string components: "${components}"`);
    } else if (calendar.components === null || calendar.components === undefined) {
        LSE_Logger.debug(`[Fennel-NG CalDAV] Components is null/undefined, using default`);
        components = 'VEVENT';
    } else {
        LSE_Logger.warn(`[Fennel-NG CalDAV] Unexpected components type: ${typeof calendar.components}, value: ${calendar.components}`);
        components = 'VEVENT';
    }
    try {
        if (typeof components !== 'string') {
            throw new Error(`Components is not a string after processing: type=${typeof components}, value=${components}`);
        }
        var componentArray = components.split(',');
        LSE_Logger.debug(`[Fennel-NG CalDAV] Split components into array: ${JSON.stringify(componentArray)}`);
        for(var i = 0; i < componentArray.length; i++) {
            var component = componentArray[i].trim();
            LSE_Logger.debug(`[Fennel-NG CalDAV] Adding component: "${component}"`);
            response += "<cal:comp name=\"" + component + "\"/>";
        }
    } catch (splitError) {
        LSE_Logger.error(`[Fennel-NG CalDAV] Error splitting components: ${splitError.message}`);
        LSE_Logger.error(`[Fennel-NG CalDAV] Components value: ${components}, type: ${typeof components}`);
        response += "<cal:comp name=\"VEVENT\"/>";
    }
    response += "</cal:supported-calendar-component-set>";
    response += "<d:sync-token>http://sabre.io/ns/sync/" + (calendar.synctoken || 1) + "</d:sync-token>";
    if(calendar.calendarcolor) {
        response += "<xical:calendar-color xmlns:xical=\"http://apple.com/ns/ical/\">" + calendar.calendarcolor + "</xical:calendar-color>";
    }
    if(calendar.calendarorder !== null && calendar.calendarorder !== undefined) {
        response += "<xical:calendar-order xmlns:xical=\"http://apple.com/ns/ical/\">" + calendar.calendarorder + "</xical:calendar-order>";
    }
    response += calendarUtil.getSupportedReportSet(false);
    response += calendarUtil.getCurrentUserPrivilegeSet();
    response += "</d:prop>";
    response += "<d:status>HTTP/1.1 200 OK</d:status>";
    response += "</d:propstat>";
    response += "</d:response>";
    LSE_Logger.debug(`[Fennel-NG CalDAV] returnCalendar completed for calendar: ${calendar.uri}`);
    return response;
}
function report(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.report called`);
    comm.setStandardHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    var body = comm.getReqBody();
    if(!body || body.trim().length === 0) {
        comm.setResponseCode(400);
        comm.flushResponse();
        return;
    }
    try {
        var xmlDoc = xml.parseXml(body);
        var rootKeys = Object.keys(xmlDoc);
        var rootName = rootKeys[0];
        switch(rootName)
        {
            case 'sync-collection':
                handleReportSyncCollection(comm);
                break;
            case 'calendar-multiget':
                handleReportCalendarMultiget(comm);
                break;
            case 'calendar-query':
                handleReportCalendarQuery(comm, xmlDoc);
                break;
            default:
                LSE_Logger.warn(`[Fennel-NG CalDAV] Report type not handled: ${rootName}`);
                comm.setResponseCode(400);
                comm.flushResponse();
                break;
        }
    } catch(error) {
        LSE_Logger.error(`[Fennel-NG CalDAV] Error parsing report XML: ${error.message}`);
        comm.setResponseCode(400);
        comm.flushResponse();
    }
}
function handleReportSyncCollection(comm)
{
    var response = "";
    response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\">";
    response += "<d:response>";
    response += "<d:href>" + comm.getURL() + "</d:href>";
    response += "<d:propstat>";
    response += "<d:prop>";
    response += "<d:sync-token>http://sabre.io/ns/sync/1</d:sync-token>";
    response += "</d:prop>";
    response += "<d:status>HTTP/1.1 200 OK</d:status>";
    response += "</d:propstat>";
    response += "</d:response>";
    response += "</d:multistatus>";
    comm.appendResBody(response);
    comm.flushResponse();
}
function handleReportCalendarMultiget(comm)
{
    var response = "";
    response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\">";
    response += "</d:multistatus>";
    comm.appendResBody(response);
    comm.flushResponse();
}
function handleReportCalendarQuery(comm, xmlDoc)
{
    var response = "";
    response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\">";
    response += "</d:multistatus>";
    comm.appendResBody(response);
    comm.flushResponse();
}
module.exports = {
    handleRoot: handleRoot,
    handleCalendar: handleCalendar
};
