# benchmark — небольшой тестовый стенд R&D

`benchmark/` — искусственный проект для контролируемых R&D-экспериментов: небольшая корзина с двумя функциями и точными тестами. Это не исходный код Forge Action и не production-библиотека.

## Требования

- Node.js 22.
- `npm install` не нужен: тесты используют встроенные модули `node:test` и `node:assert/strict`, внешних зависимостей нет.

## Запуск тестов

Из корня репозитория:

```sh
node --test benchmark/test/*.test.cjs
```

Команда запускает все файлы `*.test.cjs` в каталоге `benchmark/test/`.

CI в `.github/workflows/benchmark.yml` запускает только `benchmark/test/cart.test.cjs`:

```sh
node --test benchmark/test/cart.test.cjs
```

То есть локальная команда выше охватывает все подходящие файлы, а CI проверяет только `cart.test.cjs`; остальные файлы `*.test.cjs` CI не запускает.

## API

`benchmark/src/cart.cjs` экспортирует две функции: `total` и `paginate`.

### total(items)

Сумма позиций корзины в целых копейках. Для каждой позиции учитывается `quantity`: `priceCents * quantity`.

```js
const { total } = require('./benchmark/src/cart.cjs');

total([
  { priceCents: 125, quantity: 3 },
  { priceCents: 99, quantity: 2 },
]);
// 125 * 3 + 99 * 2 = 573
```

### paginate(items, page, pageSize)

Возвращает срез `items` для страницы `page` размером `pageSize`. `page` и `pageSize` — положительные целые числа, страницы нумеруются с 1. Последняя страница может быть неполной. Страница за пределами массива возвращает пустой массив `[]`.

Примеры для `items = [1, 2, 3, 4, 5]`:

```js
const { paginate } = require('./benchmark/src/cart.cjs');

const items = [1, 2, 3, 4, 5];

paginate(items, 1, 2); // [1, 2] — первая страница
paginate(items, 3, 2); // [5]    — последняя страница
paginate([1], 5, 2);   // []     — страница за пределами массива
```

`paginate` не изменяет входной массив:

```js
const items = [1, 2, 3, 4, 5];

paginate(items, 2, 2);
// items по-прежнему [1, 2, 3, 4, 5]
```

Текущая реализация не проверяет аргументы: для неположительных или нецелых `page` и `pageSize` поведение не определено и не является частью действующего контракта.
