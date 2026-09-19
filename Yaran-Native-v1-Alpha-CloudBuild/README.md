# Yaran Financial System — Native v1.0

نسخه v1.0 هسته محلی Yaran برای Windows 10/11 64-bit است. اطلاعات اصلی از اولین اجرا در SQLite داخل AppData ویندوز ذخیره می‌شوند و برای استفاده روزانه به مرورگر، Node.js، Rust یا PowerShell نیاز نیست.

## امکانات اصلی
- رابط RTL مینیمال با Light و Telegram Dark
- POS فروش، بارکدخوان USB HID و جستجوی دری/فارسی
- کالا، عکس، دسته‌بندی، شرکت تولیدکننده و حداکثر 15 بارکد برای هر کالا
- خرید تک‌واحدی یا بسته/جعبه و فروش دانه‌ای با میانگین موزون بهای خرید
- انبار و گردش موجودی
- مشتری، تأمین‌کننده، قرض مشتری و قرض شرکت
- هزینه‌ها و گزارش مالی
- دوره حسابی دستی با ماه‌شمار
- فاکتورهای قابل ویرایش و حذف همراه Audit Log و نگهداری Revision
- SQLite WAL و Transaction برای عملیات حساس
- Backup Native SQLite با نگهداری 30 نسخه آخر و Restore آخرین Backup
- بررسی سلامت SQLite از داخل تنظیمات
- چاپ مستقیم رسید 80mm از طریق Windows Driver، مناسب XPrinter و پرینترهای حرارتی نصب‌شده
- چاپ رسید به‌صورت Raster برای حفظ شکل درست متن دری/فارسی
- شناسایی پرینترهای Windows از داخل تنظیمات
- نصب NSIS و اجرای بدون Console/PowerShell در Release

## رمز بخش داده‌ها و پشتیبانی
رمز اولیه مدیر: `admin`

## محل دیتابیس
Yaran دیتابیس را در AppData کاربر Windows با نام `yaran.sqlite3` نگه می‌دارد. مسیر دقیق از Native Health قابل تشخیص است.

## چاپ XPrinter
پرینتر باید Driver ویندوز خود را داشته باشد. از تنظیمات Yaran روی «شناسایی» بزنید و پرینتر نصب‌شده را انتخاب کنید. چاپ Native بدون Print Dialog انجام می‌شود. قابلیت Auto Cut به تنظیم و پشتیبانی Driver/مدل پرینتر وابسته است.

## بارکدخوان
بارکدخوان‌های USB Laser که در حالت HID Keyboard کار می‌کنند مستقیم پشتیبانی می‌شوند. Suffix پیش‌فرض Enter است.

## Build در GitHub Actions
Repository باید محتویات همین پوشه را در Root داشته باشد. سپس Workflow موجود در `.github/workflows/build-windows.yml` روی Windows GitHub Runner فایل Setup را می‌سازد.

خروجی Installer در Artifact با نام `Yaran-Windows-Installer` قرار می‌گیرد.

## محدوده v1.0
این Release، نسخه Local/Desktop است. Cloud Sync و داشبورد آنلاین به‌عنوان ماژول جداگانه بعداً روی همین دیتابیس و API اضافه می‌شوند و برای کارکرد روزانه نسخه Local لازم نیستند.
