var principal = require("../handler/principal-main");
var cal = require("../handler/calendar-main");
var card = require("../handler/addressbook-main");
function handlePrincipal(request)
{
    var method = request.getReq().method;
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
            var res = request.getRes();
            LSE_Logger.info(`[Fennel-NG Principal] Request method is unknown: ${method}`);
            res.writeHead(500);
            res.write(method + " is not implemented yet");
            res.end();
            break;
    }
}
function handleCalendar(request)
{
    var method = request.getReq().method;
    var urlElements = request.getUrlElementSize();
    if(urlElements === 3)
    {
        cal.handleRoot(request);
    }
    else
    {
        cal.handleCalendar(request);
    }
}
function handleCard(request)
{
    var method = request.getReq().method;
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
            var res = request.getRes();
            LSE_Logger.info(`[Fennel-NG CardDAV] Request method is unknown: ${method}`);
            res.writeHead(500);
            res.write(method + " is not implemented yet");
            res.end();
            break;
    }
}
function handleAddressbook(request)
{
    handleCard(request);
}
function handleCalendarRoot(request)
{
    cal.handleRoot(request);
}
function handleAddressbookRoot(request)
{
    card.propfind(request);
}
module.exports = {
    handlePrincipal: handlePrincipal,
    handleCalendar: handleCalendar,
    handleCard: handleCard,
    handleAddressbook: handleAddressbook,
    handleCalendarRoot: handleCalendarRoot,
    handleAddressbookRoot: handleAddressbookRoot
};

