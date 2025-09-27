"use client";

import React from "react";
import { Web3AuthProvider } from "@web3auth/modal/react";
import { WagmiProvider } from "@web3auth/modal/react/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import web3AuthContextConfig from "./web3AuthContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <Web3AuthProvider config={web3AuthContextConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </Web3AuthProvider>
  );
}


