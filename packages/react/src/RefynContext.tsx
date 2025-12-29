/**
 * RefynContext - React Context for sharing Pipeline across components
 */

import { createPipeline, type Pipeline, type PipelineConfig } from '@refyn/core';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface RefynContextValue {
  /** The shared pipeline instance */
  pipeline: Pipeline;
  /** Whether pipeline is initialized */
  isReady: boolean;
  /** Pool status */
  poolStatus: {
    total: number;
    healthy: number;
    unhealthy: number;
    pending: number;
  };
}

const RefynContext = createContext<RefynContextValue | null>(null);

export interface RefynProviderProps {
  children: ReactNode;
  /** Pipeline configuration */
  config: PipelineConfig;
  /** Auto-initialize on mount (default: true) */
  autoInit?: boolean;
}

/**
 * Provider component for sharing Pipeline across React tree
 */
export function RefynProvider({
  children,
  config,
  autoInit = true
}: RefynProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [poolStatus, setPoolStatus] = useState<RefynContextValue['poolStatus']>({
    total: 0,
    healthy: 0,
    unhealthy: 0,
    pending: 0,
  });

  const pipeline = useMemo(() => createPipeline(config), [config]);

  useEffect(() => {
    if (autoInit) {
      pipeline.init().then(() => {
        setIsReady(true);
        setPoolStatus(pipeline.poolStatus);
      });
    }

    return () => {
      pipeline.destroy();
    };
  }, [pipeline, autoInit]);

  // Update pool status periodically
  useEffect(() => {
    if (!isReady) return;

    const interval = setInterval(() => {
      setPoolStatus(pipeline.poolStatus);
    }, 1000);

    return () => clearInterval(interval);
  }, [pipeline, isReady]);

  const value = useMemo<RefynContextValue>(() => ({
    pipeline,
    isReady,
    poolStatus,
  }), [pipeline, isReady, poolStatus]);

  return (
    <RefynContext.Provider value={value}>
      {children}
    </RefynContext.Provider>
  );
}

/**
 * Hook to access the Refyn context
 */
export function useRefyn(): RefynContextValue {
  const context = useContext(RefynContext);

  if (!context) {
    throw new Error('useRefyn must be used within a RefynProvider');
  }

  return context;
}
