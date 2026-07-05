import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { api, getToken, setToken, type Account, type Health, type Wallet } from "./lib/api";
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

  return (
    <AppContext.Provider
      value={{ health, account, signIn, signOut, refreshAccount, wallet, setWallet, refreshBalance, connectWallet }}
    >
      <Nav ai={health?.ai} account={account} theme={theme} onToggleTheme={toggle} />
      <Outlet />
    </AppContext.Provider>
  );
}
