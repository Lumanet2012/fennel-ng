const fastxmlparser=require('fast-xml-parser');
const parser=new fastxmlparser.XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text",parseAttributeValue:true,removeNSPrefix:true});
const xml={parsexml:function(body){return parser.parse(body);}};
const moment=require('moment');
const config=require('../config').config;
const xh=require("../libs/xmlhelper");
const redis=require('../libs/redis');
const calendarobjects=require('../libs/db').calendarobjects;
const calendars=require('../libs/db').calendars;
const calendarutil=require('./calendar-util');
const calendarreport=require('./calendar-report');
function gett(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] gett`);
    }
    comm.setHeader("Content-Type","text/calendar");
    const eventuri=comm.getFilenameFromPath(false);
    calendarobjects.findone({where:{uri:eventuri}}).then(function(calendarobject){
        if(calendarobject===null){
            if(config.LSE_Loglevel>=1){
                LSE_Logger.warn(`[Fennel-NG CalDAV] err: could not find calendar event`);
            }
        }else{
            const content=calendarobject.calendardata.toString();
            comm.appendresbody(content);
        }
        comm.flushresponse();
    });
}
function propfind(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] propfind`);
    }
    const body=comm.getreqbody();
    const xmldoc=xml.parsexml(body);
    const node=xmldoc.propfind;
    const childs=node&&node.prop?Object.keys(node.prop):[];
    const username=comm.getusername();
    const caldav_username=comm.getcaldav_username();
    if(!comm.params || comm.params===''){
        handlepropfindforuser(comm);
        return;
    }
    const pathparts=comm.params.split('/').filter(p=>p);
    const calendaruri=pathparts[0];
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
}
function handlepropfindforuser(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handlepropfindforuser`);
    }
    comm.setstandardheaders();
    comm.setdavheaders();
    comm.setresponsecode(207);
    comm.appendresbody(xh.getxmlhead());
    const body=comm.getreqbody();
    const xmldoc=xml.parsexml(body);
    const node=xmldoc.propfind||xmldoc['D:propfind'];
    const propnode=node&&(node.prop||node['D:prop']);
    const requestedprops=propnode?Object.keys(propnode):[];
    const username=comm.getusername();
    const caldav_username=comm.getcaldav_username();
    const principaluri='principals/'+caldav_username;
    calendars.findandcountall({where:{principaluri:principaluri}}).then(function(result){
        let response="";
        response+="<d:response>"+config.xml_lineend;
        response+="<d:href>" + config.public_route_prefix + "/cal/" + comm.getcaldav_username() + "/" + "</d:href>"+config.xml_lineend;
        response+="<d:propstat>" + config.xml_lineend;
        response+="<d:prop>" + config.xml_lineend;
        const len=requestedprops.length;
        for(let i=0;i<len;i++){
            const prop=requestedprops[i];
            switch(prop){
                case 'resourcetype':
                    response+="<d:resourcetype><d:collection/></d:resourcetype>"+config.xml_lineend;
                    break;
                case 'displayname':
                    response+="<d:displayname>Calendar Home</d:displayname>"+config.xml_lineend;
                    break;
                case 'current-user-principal':
                    response+="<d:current-user-principal><d:href>"+comm.getprincipalurl()+"</d:href></d:current-user-principal>"+config.xml_lineend;
                    break;
                case 'current-user-privilege-set':
                    response+=calendarutil.getcurrentuserprivilegeset();
                    break;
                case 'owner':
                    response += "<d:owner><d:href>" + comm.getprincipalurl() + "</d:href></d:owner>" + config.xml_lineend;
                    break;
                case 'calendar-color':
                    response += "<a:calendar-color xmlns:a=\"http://apple.com/ns/ical/\" symbolic-color=\"custom\">#FF00FF</a:calendar-color>" + config.xml_lineend;
                    break;
                default:
                    break;
            }
        }
        response += "</d:prop>" + config.xml_lineend;
        response += "<d:status>HTTP/1.1 200 OK</d:status>" + config.xml_lineend;
        response += "</d:propstat>" + config.xml_lineend;
        response += "</d:response>" + config.xml_lineend;
        for(let i=0;i<result.count;++i){
            const calendar=result.rows[i];
            response+=returncalendar(comm,calendar,requestedprops);
        }
        response += calendarutil.returnoutbox(comm);
        response += calendarutil.returnnotifications(comm);
        response += "</d:multistatus>" + config.xml_lineend;
        comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend);
        comm.appendresbody(response);
        comm.flushresponse();
    });
}
function handlepropfindforcalendarinbox(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForCalendarInbox`);
    }
    comm.setstandardheaders();
    comm.setdavheaders();
    comm.setresponsecode(207);
    comm.appendresbody(xh.getxmlhead());
    comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
    comm.appendresbody("<d:response><d:href>" + comm.geturl() + "</d:href>"+config.xml_lineend);
    comm.appendresbody("<d:propstat>"+config.xml_lineend);
    comm.appendresbody("<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend);
    comm.appendresbody("</d:propstat>"+config.xml_lineend);
    comm.appendresbody("</d:response>"+config.xml_lineend);
    comm.appendresbody("</d:multistatus>"+config.xml_lineend);
    comm.flushresponse();
}
function handlepropfindforcalendaroutbox(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForCalendarOutbox`);
    }
    comm.setstandardheaders();
    comm.setdavheaders();
    comm.setresponsecode(207);
    comm.appendresbody(xh.getxmlhead());
    const response=calendarutil.returnoutbox(comm);
    comm.appendresbody(response);
    comm.flushresponse();
}
function handlepropfindforcalendarnotifications(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handlePropfindForCalendarNotifications`);
    }
    comm.setstandardheaders();
    comm.setdavheaders();
    comm.setresponsecode(207);
    comm.appendresbody(xh.getxmlhead());
    comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
    comm.appendresbody("<d:response><d:href>" + comm.geturl() + "</d:href>"+config.xml_lineend);
    comm.appendresbody("<d:propstat>"+config.xml_lineend);
    comm.appendresbody("<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend);
    comm.appendresbody("</d:propstat>"+config.xml_lineend);
    comm.appendresbody("</d:response>"+config.xml_lineend);
    comm.appendresbody("</d:multistatus>"+config.xml_lineend);
    comm.flushresponse();
}
function handlepropfindforcalendarid(comm,calendaruri){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.info(`[Fennel-NG CalDAV] handlepropfindforcalendarid called with calendarUri: ${calendaruri}`);
    }
    const caldav_username=comm.getcaldav_username();
    const principaluri='principals/'+caldav_username;
    calendars.findone({where:{principaluri:principaluri,uri:calendaruri}}).then(function(calendar){
        comm.setstandardheaders();
        comm.setdavheaders();
        comm.setresponsecode(207);
        comm.appendresbody(xh.getxmlhead());
        if(calendar===null){
            if(config.LSE_Loglevel>=1){
                LSE_Logger.warn(`[Fennel-NG CalDAV] Calendar not found: ${calendaruri}`);
            }
            comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
            comm.appendresbody("<d:response>"+config.xml_lineend);
            comm.appendresbody("<d:href>/cal/"+comm.getcaldav_username()+"/"+calendaruri+"/</d:href>"+config.xml_lineend);
            comm.appendresbody("<d:propstat>"+config.xml_lineend);
            comm.appendresbody("<d:status>HTTP/1.1 404 Not Found</d:status>"+config.xml_lineend);
            comm.appendresbody("</d:propstat>"+config.xml_lineend);
            comm.appendresbody("</d:response>"+config.xml_lineend);
            comm.appendresbody("</d:multistatus>"+config.xml_lineend);
        }else{
            const xmldoc=xml.parsexml(comm.getreqbody());
            const node=xmldoc.propfind;
            const childs=node&&node.prop?Object.keys(node.prop):[];
            const redisclient=redis.initializeredis();
            return redisclient.get(`sync:cal:${calendar.id}`).then(function(cachedsynctoken){
                const synctoken=cachedsynctoken||calendar.synctoken;
                const response=returnpropfindelements(comm,calendar,childs,synctoken);
                comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
                comm.appendresbody("<d:response><d:href>"+comm.geturl()+"</d:href>"+config.xml_lineend);
                if(response.length>0){
                    comm.appendresbody("<d:propstat>"+config.xml_lineend);
                    comm.appendresbody("<d:prop>"+config.xml_lineend);
                    comm.appendresbody(response);
                    comm.appendresbody("</d:prop>"+config.xml_lineend);
                    comm.appendresbody("<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend);
                    comm.appendresbody("</d:propstat>"+config.xml_lineend);
                }else{
                    comm.appendresbody("<d:propstat>"+config.xml_lineend);
                    comm.appendresbody("<d:status>HTTP/1.1 404 Not Found</d:status>"+config.xml_lineend);
                    comm.appendresbody("</d:propstat>"+config.xml_lineend);
                }
                comm.appendresbody("</d:response>"+config.xml_lineend);
                comm.appendresbody("</d:multistatus>"+config.xml_lineend);
            }).catch(function(error){
                if(config.LSE_Loglevel>=1){
                    LSE_Logger.error(`[Fennel-NG CalDAV] Redis error getting sync token: ${error}`);
                }
                const response=returnpropfindelements(comm,calendar,childs,calendar.synctoken);
                comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
                comm.appendresbody("<d:response><d:href>"+comm.geturl()+"</d:href>"+config.xml_lineend);
                comm.appendresbody("<d:propstat>"+config.xml_lineend);
                comm.appendresbody("<d:prop>"+config.xml_lineend);
                comm.appendresbody(response);
                comm.appendresbody("</d:prop>"+config.xml_lineend);
                comm.appendresbody("<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend);
                comm.appendresbody("</d:propstat>"+config.xml_lineend);
                comm.appendresbody("</d:response>"+config.xml_lineend);
                comm.appendresbody("</d:multistatus>"+config.xml_lineend);
            });
        }
    }).then(function() {
    return comm.asyncflushresponse();
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
                response+="<A:calendar-color xmlns:A=\"http://apple.com/ns/ical/\">"+(calendar.calendarcolor||"#0066CC")+"</A:calendar-color>"+config.xml_lineend;
                break;
            case 'calendar-description':
                response+="<cal:calendar-description>"+(calendar.description||"")+"</cal:calendar-description>"+config.xml_lineend;
                break;
            case 'calendar-free-busy-set':
                response+="<cal:calendar-free-busy-set><d:href>"+comm.getcalendarurl(null,calendar.uri)+"</d:href></cal:calendar-free-busy-set>"+config.xml_lineend;
                break;
            case 'calendar-order':
                response+="<A:calendar-order xmlns:A=\"http://apple.com/ns/ical/\">"+(calendar.calendarorder||"0")+"</A:calendar-order>"+config.xml_lineend;
                break;
            case 'calendar-timezone':
                response+="";
                break;
            case 'current-user-privilege-set':
                response+=calendarutil.getcurrentuserprivilegeset();
                break;
            case 'displayname':
                response+="<d:displayname>"+(calendar.displayname||"Main Calendar")+"</d:displayname>"+config.xml_lineend;
                break;
            case 'getctag':
                response+="<cs:getctag>"+config.public_route_prefix+"/sync/calendar/"+synctoken+"</cs:getctag>" + config.xml_lineend;
                break;
            case 'getetag':
                break;
            case 'checksum-versions':
                break;
            case 'sync-token':
                response+="<d:sync-token>"+config.public_route_prefix+"/sync/calendar/"+synctoken+"</d:sync-token>" + config.xml_lineend;
                break;
            case 'acl':
                response+=calendarutil.getACL(comm);
                break;
            case 'getcontenttype':
                break;
            case 'owner':
                response+="<d:owner><d:href>"+comm.getprincipalurl()+"</d:href></d:owner>" + config.xml_lineend;
                break;
            case 'quota-available-bytes':
                response+="";
                break;
            case 'quota-used-bytes':
                response+="";
                break;
            case 'resourcetype':
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
                response+=calendarutil.getsupportedreportset(false);
                break;
            case 'supportedlock':
                response+="<d:supportedlock/>" + config.xml_lineend;
                break;
            case 'supported-report-set':
                response+=calendarutil.getsupportedreportset(false);
                break;
            case 'supported-calendar-component-set':
                response+="<cal:supported-calendar-component-set><cal:comp name=\"VEVENT\"/></cal:supported-calendar-component-set>" + config.xml_lineend;
                break;
            case 'headervalue':
                break;
            case 'max-image-size':
                break;
            case 'current-user-principal':
                response+="<d:current-user-principal><d:href>"+comm.getprincipalurl()+"</d:href></d:current-user-principal>"+config.xml_lineend;
                break;
            case 'current-user-privilege-set':
                response+=calendarutil.getcurrentuserprivilegeset();
                break;
            case 'getctag':
                response+="<cs:getctag xmlns:cs=\"http://calendarserver.org/ns/\">"+synctoken+"</cs:getctag>"+config.xml_lineend;
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
    response+="<d:href>"+calendar.uri+"/</d:href>"+config.xml_lineend;
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
        LSE_Logger.debug(`[Fennel-NG CalDAV] getcalendarrootnoderesponse`);
    }
    let response="";
    const username=comm.getusername();
    response += "<d:response><d:href>" + comm.geturl() + "</d:href>" + config.xml_lineend;
    response += "<d:propstat>" + config.xml_lineend;
    response += "<d:prop>" + config.xml_lineend;
    const len=childs.length;
    for(let i=0;i<len;++i){
        const child=childs[i];
        switch(child){
            case 'current-user-privilege-set':
                response+=calendarutil.getcurrentuserprivilegeset();
                break;
            case 'owner':
                response+="<d:owner><d:href>"+comm.getprincipalurl()+"</d:href></d:owner>"+config.xml_lineend;
                break;
            case 'resourcetype':
                response+="<d:resourcetype><d:collection/></d:resourcetype>"+config.xml_lineend;
                break;
            case 'supported-report-set':
                response+=calendarutil.getsupportedreportset(true);
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
}
