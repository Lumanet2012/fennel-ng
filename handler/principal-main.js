var xml = require("libxmljs");
var xh = require("../libs/xmlhelper");
var LSE_logger = require('LSE_logger');
var principalRead = require('./principal-read');
var principalUtil = require('./principal-util');
module.exports = {
    propfind: principalRead.propfind,
    proppatch: proppatch,
    report: principalRead.report,
    options: options
};
function options(comm)
{
    LSE_logger.debug(`[Fennel-NG Principal] principal.options called`);
    comm.pushOptionsResponse();
}
function proppatch(comm)
{
    LSE_logger.debug(`[Fennel-NG Principal] principal.proppatch called`);
    comm.setStandardHeaders(comm);
    var url = comm.getURL();
    comm.setResponseCode(200);
    comm.appendResBody("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n");
    comm.appendResBody("	<d:response>\r\n");
    comm.appendResBody("		<d:href>" + url + "</d:href>\r\n");
    comm.appendResBody("		<d:propstat>\r\n");
    comm.appendResBody("			<d:prop>\r\n");
    comm.appendResBody("				<cal:default-alarm-vevent-date/>\r\n");
    comm.appendResBody("			</d:prop>\r\n");
    comm.appendResBody("			<d:status>HTTP/1.1 403 Forbidden</d:status>\r\n");
    comm.appendResBody("		</d:propstat>\r\n");
    comm.appendResBody("	</d:response>\r\n");
    comm.appendResBody("</d:multistatus>\r\n");
    comm.flushResponse();
}

