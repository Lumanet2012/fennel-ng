const {XMLParser}=require('fast-xml-parser');
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text",parseAttributeValue:true});
const xml={parseXml:function(body){return parser.parse(body);}};
const moment=require('moment');
const config=require('../config').config;
const xh=require("../libs/xmlhelper");
const calendarobjects=require('../libs/db').CALENDAROBJECTS;
const calendars=require('../libs/db').CALENDARS;
const calendarutil=require('./calendar-util');
function report(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] report`);
    }
    comm.setStandardHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    const body=comm.getReqBody();
    const xmldoc=xml.parseXml(body);
    const rootkeys=Object.keys(xmldoc);
    const rootname=rootkeys[0];
    switch(rootname){
        case 'sync-collection':
            handlereportsynccollection(comm);
            break;
        case 'calendar-multiget':
            handlereportcalendarmultiget(comm);
            break;
        case 'calendar-query':
            handlereportcalendarquery(comm,xmldoc);
            break;
        default:
            if(rootname!='text'){
                if(config.LSE_Loglevel>=1){
                    LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${rootname}`);
                }
            }
            break;
    }
}
function handlereportcalendarquery(comm,xmldoc){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handleReportCalendarQuery`);
    }
    const calendaruri=comm.getCalIdFromURL();
    const username=comm.getusername();
    const principaluri='principals/'+username;
    const filter={calendarid:null};
    calendars.findOne({where:{principaluri:principaluri,uri:calendaruri}}).then(function(calendar){
        if(!calendar){
            if(config.LSE_Loglevel>=1){
                LSE_Logger.warn(`[Fennel-NG CalDAV] Calendar not found for query: ${calendaruri}`);
            }
            comm.setResponseCode(404);
            comm.flushResponse();
            return;
        }
        filter.calendarid=calendar.id;
        const nodefilter=xmldoc['cal:filter']||xmldoc.filter;
        if(nodefilter!==undefined){
            const attrs=nodefilter.attrs?nodefilter.attrs:[];
            const len=attrs.length;
            for(let i=0;i<len;i++){
                const attr=attrs[i];
                switch(attr.name()){
                    case 'start':
                        const filterstart=moment(attr.value());
                        filter.firstoccurence={$gte:filterstart.unix()};
                        break;
                    case 'end':
                        const filterend=moment(attr.value());
                        filter.lastoccurence={$lte:filterend.unix()};
                        break;
                    default:
                        break;
                }
            }
        }
        calendarobjects.findAndCountAll({where:filter}).then(function(result){
            const nodeprop=xmldoc.prop;
            let response="";
            const nodeprops=nodeprop?Object.keys(nodeprop):[];
            const len=nodeprops.length;
            let requrl=comm.getURL();
            requrl+=requrl.match("\/$")?"":"/";
            for(let j=0;j<result.count;j++){
                const calendarobject=result.rows[j];
                response+="<d:response><d:href>"+requrl+calendarobject.uri+"</d:href>";
                response+="<d:propstat>";
                response+="<d:prop>";
                for(let i=0;i<len;i++){
                    const child=nodeprops[i];
                    switch(child){
                        case 'getetag':
                            response+="<d:getetag>\""+calendarobject.etag+"\"</d:getetag>"+config.xml_lineend;
                            break;
                        case 'getcontenttype':
                            response+="<d:getcontenttype>text/calendar; charset=utf-8; component="+calendarobject.componenttype+"</d:getcontenttype>"+config.xml_lineend;
                            break;
                        case 'calendar-data':
                            response+="<cal:calendar-data>"+calendarobject.calendardata.toString()+"</cal:calendar-data>"+config.xml_lineend;
                            break;
                        default:
                            if(child!='text'){
                                if(config.LSE_Loglevel>=1){
                                    LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${child}`);
                                }
                            }
                            break;
                    }
                }
                response+="</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>"+config.xml_lineend;
                response+="</d:response>"+config.xml_lineend;
            }
            comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">"+config.xml_lineend);
            comm.appendResBody(response);
            comm.appendResBody("</d:multistatus>"+config.xml_lineend);
            comm.flushResponse();
        });
    });
}
function handlereportcalendarmultiget(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handleReportCalendarMultiget`);
    }
    const body=comm.getReqBody();
    const xmldoc=xml.parseXml(body);
    const hrefnodes=xmldoc.href;
    if(hrefnodes!=undefined){
        let arrhrefs=[];
        if(Array.isArray(hrefnodes)){
            arrhrefs=hrefnodes.map(function(href){return parsehreftoeventuri(href);});
        }else{
            arrhrefs.push(parsehreftoeventuri(hrefnodes));
        }
        const len=arrhrefs.length;
        for(let i=0;i<len;++i){
            const child=arrhrefs[i];
            switch(child){
                case 'prop':
                    break;
                case 'href':
                    arrhrefs.push(parsehreftoeventuri(child));
                    break;
                default:
                    if(child!='text'){
                        if(config.LSE_Loglevel>=1){
                            LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${child}`);
                        }
                    }
                    break;
            }
        }
        handlereporthrefs(comm,arrhrefs);
    }
}
function parsehreftoeventuri(href){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] parseHrefToEventUri`);
    }
    const e=href.split("/");
    const uri=e[e.length-1];
    return uri;
}
function handlereporthrefs(comm,arreventuris){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handleReportHrefs`);
    }
    calendarobjects.findAndCountAll({where:{uri:arreventuris}}).then(function(result){
        let response="";
        for(let i=0;i<result.count;++i){
            const calendarobject=result.rows[i];
            let requrl=comm.getURL();
            requrl+=requrl.match("\/$")?"":"/";
            response+="<d:response>"+config.xml_lineend;
            response+="<d:href>"+requrl+calendarobject.uri+"</d:href>"+config.xml_lineend;
            response+="<d:propstat><d:prop>"+config.xml_lineend;
            const body=comm.getReqBody();
            const xmldoc=xml.parseXml(body);
            const nodeprops=xmldoc.prop?Object.keys(xmldoc.prop):[];
            const len=nodeprops.length;
            for(let i=0;i<len;++i){
                const child=nodeprops[i];
                switch(child){
                    case 'getetag':
                        response+="<d:getetag>\""+calendarobject.etag+"\"</d:getetag>"+config.xml_lineend;
                        break;
                    case 'getcontenttype':
                        response+="<d:getcontenttype>text/calendar; charset=utf-8; component="+calendarobject.componenttype+"</d:getcontenttype>"+config.xml_lineend;
                        break;
                    default:
                        if(child!='text'){
                            if(config.LSE_Loglevel>=1){
                                LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${child}`);
                            }
                        }
                        break;
                }
            }
            response+="</d:prop>"+config.xml_lineend;
            response+="<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend;
            response+="</d:propstat>"+config.xml_lineend;
            response+="</d:response>"+config.xml_lineend;
        }
        comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">"+config.xml_lineend);
        comm.appendResBody(response);
        comm.appendResBody("</d:multistatus>"+config.xml_lineend);
        comm.flushResponse();
    });
}
function handlereportsynccollection(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handleReportSyncCollection`);
    }
    const body=comm.getReqBody();
    const xmldoc=xml.parseXml(body);
    const synctokennode=xmldoc['sync-token'];
    if(synctokennode!=undefined){
        const calendaruri=comm.getPathElement(3);
        const username=comm.getusername();
        const principaluri='principals/'+username;
        calendars.findOne({where:{principaluri:principaluri,uri:calendaruri}}).then(function(calendar){
            if(!calendar){
                if(config.LSE_Loglevel>=1){
                    LSE_Logger.warn(`[Fennel-NG CalDAV] Calendar not found for sync: ${calendaruri}`);
                }
                comm.setResponseCode(404);
                comm.flushResponse();
                return;
            }
            calendarobjects.findAndCountAll({where:{calendarid:calendar.id}}).then(function(result){
                let response="";
                for(let j=0;j<result.count;++j){
                    const calendarobject=result.rows[j];
                    const nodeprops=xmldoc.prop?Object.keys(xmldoc.prop):[];
                    const len=nodeprops.length;
                    let requrl=comm.getURL();
                    requrl+=requrl.match("\/$")?"":"/";
                    response+="<d:response>"+config.xml_lineend;
                    response+="<d:href>"+requrl+calendarobject.uri+"</d:href>"+config.xml_lineend;
                    response+="<d:propstat>"+config.xml_lineend;
                    response+="<d:prop>"+config.xml_lineend;
                    for(let i=0;i<len;++i){
                        const child=nodeprops[i];
                        switch(child){
                            case 'getetag':
                                response+="<d:getetag>\""+calendarobject.etag+"\"</d:getetag>"+config.xml_lineend;
                                break;
                            case 'getcontenttype':
                                response+="<d:getcontenttype>text/calendar; charset=utf-8; component="+calendarobject.componenttype+"</d:getcontenttype>"+config.xml_lineend;
                                break;
                            case 'calendar-data':
                                response+="<cal:calendar-data>"+calendarobject.calendardata.toString()+"</cal:calendar-data>"+config.xml_lineend;
                                break;
                            default:
                                if(child!='text'){
                                    if(config.LSE_Loglevel>=1){
                                        LSE_Logger.warn(`[Fennel-NG CalDAV] P-R: not handled: ${child}`);
                                    }
                                }
                                break;
                        }
                    }
                    response+="</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>"+config.xml_lineend;
                    response+="</d:response>"+config.xml_lineend;
                }
                comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">"+config.xml_lineend);
                comm.appendResBody(response);
                comm.appendResBody("</d:multistatus>"+config.xml_lineend);
                comm.flushResponse();
            });
        });
    }
}
module.exports={
    report:report,
    handlereportcalendarquery:handlereportcalendarquery,
    handlereportcalendarmultiget:handlereportcalendarmultiget,
    handlereportsynccollection:handlereportsynccollection,
    parsehreftoeventuri:parsehreftoeventuri,
    handlereporthrefs:handlereporthrefs
};

