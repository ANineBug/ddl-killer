-- 每个人对每条作业的个人状态：完成了没有、与我无关、归档、自己设的提醒。
-- 以前只存在手机上，换设备、用网页版就丢了；现在跟着账号走。updated_at 是用户在设备上改的时间，
-- 两台设备都改过的，以后改的为准
create table homework_marks (
  user_id int not null references users (id) on delete cascade,
  homework_id int not null references homework (id) on delete cascade,
  done boolean not null default false,
  done_at timestamptz,
  ignored boolean not null default false,
  archived boolean,                       -- 空：按规则自动归档；true 自己归档了；false 移回来了
  reminders jsonb,                        -- 空：跟随默认提醒
  updated_at timestamptz not null,
  primary key (user_id, homework_id)
);
