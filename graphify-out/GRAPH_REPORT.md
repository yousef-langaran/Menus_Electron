# Graph Report - .  (2026-07-03)

## Corpus Check
- 131 files · ~186,805 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1213 nodes · 2711 edges · 63 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Accounting Offline DB|Accounting Offline DB]]
- [[_COMMUNITY_Electron Preferences Store|Electron Preferences Store]]
- [[_COMMUNITY_Accounting Offline DB (2)|Accounting Offline DB (2)]]
- [[_COMMUNITY_Electron Preferences Store (2)|Electron Preferences Store (2)]]
- [[_COMMUNITY_Electron Preferences Store (3)|Electron Preferences Store (3)]]
- [[_COMMUNITY_Cash Accounts Page|Cash Accounts Page]]
- [[_COMMUNITY_Iran Mobile Utils|Iran Mobile Utils]]
- [[_COMMUNITY_Caller ID (Webhook)|Caller ID (Webhook)]]
- [[_COMMUNITY_Caller ID Overlay|Caller ID Overlay]]
- [[_COMMUNITY_Accounting Offline DB (3)|Accounting Offline DB (3)]]
- [[_COMMUNITY_Purchase Returns Page|Purchase Returns Page]]
- [[_COMMUNITY_Caller ID (USB HID)|Caller ID (USB HID)]]
- [[_COMMUNITY_Inventory Kardex Page|Inventory Kardex Page]]
- [[_COMMUNITY_electron-builder Config|electron-builder Config]]
- [[_COMMUNITY_Receipt Number Storage|Receipt Number Storage]]
- [[_COMMUNITY_Service Jobs Offline DB|Service Jobs Offline DB]]
- [[_COMMUNITY_Accounting Offline DB (4)|Accounting Offline DB (4)]]
- [[_COMMUNITY_Service Jobs Offline DB (2)|Service Jobs Offline DB (2)]]
- [[_COMMUNITY_TS Config|TS Config]]
- [[_COMMUNITY_Raw Materials Page|Raw Materials Page]]
- [[_COMMUNITY_Order Return Modal|Order Return Modal]]
- [[_COMMUNITY_Name Autocomplete|Name Autocomplete]]
- [[_COMMUNITY_Runtime Dependencies|Runtime Dependencies]]
- [[_COMMUNITY_Weighing Scale (SerialTCP)|Weighing Scale (Serial/TCP)]]
- [[_COMMUNITY_Service Jobs Offline DB (3)|Service Jobs Offline DB (3)]]
- [[_COMMUNITY_Purchase Drafts Page|Purchase Drafts Page]]
- [[_COMMUNITY_Purchase Returns Page (2)|Purchase Returns Page (2)]]
- [[_COMMUNITY_Service Jobs Offline DB (4)|Service Jobs Offline DB (4)]]
- [[_COMMUNITY_Offline Order Storage|Offline Order Storage]]
- [[_COMMUNITY_Accounting Offline DB (5)|Accounting Offline DB (5)]]
- [[_COMMUNITY_Service Jobs Offline DB (5)|Service Jobs Offline DB (5)]]
- [[_COMMUNITY_Electron Preferences Store (4)|Electron Preferences Store (4)]]
- [[_COMMUNITY_Caller ID (Serial)|Caller ID (Serial)]]
- [[_COMMUNITY_Caller ID Store|Caller ID Store]]
- [[_COMMUNITY_Caller ID Capture Script|Caller ID Capture Script]]
- [[_COMMUNITY_Orders Socket Manager|Orders Socket Manager]]
- [[_COMMUNITY_Shared Types|Shared Types]]
- [[_COMMUNITY_TS Config (Electron)|TS Config (Electron)]]
- [[_COMMUNITY_Dev Dependencies|Dev Dependencies]]
- [[_COMMUNITY_NPM Scripts|NPM Scripts]]
- [[_COMMUNITY_REST API Client|REST API Client]]
- [[_COMMUNITY_Auth Store|Auth Store]]
- [[_COMMUNITY_Electron Local DB|Electron Local DB]]
- [[_COMMUNITY_Permissions  RBAC|Permissions / RBAC]]
- [[_COMMUNITY_REST API Client (2)|REST API Client (2)]]
- [[_COMMUNITY_Renderer|Renderer]]
- [[_COMMUNITY_TS Config (2)|TS Config (2)]]
- [[_COMMUNITY_diag2|diag2]]
- [[_COMMUNITY_Electron Preferences Store (5)|Electron Preferences Store (5)]]
- [[_COMMUNITY_Electron Services|Electron Services]]
- [[_COMMUNITY_hid_class|hid_class]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_scripts_write|scripts_write]]
- [[_COMMUNITY_Electron Main|Electron Main]]
- [[_COMMUNITY_scripts_copy|scripts_copy]]
- [[_COMMUNITY_Renderer Components|Renderer Components]]
- [[_COMMUNITY_Renderer Components (2)|Renderer Components (2)]]
- [[_COMMUNITY_diag|diag]]
- [[_COMMUNITY_Electron Main (2)|Electron Main (2)]]

