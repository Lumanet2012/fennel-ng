// XML parsing temporarily disabled
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
    var xmlDoc = xml.parseXml(body);
    var node = xmlDoc.get('/A:expand-property/A:property[@name=\'calendar-proxy-write-for\']', { A: 'DAV:', C: 'http://calendarserver.org/ns/'});
    return typeof node != 'undefined';
}
function replyPropertyCalendarProxyWriteFor(comm)
{
    var url = comm.getURL();
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n");
    comm.appendResBody("<d:response>");
    comm.appendResBody("    <d:href>" + url + "</d:href>");
    comm.appendResBody("    <d:propstat>");
    comm.appendResBody("       <d:prop>");
    comm.appendResBody("           <cs:calendar-proxy-read-for/>");
    comm.appendResBody("           <cs:calendar-proxy-write-for/>");
    comm.appendResBody("       </d:prop>");
    comm.appendResBody("        <d:status>HTTP/1.1 200 OK</d:status>");
    comm.appendResBody("    </d:propstat>");
    comm.appendResBody("</d:response>");
    comm.appendResBody("</d:multistatus>\r\n");
}
module.exports = {
    getSupportedReportSet: getSupportedReportSet,
    getPrincipalSearchPropertySet: getPrincipalSearchPropertySet,
    isReportPropertyCalendarProxyWriteFor: isReportPropertyCalendarProxyWriteFor,
    replyPropertyCalendarProxyWriteFor: replyPropertyCalendarProxyWriteFor
};
