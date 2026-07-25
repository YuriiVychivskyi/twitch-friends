export const SIDEBAR_HOST_ID = 'twitch-friends-sidebar-root';

const SIDEBAR_SELECTORS = ['nav#side-nav', '[data-a-target="side-nav-bar"] nav'] as const;

export function findSidebarNavigation(root: ParentNode = document) {
  for (const selector of SIDEBAR_SELECTORS) {
    const navigation = root.querySelector<HTMLElement>(selector);

    if (navigation) {
      return navigation;
    }
  }

  return null;
}

export function findSidebarMountPoint(navigation: HTMLElement) {
  const section = navigation.querySelector<HTMLElement>('[role="group"]');

  if (!section?.parentElement || !navigation.contains(section.parentElement)) {
    return navigation;
  }

  return section.parentElement;
}
