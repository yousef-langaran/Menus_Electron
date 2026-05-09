import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@heroui/react';
import { Input } from '../ui/compat-input';
import { Button } from '../ui/compat-button';
import { useAuthStore } from '../store/authStore';
import { isValidIranMobile, normalizeIranMobile } from '../utils/iranMobile';

const EyeIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const EyeSlashIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

const loginSubmitBtnClass =
  'w-full min-h-12 font-semibold !bg-linear-to-r !from-[#0a5fa8] !via-[#0b2f6b] !to-[#5db8a1] text-white shadow-lg shadow-[#0a5fa8]/35 hover:opacity-92 active:scale-[0.99] transition-[opacity,transform] border-0 [&[data-pending=true]]:opacity-95';

export default function LoginPage() {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [mobileError, setMobileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMobileError('');
    setPasswordError('');
    const mobileTrim = mobile.trim();
    if (!mobileTrim) {
      setMobileError('شماره موبایل الزامی است.');
      return;
    }
    if (!isValidIranMobile(mobileTrim)) {
      setMobileError('فرمت شماره موبایل معتبر نیست. مثال: 09123456789');
      return;
    }
    if (!password) {
      setPasswordError('رمز عبور الزامی است.');
      return;
    }
    setIsLoading(true);
    try {
      await login(normalizeIranMobile(mobileTrim), password);
      navigate('/order');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطا در ورود به سیستم');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex justify-center items-center p-4 sm:p-6 dir-rtl bg-linear-to-br from-[#0a5fa8] via-[#0b2f6b] to-[#5db8a1] text-foreground"
      dir="rtl">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,255,255,0.18),transparent)]" aria-hidden />
      <Card className="relative z-[1] w-full max-w-[420px] shadow-2xl rounded-2xl border border-white/25 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
        <CardContent className="p-8 sm:p-10 flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <img
              src="/branding/hoshmenu-electron-logo.png"
              alt="هوش منو"
              className="h-[72px] w-auto max-w-[220px] object-contain select-none"
              draggable={false}
            />
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">ورود به برنامه</h1>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">مدیریت سفارش و منوی دیجیتال رستوران</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Input
              label="شماره موبایل"
              placeholder="09123456789"
              value={mobile}
              onValueChange={(v) => {
                setMobile(v);
                setMobileError('');
              }}
              isRequired
              isInvalid={!!mobileError}
              errorMessage={mobileError}
              size="lg"
              classNames={{ input: 'text-right' }}
            />
            <Input
              label="رمز عبور"
              type={isPasswordVisible ? 'text' : 'password'}
              placeholder="رمز عبور"
              value={password}
              onValueChange={(v) => {
                setPassword(v);
                setPasswordError('');
              }}
              isRequired
              isInvalid={!!passwordError}
              errorMessage={passwordError}
              size="lg"
              classNames={{ input: 'text-right' }}
              endContent={
                <Button
                  isIconOnly
                  size="sm"
                  variant="flat"
                  type="button"
                  className="focus:outline-none p-1 min-w-8"
                  onPress={() => setIsPasswordVisible((v) => !v)}>
                  {isPasswordVisible ? (
                    <EyeSlashIcon className="w-5 h-5 text-default-400" />
                  ) : (
                    <EyeIcon className="w-5 h-5 text-default-400" />
                  )}
                </Button>
              }
            />
            {error && (
              <div className="px-3 py-2.5 rounded-xl bg-danger-50 text-danger border border-danger-200/80 text-sm text-center leading-snug">
                {error}
              </div>
            )}
            <Button type="submit" size="lg" isLoading={isLoading} className={loginSubmitBtnClass}>
              {isLoading ? 'در حال ورود...' : 'ورود'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
