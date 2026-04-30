-- ============================================
-- 临时宽松权限（用于测试）
-- 警告：这会允许所有认证用户操作 job_steps
-- 仅用于调试，生产环境需要更严格的权限
-- ============================================

-- 1. 启用 RLS
ALTER TABLE public.job_steps ENABLE ROW LEVEL SECURITY;

-- 2. 删除所有现有策略
DROP POLICY IF EXISTS "Drivers can view their own steps" ON public.job_steps;
DROP POLICY IF EXISTS "Drivers can update their own steps" ON public.job_steps;
DROP POLICY IF EXISTS "Dispatchers and admins can insert steps" ON public.job_steps;
DROP POLICY IF EXISTS "Dispatchers and admins can delete steps" ON public.job_steps;
DROP POLICY IF EXISTS "Staff can insert steps" ON public.job_steps;
DROP POLICY IF EXISTS "Staff can delete steps" ON public.job_steps;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.job_steps;

-- 3. 创建宽松策略（允许所有认证用户）
CREATE POLICY "Allow all for authenticated users" 
ON public.job_steps
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. 验证
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'job_steps';

-- 完成提示
DO $$ 
BEGIN
  RAISE NOTICE '⚠️  临时宽松权限已设置';
  RAISE NOTICE '⚠️  所有认证用户都可以操作 job_steps';
  RAISE NOTICE '⚠️  这仅用于测试，请稍后设置正确的权限';
END $$;
