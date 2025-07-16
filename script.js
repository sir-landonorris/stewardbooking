import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

document.addEventListener('DOMContentLoaded', async function() {
    // Supabase variables (provided by the Canvas environment)
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    let supabaseConfig = typeof __supabase_config !== 'undefined' ? JSON.parse(__supabase_config) : {};
    
    // --- START: Safeguard for missing Supabase config properties ---
    if (!supabaseConfig.url || supabaseConfig.url === "https://dummy.supabase.co") {
        console.error("CRITICAL ERROR: Supabase 'url' is missing or is a dummy value from __supabase_config. Please ensure your Canvas environment provides a complete and valid Supabase config from your Supabase console.");
        supabaseConfig.url = "https://dummy.supabase.co"; // Fallback for initialization, but app won't work
    }
    if (!supabaseConfig.anonKey || supabaseConfig.anonKey === "dummy-anon-key") {
        console.error("CRITICAL ERROR: Supabase 'anonKey' is missing or is a dummy value from __supabase_config. Please ensure your Canvas environment provides a complete and valid Supabase config from your Supabase console.");
        supabaseConfig.anonKey = "dummy-anon-key"; // Fallback for initialization, but app won't work
    }
    // --- END: Safeguard ---

    let supabase, userId;
    let isAuthReady = false;

    // Все данные бронирования
    const bookingData = {
        date: null,
        time: null,
        simulator: [], // Изменено на массив для множественного выбора
        wheel: null,
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
            supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
            console.log("Supabase client initialized.");

            // Get user session or sign in anonymously if needed for Supabase RLS
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                console.error("Error getting Supabase session:", sessionError);
            }

            if (session && session.user) {
                userId = session.user.id;
                console.log("Supabase authenticated. User ID:", userId);
            } else {
                // If no session, use a random UUID for userId for now.
                // For actual RLS, anonymous sign-in might be needed:
                // const { data: anonymousUser, error: anonError } = await supabase.auth.signInAnonymously();
                // if (anonError) {
                //     console.error("Error signing in anonymously with Supabase:", anonError);
                // } else if (anonymousUser && anonymousUser.user) {
                //     userId = anonymousUser.user.id;
                //     console.log("Supabase signed in anonymously. User ID:", userId);
                // } else {
                    userId = crypto.randomUUID(); // Fallback if no user or anonymous sign-in fails
                    console.warn("No Supabase user session found. Using a random UUID as user ID:", userId);
                // }
            }
            isAuthReady = true; // Mark as ready after auth check (even if anonymous/UUID)

            // Initialize Telegram Web App
            if (window.Telegram && window.Telegram.WebApp) {
                Telegram.WebApp.ready();
                Telegram.WebApp.expand();
                console.log("Telegram Web App ready.");

                const userTg = Telegram.WebApp.initDataUnsafe.user;
                if (userTg) {
                    bookingData.telegramId = userTg.id.toString(); // Store Telegram ID
                    console.log("Telegram User Data:", userTg);
                    await loadUserData(bookingData.telegramId);
                }
            } else {
                console.warn("Telegram Web App SDK not found or not ready.");
            }

            setupCalendar();
            setupSimulatorSelection(); // This will now correctly initialize bookingData.simulator
            setupPackageSelection();
            setupTimeSlotsGenerator(); // Will be called again after package selection
            setupWheelSelection();
            setupForm();
            setupNavigation();
            setupConfirmationActions();
            setupMapButtons();
            showStep(0); // Start at the first step

        } catch (error) {
            console.error("Error initializing application:", error);
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
        // Очищаем предыдущие выборы в bookingData для повторной инициализации на основе текущего DOM
        bookingData.simulator = [];

        document.querySelectorAll('.simulator-box').forEach(sim => {
            const removeBtn = sim.querySelector('.remove-selection');
            const simulatorId = sim.dataset.id;

            // Инициализируем bookingData на основе предварительно выбранных симуляторов в HTML
            if (sim.classList.contains('selected')) {
                if (!bookingData.simulator.includes(simulatorId)) {
                    bookingData.simulator.push(simulatorId);
                }
                // Показываем крестик, если симулятор выбран по умолчанию
                if (removeBtn) removeBtn.style.display = 'flex';
            } else {
                // Скрываем крестик, если симулятор не выбран по умолчанию
                if (removeBtn) removeBtn.style.display = 'none';
            }

            sim.addEventListener('click', function(e) {
                // Если клик был по крестику, то не обрабатываем как выбор
                if (e.target === removeBtn) {
                    return;
                }

                if (this.classList.contains('selected')) {
                    // Если уже выбран, снимаем выбор
                    this.classList.remove('selected');
                    if (removeBtn) removeBtn.style.display = 'none';
                    bookingData.simulator = bookingData.simulator.filter(id => id !== simulatorId);
                } else {
                    // Добавляем выбранный симулятор
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
        // Убедимся, что состояние кнопки "Далее" корректно после начальной настройки
        document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0;
        updateBreadcrumbs();
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

        // Fetch existing bookings for the selected date and simulators from Supabase
        let occupiedSlots = [];
        if (supabase) { // Check if supabase client is initialized
            try {
                const { data, error } = await supabase
                    .from('bookings')
                    .select('time, hours, simulator') // Select relevant fields
                    .eq('date', selectedDate); // Filter by selected date
                
                if (error) {
                    console.error("Error fetching occupied slots from Supabase:", error);
                } else {
                    occupiedSlots = data.filter(booking => 
                        booking.simulator.some(bookedSim => bookingData.simulator.includes(bookedSim))
                    );
                    console.log("Occupied slots for selected date and simulators:", occupiedSlots);
                }
            } catch (error) {
                console.error("Critical error during Supabase fetch:", error);
            }
        }

        // Generate time slots
        for (let hour = 10; hour <= 23; hour++) {
            let startHour = hour.toString().padStart(2, '0');
            let endHour = (hour + durationHours).toString().padStart(2, '0');
            let endTimeFormatted = `${endHour}:00`;

            if (hour + durationHours >= 24) {
                endHour = (hour + durationHours - 24).toString().padStart(2, '0');
                endTimeFormatted = `${endHour}:00 (следующий день)`;
            }

            const currentTimeSlot = `${startHour}:00 – ${endTimeFormatted}`;
            
            // Check if this slot is occupied
            const isOccupied = occupiedSlots.some(occupied => {
                // Simple overlap check: if start times match and durations are compatible
                const [occupiedStartHour] = occupied.time.split(' ')[0].split(':').map(Number);
                const [currentStartHour] = currentTimeSlot.split(' ')[0].split(':').map(Number);

                // This is a simplified check. A more robust solution would involve checking full time range overlap.
                // For now, if the start hour is the same, we consider it occupied.
                return occupiedStartHour === currentStartHour;
            });

            const disabledClass = isOccupied ? 'disabled' : '';

            times.push(`<div class="time-slot block ${disabledClass}" data-time-range="${currentTimeSlot}">${currentTimeSlot}</div>`);
        }

        // If "Ночь", add special slot
        if (bookingData.duration === 'Ночь') {
            const nightSlot = '00:00 – 08:00';
            const isNightSlotOccupied = occupiedSlots.some(occupied => {
                const [occupiedStartHour] = occupied.time.split(' ')[0].split(':').map(Number);
                return occupiedStartHour === 0; // Check for 00:00 start
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
                document.getElementById('toFormPage').disabled = false; // Changed from toWheelPage to toFormPage
                updateBreadcrumbs(); // Обновляем хлебные крошки
            });
        });
        document.getElementById('toFormPage').disabled = true; // Disable until a slot is selected
    }

    // Настройка выбора руля (больше не отдельный шаг)
    function setupWheelSelection() {
        // Эта функция теперь не нужна, так как выбор руля был удален из макета
    }

    // Загрузка данных пользователя из Supabase
    async function loadUserData(telegramId) {
        if (!supabase || !telegramId) return;

        try {
            // Assuming a 'profiles' table with 'telegram_id' as a unique identifier
            const { data: userData, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('telegram_id', telegramId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found (not an actual error for single())
                console.error("Error loading user data from Supabase:", error);
                return;
            }

            if (userData) {
                console.log("Loaded user data:", userData);
                
                // Pre-fill form fields
                const nameInput = document.querySelector('#form-step input[type="text"]');
                const phoneInput = document.getElementById('phone');
                const telegramInput = document.getElementById('telegram');

                if (userData.name) nameInput.value = userData.name;
                if (userData.phone) phoneInput.value = userData.phone;
                if (userData.telegram_username) telegramInput.value = userData.telegram_username; // Assuming telegram_username in DB

                // Update bookingData
                bookingData.name = userData.name || null;
                bookingData.phone = userData.phone || null;
                bookingData.telegram = userData.telegram_username || null; // Use telegram_username from DB

                // Check if all required user data is present to potentially skip the form step
                if (userData.name && userData.phone && userData.telegram_username) {
                    console.log("User data complete, form pre-filled.");
                }
            } else {
                console.log("No existing user data found for Telegram ID:", telegramId);
                // If no data, ensure form fields are empty or default
                document.querySelector('#form-step input[type="text"]').value = '';
                document.getElementById('phone').value = '+7 ';
                document.getElementById('telegram').value = '';
            }
        } catch (error) {
            console.error("Error loading user data:", error);
        }
    }

    // Сохранение данных пользователя в Supabase
    async function saveUserData() {
        if (!supabase || !bookingData.telegramId) return;

        try {
            const userDataToSave = {
                telegram_id: bookingData.telegramId, // Unique identifier
                name: bookingData.name,
                telegram_username: bookingData.telegram, // Save Telegram username
                phone: bookingData.phone // Save full phone number
            };

            // Use upsert to insert or update based on telegram_id
            const { data, error } = await supabase
                .from('profiles')
                .upsert(userDataToSave, { onConflict: 'telegram_id' }); // Conflict on telegram_id to update existing

            if (error) {
                console.error("Error saving user data to Supabase:", error);
            } else {
                console.log("User data saved/updated in Supabase:", data);
            }
        } catch (error) {
            console.error("Error saving user data:", error);
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
        // Руль больше не часть бронирования
        // if (bookingData.wheel) {
        //     breadcrumbs.push(getWheelName(bookingData.wheel));
        // }

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
        
        // Save booking to Supabase
        if (supabase) {
            try {
                const { data: newBooking, error } = await supabase
                    .from('bookings')
                    .insert({
                        user_id: userId, // Supabase user ID (from auth or UUID)
                        telegram_id: bookingData.telegramId, // Telegram user ID
                        date: bookingData.date,
                        time: bookingData.time,
                        simulator: bookingData.simulator,
                        duration: bookingData.duration,
                        hours: bookingData.hours, // Store hours for easier availability checks
                        price: bookingData.price,
                        name: bookingData.name,
                        phone: bookingData.phone.replace(/\D/g, '').slice(-4), // Save only last 4 digits of phone
                        telegram_username: bookingData.telegram, // Save full Telegram username
                        comment: bookingData.comment,
                        timestamp: new Date().toISOString() // ISO string for Supabase timestamp
                    })
                    .select(); // Select the inserted row to get its ID

                if (error) {
                    console.error("Error saving booking to Supabase:", error);
                } else if (newBooking && newBooking.length > 0) {
                    console.log("Booking saved to Supabase with ID:", newBooking[0].id);

                    // Call Edge Function to notify steward
                    // Replace with your actual Supabase Edge Function URL
                    const EDGE_FUNCTION_URL = 'https://your-project-ref.supabase.co/functions/v1/notify-steward'; 

                    console.log("Calling Edge Function to notify steward...");
                    try {
                        const edgeFunctionResponse = await fetch(EDGE_FUNCTION_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: bookingData.name,
                                date: bookingData.date,
                                time_range: bookingData.time,
                                simulator_ids: bookingData.simulator,
                                booking_id: newBooking[0].id, // ID новой записи бронирования из Supabase
                                telegram_id_guest: bookingData.telegramId, // Telegram ID гостя
                                telegram_username_guest: bookingData.telegram // Telegram ник гостя
                            })
                        });
                        const edgeFunctionResult = await edgeFunctionResponse.json();
                        console.log("Edge Function response:", edgeFunctionResult);
                    } catch (edgeFunctionError) {
                        console.error("Error calling Edge Function:", edgeFunctionError);
                    }

                }
            } catch (error) {
                console.error("Critical error during Supabase booking save:", error);
            }
        }

        showStep(4);
    }

    // Настройка действий на странице подтверждения (без изменений)
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

    // Настройка кнопок карты и такси (без изменений)
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

    // Сброс бронирования (изменено)
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
