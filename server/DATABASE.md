# قاعدة البيانات - Database Documentation

## نظرة عامة
هذا النظام يستخدم MongoDB كقاعدة بيانات رئيسية مع Redis للطوابير.

## الجداول (Collections)

### 1. المستخدمين (Users)
```typescript
interface User {
  _id: ObjectId;
  username: string;        // اسم المستخدم (فريد)
  email: string;          // البريد الإلكتروني (فريد)
  password: string;       // كلمة المرور مشفرة
  role: 'admin' | 'user'; // دور المستخدم
  isActive: boolean;      // حالة الحساب
  lastLogin?: Date;       // آخر تسجيل دخول
  createdAt: Date;        // تاريخ الإنشاء
  updatedAt: Date;        // تاريخ التحديث
}
```

**الفهارس (Indexes):**
- `email` (unique)
- `username` (unique)

### 2. البطاقات (Cards)
```typescript
interface Card {
  _id: ObjectId;
  userId: ObjectId;       // معرف المستخدم
  cardNumber: string;     // رقم البطاقة (فريد)
  cardType: 'visa' | 'mastercard' | 'amex' | 'discover';
  expiryMonth: number;    // شهر انتهاء الصلاحية
  expiryYear: number;     // سنة انتهاء الصلاحية
  cvv: string;           // رمز الأمان
  cardholderName: string; // اسم حامل البطاقة
  billingAddress: {       // عنوان الفواتير
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  isActive: boolean;      // حالة البطاقة
  lastUsed?: Date;        // آخر استخدام
  createdAt: Date;        // تاريخ الإنشاء
  updatedAt: Date;        // تاريخ التحديث
}
```

**الفهارس (Indexes):**
- `userId`
- `cardNumber` (unique)
- `createdAt` (descending)

### 3. الوظائف (Jobs)
```typescript
interface Job {
  _id: ObjectId;
  userId: ObjectId;       // معرف المستخدم
  type: 'add_cards' | 'update_cards' | 'delete_cards';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;       // نسبة الإنجاز (0-100)
  totalItems: number;     // إجمالي العناصر
  processedItems: number; // العناصر المعالجة
  failedItems: number;    // العناصر الفاشلة
  data: {                 // بيانات الوظيفة
    cards?: CreateCardInput[];
    cardIds?: string[];
    updates?: UpdateCardInput[];
  };
  error?: string;         // رسالة الخطأ
  startedAt?: Date;       // وقت البدء
  completedAt?: Date;     // وقت الانتهاء
  createdAt: Date;        // تاريخ الإنشاء
  updatedAt: Date;        // تاريخ التحديث
}
```

**الفهارس (Indexes):**
- `userId`
- `status`
- `createdAt` (descending)

### 4. الإحصائيات (Stats)
```typescript
interface Stats {
  _id: ObjectId;
  userId: ObjectId;       // معرف المستخدم
  date: Date;            // التاريخ
  totalCards: number;     // إجمالي البطاقات
  activeCards: number;    // البطاقات النشطة
  cardsAdded: number;     // البطاقات المضافة
  cardsUpdated: number;   // البطاقات المحدثة
  cardsDeleted: number;   // البطاقات المحذوفة
  jobsCompleted: number;  // الوظائف المكتملة
  jobsFailed: number;     // الوظائف الفاشلة
  createdAt: Date;        // تاريخ الإنشاء
  updatedAt: Date;        // تاريخ التحديث
}
```

**الفهارس (Indexes):**
- `userId`
- `date`

## الإعداد

### 1. متغيرات البيئة
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
REDIS_URL=redis://localhost:6379
```

### 2. إنشاء مستخدم Admin
```bash
npm run create-admin
```

### 3. تشغيل الخادم
```bash
npm run dev
```

## الخدمات (Services)

### UserService
- إنشاء المستخدمين
- البحث والتحديث
- التحقق من كلمات المرور

### CardService
- إدارة البطاقات
- العمليات المجمعة
- الإحصائيات

### JobService
- إدارة الوظائف
- تتبع التقدم
- معالجة الأخطاء

### StatsService
- جمع الإحصائيات
- التقارير اليومية
- ملخص النظام

## الأمان
- تشفير كلمات المرور باستخدام bcrypt
- فهارس فريدة للبيانات الحساسة
- التحقق من الصلاحيات 