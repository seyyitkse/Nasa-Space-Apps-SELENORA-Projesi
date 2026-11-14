import { Orbit } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { EmptyState } from '@/components/shared/States'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <EmptyState
      icon={Orbit}
      title={t('notFound.title')}
      body={t('notFound.body')}
      actions={
        <Button asChild variant="primary">
          <Link to="/">{t('notFound.back')}</Link>
        </Button>
      }
    />
  )
}
