const $ = new Env("京东云无线宝积分");
const notify = $.isNode() ? require("./sendNotify") : "";

const jdc_wskey = $.isNode() ? process.env["JDC_WSKEY"] : $.getdata("JDC_WSKEY"); //从京东云无线宝中获取,自行抓包
const devicenames = $.isNode() ? process.env["DEVICENAME"] : $.getdata("DEVICENAME"); //设备名 mac全名称或后六位:设置的名称，多个使用&连接,例如 1CECF2:测试1&DCD87C2305D6:hahaha
var recordnumTmp = $.isNode() ? process.env["RECORDSNUM"] : $.getdata("RECORDSNUM"); //查询记录数,纯数字,默认值为7
const recordnum = isNaN(recordnumTmp) ? 7 : recordnumTmp;

!(async () => {
    if (!jdc_wskey) {
        $.msg($.name, `未获取对应wskey`);
        if ($.isNode()) await notify.sendNotify(`${$.name}未获取对应wskey`);
        $.done();
        return;
    }
    $.pinTotalAvailPoint = await load("pinTotalAvailPoint"); //{"totalAvailPoint":7364}
    $.todayPointIncome = await load("todayPointIncome"); //{"todayTotalPoint":145,"todayDate":"2021-03-11"}
    $.todayPointDetail = await load("todayPointDetail?sortField=today_point&pageSize=30&currentPage=1"); //{"todayDate":"2021-03-11","pointInfos":[{"mac":"DCD87C******","todayPointIncome":84,"allPointIncome":11676}],"pageInfo":{"currentPage":1,"pageSize":30,"totalRecord":3,"totalPage":1}}
    if ($.todayPointDetail && $.todayPointDetail.pointInfos && $.todayPointDetail.pointInfos.length > 0) {
        for (var i = 0; i < $.todayPointDetail.pointInfos.length; i++) {
            let routerAccountInfo = await load(`routerAccountInfo?mac=${$.todayPointDetail.pointInfos[i].mac}`);
            $.todayPointDetail.pointInfos[i].accountInfo = routerAccountInfo.accountInfo; //{"accountInfo":{"mac":"DCD87C******","amount":1581,"bindAccount":"******","recentExpireAmount":10,"recentExpireTime":1643580685000}}
            let pointOperateRecords = await load(
                `pointOperateRecords:show?mac=${$.todayPointDetail.pointInfos[i].mac}&source=1&currentPage=1&pageSize=${recordnum}`
            );
            $.todayPointDetail.pointInfos[i].records = pointOperateRecords.pointRecords; //{"pointRecords":[{"recordType":1,"exchangeType":1,"pointAmount":26,"beanAmount":0,"createTime":1615414545000},{"recordType":1,"exchangeType":1,"pointAmount":36,"beanAmount":0,"createTime":1615327880000},{"recordType":1,"exchangeType":1,"pointAmount":25,"beanAmount":0,"createTime":1615241507000}],"pageInfo":{"currentPage":1,"pageSize":7,"totalRecord":40,"totalPage":6}}
        }
    }
    let content = await getNotify();
    $.msg($.name, content);
    if ($.isNode()) {
        await notify.sendNotify($.name, content);
    }
})()
    .catch((e) => {
        $.log("", `❌ ${$.name}, 失败! 原因: ${e}!`, "");
    })
    .finally(() => {
        $.done();
    });

