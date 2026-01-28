# Booking Service

Микросервис бронирования мест, реализованный на **TypeScript + Fastify**.

## Используемый стек
- Node.js + TypeScript
- Fastify
- PostgreSQL (Prisma)
- Redis (блокировки конкурентных запросов)
- RabbitMQ (события)
- Docker / Docker Compose

---

## Быстрый старт (Docker Compose)

### 1. Подготовка окружения

```bash
cp .env.example .env
```

При необходимости отредактируйте значения в `.env`.

---

### 2. Сборка и запуск сервисов

```bash
docker-compose up --build
```

Будут запущены:
- backend API (app)
- PostgreSQL
- Redis
- RabbitMQ

---

### 3. Инициализация базы данных

Выполните команды внутри контейнера `app`:

```bash
docker-compose exec app npm run prisma:generate
docker-compose exec app npm run prisma:migrate
docker-compose exec app npm run seed
```

---

## Доступные сервисы

### Backend API
```
http://localhost:3000
```

### RabbitMQ Management UI
```
http://localhost:15672
```

Данные для входа:
- admin / 123456789
- guest / guest

---

## API

### Забронировать место

**POST** `/api/bookings/reserve`

```json
{
  "event_id": 1,
  "user_id": "user123"
}
```

### Ответы
- 201 - бронирование успешно создано
- 400 - ошибка запроса, нет мест или пользователь уже бронировал
- 404 - событие не найдено
- 429 - временная блокировка (конкурентные запросы)

---

## Архитектурные особенности

- Защита от двойного бронирования:
  - уникальный индекс (eventId, userId)
  - Redis-lock
- Все операции выполняются в транзакции
- При успешном бронировании публикуется событие `booking.created` в RabbitMQ
- RabbitMQ используется в режиме best-effort

---

## Примечания

- Redis-lock реализован упрощённо (`SET NX PX`)
- Для production рекомендуется Redlock
- Возможные улучшения:
  - retry для RabbitMQ
  - healthchecks
  - централизованный логинг
