import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * 司机端 PWA 辅助 hook：
 *  - 注册 /driver-sw.js（仅 driver 作用域下生效）
 *  - 捕获 beforeinstallprompt，向 UI 暴露安装按钮
 *  - 检测 iOS 独立模式 / Safari（iOS 没有 beforeinstallprompt，只能提示"添加到主屏幕"）
 */
export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 平台检测
    const ua = window.navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(iOS);

    // 是否已作为 PWA 打开
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(standalone);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall as EventListener);
    window.addEventListener("appinstalled", onInstalled);

    // 注册 Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/driver-sw.js", { scope: "/driver" })
        .catch((err) => console.warn("[PWA] SW 注册失败", err));
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setDeferredPrompt(null);
    return choice.outcome === "accepted";
  }, [deferredPrompt]);

  return {
    canInstall: !!deferredPrompt,
    isInstalled,
    isIOS,
    promptInstall,
  };
}
