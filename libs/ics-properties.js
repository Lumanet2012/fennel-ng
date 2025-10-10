const config = require('../config').config;
function parsedatetime(datestr, parameters) {
    if(!datestr || datestr.length < 8) return null;
    const year = parseInt(datestr.substr(0, 4));
    const month = parseInt(datestr.substr(4, 2)) - 1;
    const day = parseInt(datestr.substr(6, 2));
    let hour = 0;
    let minute = 0;
    let second = 0;
    let isdate = true;
    if(datestr.length > 8 && datestr.charAt(8) === 'T') {
        isdate = false;
        hour = parseInt(datestr.substr(9, 2)) || 0;
        minute = parseInt(datestr.substr(11, 2)) || 0;
        second = parseInt(datestr.substr(13, 2)) || 0;
    }
    const isutc = datestr.charAt(datestr.length - 1) === 'Z';
    const tzid = parameters && parameters.TZID ? parameters.TZID : null;
    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    if(isNaN(date.getTime())) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG CalDAV] invalid date: ' + datestr);
        }
        return null;
    }
    return {
        year: year,
        month: month,
        day: day,
        hour: hour,
        minute: minute,
        second: second,
        isdate: isdate,
        isutc: isutc,
        tzid: tzid,
        timestamp: Math.floor(date.getTime() / 1000),
        date: date
    };
}
function parserrule(rrulestr) {
    const parts = rrulestr.split(';');
    const rrule = {};
    for(let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const eqindex = part.indexOf('=');
        if(eqindex !== -1) {
            const key = part.substring(0, eqindex);
            const value = part.substring(eqindex + 1);
            switch(key) {
                case 'FREQ':
                    rrule.freq = value;
                    break;
                case 'INTERVAL':
                    rrule.interval = parseInt(value) || 1;
                    break;
                case 'COUNT':
                    rrule.count = parseInt(value);
                    break;
                case 'UNTIL':
                    rrule.until = parsedatetime(value, {});
                    break;
                case 'BYDAY':
                    rrule.byday = value.split(',');
                    break;
                case 'BYMONTH':
                    rrule.bymonth = value.split(',').map(function(v) { return parseInt(v); });
                    break;
                case 'BYMONTHDAY':
                    rrule.bymonthday = value.split(',').map(function(v) { return parseInt(v); });
                    break;
                case 'BYYEARDAY':
                    rrule.byyearday = value.split(',').map(function(v) { return parseInt(v); });
                    break;
                case 'BYWEEKNO':
                    rrule.byweekno = value.split(',').map(function(v) { return parseInt(v); });
                    break;
                case 'BYHOUR':
                    rrule.byhour = value.split(',').map(function(v) { return parseInt(v); });
                    break;
                case 'BYMINUTE':
                    rrule.byminute = value.split(',').map(function(v) { return parseInt(v); });
                    break;
                case 'BYSECOND':
                    rrule.bysecond = value.split(',').map(function(v) { return parseInt(v); });
                    break;
                case 'BYSETPOS':
                    rrule.bysetpos = value.split(',').map(function(v) { return parseInt(v); });
                    break;
                case 'WKST':
                    rrule.wkst = value;
                    break;
            }
        }
    }
    return rrule;
}
function parseduration(durationstr) {
    const match = durationstr.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if(!match) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG CalDAV] invalid duration: ' + durationstr);
        }
        return null;
    }
    const sign = match[1] === '-' ? -1 : 1;
    const weeks = parseInt(match[2]) || 0;
    const days = parseInt(match[3]) || 0;
    const hours = parseInt(match[4]) || 0;
    const minutes = parseInt(match[5]) || 0;
    const seconds = parseInt(match[6]) || 0;
    const totalseconds = sign * (weeks * 604800 + days * 86400 + hours * 3600 + minutes * 60 + seconds);
    return {
        sign: sign,
        weeks: weeks,
        days: days,
        hours: hours,
        minutes: minutes,
        seconds: seconds,
        totalseconds: totalseconds
    };
}
function parsetrigger(triggerstr, parameters) {
    if(triggerstr.charAt(0) === '-' || triggerstr.charAt(0) === '+' || triggerstr.charAt(0) === 'P') {
        return {
            type: 'duration',
            duration: parseduration(triggerstr),
            related: parameters && parameters.RELATED ? parameters.RELATED : 'START'
        };
    } else {
        return {
            type: 'datetime',
            datetime: parsedatetime(triggerstr, parameters)
        };
    }
}
function parsegeo(geostr) {
    const parts = geostr.split(';');
    if(parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if(!isNaN(lat) && !isNaN(lon)) {
            return {
                lat: lat,
                lon: lon
            };
        }
    }
    if(config.LSE_Loglevel >= 1) {
        LSE_Logger.error('[Fennel-NG CalDAV] invalid geo: ' + geostr);
    }
    return null;
}
function parsedatelist(dateliststr, parameters) {
    const dates = dateliststr.split(',');
    const parseddates = [];
    for(let i = 0; i < dates.length; i++) {
        const parsed = parsedatetime(dates[i], parameters);
        if(parsed) {
            parseddates.push(parsed);
        }
    }
    return parseddates;
}
function parseattendee(attendeestr, parameters) {
    const email = attendeestr.replace(/^mailto:/i, '');
    return {
        email: email,
        cn: parameters && parameters.CN ? parameters.CN : null,
        role: parameters && parameters.ROLE ? parameters.ROLE : 'REQ-PARTICIPANT',
        partstat: parameters && parameters.PARTSTAT ? parameters.PARTSTAT : 'NEEDS-ACTION',
        cutype: parameters && parameters.CUTYPE ? parameters.CUTYPE : 'INDIVIDUAL',
        rsvp: parameters && parameters.RSVP ? parameters.RSVP === 'TRUE' : false,
        sentby: parameters && parameters['SENT-BY'] ? parameters['SENT-BY'] : null,
        delegatedfrom: parameters && parameters['DELEGATED-FROM'] ? parameters['DELEGATED-FROM'] : null,
        delegatedto: parameters && parameters['DELEGATED-TO'] ? parameters['DELEGATED-TO'] : null,
        member: parameters && parameters.MEMBER ? parameters.MEMBER : null,
        dir: parameters && parameters.DIR ? parameters.DIR : null,
        language: parameters && parameters.LANGUAGE ? parameters.LANGUAGE : null
    };
}
function parseorganizer(organizerstr, parameters) {
    const email = organizerstr.replace(/^mailto:/i, '');
    return {
        email: email,
        cn: parameters && parameters.CN ? parameters.CN : null,
        sentby: parameters && parameters['SENT-BY'] ? parameters['SENT-BY'] : null,
        dir: parameters && parameters.DIR ? parameters.DIR : null,
        language: parameters && parameters.LANGUAGE ? parameters.LANGUAGE : null
    };
}
function parseattachment(attachstr, parameters) {
    if(attachstr.match(/^https?:/i)) {
        return {
            type: 'uri',
            uri: attachstr,
            fmttype: parameters && parameters.FMTTYPE ? parameters.FMTTYPE : null,
            filename: parameters && parameters.FILENAME ? parameters.FILENAME : null,
            size: parameters && parameters.SIZE ? parseInt(parameters.SIZE) : null
        };
    } else {
        return {
            type: 'binary',
            data: attachstr,
            encoding: parameters && parameters.ENCODING ? parameters.ENCODING : 'BASE64',
            fmttype: parameters && parameters.FMTTYPE ? parameters.FMTTYPE : null,
            filename: parameters && parameters.FILENAME ? parameters.FILENAME : null,
            size: parameters && parameters.SIZE ? parseInt(parameters.SIZE) : null
        };
    }
}
function parseperiod(periodstr) {
    const parts = periodstr.split('/');
    if(parts.length !== 2) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG CalDAV] invalid period: ' + periodstr);
        }
        return null;
    }
    const start = parsedatetime(parts[0], {});
    const endduration = parts[1];
    if(endduration.charAt(0) === 'P') {
        return {
            start: start,
            duration: parseduration(endduration)
        };
    } else {
        return {
            start: start,
            end: parsedatetime(endduration, {})
        };
    }
}
function parsefreebusy(freebusystr, parameters) {
    const fbtype = parameters && parameters.FBTYPE ? parameters.FBTYPE : 'BUSY';
    const periods = freebusystr.split(',');
    const parsedperiods = [];
    for(let i = 0; i < periods.length; i++) {
        const period = parseperiod(periods[i]);
        if(period) {
            parsedperiods.push(period);
        }
    }
    return {
        fbtype: fbtype,
        periods: parsedperiods
    };
}
function parseoffset(offsetstr) {
    const match = offsetstr.match(/^([+-])(\d{2})(\d{2})(?:(\d{2}))?$/);
    if(!match) {
        if(config.LSE_Loglevel >= 1) {
            LSE_Logger.error('[Fennel-NG CalDAV] invalid offset: ' + offsetstr);
        }
        return null;
    }
    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2]);
    const minutes = parseInt(match[3]);
    const seconds = parseInt(match[4]) || 0;
    const totalseconds = sign * (hours * 3600 + minutes * 60 + seconds);
    return {
        sign: sign,
        hours: hours,
        minutes: minutes,
        seconds: seconds,
        totalseconds: totalseconds,
        string: offsetstr
    };
}
function parseproperty(propname, propvalue, parameters) {
    if(config.LSE_Loglevel >= 2) {
        LSE_Logger.debug('[Fennel-NG CalDAV] parsing property ' + propname);
    }
    switch(propname) {
        case 'DTSTART':
        case 'DTEND':
        case 'DTSTAMP':
        case 'CREATED':
        case 'LAST-MODIFIED':
        case 'DUE':
        case 'COMPLETED':
        case 'RECURRENCE-ID':
            return parsedatetime(propvalue, parameters);
        case 'RRULE':
            return parserrule(propvalue);
        case 'DURATION':
            return parseduration(propvalue);
        case 'TRIGGER':
            return parsetrigger(propvalue, parameters);
        case 'GEO':
            return parsegeo(propvalue);
        case 'EXDATE':
        case 'RDATE':
            return parsedatelist(propvalue, parameters);
        case 'ATTENDEE':
            return parseattendee(propvalue, parameters);
        case 'ORGANIZER':
            return parseorganizer(propvalue, parameters);
        case 'ATTACH':
            return parseattachment(propvalue, parameters);
        case 'FREEBUSY':
            return parsefreebusy(propvalue, parameters);
        case 'TZOFFSETTO':
        case 'TZOFFSETFROM':
            return parseoffset(propvalue);
        default:
            return propvalue;
    }
}
module.exports = {
    parseproperty: parseproperty,
    parsedatetime: parsedatetime,
    parserrule: parserrule,
    parseduration: parseduration,
    parsetrigger: parsetrigger,
    parsegeo: parsegeo,
    parsedatelist: parsedatelist,
    parseattendee: parseattendee,
    parseorganizer: parseorganizer,
    parseattachment: parseattachment,
    parseperiod: parseperiod,
    parsefreebusy: parsefreebusy,
    parseoffset: parseoffset
};
