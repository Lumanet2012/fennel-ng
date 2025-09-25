var config = require('../config').config;
var xh = require("../libs/xmlhelper");
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
    LSE_Logger.debug(`[Fennel-NG Principal] principal.options called`);
    comm.pushOptionsResponse();
}
function proppatch(comm)
{
    LSE_Logger.debug(`[Fennel-NG Principal] principal.proppatch called`);
    comm.setStandardHeaders(comm);
    var url = comm.getURL();
    comm.setResponseCode(200);
    comm.appendResBody("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
    comm.appendResBody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">" + config.xml_lineend);
    comm.appendResBody("	<d:response>" + config.xml_lineend);
    comm.appendResBody("		<d:href>" + url + "</d:href>" + config.xml_lineend);
    comm.appendResBody("		<d:propstat>" + config.xml_lineend);
    comm.appendResBody("			<d:prop>" + config.xml_lineend);
    comm.appendResBody("				<cal:default-alarm-vevent-date/>" + config.xml_lineend);
    comm.appendResBody("			</d:prop>" + config.xml_lineend);
    comm.appendResBody("			<d:status>HTTP/1.1 403 Forbidden</d:status>" + config.xml_lineend);
    comm.appendResBody("		</d:propstat>" + config.xml_lineend);
    comm.appendResBody("	</d:response>" + config.xml_lineend);
    comm.appendResBody("</d:multistatus>" + config.xml_lineend);
    comm.flushResponse();
}

