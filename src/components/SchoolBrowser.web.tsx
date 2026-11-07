import { useImperativeHandle } from 'react';
import { View } from 'react-native';

import { Txt } from './ui';
import type { SchoolBrowserProps } from './SchoolBrowser.types';

export default function SchoolBrowser({ ref, onHtml, onError }: SchoolBrowserProps) {
  useImperativeHandle(ref, () => ({ inject: () => {}, reload: () => {} }), []);
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
      <Txt variant="title">在手机中登录教务</Txt>
      <Txt tone="sub">网页版可以读取已保存的课表网页，预览并导入。文件仅在本机处理。</Txt>
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
