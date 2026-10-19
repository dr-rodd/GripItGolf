import { requireAdmin } from '../adminGate'
import AdminLogin from '../AdminLogin'
import AdminShell from '../AdminShell'
import StyleLab from './StyleLab'

export const dynamic = 'force-dynamic'

/**
 * The style lab: other fonts and looks, tried on this phone only.
 *
 * Gated like every admin section, though it reads no data — the controls are
 * a client component that writes a cookie on this device and attributes on
 * <html>, nothing else. lib/styleLab.ts is the registry and the rules.
 */
export const metadata = {
  title: 'Admin — Green Dot Golf',
  robots: { index: false, follow: false, nocache: true },
}

export default async function AdminStylePage() {
  if (!(await requireAdmin())) return <AdminLogin />

  return (
    <AdminShell active="style" subtitle="Changes this phone only. Players never see it.">
      <StyleLab />
    </AdminShell>
  )
}