## God Nodes (most connected - your core abstractions)
1. `useAuthStore` - 74 edges
2. `Button()` - 32 edges
3. `runAccountingSync()` - 28 edges
4. `readPreferences()` - 27 edges
5. `Input` - 26 edges
6. `toast` - 26 edges
7. `runCatalogSync()` - 22 edges
8. `ModalShell()` - 22 edges
9. `useSyncStore` - 21 edges
10. `compilerOptions` - 21 edges

## Surprising Connections (you probably didn't know these)
- `CallHistoryPage()` --calls--> `useCallerIdStore`  [EXTRACTED]
  src/pages/CallHistoryPage.tsx → src/store/callerIdStore.ts
- `CardTerminalsPage()` --calls--> `useAuthStore`  [EXTRACTED]
  src/pages/CardTerminals.tsx → src/store/authStore.ts
- `CategoriesPage()` --calls--> `useAuthStore`  [EXTRACTED]
  src/pages/Categories.tsx → src/store/authStore.ts
- `ServiceJobsPage()` --calls--> `useAuthStore`  [EXTRACTED]
  src/pages/ServiceJobs.tsx → src/store/authStore.ts
- `AccountingExpenseCategoriesPage()` --calls--> `useAuthStore`  [EXTRACTED]
  src/pages/accounting/ExpenseCategories.tsx → src/store/authStore.ts

## Import Cycles
- 1-file cycle: `electron/updater.ts -> electron/updater.ts`

## Communities (63 total, 0 thin omitted)

### Community 0 - "Accounting Offline DB"
Cohesion: 0.05
Nodes (69): CategoriesPage(), CategoryForm, emptyForm, emptyForm, formatPriceInput(), normalizeDigits(), normalizePriceInput(), PRODUCT_UNITS (+61 more)

### Community 1 - "Electron Preferences Store"
Cohesion: 0.09
Nodes (43): ApiConfig, getApiConfig(), getBaseUrlFromEnv(), getUpdateServerUrl(), readPackagedUpdateEnvFromDist(), deleteOrder(), getAllOrders(), getDbPath() (+35 more)

### Community 2 - "Accounting Offline DB (2)"
Cohesion: 0.06
Nodes (30): AccountingExpenseCategoriesPage(), AccountingExpensesPage(), todayIso(), listExpenseCategoriesLocal(), AccountingPushOperation, api, AUTH_WHITELIST_ENDPOINTS, closeFiscalYear() (+22 more)

### Community 3 - "Electron Preferences Store (2)"
Cohesion: 0.08
Nodes (37): loadReceiptPriceDisplayUnit(), ReceiptPriceDisplayUnit, createFormatPrice(), createPrintWindow(), detectPrinters(), generateKitchenReceiptHTML(), generateReceiptHTML(), generateReceiptHTMLFromLayout() (+29 more)

