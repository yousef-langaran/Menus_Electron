import {useState, useEffect, useRef} from 'react';
import {useAuthStore} from '../store/authStore';
import {useOrderStore} from '../store/orderStore';
import {
    getProducts,
    getRestaurantByName,
    getRestaurantById,
    checkUser,
    getAssetBaseUrl,
    getCustomerAddresses,
    addCustomer,
    updateCustomerProfile,
    createCustomerAddress,
    validateDiscountCode,
    fetchOrderById
} from '../services/api';
import {getCachedMenu, cacheMenu} from '../services/cache';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {usePrinterSettingsStore} from '../store/printerSettingsStore';
import {
    saveReceiptNumbersToStorage,
    getNextReceiptNumberBrowser,
} from '../utils/receiptNumbersStorage';
import { isValidIranMobile, normalizeIranMobile } from '../utils/iranMobile';
import {
    Card,
    CardBody,
    Button,
    Input,
    Select,
    SelectItem,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Checkbox,
    Textarea
} from '@heroui/react';
import {Panel, Group, Separator} from 'react-resizable-panels'

const RESET_ORDER_SHORTCUT_LABEL = 'Ctrl + Shift + Backspace';

export default function OrderPage() {
    const {user, token, logout} = useAuthStore();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const editParam = searchParams.get('edit');
    const parsedEditId = editParam != null ? Number(editParam) : NaN;
    const editingOrderId = !Number.isNaN(parsedEditId) && parsedEditId > 0 ? parsedEditId : null;
    const {
        cart,
        customerPhone,
        serviceType,
        tableNumber,
        customerAddress,
        paymentMethod,
        notes,
        discountAmount,
        discountType,
        discountCode,
        appliedDiscountCode,
        isSubmitting,
        addToCart,
        updateCartQuantity,
        updateCartItemOption,
        removeFromCart,
        setCustomerPhone,
        setServiceType,
        setTableNumber,
        setCustomerAddress,
        setPaymentMethod,
        setNotes,
        setDiscountAmount,
        setDiscountType,
        setDiscountCode,
        setAppliedDiscountCode,
        submitOrder,
        clearCart,
        getTotalAmount,
        getFinalAmount,
        getDiscountAmount,
    } = useOrderStore();

    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [cartItemOptions, setCartItemOptions] = useState<string[]>([]);
    const [isMobileRequired, setIsMobileRequired] = useState(true);
    const [isScaleIntegrationEnabled, setIsScaleIntegrationEnabled] = useState(false);
    const [restrictScaleAccess, setRestrictScaleAccess] = useState(true);
    const [canUseScale, setCanUseScale] = useState(true);
    const [isCardTerminalEnabled, setIsCardTerminalEnabled] = useState(false);
    const [restrictCardTerminalAccess, setRestrictCardTerminalAccess] = useState(true);
    const [allowDirectSendAmountToCardTerminal, setAllowDirectSendAmountToCardTerminal] = useState(false);
    const [canUseCardTerminal, setCanUseCardTerminal] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [userExists, setUserExists] = useState<boolean | null>(null);
    const [isCheckingUser, setIsCheckingUser] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [barcodeInput, setBarcodeInput] = useState('');
    const [quickScanEnabled, setQuickScanEnabled] = useState(false);
    /** نام مشتری لود شده بعد از تیک (چک کاربر) — برای نمایش و چاپ رسید */
    const [loadedCustomerFirstName, setLoadedCustomerFirstName] = useState('');
    const [loadedCustomerLastName, setLoadedCustomerLastName] = useState('');
    /** آیتمی که پنل توضیحاتش باز است (برای جمع‌وجور بودن صفحه) */
    const [expandedNoteProductId, setExpandedNoteProductId] = useState<number | null>(null);
    const {enabledPrinters, getPrinterReceipts} = usePrinterSettingsStore((state) => ({
        enabledPrinters: Object.values(state.configs).filter((config) => config.enabled),
        getPrinterReceipts: state.getPrinterReceipts,
    }));
    const phoneInputRef = useRef<HTMLInputElement>(null);
    /** ref پنل توضیحات باز — برای تشخیص کلیک داخل پنل در onBlur */
    const notePanelRef = useRef<HTMLDivElement | null>(null);
    /** نمایش پاپ‌آپ تکمیل سفارش (تخفیف + اطلاعات مشتری) */
    const [showOrderModal, setShowOrderModal] = useState(false);
    /** آدرس‌های ذخیره‌شده مشتری (برای بیرون‌بر) */
    const [customerAddresses, setCustomerAddresses] = useState<Array<{
        id: number;
        address: string;
        label?: string;
        isDefault: boolean
    }>>([]);
    const [loadingAddresses, setLoadingAddresses] = useState(false);
    /** انتخاب آدرس: عدد = id آدرس ذخیره، 'new' = آدرس جدید تایپ شده */
    const [selectedAddressId, setSelectedAddressId] = useState<number | 'new' | null>(null);
    /** برای افزودن مشتری جدید */
    const [customerFirstNameInput, setCustomerFirstNameInput] = useState('');
    const hasManagePermission = (currentUser: any, module: 'electron_panel' | 'payment_terminal', restaurantId?: number) => {
        const roles = Array.isArray(currentUser?.roles) ? currentUser.roles : [];
        const isOwnerOrAdmin = roles.some((r: any) => r?.title === 'restaurant_owner' || r?.title === 'admin' || r?.title === 'super_admin');
        if (isOwnerOrAdmin) return true;
        const permissions = Array.isArray(currentUser?.restaurantPermissions) ? currentUser.restaurantPermissions : [];
        return permissions.some((perm: any) => {
            if (!perm?.isActive) return false;
            if (perm?.module !== module) return false;
            if (restaurantId && perm?.restaurant?.id !== restaurantId) return false;
            return Array.isArray(perm?.actions) && perm.actions.includes('manage');
        });
    };

    const [customerLastNameInput, setCustomerLastNameInput] = useState('');
    const [isAddingCustomer, setIsAddingCustomer] = useState(false);
    /** گزینه چاپ برای این سفارش: همه پرینترهای فعال، بدون چاپ، یا انتخاب پرینترها */
    const [printOption, setPrintOption] = useState<'all' | 'none' | 'select'>('all');
    /** وقتی printOption === 'select'، نام پرینترهای انتخاب‌شده */
    const [selectedPrinterNames, setSelectedPrinterNames] = useState<string[]>([]);
    /** وضعیت آنلاین برای فعال بودن گزینه کد تخفیف */
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    /** در حال اعتبارسنجی کد تخفیف */
    const [discountCodeValidating, setDiscountCodeValidating] = useState(false);
    /** خطای اعتبارسنجی کد تخفیف */
    const [discountCodeError, setDiscountCodeError] = useState('');
    const [, setImageCache] = useState<Record<string, string>>({});
    /** بارگذاری سفارش برای ویرایش فاکتور (?edit=id) */
    const [orderEditLoading, setOrderEditLoading] = useState(false);
    const [orderEditError, setOrderEditError] = useState('');
    const prevEditingIdRef = useRef<number | null>(null);
    const scanBufferRef = useRef('');
    const scanLastKeyAtRef = useRef(0);
    const audioCtxRef = useRef<AudioContext | null>(null);

    const isElectronWithPrinters = typeof window !== 'undefined' && Boolean(window.electronAPI) && enabledPrinters.length > 0;
    /** کد تخفیف فقط وقتی فعال است که شماره موبایل وارد شده و اتصال آنلاین باشد */
    const canUseDiscountCode = Boolean(customerPhone.trim()) && isOnline;

    useEffect(() => {
        const prev = prevEditingIdRef.current;
        if (prev != null && editingOrderId == null) {
            clearCart();
            setLoadedCustomerFirstName('');
            setLoadedCustomerLastName('');
            setUserExists(null);
            setOrderEditError('');
        }
        prevEditingIdRef.current = editingOrderId;
    }, [editingOrderId, clearCart]);

    useEffect(() => {
        if (editingOrderId == null) {
            setOrderEditLoading(false);
            return;
        }
        if (!token) {
            setOrderEditError('برای ویرایش فاکتور باید وارد شوید.');
            return;
        }
        let cancelled = false;
        setOrderEditLoading(true);
        setOrderEditError('');
        setError('');
        fetchOrderById(editingOrderId, token)
            .then((order: any) => {
                if (cancelled) return;
                const items = order.items || [];
                const cartItems = items
                    .filter((row: any) => row.product?.id)
                    .map((row: any) => {
                        const p = row.product;
                        const qty = Number(row.quantity);
                        const price = Number(row.price);
                        return {
                            productId: p.id,
                            product: p,
                            quantity: qty,
                            price,
                            totalPrice: price * qty,
                            itemOption: (row.itemNote || row.itemOption || '') as string,
                        };
                    });
                const {
                    setDiscountType,
                    setDiscountAmount,
                    setDiscountCode,
                    setAppliedDiscountCode,
                } = useOrderStore.getState();
                useOrderStore.setState({
                    cart: cartItems,
                    customerPhone: order.customerPhone || '',
                    serviceType: order.serviceType === 'takeaway' ? 'takeaway' : 'dine_in',
                    tableNumber: order.tableNumber || '',
                    customerAddress: order.customerAddress || '',
                    paymentMethod: order.paymentMethod || 'cash',
                    notes: order.notes || '',
                });
                const codeVal = (order.discountCodeValue || '').trim();
                const disc = Number(order.discountAmount) || 0;
                if (codeVal) {
                    setDiscountType('code');
                    setDiscountCode(codeVal);
                    setAppliedDiscountCode({code: codeVal, discountAmount: disc});
                } else {
                    setDiscountType('fixed');
                    setDiscountAmount(disc);
                    setAppliedDiscountCode(null);
                    setDiscountCode('');
                }
                const nameRaw = (order.customerName || '').trim();
                const nameParts = nameRaw.split(/\s+/).filter(Boolean);
                setLoadedCustomerFirstName(nameParts[0] || '');
                setLoadedCustomerLastName(nameParts.slice(1).join(' ') || '');
                setUserExists(null);
                setOrderEditLoading(false);
            })
            .catch((e: any) => {
                if (cancelled) return;
                setOrderEditLoading(false);
                setOrderEditError(
                    e?.response?.data?.message || e?.message || 'خطا در بارگذاری سفارش',
                );
            });
        return () => {
            cancelled = true;
        };
    }, [editingOrderId, token]);

    useEffect(() => {
        loadProducts();
    }, []);

    // با باز شدن مودال، فوکوس روی فیلد موبایل و به‌روزرسانی وضعیت آنلاین
    useEffect(() => {
        if (showOrderModal) {
            const t = setTimeout(() => phoneInputRef.current?.focus(), 50);
            const checkOnline = async () => {
                try {
                    const online = window.electronAPI ? await window.electronAPI.checkOnline() : navigator.onLine;
                    setIsOnline(online);
                } catch {
                    setIsOnline(navigator.onLine);
                }
            };
            checkOnline();
            return () => clearTimeout(t);
        }
    }, [showOrderModal]);

    // شنیدن رویداد آنلاین/آفلاین مرورگر
    useEffect(() => {
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    // اگر کد تخفیف انتخاب شده ولی شرط برقرار نیست، برگرد به تخفیف تومانی
    useEffect(() => {
        if (discountType === 'code' && !canUseDiscountCode) {
            setDiscountType('fixed');
            setDiscountCode('');
            setAppliedDiscountCode(null);
            setDiscountCodeError('');
        }
    }, [discountType, canUseDiscountCode, setDiscountType, setDiscountCode, setAppliedDiscountCode]);

    const handleApplyDiscountCode = async () => {
        const code = discountCode.trim();
        if (!code || !token || !user?.restaurants?.[0]?.name) return;
        setDiscountCodeError('');
        setDiscountCodeValidating(true);
        try {
            const totalAmount = getTotalAmount();
            const result = await validateDiscountCode(
                {
                    code,
                    restaurantName: user.restaurants[0].name,
                    totalAmount,
                    userPhone: customerPhone.trim() || undefined,
                },
                token,
            );
            if (result?.valid && typeof result.discountAmount === 'number') {
                setAppliedDiscountCode({code, discountAmount: result.discountAmount});
            } else {
                setDiscountCodeError(result?.message || 'کد تخفیف معتبر نیست');
                setAppliedDiscountCode(null);
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'خطا در اعتبارسنجی کد تخفیف';
            setDiscountCodeError(msg);
            setAppliedDiscountCode(null);
        } finally {
            setDiscountCodeValidating(false);
        }
    };

    const handleCancelDiscountCode = () => {
        setAppliedDiscountCode(null);
        setDiscountCode('');
        setDiscountCodeError('');
    };

    // وقتی مودال بسته است و سبد پر است، اینتر مودال را باز کن و فوکوس روی موبایل
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape'){
                setSearchTerm('')
            }
            if (e.key !== 'Enter' || showOrderModal) return;
            const target = e.target as HTMLElement;
            if (target.closest('.order-modal')) return;
            if (cart.length > 0 && !target.closest('input') && !target.closest('textarea') && !target.closest('button')) {
                setShowOrderModal(true);
                e.preventDefault();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showOrderModal, cart.length]);

    // بارگذاری آدرس‌های مشتری وقتی موبایل عوض شد (بیرون‌بر + آنلاین)
    useEffect(() => {
        if (!showOrderModal || serviceType !== 'takeaway' || !token || !customerPhone.trim()) {
            setCustomerAddresses([]);
            setSelectedAddressId(null);
            return;
        }
        const normalized = normalizeIranMobile(customerPhone.trim());
        if (!isValidIranMobile(normalized)) {
            setCustomerAddresses([]);
            setSelectedAddressId(null);
            return;
        }
        const isOnline = window.electronAPI ? window.electronAPI.checkOnline() : Promise.resolve(navigator.onLine);
        const restaurantId = user?.restaurants?.[0]?.id;
        const restaurantName = user?.restaurants?.[0]?.name;
        if (!restaurantId && !restaurantName) return;

        let cancelled = false;
        setLoadingAddresses(true);
        isOnline.then((online) => {
            if (!online || cancelled) {
                setLoadingAddresses(false);
                return;
            }
            getCustomerAddresses(
                {restaurantId, restaurantName, phone: normalized},
                token,
            )
                .then((list) => {
                    if (cancelled) return;
                    setCustomerAddresses(list);
                    const defaultOne = list.find((a) => a.isDefault) || list[0];
                    if (defaultOne) {
                        setSelectedAddressId(defaultOne.id);
                        setCustomerAddress(defaultOne.address);
                    } else {
                        setSelectedAddressId(list.length > 0 ? list[0].id : 'new');
                        if (list.length > 0) setCustomerAddress(list[0].address);
                    }
                })
                .catch(() => {
                    if (!cancelled) setCustomerAddresses([]);
                    if (!cancelled) setSelectedAddressId('new');
                })
                .finally(() => {
                    if (!cancelled) setLoadingAddresses(false);
                });
        });
        return () => {
            cancelled = true;
        };
    }, [showOrderModal, serviceType, customerPhone, token, user?.restaurants]);

    // Cache images when products change
    useEffect(() => {
        const cacheProductImages = async () => {
            if (products.length === 0 || !window.electronAPI?.cacheImages) return;

            const isOnline = window.electronAPI
                ? await window.electronAPI.checkOnline()
                : navigator.onLine;

            // فقط در حالت آنلاین عکس‌ها را cache کن
            if (isOnline) {
                const assetBase = getAssetBaseUrl();
                const imageUrls = products
                    .map(p => p.multiMedia?.url)
                    .filter(Boolean)
                    .map(url => `${assetBase}${url}`);

                if (imageUrls.length > 0) {
                    try {
                        const result = await window.electronAPI.cacheImages(imageUrls);
                        if (result.success && result.urls) {
                            setImageCache(prev => ({...prev, ...result.urls}));
                        }
                    } catch (err) {
                        console.warn('Failed to cache images:', err);
                    }
                }
            }

            // همیشه سعی کن عکس‌های cache شده را لود کن (حتی در حالت آفلاین)
            if (window.electronAPI?.getCachedImage) {
                const assetBase = getAssetBaseUrl();
                const imageUrlMap: Record<string, string> = {};
                for (const product of products) {
                    if (product.multiMedia?.url) {
                        const fullUrl = `${assetBase}${product.multiMedia.url}`;
                        try {
                            const result = await window.electronAPI.getCachedImage(fullUrl);
                            if (result.success && result.url) {
                                imageUrlMap[fullUrl] = result.url;
                            }
                        } catch (err) {
                            // ignore errors
                        }
                    }
                }
                if (Object.keys(imageUrlMap).length > 0) {
                    setImageCache(prev => ({...prev, ...imageUrlMap}));
                }
            }
        };

        cacheProductImages();
    }, [products]);

    const loadProducts = async () => {
        setIsLoading(true);
        setError('');

        try {
            // Try to get cached menu first
            const restaurantName = user?.restaurants?.[0]?.name;
            const restaurantId = user?.restaurants?.[0]?.id;

            let productsData: any[] = [];
            const cached = await getCachedMenu(restaurantId, restaurantName);

            if (cached) {
                productsData = cached.products;
                setProducts(productsData);
                setCategories(cached.categories);
                setCartItemOptions(Array.isArray(cached.cartItemOptions) ? cached.cartItemOptions : []);
                setIsMobileRequired(cached.isMobileRequiredInElectronPanel ?? true);
                setIsScaleIntegrationEnabled(Boolean(cached.isScaleIntegrationEnabled));
                setRestrictScaleAccess(cached.restrictScaleAccessToElectronManagers !== false);
                setIsCardTerminalEnabled(Boolean(cached.isCardTerminalEnabled));
                setRestrictCardTerminalAccess(cached.restrictCardTerminalAccessToElectronManagers !== false);
                setAllowDirectSendAmountToCardTerminal(Boolean(cached.allowDirectSendAmountToCardTerminal));
                setCanUseScale(
                    !Boolean(cached.isScaleIntegrationEnabled) ||
                    cached.restrictScaleAccessToElectronManagers === false ||
                    hasManagePermission(user, 'electron_panel', Number(restaurantId))
                );
                setCanUseCardTerminal(
                    !Boolean(cached.isCardTerminalEnabled) ||
                    cached.restrictCardTerminalAccessToElectronManagers === false ||
                    hasManagePermission(user, 'payment_terminal', Number(restaurantId))
                );
                setIsLoading(false);
            }

            // Try to fetch from server if online
            const isOnline = window.electronAPI
                ? await window.electronAPI.checkOnline()
                : navigator.onLine;

            if (token && isOnline) {
                try {
                    productsData = await getProducts(restaurantName, restaurantId, token);
                    setProducts(productsData);

                    let options: string[] = [];
                    let mobileReq = true;
                    let scaleEnabled = false;
                    let scaleRestricted = true;
                    let cardTerminalEnabled = false;
                    let cardTerminalRestricted = true;
                    let directAmountSendEnabled = false;
                    try {
                        const restaurant = restaurantId
                            ? await getRestaurantById(Number(restaurantId), token)
                            : await getRestaurantByName(restaurantName || '', token);

                        const raw = restaurant?.cartItemOptions;
                        options = Array.isArray(raw) ? raw.filter((s: any) => s != null && String(s).trim()) : [];
                        mobileReq = restaurant?.panelSettings?.isMobileRequiredInElectronPanel ?? true;
                        scaleEnabled = Boolean(restaurant?.panelSettings?.isScaleIntegrationEnabled);
                        scaleRestricted = restaurant?.panelSettings?.restrictScaleAccessToElectronManagers !== false;
                        cardTerminalEnabled = Boolean(restaurant?.panelSettings?.isCardTerminalEnabled);
                        cardTerminalRestricted = restaurant?.panelSettings?.restrictCardTerminalAccessToElectronManagers !== false;
                        directAmountSendEnabled = Boolean(restaurant?.panelSettings?.allowDirectSendAmountToCardTerminal);
                        setCartItemOptions(options);
                        setIsMobileRequired(mobileReq);
                        setIsScaleIntegrationEnabled(scaleEnabled);
                        setRestrictScaleAccess(scaleRestricted);
                        setCanUseScale(!scaleEnabled || !scaleRestricted || hasManagePermission(user, 'electron_panel', Number(restaurantId)));
                        setIsCardTerminalEnabled(cardTerminalEnabled);
                        setRestrictCardTerminalAccess(cardTerminalRestricted);
                        setAllowDirectSendAmountToCardTerminal(directAmountSendEnabled);
                        setCanUseCardTerminal(
                            !cardTerminalEnabled ||
                            !cardTerminalRestricted ||
                            hasManagePermission(user, 'payment_terminal', Number(restaurantId))
                        );
                    } catch (_) {
                        setCartItemOptions((prev) => prev);
                        setIsMobileRequired((prev) => prev);
                        setIsScaleIntegrationEnabled((prev) => prev);
                        setRestrictScaleAccess((prev) => prev);
                        setCanUseScale((prev) => prev);
                        setIsCardTerminalEnabled((prev) => prev);
                        setRestrictCardTerminalAccess((prev) => prev);
                        setAllowDirectSendAmountToCardTerminal((prev) => prev);
                        setCanUseCardTerminal((prev) => prev);
                    }

                    const uniqueCategories = Array.from(
                        new Set(productsData.map(p => p.category?.name_fa).filter(Boolean))
                    );
                    setCategories(uniqueCategories as string[]);

                    // Cache the menu (including cart item options for offline)
                    await cacheMenu(
                        restaurantId || 0,
                        restaurantName || '',
                        productsData,
                        uniqueCategories as string[],
                        options,
                        mobileReq,
                        scaleEnabled,
                        scaleRestricted,
                        cardTerminalEnabled,
                        cardTerminalRestricted,
                        directAmountSendEnabled,
                    );
                } catch (err) {
                    console.warn('Failed to fetch products from server:', err);
                    if (productsData.length === 0) {
                        setError('خطا در بارگذاری منو. از حالت آفلاین استفاده می‌شود.');
                    }
                }
            } else if (productsData.length === 0) {
                setError('شما در حالت آفلاین هستید و منو در حافظه ذخیره نشده است.');
            }
        } catch (err: any) {
            setError(err.message || 'خطا در بارگذاری منو');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCheckUser = async () => {
        const normalizedPhone = normalizeIranMobile(customerPhone.trim());
        if (!isValidIranMobile(normalizedPhone)) {
            setError('فرمت شماره موبایل معتبر نیست. مثال: 09123456789');
            return;
        }

        setLoadedCustomerFirstName('');
        setLoadedCustomerLastName('');
        setIsCheckingUser(true);
        try {
            const isOnline = window.electronAPI
                ? await window.electronAPI.checkOnline()
                : navigator.onLine;

            if (isOnline) {
                const response = await checkUser(normalizedPhone);
                setUserExists(response.userExists || false);
                if (response.userExists && (response.firstName != null || response.lastName != null)) {
                    setLoadedCustomerFirstName(response.firstName ?? '');
                    setLoadedCustomerLastName(response.lastName ?? '');
                    setCustomerFirstNameInput(response.firstName ?? '');
                    setCustomerLastNameInput(response.lastName ?? '');
                } else {
                    setCustomerFirstNameInput('');
                    setCustomerLastNameInput('');
                }
            } else {
                setUserExists(null);
            }
        } catch (err) {
            console.error('Error checking user:', err);
            setUserExists(null);
            setLoadedCustomerFirstName('');
            setLoadedCustomerLastName('');
        } finally {
            setIsCheckingUser(false);
        }
    };

    const handleSendAmountToCardTerminal = async () => {
        const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;
        if (!isCardTerminalEnabled) {
            setError('قابلیت کارتخوان برای این رستوران فعال نیست.');
            return;
        }
        if (!canUseCardTerminal) {
            setError('شما دسترسی استفاده از کارتخوان ندارید.');
            return;
        }
        if (!allowDirectSendAmountToCardTerminal) {
            setError('ارسال مستقیم مبلغ به کارتخوان توسط مدیر غیرفعال است.');
            return;
        }
        const amount = Number(getFinalAmount() || 0);
        if (!(amount > 0)) {
            setError('برای ارسال به کارتخوان، مبلغ سفارش باید بیشتر از صفر باشد.');
            return;
        }
        if (!window.electronAPI?.sendAmountToCardTerminal) {
            setError('نسخه پنل دسکتاپ از کارتخوان پشتیبانی نمی‌کند.');
            return;
        }

        setError('');
        try {
            const result = await window.electronAPI.sendAmountToCardTerminal({ amount, restaurantId });
            if (result?.success) {
                setSuccessMessage('مبلغ با موفقیت به کارتخوان ارسال شد.');
            } else {
                setError(result?.error || 'ارسال مبلغ به کارتخوان ناموفق بود.');
            }
        } catch (err: any) {
            setError(err?.message || 'خطا در ارسال مبلغ به کارتخوان');
        }
    };

    const handleSubmit = async () => {
        const normalizedPhone = normalizeIranMobile(customerPhone.trim());
        if (isMobileRequired && !customerPhone.trim()) {
            setError('شماره تماس را وارد کنید');
            phoneInputRef.current?.focus();
            return;
        }
        if (customerPhone.trim() && !isValidIranMobile(normalizedPhone)) {
            setError('فرمت شماره موبایل معتبر نیست. مثال: 09123456789');
            phoneInputRef.current?.focus();
            return;
        }
        setError('');

        const restaurantId = user?.restaurants?.[0]?.id;
        const restaurantName = user?.restaurants?.[0]?.name;
        const trimmedFirstName = customerFirstNameInput.trim();
        const trimmedLastName = customerLastNameInput.trim();

        const syncCustomerProfileBeforeSubmit = async () => {
            if (!token || (!restaurantId && !restaurantName) || !normalizedPhone) {
                return;
            }

            // اگر مشتری وجود دارد (یا قبلا چک شده)، نام را آپدیت کن تا حتی اسم‌های فیک/خالی اصلاح شوند.
            if (userExists === true) {
                await updateCustomerProfile(
                    { restaurantId, restaurantName, phone: normalizedPhone },
                    { firstName: trimmedFirstName, lastName: trimmedLastName },
                    token,
                );
                setLoadedCustomerFirstName(trimmedFirstName);
                setLoadedCustomerLastName(trimmedLastName);
                return;
            }

            // اگر مشتری جدید است ولی نام/نام خانوادگی وارد شده، همان‌جا مشتری را بساز تا نام ذخیره شود.
            if (userExists === false && (trimmedFirstName || trimmedLastName)) {
                const result = await addCustomer(
                    { restaurantId, restaurantName },
                    {
                        mobile: normalizedPhone,
                        firstName: trimmedFirstName || undefined,
                        lastName: trimmedLastName || undefined,
                    },
                    token,
                );
                setUserExists(Boolean(result?.added));
                setLoadedCustomerFirstName(result?.user?.firstName || trimmedFirstName);
                setLoadedCustomerLastName(result?.user?.lastName || trimmedLastName);
            }
        };

        try {
            await syncCustomerProfileBeforeSubmit();
        } catch (err: any) {
            setError(err?.response?.data?.message || err?.message || 'ذخیره اطلاعات مشتری ناموفق بود');
            return;
        }

        // اسنپ‌شات برای چاپ رسید وقتی سرویس جواب داد (آنلاین در پس‌زمینه)
        const snapshot = {
            customerPhone: normalizedPhone || customerPhone,
            serviceType,
            tableNumber,
            customerAddress,
            paymentMethod,
            notes,
            // مبلغ تخفیف واقعی (شامل درصدی/تومانی/کد تخفیف)
            discountAmount: getDiscountAmount(),
            totalAmount: getTotalAmount(),
            finalAmount: getFinalAmount(),
            items: cart.map((item) => ({
                product: item.product,
                productName: item.product.name_fa || item.product.name,
                quantity: item.quantity,
                price: item.price,
                /** برای چاپ رسید (همان فیلد ارسالی به API) */
                itemNote: item.itemOption?.trim() || undefined,
                itemOption: item.itemOption || undefined,
            })),
        };

        const runPrint = (orderData: any, orderKeys: string[], options: {
            printOption: 'all' | 'none' | 'select';
            selectedPrinterNames: string[]
        } = {printOption: 'all', selectedPrinterNames: []}) => {
            const {printOption: opt, selectedPrinterNames: names} = options;
            (async () => {
                try {
                    if (window.electronAPI) {
                        let receiptNumber = 0;
                        const shouldPrint = opt !== 'none';
                        const printersToUse = opt === 'select' && names.length > 0
                            ? enabledPrinters.filter((p) => names.includes(p.name))
                            : opt === 'all' ? enabledPrinters : [];
                        if (shouldPrint && printersToUse.length > 0) {
                            const [templatesMap, defaultTemplate] = await Promise.all([
                                window.electronAPI?.getPrintTemplatesMap?.() ?? Promise.resolve({}),
                                window.electronAPI?.getDefaultPrintTemplate?.() ?? Promise.resolve(null),
                            ]);
                            const printerJobs = printersToUse.flatMap((printer) => {
                                const template = templatesMap?.[printer.name] ?? defaultTemplate ?? null;
                                return getPrinterReceipts(printer.name)
                                    .filter((r) => r.enabled)
                                    .map((receipt) => ({
                                        name: printer.name,
                                        displayName: printer.displayName,
                                        paperWidth: template?.paperWidth ?? printer.paperWidth,
                                        paperLength: template?.paperLength ?? printer.paperLength,
                                        margin: template?.margin ?? printer.margin,
                                        receiptType: receipt.type,
                                        copies: receipt.copies,
                                        layout: template?.layout ?? undefined,
                                    }));
                            });
                            if (printerJobs.length > 0) {
                                const res = await window.electronAPI.printReceipt(orderData, printerJobs, orderKeys);
                                if (res?.status === 'PRINT_OK') {
                                    receiptNumber = res.receiptNumber ?? 0;
                                } else {
                                    throw new Error(res?.code || 'PRINT_UNKNOWN_ERROR');
                                }
                            } else {
                                receiptNumber = await window.electronAPI.assignReceiptNumberForOrder(orderKeys);
                            }
                        } else {
                            receiptNumber = await window.electronAPI.assignReceiptNumberForOrder(orderKeys);
                        }
                        if (receiptNumber > 0 && orderKeys.length) saveReceiptNumbersToStorage(orderKeys, receiptNumber);
                    } else {
                        const receiptNumber = getNextReceiptNumberBrowser();
                        saveReceiptNumbersToStorage(orderKeys, receiptNumber);
                    }
                } catch (err) {
                    console.error('Print / assign receipt number error:', err);
                    setError(`خطا در چاپ رسید (${err instanceof Error ? err.message : 'PRINT_UNKNOWN_ERROR'})`);
                }
            })();
        };

        const isEditingInvoice = editingOrderId != null;

        const onOrderCreated = (res: {
            orderId: number;
            orderNumber?: string;
            receiptCallNumber?: number;
            offline?: boolean;
            order?: any
        }) => {
            if (isEditingInvoice) return;
            const restaurantName = user?.restaurants?.[0]?.name_fa || user?.restaurants?.[0]?.name || '';
            const fullName = [trimmedFirstName || loadedCustomerFirstName, trimmedLastName || loadedCustomerLastName]
                .filter(Boolean)
                .join(' ')
                .trim();
            const serverOrder = res.order;
            const orderData = {
                id: res.orderId,
                orderNumber: res.orderNumber ?? `ORD-${res.orderId}`,
                receiptCallNumber: res.receiptCallNumber ?? undefined,
                restaurantName,
                customerPhone: snapshot.customerPhone,
                customerName: fullName || snapshot.customerPhone,
                serviceType: snapshot.serviceType,
                tableNumber: snapshot.tableNumber,
                customerAddress: snapshot.customerAddress,
                paymentMethod: snapshot.paymentMethod,
                notes: snapshot.notes,
                items: snapshot.items,
                totalAmount: snapshot.totalAmount,
                discountAmount: Number(
                    serverOrder?.discountAmount ?? snapshot.discountAmount ?? 0,
                ),
                finalAmount: Number(
                    serverOrder?.finalAmount ?? snapshot.finalAmount ?? snapshot.totalAmount,
                ),
            };
            const orderKeys = res.offline
                ? [`offline-${res.orderId}`]
                : [String(res.orderId), res.orderNumber, orderData.orderNumber].filter(Boolean);
            runPrint(orderData, orderKeys, {printOption, selectedPrinterNames});
        };

        const result = await submitOrder({
            editingOrderId: editingOrderId ?? undefined,
            onOrderCreated,
        });

        if (result.success) {
            if (isEditingInvoice) {
                setError('');
                setSuccessMessage('فاکتور به‌روز شد');
                setShowOrderModal(false);
                clearCart();
                setUserExists(null);
                setLoadedCustomerFirstName('');
                setLoadedCustomerLastName('');
                setPrintOption('all');
                setSelectedPrinterNames([]);
                navigate('/orders');
                setTimeout(() => setSuccessMessage(''), 2500);
                return;
            }
            console.log('[شماره رسید] ثبت سفارش. orderId:', result.orderId, 'offline:', result.offline, 'pending:', result.pending);
            setError('');
            setSuccessMessage('سفارش ثبت شد' + (result.offline ? ' (آفلاین)' : ''));

            setShowOrderModal(false);
            clearCart();
            setUserExists(null);
            setLoadedCustomerFirstName('');
            setLoadedCustomerLastName('');
            setCustomerFirstNameInput('');
            setCustomerLastNameInput('');
            setPrintOption('all');
            setSelectedPrinterNames([]);
            setTimeout(() => setSuccessMessage(''), 3000);

            // اگر بیرون‌بر و آدرس جدید بود، آن را در لیست آدرس‌های مشتری ذخیره کن
            const addressIsNew =
                snapshot.serviceType === 'takeaway' &&
                snapshot.customerAddress?.trim() &&
                (selectedAddressId === 'new' || customerAddresses.length === 0);
            if (
                addressIsNew &&
                token &&
                (window.electronAPI ? await window.electronAPI.checkOnline() : navigator.onLine)
            ) {
                const restaurantId = user?.restaurants?.[0]?.id;
                const restaurantName = user?.restaurants?.[0]?.name;
                const normalized = normalizeIranMobile(snapshot.customerPhone.trim());
                if ((restaurantId || restaurantName) && isValidIranMobile(normalized)) {
                    createCustomerAddress(
                        {restaurantId, restaurantName},
                        {customerPhone: normalized, address: snapshot.customerAddress.trim()},
                        token,
                    ).catch((err) => console.warn('Failed to save new address:', err));
                }
            }
        } else {
            setError(result.error || 'خطا در ثبت سفارش');
        }
    };

    const filteredProducts = products.filter((p) => {
        const categoryMatch =
            !selectedCategory || p.category?.name_fa === selectedCategory;

        const term = searchTerm.trim();

        const searchMatch = term
            ? (p.name_fa || "").includes(term) ||
            (p.name || "").toLowerCase().includes(term.toLowerCase())
            : true;

        return categoryMatch && searchMatch;
    });

    const staffCartUnitPrice = (product: { staffOrderUnitPrice?: number; price?: number }) => {
        const inv = Number(product?.staffOrderUnitPrice);
        if (Number.isFinite(inv) && inv > 0) return inv;
        return Number(product?.price || 0);
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('fa-IR').format(price) + ' تومان';
    };

    const handleBarcodeAdd = (rawCode?: string) => {
        const code = (rawCode ?? barcodeInput).trim();
        if (!code) return;
        const matched = products.find((p: any) => String(p?.barcode || '').trim() === code);
        if (!matched) {
            playScanBeep(false);
            setError('محصولی با این بارکد پیدا نشد');
            return;
        }
        setSuccessMessage('');
        addToCart(matched);
        if (!rawCode) setBarcodeInput('');
        playScanBeep(true);
        setError('');
    };

    const playScanBeep = (ok: boolean) => {
        try {
            if (typeof window === 'undefined') return;
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            if (!Ctx) return;
            if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
            const ctx = audioCtxRef.current;
            if (!ctx) return;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = ok ? 1046 : 280;
            gain.gain.value = 0.0001;
            osc.connect(gain);
            gain.connect(ctx.destination);

            const now = ctx.currentTime;
            gain.gain.exponentialRampToValueAtTime(ok ? 0.08 : 0.12, now + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + (ok ? 0.09 : 0.18));
            osc.start(now);
            osc.stop(now + (ok ? 0.1 : 0.2));
        } catch {
            // ignore audio failures
        }
    };

    const resetOrderSession = () => {
        const hasItems = cart.length > 0;
        const shouldConfirm = hasItems || editingOrderId != null;
        if (shouldConfirm) {
            const confirmed = window.confirm('سبد خرید و اطلاعات سفارش ریست شود و سفارش جدید شروع شود؟');
            if (!confirmed) return;
        }
        clearCart();
        setShowOrderModal(false);
        setError('');
        setSuccessMessage('');
        setUserExists(null);
        setLoadedCustomerFirstName('');
        setLoadedCustomerLastName('');
                setCustomerFirstNameInput('');
                setCustomerLastNameInput('');
        setPrintOption('all');
        setSelectedPrinterNames([]);
        setExpandedNoteProductId(null);
        setDiscountCodeError('');
        setSearchTerm('');
        setBarcodeInput('');
        setSelectedAddressId(null);
        setCustomerAddresses([]);
        if (editingOrderId != null) {
            navigate('/order');
        }
    };

    useEffect(() => {
        if (!quickScanEnabled) return;
        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            const inTypingField =
                tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
            if (inTypingField) return;

            const now = Date.now();
            if (now - scanLastKeyAtRef.current > 250) {
                scanBufferRef.current = '';
            }
            scanLastKeyAtRef.current = now;

            if (e.key === 'Enter') {
                const code = scanBufferRef.current.trim();
                scanBufferRef.current = '';
                if (code.length >= 3) {
                    e.preventDefault();
                    handleBarcodeAdd(code);
                }
                return;
            }
            if (e.key.length === 1) {
                scanBufferRef.current += e.key;
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [quickScanEnabled, products]);

    useEffect(() => {
        const onShortcut = (e: KeyboardEvent) => {
            const isResetShortcut = e.ctrlKey && e.shiftKey && e.key === 'Backspace';
            if (!isResetShortcut) return;
            e.preventDefault();
            resetOrderSession();
        };
        window.addEventListener('keydown', onShortcut);
        return () => window.removeEventListener('keydown', onShortcut);
    }, [resetOrderSession]);

    useEffect(() => {
        const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;
        setCanUseScale(!isScaleIntegrationEnabled || !restrictScaleAccess || hasManagePermission(user, 'electron_panel', restaurantId));
        setCanUseCardTerminal(
            !isCardTerminalEnabled ||
            !restrictCardTerminalAccess ||
            hasManagePermission(user, 'payment_terminal', restaurantId)
        );
    }, [isScaleIntegrationEnabled, restrictScaleAccess, isCardTerminalEnabled, restrictCardTerminalAccess, user]);


    return (
        <div onClick={()=> setSearchTerm('')} className="min-h-screen flex flex-col bg-default-100">
            <header
                className="bg-content1 border-b border-default-200 px-6 py-4 flex justify-between items-center shadow-sm">
                <div className={'flex items-center justify-center gap-4'}>
                    <h1 className="text-xl font-bold text-foreground whitespace-nowrap">
                        {editingOrderId != null ? `ویرایش فاکتور #${editingOrderId}` : 'ثبت سفارش'}
                    </h1>
                    <Input
                        placeholder="جستجوی محصول..."
                        value={searchTerm}
                        onValueChange={(value) => {
                            setSelectedCategory('')
                            setSearchTerm(value)
                        }}
                        variant="bordered"
                        classNames={{input: "text-right"}}
                    />
                    <Input
                        placeholder="اسکن بارکد محصول"
                        value={barcodeInput}
                        onValueChange={setBarcodeInput}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleBarcodeAdd();
                            }
                        }}
                        variant="bordered"
                        classNames={{input: "text-right"}}
                    />
                </div>

                <div className="flex gap-2">
                    <Button
                        variant={quickScanEnabled ? "solid" : "bordered"}
                        color="primary"
                        onPress={() => setQuickScanEnabled((v) => !v)}
                    >
                        {quickScanEnabled ? 'اسکن سریع: روشن' : 'اسکن سریع: خاموش'}
                    </Button>
                    {editingOrderId != null && (
                        <Button variant="flat" color="warning" onPress={() => navigate('/orders')}>
                            انصراف از ویرایش
                        </Button>
                    )}
                    <Button variant="flat" color="default" onPress={() => navigate('/orders')}>
                        سفارشات
                    </Button>
                    <Button variant="flat" color="secondary" onPress={() => navigate('/accounting')}>
                        حسابداری
                    </Button>
                    <Button color="primary" variant="flat" onPress={() => navigate('/settings')}>
                        تنظیمات
                    </Button>
                    <Button color="danger" variant="flat" onPress={logout}>
                        خروج
                    </Button>
                </div>
            </header>

            {orderEditError && editingOrderId != null && (
                <div className="px-6 py-3 bg-danger-50 text-danger border-b border-danger-200 text-center" role="alert">
                    {orderEditError}
                </div>
            )}
            {error && (
                <div className="px-6 py-3 bg-danger-50 text-danger border-b border-danger-200 text-center" role="alert">
                    {error}
                </div>
            )}
            {successMessage && (
                <div className="px-6 py-3 bg-success-50 text-success-700 border-b border-success-200 text-center"
                     role="alert">
                    {successMessage}
                </div>
            )}
            {isScaleIntegrationEnabled && !canUseScale && (
                <div className="px-6 py-3 bg-warning-50 text-warning-700 border-b border-warning-200 text-center" role="alert">
                    اتصال ترازو برای این کاربر غیرفعال است. برای دسترسی، از مدیر بخواهید مجوز مدیریت پنل الکترون را فعال کند.
                </div>
            )}
            {isCardTerminalEnabled && !canUseCardTerminal && (
                <div className="px-6 py-3 bg-warning-50 text-warning-700 border-b border-warning-200 text-center" role="alert">
                    دسترسی کارتخوان برای این کاربر غیرفعال است. برای دسترسی، از مدیر بخواهید مجوز «مدیریت کارتخوان» را فعال کند.
                </div>
            )}
            <Group className={"pt-2"}>
                {/*<div className="flex-1 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 p-5 overflow-hidden">*/}
                <Panel>
                    <Card className="overflow-hidden flex flex-col min-h-0 h-[calc(100vh_-120px)]">
                        <CardBody className="flex-1 overflow-hidden flex flex-row gap-0 p-0">
                            <div className="flex-1 overflow-y-auto p-5 min-w-0 relative">
                                {orderEditLoading && (
                                    <div
                                        className="absolute inset-0 z-10 flex items-center justify-center bg-content1/80 text-default-600 text-sm">
                                        در حال بارگذاری فاکتور...
                                    </div>
                                )}
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-12 text-default-500">در حال
                                        بارگذاری...</div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                                        {filteredProducts.map(product => (
                                            <Card
                                                key={product.id}
                                                isPressable
                                                className="border border-default-200"
                                                onPress={() => {
                                                    setSuccessMessage('');
                                                    addToCart(product);
                                                }}
                                            >
                                                <CardBody className="p-0 overflow-hidden">
                                                    {product.multiMedia?.url && (
                                                        <img
                                                            src={`${getAssetBaseUrl()}${product.multiMedia.url}`}
                                                            alt={product.name_fa || product.name}
                                                            className="w-full aspect-square object-cover"
                                                        />
                                                    )}
                                                    <div className="p-3 text-right">
                                                        <h3 className="font-semibold text-foreground text-sm">{product.name_fa || product.name}</h3>
                                                        <p className="text-primary text-sm mt-1">{formatPrice(staffCartUnitPrice(product))}</p>
                                                    </div>
                                                </CardBody>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <aside
                                className="w-52 flex-shrink-0 border-r border-default-200 p-4 flex flex-col gap-2 overflow-y-auto">
                                <span className="font-semibold text-foreground text-sm mb-1">دسته‌بندی‌ها</span>
                                <Button
                                    size="sm"
                                    variant={selectedCategory === '' ? 'solid' : 'bordered'}
                                    color="primary"
                                    className="justify-start"
                                    onPress={() => {
                                        setSelectedCategory('')
                                    }}
                                >
                                    همه
                                </Button>
                                {categories.map(cat => (
                                    <Button
                                        key={cat}
                                        size="sm"
                                        variant={selectedCategory === cat ? 'solid' : 'bordered'}
                                        color="primary"
                                        className="justify-start"
                                        onPress={() => {
                                            setSelectedCategory(cat)
                                            setSearchTerm('')
                                        }}
                                    >
                                        {cat}
                                    </Button>
                                ))}
                            </aside>
                        </CardBody>
                    </Card>
                </Panel>
                <Separator className={'px-2'}/>
                <Panel maxSize={500} minSize={350}>
                    <div className="flex flex-col gap-4 overflow-hidden min-h-0 h-[calc(100vh_-120px)]">
                        <Card className="flex-1 overflow-hidden min-h-0">
                            <CardBody className="overflow-y-auto">
                                <h2 className="text-lg font-semibold text-foreground mb-3">سبد خرید</h2>
                                {cart.length === 0 ? (
                                    <p className="text-default-500 py-6 text-center">سبد خرید خالی است</p>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        {cart.map(item => {
                                            const noteValue = item.itemOption || '';
                                            const isNoteOpen = expandedNoteProductId === item.productId;
                                            const appendOption = (opt: string) => {
                                                const current = (item.itemOption || '').trim();
                                                const sep = current ? '، ' : '';
                                                updateCartItemOption(item.productId, current + sep + opt);
                                            };
                                            const notePreview = noteValue.trim();
                                            const notePreviewShort = notePreview.length > 28 ? notePreview.slice(0, 28) + '…' : notePreview;
                                            const isInteractive = (e: React.MouseEvent) =>
                                                (e.target as HTMLElement).closest('button, input, textarea, select');
                                            return (
                                                <div
                                                    key={item.productId}
                                                    className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-default-200 bg-content1"
                                                    onClick={(e) => {
                                                        if (isInteractive(e)) return;
                                                        updateCartQuantity(item.productId, item.quantity + 1);
                                                    }}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        if (isInteractive(e)) return;
                                                        updateCartQuantity(item.productId, item.quantity - 1);
                                                    }}
                                                    onAuxClick={(e) => {
                                                        if (e.button !== 1) return;
                                                        if (isInteractive(e)) return;
                                                        removeFromCart(item.productId);
                                                    }}
                                                >
                                                    {item.product.multiMedia?.url && (
                                                        <div
                                                            className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                                                            <img
                                                                src={`${getAssetBaseUrl()}${item.product.multiMedia.url}`}
                                                                alt=""
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <span
                                                            className="font-medium text-foreground block">{item.product.name_fa || item.product.name}</span>
                                                        <div className="flex items-center gap-1 mt-1">
                                                            <Button size="sm" isIconOnly variant="flat"
                                                                    onPress={() => {
                                                                        if (item.quantity <= 1) {
                                                                            removeFromCart(item.productId);
                                                                            return;
                                                                        }
                                                                        updateCartQuantity(item.productId, item.quantity - 1);
                                                                    }}>−</Button>
                                                            <Input
                                                                type="number"
                                                                min={0.1}
                                                                step={0.1}
                                                                size="sm"
                                                                className="w-16 text-center"
                                                                value={String(item.quantity)}
                                                                onValueChange={(v) => {
                                                                    const val = parseFloat(String(v).replace(',', '.'));
                                                                    if (!Number.isNaN(val)) {
                                                                        if (val <= 0) removeFromCart(item.productId);
                                                                        else updateCartQuantity(item.productId, val);
                                                                    }
                                                                }}
                                                                onBlur={(e) => {
                                                                    const raw = (e.target as HTMLInputElement).value.replace(',', '.');
                                                                    const v = parseFloat(raw);
                                                                    if (raw === '' || Number.isNaN(v) || v <= 0) updateCartQuantity(item.productId, 1);
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                            <Button size="sm" isIconOnly variant="flat"
                                                                    onPress={() => updateCartQuantity(item.productId, item.quantity + 1)}>+</Button>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="light"
                                                            className={`mt-1 ${notePreview ? 'text-primary' : ''}`}
                                                            onPress={() => setExpandedNoteProductId((id) => (id === item.productId ? null : item.productId))}
                                                            title={notePreview || 'افزودن توضیحات'}
                                                        >
                                                            {notePreview ? notePreviewShort : 'توضیحات'}
                                                        </Button>
                                                    </div>
                                                    {isNoteOpen && (
                                                        <div ref={notePanelRef}
                                                             className="w-full mt-2 p-2 rounded-lg bg-default-100 border border-default-200 space-y-2">
                                                            {cartItemOptions.length > 0 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {cartItemOptions.map(opt => (
                                                                        <Button key={opt} size="sm" variant="bordered"
                                                                                onPress={() => appendOption(opt)}
                                                                                title={`افزودن: ${opt}`}>
                                                                            + {opt}
                                                                        </Button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <Textarea
                                                                value={noteValue}
                                                                onValueChange={(v) => updateCartItemOption(item.productId, v)}
                                                                onBlur={(e) => {
                                                                    const next = e.relatedTarget;
                                                                    if (next != null && notePanelRef.current?.contains(next as Node)) return;
                                                                    setExpandedNoteProductId(null);
                                                                }}
                                                                placeholder="توضیح دستی (اختیاری)"
                                                                minRows={2}
                                                                size="sm"
                                                                classNames={{input: 'text-right'}}
                                                            />
                                                            <Button size="sm" variant="flat"
                                                                    onPress={() => setExpandedNoteProductId(null)}>بستن</Button>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className="font-semibold text-foreground">{formatPrice(item.totalPrice)}</span>
                                                        <Button size="sm" color="danger" variant="light" isIconOnly
                                                                onPress={() => removeFromCart(item.productId)}>×</Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div className="border-t border-default-200 pt-3 mt-3 sticky bottom-0 bg-background shadow">
                                            <div className="flex justify-between font-semibold text-foreground">
                                                <span>جمع کل:</span>
                                                <span>{formatPrice(getTotalAmount())}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardBody>
                        </Card>

                        <Button
                            variant="flat"
                            color="warning"
                            size="md"
                            className="w-full font-semibold"
                            onPress={resetOrderSession}
                        >
                            شروع سفارش جدید (ریست کامل) — {RESET_ORDER_SHORTCUT_LABEL}
                        </Button>
                        <Button
                            color="primary"
                            size="lg"
                            className="w-full font-semibold"
                            onPress={() => setShowOrderModal(true)}
                            isDisabled={cart.length === 0 || orderEditLoading || Boolean(orderEditError && editingOrderId != null)}
                        >
                            {editingOrderId != null ? 'ذخیرهٔ فاکتور' : 'ثبت سفارش'}
                        </Button>
                    </div>
                </Panel>
                {/*</div>*/}
            </Group>

            <Modal isOpen={showOrderModal} onOpenChange={setShowOrderModal} size="2xl" scrollBehavior="inside"
                   classNames={{base: 'order-modal'}}>
                <ModalContent>
                    <ModalHeader className="flex flex-col gap-1 text-right">
                        <h2 className="text-lg font-semibold">
                            {editingOrderId != null ? `ذخیرهٔ تغییرات — فاکتور #${editingOrderId}` : 'تکمیل و ثبت سفارش'}
                        </h2>
                        <p className="text-sm text-default-500 font-normal">
                            {editingOrderId != null
                                ? 'پس از تأیید، فاکتور روی سرور به‌روز می‌شود.'
                                : 'شماره موبایل را وارد کنید و Enter بزنید برای ثبت سریع'}
                        </p>
                    </ModalHeader>
                    <ModalBody className="gap-4" onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        const isTextarea = (e.target as HTMLElement).tagName === 'TEXTAREA';
                        if (isTextarea) return;
                        e.preventDefault();
                        if (!isSubmitting && cart.length > 0 && (!isMobileRequired || customerPhone.trim())) handleSubmit();
                    }}>
                        <div className="flex flex-col gap-2">
                            <Input
                                ref={phoneInputRef}
                                label={`شماره تماس ${isMobileRequired ? '(اجباری)' : ''}`}
                                placeholder="09123456789"
                                value={customerPhone}
                                onValueChange={(v) => {
                                    setCustomerPhone(v);
                                    setUserExists(null);
                                    setLoadedCustomerFirstName('');
                                    setLoadedCustomerLastName('');
                                    setCustomerFirstNameInput('');
                                    setCustomerLastNameInput('');
                                    setSuccessMessage('');
                                    setError('');
                                }}
                                autoComplete="tel"
                                variant="bordered"
                                endContent={
                                    <Button size="sm" isDisabled={isCheckingUser || !customerPhone.trim()}
                                            onPress={handleCheckUser}>
                                        {isCheckingUser ? '...' : '✓'}
                                    </Button>
                                }
                                classNames={{input: 'text-right'}}
                            />
                            {userExists === true && (
                                <span
                                    className="text-success text-sm">{[loadedCustomerFirstName, loadedCustomerLastName].filter(Boolean).join(' ').trim() || 'مشتری ثبت‌نام شده'}</span>
                            )}
                            <div className="flex flex-col gap-2 p-3 rounded-lg bg-default-50 border border-default-200">
                                <span className="text-default-700 text-sm font-medium">نام مشتری (اختیاری)</span>
                                <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                                    <Input
                                        placeholder="نام"
                                        value={customerFirstNameInput}
                                        onValueChange={setCustomerFirstNameInput}
                                        size="sm"
                                        variant="bordered"
                                        classNames={{input: 'text-right'}}
                                    />
                                    <Input
                                        placeholder="نام خانوادگی"
                                        value={customerLastNameInput}
                                        onValueChange={setCustomerLastNameInput}
                                        size="sm"
                                        variant="bordered"
                                        classNames={{input: 'text-right'}}
                                    />
                                </div>
                                <small className="text-default-500 text-xs">
                                    اگر مشتری قبلاً با نام اشتباه/فیک ذخیره شده باشد، با ثبت سفارش نام جدید به‌روزرسانی می‌شود.
                                </small>
                            </div>
                            {userExists === false && (
                                <div
                                    className="flex flex-col gap-3 p-3 rounded-lg bg-warning-50 border border-warning-200">
                                    <span className="text-warning-700 text-sm font-medium">مشتری جدید</span>
                                    <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                                        <Button
                                            size="sm"
                                            color="primary"
                                            isLoading={isAddingCustomer}
                                            onPress={async () => {
                                                const normalized = normalizeIranMobile(customerPhone.trim());
                                                if (!isValidIranMobile(normalized)) {
                                                    setError('فرمت شماره موبایل معتبر نیست. مثال: 09123456789');
                                                    return;
                                                }
                                                const restaurantId = user?.restaurants?.[0]?.id;
                                                const restaurantName = user?.restaurants?.[0]?.name;
                                                if (!token || (!restaurantId && !restaurantName)) return;
                                                setIsAddingCustomer(true);
                                                try {
                                                    await addCustomer(
                                                        {restaurantId, restaurantName},
                                                        {
                                                            mobile: normalized,
                                                            firstName: customerFirstNameInput.trim() || undefined,
                                                            lastName: customerLastNameInput.trim() || undefined
                                                        },
                                                        token,
                                                    );
                                                    setUserExists(true);
                                                    setLoadedCustomerFirstName(customerFirstNameInput.trim());
                                                    setLoadedCustomerLastName(customerLastNameInput.trim());
                                                } catch (err) {
                                                    console.error('Add customer failed:', err);
                                                } finally {
                                                    setIsAddingCustomer(false);
                                                }
                                            }}
                                        >
                                            {isAddingCustomer ? '...' : 'افزودن به مشتریان'}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Select
                            label="نوع سفارش"
                            selectedKeys={[serviceType]}
                            onSelectionChange={(keys) => {
                                const v = Array.from(keys)[0] as 'dine_in' | 'takeaway';
                                if (v) {
                                    setServiceType(v);
                                    setTableNumber('');
                                    setCustomerAddress('');
                                    setCustomerAddresses([]);
                                    setSelectedAddressId(null);
                                }
                            }}
                            variant="bordered"
                        >
                            <SelectItem key="dine_in" textValue="داخل سالن">داخل سالن</SelectItem>
                            <SelectItem key="takeaway" textValue="بیرون‌بر">بیرون‌بر</SelectItem>
                        </Select>

                        {serviceType === 'dine_in' ? (
                            <Input label="شماره میز (اختیاری)" placeholder="A12" value={tableNumber}
                                   onValueChange={setTableNumber} variant="bordered"
                                   classNames={{input: 'text-right'}}/>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-foreground">آدرس</span>
                                {loadingAddresses &&
                                    <p className="text-default-500 text-sm">در حال بارگذاری آدرس‌ها...</p>}
                                {!loadingAddresses && customerAddresses.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                        {customerAddresses.map((addr) => (
                                            <Checkbox key={addr.id} isSelected={selectedAddressId === addr.id}
                                                      onValueChange={() => {
                                                          setSelectedAddressId(addr.id);
                                                          setCustomerAddress(addr.address);
                                                      }}>
                                                <span
                                                    className="text-sm">{addr.label ? `${addr.label}: ` : ''}{addr.address}</span>
                                            </Checkbox>
                                        ))}
                                        <Checkbox isSelected={selectedAddressId === 'new'} onValueChange={() => {
                                            setSelectedAddressId('new');
                                            setCustomerAddress('');
                                        }}>
                                            آدرس جدید
                                        </Checkbox>
                                    </div>
                                )}
                                {(selectedAddressId === 'new' || customerAddresses.length === 0) && (
                                    <Textarea placeholder="آدرس تحویل" value={customerAddress} onValueChange={(v) => {
                                        setCustomerAddress(v);
                                        if (customerAddresses.length > 0) setSelectedAddressId('new');
                                    }} minRows={2} variant="bordered" classNames={{input: 'text-right'}}/>
                                )}
                            </div>
                        )}

                        <Select label="روش پرداخت" selectedKeys={[paymentMethod]} onSelectionChange={(keys) => {
                            const v = Array.from(keys)[0];
                            if (v) setPaymentMethod(v as any);
                        }} variant="bordered">
                            <SelectItem key="cash" textValue="نقد">نقد</SelectItem>
                            <SelectItem key="card" textValue="کارت">کارت</SelectItem>
                            <SelectItem key="online" textValue="آنلاین">آنلاین</SelectItem>
                            <SelectItem key="mixed" textValue="ترکیبی">ترکیبی</SelectItem>
                        </Select>
                        {paymentMethod === 'card' && (
                            <div className="rounded-lg border border-default-200 bg-default-50 p-3 text-sm">
                                {!isCardTerminalEnabled ? (
                                    <p className="text-default-600">کارتخوان برای این رستوران فعال نشده است.</p>
                                ) : !canUseCardTerminal ? (
                                    <p className="text-warning-700">دسترسی استفاده از کارتخوان برای شما فعال نیست.</p>
                                ) : allowDirectSendAmountToCardTerminal ? (
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-success-700">ارسال مستقیم مبلغ به کارتخوان فعال است.</p>
                                        <Button size="sm" color="primary" variant="flat" onPress={handleSendAmountToCardTerminal}>
                                            ارسال مبلغ {formatPrice(getFinalAmount())}
                                        </Button>
                                    </div>
                                ) : (
                                    <p className="text-default-600">ارسال مستقیم مبلغ به کارتخوان توسط مدیر غیرفعال شده است.</p>
                                )}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-foreground">تخفیف</span>
                            <div className="flex gap-2 flex-wrap">
                                <Button size="sm" variant={discountType === 'percentage' ? 'solid' : 'bordered'}
                                        color="primary" onPress={() => setDiscountType('percentage')}>درصدی</Button>
                                <Button size="sm" variant={discountType === 'fixed' ? 'solid' : 'bordered'}
                                        color="primary" onPress={() => setDiscountType('fixed')}>تومانی</Button>
                                <Button size="sm" variant={discountType === 'code' ? 'solid' : 'bordered'}
                                        color="primary" isDisabled={!canUseDiscountCode}
                                        onPress={() => canUseDiscountCode && setDiscountType('code')}
                                        title={!canUseDiscountCode ? 'شماره موبایل و اتصال آنلاین لازم است' : undefined}>کد
                                    تخفیف</Button>
                            </div>
                            {!canUseDiscountCode &&
                                <small className="text-default-500 text-xs">کد تخفیف فقط با وارد کردن شماره موبایل و
                                    اتصال آنلاین فعال است.</small>}
                            {discountType === 'code' ? (
                                <div className="flex flex-col gap-2">
                                    <div className="flex gap-2 flex-wrap items-end">
                                        <Input type="text" placeholder="کد تخفیف" value={discountCode}
                                               onValueChange={(v) => {
                                                   setDiscountCode(v);
                                                   setDiscountCodeError('');
                                               }} isDisabled={!!appliedDiscountCode} variant="bordered"
                                               classNames={{input: 'text-right uppercase'}}/>
                                        {!appliedDiscountCode ? (
                                            <Button size="sm" color="primary" onPress={handleApplyDiscountCode}
                                                    isLoading={discountCodeValidating}
                                                    isDisabled={!discountCode.trim()}>{discountCodeValidating ? 'در حال بررسی...' : 'ثبت'}</Button>
                                        ) : (
                                            <>
                                                <span
                                                    className="text-success text-sm">تخفیف: {formatPrice(appliedDiscountCode.discountAmount)}</span>
                                                <Button size="sm" variant="flat" color="danger"
                                                        onPress={handleCancelDiscountCode}>لغو</Button>
                                            </>
                                        )}
                                    </div>
                                    {discountCodeError &&
                                        <small className="text-danger text-xs">{discountCodeError}</small>}
                                </div>
                            ) : (
                                <>
                                    <Input type="number" min={0} max={discountType === 'percentage' ? 100 : undefined}
                                           placeholder={discountType === 'percentage' ? 'مثال: 10' : 'مثال: 50000'}
                                           value={discountAmount ? String(discountAmount) : ''}
                                           onValueChange={(v) => setDiscountAmount(Number(v) || 0)} variant="bordered"
                                           classNames={{input: 'text-right'}}/>
                                    {getDiscountAmount() > 0 && <small className="text-default-500">مبلغ
                                        تخفیف: {formatPrice(getDiscountAmount())}</small>}
                                </>
                            )}
                        </div>

                        <Textarea label="یادداشت (اختیاری)" placeholder="یادداشت برای آشپزخانه" value={notes}
                                  onValueChange={setNotes} minRows={2} variant="bordered"
                                  classNames={{input: 'text-right'}}/>

                        <div className="rounded-lg bg-default-100 p-4 space-y-2">
                            <div className="flex justify-between text-foreground">
                                <span>جمع کل:</span><span>{formatPrice(getTotalAmount())}</span></div>
                            {discountType === 'code' && appliedDiscountCode ? (
                                <div className="flex justify-between text-foreground">
                                    <span>کد تخفیف ({appliedDiscountCode.code}):</span><span>- {formatPrice(appliedDiscountCode.discountAmount)}</span>
                                </div>
                            ) : getDiscountAmount() > 0 ? (
                                <div className="flex justify-between text-foreground">
                                    <span>تخفیف:</span><span>- {formatPrice(getDiscountAmount())}</span></div>
                            ) : null}
                            <div
                                className="flex justify-between font-bold text-foreground pt-2 border-t border-default-200">
                                <span>مبلغ نهایی:</span>
                                <span>{discountType === 'code' && !appliedDiscountCode && discountCode.trim() ? '— (کد را ثبت کنید)' : formatPrice(getFinalAmount())}</span>
                            </div>
                        </div>

                        {isElectronWithPrinters && (
                            <div className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-foreground">چاپ رسید</span>
                                <div className="flex gap-2 flex-wrap">
                                    <Button size="sm" variant={printOption === 'all' ? 'solid' : 'bordered'}
                                            color="primary" onPress={() => setPrintOption('all')}>چاپ روی همه</Button>
                                    <Button size="sm" variant={printOption === 'none' ? 'solid' : 'bordered'}
                                            color="primary" onPress={() => setPrintOption('none')}>بدون چاپ</Button>
                                    <Button size="sm" variant={printOption === 'select' ? 'solid' : 'bordered'}
                                            color="primary" onPress={() => {
                                        setPrintOption('select');
                                        if (selectedPrinterNames.length === 0) setSelectedPrinterNames(enabledPrinters.map((p) => p.name));
                                    }}>انتخاب پرینتر</Button>
                                </div>
                                {printOption === 'select' && (
                                    <div className="flex flex-col gap-2">
                                        {enabledPrinters.map((printer) => (
                                            <Checkbox key={printer.name}
                                                      isSelected={selectedPrinterNames.includes(printer.name)}
                                                      onValueChange={(checked) => {
                                                          if (checked) setSelectedPrinterNames((prev) => [...prev, printer.name]); else setSelectedPrinterNames((prev) => prev.filter((n) => n !== printer.name));
                                                      }}>
                                                {printer.displayName || printer.name}
                                            </Checkbox>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {enabledPrinters.length > 0 && printOption === 'all' &&
                            <p className="text-default-500 text-sm">{enabledPrinters.length} پرینتر برای چاپ رسید فعال
                                است.</p>}
                        {isElectronWithPrinters && printOption === 'none' &&
                            <p className="text-default-400 text-sm">این سفارش بدون چاپ رسید ثبت می‌شود.</p>}
                    </ModalBody>
                    <ModalFooter className="gap-2">
                        <Button variant="flat" onPress={() => setShowOrderModal(false)}
                                isDisabled={isSubmitting}>انصراف</Button>
                        <Button color="primary" onPress={handleSubmit} isLoading={isSubmitting}
                                isDisabled={cart.length === 0}>
                            {isSubmitting
                                ? (editingOrderId != null ? 'در حال ذخیره...' : 'در حال ثبت...')
                                : (editingOrderId != null ? 'ذخیرهٔ فاکتور' : 'ثبت نهایی')}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    );
}

