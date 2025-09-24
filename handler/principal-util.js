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
function getCalendarUserAddressSet(comm)
{
    var response = "";
    response += "        <cal:calendar-user-address-set>\r\n";
    response += "        	<d:href>mailto:lord test at swordlord.com</d:href>\r\n";
    response += "        	<d:href>/p/" + comm.getUser().getUserName() + "/</d:href>\r\n";
    response += "        </cal:calendar-user-address-set>\r\n";
    return response;
}
function getSupportedReportSet(comm)
{
    var response = "";
    response += "        <d:supported-report-set>\r\n";
    response += "        	<d:supported-report>\r\n";
    response += "        		<d:report>\r\n";
    response += "        			<d:expand-property/>\r\n";
    response += "        		</d:report>\r\n";
    response += "        	</d:supported-report>\r\n";
    response += "        	<d:supported-report>\r\n";
    response += "        		<d:report>\r\n";
    response += "        			<d:principal-property-search/>\r\n";
    response += "        		</d:report>\r\n";
    response += "        	</d:supported-report>\r\n";
    response += "        	<d:supported-report>\r\n";
    response += "        		<d:report>\r\n";
    response += "        			<d:principal-search-property-set/>\r\n";
    response += "        		</d:report>\r\n";
    response += "        	</d:supported-report>\r\n";
    response += "        </d:supported-report-set>\r\n";
    return response;
}
function getPrincipalSearchPropertySet(comm)
{
    var response = "";
    response += "<d:principal-search-property-set xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n";
    response += "  <d:principal-search-property>\r\n";
    response += "    <d:prop>\r\n";
    response += "      <d:displayname/>\r\n";
    response += "    </d:prop>\r\n";
    response += "    <d:description xml:lang=\"en\">Display name</d:description>\r\n";
    response += "  </d:principal-search-property>\r\n";
    response += "</d:principal-search-property-set>\r\n";
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
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"" + comm.getFullURL("/ns/") + " xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n");
    comm.appendResBody("<d:response>\r\n");
    comm.appendResBody("    <d:href>" + comm.getURL() + "</d:href>\r\n");
    comm.appendResBody("    <d:propstat>\r\n");
    comm.appendResBody("       <d:prop>\r\n");
    comm.appendResBody("           <cs:calendar-proxy-read-for/>\r\n");
    comm.appendResBody("           <cs:calendar-proxy-write-for/>\r\n");
    comm.appendResBody("       </d:prop>\r\n");
    comm.appendResBody("        <d:status>HTTP/1.1 200 OK</d:status>\r\n");
    comm.appendResBody("    </d:propstat>\r\n");
    comm.appendResBody("</d:response>\r\n");
    comm.appendResBody("</d:multistatus>\r\n");
}
module.exports = {
    getCalendarUserAddressSet: getCalendarUserAddressSet,
    getSupportedReportSet: getSupportedReportSet,
    getPrincipalSearchPropertySet: getPrincipalSearchPropertySet,
    isReportPropertyCalendarProxyWriteFor: isReportPropertyCalendarProxyWriteFor,
    replyPropertyCalendarProxyWriteFor: replyPropertyCalendarProxyWriteFor
};