### Community 4 - "Electron Preferences Store (3)"
Cohesion: 0.07
Nodes (37): CallerIdInputMode, CallerIdSerialFormat, CallerIdSettings, CardTerminalConfig, CardTerminalHttpMethod, CardTerminalProfile, CardTerminalSendAmountUnit, DEFAULT_CALLER_ID_SETTINGS (+29 more)

### Community 5 - "Cash Accounts Page"
Cohesion: 0.09
Nodes (24): ACCOUNT_TYPES, CashAccountsPage(), todayIso(), TRANSACTION_TYPE_LABELS, accountingDb, accountTypeLabel(), CashAccountTransaction, CashAccountType (+16 more)

### Community 6 - "Iran Mobile Utils"
Cohesion: 0.12
Nodes (25): formatPriceInput(), normalizePriceInput(), OrderModal(), OrderModalState, Props, formatPriceInput(), normalizePriceInput(), OrderPage() (+17 more)

### Community 7 - "Caller ID (Webhook)"
Cohesion: 0.09
Nodes (23): CardTerminalSettings, loadCallerIdSettings(), loadCardTerminalConfig(), loadCardTerminalSettings(), loadDefaultPrintTemplate(), loadPosWarehouseId(), loadPrinterConfigs(), loadPrintTemplatesMap() (+15 more)

### Community 8 - "Caller ID Overlay"
Cohesion: 0.08
Nodes (26): AccountingExpenseCategoriesPage, AccountingExpensesPage, AccountingKardexPage, AccountingPage, AccountingPurchaseDraftsPage, AccountingPurchaseReturnsPage, AccountingRawMaterialCategoriesPage, AccountingRawMaterialsPage (+18 more)

### Community 9 - "Accounting Offline DB (3)"
Cohesion: 0.13
Nodes (30): getPendingAccountingOperations(), getPendingCashTransactions(), getPendingPurchaseInvoiceDrafts(), getPendingPurchaseReturnDrafts(), getSyncMeta(), mapCollectionName(), markCashTransactionsSynced(), reconcileDeletedEntities() (+22 more)

### Community 10 - "Purchase Returns Page"
Cohesion: 0.09
Nodes (22): formatDate(), toJalali(), toJalali(), CallHistoryPage(), DateFilter, formatDateTime(), KnownFilter, formatDate() (+14 more)

### Community 11 - "Caller ID (USB HID)"
Cohesion: 0.11
Nodes (11): CallEndedCallback, CallerIdHidService, CallerIdHidSettings, CallerRecord, DEFAULT_CALLER_ID_HID_SETTINGS, HidDevice, IncomingCallCallback, listHidDevices() (+3 more)

### Community 12 - "Inventory Kardex Page"
Cohesion: 0.09
Nodes (20): formatQty(), ItemType, KardexReportPage(), MOVEMENT_LABELS, CardTerminalProfile, CardTerminalSettings, CardTerminalsPage(), COMPANY_PRESETS (+12 more)

### Community 13 - "electron-builder Config"
Cohesion: 0.07
Nodes (27): build, appId, directories, extraResources, files, linux, mac, nsis (+19 more)

### Community 14 - "Receipt Number Storage"
Cohesion: 0.10
Nodes (21): SubmitOptions, DEFAULT_ONLINE_META, ORDERS_PAGE_SIZE_OPTIONS, OrdersPage(), STATUS_LABELS, STATUS_OPTIONS, createCreditPayment(), createCustomerAddress() (+13 more)

### Community 15 - "Service Jobs Offline DB"
Cohesion: 0.14
Nodes (26): addServiceJobItemRemote(), createServiceJobRemote(), getServiceBoards(), getServiceJobRemote(), listServiceJobsRemote(), moveServiceJobStatusRemote(), removeServiceJobItemRemote(), updateServiceJobItemRemote() (+18 more)

