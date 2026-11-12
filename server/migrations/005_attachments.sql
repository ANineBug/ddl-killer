-- 作业附件：图片、PDF、Word（docx），每个最大 10MB，一条作业最多 6 个。
-- 文件直接存在库里，和头像一样，备份数据库就连附件一起备份了。
-- 下载地址用随机的 key，不用自增编号，免得别人按顺序把所有附件扒下来
create table attachments (
  id serial primary key,
  key text not null unique,
  homework_id int not null references homework (id) on delete cascade,
  uploader_id int not null references users (id),
  name text not null,
  mime text not null,
  size int not null,
  data bytea not null,
  created_at timestamptz not null
);
create index attachments_homework on attachments (homework_id);
