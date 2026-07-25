import { createRoot, type Root } from 'react-dom/client';

import sidebarStyles from './sidebar.css?inline';
import { Sidebar } from './Sidebar';
import { findSidebarMountPoint, findSidebarNavigation, SIDEBAR_HOST_ID } from './sidebarDom';

type SidebarMount = {
  host: HTMLElement;
  root: Root;
};

function createSidebarMount(mountPoint: HTMLElement): SidebarMount {
  const host = document.createElement('div');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  const appRoot = document.createElement('div');

  host.id = SIDEBAR_HOST_ID;
  host.dataset.extension = 'twitch-friends';
  style.textContent = sidebarStyles;

  shadowRoot.append(style, appRoot);
  mountPoint.append(host);

  const root = createRoot(appRoot);
  root.render(<Sidebar />);

  return { host, root };
}

export function startSidebar() {
  let currentMount: SidebarMount | null = null;
  let animationFrame: number | null = null;

  const unmount = () => {
    currentMount?.root.unmount();
    currentMount?.host.remove();
    currentMount = null;
  };

  const ensureMounted = () => {
    animationFrame = null;

    const navigation = findSidebarNavigation();

    if (!navigation) {
      unmount();
      return;
    }

    const mountPoint = findSidebarMountPoint(navigation);

    if (currentMount?.host.isConnected && currentMount.host.parentElement === mountPoint) {
      return;
    }

    unmount();
    document.getElementById(SIDEBAR_HOST_ID)?.remove();
    currentMount = createSidebarMount(mountPoint);
  };

  const scheduleMount = () => {
    if (animationFrame !== null) {
      return;
    }

    animationFrame = window.requestAnimationFrame(ensureMounted);
  };

  const observer = new MutationObserver(scheduleMount);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  scheduleMount();

  return () => {
    observer.disconnect();

    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
    }

    unmount();
  };
}
