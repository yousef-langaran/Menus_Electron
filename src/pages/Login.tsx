import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button as HeroButton,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@heroui/react';
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
    <div className="flex min-h-screen items-center justify-center bg-default-100 p-4 sm:p-6" dir="rtl">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="flex flex-col items-center gap-3 pt-8 pb-0">
          <img
            src="/branding/hoshmenu-electron-logo.png"
            alt="هوش منو"
            className="h-[72px] w-auto max-w-[220px] object-contain select-none"
            draggable={false}
          />
          <div className="text-center">
            <CardTitle className="text-xl font-semibold">ورود به برنامه</CardTitle>
            <CardDescription className="mt-1.5 text-default-500">
              مدیریت سفارش و منوی دیجیتال رستوران
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 px-6 pb-8 pt-6 sm:px-8">
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
                <HeroButton
                  type="button"
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  className="min-w-8 shrink-0"
                  onPress={() => setIsPasswordVisible((v) => !v)}
                  aria-label={isPasswordVisible ? 'مخفی کردن رمز' : 'نمایش رمز'}>
                  {isPasswordVisible ? (
                    <EyeSlashIcon className="size-5 text-muted" />
                  ) : (
                    <EyeIcon className="size-5 text-muted" />
                  )}
                </HeroButton>
              }
            />
            {error ? (
              <Alert status="danger">
                <Alert.Content>
                  <Alert.Description className="text-center">{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
            <Button type="submit" color="primary" size="lg" isLoading={isLoading} className="w-full font-semibold">
              {isLoading ? 'در حال ورود...' : 'ورود'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
