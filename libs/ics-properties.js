function parsedatetime(datestr, parameters)
{
    if(!datestr || datestr.length < 8) return null;
    var year = parseInt(datestr.substr(0, 4));
    var month = parseInt(datestr.substr(4, 2)) - 1;
    var day = parseInt(datestr.substr(6, 2));
    var hour = 0;
    var minute = 0;
    var second = 0;
    var isdate = true;
    if(datestr.length > 8 && datestr.charAt(8) === 'T') {
        isdate = false;
        hour = parseInt(datestr.substr(9, 2)) || 0;
        minute = parseInt(datestr.substr(11, 2)) || 0;
        second = parseInt(datestr.substr(13, 2)) || 0;
    }
    var isutc = datestr.charAt(datestr.length - 1) === 'Z';
    var tzid = parameters && parameters.TZID ? parameters.TZID : null;
    var date = new Date(Date.UTC(year, month, day, hour, minute, second));
    if(isNaN(date.getTime())) {
        LSE_Logger.error(`[Fennel-NG CalDAV] invalid date: ${datestr}`);
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
function parserrule(rrulestr)
{
    var parts = rrulestr.split(';');
    var rrule = {};
    for(var i = 0; i < parts.length; i++) {
        var part = parts[i];
        var eqindex = part.indexOf('=');
        if(eqindex !== -1) {
            var key = part.substring(0, eqindex);
            var value = part.substring(eqindex + 1);
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
function parseduration(durationstr)
{
    var match = durationstr.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if(!match) {
        LSE_Logger.error(`[Fennel-NG CalDAV] invalid duration: ${durationstr}`);
        return null;
    }
    var sign = match[1] === '-' ? -1 : 1;
    var weeks = parseInt(match[2]) || 0;
    var days = parseInt(match[3]) || 0;
    var hours = parseInt(match[4]) || 0;
    var minutes = parseInt(match[5]) || 0;
    var seconds = parseInt(match[6]) || 0;
    var totalseconds = sign * (weeks * 604800 + days * 86400 + hours * 3600 + minutes * 60 + seconds);
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
function parsetrigger(triggerstr, parameters)
{
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
function parsegeo(geostr)
{
    var parts = geostr.split(';');
    if(parts.length === 2) {
        var lat = parseFloat(parts[0]);
        var lon = parseFloat(parts[1]);
        if(!isNaN(lat) && !isNaN(lon)) {
            return {
                lat: lat,
                lon: lon
            };
        }
    }
    LSE_Logger.error(`[Fennel-NG CalDAV] invalid geo: ${geostr}`);
    return null;
}
function parsedatelist(dateliststr, parameters)
{
    var dates = dateliststr.split(',');
    var parseddates = [];
    for(var i = 0; i < dates.length; i++) {
        var parsed = parsedatetime(dates[i], parameters);
        if(parsed) {
            parseddates.push(parsed);
        }
    }
    return parseddates;
}
function parseattendee(attendeestr, parameters)
{
    var email = attendeestr.replace(/^mailto:/i, '');
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
function parseorganizer(organizerstr, parameters)
{
    var email = organizerstr.replace(/^mailto:/i, '');
    return {
        email: email,
        cn: parameters && parameters.CN ? parameters.CN : null,
        sentby: parameters && parameters['SENT-BY'] ? parameters['SENT-BY'] : null,
        dir: parameters && parameters.DIR ? parameters.DIR : null,
        language: parameters && parameters.LANGUAGE ? parameters.LANGUAGE : null
    };
}
function parseattachment(attachstr, parameters)
{
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
function parseperiod(periodstr)
{
    var parts = periodstr.split('/');
    if(parts.length !== 2) {
        LSE_Logger.error(`[Fennel-NG CalDAV] invalid period: ${periodstr}`);
        return null;
    }
    var start = parsedatetime(parts[0], {});
    var endduration = parts[1];
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
function parsefreebusy(freebusystr, parameters)
{
    var fbtype = parameters && parameters.FBTYPE ? parameters.FBTYPE : 'BUSY';
    var periods = freebusystr.split(',');
    var parsedperiods = [];
    for(var i = 0; i < periods.length; i++) {
        var period = parseperiod(periods[i]);
        if(period) {
            parsedperiods.push(period);
        }
    }
    return {
        fbtype: fbtype,
        periods: parsedperiods
    };
}
function parseoffset(offsetstr)
{
    var match = offsetstr.match(/^([+-])(\d{2})(\d{2})(?:(\d{2}))?$/);
    if(!match) {
        LSE_Logger.error(`[Fennel-NG CalDAV] invalid offset: ${offsetstr}`);
        return null;
    }
    var sign = match[1] === '+' ? 1 : -1;
    var hours = parseInt(match[2]);
    var minutes = parseInt(match[3]);
    var seconds = parseInt(match[4]) || 0;
    var totalseconds = sign * (hours * 3600 + minutes * 60 + seconds);
    return {
        sign: sign,
        hours: hours,
        minutes: minutes,
        seconds: seconds,
        totalseconds: totalseconds,
        string: offsetstr
    };
}
function parseproperty(propname, propvalue, parameters)
{
    LSE_Logger.debug(`[Fennel-NG CalDAV] parsing property ${propname}`);
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
