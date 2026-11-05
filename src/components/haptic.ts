import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// 轻微震动；网页上不震，免得浏览器弹权限
export const haptic = {
  light: () => Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  select: () => Platform.OS !== 'web' && Haptics.selectionAsync(),
  success: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};
