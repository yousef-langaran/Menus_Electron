import { Outlet } from 'react-router-dom';
import { ElectronMenubar } from '../components/ElectronMenubar';
import { SyncErrorBanner } from '../components/SyncErrorBanner';

/** قالب مشترک پس از ورود: نوار منوی شبیه اپ دسکتاپ + محتوای صفحه */
export function AppShellLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-default-100">
      <ElectronMenubar />
      <SyncErrorBanner />
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
