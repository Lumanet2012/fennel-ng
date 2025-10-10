const config = require('../config').config;
const icsparser = require('./ics-parser');
const icsserializer = require('./ics-serializer');
const icscomponents = require('./ics-components');
const icsproperties = require('./ics-properties');
function parseics(icsdata) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] ics-main parseics starting');
    }
    const rawcomponent = icsparser.parseics(icsdata);
    if(!rawcomponent) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG CalDAV] ics parsing failed');
        }
        return null;
    }
    const processedcomponent = icscomponents.processcomponent(rawcomponent);
    if(!processedcomponent) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG CalDAV] ics component processing failed');
        }
        return null;
    }
    enhanceproperties(processedcomponent);
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] ics-main parseics completed');
    }
    return processedcomponent;
}
function enhanceproperties(component) {
    if(component.events) {
        for(let i = 0; i < component.events.length; i++) {
            enhanceevent(component.events[i]);
        }
    }
    if(component.todos) {
        for(let i = 0; i < component.todos.length; i++) {
            enhancetodo(component.todos[i]);
        }
    }
    if(component.timezones) {
        for(let i = 0; i < component.timezones.length; i++) {
            enhancetimezone(component.timezones[i]);
        }
    }
}
function enhanceevent(event) {
    if(event.dtstart && event.dtstart.value) {
        event.dtstart.parsed = icsproperties.parsedatetime(event.dtstart.value, event.dtstart.parameters);
    }
    if(event.dtend && event.dtend.value) {
        event.dtend.parsed = icsproperties.parsedatetime(event.dtend.value, event.dtend.parameters);
    }
    if(event.dtstamp && event.dtstamp.value) {
        event.dtstamp.parsed = icsproperties.parsedatetime(event.dtstamp.value, event.dtstamp.parameters);
    }
    if(event.created && event.created.value) {
        event.created.parsed = icsproperties.parsedatetime(event.created.value, event.created.parameters);
    }
    if(event.lastmodified && event.lastmodified.value) {
        event.lastmodified.parsed = icsproperties.parsedatetime(event.lastmodified.value, event.lastmodified.parameters);
    }
    if(event.rrule) {
        event.rrule_parsed = icsproperties.parserrule(event.rrule);
    }
    if(event.duration) {
        event.duration_parsed = icsproperties.parseduration(event.duration);
    }
    if(event.geo) {
        event.geo_parsed = icsproperties.parsegeo(event.geo);
    }
    if(event.attendees) {
        for(let i = 0; i < event.attendees.length; i++) {
            event.attendees[i].parsed = icsproperties.parseattendee(event.attendees[i].value, event.attendees[i].parameters);
        }
    }
    if(event.organizer && event.organizer.value) {
        event.organizer.parsed = icsproperties.parseorganizer(event.organizer.value, event.organizer.parameters);
    }
    if(event.attachments) {
        for(let i = 0; i < event.attachments.length; i++) {
            event.attachments[i].parsed = icsproperties.parseattachment(event.attachments[i].value, event.attachments[i].parameters);
        }
    }
    if(event.alarms) {
        for(let i = 0; i < event.alarms.length; i++) {
            enhancealarm(event.alarms[i]);
        }
    }
}
function enhancetodo(todo) {
    if(todo.dtstart && todo.dtstart.value) {
        todo.dtstart.parsed = icsproperties.parsedatetime(todo.dtstart.value, todo.dtstart.parameters);
    }
    if(todo.due && todo.due.value) {
        todo.due.parsed = icsproperties.parsedatetime(todo.due.value, todo.due.parameters);
    }
    if(todo.dtstamp && todo.dtstamp.value) {
        todo.dtstamp.parsed = icsproperties.parsedatetime(todo.dtstamp.value, todo.dtstamp.parameters);
    }
    if(todo.created && todo.created.value) {
        todo.created.parsed = icsproperties.parsedatetime(todo.created.value, todo.created.parameters);
    }
    if(todo.lastmodified && todo.lastmodified.value) {
        todo.lastmodified.parsed = icsproperties.parsedatetime(todo.lastmodified.value, todo.lastmodified.parameters);
    }
    if(todo.completed && todo.completed.value) {
        todo.completed.parsed = icsproperties.parsedatetime(todo.completed.value, todo.completed.parameters);
    }
    if(todo.rrule) {
        todo.rrule_parsed = icsproperties.parserrule(todo.rrule);
    }
    if(todo.duration) {
        todo.duration_parsed = icsproperties.parseduration(todo.duration);
    }
    if(todo.attendees) {
        for(let i = 0; i < todo.attendees.length; i++) {
            todo.attendees[i].parsed = icsproperties.parseattendee(todo.attendees[i].value, todo.attendees[i].parameters);
        }
    }
    if(todo.organizer && todo.organizer.value) {
        todo.organizer.parsed = icsproperties.parseorganizer(todo.organizer.value, todo.organizer.parameters);
    }
    if(todo.alarms) {
        for(let i = 0; i < todo.alarms.length; i++) {
            enhancealarm(todo.alarms[i]);
        }
    }
}
function enhancetimezone(timezone) {
    if(timezone.standards) {
        for(let i = 0; i < timezone.standards.length; i++) {
            enhancetimezonecomponent(timezone.standards[i]);
        }
    }
    if(timezone.daylights) {
        for(let i = 0; i < timezone.daylights.length; i++) {
            enhancetimezonecomponent(timezone.daylights[i]);
        }
    }
}
function enhancetimezonecomponent(tzcomponent) {
    if(tzcomponent.dtstart && tzcomponent.dtstart.value) {
        tzcomponent.dtstart.parsed = icsproperties.parsedatetime(tzcomponent.dtstart.value, tzcomponent.dtstart.parameters);
    }
    if(tzcomponent.tzoffsetto) {
        tzcomponent.tzoffsetto_parsed = icsproperties.parseoffset(tzcomponent.tzoffsetto);
    }
    if(tzcomponent.tzoffsetfrom) {
        tzcomponent.tzoffsetfrom_parsed = icsproperties.parseoffset(tzcomponent.tzoffsetfrom);
    }
    if(tzcomponent.rrule) {
        tzcomponent.rrule_parsed = icsproperties.parserrule(tzcomponent.rrule);
    }
}
function enhancealarm(alarm) {
    if(alarm.trigger && alarm.trigger.value) {
        alarm.trigger.parsed = icsproperties.parsetrigger(alarm.trigger.value, alarm.trigger.parameters);
    }
    if(alarm.duration) {
        alarm.duration_parsed = icsproperties.parseduration(alarm.duration);
    }
    if(alarm.attendees) {
        for(let i = 0; i < alarm.attendees.length; i++) {
            alarm.attendees[i].parsed = icsproperties.parseattendee(alarm.attendees[i].value, alarm.attendees[i].parameters);
        }
    }
}
function serializeics(component) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] ics-main serializeics starting');
    }
    const rawcomponent = converttorawcomponent(component);
    if(!rawcomponent) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG CalDAV] component to raw conversion failed');
        }
        return null;
    }
    const icsdata = icsserializer.serializeics(rawcomponent);
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] ics-main serializeics completed');
    }
    return icsdata;
}
function converttorawcomponent(component) {
    if(!component || !component.type) {
        return null;
    }
    const rawcomponent = {
        type: component.type,
        properties: {},
        components: []
    };
    switch(component.type) {
        case 'VCALENDAR':
            convertvcalendartoraw(component, rawcomponent);
            break;
        case 'VEVENT':
            convertveventtoraw(component, rawcomponent);
            break;
        case 'VTODO':
            convertvtodotoraw(component, rawcomponent);
            break;
        case 'VTIMEZONE':
            convertvtimezonetoraw(component, rawcomponent);
            break;
        case 'VALARM':
            convertvalarmtoraw(component, rawcomponent);
            break;
    }
    return rawcomponent;
}
function convertvcalendartoraw(vcalendar, raw) {
    addrawproperty(raw, 'VERSION', vcalendar.version || '2.0');
    addrawproperty(raw, 'PRODID', vcalendar.prodid || '-//Fennel-NG//CalDAV Server//EN');
    if(vcalendar.calscale) addrawproperty(raw, 'CALSCALE', vcalendar.calscale);
    if(vcalendar.method) addrawproperty(raw, 'METHOD', vcalendar.method);
    if(vcalendar.events) {
        for(let i = 0; i < vcalendar.events.length; i++) {
            raw.components.push(converttorawcomponent(vcalendar.events[i]));
        }
    }
    if(vcalendar.todos) {
        for(let i = 0; i < vcalendar.todos.length; i++) {
            raw.components.push(converttorawcomponent(vcalendar.todos[i]));
        }
    }
    if(vcalendar.timezones) {
        for(let i = 0; i < vcalendar.timezones.length; i++) {
            raw.components.push(converttorawcomponent(vcalendar.timezones[i]));
        }
    }
}
function convertveventtoraw(vevent, raw) {
    addrawproperty(raw, 'UID', vevent.uid);
    if(vevent.dtstart) addrawproperty(raw, 'DTSTART', vevent.dtstart.value, vevent.dtstart.parameters);
    if(vevent.dtend) addrawproperty(raw, 'DTEND', vevent.dtend.value, vevent.dtend.parameters);
    if(vevent.duration) addrawproperty(raw, 'DURATION', vevent.duration);
    if(vevent.summary) addrawproperty(raw, 'SUMMARY', vevent.summary);
    if(vevent.description) addrawproperty(raw, 'DESCRIPTION', vevent.description);
    if(vevent.location) addrawproperty(raw, 'LOCATION', vevent.location);
    if(vevent.status) addrawproperty(raw, 'STATUS', vevent.status);
    if(vevent.transp) addrawproperty(raw, 'TRANSP', vevent.transp);
    if(vevent.class) addrawproperty(raw, 'CLASS', vevent.class);
    if(vevent.priority) addrawproperty(raw, 'PRIORITY', vevent.priority);
    if(vevent.sequence) addrawproperty(raw, 'SEQUENCE', vevent.sequence);
    if(vevent.dtstamp) addrawproperty(raw, 'DTSTAMP', vevent.dtstamp.value, vevent.dtstamp.parameters);
    if(vevent.created) addrawproperty(raw, 'CREATED', vevent.created.value, vevent.created.parameters);
    if(vevent.lastmodified) addrawproperty(raw, 'LAST-MODIFIED', vevent.lastmodified.value, vevent.lastmodified.parameters);
    if(vevent.rrule) addrawproperty(raw, 'RRULE', vevent.rrule);
    if(vevent.url) addrawproperty(raw, 'URL', vevent.url);
    if(vevent.geo) addrawproperty(raw, 'GEO', vevent.geo);
    if(vevent.organizer) addrawproperty(raw, 'ORGANIZER', vevent.organizer.value, vevent.organizer.parameters);
    if(vevent.attendees) {
        for(let i = 0; i < vevent.attendees.length; i++) {
            addrawproperty(raw, 'ATTENDEE', vevent.attendees[i].value, vevent.attendees[i].parameters);
        }
    }
    if(vevent.alarms) {
        for(let i = 0; i < vevent.alarms.length; i++) {
            raw.components.push(converttorawcomponent(vevent.alarms[i]));
        }
    }
}
function convertvtodotoraw(vtodo, raw) {
    addrawproperty(raw, 'UID', vtodo.uid);
    if(vtodo.dtstart) addrawproperty(raw, 'DTSTART', vtodo.dtstart.value, vtodo.dtstart.parameters);
    if(vtodo.due) addrawproperty(raw, 'DUE', vtodo.due.value, vtodo.due.parameters);
    if(vtodo.summary) addrawproperty(raw, 'SUMMARY', vtodo.summary);
    if(vtodo.description) addrawproperty(raw, 'DESCRIPTION', vtodo.description);
    if(vtodo.status) addrawproperty(raw, 'STATUS', vtodo.status);
    if(vtodo.dtstamp) addrawproperty(raw, 'DTSTAMP', vtodo.dtstamp.value, vtodo.dtstamp.parameters);
    if(vtodo.completed) addrawproperty(raw, 'COMPLETED', vtodo.completed.value, vtodo.completed.parameters);
    if(vtodo.percentcomplete) addrawproperty(raw, 'PERCENT-COMPLETE', vtodo.percentcomplete);
}
function convertvtimezonetoraw(vtimezone, raw) {
    addrawproperty(raw, 'TZID', vtimezone.tzid);
    if(vtimezone.standards) {
        for(let i = 0; i < vtimezone.standards.length; i++) {
            raw.components.push(converttzcomponenttoraw(vtimezone.standards[i], 'STANDARD'));
        }
    }
    if(vtimezone.daylights) {
        for(let i = 0; i < vtimezone.daylights.length; i++) {
            raw.components.push(converttzcomponenttoraw(vtimezone.daylights[i], 'DAYLIGHT'));
        }
    }
}
function converttzcomponenttoraw(tzcomp, type) {
    const raw = { type: type, properties: {}, components: [] };
    if(tzcomp.dtstart) addrawproperty(raw, 'DTSTART', tzcomp.dtstart.value, tzcomp.dtstart.parameters);
    if(tzcomp.tzoffsetto) addrawproperty(raw, 'TZOFFSETTO', tzcomp.tzoffsetto);
    if(tzcomp.tzoffsetfrom) addrawproperty(raw, 'TZOFFSETFROM', tzcomp.tzoffsetfrom);
    if(tzcomp.tzname) addrawproperty(raw, 'TZNAME', tzcomp.tzname);
    if(tzcomp.rrule) addrawproperty(raw, 'RRULE', tzcomp.rrule);
    return raw;
}
function convertvalarmtoraw(valarm, raw) {
    addrawproperty(raw, 'ACTION', valarm.action);
    if(valarm.trigger) addrawproperty(raw, 'TRIGGER', valarm.trigger.value, valarm.trigger.parameters);
    if(valarm.description) addrawproperty(raw, 'DESCRIPTION', valarm.description);
    if(valarm.summary) addrawproperty(raw, 'SUMMARY', valarm.summary);
    if(valarm.duration) addrawproperty(raw, 'DURATION', valarm.duration);
    if(valarm.repeat) addrawproperty(raw, 'REPEAT', valarm.repeat);
}
function addrawproperty(component, name, value, parameters) {
    if(!component.properties[name]) {
        component.properties[name] = [];
    }
    component.properties[name].push({
        value: value,
        parameters: parameters || {}
    });
}
function extractfirstoccurrence(parsedics) {
    if(!parsedics || !parsedics.events || !parsedics.events[0]) {
        return Math.floor(Date.now() / 1000);
    }
    const event = parsedics.events[0];
    if(event.dtstart && event.dtstart.parsed) {
        return event.dtstart.parsed.timestamp;
    }
    return Math.floor(Date.now() / 1000);
}
function extractlastoccurrence(parsedics) {
    if(!parsedics || !parsedics.events || !parsedics.events[0]) {
        return Math.floor(Date.now() / 1000) + 3600;
    }
    const event = parsedics.events[0];
    if(event.dtend && event.dtend.parsed) {
        return event.dtend.parsed.timestamp;
    }
    if(event.dtstart && event.dtstart.parsed && event.duration_parsed) {
        return event.dtstart.parsed.timestamp + event.duration_parsed.totalseconds;
    }
    if(event.dtstart && event.dtstart.parsed) {
        return event.dtstart.parsed.timestamp + 3600;
    }
    return Math.floor(Date.now() / 1000) + 3600;
}
function extractuid(parsedics) {
    if(!parsedics || !parsedics.events || !parsedics.events[0]) {
        return null;
    }
    return parsedics.events[0].uid;
}
function extractcomponenttype(parsedics) {
    if(!parsedics) return 'VEVENT';
    if(parsedics.events && parsedics.events.length > 0) return 'VEVENT';
    if(parsedics.todos && parsedics.todos.length > 0) return 'VTODO';
    if(parsedics.journals && parsedics.journals.length > 0) return 'VJOURNAL';
    return 'VEVENT';
}
module.exports = {
    parseics: parseics,
    serializeics: serializeics,
    extractfirstoccurrence: extractfirstoccurrence,
    extractlastoccurrence: extractlastoccurrence,
    extractuid: extractuid,
    extractcomponenttype: extractcomponenttype
};

