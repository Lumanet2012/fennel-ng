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
    
    // First return the calendar home collection response
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
    
    // Now find and return each individual calendar
    CALENDARS.findAll({ where: {principaluri: userPrincipalUri}, order: [['calendarorder', 'ASC']] }).then(function(calendars)
    {
        LSE_Logger.debug(`[Fennel-NG CalDAV] Database returned ${calendars.length} calendars for ${userPrincipalUri}`);
        
        for (var i = 0; i < calendars.length; i++)
        {
            var calendar = calendars[i];
            LSE_Logger.debug(`[Fennel-NG CalDAV] Processing calendar: ${calendar.uri} - ${calendar.displayname}`);
            
            // Each calendar gets its own response block
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
        
        // Also add outbox and notifications as per RFC
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
module.exports = {
    handleRoot: handleRoot,
    handleCalendar: handleCalendar
};
