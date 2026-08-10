import { redirect } from 'next/navigation'

// /admin is an address people remember; /admin/trips is the landing section.
export default function AdminIndex() {
  redirect('/admin/trips')
}
