// Импорт Supabase клиента
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

document.addEventListener('DOMContentLoaded', async function() {
    // Переменные Supabase (предоставляются средой Canvas)
    // Замените 'YOUR_SUPABASE_URL' и 'YOUR_SUPABASE_ANON_KEY' на ваши реальные значения
    const supabaseUrl = typeof __SUPABASE_URL !== 'undefined' ? __SUPABASE_URL : 'YOUR_SUPABASE_URL';
    const supabaseAnonKey = typeof __SUPABASE_ANON_KEY !== 'undefined' ? __SUPABASE_ANON_KEY : 'YOUR_SUPABASE_ANON_KEY';
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    let currentSupabaseUser = null; // Будет хранить аутентифицированного пользователя Supabase

    // Все данные бронирования
    const bookingData = {
        date: null,
        time: null,
        simulator: [], // Массив для множественного выбора
        wheel: null,
        duration: null, // Длительность пакета, например "1 час"
        price: null,
        name: null,
        phone: null,
        telegram: null,
        telegramId: null, // Telegram ID пользователя
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
            // Инициализация Telegram Web App
            if (window.Telegram && window.Telegram.WebApp) {
                Telegram.WebApp.ready();
                Telegram.WebApp.expand();
                console.log("Telegram Web App ready.");

                const userTg = Telegram.WebApp.initDataUnsafe.user;
                if (userTg) {
                    bookingData.telegramId = userTg.id.toString(); // Сохраняем Telegram ID
                    bookingData.telegram = userTg.username || ''; // Сохраняем ник Telegram
                    console.log("Telegram User Data:", userTg);
                }
            } else {
                console.warn("Telegram Web App SDK не найден или не готов.");
                // Для тестирования без Telegram Web App, можно использовать заглушку
                bookingData.telegramId = 'test_telegram_id_123';
                bookingData.telegram = 'testuser';
            }

            // Аутентификация Supabase (анонимно)
            const { data, error } = await supabase.auth.signInAnonymously();
            if (error) {
                console.error("Ошибка анонимной аутентификации Supabase:", error);
                return;
            }
            currentSupabaseUser = data.user;
            console.log("Supabase аутентифицирован. User ID:", currentSupabaseUser.id);

            // Загрузка данных пользователя после аутентификации
            if (currentSupabaseUser && bookingData.telegramId) {
                await loadUserData(currentSupabaseUser.id, bookingData.telegramId);
            }

            // Настройка всех шагов интерфейса
            setupCalendar();
            setupSimulatorSelection();
            setupPackageSelection();
            setupTimeSlotsGenerator(); // Будет вызван снова после выбора пакета
            setupWheelSelection();
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
        const today = new Date();
        
        const months = [
            'Январь', 'Февраль', 'Март', 'Апрель', 
            'Май', 'Июнь', 'Июль', 'Август',
            'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];
        
        monthSelect.innerHTML = months.map((month, index) => 
            `<option value="${index}">${month}</option>`
        ).join('');
        
        monthSelect.value = today.getMonth();
        updateDays();
        
        monthSelect.addEventListener('change', updateDays);
        daySelect.addEventListener('change', function() {
            updateBookingDate();
        });
        
        function updateDays() {
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
            updateBookingDate();
        }
        
        function updateBookingDate() {
            const day = daySelect.value;
            const month = parseInt(monthSelect.value) + 1;
            const year = today.getFullYear();
            bookingData.date = `${day.padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`;
            document.getElementById('toTimePage').disabled = false;
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
            try {
                const { data: bookings, error } = await supabase
                    .from('bookings')
                    .select('time_range, simulator_ids, duration_hours')
                    .eq('date', selectedDate);

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
                console.error("Ошибка при запросе занятых слотов:", error);
            }
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
                const [currentStartHour] = currentStartTimeStr.split(':').map(Number);

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
        if (!supabase || !supabaseUserId || !telegramId) return;

        try {
            const { data: userData, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', supabaseUserId) // Ищем по Supabase User ID
                .eq('telegram_id', telegramId) // Дополнительная проверка по Telegram ID
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
                console.error("Ошибка загрузки данных пользователя:", error);
                return;
            }

            if (userData) {
                console.log("Загружены данные пользователя:", userData);
                
                const nameInput = document.querySelector('#form-step input[type="text"]');
                const phoneInput = document.getElementById('phone');
                const telegramInput = document.getElementById('telegram');

                if (userData.name) nameInput.value = userData.name;
                // Восстанавливаем полный номер телефона, если он хранится полностью
                // Если хранится только 4 последние цифры, нужно будет запросить полный номер
                if (userData.phone_last_4_digits) {
                    // Здесь можно добавить логику для запроса полного номера, если нужно
                    // Или просто отобразить последние 4 цифры
                    phoneInput.value = `+7 (XXX) XXX-${userData.phone_last_4_digits.slice(0,2)}-${userData.phone_last_4_digits.slice(2,4)}`;
                    phoneInput.dataset.last4 = userData.phone_last_4_digits; // Сохраняем для проверки
                }
                if (userData.telegram_username) telegramInput.value = userData.telegram_username;

                // Обновляем bookingData
                bookingData.name = userData.name || null;
                // Важно: если телефон хранится только последними 4 цифрами,
                // то для бронирования нужно будет запросить полный номер.
                // Пока сохраняем только последние 4 цифры для бронирования.
                bookingData.phone = userData.phone_last_4_digits ? `...${userData.phone_last_4_digits}` : null; 
                bookingData.telegram = userData.telegram_username || null;

                console.log("Форма предзаполнена.");
            } else {
                console.log("Данные пользователя не найдены. Форма пуста.");
                document.querySelector('#form-step input[type="text"]').value = '';
                document.getElementById('phone').value = '+7 ';
                document.getElementById('telegram').value = bookingData.telegram; // Предзаполняем Telegram ником из WebApp
            }
        } catch (error) {
            console.error("Ошибка при загрузке данных пользователя:", error);
        }
    }

    // Сохранение данных пользователя в Supabase
    async function saveUserData() {
        if (!supabase || !currentSupabaseUser || !bookingData.telegramId) return;

        try {
            const userDataToSave = {
                id: currentSupabaseUser.id, // Supabase User ID
                telegram_id: bookingData.telegramId,
                name: bookingData.name,
                telegram_username: bookingData.telegram,
                phone_last_4_digits: bookingData.phone.slice(-4) // Сохраняем только последние 4 цифры
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
            console.error("Ошибка при сохранении данных пользователя:", error);
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
        
        document.getElementById('booking-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!this.checkValidity()) {
                this.reportValidity();
                return;
            }
            
            bookingData.name = this.querySelector('input[type="text"]').value;
            bookingData.phone = this.querySelector('input[type="tel"]').value;
            bookingData.telegram = this.querySelector('#telegram').value;
            bookingData.comment = this.querySelector('textarea').value;
            
            await saveUserData();
            
            showConfirmation();
        });
    }

    // Показываем страницу подтверждения и сохраняем бронирование
    async function showConfirmation() {
        const details = document.getElementById('confirmation-details');
        
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
            try {
                const { error } = await supabase
                    .from('bookings')
                    .insert({
                        user_id: currentSupabaseUser.id, // Supabase User ID
                        telegram_id: bookingData.telegramId, // Telegram user ID
                        date: bookingData.date,
                        time_range: bookingData.time,
                        simulator_ids: bookingData.simulator, // Массив строк
                        wheel: bookingData.wheel,
                        duration_text: bookingData.duration,
                        duration_hours: bookingData.hours,
                        price: parseInt(bookingData.price), // Убедимся, что это число
                        name: bookingData.name,
                        phone_last_4_digits: bookingData.phone.slice(-4), // Сохраняем только последние 4 цифры
                        telegram_username: bookingData.telegram,
                        comment: bookingData.comment,
                        created_at: new Date().toISOString() // ISO строка для timestamp
                    });

                if (error) {
                    console.error("Ошибка сохранения бронирования:", error);
                } else {
                    console.log("Бронирование сохранено в Supabase.");
                }
            } catch (error) {
                console.error("Ошибка при сохранении бронирования:", error);
            }
        }

        showStep(6);
    }

    // Настройка действий на странице подтверждения
    function setupConfirmationActions() {
        document.getElementById('book-again').addEventListener('click', resetBooking);
        
        document.getElementById('reschedule').addEventListener('click', function() {
            document.getElementById('reschedule-message').style.display = 'block';
            setTimeout(() => {
                document.getElementById('reschedule-message').style.display = 'none';
            }, 3000);
        });
        
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
        
        document.getElementById('route-btn').addEventListener('click', function() {
            const url = `https://yandex.ru/maps/?rtext=~${encodeURIComponent(address)}`;
            window.open(url, '_blank');
        });
        
        document.getElementById('taxi-btn').addEventListener('click', function() {
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
        
        document.getElementById('booking-form').reset();
        document.getElementById('phone').value = '+7 ';
        
        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.remove-selection').forEach(el => el.style.display = 'none');
        
        document.querySelectorAll('.next-btn').forEach(btn => btn.disabled = true);
        document.getElementById('toTimePage').disabled = false;
        
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
