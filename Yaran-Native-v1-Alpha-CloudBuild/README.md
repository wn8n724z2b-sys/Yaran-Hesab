# Yaran Financial System — Native v1 Alpha

این پروژه پایه نسخه دسکتاپ Native یاران برای Windows 10/11 64-bit است.

## چه چیزی Native شده؟
- پوسته Windows با Tauri 2
- ذخیره اصلی اطلاعات در SQLite (`yaran.sqlite3`)
- SQLite در حالت WAL و Foreign Keys فعال
- سیستم Migration برای تغییرات آینده دیتابیس
- Backup واقعی SQLite با `VACUUM INTO`
- لایه Native برای شناسایی Printerهای نصب‌شده در Windows
- UI فعلی v0.6.1 با RTL، Dark/Light، POS، کالا، فاکتور، دوره حسابی و گزارش‌ها

در این Alpha، UI برای سازگاری با نسخه قبلی یک Mirror در LocalStorage هم دارد، اما هنگام اجرا ابتدا داده Canonical از SQLite خوانده می‌شود و هر Save به SQLite نیز فرستاده می‌شود. در مرحله بعد جداول دامنه (`products`, `sales`, `inventory_ledger` و...) مستقیماً جای JSON state را می‌گیرند.

## مسیر دیتابیس
Tauri دیتابیس را در AppData مخصوص برنامه می‌سازد. نام فایل:

`yaran.sqlite3`

Backupهای Native داخل پوشه `backups` همان AppData ساخته می‌شوند.

## اجرای توسعه روی Windows 10/11
پیش‌نیازهای Tauri روی Windows:
1. Microsoft C++ Build Tools با workload «Desktop development with C++»
2. Microsoft Edge WebView2
3. Rust با toolchain `stable-msvc`
4. Node.js LTS برای Tauri CLI

سپس PowerShell را در ریشه پروژه باز کنید:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\SETUP_WINDOWS.ps1
```

برای اجرای Alpha:

```powershell
npm run dev
```

یا `RUN_DEV_WINDOWS.bat` را اجرا کنید.

## ساخت Setup.exe

```powershell
npm run build
```

یا `BUILD_WINDOWS.bat`.

خروجی NSIS معمولاً در مسیر زیر ساخته می‌شود:

`src-tauri\target\release\bundle\nsis\`

## ساختار Migration
- `001_core.sql`: state، audit و backup registry
- `002_domain.sql`: کالا، دسته، بارکد، اشخاص، فاکتور، اقلام، کاردکس و دوره حسابی
- `003_indexes.sql`: ایندکس‌های جستجو و گزارش

هر تغییر آینده دیتابیس باید به‌صورت migration جدید اضافه شود؛ فایل‌های migration قبلی نباید تغییر کنند.

## مرحله بعد
1. انتقال کامل CRUD کالاها از JSON state به جداول SQLite
2. انتقال فروش به transaction واقعی SQLite
3. Audit Log واقعی برای ویرایش/حذف فاکتور
4. چاپ مستقیم XPrinter ESC/POS + Raster فارسی
5. انتخاب Printer از لیست Windows
6. Backup retention و Restore داخل خود برنامه
7. کاربران و Permissionها با Hash رمز
8. Importer داده محک
9. Cloud Sync پس از پایدار شدن Desktop

## نکته مهم
این پوشه سورس Native Alpha است، نه فایل Setup از پیش کامپایل‌شده. تولید `Setup.exe` استاندارد Tauri برای Windows بهتر است روی خود Windows انجام شود.

## Cloud Build (recommended)

This project includes `.github/workflows/build-windows.yml`. Upload the repository to GitHub, open **Actions → Build Yaran for Windows → Run workflow**, then download the `Yaran-Windows-Installer` artifact from the completed run. This avoids installing Visual Studio, Rust and Node.js on the shop PC.
