import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20 px-8 text-center">
          <p className="text-base font-medium mb-2">页面出错了</p>
          <p className="text-xs text-gray-400 mb-6 break-all">{String(this.state.error.message)}</p>
          <button className="px-6 h-10 rounded-full bg-primary text-gray-900 text-sm font-medium" onClick={() => location.reload()}>
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
