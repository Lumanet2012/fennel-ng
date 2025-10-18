const config=require('../config').config;
const xh=require("../libs/xmlhelper");
const redis=require('../libs/redis');
const calendarobjects=require('../libs/db').calendarobjects;
const calendars=require('../libs/db').calendars;
const calendarutil=require('./calendar-util');
const calendarread=require('./calendar-read');
const calendarreport=require('./calendar-report');
const calendarwrite=require('./calendar-write');
const calendardel=require('./calendar-del');
const calendarmove=require('./calendar-move');
function handleroot(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handleRoot`);
    }
    const method=comm.getreq().method;
    switch(method){
        case 'PROPFIND':
            calendarread.propfind(comm);
            break;
        case 'PROPPATCH':
            calendarwrite.proppatch(comm);
            break;
        case 'OPTIONS':
            options(comm);
            break;
        case 'REPORT':
            calendarreport.report(comm);
            break;
        case 'MKCALENDAR':
            calendarwrite.mkcalendar(comm);
            break;
        default:
            const res=comm.getres();
            if(config.LSE_Loglevel>=1){
                LSE_Logger.info(`[Fennel-NG CalDAV] Request method is unknown: ${method}`);
            }
            res.writeHead(500);
            res.write(method+" is not implemented yet");
            res.end();
            break;
    }
}
function handlecalendar(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] handleCalendar`);
    }
    const method=comm.getreq().method;
    switch(method){
        case 'PROPFIND':
            calendarread.propfind(comm);
            break;
        case 'PROPPATCH':
            calendarwrite.proppatch(comm);
            break;
        case 'OPTIONS':
            options(comm);
            break;
        case 'REPORT':
            calendarreport.report(comm);
            break;
        case 'PUT':
            calendarwrite.put(comm);
            break;
        case 'GET':
            calendarread.gett(comm);
            break;
        case 'DELETE':
            calendardel.del(comm);
            break;
        case 'MOVE':
            calendarmove.move(comm);
            break;
        case 'MKCALENDAR':
            calendarwrite.mkcalendar(comm);
            break;
        default:
            const res=comm.getres();
            if(config.LSE_Loglevel>=1){
                LSE_Logger.info(`[Fennel-NG CalDAV] Request method is unknown: ${method}`);
            }
            res.writeHead(500);
            res.write(method+" is not implemented yet");
            res.end();
            break;
    }
}
function options(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG CalDAV] calendar.options called`);
    }
    comm.setheader("Content-Type","text/html");
    comm.setheader("Server","Fennel-NG");
    comm.setheader("DAV","1, 2, 3, calendar-access, calendar-schedule");
    comm.setheader("Allow","OPTIONS, PROPFIND, HEAD, GET, REPORT, PROPPATCH, PUT, DELETE, POST, COPY, MOVE, MKCALENDAR");
    comm.setresponsecode(200);
    comm.flushresponse();
}
module.exports={
    handleroot:handleroot,
    handlecalendar:handlecalendar
}