import type { ComponentChildren } from "preact";

interface AppHeaderProps {
  navigation: ComponentChildren;
  badge: ComponentChildren;
  account: ComponentChildren;
  children: ComponentChildren;
  tools?: ComponentChildren;
  search?: ComponentChildren;
}

/** One masthead, followed by the patient safety band. Neither is duplicated by
 * an alternate desktop/sidebar composition. Guided mode supplies no navigation. */
export function AppHeader({ navigation, badge, account, children, tools, search }: AppHeaderProps) {
  return <header class="cd2004-application-header tebra-app-header lf-app-header cd2004-print-exclude">
    <div class="lf-masthead">
      {navigation}
      <div class="lf-masthead-utilities">
        <div class="lf-header-search">{search}</div>
        {tools}
        <span class="cd2004-app-environment tebra-app-context">{badge}{account}</span>
      </div>
    </div>
    {children}
  </header>;
}
