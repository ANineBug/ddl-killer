// 手机系统通知的薄薄一层。网页预览不支持通知，这里的函数在网页上什么都不做

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PlannedReminder } from '@/data/reminders';

export const notifySupported = Platform.OS !== 'web';
const CHANNEL = 'homework';

let ready: Promise<void> | null = null;

// 第一次用之前：设好 app 开着时也弹横幅、建好安卓的通知渠道（安卓 13 以上要先有渠道才会弹授权框）
function setup() {
  if (!ready) {
    ready = (async () => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: '作业提醒',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#c2603e',
      });
    })();
  }
  return ready;
}

// 有没有通知权限；ask=true 时没有就弹系统授权框（被拒绝过的系统不会再弹）
export async function ensurePermission(ask: boolean) {
  if (!notifySupported) return false;
  await setup();
  const now = await Notifications.getPermissionsAsync();
  if (now.granted || !ask) return now.granted;
  return (await Notifications.requestPermissionsAsync()).granted;
}

// 准点提醒需要「闹钟和提醒」权限。安卓 14 以后新装的 app 默认是关的，没有的话系统可能晚几分钟才弹
export async function exactAlarmGranted() {
  if (Platform.OS !== 'android') return true;
  return (await Notifications.getExactAlarmPermissionsAsync()).granted;
}

export async function askExactAlarm() {
  if (Platform.OS !== 'android') return true;
  return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
}

// 把排好的提醒交给系统：先清掉之前排的，再按新的排一遍
export async function schedule(plan: PlannedReminder[]) {
  if (!notifySupported) return;
  await setup();
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const p of plan) {
    await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body, data: { homeworkId: p.homeworkId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
    });
  }
}

// 测试提醒：10 秒后弹一条。用户可以锁屏或者切走，看会不会准时出来
export async function sendTest() {
  await setup();
  await Notifications.scheduleNotificationAsync({
    content: { title: '测试提醒', body: '看到这条，说明提醒能正常弹出来。' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 10_000), channelId: CHANNEL },
  });
}
