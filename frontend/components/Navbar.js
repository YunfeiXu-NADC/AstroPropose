'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AdjustmentsHorizontalIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  BoltIcon,
  ClipboardDocumentCheckIcon,
  CpuChipIcon,
  DocumentTextIcon,
  FolderOpenIcon,
  HomeIcon,
  MoonIcon,
  ShieldCheckIcon,
  SignalIcon,
  TagIcon,
  UserCircleIcon,
  UsersIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { getCurrentUser } from '@/lib/api';
import { getWorkspaceEntriesForRoles } from '@/lib/navigationPolicy.mjs';

const workspaceIcons = {
  research: FolderOpenIcon,
  opportunity: BoltIcon,
  reviews: ClipboardDocumentCheckIcon,
  feedback: SignalIcon,
};

const adminItems = [
  { href: '/admin/proposals', label: '全部提案', icon: FolderOpenIcon },
  { href: '/admin/workflows', label: '流程管理', icon: AdjustmentsHorizontalIcon },
  { href: '/admin/users', label: '用户', icon: UsersIcon },
  { href: '/admin/roles', label: '角色', icon: ShieldCheckIcon },
  { href: '/admin/instruments', label: '仪器', icon: CpuChipIcon },
  { href: '/admin/forms', label: '表单', icon: DocumentTextIcon },
  { href: '/admin/proposal-types', label: '提案类型', icon: TagIcon },
  { href: '/admin/external-tools', label: '外部工具', icon: WrenchScrewdriverIcon },
];

function SidebarContent({ isLoggedIn, roles, onLogout, onNavigate }) {
  const pathname = usePathname();
  const visibleItems = getWorkspaceEntriesForRoles(roles);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 py-6">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10">
            <MoonIcon className="h-6 w-6 text-[#9fb7c1]" />
          </span>
          <span>
            <span className="block text-[15px] font-semibold tracking-wide text-white">鸿蒙计划</span>
            <span className="mt-0.5 block text-[10px] tracking-[0.2em] text-slate-400">提案评审系统</span>
          </span>
        </Link>
      </div>

      <nav aria-label="主导航" className="flex-1 overflow-y-auto px-3 py-5">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">工作区</p>
        <div className="space-y-1">
          {isLoggedIn && (
            <Link
              href="/"
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                pathname === '/' || pathname === '/dashboard'
                  ? 'bg-white/10 text-white shadow-inner shadow-white/5'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <HomeIcon className={`h-5 w-5 ${pathname === '/' || pathname === '/dashboard' ? 'text-[#9fb7c1]' : ''}`} />
              我的工作台
            </Link>
          )}
          {visibleItems.map((item) => {
            const Icon = workspaceIcons[item.key];
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                  active ? 'bg-white/10 text-white shadow-inner shadow-white/5' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-[#9fb7c1]' : ''}`} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {roles.includes('Admin') && (
          <div className="mt-7 border-t border-white/10 pt-5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">管理区</p>
            <div className="space-y-1">
              {adminItems.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                      active ? 'bg-white/10 text-white shadow-inner shadow-white/5' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'text-[#9fb7c1]' : ''}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        {isLoggedIn ? (
          <div className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
            <UserCircleIcon className="h-8 w-8 shrink-0 text-slate-400" />
            <Link href="/change-password" onClick={onNavigate} className="min-w-0 flex-1 text-xs text-slate-300 hover:text-white">
              账户与密码
            </Link>
            <button onClick={onLogout} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="退出登录">
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <Link href="/login" onClick={onNavigate} className="flex items-center justify-center rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-900">
            登录系统
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Navbar() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [roles, setRoles] = useState([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      setIsLoggedIn(Boolean(token));
      if (!token) {
        setRoles([]);
        return;
      }
      try {
        const me = await getCurrentUser();
        setRoles(me.roles || []);
      } catch (error) {
        console.error('Failed to get user data:', error);
        localStorage.removeItem('token');
        setIsLoggedIn(false);
        setRoles([]);
      }
    };

    checkAuth();
    window.addEventListener('auth-change', checkAuth);
    return () => window.removeEventListener('auth-change', checkAuth);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setRoles([]);
    setMobileOpen(false);
    window.dispatchEvent(new Event('auth-change'));
    router.push('/login');
  };

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[212px] bg-[#07111f] lg:block">
        <SidebarContent isLoggedIn={isLoggedIn} roles={roles} onLogout={handleLogout} />
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <MoonIcon className="h-6 w-6 text-[#3347b8]" />
          鸿蒙计划 RPS
        </Link>
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg border border-slate-200 p-2 text-slate-700" aria-label="打开导航">
          <Bars3Icon className="h-6 w-6" />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/55" onClick={() => setMobileOpen(false)} aria-label="关闭导航遮罩" />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-[#07111f] shadow-2xl">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="关闭导航">
              <XMarkIcon className="h-5 w-5" />
            </button>
            <SidebarContent isLoggedIn={isLoggedIn} roles={roles} onLogout={handleLogout} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
