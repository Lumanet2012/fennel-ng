function getsupportedreportset()
{
    var response = "";
    response += "<d:supported-report-set>\r\n";
    response += "<d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>\r\n";
    response += "<d:supported-report><d:report><d:expand-property/></d:report></d:supported-report>\r\n";
    response += "<d:supported-report><d:report><d:principal-property-search/></d:report></d:supported-report>\r\n";
    response += "<d:supported-report><d:report><d:principal-search-property-set/></d:report></d:supported-report>\r\n";
    response += "</d:supported-report-set>\r\n";
    return response;
}
function getcurrentuserprivilegeset()
{
    var response = "";
    response += "<d:current-user-privilege-set>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><cal:read-free-busy/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-acl/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-content/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-properties/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:bind/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:unbind/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:unlock/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read-acl/></d:privilege>\r\n";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read-current-user-privilege-set/></d:privilege>\r\n";
    response += "</d:current-user-privilege-set>\r\n";
    return response;
}
module.exports = {
    getsupportedreportset: getsupportedreportset,
    getcurrentuserprivilegeset: getcurrentuserprivilegeset
}