### Community 16 - "Accounting Offline DB (4)"
Cohesion: 0.15
Nodes (19): App(), AppRoutes(), GlobalShortcutListener(), RequireAuth(), AccountingSyncManager(), OfflineOrdersSync(), ServiceJobsSyncManager(), SyncErrorBanner() (+11 more)

### Community 17 - "Service Jobs Offline DB (2)"
Cohesion: 0.12
Nodes (21): addServiceJobItemLocal(), bulkUpsertServerJobs(), createServiceJobLocal(), enqueueOp(), getOpsStateMap(), LocalFormField, LocalServiceJobOp, MenusServiceJobsDb (+13 more)

### Community 18 - "TS Config"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, allowSyntheticDefaultImports, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx (+16 more)

### Community 19 - "Raw Materials Page"
Cohesion: 0.11
Nodes (18): IssueInvoiceModal(), AccountingRawMaterialCategoriesPage(), AccountingRawMaterialsPage(), listRawMaterialCategoriesLocal(), createRawMaterialCategory(), deleteRawMaterialCategory(), listUnits(), RawMaterialCategoryRow (+10 more)

### Community 20 - "Order Return Modal"
Cohesion: 0.12
Nodes (17): CreateOrderReturnModalProps, RETURN_REASONS, formatCurrency(), ReturnItem, STATUS_CONFIG, approvePurchaseReturn(), cancelPurchaseReturn(), createOrderReturn() (+9 more)

### Community 21 - "Name Autocomplete"
Cohesion: 0.15
Nodes (18): OrderCart(), Props, useOrderSubmit(), useProductLoader(), formatPriceInput(), INITIAL_MODAL_STATE, normalizePriceInput(), OrderPage() (+10 more)

### Community 22 - "Runtime Dependencies"
Cohesion: 0.10
Nodes (21): dependencies, axios, dexie, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, dotenv, electron-updater (+13 more)

### Community 23 - "Weighing Scale (Serial/TCP)"
Cohesion: 0.14
Nodes (8): DEFAULT_SCALE_SETTINGS, getSerialPort(), listSerialPorts(), parseWeight(), ScaleConnectionType, ScaleService, ScaleSettings, WeightCallback

### Community 24 - "Service Jobs Offline DB (3)"
Cohesion: 0.17
Nodes (16): AddJobItemModal(), ITEM_TYPES, Props, CreateJobModal(), Props, JobDetailPanel(), PRIORITY_OPTIONS, addServiceJobAttachmentRemote() (+8 more)

### Community 25 - "Purchase Drafts Page"
Cohesion: 0.12
Nodes (17): AccountingPurchaseDraftsPage(), DraftItem, formatCurrency(), formatPriceInput(), INVOICE_STATUS_CONFIG, ItemType, normalizePriceInput(), SYNC_STATUS_CONFIG (+9 more)

### Community 26 - "Purchase Returns Page (2)"
Cohesion: 0.22
Nodes (14): RoutePermissionGuard(), canAccessRoute(), canManageHardwareSettings(), getPrimaryRestaurantId(), hasModuleAccess(), hasOrderRegisterAccess(), isOwnerOrAdmin(), isSystemAdmin() (+6 more)

### Community 27 - "Service Jobs Offline DB (4)"
Cohesion: 0.14
Nodes (15): JobCard(), JobCardOverlay(), JobCardProps, PRIORITY_COLOR, PRIORITY_LABEL, CATEGORY_BG, KanbanBoard(), KanbanBoardProps (+7 more)

### Community 28 - "Offline Order Storage"
Cohesion: 0.13
Nodes (13): createOrder(), updateOrder(), getAllOrders(), saveOfflineOrder(), AppliedDiscountCode, calcDiscountAmount(), calcFinalAmount(), calcTotalAmount() (+5 more)

