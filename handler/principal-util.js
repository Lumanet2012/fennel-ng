const { XMLParser } = require('fast-xml-parser');
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseAttributeValue: true
});
var config = require('../config').config;
var xml = {
    parseXml: function(body) {
        return parser.parse(body);
    }
};
function getCalendarUserAddressSet(comm)
{
    var response = "";
    response += "        <cal:calendar-user-address-set>" + config.xml_lineend;
    response += "        	<d:href>mailto:" + comm.getusername() + "</d:href>" + config.xml_lineend;
    response += "        	<d:href>" + comm.getPrincipalURL() + "</d:href>" + config.xml_lineend;
    response += "        </cal:calendar-user-address-set>" + config.xml_lineend;
    return response;
}
function getSupportedReportSet(comm)
{
    var response = "";
    response += "        <d:supported-report-set>" + config.xml_lineend;
    response += "        	<d:supported-report>" + config.xml_lineend;
    response += "        		<d:report>" + config.xml_lineend;
    response += "        			<d:expand-property/>" + config.xml_lineend;
    response += "        		</d:report>" + config.xml_lineend;
    response += "        	</d:supported-report>" + config.xml_lineend;
    response += "        	<d:supported-report>" + config.xml_lineend;
    response += "        		<d:report>" + config.xml_lineend;
    response += "        			<d:principal-property-search/>" + config.xml_lineend;
    response += "        		</d:report>" + config.xml_lineend;
    response += "        	</d:supported-report>" + config.xml_lineend;
    response += "        	<d:supported-report>" + config.xml_lineend;
    response += "        		<d:report>" + config.xml_lineend;
    response += "        			<d:principal-search-property-set/>" + config.xml_lineend;
    response += "        		</d:report>" + config.xml_lineend;
    response += "        	</d:supported-report>" + config.xml_lineend;
    response += "        </d:supported-report-set>" + config.xml_lineend;
    return response;
}
function getPrincipalSearchPropertySet(comm)
{
    var response = "";
    response += "<d:principal-search-property-set xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend;
    response += "  <d:principal-search-property>" + config.xml_lineend;
    response += "    <d:prop>" + config.xml_lineend;
    response += "      <d:displayname/>" + config.xml_lineend;
    response += "    </d:prop>" + config.xml_lineend;
    response += "    <d:description xml:lang=\"en\">Display name</d:description>" + config.xml_lineend;
    response += "  </d:principal-search-property>" + config.xml_lineend;
    response += "</d:principal-search-property-set>" + config.xml_lineend;
    return response;
}
function isReportPropertyCalendarProxyWriteFor(comm)
{
    var body = comm.getReqBody();
    if (!body) return false;
    try {
        var xmlDoc = xml.parseXml(body);
        var node = xmlDoc['A:expand-property'] && xmlDoc['A:expand-property']['A:property'];
        if (node && node['@_name'] === 'calendar-proxy-write-for') {
            return true;
        }
        return false;
    } catch (err) {
        LSE_Logger.error(`[Fennel-NG Principal] XML parsing error: ${err.message}`);
        return false;
    }
}
function replyPropertyCalendarProxyWriteFor(comm)
{
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"" + comm.getFullURL("/ns/") + " xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend);
    comm.appendResBody("<d:response>" + config.xml_lineend);
    comm.appendResBody("    <d:href>" + comm.getURL() + "</d:href>" + config.xml_lineend);
    comm.appendResBody("    <d:propstat>" + config.xml_lineend);
    comm.appendResBody("       <d:prop>" + config.xml_lineend);
    comm.appendResBody("           <cs:calendar-proxy-read-for/>" + config.xml_lineend);
    comm.appendResBody("           <cs:calendar-proxy-write-for/>" + config.xml_lineend);
    comm.appendResBody("       </d:prop>" + config.xml_lineend);
    comm.appendResBody("        <d:status>HTTP/1.1 200 OK</d:status>" + config.xml_lineend);
    comm.appendResBody("    </d:propstat>" + config.xml_lineend);
    comm.appendResBody("</d:response>" + config.xml_lineend);
    comm.appendResBody("</d:multistatus>" + config.xml_lineend);
}
module.exports = {
    getCalendarUserAddressSet: getCalendarUserAddressSet,
    getSupportedReportSet: getSupportedReportSet,
    getPrincipalSearchPropertySet: getPrincipalSearchPropertySet,
    isReportPropertyCalendarProxyWriteFor: isReportPropertyCalendarProxyWriteFor,
    replyPropertyCalendarProxyWriteFor: replyPropertyCalendarProxyWriteFor
};

