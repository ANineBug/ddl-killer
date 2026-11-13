-- 邮件提醒：每天早上把两天内要交的作业发一封邮件。默认关，自己在 app 里打开
alter table users add column email_digest boolean not null default false;

-- 每天只发一次：记下哪天已经发过，服务器重启也不会重复发
create table digest_runs (
  day text primary key,
  at timestamptz not null
);