### Community 29 - "Accounting Offline DB (5)"
Cohesion: 0.24
Nodes (18): createExpenseCategoryLocal(), createFinalProductLocal(), createOperationalExpenseLocal(), createPurchaseReturnLocal(), createRawMaterialCategoryLocal(), createRawMaterialLocal(), createSupplierLocal(), deleteExpenseCategoryLocal() (+10 more)

### Community 30 - "Service Jobs Offline DB (5)"
Cohesion: 0.15
Nodes (15): DynamicField(), getFieldOptions(), PRIORITY_OPTIONS, Props, Props, getServiceJobStaffRemote(), phoneLookupServiceJobRemote(), registerServiceCustomerRemote() (+7 more)

### Community 31 - "Electron Preferences Store (4)"
Cohesion: 0.23
Nodes (16): clearUserSession(), getPreferencesPath(), readPreferences(), saveCallerIdSettings(), saveCardTerminalConfig(), saveCardTerminalSettings(), saveDefaultPrintTemplate(), savePosWarehouseId() (+8 more)

### Community 32 - "Caller ID (Serial)"
Cohesion: 0.19
Nodes (9): CallerIdSerialFormat, CallerIdSerialService, CallerIdSerialSettings, DEFAULT_CALLER_ID_SERIAL_SETTINGS, getSerialPort(), IncomingCallCallback, normalizePhone(), parseCallerIdLine() (+1 more)

### Community 33 - "Caller ID Store"
Cohesion: 0.15
Nodes (11): addCustomer(), callerLookup(), CallerLookupResult, CallerIdState, IncomingCall, applyStoredTheme(), applyToDocument(), getStoredTheme() (+3 more)

### Community 34 - "Caller ID Capture Script"
Cohesion: 0.13
Nodes (9): device, ep, fs, iface, KNOWN_NOISE, seen, timer, usb (+1 more)

### Community 35 - "Orders Socket Manager"
Cohesion: 0.18
Nodes (8): OrdersSocketManager(), useNotificationPermission(), API_BASE_URL, connectOrdersSocket(), disconnectOrdersSocket(), OrdersSocketOptions, resolveSocketBaseUrl(), attachOrdersSocketPanelSidecar()

### Community 36 - "Shared Types"
Cohesion: 0.13
Nodes (14): ActionKey, ACTIONS, DiscountType, ModuleKey, MODULES, OrderStatus, PaymentMethod, Restaurant (+6 more)

### Community 37 - "TS Config (Electron)"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 38 - "Dev Dependencies"
Cohesion: 0.14
Nodes (14): devDependencies, concurrently, electron, electron-builder, @electron/rebuild, tailwindcss, @tailwindcss/vite, @types/node (+6 more)

### Community 39 - "NPM Scripts"
Cohesion: 0.14
Nodes (14): scripts, build, build:electron, build:react, dev, dev:electron, dev:react, dist (+6 more)

### Community 40 - "REST API Client"
Cohesion: 0.19
Nodes (10): OrderProductGrid(), Props, getApiBaseUrl(), getAssetBaseUrl(), Button(), CompatButtonProps, HeroBtn, LegacyColor (+2 more)

### Community 41 - "Auth Store"
Cohesion: 0.19
Nodes (10): fetchProfile(), getActiveSubscription(), login(), setLiveToken(), AuthState, checkSubscription(), hydrateUserProfile(), Subscription (+2 more)

### Community 42 - "Electron Local DB"
Cohesion: 0.17
Nodes (4): CacheDatabase, CachedMenu, CachedUser, db

### Community 43 - "Permissions / RBAC"
Cohesion: 0.26
Nodes (9): accountingGroupActive(), catalogGroupActive(), ElectronMenubar(), NavLeaf, salesGroupActive(), serviceJobsActive(), useOnlineFlag(), AppShellLayout() (+1 more)

### Community 44 - "REST API Client (2)"
Cohesion: 0.27
Nodes (6): LoginPage(), getCachedClientVersion(), getClientRequirements(), compareVersions(), isVersionOutdated(), parseVersion()

