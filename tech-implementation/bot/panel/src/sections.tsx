// The single place a section registers itself: an id (used in the URL and by
// the router), a sidebar label keyed to the active locale, and the screen it
// renders. §3, §6 and §7 each replace one placeholder's `Component` with a
// real screen — nothing else here needs to change to do that.

import type { ReactElement } from "react";
import type { Strings } from "./i18n/types.ts";
import type { SectionId } from "./router.ts";
import { ConfigScreen } from "./components/ConfigScreen.tsx";
import { DevicesScreen } from "./components/DevicesScreen.tsx";
import { PlaceholderScreen } from "./components/PlaceholderScreen.tsx";

export interface Section {
  id: SectionId;
  label: (s: Strings) => string;
  Component: () => ReactElement;
}

export const SECTIONS: Section[] = [
  { id: "devices", label: (s) => s.sidebar.devices, Component: DevicesScreen },
  {
    id: "inbox",
    label: (s) => s.sidebar.inbox,
    Component: () => <PlaceholderScreen section="inbox" />,
  },
  {
    id: "history",
    label: (s) => s.sidebar.history,
    Component: () => <PlaceholderScreen section="history" />,
  },
  { id: "config", label: (s) => s.sidebar.config, Component: ConfigScreen },
];
