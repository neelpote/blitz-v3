import React, { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey } from '@solana/web3.js';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { Provider } from '@coral-xyz/anchor';

require('@solana/wallet-adapter-react-ui/styles.css');

interface WalletProps { app: ReactNode; }

export class SimpleProvider implements Provider {
  readonly connection: Connection;
  readonly publicKey?: PublicKey;
  constructor(connection: Connection, publicKey?: PublicKey) {
    this.connection = connection;
    this.publicKey  = publicKey;
  }
}

export const Wallet: FC<WalletProps> = ({ app }) => {
  // api.devnet.solana.com — most reliable for tx inclusion on devnet.
  // MagicBlock ER router is used separately inside useAlphaVault for ER txs.
  const endpoint = process.env.REACT_APP_PROVIDER_ENDPOINT
    || 'https://api.devnet.solana.com';

  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {app}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
