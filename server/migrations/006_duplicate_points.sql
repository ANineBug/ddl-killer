-- 重复作业合并时的加减分：保护先传的同学。
--   merged_away：后传的那条被合并掉，它因为被确认拿到的分收回
--   duplicate  ：后传的那条重复了，另外扣分
alter table points drop constraint points_reason_check;
alter table points add constraint points_reason_check
  check (reason in ('upload_confirmed', 'correction', 'update', 'corrected', 'merged_away', 'duplicate'));
