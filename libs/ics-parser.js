function parseicslines(icsdata)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] parseicslines called with ${icsdata.length} bytes`);
    var lines = icsdata.split(/\r?\n/);
    var unfoldedlines = [];
    for(var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if(line.length === 0) continue;
        if(line.charAt(0) === ' ' || line.charAt(0) === '\t') {
            if(unfoldedlines.length > 0) {
                unfoldedlines[unfoldedlines.length - 1] += line.substring(1);
            }
        } else {
            unfoldedlines.push(line);
        }
    }
    LSE_Logger.debug(`[Fennel-NG CalDAV] unfolded ${lines.length} lines to ${unfoldedlines.length} lines`);
    return unfoldedlines;
}
function parseproperty(line)
{
    if(line.indexOf(':') === -1) return null;
    var colonindex = line.indexOf(':');
    var proppart = line.substring(0, colonindex);
    var valuepart = line.substring(colonindex + 1);
    var propname = proppart;
    var parameters = {};
    if(proppart.indexOf(';') !== -1) {
        var parts = proppart.split(';');
        propname = parts[0];
        for(var j = 1; j < parts.length; j++) {
            var param = parts[j];
            var eqindex = param.indexOf('=');
            if(eqindex !== -1) {
                var paramname = param.substring(0, eqindex);
                var paramvalue = param.substring(eqindex + 1);
                if(paramvalue.charAt(0) === '"' && paramvalue.charAt(paramvalue.length - 1) === '"') {
                    paramvalue = paramvalue.substring(1, paramvalue.length - 1);
                }
                if(paramvalue.indexOf(',') !== -1) {
                    parameters[paramname] = paramvalue.split(',');
                } else {
                    parameters[paramname] = paramvalue;
                }
            }
        }
    }
    return {
        name: propname,
        value: valuepart,
        parameters: parameters
    };
}
function parsecomponents(lines)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] parsecomponents called with ${lines.length} lines`);
    var stack = [];
    var current = null;
    var root = null;
    for(var i = 0; i < lines.length; i++) {
        var prop = parseproperty(lines[i]);
        if(!prop) continue;
        if(prop.name === 'BEGIN') {
            var newcomponent = {
                type: prop.value,
                properties: {},
                components: []
            };
            if(!root) {
                root = newcomponent;
                current = newcomponent;
            } else {
                current.components.push(newcomponent);
                stack.push(current);
                current = newcomponent;
            }
        } else if(prop.name === 'END') {
            if(stack.length > 0) {
                current = stack.pop();
            }
        } else {
            if(!current.properties[prop.name]) {
                current.properties[prop.name] = [];
            }
            current.properties[prop.name].push({
                value: prop.value,
                parameters: prop.parameters
            });
        }
    }
    LSE_Logger.debug(`[Fennel-NG CalDAV] parsecomponents completed, root type: ${root ? root.type : 'null'}`);
    return root;
}
function validateicsstructure(component)
{
    if(!component) {
        LSE_Logger.error(`[Fennel-NG CalDAV] ics validation failed: null component`);
        return false;
    }
    if(component.type !== 'VCALENDAR') {
        LSE_Logger.error(`[Fennel-NG CalDAV] ics validation failed: root must be VCALENDAR, got ${component.type}`);
        return false;
    }
    if(!component.properties.VERSION || !component.properties.VERSION[0]) {
        LSE_Logger.error(`[Fennel-NG CalDAV] ics validation failed: missing VERSION property`);
        return false;
    }
    if(component.properties.VERSION[0].value !== '2.0') {
        LSE_Logger.error(`[Fennel-NG CalDAV] ics validation failed: unsupported version ${component.properties.VERSION[0].value}`);
        return false;
    }
    LSE_Logger.debug(`[Fennel-NG CalDAV] ics structure validation passed`);
    return true;
}
function parseics(icsdata)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] parseics starting`);
    var lines = parseicslines(icsdata);
    var component = parsecomponents(lines);
    if(!validateicsstructure(component)) {
        LSE_Logger.error(`[Fennel-NG CalDAV] parseics failed validation`);
        return null;
    }
    LSE_Logger.debug(`[Fennel-NG CalDAV] parseics completed successfully`);
    return component;
}
module.exports = {
    parseics: parseics,
    parseicslines: parseicslines,
    parseproperty: parseproperty,
    parsecomponents: parsecomponents,
    validateicsstructure: validateicsstructure
};

