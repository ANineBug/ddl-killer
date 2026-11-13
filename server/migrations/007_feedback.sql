-- 意见反馈：登录后才能发，存在库里；服务器配了 FEEDBACK_TO 的话同时发一封邮件给开发者。
-- 只记昵称和用户编号，不记邮箱；想要回复的同学自己在 contact 里留联系方式
create table feedback (
  id serial primary key,
  user_id int references users (id) on delete set null,
  kind text not null check (kind in ('bug', 'idea', 'other')),
  text text not null,
  contact text not null default '',
  app_version text not null default '',
  platform text not null default '',
  created_at timestamptz not null
);
create index feedback_user_time on feedback (user_id, created_at);
