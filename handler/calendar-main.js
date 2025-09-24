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
    LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForUser called - calendar discovery`);
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = xmlDoc.propfind;
    var requestedProps = node && node.prop ? Object.keys(node.prop) : [];
    var username = comm.getUser().getUserName();
    LSE_Logger.debug(`[Fennel-NG CalDAV] Calendar root discovery for user: ${username}`);
    LSE_Logger.debug(`[Fennel-NG CalDAV] Requested props: ${JSON.stringify(requestedProps)}`);
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:A=\"http://apple.com/ns/ical/\"\r\n>");
    comm.appendResBody("<d:response>\r\n");
    comm.appendResBody("<d:href>" + comm.getFullURL("/cal/") + "</d:href>\r\n");
    comm.appendResBody("<d:propstat>\r\n");
    comm.appendResBody("<d:prop>\r\n");
    for (var i = 0; i < requestedProps.length; i++) {
        var prop = requestedProps[i];
        switch(prop) {
            case 'resourcetype':
                comm.appendResBody("<d:resourcetype><d:collection/></d:resourcetype>\r\n");
                break;
            case 'displayname':
                comm.appendResBody("<d:displayname>Calendar Home</d:displayname>\r\n");
                break;
            case 'current-user-principal':
                comm.appendResBody("<d:current-user-principal><d:href>" + comm.getFullURL("/p/" + encodeURIComponent(username) + "/") + "</d:href></d:current-user-principal>\r\n");
                break;
            case 'calendar-home-set':
            case 'C:calendar-home-set':
                comm.appendResBody("<cal:calendar-home-set><d:href>" + comm.getFullURL("/cal/" + encodeURIComponent(username) + "/") + "</d:href></cal:calendar-home-set>\r\n");
                break;
            case 'owner':
                comm.appendResBody("<d:owner><d:href>" + comm.getFullURL("/p/" + encodeURIComponent(username) + "/") + "</d:href></d:owner>\r\n");
                break;
            case 'current-user-privilege-set':
                comm.appendResBody(calendarUtil.getCurrentUserPrivilegeSet());
                break;
            case 'supported-report-set':
                comm.appendResBody(calendarUtil.getSupportedReportSet(true));
                break;
            case 'A:calendar-color':
            case 'calendar-color':
                break;
        }
    }
    comm.appendResBody("</d:prop>\r\n");
    comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>\r\n");
    comm.appendResBody("</d:propstat>\r\n");
    comm.appendResBody("</d:response>\r\n");
    comm.appendResBody("</d:multistatus>\r\n");
    comm.flushResponse();
    LSE_Logger.debug(`[Fennel-NG CalDAV] Calendar discovery response sent`);
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

