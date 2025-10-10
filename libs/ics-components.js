const config = require('../config').config;
function getpropertyvalue(component, propname) {
    if(!component.properties || !component.properties[propname] || !component.properties[propname][0]) {
        return null;
    }
    return component.properties[propname][0].value;
}
function getpropertywithparams(component, propname) {
    if(!component.properties || !component.properties[propname] || !component.properties[propname][0]) {
        return null;
    }
    return {
        value: component.properties[propname][0].value,
        parameters: component.properties[propname][0].parameters
    };
}
function getmultipleproperties(component, propname) {
    if(!component.properties || !component.properties[propname]) {
        return [];
    }
    const props = [];
    for(let i = 0; i < component.properties[propname].length; i++) {
        props.push({
            value: component.properties[propname][i].value,
            parameters: component.properties[propname][i].parameters
        });
    }
    return props;
}
function processcomponent(component) {
    if(!component || !component.type) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG CalDAV] invalid component for processing');
        }
        return null;
    }
    switch(component.type) {
        case 'VCALENDAR':
            return processvcalendar(component);
        case 'VEVENT':
            return processvevent(component);
        case 'VTODO':
            return processvtodo(component);
        case 'VJOURNAL':
            return processvjournal(component);
        case 'VTIMEZONE':
            return processvtimezone(component);
        case 'VFREEBUSY':
            return processvfreebusy(component);
        case 'VALARM':
            return processvalarm(component);
        default:
            if(config.LSE_Loglevel >= 1) {
                LSE_Logger.warn('[Fennel-NG CalDAV] unknown component type: ' + component.type);
            }
            return component;
    }
}
function processvcalendar(component) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] processing VCALENDAR component');
    }
    const processed = {
        type: 'VCALENDAR',
        version: getpropertyvalue(component, 'VERSION'),
        prodid: getpropertyvalue(component, 'PRODID'),
        calscale: getpropertyvalue(component, 'CALSCALE'),
        method: getpropertyvalue(component, 'METHOD'),
        events: [],
        todos: [],
        journals: [],
        freebusys: [],
        timezones: []
    };
    if(component.components) {
        for(let i = 0; i < component.components.length; i++) {
            const subcomponent = component.components[i];
            const processedsubcomponent = processcomponent(subcomponent);
            if(!processedsubcomponent) continue;
            switch(processedsubcomponent.type) {
                case 'VEVENT':
                    processed.events.push(processedsubcomponent);
                    break;
                case 'VTODO':
                    processed.todos.push(processedsubcomponent);
                    break;
                case 'VJOURNAL':
                    processed.journals.push(processedsubcomponent);
                    break;
                case 'VFREEBUSY':
                    processed.freebusys.push(processedsubcomponent);
                    break;
                case 'VTIMEZONE':
                    processed.timezones.push(processedsubcomponent);
                    break;
            }
        }
    }
    return processed;
}
function processvevent(component) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] processing VEVENT component');
    }
    const processed = {
        type: 'VEVENT',
        uid: getpropertyvalue(component, 'UID'),
        dtstart: getpropertywithparams(component, 'DTSTART'),
        dtend: getpropertywithparams(component, 'DTEND'),
        duration: getpropertyvalue(component, 'DURATION'),
        summary: getpropertyvalue(component, 'SUMMARY'),
        description: getpropertyvalue(component, 'DESCRIPTION'),
        location: getpropertyvalue(component, 'LOCATION'),
        status: getpropertyvalue(component, 'STATUS'),
        class: getpropertyvalue(component, 'CLASS'),
        transp: getpropertyvalue(component, 'TRANSP'),
        priority: getpropertyvalue(component, 'PRIORITY'),
        sequence: getpropertyvalue(component, 'SEQUENCE'),
        created: getpropertywithparams(component, 'CREATED'),
        dtstamp: getpropertywithparams(component, 'DTSTAMP'),
        lastmodified: getpropertywithparams(component, 'LAST-MODIFIED'),
        organizer: getpropertywithparams(component, 'ORGANIZER'),
        attendees: getmultipleproperties(component, 'ATTENDEE'),
        categories: getmultipleproperties(component, 'CATEGORIES'),
        rrule: getpropertyvalue(component, 'RRULE'),
        exdate: getmultipleproperties(component, 'EXDATE'),
        rdate: getmultipleproperties(component, 'RDATE'),
        recurrenceid: getpropertywithparams(component, 'RECURRENCE-ID'),
        url: getpropertyvalue(component, 'URL'),
        geo: getpropertyvalue(component, 'GEO'),
        attachments: getmultipleproperties(component, 'ATTACH'),
        alarms: []
    };
    if(component.components) {
        for(let i = 0; i < component.components.length; i++) {
            const subcomponent = component.components[i];
            if(subcomponent.type === 'VALARM') {
                processed.alarms.push(processvalarm(subcomponent));
            }
        }
    }
    return processed;
}
function processvtodo(component) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] processing VTODO component');
    }
    const processed = {
        type: 'VTODO',
        uid: getpropertyvalue(component, 'UID'),
        dtstart: getpropertywithparams(component, 'DTSTART'),
        due: getpropertywithparams(component, 'DUE'),
        duration: getpropertyvalue(component, 'DURATION'),
        summary: getpropertyvalue(component, 'SUMMARY'),
        description: getpropertyvalue(component, 'DESCRIPTION'),
        location: getpropertyvalue(component, 'LOCATION'),
        status: getpropertyvalue(component, 'STATUS'),
        class: getpropertyvalue(component, 'CLASS'),
        priority: getpropertyvalue(component, 'PRIORITY'),
        sequence: getpropertyvalue(component, 'SEQUENCE'),
        created: getpropertywithparams(component, 'CREATED'),
        dtstamp: getpropertywithparams(component, 'DTSTAMP'),
        lastmodified: getpropertywithparams(component, 'LAST-MODIFIED'),
        completed: getpropertywithparams(component, 'COMPLETED'),
        percentcomplete: getpropertyvalue(component, 'PERCENT-COMPLETE'),
        organizer: getpropertywithparams(component, 'ORGANIZER'),
        attendees: getmultipleproperties(component, 'ATTENDEE'),
        categories: getmultipleproperties(component, 'CATEGORIES'),
        rrule: getpropertyvalue(component, 'RRULE'),
        exdate: getmultipleproperties(component, 'EXDATE'),
        rdate: getmultipleproperties(component, 'RDATE'),
        recurrenceid: getpropertywithparams(component, 'RECURRENCE-ID'),
        url: getpropertyvalue(component, 'URL'),
        attachments: getmultipleproperties(component, 'ATTACH'),
        alarms: []
    };
    if(component.components) {
        for(let i = 0; i < component.components.length; i++) {
            const subcomponent = component.components[i];
            if(subcomponent.type === 'VALARM') {
                processed.alarms.push(processvalarm(subcomponent));
            }
        }
    }
    return processed;
}
function processvjournal(component) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] processing VJOURNAL component');
    }
    return {
        type: 'VJOURNAL',
        uid: getpropertyvalue(component, 'UID'),
        dtstart: getpropertywithparams(component, 'DTSTART'),
        summary: getpropertyvalue(component, 'SUMMARY'),
        description: getpropertyvalue(component, 'DESCRIPTION'),
        status: getpropertyvalue(component, 'STATUS'),
        class: getpropertyvalue(component, 'CLASS'),
        created: getpropertywithparams(component, 'CREATED'),
        dtstamp: getpropertywithparams(component, 'DTSTAMP'),
        lastmodified: getpropertywithparams(component, 'LAST-MODIFIED'),
        organizer: getpropertywithparams(component, 'ORGANIZER'),
        attendees: getmultipleproperties(component, 'ATTENDEE'),
        categories: getmultipleproperties(component, 'CATEGORIES'),
        url: getpropertyvalue(component, 'URL'),
        attachments: getmultipleproperties(component, 'ATTACH')
    };
}
function processvtimezone(component) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] processing VTIMEZONE component');
    }
    const processed = {
        type: 'VTIMEZONE',
        tzid: getpropertyvalue(component, 'TZID'),
        lastmodified: getpropertywithparams(component, 'LAST-MODIFIED'),
        tzurl: getpropertyvalue(component, 'TZURL'),
        standards: [],
        daylights: []
    };
    if(component.components) {
        for(let i = 0; i < component.components.length; i++) {
            const subcomponent = component.components[i];
            if(subcomponent.type === 'STANDARD') {
                processed.standards.push(processtimezonecomponent(subcomponent));
            } else if(subcomponent.type === 'DAYLIGHT') {
                processed.daylights.push(processtimezonecomponent(subcomponent));
            }
        }
    }
    return processed;
}
function processtimezonecomponent(component) {
    return {
        type: component.type,
        dtstart: getpropertywithparams(component, 'DTSTART'),
        tzoffsetto: getpropertyvalue(component, 'TZOFFSETTO'),
        tzoffsetfrom: getpropertyvalue(component, 'TZOFFSETFROM'),
        tzname: getpropertyvalue(component, 'TZNAME'),
        rrule: getpropertyvalue(component, 'RRULE'),
        rdate: getmultipleproperties(component, 'RDATE')
    };
}
function processvfreebusy(component) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] processing VFREEBUSY component');
    }
    return {
        type: 'VFREEBUSY',
        uid: getpropertyvalue(component, 'UID'),
        dtstart: getpropertywithparams(component, 'DTSTART'),
        dtend: getpropertywithparams(component, 'DTEND'),
        dtstamp: getpropertywithparams(component, 'DTSTAMP'),
        organizer: getpropertywithparams(component, 'ORGANIZER'),
        attendees: getmultipleproperties(component, 'ATTENDEE'),
        url: getpropertyvalue(component, 'URL'),
        freebusy: getmultipleproperties(component, 'FREEBUSY')
    };
}
function processvalarm(component) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] processing VALARM component');
    }
    return {
        type: 'VALARM',
        action: getpropertyvalue(component, 'ACTION'),
        trigger: getpropertywithparams(component, 'TRIGGER'),
        description: getpropertyvalue(component, 'DESCRIPTION'),
        summary: getpropertyvalue(component, 'SUMMARY'),
        duration: getpropertyvalue(component, 'DURATION'),
        repeat: getpropertyvalue(component, 'REPEAT'),
        attendees: getmultipleproperties(component, 'ATTENDEE'),
        attachments: getmultipleproperties(component, 'ATTACH')
    };
}
module.exports = {
    processcomponent: processcomponent,
    processvcalendar: processvcalendar,
    processvevent: processvevent,
    processvtodo: processvtodo,
    processvjournal: processvjournal,
    processvtimezone: processvtimezone,
    processvfreebusy: processvfreebusy,
    processvalarm: processvalarm,
    getpropertyvalue: getpropertyvalue,
    getpropertywithparams: getpropertywithparams,
    getmultipleproperties: getmultipleproperties
};

