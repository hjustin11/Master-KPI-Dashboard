"use client";

import { createContext, useContext } from "react";

export type TutorialNavGate = {
  /** null = kein Tutorial-Filter, normale Sidebar */
  visibleSidebarKeys: string[] | null;
};

const TutorialNavContext = createContext<TutorialNavGate>({ visibleSidebarKeys: null });

export function TutorialNavProvider({
  value,
  children,
}: {
  value: TutorialNavGate;
  children: React.ReactNode;
}) {
  return <TutorialNavContext.Provider value={value}>{children}</TutorialNavContext.Provider>;
}

export function useTutorialNavGate() {
  return useContext(TutorialNavContext);
}
