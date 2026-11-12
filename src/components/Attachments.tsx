import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Image, Linking, StyleSheet, View } from 'react-native';

import { assetUrl } from '@/api/client';
import type { RemoteAttachment } from '@/api/types';
import { Press, Txt } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

// 作业附件：图片（拍的题目、黑板）、PDF、Word。和服务器的规则一样：每个最大 10MB，一条最多 6 个
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENTS_MAX = 6;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// 还没传上去、只在手机上选好的文件
export type PendingFile = { key: string; uri: string; name: string; mime?: string; size?: number };

export function formatSize(n?: number) {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const kindOf = (mime?: string, name = '') =>
  mime?.startsWith('image/') ? 'image' : mime === 'application/pdf' || /\.pdf$/i.test(name) ? 'pdf' : 'word';
const ICON = { image: 'image-outline', pdf: 'document-text-outline', word: 'document-outline' } as const;
const LABEL = { image: '图片', pdf: 'PDF', word: 'Word' };

let seq = 0;

// 上传页里用：选图片、选文件，列出已有的和刚选的，可以删
export function AttachmentEditor({
  existing,
  onRemoveExisting,
  files,
  onChange,
  onError,
}: {
  existing: RemoteAttachment[];
  onRemoveExisting: (id: string) => void;
  files: PendingFile[];
  onChange: (files: PendingFile[]) => void;
  onError: (message: string) => void;
}) {
  const { theme } = useTheme();
  const left = ATTACHMENTS_MAX - existing.length - files.length;

  // 太大的挑出来提示，没超的加进列表；一次选多了只留前面的
  function add(picked: PendingFile[]) {
    const tooBig = picked.filter((f) => (f.size ?? 0) > ATTACHMENT_MAX_BYTES);
    const ok = picked.filter((f) => (f.size ?? 0) <= ATTACHMENT_MAX_BYTES);
    if (tooBig.length) onError(`${tooBig.map((f) => f.name).join('、')} 超过 10MB，没有加上`);
    if (ok.length > left) onError(`一条作业最多 ${ATTACHMENTS_MAX} 个附件，多出来的没有加上`);
    onChange([...files, ...ok.slice(0, left)]);
  }

  async function pickImages() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsMultipleSelection: true, selectionLimit: left, quality: 0.85 });
    if (res.canceled) return;
    add(
      res.assets.map((a) => ({
        key: `p${seq++}`,
        uri: a.uri,
        name: a.fileName ?? `图片${seq}.jpg`,
        mime: a.mimeType ?? 'image/jpeg',
        size: a.fileSize,
      })),
    );
  }

  async function pickFiles() {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', DOCX], multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    add(res.assets.map((a) => ({ key: `p${seq++}`, uri: a.uri, name: a.name, mime: a.mimeType, size: a.size })));
  }

  const rows = [
    ...existing.map((a) => ({ key: a.id, name: a.name, mime: a.mime, size: a.size, remove: () => onRemoveExisting(a.id) })),
    ...files.map((f) => ({ ...f, remove: () => onChange(files.filter((x) => x.key !== f.key)) })),
  ];

  return (
    <View style={{ marginTop: 22 }}>
      <Txt variant="caption" tone="sub" style={{ marginBottom: 10, marginLeft: 4 }}>
        附件（可选）
      </Txt>
      {rows.length > 0 && (
        <View style={[styles.box, { borderColor: theme.line, backgroundColor: theme.card }]}>
          {rows.map((r, i) => {
            const k = kindOf(r.mime, r.name);
            return (
              <View key={r.key} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }]}>
                <Ionicons name={ICON[k]} size={18} color={theme.sub} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="sub" numberOfLines={1}>
                    {r.name}
                  </Txt>
                  <Txt variant="caption" tone="faint">
                    {[LABEL[k], formatSize(r.size)].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                <Press onPress={r.remove} hitSlop={10}>
                  <Ionicons name="close" size={18} color={theme.faint} />
                </Press>
              </View>
            );
          })}
        </View>
      )}
      {left > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: rows.length ? 10 : 0 }}>
          <Press onPress={pickImages} style={[styles.add, { borderColor: theme.line, backgroundColor: theme.card }]}>
            <Ionicons name="image-outline" size={16} color={theme.text} />
            <Txt variant="sub">图片</Txt>
          </Press>
          <Press onPress={pickFiles} style={[styles.add, { borderColor: theme.line, backgroundColor: theme.card }]}>
            <Ionicons name="document-attach-outline" size={16} color={theme.text} />
            <Txt variant="sub">PDF / Word</Txt>
          </Press>
        </View>
      ) : null}
      <Txt variant="caption" tone="faint" style={{ marginTop: 8, marginLeft: 4 }}>
        每个不超过 10MB，最多 {ATTACHMENTS_MAX} 个{left > 0 && rows.length ? `，还能加 ${left} 个` : ''}
      </Txt>
    </View>
  );
}

// 详情页里用：图片排成一行缩略图，PDF、Word 一个一行。点开用手机自带的方式打开
export function AttachmentList({ items }: { items: RemoteAttachment[] }) {
  const { theme } = useTheme();
  if (!items.length) return null;
  const images = items.filter((a) => a.mime.startsWith('image/'));
  const docs = items.filter((a) => !a.mime.startsWith('image/'));
  const open = (a: RemoteAttachment) => {
    const url = assetUrl(a.url);
    if (url) Linking.openURL(url).catch(() => {});
  };
  return (
    <View>
      {images.length > 0 && (
        <View style={styles.thumbs}>
          {images.map((a) => (
            <Press key={a.id} onPress={() => open(a)}>
              <Image source={{ uri: assetUrl(a.url)! }} style={[styles.thumb, { backgroundColor: theme.line }]} />
            </Press>
          ))}
        </View>
      )}
      {docs.length > 0 && (
        <View style={[styles.box, { borderColor: theme.line, backgroundColor: theme.card, marginTop: images.length ? 10 : 0 }]}>
          {docs.map((a, i) => {
            const k = kindOf(a.mime, a.name);
            return (
              <Press key={a.id} onPress={() => open(a)} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }]}>
                <Ionicons name={ICON[k]} size={18} color={theme.accent} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="sub" numberOfLines={1}>
                    {a.name}
                  </Txt>
                  <Txt variant="caption" tone="faint">
                    {LABEL[k]} · {formatSize(a.size)}
                  </Txt>
                </View>
                <Ionicons name={k === 'word' ? 'download-outline' : 'open-outline'} size={16} color={theme.faint} />
              </Press>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 76, height: 76, borderRadius: 12 },
});
