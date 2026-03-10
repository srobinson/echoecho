import { createContext, useContext } from 'react';
import { tabColors } from '@echoecho/ui';

// Provides the accent color for the active admin section.
// Each tab screen wraps its content in SectionColorProvider with its
// own tabColor value. All components in that tree call useSectionColor()
// to get the correct accent without prop drilling.
const SectionColorContext = createContext<string>(tabColors.map);

export const SectionColorProvider = SectionColorContext.Provider;

export function useSectionColor(): string {
  return useContext(SectionColorContext);
}
