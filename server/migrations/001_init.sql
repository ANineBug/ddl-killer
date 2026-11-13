-- 第一版的全部表。规则说明见 server/README.md

-- 用户：只有邮箱和昵称。不存学号、姓名
create table users (
  id serial primary key,
  email text not null unique,             -- 规整过的邮箱（Gmail 去掉点和 + 后缀）
  nickname text not null,
  demoted boolean not null default false, -- 管理员降级：在所有班都按新同学算
  is_admin boolean not null default false,
  created_at timestamptz not null
);

-- 邮箱验证码：每个邮箱同时只有一个有效码，存的是哈希不是原码
create table email_codes (
  email text primary key,
  code_hash text not null,
  sent_at timestamptz not null,
  expires_at timestamptz not null,
  attempts int not null default 0
);

-- 发码记录，用来限制同一个 IP 发码的频率
create table code_requests (
  id serial primary key,
  ip text not null,
  email text not null,
  at timestamptz not null
);
create index code_requests_ip on code_requests (ip, at);

-- 登录凭证：只存哈希，数据库泄露也拿不到能用的凭证
create table sessions (
  token_hash text primary key,
  user_id int not null references users (id) on delete cascade,
  created_at timestamptz not null,
  last_seen timestamptz not null
);

-- 教学班：只能由教务导入创建
create table classes (
  id serial primary key,
  term text not null,                     -- 例如 "2026-2027学年第1学期"
  name text not null,
  name_key text not null,                 -- 规整后的课名，用来比对
  teacher text not null,
  jxb_id text,                            -- 教务的教学班 id，页面上有就记下来
  created_by int references users (id) on delete set null,
  created_at timestamptz not null
);
create unique index classes_jxb on classes (term, jxb_id) where jxb_id is not null;
create index classes_name on classes (term, name_key);

-- 教学班的上课时间：星期几、第几节到第几节、在哪、哪几周
create table class_slots (
  id serial primary key,
  class_id int not null references classes (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  period_from smallint not null,
  period_to smallint not null,
  room text not null,
  room_key text not null,                 -- 规整后的教室；讲座场地这类不是真教室的为空
  weeks int[] not null                    -- 具体哪几周，单双周和跳周都直接展开
);
create index class_slots_time on class_slots (weekday, period_from, room_key);

-- 谁在哪个班。via = import（教务导入）/ manual（手动加入）
create table memberships (
  class_id int not null references classes (id) on delete cascade,
  user_id int not null references users (id) on delete cascade,
  via text not null check (via in ('import', 'manual')),
  joined_at timestamptz not null,
  primary key (class_id, user_id)
);
create index memberships_user on memberships (user_id);

create table homework (
  id serial primary key,
  class_id int not null references classes (id) on delete cascade,
  uploader_id int not null references users (id),
  title text not null,
  detail text not null default '',
  due_kind text not null check (due_kind in ('at', 'next_class', 'tbd')), -- 具体时间 / 下次课前 / 待定
  due timestamptz,                        -- 待定时为空；"下次课前"由手机按课表算好再传上来
  submit text not null,
  source text not null,                   -- 课堂口头 / 学习通 / 群通知
  optional boolean not null default false,
  group_work boolean not null default false,
  status text not null default 'active' check (status in ('active', 'cancelled', 'merged', 'deleted')),
  merged_into int references homework (id),
  postponed boolean not null default false,
  version int not null default 1,         -- 每改一次加一；确认记录上记着确认的是哪一版
  confirmed_at timestamptz,               -- 到达确认门槛的时间，同时给上传者发了分
  remind_ready boolean not null,          -- 新同学传的作业，要有一个正式成员确认后才推提醒
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index homework_class on homework (class_id, status);

create table confirmations (
  homework_id int not null references homework (id) on delete cascade,
  user_id int not null references users (id) on delete cascade,
  version int not null,
  created_at timestamptz not null,
  primary key (homework_id, user_id)
);

-- 赞和下雨两种表情；"确认"单独放在 confirmations
create table reactions (
  homework_id int not null references homework (id) on delete cascade,
  user_id int not null references users (id) on delete cascade,
  kind text not null check (kind in ('thumbs', 'cry')),
  created_at timestamptz not null,
  primary key (homework_id, user_id, kind)
);

-- 「有问题」：内容不对（correct）/ 老师改了（update）/ 重复了（duplicate）/ 不是重复（unduplicate）
create table proposals (
  id serial primary key,
  homework_id int not null references homework (id) on delete cascade,
  proposer_id int not null references users (id),
  kind text not null check (kind in ('correct', 'update', 'duplicate', 'unduplicate')),
  changes jsonb,                          -- 改哪些字段，纠错和更新才有
  target_id int references homework (id), -- 和哪一条重复，重复类才有
  reason text not null default '',
  status text not null default 'open' check (status in ('open', 'applied', 'rejected', 'withdrawn', 'expired')),
  applied_via text check (applied_via in ('adopt', 'vote')),
  applied_version int,                    -- 生效后作业变成第几版；上传者采纳的，要等别人确认这一版才发分
  points_at timestamptz,                  -- 已经发过分的时间
  created_at timestamptz not null,
  closed_at timestamptz
);
-- 每人对每条作业同时只能有一条进行中的提议
create unique index proposals_one_open on proposals (homework_id, proposer_id) where status = 'open';

create table proposal_votes (
  proposal_id int not null references proposals (id) on delete cascade,
  user_id int not null references users (id) on delete cascade,
  agree boolean not null,
  created_at timestamptz not null,
  primary key (proposal_id, user_id)
);

-- 改动记录：谁、通过哪条提议、把什么从什么改成什么
create table homework_changes (
  id serial primary key,
  homework_id int not null references homework (id) on delete cascade,
  proposal_id int references proposals (id) on delete set null,
  user_id int not null references users (id),
  changes jsonb not null,                 -- { 字段: { from, to } }
  created_at timestamptz not null
);
create index homework_changes_hw on homework_changes (homework_id);

-- 贡献值流水。某人在某班的分 = 这里加起来
create table points (
  id serial primary key,
  user_id int not null references users (id) on delete cascade,
  class_id int not null references classes (id) on delete cascade,
  delta int not null,
  reason text not null check (reason in ('upload_confirmed', 'correction', 'update', 'corrected')),
  homework_id int references homework (id) on delete set null,
  proposal_id int references proposals (id) on delete set null,
  created_at timestamptz not null
);
create index points_class_user on points (class_id, user_id);
create index points_user on points (user_id);

-- 班级聊天：只有文字，可以带一张作业卡片
create table messages (
  id serial primary key,
  class_id int not null references classes (id) on delete cascade,
  user_id int not null references users (id) on delete cascade,
  text text not null,
  homework_id int references homework (id) on delete set null,
  created_at timestamptz not null,
  deleted_at timestamptz
);
create index messages_class on messages (class_id, id);
create index messages_user on messages (user_id, created_at);