### Community 45 - "Renderer"
Cohesion: 0.20
Nodes (9): ElectronPrinterJob, ElectronPrintErrorCode, ElectronPrinterStatusCode, ElectronPrintFailureDetail, ElectronPrintReceiptType, ElectronPrintResult, ImportMeta, ImportMetaEnv (+1 more)

### Community 46 - "TS Config (2)"
Cohesion: 0.20
Nodes (9): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, noEmit, skipLibCheck, strict (+1 more)

### Community 47 - "diag2"
Cohesion: 0.22
Nodes (6): combos, device, iface, last, poll, usb

### Community 48 - "Electron Preferences Store (5)"
Cohesion: 0.33
Nodes (9): assignReceiptNumberForOrder(), getNextReceiptNumber(), getReceiptNumbersMap(), getReceiptNumbersMapPath(), setReceiptNumberForOrder(), setReceiptNumbersForOrder(), withReceiptNumberLock(), enqueuePrinterTask() (+1 more)

### Community 49 - "Electron Services"
Cohesion: 0.42
Nodes (8): cacheImage(), cacheImages(), clearImageCache(), ensureCacheDir(), getCachedImagePath(), getImageCacheDir(), getImageUrl(), urlToFilename()

### Community 50 - "hid_class"
Cohesion: 0.22
Nodes (6): device, ep, fs, iface, poll, usb

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): author, description, keywords, license, main, name, version

### Community 52 - "scripts_write"
Cohesion: 0.25
Nodes (7): dotenv, envPath, fs, outDir, outPath, path, rootDir

### Community 53 - "Electron Main"
Cohesion: 0.29
Nodes (6): ElectronPrintErrorCode, ElectronPrinterStatusCode, ElectronPrintFailureDetail, ElectronPrintReceiptType, ElectronPrintResult, Window

### Community 54 - "scripts_copy"
Cohesion: 0.29
Nodes (6): dest, example, fs, path, releaseDir, root

### Community 55 - "Renderer Components"
Cohesion: 0.43
Nodes (5): CatalogSyncManager(), runQueued(), scheduleAccountingSync(), scheduleCatalogSync(), SyncTask

### Community 56 - "Renderer Components (2)"
Cohesion: 0.29
Nodes (3): ErrorBoundary, Props, State

### Community 57 - "diag"
Cohesion: 0.33
Nodes (4): device, iface, poll, usb

### Community 58 - "Electron Main (2)"
Cohesion: 0.60
Nodes (5): deleteJsonFile(), ensureDir(), getStorePath(), readJsonFile(), writeJsonFile()

## Knowledge Gaps
- **379 isolated node(s):** `usb`, `fs`, `device`, `iface`, `KNOWN_NOISE` (+374 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAuthStore` connect `Accounting Offline DB (4)` to `Accounting Offline DB`, `Accounting Offline DB (2)`, `Cash Accounts Page`, `Iran Mobile Utils`, `Caller ID Overlay`, `Purchase Returns Page`, `Inventory Kardex Page`, `Receipt Number Storage`, `Raw Materials Page`, `Order Return Modal`, `Name Autocomplete`, `Purchase Drafts Page`, `Purchase Returns Page (2)`, `Service Jobs Offline DB (4)`, `Offline Order Storage`, `Orders Socket Manager`, `Auth Store`, `Permissions / RBAC`, `REST API Client (2)`, `Renderer Components`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Runtime Dependencies` to `package.json`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `electron-updater` connect `Runtime Dependencies` to `Electron Preferences Store`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `usb`, `fs`, `device` to the rest of the system?**
  _379 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Accounting Offline DB` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Electron Preferences Store` be split into smaller, more focused modules?**
  _Cohesion score 0.08843537414965986 - nodes in this community are weakly interconnected._
- **Should `Accounting Offline DB (2)` be split into smaller, more focused modules?**
  _Cohesion score 0.05603864734299517 - nodes in this community are weakly interconnected._