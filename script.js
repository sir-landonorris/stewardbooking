import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

document.addEventListener('DOMContentLoaded', async function() {
    // --- ВАЖНО: КОНФИГУРАЦИЯ SUPABASE ---
    // Переменные __app_id и __supabase_config больше не используются, так как URL и Anon Key жестко закодированы.
    // Если вы хотите использовать переменные среды Canvas, удалите жестко закодированные значения и раскомментируйте предыдущий код.
    
    // !!! ВАЖНО !!! ВСТАВЬТЕ ВАШИ РЕАЛЬНЫЕ Supabase URL и Anon Key ЗДЕСЬ.
    // Убедитесь, что это строки в кавычках.
    const supabaseUrl = 'https://jvzogsjammwaityyqfjq.supabase.co'; // Вставьте ваш Project URL здесь
    // ПРОВЕРЬТЕ: Убедитесь, что этот ключ является вашим реальным Supabase anon public key!
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2em9nc2phbW13YWl0eXlxZmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI1MDE1ODAsImexbCI6MjA2ODA3NzU4MH0.JrdjGBmC1rTwraBGjKIHE87Qd2MVaS7odoW-ldJzyGw'; // Вставьте ваш anon public ключ здесь

    let supabase, userId;
    let isAuthReady = false;
    let previousSelectedPackageDuration = null; // Для хранения предыдущего выбранного пакета

    // все данные бронирования
    const bookingData = {
        date: null,
        time: null,
        simulator: [], // изменено на массив для множественного выбора
        wheel: null, // теперь не используется, но оставлено для совместимости
        duration: null, // длительность пакета, например "1 час"
        price: null,
        name: null,
        phone: null, // Теперь будет хранить полный отформатированный номер
        telegram: null,
        telegramId: null, // добавляем telegram id
        comment: null
    };

    // все пакеты времени
    const packages = [
        { duration: '1 час', price: '450 ₽', value: 450, hours: 1, originalPrice: 450 },
        { duration: '2 часа', price: '850 ₽', value: 850, hours: 2, originalPrice: 900 },
        { duration: '3 часа', price: '1200 ₽', value: 1200, hours: 3, originalPrice: 1350 },
        { duration: '5 часов', price: '1900 ₽', value: 1900, hours: 5, originalPrice: 2250 },
        { duration: 'ночь', price: '2500 ₽', value: 2500, hours: 8, originalPrice: null } // no original price for night
    ];
    // базовая часовая ставка для расчета перечеркнутой цены
    const BASE_HOURLY_RATE = 450;
    // ставка для расчета цен в "своем пакете" после 3 часов
    const CUSTOM_HOURLY_RATE = 400; 

    // инициализация приложения
    async function init() {
        try {
            // Инициализация Supabase
            console.log("Попытка инициализации клиента Supabase...");
            console.log("Используемый Supabase URL:", supabaseUrl);
            // Добавляем логирование для проверки ключа
            console.log("Supabase Anon Key (первые 5 и последние 5 символов):", 
                        supabaseAnonKey.substring(0, 5) + '...' + supabaseAnonKey.substring(supabaseAnonKey.length - 5));
            console.log("Длина Supabase Anon Key:", supabaseAnonKey.length);
            console.log("Тип Supabase Anon Key:", typeof supabaseAnonKey);
            // Проверим, нет ли невидимых символов (например, BOM или других управляющих символов)
            console.log("Supabase Anon Key (в виде массива кодов символов):", Array.from(supabaseAnonKey).map(char => char.charCodeAt(0)));
            
            supabase = createClient(supabaseUrl, supabaseAnonKey);
            console.log("Клиент Supabase инициализирован.");

            // get user session or sign in anonymously if needed for supabase rls
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                console.error("Ошибка получения сессии Supabase:", sessionError);
            }

            if (session && session.user) {
                userId = session.user.id;
                console.log("Supabase аутентифицирован. ID пользователя:", userId);
            } else {
                userId = crypto.randomUUID(); // fallback if no user or anonymous sign-in fails
                console.warn("Сессия пользователя Supabase не найдена. Используется случайный UUID в качестве ID пользователя:", userId);
            }
            isAuthReady = true; // mark as ready after auth check (even if anonymous/uuid)

            // Initially hide main content and show fallback
            document.getElementById('main-booking-content').style.display = 'none';
            document.getElementById('web-app-fallback').style.display = 'block';

            // initialize telegram web app
            if (window.Telegram && window.Telegram.WebApp && Telegram.WebApp.initDataUnsafe) { // Added initDataUnsafe check
                Telegram.WebApp.ready();
                Telegram.WebApp.expand();
                console.log("Telegram Web App готов.");

                const userTg = Telegram.WebApp.initDataUnsafe.user;
                if (userTg) {
                    bookingData.telegramId = userTg.id.toString(); // store telegram id
                    bookingData.telegram = userTg.username || ''; // store telegram username
                    console.log("Данные пользователя Telegram:", userTg);
                    await loadUserData(bookingData.telegramId); // Загружаем данные пользователя из таблицы 'users'
                }
                // If Telegram Web App detected and ready, show main content and hide fallback
                document.getElementById('web-app-fallback').style.display = 'none';
                document.getElementById('main-booking-content').style.display = 'block';

            } else {
                console.warn("SDK Telegram Web App не найден или не готов, или initDataUnsafe отсутствует.");
                // Fallback remains visible as it's the default state.
                // No need to explicitly set display here as it's the default.
            }

            setupCalendar();
            setupSimulatorSelection(); 
            // После того как setupSimulatorSelection() отработает и, возможно, выберет симулятор по умолчанию,
            // мы явно устанавливаем состояние кнопки "далее".
            document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0;
            updateBreadcrumbs(); // Обновляем хлебные крошки после инициализации

            setupPackageSelection();
            setupTimeSlotsGenerator(); 
            setupForm();
            setupNavigation();
            setupConfirmationActions();
            // setupMapButtons(); // Removed as per new design
            showStep(0); // start at the first step

            // ensure modal is hidden on load
            document.getElementById('cancel-modal').style.display = 'none';

        } catch (error) {
            console.error("Критическая ошибка инициализации приложения:", error);
            // Возможно, здесь можно отобразить сообщение пользователю, если приложение не может инициализироваться
            // document.getElementById('error-message-box').textContent = 'Не удалось подключиться к базе данных. Пожалуйста, проверьте настройки.';
        }
    }

    // показываем нужный шаг и скрываем остальные
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

        // показываем предупреждение для длительных броней, если это шаг выбора времени
        if (stepNumber === 2) { // шаг выбора времени
            const longBookingWarning = document.getElementById('long-booking-warning');
            if (bookingData.hours && bookingData.hours >= 12) {
                longBookingWarning.style.display = 'block';
            } else {
                longBookingWarning.style.display = 'none';
            }
        }
    }

    // обновляем прогресс-бар
    function updateProgress(step) {
        const totalSteps = document.querySelectorAll('.step-page').length; // correctly count active steps
        const progress = (step / (totalSteps - 1)) * 100;
        document.getElementById('booking-progress-global').style.width = `${progress}%`;
    }

    // настройка выбора даты
    function setupCalendar() {
        const dateToggle = document.getElementById('date-toggle');
        const dateCarouselContainer = document.getElementById('date-carousel-container');
        const dateCarousel = document.getElementById('date-carousel');
        const today = new Date();
        
        // месяцы для отображения (полные названия)
        const months = [
            'январь', 'февраль', 'март', 'апрель', 
            'май', 'июнь', 'июль', 'август',
            'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
        ];
        
        // генерируем даты на 30 дней вперед
        let options = '';
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(today.getDate() + i);
            
            const day = date.getDate();
            const monthIndex = date.getMonth();
            const year = date.getFullYear();
            const isToday = (i === 0); // первый элемент всегда "сегодня"
            
            const selectedClass = isToday ? 'selected' : ''; // выбираем "сегодня" по умолчанию
            
            options += `
                <div class="date-item ${selectedClass}" data-full-date="${day.toString().padStart(2, '0')}.${(monthIndex + 1).toString().padStart(2, '0')}.${year}">
                    ${day.toString().padStart(2, '0')}
                    <small>${months[monthIndex]}</small>
                </div>
            `;
        }
        dateCarousel.innerHTML = options;
        
        // обработчик для переключения видимости календаря
        dateToggle.addEventListener('click', function() {
            dateCarouselContainer.classList.toggle('hidden');
            this.classList.toggle('expanded');
        });

        // обработчик выбора даты
        document.querySelectorAll('.date-carousel .date-item').forEach(item => {
            item.addEventListener('click', function() {
                // снимаем выделение со всех дат
                document.querySelectorAll('.date-carousel .date-item').forEach(el => el.classList.remove('selected'));
                // выделяем выбранную дату
                this.classList.add('selected');
                // обновляем данные бронирования
                updateBookingDate();
                // календарь не сворачивается
            });
        });

        // инициализируем bookingData.date при загрузке
        updateBookingDate(); 
    }

    function updateBookingDate() {
        const selectedDateItem = document.querySelector('.date-carousel .date-item.selected');

        if (selectedDateItem) {
            const fullDate = selectedDateItem.dataset.fullDate;
            bookingData.date = fullDate;
            // Кнопка "далее" теперь зависит только от выбора симулятора на этом шаге
            // Если симулятор уже выбран (по умолчанию или вручную), кнопка должна быть активна
            document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0; 
            updateBreadcrumbs(); // обновляем хлебные крошки
        } else {
            bookingData.date = null;
            document.getElementById('toPackagePage').disabled = true;
            updateBreadcrumbs(); // обновляем хлебные крошки
        }
    }


    // настройка выбора симулятора (изменена логика)
    function setupSimulatorSelection() {
        // очищаем предыдущие выборы в bookingData для повторной инициализации на основе текущего DOM
        bookingData.simulator = [];

        document.querySelectorAll('.simulator-box').forEach(sim => {
            const removeBtn = sim.querySelector('.remove-selection');
            const simulatorId = sim.dataset.id;

            // устанавливаем симулятор 01 выбранным по умолчанию
            if (simulatorId === '1') {
                sim.classList.add('selected');
                if (!bookingData.simulator.includes(simulatorId)) {
                    bookingData.simulator.push(simulatorId);
                }
                if (removeBtn) removeBtn.style.display = 'flex';
            } else {
                sim.classList.remove('selected');
                if (removeBtn) removeBtn.style.display = 'none';
            }

            sim.addEventListener('click', function(e) {
                // если клик был по крестику, то не обрабатываем как выбор
                if (e.target === removeBtn) {
                    return;
                }

                if (this.classList.contains('selected')) {
                    // если уже выбран, снимаем выбор
                    this.classList.remove('selected');
                    if (removeBtn) removeBtn.style.display = 'none';
                    bookingData.simulator = bookingData.simulator.filter(id => id !== simulatorId);
                } else {
                    // теперь нет опции "любой", только конкретные симуляторы
                    if (!bookingData.simulator.includes(simulatorId)) {
                        bookingData.simulator.push(simulatorId);
                    }
                    this.classList.add('selected');
                    if (removeBtn) removeBtn.style.display = 'flex';
                }
                
                // проверяем, должна ли кнопка "далее" быть активной
                document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0;
                updateBreadcrumbs(); // обновляем хлебные крошки
            });

            // обработчик для крестика
            if (removeBtn) {
                removeBtn.addEventListener('click', function(e) {
                    e.stopPropagation(); // предотвращаем срабатывание клика на родительском элементе
                    const parentSim = this.closest('.simulator-box');
                    if (parentSim) {
                        const simulatorId = parentSim.dataset.id;
                        parentSim.classList.remove('selected');
                        this.style.display = 'none';
                        bookingData.simulator = bookingData.simulator.filter(id => id !== simulatorId);
                        document.getElementById('toPackagePage').disabled = bookingData.simulator.length === 0;
                        updateBreadcrumbs(); // обновляем хлебные крошки
                    }
                });
            }
        });
        // Убрали вызов updateBookingDate() здесь, так как он будет вызван в init() после setupSimulatorSelection()
    }

    // настройка выбора пакета времени (новый шаг)
    function setupPackageSelection() {
        const packageGrid = document.getElementById('package-grid');
        let packagesHtml = packages.map(pkg => {
            const originalPriceDisplay = pkg.originalPrice !== null ? `<div class="package-original-price">${pkg.originalPrice} ₽</div>` : '';
            
            if (pkg.duration === 'ночь') { // changed to lowercase
                return `
                    <div class="package block" data-duration="${pkg.duration}" data-price="${pkg.value}" data-hours="${pkg.hours}">
                        <div class="package-night-text">ночной</div>
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
                        <div class="package-header-content">
                            <div class="package-number">${displayHours}</div>
                            <div class="package-unit">${hourUnit}</div>
                        </div>
                        ${originalPriceDisplay}
                        <div class="package-price">${pkg.price}</div>
                    </div>
                `;
            }
        }).join('');

        // добавляем кнопку "свой пакет"
        packagesHtml += `
            <div class="package block custom-package-trigger" id="custom-package-trigger">
                <div class="custom-package-text">свой<br>пакет</div>
            </div>
        `;
        
        packageGrid.innerHTML = packagesHtml;
        
        document.querySelectorAll('.package:not(.custom-package-trigger)').forEach(pkg => {
            pkg.addEventListener('click', function() {
                document.querySelectorAll('.package').forEach(p => p.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.duration = this.dataset.duration;
                bookingData.price = this.dataset.price;
                bookingData.hours = parseInt(this.dataset.hours); // сохраняем количество часов
                document.getElementById('package-summary').textContent = 
                    `вы выбрали: ${this.dataset.duration} (${this.querySelector('.package-price').textContent})`;
                document.getElementById('toTimePageNew').disabled = false;
                setupTimeSlotsGenerator(); // генерируем слоты после выбора пакета
                updateBreadcrumbs(); // обновляем хлебные крошки

                // сбрасываем текст на кнопке "свой пакет" при выборе обычного пакета
                const customPackageTriggerText = document.querySelector('#custom-package-trigger .custom-package-text');
                if (customPackageTriggerText) {
                    customPackageTriggerText.innerHTML = `свой<br>пакет`;
                }
                document.getElementById('custom-package-trigger').classList.remove('selected');
            });
        });

        // обработчик для кнопки "свой пакет"
        document.getElementById('custom-package-trigger').addEventListener('click', function() {
            console.log("Custom package trigger clicked.");
            previousSelectedPackageDuration = bookingData.duration; // Сохраняем текущий выбранный пакет
            document.querySelectorAll('.package.selected').forEach(p => p.classList.remove('selected')); // снимаем выбор с обычных пакетов
            
            const packageGrid = document.getElementById('package-grid');
            const customCarouselContainer = document.getElementById('custom-package-carousel-container');

            // Скрываем основной список и показываем карусель "свой пакет"
            packageGrid.classList.add('hidden');
            packageGrid.style.display = 'none'; // Дополнительно устанавливаем display: none
            customCarouselContainer.classList.remove('hidden');
            customCarouselContainer.style.display = 'block'; // Дополнительно устанавливаем display: block

            document.getElementById('package-step-title').textContent = 'выберите свой пакет'; // Меняем заголовок
            document.getElementById('toTimePageNew').classList.add('hidden'); // Прячем кнопку "далее"
            document.getElementById('backToPackagePage').classList.add('hidden'); // Прячем кнопку "назад" (которая на предыдущий шаг)
            document.getElementById('backToMainPackageSelection').classList.remove('hidden'); // Показываем кнопку "назад к пакетам"
            setupCustomPackageSelection(); // генерируем и настраиваем карусель
        });

        // выбираем пакет "2 часа" по умолчанию
        const defaultPackage = document.querySelector('.package[data-duration="2 часа"]');
        if (defaultPackage) {
            defaultPackage.click(); // simulate a click to select it and update bookingData
        }
    }

    // функция для расчета цены "своего пакета"
    function getCustomPackagePrice(hours) {
        if (hours === 1) return 450;
        if (hours === 2) return 850;
        if (hours === 2.5) return 1060; // округлено в сторону гостя
        if (hours === 3) return 1200;
        // для пакетов более 3 часов, считаем по 400 ₽/час с округлением до 10 ₽ в пользу гостя
        return Math.ceil((hours * CUSTOM_HOURLY_RATE) / 10) * 10;
    }

    // настройка выбора "своего пакета"
    function setupCustomPackageSelection() {
        const customPackageCarousel = document.getElementById('custom-package-carousel');
        let customPackagesHtml = '';
        const customPackageDurations = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 18, 24];

        customPackageDurations.forEach(hours => {
            const currentPrice = getCustomPackagePrice(hours);
            const originalPrice = hours * BASE_HOURLY_RATE;
            const originalPriceDisplay = originalPrice !== currentPrice && hours !== 1 && hours !== 2 ? `<div class="package-original-price">${originalPrice} ₽</div>` : ''; // don't show for 1h, 2h as they match base rate
            
            let displayHours = hours.toString();
            if (hours % 1 !== 0) { // if it's a decimal (e.g., 2.5)
                displayHours = hours.toFixed(1).replace('.', ',');
            } else {
                displayHours = hours.toString().padStart(2, '0');
            }
            
            const hourUnit = getHourUnit(hours);

            customPackagesHtml += `
                <div class="package block" data-duration="${displayHours} ${hourUnit}" data-price="${currentPrice}" data-hours="${hours}">
                    <div class="package-header-content">
                        <div class="package-number">${displayHours}</div>
                        <div class="package-unit">${hourUnit}</div>
                    </div>
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
                bookingData.hours = parseFloat(this.dataset.hours); // используем parsefloat для дробных часов
                
                // Форматирование для кнопки "свой пакет"
                let customPackageTextContent = '';
                const selectedHours = parseFloat(this.dataset.hours);
                const selectedPrice = this.dataset.price;
                // const selectedOriginalPrice = parseFloat(this.dataset.originalPrice); // This variable is not used

                if (this.dataset.duration === 'ночь') {
                    customPackageTextContent = `ночной<br>(${selectedPrice})`;
                } else {
                    const displayHours = selectedHours % 1 !== 0 ? selectedHours.toFixed(1).replace('.', ',') : selectedHours.toString().padStart(2, '0');
                    const hourUnit = getHourUnit(selectedHours);
                    customPackageTextContent = `${displayHours} ${hourUnit}<br>(${selectedPrice})`;
                }

                document.getElementById('package-summary').textContent = 
                    `вы выбрали: ${this.dataset.duration} (${this.querySelector('.package-price').textContent})`;
                document.getElementById('toTimePageNew').disabled = false;
                setupTimeSlotsGenerator(); // генерируем слоты после выбора пакета
                
                // обновляем текст на кнопке "свой пакет"
                const customPackageTriggerText = document.querySelector('#custom-package-trigger .custom-package-text');
                customPackageTriggerText.innerHTML = customPackageTextContent;
                document.getElementById('custom-package-trigger').classList.add('selected'); // визуально выделяем

                // возвращаемся к основному виду шага пакетов
                const customCarouselContainer = document.getElementById('custom-package-carousel-container');
                const packageGrid = document.getElementById('package-grid');
                customCarouselContainer.classList.add('hidden');
                customCarouselContainer.style.display = 'none'; // Дополнительно скрываем
                packageGrid.classList.remove('hidden');
                packageGrid.style.display = 'grid'; // Дополнительно показываем как grid

                document.getElementById('package-step-title').textContent = 'выберите пакет времени'; // Возвращаем заголовок
                document.getElementById('toTimePageNew').classList.remove('hidden'); // Показываем кнопку "далее"
                document.getElementById('backToPackagePage').classList.remove('hidden'); // Показываем кнопку "назад" (которая на предыдущий шаг)
                document.getElementById('backToMainPackageSelection').classList.add('hidden'); // Прячем кнопку "назад к пакетам"

                updateBreadcrumbs(); // обновляем хлебные крошки
            });
        });

        // обработчик для кнопки "назад к пакетам"
        document.getElementById('backToMainPackageSelection').addEventListener('click', function() {
            console.log("Back to main package selection clicked.");
            const customCarouselContainer = document.getElementById('custom-package-carousel-container');
            const packageGrid = document.getElementById('package-grid');

            // Скрываем карусель "свой пакет" и показываем основной список
            customCarouselContainer.classList.add('hidden');
            customCarouselContainer.style.display = 'none'; // Дополнительно скрываем
            packageGrid.classList.remove('hidden');
            packageGrid.style.display = 'grid'; // Дополнительно показываем как grid
            
            document.getElementById('package-step-title').textContent = 'выберите пакет времени'; // Возвращаем заголовок
            document.getElementById('toTimePageNew').classList.remove('hidden'); // Показываем кнопку "далее"
            document.getElementById('backToPackagePage').classList.remove('hidden'); // Показываем кнопку "назад" (которая на предыдущий шаг)
            document.getElementById('backToMainPackageSelection').classList.add('hidden'); // Прячем кнопку "назад к пакетам"
            
            // сбрасываем выбранный пакет, если пользователь вернулся
            document.querySelectorAll('.package').forEach(p => p.classList.remove('selected'));
            bookingData.duration = null;
            bookingData.price = null;
            bookingData.hours = null;
            document.getElementById('package-summary').textContent = '';
            document.getElementById('toTimePageNew').disabled = true;

            // сбрасываем текст на кнопке "свой пакет"
            const customPackageTriggerText = document.querySelector('#custom-package-trigger .custom-package-text');
            if (customPackageTriggerText) {
                customPackageTriggerText.innerHTML = `свой<br>пакет`;
            }
            document.getElementById('custom-package-trigger').classList.remove('selected'); // снимаем выделение

            // Автоматически выделяем предыдущий выбранный пакет, если он был
            if (previousSelectedPackageDuration) {
                const prevPackage = document.querySelector(`.package[data-duration="${previousSelectedPackageDuration}"]`);
                if (prevPackage) {
                    prevPackage.click(); // Симулируем клик для выбора
                }
            }

            updateBreadcrumbs();
        });
    }


    // настройка генерации временных слотов на основе выбранного пакета
    async function setupTimeSlotsGenerator() {
        const timeGrid = document.getElementById('time-grid');
        timeGrid.innerHTML = ''; // очищаем предыдущие слоты

        if (!bookingData.hours || !bookingData.date || bookingData.simulator.length === 0) {
            // если пакет, дата или симулятор не выбраны, не показываем слоты
            return;
        }

        const times = [];
        const durationHours = bookingData.hours;
        const selectedDate = bookingData.date; // e.g., "15.07.2025"

        let occupiedSlots = [];
        if (supabase) { // check if supabase client is initialized
            try {
                const { data, error } = await supabase
                    .from('bookings')
                    .select('time_range, duration_hours, simulator_ids') // select relevant fields
                    .eq('date', selectedDate);
                
                if (error) {
                    console.error("Ошибка получения занятых слотов из Supabase:", error);
                    console.error("ПОДСКАЗКА: Ошибка 401 (Unauthorized) обычно означает, что ваш Supabase API ключ недействителен или у вас нет правильных политик RLS (Row Level Security) для таблицы 'bookings'.");
                } else {
                    occupiedSlots = data.filter(booking => 
                        booking.simulator_ids.some(bookedSim => bookingData.simulator.includes(bookedSim))
                    );
                    console.log("Занятые слоты для выбранной даты и симуляторов:", occupiedSlots);
                }
            } catch (error) {
                console.error("Критическая ошибка во время запроса к Supabase:", error);
            }
        }

        // generate time slots from 8:00 to 03:00 (next day) with 30-minute steps
        // 8 AM is hour 8. 3 AM next day is hour 27 (24 + 3)
        for (let currentHour = 8; currentHour <= 26.5; currentHour += 0.5) { // Loop up to 2:30 AM (26.5)
            let startHour = Math.floor(currentHour);
            let startMinutes = (currentHour % 1) * 60;
            
            let endHourFloat = currentHour + durationHours;
            let endHour = Math.floor(endHourFloat);
            let endMinutes = (endHourFloat % 1) * 60;

            // Format start time
            let startHourFormatted = startHour.toString().padStart(2, '0');
            let startMinutesFormatted = startMinutes.toString().padStart(2, '0');
            let startTimeDisplay = `${startHourFormatted}:${startMinutesFormatted}`;
            
            // Format end time
            let displayEndHour = endHour;
            let endTimeSuffix = '';

            // Check if end time crosses midnight (24 hours)
            if (endHourFloat >= 24) {
                displayEndHour = endHour % 24; // Use modulo to get hours in 0-23 range
                endTimeSuffix = ' (следующий день)'; // lowercase
            }
            let endMinutesDisplay = endMinutes.toString().padStart(2, '0');
            let endTimeDisplay = `${displayEndHour.toString().padStart(2, '0')}:${endMinutesDisplay}${endTimeSuffix}`;

            // Store the full time range for bookingData and data-attribute
            const fullTimeRange = `${startTimeDisplay} – ${displayEndHour.toString().padStart(2, '0')}:${endMinutesDisplay}${endTimeSuffix}`;
            
            // check if this slot is occupied
            const isOccupied = occupiedSlots.some(occupied => {
                const [occupiedStartHourStr, occupiedStartMinStr] = occupied.time_range.split(' ')[0].split(':');
                const occupiedStartTotalMinutes = parseInt(occupiedStartHourStr) * 60 + parseInt(occupiedStartMinStr);
                const occupiedDurationMinutes = occupied.duration_hours * 60;
                const occupiedEndTotalMinutes = occupiedStartTotalMinutes + occupiedDurationMinutes;

                const currentStartTotalMinutes = currentHour * 60;
                const currentDurationMinutes = durationHours * 60;
                const currentEndTotalMinutes = currentStartTotalMinutes + currentDurationMinutes;

                // check for overlap
                return (currentStartTotalMinutes < occupiedEndTotalMinutes && occupiedStartTotalMinutes < currentEndTotalMinutes);
            });

            const disabledClass = isOccupied ? 'disabled' : '';

            times.push(`
                <div class="time-slot block ${disabledClass}" data-time-range="${fullTimeRange}">
                    ${startTimeDisplay}
                    <small>${displayEndHour.toString().padStart(2, '0')}:${endMinutesDisplay}${endTimeSuffix}</small>
                </div>
            `);
        }
        
        timeGrid.innerHTML = times.join('');
        
        // обработка выбора времени
        document.querySelectorAll('.time-slot:not(.disabled)').forEach(slot => {
            slot.addEventListener('click', function() {
                document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
                this.classList.add('selected');
                bookingData.time = this.dataset.timeRange;
                document.getElementById('toFormPage').disabled = false; // changed from towheelpage to toformpage
                updateBreadcrumbs(); // обновляем хлебные крошки
            });
        });
        document.getElementById('toFormPage').disabled = true; // disable until a slot is selected
    }

    // настройка выбора руля (больше не отдельный шаг)
    function setupWheelSelection() {
        // эта функция теперь не нужна, так как выбор руля был удален из макета
    }

    // загрузка данных пользователя из supabase (теперь из таблицы 'users')
    async function loadUserData(telegramId) {
        if (!supabase || !telegramId) {
            console.warn("Supabase клиент не инициализирован или отсутствует telegramId. Пропуск загрузки пользовательских данных.");
            return;
        }

        try {
            // assuming a 'users' table with 'telegram_id' as a unique identifier
            const { data: userData, error } = await supabase
                .from('users') // Изменено с 'profiles' на 'users'
                .select('*')
                .eq('telegram_id', telegramId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found (not an actual error for single())
                console.error("Ошибка загрузки пользовательских данных из Supabase:", error);
                console.error("ПОДСКАЗКА: Ошибка 401 (Unauthorized) обычно означает, что ваш Supabase API ключ недействителен или у вас нет правильных политик RLS (Row Level Security) для таблицы 'users'.");
                return;
            }

            if (userData) {
                console.log("Загруженные пользовательские данные:", userData);
                
                // pre-fill form fields
                const nameInput = document.querySelector('#form-step input[type="text"]');
                const phoneInput = document.getElementById('phone-input'); // Changed ID
                const telegramInput = document.getElementById('telegram');

                if (nameInput && userData.name) nameInput.value = userData.name;
                // For phone, we only pre-fill the last 4 digits
                if (phoneInput && userData.phone) {
                    const last4Digits = userData.phone.slice(-4); // Assuming full phone is stored and we need last 4
                    phoneInput.value = last4Digits;
                    bookingData.phone = `+7 (XXX) XXX-${last4Digits}`; // Update bookingData with the full formatted string
                }
                if (telegramInput && userData.telegram_username) telegramInput.value = userData.telegram_username; // assuming telegram_username in db

                // update bookingData
                bookingData.name = userData.name || null;
                // bookingData.phone is handled above for pre-fill, otherwise it's set in setupForm
                bookingData.telegram = userData.telegram_username || null; // use telegram_username from webapp

                // check if all required user data is present to potentially skip the form step
                if (userData.name && userData.phone && userData.telegram_username) {
                    console.log("Пользовательские данные полные, форма предварительно заполнена.");
                }
            } else {
                console.log("Существующие пользовательские данные для Telegram ID не найдены:", telegramId);
                // if no data, ensure form fields are empty or default
                const nameInput = document.querySelector('#form-step input[type="text"]');
                const phoneInput = document.getElementById('phone-input'); // Changed ID
                const telegramInput = document.getElementById('telegram');

                if (nameInput) nameInput.value = '';
                if (phoneInput) phoneInput.value = ''; // Reset phone input to empty
                if (telegramInput) telegramInput.value = bookingData.telegram; // pre-fill with telegram username from webapp
            }
        } catch (error) {
            console.error("Ошибка загрузки пользовательских данных:", error);
        }
    }

    // сохранение данных пользователя в supabase (теперь в таблицу 'users')
    async function saveUserData() {
        if (!supabase || !bookingData.telegramId) return;

        try {
            const userDataToSave = {
                telegram_id: bookingData.telegramId, // unique identifier
                name: bookingData.name,
                telegram_username: bookingData.telegram, // save telegram username
                phone: bookingData.phone // save full phone number
            };

            // use upsert to insert or update based on telegram_id
            const { data, error } = await supabase
                .from('users') // Изменено с 'profiles' на 'users'
                .upsert(userDataToSave, { onConflict: 'telegram_id' }); // conflict on telegram_id to update existing

            if (error) {
                console.error("Ошибка сохранения пользовательских данных в Supabase:", error);
                console.error("ПОДСКАЗКА: Ошибка 401 (Unauthorized) обычно означает, что ваш Supabase API ключ недействителен или у вас нет правильных политик RLS (Row Level Security) для таблицы 'users'.");
            } else {
                console.log("Пользовательские данные сохранены/обновлены в Supabase:", data);
            }
        } catch (error) {
            console.error("Ошибка сохранения пользовательских данных:", error);
        }
    }

    // настройка формы
    function setupForm() {
        const nameInput = document.getElementById('name');
        const phoneInput = document.getElementById('phone-input');
        const telegramInput = document.getElementById('telegram');

        // Function to update input styles based on content
        function updateInputStyle(inputElement) {
            // Check if the input has content
            if (inputElement.value.length > 0) {
                inputElement.classList.add('has-content');
            } else {
                inputElement.classList.remove('has-content');
            }

            // For phone input, also update the parent container
            if (inputElement.id === 'phone-input') {
                const phoneContainer = inputElement.closest('.phone-input-container');
                if (phoneContainer) {
                    if (inputElement.value.length > 0) {
                        phoneContainer.classList.add('has-content');
                    } else {
                        phoneContainer.classList.remove('has-content');
                    }
                }
            }
        }

        // Apply initial styles
        updateInputStyle(nameInput);
        updateInputStyle(phoneInput);
        updateInputStyle(telegramInput);

        // Add event listeners for input and focus/blur
        nameInput.addEventListener('input', () => updateInputStyle(nameInput));
        nameInput.addEventListener('focus', () => nameInput.classList.add('is-focused'));
        nameInput.addEventListener('blur', () => {
            nameInput.classList.remove('is-focused');
            updateInputStyle(nameInput); // Update style on blur to reflect content
        });

        phoneInput.addEventListener('input', () => updateInputStyle(phoneInput));
        phoneInput.addEventListener('focus', () => {
            phoneInput.closest('.phone-input-container').classList.add('is-focused');
        });
        phoneInput.addEventListener('blur', () => {
            const phoneContainer = phoneInput.closest('.phone-input-container');
            if (phoneContainer) {
                phoneContainer.classList.remove('is-focused');
                updateInputStyle(phoneInput); // Update style on blur to reflect content
            }
        });

        telegramInput.addEventListener('input', () => updateInputStyle(telegramInput));
        telegramInput.addEventListener('focus', () => telegramInput.classList.add('is-focused'));
        telegramInput.addEventListener('blur', () => {
            telegramInput.classList.remove('is-focused');
            updateInputStyle(telegramInput); // Update style on blur to reflect content
        });

        if (phoneInput) {
            // Ограничиваем ввод только 4 цифрами и предотвращаем удаление префикса
            phoneInput.addEventListener('keydown', (event) => {
                const allowedKeys = [
                    'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'
                ];

                // Если пользователь пытается удалить что-то, находясь в начале поля,
                // или если длина уже 4 и это не Backspace/Delete, предотвращаем действие
                if ((event.key === 'Backspace' || event.key === 'Delete') && phoneInput.selectionStart === 0 && phoneInput.selectionEnd === 0) {
                    event.preventDefault();
                }

                // Предотвращаем ввод, если уже 4 символа и это не Backspace/Delete
                if (phoneInput.value.length >= 4 && !allowedKeys.includes(event.key) && !event.metaKey && !event.ctrlKey) {
                    event.preventDefault();
                }
            });

            phoneInput.addEventListener('input', () => {
                // Удаляем все символы, кроме цифр
                phoneInput.value = phoneInput.value.replace(/\D/g, '');
                // Ограничиваем до 4 символов
                if (phoneInput.value.length > 4) {
                    phoneInput.value = phoneInput.value.substring(0, 4);
                }
                // Обновляем bookingData.phone с полным номером, включая префикс
                // Предполагаем, что префикс "+7 (XXX) XXX-" является фиксированным
                bookingData.phone = `+7 (XXX) XXX-${phoneInput.value}`;
                updateInputStyle(phoneInput); // Update style on input
            });

            // Initial value for bookingData.phone if the field is pre-filled
            if (phoneInput.value) {
                bookingData.phone = `+7 (XXX) XXX-${phoneInput.value}`;
            } else {
                bookingData.phone = `+7 (XXX) XXX-`; // Set initial phone to prefix if empty
            }

        } else {
            console.warn("Элемент с id 'phone-input' не найден. Слушатель событий не добавлен.");
        }
        
        // валидация telegram
        // Проверяем, что элемент существует, прежде чем добавлять слушатель
        const telegramInputElem = document.getElementById('telegram'); // Renamed to avoid conflict
        if (telegramInputElem) {
            telegramInputElem.addEventListener('input', function(e) {
                this.value = this.value.replace(/[^a-zA-Z0-9_]/g, '');
                updateInputStyle(this); // Update style on input
            });
        } else {
            console.warn("Элемент с id 'telegram' не найден. Слушатель событий не добавлен.");
        }
    }

    // настройка навигации
    function setupNavigation() {
        // кнопки "далее"
        document.getElementById('toPackagePage').addEventListener('click', () => showStep(1)); // с даты/симулятора на пакет
        document.getElementById('toTimePageNew').addEventListener('click', () => showStep(2)); // с пакета на время
        document.getElementById('toFormPage').addEventListener('click', () => showStep(3)); // со времени на форму (руль удален)
        
        // кнопки "назад"
        document.getElementById('backToPackagePage').addEventListener('click', () => showStep(0)); // с пакета на дату/симулятор
        document.getElementById('backToTimeStep').addEventListener('click', () => showStep(1)); // со времени на пакет
        document.getElementById('backToTimePageNew').addEventListener('click', () => showStep(2)); // с формы на время (руль удален)
        
        // отправка формы
        document.getElementById('booking-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // проверяем валидность формы
            if (!this.checkValidity()) {
                this.reportValidity();
                return;
            }
            
            // сохраняем данные
            bookingData.name = this.querySelector('input[type="text"]').value;
            // bookingData.phone уже обновляется в setupForm при вводе
            bookingData.telegram = document.querySelector('#telegram') ? document.querySelector('#telegram').value : ''; // Добавлена проверка
            bookingData.comment = document.querySelector('textarea') ? document.querySelector('textarea').value : ''; // Добавлена проверка
            
            // сохраняем данные пользователя в базу
            await saveUserData();
            
            // показываем подтверждение
            showConfirmation();
        });
    }

    // обновление хлебных крошек
    function updateBreadcrumbs() {
        const breadcrumbDiv = document.getElementById('booking-breadcrumb');
        // check if breadcrumbDiv exists before updating
        if (!breadcrumbDiv) {
            console.warn("Элемент хлебных крошек не найден. Обновление хлебных крошек пропущено.");
            return;
        }

        let breadcrumbs = [];

        // дата теперь в хлебных крошках
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

    // показываем страницу подтверждения (изменено отображение симуляторов и сохранение бронирования)
    async function showConfirmation() {
        const detailsLeft = document.getElementById('confirmation-details-left');
        const timeRight = document.getElementById('confirmation-time-right');

        // Extract start and end times from bookingData.time
        let startTimeDisplay = '';
        let endTimeDisplay = '';
        if (bookingData.time) {
            const timeParts = bookingData.time.split(' – ');
            if (timeParts.length === 2) {
                startTimeDisplay = timeParts[0];
                endTimeDisplay = timeParts[1];
            }
        }
        
        detailsLeft.innerHTML = `
            <p><strong>дата:</strong> ${bookingData.date}</p>
            <p><strong>пакет:</strong> ${bookingData.duration}</p>
            <p><strong>время:</strong> ${bookingData.time}</p>
            <p><strong>симулятор(ы):</strong> ${getSimulatorNames(bookingData.simulator)}</p>
            <p><strong>имя:</strong> ${bookingData.name}</p>
            <p><strong>телефон:</strong> ${bookingData.phone}</p>
            <p><strong>telegram:</strong> @${bookingData.telegram}</p>
            ${bookingData.comment ? `<p><strong>комментарий:</strong> ${bookingData.comment}</p>` : ''}
        `;

        // Format time for the right block, removing seconds if present
        const formatTimeForDisplay = (timeStr) => {
            const parts = timeStr.split(':');
            return `${parts[0]}:${parts[1]}`; // Keep only HH:MM
        };

        timeRight.innerHTML = `
            ${formatTimeForDisplay(startTimeDisplay)}
            <small>${formatTimeForDisplay(endTimeDisplay)}</small>
        `;
        
        // save booking to supabase
        if (supabase) {
            try {
                const { data: newBooking, error } = await supabase
                    .from('bookings')
                    .insert({
                        user_id: userId, // supabase user id (from auth or uuid)
                        telegram_id: bookingData.telegramId, // telegram user id
                        date: bookingData.date,
                        time_range: bookingData.time, // renamed to time_range in db
                        simulator_ids: bookingData.simulator, // renamed to simulator_ids in db
                        // wheel: bookingData.wheel, // removed as per new flow
                        duration_text: bookingData.duration, // renamed to duration_text in db
                        duration_hours: bookingData.hours, // store hours for easier availability checks
                        price: bookingData.price,
                        name: bookingData.name,
                        phone: bookingData.phone, // save full phone number
                        telegram_username: bookingData.telegram, // save full telegram username
                        comment: bookingData.comment,
                        status: 'pending', // default status for new bookings
                        created_at: new Date().toISOString() // iso string for supabase timestamp
                    })
                    .select(); // select the inserted row to get its id

                if (error) {
                    console.error("Ошибка сохранения бронирования в Supabase:", error);
                    console.error("ПОДСКАЗКА: Ошибка 401 (Unauthorized) обычно означает, что ваш Supabase API ключ недействителен или у вас нет правильных политик RLS (Row Level Security) для таблицы 'bookings'.");
                } else if (newBooking && newBooking.length > 0) {
                    console.log("Бронирование сохранено в Supabase с ID:", newBooking[0].id);

                    // no longer calling edge function directly from client.
                    // the python bot will monitor supabase realtime for new 'pending' bookings.
                }
            } catch (error) {
                console.error("Критическая ошибка во время сохранения бронирования в Supabase:", error);
            }
        }

        showStep(4); // show confirmation step
    }

    // настройка действий на странице подтверждения (без изменений)
    function setupConfirmationActions() {
        // записаться снова
        document.getElementById('book-again').addEventListener('click', resetBooking);
        
        // перенести запись (теперь это "правила")
        document.getElementById('reschedule').addEventListener('click', function() {
            // Logic for "правила" button - maybe open a modal or navigate to a rules page
            alert('Здесь будут правила бронирования.'); // Placeholder for rules
        });
        
        // отменить запись
        document.getElementById('cancel-booking').addEventListener('click', function() {
            document.getElementById('cancel-modal').style.display = 'flex';
        });
        
        document.getElementById('confirm-cancel').addEventListener('click', function() {
            document.getElementById('cancel-modal').style.display = 'none';
            // document.getElementById('cancel-message').style.display = 'block'; // Removed
            // setTimeout(() => {
            //     document.getElementById('cancel-message').style.display = 'none'; // Removed
            //     resetBooking();
            // }, 1500);
            resetBooking(); // Reset immediately after confirmation
            alert('Заявка на отмену отправлена стюарду.'); // Placeholder for cancellation
        });
        
        document.getElementById('cancel-cancel').addEventListener('click', function() {
            document.getElementById('cancel-modal').style.display = 'none';
        });
    }

    // настройка кнопок карты и такси (удалено)
    // function setupMapButtons() {
    //     const address = 'ростов-на-дону, ул. б. садовая, 70'; // lowercase
        
    //     // кнопка "проложить маршрут"
    //     document.getElementById('route-btn').addEventListener('click', function() {
    //         const url = `https://yandex.ru/maps/?rtext=~${encodeURIComponent(address)}`;
    //         window.open(url, '_blank');
    //     });
        
    //     // кнопка "вызвать такси"
    //     document.getElementById('taxi-btn').addEventListener('click', function() {
    //         const url = `https://3.redirect.appmetrica.yandex.com/route?end-lat=47.222078&end-lon=39.720349&end-name=${encodeURIComponent(address)}`;
    //         window.open(url, '_blank');
    //     });
    // }

    // сброс бронирования (изменено)
    function resetBooking() {
        // очищаем данные
        for (const key in bookingData) {
            if (key === 'simulator') {
                bookingData[key] = []; // сброс массива
            } else if (key === 'telegramId' || key === 'telegram') {
                // не сбрасываем telegram id и ник, так как они приходят из webapp
                continue;
            } else {
                bookingData[key] = null;
            }
        }
        
        // сбрасываем форму
        document.getElementById('booking-form')?.reset();
        document.getElementById('phone-input').value = ''; // reset phone input to empty
        bookingData.phone = `+7 (XXX) XXX-`; // reset bookingData.phone to just prefix
        
        // снимаем выделения и скрываем крестики
        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.remove-selection').forEach(el => el.style.display = 'none');
        
        // сбрасываем кнопки
        document.querySelectorAll('.button').forEach(btn => btn.disabled = false); // re-enable all buttons
        document.getElementById('toPackagePage').disabled = true; // disable next on step 0 until selection
        document.getElementById('toTimePageNew').disabled = true; // disable next on step 1 until selection
        document.getElementById('toFormPage').disabled = true; // disable next on step 2 until selection

        // скрываем карусель "свой пакет" и показываем основную сетку
        const customCarouselContainer = document.getElementById('custom-package-carousel-container');
        const packageGrid = document.getElementById('package-grid');
        customCarouselContainer.classList.add('hidden');
        customCarouselContainer.style.display = 'none'; // Дополнительно скрываем
        packageGrid.classList.remove('hidden');
        packageGrid.style.display = 'grid'; // Дополнительно показываем как grid

        // сбрасываем отображение выбранного пакета
        document.getElementById('package-summary').textContent = '';

        // сбрасываем текст на кнопке "свой пакет"
        const customPackageTriggerText = document.querySelector('#custom-package-trigger .custom-package-text');
        if (customPackageTriggerText) {
            customPackageTriggerText.innerHTML = `свой<br>пакет`;
        }
        const customPackageTrigger = document.getElementById('custom-package-trigger');
        if (customPackageTrigger) {
            customPackageTrigger.classList.remove('selected');
        }

        // Возвращаем заголовок и видимость кнопок
        document.getElementById('package-step-title').textContent = 'выберите пакет времени';
        document.getElementById('toTimePageNew').classList.remove('hidden');
        document.getElementById('backToPackagePage').classList.remove('hidden');
        document.getElementById('backToMainPackageSelection').classList.add('hidden');


        // переинициализируем выбор симуляторов, чтобы 01 снова был выбран по умолчанию
        setupSimulatorSelection();
        // переинициализируем выбор пакетов, чтобы "2 часа" снова был выбран по умолчанию
        setupPackageSelection();

        showStep(0);
    }

    // вспомогательные функции
    function getWheelName(wheelId) {
        // this function is no longer used in the main flow, but kept for reference if needed
        const wheels = {
            'ks': 'штурвал ks', // lowercase
            'cs': 'круглый cs', // lowercase
            'nobutton': 'круглый без кнопок', // lowercase
            'any': 'выберу на месте' // lowercase
        };
        return wheels[wheelId] || wheelId;
    }

    function getSimulatorNames(simulatorIds) {
        // теперь нет опции "любой", только конкретные симуляторы
        return simulatorIds.map(id => `симулятор #${id}`).join(', '); // lowercase
    }

    // вспомогательная функция для склонения слова "час"
    function getHourUnit(hours) {
        if (hours === 1) {
            return 'час'; // lowercase
        }
        // для дробных часов, всегда "часа" или "часов" в зависимости от целой части
        const lastDigit = Math.floor(hours) % 10;
        const lastTwoDigits = Math.floor(hours) % 100;

        if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
            return 'часов'; // lowercase
        }
        if (lastDigit === 1) {
            return 'час'; // lowercase
        }
        if (lastDigit >= 2 && lastDigit <= 4) {
            return 'часа'; // lowercase
        }
        return 'часов'; // lowercase
    }

    // запускаем приложение
    init();
});
