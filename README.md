# Forge Action — R&D

Тестовый стенд для исследования [simple-container-com/forge-action](https://github.com/simple-container-com/forge-action).

Проверяемая версия action: `b85c96d5f597a28e9dc7528b818c5c79e6575ad5`.

- `benchmark/` — небольшой проект с намеренными ошибками и критериями проверки.
- `work/test-forge.cjs` — воспроизведение поведения оригинальных shell-скриптов с заглушками вместо Claude, API и git push. У каждого сценария есть явные ожидания (код завершения, вывод, последовательность вызовов); несовпадение делает запуск неуспешным.
- `.github/workflows/rd-smoke.yml` — проверка Linux/Docker без AI-ключей. Успех workflow означает, что smoke-проверка прошла, а не что агент сгенерировал код.
- `reports/` — технический отчет и результаты измерений.

## Smoke-проверки

Для локального запуска нужен checkout закреплённого commit в `work/forge-action` (в CI это делает отдельный шаг workflow):

```bash
git clone https://github.com/simple-container-com/forge-action work/forge-action
git -C work/forge-action checkout b85c96d5f597a28e9dc7528b818c5c79e6575ad5
node work/test-forge.cjs
node --test work/test/*.test.cjs
```

`work/test-forge.cjs` пишет диагностический отчёт `outputs/test-results.json`: для каждого сценария сохраняются `stdout`, `stderr`, `output`, `environment`, `trace`, ожидания и `verdict`. Итоговый `verdict` равен `pass`, только если ни одно ожидание не нарушено; иначе скрипт сохраняет отчёт и завершается с кодом 1. Сценарии с `known_limitation` — воспроизведённые дефекты закреплённой версии upstream (маскирование ошибок обязательных шагов): они обозначены явно и не выдаются за исправленные.

Каждый запуск использует собственный временный каталог для fixtures и удаляет его после завершения; повторный запуск не наследует trace/env/output/scripts предыдущего.

Изолированные проверки логики оценки и отрицательный контроль: `node --test work/test/*.test.cjs`. Они не вызывают AI, Forge API или git push.

Полный E2E-прогон требует доступа к Simple Forge, реального job_id и доступа к модели. GitHub-репозиторий не предоставляет этот доступ автоматически.

Для запуска тестов benchmark: `node --test benchmark/test/*.test.cjs`.
