import { Component, type ReactNode } from 'react'
import { isStaleChunk, reloadForUpdate, reportError } from '../lib/errors'
import { Logo } from './Brand'

type Props = { children: ReactNode; /** A smaller notice inside the page area, so the player keeps going. */ inline?: boolean; resetKey?: string }
type State = { error: Error | null }

/** Catches a crash below it, records it, and offers a way back instead of a blank screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    if (isStaleChunk(error) && reloadForUpdate()) return
    error.stack = `${error.stack ?? ''}\n--- component stack ---${info.componentStack ?? ''}`
    reportError(error, this.props.inline ? 'page' : 'app')
  }

  componentDidUpdate(prev: Props) {
    // Moving to another page clears a page crash.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const stale = isStaleChunk(error)
    return (
      <div className={`crash ${this.props.inline ? 'is-inline' : ''}`} role="alert">
        {!this.props.inline && <Logo size={48} />}
        <h1 className="crash-title">{stale ? 'Spindle was updated' : 'This record skipped'}</h1>
        <p className="crash-sub">
          {stale ? 'Reload to get the new version.' : 'Something went wrong showing this. It’s been reported, and reloading usually fixes it.'}
        </p>
        <div className="crash-actions">
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
          {this.props.inline && !stale && (
            <button className="btn btn-ghost" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          )}
        </div>
      </div>
    )
  }
}
