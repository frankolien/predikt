import { createContext, useContext } from "react";
import type { Account, Health, Wallet } from "./lib/api";

export interface AppCtx {
  health: Health | null;
  // free-to-play account (points)
  account: Account | null;
  signIn: (handle: string) => Promise<Account>;
  signOut: () => void;
  refreshAccount: () => void;
  // self-custodial USD₮ wallet (WDK) linked to the account
  wallet: Wallet | null;
  setWallet: (w: Wallet | null) => void;
  refreshBalance: () => void;
  connectWallet: () => Promise<Wallet>;
}

export const AppContext = createContext<AppCtx>(null!);
export const useApp = () => useContext(AppContext);
