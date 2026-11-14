import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  resetKey?: unknown
}
interface State {
  error: Error | null
}

function Fallback({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="sel-card mx-auto my-16 max-w-md p-8 text-center">
      <h2 className="font-display text-lg font-semibold">{t('errors.boundaryTitle')}</h2>
      <p className="mt-2 text-sm text-fg-2">{t('errors.boundaryBody')}</p>
      <Button className="mt-6" variant="primary" onClick={onReset}>
        {t('errors.reload')}
      </Button>
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SELENORA] view crashed', error, info.componentStack)
  }

  override componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  override render() {
    if (this.state.error) return <Fallback onReset={() => this.setState({ error: null })} />
    return this.props.children
  }
}
