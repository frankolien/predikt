import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { api, getToken, setToken, type Account, type Health, type Wallet, type WalletAuth } from "./lib/api";
import { AppContext } from "./context";
import { useTheme } from "./lib/theme";
import { Nav } from "./components/Nav";

export function AppShell() {
  const [health, setHealth] = useState<Health | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
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

  // Restore an existing session on load.
  useEffect(() => {
    if (!getToken()) return;
    api.account
      .me()
      .then((r) => {
        setAccount(r.account);
        loadWallet();
      })
      .catch(() => setToken(null));
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
    setAccount(null);
    setWallet(null);
  }, []);

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
      if (r.isNew) pollFunding();
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
      <Nav ai={health?.ai} account={account} theme={theme} onToggleTheme={toggle} />
      <Outlet />
    </AppContext.Provider>
  );
}
