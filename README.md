# ChatGPT-TelegramBot
## Описание
Этот проект представляет собой Telegram бота, который использует модель искусственного интеллекта GPT-3.5 для обработки текстовых сообщений. Для доступа к API ChatGPT используется Proxy API. Для serverless-технологий проект использует Yandex Cloud Storage. Ниже представлено описание переменных окружения:

### Переменные окружения
- `TG_BOT_TOKEN`: Токен Telegram бота.
- `PROXY_API_KEY`: Ключ API для сервиса Proxy API.
- `YANDEX_KEY_ID`: Идентификатор ключа доступа к Yandex Cloud Storage.
- `YANDEX_KEY_SECRET`: Секретный ключ доступа к Yandex Cloud Storage.
- `YANDEX_BUCKET`: Имя бакета в Yandex Cloud Storage.
- `TG_BOT_CHATS`: Список идентификаторов чатов Telegram, где бот будет отвечать на личные сообщения.
- `TG_BOT_SUPERCHATS`: Список идентификаторов супергрупп Telegram, где бот будет отвечать на автоматически пересланные сообщения.
