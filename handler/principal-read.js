const {XMLParser}=require('fast-xml-parser');
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text",parseAttributeValue:true});
const xml={parsexmL:function(body){return parser.parse(body);}};
const config=require('../config').config;
const xh=require("../libs/xmlhelper");
const principalutil=require('./principal-util');
function propfind(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG Principal] principal.propfind called`);
    }
    comm.setstandardheaders();
    comm.setdavheaders();
    comm.setresponsecode(207);
    comm.appendresbody(xh.getxmlhead());
    const body=comm.getreqbody();
    const xmldoc=xml.parsexml(body);
    const node=xmldoc.propfind;
    const childs=node&&node.prop?Object.keys(node.prop):[];
    let response="";
    const len=childs.length;
    for(let i=0;i<len;++i){
        const child=childs[i];
        switch(child){
            case 'checksum-versions':
                response+="";
                break;
            case 'sync-token':
                response+="<d:sync-token>http://sabredav.org/ns/sync/5</d:sync-token>";
                break;
            case 'supported-report-set':
                response+=principalutil.getsupportedreportset(comm);
                break;
            case 'principal-URL':
                response+="<d:principal-URL><d:href>"+comm.getprincipalurl()+"</d:href></d:principal-URL>"+config.xml_lineend;
                break;
            case 'displayname':
                response+="<d:displayname>"+comm.getusername()+"</d:displayname>";
                break;
            case 'principal-collection-set':
                response+="<d:principal-collection-set><d:href>" + config.public_route_prefix + ("/p/")+"</d:href></d:principal-collection-set>";
                break;
            case 'current-user-principal':
                response+="<d:current-user-principal><d:href>"+comm.getprincipalurl()+"</d:href></d:current-user-principal>";
                break;
            case 'calendar-home-set':
                response+="<cal:calendar-home-set><d:href>"+comm.getcalendarurl()+"</d:href></cal:calendar-home-set>";
                break;
            case 'calendar-user-address-set':
                response+=principalutil.getcalendaruseraddressset(comm);
                break;
            case 'schedule-inbox-URL':
                response+="<cal:schedule-inbox-URL><d:href>"+comm.getcalendarurl()+"/inbox/</d:href></cal:schedule-inbox-URL>";
                break;
            case 'schedule-outbox-URL':
                response+="<cal:schedule-outbox-URL><d:href>"+comm.getcalendarurl()+"/outbox/</d:href></cal:schedule-outbox-URL>";
                break;
            case 'addressbook-home-set':
                response+="<card:addressbook-home-set><d:href>"+comm.getaddressbookurl()+"</d:href></card:addressbook-home-set>";
                break;
            case 'resourcetype':
                response+="<d:resourcetype><d:principal/></d:resourcetype>";
                break;
            case 'owner':
                response+="<d:owner><d:href>"+comm.getprincipalurl()+"</d:href></d:owner>";
                break;
            default:
                if(child!='text'){
                    if(config.LSE_Loglevel>=1){
                        LSE_Logger.warn(`[Fennel-NG Principal] P-PF: not handled: ${child}`);
                    }
                }
                break;
        }
    }
    comm.appendresbody("<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">"+config.xml_lineend);
    comm.appendresbody("<d:response>"+config.xml_lineend);
    comm.appendresbody("<d:href>"+comm.geturl()+"</d:href>"+config.xml_lineend);
    comm.appendresbody("<d:propstat>"+config.xml_lineend);
    comm.appendresbody("<d:prop>"+config.xml_lineend);
    comm.appendresbody(response);
    comm.appendresbody("</d:prop>"+config.xml_lineend);
    comm.appendresbody("<d:status>HTTP/1.1 200 OK</d:status>"+config.xml_lineend);
    comm.appendresbody("</d:propstat>"+config.xml_lineend);
    comm.appendresbody("</d:response>"+config.xml_lineend);
    comm.appendresbody("</d:multistatus>"+config.xml_lineend);
    comm.flushresponse();
}
function report(comm){
    if(config.LSE_Loglevel>=2){
        LSE_Logger.debug(`[Fennel-NG Principal] principal.report called`);
    }
    comm.setstandardheaders();
    comm.setdavheaders();
    comm.setresponsecode(207);
    comm.appendresbody(xh.getxmlhead());
    const body=comm.getreqbody();
    const xmldoc=xml.parsexml(body);
    const rootkeys=Object.keys(xmldoc);
    let response="";
    if(xmldoc[rootkeys[0]]&&typeof xmldoc[rootkeys[0]]==='object'){
        const node=xmldoc[rootkeys[0]];
        const childs=node?Object.keys(node):[];
        const len=childs.length;
        for(let i=0;i<len;++i){
            const child=childs[i];
            switch(child){
                case 'principal-search-property-set':
                    response+=principalutil.getprincipalsearchpropertyset(comm);
                    break;
                default:
                    if(child!='text'){
                        if(config.LSE_Loglevel>=1){
                            LSE_Logger.warn(`[Fennel-NG Principal] P-R: not handled: ${child}`);
                        }
                    }
                    break;
            }
        }
    }
    const rootelement=xmldoc[rootkeys[0]];
    if(rootelement!==undefined){
        switch(rootkeys[0]){
            case 'principal-search-property-set':
                response+=principalutil.getprincipalsearchpropertyset(comm);
                break;
            default:
                if(rootkeys[0]!='text'){
                    if(config.LSE_Loglevel>=1){
                        LSE_Logger.warn(`[Fennel-NG Principal] P-R: not handled: ${rootkeys[0]}`);
                    }
                }
                break;
        }
    }
    comm.appendresbody(response);
    if(principalutil.isreportpropertycalendarproxywritefor(comm)){
        principalutil.replypropertycalendarproxywritefor(comm);
    }
    comm.flushresponse();
}
module.exports={
    propfind:propfind,
    report:report
};

