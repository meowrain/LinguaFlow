'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { membershipAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import {
  ArrowRight,
  Check,
  Clock,
  Crown,
  Loader2,
  ReceiptText,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  MembershipBenefit,
  MembershipInfo,
  MembershipOrder,
  MembershipPlan,
} from '@/types';
import { format } from 'date-fns';

const membershipTypeLabels: Record<string, string> = {
  free: '免费用户',
  monthly: '月度会员',
  yearly: '年度会员',
  lifetime: '终身会员',
};

const orderStatusLabels: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  refunded: '已退款',
};

const planTone: Record<string, string> = {
  monthly: 'border-sky-500/40 bg-sky-500/5',
  yearly: 'border-emerald-500/50 bg-emerald-500/5',
  lifetime: 'border-amber-500/50 bg-amber-500/5',
};

export default function MembershipPage() {
  const router = useRouter();
  const { isAuthenticated, token, updateUser } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [activatingOrder, setActivatingOrder] = useState<string | null>(null);
  const [info, setInfo] = useState<MembershipInfo | null>(null);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [benefits, setBenefits] = useState<MembershipBenefit[]>([]);
  const [orders, setOrders] = useState<MembershipOrder[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadMembership = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [infoRes, plansRes, benefitsRes, ordersRes] = await Promise.all([
        membershipAPI.getInfo(),
        membershipAPI.getPlans(),
        membershipAPI.getBenefits(),
        membershipAPI.getOrders(),
      ]);
      setInfo(infoRes.data);
      setPlans(plansRes.data.plans || []);
      setBenefits(benefitsRes.data.benefits || []);
      setOrders(ordersRes.data.orders || []);
      updateUser({
        is_premium: infoRes.data.is_premium,
        membership_type: infoRes.data.membership_type,
        membership_expiry: infoRes.data.membership_expiry,
      });
    } catch (err: any) {
      setError(err.response?.data?.error || '会员信息加载失败');
    } finally {
      setLoading(false);
    }
  }, [updateUser]);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated || !token) {
      router.replace('/login');
      return;
    }
    loadMembership();
  }, [isAuthenticated, loadMembership, mounted, router, token]);

  const currentPlan = useMemo(
    () => plans.find((plan) => plan.id === info?.membership_type),
    [info?.membership_type, plans]
  );

  const expiryLabel = useMemo(() => {
    if (!info?.is_premium) return '未开通';
    if (info.is_lifetime || info.membership_type === 'lifetime') return '永久有效';
    if (!info.membership_expiry) return '状态待确认';
    return format(new Date(info.membership_expiry), 'yyyy-MM-dd');
  }, [info]);

  const createOrder = async (plan: MembershipPlan) => {
    setBusyPlan(plan.id);
    setError('');
    setNotice('');
    try {
      const response = await membershipAPI.createOrder(plan.id);
      const order = response.data.order as MembershipOrder;
      setOrders((current) => [order, ...current]);
      setNotice(`已创建 ${plan.name} 订单，可在下方完成演示激活。`);
    } catch (err: any) {
      setError(err.response?.data?.error || '创建订单失败');
    } finally {
      setBusyPlan(null);
    }
  };

  const activateOrder = async (orderNo: string) => {
    setActivatingOrder(orderNo);
    setError('');
    setNotice('');
    try {
      const response = await membershipAPI.activateOrder(orderNo);
      const user = response.data.user;
      setInfo({
        is_premium: user.is_premium,
        membership_type: user.membership_type,
        membership_expiry: user.membership_expiry,
        is_lifetime: user.is_lifetime,
      });
      updateUser({
        is_premium: user.is_premium,
        membership_type: user.membership_type,
        membership_expiry: user.membership_expiry,
      });
      setNotice(response.data.message || '会员已激活');
      await loadMembership();
    } catch (err: any) {
      setError(err.response?.data?.error || '激活会员失败');
    } finally {
      setActivatingOrder(null);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900/50 p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-500/15 text-yellow-300">
                <Crown className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500">会员中心</p>
                <h1 className="text-3xl font-black">LinguaFlow Premium</h1>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-gray-400">
              解锁 AI 精读、无限阅读、生词复习和学习追踪，把外刊阅读流程连成完整的学习闭环。
            </p>
          </div>
          <div className="min-w-0 rounded-lg border border-gray-800 bg-gray-950/50 p-5 lg:min-w-[320px]">
            <div className="mb-3 flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500">当前状态</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  info?.is_premium
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'bg-gray-800 text-gray-300'
                }`}
              >
                {membershipTypeLabels[info?.membership_type || 'free']}
              </span>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500">有效期</p>
                <p className="mt-1 text-2xl font-bold">{expiryLabel}</p>
              </div>
              {currentPlan && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">当前套餐</p>
                  <p className="mt-1 font-semibold">{currentPlan.name}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {(notice || error) && (
        <div
          className={`mb-6 rounded-lg border p-4 text-sm ${
            error
              ? 'border-red-500/40 bg-red-500/10 text-red-200'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {error || notice}
        </div>
      )}

      <section className="mb-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-lg border p-6 ${planTone[plan.id] || 'border-gray-800 bg-gray-900/50'}`}
          >
            {plan.recommended && (
              <span className="absolute right-4 top-4 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white">
                推荐
              </span>
            )}
            <div className="mb-5">
              <h2 className="text-xl font-bold">{plan.name}</h2>
              <p className="mt-1 text-sm text-gray-500">{plan.name_en}</p>
            </div>
            <div className="mb-5 flex items-end gap-1">
              <span className="text-4xl font-black">¥{plan.price}</span>
              <span className="pb-1 text-sm text-gray-500">
                {plan.id === 'lifetime' ? '一次性' : `/${plan.duration} 天`}
              </span>
            </div>
            {plan.save_percent > 0 && (
              <p className="mb-5 inline-flex rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                节省 {plan.save_percent}%
              </p>
            )}
            <ul className="mb-6 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2 text-sm text-gray-300">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => createOrder(plan)}
              disabled={busyPlan === plan.id}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-3 text-sm font-bold text-gray-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busyPlan === plan.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {info?.membership_type === plan.id ? '续费当前套餐' : '创建订单'}
            </button>
          </div>
        ))}
      </section>

      <section className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <div className="mb-5 flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-400" />
            <h2 className="text-xl font-bold">权益对比</h2>
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <div className="grid grid-cols-[1fr_92px_92px] bg-gray-950/60 px-4 py-3 text-sm font-semibold text-gray-400">
              <span>功能</span>
              <span className="text-center">免费</span>
              <span className="text-center">会员</span>
            </div>
            {benefits.map((benefit) => (
              <div
                key={benefit.name}
                className="grid grid-cols-[1fr_92px_92px] border-t border-gray-800 px-4 py-4 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{benefit.name}</p>
                  <p className="mt-1 text-xs text-gray-500">{benefit.description}</p>
                </div>
                <div className="flex justify-center">
                  {benefit.for_free ? (
                    <Check className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <span className="text-gray-600">-</span>
                  )}
                </div>
                <div className="flex justify-center">
                  {benefit.for_premium ? (
                    <Check className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <span className="text-gray-600">-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <div className="mb-5 flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-purple-400" />
            <h2 className="text-xl font-bold">最近订单</h2>
          </div>
          {orders.length === 0 ? (
            <div className="rounded-lg bg-gray-950/50 p-6 text-center text-sm text-gray-500">
              暂无会员订单
            </div>
          ) : (
            <div className="space-y-3">
              {orders.slice(0, 6).map((order) => (
                <div key={order.id} className="rounded-lg bg-gray-950/50 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{order.order_no}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {membershipTypeLabels[order.product_type]} · ¥{order.amount}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        order.status === 'paid'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {orderStatusLabels[order.status] || order.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3.5 w-3.5" />
                      {format(new Date(order.created_at), 'yyyy-MM-dd HH:mm')}
                    </span>
                    {order.status === 'pending' && (
                      <button
                        onClick={() => activateOrder(order.order_no)}
                        disabled={activatingOrder === order.order_no}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {activatingOrder === order.order_no ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5" />
                        )}
                        演示激活
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