async function getNotify() {
    let content = "";
    if ($.todayPointIncome && $.todayPointDetail && $.todayPointDetail.pageInfo) {
        content += `📅${$.todayPointIncome.todayDate}  📲设备数${$.todayPointDetail.pageInfo.totalRecord}  💵获得${$.todayPointIncome.todayTotalPoint}积分`;
    }
    content += `\n\n==================设备信息==================`;
    if ($.todayPointDetail && $.todayPointDetail.pointInfos && $.todayPointDetail.pointInfos.length > 0) {
        for (const pointInfoByDevice of $.todayPointDetail.pointInfos) {
            content += `

❤️【${getNickNameByMac(pointInfoByDevice.mac)}】
💱今日积分${pointInfoByDevice.todayPointIncome}  ✔️可用积分${
                pointInfoByDevice.accountInfo ? pointInfoByDevice.accountInfo.amount : "0"
            }  💲总积分${pointInfoByDevice.allPointIncome}
`;
            if (
                pointInfoByDevice.accountInfo.recentExpireAmount > 0 &&
                pointInfoByDevice.accountInfo.recentExpireTime - new Date().getTime() <= 60 * 24 * 60 * 60
            ) {
                content += `⚠️⚠️⚠️最近60天内(${dateFormat(
                    new Date(pointInfoByDevice.accountInfo.recentExpireTime),
                    "yyyy-MM-dd"
                )})即将过期(${pointInfoByDevice.accountInfo.recentExpireAmount})积分，请尽快兑换\n`;
            }
            for (var i = 0; i < pointInfoByDevice.records.length; i++) {
                var recordInfo = pointInfoByDevice.records[i];
                var date = new Date(recordInfo.createTime);
                var operate = recordInfo.recordType == 1 ? "收入" : "支出";
                var amount = recordInfo.pointAmount < 100 ? "  " + recordInfo.pointAmount : recordInfo.pointAmount;
                content += `📆${dateFormat(date, "MM月dd日")} ${operate}${amount}积分${i % 2 == 1 ? "\n" : "    "}`;
            }
        }
    }
    return content;
}

function getNickNameByMac(mac) {
    var nickName = mac;
    if (devicenames) {
        var subNames = devicenames.split("&");
        for (var sn of subNames) {
            var n = sn.split(/[：|:]/);
            if (n.length <= 1) continue;
            if (mac.indexOf(n[0]) >= 0) {
                nickName = n[1];
                break;
            }
        }
    }

    return nickName;
}

async function load(method) {
    return new Promise((resolve) => {
        var request = {
            url: `https://router-app-api.jdcloud.com/v1/regions/cn-north-1/${method}`,
            headers: {
                "x-app-id": "996",
                "Content-Type": "application/json",
                wskey: jdc_wskey,
            },
        };
        var response = undefined;
        $.get(request, (err, resp, data) => {
            try {
                if (err) {
                    console.log(`${JSON.stringify(err)}`);
                    console.log(`${$.name} API请求失败，请检查网路重试`);
                } else {
                    if (data && safeGet(data)) {
                        var temp = JSON.parse(data);
                        $.log(JSON.stringify(temp.result));
                        if (temp.code == 200) {
                            response = temp.result;
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve(response);
            }
        });
    });
}

function safeGet(data) {
    try {
        if (typeof JSON.parse(data) == "object") {
            return true;
        }
    } catch (e) {
        console.log(e);
        return false;
    }
}

function dateFormat(date, fmt) {
    var o = {
        "M+": date.getMonth() + 1, //月份
        "d+": date.getDate(), //日
        "h+": date.getHours() % 12 == 0 ? 12 : date.getHours() % 12, //小时
        "H+": date.getHours(), //小时
        "m+": date.getMinutes(), //分
        "s+": date.getSeconds(), //秒
        "q+": Math.floor((date.getMonth() + 3) / 3), //季度
        S: date.getMilliseconds(), //毫秒
    };
    var week = {
        0: "/u65e5",
        1: "/u4e00",
        2: "/u4e8c",
        3: "/u4e09",
        4: "/u56db",
        5: "/u4e94",
        6: "/u516d",
    };
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
    }
    if (/(E+)/.test(fmt)) {
        fmt = fmt.replace(
            RegExp.$1,
            (RegExp.$1.length > 1 ? (RegExp.$1.length > 2 ? "/u661f/u671f" : "/u5468") : "") + week[date.getDay() + ""]
        );
    }
    for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, RegExp.$1.length == 1 ? o[k] : ("00" + o[k]).substr(("" + o[k]).length));
        }
    }
    return fmt;
}

// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),a={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(a,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)}))}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:i,...r}=t;this.got[s](i,r).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`❗️${this.name}, 错误!`,t.stack):this.log("",`❗️${this.name}, 错误!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`🔔${this.name}, 结束! 🕛 ${s} 秒`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}
