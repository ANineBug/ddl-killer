import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { planReminders } from '@/data/reminders';
import { useStore } from '@/data/store';
import { ensurePermission, notifySupported, schedule } from '@/lib/notify';

// 作业、完成状态、提醒设置一变，就重新算一遍接下来的提醒交给系统。不画任何东西
export function LocalReminders() {
  if (!notifySupported) return null;
  return <Scheduler />;
}

function Scheduler() {
  const { homework, courses, settings } = useStore();
  const last = useRef('');
  const asked = useRef(false);

  useEffect(() => {
    // 连续变化（比如同步时一条条更新）等停下来再排
    const t = setTimeout(async () => {
      const plan = planReminders(homework, courses, settings);
      const signature = plan.map((p) => `${p.key}|${p.title}|${p.body}`).join('\n');
      if (signature === last.current) return;
      // 有要排的提醒时才问通知权限，一次打开只问一次
      const granted = await ensurePermission(plan.length > 0 && !asked.current);
      if (plan.length > 0) asked.current = true;
      if (!granted) return;
      await schedule(plan);
      last.current = signature;
    }, 800);
    return () => clearTimeout(t);
  }, [homework, courses, settings]);

  // 点通知：打开那条作业。app 是被这条通知唤起的也算
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.content.data?.homeworkId;
    if (typeof id !== 'string' || handled.current === response.notification.request.identifier) return;
    handled.current = response.notification.request.identifier;
    if (homework.some((h) => h.id === id)) router.push(`/homework/${id}`);
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [response, homework]);

  return null;
}
