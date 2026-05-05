// 这个文件用于测试 Tailwind 是否正确扫描类名
// 包含所有常用的工具类，确保它们被编译进 CSS

export function TailwindTest() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold">Test</h1>
        <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md">
          Button
        </button>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card p-4 rounded-lg shadow">Card</div>
        </div>
      </div>
    </div>
  );
}
