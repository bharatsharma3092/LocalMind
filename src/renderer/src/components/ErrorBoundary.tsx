import React, { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted">
          <p className="text-lg font-medium text-red-500">Something went wrong</p>
          <p className="text-sm">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })} className="btn-primary">
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
