# Forge Action — R&D

Тестовый стенд для исследования [simple-container-com/forge-action](https://github.com/simple-container-com/forge-action).

Проверяемая версия action: `b85c96d5f597a28e9dc7528b818c5c79e6575ad5`.

- `benchmark/` — небольшой проект с намеренными ошибками и критериями проверки.
- `work/test-forge.cjs` — воспроизведение поведения оригинальных shell-скриптов с заглушками вместо Claude, API и git push.
- `.github/workflows/rd-smoke.yml` — проверка Linux/Docker без AI-ключей. Успех workflow означает завершение smoke-проверки, а не успешную генерацию кода.
- `reports/` — технический отчет и результаты измерений (добавляются после проверки).

Полный E2E-прогон требует доступа к Simple Forge, реального job_id и доступа к модели. GitHub-репозиторий не предоставляет этот доступ автоматически.

Для запуска тестов проекта: `node --test benchmark/test/cart.test.cjs`. В исходном состоянии ожидаются 3 успешных и 3 падающих теста.
