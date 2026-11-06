import { useImperativeHandle, useRef } from 'react';
import { WebView } from 'react-native-webview';

import { INSTALL_BRIDGE_JS, isSchoolPage, PROBE_JS } from '@/lib/swufe/browser';
import type { SchoolBrowserProps } from './SchoolBrowser.types';

export default function SchoolBrowser({ ref, entry, onMessage, onNavigate, onError }: SchoolBrowserProps) {
  const browser = useRef<WebView<object>>(null);
  useImperativeHandle(ref, () => ({
    inject: (script) => browser.current?.injectJavaScript(script),
    reload: () => browser.current?.reload(),
  }), []);
  return (
    <WebView<object>
      ref={browser}
      source={{ uri: entry }}
      javaScriptEnabled domStorageEnabled thirdPartyCookiesEnabled sharedCookiesEnabled
      mixedContentMode="always" setSupportMultipleWindows={false}
      incognito cacheEnabled={false} saveFormDataDisabled
      originWhitelist={['*']}
      injectedJavaScriptBeforeContentLoaded={INSTALL_BRIDGE_JS}
      injectedJavaScript={`${INSTALL_BRIDGE_JS}\n${PROBE_JS}`}
      onMessage={(e) => onMessage(e.nativeEvent.data, e.nativeEvent.url)}
      onLoadStart={(e) => onNavigate(e.nativeEvent.url)}
      onLoadEnd={() => browser.current?.injectJavaScript(`${INSTALL_BRIDGE_JS}\n${PROBE_JS}`)}
      onShouldStartLoadWithRequest={(request) => {
        // 学校验证码可能嵌入第三方 HTTPS 页面，主页面仍限定在学校域内。
        if (request.isTopFrame === false && /^https:/i.test(request.url)) return true;
        if (isSchoolPage(request.url) || /^(about|blob|data):/i.test(request.url)) return true;
        onError('请在学校网页内登录，暂不支持外部 App 或其他网站');
        return false;
      }}
      onError={() => onError('网页加载失败，请检查网络后重试；校外请选择 WebVPN')}
      onHttpError={(e) => {
        if (e.nativeEvent.url === entry) onError(`学校页面返回 ${e.nativeEvent.statusCode}，请稍后重试`);
      }}
      onRenderProcessGone={() => onError('浏览器已停止，请重新打开教务页面')}
      style={{ flex: 1 }}
    />
  );
}
