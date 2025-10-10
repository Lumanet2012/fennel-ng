const config = require('../config').config;
function serializeproperty(name, value, parameters) {
    const line = name;
    let result = line;
    if(parameters) {
        for(const paramname in parameters) {
            let paramvalue = parameters[paramname];
            if(Array.isArray(paramvalue)) {
                paramvalue = paramvalue.join(',');
            }
            if(paramvalue.indexOf(':') !== -1 || paramvalue.indexOf(';') !== -1 || paramvalue.indexOf(',') !== -1) {
                paramvalue = '"' + paramvalue + '"';
            }
            result += ';' + paramname + '=' + paramvalue;
        }
    }
    result += ':' + value;
    return result;
}
function foldline(line) {
    if(line.length <= 75) {
        return line;
    }
    const foldedlines = [];
    let pos = 0;
    while(pos < line.length) {
        if(pos === 0) {
            foldedlines.push(line.substring(0, 75));
            pos = 75;
        } else {
            const maxlength = 74;
            const endpos = Math.min(pos + maxlength, line.length);
            foldedlines.push(' ' + line.substring(pos, endpos));
            pos = endpos;
        }
    }
    return foldedlines.join('\r\n');
}
function serializecomponent(component) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG CalDAV] serializecomponent called for type: ${component.type}`);
    }
    const lines = [];
    lines.push('BEGIN:' + component.type);
    if(component.properties) {
        for(const propname in component.properties) {
            const props = component.properties[propname];
            for(let i = 0; i < props.length; i++) {
                const prop = props[i];
                const serializedprop = serializeproperty(propname, prop.value, prop.parameters);
                lines.push(foldline(serializedprop));
            }
        }
    }
    if(component.components) {
        for(let i = 0; i < component.components.length; i++) {
            const subcomponent = serializecomponent(component.components[i]);
            lines.push(subcomponent);
        }
    }
    lines.push('END:' + component.type);
    return lines.join('\r\n');
}
function createvcalendar() {
    return {
        type: 'VCALENDAR',
        properties: {
            VERSION: [{
                value: '2.0',
                parameters: {}
            }],
            PRODID: [{
                value: '-//Fennel-NG//CalDAV Server//EN',
                parameters: {}
            }]
        },
        components: []
    };
}
function addcomponent(vcalendar, component) {
    if(!vcalendar.components) {
        vcalendar.components = [];
    }
    vcalendar.components.push(component);
}
function addproperty(component, name, value, parameters) {
    if(!component.properties) {
        component.properties = {};
    }
    if(!component.properties[name]) {
        component.properties[name] = [];
    }
    component.properties[name].push({
        value: value,
        parameters: parameters || {}
    });
}
function createvevent(uid, summary, dtstart, dtend) {
    const vevent = {
        type: 'VEVENT',
        properties: {},
        components: []
    };
    addproperty(vevent, 'UID', uid);
    addproperty(vevent, 'SUMMARY', summary);
    addproperty(vevent, 'DTSTART', dtstart);
    addproperty(vevent, 'DTEND', dtend);
    addproperty(vevent, 'DTSTAMP', formatdatetimeutc(new Date()));
    return vevent;
}
function createvtodo(uid, summary, due) {
    const vtodo = {
        type: 'VTODO',
        properties: {},
        components: []
    };
    addproperty(vtodo, 'UID', uid);
    addproperty(vtodo, 'SUMMARY', summary);
    if(due) {
        addproperty(vtodo, 'DUE', due);
    }
    addproperty(vtodo, 'DTSTAMP', formatdatetimeutc(new Date()));
    return vtodo;
}
function createvtimezone(tzid) {
    const vtimezone = {
        type: 'VTIMEZONE',
        properties: {},
        components: []
    };
    addproperty(vtimezone, 'TZID', tzid);
    return vtimezone;
}
function createvalarm(action, description, trigger) {
    const valarm = {
        type: 'VALARM',
        properties: {},
        components: []
    };
    addproperty(valarm, 'ACTION', action);
    addproperty(valarm, 'DESCRIPTION', description);
    addproperty(valarm, 'TRIGGER', trigger);
    return valarm;
}
function formatdatetimeutc(date) {
    const year = date.getUTCFullYear().toString().padStart(4, '0');
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hour = date.getUTCHours().toString().padStart(2, '0');
    const minute = date.getUTCMinutes().toString().padStart(2, '0');
    const second = date.getUTCSeconds().toString().padStart(2, '0');
    return year + month + day + 'T' + hour + minute + second + 'Z';
}
function formatdateonly(date) {
    const year = date.getFullYear().toString().padStart(4, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return year + month + day;
}
function serializeics(component) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG CalDAV] serializeics starting`);
    }
    const icsdata = serializecomponent(component);
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug(`[Fennel-NG CalDAV] serializeics completed, generated ${icsdata.length} bytes`);
    }
    return icsdata;
}
module.exports = {
    serializeics: serializeics,
    serializecomponent: serializecomponent,
    serializeproperty: serializeproperty,
    foldline: foldline,
    createvcalendar: createvcalendar,
    createvevent: createvevent,
    createvtodo: createvtodo,
    createvtimezone: createvtimezone,
    createvalarm: createvalarm,
    addcomponent: addcomponent,
    addproperty: addproperty,
    formatdatetimeutc: formatdatetimeutc,
    formatdateonly: formatdateonly
};

