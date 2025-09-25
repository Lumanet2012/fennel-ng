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
var principalUtil = require('./principal-util');
module.exports = {
    propfind: propfind,
    report: report
};
function propfind(comm)
{
    LSE_Logger.debug(`[Fennel-NG Principal] principal.propfind called`);
    comm.setStandardHeaders();
    comm.setDAVHeaders();
    comm.setResponseCode(207);
    comm.appendResBody(xh.getXMLHead());
    var body = comm.getReqBody();
    var xmlDoc = xml.parseXml(body);
    var node = xmlDoc.propfind;
    var childs = node && node.prop ? Object.keys(node.prop) : [];
    var response = "";
    var len = childs.length;
    for (var i=0; i < len; ++i)
    {
        var child = childs[i];
        switch(child)
        {
            case 'checksum-versions':
                response += "";
                break;
            case 'sync-token':
                response += "<d:sync-token>http://sabredav.org/ns/sync/5</d:sync-token>";
                break;
            case 'supported-report-set':
                response += principalUtil.getSupportedReportSet(comm);
                break;
            case 'principal-URL':
                response += "<d:principal-URL><d:href>" + comm.getPrincipalURL() + "</d:href></d:principal-URL>" + config.xml_lineend;
                break;
            case 'displayname':
                response += "<d:displayname>" + comm.getRealUsername() + "</d:displayname>";
                break;
            case 'principal-collection-set':
                response += "<d:principal-collection-set><d:href>" + comm.getFullURL("/p/") + "</d:href></d:principal-collection-set>";
                break;
            case 'current-user-principal':
                response += "<d:current-user-principal><d:href>" + comm.getPrincipalURL() + "</d:href></d:current-user-principal>";
                break;
            case 'calendar-home-set':
                response += "<cal:calendar-home-set><d:href>" + comm.getCalendarURL() + "</d:href></cal:calendar-home-set>";
                break;
            case 'schedule-outbox-URL':
                response += "<cal:schedule-outbox-URL><d:href>" + comm.getCalendarURL(null, "outbox") + "</d:href></cal:schedule-outbox-URL>";
                break;
            case 'calendar-user-address-set':
                response += principalUtil.getCalendarUserAddressSet(comm);
                break;
            case 'notification-URL':
                response += "<cs:notification-URL><d:href>" + comm.getCalendarURL(null, "notifications") + "</d:href></cs:notification-URL>";
                break;
            case 'getcontenttype':
                response += "";
                break;
            case 'addressbook-home-set':
                response += "<card:addressbook-home-set><d:href>" + comm.getCardURL() + "</d:href></card:addressbook-home-set>";
                break;
            case 'directory-gateway':
                response += "";
                break;
            case 'email-address-set':
                response += "<cs:email-address-set><cs:email-address>lord test at swordlord.com</cs:email-address></cs:email-address-set>";
                break;
            case 'resource-id':
                response += "";
                break;
            default:
                if(child != 'text') LSE_Logger.warn(`[Fennel-NG Principal] P-PF: not handled: ${child}`);
                break;
        }
    }
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">");
    comm.appendResBody("<d:response><d:href>" + comm.getFullURL(comm.getURL()) + "</d:href>");
    comm.appendResBody("<d:propstat>" + config.xml_lineend);
    comm.appendResBody("<d:prop>" + config.xml_lineend);
    comm.appendResBody(response);
    comm.appendResBody("</d:prop>" + config.xml_lineend);
    comm.appendResBody("<d:status>HTTP/1.1 200 OK</d:status>" + config.xml_lineend);
    comm.appendResBody("</d:propstat>" + config.xml_lineend);
    comm.appendResBody("</d:response>" + config.xml_lineend);
    comm.appendResBody("</d:multistatus>" + config.xml_lineend);
    comm.flushResponse();
}
function report(comm)
{
    LSE_Logger.debug(`[Fennel-NG Principal] principal.report called`);
    comm.setStandardHeaders();
    var body = comm.getReqBody();
    if(!body)
    {
        LSE_Logger.warn(`[Fennel-NG Principal] principal.report called with no body`);
        comm.setResponseCode(500);
        comm.appendResBody("Internal Server Error" + config.xml_lineend);
        comm.flushResponse();
        return;
    }
    comm.setResponseCode(200);
    comm.appendResBody(xh.getXMLHead());
    var xmlDoc = xml.parseXml(body);
    var rootKeys = Object.keys(xmlDoc);
    var rootName = rootKeys[0];
    var response = "";
    if(rootName !== undefined)
    {
        var node = xmlDoc[rootName];
        var childs = node ? Object.keys(node) : [];
        var len = childs.length;
        for (var i=0; i < len; ++i)
        {
            var child = childs[i];
            switch(child)
            {
                case 'principal-search-property-set':
                    response += principalUtil.getPrincipalSearchPropertySet(comm);
                    break;
                default:
                    if(child != 'text') LSE_Logger.warn(`[Fennel-NG Principal] P-R: not handled: ${child}`);
                    break;
            }
        }
    }
    var rootElement = xmlDoc[rootKeys[0]];
    if(rootElement !== undefined)
    {
        switch(rootKeys[0])
        {
            case 'principal-search-property-set':
                response += principalUtil.getPrincipalSearchPropertySet(comm);
                break;
            default:
                if(rootKeys[0] != 'text') LSE_Logger.warn(`[Fennel-NG Principal] P-R: not handled: ${rootKeys[0]}`);
                break;
        }
    }
    comm.appendResBody(response);
    if(principalUtil.isReportPropertyCalendarProxyWriteFor(comm))
    {
        principalUtil.replyPropertyCalendarProxyWriteFor(comm);
    }
    comm.flushResponse();
}

