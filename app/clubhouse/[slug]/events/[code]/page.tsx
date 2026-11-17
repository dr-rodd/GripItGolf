import CompOffice from './CompOffice'

/** One competition from the office: its details, Change, and its tee sheet kept in the Clubhouse (Ross, 17 Nov 2026). */
export default async function CompOfficePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <CompOffice code={code.toUpperCase()} />
}
