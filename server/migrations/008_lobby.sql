-- 总聊天室（大厅）：所有登录的同学都能看、能发。消息和班级聊天放在同一张表，class_id 为空就是大厅的。
-- 这样发言间隔、管理员删消息都直接共用
alter table messages alter column class_id drop not null;
create index messages_lobby on messages (id) where class_id is null;
