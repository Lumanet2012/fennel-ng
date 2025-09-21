/*-----------------------------------------------------------------------------
 **
 ** - Fennel Card-/CalDAV -
 **
 ** Copyright 2014 by
 ** SwordLord - the coding crew - http://www.swordlord.com
 ** and contributing authors
 **
 -----------------------------------------------------------------------------*/

var log = LSE_Logger;

// Exporting.
module.exports = {
    user: user
};


function user(username)
{
    this.username = username;

    return this;
}

user.prototype.getUserName = function()
{
    return this.username;
};
