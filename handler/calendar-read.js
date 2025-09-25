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
var moment = require('moment');
var config = require('../config').config;
var xh = require("../libs/xmlhelper");
var redis = require('../libs/redis');
var CALENDAROBJECTS = require('../libs/db').CALENDAROBJECTS;
var CALENDARS = require('../libs/db').CALENDARS;
var calendarUtil = require('./calendar-util');
module.exports = {
    propfind: propfind,
    report: report,
    gett: gett
};
function gett(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.get called`);
    comm.setHeader("Content-Type", "text/calendar");
    var eventUri = comm.getFilenameFromPath(false);
    CALENDAROBJECTS.findOne( { where: {uri: eventUri}}).then(function(calendarObject)
    {
        if(calendarObject === null)
        {
            LSE_Logger.warn(`[Fennel-NG CalDAV] err: could not find calendar event`);
        }
        else
        {
            var content = calendarObject.calendardata.toString();
            comm.appendResBody(content);
        }
        comm.flushResponse();
    });
}
function propfind(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.propfind called`);
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = xmlDoc.propfind;
    var childs = node && node.prop ? Object.keys(node.prop) : [];
    var username = comm.getusername();
    var caldav_username = comm.getcaldav_username();
    if(comm.getUrlElementSize() === 4)
    {
        handlePropfindForUser(comm);
        return;
    }
    var arrURL = comm.getURLAsArray();
    if(arrURL.length === 5)
    {
        var calendarUri = arrURL[3];
        switch (calendarUri) {
            case 'notifications':
                handlePropfindForCalendarNotifications(comm);
                break;
            case 'inbox':
                handlePropfindForCalendarInbox(comm);
                break;
            case 'outbox':
                handlePropfindForCalendarOutbox(comm);
                break;
            default:
                handlePropfindForCalendarId(comm, calendarUri);
                break;
        }
        return;
    }
}
function handlePropfindForCalendarInbox(comm)
{
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend);
    comm.appendResBody("<d:response><d:href>" + comm.getURL() + "</d:href>" + config.xml_lineend);
    comm.appendResBody("<d:propstat>" + config.xml_lineend);
    comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>" + config.xml_lineend);
    comm.appendResBody("</d:propstat>" + config.xml_lineend);
    comm.appendResBody("</d:response>" + config.xml_lineend);
    comm.appendResBody("</d:multistatus>" + config.xml_lineend);
    comm.flushResponse();
}
function handlePropfindForCalendarOutbox(comm)
{
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    var response = calendarUtil.returnOutbox(comm);
    comm.appendResBody(response);
    comm.flushResponse();
}
function handlePropfindForCalendarNotifications(comm)
{
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend);
    comm.appendResBody("<d:response><d:href>" + comm.getURL() + "</d:href>" + config.xml_lineend);
    comm.appendResBody("<d:propstat>" + config.xml_lineend);
    comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>" + config.xml_lineend);
    comm.appendResBody("</d:propstat>" + config.xml_lineend);
    comm.appendResBody("</d:response>" + config.xml_lineend);
    comm.appendResBody("</d:multistatus>" + config.xml_lineend);
    comm.flushResponse();
}
function handlePropfindForCalendarId(comm, calendarUri)
{
    var caldav_username = comm.getcaldav_username();
    var principalUri = 'principals/' + caldav_username;
    CALENDARS.findOne({ where: {principaluri: principalUri, uri: calendarUri} }).then(function(calendar)
    {
        comm.setStandardHeaders();
        comm.setDAVHeaders();
        comm.setResponseCode(207);
        comm.appendResBody(xh.getXMLHead());
        if(calendar === null)
        {
            LSE_Logger.warn(`[Fennel-NG CalDAV] Calendar not found: ${calendarUri}`);
            comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend);
            comm.appendResBody("<d:response>" + config.xml_lineend);
            comm.appendResBody("<d:href>/cal/" + comm.getcaldav_username() + "/" + calendarUri + "/</d:href>" + config.xml_lineend);
            comm.appendResBody("<d:propstat>" + config.xml_lineend);
            comm.appendResBody("<d:status>HTTP/1.1 404 Not Found</d:status>" + config.xml_lineend);
            comm.appendResBody("</d:propstat>" + config.xml_lineend);
            comm.appendResBody("</d:response>" + config.xml_lineend);
            comm.appendResBody("</d:multistatus>" + config.xml_lineend);
        }
        else
        {
            var xmlDoc = xml.parseXml(comm.getReqBody());
            var node = xmlDoc.propfind;
            var childs = node && node.prop ? Object.keys(node.prop) : [];
            var redisClient = redis.initializeRedis();
            redisClient.get(`sync:cal:${calendar.id}`).then(function(cachedSyncToken) {
                var syncToken = cachedSyncToken || calendar.synctoken;
                var response = returnPropfindElements(comm, calendar, childs, syncToken);
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend);
                comm.appendResBody("<d:response><d:href>" + comm.getURL() + "</d:href>" + config.xml_lineend);
                if(response.length > 0)
                {
                    comm.appendResBody("<d:propstat>" + config.xml_lineend);
                    comm.appendResBody("<d:prop>" + config.xml_lineend);
                    comm.appendResBody(response);
                    comm.appendResBody("</d:prop>" + config.xml_lineend);
                    comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>" + config.xml_lineend);
                    comm.appendResBody("</d:propstat>" + config.xml_lineend);
                }
                else
                {
                    comm.appendResBody("<d:propstat>" + config.xml_lineend);
                    comm.appendResBody("<d:status>HTTP/1.1 404 Not Found</d:status>" + config.xml_lineend);
                    comm.appendResBody("</d:propstat>" + config.xml_lineend);
                }
                comm.appendResBody("</d:response>" + config.xml_lineend);
                comm.appendResBody("</d:multistatus>" + config.xml_lineend);
                comm.flushResponse();
            }).catch(function(error) {
                LSE_Logger.error(`[Fennel-NG CalDAV] Redis error getting sync token: ${error}`);
                var response = returnPropfindElements(comm, calendar, childs, calendar.synctoken);
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend);
                comm.appendResBody("<d:response><d:href>" + comm.getURL() + "</d:href>" + config.xml_lineend);
                comm.appendResBody("<d:propstat>" + config.xml_lineend);
                comm.appendResBody("<d:prop>" + config.xml_lineend);
                comm.appendResBody(response);
                comm.appendResBody("</d:prop>" + config.xml_lineend);
                comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>" + config.xml_lineend);
                comm.appendResBody("</d:propstat>" + config.xml_lineend);
                comm.appendResBody("</d:response>" + config.xml_lineend);
                comm.appendResBody("</d:multistatus>" + config.xml_lineend);
                comm.flushResponse();
            });
        }
    });
}
function handlePropfindForUser(comm)
{
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    var response = "";
    var xmlDoc = xml.parseXml(comm.getReqBody());
    var nodeChecksum = xmlDoc['checksum-versions'];
    if(nodeChecksum !== undefined)
    {
        response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend;
        response += "<d:response><d:href>" + comm.getURL() + "</d:href></d:response>" + config.xml_lineend;
        response += "</d:multistatus>" + config.xml_lineend;
        comm.appendResBody(response);
        comm.flushResponse();
    }
    else
    {
        var xmlDoc = xml.parseXml(comm.getReqBody());
        var node = xmlDoc.propfind;
        var childs = node && node.prop ? Object.keys(node.prop) : [];
        response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend;
        response += getCalendarRootNodeResponse(comm, childs);
        var caldav_username = comm.getcaldav_username();
        var principalUri = 'principals/' + caldav_username;
        CALENDARS.findAndCountAll({ where: {principaluri: principalUri}, order: [['calendarorder', 'ASC']] }).then(function(result)
        {
            for (var i=0; i < result.count; ++i)
            {
                var calendar = result.rows[i];
                response += returnCalendar(comm, calendar, childs);
            }
            response += calendarUtil.returnOutbox(comm);
            response += calendarUtil.returnNotifications(comm);
            response += "</d:multistatus>";
            comm.appendResBody(response);
            comm.flushResponse();
        });
    }
}
function returnPropfindElements(comm, calendar, childs, syncToken)
{
    var response = "";
    var username = comm.getusername();
    var caldav_username = comm.getcaldav_username();
    var len = childs.length;
    for (var i=0; i < len; ++i)
    {
        var child = childs[i];
        switch(child)
        {
            case 'add-member':
                response += "";
                break;
            case 'allowed-sharing-modes':
                response += "<cs:allowed-sharing-modes><cs:can-be-shared/><cs:can-be-published/></cs:allowed-sharing-modes>" + config.xml_lineend;
                break;
            case 'autoprovisioned':
                response += "";
                break;
            case 'bulk-requests':
                response += "";
                break;
            case 'calendar-color':
                response += "<xical:calendar-color xmlns:xical=\"http://apple.com/ns/ical/\">" + calendar.calendarcolor + "</xical:calendar-color>" + config.xml_lineend;
                break;
            case 'calendar-description':
                response += "";
                break;
            case 'calendar-free-busy-set':
                response += "";
                break;
            case 'calendar-order':
                response += "<xical:calendar-order xmlns:xical=\"http://apple.com/ns/ical/\">" + calendar.calendarorder + "</xical:calendar-order>" + config.xml_lineend;
                break;
            case 'calendar-timezone':
                var timezone = calendar.timezone;
                if (timezone) {
                    timezone = timezone.replace(/\r\n|\r|\n/g,'&#13;' + config.xml_lineend);
                    response += "<cal:calendar-timezone>" + timezone + "</cal:calendar-timezone>" + config.xml_lineend;
                }
                break;
            case 'current-user-privilege-set':
                response += calendarUtil.getCurrentUserPrivilegeSet();
                break;
            case 'default-alarm-vevent-date':
                response += "";
                break;
            case 'default-alarm-vevent-datetime':
                response += "";
                break;
            case 'displayname':
                response += "<d:displayname>" + calendar.displayname + "</d:displayname>" + config.xml_lineend;
                break;
            case 'language-code':
                response += "";
                break;
            case 'location-code':
                response += "";
                break;
            case 'owner':
                response += "<d:owner><d:href>" + comm.getPrincipalURL() + "</d:href></d:owner>" + config.xml_lineend;
                break;
            case 'pre-publish-url':
                response += "<cs:pre-publish-url><d:href>https://127.0.0.1/cal/" + caldav_username + "/" + calendar.uri + "</d:href></cs:pre-publish-url>" + config.xml_lineend;
                break;
            case 'publish-url':
                response += "";
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
            case 'resourcetype':
                response += "<d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>" + config.xml_lineend;
                break;
            case 'displayname':
                response += "<d:displayname>" + calendar.displayname + "</d:displayname>" + config.xml_lineend;
                break;
            case 'current-user-privilege-set':
                response += calendarUtil.getCurrentUserPrivilegeSet();
                break;
            case 'refreshrate':
                response += "";
                break;
            case 'resource-id':
                response += "";
                break;
            case 'resourcetype':
                response += "<d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>" + config.xml_lineend;
                break;
            case 'schedule-calendar-transp':
                response += "<cal:schedule-calendar-transp><cal:opaque/></cal:schedule-calendar-transp>" + config.xml_lineend;
                break;
            case 'schedule-default-calendar-URL':
                response += "";
                break;
            case 'source':
                response += "";
                break;
            case 'subscribed-strip-alarms':
                response += "";
                break;
            case 'subscribed-strip-attachments':
                response += "";
                break;
            case 'subscribed-strip-todos':
                response += "";
                break;
            case 'supported-calendar-component-set':
                response += "";
                break;
            case 'supported-calendar-component-sets':
                response += "<cal:supported-calendar-component-set><cal:comp name=\"VEVENT\"/></cal:supported-calendar-component-set>" + config.xml_lineend;
                break;
            case 'supported-report-set':
                response += calendarUtil.getSupportedReportSet(false);
                break;
            case 'getctag':
                response += "<cs:getctag>" + comm.getFullURL("/sync/calendar/" + syncToken) + "</cs:getctag>" + config.xml_lineend;
                break;
            case 'getetag':
                break;
            case 'checksum-versions':
                break;
            case 'sync-token':
                response += "<d:sync-token>" + comm.getFullURL("/sync/calendar/" + syncToken) + "</d:sync-token>" + config.xml_lineend;
                break;
            case 'acl':
                response += calendarUtil.getACL(comm);
                break;
            case 'getcontenttype':
                break;
            default:
                if(child != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] CAL-PF: not handled: ${child}`);
                break;
        }
    }
    return response;
}
function returnCalendar(comm, calendar, childs)
{
    var response = "";
    response += "<d:response>" + config.xml_lineend;
    response += "<d:href>" + comm.getCalendarURL(null, calendar.uri) + "</d:href>" + config.xml_lineend;
    response += "<d:propstat>" + config.xml_lineend;
    response += "<d:prop>" + config.xml_lineend;
    response += returnPropfindElements(comm, calendar, childs, calendar.synctoken);
    response += "</d:prop>" + config.xml_lineend;
    response += "<d:status>HTTP/1.1 200 OK</d:status>" + config.xml_lineend;
    response += "</d:propstat>" + config.xml_lineend;
    response += "</d:response>" + config.xml_lineend;
    return response;
}
function getCalendarRootNodeResponse(comm, childs)
{
    var response = "";
    var username = comm.getusername();
    response += "<d:response><d:href>" + comm.getURL() + "</d:href>" + config.xml_lineend;
    response += "<d:propstat>" + config.xml_lineend;
    response += "<d:prop>" + config.xml_lineend;
    var len = childs.length;
    for (var i = 0; i < len; ++i)
    {
        var child = childs[i];
        switch(child)
        {
            case 'current-user-privilege-set':
                response += calendarUtil.getCurrentUserPrivilegeSet();
                break;
            case 'owner':
                response += "<d:owner><d:href>" + comm.getPrincipalURL() + "</d:href></d:owner>" + config.xml_lineend;
                break;
            case 'resourcetype':
                response += "<d:resourcetype><d:collection/></d:resourcetype>" + config.xml_lineend;
                break;
            case 'supported-report-set':
                response += calendarUtil.getSupportedReportSet(true);
                break;
        }
    }
    response += "</d:prop>" + config.xml_lineend;
    response += "<d:status>HTTP/1.1 200 OK</d:status>" + config.xml_lineend;
    response += "</d:propstat>" + config.xml_lineend;
    response += "</d:response>" + config.xml_lineend;
    return response;
}
function report(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.report called`);
    comm.setStandardHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    var body = comm.getReqBody();
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
            if(rootName != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${rootName}`);
            break;
    }
}
function handleReportCalendarQuery(comm, xmlDoc)
{
    var calendarUri = comm.getCalIdFromURL();
    var username = comm.getusername();
    var principalUri = 'principals/' + username;
    var filter = {calendarid: null};
    CALENDARS.findOne({ where: {principaluri: principalUri, uri: calendarUri} }).then(function(calendar) {
        if (!calendar) {
            LSE_Logger.warn(`[Fennel-NG CalDAV] Calendar not found for query: ${calendarUri}`);
            comm.setResponseCode(404);
            comm.flushResponse();
            return;
        }
        filter.calendarid = calendar.id;
        var nodeFilter = xmlDoc['cal:filter'] || xmlDoc.filter;
        if(nodeFilter !== undefined)
        {
            var attrs = nodeFilter.attrs ? nodeFilter.attrs : [];
            var len = attrs.length;
            for (var i=0; i < len; i++)
            {
                var attr = attrs[i];
                switch(attr.name())
                {
                    case 'start':
                        var filterStart = moment(attr.value());
                        filter.firstoccurence = { $gte: filterStart.unix() };
                        break;
                    case 'end':
                        var filterEnd = moment(attr.value());
                        filter.lastoccurence = { $lte: filterEnd.unix() };
                        break;
                    default:
                        break;
                }
            }
        }
        CALENDAROBJECTS.findAndCountAll( { where: filter}
            ).then(function(result)
            {
                var nodeProp = xmlDoc.prop;
                var response = "";
                var nodeProps = nodeProp ? Object.keys(nodeProp) : [];
                var len = nodeProps.length;
                var reqUrl = comm.getURL();
                reqUrl += reqUrl.match("\/$") ? "" : "/";
                for (var j=0; j < result.count; j++)
                {
                    var calendarObject = result.rows[j];
                    response += "<d:response><d:href>" + reqUrl + calendarObject.uri + "</d:href>";
                    response += "<d:propstat>";
                    response += "<d:prop>";
                    for (var i=0; i < len; i++)
                    {
                        var child = nodeProps[i];
                        switch(child)
                        {
                            case 'getetag':
                                response += "<d:getetag>\"" + calendarObject.etag + "\"</d:getetag>" + config.xml_lineend;
                                break;
                            case 'getcontenttype':
                                response += "<d:getcontenttype>text/calendar; charset=utf-8; component=" + calendarObject.componenttype + "</d:getcontenttype>" + config.xml_lineend;
                                break;
                            case 'calendar-data':
                                response += "<cal:calendar-data>" + calendarObject.calendardata.toString() + "</cal:calendar-data>" + config.xml_lineend;
                                break;
                            default:
                                if(child != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${child}`);
                                break;
                        }
                    }
                    response += "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>" + config.xml_lineend;
                    response += "</d:response>" + config.xml_lineend;
                }
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">" + config.xml_lineend);
                comm.appendResBody(response);
                comm.appendResBody("</d:multistatus>" + config.xml_lineend);
                comm.flushResponse();
            });
    });
}
function handleReportSyncCollection(comm)
{
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var syncTokenNode = xmlDoc['sync-token'];
    if(syncTokenNode != undefined)
    {
        var calendarUri = comm.getPathElement(3);
        var username = comm.getusername();
        var principalUri = 'principals/' + username;
        CALENDARS.findOne({ where: {principaluri: principalUri, uri: calendarUri} }).then(function(calendar)
        {
            if (!calendar) {
                LSE_Logger.warn(`[Fennel-NG CalDAV] Calendar not found for sync: ${calendarUri}`);
                comm.setResponseCode(404);
                comm.flushResponse();
                return;
            }
            CALENDAROBJECTS.findAndCountAll(
                { where: {calendarid: calendar.id}}
            ).then(function(result)
            {
                var response = "";
                for (var j=0; j < result.count; ++j)
                {
                    var calendarObject = result.rows[j];
                    var nodeProps = xmlDoc.prop ? Object.keys(xmlDoc.prop) : [];
                    var len = nodeProps.length;
                    for (var i=0; i < len; ++i)
                    {
                        var child = nodeProps[i];
                        switch(child)
                        {
                            case 'sync-token':
                                break;
                            case 'prop':
                                response += handleReportCalendarProp(comm, xmlDoc, calendar, calendarObject);
                                break;
                            default:
                                if(child != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${child}`);
                                break;
                        }
                    }
                }
                var redisClient = redis.initializeRedis();
                redisClient.get(`sync:cal:${calendar.id}`).then(function(cachedSyncToken) {
                    var syncToken = cachedSyncToken || calendar.synctoken;
                    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">" + config.xml_lineend);
                    comm.appendResBody(response);
                    comm.appendResBody("<d:sync-token>" + comm.getFullURL("/sync/calendar/" + syncToken) + "</d:sync-token>" + config.xml_lineend);
                    comm.appendResBody("</d:multistatus>" + config.xml_lineend);
                    comm.flushResponse();
                }).catch(function(error) {
                    LSE_Logger.error(`[Fennel-NG CalDAV] Redis error in sync collection: ${error}`);
                    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">" + config.xml_lineend);
                    comm.appendResBody(response);
                    comm.appendResBody("<d:sync-token>" + comm.getFullURL("/sync/calendar/" + calendar.synctoken) + "</d:sync-token>" + config.xml_lineend);
                    comm.appendResBody("</d:multistatus>" + config.xml_lineend);
                    comm.flushResponse();
                });
            });
        });
    }
}
function handleReportCalendarProp(comm, xmlDoc, calendar, calendarObject)
{
    var response = "";
    var reqUrl = comm.getURL();
    reqUrl += reqUrl.match("\/$") ? "" : "/";
    response += "<d:response>" + config.xml_lineend;
    response += "<d:href>" + reqUrl + calendarObject.uri + "</d:href>" + config.xml_lineend;
    response += "<d:propstat><d:prop>" + config.xml_lineend;
    var nodeProps = xmlDoc.prop ? Object.keys(xmlDoc.prop) : [];
    var len = nodeProps.length;
    for (var i=0; i < len; ++i)
    {
        var child = nodeProps[i];
        switch(child)
        {
            case 'getetag':
                response += "<d:getetag>\"" + calendarObject.etag + "\"</d:getetag>" + config.xml_lineend;
                break;
            case 'getcontenttype':
                response += "<d:getcontenttype>text/calendar; charset=utf-8; component=" + calendarObject.componenttype + "</d:getcontenttype>" + config.xml_lineend;
                break;
            default:
                if(child != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${child}`);
                break;
        }
    }
    response += "</d:prop>" + config.xml_lineend;
    response += "<d:status>HTTP/1.1 200 OK</d:status>" + config.xml_lineend;
    response += "</d:propstat>" + config.xml_lineend;
    response += "</d:response>" + config.xml_lineend;
    return response;
}
function handleReportCalendarMultiget(comm)
{
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var hrefNodes = xmlDoc.href;
    if(hrefNodes != undefined)
    {
        var arrHrefs = [];
        if(Array.isArray(hrefNodes)) {
            arrHrefs = hrefNodes.map(function(href) { return parseHrefToEventUri(href); });
        } else {
            arrHrefs.push(parseHrefToEventUri(hrefNodes));
        }
        var len = arrHrefs.length;
        for (var i=0; i < len; ++i)
        {
            var child = arrHrefs[i];
            switch(child)
            {
                case 'prop':
                    break;
                case 'href':
                    arrHrefs.push(parseHrefToEventUri(child));
                    break;
                default:
                    if(child != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${child}`);
                    break;
            }
        }
        handleReportHrefs(comm, arrHrefs);
    }
}
function parseHrefToEventUri(href)
{
    var e = href.split("/");
    var uri = e[e.length - 1];
    return uri;
}
function handleReportHrefs(comm, arrEventUris)
{
    CALENDAROBJECTS.findAndCountAll( { where: {uri: arrEventUris}}).then(function(result)
    {
        var response = "";
        for (var i=0; i < result.count; ++i)
        {
            var calendarObject = result.rows[i];
            var reqUrl = comm.getURL();
            reqUrl += reqUrl.match("\/$") ? "" : "/";
            response += "<d:response>" + config.xml_lineend;
            response += "<d:href>" + reqUrl + calendarObject.uri + "</d:href>" + config.xml_lineend;
            response += "<d:propstat><d:prop>" + config.xml_lineend;
            response += "<cal:calendar-data>" + calendarObject.calendardata.toString() + "</cal:calendar-data>" + config.xml_lineend;
            response += "<d:getetag>\"" + calendarObject.etag + "\"</d:getetag>" + config.xml_lineend;
            response += "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>" + config.xml_lineend;
            response += "<d:propstat><d:prop>" + config.xml_lineend;
            response += "<cs:created-by/><cs:updated-by/>" + config.xml_lineend;
            response += "</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>" + config.xml_lineend;
            response += "</d:response>" + config.xml_lineend;
        }
        comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">" + config.xml_lineend);
        comm.appendResBody(response);
        comm.appendResBody("</d:multistatus>" + config.xml_lineend);
        comm.flushResponse();
    });
}

