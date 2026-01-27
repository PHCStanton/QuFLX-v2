import { create } from 'zustand';
import { withQuFLXPersist, QFLX_PERSIST_KEYS } from './persistMiddleware';

const useUserStore = create(
    withQuFLXPersist(
        QFLX_PERSIST_KEYS.user,
        1,
        {
            partialize: (state) => ({ user: state.user }),
        }
    )((set) => ({
        user: {
            id: 'u-001',
            name: 'QuFLX Trader',
            email: 'trader@quflx.ai',
            avatar: null,
            tier: 'Professional',
            joinedAt: new Date().toISOString(),
            apiKey: '***********',
            preferences: {
                notifEmails: true,
                notifPush: false,
                twoFactorEnabled: false
            }
        },
        updateUser: (patch) =>
            set((state) => ({
                user: { ...state.user, ...patch }
            })),
        updatePreferences: (patch) =>
            set((state) => ({
                user: {
                    ...state.user,
                    preferences: { ...state.user.preferences, ...patch }
                }
            })),
    }))
);

export default useUserStore;
