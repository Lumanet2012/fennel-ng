var config = require('../config').config;
var log = LSE_Logger;
function getSupportedReportSet(isRoot)
{
    var response = "";
    response += "<d:supported-report-set>";
    if(!isRoot)
    {
        response += "<d:supported-report><d:report><cal:calendar-multiget/></d:report></d:supported-report>" + config.xml_lineend;
        response += "<d:supported-report><d:report><cal:calendar-query/></d:report></d:supported-report>" + config.xml_lineend;
        response += "<d:supported-report><d:report><cal:free-busy-query/></d:report></d:supported-report>" + config.xml_lineend;
    }
    response += "<d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>" + config.xml_lineend;
    response += "<d:supported-report><d:report><d:expand-property/></d:report></d:supported-report>" + config.xml_lineend;
    response += "<d:supported-report><d:report><d:principal-property-search/></d:report></d:supported-report>" + config.xml_lineend;
    response += "<d:supported-report><d:report><d:principal-search-property-set/></d:report></d:supported-report>" + config.xml_lineend;
    response += "</d:supported-report-set>" + config.xml_lineend;
    return response;
}
function getCurrentUserPrivilegeSet()
{
    var response = "";
    response += "<d:current-user-privilege-set>" + config.xml_lineend;
    response += "<d:privilege xmlns:d=\"DAV:\"><cal:read-free-busy/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-acl/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-content/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-properties/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege xmlns:d=\"DAV:\"><d:bind/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege xmlns:d=\"DAV:\"><d:unbind/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege xmlns:d=\"DAV:\"><d:unlock/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read-acl/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read-current-user-privilege-set/></d:privilege>" + config.xml_lineend;
    response += "</d:current-user-privilege-set>" + config.xml_lineend;
    return response;
}
function getACL(comm)
{
    var realUsername = comm.getRealUsername();
    var caldavUsername = comm.getCaldavUsername();
    var response = "";
    var lineend = config.xml_lineend;
    response += "<d:acl>" + lineend;
    response += "    <d:ace>" + lineend;
    response += "        <d:principal><d:href>" + comm.getPrincipalURL() + "</d:href></d:principal>" + lineend;
    response += "        <d:grant><d:privilege><d:read/></d:privilege></d:grant>" + lineend;
    response += "        <d:protected/>" + lineend;
    response += "    </d:ace>" + lineend;
    response += "    <d:ace>" + lineend;
    response += "        <d:principal><d:href>" + comm.getPrincipalURL() + "</d:href></d:principal>" + lineend;
    response += "        <d:grant><d:privilege><d:write/></d:privilege></d:grant>" + lineend;
    response += "        <d:protected/>" + lineend;
    response += "    </d:ace>" + lineend;
    response += "    <d:ace>" + lineend;
    response += "        <d:principal><d:href>" + comm.getPrincipalURL() + "calendar-proxy-write/</d:href></d:principal>" + lineend;
    response += "        <d:grant><d:privilege><d:read/></d:privilege></d:grant>" + lineend;
    response += "        <d:protected/>" + lineend;
    response += "    </d:ace>" + lineend;
    response += "    <d:ace>" + lineend;
    response += "        <d:principal><d:href>" + comm.getPrincipalURL() + "calendar-proxy-write/</d:href></d:principal>" + lineend;
    response += "        <d:grant><d:privilege><d:write/></d:privilege></d:grant>" + lineend;
    response += "        <d:protected/>" + lineend;
    response += "    </d:ace>" + lineend;
    response += "    <d:ace>" + lineend;
    response += "        <d:principal><d:href>" + comm.getPrincipalURL() + "calendar-proxy-read/</d:href></d:principal>" + lineend;
    response += "        <d:grant><d:privilege><d:read/></d:privilege></d:grant>" + lineend;
    response += "        <d:protected/>" + lineend;
    response += "    </d:ace>" + lineend;
    response += "    <d:ace>" + lineend;
    response += "        <d:principal><d:authenticated/></d:principal>" + lineend;
    response += "        <d:grant><d:privilege><cal:read-free-busy/></d:privilege></d:grant>" + lineend;
    response += "        <d:protected/>" + lineend;
    response += "    </d:ace>" + lineend;
    response += "    <d:ace>" + lineend;
    response += "        <d:principal><d:href>/p/system/admins/</d:href></d:principal>" + lineend;
    response += "        <d:grant><d:privilege><d:all/></d:privilege></d:grant>" + lineend;
    response += "        <d:protected/>" + lineend;
    response += "    </d:ace>" + lineend;
    return response;
}
function returnOutbox(comm)
{
    var response = "";
    var caldavUsername = comm.getCaldavUsername();
    var lineend = config.xml_lineend;
    response += "<d:response>" + lineend;
    response += "   <d:href>" + comm.getCalendarURL(null, "outbox") + "</d:href>" + lineend;
    response += "    <d:propstat>" + lineend;
    response += "        <d:prop>" + lineend;
    response += "            <d:current-user-privilege-set>" + lineend;
    response += "               <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "                   <d:read/>" + lineend;
    response += "               </d:privilege>" + lineend;
    response += "               <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "                   <d:read-acl/>" + lineend;
    response += "               </d:privilege>" + lineend;
    response += "               <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "                   <d:read-current-user-privilege-set/>" + lineend;
    response += "               </d:privilege>" + lineend;
    response += "               <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "                   <d:schedule-post-vevent xmlns:d=\"urn:ietf:params:xml:ns:caldav\"/>" + lineend;
    response += "               </d:privilege>" + lineend;
    response += "               <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "                   <d:schedule-query-freebusy xmlns:d=\"urn:ietf:params:xml:ns:caldav\"/>" + lineend;
    response += "               </d:privilege>" + lineend;
    response += "           </d:current-user-privilege-set>" + lineend;
    response += "           <d:owner>" + lineend;
    response += "               <d:href>" + comm.getPrincipalURL() + "</d:href>" + lineend;
    response += "           </d:owner>" + lineend;
    response += "           <d:resourcetype>" + lineend;
    response += "              <d:collection/>" + lineend;
    response += "               <cal:schedule-outbox/>" + lineend;
    response += "           </d:resourcetype>" + lineend;
    response += "           <d:supported-report-set>" + lineend;
    response += "              <d:supported-report>" + lineend;
    response += "                   <d:report>" + lineend;
    response += "                       <d:expand-property/>" + lineend;
    response += "                   </d:report>" + lineend;
    response += "               </d:supported-report>" + lineend;
    response += "               <d:supported-report>" + lineend;
    response += "                   <d:report>" + lineend;
    response += "                       <d:principal-property-search/>" + lineend;
    response += "                   </d:report>" + lineend;
    response += "               </d:supported-report>" + lineend;
    response += "               <d:supported-report>" + lineend;
    response += "                    <d:report>" + lineend;
    response += "                       <d:principal-search-property-set/>" + lineend;
    response += "                   </d:report>" + lineend;
    response += "               </d:supported-report>" + lineend;
    response += "            </d:supported-report-set>" + lineend;
    response += "       </d:prop>" + lineend;
    response += "       <d:status>HTTP/1.1 200 OK</d:status>" + lineend;
    response += "   </d:propstat>" + lineend;
    response += "</d:response>" + lineend;
    return response;
}
function returnNotifications(comm)
{
    var response = "";
    var caldavUsername = comm.getCaldavUsername();
    var lineend = config.xml_lineend;
    response += "<d:response>" + lineend;
    response += "<d:href>" + comm.getCalendarURL(null, "notifications") + "</d:href>" + lineend;
    response += "<d:propstat>" + lineend;
    response += "    <d:prop>" + lineend;
    response += "        <d:current-user-privilege-set>" + lineend;
    response += "            <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "                <d:write/>" + lineend;
    response += "           </d:privilege>" + lineend;
    response += "           <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "               <d:write-acl/>" + lineend;
    response += "           </d:privilege>" + lineend;
    response += "           <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "               <d:write-properties/>" + lineend;
    response += "          </d:privilege>" + lineend;
    response += "           <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "               <d:write-content/>" + lineend;
    response += "           </d:privilege>" + lineend;
    response += "            <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "               <d:bind/>" + lineend;
    response += "            </d:privilege>" + lineend;
    response += "            <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "                <d:unbind/>" + lineend;
    response += "            </d:privilege>" + lineend;
    response += "            <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "                <d:unlock/>" + lineend;
    response += "           </d:privilege>" + lineend;
    response += "           <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "               <d:read/>" + lineend;
    response += "           </d:privilege>" + lineend;
    response += "           <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "                <d:read-acl/>" + lineend;
    response += "           </d:privilege>" + lineend;
    response += "           <d:privilege xmlns:d=\"DAV:\">" + lineend;
    response += "               <d:read-current-user-privilege-set/>" + lineend;
    response += "            </d:privilege>" + lineend;
    response += "       </d:current-user-privilege-set>" + lineend;
    response += "       <d:owner>" + lineend;
    response += "           <d:href>" + comm.getPrincipalURL() + "</d:href>" + lineend;
    response += "       </d:owner>" + lineend;
    response += "       <d:resourcetype>" + lineend;
    response += "           <d:collection/>" + lineend;
    response += "           <cs:notification/>" + lineend;
    response += "       </d:resourcetype>" + lineend;
    response += "       <d:supported-report-set>" + lineend;
    response += "           <d:supported-report>" + lineend;
    response += "               <d:report>" + lineend;
    response += "                   <d:expand-property/>" + lineend;
    response += "               </d:report>" + lineend;
    response += "           </d:supported-report>" + lineend;
    response += "           <d:supported-report>" + lineend;
    response += "               <d:report>" + lineend;
    response += "                   <d:principal-property-search/>" + lineend;
    response += "               </d:report>" + lineend;
    response += "           </d:supported-report>" + lineend;
    response += "          <d:supported-report>" + lineend;
    response += "               <d:report>" + lineend;
    response += "                  <d:principal-search-property-set/>" + lineend;
    response += "              </d:report>" + lineend;
    response += "           </d:supported-report>" + lineend;
    response += "       </d:supported-report-set>" + lineend;
    response += "   </d:prop>" + lineend;
    response += "<d:status>HTTP/1.1 200 OK</d:status>" + lineend;
    response += "</d:propstat>" + lineend;
    response += "</d:response>" + lineend;
    return response;
}
module.exports = {
    getSupportedReportSet: getSupportedReportSet,
    getCurrentUserPrivilegeSet: getCurrentUserPrivilegeSet,
    getACL: getACL,
    returnOutbox: returnOutbox,
    returnNotifications: returnNotifications
};

