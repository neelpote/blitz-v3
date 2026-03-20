/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Wallet adapter — lazy import to avoid crashing page if Solana libs fail
import('@solana/wallet-adapter-react-ui/styles.css').catch(() => {});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element to mount to');

// Dynamically load wallet providers so a Solana lib crash doesn't blank the page
async function mountApp() {
  try {
    const { ConnectionProvider, WalletProvider } = await import('@solana/wallet-adapter-react');
    const { WalletModalProvider } = await import('@solana/wallet-adapter-react-ui');
    const { PhantomWalletAdapter, SolflareWalletAdapter } = await import('@solana/wallet-adapter-wallets');
    const { clusterApiUrl } = await import('@solana/web3.js');

    const endpoint = clusterApiUrl('devnet');
    const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

    const Root = () => (
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <App solanaReady={true} />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    );

    ReactDOM.createRoot(rootElement!).render(
      <React.StrictMode><Root /></React.StrictMode>
    );
  } catch (e) {
    // Solana libs failed — render app without wallet context
    console.warn('Solana wallet providers failed to load, running in UI-only mode:', e);
    ReactDOM.createRoot(rootElement!).render(
      <React.StrictMode><App solanaReady={false} /></React.StrictMode>
    );
  }
}

mountApp();
