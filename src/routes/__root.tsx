import { Outlet, Link, createRootRouteWithContext, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">页面未找到</h2>
        <p className="mt-2 text-sm text-muted-foreground">该地址不存在或已被移除。</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Kennedy Depot — 调度运营系统" },
      { name: "description", content: "Kennedy Depot 垃圾桶租赁内部调度运营系统" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = router.options.context.queryClient;
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
        <style dangerouslySetInnerHTML={{__html: `
          :root {
            --radius: 0.5rem;
            --background: oklch(0.985 0.005 240);
            --foreground: oklch(0.18 0.03 250);
            --card: oklch(1 0 0);
            --card-foreground: oklch(0.18 0.03 250);
            --popover: oklch(1 0 0);
            --popover-foreground: oklch(0.18 0.03 250);
            --primary: oklch(0.45 0.15 255);
            --primary-foreground: oklch(0.99 0 0);
            --secondary: oklch(0.96 0.01 245);
            --secondary-foreground: oklch(0.25 0.04 255);
            --muted: oklch(0.96 0.01 245);
            --muted-foreground: oklch(0.5 0.02 250);
            --accent: oklch(0.94 0.02 250);
            --accent-foreground: oklch(0.25 0.04 255);
            --destructive: oklch(0.58 0.22 27);
            --destructive-foreground: oklch(0.99 0 0);
            --border: oklch(0.91 0.01 250);
            --input: oklch(0.91 0.01 250);
            --ring: oklch(0.55 0.15 255);
            --sidebar: oklch(0.22 0.06 258);
            --sidebar-foreground: oklch(0.92 0.02 250);
            --sidebar-accent: oklch(0.32 0.08 258);
            --sidebar-accent-foreground: oklch(0.99 0 0);
            --sidebar-border: oklch(0.3 0.06 258);
            --type-delivery: oklch(0.62 0.18 145);
            --type-delivery-foreground: oklch(0.99 0 0);
            --type-pickup: oklch(0.6 0.22 25);
            --type-pickup-foreground: oklch(0.99 0 0);
            --type-swap: oklch(0.55 0.18 250);
            --type-swap-foreground: oklch(0.99 0 0);
            --type-material: oklch(0.78 0.16 85);
            --type-material-foreground: oklch(0.2 0.04 80);
            --status-pending: oklch(0.7 0.02 250);
            --status-assigned: oklch(0.6 0.15 230);
            --status-progress: oklch(0.7 0.16 75);
            --status-done: oklch(0.6 0.16 145);
            --status-cancelled: oklch(0.55 0.05 250);
          }
          body {
            background-color: oklch(0.985 0.005 240);
            color: oklch(0.18 0.03 250);
          }
        `}} />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster richColors position="top-center" />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <Outlet />;
}
