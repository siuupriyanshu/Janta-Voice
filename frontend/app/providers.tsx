"use client";

import { Buffer } from "buffer";
import { useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { RPC_URL } from "./lib/constants";

// web3.js expects a global Buffer in the browser.
if (typeof window !== "undefined") {
  (window as unknown as { Buffer?: typeof Buffer }).Buffer =
    (window as unknown as { Buffer?: typeof Buffer }).Buffer || Buffer;
}

// The wallet button touches `window`; load it client-only to avoid hydration issues.
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

export function Providers({ children }: { children: React.ReactNode }) {
  // Empty wallets array: Phantom (and other Wallet-Standard wallets) are auto-detected.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <header className="header">
            <Link href="/" className="brand">
              🗳️ Janta Voice
            </Link>
            <nav className="nav">
              <Link href="/">Report</Link>
              <Link href="/dashboard">Dashboard</Link>
              <WalletMultiButton />
            </nav>
          </header>
          <main className="main">{children}</main>
          <footer className="footer">
            Devnet prototype · a complementary layer to{" "}
            <a href="https://janamat.app/" target="_blank" rel="noreferrer">
              Janamat
            </a>
          </footer>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
