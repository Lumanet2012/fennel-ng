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
var CALENDAROBJECTS = require('../libs/db').CALENDAROBJECTS;
var CALENDARS = require('../libs/db').CALENDARS;
var calendarUtil = require('./calendar-util');
var calendarRead = require('./calendar-read');
var calendarWrite = require('./calendar-write');
var calendarDel = require('./calendar-del');
var calendarMove = require('./calendar-move');
function handleRoot(comm)
{
    var method = comm.getReq().method;
    switch(method)
    {
        case 'PROPFIND':
            handlePropfindForUser(comm);
            break;
        case 'PROPPATCH':
            proppatch(comm);
            break;
        case 'OPTIONS':
            options(comm);
            break;
        case 'REPORT':
            calendarRead.report(comm);
            break;
        case 'MKCALENDAR':
            mkcalendar(comm);
            break;
        default:
            var res = comm.getRes();
            LSE_Logger.info(`[Fennel-NG CalDAV] Request method is unknown: ${method}`);
            res.writeHead(500);
            res.write(method + " is not implemented yet");
            res.end();
            break;
    }
}
function handleCalendar(comm)
{
    var method = comm.getReq().method;
    switch(method)
    {
        case 'PROPFIND':
            calendarRead.propfind(comm);
            break;
        case 'PROPPATCH':
            proppatch(comm);
            break;
        case 'OPTIONS':
            options(comm);
            break;
        case 'REPORT':
            calendarRead.report(comm);
            break;
        case 'PUT':
            calendarWrite.put(comm);
            break;
        case 'GET':
            calendarRead.gett(comm);
            break;
        case 'DELETE':
            calendarDel.del(comm);
            break;
        case 'MOVE':
            calendarMove.move(comm);
            break;
        case 'MKCALENDAR':
            mkcalendar(comm);
            break;
        default:
            var res = comm.getRes();
            LSE_Logger.info(`[Fennel-NG CalDAV] Request method is unknown: ${method}`);
            res.writeHead(500);
            res.write(method + " is not implemented yet");
            res.end();
            break;
    }
}
function handlePropfindForUser(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForUser called`);
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = xmlDoc.propfind;
    var requestedProps = node && node.prop ? Object.keys(node.prop) : [];
    var username = comm.getUser().getUserName();
    var userPrincipalUri = 'principals/' + username;
    LSE_Logger.debug(`[Fennel-NG CalDAV] Finding calendars for user: ${userPrincipalUri}`);
    LSE_Logger.debug(`[Fennel-NG CalDAV] Requested props: ${JSON.stringify(requestedProps)}`);
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:A=\"http://apple.com/ns/ical/\">");
    comm.appendResBody("<d:response>");
    comm.appendResBody("<d:href>" + comm.getFullURL("/cal/" + username + "/") + "</d:href>");
    comm.appendResBody("<d:propstat>");
    comm.appendResBody("<d:prop>");
    for (var i = 0; i < requestedProps.length; i++) {
        var prop = requestedProps[i];
        switch(prop) {
            case 'resourcetype':
                comm.appendResBody("<d:resourcetype><d:collection/></d:resourcetype>");
                break;
            case 'displayname':
                comm.appendResBody("<d:displayname>Calendar Home</d:displayname>");
                break;
            case 'owner':
                comm.appendResBody("<d:owner><d:href>" + comm.getFullURL("/p/" + username + "/") + "</d:href></d:owner>");
                break;
            case 'current-user-privilege-set':
                comm.appendResBody(calendarUtil.getCurrentUserPrivilegeSet());
                break;
            case 'supported-report-set':
                comm.appendResBody(calendarUtil.getSupportedReportSet(true));
                break;
        }
    }
    comm.appendResBody("</d:prop>");
    comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>");
    comm.appendResBody("</d:propstat>");
    comm.appendResBody("</d:response>");
    CALENDARS.findAll({ where: {principaluri: userPrincipalUri}, order: [['calendarorder', 'ASC']] }).then(function(calendars)
    {
        LSE_Logger.debug(`[Fennel-NG CalDAV] Database returned ${calendars.length} calendars for ${userPrincipalUri}`);
        for (var i = 0; i < calendars.length; i++)
        {
            var calendar = calendars[i];
            LSE_Logger.debug(`[Fennel-NG CalDAV] Processing calendar: ${calendar.uri} - ${calendar.displayname}`);
            comm.appendResBody("<d:response>");
            comm.appendResBody("<d:href>" + comm.getFullURL("/cal/" + username + "/" + calendar.uri + "/") + "</d:href>");
            comm.appendResBody("<d:propstat>");
            comm.appendResBody("<d:prop>");
            for (var j = 0; j < requestedProps.length; j++) {
                var prop = requestedProps[j];
                switch(prop) {
                    case 'resourcetype':
                        comm.appendResBody("<d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>");
                        break;
                    case 'displayname':
                        comm.appendResBody("<d:displayname>" + (calendar.displayname || 'Calendar') + "</d:displayname>");
                        break;
                    case 'owner':
                        comm.appendResBody("<d:owner><d:href>" + comm.getFullURL("/p/" + username + "/") + "</d:href></d:owner>");
                        break;
                    case 'current-user-privilege-set':
                        comm.appendResBody(calendarUtil.getCurrentUserPrivilegeSet());
                        break;
                    case 'supported-report-set':
                        comm.appendResBody(calendarUtil.getSupportedReportSet(false));
                        break;
                    case 'calendar-color':
                    case 'A:calendar-color':
                        if(calendar.calendarcolor) {
                            comm.appendResBody("<A:calendar-color>" + calendar.calendarcolor + "</A:calendar-color>");
                        }
                        break;
                    case 'calendar-order':
                    case 'A:calendar-order':
                        comm.appendResBody("<A:calendar-order>" + (calendar.calendarorder || 0) + "</A:calendar-order>");
                        break;
                    case 'supported-calendar-component-set':
                        comm.appendResBody("<cal:supported-calendar-component-set>");
                        var components = calendar.components;
                        if (Buffer.isBuffer(components)) {
                            components = components.toString('utf8');
                        } else if (components === null || components === undefined) {
                            components = 'VEVENT';
                        }
                        var componentArray = components.split(',');
                        for(var k = 0; k < componentArray.length; k++) {
                            var component = componentArray[k].trim();
                            comm.appendResBody("<cal:comp name=\"" + component + "\"/>");
                        }
                        comm.appendResBody("</cal:supported-calendar-component-set>");
                        break;
                    case 'getctag':
                        comm.appendResBody("<cs:getctag>" + comm.getFullURL("/sync/calendar/" + calendar.synctoken) + "</cs:getctag>");
                        break;
                    case 'sync-token':
                        comm.appendResBody("<d:sync-token>" + comm.getFullURL("/sync/calendar/" + calendar.synctoken) + "</d:sync-token>");
                        break;
                }
            }
            comm.appendResBody("</d:prop>");
            comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>");
            comm.appendResBody("</d:propstat>");
            comm.appendResBody("</d:response>");
        }
        comm.appendResBody("<d:response>");
        comm.appendResBody("<d:href>" + comm.getFullURL("/cal/" + username + "/outbox/") + "</d:href>");
        comm.appendResBody("<d:propstat>");
        comm.appendResBody("<d:prop>");
        comm.appendResBody("<d:resourcetype><d:collection/><cal:schedule-outbox/></d:resourcetype>");
        comm.appendResBody("</d:prop>");
        comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>");
        comm.appendResBody("</d:propstat>");
        comm.appendResBody("</d:response>");
        comm.appendResBody("<d:response>");
        comm.appendResBody("<d:href>" + comm.getFullURL("/cal/" + username + "/notifications/") + "</d:href>");
        comm.appendResBody("<d:propstat>");
        comm.appendResBody("<d:prop>");
        comm.appendResBody("<d:resourcetype><d:collection/><cs:notification/></d:resourcetype>");
        comm.appendResBody("</d:prop>");
        comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>");
        comm.appendResBody("</d:propstat>");
        comm.appendResBody("</d:response>");
        comm.appendResBody("</d:multistatus>");
        comm.flushResponse();
        LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForUser completed successfully`);
    }).catch(function(error) {
        LSE_Logger.error(`[Fennel-NG CalDAV] Error finding calendars: ${error.message}`);
        LSE_Logger.error(`[Fennel-NG CalDAV] Stack trace: ${error.stack}`);
        comm.setResponseCode(500);
        comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\">");
        comm.appendResBody("<d:response>");
        comm.appendResBody("<d:href>" + comm.getFullURL("/cal/" + username + "/") + "</d:href>");
        comm.appendResBody("<d:propstat>");
        comm.appendResBody("<d:status>HTTP/1.1 500 Internal Server Error</d:status>");
        comm.appendResBody("</d:propstat>");
        comm.appendResBody("</d:response>");
        comm.appendResBody("</d:multistatus>");
        comm.flushResponse();
    });
}
function options(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.options called`);
    comm.setHeader("Content-Type", "text/html");
    comm.setHeader("Server", "Fennel-NG");
    comm.setHeader("DAV", "1, 2, 3, calendar-access, calendar-schedule");
    comm.setHeader("Allow", "OPTIONS, PROPFIND, HEAD, GET, REPORT, PROPPATCH, PUT, DELETE, POST, COPY, MOVE, MKCALENDAR");
    comm.setResponseCode(200);
    comm.flushResponse();
}
function proppatch(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.proppatch called`);
    comm.setStandardHeaders();
    comm.setResponseCode(200);
    comm.appendResBody(xh.getXMLHead());
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\">");
    comm.appendResBody("<d:response>");
    comm.appendResBody("<d:href>" + comm.getURL() + "</d:href>");
    comm.appendResBody("<d:propstat>");
    comm.appendResBody("<d:prop/>");
    comm.appendResBody("<d:status>HTTP/1.1 403 Forbidden</d:status>");
    comm.appendResBody("</d:propstat>");
    comm.appendResBody("</d:response>");
    comm.appendResBody("</d:multistatus>");
    comm.flushResponse();
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
module.exports = {
    handleRoot: handleRoot,
    handleCalendar: handleCalendar
};
