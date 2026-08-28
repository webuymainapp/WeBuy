import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingBag,
  Loader2,
  AlertCircle,
  Trash2,
  Plus,
  Lock,
  CheckCircle2,
  X,
  Sparkles,
  Package,
} from 'lucide-react';
import {
  secretApi,
  repApi,
  ApiError,
  type SecretProduct,
  type SecretPurchase,
} from '../lib/api';
import type { PortalUser } from '../types';
import { soundEffects } from '../utils/audio';

interface SecretMarketplaceProps {
  open: boolean;
  onClose: () => void;
  isChief: boolean;
  onToast: (msg: string) => void;
}

export const SecretMarketplace: React.FC<SecretMarketplaceProps> = ({
  open,
  onClose,
  isChief,
  onToast,
}) => {
  const [products, setProducts] = useState<SecretProduct[]>([]);
  const [purchases, setPurchases] = useState<SecretPurchase[]>([]);
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  // Chief-only product management
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [toggleUserId, setToggleUserId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await secretApi.products();
      setProducts(p.products);
      setPoints(p.points);
      setPurchases(await (await secretApi.purchases()).purchases);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load secret marketplace');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      if (isChief && !usersLoaded) {
        repApi
          .getUsers()
          .then(setUsers)
          .catch(() => undefined)
          .finally(() => setUsersLoaded(true));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isChief]);

  const buy = async (p: SecretProduct) => {
    if (buyingId) return;
    setBuyingId(p.id);
    setError(null);
    try {
      const res = await secretApi.buy(p.id);
      soundEffects.playSuccessChime();
      setPoints(res.points);
      onToast(`You bought "${p.name}".`);
      await load();
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Could not buy item');
    } finally {
      setBuyingId(null);
    }
  };

  const toggleAccess = async (u: PortalUser) => {
    if (toggleUserId || u.role === 'chief_admin') return;
    setToggleUserId(u.id);
    try {
      await repApi.setSecretAccess(u.id, !u.marketAccess);
      soundEffects.playSuccessChime();
      onToast(
        u.marketAccess
          ? `Secret access removed from ${u.fullName}.`
          : `Secret access granted to ${u.fullName}.`,
      );
      setUsers(await repApi.getUsers());
    } catch (err) {
      soundEffects.playError();
      onToast(err instanceof ApiError ? err.message : 'Could not update access');
    } finally {
      setToggleUserId(null);
    }
  };

  const createProduct = async () => {
    const name = newName.trim();
    const price = Number(newPrice);
    if (!name || !Number.isFinite(price) || price < 0) return;
    setAdding(true);
    try {
      await secretApi.createProduct({ name, price });
      soundEffects.playSuccessChime();
      onToast('Secret item added.');
      setNewName('');
      setNewPrice('');
      await load();
    } catch (err) {
      soundEffects.playError();
      onToast(err instanceof ApiError ? err.message : 'Could not add item');
    } finally {
      setAdding(false);
    }
  };

  const deleteProduct = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await secretApi.deleteProduct(id);
      soundEffects.playSuccessChime();
      onToast('Secret item removed.');
      await load();
    } catch (err) {
      soundEffects.playError();
      onToast(err instanceof ApiError ? err.message : 'Could not remove item');
    } finally {
      setDeletingId(null);
    }
  };

  const boughtIds = new Set(purchases.map((p) => p.productId));

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-xs"
          />
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative w-full max-w-md bg-slate-100 dark:bg-black rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-800 overflow-hidden max-h-[88dvh] flex flex-col"
          >
            {/* Header */}
            <div className="p-4 sm:p-5 bg-slate-900 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-white leading-tight">Secret Marketplace</h3>
                  <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    Hidden store · {points} pts
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Chief: manage products */}
              {isChief && (
                <div className="space-y-3">
                  <div className="bg-white dark:bg-neutral-900 rounded-2xl p-3.5 border border-slate-200 dark:border-neutral-700">
                    <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-indigo-500" /> Add a secret item
                    </h4>
                    <div className="flex gap-2">
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Item name"
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 focus:outline-indigo-600"
                      />
                      <input
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="Price"
                        inputMode="numeric"
                        className="w-20 px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 focus:outline-indigo-600"
                      />
                      <button
                        onClick={createProduct}
                        disabled={adding || !newName.trim() || !Number.isFinite(Number(newPrice))}
                        className="shrink-0 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer"
                      >
                        {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
                      </button>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-neutral-900 rounded-2xl p-3.5 border border-slate-200 dark:border-neutral-700">
                    <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-indigo-500" /> Grant access to accounts
                    </h4>
                    {users.length === 0 ? (
                      <p className="text-xs text-slate-400">Loading accounts…</p>
                    ) : (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {users
                          .filter((u) => u.role !== 'chief_admin')
                          .map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center justify-between gap-2 py-1"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{u.fullName}</p>
                                <p className="text-[10px] font-mono text-slate-400 truncate">{u.regNo}</p>
                              </div>
                              <button
                                onClick={() => toggleAccess(u)}
                                disabled={toggleUserId === u.id}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-60 ${
                                  u.marketAccess
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {toggleUserId === u.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : u.marketAccess ? (
                                  'Revoke'
                                ) : (
                                  'Grant'
                                )}
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Catalogue */}
              {loading ? (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-xs font-semibold">Opening hidden store…</span>
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-10 bg-white dark:bg-neutral-900 rounded-2xl border border-dashed border-slate-200 dark:border-neutral-700 p-4">
                  <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                  <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">Nothing here yet</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Only you can see this store.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {products.map((p) => {
                    const owned = boughtIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className="p-3.5 rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                            <ShoppingBag className="w-5 h-5 text-indigo-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{p.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{p.price} pts</p>
                          </div>
                        </div>
                        {isChief ? (
                          <button
                            onClick={() => deleteProduct(p.id)}
                            disabled={deletingId === p.id}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          >
                            {deletingId === p.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : owned ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Owned
                          </span>
                        ) : (
                          <button
                            onClick={() => buy(p)}
                            disabled={buyingId === p.id || points < p.price}
                            className="shrink-0 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer"
                          >
                            {buyingId === p.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              `Buy · ${p.price} pts`
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* My secret items */}
              {!isChief && purchases.length > 0 && (
                <div className="bg-white dark:bg-neutral-900 rounded-2xl p-3.5 border border-slate-200 dark:border-neutral-700">
                  <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-2">My secret items</h4>
                  <div className="space-y-1.5">
                    {purchases.map((pu) => (
                      <div key={pu.id} className="flex items-center justify-between gap-2 py-1">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{pu.name}</p>
                          <p className="text-[10px] text-slate-400">Paid {pu.price} pts</p>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
