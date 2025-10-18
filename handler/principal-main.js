const config=require('../config').config;
const xh=require("../libs/xmlhelper");
const principalread=require('./principal-read');
const principalutil=require('./principal-util');
function options(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG Principal] principal.options called`);
    }
    comm.pushoptionsresponse();
}
function proppatch(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG Principal] principal.proppatch called`);
    }
    comm.setstandardheaders(comm);
    const url=comm.geturl();
    comm.setresponsecode(200);
    comm.appendresbody("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
    comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
    comm.appendresbody("	<d:response>"+config.xml_lineend);
    comm.appendresbody("		<d:href>"+url+"</d:href>"+config.xml_lineend);
    comm.appendresbody("		<d:propstat>"+config.xml_lineend);
    comm.appendresbody("			<d:prop>"+config.xml_lineend);
    comm.appendresbody("				<cal:default-alarm-vevent-date/>"+config.xml_lineend);
    comm.appendresbody("			</d:prop>"+config.xml_lineend);
    comm.appendresbody("			<d:status>HTTP/1.1 403 Forbidden</d:status>"+config.xml_lineend);
    comm.appendresbody("		</d:propstat>"+config.xml_lineend);
    comm.appendresbody("	</d:response>"+config.xml_lineend);
    comm.appendresbody("</d:multistatus>"+config.xml_lineend);
    comm.flushresponse();
}
module.exports={
    propfind:principalread.propfind,
    proppatch:proppatch,
    report:principalread.report,
    options:options
}