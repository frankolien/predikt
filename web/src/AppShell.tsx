import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { api, aiStatusLocal, streamFixtures, getToken, setToken, getWalletNetwork, setWalletNetwork, type Account, type Health, type Wallet, type WalletAuth } from "./lib/api";
import { ensureNotifyPermission, notify, notifyAvailable } from "./lib/notify";
import { AppContext } from "./context";
import { useTheme } from "./lib/theme";
import { Nav, DesktopSidebar } from "./components/Nav";
import { ToastProvider } from "./components/Toast";
import { WalletUnlock } from "./components/WalletUnlock";
import { DesktopOnboarding } from "./components/DesktopOnboarding";
import { hasVault, clearVault } from "./lib/vault";
import { keychainAvailable, keychainGet, keychainDelete, SEED_KEY } from "./lib/keychain";
import { CLIENT_CUSTODY, signInWallet, setSessionSeed } from "./lib/custody";

// The desktop shell uses a left sidebar (native-app feel); the web uses the top
// bar. Same as the checks in App.tsx / main.tsx.
const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function AppShell() {
  const [health, setHealth] = useState<Health | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [locked, setLocked] = useState(false);
  const [showOnboard, setShowOnboard] = useState(false);
  const [walletNetwork, setWalletNetworkState] = useState<string | null>(() => getWalletNetwork());
  const { theme, toggle } = useTheme();

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const h = await api.health();
        // Desktop: the real on-device model status comes from the local sidecar,
        // not the hosted backend (whose AI is a scripted mock).
        const localAi = await aiStatusLocal();
        if (localAi) h.ai = localAi;
        if (active) setHealth(h);
      } catch {
        /* server warming up */
      }
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Desktop: native goal alerts from the live feed, app-wide (even off the Predict
  // page). Fires a real OS notification when a live fixture's score ticks up.
  useEffect(() => {
    if (!notifyAvailable) return;
    ensureNotifyPermission();
    const prev = new Map<string, number>();
    const stop = streamFixtures((fixtures) => {
      for (const f of fixtures) {
        const goals = (f.result?.homeGoals ?? 0) + (f.result?.awayGoals ?? 0);
        const before = prev.get(f.id);
        prev.set(f.id, goals);
        const live = f.isLive || f.matchStatus === "live";
        if (before !== undefined && goals > before && live) {
          notify("⚽ Goal!", `${f.home.code} ${f.result?.homeGoals ?? 0}–${f.result?.awayGoals ?? 0} ${f.away.code} · ${f.minute ?? ""}'`);
        }
      }
    });
    return stop;
  }, []);

  // Load the account's linked self-custodial USD₮ wallet (WDK), if any.
  const loadWallet = useCallback(() => {
    api.account
      .wallet()
      .then((w) =>
        setWallet(w.address ? { address: w.address, displayName: "You", mnemonic: "", backend: w.backend ?? "wdk", usdtHuman: w.usdtHuman } : null),
      )
      .catch(() => {});
  }, []);

  // Restore an existing session on load. If an encrypted seed is on this device,
  // raise the PIN gate so the signing key can be re-loaded (a reload or a server
  // restart drops the in-memory key — without it, real-USD₮ actions fail). The
  // token restore still runs in the background so points browsing works if the
  // user chooses to skip unlocking.
  useEffect(() => {
    // On desktop the OS keychain is the vault, so the browser PIN gate is web-only.
    if (hasVault() && !keychainAvailable) setLocked(true);
    if (!getToken()) return;
    api.account
      .me()
      .then((r) => {
        setAccount(r.account);
        loadWallet();
        pollFunding();
      })
      .catch(() => setToken(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadWallet]);

  const signIn = useCallback(
    async (handle: string) => {
      const { account, token } = await api.account.create(handle);
      setToken(token);
      setAccount(account);
      loadWallet();
      return account;
    },
    [loadWallet],
  );

  const signOut = useCallback(() => {
    setToken(null);
    clearVault();
    keychainDelete(SEED_KEY); // desktop: forget the seed from the OS keychain too
    setSessionSeed(null); // drop the in-memory signing key
    setLocked(false);
    setAccount(null);
    setWallet(null);
    if (keychainAvailable) setShowOnboard(true); // desktop: back to first-run wizard
  }, []);

  // PIN gate handlers. Unlock decrypts the on-device seed and re-loads the
  // signing key server-side (restore); forgetting the PIN wipes the vault and
  // drops back to phrase recovery; skipping browses with points only.
  const unlockWallet = useCallback(
    async (seed: string) => {
      await restoreAccount(seed);
      setLocked(false);
    },
    // restoreAccount is stable (defined below via useCallback); listed for lint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const forgotPin = useCallback(() => {
    clearVault();
    setToken(null);
    setAccount(null);
    setWallet(null);
    setLocked(false);
  }, []);
  const skipUnlock = useCallback(() => setLocked(false), []);

  const connectWallet = useCallback(async () => {
    const w = await api.account.connectWallet();
    const full: Wallet = { address: w.address, displayName: "You", mnemonic: w.mnemonic ?? "", backend: w.backend, usdtHuman: w.usdtHuman };
    setWallet(full);
    return full;
  }, []);

  const refreshAccount = useCallback(() => {
    if (!getToken()) return;
    api.account
      .me()
      .then((r) => setAccount(r.account))
      .catch(() => {});
  }, []);

  const refreshBalance = useCallback(() => {
    api.account
      .wallet()
      .then((w) => {
        if (w.address)
          setWallet((cur) =>
            cur ? { ...cur, usdtHuman: w.usdtHuman } : { address: w.address!, displayName: "You", mnemonic: "", backend: w.backend ?? "wdk", usdtHuman: w.usdtHuman },
          );
      })
      .catch(() => {});
  }, []);

  // Switch the wallet's active network (Solflare-style). Persist the choice (it
  // becomes an X-Gaffer-Network header on every call), then re-read the balance
  // on the new chain — same self-custodial address, a different USD₮ token.
  const switchWalletNetwork = useCallback(async (key: string | null) => {
    setWalletNetwork(key);
    setWalletNetworkState(key);
    try {
      const w = await api.account.wallet();
      if (w.address)
        setWallet((cur) =>
          cur
            ? { ...cur, usdtHuman: w.usdtHuman }
            : { address: w.address!, displayName: "You", mnemonic: "", backend: w.backend ?? "wdk", usdtHuman: w.usdtHuman },
        );
    } catch {
      /* balance read failed on the new chain — the badge still reflects the switch */
    }
  }, []);

  // A fresh account's demo USD₮ mints on-chain in the background — poll the
  // balance a few times so it lands in the UI without a manual refresh.
  const pollFunding = useCallback(() => {
    let n = 0;
    const id = setInterval(() => {
      refreshBalance();
      if (++n >= 8) clearInterval(id);
    }, 2000);
  }, [refreshBalance]);

  // Commit a wallet-auth result into the live session. For a brand-new account
  // this runs only after the user has saved their recovery phrase; the fresh
  // demo USD₮ is still minting, so poll the balance until it lands.
  const commitAuth = useCallback(
    (r: WalletAuth) => {
      setToken(r.token);
      setAccount(r.account);
      setWallet({
        address: r.wallet.address,
        displayName: "You",
        mnemonic: r.mnemonic ?? "",
        backend: r.wallet.backend,
        usdtHuman: r.wallet.usdtHuman,
      });
      // Poll the balance for both new (minting) and returning accounts — a
      // faucet-chain reset may have just re-topped a returning wallet.
      pollFunding();
    },
    [pollFunding],
  );

  // Sign in / recover an existing account from its recovery phrase (single step).
  // Client-custody: the phrase never leaves the device — we sign a challenge and
  // keep the seed in session memory so this device can sign its own transactions.
  const restoreAccount = useCallback(
    async (mnemonic: string) => {
      const r = CLIENT_CUSTODY ? await signInWallet(mnemonic) : await api.auth.restore(mnemonic);
      commitAuth(r);
      if (CLIENT_CUSTODY) setSessionSeed(mnemonic);
      return r.account;
    },
    [commitAuth],
  );

  // Desktop: the OS keychain is the vault. On launch, if a seed is stored, restore
  // silently (reloads the signing key too); otherwise it's a first run → wizard.
  useEffect(() => {
    if (!keychainAvailable) return;
    (async () => {
      const seed = await keychainGet(SEED_KEY);
      if (seed) {
        try {
          await restoreAccount(seed);
          return;
        } catch {
          /* stale seed — fall through to onboarding */
        }
      }
      if (!getToken()) setShowOnboard(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppContext.Provider
      value={{ health, account, commitAuth, restoreAccount, signIn, signOut, refreshAccount, wallet, setWallet, refreshBalance, connectWallet, walletNetwork, switchWalletNetwork }}
    >
      <ToastProvider>
        {isDesktop ? (
          <>
            <DesktopSidebar ai={health?.ai} account={account} wallet={wallet} network={health?.network} theme={theme} onToggleTheme={toggle} />
            {/* draggable strip over the content, clearing the overlay title bar */}
            <div data-tauri-drag-region className="fixed left-64 right-0 top-0 z-40 h-8" />
            {/* offset for the fixed sidebar; clear the title bar (no top bar of our own) */}
            <div className="pl-64 [&>main]:!pt-12">
              <Outlet />
            </div>
          </>
        ) : (
          <>
            <Nav ai={health?.ai} account={account} wallet={wallet} network={health?.network} theme={theme} onToggleTheme={toggle} />
            {/* pb clears the mobile bottom tab bar; none needed at md+ */}
            <div className="pb-16 md:pb-0">
              <Outlet />
            </div>
          </>
        )}
        {locked && <WalletUnlock onUnlock={unlockWallet} onForgot={forgotPin} onSkip={skipUnlock} />}
        {showOnboard && <DesktopOnboarding onClose={() => setShowOnboard(false)} />}
      </ToastProvider>
    </AppContext.Provider>
  );
}
