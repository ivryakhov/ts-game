# Скилы агента

Проектные скилы в формате [Agent Skills](https://agentskills.io): каждая папка здесь — один скил (`SKILL.md` плюс справочные файлы). Папка `.agents/skills` — общее место, которое читают Codex и другие агенты с поддержкой Agent Skills. Claude Code ищет скилы в `.claude/skills`, поэтому там лежит симлинк на эту папку. Править скилы нужно здесь.

## matt-pocock-skills

27 скилов из [mattpocock/skills](https://github.com/mattpocock/skills), коммит `d81f3a1` (2026-09-29), версия плагина 1.2.3. Взят ровно тот набор, который поставляет официальный Claude Code плагин `mattpocock-skills` (бакеты `engineering/` и `productivity/`), скопирован без изменений. Файлы `agents/openai.yaml` — настройки для Codex (какие скилы вызываются только вручную), остальные агенты их игнорируют. Лицензия MIT, текст в [LICENSE-mattpocock-skills](./LICENSE-mattpocock-skills).

Перед первым использованием инженерных скилов один раз запустить `/setup-matt-pocock-skills`: он спросит, где вести задачи (GitHub Issues или локальные файлы), и запишет настройки в `docs/agents/`.

Обновить: заново скопировать папки из свежего коммита upstream поверх этих.
