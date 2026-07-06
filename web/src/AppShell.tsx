import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { api, getToken, setToken, type Account, type Health, type Wallet, type WalletAuth } from "./lib/api";
import { AppContext } from "./context";
import { useTheme } from "./lib/theme";
import { Nav } from "./components/Nav";
import { ToastProvider } from "./components/Toast";
import { WalletUnlock } from "./components/WalletUnlock";
import { hasVault, clearVault } from "./lib/vault";

export function AppShell() {
  const [health, setHealth] = useState<Health | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [locked, setLocked] = useState(false);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const h = await api.health();
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
    if (hasVault()) setLocked(true);
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
    setLocked(false);
    setAccount(null);
    setWallet(null);
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
  const restoreAccount = useCallback(
    async (mnemonic: string) => {
      const r = await api.auth.restore(mnemonic);
      commitAuth(r);
      return r.account;
    },
    [commitAuth],
  );

  return (
    <AppContext.Provider
      value={{ health, account, commitAuth, restoreAccount, signIn, signOut, refreshAccount, wallet, setWallet, refreshBalance, connectWallet }}
    >
      <ToastProvider>
        <Nav ai={health?.ai} account={account} wallet={wallet} network={health?.network} theme={theme} onToggleTheme={toggle} />
        {/* pb clears the mobile bottom tab bar; none needed at md+ */}
        <div className="pb-16 md:pb-0">
          <Outlet />
        </div>
        {locked && <WalletUnlock onUnlock={unlockWallet} onForgot={forgotPin} onSkip={skipUnlock} />}
      </ToastProvider>
    </AppContext.Provider>
  );
}
