import { Component, type ErrorInfo, type ReactNode } from 'react';

type ChartErrorBoundaryProps = {
  children: ReactNode;
  fallbackHeight?: number;
  label?: string;
  resetKey?: string | number;
};

type ChartErrorBoundaryState = {
  hasError: boolean;
};

export class ChartErrorBoundary extends Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  state: ChartErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ChartErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Chart render failed', {
      label: this.props.label,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(prevProps: ChartErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      this.props.resetKey !== undefined &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-muted)] text-sm flex items-center justify-center"
          style={{ height: this.props.fallbackHeight ?? 180 }}
        >
          Chart unavailable right now
        </div>
      );
    }

    return this.props.children;
  }
}
