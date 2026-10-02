import { createContext, useContext } from "react";

import type { Actions, AppController } from "@/app/controller";
import type { AppState } from "@/app/store";
import { useStore } from "@/app/store";

export const ControllerContext = createContext<AppController | null>(null);

function useController(): AppController {
  const controller = useContext(ControllerContext);
  if (!controller)
    throw new Error("useApp/useActions must be used inside <ControllerContext.Provider>");
  return controller;
}

/** Subscribe to a slice of app state. Keep selectors cheap and return stable values. */
export function useApp<S>(selector: (state: AppState) => S): S {
  return useStore(useController().store, selector);
}

export function useActions(): Actions {
  return useController().actions;
}
