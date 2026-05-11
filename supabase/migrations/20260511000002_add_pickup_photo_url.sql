-- 换桶 (swap) 场景下，司机一步完成"放新桶 + 收旧桶"两件事
-- 原来只有 photo_url (拍新桶)，现在追加一列 pickup_photo_url (拍旧桶/收回桶)
ALTER TABLE public.job_steps
  ADD COLUMN IF NOT EXISTS pickup_photo_url TEXT;

COMMENT ON COLUMN public.job_steps.pickup_photo_url IS
  '换桶 (swap) 步骤的旧桶/收回桶照片；与 photo_url (送出新桶照片) 区分。非 swap 步骤通常为空。';
