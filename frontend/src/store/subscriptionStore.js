import { create } from 'zustand'
import api from '../lib/api'

export const useSubscriptionStore = create((set) => ({
  plans: [],
  subscription: null,
  plan: null,
  usage: null,
  payments: [],
  isLoading: false,
  isLoadingPlans: false,
  error: null,

  fetchPlans: async () => {
    set({ isLoadingPlans: true })
    try {
      const response = await api.get('/subscriptions/plans')
      set({ plans: response.data.data.plans, isLoadingPlans: false })
      return { success: true }
    } catch (error) {
      set({ isLoadingPlans: false })
      return { success: false, message: error.response?.data?.message || 'Could not load plans' }
    }
  },

  fetchSubscription: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get('/subscriptions/me')
      const { subscription, plan, usage } = response.data.data
      set({ subscription, plan, usage, isLoading: false })
      return { success: true }
    } catch (error) {
      set({ isLoading: false, error: error.response?.data?.message || 'Could not load subscription' })
      return { success: false }
    }
  },

  fetchPayments: async () => {
    try {
      const response = await api.get('/subscriptions/payments')
      set({ payments: response.data.data.payments })
      return { success: true }
    } catch (error) {
      return { success: false, message: error.response?.data?.message }
    }
  },

  subscribe: async (planSlug, billingInterval = 'monthly') => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/subscriptions/subscribe', { planSlug, billingInterval })
      const { subscription, plan, usage } = response.data.data
      set({ subscription, plan, usage, isLoading: false })
      return { success: true, message: response.data.message }
    } catch (error) {
      const message = error.response?.data?.message || 'Subscribe failed'
      set({ isLoading: false, error: message })
      return { success: false, message }
    }
  },

  cancel: async () => {
    set({ isLoading: true })
    try {
      const response = await api.post('/subscriptions/cancel')
      set({ subscription: response.data.data.subscription, isLoading: false })
      return { success: true, message: response.data.message }
    } catch (error) {
      const message = error.response?.data?.message || 'Cancel failed'
      set({ isLoading: false })
      return { success: false, message }
    }
  },

  resume: async () => {
    set({ isLoading: true })
    try {
      const response = await api.post('/subscriptions/resume')
      set({ subscription: response.data.data.subscription, isLoading: false })
      return { success: true, message: response.data.message }
    } catch (error) {
      const message = error.response?.data?.message || 'Resume failed'
      set({ isLoading: false })
      return { success: false, message }
    }
  },

  clearError: () => set({ error: null })
}))
