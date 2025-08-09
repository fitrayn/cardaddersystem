.PHONY: help install dev build start clean docker-up docker-down setup-env

help: ## عرض المساعدة
	@echo "أوامر النظام المتاحة:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## تثبيت جميع التبعيات
	@echo "تثبيت التبعيات..."
	npm run install:all

dev: ## تشغيل النظام في وضع التطوير
	@echo "تشغيل النظام في وضع التطوير..."
	npm run dev

dev-server: ## تشغيل الخادم فقط
	@echo "تشغيل الخادم..."
	cd server && npm run dev

dev-web: ## تشغيل التطبيق فقط
	@echo "تشغيل التطبيق..."
	cd web && npm run dev

build: ## بناء النظام للإنتاج
	@echo "بناء النظام..."
	npm run build

start: ## تشغيل النظام في وضع الإنتاج
	@echo "تشغيل النظام في وضع الإنتاج..."
	npm run start

clean: ## تنظيف الملفات المؤقتة
	@echo "تنظيف الملفات المؤقتة..."
	npm run clean

docker-up: ## تشغيل Redis باستخدام Docker
	@echo "تشغيل Redis..."
	docker-compose up -d

docker-down: ## إيقاف Redis
	@echo "إيقاف Redis..."
	docker-compose down

docker-logs: ## عرض سجلات Docker
	@echo "عرض سجلات Redis..."
	docker-compose logs -f

setup-env: ## إعداد متغيرات البيئة
	@echo "إعداد متغيرات البيئة..."
	@if [ ! -f server/.env ]; then \
		echo "إنشاء ملف .env للخادم..."; \
		cp env.example server/.env; \
		echo "تم إنشاء server/.env"; \
	else \
		echo "ملف server/.env موجود بالفعل"; \
	fi
	@if [ ! -f web/.env.local ]; then \
		echo "إنشاء ملف .env.local للتطبيق..."; \
		echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > web/.env.local; \
		echo "تم إنشاء web/.env.local"; \
	fi

setup: ## إعداد النظام كاملاً
	@echo "إعداد النظام..."
	@make setup-env
	@make docker-up
	@make install
	@echo "تم الإعداد بنجاح! يمكنك الآن تشغيل النظام بـ 'make dev'"
	@echo ""
	@echo "ملاحظات مهمة:"
	@echo "1. تم ربط النظام مع MongoDB Atlas"
	@echo "2. Redis يعمل محلياً على Docker"
	@echo "3. تأكد من أن ملف server/.env يحتوي على بيانات MongoDB الصحيحة" 