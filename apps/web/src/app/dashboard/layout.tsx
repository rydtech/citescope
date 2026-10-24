import { requireAuth } from '@/lib/auth';
import Link from 'next/link';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <Link href="/dashboard" className="font-bold text-lg text-brand-700">CiteScope</Link>
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">Dashboard</Link>
        <div className="ml-auto">
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">Sign out</button>
          </form>
        </div>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
