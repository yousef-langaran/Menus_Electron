import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          dir="rtl"
          className="min-h-screen flex flex-col items-center justify-center bg-default-100 p-8 gap-6"
        >
          <div className="w-16 h-16 rounded-full bg-danger-100 flex items-center justify-center text-3xl">
            ⚠️
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-xl font-bold text-foreground">خطای غیرمنتظره</h1>
            <p className="text-sm text-default-500 max-w-sm">
              مشکلی در بارگذاری این بخش پیش آمد. لطفاً صفحه را مجدداً بارگذاری کنید.
            </p>
            {import.meta.env.DEV && (
              <pre className="mt-4 text-xs text-danger text-right bg-danger-50 rounded-lg p-3 max-w-lg overflow-auto">
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            )}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            بارگذاری مجدد
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
