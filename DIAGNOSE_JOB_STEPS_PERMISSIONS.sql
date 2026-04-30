-- ============================================
-- 诊断 job_steps 权限问题
-- 在 Supabase Dashboard 的 SQL Editor 中运行此脚本
-- ============================================

-- 1. 检查当前用户信息
SELECT 
  '当前用户信息' as check_type,
  auth.uid() as user_id,
  p.email,
  p.role,
  p.name
FROM public.profiles p
WHERE p.id = auth.uid();

-- 2. 检查 job_steps 表是否启用了 RLS
SELECT 
  '表 RLS 状态' as check_type,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'job_steps';

-- 3. 检查 job_steps 的所有策略
SELECT 
  '现有策略' as check_type,
  policyname,
  cmd as operation,
  roles,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'job_steps'
ORDER BY policyname;

-- 4. 检查 profiles 表的 role 列类型
SELECT 
  '角色列信息' as check_type,
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'role';

-- 5. 检查 user_role 枚举的所有值
SELECT 
  '可用角色值' as check_type,
  enumlabel as role_value
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
ORDER BY enumsortorder;

-- 6. 测试策略条件（检查当前用户是否满足 staff 条件）
SELECT 
  '策略条件测试' as check_type,
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  ) as is_staff;

-- 7. 检查 job_steps 表结构
SELECT 
  '表结构' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'job_steps'
ORDER BY ordinal_position;
