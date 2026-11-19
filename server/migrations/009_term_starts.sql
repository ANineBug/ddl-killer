-- 每个学期「第一周的周一」跟着账号走：换手机、用网页版登录，课表第几周也对得上。
-- 形如 {"2026-2027学年第1学期": "2026-09-07"}
alter table users add column term_starts jsonb not null default '{}';
