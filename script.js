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
        wheel: null, // Теперь не используется, но оставлено для совместимости
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
        { duration: '1 час', price: '450 ₽', value: 450, hours: 1, originalPrice: 450 },
        { duration: '2 часа', price: '850 ₽', value: 850, hours: 2, originalPrice: 900 },
        { duration: '3 часа', price: '1200 ₽', value: 1200, hours: 3, originalPrice: 1350 },
        { duration: '5 часов', price: '1900 ₽', value: 1900, hours: 5, originalPrice: 2250 },
        { duration: 'Ночь', price: '2500 ₽', value: 2500, hours: 8, originalPrice: null } // No original price for night
    ];
    // Базовая часовая ставка для расчета перечеркнутой цены
    const BASE_HOURLY_RATE = 450;
    // Ставка для расчета цен в "Своем пакете" после 3 часов
    const CUSTOM_HOURLY_RATE = 400; 

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
                userId = crypto.randomUUID(); // Fallback if no user or anonymous sign-in fails
                console.warn("No Supabase user session found. Using a random UUID as user ID:", userId);
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
                    bookingData.telegram = userTg.username || ''; // Store Telegram username
                    console.log("Telegram User Data:", userTg);
                    await loadUserData(bookingData.telegramId);
                }
            } else {
                console.warn("Telegram Web App SDK not found or not ready.");
                // Fallback for non-Telegram environment
                document.getElementById('web-app-fallback').classList.remove('hidden');
                document.getElementById('main-booking-content').style.display = 'none';
            }

            setupCalendar();
            setupSimulatorSelection(); // This will now correctly initialize bookingData.simulator
            setupPackageSelection();
            setupTimeSlotsGenerator(); // Will be called again after package selection
            // setupWheelSelection(); // Removed as per new flow
            setupForm();
            setupNavigation();
            setupConfirmationActions();
            setupMapButtons();
            // setupAIChatFeature(); // AI Chat Feature Removed
            showStep(0); // Start at the first step

        } catch (error) {
            console.error("Error initializing application:", error);
        }
    }

    // Показываем нужный шаг и скрываем остальные
    function showStep(stepNumber) {
        document.querySelectorAll('.step-page').forEach(step => {
            step.classList.remove('active');
        });
        
        const steps = [
            'date-simulator-step',   // 0 (объединенный шаг даты и симулятора)
            'package-step',          // 1
            'time-select-step',      // 2
            'form-step',             // 3
            'confirmation-step'      // 4
        ];
        document.getElementById(steps[stepNumber]).classList.add('active');
        
        updateProgress(stepNumber);

        // Показываем предупреждение для длительных броней, если это шаг выбора времени
        if (stepNumber === 2) { // Шаг выбора времени
            const longBookingWarning = document.getElementById('long-booking-warning');
            if (bookingData.hours && bookingData.hours >= 12) {
                longBookingWarning.style.display = 'block';
            } else {
                longBookingWarning.style.display = 'none';
            }
        }
    }

    // Обновляем прогресс-бар
    function updateProgress(step) {
        const totalSteps = document.querySelectorAll('.step-page').length; // Correctly count active steps
        const progress = (step / (totalSteps - 1)) * 100;
        document.getElementById('booking-progress-global').style.width = `${progress}%`;
    }

    // Настройка выбора даты
    function setupCalendar() {
        const dateToggle = document.getElementById('date-toggle');
        const dateCarouselContainer = document.getElementById('date-carousel-container');
        const dateCarousel = document.getElementById('date-carousel');
        const currentDateDisplay = document.getElementById('current-date-display');
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
            const year = date.getFullYear();
            const isToday = (i === 0); // Первый элемент всегда "сегодня"
            
            const selectedClass = isToday ? 'selected' : ''; // Выбираем "сегодня" по умолчанию
            
            options += `
                <div class="date-item ${selectedClass}" data-full-date="${day.toString().padStart(2, '0')}.${(monthIndex + 1).toString().padStart(2, '0')}.${year}">
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
        updateBookingDate(); // Call once on load to set initial date
    }

    function updateBookingDate() {
        const selectedDateItem = document.querySelector('.date-carousel .date-item.selected');
        const currentDateDisplay = document.getElementById('current-date-display');

        if (selectedDateItem) {
            const fullDate = selectedDateItem.dataset.fullDate;
            bookingData.date = fullDate;
            currentDateDisplay.textContent = fullDate; // Update the displayed date
            document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0; // Check simulator selection
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
                    // Теперь нет опции "любой", только конкретные симуляторы
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
        const packageGrid = document.getElementById('package-grid');
        let packagesHtml = packages.map(pkg => {
            const originalPriceDisplay = pkg.originalPrice !== null ? `<div class="package-original-price">${pkg.originalPrice} ₽</div>` : '';
            
            if (pkg.duration === 'Ночь') {
                return `
                    <div class="package block" data-duration="${pkg.duration}" data-price="${pkg.value}" data-hours="${pkg.hours}">
                        <div class="package-night-text">НОЧНОЙ</div>
                        <small class="package-night-time">(00:00 – 08:00)</small>
                        ${originalPriceDisplay}
                        <div class="package-price">${pkg.price}</div>
                    </div>
                `;
            } else {
                const displayHours = pkg.hours.toString().padStart(2, '0');
                const hourUnit = getHourUnit(pkg.hours);
                return `
                    <div class="package block" data-duration="${pkg.duration}" data-price="${pkg.value}" data-hours="${pkg.hours}">
                        <div class="package-number">${displayHours}</div>
                        <small class="package-unit">${hourUnit}</small>
                        ${originalPriceDisplay}
                        <div class="package-price">${pkg.price}</div>
                    </div>
                `;
            }
        }).join('');

        // Добавляем кнопку "Свой пакет"
        packagesHtml += `
            <div class="package block custom-package-trigger" id="custom-package-trigger">
                <div class="text-center">СВОЙ<br>ПАКЕТ</div>
            </div>
        `;
        
        packageGrid.innerHTML = packagesHtml;
        
        document.querySelectorAll('.package:not(.custom-package-trigger)').forEach(pkg => {
            pkg.addEventListener('click', function() {
                document.querySelectorAll('.package').forEach(p => p.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.duration = this.dataset.duration;
                bookingData.price = this.dataset.price;
                bookingData.hours = parseInt(this.dataset.hours); // Сохраняем количество часов
                document.getElementById('package-summary').textContent = 
                    `ВЫ ВЫБРАЛИ: ${this.dataset.duration} (${this.querySelector('.package-price').textContent})`;
                document.getElementById('toTimePageNew').disabled = false;
                setupTimeSlotsGenerator(); // Генерируем слоты после выбора пакета
                updateBreadcrumbs(); // Обновляем хлебные крошки
            });
        });

        // Обработчик для кнопки "Свой пакет"
        document.getElementById('custom-package-trigger').addEventListener('click', function() {
            document.querySelectorAll('.package.selected').forEach(p => p.classList.remove('selected')); // Снимаем выбор с обычных пакетов
            document.getElementById('package-grid').classList.add('hidden'); // Скрываем основной список
            document.getElementById('custom-package-carousel-container').classList.remove('hidden'); // Показываем карусель
            setupCustomPackageSelection(); // Генерируем и настраиваем карусель
        });
    }

    // Функция для расчета цены "Своего пакета"
    function getCustomPackagePrice(hours) {
        if (hours === 1) return 450;
        if (hours === 2) return 850;
        if (hours === 2.5) return 1060; // Округлено в сторону гостя
        if (hours === 3) return 1200;
        // Для пакетов более 3 часов, считаем по 400 ₽/час с округлением до 10 ₽ в пользу гостя
        return Math.ceil((hours * CUSTOM_HOURLY_RATE) / 10) * 10;
    }

    // Настройка выбора "Своего пакета"
    function setupCustomPackageSelection() {
        const customPackageCarousel = document.getElementById('custom-package-carousel');
        let customPackagesHtml = '';
        const customPackageDurations = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 18, 24];

        customPackageDurations.forEach(hours => {
            const currentPrice = getCustomPackagePrice(hours);
            const originalPrice = hours * BASE_HOURLY_RATE;
            const originalPriceDisplay = originalPrice !== currentPrice && hours !== 1 && hours !== 2 ? `<div class="package-original-price">${originalPrice} ₽</div>` : ''; // Don't show for 1h, 2h as they match base rate
            
            let displayHours = hours.toString();
            if (hours % 1 !== 0) { // If it's a decimal (e.g., 2.5)
                displayHours = hours.toFixed(1).replace('.', ',');
            } else {
                displayHours = hours.toString().padStart(2, '0');
            }
            
            const hourUnit = getHourUnit(hours);

            customPackagesHtml += `
                <div class="package block" data-duration="${displayHours} ${hourUnit}" data-price="${currentPrice}" data-hours="${hours}">
                    <div class="package-number">${displayHours}</div>
                    <small class="package-unit">${hourUnit}</small>
                    ${originalPriceDisplay}
                    <div class="package-price">${currentPrice} ₽</div>
                </div>
            `;
        });
        customPackageCarousel.innerHTML = customPackagesHtml;

        document.querySelectorAll('#custom-package-carousel .package').forEach(pkg => {
            pkg.addEventListener('click', function() {
                document.querySelectorAll('#custom-package-carousel .package').forEach(p => p.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.duration = this.dataset.duration;
                bookingData.price = this.dataset.price;
                bookingData.hours = parseFloat(this.dataset.hours); // Используем parseFloat для дробных часов
                document.getElementById('package-summary').textContent = 
                    `ВЫ ВЫБРАЛИ: ${this.dataset.duration} (${this.querySelector('.package-price').textContent})`;
                document.getElementById('toTimePageNew').disabled = false;
                setupTimeSlotsGenerator(); // Генерируем слоты после выбора пакета
                
                // Возвращаемся к основному виду шага пакетов
                document.getElementById('custom-package-carousel-container').classList.add('hidden');
                document.getElementById('package-grid').classList.remove('hidden'); // Показываем основной список
                updateBreadcrumbs(); // Обновляем хлебные крошки
            });
        });

        // Обработчик для кнопки "Назад к пакетам"
        document.getElementById('backToMainPackageSelection').addEventListener('click', function() {
            document.getElementById('custom-package-carousel-container').classList.add('hidden');
            document.getElementById('package-grid').classList.remove('hidden'); // Показываем основной список
            // Сбрасываем выбранный пакет, если пользователь вернулся
            document.querySelectorAll('.package').forEach(p => p.classList.remove('selected'));
            bookingData.duration = null;
            bookingData.price = null;
            bookingData.hours = null;
            document.getElementById('package-summary').textContent = '';
            document.getElementById('toTimePageNew').disabled = true;
            updateBreadcrumbs();
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

        let occupiedSlots = [];
        if (supabase) { // Check if supabase client is initialized
            try {
                const { data, error } = await supabase
                    .from('bookings')
                    .select('time_range, duration_hours, simulator_ids') // Select relevant fields
                    .eq('date', selectedDate); // Filter by selected date
                
                if (error) {
                    console.error("Error fetching occupied slots from Supabase:", error);
                } else {
                    occupiedSlots = data.filter(booking => 
                        booking.simulator_ids.some(bookedSim => bookingData.simulator.includes(bookedSim))
                    );
                    console.log("Occupied slots for selected date and simulators:", occupiedSlots);
                }
            } catch (error) {
                console.error("Critical error during Supabase fetch:", error);
            }
        }

        // Generate time slots
        for (let hour = 10; hour <= 23; hour++) {
            let startHour = hour;
            let endHour = startHour + durationHours;
            
            // Handle fractional hours for start and end times
            let startMinutes = (startHour % 1) * 60;
            let endMinutes = (endHour % 1) * 60;

            let startHourFormatted = Math.floor(startHour).toString().padStart(2, '0');
            let startMinutesFormatted = startMinutes.toString().padStart(2, '0');
            
            let endHourFormatted = Math.floor(endHour).toString().padStart(2, '0');
            let endMinutesFormatted = endMinutes.toString().padStart(2, '0');

            let endTimeSuffix = '';
            if (Math.floor(endHour) >= 24) {
                endHourFormatted = (Math.floor(endHour) - 24).toString().padStart(2, '0');
                endTimeSuffix = ' (СЛЕДУЮЩИЙ ДЕНЬ)';
            }

            const currentTimeSlot = `${startHourFormatted}:${startMinutesFormatted} – ${endHourFormatted}:${endMinutesFormatted}${endTimeSuffix}`;
            
            // Check if this slot is occupied
            const isOccupied = occupiedSlots.some(occupied => {
                const [occupiedStartHourStr, occupiedStartMinStr] = occupied.time_range.split(' ')[0].split(':');
                const occupiedStartTotalMinutes = parseInt(occupiedStartHourStr) * 60 + parseInt(occupiedStartMinStr);
                const occupiedDurationMinutes = occupied.duration_hours * 60;
                const occupiedEndTotalMinutes = occupiedStartTotalMinutes + occupiedDurationMinutes;

                const currentStartTotalMinutes = hour * 60 + startMinutes;
                const currentDurationMinutes = durationHours * 60;
                const currentEndTotalMinutes = currentStartTotalMinutes + currentDurationMinutes;

                // Check for overlap
                return (currentStartTotalMinutes < occupiedEndTotalMinutes && occupiedStartTotalMinutes < currentEndTotalMinutes);
            });

            const disabledClass = isOccupied ? 'disabled' : '';

            times.push(`<div class="time-slot block ${disabledClass}" data-time-range="${currentTimeSlot}">${currentTimeSlot}</div>`);
        }

        // If "Ночь", add special slot (assuming 00:00 - 08:00 is fixed for night)
        // This slot should only be added if the selected package is exactly 'Ночь'
        if (bookingData.duration === 'Ночь') {
            const nightSlot = '00:00 – 08:00';
            const isNightSlotOccupied = occupiedSlots.some(occupied => {
                const [occupiedStartHourStr, occupiedStartMinStr] = occupied.time_range.split(' ')[0].split(':');
                const occupiedStartTotalMinutes = parseInt(occupiedStartHourStr) * 60 + parseInt(occupiedStartMinStr);
                
                // Check if the night slot (00:00 - 08:00) overlaps with any existing booking
                // Simplified check: if any booking starts at 00:00 or overlaps significantly
                return (occupiedStartTotalMinutes < (8 * 60) && (occupiedStartTotalMinutes + (occupied.duration_hours * 60)) > 0);
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
                if (userData.phone) phoneInput.value = userData.phone; // Assuming full phone is stored
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
                document.getElementById('telegram').value = bookingData.telegram; // Pre-fill with Telegram username from WebApp
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
            bookingData.phone = formatted; // Update bookingData with formatted phone
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
            // bookingData.phone уже обновляется в setupForm при вводе
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
        // Check if breadcrumbDiv exists before updating
        if (!breadcrumbDiv) {
            console.warn("Breadcrumb element not found. Skipping breadcrumb update.");
            return;
        }

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
            <p><strong>ДАТА:</strong> ${bookingData.date}</p>
            <p><strong>ТАРИФ:</strong> ${bookingData.duration}</p>
            <p><strong>ВРЕМЯ:</strong> ${bookingData.time}</p>
            <p><strong>СИМУЛЯТОР(Ы):</strong> ${getSimulatorNames(bookingData.simulator)}</p>
            <p><strong>ИМЯ:</strong> ${bookingData.name}</p>
            <p><strong>ТЕЛЕФОН:</strong> ${bookingData.phone}</p>
            <p><strong>TELEGRAM:</strong> @${bookingData.telegram}</p>
            ${bookingData.comment ? `<p><strong>КОММЕНТАРИЙ:</strong> ${bookingData.comment}</p>` : ''}
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
                        time_range: bookingData.time, // Renamed to time_range in DB
                        simulator_ids: bookingData.simulator, // Renamed to simulator_ids in DB
                        // wheel: bookingData.wheel, // Removed as per new flow
                        duration_text: bookingData.duration, // Renamed to duration_text in DB
                        duration_hours: bookingData.hours, // Store hours for easier availability checks
                        price: bookingData.price,
                        name: bookingData.name,
                        phone: bookingData.phone, // Save full phone number
                        telegram_username: bookingData.telegram, // Save full Telegram username
                        comment: bookingData.comment,
                        status: 'pending', // Default status for new bookings
                        created_at: new Date().toISOString() // ISO string for Supabase timestamp
                    })
                    .select(); // Select the inserted row to get its ID

                if (error) {
                    console.error("Error saving booking to Supabase:", error);
                } else if (newBooking && newBooking.length > 0) {
                    console.log("Booking saved to Supabase with ID:", newBooking[0].id);

                    // No longer calling Edge Function directly from client.
                    // The Python bot will monitor Supabase Realtime for new 'pending' bookings.
                }
            } catch (error) {
                console.error("Critical error during Supabase booking save:", error);
            }
        }

        showStep(4); // Show confirmation step
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
        document.getElementById('phone').value = '+7 '; // Reset phone to default prefix
        
        // Снимаем выделения и скрываем крестики
        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.remove-selection').forEach(el => el.style.display = 'none');
        
        // Сбрасываем кнопки
        document.querySelectorAll('.button').forEach(btn => btn.disabled = false); // Re-enable all buttons
        document.getElementById('toPackagePage').disabled = true; // Disable next on step 0 until selection
        document.getElementById('toTimePageNew').disabled = true; // Disable next on step 1 until selection
        document.getElementById('toFormPage').disabled = true; // Disable next on step 2 until selection

        // Скрываем карусель "Свой пакет" и показываем основную сетку
        document.getElementById('custom-package-carousel-container').classList.add('hidden');
        document.getElementById('package-grid').classList.remove('hidden');

        // Сбрасываем отображение выбранного пакета
        document.getElementById('package-summary').textContent = '';

        showStep(0);
    }

    // Вспомогательные функции
    function getWheelName(wheelId) {
        // This function is no longer used in the main flow, but kept for reference if needed
        const wheels = {
            'ks': 'Штурвал KS',
            'cs': 'Круглый CS',
            'nobutton': 'Круглый без кнопок',
            'any': 'Выберу на месте'
        };
        return wheels[wheelId] || wheelId;
    }

    function getSimulatorNames(simulatorIds) {
        // Теперь нет опции "Любой", только конкретные симуляторы
        return simulatorIds.map(id => `СИМУЛЯТОР #${id}`).join(', ');
    }

    // Вспомогательная функция для склонения слова "час"
    function getHourUnit(hours) {
        if (hours === 1) {
            return 'ЧАС';
        }
        // Для дробных часов, всегда "часа" или "часов" в зависимости от целой части
        const lastDigit = Math.floor(hours) % 10;
        const lastTwoDigits = Math.floor(hours) % 100;

        if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
            return 'ЧАСОВ';
        }
        if (lastDigit === 1) {
            return 'ЧАС'; 
        }
        if (lastDigit >= 2 && lastDigit <= 4) {
            return 'ЧАСА';
        }
        return 'ЧАСОВ';
    }

    // Запускаем приложение
    init();
});
