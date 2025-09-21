// XML parsing temporarily disabled
var moment = require('moment');
var xh = require("../libs/xmlhelper");
var CALENDAROBJECTS = require('../libs/db').CALENDAROBJECTS;
var CALENDARS = require('../libs/db').CALENDARS;
var CALENDARCHANGES = require('../libs/db').CALENDARCHANGES;
module.exports = {
    propfind: propfind,
    proppatch: proppatch,
    report: report,
    options: options,
    makeCalendar: makeCalendar,
    put: put,
    get: gett,
    delete: del,
    move: move
};
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
        var calendarId = comm.getPathElement(3);
        CALENDARS.findOne({ where: {id: calendarId} }).then(function(cal)
        {
            if(cal === null)
            {
            response += "                <d:unbind/>";
            response += "            </d:privilege>";
            response += "            <d:privilege xmlns:d=\"DAV:\">";
            response += "                <d:unlock/>";
            response += "           </d:privilege>";
            response += "           <d:privilege xmlns:d=\"DAV:\">";
            response += "               <d:read/>";
            response += "           </d:privilege>";
            response += "           <d:privilege xmlns:d=\"DAV:\">";
            response += "                <d:read-acl/>";
            response += "           </d:privilege>";
            response += "           <d:privilege xmlns:d=\"DAV:\">";
            response += "               <d:read-current-user-privilege-set/>";
            response += "            </d:privilege>";
            response += "       </d:current-user-privilege-set>";
            response += "       <d:owner>";
            response += "           <d:href>/fennel-ng/p/" + username + "/</d:href>";
            response += "       </d:owner>";
            response += "       <d:resourcetype>";
            response += "           <d:collection/>";
            response += "           <cs:notification/>";
            response += "       </d:resourcetype>";
            response += "       <d:supported-report-set>";
            response += "           <d:supported-report>";
            response += "               <d:report>";
            response += "                   <d:expand-property/>";
            response += "               </d:report>";
            response += "           </d:supported-report>";
            response += "           <d:supported-report>";
            response += "               <d:report>";
            response += "                   <d:principal-property-search/>";
            response += "               </d:report>";
            response += "           </d:supported-report>";
            response += "          <d:supported-report>";
            response += "               <d:report>";
            response += "                  <d:principal-search-property-set/>";
            response += "              </d:report>";
            response += "           </d:supported-report>";
            response += "       </d:supported-report-set>";
            response += "   </d:prop>";
            response += "<d:status>HTTP/1.1 200 OK</d:status>";
            response += "</d:propstat>";
            response += "</d:response>";
            return response;
}LSE_Logger.warn(`[Fennel-NG CalDAV] err: could not find calendar`);
            }
            else
            {
                cal.destroy().then(function()
                {
                    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar deleted`);
                })
            }
            comm.flushResponse();
        });
    }
    else
    {
        var eventUri = comm.getFilenameFromPath(false);
        CALENDAROBJECTS.findOne( { where: {uri: eventUri}}).then(function(event)
        {
            if(event === null)
            {
                LSE_Logger.warn(`[Fennel-NG CalDAV] err: could not find calendar event`);
            }
            else
            {
                event.destroy().then(function()
                {
                    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar event deleted`);
                })
            }
            comm.flushResponse();
        });
    }
}
function gett(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.get called`);
    comm.setHeader("Content-Type", "text/calendar");
    var eventUri = comm.getFilenameFromPath(false);
    CALENDAROBJECTS.findOne( { where: {uri: eventUri}}).then(function(event)
    {
        if(event === null)
        {
            LSE_Logger.warn(`[Fennel-NG CalDAV] err: could not find calendar event`);
        }
        else
        {
            var content = event.calendardata.toString();
            comm.appendResBody(content);
        }
        comm.flushResponse();
    });
}
function put(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.put called`);
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
            LSE_Logger.error(`[Fennel-NG CalDAV] Calendar not found: ${calendarUri}`);
            comm.setResponseCode(404);
            comm.flushResponse();
            return;
        }
        var defaults = {
            calendarid: calendar.id,
            calendardata: Buffer.from(body),
            uri: eventUri,
            lastmodified: Math.floor(Date.now() / 1000),
            etag: require('crypto').createHash('md5').update(body).digest('hex'),
            size: Buffer.byteLength(body),
            componenttype: 'VEVENT',
            firstoccurence: Math.floor(dtStart.toDate().getTime() / 1000),
            lastoccurence: Math.floor(dtEnd.toDate().getTime() / 1000),
            uid: eventUID
        };
        CALENDAROBJECTS.findOrCreate({ where: {uri: eventUri}, defaults: defaults}).then(function(result) {
            var event = result[0];
            var created = result[1];
            if(created)
            {
                LSE_Logger.debug(`[Fennel-NG CalDAV] Created calendar event: ${eventUri}`);
            }
            else
            {
                var ifNoneMatch = comm.getHeader('If-None-Match');
                if(ifNoneMatch && ifNoneMatch === "*")
                {
                    LSE_Logger.debug(`[Fennel-NG CalDAV] If-None-Match matches, return status code 412`);
                    comm.setStandardHeaders();
                    var date = new Date();
                    comm.setHeader("ETag", Number(date));
                    comm.setResponseCode(412);
                    comm.appendResBody(xh.getXMLHead());
                    comm.appendResBody("<d:error xmlns:d=\"DAV:\" xmlns:s=\"http://swordlord.org/ns\">");
                    comm.appendResBody("<s:exception>Fennel\\DAV\\Exception\\PreconditionFailed</s:exception>");
                    comm.appendResBody("<s:message>An If-None-Match header was specified, but the ETag matched (or * was specified).</s:message>");
                    comm.appendResBody("<s:header>If-None-Match</s:header>");
                    comm.appendResBody("</d:error>");
                    comm.flushResponse();
                    return;
                }
                else
                {
                    event.calendardata = Buffer.from(body);
                    event.lastmodified = Math.floor(Date.now() / 1000);
                    event.etag = require('crypto').createHash('md5').update(body).digest('hex');
                    event.size = Buffer.byteLength(body);
                    event.firstoccurence = Math.floor(dtStart.toDate().getTime() / 1000);
                    event.lastoccurence = Math.floor(dtEnd.toDate().getTime() / 1000);
                    event.uid = eventUID;
                    LSE_Logger.debug(`[Fennel-NG CalDAV] Updated calendar event: ${eventUri}`);
                }
            }
            event.save().then(function()
            {
                LSE_Logger.info(`[Fennel-NG CalDAV] calendar event saved`);
                calendar.increment('synctoken', { by: 1 }).then(function()
                {
                    LSE_Logger.info(`[Fennel-NG CalDAV] synctoken on calendar updated`);
                });
                comm.setStandardHeaders();
                var date = new Date();
                comm.setHeader("ETag", event.etag);
                comm.setResponseCode(created ? 201 : 200);
                comm.flushResponse();
            });
        });
    });
}
function move(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.move called`);
    comm.setStandardHeaders();
    var eventUri = comm.getFilenameFromPath(false);
    var calendarUri = comm.getCalIdFromURL();
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
    if(destination.length > 0)
    {
        var aURL = destination.split("/");
        var newCalUri = aURL[aURL.length - 2];
        CALENDARS.findOne({ where: {uri: newCalUri} }).then(function(newCalendar) {
            if (!newCalendar) {
                LSE_Logger.error(`[Fennel-NG CalDAV] Destination calendar not found: ${newCalUri}`);
                comm.setResponseCode(404);
                comm.flushResponse();
                return;
            }
            CALENDAROBJECTS.findOne({ where: {uri: eventUri} }).then(function(event)
            {
                if(event === null)
                {
                    LSE_Logger.warn(`[Fennel-NG CalDAV] calendar event not found for move`);
                }
                else
                {
                    event.calendarid = newCalendar.id;
                    event.save().then(function()
                    {
                        LSE_Logger.info(`[Fennel-NG CalDAV] calendar event moved`);
                    });
                }
            });
        });
    }
    comm.setResponseCode(201);
    comm.flushResponse();
}
function propfind(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.propfind called`);
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = handler/calendar.js; // XML parsing disabled
    var childs = []; // XML disabled
    var username = comm.getUser().getUserName();
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
                handlePropfindForCalendarUri(comm, calendarUri);
                break;
        }
        return;
    }
    if(comm.getURL() === "/")
    {
        response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">";
        var len = childs.length;
        for (var i=0; i < len; ++i)
        {
            var child = childs[i];
            var name = child.name();
            switch(name)
            {
                case 'calendar-free-busy-set':
                    response += "<d:response><d:href>/</d:href></d:response>";
                    break;
                case 'current-user-principal':
                    response += "<d:response><d:href>/</d:href>";
                    response += "<d:propstat><d:prop><d:current-user-principal><d:href>/fennel-ng/p/" + username + "/</d:href></d:current-user-principal></d:prop>";
                    response += "<d:status>HTTP/1.1 200 OK</d:status>";
                    response += "</d:propstat>";
                    response += "</d:response>";
                    break;
                case 'principal-collection-set':
                    response += "<d:principal-collection-set><d:href>/fennel-ng/p/</d:href></d:principal-collection-set>";
                    break;
            }
        }
        response += "</d:multistatus>";
        comm.appendResBody(response);
        comm.flushResponse();
        return;
    }
}
function handlePropfindForCalendarInbox(comm)
{
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">");
    comm.appendResBody("<d:response><d:href>" + comm.getURL() + "</d:href>");
    comm.appendResBody("<d:propstat>");
    comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>");
    comm.appendResBody("</d:propstat>");
    comm.appendResBody("</d:response>");
    comm.appendResBody("</d:multistatus>");
    comm.flushResponse();
}
function handlePropfindForCalendarOutbox(comm)
{
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    var response = returnOutbox(comm);
    comm.appendResBody(response);
    comm.flushResponse();
}
function handlePropfindForCalendarNotifications(comm)
{
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">");
    comm.appendResBody("<d:response><d:href>" + comm.getURL() + "</d:href>");
    comm.appendResBody("<d:propstat>");
    comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>");
    comm.appendResBody("</d:propstat>");
    comm.appendResBody("</d:response>");
    comm.appendResBody("</d:multistatus>");
    comm.flushResponse();
}
function handlePropfindForCalendarUri(comm, calendarUri)
{
    CALENDARS.findOne({ where: {uri: calendarUri} }).then(function(cal)
    {
        comm.setStandardHeaders();
        comm.setDAVHeaders();
        comm.setResponseCode(207);
        comm.appendResBody(xh.getXMLHead());
        if(cal === null)
        {
            LSE_Logger.warn(`[Fennel-NG CalDAV] Calendar not found: ${calendarUri}`);
            comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">");
            comm.appendResBody("<d:response>");
            comm.appendResBody("<d:href>/fennel-ng/cal/" + comm.getUser().getUserName() + "/" + calendarUri + "/</d:href>");
            comm.appendResBody("<d:propstat>");
            comm.appendResBody("<d:status>HTTP/1.1 404 Not Found</d:status>");
            comm.appendResBody("</d:propstat>");
            comm.appendResBody("</d:response>");
            comm.appendResBody("</d:multistatus>");
        }
        else
        {
            var xmlDoc = xml.parseXml(comm.getReqBody());
    var node = handler/calendar.js; // XML parsing disabled
            var childs = []; // XML disabled
            var response = returnPropfindElements(comm, cal, childs);
            comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">");
            comm.appendResBody("<d:response><d:href>" + comm.getURL() + "</d:href>");
            if(response.length > 0)
            {
                comm.appendResBody("<d:propstat>");
                comm.appendResBody("<d:prop>");
                comm.appendResBody(response);
                comm.appendResBody("</d:prop>");
                comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>");
                comm.appendResBody("</d:propstat>");
            }
            else
            {
                comm.appendResBody("<d:propstat>");
                comm.appendResBody("<d:status>HTTP/1.1 404 Not Found</d:status>");
                comm.appendResBody("</d:propstat>");
            }
            comm.appendResBody("</d:response>");
            comm.appendResBody("</d:multistatus>");
        }
        comm.flushResponse();
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
    var node = handler/calendar.js; // XML parsing disabled
    if(nodeChecksum !== undefined)
    {
        response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">";
        response += "<d:response><d:href>" + comm.getURL() + "</d:href></d:response>";
        response += "</d:multistatus>";
        comm.appendResBody(response);
        comm.flushResponse();
    }
    else
    {
        var xmlDoc = xml.parseXml(comm.getReqBody());
    var node = handler/calendar.js; // XML parsing disabled
        var childs = []; // XML disabled
        response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">";
        response += getCalendarRootNodeResponse(comm, childs);
        var username = comm.getUserIdFromURL();
        var userPrincipalUri = 'principals/' + username;
        CALENDARS.findAll({ where: {principaluri: userPrincipalUri}, order: [['calendarorder', 'ASC']] }).then(function(calendars)
        {
            for (var i=0; i < calendars.length; ++i)
            {
                var calendar = calendars[i];
                response += returnCalendar(comm, calendar, childs);
            }
            response += returnOutbox(comm);
            response += returnNotifications(comm);
            response += "</d:multistatus>";
            comm.appendResBody(response);
            comm.flushResponse();
        });
    }
}
function returnPropfindElements(comm, calendar, childs)
{
    var response = "";
    var username = comm.getUser().getUserName();
    var token = calendar.synctoken;
    var len = childs.length;
    for (var i=0; i < len; ++i)
    {
        var child = childs[i];
        var name = child.name();
        switch(name)
        {
            case 'add-member':
                response += "";
                break;
            case 'allowed-sharing-modes':
                response += "<cs:allowed-sharing-modes><cs:can-be-shared/><cs:can-be-published/></cs:allowed-sharing-modes>";
                break;
            case 'autoprovisioned':
                response += "";
                break;
            case 'bulk-requests':
                response += "";
                break;
            case 'calendar-color':
                response += "<xical:calendar-color xmlns:xical=\"http://apple.com/ns/ical/\">" + calendar.calendarcolor + "</xical:calendar-color>";
                break;
            case 'calendar-description':
                response += "<cal:calendar-description>" + (calendar.description || "") + "</cal:calendar-description>";
                break;
            case 'calendar-free-busy-set':
                response += "";
                break;
            case 'calendar-order':
                response += "<xical:calendar-order xmlns:xical=\"http://apple.com/ns/ical/\">" + calendar.calendarorder + "</xical:calendar-order>";
                break;
            case 'calendar-timezone':
                var timezone = calendar.timezone || "";
                timezone = timezone.replace(/\r\n|\r|\n/g,'&#13;\r\n');
                response += "<cal:calendar-timezone>" + timezone + "</cal:calendar-timezone>";
                break;
            case 'current-user-privilege-set':
                response += getCurrentUserPrivilegeSet();
                break;
            case 'default-alarm-vevent-date':
                response += "";
                break;
            case 'default-alarm-vevent-datetime':
                response += "";
                break;
            case 'displayname':
                response += "<d:displayname>" + calendar.displayname + "</d:displayname>";
                break;
            case 'language-code':
                response += "";
                break;
            case 'location-code':
                response += "";
                break;
            case 'owner':
                response += "<d:owner><d:href>/fennel-ng/p/" + username +"/</d:href></d:owner>";
                break;
            case 'pre-publish-url':
                response += "<cs:pre-publish-url><d:href>https://127.0.0.1/fennel-ng/cal/" + username + "/" + calendar.uri + "</d:href></cs:pre-publish-url>";
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
            case 'refreshrate':
                response += "";
                break;
            case 'resource-id':
                response += "";
                break;
            case 'resourcetype':
                response += "<d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>";
                break;
            case 'schedule-calendar-transp':
                if (calendar.transparent) {
                    response += "<cal:schedule-calendar-transp><cal:transparent/></cal:schedule-calendar-transp>";
                } else {
                    response += "<cal:schedule-calendar-transp><cal:opaque/></cal:schedule-calendar-transp>";
                }
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
                response += "<cal:supported-calendar-component-set><cal:comp name=\"" + (calendar.components || "VEVENT") + "\"/></cal:supported-calendar-component-set>";
                break;
            case 'supported-report-set':
                response += getSupportedReportSet(false);
                break;
            case 'getctag':
                response += "<cs:getctag>http://swordlord.com/ns/sync/" + token + "</cs:getctag>";
                break;
            case 'getetag':
                break;
            case 'checksum-versions':
                break;
            case 'sync-token':
                response += "<d:sync-token>http://swordlord.com/ns/sync/" + token + "</d:sync-token>";
                break;
            case 'acl':
                response += getACL(comm);
                break;
            case 'getcontenttype':
                break;
            default:
                if(name != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] CAL-PF: not handled: ${name}`);
                break;
        }
    }
    return response;
}
function returnCalendar(comm, calendar, childs)
{
    var response = "";
    var username = comm.getUser().getUserName();
    response += "	<d:response>";
    response += "		<d:href>/fennel-ng/cal/" + username + "/" + calendar.uri + "/</d:href>";
    response += "		<d:propstat>";
    response += "			<d:prop>";
    response += returnPropfindElements(comm, calendar, childs);
    response += "			</d:prop>";
    response += "			<d:status>HTTP/1.1 200 OK</d:status>";
    response += "		</d:propstat>";
    response += "	</d:response>";
    return response;
}
function getCalendarRootNodeResponse(comm, childs)
{
    var response = "";
    var owner = comm.getUser().getUserName();
    response += "<d:response><d:href>" + comm.getURL() + "</d:href>";
    response += "<d:propstat>";
    response += "<d:prop>";
    var len = childs.length;
    for (var i = 0; i < len; ++i)
    {
        var child = childs[i];
        var name = child.name();
        switch(name)
        {
            case 'current-user-privilege-set':
                response += getCurrentUserPrivilegeSet();
                break;
            case 'owner':
                response += "<d:owner><d:href>/fennel-ng/p/" + owner +"/</d:href></d:owner>";
                break;
            case 'resourcetype':
                response += "<d:resourcetype><d:collection/></d:resourcetype>";
                break;
            case 'supported-report-set':
                response += getSupportedReportSet(true);
                break;
        }
    }
    response += "</d:prop>";
    response += "<d:status>HTTP/1.1 200 OK</d:status>";
    response += "</d:propstat>";
    response += "</d:response>";
    return response;
}
function getSupportedReportSet(isRoot)
{
    var response = "";
    response += "<d:supported-report-set>";
    if(!isRoot)
    {
        response += "<d:supported-report><d:report><cal:calendar-multiget/></d:report></d:supported-report>";
        response += "<d:supported-report><d:report><cal:calendar-query/></d:report></d:supported-report>";
        response += "<d:supported-report><d:report><cal:free-busy-query/></d:report></d:supported-report>";
    }
    response += "<d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>";
    response += "<d:supported-report><d:report><d:expand-property/></d:report></d:supported-report>";
    response += "<d:supported-report><d:report><d:principal-property-search/></d:report></d:supported-report>";
    response += "<d:supported-report><d:report><d:principal-search-property-set/></d:report></d:supported-report>";
    response += "</d:supported-report-set>";
    return response;
}
function getCurrentUserPrivilegeSet()
{
    var response = "";
    response += "<d:current-user-privilege-set>";
    response += "<d:privilege xmlns:d=\"DAV:\"><cal:read-free-busy/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-acl/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-content/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-properties/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:bind/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:unbind/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:unlock/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read-acl/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read-current-user-privilege-set/></d:privilege>";
    response += "</d:current-user-privilege-set>";
    return response;
}
function getACL(comm)
{
    var username = comm.getUser().getUserName();
    var response = "";
    response += "<d:acl>";
    response += "    <d:ace>";
    response += "        <d:principal><d:href>/fennel-ng/p/" + username + "</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:read/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";
    response += "    <d:ace>";
    response += "        <d:principal><d:href>/fennel-ng/p/" + username + "</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:write/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";
    response += "    <d:ace>";
    response += "        <d:principal><d:href>/fennel-ng/p/" + username + "/calendar-proxy-write/</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:read/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";
    response += "    <d:ace>";
    response += "        <d:principal><d:href>/fennel-ng/p/" + username + "/calendar-proxy-write/</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:write/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";
    response += "    <d:ace>";
    response += "        <d:principal><d:href>/fennel-ng/p/" + username + "/calendar-proxy-read/</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:read/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";
    response += "    <d:ace>";
    response += "        <d:principal><d:authenticated/></d:principal>";
    response += "        <d:grant><d:privilege><cal:read-free-busy/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";
    response += "    <d:ace>";
    response += "        <d:principal><d:href>/fennel-ng/p/system/admins/</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:all/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";
    response += "    </d:acl>";
    return response;
}
function makeCalendar(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.makeCalendar called`);
    var response = "";
    comm.setStandardHeaders();
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = handler/calendar.js; // XML parsing disabled
    var childs = []; // XML disabled
    var timezone = "";
    var calendarorder = 0;
    var components = "VEVENT";
    var calendarcolor = "#44A703FF";
    var displayname = "";
    var description = "";
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
                case 'calendar-free-busy-set':
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
                case 'calendar-description':
                    description = child.text();
                    break;
                default:
                    if(name != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] CAL-MK: not handled: ${name}`);
                    break;
            }
        }
        if(calendarcolor === undefined || calendarcolor.length === 0) { calendarcolor = "#0E61B9FF"; }
        var calendarUri = comm.getCalIdFromURL();
        var username = comm.getUser().getUserName();
        var principalUri = 'principals/' + username;
        var defaults = {
            principaluri: principalUri,
            uri: calendarUri,
            displayname: displayname,
            description: description,
            calendarorder: calendarorder,
            calendarcolor: calendarcolor,
            timezone: timezone,
            components: components,
            transparent: false,
            shared: false
        };
        CALENDARS.findOrCreate({ where: {uri: calendarUri}, defaults: defaults }).then(function(result)
            {
                var calendar = result[0];
                var created = result[1];
                if(created)
                {
                    LSE_Logger.debug(`[Fennel-NG CalDAV] Created calendar: ${calendarUri}`);
                }
                else
                {
                    LSE_Logger.debug(`[Fennel-NG CalDAV] Calendar already exists: ${calendarUri}`);
                }
                calendar.save().then(function()
                {
                    LSE_Logger.info(`[Fennel-NG CalDAV] calendar saved`);
                });
            });
        comm.setResponseCode(201);
        comm.appendResBody(response);
        comm.flushResponse();
    }
    else
    {
        comm.setResponseCode(500);
        comm.appendResBody(response);
        comm.flushResponse();
    }
}
function options(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.options called`);
    comm.pushOptionsResponse();
}
function report(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.report called`);
    comm.setStandardHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var rootNode = xmlDoc.root();
    var name = rootNode.name();
    switch(name)
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
            if(name != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${name}`);
            break;
    }
}
function handleReportCalendarQuery(comm, xmlDoc)
{
    var calendarUri = comm.getCalIdFromURL();
    CALENDARS.findOne({ where: {uri: calendarUri} }).then(function(calendar) {
        if (!calendar) {
            LSE_Logger.error(`[Fennel-NG CalDAV] Calendar not found for query: ${calendarUri}`);
            comm.setResponseCode(404);
            comm.flushResponse();
            return;
        }
        var filter = {calendarid: calendar.id};
    var node = handler/calendar.js; // XML parsing disabled
        if(nodeFilter !== undefined)
        {
            var attrs = nodeFilter.attrs();
            var len = attrs.length;
            for (var i=0; i < len; i++)
            {
                var attr = attrs[i];
                switch(attr.name())
                {
                    case 'start':
                        var filterStart = moment(attr.value());
                        filter.firstoccurence = { $gte: Math.floor(filterStart.toDate().getTime() / 1000) };
                        break;
                    case 'end':
                        var filterEnd = moment(attr.value());
                        filter.lastoccurence = { $lte: Math.floor(filterEnd.toDate().getTime() / 1000) };
                        break;
                    default:
                        break;
                }
            }
        }
        CALENDAROBJECTS.findAll( { where: filter}).then(function(events)
            {
    var node = handler/calendar.js; // XML parsing disabled
                var response = "";
                var nodeProps = nodeProp.childNodes();
                var len = nodeProps.length;
                var reqUrl = comm.getURL();
                reqUrl += reqUrl.match("\/$") ? "" : "/";
                for (var j=0; j < events.length; j++)
                {
                    var event = events[j];
                    response += "<d:response><d:href>" + reqUrl + event.uri + "</d:href>";
                    response += "<d:propstat>";
                    response += "<d:prop>";
                    for (var i=0; i < len; i++)
                    {
                        var child = nodeProps[i];
                        var name = child.name();
                        switch(name)
                        {
                            case 'getetag':
                                response += "<d:getetag>\"" + event.etag + "\"</d:getetag>";
                                break;
                            case 'getcontenttype':
                                response += "<d:getcontenttype>text/calendar; charset=utf-8; component=" + event.componenttype + "</d:getcontenttype>";
                                break;
                            case 'calendar-data':
                                response += "<cal:calendar-data>" + event.calendardata.toString() + "</cal:calendar-data>";
                                break;
                            default:
                                if(name != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${name}`);
                                break;
                        }
                    }
                    response += "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>";
                    response += "</d:response>";
                }
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">\r\n");
                comm.appendResBody(response);
                comm.appendResBody("</d:multistatus>");
                comm.flushResponse();
            });
    });
}
function handleReportSyncCollection(comm)
{
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = handler/calendar.js; // XML parsing disabled
    if(node != undefined)
    {
        var calendarUri = comm.getPathElement(3);
        CALENDARS.findOne({ where: {uri: calendarUri} }).then(function(calendar)
        {
            if (!calendar) {
                LSE_Logger.error(`[Fennel-NG CalDAV] Calendar not found for sync: ${calendarUri}`);
                comm.setResponseCode(404);
                comm.flushResponse();
                return;
            }
            CALENDAROBJECTS.findAll(
                { where: {calendarid: calendar.id}}
            ).then(function(events)
            {
                var response = "";
                for (var j=0; j < events.length; ++j)
                {
                    var event = events[j];
                    var childs = []; // XML disabled
                    var len = childs.length;
                    for (var i=0; i < len; ++i)
                    {
                        var child = childs[i];
                        var name = child.name();
                        switch(name)
                        {
                            case 'sync-token':
                                break;
                            case 'prop':
                                response += handleReportCalendarProp(comm, child, calendar, event);
                                break;
                            default:
                                if(name != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${name}`);
                                break;
                        }
                    }
                }
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">\r\n");
                comm.appendResBody(response);
                comm.appendResBody("<d:sync-token>http://swordlord.org/ns/sync/" + calendar.synctoken + "</d:sync-token>");
                comm.appendResBody("</d:multistatus>");
                comm.flushResponse();
            });
        });
    }
}
function handleReportCalendarProp(comm, node, calendar, event)
{
    var response = "";
    var reqUrl = comm.getURL();
    reqUrl += reqUrl.match("\/$") ? "" : "/";
    response += "<d:response>";
    response += "<d:href>" + reqUrl + event.uri + "</d:href>";
    response += "<d:propstat><d:prop>";
    var childs = []; // XML disabled
    var len = childs.length;
    for (var i=0; i < len; ++i)
    {
        var child = childs[i];
        var name = child.name();
        switch(name)
        {
            case 'getetag':
                response += "<d:getetag>\"" + event.etag + "\"</d:getetag>";
                break;
            case 'getcontenttype':
                response += "<d:getcontenttype>text/calendar; charset=utf-8; component=" + event.componenttype + "</d:getcontenttype>";
                break;
            default:
                if(name != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${name}`);
                break;
        }
    }
    response += "</d:prop>";
    response += "<d:status>HTTP/1.1 200 OK</d:status>";
    response += "</d:propstat>";
    response += "</d:response>";
    return response;
}
function handleReportCalendarMultiget(comm)
{
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = handler/calendar.js; // XML parsing disabled
    if(node != undefined)
    {
        var childs = []; // XML disabled
        var arrHrefs = [];
        var len = childs.length;
        for (var i=0; i < len; ++i)
        {
            var child = childs[i];
            var name = child.name();
            switch(name)
            {
                case 'prop':
                    break;
                case 'href':
                    arrHrefs.push(parseHrefToEventUri(child.text()));
                    break;
                default:
                    if(name != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${name}`);
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
    CALENDAROBJECTS.findAll( { where: {uri: arrEventUris}}).then(function(events)
    {
        var response = "";
        for (var i=0; i < events.length; ++i)
        {
            var event = events[i];
            var reqUrl = comm.getURL();
            reqUrl += reqUrl.match("\/$") ? "" : "/";
            response += "<d:response>";
            response += "<d:href>" + reqUrl + event.uri + "</d:href>";
            response += "<d:propstat><d:prop>";
            response += "<cal:calendar-data>" + event.calendardata.toString() + "</cal:calendar-data>";
            response += "<d:getetag>\"" + event.etag + "\"</d:getetag>";
            response += "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>";
            response += "<d:propstat><d:prop>";
            response += "<cs:created-by/><cs:updated-by/>";
            response += "</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>";
            response += "</d:response>";
        }
        comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">\r\n");
        comm.appendResBody(response);
        comm.appendResBody("</d:multistatus>\r\n");
        comm.flushResponse();
    });
}
function proppatch(comm)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.proppatch called`);
    comm.setStandardHeaders();
    comm.setResponseCode(200);
    comm.appendResBody(xh.getXMLHead());
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = handler/calendar.js; // XML parsing disabled
    var childs = []; // XML disabled
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
        CALENDARS.findOne({ where: {uri: calendarUri} }).then(function(calendar)
        {
            if(calendar === null)
            {
                LSE_Logger.warn(`[Fennel-NG CalDAV] Calendar not found for proppatch`);
                var len = childs.length;
                for (var i=0; i < len; ++i)
                {
                    var child = childs[i];
                    var name = child.name();
                    switch(name)
                    {
                        case 'default-alarm-vevent-date':
                            response += "<cal:default-alarm-vevent-date/>";
                            LSE_Logger.info(`[Fennel-NG CalDAV] proppatch default-alarm-vevent-date not handled yet`);
                            break;
                        case 'default-alarm-vevent-datetime':
                            response += "<cal:default-alarm-vevent-datetime/>";
                            LSE_Logger.info(`[Fennel-NG CalDAV] proppatch default-alarm-vevent-datetime not handled yet`);
                            break;
                        default:
                            if(name != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] CAL-PP: not handled: ${name}`);
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
            }
            else
            {
                var len = childs.length;
                for (var i=0; i < len; ++i)
                {
                    var child = childs[i];
                    var name = child.name();
                    switch(name)
                    {
                        case 'default-alarm-vevent-date':
                            response += "<cal:default-alarm-vevent-date/>";
                            LSE_Logger.info(`[Fennel-NG CalDAV] proppatch default-alarm-vevent-date not handled yet`);
                            break;
                        case 'default-alarm-vevent-datetime':
                            response += "<cal:default-alarm-vevent-datetime/>";
                            LSE_Logger.info(`[Fennel-NG CalDAV] proppatch default-alarm-vevent-datetime not handled yet`);
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
                        case 'calendar-description':
                            response += "<cal:calendar-description/>";
                            calendar.description = child.text();
                            break;
                        default:
                            if(name != 'text') LSE_Logger.warn(`[Fennel-NG CalDAV] CAL-PP: not handled: ${name}`);
                            break;
                    }
                }
                calendar.save().then(function()
                {
                    LSE_Logger.info(`[Fennel-NG CalDAV] calendar saved`);
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
function returnOutbox(comm)
{
    var response = "";
    var username = comm.getUser().getUserName();
    response += "<d:response>";
    response += "   <d:href>/fennel-ng/cal/" + username + "/outbox/</d:href>";
    response += "    <d:propstat>";
    response += "        <d:prop>";
    response += "            <d:current-user-privilege-set>";
    response += "               <d:privilege xmlns:d=\"DAV:\">";
    response += "                   <d:read/>";
    response += "               </d:privilege>";
    response += "               <d:privilege xmlns:d=\"DAV:\">";
    response += "                   <d:read-acl/>";
    response += "               </d:privilege>";
    response += "               <d:privilege xmlns:d=\"DAV:\">";
    response += "                   <d:read-current-user-privilege-set/>";
    response += "               </d:privilege>";
    response += "               <d:privilege xmlns:d=\"DAV:\">";
    response += "                   <d:schedule-post-vevent xmlns:d=\"urn:ietf:params:xml:ns:caldav\"/>";
    response += "               </d:privilege>";
    response += "               <d:privilege xmlns:d=\"DAV:\">";
    response += "                   <d:schedule-query-freebusy xmlns:d=\"urn:ietf:params:xml:ns:caldav\"/>";
    response += "               </d:privilege>";
    response += "           </d:current-user-privilege-set>";
    response += "           <d:owner>";
    response += "               <d:href>/fennel-ng/p/" + username + "/</d:href>";
    response += "           </d:owner>";
    response += "           <d:resourcetype>";
    response += "              <d:collection/>";
    response += "               <cal:schedule-outbox/>";
    response += "           </d:resourcetype>";
    response += "           <d:supported-report-set>";
    response += "              <d:supported-report>";
    response += "                   <d:report>";
    response += "                       <d:expand-property/>";
    response += "                   </d:report>";
    response += "               </d:supported-report>";
    response += "               <d:supported-report>";
    response += "                   <d:report>";
    response += "                       <d:principal-property-search/>";
    response += "                   </d:report>";
    response += "               </d:supported-report>";
    response += "               <d:supported-report>";
    response += "                    <d:report>";
    response += "                       <d:principal-search-property-set/>";
    response += "                   </d:report>";
    response += "               </d:supported-report>";
    response += "            </d:supported-report-set>";
    response += "       </d:prop>";
    response += "       <d:status>HTTP/1.1 200 OK</d:status>";
    response += "   </d:propstat>";
    response += "</d:response>";
    return response;
}
function returnNotifications(comm)
{
    var response = "";
    var username = comm.getUser().getUserName();
    response += "<d:response>";
    response += "<d:href>/fennel-ng/cal/" + username + "/notifications/</d:href>";
    response += "<d:propstat>";
    response += "    <d:prop>";
    response += "        <d:current-user-privilege-set>";
    response += "            <d:privilege xmlns:d=\"DAV:\">";
    response += "                <d:write/>";
    response += "           </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:write-acl/>";
    response += "           </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:write-properties/>";
    response += "          </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:write-content/>";
    response += "           </d:privilege>";
    response += "            <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:bind/>";
    response += "            </d:privilege>";
    response += "            <d:privilege xmlns:d=\"DAV:\">";
    response += "                <d:unbind/>";
    response += "            </d:privilege>";
    response += "            <d:privilege xmlns:d=\"DAV:\">";
    response += "                <d:unlock/>";
    response += "           </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:read/>";
    response += "           </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "                <d:read-acl/>";
    response += "           </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:read-current-user-privilege-set/>";
    response += "            </d:privilege>";
    response += "       </d:current-user-privilege-set>";
    response += "       <d:owner>";
    response += "           <d:href>/fennel-ng/p/" + username + "/</d:href>";
    response += "       </d:owner>";
    response += "       <d:resourcetype>";
    response += "           <d:collection/>";
    response += "           <cs:notification/>";
    response += "       </d:resourcetype>";
    response += "       <d:supported-report-set>";
    response += "           <d:supported-report>";
    response += "               <d:report>";
    response += "                   <d:expand-property/>";
    response += "               </d:report>";
    response += "           </d:supported-report>";
    response += "           <d:supported-report>";
    response += "               <d:report>";
    response += "                   <d:principal-property-search/>";
    response += "               </d:report>";
    response += "           </d:supported-report>";
    response += "          <d:supported-report>";
    response += "               <d:report>";
    response += "                  <d:principal-search-property-set/>";
    response += "              </d:report>";
    response += "           </d:supported-report>";
    response += "       </d:supported-report-set>";
    response += "   </d:prop>";
    response += "<d:status>HTTP/1.1 200 OK</d:status>";
    response += "</d:propstat>";
    response += "</d:response>";
    return response;
}


