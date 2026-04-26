-- 重置测试司机账号密码并确认邮箱
UPDATE auth.users
SET 
  encrypted_password = crypt('driver123', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  updated_at = now()
WHERE email = 'driver@kennedy.test';