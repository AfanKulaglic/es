"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createAuthSupabaseClient } from "@/app/lib/supabase-auth";
import { buildSsoRedirectUrl, SSO_EXCHANGE_ENDPOINT } from "@/app/lib/sso";
import { persistSarayaAccount, readSarayaAccount } from "@/app/lib/saraya-account";

function safeRandomId(): string {
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    return (crypto as any).randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const STATE_KEY = "saraya_sso_state";
const ATTEMPT_KEY = "saraya_sso_attempt";

async function exchangeCode(code: string, expectedState: string | null) {
  const response = await fetch(SSO_EXCHANGE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error("SSO exchange failed");
  }

  const data = await response.json();
  return data;
}

export function SsoBootstrapper({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createAuthSupabaseClient(), []);
  // Always start as `false` to keep SSR and the first client render in sync.
  // The bootstrap effect below will flip this to `true` after mount based on
  // sessionStorage / session / SSO redirect — same behavior as before, just
  // hydration-safe.
  const [ready, setReady] = useState(false);

  const cleanUrlParams = (paramsToRemove: string[]) => {
    const url = new URL(window.location.href);
    paramsToRemove.forEach(param => url.searchParams.delete(param));
    window.history.replaceState({}, "", url.pathname + (url.search || ""));
  };

  useEffect(() => {
    let cancelled = false;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    const hydrateSarayaAccount = async (
      accessToken?: string,
      options: { force?: boolean } = {}
    ) => {
      if (!accessToken) return;
      
      const existingAccount = readSarayaAccount();
      if (!options.force && existingAccount) {
        return; // Already have account data
      }

      try {
        const response = await fetch('/api/auth/me', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        });

        if (!response.ok) {
          console.warn('Failed to refresh Saraya account profile');
          return;
        }

        const payload = await response.json();
        if (payload?.account) {
          persistSarayaAccount(payload.account);
        }
      } catch (error) {
        console.warn('Unable to hydrate Saraya account', error);
      }
    };

    // Subscribe to realtime account changes
    const subscribeToAccountChanges = async (accountId: string) => {
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('[SsoBootstrapper] No session, skipping realtime subscription');
        return;
      }

      realtimeChannel = supabase
        .channel(`account-updates-${accountId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'accounts',
            filter: `id=eq.${accountId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            const existing = readSarayaAccount();
            if (existing && payload.new) {
              persistSarayaAccount({
                ...existing,
                name: (payload.new.name as string) || existing.name,
                avatar_url: payload.new.avatar_url as string | null,
                status: (payload.new.status as string) || existing.status,
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'coin_wallets',
            filter: `account_id=eq.${accountId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            const existing = readSarayaAccount();
            if (existing && payload.new) {
              persistSarayaAccount({
                ...existing,
                coins: (payload.new.coins_balance as number) ?? existing.coins,
                tokens: (payload.new.tokens_balance as number) ?? existing.tokens,
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'xp_profiles',
            filter: `account_id=eq.${accountId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            const existing = readSarayaAccount();
            if (existing && payload.new) {
              persistSarayaAccount({
                ...existing,
                xp: (payload.new.xp_total as number) ?? existing.xp,
                level: (payload.new.level as number) ?? existing.level,
              });
            }
          }
        )
        .subscribe();
    };

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const returnedState = searchParams.get("state");
      const expectedState = sessionStorage.getItem(STATE_KEY);

      // Handle SSO error (e.g., login_required means no session on central auth)
      if (error) {
        sessionStorage.removeItem(STATE_KEY);
        sessionStorage.setItem(ATTEMPT_KEY, "1"); // Prevent retry loop
        
        cleanUrlParams(["error", "state"]);
        setReady(true);
        return;
      }

      if (code) {
        try {
          if (expectedState && returnedState && expectedState !== returnedState) {
            throw new Error("State mismatch");
          }

          const payload = await exchangeCode(code, expectedState);
          await supabase.auth.setSession({
            access_token: payload.session.access_token,
            refresh_token: payload.session.refresh_token,
          });

          if (payload.account) {
            persistSarayaAccount(payload.account);
            await subscribeToAccountChanges(payload.account.id);
          } else {
            await hydrateSarayaAccount(payload.session?.access_token, { force: true });
            const account = readSarayaAccount();
            if (account?.id) {
              await subscribeToAccountChanges(account.id);
            }
          }

          sessionStorage.removeItem(STATE_KEY);
          sessionStorage.removeItem(ATTEMPT_KEY);

          cleanUrlParams(["code", "state"]);
          setReady(true);
        } catch (error) {
          console.warn("SSO exchange failed", error);
          sessionStorage.removeItem(STATE_KEY);
          sessionStorage.removeItem(ATTEMPT_KEY);
          setReady(true);
        }
        return;
      }

      if (data.session) {
        await hydrateSarayaAccount(data.session.access_token, { force: !readSarayaAccount() });
        const account = readSarayaAccount();
        if (account?.id) {
          await subscribeToAccountChanges(account.id);
        }
        sessionStorage.removeItem(STATE_KEY);
        sessionStorage.removeItem(ATTEMPT_KEY);
        setReady(true);
        return;
      }

      if (sessionStorage.getItem(ATTEMPT_KEY)) {
        setReady(true);
        return;
      }

      const state = safeRandomId();
      sessionStorage.setItem(STATE_KEY, state);
      sessionStorage.setItem(ATTEMPT_KEY, "1");

      const redirectUrl = buildSsoRedirectUrl(window.location.href, state);
      window.location.href = redirectUrl;
    }

    bootstrap();

    return () => {
      cancelled = true;
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [searchParams, supabase]);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
