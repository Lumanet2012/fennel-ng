function user(username)
{
    this.username = username;
    return this;
}
user.prototype.getusername = function()
{
    return this.username;
};
module.exports = {
    user: user
};
