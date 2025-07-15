// Импорт Supabase клиента
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Supabase клиент, инициализируется как null и будет создан в init()
let supabase = null;
let currentSupabaseUser = null; // Будет хранить аутентифицированного пользователя Supabase

document.addEventListener('DOMContentLoaded', async function() {
    // Все данные бронирования
    const bookingData = {
        date: null,
        time: null,
        simulator: [], // Массив для множественного выбора
        wheel: null,
        duration: null, // Длительность пакета, например "1 час"
        price: null,
        name: null,
        phone: null, // Теперь будет хранить полный отформатированный номер для отображения
        telegram: '', // Инициализируем как пустую строку
        telegramId: '', // Инициализируем как пустую строку
        comment: null
    };

    // Все пакеты времени
    const packages = [
        { duration: '1 час', price: '450 ₽', value: 450, hours: 1 },
        { duration: '2 часа', price: '800 ₽', value: 800, hours: 2 },
        { duration: '3 часа', price: '1050 ₽', value: 1050, hours: 3 },
        { duration: '5 часов', price: '1600 ₽', value: 1600, hours: 5 },
        { duration: 'Ночь', price: '2000 ₽', value: 2000, hours: 8 } // Пример для "Ночь" - 8 часов
    ];

    // Вспомогательная функция для показа заглушки
    function showFallbackContent() {
        const fallbackDiv = document.getElementById('web-app-fallback');
        const mainContentDiv = document.getElementById('main-booking-content');
        if (fallbackDiv) fallbackDiv.classList.remove('hidden');
        if (mainContentDiv) mainContentDiv.classList.add('hidden');
        document.body.style.alignItems = 'center';

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
        if (fallbackDiv) fallbackDiv.classList.add('hidden');
        if (mainContentDiv) mainContentDiv.classList.remove('hidden');
        document.body.style.alignItems = 'flex-start';
        console.log("Telegram Web App готов и обнаружен. Отображается основной контент.");
    }

    // Инициализация приложения
    async function init() {
        console.log("init() called.");

        let telegramInitialized = false;

        // Попытка инициализации Telegram Web App немедленно
        if (window.Telegram && window.Telegram.WebApp) {
            try {
                Telegram.WebApp.ready();
                Telegram.WebApp.expand();
                showMainContent(); // Показываем основной контент сразу
                telegramInitialized = true;

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
                telegramInitialized = false;
            }
        }

        // Если Telegram Web App не был инициализирован немедленно, планируем показ заглушки
        if (!telegramInitialized) {
            setTimeout(() => {
                // Повторная проверка после небольшой задержки, на случай асинхронной загрузки
                if (window.Telegram && window.Telegram.WebApp) {
                    try {
                        Telegram.WebApp.ready();
                        Telegram.WebApp.expand();
                        showMainContent();
                        const userTg = Telegram.WebApp.initDataUnsafe.user;
                        if (userTg && typeof userTg.id === 'number') {
                            bookingData.telegramId = userTg.id.toString();
                            bookingData.telegram = userTg.username || '';
                        } else {
                            bookingData.telegramId = 'fallback_tg_id_' + Math.random().toString(36).substring(7);
                            bookingData.telegram = 'fallback_user';
                        }
                    } catch (e) {
                        console.error("Ошибка инициализации Telegram Web App после задержки:", e);
                        showFallbackContent(); // Если не удалось инициализировать даже после задержки, показываем заглушку
                    }
                } else {
                    showFallbackContent(); // Telegram Web App все еще не обнаружен, показываем заглушку
                }
            }, 500); // Короткая задержка, чтобы дать Telegram SDK время на загрузку
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
        setupCalendar();
        setupSimulatorSelection();
        setupPackageSelection();
        setupTimeSlotsGenerator(); // Будет вызван снова после выбора пакета
        setupWheelSelection();
        setupForm();
        setupNavigation();
        setupConfirmationActions();
        setupMapButtons();
        setupAIChatFeature(); // Новая функция для настройки AI чата
        showStep(0); // Начинаем с первого шага
    }

    // Показываем нужный шаг и скрываем остальные
    function showStep(stepNumber) {
        document.querySelectorAll('.step-page').forEach(step => {
            step.classList.remove('active');
        });
        
        const steps = [
            'date-select-container', // 0
            'simulator-step',        // 1
            'package-step',          // 2
            'time-select-step',      // 3
            'wheel-step',            // 4
            'form-step',             // 5
            'confirmation-step'      // 6
        ];
        document.getElementById(steps[stepNumber]).classList.add('active');
        
        updateProgress(stepNumber);
    }

    // Обновляем прогресс-бар
    function updateProgress(step) {
        const progress = (step / (document.querySelectorAll('.step-page').length - 1)) * 100;
        document.getElementById('booking-progress').style.width = `${progress}%`;
    }

    // Настройка выбора даты
    function setupCalendar() {
        const daySelect = document.getElementById('day');
        const monthSelect = document.getElementById('month');
        console.log("setupCalendar() called. daySelect:", daySelect, "monthSelect:", monthSelect); // Отладка: Проверка наличия элементов

        if (!daySelect || !monthSelect) {
            console.error("Элементы выбора даты или месяца не найдены в DOM. Убедитесь, что index.html содержит <select id='day'> и <select id='month'>.");
            return; // Выходим, если элементы не найдены
        }

        const today = new Date();
        
        const months = [
            'Январь', 'Февраль', 'Март', 'Апрель', 
            'Май', 'Июнь', 'Июль', 'Август',
            'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];
        
        // Заполняем выбор месяца
        const monthOptionsHtml = months.map((month, index) => 
            `<option value="${index}">${month}</option>`
        ).join('');
        monthSelect.innerHTML = monthOptionsHtml;
        console.log("monthSelect.innerHTML установлено:", monthOptionsHtml); // Отладка: Проверка содержимого месяца
        
        monthSelect.value = today.getMonth();
        console.log("monthSelect.value установлено на:", monthSelect.value); // Отладка: Проверка установленного значения месяца

        updateDays(); // Первоначальный вызов для заполнения дней
        
        monthSelect.addEventListener('change', updateDays);
        daySelect.addEventListener('change', function() {
            updateBookingDate();
        });
        
        function updateDays() {
            console.log("updateDays() called."); // Отладка: Проверка вызова updateDays()
            const selectedMonth = parseInt(monthSelect.value);
            const year = today.getFullYear();
            const daysInMonth = new Date(year, selectedMonth + 1, 0).getDate();
            const currentDay = today.getDate();
            
            let options = '';
            for (let i = 1; i <= daysInMonth; i++) {
                const selected = (selectedMonth === today.getMonth() && i === currentDay) ? 'selected' : '';
                options += `<option value="${i}" ${selected}>${i}</option>`;
            }
            
            daySelect.innerHTML = options;
            console.log("daySelect.innerHTML установлено:", options); // Отладка: Проверка содержимого дня
            updateBookingDate();
        }
        
        function updateBookingDate() {
            console.log("updateBookingDate() called."); // Отладка: Проверка вызова updateBookingDate()
            const day = daySelect.value;
            const month = parseInt(monthSelect.value) + 1;
            const year = today.getFullYear();
            bookingData.date = `${day.padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`;
            document.getElementById('toTimePage').disabled = false;
            console.log("bookingData.date обновлено до:", bookingData.date); // Отладка: Проверка bookingData.date
        }
    }

    // Настройка выбора симулятора
    function setupSimulatorSelection() {
        document.querySelectorAll('.simulator, .simulator-box').forEach(sim => {
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
                    if (simulatorId === 'any') {
                        document.querySelectorAll('.simulator-box.selected').forEach(s => {
                            s.classList.remove('selected');
                            const sRemoveBtn = s.querySelector('.remove-selection');
                            if (sRemoveBtn) sRemoveBtn.style.display = 'none';
                        });
                        bookingData.simulator = ['any'];
                    } else {
                        const anySim = document.querySelector('.simulator.full');
                        if (anySim && anySim.classList.contains('selected')) {
                            anySim.classList.remove('selected');
                            const anyRemoveBtn = anySim.querySelector('.remove-selection');
                            if (anyRemoveBtn) anyRemoveBtn.style.display = 'none';
                            bookingData.simulator = [];
                        }
                        
                        if (!bookingData.simulator.includes(simulatorId)) {
                            bookingData.simulator.push(simulatorId);
                        }
                    }
                    this.classList.add('selected');
                    if (removeBtn) removeBtn.style.display = 'flex';
                }
                
                document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0;
            });

            if (removeBtn) {
                removeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const parentSim = this.closest('.simulator, .simulator-box');
                    if (parentSim) {
                        const simulatorId = parentSim.dataset.id;
                        parentSim.classList.remove('selected');
                        this.style.display = 'none';
                        bookingData.simulator = bookingData.simulator.filter(id => id !== simulatorId);
                        document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0;
                    }
                });
            }
        });
    }

    // Настройка выбора пакета времени
    function setupPackageSelection() {
        document.getElementById('package-grid').innerHTML = packages.map(pkg => `
            <div class="package" data-duration="${pkg.duration}" data-price="${pkg.value}" data-hours="${pkg.hours}">
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
                bookingData.hours = parseInt(this.dataset.hours);
                document.getElementById('package-summary').textContent = 
                    `Вы выбрали: ${this.dataset.duration} (${this.querySelector('.price').textContent})`;
                document.getElementById('toTimePageNew').disabled = false;
                setupTimeSlotsGenerator();
            });
        });
    }

    // Настройка генерации временных слотов на основе выбранного пакета
    async function setupTimeSlotsGenerator() {
        const timeGrid = document.getElementById('time-grid');
        timeGrid.innerHTML = ''; // Очищаем предыдущие слоты

        if (!bookingData.hours || !bookingData.date || bookingData.simulator.length === 0) {
            return;
        }

        const times = [];
        const durationHours = bookingData.hours;
        const selectedDate = bookingData.date; // e.g., "15.07.2025"

        let occupiedSlots = [];
        if (supabase && currentSupabaseUser) {
            console.log("Попытка получить занятые слоты из Supabase...");
            try {
                const { data: bookings, error } = await supabase
                    .from('bookings')
                    .select('time_range, simulator_ids, duration_hours')
                    .eq('date', selectedDate)
                    .neq('status', 'rejected'); // Исключаем отклоненные заявки

                if (error) {
                    console.error("Ошибка получения занятых слотов:", error);
                } else {
                    occupiedSlots = bookings.filter(booking => {
                        // Проверяем, пересекается ли хотя бы один симулятор
                        const simulatorOverlap = booking.simulator_ids.some(bookedSim => bookingData.simulator.includes(bookedSim));
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
                endTimeSuffix = ' (следующий день)';
            }

            const currentTimeSlot = `${startHourFormatted}:00 – ${endHourFormatted}:00${endTimeSuffix}`;
            
            const isOccupied = occupiedSlots.some(occupied => {
                // Извлекаем только начальное время из строки "ЧЧ:ММ – ЧЧ:ММ"
                const occupiedStartTimeStr = occupied.time_range.split(' ')[0];
                const [occupiedStartHour] = occupiedStartTimeStr.split(':').map(Number);
                
                const currentStartTimeStr = currentTimeSlot.split(' ')[0];
                const [currentStartHour] = currentStartTimeSlot.split(':').map(Number);

                // Проверка на пересечение временных диапазонов
                // Упрощенная логика: если начальные часы совпадают, считаем занятым.
                // Для более точной проверки нужно учитывать длительность и полное пересечение.
                return occupiedStartHour === currentStartHour;
            });

            const disabledClass = isOccupied ? 'disabled' : '';

            times.push(`<div class="time-slot ${disabledClass}" data-time-range="${currentTimeSlot}">${currentTimeSlot}</div>`);
        }

        // Если "Ночь", добавляем специальный слот
        if (bookingData.duration === 'Ночь') {
            const nightSlot = '00:00 – 08:00';
            const isNightSlotOccupied = occupiedSlots.some(occupied => {
                const occupiedStartTimeStr = occupied.time_range.split(' ')[0];
                const [occupiedStartHour] = occupiedStartTimeStr.split(':').map(Number);
                return occupiedStartHour === 0; // Проверка на начало в 00:00
            });
            const nightDisabledClass = isNightSlotOccupied ? 'disabled' : '';
            times.push(`<div class="time-slot ${nightDisabledClass}" data-time-range="${nightSlot}">${nightSlot}</div>`);
        }
        
        timeGrid.innerHTML = times.join('');
        
        document.querySelectorAll('.time-slot:not(.disabled)').forEach(slot => {
            slot.addEventListener('click', function() {
                document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.time = this.dataset.timeRange;
                document.getElementById('toWheelPage').disabled = false;
            });
        });
        document.getElementById('toWheelPage').disabled = true; // Отключаем, пока слот не выбран
    }

    // Настройка выбора руля
    function setupWheelSelection() {
        document.querySelectorAll('.wheel').forEach(wheel => {
            wheel.addEventListener('click', function() {
                document.querySelectorAll('.wheel').forEach(w => w.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.wheel = this.dataset.id;
                document.getElementById('toFormPage').disabled = false;
            });
        });
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
                document.getElementById('phone').value = '+7 (XXX) XXX-'; // Устанавливаем префикс
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
        document.getElementById('toTimePage').addEventListener('click', () => showStep(1));
        document.getElementById('toPackagePage').addEventListener('click', () => showStep(2));
        document.getElementById('toTimePageNew').addEventListener('click', () => setupTimeSlotsGenerator().then(() => showStep(3))); // Перегенерация слотов перед показом
        document.getElementById('toWheelPage').addEventListener('click', () => showStep(4));
        document.getElementById('toFormPage').addEventListener('click', () => showStep(5));
        
        document.getElementById('backToCalendarPage').addEventListener('click', () => showStep(0));
        document.getElementById('backToSimulatorPage').addEventListener('click', () => showStep(1));
        document.getElementById('backToPackagePage').addEventListener('click', () => showStep(2));
        document.getElementById('backToTimePageNew').addEventListener('click', () => showStep(3));
        document.getElementById('backToWheelPage').addEventListener('click', () => showStep(4));
        
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
            <p><strong>Дата:</strong> ${bookingData.date}</p>
            <p><strong>Тариф:</strong> ${bookingData.duration}</p>
            <p><strong>Время:</strong> ${bookingData.time}</p>
            <p><strong>Симулятор(ы):</strong> ${getSimulatorNames(bookingData.simulator)}</p>
            <p><strong>Руль:</strong> ${getWheelName(bookingData.wheel)}</p>
            <p><strong>Имя:</strong> ${bookingData.name}</p>
            <p><strong>Телефон:</strong> ${bookingData.phone}</p>
            <p><strong>Telegram:</strong> @${bookingData.telegram}</p>
            ${bookingData.comment ? `<p><strong>Комментарий:</strong> ${bookingData.comment}</p>` : ''}
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
                        time_range: bookingData.time,
                        simulator_ids: bookingData.simulator, // Массив строк
                        wheel: bookingData.wheel,
                        duration_text: bookingData.duration,
                        duration_hours: bookingData.hours,
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

        showStep(6);
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

        // Добавление обработчика для кнопки AI чата
        document.getElementById('ask-ai-steward')?.addEventListener('click', openAIChatModal);
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
        
        document.querySelectorAll('.next-btn').forEach(btn => btn.disabled = true);
        const toTimePageBtn = document.getElementById('toTimePage');
        if (toTimePageBtn) toTimePageBtn.disabled = false;
        
        showStep(0);
    }

    // Вспомогательные функции
    function getWheelName(wheelId) {
        const wheels = {
            'ks': 'Штурвал KS',
            'cs': 'Круглый CS',
            'nobutton': 'Круглый без кнопок',
            'any': 'Выберу на месте'
        };
        return wheels[wheelId] || wheelId;
    }

    function getSimulatorNames(simulatorIds) {
        if (simulatorIds.includes('any')) {
            return 'Любой';
        }
        return simulatorIds.map(id => `Симулятор #${id}`).join(', ');
    }

    // --- Функции для AI Чата ---
    const aiChatModal = document.getElementById('ai-chat-modal');
    const aiChatInput = document.getElementById('ai-chat-input');
    const aiChatResponse = document.getElementById('ai-chat-response');
    const aiChatSubmitBtn = document.getElementById('ai-chat-submit');
    const aiChatCloseBtn = document.getElementById('ai-chat-close');

    function setupAIChatFeature() {
        if (aiChatSubmitBtn) {
            aiChatSubmitBtn.addEventListener('click', handleAIChatSubmit);
        }
        if (aiChatCloseBtn) {
            aiChatCloseBtn.addEventListener('click', closeAIChatModal);
        }
        if (aiChatInput) {
            aiChatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    handleAIChatSubmit();
                }
            });
        }
    }

    function openAIChatModal() {
        if (aiChatModal) {
            aiChatModal.style.display = 'flex';
            aiChatInput.value = ''; // Очищаем поле ввода
            aiChatResponse.innerHTML = 'Привет! Я здесь, чтобы ответить на ваши вопросы о клубе. Спрашивайте!'; // Сброс текста ответа
            aiChatInput.focus();
        }
    }

    function closeAIChatModal() {
        if (aiChatModal) {
            aiChatModal.style.display = 'none';
        }
    }

    async function handleAIChatSubmit() {
        const question = aiChatInput.value.trim();
        if (!question) {
            // Заменил alert на console.error или более мягкое сообщение в UI, если есть
            console.error('Пожалуйста, введите ваш вопрос.');
            // Можно добавить временное сообщение в aiChatResponse
            aiChatResponse.innerHTML = '<div class="text-center text-red-500">Пожалуйста, введите ваш вопрос.</div>';
            setTimeout(() => {
                aiChatResponse.innerHTML = 'Привет! Я здесь, чтобы ответить на ваши вопросы о клубе. Спрашивайте!';
            }, 2000);
            return;
        }

        aiChatResponse.innerHTML = '<div class="text-center text-blue-500">Загрузка...</div>'; // Индикатор загрузки
        aiChatSubmitBtn.disabled = true;
        aiChatInput.disabled = true;

        try {
            const responseText = await callGeminiAPI(question);
            aiChatResponse.innerHTML = responseText;
        } catch (error) {
            console.error("Ошибка при вызове Gemini API:", error);
            aiChatResponse.innerHTML = 'Извините, произошла ошибка при получении ответа. Попробуйте еще раз.';
        } finally {
            aiChatSubmitBtn.disabled = false;
            aiChatInput.disabled = false;
            aiChatInput.value = ''; // Очищаем поле после отправки
        }
    }

    async function callGeminiAPI(userQuestion) {
        // Добавил больше контекста для AI, чтобы он отвечал как стюард гоночного клуба
        const prompt = `Вы полезный и дружелюбный стюард клуба симуляторов гонок. Ответьте на следующий вопрос о клубе, ценах, услугах, расписании или правилах. Старайтесь быть кратким и по делу. Если вы не знаете ответа на вопрос, вежливо сообщите, что у вас нет этой информации и предложите связаться с администратором напрямую. Вопрос: ${userQuestion}`;
        
        let chatHistory = [];
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });

        const payload = { contents: chatHistory };
        const apiKey = ""; // Canvas автоматически предоставит ключ во время выполнения
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            return result.candidates[0].content.parts[0].text;
        } else {
            console.error("Неожиданная структура ответа от Gemini API:", result);
            return "Извините, не удалось получить ответ от AI. Пожалуйста, попробуйте перефразировать вопрос.";
        }
    }

    // Запускаем приложение
    init();
});
