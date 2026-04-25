import JoinForm from './JoinForm'

export const dynamic = 'force-dynamic'

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams
  return <JoinForm initialCode={code ?? ''} />
}
