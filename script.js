import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

document.addEventListener('DOMContentLoaded', async function() {
    // Supabase variables (provided by the Canvas environment)
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'; // Canvas-specific app ID
    const supabaseConfig = typeof __supabase_config !== 'undefined' ? JSON.parse(__supabase_config) : {};
    
    let supabaseUrl = supabaseConfig.supabaseUrl || "https://jvzogsjammwaityyqfjq.supabase.co"; // Замените на ваш Supabase URL
    let supabaseAnonKey = supabaseConfig.supabaseAnonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2em9nc2phbW13YWl0eXlxZmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI1MDE1ODAsImV4cCI6MjA2ODA3NzU4MH0.JrdjGBmC1rTwraBGzKIHE87Qd2MVaS7odoW-ldJzyGw"; // Замените на ваш Supabase Anon Key

    // Critical check for Supabase credentials
    if (supabaseUrl === "https://jvzogsjammwaityyqfjq.supabase.co" || supabaseAnonKey === "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2em9nc2phbW13YWl0eXlxZmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI1MDE1ODAsImV4cCI6MjA2ODA3NzU4MH0.JrdjGBmC1rTwraBGzKIHE87Qd2MVaS7odoW-ldJzyGw") {
        console.error("КРИТИЧЕСКАЯ ОШИБКА: Supabase URL или Anon Key отсутствует или является заглушкой. Пожалуйста, убедитесь, что ваша среда Canvas предоставляет полную и действительную конфигурацию Supabase через __supabase_config.");
        // В продакшене здесь можно отобразить сообщение об ошибке пользователю или отключить функциональность.
        // Для отладки мы продолжим с заглушками, но операции с базой данных будут завершаться с ошибкой.
    }

    let supabase; // Supabase client instance
    let userId; // Supabase user ID
    let isAuthReady = false; // Флаг готовности аутентификации

    // Все данные бронирования
    const bookingData = {
        date: null,
        time: null,
        simulator: [], // Изменено на массив для множественного выбора
        wheel: null, // Удален из макета, но оставлен для совместимости
        duration: null, // Длительность пакета, например "1 час"
        price: null,
        name: null,
        phone: null,
        telegram: null,
        telegramId: null, // Добавляем Telegram ID
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

    // Инициализация приложения
    async function init() {
        try {
            // Инициализация Supabase клиента
            supabase = createClient(supabaseUrl, supabaseAnonKey);
            console.log("Supabase клиент инициализирован.");

            // Анонимная аутентификация
            const { data, error } = await supabase.auth.signInAnonymously();
            if (error) {
                console.error("Ошибка анонимного входа в Supabase:", error);
                // Отобразить сообщение об ошибке пользователю
                return; // Остановить инициализацию, если аутентификация не удалась
            }
            userId = data.user.id; // Получаем ID пользователя Supabase
            isAuthReady = true; // Клиент Supabase готов, и пользователь "аутентифицирован" анонимно
            console.log("Пользователь Supabase вошел анонимно. ID пользователя:", userId);

            // Инициализация Telegram Web App
            if (window.Telegram && window.Telegram.WebApp) {
                Telegram.WebApp.ready();
                Telegram.WebApp.expand();
                console.log("Telegram Web App готов.");

                const userTg = Telegram.WebApp.initDataUnsafe.user;
                if (userTg) {
                    bookingData.telegramId = userTg.id.toString(); // Сохраняем Telegram ID
                    console.log("Данные пользователя Telegram:", userTg);
                    await loadUserData(bookingData.telegramId); // Загружаем данные пользователя
                }
            } else {
                console.warn("Telegram Web App SDK не найден или не готов.");
            }

            // Вызываем функции настройки ТОЛЬКО ПОСЛЕ того, как Supabase готов и пользователь аутентифицирован
            setupCalendar();
            setupSimulatorSelection();
            setupPackageSelection();
            setupTimeSlotsGenerator(); // Будет вызван снова после выбора пакета
            // setupWheelSelection(); // Удалена, так как выбор руля убран из макета
            setupForm();
            setupNavigation();
            setupConfirmationActions();
            setupMapButtons();
            showStep(0); // Начинаем с первого шага
        } catch (error) {
            console.error("Ошибка инициализации приложения:", error);
        }
    }

    // Показываем нужный шаг и скрываем остальные
    function showStep(stepNumber) {
        // Скрываем все шаги
        document.querySelectorAll('.step-page').forEach(step => {
            step.classList.remove('active');
        });
        
        // Показываем нужный шаг
        const steps = [
            'date-simulator-step', // 0 (объединенный шаг даты и симулятора)
            'package-step',          // 1
            'time-select-step',      // 2
            'form-step',             // 3
            'confirmation-step'      // 4
        ];
        document.getElementById(steps[stepNumber]).classList.add('active');
        
        // Обновляем прогресс-бар (всего 5 шагов, но 0-4)
        updateProgress(stepNumber);
    }

    // Обновляем прогресс-бар
    function updateProgress(step) {
        const totalSteps = document.querySelectorAll('.step-page').length;
        const progress = (step / (totalSteps - 1)) * 100;
        document.getElementById('booking-progress-global').style.width = `${progress}%`;
    }

    // Настройка выбора даты
    function setupCalendar() {
        const dateToggle = document.getElementById('date-toggle');
        const dateCarouselContainer = document.getElementById('date-carousel-container');
        const dateCarousel = document.getElementById('date-carousel');
        const today = new Date();
        
        // Месяцы для отображения
        const months = [
            'янв', 'фев', 'мар', 'апр', 
            'май', 'июн', 'июл', 'авг',
            'сен', 'окт', 'ноя', 'дек'
        ];
        
        // Генерируем даты на 30 дней вперед
        let options = '';
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(today.getDate() + i);
            
            const day = date.getDate();
            const monthIndex = date.getMonth();
            const isToday = (i === 0); // Первый элемент всегда "сегодня"
            
            const selectedClass = isToday ? 'selected' : ''; // Выбираем "сегодня" по умолчанию
            
            options += `
                <div class="date-item ${selectedClass}" data-day="${day}" data-month="${monthIndex}">
                    ${day.toString().padStart(2, '0')}
                    <small>${months[monthIndex]}</small>
                </div>
            `;
        }
        dateCarousel.innerHTML = options;
        
        // Обработчик для переключения видимости календаря
        dateToggle.addEventListener('click', function() {
            dateCarouselContainer.classList.toggle('hidden');
            this.classList.toggle('expanded');
        });

        // Обработчик выбора даты
        document.querySelectorAll('.date-carousel .date-item').forEach(item => {
            item.addEventListener('click', function() {
                // Снимаем выделение со всех дат
                document.querySelectorAll('.date-carousel .date-item').forEach(el => el.classList.remove('selected'));
                // Выделяем выбранную дату
                this.classList.add('selected');
                // Обновляем данные бронирования
                updateBookingDate();
                // Календарь не сворачивается
            });
        });

        // Инициализируем bookingData.date и состояние кнопки "далее" при загрузке
        updateBookingDate();
    }

    function updateBookingDate() {
        const selectedDateItem = document.querySelector('.date-carousel .date-item.selected');
        if (selectedDateItem) {
            const day = selectedDateItem.dataset.day;
            const monthIndex = parseInt(selectedDateItem.dataset.month);
            const year = new Date().getFullYear(); // Берем текущий год
            bookingData.date = `${day.padStart(2, '0')}.${(monthIndex + 1).toString().padStart(2, '0')}.${year}`;
            document.getElementById('toPackagePage').disabled = false; // Кнопка "Далее" на первом шаге
            updateBreadcrumbs(); // Обновляем хлебные крошки
        } else {
            bookingData.date = null;
            document.getElementById('toPackagePage').disabled = true;
            updateBreadcrumbs(); // Обновляем хлебные крошки
        }
    }

    // Настройка выбора симулятора (изменена логика)
    function setupSimulatorSelection() {
        document.querySelectorAll('.simulator-box').forEach(sim => {
            const removeBtn = sim.querySelector('.remove-selection');

            sim.addEventListener('click', function(e) {
                // Если клик был по крестику, то не обрабатываем как выбор
                if (e.target === removeBtn) {
                    return;
                }

                const simulatorId = this.dataset.id;

                if (this.classList.contains('selected')) {
                    // Если уже выбран, снимаем выбор
                    this.classList.remove('selected');
                    if (removeBtn) removeBtn.style.display = 'none';
                    bookingData.simulator = bookingData.simulator.filter(id => id !== simulatorId);
                } else {
                    // Добавляем или убираем выбранный симулятор
                    if (!bookingData.simulator.includes(simulatorId)) {
                        bookingData.simulator.push(simulatorId);
                    }
                    this.classList.add('selected');
                    if (removeBtn) removeBtn.style.display = 'flex';
                }
                
                // Проверяем, должна ли кнопка "Далее" быть активной
                document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0;
                updateBreadcrumbs(); // Обновляем хлебные крошки
            });

            // Обработчик для крестика
            if (removeBtn) {
                removeBtn.addEventListener('click', function(e) {
                    e.stopPropagation(); // Предотвращаем срабатывание клика на родительском элементе
                    const parentSim = this.closest('.simulator-box');
                    if (parentSim) {
                        const simulatorId = parentSim.dataset.id;
                        parentSim.classList.remove('selected');
                        this.style.display = 'none';
                        bookingData.simulator = bookingData.simulator.filter(id => id !== simulatorId);
                        document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0;
                        updateBreadcrumbs(); // Обновляем хлебные крошки
                    }
                });
            }
        });
    }

    // Настройка выбора пакета времени (новый шаг)
    function setupPackageSelection() {
        document.getElementById('package-grid').innerHTML = packages.map(pkg => `
            <div class="package block" data-duration="${pkg.duration}" data-price="${pkg.value}" data-hours="${pkg.hours}">
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
                    `вы выбрали: ${this.dataset.duration} (${this.querySelector('.price').textContent})`;
                document.getElementById('toTimePageNew').disabled = false;
                setupTimeSlotsGenerator(); // Генерируем слоты после выбора пакета
                updateBreadcrumbs(); // Обновляем хлебные крошки
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

        // Получаем существующие бронирования для выбранной даты и симуляторов из Supabase
        let occupiedSlots = [];
        if (isAuthReady && supabase) {
            try {
                const { data, error } = await supabase
                    .from('bookings') // Имя вашей таблицы бронирований в Supabase
                    .select('time_range, hours, simulator_ids') // Выбираем нужные поля
                    .eq('date', selectedDate)
                    .eq('status', 'confirmed'); // Учитываем только подтвержденные бронирования как занятые

                if (error) {
                    console.error("Ошибка при получении занятых слотов из Supabase:", error);
                    return;
                }

                if (data) {
                    occupiedSlots = data.filter(booking =>
                        // Проверяем, пересекаются ли забронированные симуляторы с выбранными
                        booking.simulator_ids.some(bookedSim => bookingData.simulator.includes(bookedSim))
                    );
                    console.log("Занятые слоты для выбранной даты и симуляторов:", occupiedSlots);
                }

            } catch (error) {
                console.error("Неожиданная ошибка при получении занятых слотов:", error);
            }
        }

        // Генерируем временные слоты
        for (let hour = 10; hour <= 23; hour++) {
            let startHour = hour.toString().padStart(2, '0');
            let endHour = (hour + durationHours).toString().padStart(2, '0');
            let endTimeFormatted = `${endHour}:00`;

            if (hour + durationHours >= 24) {
                endHour = (hour + durationHours - 24).toString().padStart(2, '0');
                endTimeFormatted = `${endHour}:00 (следующий день)`;
            }

            const currentTimeSlot = `${startHour}:00 – ${endTimeFormatted}`;
            
            // Проверяем, занят ли этот слот
            const isOccupied = occupiedSlots.some(occupied => {
                // Упрощенная проверка на пересечение: если время начала совпадает
                // Более надежное решение включало бы проверку полного диапазона времени.
                const [occupiedStartHour] = occupied.time_range.split(' ')[0].split(':').map(Number);
                const [currentStartHour] = currentTimeSlot.split(' ')[0].split(':').map(Number);

                return occupiedStartHour === currentStartHour;
            });

            const disabledClass = isOccupied ? 'disabled' : '';

            times.push(`<div class="time-slot block ${disabledClass}" data-time-range="${currentTimeSlot}">${currentTimeSlot}</div>`);
        }

        // Если "Ночь", добавляем специальный слот
        if (bookingData.duration === 'Ночь') {
            const nightSlot = '00:00 – 08:00';
            const isNightSlotOccupied = occupiedSlots.some(occupied => {
                const [occupiedStartHour] = occupied.time_range.split(' ')[0].split(':').map(Number);
                return occupiedStartHour === 0; // Проверка на начало в 00:00
            });
            const nightDisabledClass = isNightSlotOccupied ? 'disabled' : '';
            times.push(`<div class="time-slot block ${nightDisabledClass}" data-time-range="${nightSlot}">${nightSlot}</div>`);
        }
        
        timeGrid.innerHTML = times.join('');
        
        // Обработка выбора времени
        document.querySelectorAll('.time-slot:not(.disabled)').forEach(slot => {
            slot.addEventListener('click', function() {
                document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.time = this.dataset.timeRange;
                document.getElementById('toFormPage').disabled = false;
                updateBreadcrumbs(); // Обновляем хлебные крошки
            });
        });
        document.getElementById('toFormPage').disabled = true; // Отключаем, пока не будет выбран слот
    }

    // Настройка выбора руля (функция больше не используется, так как руль удален из макета)
    function setupWheelSelection() {
        // Эта функция теперь пуста, так как выбор руля был удален из макета
    }

    // Загрузка данных пользователя из Supabase
    async function loadUserData(telegramId) {
        if (!isAuthReady || !supabase || !telegramId) return;

        try {
            // Предполагаем, что данные пользователя хранятся в таблице 'user_profiles'
            // и 'telegramId' является уникальным идентификатором.
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('telegram_id', telegramId) // Используем 'telegram_id' для соответствия базе данных
                .single(); // Используем .single(), если ожидаем одну строку

            if (error && error.code !== 'PGRST116') { // PGRST116 - это "Строки не найдены"
                console.error("Ошибка при загрузке данных пользователя из Supabase:", error);
                return;
            }

            if (data) {
                const userData = data;
                console.log("Загружены данные пользователя из Supabase:", userData);
                
                // Предзаполняем поля формы
                const nameInput = document.querySelector('#form-step input[type="text"]');
                const phoneInput = document.getElementById('phone');
                const telegramInput = document.getElementById('telegram');

                if (userData.name) nameInput.value = userData.name;
                if (userData.phone) phoneInput.value = userData.phone;
                if (userData.telegram_username) telegramInput.value = userData.telegram_username; // Используем telegram_username

                // Обновляем bookingData
                bookingData.name = userData.name || null;
                bookingData.phone = userData.phone || null;
                bookingData.telegram = userData.telegram_username || null; // Используем telegram_username

                if (userData.name && userData.phone && userData.telegram_username) {
                    console.log("Данные пользователя полные, форма предзаполнена.");
                }
            } else {
                console.log("Существующие данные пользователя для Telegram ID не найдены:", telegramId);
                // Если данных нет, убедимся, что поля формы пустые или по умолчанию
                document.querySelector('#form-step input[type="text"]').value = '';
                document.getElementById('phone').value = '+7 ';
                document.getElementById('telegram').value = '';
            }
        } catch (error) {
            console.error("Неожиданная ошибка при загрузке данных пользователя:", error);
        }
    }

    // Сохранение данных пользователя в Supabase
    async function saveUserData() {
        if (!isAuthReady || !supabase || !bookingData.telegramId) return;

        try {
            const userDataToSave = {
                id: userId, // Supabase user ID из аутентификации
                name: bookingData.name,
                telegram_username: bookingData.telegram, // Сохраняем как telegram_username
                telegram_id: bookingData.telegramId, // Сохраняем как telegram_id
                phone: bookingData.phone // Сохраняем полный номер телефона для собственных данных пользователя
            };

            // Upsert: вставляем, если не существует, обновляем, если существует, на основе 'id'
            const { data, error } = await supabase
                .from('user_profiles') // Имя вашей таблицы профилей пользователя
                .upsert(userDataToSave, { onConflict: 'id' }) // Используем 'id' для разрешения конфликтов
                .select(); // Запрашиваем вставленные/обновленные данные обратно

            if (error) {
                console.error("Ошибка при сохранении данных пользователя в Supabase:", error);
                return;
            }
            console.log("Данные пользователя сохранены в Supabase:", data);
        } catch (error) {
            console.error("Неожиданная ошибка при сохранении данных пользователя:", error);
        }
    }

    // Настройка формы
    function setupForm() {
        const phoneInput = document.getElementById('phone');
        
        // Форматирование номера телефона
        phoneInput.addEventListener('input', function(e) {
            let numbers = e.target.value.replace(/\D/g, '');
            if (numbers.startsWith('7')) numbers = '7' + numbers.substring(1);
            numbers = numbers.substring(0, 11);
            
            let formatted = '+7';
            if (numbers.length > 1) formatted += ' (' + numbers.substring(1, 4);
            if (numbers.length > 4) formatted += ') ' + numbers.substring(4, 7);
            if (numbers.length > 7) formatted += '-' + numbers.substring(7, 9);
            if (numbers.length > 9) formatted += '-' + numbers.substring(9, 11);
            
            e.target.value = formatted;
        });
        
        // Валидация Telegram
        document.getElementById('telegram').addEventListener('input', function(e) {
            this.value = this.value.replace(/[^a-zA-Z0-9_]/g, '');
        });
    }

    // Настройка навигации
    function setupNavigation() {
        // Кнопки "Далее"
        document.getElementById('toPackagePage').addEventListener('click', () => showStep(1)); // С даты/симулятора на пакет
        document.getElementById('toTimePageNew').addEventListener('click', () => showStep(2)); // С пакета на время
        document.getElementById('toFormPage').addEventListener('click', () => showStep(3)); // Со времени на форму (руль удален)
        
        // Кнопки "Назад"
        document.getElementById('backToDateSimulatorPage').addEventListener('click', () => showStep(0)); // С пакета на дату/симулятор
        document.getElementById('backToPackagePage').addEventListener('click', () => showStep(1)); // Со времени на пакет
        document.getElementById('backToTimePageNew').addEventListener('click', () => showStep(2)); // С формы на время (руль удален)
        
        // Отправка формы
        document.getElementById('booking-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Проверяем валидность формы
            if (!this.checkValidity()) {
                this.reportValidity();
                return;
            }
            
            // Сохраняем данные
            bookingData.name = this.querySelector('input[type="text"]').value;
            bookingData.phone = this.querySelector('input[type="tel"]').value;
            bookingData.telegram = this.querySelector('#telegram').value;
            bookingData.comment = this.querySelector('textarea').value;
            
            // Сохраняем данные пользователя в базу
            await saveUserData();
            
            // Показываем подтверждение
            showConfirmation();
        });
    }

    // Обновление хлебных крошек
    function updateBreadcrumbs() {
        const breadcrumbDiv = document.getElementById('booking-breadcrumb');
        let breadcrumbs = [];

        if (bookingData.date) {
            breadcrumbs.push(bookingData.date);
        }
        if (bookingData.simulator.length > 0) {
            breadcrumbs.push(getSimulatorNames(bookingData.simulator));
        }
        if (bookingData.duration) {
            breadcrumbs.push(bookingData.duration);
        }
        if (bookingData.time) {
            breadcrumbs.push(bookingData.time);
        }

        breadcrumbDiv.textContent = breadcrumbs.join(' / ');
    }

    // Показываем страницу подтверждения (изменено отображение симуляторов и сохранение бронирования)
    async function showConfirmation() {
        const details = document.getElementById('confirmation-details');
        
        details.innerHTML = `
            <p><strong>дата:</strong> ${bookingData.date}</p>
            <p><strong>тариф:</strong> ${bookingData.duration}</p>
            <p><strong>время:</strong> ${bookingData.time}</p>
            <p><strong>симулятор(ы):</strong> ${getSimulatorNames(bookingData.simulator)}</p>
            <p><strong>имя:</strong> ${bookingData.name}</p>
            <p><strong>телефон:</strong> ${bookingData.phone}</p>
            <p><strong>telegram:</strong> @${bookingData.telegram}</p>
            ${bookingData.comment ? `<p><strong>комментарий:</strong> ${bookingData.comment}</p>` : ''}
        `;
        
        // Сохраняем бронирование в Supabase
        if (isAuthReady && supabase) {
            try {
                const { data, error } = await supabase
                    .from('bookings') // Имя вашей таблицы бронирований
                    .insert({
                        user_id: userId, // ID пользователя Supabase
                        telegram_id: bookingData.telegramId, // Telegram ID пользователя
                        date: bookingData.date,
                        time_range: bookingData.time, // Используем time_range для соответствия Python боту
                        simulator_ids: bookingData.simulator, // Используем simulator_ids для соответствия Python боту
                        duration: bookingData.duration,
                        hours: bookingData.hours,
                        price: bookingData.price,
                        name: bookingData.name,
                        phone: bookingData.phone.replace(/\D/g, '').slice(-4), // Сохраняем только последние 4 цифры телефона
                        telegram_username: bookingData.telegram, // Используем telegram_username для соответствия Python боту
                        comment: bookingData.comment,
                        status: 'pending', // Начальный статус бронирования
                        // created_at: new Date().toISOString() // Supabase автоматически добавляет created_at
                    }).select(); // Запрашиваем вставленные данные обратно

                if (error) {
                    console.error("Ошибка при сохранении бронирования в Supabase:", error);
                    // Отобразить сообщение об ошибке пользователю
                    return;
                }

                const newBooking = data[0]; // Предполагаем, что data - это массив с вставленной строкой
                console.log("Бронирование сохранено в Supabase с ID:", newBooking.id);

                // Вызываем Edge Function для уведомления Стюарда
                // Замените на реальный URL вашей Edge Function, полученный после развертывания
                const EDGE_FUNCTION_URL = 'https://your-project-ref.supabase.co/functions/v1'; 

                console.log("Вызов Edge Function для уведомления Стюарда...");
                try {
                    const edgeFunctionResponse = await fetch(`${EDGE_FUNCTION_URL}/notify-steward`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: bookingData.name,
                            date: bookingData.date,
                            time_range: bookingData.time,
                            simulator_ids: bookingData.simulator,
                            booking_id: newBooking.id, // ID новой записи бронирования из Supabase
                            telegram_id_guest: bookingData.telegramId,
                            telegram_username_guest: bookingData.telegram
                        })
                    });
                    const edgeFunctionResult = await edgeFunctionResponse.json();
                    console.log("Ответ Edge Function:", edgeFunctionResult);
                } catch (edgeFunctionError) {
                    console.error("Ошибка при вызове Edge Function:", edgeFunctionError);
                }

            } catch (error) {
                console.error("Неожиданная ошибка при сохранении бронирования или вызове Edge Function:", error);
            }
        }

        showStep(4);
    }

    // Настройка действий на странице подтверждения
    function setupConfirmationActions() {
        // Записаться снова
        document.getElementById('book-again').addEventListener('click', resetBooking);
        
        // Перенести запись
        document.getElementById('reschedule').addEventListener('click', function() {
            document.getElementById('reschedule-message').style.display = 'block';
            setTimeout(() => {
                document.getElementById('reschedule-message').style.display = 'none';
            }, 3000);
        });
        
        // Отменить запись
        document.getElementById('cancel-booking').addEventListener('click', function() {
            document.getElementById('cancel-modal').style.display = 'flex';
        });
        
        document.getElementById('confirm-cancel').addEventListener('click', function() {
            document.getElementById('cancel-modal').style.display = 'none';
            document.getElementById('cancel-message').style.display = 'block';
            setTimeout(() => {
                document.getElementById('cancel-message').style.display = 'none';
                resetBooking();
            }, 1500);
        });
        
        document.getElementById('cancel-cancel').addEventListener('click', function() {
            document.getElementById('cancel-modal').style.display = 'none';
        });
    }

    // Настройка кнопок карты и такси
    function setupMapButtons() {
        const address = 'Ростов-на-Дону, ул. Б. Садовая, 70';
        
        // Кнопка "Проложить маршрут"
        document.getElementById('route-btn').addEventListener('click', function() {
            const url = `https://yandex.ru/maps/?rtext=~${encodeURIComponent(address)}`;
            window.open(url, '_blank');
        });
        
        // Кнопка "Вызвать такси"
        document.getElementById('taxi-btn').addEventListener('click', function() {
            const url = `https://3.redirect.appmetrica.yandex.com/route?end-lat=47.222078&end-lon=39.720349&end-name=${encodeURIComponent(address)}`;
            window.open(url, '_blank');
        });
    }

    // Сброс бронирования
    function resetBooking() {
        // Очищаем данные
        for (const key in bookingData) {
            if (key === 'simulator') {
                bookingData[key] = []; // Сброс массива
            } else if (key === 'telegramId' || key === 'telegram') {
                // Не сбрасываем Telegram ID и ник, так как они приходят из WebApp
                continue;
            } else {
                bookingData[key] = null;
            }
        }
        
        // Сбрасываем форму
        document.getElementById('booking-form')?.reset();
        document.getElementById('phone').value = '+7 ';
        
        // Снимаем выделения и скрываем крестики
        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.remove-selection').forEach(el => el.style.display = 'none');
        
        // Сбрасываем кнопки
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

    // Запускаем приложение
    init();
});
