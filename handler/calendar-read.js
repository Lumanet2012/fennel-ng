const {XMLParser}=require('fast-xml-parser');
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text",parseAttributeValue:true});
const xml={parseXml:function(body){return parser.parse(body);}};
const moment=require('moment');
const config=require('../config').config;
const xh=require("../libs/xmlhelper");
const redis=require('../libs/redis');
const calendarobjects=require('../libs/db').CALENDAROBJECTS;
const calendars=require('../libs/db').CALENDARS;
const calendarutil=require('./calendar-util');
const calendarreport=require('./calendar-report');
function gett(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] gett`);
    }
    comm.setHeader("Content-Type","text/calendar");
    const eventuri=comm.getFilenameFromPath(false);
    calendarobjects.findOne({where:{uri:eventuri}}).then(function(calendarobject){
        if(calendarobject===null){
            if(config.LSE_Loglevel>=1){
                LSE_Logger.warn(`[Fennel-NG CalDAV] err: could not find calendar event`);
            }
        }else{
            const content=calendarobject.calendardata.toString();
            comm.appendResBody(content);
        }
        comm.flushResponse();
    });
}
function propfind(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] propfind`);
    }
    const body=comm.getReqBody();
    const xmldoc=xml.parseXml(body);
    const node=xmldoc.propfind;
    const childs=node&&node.prop?Object.keys(node.prop):[];
    const username=comm.getusername();
    const caldav_username=comm.getcaldav_username();
    if(comm.getUrlElementSize()===4){
        handlepropfindforuser(comm);
        return;
    }
    const arrurl=comm.getURLAsArray();
    if(arrurl.length===5){
        const calendaruri=arrurl[3];
        switch(calendaruri){
            case 'notifications':
                handlepropfindforcalendarnotifications(comm);
                break;
            case 'inbox':
                handlepropfindforcalendarinbox(comm);
                break;
            case 'outbox':
                handlepropfindforcalendaroutbox(comm);
                break;
            default:
                handlepropfindforcalendarid(comm,calendaruri);
                break;
        }
        return;
    }
}
function handlepropfindforuser(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForUser`);
    }
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    const body=comm.getReqBody();
    const xmldoc=xml.parseXml(body);
    const node=xmldoc.propfind||xmldoc['D:propfind'];
    const propnode=node&&(node.prop||node['D:prop']);
    const requestedprops=propnode?Object.keys(propnode):[];
    const username=comm.getusername();
    const caldav_username=comm.getcaldav_username();
    const principaluri='principals/'+caldav_username;
    calendars.findAndCountAll({where:{principaluri:principaluri}}).then(function(result){
        let response="";
        response+="<d:response>"+config.xml_lineend;
        response+="<d:href>"+comm.getURL()+"</d:href>"+config.xml_lineend;
        response+="<d:propstat>"+config.xml_lineend;
        response+="<d:prop>"+config.xml_lineend;
        const len=requestedprops.length;
        for(let i=0;i<len;i++){
            const prop=requestedprops[i];
            switch(prop){
                case 'resourcetype':
                case 'D:resourcetype':
                    response+="<d:resourcetype><d:collection/></d:resourcetype>"+config.xml_lineend;
                    break;
                case 'displayname':
                case 'D:displayname':
                    response+="<d:displayname>Calendar Home</d:displayname>"+config.xml_lineend;
                    break;
                case 'current-user-principal':
                case 'D:current-user-principal':
                    response+="<d:current-user-principal><d:href>"+comm.getPrincipalURL()+"</d:href></d:current-user-principal>"+config.xml_lineend;
                    break;
                case 'current-user-privilege-set':
                case 'D:current-user-privilege-set':
                    response+=calendarutil.getCurrentUserPrivilegeSet();
                    break;
                case 'owner':
                case 'D:owner':
                    response+="<d:owner><d:href>"+comm.getPrincipalURL()+"</d:href></d:owner>"+config.xml_lineend;
                    break;
                case 'calendar-home-set':
                case 'C:calendar-home-set':
                    response+="<cal:calendar-home-set><d:href>"+comm.getCalendarURL()+"</d:href></cal:calendar-home-set>"+config.xml_lineend;
                    break;
                case 'calendar-color':
                case 'A:calendar-color':
                    break;
                default:
                    break;
            }
        }
        response+="</d:prop>"+config.xml_lineend;
        response+="<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend;
        response+="</d:propstat>"+config.xml_lineend;
        response+="</d:response>"+config.xml_lineend;
        for(let i=0;i<result.count;++i){
            const calendar=result.rows[i];
            response+=returncalendar(comm,calendar,requestedprops);
        }
        response+=calendarutil.returnOutbox(comm);
        response+=calendarutil.returnNotifications(comm);
        response+="</d:multistatus>"+config.xml_lineend;
        comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
        comm.appendResBody(response);
        comm.flushResponse();
    });
}
function handlepropfindforcalendarinbox(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForCalendarInbox`);
    }
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
    comm.appendResBody("<d:response><d:href>"+comm.getURL()+"</d:href>"+config.xml_lineend);
    comm.appendResBody("<d:propstat>"+config.xml_lineend);
    comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend);
    comm.appendResBody("</d:propstat>"+config.xml_lineend);
    comm.appendResBody("</d:response>"+config.xml_lineend);
    comm.appendResBody("</d:multistatus>"+config.xml_lineend);
    comm.flushResponse();
}
function handlepropfindforcalendaroutbox(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForCalendarOutbox`);
    }
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    const response=calendarutil.returnOutbox(comm);
    comm.appendResBody(response);
    comm.flushResponse();
}
function handlepropfindforcalendarnotifications(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForCalendarNotifications`);
    }
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
    comm.appendResBody("<d:response><d:href>"+comm.getURL()+"</d:href>"+config.xml_lineend);
    comm.appendResBody("<d:propstat>"+config.xml_lineend);
    comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend);
    comm.appendResBody("</d:propstat>"+config.xml_lineend);
    comm.appendResBody("</d:response>"+config.xml_lineend);
    comm.appendResBody("</d:multistatus>"+config.xml_lineend);
    comm.flushResponse();
}
function handlepropfindforcalendarid(comm,calendaruri){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForCalendarId`);
    }
    const caldav_username=comm.getcaldav_username();
    const principaluri='principals/'+caldav_username;
    calendars.findOne({where:{principaluri:principaluri,uri:calendaruri}}).then(function(calendar){
        comm.setStandardHeaders();
        comm.setDAVHeaders();
        comm.setResponseCode(207);
        comm.appendResBody(xh.getXMLHead());
        if(calendar===null){
            if(config.LSE_Loglevel>=1){
                LSE_Logger.warn(`[Fennel-NG CalDAV] Calendar not found: ${calendaruri}`);
            }
            comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
            comm.appendResBody("<d:response>"+config.xml_lineend);
            comm.appendResBody("<d:href>/cal/"+comm.getcaldav_username()+"/"+calendaruri+"/</d:href>"+config.xml_lineend);
            comm.appendResBody("<d:propstat>"+config.xml_lineend);
            comm.appendResBody("<d:status>HTTP/1.1 404 Not Found</d:status>"+config.xml_lineend);
            comm.appendResBody("</d:propstat>"+config.xml_lineend);
            comm.appendResBody("</d:response>"+config.xml_lineend);
            comm.appendResBody("</d:multistatus>"+config.xml_lineend);
        }else{
            const xmldoc=xml.parseXml(comm.getReqBody());
            const node=xmldoc.propfind;
            const childs=node&&node.prop?Object.keys(node.prop):[];
            const redisclient=redis.initializeredis();
            redisclient.get(`sync:cal:${calendar.id}`).then(function(cachedsynctoken){
                const synctoken=cachedsynctoken||calendar.synctoken;
                const response=returnpropfindelements(comm,calendar,childs,synctoken);
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
                comm.appendResBody("<d:response><d:href>"+comm.getURL()+"</d:href>"+config.xml_lineend);
                if(response.length>0){
                    comm.appendResBody("<d:propstat>"+config.xml_lineend);
                    comm.appendResBody("<d:prop>"+config.xml_lineend);
                    comm.appendResBody(response);
                    comm.appendResBody("</d:prop>"+config.xml_lineend);
                    comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend);
                    comm.appendResBody("</d:propstat>"+config.xml_lineend);
                }else{
                    comm.appendResBody("<d:propstat>"+config.xml_lineend);
                    comm.appendResBody("<d:status>HTTP/1.1 404 Not Found</d:status>"+config.xml_lineend);
                    comm.appendResBody("</d:propstat>"+config.xml_lineend);
                }
                comm.appendResBody("</d:response>"+config.xml_lineend);
                comm.appendResBody("</d:multistatus>"+config.xml_lineend);
            }).catch(function(error){
                if(config.LSE_Loglevel>=1){
                    LSE_Logger.error(`[Fennel-NG CalDAV] Redis error getting sync token: ${error}`);
                }
                const response=returnpropfindelements(comm,calendar,childs,calendar.synctoken);
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
                comm.appendResBody("<d:response><d:href>"+comm.getURL()+"</d:href>"+config.xml_lineend);
                comm.appendResBody("<d:propstat>"+config.xml_lineend);
                comm.appendResBody("<d:prop>"+config.xml_lineend);
                comm.appendResBody(response);
                comm.appendResBody("</d:prop>"+config.xml_lineend);
                comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend);
                comm.appendResBody("</d:propstat>"+config.xml_lineend);
                comm.appendResBody("</d:response>"+config.xml_lineend);
                comm.appendResBody("</d:multistatus>"+config.xml_lineend);
            });
        }
        comm.flushResponse();
    });
}
function returnpropfindelements(comm,calendar,childs,synctoken){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] returnPropfindElements`);
    }
    let response="";
    const username=comm.getusername();
    const caldav_username=comm.getcaldav_username();
    const len=childs.length;
    for(let i=0;i<len;++i){
        const child=childs[i];
        switch(child){
            case 'add-member':
                response+="";
                break;
            case 'allowed-sharing-modes':
                response+="<cs:allowed-sharing-modes><cs:can-be-shared/></cs:allowed-sharing-modes>"+config.xml_lineend;
                break;
            case 'autoprovisioned':
                response+="";
                break;
            case 'bulk-requests':
                response+="";
                break;
            case 'calendar-color':
            case 'A:calendar-color':
                response+="<A:calendar-color xmlns:A=\"http://apple.com/ns/ical/\">"+(calendar.calendarcolor||"#0066CC")+"</A:calendar-color>"+config.xml_lineend;
                break;
            case 'calendar-description':
                response+="<cal:calendar-description>"+(calendar.description||"")+"</cal:calendar-description>"+config.xml_lineend;
                break;
            case 'calendar-free-busy-set':
                response+="<cal:calendar-free-busy-set><d:href>"+comm.getCalendarURL(null,calendar.uri)+"</d:href></cal:calendar-free-busy-set>"+config.xml_lineend;
                break;
            case 'calendar-order':
            case 'A:calendar-order':
                response+="<A:calendar-order xmlns:A=\"http://apple.com/ns/ical/\">"+(calendar.calendarorder||"0")+"</A:calendar-order>"+config.xml_lineend;
                break;
            case 'calendar-timezone':
                response+="";
                break;
            case 'current-user-privilege-set':
            case 'D:current-user-privilege-set':
                response+=calendarutil.getCurrentUserPrivilegeSet();
                break;
            case 'displayname':
            case 'D:displayname':
                response+="<d:displayname>"+(calendar.displayname||"Main Calendar")+"</d:displayname>"+config.xml_lineend;
                break;
            case 'getctag':
                response+="<cs:getctag>"+comm.getFullURL("/sync/calendar/"+synctoken)+"</cs:getctag>"+config.xml_lineend;
                break;
            case 'getetag':
                break;
            case 'checksum-versions':
                break;
            case 'sync-token':
                response+="<d:sync-token>"+comm.getFullURL("/sync/calendar/"+synctoken)+"</d:sync-token>"+config.xml_lineend;
                break;
            case 'acl':
                response+=calendarutil.getACL(comm);
                break;
            case 'getcontenttype':
                break;
            case 'owner':
                response+="<d:owner><d:href>"+comm.getPrincipalURL()+"</d:href></d:owner>"+config.xml_lineend;
                break;
            case 'quota-available-bytes':
                response+="";
                break;
            case 'quota-used-bytes':
                response+="";
                break;
            case 'resourcetype':
            case 'D:resourcetype':
                response+="<d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>"+config.xml_lineend;
                break;
            case 'schedule-calendar-transp':
                response+="<cal:schedule-calendar-transp><cal:opaque/></cal:schedule-calendar-transp>"+config.xml_lineend;
                break;
            case 'supported-calendar-component-set':
                response+="";
                break;
            case 'supported-calendar-component-sets':
                response+="<cal:supported-calendar-component-set><cal:comp name=\"VEVENT\"/></cal:supported-calendar-component-set>"+config.xml_lineend;
                break;
            case 'supported-report-set':
                response+=calendarutil.getSupportedReportSet(false);
                break;
            default:
                if(child!='text'){
                    if(config.LSE_Loglevel>=1){
                        LSE_Logger.warn(`[Fennel-NG CalDAV] CAL-PF: not handled: ${child}`);
                    }
                }
                break;
        }
    }
    return response;
}
function returncalendar(comm,calendar,childs){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] returnCalendar`);
    }
    let response="";
    response+="<d:response>"+config.xml_lineend;
    response+="<d:href>"+comm.getCalendarURL(null,calendar.uri)+"</d:href>"+config.xml_lineend;
    response+="<d:propstat>"+config.xml_lineend;
    response+="<d:prop>"+config.xml_lineend;
    response+=returnpropfindelements(comm,calendar,childs,calendar.synctoken);
    response+="</d:prop>"+config.xml_lineend;
    response+="<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend;
    response+="</d:propstat>"+config.xml_lineend;
    response+="</d:response>"+config.xml_lineend;
    return response;
}
function getcalendarrootnoderesponse(comm,childs){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] getCalendarRootNodeResponse`);
    }
    let response="";
    const username=comm.getusername();
    response+="<d:response><d:href>"+comm.getURL()+"</d:href>"+config.xml_lineend;
    response+="<d:propstat>"+config.xml_lineend;
    response+="<d:prop>"+config.xml_lineend;
    const len=childs.length;
    for(let i=0;i<len;++i){
        const child=childs[i];
        switch(child){
            case 'current-user-privilege-set':
                response+=calendarutil.getCurrentUserPrivilegeSet();
                break;
            case 'owner':
                response+="<d:owner><d:href>"+comm.getPrincipalURL()+"</d:href></d:owner>"+config.xml_lineend;
                break;
            case 'resourcetype':
                response+="<d:resourcetype><d:collection/></d:resourcetype>"+config.xml_lineend;
                break;
            case 'supported-report-set':
                response+=calendarutil.getSupportedReportSet(true);
                break;
        }
    }
    response+="</d:prop>"+config.xml_lineend;
    response+="<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend;
    response+="</d:propstat>"+config.xml_lineend;
    response+="</d:response>"+config.xml_lineend;
    return response;
}
module.exports={
    propfind:propfind,
    report:calendarreport.report,
    gett:gett
};
