import { useState, useEffect } from 'react';
import type { BusinessType } from './business';

const STORAGE_KEY = 'business_type';
const DEFAULT_BUSINESS_TYPE: BusinessType = 'garbage';

/**
 * 从 localStorage 读取业务类型
 */
export function getBusinessType(): BusinessType {
  if (typeof window === 'undefined') return DEFAULT_BUSINESS_TYPE;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'garbage' || stored === 'brick' || stored === 'material') {
      return stored;
    }
  } catch (error) {
    console.error('Failed to read business type from localStorage:', error);
  }
  
  return DEFAULT_BUSINESS_TYPE;
}

/**
 * 写入业务类型到 localStorage
 */
export function setBusinessType(businessType: BusinessType): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, businessType);
  } catch (error) {
    console.error('Failed to write business type to localStorage:', error);
  }
}

/**
 * 自定义 Hook：管理业务类型状态并同步到 localStorage
 */
export function useBusinessType(): [BusinessType, (value: BusinessType) => void] {
  const [businessType, setBusinessTypeState] = useState<BusinessType>(getBusinessType);
  
  useEffect(() => {
    // 初始化时从 localStorage 读取
    const stored = getBusinessType();
    if (stored !== businessType) {
      setBusinessTypeState(stored);
    }
  }, []);
  
  const updateBusinessType = (value: BusinessType) => {
    setBusinessTypeState(value);
    setBusinessType(value);
  };
  
  return [businessType, updateBusinessType];
}
