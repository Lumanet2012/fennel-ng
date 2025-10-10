const {XMLParser}=require('fast-xml-parser');
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text",parseAttributeValue:true});
const xml={parsexml:function(body){return parser.parse(body);}};
const config=require('../config').config;
const xh=require("../libs/xmlhelper");
const redis=require('../libs/redis');
const crypto=require('crypto');
const icsparser=require('../libs/ics-main');
const calendarobjects=require('../libs/db').CALENDAROBJECTS;
const calendars=require('../libs/db').CALENDARS;
function put(comm){
    if(config.LSE_Loglevel>=1){
        LSE_Logger.info(`[Fennel-NG CalDAV] put called`);
    }
    const eventuri=comm.getfilenamefrompath(false);
    const calendaruri=comm.getcalidfromurl();
    const username=comm.getusername();
    const caldav_username=comm.getcaldav_username();
    const principaluri='principals/'+caldav_username;
    const body=comm.getreqbody();
    const ifmatchheader=comm.getreq().headers['if-match'];
    const ifnonematchheader=comm.getreq().headers['if-none-match'];
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] PUT eventuri: ${eventuri}, calendaruri: ${calendaruri}`);
        LSE_Logger.debug(`[Fennel-NG CalDAV] If-Match: ${ifmatchheader}, If-None-Match: ${ifnonematchheader}`);
    }
    calendars.findOne({where:{principaluri:principaluri,uri:calendaruri}}).then(function(calendar){
        if(!calendar){
            if(config.LSE_Loglevel>=1){
                LSE_Logger.warn(`[Fennel-NG CalDAV] Calendar not found: ${calendaruri}`);
            }
            comm.setresponsecode(404);
            comm.flushresponse();
            return;
        }
        calendarobjects.findOne({where:{calendarid:calendar.id,uri:eventuri}}).then(function(existingobject){
            let iscreating=false;
            if(existingobject){
                if(ifnonematchheader==='*'){
                    if(config.LSE_Loglevel>=1){
                        LSE_Logger.warn(`[Fennel-NG CalDAV] If-None-Match: * but object exists`);
                    }
                    comm.setresponsecode(412);
                    comm.flushresponse();
                    return;
                }
                if(ifmatchheader&&ifmatchheader!==`"${existingobject.etag}"`){
                    if(config.LSE_Loglevel>=1){
                        LSE_Logger.warn(`[Fennel-NG CalDAV] If-Match failed. Expected: ${existingobject.etag}, Got: ${ifmatchheader}`);
                    }
                    comm.setresponsecode(412);
                    comm.flushresponse();
                    return;
                }
            }else{
                iscreating=true;
                if(ifmatchheader){
                    if(config.LSE_Loglevel>=1){
                        LSE_Logger.warn(`[Fennel-NG CalDAV] If-Match specified but object does not exist`);
                    }
                    comm.setresponsecode(412);
                    comm.flushresponse();
                    return;
                }
            }
            const parsedics=icsparser.parseics(body);
            if(!parsedics){
                if(config.LSE_Loglevel>=1){
                    LSE_Logger.error(`[Fennel-NG CalDAV] failed to parse ics data`);
                }
                comm.setstandardheaders();
                comm.setresponsecode(400);
                comm.appendresbody("Invalid iCalendar data");
                comm.flushresponse();
                return;
            }
            const uid=icsparser.extractuid(parsedics);
            const componenttype=icsparser.extractcomponenttype(parsedics);
            const firstoccurence=icsparser.extractfirstoccurrence(parsedics);
            const lastoccurence=icsparser.extractlastoccurrence(parsedics);
            const now=Math.floor(Date.now()/1000);
            const etag=crypto.createHash('md5').update(body+now).digest('hex');
            const calendardata={
                calendarid:calendar.id,
                uri:eventuri,
                calendardata:body,
                lastmodified:now,
                etag:etag,
                size:Buffer.byteLength(body,'utf8'),
                componenttype:componenttype,
                firstoccurence:firstoccurence,
                lastoccurence:lastoccurence,
                uid:uid
            };
            const updateoperation=existingobject?calendarobjects.update(calendardata,{where:{id:existingobject.id}}):calendarobjects.create(calendardata);
            updateoperation.then(function(){
                return updatecalendarsynctoken(calendar.id);
            }).then(function(newsynctoken){
                if(config.LSE_Loglevel>=1){
                    LSE_Logger.info(`[Fennel-NG CalDAV] ${iscreating?'created':'updated'} calendar object: ${eventuri}, sync token: ${newsynctoken}`);
                }
                redis.setcalendarsynctoken(calendaruri,username,newsynctoken);
                comm.setstandardheaders();
                comm.setheader("ETag",`"${etag}"`);
                comm.setheader("Last-Modified",new Date(now*1000).toUTCString());
                comm.setresponsecode(iscreating?201:200);
                comm.flushresponse();
            });
        });
    }).catch(function(error){
        if(config.LSE_Loglevel>=1){
            LSE_Logger.error(`[Fennel-NG CalDAV] error in put: ${error.message}`);
        }
        comm.setresponsecode(500);
        comm.flushresponse();
    });
}
function proppatch(comm){
    if(config.LSE_Loglevel>=1){
        LSE_Logger.info(`[Fennel-NG CalDAV] proppatch called`);
    }
    comm.setstandardheaders();
    comm.setresponsecode(207);
    comm.appendresbody(xh.getxmlhead());
    comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\">"+config.xml_lineend);
    comm.appendresbody("<d:response>"+config.xml_lineend);
    comm.appendresbody("<d:href>"+comm.geturl()+"</d:href>"+config.xml_lineend);
    comm.appendresbody("<d:propstat>"+config.xml_lineend);
    comm.appendresbody("<d:status>HTTP/1.1 403 Forbidden</d:status>"+config.xml_lineend);
    comm.appendresbody("</d:propstat>"+config.xml_lineend);
    comm.appendresbody("</d:response>"+config.xml_lineend);
    comm.appendresbody("</d:multistatus>"+config.xml_lineend);
    comm.flushresponse();
}
function mkcalendar(comm){
    if(config.LSE_Loglevel>=1){
        LSE_Logger.info(`[Fennel-NG CalDAV] mkcalendar called`);
    }
    const caldav_username=comm.getcaldav_username();
    const principaluri='principals/'+caldav_username;
    const calendaruri=comm.getcalidfromurl();
    let displayname=calendaruri;
    let calendarcolor="#0066CC";
    let calendarorder=1;
    let description="";
    let timezone="";
    const components="VEVENT,VTODO,VJOURNAL";
    const body=comm.getreqbody();
    if(body&&body.length>0){
        try{
            const xmldoc=xml.parsexml(body);
            if(xmldoc&&xmldoc.mkcalendar&&xmldoc.mkcalendar.set&&xmldoc.mkcalendar.set.prop){
                const props=xmldoc.mkcalendar.set.prop;
                if(props.displayname){
                    displayname=props.displayname;
                }
                if(props['calendar-color']){
                    calendarcolor=props['calendar-color'];
                }
                if(props['calendar-order']){
                    calendarorder=parseInt(props['calendar-order'])||1;
                }
                if(props['calendar-description']){
                    description=props['calendar-description'];
                }
                if(props['calendar-timezone']){
                    timezone=props['calendar-timezone'];
                }
            }
        }catch(e){
            if(config.LSE_Loglevel>=1){
                LSE_Logger.warn(`[Fennel-NG CalDAV] failed to parse mkcalendar xml: ${e.message}`);
            }
        }
    }
    calendars.findOne({where:{principaluri:principaluri,uri:calendaruri}}).then(function(existingcalendar){
        if(existingcalendar){
            if(config.LSE_Loglevel>=1){
                LSE_Logger.warn(`[Fennel-NG CalDAV] calendar already exists: ${calendaruri}`);
            }
            comm.setstandardheaders();
            comm.setresponsecode(405);
            comm.flushresponse();
            return;
        }
        const calendardata={
            principaluri:principaluri,
            displayname:displayname,
            uri:calendaruri,
            description:description,
            calendarorder:calendarorder,
            calendarcolor:calendarcolor,
            timezone:timezone,
            components:components,
            synctoken:1
        };
        return calendars.create(calendardata).then(function(calendar){
            if(config.LSE_Loglevel>=1){
                LSE_Logger.info(`[Fennel-NG CalDAV] created calendar: ${calendaruri} for principal: ${principaluri}`);
            }
            comm.setstandardheaders();
            comm.setresponsecode(201);
            comm.flushresponse();
        });
    }).catch(function(error){
        if(config.LSE_Loglevel>=1){
            LSE_Logger.error(`[Fennel-NG CalDAV] error in mkcalendar: ${error.message}`);
        }
        comm.setresponsecode(500);
        comm.flushresponse();
    });
}
function updatecalendarsynctoken(calendarid){
    return new Promise(function(resolve,reject){
        calendars.findOne({where:{id:calendarid}}).then(function(calendar){
            if(!calendar){
                reject(new Error('calendar not found'));
                return;
            }
            calendar.increment('synctoken',{by:1}).then(function(){
                resolve(calendar.synctoken+1);
            }).catch(reject);
        }).catch(reject);
    });
}
module.exports={
    put:put,
    proppatch:proppatch,
    mkcalendar:mkcalendar
};
