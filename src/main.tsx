import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyStoredTheme } from './store/themeStore';
import './index.css';

// تم ذخیره‌شده را قبل از رندر اعمال کن تا صفحه نیمه‌دارک/نیمه‌لایت نشود
applyStoredTheme();
// RTL برای کل اپ و HeroUI (قبل از رندر)
document.documentElement.setAttribute('dir', 'rtl');
document.documentElement.setAttribute('lang', 'fa');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

