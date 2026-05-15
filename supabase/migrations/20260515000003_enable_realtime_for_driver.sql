-- 启用 Realtime: 让司机端能实时收到任务变更通知
-- Supabase 默认有 supabase_realtime publication, 只需把表加进去

ALTER PUBLICATION supabase_realtime ADD TABLE public.job_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_assignments;
