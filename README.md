# نظام إضافة البطاقات - Facebook Card Adder System

نظام متكامل لإدارة وإضافة البطاقات مبني باستخدام Next.js للواجهة الأمامية و Fastify للخادم.

## 🚀 المميزات

- **واجهة مستخدم حديثة**: مبنية بـ Next.js 15 مع React 19
- **خادم سريع**: مبني بـ Fastify مع دعم TypeScript
- **معالجة متوازية**: نظام workers متعدد للعمليات الكبيرة
- **أمان عالي**: نظام مصادقة متقدم مع JWT
- **قاعدة بيانات سحابية**: MongoDB Atlas مع Redis للتخزين المؤقت
- **تصميم متجاوب**: يعمل على جميع الأجهزة

## 🏗️ بنية المشروع

```
├── server/                 # خادم Fastify
│   ├── src/
│   │   ├── modules/       # وحدات النظام
│   │   ├── middleware/    # وسائط التطبيق
│   │   ├── lib/          # مكتبات مساعدة
│   │   ├── config/       # إعدادات النظام
│   │   ├── index.ts      # نقطة البداية
│   │   └── worker.ts     # معالج العمليات
│   ├── package.json
│   └── ecosystem.config.js
├── web/                   # تطبيق Next.js
│   ├── src/
│   │   ├── app/          # صفحات التطبيق
│   │   └── lib/          # مكتبات مساعدة
│   ├── package.json
│   └── next.config.ts
├── package.json           # ملف التكوين الرئيسي
├── docker-compose.yml     # Redis فقط
└── README.md
```

## 📋 المتطلبات

- Node.js 18 أو أحدث
- npm 8 أو أحدث
- MongoDB Atlas (مُعد مسبقاً)
- Redis (محلي عبر Docker)

## 🛠️ التثبيت

### 1. إعداد متغيرات البيئة

انسخ ملف `env.example` إلى `server/.env`:

```bash
cp env.example server/.env
```

تأكد من أن الملف يحتوي على بيانات MongoDB Atlas الصحيحة:

```env
MONGODB_URI=mongodb+srv://fitraynapp:mwp0jfjWFapPFOUr@cluster0.xrmj2mp.mongodb.net/card-adder?retryWrites=true&w=majority&appName=Cluster0
```

### 2. تثبيت التبعيات

```bash
# تثبيت جميع التبعيات
npm run install:all
```

### 3. تشغيل النظام

```bash
# إعداد كامل (يُنشئ ملفات البيئة تلقائياً)
make setup

# أو خطوة بخطوة
make setup-env      # إعداد متغيرات البيئة
make docker-up      # تشغيل Redis
make install        # تثبيت التبعيات
make dev            # تشغيل النظام
```

## 🚀 الأوامر المتاحة

| الأمر | الوصف |
|-------|--------|
| `make setup` | إعداد النظام كاملاً (يُنشئ ملفات البيئة) |
| `make setup-env` | إعداد متغيرات البيئة فقط |
| `make dev` | تشغيل النظام كاملاً في وضع التطوير |
| `make build` | بناء النظام كاملاً للإنتاج |
| `make start` | تشغيل النظام كاملاً في وضع الإنتاج |
| `make install:all` | تثبيت جميع التبعيات |
| `make clean` | تنظيف الملفات المؤقتة |
| `make docker-up` | تشغيل Redis |
| `make docker-down` | إيقاف Redis |

## 🌐 الوصول للتطبيق

- **التطبيق**: http://localhost:3000
- **الخادم**: http://localhost:4000
- **API**: http://localhost:4000/api
- **Redis**: localhost:6379

## 📱 الميزات

### إدارة المستخدمين
- تسجيل دخول آمن
- نظام صلاحيات متقدم
- إدارة الملفات الشخصية

### إدارة البطاقات
- إضافة بطاقات جديدة
- تعديل البطاقات الموجودة
- حذف البطاقات
- استيراد/تصدير البيانات

### المعالجة المتوازية
- نظام workers متعدد
- معالجة العمليات الكبيرة
- مراقبة الأداء

## 🔧 التطوير

### إضافة ميزات جديدة

1. أضف الكود في المجلد المناسب
2. اكتب الاختبارات
3. حدث التوثيق
4. أرسل pull request

### هيكل الكود

- استخدم TypeScript في جميع الملفات
- اتبع معايير ESLint
- اكتب تعليقات واضحة
- استخدم أسماء متغيرات وصفية

## 🐛 استكشاف الأخطاء

### مشاكل شائعة

1. **الخادم لا يعمل**
   - تأكد من وجود ملف `server/.env`
   - تحقق من صحة بيانات MongoDB Atlas
   - تأكد من تشغيل Redis

2. **التطبيق لا يتصل بالخادم**
   - تأكد من تشغيل الخادم على المنفذ 4000
   - تحقق من إعدادات CORS

3. **مشاكل في البناء**
   - امسح الملفات المؤقتة: `make clean`
   - أعد تثبيت التبعيات: `make install`

## 📊 المراقبة

### PM2 (للإنتاج)
```bash
# تشغيل مع PM2
cd server
pm2 start ecosystem.config.js

# مراقبة العمليات
pm2 monit

# إعادة تشغيل
pm2 restart all
```

### Redis
```bash
# مراقبة Redis
docker-compose logs -f redis

# الدخول إلى Redis CLI
docker exec -it card-adder-redis redis-cli
```

## 🔐 أمان MongoDB Atlas

- تم ربط النظام مع MongoDB Atlas
- بيانات الاتصال محفوظة في `server/.env`
- تأكد من تحديث كلمة المرور عند الحاجة
- استخدم Network Access في Atlas لتقييد الوصول

## 🤝 المساهمة

نرحب بمساهماتكم! يرجى:

1. Fork المشروع
2. إنشاء branch للميزة الجديدة
3. Commit التغييرات
4. Push إلى Branch
5. إنشاء Pull Request

## 📄 الترخيص

هذا المشروع مرخص تحت رخصة MIT.

## 📞 الدعم

للمساعدة والدعم:
- افتح issue جديد
- راسلنا عبر البريد الإلكتروني
- انضم إلى مجتمعنا

---

**تم التطوير بـ ❤️ باستخدام Next.js و Fastify**

**مُربط مع MongoDB Atlas للاستخدام السحابي** 