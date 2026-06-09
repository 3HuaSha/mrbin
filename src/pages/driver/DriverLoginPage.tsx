import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Truck } from "lucide-react";

export function DriverLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("driver1@kennedy.test");
  const [password, setPassword] = useState("driver123");
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<"zh" | "en">(() =>
    typeof window !== "undefined" && window.localStorage.getItem("driver_login_language") === "en" ? "en" : "zh",
  );
  const t = loginText[lang];

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/driver" });
    });
  }, [nav]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    nav({ to: "/driver" });
  };

  const switchLang = () => {
    const next = lang === "en" ? "zh" : "en";
    setLang(next);
    if (typeof window !== "undefined") window.localStorage.setItem("driver_login_language", next);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-sm bg-card rounded-2xl p-6 shadow-2xl">
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={switchLang}>
            {lang === "en" ? "中文" : "English"}
          </Button>
        </div>
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-3">
            <Truck className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">{t.title}</h1>
          <p className="text-xs text-muted-foreground mt-1">Kennedy Depot</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>{t.email}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 mt-1 text-base" required />
          </div>
          <div>
            <Label>{t.password}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 mt-1 text-base" required />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-12 text-base">
            {loading ? t.signingIn : t.signIn}
          </Button>
          <div className="text-xs text-muted-foreground text-center pt-2 space-y-0.5">
            <div>{t.testAccounts}</div>
            <div className="font-mono">driver1@kennedy.test ~ driver5@kennedy.test</div>
          </div>
        </form>
      </div>
    </div>
  );
}

const loginText = {
  zh: {
    title: "司机登录",
    email: "邮箱",
    password: "密码",
    signingIn: "登录中...",
    signIn: "登录",
    testAccounts: "测试账号（密码 driver123）：",
  },
  en: {
    title: "Driver Login",
    email: "Email",
    password: "Password",
    signingIn: "Signing in...",
    signIn: "Sign In",
    testAccounts: "Test accounts (password driver123):",
  },
};
