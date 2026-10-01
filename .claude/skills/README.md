# Скилы агента

Проектные скилы Claude Code. Каждая папка здесь — один скил, Claude Code подхватывает их автоматически в любой сессии на этом репозитории.

## matt-pocock-skills

27 скилов из [mattpocock/skills](https://github.com/mattpocock/skills), коммит `d81f3a1` (2026-09-29), версия плагина 1.2.3. Взят ровно тот набор, который поставляет официальный Claude Code плагин `mattpocock-skills` (бакеты `engineering/` и `productivity/`), скопирован без изменений. Папки `agents/openai.yaml` (нужны только Codex) не копировались. Лицензия MIT, текст в [LICENSE-mattpocock-skills](./LICENSE-mattpocock-skills).

Перед первым использованием инженерных скилов один раз запустить `/setup-matt-pocock-skills`: он спросит, где вести задачи (GitHub Issues или локальные файлы), и запишет настройки в `docs/agents/`.

Обновить: заново скопировать папки из свежего коммита upstream поверх этих.
