-- 账号改成密码登录：注册和找回密码要邮箱验证码，平时登录只要邮箱 + 密码

-- 密码只存 scrypt 哈希。以前用验证码登录建的账号是空的，要用「找回密码」设一个
alter table users add column password_hash text;

-- 验证码分用途：注册用的不能拿去重置密码，反过来也一样
alter table email_codes add column purpose text not null default 'register' check (purpose in ('register', 'reset'));

-- 密码输错的记录，用来挡暴力猜密码：同一个邮箱、同一个 IP 短时间内错太多次就先不让试
create table login_failures (
  id serial primary key,
  email text not null,
  ip text not null,
  at timestamptz not null
);
create index login_failures_email on login_failures (email, at);
create index login_failures_ip on login_failures (ip, at);
