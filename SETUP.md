# دليل الإعداد - نظام إضافة البطاقات

## 🚀 الإعداد السريع

### الطريقة الأولى: الإعداد التلقائي (مُوصى به)

```bash
# 1. استنساخ المشروع
git clone <repository-url>
cd facebook-card-adder-system

# 2. الإعداد التلقائي
make setup
```

هذا الأمر سيقوم بـ:
- إنشاء ملفات البيئة تلقائياً
- تشغيل Redis
- تثبيت التبعيات
- إعداد النظام كاملاً

### الطريقة الثانية: الإعداد اليدوي

```bash
# 1. إنشاء ملفات البيئة
make setup-env

# 2. تشغيل Redis
make docker-up

# 3. تثبيت التبعيات
make install

# 4. تشغيل النظام
make dev
```

## 📋 متطلبات النظام

- **Node.js**: الإصدار 18 أو أحدث
- **npm**: الإصدار 8 أو أحدث
- **Docker**: لتشغيل Redis
- **Git**: لاستنساخ المشروع

## 🔐 إعداد MongoDB Atlas

### 1. إنشاء حساب MongoDB Atlas
- اذهب إلى [MongoDB Atlas](https://cloud.mongodb.com)
- أنشئ حساب جديد أو سجل دخول

### 2. إنشاء Cluster
- اختر "Build a Database"
- اختر "FREE" tier
- اختر Provider (AWS, Google Cloud, Azure)
- اختر Region
- انقر "Create"

### 3. إنشاء مستخدم قاعدة البيانات
- في "Security" → "Database Access"
- انقر "Add New Database User"
- Username: `fitraynapp`
- Password: `mwp0jfjWFapPFOUr`
- Role: "Read and write to any database"
- انقر "Add User"

### 4. إعداد Network Access
- في "Security" → "Network Access"
- انقر "Add IP Address"
- اختر "Allow Access from Anywhere" (0.0.0.0/0)
- انقر "Confirm"

### 5. الحصول على Connection String
- في "Database" → "Connect"
- اختر "Connect your application"
- انسخ Connection String

## ⚙️ إعداد متغيرات البيئة

### 1. إنشاء ملف server/.env

```bash
cp env.example server/.env
```

### 2. محتوى الملف

```env
# Server Configuration
NODE_ENV=development
PORT=4000

# MongoDB Atlas Configuration
MONGODB_URI=mongodb+srv://fitraynapp:mwp0jfjWFapPFOUr@cluster0.xrmj2mp.mongodb.net/card-adder?retryWrites=true&w=majority&appName=Cluster0

# Redis Configuration (Local)
REDIS_URL=redis://localhost:6379

# Security Configuration
JWT_SECRET=card-adder-system-super-secret-jwt-key-2024
AES_KEY_BASE64=dGVzdC1rZXktZm9yLWVuY3J5cHRpb24tdGVzdC1rZXk=
AES_IV_BASE64=dGVzdC1pdi1rZXk=

# CORS Configuration
CORS_ORIGIN=*
```

### 3. إنشاء ملف web/.env.local

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > web/.env.local
```

## 🐳 تشغيل Redis

### باستخدام Docker Compose

```bash
# تشغيل Redis
make docker-up

# أو
docker-compose up -d

# إيقاف Redis
make docker-down

# أو
docker-compose down

# عرض السجلات
make docker-logs
```

### بدون Docker

```bash
# تثبيت Redis على Windows
# استخدم Redis for Windows أو WSL2

# تشغيل Redis
redis-server

# في terminal آخر
redis-cli ping
```

## 📦 تثبيت التبعيات

```bash
# تثبيت جميع التبعيات
npm run install:all

# أو تثبيت كل جزء منفصلة
npm install
cd server && npm install
cd ../web && npm install
```

## 🚀 تشغيل النظام

### وضع التطوير

```bash
# تشغيل كامل
make dev

# أو تشغيل منفصل
make dev-server    # الخادم على المنفذ 4000
make dev-web       # التطبيق على المنفذ 3000
```

### وضع الإنتاج

```bash
# بناء النظام
make build

# تشغيل النظام
make start
```

## 🌐 الوصول للتطبيق

- **التطبيق**: http://localhost:3000
- **الخادم**: http://localhost:4000
- **API**: http://localhost:4000/api
- **Redis**: localhost:6379

## 🔍 اختبار الاتصال

### 1. اختبار الخادم

```bash
# اختبار endpoint الصحة
curl http://localhost:4000/health

# يجب أن يعيد:
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "version": "1.0.0",
  "environment": "development"
}
```

### 2. اختبار قاعدة البيانات

```bash
# في MongoDB Atlas
# اذهب إلى "Browse Collections"
# يجب أن ترى قاعدة البيانات "card-adder"
```

### 3. اختبار Redis

```bash
# الدخول إلى Redis CLI
docker exec -it card-adder-redis redis-cli

# اختبار الاتصال
ping
# يجب أن يعيد: PONG
```

## 🐛 استكشاف الأخطاء

### مشكلة: الخادم لا يعمل

```bash
# 1. تحقق من ملف .env
cat server/.env

# 2. تحقق من التبعيات
cd server && npm list

# 3. تحقق من السجلات
npm run dev
```

### مشكلة: التطبيق لا يتصل بالخادم

```bash
# 1. تأكد من تشغيل الخادم
curl http://localhost:4000/health

# 2. تحقق من ملف .env.local
cat web/.env.local

# 3. تحقق من إعدادات CORS
```

### مشكلة: MongoDB لا يتصل

```bash
# 1. تحقق من Connection String
echo $MONGODB_URI

# 2. تحقق من Network Access في Atlas
# 3. تحقق من اسم المستخدم وكلمة المرور
```

## 📊 مراقبة النظام

### PM2 (للإنتاج)

```bash
# تثبيت PM2
npm install -g pm2

# تشغيل النظام
cd server
pm2 start ecosystem.config.js

# مراقبة العمليات
pm2 monit

# إعادة تشغيل
pm2 restart all
```

### Docker

```bash
# مراقبة Redis
docker stats card-adder-redis

# سجلات Redis
docker logs -f card-adder-redis
```

## 🔐 أمان MongoDB Atlas

### 1. تحديث كلمة المرور

```bash
# في MongoDB Atlas
# Security → Database Access → Edit User
# Password → Reset Password
```

### 2. تقييد الوصول

```bash
# في MongoDB Atlas
# Security → Network Access
# Add IP Address → Current IP Address
```

### 3. مراقبة النشاط

```bash
# في MongoDB Atlas
# Logs → Real-time Logs
# يمكنك مراقبة جميع العمليات
```

## 📝 ملاحظات مهمة

1. **لا تشارك ملف .env** - يحتوي على معلومات حساسة
2. **احتفظ بنسخة احتياطية** من بيانات MongoDB
3. **راقب استخدام Atlas** - قد تتجاوز الحد المجاني
4. **حدث كلمات المرور** بانتظام
5. **استخدم Environment Variables** في الإنتاج

## 🆘 الحصول على المساعدة

إذا واجهت مشاكل:

1. تحقق من السجلات
2. تأكد من إعدادات البيئة
3. تحقق من اتصال الإنترنت
4. راجع هذا الدليل
5. افتح issue في GitHub

---

**تم التطوير بـ ❤️ لسهولة الاستخدام** 