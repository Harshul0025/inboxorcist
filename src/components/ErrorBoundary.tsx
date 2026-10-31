import { Component, type ReactNode } from 'react';
import { strings } from '../strings';

interface Props {
  children: ReactNode;
  /** Called when the player chooses to recover. */
  onReset?: () => void;
}

interface State {
  failed: boolean;
}

/**
 * Catches render errors so one broken screen never blanks the whole game.
 * Errors are deliberately not logged: they may contain email content.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  private readonly reset = () => {
    this.setState({ failed: false });
    if (this.props.onReset) this.props.onReset();
    else window.location.reload();
  };

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="card mx-auto max-w-lg text-center">
        <h2 className="text-2xl font-bold">{strings.errors.boundaryHeading}</h2>
        <p className="mt-2 text-slate-300">{strings.errors.generic}</p>
        <button type="button" className="btn btn-primary mt-4" onClick={this.reset}>
          {strings.errors.reload}
        </button>
      </section>
    );
  }
}
