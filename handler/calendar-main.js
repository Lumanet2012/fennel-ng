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
var config = require('../config').config;
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
    LSE_Logger.debug(`[Fennel-NG CalDAV] handleRoot`);
    var method = comm.getReq().method;
    switch(method)
    {
        case 'PROPFIND':
            calendarRead.propfind(comm);
            break;
        case 'PROPPATCH':
            calendarWrite.proppatch(comm);
            break;
        case 'OPTIONS':
            options(comm);
            break;
        case 'REPORT':
            calendarRead.report(comm);
            break;
        case 'MKCALENDAR':
            calendarWrite.mkcalendar(comm);
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
    LSE_Logger.debug(`[Fennel-NG CalDAV] handleCalendar`);
    var method = comm.getReq().method;
    switch(method)
    {
        case 'PROPFIND':
            calendarRead.propfind(comm);
            break;
        case 'PROPPATCH':
            calendarWrite.proppatch(comm);
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
            calendarWrite.mkcalendar(comm);
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
module.exports = {
    handleRoot: handleRoot,
    handleCalendar: handleCalendar
};

