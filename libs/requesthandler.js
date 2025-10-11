const config = require('../config').config;
const principal = require("../handler/principal-main");
const cal = require("../handler/calendar-main");
const card = require("../handler/addressbook-main");
function handleprincipal(request)
{
    const method = request.getreq().method;
    switch(method)
    {
        case 'PROPFIND':
            principal.propfind(request);
            break;
        case 'PROPPATCH':
            principal.proppatch(request);
            break;
        case 'OPTIONS':
            principal.options(request);
            break;
        case 'REPORT':
            principal.report(request);
            break;
        default:
            const res = request.getres();
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.info(`[Fennel-NG Principal] Request method is unknown: ${method}`);
            }
            res.writeHead(500);
            res.write(method + " is not implemented yet");
            res.end();
            break;
    }
}
function handlecalendar(request)
{
    const method = request.getreq().method;
    const urlelements = request.geturlelementsize();
    if(urlelements === 3)
    {
        cal.handleroot(request);
    }
    else
    {
        cal.handlecalendar(request);
    }
}
function handlecard(request)
{
    const method = request.getreq().method;
    switch(method)
    {
        case 'PROPFIND':
            card.propfind(request);
            break;
        case 'PROPPATCH':
            card.proppatch(request);
            break;
        case 'OPTIONS':
            card.options(request);
            break;
        case 'REPORT':
            card.report(request);
            break;
        case 'PUT':
            card.put(request);
            break;
        case 'GET':
            card.get(request);
            break;
        case 'DELETE':
            card.delete(request);
            break;
        case 'MOVE':
            card.move(request);
            break;
        default:
            const res = request.getres();
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.info(`[Fennel-NG CardDAV] Request method is unknown: ${method}`);
            }
            res.writeHead(500);
            res.write(method + " is not implemented yet");
            res.end();
            break;
    }
}
function handleaddressbook(request)
{
    handlecard(request);
}
function handlecalendarroot(request)
{
    cal.handleroot(request);
}
function handleaddressbookroot(request)
{
    card.propfind(request);
}
module.exports = {
    handleprincipal: handleprincipal,
    handlecalendar: handlecalendar,
    handlecard: handlecard,
    handleaddressbook: handleaddressbook,
    handlecalendarroot: handlecalendarroot,
    handleaddressbookroot: handleaddressbookroot
};
