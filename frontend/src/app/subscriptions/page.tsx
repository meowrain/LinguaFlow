'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ArticleCard from '@/components/ArticleCard';
import { subscriptionAPI, favoriteFolderAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { FavoriteFolder, Subscription } from '@/types';
import {
  Loader2,
  Plus,
  Bookmark,
  Pencil,
  Trash2,
  X,
  MoreVertical,
} from 'lucide-react';

const ICON_OPTIONS = [
  '⭐', '📁', '💻', '📖', '🔬', '🎨', '🎵', '🌍',
  '💡', '🏆', '📚', '🧠', '❤️', '🔥', '✨', '📝',
];

export default function SubscriptionsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuthStore();

  const [folders, setFolders] = useState<FavoriteFolder[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    folder: FavoriteFolder;
  } | null>(null);
  const [editModal, setEditModal] = useState<{
    mode: 'create' | 'edit';
    folder?: FavoriteFolder;
  } | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('📁');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<FavoriteFolder | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [folderRes, subRes] = await Promise.all([
        favoriteFolderAPI.getFolders(),
        subscriptionAPI.getSubscriptions(),
      ]);
      setFolders(folderRes.data.data || []);
      setSubscriptions(subRes.data.data || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated || !token) {
      router.replace('/login');
      return;
    }
    fetchData();
  }, [isAuthenticated, mounted, router, token, fetchData]);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  useEffect(() => {
    if (editModal && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editModal]);

  const totalArticleCount = subscriptions.length;

  const filteredArticles = selectedFolderId === null
    ? subscriptions
    : subscriptions.filter((s) => s.folder_id === selectedFolderId);

  const handleContextMenu = (e: React.MouseEvent, folder: FavoriteFolder) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, folder });
  };

  const handleCreateFolder = () => {
    setEditModal({ mode: 'create' });
    setEditName('');
    setEditIcon('📁');
  };

  const handleEditFolder = (folder: FavoriteFolder) => {
    setContextMenu(null);
    setEditModal({ mode: 'edit', folder });
    setEditName(folder.name);
    setEditIcon(folder.icon || '📁');
  };

  const handleSaveFolder = async () => {
    if (!editName.trim() || saving) return;
    setSaving(true);
    try {
      if (editModal?.mode === 'create') {
        await favoriteFolderAPI.createFolder(editName.trim(), editIcon);
      } else if (editModal?.folder) {
        await favoriteFolderAPI.updateFolder(editModal.folder.id, {
          name: editName.trim(),
          icon: editIcon,
        });
      }
      setEditModal(null);
      await fetchData();
    } catch (err) {
      console.error('Failed to save folder:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFolder = async (folder: FavoriteFolder) => {
    setContextMenu(null);
    if (folder.is_default) return;
    setDeleteConfirm(folder);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await favoriteFolderAPI.deleteFolder(deleteConfirm.id);
      if (selectedFolderId === deleteConfirm.id) {
        setSelectedFolderId(null);
      }
      setDeleteConfirm(null);
      await fetchData();
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  };

  const getFolderCount = (folderId: number) =>
    subscriptions.filter((s) => s.folder_id === folderId).length;

  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-black">我的收藏</h1>
        <button
          onClick={handleCreateFolder}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          新建
        </button>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <aside className="w-56 shrink-0">
          <div className="rounded-lg border border-gray-800 bg-gray-900/40 overflow-hidden">
            <button
              onClick={() => setSelectedFolderId(null)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                selectedFolderId === null
                  ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-500'
                  : 'text-gray-300 hover:bg-gray-800/60 border-l-2 border-transparent'
              }`}
            >
              <Bookmark className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">全部</span>
              <span className="text-xs text-gray-500">{totalArticleCount}</span>
            </button>

            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setSelectedFolderId(folder.id)}
                onContextMenu={(e) => handleContextMenu(e, folder)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors group ${
                  selectedFolderId === folder.id
                    ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-500'
                    : 'text-gray-300 hover:bg-gray-800/60 border-l-2 border-transparent'
                }`}
              >
                <span className="shrink-0 text-base leading-none">
                  {folder.icon || '📁'}
                </span>
                <span className="flex-1 truncate">{folder.name}</span>
                <span className="text-xs text-gray-500">
                  {getFolderCount(folder.id)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e, folder);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-700"
                >
                  <MoreVertical className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </button>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {filteredArticles.length === 0 ? (
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-10 text-center text-gray-500">
              {selectedFolderId === null
                ? '还没有收藏文章。打开文章详情页，点击"收藏"即可添加。'
                : '该收藏夹中还没有文章。'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredArticles.map((subscription) =>
                subscription.article ? (
                  <ArticleCard
                    key={subscription.id}
                    article={subscription.article}
                  />
                ) : null
              )}
            </div>
          )}
        </main>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[140px] rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleEditFolder(contextMenu.folder)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            编辑
          </button>
          {!contextMenu.folder.is_default && (
            <button
              onClick={() => handleDeleteFolder(contextMenu.folder)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-gray-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editModal.mode === 'create' ? '新建收藏夹' : '编辑收藏夹'}
              </h2>
              <button
                onClick={() => setEditModal(null)}
                className="rounded p-1 text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mb-1 block text-sm text-gray-400">名称</label>
            <input
              ref={editInputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveFolder()}
              placeholder="收藏夹名称"
              maxLength={30}
              className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
            />

            <label className="mb-2 block text-sm text-gray-400">图标</label>
            <div className="mb-6 grid grid-cols-8 gap-2">
              {ICON_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setEditIcon(icon)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-colors ${
                    editIcon === icon
                      ? 'bg-blue-600/30 ring-1 ring-blue-500'
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditModal(null)}
                className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveFolder}
                disabled={!editName.trim() || saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-semibold text-white">
              删除收藏夹
            </h2>
            <p className="mb-6 text-sm text-gray-400">
              确定要删除「{deleteConfirm.name}」吗？夹中的文章不会被删除，将移入默认收藏夹。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
