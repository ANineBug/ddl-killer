export const CAMPUS_ENTRY = 'http://jwxt.swufe.edu.cn/xtgl/login_slogin.html';
export const VPN_ENTRY = 'https://webvpn.swufe.edu.cn/';
export const SCHEDULE_PATH = '/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default';
export const VPN_PREFIX = 'https://webvpn.swufe.edu.cn/http/77726476706e69737468656265737421fae0598869237f45780dc7a99c406d361f';

export function isSchoolPage(href: string) {
  try {
    const url = new URL(href);
    return ['http:', 'https:'].includes(url.protocol) &&
      (url.hostname === 'swufe.edu.cn' || url.hostname.endsWith('.swufe.edu.cn')) &&
      !url.username && !url.password;
  } catch { return false; }
}

export function isSchedulePage(href: string) {
  if (!isSchoolPage(href)) return false;
  const url = new URL(href);
  return (url.hostname === 'jwxt.swufe.edu.cn' ||
    (url.hostname === 'webvpn.swufe.edu.cn' && /^\/https?\/[\da-f]{40,}\//i.test(url.pathname))) &&
    /\/kbcx\/xskbcx_cxXskbcxIndex\.html$/i.test(url.pathname);
}

export function captureVpnPrefix(href: string) {
  if (!isSchedulePage(href) && !/\/xtgl\/(login_slogin|index_initMenu)\.html/i.test(new URL(isSchoolPage(href) ? href : VPN_ENTRY).pathname)) return null;
  return /^(https:\/\/webvpn\.swufe\.edu\.cn\/https?\/[\da-f]{40,})\//i.exec(href)?.[1] ?? null;
}

export function stageHint(href: string, ready: boolean) {
  if (ready) return '课表已显示，请选好学期后读取';
  if (/\/authserver\/login/i.test(href)) return '先登录校园账号（统一身份认证）';
  if (/\/xtgl\/login_slogin/i.test(href)) return '这里使用教务密码，与校园账号密码可能不同';
  if (/\/xtgl\/index_initMenu/i.test(href)) return '已进入教务，请打开“个人课表查询”';
  if (isSchedulePage(href)) return '请选择学期并查询，等待课表显示';
  return '校外先登录 WebVPN，再点“教务处 / 本科新系统”';
}

// 只在学校课表页捕获这一个接口，只保留课表字段，不读取请求体、密码或 cookie。
export const INSTALL_BRIDGE_JS = `
(function () {
  if (!/\\/kbcx\\/xskbcx_cxXskbcxIndex\\.html/i.test(location.pathname)) return;
  if (window.__swufeBridge) return;
  window.__swufeBridge = true;
  var fields = ['jxb_id','jxbmc','kch','kcmc','xqj','jcs','jc','zcd','xm','cdmc','xf','kcxzmc','xnm','xqm'];
  var selected = function () {
    var y = document.getElementById('xnm'), q = document.getElementById('xqm');
    return y && q ? y.value + ':' + q.value : '';
  };
  var term = function () {
    var key = selected().split(':'), q = {'3':1,'12':2,'16':3}[key[1]];
    return /^\\d{4}$/.test(key[0]) && q ? key[0] + '-' + (Number(key[0])+1) + '学年第' + q + '学期' : '';
  };
  var endpoint = function (href) {
    try { var u = new URL(href, location.href); return u.origin === location.origin && /\\/kbcx\\/xskbcx_cxXsgrkb\\.html$/i.test(u.pathname); } catch(e) { return false; }
  };
  var sequence = 0;
  var begin = function () {
    window.__swufeSchedule = null;
    window.__swufePending = true;
    return {key:selected(), term:term(), sequence:++sequence};
  };
  var finish = function (request) { if (request && request.sequence === sequence) window.__swufePending = false; };
  var remember = function (data, request) {
    if (!request || request.sequence !== sequence || request.key !== selected() || !data || !Array.isArray(data.kbList)) return;
    var rows = data.kbList.map(function (row) {
      var out = {};
      fields.forEach(function (k) { if (typeof row[k] === 'string' || typeof row[k] === 'number') out[k] = row[k]; });
      return out;
    });
    window.__swufeSchedule = {key:request.key, term:request.term, data:{kbList:rows}};
  };
  var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function () {
    this.__swufeTarget = endpoint(arguments[1]);
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__swufeTarget) {
      var xhr = this, request = begin();
      this.addEventListener('load', function () {
        try { if (xhr.status >= 200 && xhr.status < 300) remember(xhr.responseType === 'json' ? xhr.response : JSON.parse(xhr.responseText), request); } catch(e) {}
      });
      this.addEventListener('loadend', function () { finish(request); });
    }
    return send.apply(this, arguments);
  };
  if (window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function (input) {
      var target = endpoint(typeof input === 'string' ? input : input.url);
      var request = target ? begin() : null;
      return originalFetch.apply(this, arguments).then(function (response) {
        if (target && response.ok) {
          try { response.clone().json().then(function (data) { remember(data, request); finish(request); }).catch(function () { finish(request); }); }
          catch(e) { finish(request); }
        } else { finish(request); }
        return response;
      }, function (error) { finish(request); throw error; });
    };
  }
})();
true;
`;

export const PROBE_JS = `
(function () {
  if (window.__swufeProbe) clearInterval(window.__swufeProbe);
  var report = function () {
    var t = document.getElementById('table1');
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'probe',href:location.href,hasTable:!!(t && t.querySelector('.timetable_con'))}));
  };
  report();
  window.__swufeProbe = setInterval(report, 1000);
})();
true;
`;

export function grabScheduleScript(requestId: string) {
  return `(function () {
    var requestId = ${JSON.stringify(requestId)};
    var send = function (data) { data.requestId=requestId; data.href=location.href; window.ReactNativeWebView.postMessage(JSON.stringify(data)); };
    try {
      var table = document.getElementById('table1');
      if (!table || !table.querySelector('.timetable_con')) { send({type:'error',message:'请先查询课表，等待课程显示后再读取'}); return; }
      if (window.__swufePending) { send({type:'error',message:'课表正在查询，请等待查询完成后再读取'}); return; }
      var y=document.getElementById('xnm'),q=document.getElementById('xqm');
      if (y && q) {
        var semester={'3':1,'12':2,'16':3}[q.value];
        var displayed=/(\\d{4}-\\d{4})学年第([123])学期/.exec(table.textContent.replace(/\\s/g,''));
        if (!semester || !displayed || displayed[1]!==y.value+'-'+(Number(y.value)+1) || Number(displayed[2])!==semester) {
          send({type:'error',message:'所选学期与显示的课表不一致，请先点击学校页面的“查询”'}); return;
        }
      }
      var cached=window.__swufeSchedule;
      if(cached && y && q && cached.key===y.value+':'+q.value) {
        send({type:'schedule',source:'api',term:cached.term,data:cached.data}); return;
      }
      // 只取课表区域，避免把登录表单或其他页面内容传给 App。
      send({type:'schedule',source:'html',html:table.outerHTML});
    } catch(e) { send({type:'error',message:'读取失败，请重新查询后重试'}); }
  })(); true;`;
}
