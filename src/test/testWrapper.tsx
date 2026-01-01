import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Create a fresh QueryClient for each test
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface TestWrapperProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
  initialEntries?: string[];
}

/**
 * Test wrapper with QueryClient and MemoryRouter
 */
export function TestWrapper({
  children,
  queryClient,
  initialEntries = ["/"],
}: TestWrapperProps) {
  const client = queryClient || createTestQueryClient();

  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * Create a wrapper function for renderHook
 */
export function createHookWrapper(options?: {
  queryClient?: QueryClient;
  initialEntries?: string[];
}) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <TestWrapper
        queryClient={options?.queryClient}
        initialEntries={options?.initialEntries}
      >
        {children}
      </TestWrapper>
    );
  };
}
