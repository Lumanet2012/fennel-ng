const fastxmlparser=require('fast-xml-parser');
const parser=new fastxmlparser.XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text",parseAttributeValue:true,removeNSPrefix:true});
const xml={parsexml:function(body){return parser.parse(body);}};
const config=require('../config').config;
function getcalendaruseraddressset(comm){
    let response="";
    response+="        <cal:calendar-user-address-set>"+config.xml_lineend;
    response+="        	<d:href>mailto:"+comm.getusername()+"</d:href>"+config.xml_lineend;
    response+="        	<d:href>"+comm.getprincipalurl()+"</d:href>"+config.xml_lineend;
    response+="        </cal:calendar-user-address-set>"+config.xml_lineend;
    return response;
}
function getcurrentuserprivilegeset() {
    let response = "";
    response += "<d:current-user-privilege-set>" + config.xml_lineend;
    response += "<d:privilege><cal:read-free-busy/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege><d:write/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege><d:write-acl/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege><d:write-content/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege><d:write-properties/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege><d:bind/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege><d:unbind/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege><d:unlock/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege><d:read/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege><d:read-acl/></d:privilege>" + config.xml_lineend;
    response += "<d:privilege><d:read-current-user-privilege-set/></d:privilege>" + config.xml_lineend;
    response += "</d:current-user-privilege-set>" + config.xml_lineend;
    return response;
}
function getsupportedreportset(comm){
    let response="";
    response+="        <d:supported-report-set>"+config.xml_lineend;
    response+="        	<d:supported-report>"+config.xml_lineend;
    response+="        		<d:report>"+config.xml_lineend;
    response+="        			<d:expand-property/>"+config.xml_lineend;
    response+="        		</d:report>"+config.xml_lineend;
    response+="        	</d:supported-report>"+config.xml_lineend;
    response+="        	<d:supported-report>"+config.xml_lineend;
    response+="        		<d:report>"+config.xml_lineend;
    response+="        			<d:principal-property-search/>"+config.xml_lineend;
    response+="        		</d:report>"+config.xml_lineend;
    response+="        	</d:supported-report>"+config.xml_lineend;
    response+="        	<d:supported-report>"+config.xml_lineend;
    response+="        		<d:report>"+config.xml_lineend;
    response+="        			<d:principal-search-property-set/>"+config.xml_lineend;
    response+="        		</d:report>"+config.xml_lineend;
    response+="        	</d:supported-report>"+config.xml_lineend;
    response+="        </d:supported-report-set>"+config.xml_lineend;
    return response;
}
function getprincipalsearchpropertyset(comm){
    let response="";
    response+="<d:principal-search-property-set xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend;
    response+="  <d:principal-search-property>"+config.xml_lineend;
    response+="    <d:prop>"+config.xml_lineend;
    response+="      <d:displayname/>"+config.xml_lineend;
    response+="    </d:prop>"+config.xml_lineend;
    response+="    <d:description xml:lang=\"en\">Display name</d:description>"+config.xml_lineend;
    response+="  </d:principal-search-property>"+config.xml_lineend;
    response+="</d:principal-search-property-set>"+config.xml_lineend;
    return response;
}
function isreportpropertycalendarproxywritefor(comm){
    const body=comm.getreqbody();
    if(!body) return false;
    try{
        const xmldoc=xml.parsexml(body);
        const node=xmldoc['A:expand-property']&&xmldoc['A:expand-property']['A:property'];
        if(node&&node['@_name']==='calendar-proxy-write-for'){
            return true;
        }
        return false;
    }catch(err){
        if(config.LSE_Loglevel>=1){
            LSE_Logger.error(`[Fennel-NG Principal] XML parsing error: ${err.message}`);
        }
        return false;
    }
}
function replypropertycalendarproxywritefor(comm){
    comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\""+comm.getfullurl("/ns/")+" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
    comm.appendresbody("<d:response>"+config.xml_lineend);
    comm.appendresbody("    <d:href>"+comm.geturl()+"</d:href>"+config.xml_lineend);
    comm.appendresbody("    <d:propstat>"+config.xml_lineend);
    comm.appendresbody("       <d:prop>"+config.xml_lineend);
    comm.appendresbody("           <cs:calendar-proxy-read-for/>"+config.xml_lineend);
    comm.appendresbody("           <cs:calendar-proxy-write-for/>"+config.xml_lineend);
    comm.appendresbody("       </d:prop>"+config.xml_lineend);
    comm.appendresbody("        <d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend);
    comm.appendresbody("    </d:propstat>"+config.xml_lineend);
    comm.appendresbody("</d:response>"+config.xml_lineend);
    comm.appendresbody("</d:multistatus>"+config.xml_lineend);
}
module.exports={
    getcurrentuserprivilegeset:getcurrentuserprivilegeset,
    getcalendaruseraddressset:getcalendaruseraddressset,
    getsupportedreportset:getsupportedreportset,
    getprincipalsearchpropertyset:getprincipalsearchpropertyset,
    isreportpropertycalendarproxywritefor:isreportpropertycalendarproxywritefor,
    replypropertycalendarproxywritefor:replypropertycalendarproxywritefor
}
