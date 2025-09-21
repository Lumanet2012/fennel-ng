var log = require('../libs/log').log;
var ICS = require('../libs/db').ICS;
function move(comm)
{
    log.debug("calendar.move called");
    comm.setStandardHeaders();
    var ics_id = comm.getFilenameFromPath(true);
    var calendar = comm.getCalIdFromURL();
    var destination = "";
    var req = comm.getReq();
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
                log.warn('ics not found');
            }
            else
            {
                ics.calendarId = newCal;
                ics.save().then(function()
                {
                    log.warn('ics updated');
                });
            }
        });
    }
    comm.setResponseCode(201);
    comm.flushResponse();
}
module.exports = {
    move: move
};

