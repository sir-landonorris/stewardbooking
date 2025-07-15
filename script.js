// Импорт Supabase клиента
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Supabase клиент, инициализируется как null и будет создан в init()
let supabase = null;
let currentSupabaseUser = null; // Будет хранить аутентифицированного пользователя Supabase

document.addEventListener('DOMContentLoaded', async function() {
    // Firebase variables (provided by the Canvas environment)
    // Эти переменные будут доступны в runtime, если приложение запущено в Canvas
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? initialAuthToken : null;

    let app, db, auth, userId;
    let isAuthReady = false;

    // Все данные бронирования
    const bookingData = {
        date: null,
        time: null,
        simulator: [], // Изменено на массив для множественного выбора
        duration: null, // Длительность пакета, например "1 час"
        price: null,
        name: null,
        phone: null,
        telegram: '', // Инициализируем как пустую строку
        telegramId: '', // Инициализируем как пустую строку
        comment: null
    };

    // Все пакеты времени
    const packages = [
        { duration: '1 ЧАС', price: '450 ₽', value: 450, hours: 1 },
        { duration: '2 ЧАСА', price: '800 ₽', value: 800, hours: 2 },
        { duration: '3 ЧАСА', price: '1050 ₽', value: 1050, hours: 3 },
        { duration: '5 ЧАСОВ', price: '1600 ₽', value: 1600, hours: 5 },
        { duration: 'НОЧЬ', price: '2000 ₽', value: 2000, hours: 8 } // Пример для "Ночь" - 8 часов
    ];

    // Вспомогательная функция для показа заглушки
    function showFallbackContent() {
        const fallbackDiv = document.getElementById('web-app-fallback');
        const mainContentDiv = document.getElementById('main-booking-content');
        if (fallbackDiv) fallbackDiv.style.display = 'flex'; // Показываем заглушку
        if (mainContentDiv) mainContentDiv.style.display = 'none'; // Скрываем основной контент
        document.body.style.alignItems = 'center'; // Выравнивание для заглушки

        // Устанавливаем данные Telegram для заглушки, если они еще не установлены
        if (!bookingData.telegramId || bookingData.telegramId.startsWith('fallback_tg_id_')) {
            bookingData.telegramId = 'fallback_tg_id_' + Math.random().toString(36).substring(7);
            bookingData.telegram = 'fallback_user';
        }
        console.warn("Telegram Web App SDK не обнаружен. Отображается заглушка.");
    }

    // Вспомогательная функция для показа основного контента
    function showMainContent() {
        const fallbackDiv = document.getElementById('web-app-fallback');
        const mainContentDiv = document.getElementById('main-booking-content');
        if (fallbackDiv) fallbackDiv.style.display = 'none'; // Скрываем заглушку
        if (mainContentDiv) mainContentDiv.style.display = 'block'; // Показываем основной контент
        document.body.style.alignItems = 'flex-start'; // Выравнивание для основного контента
        console.log("Telegram Web App готов и обнаружен. Отображается основной контент.");
    }

    // Инициализация приложения
    async function init() {
        console.log("init() called.");

        // Логика для отображения контента в зависимости от среды
        if (window.Telegram && window.Telegram.WebApp) {
            try {
                // Если Telegram Web App доступен, пытаемся его инициализировать
                Telegram.WebApp.ready();
                Telegram.WebApp.expand();
                showMainContent(); // Показываем основной контент сразу

                const userTg = Telegram.WebApp.initDataUnsafe.user;
                if (userTg && typeof userTg.id === 'number') {
                    bookingData.telegramId = userTg.id.toString(); // Сохраняем Telegram ID
                    bookingData.telegram = userTg.username || ''; // Сохраняем ник Telegram (если есть, иначе пустая строка)
                    console.log("Telegram User Data (ID, Username):", bookingData.telegramId, bookingData.telegram);
                } else {
                    console.warn("Данные пользователя Telegram Web App (ID) недоступны или не являются числом. Используется запасной Telegram ID для тестирования.");
                    bookingData.telegramId = 'fallback_tg_id_' + Math.random().toString(36).substring(7);
                    bookingData.telegram = 'fallback_user';
                }
            } catch (e) {
                console.error("Ошибка инициализации Telegram Web App:", e);
                // Если Telegram Web App инициализация не удалась, показываем заглушку
                showFallbackContent();
            }
        } else {
            // Если Telegram Web App НЕ обнаружен, сразу показываем заглушку
            showFallbackContent();
        }

        // Инициализация Supabase
        try {
            // !!! ВАЖНО !!! ВСТАВЬТЕ ВАШИ РЕАЛЬНЫЕ Supabase URL и Anon Key ЗДЕСЬ.
            // Убедитесь, что это строки в кавычках.
            const supabaseUrl = 'https://jvzogsjammwaityyqfjq.supabase.co'; // Вставьте ваш Project URL здесь
            const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2em9nc2phbW13YWl0eXlxZmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI1MDE1ODAsImV4cCI6MjA2ODA3NzU4MH0.JrdjGBmC1rTwraBGzKIHE87Qd2MVaS7odoW-ldJzyGw'; // Вставьте ваш anon public ключ здесь
            
            console.log("Supabase URL:", supabaseUrl); // Отладка: Проверка URL
            console.log("Supabase Anon Key (first 5 chars):", supabaseAnonKey.substring(0, 5) + '...'); // Отладка: Проверка ключа

            // Теперь здесь нет проверки на заглушки.
            // Если supabaseUrl или supabaseAnonKey пусты, это вызовет ошибку в createClient.
            // Убедитесь, что вы вставили реальные ключи выше.
            if (!supabaseUrl || !supabaseAnonKey) {
                 console.error("КРИТИЧЕСКАЯ ОШИБКА: Supabase URL или Anon Key не могут быть пустыми. Пожалуйста, вставьте ваши фактические ключи Supabase в script.js.");
                 supabase = null;
            } else {
                console.log("Attempting to create Supabase client...");
                supabase = createClient(supabaseUrl, supabaseAnonKey); // Присваиваем глобальной переменной
                console.log("Supabase client created successfully. Supabase object:", supabase);

                console.log("Попытка анонимной аутентификации Supabase...");
                const { data, error } = await supabase.auth.signInAnonymously();
                if (error) {
                    console.error("Ошибка анонимной аутентификации Supabase:", error);
                    supabase = null; // Если аутентификация не удалась, Supabase не будет использоваться
                    currentSupabaseUser = null; // Убедимся, что пользователь тоже null
                } else {
                    currentSupabaseUser = data.user;
                    console.log("Supabase аутентифицирован. User ID:", currentSupabaseUser.id, "currentSupabaseUser object:", currentSupabaseUser);
                    // Загрузка данных пользователя только если аутентификация Supabase прошла успешно и Telegram ID доступен
                    if (currentSupabaseUser && bookingData.telegramId) { 
                        await loadUserData(currentSupabaseUser.id, bookingData.telegramId);
                    } else {
                        console.warn("Skipping loadUserData: Supabase user or Telegram ID not fully available (or using fallback).");
                    }
                }
            }
        } catch (error) {
            console.error("Критическая ошибка инициализации Supabase:", error);
            supabase = null;
            currentSupabaseUser = null;
        }

        // Настройка всех шагов интерфейса (эти функции всегда должны запускаться)
        setupDateAndSimulatorSelection(); // Объединенный шаг
        setupPackageSelection();
        setupTimeSlotsGenerator(); // Будет вызван снова после выбора пакета
        setupForm();
        setupNavigation();
        setupConfirmationActions();
        setupMapButtons();
        showStep(0); // Начинаем с первого шага
    }

    // Показываем нужный шаг и скрываем остальные
    function showStep(stepNumber) {
        document.querySelectorAll('.step-page').forEach(step => {
            step.classList.remove('active');
        });
        
        // Обновлен список шагов, так как шаг с рулем удален и шаги объединены
        const steps = [
            'date-simulator-step',   // 0 (Объединенный шаг даты и симулятора)
            'package-step',          // 1
            'time-select-step',      // 2
            'form-step',             // 3
            'confirmation-step'      // 4
        ];
        document.getElementById(steps[stepNumber]).classList.add('active');
        
        // Обновляем прогресс-бар (теперь всего 5 шагов: 0-4)
        updateProgress(stepNumber);
        updateBreadcrumb(); // Обновляем хлебные крошки при смене шага
    }

    // Обновляем прогресс-бар
    function updateProgress(step) {
        // Целевой глобальный прогресс-бар
        const progressElement = document.getElementById('booking-progress-global');
        if (progressElement) {
            // Всего 5 шагов (0-4), поэтому делим на 4
            const progress = (step / 4) * 100;
            progressElement.style.width = `${progress}%`;
        } else {
            console.error("Элемент прогресс-бара 'booking-progress-global' не найден.");
        }
    }

    // Обновление хлебных крошек
    function updateBreadcrumb() {
        const breadcrumbElement = document.getElementById('booking-breadcrumb');
        if (!breadcrumbElement) return;

        let breadcrumbText = [];

        if (bookingData.simulator.length > 0) {
            breadcrumbText.push(getSimulatorNames(bookingData.simulator));
        }
        if (bookingData.date) {
            const [day, month, year] = bookingData.date.split('.');
            const dateObj = new Date(year, parseInt(month) - 1, day);
            const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(dateObj).toUpperCase(); // В верхний регистр
            breadcrumbText.push(`${parseInt(day)} ${monthName}`);
        }
        if (bookingData.duration) {
            breadcrumbText.push(bookingData.duration);
        }
        if (bookingData.time) {
            breadcrumbText.push(bookingData.time.split(' ')[0]); // Только начальное время
        }

        breadcrumbElement.innerHTML = breadcrumbText.join(' / ');
    }

    // Объединенная настройка выбора даты и симулятора
    function setupDateAndSimulatorSelection() {
        const dateDisplay = document.getElementById('date-display-text');
        const dateCarouselContainer = document.getElementById('date-carousel-container');
        const simulatorBoxes = document.querySelectorAll('.simulator-box');
        const toPackagePageBtn = document.getElementById('toPackagePage');

        // Инициализация: Сегодня выбрано по умолчанию
        const today = new Date();
        const todayFormatted = `${today.getDate().toString().padStart(2, '0')}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getFullYear()}`;
        bookingData.date = todayFormatted;
        dateDisplay.textContent = `СЕГОДНЯ / ${today.getDate().toString().padStart(2, '0')} ${new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(today).toUpperCase()}`;
        
        // Инициализация: Автосим 01 выбран по умолчанию
        const defaultSimulator = document.querySelector('.simulator-box[data-id="1"]');
        if (defaultSimulator) {
            defaultSimulator.classList.add('selected');
            defaultSimulator.querySelector('.remove-selection').style.display = 'flex';
            bookingData.simulator = ['1'];
        }

        // Кнопка "Далее" активна по умолчанию
        toPackagePageBtn.classList.add('active');
        toPackagePageBtn.disabled = false;

        // Обработчик для переключения видимости карусели дат
        dateDisplay.closest('.date-display').addEventListener('click', function() {
            this.classList.toggle('expanded');
            dateCarouselContainer.classList.toggle('hidden');
            if (!dateCarouselContainer.classList.contains('hidden')) {
                generateDateCarousel(); // Генерируем даты при открытии
            }
        });

        // Настройка выбора симулятора (повторяется из предыдущей версии, но адаптирована)
        simulatorBoxes.forEach(sim => {
            const removeBtn = sim.querySelector('.remove-selection');

            sim.addEventListener('click', function(e) {
                if (e.target === removeBtn) {
                    return;
                }

                const simulatorId = this.dataset.id;

                if (this.classList.contains('selected')) {
                    this.classList.remove('selected');
                    if (removeBtn) removeBtn.style.display = 'none';
                    bookingData.simulator = bookingData.simulator.filter(id => id !== simulatorId);
                } else {
                    // Удалена логика для "any" симулятора
                    if (!bookingData.simulator.includes(simulatorId)) {
                        bookingData.simulator.push(simulatorId);
                    }
                    this.classList.add('selected');
                    if (removeBtn) removeBtn.style.display = 'flex';
                }
                
                // Кнопка "Далее" всегда активна, если выбран хотя бы один симулятор
                if (bookingData.simulator.length === 0) {
                     toPackagePageBtn.classList.remove('active');
                     toPackagePageBtn.disabled = true;
                } else {
                    toPackagePageBtn.classList.add('active');
                    toPackagePageBtn.disabled = false;
                }
                updateBreadcrumb();
            });

            if (removeBtn) {
                removeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const parentSim = this.closest('.simulator-box');
                    if (parentSim) {
                        const simulatorId = parentSim.dataset.id;
                        parentSim.classList.remove('selected');
                        this.style.display = 'none';
                        bookingData.simulator = bookingData.simulator.filter(id => id !== simulatorId);
                        if (bookingData.simulator.length === 0) {
                            toPackagePageBtn.classList.remove('active');
                            toPackagePageBtn.disabled = true;
                        }
                    }
                    updateBreadcrumb();
                });
            }
        });

        // Генерация и обработка выбора дат в карусели
        function generateDateCarousel() {
            const carousel = document.getElementById('date-carousel');
            carousel.innerHTML = ''; // Очищаем перед генерацией

            const today = new Date();
            for (let i = 0; i < 30; i++) { // Генерируем даты на 30 дней вперед
                const date = new Date(today);
                date.setDate(today.getDate() + i);

                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear();
                const formattedDate = `${day}.${month}.${year}`;
                const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(date).toUpperCase();
                
                let dateText = `${day}<br><small>${monthName}</small>`;
                let isSelected = (bookingData.date === formattedDate);
                if (i === 0 && bookingData.date === formattedDate) {
                    dateText = `СЕГОДНЯ<br><small>${day} ${monthName}</small>`;
                }

                const dateItem = document.createElement('div');
                dateItem.classList.add('date-item');
                if (isSelected) {
                    dateItem.classList.add('selected');
                }
                dateItem.dataset.date = formattedDate;
                dateItem.innerHTML = dateText;

                dateItem.addEventListener('click', function() {
                    document.querySelectorAll('.date-item').forEach(item => item.classList.remove('selected'));
                    this.classList.add('selected');
                    bookingData.date = this.dataset.date;
                    
                    // Обновляем отображение даты вверху
                    if (this.dataset.date === todayFormatted) {
                        dateDisplay.textContent = `СЕГОДНЯ / ${today.getDate().toString().padStart(2, '0')} ${new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(today).toUpperCase()}`;
                    } else {
                        const [d, m, y] = this.dataset.date.split('.');
                        const selectedDateObj = new Date(y, parseInt(m) - 1, d);
                        dateDisplay.textContent = `${d} ${new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(selectedDateObj).toUpperCase()}`;
                    }
                    dateDisplay.closest('.date-display').classList.remove('expanded');
                    dateCarouselContainer.classList.add('hidden');
                    updateBreadcrumb();
                });
                carousel.appendChild(dateItem);
            }
            // Прокручиваем к выбранной дате, если она не сегодня и не первая в списке
            if (bookingData.date && bookingData.date !== todayFormatted) {
                const selectedDateElement = carousel.querySelector(`.date-item[data-date="${bookingData.date}"]`);
                if (selectedDateElement) {
                    selectedDateElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }
        }
    }


    // Настройка выбора пакета времени
    function setupPackageSelection() {
        document.getElementById('package-grid').innerHTML = packages.map(pkg => `
            <div class="grid-item package" data-duration="${pkg.duration}" data-price="${pkg.value}" data-hours="${pkg.hours}">
                <div>${pkg.duration}</div>
                <div class="price">${pkg.price}</div>
            </div>
        `).join('');
        
        document.querySelectorAll('.package').forEach(pkg => {
            pkg.addEventListener('click', function() {
                document.querySelectorAll('.package').forEach(p => p.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.duration = this.dataset.duration;
                bookingData.price = this.dataset.price;
                bookingData.hours = parseInt(this.dataset.hours); // Сохраняем количество часов
                document.getElementById('package-summary').textContent = 
                    `ВЫ ВЫБРАЛИ: ${this.dataset.duration} (${this.querySelector('.price').textContent})`;
                document.getElementById('toTimePageNew').classList.add('active');
                document.getElementById('toTimePageNew').disabled = false;
                setupTimeSlotsGenerator(); // Генерируем слоты после выбора пакета
                updateBreadcrumb();
            });
        });
    }

    // Настройка генерации временных слотов на основе выбранного пакета
    async function setupTimeSlotsGenerator() {
        const timeGrid = document.getElementById('time-grid');
        timeGrid.innerHTML = ''; // Очищаем предыдущие слоты

        if (!bookingData.hours || !bookingData.date || bookingData.simulator.length === 0) {
            // Если пакет, дата или симулятор не выбраны, не показываем слоты
            return;
        }

        const times = [];
        const durationHours = bookingData.hours;
        const selectedDate = bookingData.date; // e.g., "15.07.2025"

        // Fetch existing bookings for the selected date and simulators
        let occupiedSlots = [];
        if (supabase && currentSupabaseUser) { // Проверяем инициализацию Supabase
            console.log("Попытка получить занятые слоты из Supabase...");
            try {
                const { data: bookings, error } = await supabase
                    .from('bookings')
                    .select('time, simulator, hours') // Выбираем поля, как они названы в Supabase
                    .eq('date', selectedDate)
                    .neq('status', 'rejected'); // Исключаем отклоненные заявки

                if (error) {
                    console.error("Ошибка получения занятых слотов:", error);
                } else {
                    occupiedSlots = bookings.filter(booking => {
                        // Проверяем, пересекается ли хотя бы один симулятор
                        // Убедимся, что booking.simulator является массивом
                        const bookedSimulators = Array.isArray(booking.simulator) ? booking.simulator : [booking.simulator];
                        const simulatorOverlap = bookedSimulators.some(bookedSim => bookingData.simulator.includes(bookedSim));
                        return simulatorOverlap;
                    });
                    console.log("Занятые слоты для выбранной даты и симуляторов:", occupiedSlots);
                }

            } catch (error) {
                console.error("Ошибка при запросе занятых слотов (try-catch):", error);
            }
        } else {
            console.warn("Supabase не инициализирован или пользователь не аутентифицирован. Занятые слоты не будут загружены.");
        }

        // Генерируем временные слоты
        for (let hour = 10; hour <= 23; hour++) {
            let startHourFormatted = hour.toString().padStart(2, '0');
            let endHour = hour + durationHours;
            let endHourFormatted = endHour.toString().padStart(2, '0');
            let endTimeSuffix = '';

            if (endHour >= 24) {
                endHourFormatted = (endHour - 24).toString().padStart(2, '0');
                endTimeSuffix = ' (СЛЕДУЮЩИЙ ДЕНЬ)';
            }

            const currentTimeSlot = `${startHourFormatted}:00 – ${endHourFormatted}:00${endTimeSuffix}`;
            
            const isOccupied = occupiedSlots.some(occupied => {
                // Извлекаем только начальное время из строки "ЧЧ:ММ – ЧЧ:ММ"
                const occupiedStartTimeStr = occupied.time.split(' ')[0];
                const [occupiedStartHour] = occupiedStartTimeStr.split(':').map(Number);
                
                const currentStartTimeStr = currentTimeSlot.split(' ')[0];
                const [currentStartHour] = currentStartTimeSlot.split(':').map(Number);

                // Проверка на пересечение временных диапазонов
                // Упрощенная логика: если начальные часы совпадают, считаем занятым.
                // Для более точной проверки нужно учитывать длительность и полное пересечение.
                return occupiedStartHour === currentStartHour;
            });

            const disabledClass = isOccupied ? 'disabled' : '';

            times.push(`<div class="grid-item time-slot ${disabledClass}" data-time-range="${currentTimeSlot}">${currentTimeSlot}</div>`);
        }

        // Если "Ночь", добавляем специальный слот
        if (bookingData.duration === 'НОЧЬ') {
            const nightSlot = '00:00 – 08:00';
            const isNightSlotOccupied = occupiedSlots.some(occupied => {
                const occupiedStartTimeStr = occupied.time.split(' ')[0];
                const [occupiedStartHour] = occupiedStartTimeStr.split(':').map(Number);
                return occupiedStartHour === 0; // Проверка на начало в 00:00
            });
            const nightDisabledClass = isNightSlotOccupied ? 'disabled' : '';
            times.push(`<div class="grid-item time-slot ${nightDisabledClass}" data-time-range="${nightSlot}">${nightSlot}</div>`);
        }
        
        timeGrid.innerHTML = times.join('');
        
        document.querySelectorAll('.time-slot:not(.disabled)').forEach(slot => {
            slot.addEventListener('click', function() {
                document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.time = this.dataset.timeRange;
                document.getElementById('toFormPage').classList.add('active'); // Кнопка "Далее"
                document.getElementById('toFormPage').disabled = false;
                updateBreadcrumb();
            });
        });
        document.getElementById('toFormPage').classList.remove('active'); // Отключаем, пока слот не выбран
        document.getElementById('toFormPage').disabled = true;
    }

    // Загрузка данных пользователя из Supabase
    async function loadUserData(supabaseUserId, telegramId) {
        if (!supabase || !currentSupabaseUser || !telegramId) {
            console.warn("Невозможно загрузить данные пользователя: Supabase не инициализирован, или нет ID пользователя/Telegram.");
            return;
        }
        console.log("Попытка загрузить данные пользователя из Supabase...");
        try {
            const { data: userData, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', supabaseUserId) // Ищем по Supabase User ID
                .eq('telegram_id', telegramId) // Дополнительная проверка по Telegram ID
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found (нет строк)
                console.error("Ошибка загрузки данных пользователя:", error);
                return;
            }

            if (userData) {
                console.log("Загружены данные пользователя:", userData);
                
                const nameInput = document.querySelector('#form-step input[type="text"]');
                const phoneInput = document.getElementById('phone');
                const telegramInput = document.getElementById('telegram');
                const phonePrefix = '+7 (XXX) XXX-'; // Префикс для отображения

                if (nameInput && userData.name) nameInput.value = userData.name;
                if (phoneInput && userData.phone_last_4_digits) {
                    // Восстанавливаем полный номер для отображения
                    phoneInput.value = phonePrefix + userData.phone_last_4_digits;
                    phoneInput.dataset.last4 = userData.phone_last_4_digits; // Сохраняем для проверки
                    bookingData.phone = phoneInput.value; // Обновляем bookingData для отображения
                } else {
                    phoneInput.value = phonePrefix; // Устанавливаем префикс, если данных нет
                }
                if (telegramInput && userData.telegram_username) telegramInput.value = userData.telegram_username;

                // Обновляем bookingData
                bookingData.name = userData.name || null;
                // bookingData.phone уже обновлен выше или останется null
                bookingData.telegram = userData.telegram_username || null;

                console.log("Форма предзаполнена данными пользователя.");
            } else {
                console.log("Данные пользователя не найдены. Форма останется пустой или с данными из Telegram Web App.");
                document.querySelector('#form-step input[type="text"]').value = '';
                document.getElementById('phone').value = phonePrefix; // Устанавливаем префикс
                document.getElementById('telegram').value = bookingData.telegram; // Предзаполняем Telegram ником из WebApp
            }
        } catch (error) {
            console.error("Ошибка при загрузке данных пользователя (try-catch):", error);
        }
    }

    // Сохранение данных пользователя в Supabase
    async function saveUserData() {
        console.log("saveUserData called. bookingData.telegramId:", bookingData.telegramId); // Лог для отладки
        if (!supabase || !currentSupabaseUser || !bookingData.telegramId) {
            console.warn("Невозможно сохранить данные пользователя: Supabase не инициализирован, или нет ID пользователя/Telegram.");
            return;
        }
        console.log("Попытка сохранить данные пользователя в Supabase...");
        try {
            const userDataToSave = {
                id: currentSupabaseUser.id, // Supabase User ID
                telegram_id: bookingData.telegramId,
                name: bookingData.name,
                telegram_username: bookingData.telegram,
                // Сохраняем только последние 4 цифры из bookingData.phone
                phone_last_4_digits: bookingData.phone ? bookingData.phone.slice(-4) : null 
            };

            const { error } = await supabase
                .from('users')
                .upsert(userDataToSave, { onConflict: 'id' }); // Обновляем, если есть конфликт по id

            if (error) {
                console.error("Ошибка сохранения данных пользователя:", error);
            } else {
                console.log("Данные пользователя сохранены в Supabase.");
            }
        } catch (error) {
            console.error("Ошибка при сохранении данных пользователя (try-catch):", error);
        }
    }

    // Настройка формы
    function setupForm() {
        const phoneInput = document.getElementById('phone');
        const phonePrefix = '+7 (XXX) XXX-'; // Фиксированный префикс

        // Инициализируем поле телефона с префиксом и ставим курсор в конец
        if (phoneInput) {
            // Устанавливаем значение только если оно еще не предзаполнено loadUserData
            if (!phoneInput.value || phoneInput.value === '+7 ') { // Проверяем на старую заглушку
                phoneInput.value = phonePrefix;
            }
            phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length); // Ставим курсор в конец

            phoneInput.addEventListener('focus', function() {
                // Если пользователь убрал префикс, восстанавливаем его
                if (!this.value.startsWith(phonePrefix)) {
                    this.value = phonePrefix;
                }
                this.setSelectionRange(this.value.length, this.value.length); // Курсор всегда в конце
            });

            phoneInput.addEventListener('input', function(e) {
                let currentValue = this.value;
                if (!currentValue.startsWith(phonePrefix)) {
                    currentValue = phonePrefix; // Сброс, если префикс удален
                }

                // Извлекаем только цифры после префикса и ограничиваем до 4
                let last4Digits = currentValue.substring(phonePrefix.length).replace(/\D/g, '');
                if (last4Digits.length > 4) {
                    last4Digits = last4Digits.substring(0, 4); 
                }

                this.value = phonePrefix + last4Digits;
                this.setSelectionRange(this.value.length, this.value.length); // Курсор всегда в конце

                // Обновляем bookingData полным отформатированным номером для отображения
                bookingData.phone = this.value; 
            });

            // Предотвращаем удаление префикса
            phoneInput.addEventListener('keydown', function(e) {
                if (e.key === 'Backspace' && this.selectionStart <= phonePrefix.length) {
                    e.preventDefault();
                }
                if (e.key === 'Delete' && this.selectionStart < phonePrefix.length) {
                    e.preventDefault();
                }
            });
        } else {
            console.warn("Элемент 'phone' не найден. Форматирование номера телефона не будет работать.");
        }
        
        // Валидация Telegram
        const telegramInput = document.getElementById('telegram');
        if (telegramInput) {
            telegramInput.addEventListener('input', function(e) {
                this.value = this.value.replace(/[^a-zA-Z0-9_]/g, '');
            });
        } else {
            console.warn("Элемент 'telegram' не найден. Валидация Telegram не будет работать.");
        }
    }

    // Настройка навигации
    function setupNavigation() {
        // Кнопки "Далее"
        document.getElementById('toPackagePage').addEventListener('click', () => showStep(1)); // С даты+симулятора на пакет
        document.getElementById('toTimePageNew').addEventListener('click', () => setupTimeSlotsGenerator().then(() => showStep(2))); // С пакета на время
        document.getElementById('toFormPage').addEventListener('click', () => showStep(3)); // Со времени на форму
        
        // Кнопки "Назад"
        document.getElementById('backToDateSimulatorPage').addEventListener('click', () => showStep(0)); // С пакета на дату+симулятор
        document.getElementById('backToPackagePage').addEventListener('click', () => showStep(1)); // Со времени на пакет
        document.getElementById('backToTimePageNew').addEventListener('click', () => showStep(2)); // С формы на время
        
        const bookingForm = document.getElementById('booking-form');
        if (bookingForm) {
            bookingForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                if (!this.checkValidity()) {
                    this.reportValidity();
                    return;
                }
                
                bookingData.name = this.querySelector('input[type="text"]').value;
                // bookingData.phone уже обновляется в setupForm при вводе
                bookingData.telegram = this.querySelector('#telegram').value;
                bookingData.comment = this.querySelector('textarea').value;
                
                console.log("Booking data before saving (from form submission):", bookingData); // Лог для отладки
                
                await saveUserData();
                
                showConfirmation();
            });
        } else {
            console.warn("Элемент 'booking-form' не найден. Отправка формы не будет работать.");
        }
    }

    // Показываем страницу подтверждения и сохраняем бронирование
    async function showConfirmation() {
        const details = document.getElementById('confirmation-details');
        
        if (!details) {
            console.error("Элемент 'confirmation-details' не найден.");
            return;
        }

        details.innerHTML = `
            <p><strong>ДАТА:</strong> ${bookingData.date}</p>
            <p><strong>ТАРИФ:</strong> ${bookingData.duration}</p>
            <p><strong>ВРЕМЯ:</strong> ${bookingData.time}</p>
            <p><strong>СИМУЛЯТОР(Ы):</strong> ${getSimulatorNames(bookingData.simulator)}</p>
            <p><strong>ИМЯ:</strong> ${bookingData.name}</p>
            <p><strong>ТЕЛЕФОН:</strong> ${bookingData.phone}</p>
            <p><strong>TELEGRAM:</strong> @${bookingData.telegram}</p>
            ${bookingData.comment ? `<p><strong>КОММЕНТАРИЙ:</strong> ${bookingData.comment}</p>` : ''}
        `;
        
        // Сохраняем бронирование в Supabase
        if (supabase && currentSupabaseUser) {
            console.log("Попытка сохранить бронирование в Supabase. bookingData.telegramId:", bookingData.telegramId); // Лог для отладки
            try {
                const { data, error } = await supabase
                    .from('bookings')
                    .insert({
                        user_id: currentSupabaseUser.id, // Supabase User ID
                        telegram_id: bookingData.telegramId, // Telegram user ID (гарантированно не null)
                        date: bookingData.date,
                        time: bookingData.time, // Имя поля в Supabase
                        simulator: bookingData.simulator, // Имя поля в Supabase
                        duration_text: bookingData.duration,
                        hours: bookingData.hours, // Имя поля в Supabase
                        price: parseInt(bookingData.price), // Убедимся, что это число
                        name: bookingData.name,
                        phone_last_4_digits: bookingData.phone ? bookingData.phone.slice(-4) : null, // Сохраняем только последние 4 цифры
                        telegram_username: bookingData.telegram,
                        comment: bookingData.comment,
                        status: 'pending', // Новый статус по умолчанию
                        created_at: new Date().toISOString() // ISO строка для timestamp
                    }).select(); // Добавляем .select() для получения вставленных данных

                if (error) {
                    console.error("Ошибка сохранения бронирования:", error);
                } else {
                    console.log("Бронирование сохранено в Supabase. Данные:", data);
                    // --- ВНИМАНИЕ: Здесь больше НЕТ вызова Edge Function. ---
                    // --- Python-бот будет сам мониторить базу данных. ---
                }
            } catch (error) {
                console.error("Ошибка при сохранении бронирования (try-catch):", error);
            }
        } else {
            console.warn("Supabase не инициализирован или пользователь не аутентифицирован. Бронирование не будет сохранено.");
        }

        showStep(4); // Переходим на шаг подтверждения (теперь это шаг 4)
        updateBreadcrumb();
    }

    // Настройка действий на странице подтверждения
    function setupConfirmationActions() {
        document.getElementById('book-again')?.addEventListener('click', resetBooking);
        
        document.getElementById('reschedule')?.addEventListener('click', function() {
            const rescheduleMessage = document.getElementById('reschedule-message');
            if (rescheduleMessage) {
                rescheduleMessage.style.display = 'block';
                setTimeout(() => {
                    rescheduleMessage.style.display = 'none';
                }, 3000);
            }
        });
        
        document.getElementById('cancel-booking')?.addEventListener('click', function() {
            const cancelModal = document.getElementById('cancel-modal');
            if (cancelModal) cancelModal.style.display = 'flex';
        });
        
        document.getElementById('confirm-cancel')?.addEventListener('click', function() {
            const cancelModal = document.getElementById('cancel-modal');
            const cancelMessage = document.getElementById('cancel-message');
            if (cancelModal) cancelModal.style.display = 'none';
            if (cancelMessage) {
                cancelMessage.style.display = 'block';
                setTimeout(() => {
                    cancelMessage.style.display = 'none';
                    resetBooking();
                }, 1500);
            }
        });
        
        document.getElementById('cancel-cancel')?.addEventListener('click', function() {
            const cancelModal = document.getElementById('cancel-modal');
            if (cancelModal) cancelModal.style.display = 'none';
        });
    }

    // Настройка кнопок карты и такси
    function setupMapButtons() {
        const address = 'Ростов-на-Дону, ул. Б. Садовая, 70';
        
        document.getElementById('route-btn')?.addEventListener('click', function() {
            const url = `https://yandex.ru/maps/?rtext=~${encodeURIComponent(address)}`;
            window.open(url, '_blank');
        });
        
        document.getElementById('taxi-btn')?.addEventListener('click', function() {
            const url = `https://3.redirect.appmetrica.yandex.com/route?end-lat=47.222078&end-lon=39.720349&end-name=${encodeURIComponent(address)}`;
            window.open(url, '_blank');
        });
    }

    // Сброс бронирования
    function resetBooking() {
        for (const key in bookingData) {
            if (key === 'simulator') {
                bookingData[key] = [];
            } else if (key === 'telegramId' || key === 'telegram') {
                // Не сбрасываем Telegram ID и ник, так как они приходят из WebApp
                continue;
            } else {
                bookingData[key] = null;
            }
        }
        
        document.getElementById('booking-form')?.reset();
        document.getElementById('phone').value = '+7 (XXX) XXX-'; // Сбрасываем с префиксом
        
        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.remove-selection').forEach(el => el.style.display = 'none');
        
        // Сбрасываем активность кнопок
        document.getElementById('toPackagePage').classList.remove('active');
        document.getElementById('toPackagePage').disabled = true;
        document.getElementById('toTimePageNew').classList.remove('active');
        document.getElementById('toTimePageNew').disabled = true;
        document.getElementById('toFormPage').classList.remove('active');
        document.getElementById('toFormPage').disabled = true;

        // Первая кнопка "Далее" всегда активна после сброса (для объединенного шага)
        document.getElementById('toPackagePage').classList.add('active');
        document.getElementById('toPackagePage').disabled = false;
        
        // Сброс и инициализация объединенного шага
        const today = new Date();
        const todayFormatted = `${today.getDate().toString().padStart(2, '0')}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getFullYear()}`;
        bookingData.date = todayFormatted;
        document.getElementById('date-display-text').textContent = `СЕГОДНЯ / ${today.getDate().toString().padStart(2, '0')} ${new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(today).toUpperCase()}`;
        document.getElementById('date-display-text').closest('.date-display').classList.remove('expanded');
        document.getElementById('date-carousel-container').classList.add('hidden');
        
        const defaultSimulator = document.querySelector('.simulator-box[data-id="1"]');
        if (defaultSimulator) {
            defaultSimulator.classList.add('selected');
            defaultSimulator.querySelector('.remove-selection').style.display = 'flex';
            bookingData.simulator = ['1'];
        }

        showStep(0);
        updateBreadcrumb();
    }

    // Вспомогательные функции
    function getSimulatorNames(simulatorIds) {
        // Удалена логика для "any" симулятора
        return simulatorIds.map(id => `АВТОСИМ ${id}`).join(', ');
    }

    // Запускаем приложение
    init();
});
