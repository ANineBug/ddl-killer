import { useImperativeHandle } from 'react';
import { View } from 'react-native';

import { Txt } from './ui';
import type { SchoolBrowserProps } from './SchoolBrowser.types';

export default function SchoolBrowser({ ref, onHtml, onError }: SchoolBrowserProps) {
  useImperativeHandle(ref, () => ({ inject: () => {}, reload: () => {} }), []);
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
      <Txt variant="title">从教务导入课表</Txt>
      <Txt tone="sub">
        {'1. 在浏览器里登录教务系统，打开「个人课表查询」\n2. 按 Ctrl+S（手机上用浏览器的「保存网页」）把这一页存成网页文件\n3. 在下面选择刚存的文件，预览后导入'}
      </Txt>
      <Txt variant="caption" tone="faint">文件只在你的浏览器里读取，只上传课程安排。用安卓 App 可以直接在 App 里登录导入。</Txt>
      <input
        aria-label="选择个人课表 HTML 文件"
        type="file" accept=".html,.htm,text/html"
        onChange={async (e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) { onError('课表文件过大，请选择个人课表网页'); return; }
          try { onHtml(await file.text()); } catch { onError('无法读取文件，请重新选择'); }
        }}
      />
    </View>
  );
}
