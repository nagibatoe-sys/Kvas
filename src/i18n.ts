/**
 * Тексты интерфейса (русский, ТЗ 11.6). Вынесены в один файл,
 * чтобы в будущем легко добавить поддержку других языков.
 */
export const texts = {
  appTitle: 'Рабочая смена',

  // Экран загрузки (ТЗ 7.1)
  loading: 'Загрузка…',

  // Экран входа (ТЗ 6.1, 7.2)
  loginTitle: 'Вход в приложение',
  loginField: 'Телефон или email',
  passwordField: 'Пароль',
  loginButton: 'Войти',
  showPassword: 'Показать пароль',
  hidePassword: 'Скрыть пароль',
  forgotPassword: 'Забыли пароль?',
  loginErrorInvalid: 'Неверный логин или пароль.',
  loginErrorUnavailable: 'Сервис временно недоступен. Повторите попытку позже.',
  loginOfflineHint: 'Нет соединения. Вход доступен только при наличии интернета.',
  passwordRecoveryNote:
    'Для восстановления пароля обратитесь к руководителю или администратору.',

  // Главный экран (ТЗ 6.2, 7.3)
  statusNotStarted: 'Смена не начата',
  statusActive: 'Смена активна',
  statusFinished: 'Смена завершена',
  startedAt: (time: string) => `Начата в ${time}`,
  startComment: (c: string) => `Комментарий начала: ${c}`,
  awaitingSync: 'Ожидает отправки на сервер',
  finishedAwaitingSync: 'Данные ожидают отправки',
  btnStart: 'Начать работу',
  btnFinish: 'Завершить работу',
  navHistory: 'История',
  navProfile: 'Профиль',
  netOnline: 'Онлайн',
  netOffline: 'Офлайн',
  syncAllSent: 'Все данные отправлены',
  syncPending: 'Есть неотправленные данные',
  offlineStorageWarning:
    'Есть давно неотправленные отметки. Подключитесь к интернету для синхронизации.',

  // Сообщения (ТЗ 10)
  msgNoConnection: 'Нет соединения. Отметка будет отправлена позже.',
  msgServerUnavailable:
    'Не удалось отправить данные. Повторная отправка будет выполнена автоматически.',
  msgAlreadyActive: 'У вас уже есть активная смена.',
  msgNoActiveShift: 'Нет активной смены.',

  // Экраны подтверждения (ТЗ 6.3.5, 6.4.4, 7.4, 7.5)
  startScreenTitle: 'Начать рабочую смену',
  finishScreenTitle: 'Завершить рабочую смену',
  timeLabel: (t: string) => `Время: ${t}`,
  shiftStartedLabel: (t: string) => `Смена начата в ${t}`,
  commentLabel: 'Комментарий',
  commentOptional: 'Комментарий необязателен (до 1000 символов)',
  btnCancel: 'Отмена',
  charactersLeft: (n: number) => `Осталось символов: ${n}`,

  // Геолокация (ТЗ 6.5, 7.8, 10.3, 10.4)
  locating: 'Определение местоположения…',
  locationPermissionTitle: 'Нет доступа к геолокации',
  locationPermissionTextStart:
    'Для отметки начала смены необходимо разрешить доступ к геолокации.',
  locationPermissionTextEnd:
    'Для отметки окончания смены необходимо разрешить доступ к геолокации.',
  locationFailedText:
    'Не удалось определить местоположение. Проверьте доступ к геолокации и повторите попытку.',
  btnRetry: 'Повторить',
  btnOpenSettings: 'Перейти в настройки',

  // История (ТЗ 6.8, 7.6)
  historyTitle: 'История отметок',
  historyEmpty: 'Отметок пока нет',
  historyLocalOnly: 'Показаны локальные данные. Сервер недоступен.',
  evtStart: 'Начало смены',
  evtEnd: 'Окончание смены',
  commentPrefix: (c: string) => `Комментарий: ${c}`,
  stSynced: 'Отправлено',
  stPending: 'Ожидает отправки',
  stError: 'Ошибка отправки',

  // Профиль (ТЗ 6.9, 7.7)
  profileTitle: 'Профиль',
  profileName: 'Имя',
  profileContact: 'Телефон или email',
  profileVersion: 'Версия приложения',
  profileAuthStatus: 'Статус авторизации',
  profileAuthorized: 'Авторизован',
  logoutButton: 'Выйти',
  logoutBlocked:
    'На устройстве есть неотправленные отметки. Выход возможен только после их отправки на сервер.',

  // Общие
  sending: 'Отправка…',
  back: 'Назад',
} as const;
