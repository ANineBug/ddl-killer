-- 头像：同学自己上传的图片，最大 2MB。直接存在数据库里，备份和搬服务器时不用另外管一个文件夹
alter table users add column avatar_version int not null default 0; -- 每换一次加一，app 靠它知道要不要重新下载

create table avatars (
  user_id int primary key references users (id) on delete cascade,
  mime text not null,
  data bytea not null,
  updated_at timestamptz not null
);
