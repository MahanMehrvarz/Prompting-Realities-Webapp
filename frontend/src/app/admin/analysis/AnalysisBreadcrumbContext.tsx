"use client";

import { createContext, useContext, useState } from "react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type ContextValue = {
  crumbs: BreadcrumbItem[];
  setCrumbs: (crumbs: BreadcrumbItem[]) => void;
};

export const AnalysisBreadcrumbContext = createContext<ContextValue>({
  crumbs: [],
  setCrumbs: () => {},
});

export function useAnalysisBreadcrumb() {
  return useContext(AnalysisBreadcrumbContext);
}

export function AnalysisBreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = useState<BreadcrumbItem[]>([]);
  return (
    <AnalysisBreadcrumbContext.Provider value={{ crumbs, setCrumbs }}>
      {children}
    </AnalysisBreadcrumbContext.Provider>
  );
}
