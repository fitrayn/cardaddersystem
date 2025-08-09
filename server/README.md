# Facebook Card Adder Backend

منصة متكاملة لإضافة بطاقات الدفع على حسابات فيسبوك التجارية باستخدام GraphQL API.

## المميزات

- **إضافة البطاقات**: دعم MasterCard/Visa عبر Facebook GraphQL API
- **إدارة الكوكيز**: تشفير آمن للبيانات الحساسة (AES-256-GCM)
- **نظام الطوابير**: معالجة متوازية مع إعادة المحاولة التلقائية
- **دعم البروكسي**: HTTP/HTTPS/SOCKS5 لكل حساب
- **نظام الصلاحيات**: Admin/Operator مع JWT
- **الإحصائيات**: تتبع النجاح والفشل لكل عملية

## المتطلبات

- Node.js 18+
- MongoDB 5+
- Redis 6+
- TypeScript 5+

## التثبيت

1. **نسخ المتغيرات البيئية**:
```bash
# أنشئ ملف .env مع القيم التالية:
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://localhost:27017/facebook_card_adder
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-here-minimum-16-characters
AES_KEY_BASE64=your-32-byte-aes-key-base64-encoded
AES_IV_BASE64=your-16-byte-aes-iv-base64-encoded
CORS_ORIGIN=http://localhost:3000
```

2. **تثبيت التبعيات**:
```bash
npm install
```

3. **بناء المشروع**:
```bash
npm run build
```

4. **تشغيل الخادم**:
```bash
# للتطوير
npm run dev

# للإنتاج
npm start
```

## كيفية عمل النظام

### 1. رفع البيانات
- **الكوكيز**: CSV/JSON مع `c_user`, `xs`, `fr`, `datr`
- **البطاقات**: CSV مع `number`, `exp_month`, `exp_year`, `cvv`

### 2. معالجة المهام
- النظام يطابق كل كوكي مع بطاقة
- يستخرج `fb_dtsg` token من فيسبوك
- يرسل طلب GraphQL لإضافة البطاقة
- يسجل النتيجة (نجاح/فشل/السبب)

### 3. إدارة الطوابير
- معالجة متوازية مع تحديد الحد الأقصى
- إعادة المحاولة التلقائية مع تأخير تصاعدي
- إمكانية إيقاف/استئناف/مسح الطوابير

## API Endpoints

### المصادقة
- `POST /api/auth/signup` - إنشاء حساب جديد
- `POST /api/auth/login` - تسجيل الدخول

### رفع البيانات
- `POST /api/upload/cookies/json` - رفع كوكيز JSON
- `POST /api/upload/cookies/csv` - رفع كوكيز CSV
- `POST /api/upload/cards/csv` - رفع بطاقات CSV

### إدارة المهام
- `POST /api/jobs/enqueue` - إضافة مهام مع إعدادات متقدمة
- `POST /api/jobs/enqueue-simple` - إضافة مهام بسيطة
- `GET /api/jobs/results` - نتائج المهام
- `GET /api/jobs/status` - حالة المهام

### إدارة الطوابير
- `GET /api/queue/stats` - إحصائيات الطوابير
- `POST /api/queue/pause` - إيقاف الطوابير
- `POST /api/queue/resume` - استئناف الطوابير
- `DELETE /api/queue/clear` - مسح الطوابير

### الإحصائيات
- `GET /api/stats/summary` - ملخص عام
- `GET /api/stats/top-countries` - الدول الأكثر استخداماً
- `GET /api/stats/common-errors` - الأخطاء الشائعة

## إعدادات البروكسي

```typescript
const proxyConfig = {
  type: 'http' | 'https' | 'socks5',
  host: 'proxy.example.com',
  port: 8080,
  username: 'user', // اختياري
  password: 'pass', // اختياري
  country: 'US'     // اختياري
};
```

## الأمان

- **تشفير البيانات**: AES-256-GCM للبيانات الحساسة
- **المصادقة**: JWT مع انتهاء صلاحية
- **الصلاحيات**: Admin/Operator مع تحكم كامل
- **Rate Limiting**: حماية من الهجمات

## استكشاف الأخطاء

### مشاكل شائعة

1. **فشل في الحصول على fb_dtsg**:
   - تأكد من صحة الكوكيز
   - تحقق من صلاحية الجلسة

2. **أخطاء البروكسي**:
   - تأكد من صحة إعدادات البروكسي
   - تحقق من اتصال الإنترنت

3. **أخطاء MongoDB**:
   - تأكد من تشغيل MongoDB
   - تحقق من صحة URI

### السجلات

```bash
# سجلات الخادم
npm run dev

# سجلات الطوابير
# تظهر في console عند تشغيل worker
```

## التطوير

### إضافة ميزات جديدة

1. **أنواع بطاقات جديدة**: أضف في `worker.ts`
2. **إعدادات بروكسي**: عدل في `proxy/agent.ts`
3. **API endpoints**: أضف في `modules/`

### الاختبار

```bash
# اختبار البناء
npm run build

# اختبار التشغيل
npm run dev
```

## ملاحظات مهمة

- **لا تقم بإعادة إرسال طلبات فيسبوك** - النظام مصمم للامتثال
- **استخدم بروكسيات موثوقة** لتجنب الحظر
- **راقب Rate Limits** لتجنب تعليق الحسابات
- **احتفظ بنسخ احتياطية** من البيانات المشفرة

## الدعم

للمساعدة التقنية أو الإبلاغ عن مشاكل:
- GitHub Issues
- التطوير المستمر والميزات الجديدة

---

**تنبيه**: هذا النظام مصمم للاستخدام القانوني فقط. تأكد من امتثالك لشروط فيسبوك وقوانين بلدك. 