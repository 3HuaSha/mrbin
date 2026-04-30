-- ============================================
-- 修复 job_steps 表的权限问题
-- 在 Supabase Dashboard 的 SQL Editor 中运行此脚本
-- ============================================

-- 1. 启用 RLS（如果还没启用）
ALTER TABLE public.job_steps ENABLE ROW LEVEL SECURITY;

-- 2. 删除旧的策略（如果存在）
DROP POLICY IF EXISTS "Enable read access for all users" ON public.job_steps;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.job_steps;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.job_steps;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.job_steps;
DROP POLICY IF EXISTS "Drivers can view their own steps" ON public.job_steps;
DROP POLICY IF EXISTS "Dispatchers can manage all steps" ON public.job_steps;
DROP POLICY IF EXISTS "Admins can manage all steps" ON public.job_steps;
DROP POLICY IF EXISTS "Drivers can update their own steps" ON public.job_steps;
DROP POLICY IF EXISTS "Staff can insert steps" ON public.job_steps;
DROP POLICY IF EXISTS "Staff can delete steps" ON public.job_steps;

-- 3. 创建新的 RLS 策略

-- 策略 1: 司机可以查看自己的步骤，staff 可以查看所有步骤
CREATE POLICY "Drivers can view their own steps" 
ON public.job_steps
FOR SELECT
TO authenticated
USING (
  driver_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
);

-- 策略 2: 司机可以更新自己的步骤，staff 可以更新所有步骤
CREATE POLICY "Drivers can update their own steps" 
ON public.job_steps
FOR UPDATE
TO authenticated
USING (
  driver_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
)
WITH CHECK (
  driver_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
);

-- 策略 3: staff 可以插入步骤
CREATE POLICY "Staff can insert steps" 
ON public.job_steps
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
);

-- 策略 4: staff 可以删除步骤
CREATE POLICY "Staff can delete steps" 
ON public.job_steps
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
);

-- 4. 验证策略已创建
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'job_steps'
ORDER BY policyname;

-- 5. 测试权限（可选）
-- 检查当前用户的角色
SELECT id, email, role FROM public.profiles WHERE id = auth.uid();

-- 完成提示
DO $$ 
BEGIN
  RAISE NOTICE '✅ job_steps 表权限已修复！';
  RAISE NOTICE '✅ RLS 策略已创建';
  RAISE NOTICE '✅ 司机可以查看和更新自己的步骤';
  RAISE NOTICE '✅ Staff 可以管理所有步骤';
END $$;
