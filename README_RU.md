# 3X-UI Prometheus Exporter

[![Typescript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Docker Hub](https://img.shields.io/badge/Docker-0db7ed?logo=docker&logoColor=white)](https://hub.docker.com/r/m4l3vich/3x-ui-prometheus-exporter) [![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com) [![Docker Image Size](https://img.shields.io/docker/image-size/m4l3vich/3x-ui-prometheus-exporter)](https://hub.docker.com/r/m4l3vich/3x-ui-prometheus-exporter)

[English](README.md)

Программа для экспортирования статистики использования трафика из 3X-UI в базу данных Prometheus, которая позволяет мониторить время онлайна и использование трафика VPN каждым клиентом.

## Доступные метрики и пример ответа

- **down_bytes_total**: количество байт, отправленных клиенту;

- **up_bytes_total**: количество байт, полученных от клиента;

- **is_online**: подключен ли клиент в данный момент к VPN (0/1).

У каждой метрики есть метка **email**, значение которой соответствует такому же свойству у клиента в 3X-UI.

```
# HELP down_bytes_total Bytes sent to the peer
# TYPE down_bytes_total counter
down_bytes_total{email="somebody"} 123456789
down_bytes_total{email="somebody_else"} 987654321

# HELP up_bytes_total Bytes received from the peer
# TYPE up_bytes_total counter
up_bytes_total{email="somebody"} 123456789
up_bytes_total{email="somebody_else"} 987654321

# HELP is_online Is the peer online
# TYPE is_online gauge
is_online{email="somebody"} 1
is_online{email="somebody_else"} 0
```

## Развёртывание в Docker (рекомендуется)

Доступны сборки для архитектур `linux/amd64` и `linux/arm64` .

```
docker run --name exporter -p 3000:3000 m4l3vich/3x-ui-prometheus-exporter
```

Метрики будут доступны по адресу **http://localhost:3000/metrics**

Обязательные переменные окружения (env variables):

| Переменная       | Описание                                  | Пример                     |
| ---------------- | ----------------------------------------- | -------------------------- |
| **XUI_ORIGIN**   | URL, по которому доступна панель 3X-UI    | https://example.org/3x-ui/ |
| **XUI_USERNAME** | Имя пользователя для входа в админ-панель | somebody                   |
| **XUI_PASSWORD** | Пароль для входа в админ-панель           | somepassword               |

Дополнитльеные переменные:

| Переменная           | Описание                                              | Когда использовать                                           |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| **XUI_LOGIN_SECRET** | Дополнительная строка-секрет для входа в админ-панель | Если этот секрет был задан в настройках админ-панели         |
| **XUI_BASIC_AUTH**   | username:password pair for the web server             | Если веб-сервер (напр. реверс-прокси) требует HTTP Basic Auth для доступа к панели 3X-UI |

## Локальное развёртывание

Для этого необходимо установить [Node.js LTS](https://nodejs.org/en/download) и менеджер пакетов [PNPM](https://pnpm.io/installation).

1. Скачайте репозиторий: `git clone https://github.com/m4l3vich/3x-ui-prometheus-exporter; cd 3x-ui-prometheus-exporter`;
2. Установите зависимости: `pnpm install`;
3. Скомпилируйте программу: `pnpm build`;
4. Создайте файл `.env` со всеми нужными переменными;
5. Запустите программу: `pnpm start` или `node build/index.js`