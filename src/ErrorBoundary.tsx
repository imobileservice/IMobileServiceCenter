import React from 'react'
import { isChunkLoadError, markChunkReloadAttempt, reloadForChunkError } from './lib/chunk-recovery'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  isRecovering: boolean
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, isRecovering: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, isRecovering: false }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)

    if (isChunkLoadError(error) && markChunkReloadAttempt(error)) {
      this.setState({ isRecovering: true })
      reloadForChunkError()
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isRecovering) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-6"></div>
              <h1 className="text-2xl font-bold mb-3 text-foreground">Updating app</h1>
              <p className="text-muted-foreground">
                A new version is available. Reloading the latest files...
              </p>
            </div>
          </div>
        )
      }

      const isChunkError = isChunkLoadError(this.state.error)

      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center p-8">
            <h1 className="text-2xl font-bold mb-4 text-foreground">Something went wrong</h1>
            <p className="text-muted-foreground mb-4">
              {isChunkError
                ? 'The app files changed while this page was open. Reload the page to load the current version.'
                : this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              Reload Page
            </button>
            <details className="mt-4 text-left max-w-2xl">
              <summary className="cursor-pointer text-sm text-muted-foreground">Error Details</summary>
              <pre className="mt-2 p-4 bg-muted rounded text-xs overflow-auto">
                {this.state.error?.stack}
              </pre>
            </details>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
