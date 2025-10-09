const redis = require('./redis');
const xmlHelper = require('./xmlhelper');
const config = require('../config').config;
async function processRequest(req, res, options = {}) {
    const method = req.method.toUpperCase();
    const path = req.path;
    LSE_Logger.info(`Request received: ${method} ${path}`);
    switch (method) {
        case 'PROPFIND':
            return handlePropfind(req, res, options);
        case 'REPORT':
            return handleReport(req, res, options);
        default:
            LSE_Logger.warn(`Unhandled method: ${method}`);
            res.status(405).send('Method Not Allowed');
            return { success: false, error: 'Method not allowed' };
    }
}
async function handleCommonCalDAVProperties(req, res, propNames, username, resourcePath, xmlDoc) {
    const responseElement = xmlDoc.createElementNS('DAV:', 'response');
    const hrefElement = xmlDoc.createElementNS('DAV:', 'href');
    hrefElement.textContent = resourcePath;
    responseElement.appendChild(hrefElement);
    const propstatElement = xmlDoc.createElementNS('DAV:', 'propstat');
    const propElement = xmlDoc.createElementNS('DAV:', 'prop');
    const handledProps = [];
    for (const propName of propNames) {
        try {
            switch (propName) {
                case 'd:sync-token':
                    let syncToken = await redis.getCalendarSyncToken(resourcePath, username);
                    if (!syncToken) {
                        syncToken = Math.floor(Date.now() / 1000).toString();
                        await redis.setCalendarSyncToken(resourcePath, username, syncToken);
                    }
                    const syncTokenElement = xmlDoc.createElementNS('DAV:', 'sync-token');
                    syncTokenElement.textContent = `https://${config.ip}/ns/sync/${encodeURIComponent(resourcePath)}/${syncToken}`;
                    propElement.appendChild(syncTokenElement);
                    handledProps.push(propName);
                    break;
                case 'l:supported-calendar-component-set':
                    const supportedComponentElement = xmlDoc.createElementNS('urn:ietf:params:xml:ns:caldav', 'supported-calendar-component-set');
                    const eventElement = xmlDoc.createElementNS('urn:ietf:params:xml:ns:caldav', 'comp');
                    eventElement.setAttribute('name', 'VEVENT');
                    supportedComponentElement.appendChild(eventElement);
                    const todoElement = xmlDoc.createElementNS('urn:ietf:params:xml:ns:caldav', 'comp');
                    todoElement.setAttribute('name', 'VTODO');
                    supportedComponentElement.appendChild(todoElement);
                    propElement.appendChild(supportedComponentElement);
                    handledProps.push(propName);
                    break;
                case 'd:supportedlock':
                    const supportedLockElement = xmlDoc.createElementNS('DAV:', 'supportedlock');
                    const lockEntryElement = xmlDoc.createElementNS('DAV:', 'lockentry');
                    const lockScopeElement = xmlDoc.createElementNS('DAV:', 'lockscope');
                    lockScopeElement.appendChild(xmlDoc.createElementNS('DAV:', 'exclusive'));
                    const lockTypeElement = xmlDoc.createElementNS('DAV:', 'locktype');
                    lockTypeElement.appendChild(xmlDoc.createElementNS('DAV:', 'write'));
                    lockEntryElement.appendChild(lockScopeElement);
                    lockEntryElement.appendChild(lockTypeElement);
                    supportedLockElement.appendChild(lockEntryElement);
                    propElement.appendChild(supportedLockElement);
                    handledProps.push(propName);
                    break;
                case 'd:supported-report-set':
                    const supportedReportSetElement = xmlDoc.createElementNS('DAV:', 'supported-report-set');
                    let supportedReportElement = xmlDoc.createElementNS('DAV:', 'supported-report');
                    let reportElement = xmlDoc.createElementNS('DAV:', 'report');
                    reportElement.appendChild(xmlDoc.createElementNS('urn:ietf:params:xml:ns:caldav', 'calendar-query'));
                    supportedReportElement.appendChild(reportElement);
                    supportedReportSetElement.appendChild(supportedReportElement);
                    supportedReportElement = xmlDoc.createElementNS('DAV:', 'supported-report');
                    reportElement = xmlDoc.createElementNS('DAV:', 'report');
                    reportElement.appendChild(xmlDoc.createElementNS('urn:ietf:params:xml:ns:caldav', 'calendar-multiget'));
                    supportedReportElement.appendChild(reportElement);
                    supportedReportSetElement.appendChild(supportedReportElement);
                    supportedReportElement = xmlDoc.createElementNS('DAV:', 'supported-report');
                    reportElement = xmlDoc.createElementNS('DAV:', 'report');
                    reportElement.appendChild(xmlDoc.createElementNS('DAV:', 'sync-collection'));
                    supportedReportElement.appendChild(reportElement);
                    supportedReportSetElement.appendChild(supportedReportElement);
                    propElement.appendChild(supportedReportSetElement);
                    handledProps.push(propName);
                    break;
                case 'a:calendar-color':
                    const calendarColorElement = xmlDoc.createElementNS('http://apple.com/ns/ical/', 'calendar-color');
                    calendarColorElement.textContent = '#0066CC';
                    propElement.appendChild(calendarColorElement);
                    handledProps.push(propName);
                    break;
                case 'i:addressbook-color':
                    const addressbookColorElement = xmlDoc.createElementNS('http://inf-it.com/ns/ab/', 'addressbook-color');
                    addressbookColorElement.textContent = '#FF9900';
                    propElement.appendChild(addressbookColorElement);
                    handledProps.push(propName);
                    break;
                case 'i:headervalue':
                    const headerValueElement = xmlDoc.createElementNS('http://inf-it.com/ns/dav/', 'headervalue');
                    headerValueElement.textContent = '';
                    propElement.appendChild(headerValueElement);
                    handledProps.push(propName);
                    break;
                case 'r:max-image-size':
                    const maxImageSizeElement = xmlDoc.createElementNS('urn:ietf:params:xml:ns:carddav', 'max-image-size');
                    maxImageSizeElement.textContent = '1048576';
                    propElement.appendChild(maxImageSizeElement);
                    handledProps.push(propName);
                    break;
                default:
                    LSE_Logger.debug(`Property ${propName} not handled by common handler`);
                    break;
            }
        } catch (error) {
            LSE_Logger.error(`Error handling property ${propName}: ${error.message}`);
        }
    }
    propstatElement.appendChild(propElement);
    const statusElement = xmlDoc.createElementNS('DAV:', 'status');
    statusElement.textContent = 'HTTP/1.1 200 OK';
    propstatElement.appendChild(statusElement);
    responseElement.appendChild(propstatElement);
    return {
        element: responseElement,
        handledProps: handledProps
    };
}
async function handlePropfind(req, res, options = {}) {
    LSE_Logger.info('Handling PROPFIND request');
    try {
        const username = options.username;
        const depth = req.headers.depth || '0';
        const xmlDoc = parseXML(req.body);
        const propElement = xmlDoc.getElementsByTagNameNS('DAV:', 'prop')[0];
        if (!propElement) {
            LSE_Logger.warn('[Fennel-NG CalDAV] No prop element found in PROPFIND request');
            res.status(400).send('Bad Request: Missing prop element');
            return { success: false, error: 'Missing prop element' };
        }
        const requestedProps = [];
        for (let i = 0; i < propElement.childNodes.length; i++) {
            const child = propElement.childNodes[i];
            if (child.nodeType === 1) {
                const ns = child.namespaceURI || '';
                const prefix = ns === 'DAV:' ? 'd' : 
                              ns === 'urn:ietf:params:xml:ns:caldav' ? 'l' :
                              ns === 'http://apple.com/ns/ical/' ? 'a' :
                              ns === 'http://inf-it.com/ns/dav/' ? 'i' :
                              ns === 'http://inf-it.com/ns/ab/' ? 'i' :
                              ns === 'urn:ietf:params:xml:ns:carddav' ? 'r' :
                              'unknown';
                requestedProps.push(`${prefix}:${child.localName}`);
            }
        }
        const responseDoc = createXMLDocument();
        const multistatusElement = responseDoc.createElementNS('DAV:', 'multistatus');
        responseDoc.appendChild(multistatusElement);
        const commonPropsResult = await handleCommonCalDAVProperties(
            req, 
            res, 
            requestedProps, 
            username, 
            req.path, 
            responseDoc
        );
        multistatusElement.appendChild(commonPropsResult.element);
        const xmlString = serializeXML(responseDoc);
        res.status(207).header('Content-Type', 'application/xml; charset="utf-8"').send(xmlString);
        return { success: true };
    } catch (error) {
        LSE_Logger.error(`[Fennel-NG CalDAV] PROPFIND error: ${error.message}`);
        res.status(500).send('Internal Server Error');
        return { success: false, error: error.message };
    }
}
function handleReport(req, res, options = {}) {
    LSE_Logger.info('Handling REPORT request');
    return { success: true, message: 'REPORT request handled' };
}
function parseXML(xmlString) {
    const DOMParser = require('@xmldom/xmldom').DOMParser;
    const parser = new DOMParser();
    return parser.parseFromString(xmlString, 'application/xml');
}
function createXMLDocument() {
    const DOMParser = require('@xmldom/xmldom').DOMParser;
    const xmlDoc = new DOMParser().parseFromString('<?xml version="1.0" encoding="utf-8"?><root/>', 'application/xml');
    return xmlDoc;
}
function serializeXML(xmlDoc) {
    const XMLSerializer = require('@xmldom/xmldom').XMLSerializer;
    const serializer = new XMLSerializer();
    return serializer.serializeToString(xmlDoc);
}
module.exports = {
    processRequest,
    handleCommonCalDAVProperties,
    handlePropfind,
    handleReport,
    parseXML,
    createXMLDocument,
    serializeXML
};

