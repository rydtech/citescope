import { requirePlatformAdmin } from '@/lib/admin-auth';
import Link from 'next/link';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-gray-900 text-white px-6 py-3 flex items-center gap-6">
        <span className="font-bold text-lg">CiteScope Admin</span>
        <Link href="/admin" className="text-sm text-gray-300 hover:text-white">Overview</Link>
        <Link href="/admin/customers" className="text-sm text-gray-300 hover:text-white">Customers</Link>
        <Link href="/admin/audits" className="text-sm text-gray-300 hover:text-white">Audits</Link>
        <Link href="/admin/activity" className="text-sm text-gray-300 hover:text-white">Activity</Link>
        <div className="ml-auto text-xs text-gray-400">Platform Admin</div>
      </nav>
      <main className="flex-1 p-6 bg-gray-50">{children}</main>
    </div>
  );
}
