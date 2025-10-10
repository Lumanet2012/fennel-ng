const redispool=require('../../redis/redis-pool');
const config=require('../config').config;
let redis=null;
let isconnected=false;
function initializeredis(){
    if(redis&&isconnected){
        return redis;
    }
    try{
        redis=redispool.getsingleclient();
        isconnected=true;
        LSE_Logger.info('[Fennel-NG Redis] Using shared Redis pool');
        return redis;
    }catch(error){
        LSE_Logger.error('[Fennel-NG Redis] Failed to get Redis client: '+error.message);
        throw error;
    }
}
function getcalendarsynctoken(calendaruri,username){
    var client=initializeredis();
    var key=`caldav:calendar:sync:${username}:${calendaruri}`;
    return client.get(key).then(function(result){
        if(result){
            LSE_Logger.debug(`[Fennel-NG Redis] Retrieved calendar sync token: ${key} = ${result}`);
        }
        return result;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error getting calendar sync token: ${error.message}`);
        return null;
    });
}
function setcalendarsynctoken(calendaruri,username,synctoken){
    var client=initializeredis();
    var key=`caldav:calendar:sync:${username}:${calendaruri}`;
    return client.set(key,synctoken,'EX',86400).then(function(){
        LSE_Logger.debug(`[Fennel-NG Redis] Set calendar sync token: ${key} = ${synctoken}`);
        return synctoken;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error setting calendar sync token: ${error.message}`);
        return synctoken;
    });
}
function incrementcalendarsynctoken(calendaruri,username){
    var client=initializeredis();
    var key=`caldav:calendar:sync:${username}:${calendaruri}`;
    return client.incr(key).then(function(newtoken){
        client.expire(key,86400);
        LSE_Logger.debug(`[Fennel-NG Redis] Incremented calendar sync token: ${key} = ${newtoken}`);
        return newtoken;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error incrementing calendar sync token: ${error.message}`);
        return Math.floor(Date.now()/1000);
    });
}
function getaddressbooksynctoken(addressbookuri,username){
    var client=initializeredis();
    var key=`carddav:addressbook:sync:${username}:${addressbookuri}`;
    return client.get(key).then(function(result){
        if(result){
            LSE_Logger.debug(`[Fennel-NG Redis] Retrieved addressbook sync token: ${key} = ${result}`);
        }
        return result;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error getting addressbook sync token: ${error.message}`);
        return null;
    });
}
function setaddressbooksynctoken(addressbookuri,username,synctoken){
    var client=initializeredis();
    var key=`carddav:addressbook:sync:${username}:${addressbookuri}`;
    return client.set(key,synctoken,'EX',86400).then(function(){
        LSE_Logger.debug(`[Fennel-NG Redis] Set addressbook sync token: ${key} = ${synctoken}`);
        return synctoken;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error setting addressbook sync token: ${error.message}`);
        return synctoken;
    });
}
function incrementaddressbooksynctoken(addressbookuri,username){
    var client=initializeredis();
    var key=`carddav:addressbook:sync:${username}:${addressbookuri}`;
    return client.incr(key).then(function(newtoken){
        client.expire(key,86400);
        LSE_Logger.debug(`[Fennel-NG Redis] Incremented addressbook sync token: ${key} = ${newtoken}`);
        return newtoken;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error incrementing addressbook sync token: ${error.message}`);
        return Math.floor(Date.now()/1000);
    });
}
function deleteaddressbooksynctoken(addressbookuri,username){
    var client=initializeredis();
    var key=`carddav:addressbook:sync:${username}:${addressbookuri}`;
    return client.del(key).then(function(){
        LSE_Logger.debug(`[Fennel-NG Redis] Deleted addressbook sync token: ${key}`);
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error deleting addressbook sync token: ${error.message}`);
    });
}
function cachejwttoken(token,payload,expiryseconds){
    var client=initializeredis();
    var key=`jwt:token:${token}`;
    var cachedata={
        payload:payload,
        cached_at:Math.floor(Date.now()/1000)
    };
    var ttl=expiryseconds||(config.jwt_expiry_minutes*60-300);
    return client.setex(key,ttl,JSON.stringify(cachedata)).then(function(){
        LSE_Logger.debug(`[Fennel-NG Redis] Cached JWT token for ${ttl} seconds`);
        return payload;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error caching JWT token: ${error.message}`);
        return payload;
    });
}
function getjwttoken(token){
    var client=initializeredis();
    var key=`jwt:token:${token}`;
    return client.get(key).then(function(result){
        if(result){
            var cachedata=JSON.parse(result);
            LSE_Logger.debug('[Fennel-NG Redis] Retrieved cached JWT token');
            return cachedata.payload;
        }
        return null;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error getting JWT token: ${error.message}`);
        return null;
    });
}
function blacklistjwttoken(token,expiryseconds){
    var client=initializeredis();
    var key=`jwt:blacklist:${token}`;
    return client.setex(key,expiryseconds||86400,'1').then(function(){
        LSE_Logger.info('[Fennel-NG Redis] Blacklisted JWT token');
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error blacklisting JWT token: ${error.message}`);
    });
}
function isjwttokenblacklisted(token){
    var client=initializeredis();
    var key=`jwt:blacklist:${token}`;
    return client.exists(key).then(function(exists){
        return exists===1;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error checking JWT blacklist: ${error.message}`);
        return false;
    });
}
function cacheldapuser(username,userdata,expiryseconds){
    var client=initializeredis();
    var key=`ldap:user:${username}`;
    var cachedata={
        user:userdata,
        cached_at:Math.floor(Date.now()/1000)
    };
    return client.setex(key,expiryseconds||300,JSON.stringify(cachedata)).then(function(){
        LSE_Logger.debug(`[Fennel-NG Redis] Cached LDAP user: ${username} for ${expiryseconds||300} seconds`);
        return userdata;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error caching LDAP user: ${error.message}`);
        return userdata;
    });
}
function getldapuser(username){
    var client=initializeredis();
    var key=`ldap:user:${username}`;
    return client.get(key).then(function(result){
        if(result){
            var cachedata=JSON.parse(result);
            LSE_Logger.debug(`[Fennel-NG Redis] Retrieved cached LDAP user: ${username}`);
            return cachedata.user;
        }
        return null;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error getting LDAP user: ${error.message}`);
        return null;
    });
}
function setsessiondata(sessionid,sessiondata,expiryseconds){
    var client=initializeredis();
    var key=`session:${sessionid}`;
    return client.setex(key,expiryseconds||3600,JSON.stringify(sessiondata)).then(function(){
        LSE_Logger.debug(`[Fennel-NG Redis] Set session data: ${sessionid}`);
        return sessiondata;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error setting session data: ${error.message}`);
        return sessiondata;
    });
}
function getsessiondata(sessionid){
    var client=initializeredis();
    var key=`session:${sessionid}`;
    return client.get(key).then(function(result){
        if(result){
            LSE_Logger.debug(`[Fennel-NG Redis] Retrieved session data: ${sessionid}`);
            return JSON.parse(result);
        }
        return null;
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error getting session data: ${error.message}`);
        return null;
    });
}
function deletesessiondata(sessionid){
    var client=initializeredis();
    var key=`session:${sessionid}`;
    return client.del(key).then(function(){
        LSE_Logger.debug(`[Fennel-NG Redis] Deleted session data: ${sessionid}`);
    }).catch(function(error){
        LSE_Logger.error(`[Fennel-NG Redis] Error deleting session data: ${error.message}`);
    });
}
function healthcheck(){
    var client=initializeredis();
    return client.ping().then(function(result){
        return {
            status:'ok',
            connected:isconnected,
            response:result
        };
    }).catch(function(error){
        return {
            status:'error',
            connected:false,
            error:error.message
        };
    });
}
module.exports={
    initializeredis:initializeredis,
    getcalendarsynctoken:getcalendarsynctoken,
    setcalendarsynctoken:setcalendarsynctoken,
    incrementcalendarsynctoken:incrementcalendarsynctoken,
    getaddressbooksynctoken:getaddressbooksynctoken,
    setaddressbooksynctoken:setaddressbooksynctoken,
    incrementaddressbooksynctoken:incrementaddressbooksynctoken,
    deleteaddressbooksynctoken:deleteaddressbooksynctoken,
    cachejwttoken:cachejwttoken,
    getjwttoken:getjwttoken,
    blacklistjwttoken:blacklistjwttoken,
    isjwttokenblacklisted:isjwttokenblacklisted,
    cacheldapuser:cacheldapuser,
    getldapuser:getldapuser,
    setsessiondata:setsessiondata,
    getsessiondata:getsessiondata,
    deletesessiondata:deletesessiondata,
    healthcheck:healthcheck
};
