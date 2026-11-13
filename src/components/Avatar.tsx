import { Image, View } from 'react-native';

import { assetUrl } from '@/api/client';
import { Txt } from '@/components/ui';
import { fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// 头像：传过图片就显示图片，没传过就是昵称第一个字加一个颜色。颜色按编号固定，同一个人在哪都一样
export function Avatar({ user, size = 32, hue }: { user: { id?: number; nickname: string; avatar?: string | null }; size?: number; hue?: number }) {
  const { theme } = useTheme();
  const url = assetUrl(user.avatar);
  const radius = size / 2;
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: theme.line }} />;
  const index = hue ?? (user.id ?? [...user.nickname].reduce((s, c) => s + c.charCodeAt(0), 0));
  const color = theme.courseHues[index % theme.courseHues.length];
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Txt style={{ fontFamily: fonts.serif, fontSize: size * 0.43, color: '#ffffff', fontWeight: '600' }}>{user.nickname.slice(0, 1)}</Txt>
    </View>
  );
}
