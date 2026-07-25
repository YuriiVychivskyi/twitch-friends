import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PopupApp } from './PopupApp';
import './styles.css';

const rootElement = document.querySelector<HTMLDivElement>('#root');

if (!rootElement) {
  throw new Error('Popup root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
