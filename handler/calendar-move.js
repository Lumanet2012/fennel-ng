var config = require('../config').config;
var log = LSE_Logger;
var ICS = require('../libs/db').ICS;
function move(comm)
{
    LSE_Logger.info("[Fennel-NG CalDAV] calendar.move called");
    comm.setstandardheaders();
    var ics_id = comm.getFilenameFromPath(true);
    var calendar = comm.getCalIdFromURL();
    var destination = "";
    var req = comm.getreq();
    var headers = req.headers;
    for(var header in headers)
    {
        if(header === "destination")
        {
            destination = req.headers[header];
        }
    }
    if(destination.length > 0)
    {
        var aURL = destination.split("/");
        var newCal = aURL[aURL.length - 2];
        ICS.find({ where: {pkey: ics_id} }).then(function(ics)
        {
            if(ics === null)
            {
                LSE_Logger.warn('[Fennel-NG CalDAV] ics not found');
            }
            else
            {
                ics.calendarId = newCal;
                ics.save().then(function()
                {
                    LSE_Logger.warn('[Fennel-NG CalDAV] ics updated');
                });
            }
        });
    }
    comm.setresponsecode(201);
    comm.flushresponse();
}
module.exports = {
    move: move
};
