/** 路由懒加载的 Suspense 骨架：模拟常见页面布局（头部色块 + 列表行），满足规格 §5.0 加载态要求 */
export function PageSkeleton() {
  return (
    <div className="h-full flex flex-col bg-surface animate-pulse">
      <div className="bg-header pt-safe">
        <div className="px-4 pt-2 pb-3">
          <div className="h-6 w-24 mx-auto rounded bg-header-fill opacity-40" />
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="h-12 rounded-xl bg-header-fill opacity-40" />
            <div className="h-12 rounded-xl bg-header-fill opacity-40" />
            <div className="h-12 rounded-xl bg-header-fill opacity-40" />
          </div>
        </div>
      </div>
      <div className="flex-1 px-4 py-3 space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-fill" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-fill" />
              <div className="h-2.5 w-1/2 rounded bg-fill" />
            </div>
            <div className="h-3 w-12 rounded bg-fill" />
          </div>
        ))}
      </div>
    </div>
  );
}
