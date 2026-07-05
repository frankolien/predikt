import { createContext, useContext } from "react";
import type { Account, Health, Wallet, WalletAuth } from "./lib/api";

export interface AppCtx {
  health: Health | null;
  // free-to-play account (points)
  account: Account | null;
  // wallet-as-identity: your recovery phrase is your login + recovery.
  // Sign-up is a two-step commit (create → save phrase → commit) so the phrase
  // is shown before the session goes live; restore is a single step.
  commitAuth: (auth: WalletAuth) => void;
  restoreAccount: (mnemonic: string) => Promise<Account>;
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
