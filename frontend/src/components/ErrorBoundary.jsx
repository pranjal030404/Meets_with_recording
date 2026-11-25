import { Component } from 'react'

/** Keeps one broken screen from blanking the whole app: shows the error and a way back. */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('UI crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen bg-dark-100 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-dark-200/70 p-6 text-center">
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-400 mb-4">This screen hit an unexpected error. Your data is safe.</p>
          <pre className="text-left text-xs text-red-300 bg-black/30 rounded-xl p-3 mb-5 overflow-auto max-h-32 whitespace-pre-wrap">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="flex gap-3">
            <button onClick={() => window.location.reload()} className="btn btn-primary flex-1">Reload</button>
            <button onClick={() => { window.location.href = '/app' }} className="btn btn-secondary flex-1">Go home</button>
          </div>
        </div>
      </div>
    )
  }
}
