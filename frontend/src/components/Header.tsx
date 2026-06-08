'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { authAPI, resolveAPIAssetURL } from '@/lib/api';
import { ChevronDown, Search, User, LogOut, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout, updateUser } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const avatarURL = user?.avatar ? resolveAPIAssetURL(user.avatar) : '';
  const isAdmin = Boolean(user?.is_admin);

  useEffect(() => {
    if (!isAuthenticated || !user || typeof user.is_admin === 'boolean') return;

    authAPI.getProfile()
      .then((response) => {
        updateUser(response.data.data);
      })
      .catch(() => {
        // The global API interceptor handles expired sessions.
      });
  }, [isAuthenticated, updateUser, user]);

  const navItems = [
    { name: '首页', path: '/' },
    { name: '每日学习', path: '/study' },
    { name: '最近更新', path: '/latest' },
    { name: '全部外刊', path: '/journals' },
    { name: '复习', path: '/vocabulary' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm dark:border-gray-800 dark:bg-[#1d1d1d]/95">
      <div className="mx-auto max-w-[1460px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <span className="text-2xl font-black tracking-tight text-gray-950 dark:text-gray-100">GuGuDu</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`relative py-5 text-sm font-bold transition-colors hover:text-gray-950 dark:hover:text-white ${
                  pathname === item.path
                    ? 'text-gray-950 dark:text-white'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                {item.name}
                {pathname === item.path && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gray-950 dark:bg-white" />
                )}
              </Link>
            ))}
            <Link
              href="/more"
              className="flex items-center gap-1 py-5 text-sm font-bold text-gray-600 transition-colors hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
            >
              更多
              <ChevronDown className="h-4 w-4" />
            </Link>
            <span className="h-7 w-px bg-gray-200 dark:bg-gray-700" />
            <Link
              href="/membership"
              className="py-5 text-sm font-bold text-gray-700 transition-colors hover:text-gray-950 dark:text-gray-200 dark:hover:text-white"
            >
              加入会员
            </Link>
          </nav>

          {/* Right section */}
          <div className="flex items-center space-x-4">
            <ThemeToggle />

            {/* Search */}
            <button className="p-2 text-gray-600 transition-colors hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">
              <Search className="w-6 h-6" />
            </button>

            {/* User section */}
            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 p-2 text-gray-700 transition-colors hover:text-gray-950 dark:text-gray-200 dark:hover:text-white"
                >
                  <span className="text-sm hidden sm:inline">
                    Hi, {user.nickname || user.username} 💎
                  </span>
                  {avatarURL ? (
                    <Image
                      src={avatarURL}
                      alt="用户头像"
                      width={28}
                      height={28}
                      unoptimized
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
                    <Link
                      href="/study"
                      className="block px-4 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => setShowUserMenu(false)}
                    >
                      每日学习
                    </Link>
                    <Link
                      href="/profile"
                      className="block px-4 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => setShowUserMenu(false)}
                    >
                      个人中心
                    </Link>
                    <Link
                      href="/membership"
                      className="block px-4 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => setShowUserMenu(false)}
                    >
                      会员中心
                    </Link>
                    <Link
                      href="/subscriptions"
                      className="block px-4 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => setShowUserMenu(false)}
                    >
                      我的订阅
                    </Link>
                    <Link
                      href="/vocabulary"
                      className="block px-4 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => setShowUserMenu(false)}
                    >
                      生词本
                    </Link>
                    <Link
                      href="/history"
                      className="block px-4 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => setShowUserMenu(false)}
                    >
                      阅读历史
                    </Link>
                    {isAdmin && (
                      <Link
                        href="/admin/articles"
                        className="block px-4 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={() => setShowUserMenu(false)}
                      >
                        文章管理
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        logout();
                        setShowUserMenu(false);
                      }}
                      className="flex w-full items-center space-x-2 px-4 py-2 text-left text-sm text-red-500 transition-colors hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-800"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>退出登录</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  href="/login"
                  className="px-3 py-2 text-sm font-bold text-gray-600 transition-colors hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
                >
                  登录
                </Link>
                <Link
                  href="/register"
                  className="rounded-md bg-gray-950 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-950 dark:hover:bg-white"
                >
                  注册
                </Link>
              </div>
            )}

            {/* Mobile menu */}
            <button className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 md:hidden">
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
