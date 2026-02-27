import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// RTL برای کل اپ و HeroUI (قبل از رندر)
document.documentElement.setAttribute('dir', 'rtl');
document.documentElement.setAttribute('lang', 'fa');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

